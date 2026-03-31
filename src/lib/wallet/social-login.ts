/**
 * Social Login Wallet — TEE-hosted signing via Social Login API.
 *
 * Agent only needs appid/appsecret credentials; private keys are managed
 * inside Bitget's Trusted Execution Environment (TEE).
 */
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createHash,
  randomBytes,
} from 'crypto'
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { SOCIAL_WALLETS_DIR, ensureDirs } from '../utils/config.js'
import { encrypt, decrypt } from './keystore.js'
import type { EncryptedData } from './keystore.js'

// ─── Constants ─────────────────────────────────────────────────────────────────

const BASE_URL = 'https://copenapi.bgwapi.io'

const ENDPOINTS = {
  core: '/social-wallet/agent/core',
  profile: '/social-wallet/agent/profile',
  batchGetAddress: '/social-wallet/agent/batchGetAddressAndPubkey',
  signMessage: '/social-wallet/agent/signMessage',
} as const

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SocialWalletCredentials {
  appid: string
  appsecret: string // hex string
}

export interface SocialWalletConfig {
  name: string
  type: 'social-login'
  credentials: EncryptedData // encrypted JSON of {appid, appsecret}
  address?: string           // cached EVM address
  walletId?: string          // cached walletId
  createdAt: string
}

// ─── SL Crypto (AES-256-GCM + HMAC-SHA384 + Gateway SHA256) ────────────────

function aesGcmEncrypt(plaintext: string, appsecret: string): string {
  const key = Buffer.from(appsecret, 'hex').subarray(0, 32)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // SL format: ciphertext + authTag + iv → base64
  return Buffer.concat([ct, tag, iv]).toString('base64')
}

function aesGcmDecrypt(encryptedB64: string, appsecret: string): string {
  const key = Buffer.from(appsecret, 'hex').subarray(0, 32)
  const raw = Buffer.from(encryptedB64, 'base64')
  const iv = raw.subarray(-12)
  const body = raw.subarray(0, -12)
  const tagStart = body.length - 16
  const tag = body.subarray(tagStart)
  const ct = body.subarray(0, tagStart)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

function hmacSha384(message: string, appsecret: string): string {
  return createHmac('sha384', Buffer.from(appsecret, 'hex'))
    .update(message, 'utf8')
    .digest('base64')
}

function gatewaySign(path: string, body: string, timestamp: string): string {
  return (
    '0x' +
    createHash('sha256')
      .update('POST' + path + body + timestamp)
      .digest('hex')
  )
}

// ─── API Call ──────────────────────────────────────────────────────────────────

export async function callSocialApi(
  creds: SocialWalletCredentials,
  endpoint: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  const timestamp = String(Date.now())
  const nonce = randomBytes(16).toString('hex')

  const paramJson = JSON.stringify(params)
  const paramEncrypted = aesGcmEncrypt(paramJson, creds.appsecret)
  const paramSign = hmacSha384(
    `${paramEncrypted}|${timestamp}|${nonce}|${creds.appid}`,
    creds.appsecret,
  )

  const body = { param: paramEncrypted, paramSign }
  const bodyStr = JSON.stringify(body)

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    channel: 'toc_agent',
    brand: 'toc_agent',
    clientversion: '10.0.0',
    language: 'en',
    token: 'toc_agent',
    'X-SIGN': gatewaySign(endpoint, bodyStr, timestamp),
    'X-TIMESTAMP': timestamp,
    'x-agent-appid': creds.appid,
    'x-nonce': nonce,
    sig: paramSign,
  }

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers,
    body: bodyStr,
    signal: AbortSignal.timeout(15000),
  })

  const data = (await res.json()) as Record<string, unknown>
  const status = data.status as number
  if (res.status !== 200 || status !== 0) {
    const msg = (data.msg as string) || 'unknown'
    throw new Error(`Social wallet API error [status=${status}]: ${msg}`)
  }

  const respData = typeof data.data === 'object' && data.data !== null ? (data.data as Record<string, unknown>) : {}
  const resultEncrypted = respData.result as string | undefined

  if (resultEncrypted) {
    const decrypted = aesGcmDecrypt(resultEncrypted, creds.appsecret)
    try {
      return JSON.parse(decrypted)
    } catch {
      return { result: decrypted }
    }
  }
  return data.data ?? data
}

