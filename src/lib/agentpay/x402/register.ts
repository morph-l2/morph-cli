/**
 * x402 Merchant Registration — wallet-sign login + API key creation
 *
 * Supports both private-key wallets and Social Login wallets.
 *
 * Flow:
 *   1. GET  /auth/nonce?address=0x... → { message, nonce }
 *   2. Sign message (local private key OR Social Login TEE API)
 *   3. POST /auth/login { address, signature, nonce } → JWT token
 *   4. POST /api-keys/create (Bearer token) → { accessKey, secretKey }
 *   5. GET  /api-keys/detail (Bearer token) → existing key info
 */
import { privateKeyToAccount } from 'viem/accounts'
import { decrypt, type WalletData } from '../../wallet/keystore.js'
import {
  decryptCredentials,
  signMessage,
  type SocialWalletConfig,
} from '../../wallet/social-login.js'

const RAILS_BASE = 'https://morph-rails.morph.network/x402'

interface RailsResponse<T> {
  code: number
  message: string
  data: T
}

// ─── Step 1: Get nonce ──────────────────────────────────────────────────────

async function getNonce(address: string): Promise<{ message: string; nonce: string }> {
  const res = await fetch(`${RAILS_BASE}/auth/nonce?address=${address}`, {
    signal: AbortSignal.timeout(15000),
  })
  const json = await res.json() as RailsResponse<{ message: string; nonce: string }>
  if (json.code !== 0) throw new Error(json.message || 'Failed to get nonce')
  return json.data
}

// ─── Step 2+3: Sign + Login ─────────────────────────────────────────────────

async function login(address: string, signature: string, nonce: string): Promise<string> {
  const res = await fetch(`${RAILS_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, signature, nonce }),
    signal: AbortSignal.timeout(15000),
  })
  const json = await res.json() as RailsResponse<{ token: string }>
  if (json.code !== 0) throw new Error(json.message || 'Login failed')
  return json.data.token
}

// ─── Step 4: Create API key ─────────────────────────────────────────────────

async function createApiKey(token: string): Promise<{ accessKey: string; secretKey: string; isNew: boolean }> {
  const res = await fetch(`${RAILS_BASE}/api-keys/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(15000),
  })
  const json = await res.json() as RailsResponse<{ accessKey: string; secretKey: string }>

  // code 40005 = key already exists — detail endpoint won't return secretKey (shown once only)
  if (json.code === 40005) {
    const existing = await getApiKeyDetail(token)
    if (existing) return { ...existing, isNew: false }
    throw new Error('Key exists but failed to fetch details')
  }

  if (json.code !== 0) throw new Error(json.message || 'Failed to create API key')
  return { ...json.data, isNew: true }
}

// ─── Step 5: Get existing key ───────────────────────────────────────────────

async function getApiKeyDetail(token: string): Promise<{ accessKey: string; secretKey: string } | null> {
  const res = await fetch(`${RAILS_BASE}/api-keys/detail`, {
    headers: { 'Authorization': `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  })
  const json = await res.json() as RailsResponse<{ accessKey: string; secretKey?: string; createdAt?: string }>
  if (json.code !== 0 || !json.data?.accessKey) return null
  return {
    accessKey: json.data.accessKey,
    secretKey: json.data.secretKey ?? '',
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface RegisterResult {
  accessKey: string
  secretKey: string
  address: string
  isNew: boolean
}

/**
 * Register as x402 merchant: wallet sign-in → create API key
 * Supports both private-key wallets and Social Login wallets.
 */
export async function registerMerchant(wallet: WalletData | SocialWalletConfig): Promise<RegisterResult> {
  let address: string
  let signFn: (message: string) => Promise<string>

  if ('credentials' in wallet) {
    // Social Login wallet
    const slWallet = wallet as SocialWalletConfig
    address = slWallet.address ?? ''
    if (!address) throw new Error('Social Login wallet has no cached address. Re-bind with "wallet sl".')
    const creds = decryptCredentials(slWallet)
    signFn = async (msg: string) => signMessage(creds, 'evm', msg)
  } else {
    // Private-key wallet
    const pkWallet = wallet as WalletData
    const privateKey = decrypt(pkWallet.privateKey) as `0x${string}`
    const account = privateKeyToAccount(privateKey)
    address = account.address
    signFn = async (msg: string) => account.signMessage({ message: msg })
  }

  // Step 1: Get nonce
  const { message, nonce } = await getNonce(address)

  // Step 2: Sign message
  const signature = await signFn(message)

  // Step 3: Login
  const token = await login(address, signature, nonce)

  // Step 4: Create key (returns secretKey on first creation)
  // If key already exists (40005), createApiKey falls back to detail — secretKey will be empty
  const result = await createApiKey(token)
  return { accessKey: result.accessKey, secretKey: result.secretKey, address, isNew: result.isNew }
}
