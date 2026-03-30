import { createPublicClient, http, type Chain } from 'viem'
import { MORPH_MAINNET, MORPH_TESTNET } from './config.js'

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

/** Morph Hoodi testnet chain definition for viem */
export const morphTestnet: Chain = {
  id: MORPH_TESTNET.chainId,
  name: MORPH_TESTNET.name,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [MORPH_TESTNET.rpc] },
  },
  blockExplorers: {
    default: { name: 'Morph Explorer', url: MORPH_TESTNET.explorer },
  },
}

/** Get a read-only public client (no private key required) */
export function getPublicClient(testnet = false) {
  const chain = testnet ? morphTestnet : morphMainnet
  return createPublicClient({
    chain,
    transport: http(),
  })
}
