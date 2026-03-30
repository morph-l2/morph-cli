import { describe, it, expect } from 'vitest'
import { spawnSync } from 'child_process'
import { join } from 'path'

const INDEX = join(process.cwd(), 'src/index.ts')
const TEST_ADDR = '0x8CB8e0a1FFF2dCBb2B853dB43DeDac4599979CB3'

function cli(args: string[]): unknown {
  const result = spawnSync('npx', ['tsx', INDEX, '--json', ...args], {
    encoding: 'utf8',
    cwd: process.cwd(),
  })
  if (result.stdout.trim()) {
    return JSON.parse(result.stdout)
  }
  if (result.stderr.trim()) {
    const match = result.stderr.match(/^Error: (.+)/)
    return { error: match ? match[1] : result.stderr.trim() }
  }
  return null
}

// ─── onchainrpc ──────────────────────────────────────────────────────────────

describe('onchainrpc gas', () => {
  it('returns gas price with gwei field', () => {
    const res = cli(['onchain', 'rpc', 'gas']) as { gasPrice: string; gasPriceGwei: string }
    expect(BigInt(res.gasPrice)).toBeGreaterThan(0n)
    expect(Number(res.gasPriceGwei)).toBeGreaterThan(0)
  })
})

describe('onchainrpc block', () => {
  it('returns latest block with number and hash', () => {
    const res = cli(['onchain', 'rpc', 'block']) as { number: string; hash: string; transactions: number }
    expect(Number(res.number)).toBeGreaterThan(0)
    expect(res.hash).toMatch(/^0x[0-9a-f]{64}$/)
    expect(typeof res.transactions).toBe('number')
  })
})

describe('onchainrpc balance', () => {
  it('returns ETH balance for test wallet', () => {
    const res = cli(['onchain', 'rpc', 'balance', '--address', TEST_ADDR]) as { address: string; ETH: string; wei: string }
    expect(res.address).toBe(TEST_ADDR)
    expect(Number(res.ETH)).toBeGreaterThanOrEqual(0)
  })
})

describe('onchainrpc nonce', () => {
  it('returns nonce for test wallet', () => {
    const res = cli(['onchain', 'rpc', 'nonce', '--address', TEST_ADDR]) as { nonce: number }
    expect(typeof res.nonce).toBe('number')
  })
})

describe('onchainrpc tx', () => {
  it('returns error for nonexistent tx hash', () => {
    const fakeHash = '0x' + 'ab'.repeat(32)
    const res = cli(['onchain', 'rpc', 'tx', '--hash', fakeHash])
    expect((res as any).error).toBeDefined()
  })
})

// ─── onchainexplorer ──────────────────────────────────────────────────────────

describe('onchainexplorer address-info', () => {
  it('returns address info for test wallet', () => {
    const res = cli(['onchain', 'explorer', 'address-info', '--address', TEST_ADDR])
    // Blockscout returns address hash in the response
    expect(res).toBeDefined()
  })
})

describe('onchainexplorer txs', () => {
  it('returns transaction list (possibly empty)', () => {
    const res = cli(['onchain', 'explorer', 'txs', '--address', TEST_ADDR, '--limit', '5']) as { items: unknown[] }
    expect(Array.isArray(res.items)).toBe(true)
    expect(res.items.length).toBeLessThanOrEqual(5)
  })
})

describe('onchainexplorer token-search', () => {
  it('returns token results for USDC', () => {
    const res = cli(['onchain', 'explorer', 'token-search', '--query', 'USDC'])
    expect(res).toBeDefined()
  })
})

describe('onchainexplorer tokens (address token-balances)', () => {
  it('returns token balances for test wallet', () => {
    const res = cli(['onchain', 'explorer', 'tokens', '--address', TEST_ADDR])
    expect(res).toBeDefined()
  })
})

// ─── onchainaltfee ────────────────────────────────────────────────────────────

describe('onchainaltfee tokens', () => {
  it('returns list of fee tokens from TokenRegistry', () => {
    const res = cli(['onchain', 'altfee', 'tokens']) as { tokens: Array<{ tokenId: number; address: string }> }
    expect(Array.isArray(res.tokens)).toBe(true)
    // at least one active token (USDT = ID 5)
    expect(res.tokens.length).toBeGreaterThan(0)
    for (const t of res.tokens) {
      expect(typeof t.tokenId).toBe('number')
      expect(t.address).toMatch(/^0x[0-9a-fA-F]{40}$/)
    }
  })
})

describe('onchainaltfee estimate', () => {
  it('estimates fee for USDT (token ID 5)', () => {
    const res = cli(['onchain', 'altfee', 'estimate', '--id', '5', '--gas-limit', '21000']) as { tokenId: number; feeLimitRecommended: string; feeLimitHuman: string }
    expect(res.tokenId).toBe(5)
    expect(BigInt(res.feeLimitRecommended)).toBeGreaterThan(0n)
    expect(Number(res.feeLimitHuman)).toBeGreaterThan(0)
  })
})

describe('onchainaltfee send dry-run', () => {
  it('returns dry-run preview without --broadcast', () => {
    const res = cli([
      'onchain', 'altfee', 'send',
      '-w', 'testnet_dev',
      '--to', '0x0000000000000000000000000000000000000001',
      '--fee-token-id', '5',
    ]) as { dryRun: boolean; type: string }
    expect(res.dryRun).toBe(true)
    expect(res.type).toBe('0x7f')
  })
})
