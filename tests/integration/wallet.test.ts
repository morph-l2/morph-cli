import { describe, it, expect, afterEach } from 'vitest'
import { spawnSync } from 'child_process'
import { join } from 'path'
import { existsSync, unlinkSync } from 'fs'
import { homedir } from 'os'

const INDEX = join(process.cwd(), 'src/index.ts')
const WALLETS_DIR = join(homedir(), '.morph-agent', 'wallets')

/** Run CLI via tsx with --json flag, returns parsed output (never throws on non-zero exit) */
function cli(args: string[]): unknown {
  const result = spawnSync('npx', ['tsx', INDEX, '--json', ...args], {
    encoding: 'utf8',
    cwd: process.cwd(),
  })
  if (result.stdout.trim()) {
    return JSON.parse(result.stdout)
  }
  // Error output goes to stderr
  if (result.stderr.trim()) {
    const match = result.stderr.match(/^Error: (.+)/)
    return { error: match ? match[1] : result.stderr.trim() }
  }
  return null
}

/** Cleanup test wallet file if it exists */
function cleanWallet(name: string) {
  const p = join(WALLETS_DIR, `${name}.json`)
  if (existsSync(p)) unlinkSync(p)
}

const TEST_NAME = `_test_wallet_${Date.now()}`
const TEST_NAME2 = `_test_import_${Date.now()}`
const KNOWN_PRIVKEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const KNOWN_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

afterEach(() => {
  cleanWallet(TEST_NAME)
  cleanWallet(TEST_NAME2)
})

describe('wallet create', () => {
  it('creates a new wallet and returns address', () => {
    const res = cli(['wallet', 'create', '-n', TEST_NAME])
    const data = res as { name: string; address: string; isDefault: boolean }
    expect(data.name).toBe(TEST_NAME)
    expect(data.address).toMatch(/^0x[0-9a-fA-F]{40}$/)
  })

  it('fails if wallet already exists', () => {
    cli(['wallet', 'create', '-n', TEST_NAME])
    const res = cli(['wallet', 'create', '-n', TEST_NAME])
    expect((res as any).error).toBeDefined()
    expect((res as any).error).toContain('already exists')
  })
})

describe('wallet list', () => {
  it('includes created wallet in list', () => {
    cli(['wallet', 'create', '-n', TEST_NAME])
    const res = cli(['wallet', 'list'])
    const list = res as Array<{ name: string; address: string }>
    expect(list.some(w => w.name === TEST_NAME)).toBe(true)
  })
})

describe('wallet address', () => {
  it('returns correct address after create', () => {
    const created = cli(['wallet', 'create', '-n', TEST_NAME]) as { address: string }
    const addr = cli(['wallet', 'address', '-n', TEST_NAME])
    const d = addr as { address: string }
    expect(d.address).toBe(created.address)
  })

  it('fails for non-existent wallet', () => {
    const res = cli(['wallet', 'address', '-n', '_nonexistent_xyz'])
    expect((res as any).error).toBeDefined()
  })
})

describe('wallet remove', () => {
  it('removes existing wallet', () => {
    cli(['wallet', 'create', '-n', TEST_NAME])
    const res = cli(['wallet', 'remove', '-n', TEST_NAME])
    expect((res as any).error).toBeUndefined()
  })

  it('wallet no longer in list after remove', () => {
    cli(['wallet', 'create', '-n', TEST_NAME])
    cli(['wallet', 'remove', '-n', TEST_NAME])
    const list = cli(['wallet', 'list'])
    const names = (list as Array<{ name: string }>).map(w => w.name)
    expect(names).not.toContain(TEST_NAME)
  })

  it('fails for non-existent wallet', () => {
    const res = cli(['wallet', 'remove', '-n', '_nonexistent_xyz'])
    expect((res as any).error).toBeDefined()
  })
})

describe('wallet import', () => {
  it('imports from private key and returns known address', () => {
    const res = cli(['wallet', 'import', '-n', TEST_NAME2, '-k', KNOWN_PRIVKEY])
    const data = res as { address: string }
    expect(data.address.toLowerCase()).toBe(KNOWN_ADDRESS.toLowerCase())
  })

  it('imported wallet address matches wallet address command', () => {
    cli(['wallet', 'import', '-n', TEST_NAME2, '-k', KNOWN_PRIVKEY])
    const addr = cli(['wallet', 'address', '-n', TEST_NAME2])
    const data = addr as { address: string }
    expect(data.address.toLowerCase()).toBe(KNOWN_ADDRESS.toLowerCase())
  })

  it('fails without -k or -f', () => {
    const res = cli(['wallet', 'import', '-n', TEST_NAME2])
    expect((res as any).error).toBeDefined()
  })
})

describe('wallet transfer dry-run', () => {
  it('returns dryRun preview with --dry-run', () => {
    cli(['wallet', 'create', '-n', TEST_NAME])
    const res = cli([
      'wallet', 'transfer',
      '-w', TEST_NAME,
      '--to', '0x0000000000000000000000000000000000000001',
      '--amount', '0.001',
      '--dry-run',
    ])
    const data = res as { dryRun: boolean; note: string }
    expect(data.dryRun).toBe(true)
    expect(data.note).toContain('--dry-run')
  })

  it('dry-run includes from/to/amount/token fields', () => {
    cli(['wallet', 'create', '-n', TEST_NAME])
    const res = cli([
      'wallet', 'transfer',
      '-w', TEST_NAME,
      '--to', '0x0000000000000000000000000000000000000001',
      '--amount', '0.1',
      '--dry-run',
    ])
    const data = res as Record<string, unknown>
    expect(data).toHaveProperty('from')
    expect(data).toHaveProperty('to')
    expect(data).toHaveProperty('amount')
    expect(data.token).toBe('ETH')
  })
})
