/**
 * x402 Merchant Credentials — encrypted local storage (per-wallet)
 *
 * Stores credentials at ~/.morph-agent/x402-credentials/{walletName}.json
 * Secret Key is AES-256-GCM encrypted (same key as wallet encryption)
 * Access Key is stored in plaintext (it's not secret, just an identifier)
 */
import { existsSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { encrypt, decrypt } from '../../wallet/keystore.js'
import { X402_CREDENTIALS_DIR, ensureDirs } from '../../utils/config.js'

interface EncryptedData {
  nonce: string
  ciphertext: string
  tag: string
}

interface StoredCredentials {
  name: string                // wallet name
  address: string             // wallet address
  accessKey: string           // plaintext (identifier, not secret)
  secretKey: EncryptedData    // AES-256-GCM encrypted
  createdAt: string
}

export interface MerchantCredentials {
  name: string
  address: string
  accessKey: string
  secretKey: string
}

/** Save merchant credentials by wallet name (Secret Key encrypted) */
export function saveCredentials(name: string, address: string, accessKey: string, secretKey: string): void {
  ensureDirs()
  const data: StoredCredentials = {
    name,
    address,
    accessKey,
    secretKey: encrypt(secretKey),
    createdAt: new Date().toISOString(),
  }
  writeFileSync(join(X402_CREDENTIALS_DIR, `${name}.json`), JSON.stringify(data, null, 2), { mode: 0o600 })
}

/** Load merchant credentials by wallet name (decrypt Secret Key) */
export function loadCredentials(name: string): MerchantCredentials | null {
  const filePath = join(X402_CREDENTIALS_DIR, `${name}.json`)
  if (!existsSync(filePath)) return null
  const data: StoredCredentials = JSON.parse(readFileSync(filePath, 'utf8'))
  return {
    name: data.name,
    address: data.address,
    accessKey: data.accessKey,
    secretKey: decrypt(data.secretKey),
  }
}

/** List all saved credentials (Secret Keys masked) */
export function listCredentials(): Array<{ name: string; address: string; accessKey: string; createdAt: string }> {
  ensureDirs()
  return readdirSync(X402_CREDENTIALS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const data: StoredCredentials = JSON.parse(readFileSync(join(X402_CREDENTIALS_DIR, f), 'utf8'))
      return { name: data.name, address: data.address, accessKey: data.accessKey, createdAt: data.createdAt }
    })
}

/** Check if credentials exist for a wallet name */
export function hasCredentials(name: string): boolean {
  return existsSync(join(X402_CREDENTIALS_DIR, `${name}.json`))
}

/** Remove credentials by wallet name */
export function removeCredentials(name: string): boolean {
  const filePath = join(X402_CREDENTIALS_DIR, `${name}.json`)
  if (!existsSync(filePath)) return false
  unlinkSync(filePath)
  return true
}
