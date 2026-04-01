import { randomBytes, createCipheriv, createDecipheriv } from 'crypto'
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'fs'
import { ENCRYPTION_KEY_PATH, WALLETS_DIR, CONFIG_PATH, ensureDirs, safeName } from '../utils/config.js'
import { join } from 'path'

const ALGORITHM = 'aes-256-gcm'
const NONCE_LENGTH = 12
const AUTH_TAG_LENGTH = 16

export interface EncryptedData {
  nonce: string // hex
  ciphertext: string // hex
  tag: string // hex
}

export interface WalletData {
  name: string
  address: string
  privateKey: EncryptedData
  createdAt: string
}

/** Get or generate 32-byte encryption key */
function getEncryptionKey(): Buffer {
  ensureDirs()
  if (existsSync(ENCRYPTION_KEY_PATH)) {
    return readFileSync(ENCRYPTION_KEY_PATH)
  }
  const key = randomBytes(32)
  writeFileSync(ENCRYPTION_KEY_PATH, key, { mode: 0o600 })
  return key
}

/** AES-256-GCM encrypt */
export function encrypt(plaintext: string): EncryptedData {
  const key = getEncryptionKey()
  const nonce = randomBytes(NONCE_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, nonce, {
    authTagLength: AUTH_TAG_LENGTH,
  })
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return {
    nonce: nonce.toString('hex'),
    ciphertext: encrypted.toString('hex'),
    tag: tag.toString('hex'),
  }
}

/** AES-256-GCM decrypt */
export function decrypt(data: EncryptedData): string {
  const key = getEncryptionKey()
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(data.nonce, 'hex'),
    { authTagLength: AUTH_TAG_LENGTH },
  )
  decipher.setAuthTag(Buffer.from(data.tag, 'hex'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(data.ciphertext, 'hex')),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}

/** Save wallet to ~/.morph-agent/wallets/{name}.json */
export function saveWallet(wallet: WalletData): void {
  ensureDirs()
  const filePath = join(WALLETS_DIR, `${safeName(wallet.name)}.json`)
  writeFileSync(filePath, JSON.stringify(wallet, null, 2), { mode: 0o600 })
}

/** Load wallet by name */
export function loadWallet(name: string): WalletData | null {
  const filePath = join(WALLETS_DIR, `${safeName(name)}.json`)
  if (!existsSync(filePath)) return null
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

/** List all wallets */
export function listWallets(): WalletData[] {
  ensureDirs()
  const files = readdirSync(WALLETS_DIR)
  return files
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(WALLETS_DIR, f), 'utf8')))
}

/** Remove wallet by name. Clears default if removing the default wallet. */
export function removeWallet(name: string): boolean {
  const filePath = join(WALLETS_DIR, `${safeName(name)}.json`)
  if (!existsSync(filePath)) return false
  unlinkSync(filePath)
  // Clear default if we just removed the default wallet
  if (getDefaultWalletName() === name) {
    setDefaultWalletName('')
  }
  return true
}

// ─── Default Wallet ──────────────────────────────────────────────────────────

/** Read config.json */
function readConfig(): Record<string, unknown> {
  ensureDirs()
  if (!existsSync(CONFIG_PATH)) return {}
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
  } catch {
    return {}
  }
}

/** Write config.json */
function writeConfig(config: Record<string, unknown>): void {
  ensureDirs()
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 })
}

/** Get the default wallet name from config */
export function getDefaultWalletName(): string | null {
  const config = readConfig()
  const name = config.defaultWallet as string | undefined
  return name || null
}

/** Set the default wallet name in config */
export function setDefaultWalletName(name: string): void {
  const config = readConfig()
  if (name) {
    config.defaultWallet = name
  } else {
    delete config.defaultWallet
  }
  writeConfig(config)
}

/** Resolve wallet name: use provided name, or fall back to default wallet */
export function resolveWalletName(name?: string): string {
  if (name) return name
  return getDefaultWalletName() || 'main'
}

// ─── Unified Wallet Lookup ───────────────────────────────────────────────────

import type { SocialWalletConfig } from './social-login.js'
import { loadSocialWallet } from './social-login.js'

/**
 * Look up a wallet by name: first check private-key wallets, then social-login wallets.
 * Returns { type, wallet } or null if not found.
 */
export function resolveAnyWallet(
  name: string,
): { type: 'private-key'; wallet: WalletData } | { type: 'social-login'; wallet: SocialWalletConfig } | null {
  const pk = loadWallet(name)
  if (pk) return { type: 'private-key', wallet: pk }
  const sl = loadSocialWallet(name)
  if (sl) return { type: 'social-login', wallet: sl }
  return null
}
