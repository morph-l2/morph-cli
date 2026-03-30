/**
 * x402 Client — Payer-side EIP-3009 signing + 402 payment flow (v2)
 *
 * Flow (Coinbase x402 v2 protocol):
 *   1. Probe URL → receive HTTP 402 + PAYMENT-REQUIRED header (base64) or JSON body with accepts[]
 *   2. Sign EIP-3009 transferWithAuthorization (local, no gas)
 *   3. Replay request with PAYMENT-SIGNATURE header (base64) → get resource
 *
 * PaymentPayload v2 structure:
 *   { x402Version, payload: {signature, authorization}, accepted: {scheme, network, ...}, resource: {url} }
 *
 * EIP-3009 typed data:
 *   transferWithAuthorization(from, to, value, validAfter, validBefore, nonce)
 *   Domain: { name, version, chainId, verifyingContract }
 */
import { privateKeyToAccount } from 'viem/accounts'
import { encodePacked, hashTypedData, keccak256, toHex, type Hex } from 'viem'
import { decrypt, type WalletData } from '../../wallet/keystore.js'
import type { SocialWalletConfig } from '../../wallet/social-login.js'
import { signTypedDataHash, decryptCredentials, BGW_MORPH_CHAIN } from '../../wallet/social-login.js'

// ─── Constants ───────────────────────────────────────────────────────────────

export const MORPH_FACILITATOR = 'https://morph-rails.morph.network/x402' as const
export const MORPH_NETWORK = 'eip155:2818' as const

// Morph mainnet USDC
const USDC_ADDRESS = '0xCfb1186F4e93D60E60a8bDd997427D1F33bc372B' as const
const USDC_DECIMALS = 6

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PaymentRequirements {
  scheme: string
  network: string
  maxAmountRequired?: string  // Coinbase x402 SDK field
  amount?: string             // alternative naming
  price?: string              // alternative naming
  asset?: string
  payTo: string
  maxTimeoutSeconds?: number
  resource?: string           // URL of the protected resource
  description?: string
  mimeType?: string
  extra?: Record<string, unknown>
}

export interface PaymentPayload {
  x402Version: number
  payload: {
    signature: Hex
    authorization: {
      from: string
      to: string
      value: string
      validAfter: string
      validBefore: string
      nonce: Hex
    }
  }
  accepted: PaymentRequirements  // v2: scheme/network live here
  resource?: { url: string; description?: string; mimeType?: string }
}

export interface ProbeResult {
  url: string
  status: number
  requiresPayment: boolean
  paymentRequirements?: PaymentRequirements[]
  rawHeaders?: Record<string, string>
  body?: unknown
}

export interface PayResult {
  url: string
  paid: boolean
  paymentPayload?: PaymentPayload
  response?: {
    status: number
    headers: Record<string, string>
    body: unknown
  }
}

// ─── EIP-3009 Typed Data ─────────────────────────────────────────────────────

const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const

function getEIP3009Domain(tokenAddress: string, chainId: number, tokenName = 'USDC', tokenVersion = '2') {
  return {
    name: tokenName,
    version: tokenVersion,
    chainId,
    verifyingContract: tokenAddress as `0x${string}`,
  }
}

// ─── Probe ───────────────────────────────────────────────────────────────────

