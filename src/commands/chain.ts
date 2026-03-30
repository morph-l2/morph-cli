import { Command } from 'commander'
import { formatEther, formatUnits } from 'viem'
import { out } from '../lib/utils/output.js'
import { getPublicClient } from '../lib/utils/rpc.js'
import { MORPH_MAINNET, MORPH_TESTNET, ALT_FEE_TOKEN_REGISTRY, ALT_FEE_TOKENS } from '../lib/utils/config.js'
import { httpGet } from '../lib/utils/http.js'
import { getDelegate, batch7702, revoke7702, signAuth, DEFAULT_DELEGATE } from '../lib/chain/eip7702.js'
import { loadWallet, resolveWalletName } from '../lib/wallet/keystore.js'
import { resolveWallet } from '../lib/wallet/resolve.js'
import { sendTx, parseTxModeOptions, txModeLabel } from '../lib/utils/tx-sender.js'
import { parseEther } from 'viem'

// TokenRegistry raw function selectors (actual on-chain names differ from standard ABI)
const TR_GET_TOKEN_LIST  = '0x1585458c' // getSupportedTokenList()
const TR_GET_TOKEN_INFO  = '0x1c58e793' // getTokenInfo(uint16)
const TR_PRICE_RATIO     = '0x19904c33' // priceRatio(uint16)
const REGISTRY = ALT_FEE_TOKEN_REGISTRY as `0x${string}`

// ─── onchain rpc ──────────────────────────────────────────────────────────────

