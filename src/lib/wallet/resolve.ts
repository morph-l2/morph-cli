import { out, assertExclusiveWallet } from '../utils/output.js'
import { loadWallet, resolveWalletName, type WalletData } from './keystore.js'
import { loadSocialWallet, type SocialWalletConfig } from './social-login.js'

/** Type guard: check if wallet is a Social Login wallet */
export function isSocialWallet(w: WalletData | SocialWalletConfig): w is SocialWalletConfig {
  return 'credentials' in w && (w as SocialWalletConfig).type === 'social-login'
}

/** Resolve wallet from -w / --sl opts. Calls assertExclusiveWallet, exits on error. */
export function resolveWallet(
  opts: { wallet?: string; sl?: string },
): { wallet: WalletData | SocialWalletConfig; name: string; address: string; type: 'private-key' | 'social-login' } {
  assertExclusiveWallet(opts)
  if (opts.sl) {
    const slWallet = loadSocialWallet(opts.sl)
    if (!slWallet) { out(false, { error: `Social Login wallet "${opts.sl}" not found` }); process.exit(1) }
    return { wallet: slWallet, name: opts.sl, address: slWallet.address ?? '', type: 'social-login' }
  }
  const walletName = resolveWalletName(opts.wallet)
  const wallet = loadWallet(walletName)
  if (!wallet) { out(false, { error: `Wallet "${walletName}" not found` }); process.exit(1) }
  return { wallet, name: walletName, address: wallet.address, type: 'private-key' }
}