/** Probe a URL for 402 payment requirements */
export async function probeX402(url: string): Promise<ProbeResult> {
  const res = await fetch(url, {
    method: 'GET',
    signal: AbortSignal.timeout(15000),
  })

  if (res.status !== 402) {
    return { url, status: res.status, requiresPayment: false }
  }

  // Try to parse payment requirements from response body or headers
  let paymentRequirements: PaymentRequirements[] | undefined
  let body: unknown

  try {
    body = await res.json()
    // x402 v2: body contains "accepts" array (v2 naming)
    if (body && typeof body === 'object') {
      const b = body as Record<string, unknown>
      if (Array.isArray(b['accepts'])) {
        paymentRequirements = b['accepts'] as PaymentRequirements[]
      } else if (Array.isArray(b['paymentRequirements'])) {
        // fallback: some servers may use paymentRequirements
        paymentRequirements = b['paymentRequirements'] as PaymentRequirements[]
      } else if (b['payTo']) {
        paymentRequirements = [b as unknown as PaymentRequirements]
      }
    }
  } catch { /* not JSON */ }

  // Also check headers (v2 uses PAYMENT-REQUIRED base64 header)
  const rawHeaders: Record<string, string> = {}
  for (const key of ['payment-required', 'x-payment', 'x-payment-requirements', 'www-authenticate']) {
    const val = res.headers.get(key)
    if (val) rawHeaders[key] = val
  }

  // Try to parse from PAYMENT-REQUIRED header (base64 JSON) if body didn't have it
  if (!paymentRequirements && rawHeaders['payment-required']) {
    try {
      const decoded = JSON.parse(Buffer.from(rawHeaders['payment-required'], 'base64').toString())
      if (decoded['accepts'] && Array.isArray(decoded['accepts'])) {
        paymentRequirements = decoded['accepts'] as PaymentRequirements[]
      }
    } catch { /* not valid base64/JSON */ }
  }

  // Fallback: try x-payment header (raw JSON)
  if (!paymentRequirements && rawHeaders['x-payment']) {
    try {
      const parsed = JSON.parse(rawHeaders['x-payment'])
      if (Array.isArray(parsed)) {
        paymentRequirements = parsed
      } else if (parsed['payTo']) {
        paymentRequirements = [parsed]
      }
    } catch { /* not JSON */ }
  }

  return {
    url,
    status: 402,
    requiresPayment: true,
    paymentRequirements,
    rawHeaders: Object.keys(rawHeaders).length > 0 ? rawHeaders : undefined,
    body,
  }
}

// ─── Sign EIP-3009 ───────────────────────────────────────────────────────────

/** Sign EIP-3009 transferWithAuthorization for x402 payment.
 *  Supports both private-key wallets (local signing) and Social Login wallets (BGW TEE signing). */
export async function signEIP3009(
  wallet: WalletData | SocialWalletConfig,
  requirements: PaymentRequirements,
): Promise<PaymentPayload> {
  const isSocialLogin = 'credentials' in wallet

  // Resolve amount
  const amount = requirements.amount ?? requirements.maxAmountRequired ?? '0'

  // Resolve chain ID from network (e.g. "eip155:2818" → 2818)
  const chainId = parseInt(requirements.network.split(':')[1] ?? '2818', 10)

  // Resolve token address
  const tokenAddress = (requirements.asset ?? USDC_ADDRESS) as `0x${string}`

  // Resolve from address
  const fromAddress: `0x${string}` = isSocialLogin
    ? (wallet as SocialWalletConfig).address as `0x${string}`
    : privateKeyToAccount(decrypt((wallet as WalletData).privateKey) as `0x${string}`).address

  // Build authorization params
  const validAfter = '0'
  const validBefore = Math.floor(Date.now() / 1000 + 3600).toString() // 1 hour
  const nonce = keccak256(encodePacked(
    ['address', 'uint256'],
    [fromAddress, BigInt(Date.now())],
  ))

  // Resolve token name/version from extra or defaults
  const tokenName = (requirements.extra?.['name'] as string) ?? 'USDC'
  const tokenVersion = (requirements.extra?.['version'] as string) ?? '2'

  // EIP-712 typed data params
  const domain = getEIP3009Domain(tokenAddress, chainId, tokenName, tokenVersion)
  const message = {
    from: fromAddress,
    to: requirements.payTo as `0x${string}`,
    value: BigInt(amount),
    validAfter: BigInt(validAfter),
    validBefore: BigInt(validBefore),
    nonce: nonce as `0x${string}`,
  }

  let signature: Hex

  if (isSocialLogin) {
    // Social Login: compute EIP-712 hash locally, sign via BGW TEE
    const hash = hashTypedData({
      domain,
      types: EIP3009_TYPES,
      primaryType: 'TransferWithAuthorization',
      message,
    })
    const creds = decryptCredentials(wallet as SocialWalletConfig)
    signature = await signTypedDataHash(creds, BGW_MORPH_CHAIN, hash) as Hex
  } else {
    // Private-key: sign locally with viem
    const privateKey = decrypt((wallet as WalletData).privateKey) as `0x${string}`
    const account = privateKeyToAccount(privateKey)
    signature = await account.signTypedData({
      domain,
      types: EIP3009_TYPES,
      primaryType: 'TransferWithAuthorization',
      message,
    })
  }

  return {
    x402Version: 2,
    payload: {
      signature,
      authorization: {
        from: fromAddress,
        to: requirements.payTo,
        value: amount,
        validAfter,
        validBefore,
        nonce,
      },
    },
    accepted: {
      ...requirements,
      maxAmountRequired: amount,
      scheme: requirements.scheme ?? 'exact',
      network: requirements.network ?? MORPH_NETWORK,
      asset: tokenAddress,
    },
  }
}

