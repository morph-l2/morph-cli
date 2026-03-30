/**
 * Bridge — Cross-chain swap via Bulbaswap bridge API
 *
 * Auth flow: EIP-191 sign-in → JWT → makeSwapOrder + submitSwapOrder
 * Supports 6 chains: morph, eth, base, bnb, arbitrum, matic
 */
import { privateKeyToAccount } from 'viem/accounts'
import { httpGet, httpPost } from '../utils/http.js'
import { BULBASWAP } from '../utils/config.js'
import { decrypt, type WalletData } from '../wallet/keystore.js'
import { decryptCredentials, signMessage as slSignMessage, signTransaction as slSignTransaction, type SocialWalletConfig } from '../wallet/social-login.js'
import { isSocialWallet } from '../wallet/resolve.js'
import { parseEther } from 'viem'

/** Map chain ID to BGW TEE chain name */
function chainIdToBgw(chainId: number): string {
  const MAP: Record<number, string> = {
    2818: 'evm_custom#morph',
    2910: 'evm_custom#morph',
    1:    'eth',
    56:   'evm_custom#bnb',
    8453: 'evm_custom#base',
    42161:'evm_custom#arb',
    137:  'matic',
  }
  return MAP[chainId] ?? `evm_custom#${chainId}`
}

const BRIDGE_API = BULBASWAP.apiBase
const NATIVE = ''

// ─── Token Registry ──────────────────────────────────────────────────────────

