/**
 * Unified transaction sender — supports standard, alt-fee (0x7f), and EIP-7702 (0x04)
 *
 * Usage: all write commands call sendTx() instead of walletClient.sendTransaction() directly.
 * The caller passes --altfee <id> or --eip7702 flags to select tx mode.
 */
import type { Command } from 'commander'
import type { WalletData } from '../wallet/keystore.js'
import { decrypt } from '../wallet/keystore.js'
import { createSigner } from './signer.js'
import { getPublicClient } from './rpc.js'
import { signAltFeeTx, hashAltFeeTx, finalizeAltFeeTxWithSig } from '../chain/altfee.js'
import { send7702 } from '../chain/eip7702.js'
import { MORPH_MAINNET, MORPH_TESTNET } from './config.js'
import type { SocialWalletConfig } from '../wallet/social-login.js'
import { decryptCredentials, signTransaction as slSignTransaction, signTypedDataHash } from '../wallet/social-login.js'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TxParams {
  to: `0x${string}`
  data?: `0x${string}`
  value?: bigint
}

export interface TxOptions {
  hoodi?: boolean
  altfee?: number     // fee token ID → tx type 0x7f
  eip7702?: boolean   // → tx type 0x04 via SimpleDelegation
}

export interface TxResult {
  hash: string
  txType: string      // '0x02' | '0x7f' | '0x04'
}

// ─── Send ───────────────────────────────────────────────────────────────────

/**
 * Send a transaction using one of three modes:
 *
 * 1. Standard (EIP-1559, type 0x02) — default
 * 2. Alt-fee (type 0x7f) — pay gas with ERC-20 token
 * 3. EIP-7702 (type 0x04) — delegate authorization via SimpleDelegation
 */
export async function sendTx(
  wallet: WalletData | SocialWalletConfig,
  params: TxParams,
  options: TxOptions = {},
): Promise<TxResult> {
  // ── Social Login wallet → TEE signing ─────────────────────────────────
  if ('credentials' in wallet && (wallet as SocialWalletConfig).type === 'social-login') {
    return sendTxViaSocialLogin(wallet as SocialWalletConfig, params, options)
  }
  // ── Private-key wallet (existing logic) ───────────────────────────────
  const pkWallet = wallet as WalletData
  const to = params.to
  const data = params.data ?? ('0x' as `0x${string}`)
  const value = params.value ?? 0n

  // ── Alt-fee (tx type 0x7f) ──────────────────────────────────────────────
  if (options.altfee !== undefined) {
    const hoodi = options.hoodi ?? false
    const client = getPublicClient(hoodi)
    const chainId = hoodi ? MORPH_TESTNET.chainId : MORPH_MAINNET.chainId
    const privateKey = decrypt(pkWallet.privateKey) as `0x${string}`

    const [nonce, gasPrice] = await Promise.all([
      client.getTransactionCount({ address: pkWallet.address as `0x${string}` }),
      client.getGasPrice(),
    ])

    let gasLimit: bigint
    try {
      const est = await client.estimateGas({
        account: pkWallet.address as `0x${string}`,
        to, value, data,
      })
      gasLimit = est * 12n / 10n // +20% buffer
    } catch {
      gasLimit = 200000n
    }

    const rawTx = await signAltFeeTx({
      chainId, nonce,
      maxPriorityFeePerGas: 0n,
      maxFeePerGas: gasPrice,
      gas: gasLimit,
      to, value, data,
      feeTokenId: options.altfee,
      feeLimit: 0n, // auto (unused fee refunded)
    }, privateKey)

    const hash = await client.request({
      method: 'eth_sendRawTransaction' as 'eth_sendRawTransaction',
      params: [rawTx],
    })
    return { hash: hash as string, txType: '0x7f' }
  }

  // ── EIP-7702 (tx type 0x04) ─────────────────────────────────────────────
  if (options.eip7702) {
    const result = await send7702(pkWallet, {
      to, value, data,
      testnet: options.hoodi,
    })
    if (!result.hash) {
      throw new Error('EIP-7702 transaction failed: no hash returned')
    }
    return { hash: result.hash, txType: '0x04' }
  }

  // ── Standard (EIP-1559, type 0x02) ──────────────────────────────────────
  const walletClient = createSigner(pkWallet, options.hoodi)
  const hash = await walletClient.sendTransaction({ to, data, value })
  return { hash, txType: '0x02' }
}

