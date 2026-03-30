import { getPublicClient } from './rpc.js'
import { ERC20_ABI } from '../../contracts/erc20.js'
import { MORPH_TOKENS, MORPH_TESTNET_TOKENS } from './config.js'

export interface TokenInfo {
  address: `0x${string}`
  decimals: number
  symbol: string
}

/** Cache to avoid duplicate RPC calls within a single run */
const _cache = new Map<string, TokenInfo>()

/**
 * Resolve token by symbol (BGB/USDC/...) or 0x contract address.
 * For known symbols: returns config values instantly.
 * For 0x addresses: fetches decimals() and symbol() from chain.
 * Returns null for "ETH" (native).
 */
export async function resolveToken(symbolOrAddress: string, testnet = false): Promise<TokenInfo | null> {
  const upper = symbolOrAddress.toUpperCase()
  if (upper === 'ETH') return null

  // Check known token list (case-insensitive); use testnet list when --hoodi
  const tokenList = testnet ? MORPH_TESTNET_TOKENS : MORPH_TOKENS
  for (const [sym, info] of Object.entries(tokenList)) {
    if (sym.toUpperCase() === upper) return { ...info, symbol: sym }
  }

  // Must be a 0x address
  if (!/^0x[0-9a-fA-F]{40}$/.test(symbolOrAddress)) {
    throw new Error(
      `Unknown token "${symbolOrAddress}". Use ETH, a symbol (${Object.keys(MORPH_TOKENS).join('/')}) or a 0x contract address.`,
    )
  }

  const addr = symbolOrAddress.toLowerCase() as `0x${string}`
  const cacheKey = `${testnet ? 't' : 'm'}:${addr}`
  if (_cache.has(cacheKey)) return _cache.get(cacheKey)!

  const client = getPublicClient(testnet)
  const [decimals, symbol] = await Promise.all([
    client.readContract({ address: addr, abi: ERC20_ABI, functionName: 'decimals' }) as Promise<number>,
    client.readContract({ address: addr, abi: ERC20_ABI, functionName: 'symbol' }) as Promise<string>,
  ])

  const info: TokenInfo = { address: addr, decimals, symbol }
  _cache.set(cacheKey, info)
  return info
}
