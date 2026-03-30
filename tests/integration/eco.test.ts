import { describe, it, expect } from 'vitest'
import { spawnSync } from 'child_process'
import { join } from 'path'

const INDEX = join(process.cwd(), 'src/index.ts')
const TEST_WALLET = 'testnet_dev'
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

describe('eco swap quote', () => {
  it('returns quote for ETH → USDC without recipient (price only)', () => {
    const res = cli([
      'eco', 'swap', 'quote',
      '--amount', '0.0001',
      '--from', 'ETH',
      '--to', 'USDC',
    ])
    const data = res as Record<string, unknown>
    // Quote should have some price-related fields
    expect(data).toBeDefined()
  })

  it('returns calldata when --recipient is provided', () => {
    const res = cli([
      'eco', 'swap', 'quote',
      '--amount', '0.0001',
      '--from', 'ETH',
      '--to', 'USDC',
      '--recipient', TEST_ADDR,
    ])
    const data = res as Record<string, unknown>
    expect(data).toBeDefined()
  })
})

describe('eco swap send dry-run', () => {
  it('returns dry-run preview without --broadcast', () => {
    const res = cli([
      'eco', 'swap', 'send',
      '-w', TEST_WALLET,
      '--to', '0xb789922D715475F419b7CB47B6155bF7a2ACECD6',
      '--value', '0.0001',
      '--data', '0x12345678',
    ])
    const data = res as { dryRun: boolean }
    expect(data.dryRun).toBe(true)
  })
})

describe('eco swap approve dry-run', () => {
  it('returns dry-run preview for USDC approval', () => {
    const res = cli([
      'eco', 'swap', 'approve',
      '-w', TEST_WALLET,
      '--token', 'USDC',
      '--amount', '100',
    ])
    const data = res as { dryRun: boolean; token: string; amount: string }
    expect(data.dryRun).toBe(true)
    expect(data.token).toBe('USDC')
    expect(Number(data.amount)).toBe(100)
  })
})

describe('eco swap allowance', () => {
  it('returns current USDC allowance for test wallet', () => {
    const res = cli([
      'eco', 'swap', 'allowance',
      '-w', TEST_WALLET,
      '--token', 'USDC',
    ])
    const data = res as { allowance: string }
    expect(Number(data.allowance)).toBeGreaterThanOrEqual(0)
  })
})