export const BRIDGE_TOKENS: Record<string, Record<string, string>> = {
  morph: {
    ETH:      NATIVE,
    'USDT.e': '0xc7D67A9cBB121b3b0b9c053DD9f469523243379A',
    USDT:    '0xe7cd86e13AC4309349F30B3435a9d337750fC82D',
    USDC:     '0xCfb1186F4e93D60E60a8bDd997427D1F33bc372B',
    'USDC.e': '0xe34c91815d7fc18A9e2148bcD4241d0a5848b693',
    BGB:      '0x389C08Bc23A7317000a1FD76c7c5B0cb0b4640b5',
    'BGB(old)':'0x55d1f1879969bdbB9960d269974564C58DBc3238',
    KOALA:    '0x051bc29e6d13671f6bcbd8be8bb7d889e0d89079',
    BAI:      '0xe2e7d83dfbd25407045fd061e4c17cc76007dead',
    MX:       '0x0beef4b01281d85492713a015d51fec5b6d14687',
    BGLIFE:   '0x341270fEc15C43c5F150fc648dB33890E54E1111',
  },
  eth: {
    ETH:   NATIVE,
    USDT:  '0xdac17f958d2ee523a2206206994597c13d831ec7',
    USDC:  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    WBTC:  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
    DAI:   '0x6b175474e89094c44da98b954eedeac495271d0f',
    BGB:   '0x54D2252757e1672EEaD234D27B1270728fF90581',
    LINK:  '0x514910771af9ca656af840dff83e8264ecf986ca',
    UNI:   '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
    WTAO:  '0x77e06c9eccf2e797fd462a92b6d7642ef85b0a44',
    PRIME: '0xb23d80f5fefcddaa212212f028021b41ded428cf',
    PEPE:  '0x6982508145454ce325ddbe47a25d4ec3d2311933',
    RNDR:  '0x6de037ef9ad2725eb40118bb1702ebb27e4aeb24',
    EIGEN: '0xec53bf9167f50cdeb3ae105f56099aaab9061f83',
    NEIRO: '0x812ba41e071c7b7fa4ebcfb62df5f45f6fa853ee',
    SPX:   '0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c',
    ONDO:  '0xfaba6f8e4a5e8ab82f62fe7c39859fa577269be3',
    INJ:   '0xe28b3b32b6c345a34ff64674606124dd5aceca30',
    FET:   '0xaea46a60368a7bd060eec7df8cba43b7ef41ad85',
    PAAL:  '0x14fee680690900ba0cccfc76ad70fd1b95d10e16',
    LDO:   '0x5a98fcbea516cf06857215779fd812ca3bef1b32',
    FLOKI: '0xcf0c122c6b73ff809c693db761e7baebe62b6a2e',
  },
  base: {
    ETH:     NATIVE,
    USDC:    '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    USDT:    '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
    WETH:    '0x4200000000000000000000000000000000000006',
    DAI:     '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
    MOEW:    '0x15aC90165f8B45A80534228BdCB124A011F62Fee',
    VIRTUAL: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b',
    cbBTC:   '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
    ROLL:    '0xAb6363dA0C80cEF3Ae105Bd6241E30872355d021',
    AERO:    '0x940181a94a35a4569e4529a3cdfb74e38fd98631',
    AVNT:    '0x696F9436B67233384889472Cd7cD58A6fB5DF4f1',
    ZORA:    '0x1111111111166b7fe7bd91427724b487980afc69',
    KTA:     '0xc0634090F2Fe6c6d75e61Be2b949464aBB498973',
    RECALL:  '0x1f16e03C1a590818F47f6EE7bB16690b40D0671',
    ELSA:    '0x29cC30f9D113B356Ce408667aa6433589CeCBDcA',
    ZEN:     '0xf43eb8de897fbc7f2502483b2bef7bb9ea179229',
  },
  matic: {
    POL:     NATIVE,
    MATIC:   NATIVE,
    USDT:   '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
    USDC:    '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
    WETH:    '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619',
    WBTC:    '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6',
    'USDC.e':'0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
    QUICK:   '0xb5c064f955d8e7f38fe0460c556a72987494ee17',
    AAVE:    '0xd6df932a45c0f255f85145f286ea0b292b21c90b',
    LGNS:    '0xeb51d9a39ad5eef215dc0bf39a8821ff804a0f01',
    DAI:     '0x8f3cf7ad23cd3cadbD9735AFf958023239c6a063',
    APEPE:   '0xA3f751662e282E83EC3cBc387d225Ca56dD63D3A',
    IXT:     '0xe06bd4f5aac8d0aa337d13ec88db6defc6eaeefe',
    RNDR:    '0x61299774020da444af134c82fa83e3810b309991',
    LINK:    '0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39',
    GHST:    '0x385eeac5cb85a38a9a07a70c73e0a3271cfb54a7',
    VOXEL:   '0xd0258a3fd00f38aa8090dfee343f10a9d4d30d3f',
    GNS:     '0xE5417Af564e4bFDA1c483642db72007871397896',
    WIFI:    '0xe238ecb42c424e877652ad82d8a939183a04c35f',
    TEL:     '0xdf7837de1f2fa4631d716cf2502f8b230f1dcc32',
    LDO:     '0xc3c7d422809852031b44ab29eec9f1eff2a58756',
  },
  bnb: {
    BNB:     NATIVE,
    USDT:    '0x55d398326f99059ff775485246999027b3197955',
    USDC:    '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
    BTCB:    '0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c',
    Cake:    '0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82',
    ETH:     '0x2170ed0880ac9a755fd29b2688956bd959f933f8',
    DOGE:    '0xba2ae424d960c26247dd6c32edc70b295c744c43',
    ADA:     '0x3ee2200efb3400fabb9aacf31297cbdd1d435d47',
    XRP:     '0x1d2f0da169ceb9fc7b3144628db156f3f6c60dbe',
    AIO:     '0x81a7da4074b8e0ed51bea40f9dcbdf4d9d4832b4',
    AT:      '0x9be61A38725b265BC3eb7Bfdf17AfDFc9D26C130',
    ASTER:   '0x000Ae314E2A2172a039B26378814C252734f556A',
    LIGHT:   '0x477C2c0459004E3354Ba427FA285D7C053203c0E',
    SKYAI:   '0x92aa03137385f18539301349dcfc9ebc923ffb10',
    RTX:     '0x4829A1D1fB6DED1F81d26868ab8976648baF9893',
    elizaOS: '0xea17df5cf6d172224892b5477a16acb111182478',
    MYX:     '0xD82544bf0dfe8385eF8FA34D67e6e4940CC63e16',
  },
  arbitrum: {
    ETH:    NATIVE,
    USDT:  '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
    USDC:   '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
    ARB:    '0x912CE59144191C1204E64559FE8253a0e49E6548',
    WBTC:   '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f',
    GMX:    '0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a',
    MAGIC:  '0x539bdE0d7Dbd336b79148AA742883198BBF60342',
    ZRO:    '0x6985884C4392D348587B19cb9eAAf157F13271cd',
    RDNT:   '0x3082cc23568ea640225c2467653db90e9250aaa0',
    VSN:    '0x6fbbbd8bfb1cd3986b1d05e7861a0f62f87db74b',
    PENDLE: '0x0c880f6761f1af8d9aa9c466984b80dab9a8c9e8',
    ezETH:  '0x2416092f143378750bb29b79eD961ab195cCEea5',
    LINK:   '0xf97f4df75117a78c1a5a0dbb814af92458539fb4',
    MOR:    '0x092bAaDB7DEf4C3981454dD9c0A0D7FF07bCFc86',
    GRT:    '0x9623063377ad1b27544c965ccd7342f7ea7e88c7',
    XAI:    '0x4Cb9a7AE498CEDcBb5EAe9f25736aE7d428C9D66',
    GNS:    '0x18c11fd286c5ec11c3b683caa813b77f5163a122',
  },
}

