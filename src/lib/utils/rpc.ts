import { createPublicClient, http, type Chain } from 'viem'
import { MORPH_MAINNET } from './config.js'

/** Morph Mainnet chain definition for viem */
export const morphMainnet: Chain = {
  id: MORPH_MAINNET.chainId,
  name: MORPH_MAINNET.name,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [MORPH_MAINNET.rpc] },
  },
  blockExplorers: {
    default: { name: 'Morph Explorer', url: MORPH_MAINNET.explorer },
  },
}

/** Get a read-only public client (no private key required) */
export function getPublicClient() {
  return createPublicClient({
    chain: morphMainnet,
    transport: http(),
  })
}
