import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { decrypt, type WalletData } from '../wallet/keystore.js'
import { morphMainnet } from './rpc.js'

/** Build a walletClient from an encrypted wallet entry */
export function createSigner(wallet: WalletData) {
  const privateKey = decrypt(wallet.privateKey) as `0x${string}`
  const account = privateKeyToAccount(privateKey)
  return createWalletClient({ account, chain: morphMainnet, transport: http() })
}