// Case-insensitive lookup: {chain: {SYMBOL_UPPER: address}}
const _BRIDGE_TOKENS_UPPER: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(BRIDGE_TOKENS).map(([chain, tokens]) => [
    chain,
    Object.fromEntries(Object.entries(tokens).map(([k, v]) => [k.toUpperCase(), v])),
  ]),
)

/** Resolve a token symbol or 0x address for a given chain */
export function resolveBridgeToken(symbolOrAddress: string, chain?: string): string {
  if (!symbolOrAddress || symbolOrAddress.toUpperCase() === 'ETH') return NATIVE
  if (/^0x[0-9a-fA-F]{40}$/.test(symbolOrAddress)) return symbolOrAddress

  const upper = symbolOrAddress.toUpperCase()

  if (chain) {
    const chainTokens = _BRIDGE_TOKENS_UPPER[chain.toLowerCase()]
    if (chainTokens && upper in chainTokens) return chainTokens[upper]
    const orig = BRIDGE_TOKENS[chain.toLowerCase()] ?? {}
    const symbols = Object.keys(orig).join(', ')
    throw new Error(`Unknown token "${symbolOrAddress}" on chain "${chain}". Available: ${symbols}`)
  }

  // Default to morph
  const morphTokens = _BRIDGE_TOKENS_UPPER['morph']
  if (morphTokens && upper in morphTokens) return morphTokens[upper]
  throw new Error(
    `Unknown token "${symbolOrAddress}". Provide --from-chain/--to-chain, ` +
    `use a contract address (0x...), or: bridge token-search --keyword ${symbolOrAddress}`,
  )
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

interface BridgeResp<T = unknown> {
  status: number
  error_code?: string | number
  msg?: string
  data?: T
}

interface AuthResp<T = unknown> {
  code: number
  msg?: string
  data?: T
}

export async function bridgeGet<T = unknown>(path: string): Promise<T> {
  const resp = await httpGet<BridgeResp<T>>(`${BRIDGE_API}${path}`)
  if (resp.status !== 0) {
    throw new Error(`Bridge API error ${resp.error_code ?? resp.status}: ${resp.msg ?? 'unknown error'}`)
  }
  return resp.data as T
}

export async function bridgePost<T = unknown>(path: string, body: unknown): Promise<T> {
  const resp = await httpPost<BridgeResp<T>>(`${BRIDGE_API}${path}`, body)
  if (resp.status !== 0) {
    throw new Error(`Bridge API error ${resp.error_code ?? resp.status}: ${resp.msg ?? 'unknown error'}`)
  }
  return resp.data as T
}

export async function bridgePostAuth<T = unknown>(path: string, body: unknown, jwt: string): Promise<T> {
  const resp = await httpPost<BridgeResp<T>>(
    `${BRIDGE_API}${path}`,
    body,
    { Authorization: `Bearer ${jwt}` },
  )
  if (resp.status !== 0) {
    throw new Error(`Bridge API error ${resp.error_code ?? resp.status}: ${resp.msg ?? 'unknown error'}`)
  }
  return resp.data as T
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

function generateAuthMessage(timestamp: number): string {
  return (
    'Welcome to Bulba.\n\n' +
    'Please sign this message to verify your wallet.\n\n' +
    `Timestamp: ${timestamp}.\n\n` +
    'Your authentication status will be reset after 24 hours.'
  )
}

export interface LoginResult {
  token: string
  address: string
  expiresAt?: string
}

export async function bridgeLogin(wallet: WalletData | SocialWalletConfig): Promise<LoginResult> {
  const timestamp = Date.now()
  const message = generateAuthMessage(timestamp)

  let address: string
  let signature: string

  if (isSocialWallet(wallet)) {
    const creds = decryptCredentials(wallet)
    address = wallet.address
    signature = await slSignMessage(creds, 'evm_custom#morph', message)
  } else {
    const privateKey = decrypt(wallet.privateKey) as `0x${string}`
    const account = privateKeyToAccount(privateKey)
    address = account.address
    signature = await account.signMessage({ message })
  }

  const body = {
    address,
    signature,
    timestamp,
  }

  const resp = await httpPost<AuthResp<LoginResult>>(
    `${BRIDGE_API}/v1/auth/sign-in`,
    body,
  )
  if (resp.code !== 200) {
    throw new Error(`Auth error: ${resp.msg ?? 'unknown error'}`)
  }
  return resp.data as LoginResult
}

// ─── Transaction signing ──────────────────────────────────────────────────────

interface UnsignedBridgeTx {
  chainId: string | number
  data: {
    nonce: string | number
    to: string
    value: string
    gasLimit: string | number
    gasPrice: string | number
    calldata: string
  }
}

/** Sign a list of unsigned bridge transactions, return raw hex strings */
export async function signBridgeTxs(wallet: WalletData | SocialWalletConfig, txs: UnsignedBridgeTx[]): Promise<string[]> {
  const signed: string[] = []

  if (isSocialWallet(wallet)) {
    const creds = decryptCredentials(wallet)
    for (const txInfo of txs) {
      const d = txInfo.data
      const chainId = Number(txInfo.chainId)
      const chain = chainIdToBgw(chainId)
      let value: number
      try { value = Number(parseEther(String(d.value))) / 1e18 } catch { value = 0 }
      const signedTx = await slSignTransaction(creds, {
        chain,
        chainId,
        to: d.to,
        value,
        data: (d.calldata || '0x'),
        nonce: Number(d.nonce),
        gasLimit: String(d.gasLimit),
        gasPrice: String(Number(d.gasPrice) / 1e18),
      })
      signed.push(signedTx)
    }
    return signed
  }

  const privateKey = decrypt(wallet.privateKey) as `0x${string}`
  const account = privateKeyToAccount(privateKey)

  for (const txInfo of txs) {
    const d = txInfo.data
    // Bridge API returns ETH value as human-readable string (e.g. "0.001" or "0")
    let valueWei: bigint
    try {
      valueWei = parseEther(String(d.value))
    } catch {
      valueWei = BigInt(0)
    }

    const rawHex = await account.signTransaction({
      type: 'legacy',
      chainId: Number(txInfo.chainId),
      nonce: Number(d.nonce),
      to: d.to as `0x${string}`,
      value: valueWei,
      gas: BigInt(d.gasLimit),
      gasPrice: BigInt(d.gasPrice),
      data: (d.calldata || '0x') as `0x${string}`,
    })

    signed.push(rawHex)
  }

  return signed
}

// ─── One-step swap ────────────────────────────────────────────────────────────

export interface SwapParams {
  fromChain: string
  fromContract: string
  fromAmount: string
  toChain: string
  toContract: string
  toAddress?: string
  market: string
  slippage?: string
  feature?: string
}

export interface MakeOrderResult {
  orderId: string
  toMinAmount?: string
  txs: UnsignedBridgeTx[]
}

export async function bridgeSwap(
  wallet: WalletData | SocialWalletConfig,
  jwt: string,
  params: SwapParams,
): Promise<{
  orderId: string
  fromChain: string
  toChain: string
  fromAmount: string
  toMinAmount?: string
  txCount: number
  status: string
}> {
  const toAddress = params.toAddress ?? wallet.address

  const body: Record<string, string> = {
    fromChain: params.fromChain,
    fromContract: params.fromContract,
    fromAmount: params.fromAmount,
    toChain: params.toChain,
    toContract: params.toContract,
    toAddress,
    market: params.market,
  }
  if (params.slippage) body['slippage'] = params.slippage
  if (params.feature) body['feature'] = params.feature

  // Step 1: make order
  const order = await bridgePostAuth<MakeOrderResult>('/v2/order/makeSwapOrder', body, jwt)

  // Step 2: sign txs
  const signedList = await signBridgeTxs(wallet, order.txs ?? [])

  // Step 3: submit
  await bridgePostAuth('/v2/order/submitSwapOrder', {
    orderId: order.orderId,
    signedTxs: signedList,
  }, jwt)

  return {
    orderId: order.orderId,
    fromChain: params.fromChain,
    toChain: params.toChain,
    fromAmount: params.fromAmount,
    toMinAmount: order.toMinAmount,
    txCount: signedList.length,
    status: 'submitted',
  }
}