// ─── Business Functions ────────────────────────────────────────────────────────

export async function getProfile(
  creds: SocialWalletCredentials,
): Promise<{ walletId: string }> {
  const result = (await callSocialApi(creds, ENDPOINTS.profile, {})) as Record<string, unknown>
  return { walletId: (result.walletId as string) || (result.wallet_id as string) || '' }
}

export async function getAddress(
  creds: SocialWalletCredentials,
  chain = 'evm',
): Promise<string> {
  const result = (await callSocialApi(creds, ENDPOINTS.batchGetAddress, {
    chainList: [chain],
  })) as Record<string, unknown>

  // Response may be { evm: { address: "0x..." } } or similar
  if (typeof result === 'object' && result !== null) {
    const chainData = result[chain] as Record<string, unknown> | undefined
    if (chainData?.address) return chainData.address as string
    // Flat format
    if (result.address) return result.address as string
    // Array format
    if (Array.isArray(result)) {
      const first = result[0] as Record<string, unknown> | undefined
      if (first?.address) return first.address as string
    }
  }
  throw new Error(`Cannot extract address from API response: ${JSON.stringify(result)}`)
}

export async function signTransaction(
  creds: SocialWalletCredentials,
  txParams: Record<string, unknown>,
): Promise<string> {
  const param = JSON.stringify(txParams)
  const result = (await callSocialApi(creds, ENDPOINTS.core, {
    operation: 'sign_transaction',
    param,
  })) as Record<string, unknown>

  // Expect { signedTx: "0x..." } or { rawTransaction: "0x..." }
  const signed =
    (result.signedTx as string) ||
    (result.rawTransaction as string) ||
    (result.result as string)
  if (!signed) {
    throw new Error(`No signed transaction in response: ${JSON.stringify(result)}`)
  }
  return signed
}

export async function signMessage(
  creds: SocialWalletCredentials,
  chain: string,
  message: string,
): Promise<string> {
  // Uses core endpoint with operation=sign_message (same pattern as sign_transaction)
  const param = JSON.stringify({ chain, message })
  const result = (await callSocialApi(creds, ENDPOINTS.core, {
    operation: 'sign_message',
    param,
  })) as Record<string, unknown>

  const sig =
    (result.signature as string) ||
    (result.result as string)
  if (!sig) {
    throw new Error(`No signature in response: ${JSON.stringify(result)}`)
  }
  return sig
}

/** Sign a pre-computed EIP-712 hash via BGW TEE using EthSign:{hash} format */
export async function signTypedDataHash(
  creds: SocialWalletCredentials,
  chain: string,
  hash: string, // 0x-prefixed hex hash
): Promise<string> {
  return signMessage(creds, chain, `EthSign:${hash}`)
}

// Morph chain identifier for BGW TEE API
export const BGW_MORPH_CHAIN = 'evm_custom#morph' as const

// ─── Storage ───────────────────────────────────────────────────────────────────

export function saveSocialWallet(config: SocialWalletConfig): void {
  ensureDirs()
  const filePath = join(SOCIAL_WALLETS_DIR, `${config.name}.json`)
  writeFileSync(filePath, JSON.stringify(config, null, 2), { mode: 0o600 })
}

export function loadSocialWallet(name: string): SocialWalletConfig | null {
  const filePath = join(SOCIAL_WALLETS_DIR, `${name}.json`)
  if (!existsSync(filePath)) return null
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

export function listSocialWallets(): SocialWalletConfig[] {
  ensureDirs()
  const files = readdirSync(SOCIAL_WALLETS_DIR)
  return files
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(SOCIAL_WALLETS_DIR, f), 'utf8')))
}

export function removeSocialWallet(name: string): boolean {
  const filePath = join(SOCIAL_WALLETS_DIR, `${name}.json`)
  if (!existsSync(filePath)) return false
  unlinkSync(filePath)
  return true
}

/** Decrypt stored credentials */
export function decryptCredentials(config: SocialWalletConfig): SocialWalletCredentials {
  const json = decrypt(config.credentials)
  return JSON.parse(json)
}
