/**
 * EIP-7702 — EOA delegate authorization + batch call on Morph L2
 *
 * Default delegate: SimpleDelegation at 0xBD7093Ded667289F9808Fa0C678F81dbB4d2eEb7 (ERC-1271 compatible)
 * Contract interface:
 *   execute(Call[] calls, uint256 nonce, bytes signature) — batch execute with sig verification
 *   getDigest(Call[] calls, uint256 nonce) → bytes32     — EIP-191 digest for signing
 *   nonce() → uint256                                     — replay protection counter
 */
import { createWalletClient, http, encodeFunctionData, keccak256, encodeAbiParameters, toRlp, bytesToHex, hexToBytes, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { decrypt, type WalletData } from '../wallet/keystore.js'
import { decryptCredentials, signTypedDataHash, type SocialWalletConfig } from '../wallet/social-login.js'
import { isSocialWallet } from '../wallet/resolve.js'
import { getPublicClient, morphMainnet } from '../utils/rpc.js'
import { extractSigFields } from './altfee.js'

// ─── Constants ───────────────────────────────────────────────────────────────

export const DEFAULT_DELEGATE = '0xBD7093Ded667289F9808Fa0C678F81dbB4d2eEb7' as const

// EIP-7702 delegation prefix: 0xef0100 + 20-byte address
const DELEGATION_PREFIX = '0xef0100'
const BGW_MORPH_CHAIN = 'evm_custom#morph'

function intToHex7702(value: bigint): Hex {
  if (value === 0n) return '0x'
  const hex = value.toString(16)
  return `0x${hex.length % 2 === 0 ? hex : `0${hex}`}` as Hex
}

/** Compute EIP-7702 authorization hash: keccak256(0x05 || rlp([chainId, address, nonce])) */
export function computeAuthorizationHash(chainId: number, contractAddress: `0x${string}`, nonce: number): `0x${string}` {
  const fields = [
    intToHex7702(BigInt(chainId)),
    contractAddress,
    intToHex7702(BigInt(nonce)),
  ]
  const rlpEncoded = toRlp(fields as Parameters<typeof toRlp>[0], 'bytes')
  const payload = new Uint8Array(1 + rlpEncoded.length)
  payload[0] = 0x05
  payload.set(rlpEncoded, 1)
  return keccak256(bytesToHex(payload))
}

interface AuthSigItem {
  chainId: number
  address: `0x${string}`
  nonce: number
  yParity: Hex
  r: Hex
  s: Hex
}

interface Eip7702TxData {
  chainId: number
  nonce: number
  maxPriorityFeePerGas: bigint
  maxFeePerGas: bigint
  gas: bigint
  to: `0x${string}`
  value: bigint
  data: `0x${string}`
  authorizationList: AuthSigItem[]
}

function serializeEip7702Fields(tx: Eip7702TxData, sig?: { yParity: Hex; r: Hex; s: Hex }): Uint8Array {
  const fields: unknown[] = [
    intToHex7702(BigInt(tx.chainId)),
    intToHex7702(BigInt(tx.nonce)),
    intToHex7702(tx.maxPriorityFeePerGas),
    intToHex7702(tx.maxFeePerGas),
    intToHex7702(tx.gas),
    tx.to,
    intToHex7702(tx.value),
    tx.data === '0x' ? '0x' : tx.data,
    [], // accessList
    tx.authorizationList.map(a => [
      intToHex7702(BigInt(a.chainId)),
      a.address,
      intToHex7702(BigInt(a.nonce)),
      a.yParity,
      a.r,
      a.s,
    ]),
  ]
  if (sig) {
    fields.push(sig.yParity, sig.r, sig.s)
  }
  const rlpEncoded = toRlp(fields as Parameters<typeof toRlp>[0], 'bytes')
  const result = new Uint8Array(1 + rlpEncoded.length)
  result[0] = 0x04
  result.set(rlpEncoded, 1)
  return result
}

/** Hash an unsigned EIP-7702 type 0x04 transaction */
export function hashEip7702Tx(tx: Eip7702TxData): `0x${string}` {
  return keccak256(bytesToHex(serializeEip7702Fields(tx)))
}

/** Finalize EIP-7702 tx with a raw signature */
export function finalizeEip7702Tx(tx: Eip7702TxData, sig: { yParity: Hex; r: Hex; s: Hex }): `0x${string}` {
  return bytesToHex(serializeEip7702Fields(tx, sig))
}

// ─── SimpleDelegation ABI ────────────────────────────────────────────────────

const CALL_TUPLE = {
  type: 'tuple[]' as const,
  components: [
    { name: 'to', type: 'address' as const },
    { name: 'value', type: 'uint256' as const },
    { name: 'data', type: 'bytes' as const },
  ],
} as const

export const SIMPLE_DELEGATION_ABI = [
  {
    name: 'execute',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      CALL_TUPLE,
      { name: '_nonce', type: 'uint256' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    name: 'getDigest',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      CALL_TUPLE,
      { name: '_nonce', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    name: 'nonce',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Call7702 {
  to: `0x${string}`
  value: bigint
  data: `0x${string}`
}

export interface DelegateInfo {
  address: string
  isDelegated: boolean
  delegateContract: string | null
}

// ─── Delegate query ──────────────────────────────────────────────────────────

/** Check if an address has 7702 delegation set */
export async function getDelegate(address: `0x${string}`): Promise<DelegateInfo> {
  const client = getPublicClient()
  const code = await client.getCode({ address })

  if (!code || code === '0x') {
    return { address, isDelegated: false, delegateContract: null }
  }

  const lower = code.toLowerCase()
  if (lower.startsWith(DELEGATION_PREFIX)) {
    const delegateAddr = '0x' + lower.slice(DELEGATION_PREFIX.length, DELEGATION_PREFIX.length + 40)
    return { address, isDelegated: true, delegateContract: delegateAddr }
  }

  return { address, isDelegated: false, delegateContract: null }
}

// ─── Authorization signing ───────────────────────────────────────────────────

export interface SignedAuth {
  chainId: number
  contractAddress: string
  address: string // EOA
  nonce: number
  r: string
  s: string
  yParity: number
}

/** Sign an EIP-7702 authorization (does NOT send a tx) */
export async function signAuth(
  wallet: WalletData,
  delegate: string = DEFAULT_DELEGATE,
): Promise<SignedAuth> {
  const privateKey = decrypt(wallet.privateKey) as `0x${string}`
  const account = privateKeyToAccount(privateKey)
  const client = getPublicClient()

  const nonce = await client.getTransactionCount({ address: account.address })

  const auth = await account.signAuthorization({
    contractAddress: delegate as `0x${string}`,
    chainId: morphMainnet.id,
    nonce,
  })

  return {
    chainId: auth.chainId,
    contractAddress: auth.address,
    address: account.address,
    nonce: auth.nonce,
    r: auth.r,
    s: auth.s,
    yParity: auth.yParity ?? 0,
  }
}

// ─── Compute digest locally ──────────────────────────────────────────────────

/**
 * Compute the EIP-191 digest matching SimpleDelegation.getDigest()
 *
 * Solidity:
 *   dataHash = keccak256(abi.encode(calls, _nonce, block.chainid, address(this)))
 *   digest   = keccak256("\x19Ethereum Signed Message:\n32" || dataHash)
 *
 * We compute dataHash locally. The digest is then signed via account.signMessage
 * which prepends EIP-191 prefix automatically.
 */
function computeDataHash(
  calls: Call7702[],
  nonce: bigint,
  chainId: number,
  eoaAddress: `0x${string}`,
): `0x${string}` {
  // abi.encode(calls, _nonce, block.chainid, address(this))
  const encoded = encodeAbiParameters(
    [
      {
        type: 'tuple[]',
        components: [
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'data', type: 'bytes' },
        ],
      },
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'address' },
    ],
    [
      calls.map(c => ({ to: c.to, value: c.value, data: c.data })),
      nonce,
      BigInt(chainId),
      eoaAddress,
    ],
  )
  return keccak256(encoded)
}

// ─── Batch call ──────────────────────────────────────────────────────────────

export interface Batch7702Options {
  delegate?: string
  dryRun?: boolean
}

export interface Batch7702Result {
  hash?: string
  dryRun?: boolean
  from: string
  delegate: string
  callCount: number
  delegationNonce: string
  calls: Array<{ to: string; value: string; data: string }>
}

/**
 * Execute a batch of calls via EIP-7702 + SimpleDelegation
 *
 * Flow:
 * 1. Sign 7702 authorization → delegate EOA to SimpleDelegation
 * 2. Read delegation nonce from EOA (0 if first time)
 * 3. Compute dataHash locally → sign with signMessage (EIP-191)
 * 4. Encode execute(calls, nonce, signature) calldata
 * 5. Send type 0x04 tx: to=self, data=calldata, authorizationList=[auth]
 */
export async function batch7702(
  wallet: WalletData | SocialWalletConfig,
  calls: Call7702[],
  opts: Batch7702Options = {},
): Promise<Batch7702Result> {
  const delegate = opts.delegate ?? DEFAULT_DELEGATE
  const chain = morphMainnet
  const client = getPublicClient()

  const callsSummary = calls.map(c => ({
    to: c.to,
    value: c.value.toString(),
    data: c.data,
  }))

  // ── Social Login wallet path ──────────────────────────────────────────────
  if (isSocialWallet(wallet)) {
    const creds = decryptCredentials(wallet)
    const address = wallet.address as `0x${string}`

    const txNonce = await client.getTransactionCount({ address })

    // Step 1: Sign EIP-7702 authorization hash with EthSign
    // NOTE: Geth-based chains (including Morph) increment sender nonce BEFORE processing
    // the authorization list. For self-delegation (sender == authority), auth nonce must
    // be txNonce + 1 (the nonce after the tx's own nonce has been consumed).
    const authNonce = txNonce + 1
    const authHash = computeAuthorizationHash(chain.id, delegate as `0x${string}`, authNonce)
    const authSigRaw = await signTypedDataHash(creds, BGW_MORPH_CHAIN, authHash)
    const authSig = extractSigFields(authSigRaw as `0x${string}`)

    // Step 2: Read delegation nonce
    let delegationNonce = 0n
    try {
      delegationNonce = await client.readContract({
        address,
        abi: SIMPLE_DELEGATION_ABI,
        functionName: 'nonce',
      }) as bigint
    } catch { /* not delegated yet */ }

    // Step 3: Compute execute signature — must match SimpleDelegation.getDigest()
    // Solidity: digest = keccak256("\x19Ethereum Signed Message:\n32" || dataHash)
    const dataHash = computeDataHash(calls, delegationNonce, chain.id, address)
    const prefixBytes = new TextEncoder().encode('\x19Ethereum Signed Message:\n32')
    const dataHashBytes = hexToBytes(dataHash)
    const combined = new Uint8Array(prefixBytes.length + dataHashBytes.length)
    combined.set(prefixBytes)
    combined.set(dataHashBytes, prefixBytes.length)
    const digest = keccak256(bytesToHex(combined))
    const execSigRaw = await signTypedDataHash(creds, BGW_MORPH_CHAIN, digest)

    // Step 4: Encode execute calldata
    const executeData = encodeFunctionData({
      abi: SIMPLE_DELEGATION_ABI,
      functionName: 'execute',
      args: [
        calls.map(c => ({ to: c.to, value: c.value, data: c.data })),
        delegationNonce,
        execSigRaw as `0x${string}`,
      ],
    })

    if (opts.dryRun) {
      return { dryRun: true, from: address, delegate, callCount: calls.length, delegationNonce: delegationNonce.toString(), calls: callsSummary }
    }

    // Step 5: Estimate gas
    let gas: bigint
    try {
      const est = await client.estimateGas({ account: address, to: address, data: executeData })
      gas = est + 50000n
    } catch { gas = 200000n }

    // Step 6: Build + sign + send type 0x04 raw tx
    const gasPrice = await client.getGasPrice()
    const txData: Eip7702TxData = {
      chainId: chain.id, nonce: txNonce,
      maxPriorityFeePerGas: 0n, maxFeePerGas: gasPrice,
      gas, to: address, value: 0n, data: executeData,
      authorizationList: [{ chainId: chain.id, address: delegate as `0x${string}`, nonce: authNonce, ...authSig }],
    }
    const txHash = hashEip7702Tx(txData)
    const txSigRaw = await signTypedDataHash(creds, BGW_MORPH_CHAIN, txHash)
    const rawTx = finalizeEip7702Tx(txData, extractSigFields(txSigRaw as `0x${string}`))

    const hash = await client.request({
      method: 'eth_sendRawTransaction' as 'eth_sendRawTransaction',
      params: [rawTx],
    })
    return { hash: hash as string, from: address, delegate, callCount: calls.length, delegationNonce: delegationNonce.toString(), calls: callsSummary }
  }

  // ── Private-key wallet path ───────────────────────────────────────────────
  const privateKey = decrypt(wallet.privateKey) as `0x${string}`
  const account = privateKeyToAccount(privateKey)

  const callsSummaryPk = calls.map(c => ({
    to: c.to,
    value: c.value.toString(),
    data: c.data,
  }))

  const txNonce = await client.getTransactionCount({ address: account.address })
  // NOTE: Geth-based chains increment sender nonce before auth list processing.
  // For self-delegation, use txNonce + 1 as auth nonce.
  const auth = await account.signAuthorization({
    contractAddress: delegate as `0x${string}`,
    chainId: chain.id,
    nonce: txNonce + 1,
  })

  let delegationNonce = 0n
  try {
    const result = await client.readContract({
      address: account.address,
      abi: SIMPLE_DELEGATION_ABI,
      functionName: 'nonce',
    })
    delegationNonce = result as bigint
  } catch { /* Not delegated yet */ }

  const dataHash = computeDataHash(calls, delegationNonce, chain.id, account.address)
  const signature = await account.signMessage({ message: { raw: dataHash } })

  const executeData = encodeFunctionData({
    abi: SIMPLE_DELEGATION_ABI,
    functionName: 'execute',
    args: [
      calls.map(c => ({ to: c.to, value: c.value, data: c.data })),
      delegationNonce,
      signature as `0x${string}`,
    ],
  })

  if (opts.dryRun) {
    return {
      dryRun: true,
      from: account.address,
      delegate,
      callCount: calls.length,
      delegationNonce: delegationNonce.toString(),
      calls: callsSummaryPk,
    }
  }

  let gas: bigint
  try {
    const est = await client.estimateGas({ account: account.address, to: account.address, data: executeData })
    gas = est + 50000n
  } catch { gas = 200000n }

  const walletClient = createWalletClient({ account, chain, transport: http() })
  const hash = await walletClient.sendTransaction({
    to: account.address,
    data: executeData,
    gas,
    authorizationList: [auth],
  })

  return {
    hash,
    from: account.address,
    delegate,
    callCount: calls.length,
    delegationNonce: delegationNonce.toString(),
    calls: callsSummaryPk,
  }
}

// ─── Single call ─────────────────────────────────────────────────────────────

export interface Send7702Options extends Batch7702Options {
  to: `0x${string}`
  value?: bigint
  data?: `0x${string}`
}

/** Send a single call via 7702 (wraps batch7702 with one call) */
export async function send7702(
  wallet: WalletData | SocialWalletConfig,
  opts: Send7702Options,
): Promise<Batch7702Result> {
  const call: Call7702 = {
    to: opts.to,
    value: opts.value ?? 0n,
    data: opts.data ?? '0x',
  }
  return batch7702(wallet, [call], opts)
}

// ─── Revoke delegation ──────────────────────────────────────────────────────

export interface Revoke7702Result {
  hash?: string
  dryRun?: boolean
  from: string
  note: string
}

/** Revoke 7702 delegation by setting delegate to address(0) */
export async function revoke7702(
  wallet: WalletData | SocialWalletConfig,
  opts: { dryRun?: boolean } = {},
): Promise<Revoke7702Result> {
  const chain = morphMainnet
  const client = getPublicClient()
  const ZERO_ADDR = '0x0000000000000000000000000000000000000000' as `0x${string}`

  if (isSocialWallet(wallet)) {
    const creds = decryptCredentials(wallet)
    const address = wallet.address as `0x${string}`

    if (opts.dryRun) {
      return { dryRun: true, from: address, note: 'Will revoke delegation via SL wallet (EthSign)' }
    }

    const txNonce = await client.getTransactionCount({ address })
    const authNonce = txNonce + 1
    const authHash = computeAuthorizationHash(chain.id, ZERO_ADDR, authNonce)
    const authSigRaw = await signTypedDataHash(creds, BGW_MORPH_CHAIN, authHash)
    const authSig = extractSigFields(authSigRaw as `0x${string}`)

    const gasPrice = await client.getGasPrice()
    const txData: Eip7702TxData = {
      chainId: chain.id, nonce: txNonce,
      maxPriorityFeePerGas: 0n, maxFeePerGas: gasPrice,
      gas: 80000n, to: address, value: 0n, data: '0x',
      authorizationList: [{ chainId: chain.id, address: ZERO_ADDR, nonce: authNonce, ...authSig }],
    }
    const txHash = hashEip7702Tx(txData)
    const txSigRaw = await signTypedDataHash(creds, BGW_MORPH_CHAIN, txHash)
    const rawTx = finalizeEip7702Tx(txData, extractSigFields(txSigRaw as `0x${string}`))

    const hash = await client.request({
      method: 'eth_sendRawTransaction' as 'eth_sendRawTransaction',
      params: [rawTx],
    })
    return { hash: hash as string, from: address, note: 'Delegation revoked (delegate set to address(0))' }
  }

  const privateKey = decrypt(wallet.privateKey) as `0x${string}`
  const account = privateKeyToAccount(privateKey)

  if (opts.dryRun) {
    return { dryRun: true, from: account.address, note: 'Will sign authorization with delegate = address(0) to clear delegation code' }
  }

  const txNonce = await client.getTransactionCount({ address: account.address })
  const auth = await account.signAuthorization({ contractAddress: ZERO_ADDR, chainId: chain.id, nonce: txNonce + 1 })

  const walletClient = createWalletClient({ account, chain, transport: http() })
  const hash = await walletClient.sendTransaction({
    to: account.address, value: 0n, data: '0x', gas: 60000n, authorizationList: [auth],
  })

  return { hash, from: account.address, note: 'Delegation revoked (delegate set to address(0))' }
}
