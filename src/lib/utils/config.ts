import { existsSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

/** Root directory: ~/.morph-agent/ */
export const MORPH_DIR = join(homedir(), '.morph-agent')

/** Wallet storage: ~/.morph-agent/wallets/ */
export const WALLETS_DIR = join(MORPH_DIR, 'wallets')

/** Social Login wallet storage: ~/.morph-agent/social-wallets/ */
export const SOCIAL_WALLETS_DIR = join(MORPH_DIR, 'social-wallets')

/** x402 credentials storage: ~/.morph-agent/x402-credentials/ */
export const X402_CREDENTIALS_DIR = join(MORPH_DIR, 'x402-credentials')

/** Config file: ~/.morph-agent/config.json */
export const CONFIG_PATH = join(MORPH_DIR, 'config.json')

/** Encryption key file: ~/.morph-agent/.encryption-key */
export const ENCRYPTION_KEY_PATH = join(MORPH_DIR, '.encryption-key')

// ─── Network ────────────────────────────────────────────────────────

/** Morph mainnet */
export const MORPH_MAINNET = {
  chainId: 2818,
  name: 'Morph Mainnet',
  rpc: 'https://rpc-quicknode.morph.network',
  explorer: 'https://explorer.morph.network',
  blockscoutApi: 'https://explorer-api.morph.network/api/v2',
} as const

/** Morph Hoodi testnet */
export const MORPH_TESTNET = {
  chainId: 2910,
  name: 'Morph Hoodi Testnet',
  rpc: 'https://rpc-hoodi.morph.network',
  explorer: 'https://explorer-hoodi.morph.network',
  blockscoutApi: 'https://explorer-api-hoodi.morph.network/api/v2',
} as const

// ─── ERC-20 Tokens (Morph Mainnet) ─────────────────────────────────

export const MORPH_TOKENS: Record<string, { address: `0x${string}`; decimals: number }> = {
  WETH:     { address: '0x5300000000000000000000000000000000000011', decimals: 18 },
  BGB:      { address: '0x389C08Bc23A7317000a1FD76c7c5B0cb0b4640b5', decimals: 18 },
  USDC:     { address: '0xCfb1186F4e93D60E60a8bDd997427D1F33bc372B', decimals: 6  },
  'USDC.e': { address: '0xe34c91815d7fc18A9e2148bcD4241d0a5848b693', decimals: 6  },
  'USDT.e': { address: '0xc7D67A9cBB121b3b0b9c053DD9f469523243379A', decimals: 6  },
  USDT:     { address: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', decimals: 6  },
  DAI:      { address: '0xef8A24599229D002B28bA2F5C0eBdD3c0EFFbed4', decimals: 18 },
  WBTC:     { address: '0x803DcE4D3f4Ae2e17AF6C51343040dEe320C149D', decimals: 8  },
  weETH:    { address: '0x7DCC39B4d1C53CB31e1aBc0e358b43987FEF80f7', decimals: 18 },
}

// ─── Alt-Fee Token Registry (Morph-specific tx type 0x7f) ────────────

export const ALT_FEE_TOKEN_REGISTRY = '0x5300000000000000000000000000000000000021' as const

/** on-chain token IDs from TokenRegistry.getTokenInfo(id). Only active/recommended tokens listed. */
export const ALT_FEE_TOKENS: Record<number, { symbol: string; address: `0x${string}` }> = {
  4: { symbol: 'BGB',  address: '0x389C08Bc23A7317000a1FD76c7c5B0cb0b4640b5' },
  5: { symbol: 'USDT', address: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D' },
  6: { symbol: 'USDC', address: '0xCfb1186F4e93D60E60a8bDd997427D1F33bc372B' },
}

// ─── L2 System Contracts (Predeploys, 0x5300...) ────────────────────

export const MORPH_L2_PREDEPLOYS = {
  L2ToL1MessagePasser:      '0x5300000000000000000000000000000000000001',
  L2GatewayRouter:          '0x5300000000000000000000000000000000000002',
  Gov:                      '0x5300000000000000000000000000000000000004',
  L2ETHGateway:             '0x5300000000000000000000000000000000000006',
  L2CrossDomainMessenger:   '0x5300000000000000000000000000000000000007',
  L2StandardERC20Gateway:   '0x5300000000000000000000000000000000000008',
  L2ERC721Gateway:          '0x5300000000000000000000000000000000000009',
  L2TxFeeVault:             '0x530000000000000000000000000000000000000a',
  ProxyAdmin:               '0x530000000000000000000000000000000000000b',
  L2ERC1155Gateway:         '0x530000000000000000000000000000000000000c',
  MorphStandardERC20:       '0x530000000000000000000000000000000000000d',
  MorphStandardERC20Factory:'0x530000000000000000000000000000000000000e',
  GasPriceOracle:           '0x530000000000000000000000000000000000000f',
  L2WETHGateway:            '0x5300000000000000000000000000000000000010',
  L2WETH:                   '0x5300000000000000000000000000000000000011',
  L2Staking:                '0x5300000000000000000000000000000000000015',
  L2CustomERC20Gateway:     '0x5300000000000000000000000000000000000016',
  Sequencer:                '0x5300000000000000000000000000000000000017',
  TokenRegistry:            '0x5300000000000000000000000000000000000021',
} as const

// ─── L1 Contracts (Ethereum Mainnet → Morph) ────────────────────────

export const MORPH_L1_CONTRACTS = {
  Staking:                  '0x0dc417f8af88388737c5053ff73f345f080543f7',
  Rollup:                   '0x759894ced0e6af42c26668076ffa84d02e3cef60',
  L1MessageQueue:           '0x3931ade842f5bb8763164bdd81e5361dce6cc1ef',
  L1CrossDomainMessenger:   '0xdc71366effa760804dcfc3edf87fa2a6f1623304',
  L1GatewayRouter:          '0x7497756ada7e656ae9f00781af49fc0fd08f8a8a',
  L1ETHGateway:             '0x1c1ffb5828c3a48b54e8910f1c75256a498ade68',
  L1WETHGateway:            '0x788890ba6f105cca373c4ff01055cd34de01877f',
  L1StandardERC20Gateway:   '0x44c28f61a5c2dd24fc71d7df8e85e18af4ab2bd8',
  L1CustomERC20Gateway:     '0xa534badd09b4c62b7b1c32c41df310aa17b52ef1',
  L1ERC721Gateway:          '0x5ae782c23a303c0d70ae697a0aee9eae9a5d77c4',
  L1ERC1155Gateway:         '0x7c9a3d9531692d057d496d04938bdb7d367e9765',
  L1USDCGateway:            '0x2C8314f5AADa5D7a9D32eeFebFc43aCCAbe1b289',
  EnforcedTxGateway:        '0xc5fa3b8968c7fabeea2b530a20b88d0c2ed8abb7',
  L2USDCGateway:            '0xc5e44E2fFe9523809146eD17D62bb382ECCf426B',
} as const

// ─── DEX — Bulbaswap (Morph Mainnet) ────────────────────────────────

export const BULBASWAP = {
  apiBase:                  'https://api.bulbaswap.io',
  universalRouter:          '0xb789922D715475F419b7CB47B6155bF7a2ACECD6',
  routerV2:                 '0x81606E6f8aAD6C75c2f383Ea595c2b9f8ce8aE3a',
  swapRouter02:             '0xa7304d322219553d4A85c9cE8eB7462Dcaf6453C',
  factoryV2:                '0x8D2A8b8F7d200d75Bf5F9E84e01F9272f90EFB8b',
  factoryV3:                '0xFf8578C2949148A6F19b7958aE86CAAb2779CDDD',
  multicall:                '0xAcD82113982479B25E7c1D09858F0130921Dbbca',
  quoter:                   '0xc312e6417D07Ae7Ba73FeF0832B1811194A7BbEf',
  positionManager:          '0xC6B60EE77854b7c11c39b6E3f5BCfe1866cbC20A',
  tickLens:                 '0xA8da1415a3310d4b3759a683839947e6F8223ee2',
  permit2:                  '0x90a8a8E2Abb67d300593C714b687De109B4bCE5e',
  migrator:                 '0xe87c01ca304d69a94c4E079275B276BE659EE5eF',
} as const

// ─── DEX — Bulbaswap (Morph Hoodi Testnet) ──────────────────────────

export const BULBASWAP_TESTNET = {
  universalRouter:          '0xCb14f819761Bde40AFcC8c54044aBED23aea24AF',
  routerV2:                 '0x0Fbc1878d0a8BE4f071dF201C8b53d0A7db0C671',
  swapRouter02:             '0xd77Cabe8e6626cAA0E7793B59E4abfD6b1a86B9C',
  factoryV2:                '0xbD3A2aABA47f3cb1359bAb25EFE90fB5f8837506',
  factoryV3:                '0xb6fD0b4F948b260102e6c96dEB7De6c8a4e7Fd9C',
  multicall:                '0x81bb09C7E199c7eED49B2a9C6eDe3e64b5B4Dd63',
  quoter:                   '0x12b085A63B31dC14Bb0fEf8bfEA251E220B243B8',
  positionManager:          '0x3c692a7416f6875D7dfCb552ABa5236af471e66a',
  tickLens:                 '0x884B2F3B075C1f2fe7620B011f56ae80a5Ff36e2',
  permit2:                  '0xc3065F76f0890B75AD2d7E7B631D71d8EA4466Ce',
  migrator:                 '0x5152ca514a8B2E586732975F0d20cfE9Da0bd431',
} as const

// ─── Hoodi Testnet Tokens ───────────────────────────────────────────

export const MORPH_TESTNET_TOKENS: Record<string, { address: `0x${string}`; decimals: number }> = {
  WETH: { address: '0x5300000000000000000000000000000000000011', decimals: 18 },
  USDC: { address: '0x1178341838B764dCfFA5BCEAb1d41443Fd71a227', decimals: 6  },
}

// ─── Helpers ────────────────────────────────────────────────────────

/** Validate wallet/credential name to prevent path traversal (e.g. ../../etc/passwd) */
export function safeName(name: string): string {
  if (!name || /[/\\]/.test(name) || name === '.' || name === '..') {
    throw new Error(`Invalid name "${name}": must not contain path separators or be "." / ".."`)
  }
  return name
}

/** Ensure ~/.morph-agent/ and subdirectories exist */
export function ensureDirs(): void {
  for (const dir of [MORPH_DIR, WALLETS_DIR, SOCIAL_WALLETS_DIR, X402_CREDENTIALS_DIR]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 })
    }
  }
}