function rpcCommand(): Command {
  const cmd = new Command('rpc').description('Real-time RPC queries')

  cmd
    .command('balance')
    .description('Get native ETH balance')
    .requiredOption('-a, --address <address>', 'Wallet address')
    .option('--hoodi', 'Use Morph Hoodi testnet')
    .action(async (opts) => {
      try {
        const client = getPublicClient(opts.hoodi)
        const balance = await client.getBalance({ address: opts.address as `0x${string}` })
        out(true, { address: opts.address, ETH: formatEther(balance), wei: balance.toString() })
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  cmd
    .command('nonce')
    .description('Get transaction count (nonce) for an address')
    .requiredOption('-a, --address <address>', 'Wallet address')
    .option('--hoodi', 'Use Morph Hoodi testnet')
    .action(async (opts) => {
      try {
        const client = getPublicClient(opts.hoodi)
        const nonce = await client.getTransactionCount({ address: opts.address as `0x${string}` })
        out(true, { address: opts.address, nonce })
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  cmd
    .command('gas')
    .description('Get current gas price')
    .option('--hoodi', 'Use Morph Hoodi testnet')
    .action(async (opts) => {
      try {
        const client = getPublicClient(opts.hoodi)
        const gasPrice = await client.getGasPrice()
        out(true, {
          gasPrice: gasPrice.toString(),
          gasPriceGwei: (Number(gasPrice) / 1e9).toFixed(6),
        })
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  cmd
    .command('block')
    .description('Get block info (latest or by number)')
    .option('--number <n>', 'Block number (default: latest)')
    .option('--hoodi', 'Use Morph Hoodi testnet')
    .action(async (opts) => {
      try {
        const client = getPublicClient(opts.hoodi)
        const blockNumber = opts.number ? BigInt(opts.number) : undefined
        const block = await client.getBlock({ blockNumber })
        out(true, {
          number: block.number?.toString(),
          hash: block.hash,
          timestamp: block.timestamp.toString(),
          transactions: block.transactions.length,
          gasUsed: block.gasUsed.toString(),
          gasLimit: block.gasLimit.toString(),
          baseFeePerGas: block.baseFeePerGas?.toString() ?? null,
        })
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  cmd
    .command('call')
    .description('Execute a read-only contract call (eth_call)')
    .requiredOption('--to <address>', 'Contract address')
    .requiredOption('--data <hex>', 'Calldata hex')
    .option('--hoodi', 'Use Morph Hoodi testnet')
    .action(async (opts) => {
      try {
        const client = getPublicClient(opts.hoodi)
        const result = await client.call({
          to: opts.to as `0x${string}`,
          data: opts.data as `0x${string}`,
        })
        out(true, { to: opts.to, result: result.data ?? '0x' })
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  cmd
    .command('tx')
    .description('Get transaction details by hash')
    .requiredOption('--hash <hash>', 'Transaction hash')
    .option('--hoodi', 'Use Morph Hoodi testnet')
    .action(async (opts) => {
      try {
        const client = getPublicClient(opts.hoodi)
        const tx = await client.getTransaction({ hash: opts.hash as `0x${string}` })
        if (!tx) { out(false, { error: 'Transaction not found' }); process.exit(1) }
        out(true, {
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          value: formatEther(tx.value),
          nonce: tx.nonce,
          blockNumber: tx.blockNumber?.toString() ?? null,
          gasPrice: tx.gasPrice?.toString() ?? null,
        })
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  return cmd
}

// ─── onchain explorer ──────────────────────────────────────────────────────────

function explorerCommand(): Command {
  const cmd = new Command('explorer').description('Blockscout explorer queries')

  function apiBase(hoodi?: boolean): string {
    return hoodi ? MORPH_TESTNET.blockscoutApi : MORPH_MAINNET.blockscoutApi
  }

  cmd
    .command('address-info')
    .description('Address summary: balance, tx count, type')
    .requiredOption('-a, --address <address>', 'Wallet or contract address')
    .option('--hoodi', 'Use Morph Hoodi testnet')
    .action(async (opts) => {
      try {
        const data = await httpGet(`${apiBase(opts.hoodi)}/addresses/${opts.address}`)
        out(true, data)
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  cmd
    .command('txs')
    .description('Transaction history for an address')
    .requiredOption('-a, --address <address>', 'Wallet address')
    .option('--limit <n>', 'Max results', '20')
    .option('--hoodi', 'Use Morph Hoodi testnet')
    .action(async (opts) => {
      try {
        const data = await httpGet<{ items: unknown[] }>(`${apiBase(opts.hoodi)}/addresses/${opts.address}/transactions`)
        const items = Array.isArray(data?.items) ? data.items.slice(0, Number(opts.limit)) : data
        out(true, { address: opts.address, count: Array.isArray(items) ? items.length : 0, items })
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  cmd
    .command('tokens')
    .description('ERC-20 token holdings for an address')
    .requiredOption('-a, --address <address>', 'Wallet address')
    .option('--hoodi', 'Use Morph Hoodi testnet')
    .action(async (opts) => {
      try {
        const data = await httpGet(`${apiBase(opts.hoodi)}/addresses/${opts.address}/token-balances`)
        out(true, data)
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  cmd
    .command('tx')
    .description('Full transaction detail from explorer')
    .requiredOption('--hash <hash>', 'Transaction hash')
    .option('--hoodi', 'Use Morph Hoodi testnet')
    .action(async (opts) => {
      try {
        const data = await httpGet(`${apiBase(opts.hoodi)}/transactions/${opts.hash}`)
        out(true, data)
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  cmd
    .command('token-search')
    .description('Search tokens by name or symbol')
    .requiredOption('--query <q>', 'Search keyword')
    .option('--hoodi', 'Use Morph Hoodi testnet')
    .action(async (opts) => {
      try {
        const data = await httpGet(`${apiBase(opts.hoodi)}/tokens`, { q: opts.query })
        out(true, data)
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  cmd
    .command('token-info')
    .description('Token details: supply, holders, transfers, price')
    .requiredOption('--token <address>', 'Token contract address')
    .option('--hoodi', 'Use Morph Hoodi testnet')
    .action(async (opts) => {
      try {
        const base = apiBase(opts.hoodi)
        const [data, counters] = await Promise.all([
          httpGet<Record<string, unknown>>(`${base}/tokens/${opts.token}`),
          httpGet<Record<string, unknown>>(`${base}/tokens/${opts.token}/counters`),
        ])
        const decimals = Number(data['decimals'] ?? 18)
        const totalSupplyRaw = BigInt((data['total_supply'] as string) ?? '0')
        out(true, {
          address: data['address_hash'] ?? opts.token,
          name: data['name'],
          symbol: data['symbol'],
          decimals,
          totalSupply: formatUnits(totalSupplyRaw, decimals),
          holders: counters['token_holders_count'],
          transfers: counters['transfers_count'],
          exchangeRate: data['exchange_rate'],
          marketCap: data['circulating_market_cap'],
        })
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  cmd
    .command('contract')
    .description('Smart contract info: source, ABI, verification status')
    .requiredOption('-a, --address <address>', 'Contract address')
    .option('--hoodi', 'Use Morph Hoodi testnet')
    .action(async (opts) => {
      try {
        const data = await httpGet<Record<string, unknown>>(`${apiBase(opts.hoodi)}/smart-contracts/${opts.address}`)
        out(true, {
          address: opts.address,
          name: data['name'],
          isVerified: data['is_verified'],
          isProxy: data['proxy_type'] != null,
          proxyType: data['proxy_type'],
          implementations: data['implementations'],
          compilerVersion: data['compiler_version'],
          evmVersion: data['evm_version'],
          licenseType: data['license_type'],
          abi: data['abi'],
        })
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  return cmd
}

// ─── onchain altfee ────────────────────────────────────────────────────────────

function altfeeCommand(): Command {
  const cmd = new Command('altfee').description('Alt-fee gas payment with ERC-20 tokens (tx type 0x7f)')

  /** raw eth_call to TokenRegistry */
  async function registryCall(hoodi: boolean, data: string): Promise<string> {
    const client = getPublicClient(hoodi)
    const result = await client.call({ to: REGISTRY, data: data as `0x${string}` })
    return result.data ?? '0x'
  }

  /** Parse getTokenInfo + priceRatio results for a given token ID */
  async function getTokenFeeParams(hoodi: boolean, tokenId: number) {
    const idHex = tokenId.toString(16).padStart(64, '0')
    const [infoHex, ratioHex] = await Promise.all([
      registryCall(hoodi, TR_GET_TOKEN_INFO + idHex),
      registryCall(hoodi, TR_PRICE_RATIO + idHex),
    ])
    const raw = infoHex.slice(2) // strip 0x
    const tokenAddr = '0x' + raw.slice(24, 64)
    const isActive = parseInt(raw.slice(128, 192), 16) !== 0
    const decimals = parseInt(raw.slice(192, 256), 16)
    const scale = BigInt('0x' + raw.slice(256, 320))
    const feeRate = BigInt(ratioHex)
    return { tokenAddr, isActive, decimals, scale, feeRate }
  }

  cmd
    .command('tokens')
    .description('List supported fee tokens from TokenRegistry')
    .option('--hoodi', 'Use Morph Hoodi testnet')
    .action(async (opts) => {
      try {
        const hex = await registryCall(opts.hoodi, TR_GET_TOKEN_LIST)
        const raw = hex.slice(2)
        // ABI: offset(32) + count(32) + N * (uint16(32) + address(32))
        const offset = parseInt(raw.slice(0, 64), 16) * 2
        const count = parseInt(raw.slice(offset, offset + 64), 16)
        const tokens: Array<{ tokenId: number; address: string; symbol?: string; recommended?: boolean }> = []
        const dataStart = offset + 64
        for (let i = 0; i < count; i++) {
          const chunk = dataStart + i * 128
          const tokenId = parseInt(raw.slice(chunk, chunk + 64), 16)
          const address = '0x' + raw.slice(chunk + 64 + 24, chunk + 128)
          const known = ALT_FEE_TOKENS[tokenId]
          tokens.push({
            tokenId,
            address,
            ...(known ? { symbol: known.symbol, recommended: true } : {}),
          })
        }
        out(true, { tokens, tip: 'Recommended IDs: 4(BGB), 5(USDT), 6(USDC)' })
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  cmd
    .command('token-info')
    .description('Get fee token details from TokenRegistry')
    .requiredOption('--id <n>', 'Token ID (recommended: 4=BGB, 5=USDT, 6=USDC)')
    .option('--hoodi', 'Use Morph Hoodi testnet')
    .action(async (opts) => {
      try {
        const tokenId = Number(opts.id)
        const info = await getTokenFeeParams(opts.hoodi, tokenId)
        out(true, {
          tokenId,
          address: info.tokenAddr,
          isActive: info.isActive,
          decimals: info.decimals,
          scale: info.scale.toString(),
          feeRate: info.feeRate.toString(),
        })
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  cmd
    .command('estimate')
    .description('Estimate feeLimit for an alt-fee transaction')
    .requiredOption('--id <n>', 'Fee token ID (recommended: 4=BGB, 5=USDT, 6=USDC)')
    .option('--gas-limit <n>', 'Gas limit estimate', '21000')
    .option('--hoodi', 'Use Morph Hoodi testnet')
    .action(async (opts) => {
      try {
        const client = getPublicClient(opts.hoodi)
        const tokenId = Number(opts.id)
        const gasLimit = BigInt(opts.gasLimit)

        const [info, gasPrice] = await Promise.all([
          getTokenFeeParams(opts.hoodi, tokenId),
          client.getGasPrice(),
        ])

        const totalFeeWei = gasPrice * gasLimit
        const feeLimit = (totalFeeWei * info.scale + info.feeRate - 1n) / info.feeRate
        const feeLimitSafe = feeLimit * 110n / 100n

        out(true, {
          tokenId,
          gasLimit: gasLimit.toString(),
          gasPriceWei: gasPrice.toString(),
          scale: info.scale.toString(),
          feeRate: info.feeRate.toString(),
          feeLimitMin: feeLimit.toString(),
          feeLimitRecommended: feeLimitSafe.toString(),
          feeLimitHuman: formatUnits(feeLimitSafe, info.decimals),
          note: 'Recommended feeLimit includes 10% safety margin. Does not include L1 data fee.',
        })
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  cmd
    .command('send')
    .description('Send a transaction paying gas with ERC-20 fee token (tx type 0x7f). Broadcasts by default.')
    .option('-w, --wallet <name>', 'Private-key wallet name (default: default wallet)')
    .option('--sl <name>', 'Social Login wallet name')
    .requiredOption('--to <address>', 'Recipient address')
    .option('--value <eth>', 'ETH value to send', '0')
    .option('--data <hex>', 'Calldata hex')
    .requiredOption('--fee-token-id <id>', 'Fee token ID (4=BGB, 5=USDT, 6=USDC)')
    .option('--dry-run', 'Preview transaction without sending')
    .option('--hoodi', 'Use Morph Hoodi testnet')
    .action(async (opts) => {
      try {
        const { wallet, address } = resolveWallet(opts)
        const value = parseEther(opts.value ?? '0')
        const feeTokenId = Number(opts.feeTokenId)

        if (opts.dryRun) {
          out(true, {
            dryRun: true,
            type: '0x7f',
            from: address,
            to: opts.to,
            value: opts.value ?? '0',
            feeTokenId,
            note: 'Add --dry-run to preview without sending',
          })
          return
        }

        const result = await sendTx(wallet, {
          to: opts.to as `0x${string}`,
          value,
          data: opts.data ? (opts.data as `0x${string}`) : undefined,
        }, { hoodi: opts.hoodi, altfee: feeTokenId })
        out(true, { hash: result.hash, txType: result.txType, from: address, to: opts.to, feeTokenId })
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  return cmd
}

// ─── onchain 7702 ─────────────────────────────────────────────────────────────

function eip7702Command(): Command {
  const cmd = new Command('7702').description('EIP-7702 delegation + batch call (tx type 0x04)')

  cmd
    .command('delegate')
    .description('Check if an address has 7702 delegation set')
    .requiredOption('-a, --address <address>', 'Address to check')
    .option('--hoodi', 'Use Morph Hoodi testnet')
    .action(async (opts) => {
      try {
        const info = await getDelegate(opts.address as `0x${string}`, opts.hoodi)
        out(true, info)
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  cmd
    .command('authorize')
    .description('Sign an EIP-7702 authorization (no tx sent, PK wallet only)')
    .option('-w, --wallet <name>', 'Private-key wallet name')
    .option('--delegate <address>', 'Delegate contract address', DEFAULT_DELEGATE)
    .option('--hoodi', 'Use Morph Hoodi testnet')
    .action(async (opts) => {
      try {
        const name = resolveWalletName(opts.wallet)
        const w = loadWallet(name)
        if (!w) throw new Error(`Wallet "${name}" not found`)
        const auth = await signAuth(w, opts.delegate, opts.hoodi)
        out(true, auth)
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  cmd
    .command('send')
    .description('Send a single call via EIP-7702 delegation. Broadcasts by default.')
    .option('-w, --wallet <name>', 'Private-key wallet name')
    .option('--sl <name>', 'Social Login wallet name')
    .requiredOption('--to <address>', 'Target contract/address')
    .option('--value <eth>', 'ETH value', '0')
    .option('--data <hex>', 'Calldata hex', '0x')
    .option('--delegate <address>', 'Delegate contract', DEFAULT_DELEGATE)
    .option('--dry-run', 'Preview transaction without sending')
    .option('--hoodi', 'Use Morph Hoodi testnet')
    .action(async (opts) => {
      try {
        const { wallet } = resolveWallet(opts)
        const result = await batch7702(wallet, [{
          to: opts.to as `0x${string}`,
          value: BigInt(Math.round(parseFloat(opts.value) * 1e18)),
          data: (opts.data ?? '0x') as `0x${string}`,
        }], { delegate: opts.delegate, testnet: opts.hoodi, dryRun: opts.dryRun })
        out(true, result)
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  cmd
    .command('batch')
    .description('Atomic batch call via SimpleDelegation. Broadcasts by default.')
    .option('-w, --wallet <name>', 'Private-key wallet name')
    .option('--sl <name>', 'Social Login wallet name')
    .requiredOption('--calls <json>', 'JSON array of [{to, value, data}]')
    .option('--delegate <address>', 'Delegate contract', DEFAULT_DELEGATE)
    .option('--dry-run', 'Preview transaction without sending')
    .option('--hoodi', 'Use Morph Hoodi testnet')
    .action(async (opts) => {
      try {
        const { wallet } = resolveWallet(opts)
        const calls = JSON.parse(opts.calls).map((c: { to: string; value?: string; data?: string }) => ({
          to: c.to as `0x${string}`,
          value: BigInt(c.value ?? '0'),
          data: (c.data ?? '0x') as `0x${string}`,
        }))
        const result = await batch7702(wallet, calls, {
          delegate: opts.delegate, testnet: opts.hoodi, dryRun: opts.dryRun,
        })
        out(true, result)
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  cmd
    .command('revoke')
    .description('Revoke 7702 delegation. Broadcasts by default.')
    .option('-w, --wallet <name>', 'Private-key wallet name')
    .option('--sl <name>', 'Social Login wallet name')
    .option('--dry-run', 'Preview transaction without sending')
    .option('--hoodi', 'Use Morph Hoodi testnet')
    .action(async (opts) => {
      try {
        const { wallet } = resolveWallet(opts)
        const result = await revoke7702(wallet, { testnet: opts.hoodi, dryRun: opts.dryRun })
        out(true, result)
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  return cmd
}

// ─── export ──────────────────────────────────────────────────────────────────

export function chainCommand(): Command {
  const cmd = new Command('onchain').description('On-chain operations: RPC, Explorer, Alt-fee, EIP-7702 (L2)')
  cmd.addCommand(rpcCommand())
  cmd.addCommand(explorerCommand())
  cmd.addCommand(altfeeCommand())
  cmd.addCommand(eip7702Command())
  return cmd
}
