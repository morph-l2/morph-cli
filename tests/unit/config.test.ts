import { describe, it, expect } from 'vitest'
import {
  MORPH_MAINNET,
  MORPH_TOKENS,
  ALT_FEE_TOKENS,
} from '../../src/lib/utils/config.js'

describe('MORPH_MAINNET', () => {
  it('chain ID is 2818', () => {
    expect(MORPH_MAINNET.chainId).toBe(2818)
  })
  it('RPC URL is https', () => {
    expect(MORPH_MAINNET.rpc).toMatch(/^https:\/\//)
  })
  it('explorer URL uses morph.network', () => {
    expect(MORPH_MAINNET.explorer).toContain('morph.network')
  })
})

describe('MORPH_TOKENS', () => {
  const expectedSymbols = ['WETH', 'BGB', 'USDC', 'USDC.e', 'USDT.e', 'USDT', 'DAI', 'WBTC', 'weETH']

  it('contains all expected token symbols', () => {
    for (const sym of expectedSymbols) {
      expect(MORPH_TOKENS).toHaveProperty(sym)
    }
  })

  it('all addresses are valid 0x format', () => {
    for (const [, info] of Object.entries(MORPH_TOKENS)) {
      expect(info.address).toMatch(/^0x[0-9a-fA-F]{40}$/)
    }
  })

  it('stablecoins use 6 decimals', () => {
    expect(MORPH_TOKENS['USDC'].decimals).toBe(6)
    expect(MORPH_TOKENS['USDT'].decimals).toBe(6)
  })

  it('WETH uses 18 decimals', () => {
    expect(MORPH_TOKENS['WETH'].decimals).toBe(18)
  })
})

describe('ALT_FEE_TOKENS', () => {
  it('token IDs are positive integers', () => {
    for (const id of Object.keys(ALT_FEE_TOKENS)) {
      expect(Number(id)).toBeGreaterThan(0)
    }
  })

  it('each alt-fee token has symbol and address', () => {
    for (const [, info] of Object.entries(ALT_FEE_TOKENS)) {
      expect(typeof info.symbol).toBe('string')
      expect(info.address).toMatch(/^0x[0-9a-fA-F]{40}$/)
    }
  })
})