// ─── Pay ─────────────────────────────────────────────────────────────────────

/** Full x402 pay flow: probe → sign → replay */
export async function payX402(
  wallet: WalletData | SocialWalletConfig,
  url: string,
  opts: { maxPayment?: number; method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<PayResult> {
  // Step 1: Probe
  const probe = await probeX402(url)
  if (!probe.requiresPayment || !probe.paymentRequirements?.length) {
    return { url, paid: false, response: { status: probe.status, headers: {}, body: probe.body } }
  }

  // Pick first matching requirement (prefer Morph network)
  const req = probe.paymentRequirements.find(r => r.network === MORPH_NETWORK)
    ?? probe.paymentRequirements[0]

  // Check payment limit
  const amount = req.amount ?? req.maxAmountRequired ?? '0'
  const amountUsdc = Number(amount) / Math.pow(10, USDC_DECIMALS)
  const maxPayment = opts.maxPayment ?? 1.0 // default 1 USDC
  if (amountUsdc > maxPayment) {
    throw new Error(
      `Payment ${amountUsdc} USDC exceeds limit ${maxPayment} USDC. Use --max-payment to increase.`,
    )
  }

  // Step 2: Sign EIP-3009 (include url so accepted.resource is set)
  const reqWithResource = { ...req, resource: req.resource ?? url }
  const paymentPayload = await signEIP3009(wallet, reqWithResource)

  // Step 3: Replay with PAYMENT-SIGNATURE header (base64 encoded, v2 protocol)
  const paymentJson = JSON.stringify(paymentPayload)
  const paymentBase64 = Buffer.from(paymentJson).toString('base64')

  const replayRes = await fetch(url, {
    method: opts.method ?? 'GET',
    headers: {
      ...opts.headers,
      'PAYMENT-SIGNATURE': paymentBase64,
    },
    body: opts.body,
    signal: AbortSignal.timeout(30000),
  })

  // Parse response
  const resHeaders: Record<string, string> = {}
  replayRes.headers.forEach((v, k) => { resHeaders[k] = v })

  let resBody: unknown
  const contentType = replayRes.headers.get('content-type') ?? ''
  if (contentType.includes('json')) {
    resBody = await replayRes.json()
  } else {
    resBody = await replayRes.text()
  }

  return {
    url,
    paid: true,
    paymentPayload,
    response: {
      status: replayRes.status,
      headers: resHeaders,
      body: resBody,
    },
  }
}

// ─── Supported ───────────────────────────────────────────────────────────────

export interface SupportedResponse {
  kinds: Array<{ x402Version: number; scheme: string; network: string }>
  extensions: unknown[]
  signers: Record<string, string[]>
}

/** Query Morph Facilitator supported payment methods */
export async function getSupported(): Promise<SupportedResponse> {
  const res = await fetch(`${MORPH_FACILITATOR}/v2/supported`, {
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) {
    throw new Error(`Facilitator /v2/supported returned ${res.status}`)
  }
  return res.json() as Promise<SupportedResponse>
}