// ─── Social Login Send ──────────────────────────────────────────────────────

import { formatGwei, formatEther } from 'viem'

async function sendTxViaSocialLogin(
  wallet: SocialWalletConfig,
  params: TxParams,
  options: TxOptions = {},
): Promise<TxResult> {
  // ── EIP-7702 → delegate to send7702 (which calls batch7702 SL path) ──
  if (options.eip7702) {
    const result = await send7702(wallet, {
      to: params.to,
      value: params.value,
      data: params.data,
      testnet: options.hoodi,
    })
    if (!result.hash) throw new Error('EIP-7702 SL transaction failed: no hash returned')
    return { hash: result.hash, txType: '0x04' }
  }

  const creds = decryptCredentials(wallet)
  const hoodi = options.hoodi ?? false
  const client = getPublicClient(hoodi)
  const chainId = hoodi ? MORPH_TESTNET.chainId : MORPH_MAINNET.chainId
  const address = wallet.address as `0x${string}`

  const [nonce, gasPrice] = await Promise.all([
    client.getTransactionCount({ address }),
    client.getGasPrice(),
  ])

  const to = params.to
  const data = params.data ?? ('0x' as `0x${string}`)
  const value = params.value ?? 0n

  let gasLimit: bigint
  try {
    const est = await client.estimateGas({ account: address, to, value, data })
    gasLimit = est * 12n / 10n
  } catch {
    gasLimit = 200000n
  }

  // ── Alt-fee (0x7f) → compute hash locally, sign with EthSign ──────────
  if (options.altfee !== undefined) {
    const altTx = {
      chainId, nonce,
      maxPriorityFeePerGas: 0n,
      maxFeePerGas: gasPrice,
      gas: gasLimit,
      to, value, data,
      feeTokenId: options.altfee,
      feeLimit: 0n,
    }
    const txHash = hashAltFeeTx(altTx)
    const sigRaw = await signTypedDataHash(creds, 'evm_custom#morph', txHash)
    const rawTx = finalizeAltFeeTxWithSig(altTx, sigRaw as `0x${string}`)

    const hash = await client.request({
      method: 'eth_sendRawTransaction' as 'eth_sendRawTransaction',
      params: [rawTx],
    })
    return { hash: hash as string, txType: '0x7f' }
  }

  // ── Standard (legacy) → BGW sign_transaction ──────────────────────────
  const gasPriceEth = formatGwei(gasPrice)
  const gasPriceEthStr = (Number(gasPriceEth) / 1e9).toFixed(18).replace(/0+$/, '').replace(/\.$/, '.0')

  const signedTx = await slSignTransaction(creds, {
    chain: `evm_custom#morph`,
    chainId,
    to: params.to,
    value: Number(formatEther(params.value ?? 0n)),
    data: params.data ?? '0x',
    nonce,
    gasLimit: String(gasLimit),
    gasPrice: gasPriceEthStr,
  })

  const hash = await client.request({
    method: 'eth_sendRawTransaction' as 'eth_sendRawTransaction',
    params: [signedTx as `0x${string}`],
  })

  return { hash: hash as string, txType: 'social-login' }
}

// ─── CLI helpers ────────────────────────────────────────────────────────────

/** Add --altfee and --eip7702 options to a commander command */
export function addTxModeOptions(cmd: Command): Command {
  return cmd
    .option('--altfee <id>', 'Pay gas with ERC-20 fee token (tx type 0x7f, e.g. 5 for USDT)')
    .option('--eip7702', 'Send via EIP-7702 delegation (tx type 0x04)')
}

/** Extract TxOptions from parsed commander opts */
export function parseTxModeOptions(opts: Record<string, unknown>): TxOptions {
  return {
    hoodi: opts.hoodi as boolean | undefined,
    altfee: opts.altfee ? Number(opts.altfee) : undefined,
    eip7702: opts.eip7702 as boolean | undefined,
  }
}

/** Label for dry-run output */
export function txModeLabel(opts: TxOptions): string {
  if (opts.altfee !== undefined) return `altfee (token ID ${opts.altfee}, tx type 0x7f)`
  if (opts.eip7702) return 'EIP-7702 (tx type 0x04)'
  return 'standard (EIP-1559)'
}
