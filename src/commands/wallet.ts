import { Command } from 'commander'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { readFileSync, existsSync } from 'fs'
import {
  encrypt,
  saveWallet,
  loadWallet,
  listWallets,
  removeWallet,
  getDefaultWalletName,
  setDefaultWalletName,
  resolveWalletName,
} from '../lib/wallet/keystore.js'
import { resolveWallet } from '../lib/wallet/resolve.js'
import { getPublicClient } from '../lib/utils/rpc.js'
import { formatEther, formatUnits, parseEther, parseUnits } from 'viem'
import { MORPH_TOKENS } from '../lib/utils/config.js'
import { ERC20_ABI } from '../contracts/erc20.js'
import { resolveToken } from '../lib/utils/token.js'
import { out, assertExclusiveWallet } from '../lib/utils/output.js'
import { createSigner } from '../lib/utils/signer.js'
import { sendTx, addTxModeOptions, parseTxModeOptions, txModeLabel } from '../lib/utils/tx-sender.js'
import {
  saveSocialWallet,
  loadSocialWallet,
  listSocialWallets,
  removeSocialWallet,
  decryptCredentials,
  getProfile,
  getAddress,
} from '../lib/wallet/social-login.js'


export function walletCommand(): Command {
  const cmd = new Command('wallet').description('Wallet management (L1)')

  // create
  cmd
    .command('create')
    .description('Create a new wallet with AES-256-GCM encrypted storage')
    .option('-n, --name <name>', 'Wallet name', 'main')
    .action((opts) => {
      if (loadWallet(opts.name)) {
        out(false, { error: `Wallet "${opts.name}" already exists` })
        process.exit(1)
      }
      const privateKey = generatePrivateKey()
      const account = privateKeyToAccount(privateKey)
      saveWallet({
        name: opts.name,
        address: account.address,
        privateKey: encrypt(privateKey),
        createdAt: new Date().toISOString(),
      })
      // First wallet created becomes the default
      const isDefault = !getDefaultWalletName()
      if (isDefault) {
        setDefaultWalletName(opts.name)
      }
      out(true, { name: opts.name, address: account.address, isDefault })
    })

  // wallet import — supports -k direct key or -f file
  cmd
    .command('import')
    .description('Import wallet from a private key (--private-key) or file (--private-key-file)')
    .option('-n, --name <name>', 'Wallet name', 'main')
    .option('-k, --private-key <key>', 'Private key (0x...)')
    .option('-f, --private-key-file <path>', 'Path to file containing private key')
    .action((opts) => {
      let privateKey: `0x${string}`
      if (opts.privateKey) {
        privateKey = opts.privateKey.startsWith('0x')
          ? (opts.privateKey as `0x${string}`)
          : (`0x${opts.privateKey}` as `0x${string}`)
      } else if (opts.privateKeyFile) {
        if (!existsSync(opts.privateKeyFile)) {
          out(false, { error: `File not found: ${opts.privateKeyFile}` })
          process.exit(1)
        }
        const raw = readFileSync(opts.privateKeyFile, 'utf8').trim()
        privateKey = raw.startsWith('0x') ? (raw as `0x${string}`) : (`0x${raw}` as `0x${string}`)
      } else {
        out(false, { error: 'Provide --private-key <key> or --private-key-file <path>' })
        process.exit(1)
      }
      const account = privateKeyToAccount(privateKey)
      saveWallet({
        name: opts.name,
        address: account.address,
        privateKey: encrypt(privateKey),
        createdAt: new Date().toISOString(),
      })
      const isDefault = !getDefaultWalletName()
      if (isDefault) {
        setDefaultWalletName(opts.name)
      }
      out(true, { name: opts.name, address: account.address, isDefault })
    })

  // wallet list
  cmd
    .command('list')
    .description('List all wallets')
    .action(() => {
      const wallets = listWallets()
      const defaultName = getDefaultWalletName()
      out(true, wallets.map(w => ({
        name: w.name,
        address: w.address,
        createdAt: w.createdAt,
        ...(w.name === defaultName ? { isDefault: true } : {}),
      })))
    })

  // wallet default — view or set default wallet
  cmd
    .command('default')
    .description('View or set the default wallet')
    .option('--set <name>', 'Set a wallet as default')
    .action((opts) => {
      if (opts.set) {
        const wallet = loadWallet(opts.set)
        if (!wallet) {
          out(false, { error: `Wallet "${opts.set}" not found` })
          process.exit(1)
        }
        setDefaultWalletName(opts.set)
        out(true, { defaultWallet: opts.set, address: wallet.address })
      } else {
        const name = getDefaultWalletName()
        if (!name) {
          out(false, { error: 'No default wallet set. Run "wallet create" first.' })
          process.exit(1)
        }
        const wallet = loadWallet(name)
        out(true, {
          defaultWallet: name,
          address: wallet?.address || 'unknown',
        })
      }
    })

  // wallet address
  cmd
    .command('address')
    .description('Get wallet address')
    .option('-n, --name <name>', 'Wallet name (default: default wallet)')
    .action((opts) => {
      const walletName = resolveWalletName(opts.name)
      const wallet = loadWallet(walletName)
      if (!wallet) {
        out(false, { error: `Wallet "${walletName}" not found. Run 'wallet create' first.` })
        process.exit(1)
      }
      out(true, { name: wallet.name, address: wallet.address })
    })

  // wallet remove
  cmd
    .command('remove')
    .description('Remove a wallet')
    .option('-n, --name <name>', 'Wallet name (default: default wallet)')
    .action((opts) => {
      const walletName = resolveWalletName(opts.name)
      const ok = removeWallet(walletName)
      if (!ok) {
        out(false, { error: `Wallet "${walletName}" not found` })
        process.exit(1)
      }
      out(true, { removed: walletName })
    })

  // wallet balance — ETH + tokens, supports --sl for social login wallet, --address for arbitrary queries
  cmd
    .command('balance')
    .description('Get balances. Default: ETH + USDC + BGB + USDT. Use --token for specific token.')
    .option('-w, --wallet <name>', 'Private-key wallet name (default: default wallet)')
    .option('--sl <name>', 'Social Login wallet name')
    .option('--address <address>', 'Query any address directly (no wallet needed)')
    .option('--token <symbol_or_address>', 'Specific token symbol or contract address')
    .option('--hoodi', 'Use Morph Hoodi testnet')
    .action(async (opts) => {
      try {
      assertExclusiveWallet(opts)
      let address: `0x${string}`
      let label: string
      let walletType: string | undefined

      if (opts.address) {
        address = opts.address as `0x${string}`
        label = address
      } else if (opts.sl) {
        // Social Login wallet
        const slWallet = loadSocialWallet(opts.sl)
        if (!slWallet) {
          out(false, { error: `Social Login wallet "${opts.sl}" not found` })
          process.exit(1)
        }
        address = (slWallet.address ?? '') as `0x${string}`
        if (!address) {
          out(false, { error: `Social Login wallet "${opts.sl}" has no cached address. Re-bind with "wallet sl".` })
          process.exit(1)
        }
        label = opts.sl
        walletType = 'social-login'
      } else {
        // Private-key wallet
        const walletName = resolveWalletName(opts.wallet)
        const wallet = loadWallet(walletName)
        if (!wallet) {
          out(false, { error: `Wallet "${walletName}" not found` })
          process.exit(1)
        }
        address = wallet.address as `0x${string}`
        label = walletName
        walletType = 'private-key'
      }

      const client = getPublicClient(opts.hoodi)

      // query single token (or ETH)
      if (opts.token) {
        let token: Awaited<ReturnType<typeof resolveToken>>
        try { token = await resolveToken(opts.token, opts.hoodi) } catch (e: unknown) {
          out(false, { error: (e as Error).message }); process.exit(1)
        }
        if (token === null) {
          // Native ETH
          const ethBal = await client.getBalance({ address })
          out(true, {
            name: label,
            ...(walletType ? { type: walletType } : {}),
            address,
            token: 'ETH',
            balance: formatEther(ethBal),
          })
        } else {
          const raw = await client.readContract({
            address: token.address,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [address],
          })
          out(true, {
            name: label,
            ...(walletType ? { type: walletType } : {}),
            address,
            token: token.symbol,
            contractAddress: token.address,
            balance: formatUnits(raw as bigint, token.decimals),
          })
        }
        return
      }

      // default: ETH + USDC + BGB + USDT
      const ethBalance = await client.getBalance({ address })
      const defaultTokens = ['USDC', 'BGB', 'USDT'] as const
      const tokenBalances = await Promise.all(
        defaultTokens.map(async (sym) => {
          const t = MORPH_TOKENS[sym]
          const raw = await client.readContract({
            address: t.address,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [address],
          })
          return { token: sym, balance: formatUnits(raw as bigint, t.decimals) }
        })
      )

      out(true, {
        name: label,
        ...(walletType ? { type: walletType } : {}),
        address,
        ETH: formatEther(ethBalance),
        ...Object.fromEntries(tokenBalances.map(t => [t.token, t.balance])),
      })
      } catch (e: unknown) {
        out(false, { error: (e as Error).message })
        process.exit(1)
      }
    })

  // wallet transfer — ETH or token, dry-run by default
  {
    const transferCmd = cmd
      .command('transfer')
      .description('Transfer ETH or token. Add --dry-run to preview.')
      .option('-w, --wallet <name>', 'Private-key wallet name (default: default wallet)')
      .option('--sl <slName>', 'Social Login wallet name')
      .requiredOption('--to <address>', 'Recipient address')
      .requiredOption('--amount <value>', 'Amount (human readable, e.g. 0.1 ETH or 10 BGB)')
      .option('--token <symbol_or_address>', 'Token symbol or contract address. Omit to send ETH.')
      .option('--dry-run', 'Preview transaction without sending')
      .option('--hoodi', 'Use Morph Hoodi testnet')
    addTxModeOptions(transferCmd)
    transferCmd.action(async (opts) => {
      const { wallet, address: walletAddress, type: walletType } = resolveWallet(opts)
      // Resolve token: null = ETH, object = ERC-20
      let tokenInfo: Awaited<ReturnType<typeof resolveToken>> = null
      if (opts.token) {
        try { tokenInfo = await resolveToken(opts.token, opts.hoodi) } catch (e: unknown) {
          out(false, { error: (e as Error).message }); process.exit(1)
        }
      }
      const isETH = tokenInfo === null
      const txMode = parseTxModeOptions(opts)

      // dry-run preview
      if (opts.dryRun) {
        out(true, {
          dryRun: true,
          from: walletAddress,
          to: opts.to,
          amount: opts.amount,
          token: isETH ? 'ETH' : tokenInfo!.symbol,
          walletType,
          txMode: txModeLabel(txMode),
          note: 'Add --dry-run to preview without sending',
        })
        return
      }

      if (isETH) {
        const result = await sendTx(wallet, {
          to: opts.to as `0x${string}`,
          value: parseEther(opts.amount),
        }, txMode)
        out(true, { hash: result.hash, txType: result.txType, from: walletAddress, to: opts.to, amount: opts.amount, token: 'ETH' })
        return
      }

      // ERC-20 token transfer
      const token = tokenInfo!
      const amount = parseUnits(opts.amount, token.decimals)
      const { encodeFunctionData } = await import('viem')
      const data = encodeFunctionData({ abi: ERC20_ABI, functionName: 'transfer', args: [opts.to as `0x${string}`, amount] })
      const result = await sendTx(wallet, { to: token.address, data }, txMode)
      out(true, {
        hash: result.hash,
        txType: result.txType,
        from: walletAddress,
        to: opts.to,
        amount: opts.amount,
        token: token.symbol,
        contractAddress: token.address,
      })
    })
  }

  // ─── Social Login Wallet Commands ──────────────────────────────────────────

  // wallet sl — bind a Social Login wallet
  cmd
    .command('sl')
    .description('Bind a Bitget Social Login wallet (TEE-hosted, no local private key)')
    .requiredOption('-n, --name <name>', 'Wallet name')
    .requiredOption('--appid <appid>', 'Social Login appid')
    .requiredOption('--appsecret <secret>', 'Social Login appsecret (hex)')
    .action(async (opts) => {
      // Check name conflict with private-key wallets
      if (loadWallet(opts.name)) {
        out(false, { error: `Private-key wallet "${opts.name}" already exists. Choose a different name.` })
        process.exit(1)
      }
      if (loadSocialWallet(opts.name)) {
        out(false, { error: `Social Login wallet "${opts.name}" already exists` })
        process.exit(1)
      }

      const creds = { appid: opts.appid, appsecret: opts.appsecret }

      // Verify credentials by calling profile
      let walletId = ''
      try {
        const profile = await getProfile(creds)
        walletId = profile.walletId
      } catch (e: unknown) {
        out(false, { error: `Failed to verify credentials: ${(e as Error).message}` })
        process.exit(1)
      }

      // Get EVM address
      let address = ''
      try {
        address = await getAddress(creds)
      } catch (e: unknown) {
        out(false, { error: `Failed to get address: ${(e as Error).message}` })
        process.exit(1)
      }

      // Encrypt and save
      const credentialsJson = JSON.stringify(creds)
      saveSocialWallet({
        name: opts.name,
        type: 'social-login',
        credentials: encrypt(credentialsJson),
        address,
        walletId,
        createdAt: new Date().toISOString(),
      })

      out(true, { name: opts.name, type: 'social-login', address, walletId })
    })

  // wallet sl-list — list all social login wallets
  cmd
    .command('sl-list')
    .description('List all Social Login wallets')
    .action(() => {
      const wallets = listSocialWallets()
      if (wallets.length === 0) {
        out(true, [])
        return
      }
      out(true, wallets.map(w => ({
        name: w.name,
        type: 'social-login',
        address: w.address || '(unknown)',
        walletId: w.walletId || '',
        createdAt: w.createdAt,
      })))
    })

  // wallet sl-remove — remove a social login wallet
  cmd
    .command('sl-remove')
    .description('Remove a Social Login wallet')
    .requiredOption('-n, --name <name>', 'Wallet name')
    .action((opts) => {
      const ok = removeSocialWallet(opts.name)
      if (!ok) {
        out(false, { error: `Social Login wallet "${opts.name}" not found` })
        process.exit(1)
      }
      out(true, { removed: opts.name, type: 'social-login' })
    })

  return cmd
}
