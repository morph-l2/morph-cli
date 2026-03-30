/**
 * DEX swap — Bulbaswap aggregator on Morph L2
 *
 * Token resolution helpers + quote/swap API wrappers
 */
import { formatUnits, parseUnits, type PublicClient } from 'viem'
import { MORPH_TOKENS, BULBASWAP, BULBASWAP_TESTNET } from '../utils/config.js'
import { httpGet } from '../utils/http.js'
import { ERC20_ABI } from '../../contracts/erc20.js'

const NATIVE_TOKEN = '0x0000000000000000000000000000000000000000'

// ─── Token resolution ────────────────────────────────────────────────────────

/** Resolve token symbol or address for DEX API (ETH for native) */
export function tokenForDex(symbolOrAddress: string): string {
  const upper = symbolOrAddress.toUpperCase()
  if (upper === 'ETH' || symbolOrAddress === NATIVE_TOKEN) return 'ETH'
  if (/^0x[0-9a-fA-F]{40}$/.test(symbolOrAddress)) return symbolOrAddress
  for (const [sym, info] of Object.entries(MORPH_TOKENS)) {
    if (sym.toUpperCase() === upper) return info.address
  }
  throw new Error(`Unknown token "${symbolOrAddress}". Use a symbol (ETH/USDC/USDT/BGB) or 0x address.`)
}

/** Resolve token symbol to address + decimals for on-chain ops (fetches on-chain for unknown 0x addresses) */
export { resolveToken as resolveErc20 } from '../utils/token.js'

// ─── Quote ───────────────────────────────────────────────────────────────────

export interface QuoteParams {
  tokenIn: string
  tokenOut: string
  amount: string
  slippage: string
  deadline: string
  recipient?: string
  hoodi?: boolean
}

export async function getSwapQuote(params: QuoteParams): Promise<Record<string, unknown>> {
  const apiBase = params.hoodi ? 'https://api-testnet.bulbaswap.io' : BULBASWAP.apiBase
  const queryParams: Record<string, string> = {
    tokenInAddress: params.tokenIn,
    tokenOutAddress: params.tokenOut,
    amount: params.amount,
    slippage: params.slippage,
    deadline: params.deadline,
    protocols: 'v2,v3',
  }
  if (params.recipient) queryParams['recipient'] = params.recipient

  const data = await httpGet<Record<string, unknown>>(`${apiBase}/v2/quote`, queryParams)

  if (typeof data['code'] === 'number' && data['code'] !== 0) {
    throw new Error(`DEX API error ${data['code']}: ${data['msg']}`)
  }
  return data
}

// ─── ERC-20 helpers ──────────────────────────────────────────────────────────

export async function getAllowance(
  client: PublicClient,
  tokenAddress: `0x${string}`,
  owner: `0x${string}`,
  spender: `0x${string}`,
): Promise<bigint> {
  return client.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [owner, spender],
  }) as Promise<bigint>
}

/** Get the default router/spender address for the given network */
export function getDefaultSpender(hoodi?: boolean): `0x${string}` {
  const dex = hoodi ? BULBASWAP_TESTNET : BULBASWAP
  return dex.universalRouter as `0x${string}`
}

export { ERC20_ABI }
