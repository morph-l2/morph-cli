import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// ─── Mock config to use temp dir ─────────────────────────────────────────────

const TEST_DIR = join(tmpdir(), `morph-agent-test-creds-${process.pid}`)

vi.mock('../../src/lib/utils/config.js', async () => {
  const { tmpdir: td } = await import('os')
  const { join: j } = await import('path')
  const { existsSync: ex, mkdirSync: mk } = await import('fs')
  const dir = j(td(), `morph-agent-test-creds-${process.pid}`)
  const credsDir = j(dir, 'x402-credentials')
  return {
    MORPH_DIR: dir,
    WALLETS_DIR: j(dir, 'wallets'),
    SOCIAL_WALLETS_DIR: j(dir, 'social-wallets'),
    X402_CREDENTIALS_DIR: credsDir,
    CONFIG_PATH: j(dir, 'config.json'),
    ENCRYPTION_KEY_PATH: j(dir, '.encryption-key'),
    ensureDirs: () => {
      if (!ex(dir)) mk(dir, { recursive: true, mode: 0o700 })
      if (!ex(credsDir)) mk(credsDir, { recursive: true, mode: 0o700 })
    },
  }
})

import {
  saveCredentials,
  loadCredentials,
  hasCredentials,
  removeCredentials,
} from '../../src/lib/agentpay/x402/credentials.js'

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  mkdirSync(join(TEST_DIR, 'x402-credentials'), { recursive: true, mode: 0o700 })
})

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
})

// ─── Tests ───────────────────────────────────────────────────────────────────

const WALLET_NAME = 'test-wallet'
const WALLET_ADDR = '0x1234567890123456789012345678901234567890'

describe('credentials: save / load / remove', () => {
  it('starts with no credentials', () => {
    expect(hasCredentials(WALLET_NAME)).toBe(false)
    expect(loadCredentials(WALLET_NAME)).toBeNull()
  })

  it('saves and loads credentials correctly', () => {
    saveCredentials(WALLET_NAME, WALLET_ADDR, 'morph_ak_test123', 'morph_sk_secret456')

    expect(hasCredentials(WALLET_NAME)).toBe(true)

    const loaded = loadCredentials(WALLET_NAME)
    expect(loaded).not.toBeNull()
    expect(loaded!.accessKey).toBe('morph_ak_test123')
    expect(loaded!.secretKey).toBe('morph_sk_secret456')
  })

  it('access key is stored in plaintext, secret key is encrypted', () => {
    saveCredentials(WALLET_NAME, WALLET_ADDR, 'morph_ak_plain', 'morph_sk_encrypted')

    // Read raw file to verify
    const raw = JSON.parse(readFileSync(join(TEST_DIR, 'x402-credentials', `${WALLET_NAME}.json`), 'utf8'))

    // Access key should be plaintext
    expect(raw.accessKey).toBe('morph_ak_plain')

    // Secret key should be encrypted (has nonce, ciphertext, tag)
    expect(raw.secretKey).toHaveProperty('nonce')
    expect(raw.secretKey).toHaveProperty('ciphertext')
    expect(raw.secretKey).toHaveProperty('tag')
    expect(typeof raw.secretKey.nonce).toBe('string')
  })

  it('removes credentials and returns true', () => {
    saveCredentials(WALLET_NAME, WALLET_ADDR, 'morph_ak_del', 'morph_sk_del')
    expect(hasCredentials(WALLET_NAME)).toBe(true)

    const result = removeCredentials(WALLET_NAME)
    expect(result).toBe(true)
    expect(hasCredentials(WALLET_NAME)).toBe(false)
    expect(loadCredentials(WALLET_NAME)).toBeNull()
  })

  it('returns false when removing non-existent credentials', () => {
    expect(removeCredentials('nonexistent-wallet')).toBe(false)
  })

  it('overwrites existing credentials on re-save', () => {
    saveCredentials(WALLET_NAME, WALLET_ADDR, 'morph_ak_old', 'morph_sk_old')
    saveCredentials(WALLET_NAME, WALLET_ADDR, 'morph_ak_new', 'morph_sk_new')

    const loaded = loadCredentials(WALLET_NAME)
    expect(loaded!.accessKey).toBe('morph_ak_new')
    expect(loaded!.secretKey).toBe('morph_sk_new')
  })

  it('has createdAt timestamp', () => {
    saveCredentials(WALLET_NAME, WALLET_ADDR, 'morph_ak_ts', 'morph_sk_ts')

    const raw = JSON.parse(readFileSync(join(TEST_DIR, 'x402-credentials', `${WALLET_NAME}.json`), 'utf8'))
    expect(raw.createdAt).toBeTruthy()
    // Should be a valid ISO date
    expect(new Date(raw.createdAt).getTime()).toBeGreaterThan(0)
  })
})
