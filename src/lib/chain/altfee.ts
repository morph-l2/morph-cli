/**
 * Morph alt-fee transaction (type 0x7f) — serialization + signing
 *
 * RLP fields: [chainId, nonce, maxPriorityFeePerGas, maxFeePerGas,
 *              gas, to, value, data, accessList, feeTokenID, feeLimit,
 *              (yParity, r, s if signed)]
 */
import { keccak256, toRlp, bytesToHex, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

export const ALT_FEE_TX_TYPE = 0x7f

export interface AltFeeTx {
  chainId: number
  nonce: number
  maxPriorityFeePerGas: bigint
  maxFeePerGas: bigint
  gas: bigint
  to: `0x${string}`
  value: bigint
  data: `0x${string}`
  feeTokenId: number
  feeLimit: bigint
}

function intToHex(value: bigint): Hex {
  if (value === 0n) return '0x'
  const hex = value.toString(16)
  return `0x${hex.length % 2 === 0 ? hex : `0${hex}`}` as Hex
}

function serializeAltFeeTx(
  tx: AltFeeTx,
  sig?: { yParity: Hex; r: Hex; s: Hex },
): Uint8Array {
  const fields: unknown[] = [
    intToHex(BigInt(tx.chainId)),
    intToHex(BigInt(tx.nonce)),
    intToHex(tx.maxPriorityFeePerGas),
    intToHex(tx.maxFeePerGas),
    intToHex(tx.gas),
    tx.to,
    intToHex(tx.value),
    tx.data === '0x' ? '0x' : tx.data,
    [], // accessList (empty)
    intToHex(BigInt(tx.feeTokenId)),
    intToHex(tx.feeLimit),
  ]
  if (sig) {
    fields.push(sig.yParity)
    fields.push(sig.r)
    fields.push(sig.s)
  }
  const rlpEncoded = toRlp(fields as Parameters<typeof toRlp>[0], 'bytes')
  const result = new Uint8Array(1 + rlpEncoded.length)
  result[0] = ALT_FEE_TX_TYPE
  result.set(rlpEncoded, 1)
  return result
}

/** Compute the unsigned hash of an altfee tx (for external signing) */
export function hashAltFeeTx(tx: AltFeeTx): `0x${string}` {
  return keccak256(bytesToHex(serializeAltFeeTx(tx)))
}

/** Extract { yParity, r, s } from a raw 65-byte 0x-prefixed signature hex */
export function extractSigFields(rawSig65: `0x${string}`): { yParity: Hex; r: Hex; s: Hex } {
  const rHex = `0x${rawSig65.slice(2, 66)}` as Hex
  const sHex = `0x${rawSig65.slice(66, 130)}` as Hex
  const vByte = parseInt(rawSig65.slice(130, 132), 16)
  const yParity = intToHex(BigInt(vByte >= 27 ? vByte - 27 : vByte))
  return { yParity, r: rHex, s: sHex }
}

/** Finalize altfee tx from a raw 65-byte signature (SL wallet path) */
export function finalizeAltFeeTxWithSig(tx: AltFeeTx, rawSig65: `0x${string}`): `0x${string}` {
  const sig = extractSigFields(rawSig65)
  return bytesToHex(serializeAltFeeTx(tx, sig))
}

/** Sign a Morph alt-fee (0x7f) transaction, return raw hex */
export async function signAltFeeTx(tx: AltFeeTx, privateKey: `0x${string}`): Promise<`0x${string}`> {
  const account = privateKeyToAccount(privateKey)
  const hash = hashAltFeeTx(tx)
  const sig = await account.sign({ hash })
  return finalizeAltFeeTxWithSig(tx, sig as `0x${string}`)
}
