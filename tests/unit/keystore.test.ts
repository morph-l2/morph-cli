import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// vi.mock factory is hoisted — must use inline literals or imports inside
vi.mock('../../src/lib/utils/config.js', async () => {
  const { tmpdir: td } = await import('os')
  const { join: j } = await import('path')
  const { existsSync: ex, mkdirSync: mk } = await import('fs')
  const dir = j(td(), `morph-agent-test-${process.pid}`)
  const walletsDir = j(dir, 'wallets')
  return {
    MORPH_DIR: dir,
    WALLETS_DIR: walletsDir,
    ENCRYPTION_KEY_PATH: j(dir, '.encryption-key'),
    CONFIG_PATH: j(dir, 'config.json'),
    ensureDirs: () => {
      for (const d of [dir, walletsDir]) {
        if (!ex(d)) mk(d, { recursive: true, mode: 0o700 })
      }
    },
  }
})

// Resolve the same paths for test setup/teardown
const TEST_DIR = join(tmpdir(), `morph-agent-test-${process.pid}`)
const TEST_WALLETS_DIR = join(TEST_DIR, 'wallets')
const TEST_KEY_PATH = join(TEST_DIR, '.encryption-key')

import {
  encrypt,
  decrypt,
  saveWallet,
  loadWallet,
  listWallets,
  removeWallet,
  type WalletData,
} from '../../src/lib/wallet/keystore.js'

// ── Helpers ───────────────────────────────────────────────────────────────

function makeWallet(name: string): WalletData {
  return {
    name,
    address: '0x1234567890123456789012345678901234567890',
    privateKey: encrypt('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'),
    createdAt: new Date().toISOString(),
  }
}

// ── Setup / teardown ──────────────────────────────────────────────────────

beforeEach(() => {
  mkdirSync(TEST_WALLETS_DIR, { recursive: true, mode: 0o700 })
})

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
})

// ── encrypt / decrypt ─────────────────────────────────────────────────────

describe('encrypt / decrypt', () => {
  it('roundtrip — decrypt(encrypt(x)) === x', () => {
    const key = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
    expect(decrypt(encrypt(key))).toBe(key)
  })

  it('encrypted result has nonce, ciphertext, tag fields', () => {
    const enc = encrypt('hello')
    expect(enc).toHaveProperty('nonce')
    expect(enc).toHaveProperty('ciphertext')
    expect(enc).toHaveProperty('tag')
    expect(typeof enc.nonce).toBe('string')
    expect(typeof enc.ciphertext).toBe('string')
    expect(typeof enc.tag).toBe('string')
  })

  it('nonce is random — two encryptions of same plaintext differ', () => {
    const a = encrypt('same-input')
    const b = encrypt('same-input')
    expect(a.nonce).not.toBe(b.nonce)
    expect(a.ciphertext).not.toBe(b.ciphertext)
  })

  it('wrong tag causes decryption to throw', () => {
    const enc = encrypt('secret')
    const tampered = { ...enc, tag: '00'.repeat(16) }
    expect(() => decrypt(tampered)).toThrow()
  })

  it('wrong ciphertext causes decryption to throw', () => {
    const enc = encrypt('secret')
    const tampered = { ...enc, ciphertext: 'ff'.repeat(enc.ciphertext.length / 2) }
    expect(() => decrypt(tampered)).toThrow()
  })

  it('auto-creates encryption key file if it does not exist', () => {
    // Remove the key file so getEncryptionKey() must create it
    rmSync(TEST_KEY_PATH, { force: true })
    expect(existsSync(TEST_KEY_PATH)).toBe(false)
    encrypt('trigger-key-creation')
    expect(existsSync(TEST_KEY_PATH)).toBe(true)
  })
})

// ── saveWallet / loadWallet ───────────────────────────────────────────────

describe('saveWallet / loadWallet', () => {
  it('saves wallet and loads it back by name', () => {
    const w = makeWallet('alice')
    saveWallet(w)
    const loaded = loadWallet('alice')
    expect(loaded).not.toBeNull()
    expect(loaded!.name).toBe('alice')
    expect(loaded!.address).toBe(w.address)
  })

  it('loaded privateKey decrypts back to original', () => {
    const original = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
    const w: WalletData = {
      name: 'bob',
      address: '0x0000000000000000000000000000000000000001',
      privateKey: encrypt(original),
      createdAt: new Date().toISOString(),
    }
    saveWallet(w)
    const loaded = loadWallet('bob')!
    expect(decrypt(loaded.privateKey)).toBe(original)
  })

  it('loadWallet returns null for non-existent wallet', () => {
    expect(loadWallet('does-not-exist')).toBeNull()
  })
})

// ── listWallets ───────────────────────────────────────────────────────────

describe('listWallets', () => {
  it('returns empty array when no wallets exist', () => {
    expect(listWallets()).toEqual([])
  })

  it('returns all saved wallets', () => {
    saveWallet(makeWallet('wallet-a'))
    saveWallet(makeWallet('wallet-b'))
    const wallets = listWallets()
    expect(wallets).toHaveLength(2)
    const names = wallets.map(w => w.name).sort()
    expect(names).toEqual(['wallet-a', 'wallet-b'])
  })

  it('ignores non-json files in wallets dir', () => {
    saveWallet(makeWallet('real'))
    // Write a stray file that is not .json
    writeFileSync(join(TEST_WALLETS_DIR, 'README.txt'), 'ignore me')
    expect(listWallets()).toHaveLength(1)
  })
})

// ── removeWallet ──────────────────────────────────────────────────────────

describe('removeWallet', () => {
  it('removes an existing wallet and returns true', () => {
    saveWallet(makeWallet('to-delete'))
    expect(removeWallet('to-delete')).toBe(true)
    expect(loadWallet('to-delete')).toBeNull()
  })

  it('returns false when wallet does not exist', () => {
    expect(removeWallet('ghost')).toBe(false)
  })

  it('removing one wallet does not affect others', () => {
    saveWallet(makeWallet('keep'))
    saveWallet(makeWallet('del'))
    removeWallet('del')
    expect(listWallets()).toHaveLength(1)
    expect(listWallets()[0].name).toBe('keep')
  })
})
