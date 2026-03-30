import { Command } from 'commander'
import { parseEther, parseUnits, formatUnits } from 'viem'
import { out } from '../lib/utils/output.js'
import { getPublicClient } from '../lib/utils/rpc.js'
import { resolveWallet } from '../lib/wallet/resolve.js'
import { sendTx, addTxModeOptions, parseTxModeOptions, txModeLabel } from '../lib/utils/tx-sender.js'
import { tokenForDex, resolveErc20, getSwapQuote, getDefaultSpender, ERC20_ABI } from '../lib/eco/swap.js'
import {
  bridgeGet,
  bridgePost,
  bridgePostAuth,
  bridgeLogin,
  bridgeSwap,
  resolveBridgeToken,
} from '../lib/eco/bridge.js'

function swapCommand(): Command {
  const cmd = new Command('swap').description('DEX swap via Bulbaswap aggregator')

  cmd
    .command('quote')
    .description('Get swap quote. With --recipient, returns calldata for execution.')
    .requiredOption('--amount <value>', 'Amount to swap (human-readable, e.g. 0.001 for ETH)')
    .requiredOption('--from <token>', 'Source token symbol or address (ETH for native)')
    .requiredOption('--to <token>', 'Destination token symbol or address')
    .option('--slippage <pct>', 'Slippage tolerance % (default: 1)', '1')
    .option('--deadline <s>', 'Quote validity in seconds (default: 300)', '300')
    .option('--recipient <address>', 'Recipient address (required for calldata)')
    .option('--hoodi', 'Use Morph Hoodi testnet')
    .action(async (opts) => {
      try {
        const data = await getSwapQuote({
          tokenIn: tokenForDex(opts.from),
          tokenOut: tokenForDex(opts.to),
          amount: opts.amount,
          slippage: opts.slippage,
          deadline: opts.deadline,
          recipient: opts.recipient,
          hoodi: opts.hoodi,
        })
        out(true, data)
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  {
    const sendCmd = cmd
      .command('send')
      .description('Execute a swap using calldata from "swap quote". Broadcasts by default.')
      .option('-w, --wallet <name>', 'Sender wallet name (default: default wallet)')
      .option('--sl <name>', 'Social Login wallet name')
      .requiredOption('--to <address>', 'Router address (from methodParameters.to)')
      .option('--value <eth>', 'ETH value in ETH (from methodParameters.value, default: 0)', '0')
      .requiredOption('--data <hex>', 'Calldata hex (from methodParameters.calldata)')
      .option('--dry-run', 'Preview transaction without sending')
      .option('--hoodi', 'Use Morph Hoodi testnet')
    addTxModeOptions(sendCmd)
    sendCmd.action(async (opts) => {
      try {
        const { wallet } = resolveWallet(opts)
        const value = parseEther(opts.value ?? '0')
        const txMode = parseTxModeOptions(opts)

        if (opts.dryRun) {
          out(true, {
            dryRun: true,
            from: wallet.address,
            to: opts.to,
            value: opts.value ?? '0',
            dataLength: (opts.data as string).length,
            txMode: txModeLabel(txMode),
            note: 'Add --dry-run to preview without sending',
          })
          return
        }

        const result = await sendTx(wallet, {
          to: opts.to as `0x${string}`,
          value,
          data: opts.data as `0x${string}`,
        }, txMode)
        out(true, { hash: result.hash, txType: result.txType, from: wallet.address, to: opts.to, value: opts.value ?? '0' })
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })
  }

  {
    const approveCmd = cmd
      .command('approve')
      .description('Approve router to spend ERC-20 token before swapping. Broadcasts by default.')
      .option('-w, --wallet <name>', 'Wallet name (default: default wallet)')
      .option('--sl <name>', 'Social Login wallet name')
      .requiredOption('--token <symbol_or_address>', 'Token to approve (e.g. USDC)')
      .option('--spender <address>', 'Router/spender address (default: Bulbaswap universalRouter)')
      .requiredOption('--amount <value>', 'Allowance amount (human-readable, or "max")')
      .option('--dry-run', 'Preview transaction without sending')
      .option('--hoodi', 'Use Morph Hoodi testnet')
    addTxModeOptions(approveCmd)
    approveCmd.action(async (opts) => {
      try {
        const { wallet } = resolveWallet(opts)

        const token = await resolveErc20(opts.token, opts.hoodi)
        if (!token) { out(false, { error: 'ETH cannot be approved' }); process.exit(1) }
        const spender = (opts.spender ?? getDefaultSpender(opts.hoodi)) as `0x${string}`
        const amount = opts.amount === 'max'
          ? BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
          : parseUnits(opts.amount, token.decimals)
        const txMode = parseTxModeOptions(opts)

        if (opts.dryRun) {
          out(true, {
            dryRun: true,
            from: wallet.address,
            token: token.symbol,
            tokenAddress: token.address,
            spender,
            amount: opts.amount === 'max' ? 'max' : formatUnits(amount, token.decimals),
            txMode: txModeLabel(txMode),
            note: 'Add --dry-run to preview without sending',
          })
          return
        }

        const { encodeFunctionData } = await import('viem')
        const data = encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [spender, amount] })
        const result = await sendTx(wallet, { to: token.address, data }, txMode)
        out(true, {
          hash: result.hash,
          txType: result.txType,
          from: wallet.address,
          token: token.symbol,
          tokenAddress: token.address,
          spender,
          amount: opts.amount === 'max' ? 'max' : formatUnits(amount, token.decimals),
        })
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })
  }

  cmd
    .command('allowance')
    .description('Check current ERC-20 allowance for a spender')
    .option('-w, --wallet <name>', 'Wallet name (owner) (default: default wallet)')
    .option('--sl <name>', 'Social Login wallet name')
    .requiredOption('--token <symbol_or_address>', 'Token symbol or address')
    .option('--spender <address>', 'Spender address (default: Bulbaswap universalRouter)')
    .option('--hoodi', 'Use Morph Hoodi testnet')
    .action(async (opts) => {
      try {
        const { wallet } = resolveWallet(opts)

        const token = await resolveErc20(opts.token, opts.hoodi)
        if (!token) { out(false, { error: 'ETH has no allowance' }); process.exit(1) }
        const spender = (opts.spender ?? getDefaultSpender(opts.hoodi)) as `0x${string}`
        const client = getPublicClient(opts.hoodi)

        const allowance = await client.readContract({
          address: token.address,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [wallet.address as `0x${string}`, spender],
        }) as bigint

        out(true, {
          owner: wallet.address,
          token: token.symbol,
          tokenAddress: token.address,
          spender,
          allowance: formatUnits(allowance, token.decimals),
          allowanceRaw: allowance.toString(),
        })
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  return cmd
}

function bridgeCommand(): Command {
  const cmd = new Command('bridge').description('Cross-chain swap via Bulbaswap bridge (6 chains)')

  cmd
    .command('chains')
    .description('List supported chains for cross-chain swap')
    .action(async () => {
      try {
        const data = await bridgeGet('/v2/order/chainList')
        out(true, data)
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  cmd
    .command('tokens')
    .description('List available tokens for cross-chain swap')
    .option('--chain <chain>', 'Filter by chain (morph/eth/base/bnb/arbitrum/matic)')
    .action(async (opts) => {
      try {
        const body: Record<string, string> = {}
        if (opts.chain) body['chain'] = opts.chain
        const data = await bridgePost('/v2/order/tokenList', body)
        out(true, data)
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  cmd
    .command('token-search')
    .description('Search tokens by symbol or address across chains')
    .requiredOption('--keyword <kw>', 'Search keyword (symbol or address)')
    .option('--chain <chain>', 'Filter by chain')
    .action(async (opts) => {
      try {
        const body: Record<string, string> = { keyword: opts.keyword }
        if (opts.chain) body['chain'] = opts.chain
        const data = await bridgePost('/v2/order/tokenSearch', body)
        out(true, data)
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  cmd
    .command('quote')
    .description('Get cross-chain swap quote')
    .requiredOption('--from-chain <chain>', 'Source chain (morph/eth/base/bnb/arbitrum/matic)')
    .requiredOption('--from-token <token>', 'Source token symbol or address')
    .requiredOption('--amount <amount>', 'Amount to swap (human-readable, e.g. 0.01)')
    .requiredOption('--to-chain <chain>', 'Destination chain')
    .requiredOption('--to-token <token>', 'Destination token symbol or address')
    .requiredOption('--from-address <address>', 'Sender address')
    .action(async (opts) => {
      try {
        const fromContract = resolveBridgeToken(opts.fromToken, opts.fromChain)
        const toContract = resolveBridgeToken(opts.toToken, opts.toChain)
        const body = {
          fromChain: opts.fromChain,
          fromContract,
          fromAmount: opts.amount,
          toChain: opts.toChain,
          toContract,
          fromAddress: opts.fromAddress,
        }
        const data = await bridgePost('/v2/order/getSwapPrice', body)
        out(true, data)
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  cmd
    .command('balance')
    .description('Query token balance and USD price via bridge API')
    .requiredOption('--chain <chain>', 'Chain (morph/eth/base/bnb/arbitrum/matic)')
    .requiredOption('--token <token>', 'Token symbol or address')
    .requiredOption('--address <address>', 'Wallet address')
    .action(async (opts) => {
      try {
        const tokenAddress = resolveBridgeToken(opts.token, opts.chain)
        const body = {
          list: [{
            chain: opts.chain,
            tokenAddress,
            address: opts.address,
          }],
        }
        const data = await bridgePost('/v2/order/tokenBalancePrice', body)
        out(true, data)
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  cmd
    .command('login')
    .description('EIP-191 sign-in to get a JWT access token')
    .option('-w, --wallet <name>', 'Wallet name (default: default wallet)')
    .option('--sl <name>', 'Social Login wallet name')
    .action(async (opts) => {
      try {
        const { wallet } = resolveWallet(opts)
        const result = await bridgeLogin(wallet)
        out(true, result)
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  cmd
    .command('make-order')
    .description('Create a cross-chain swap order. Returns orderId and unsigned transactions.')
    .requiredOption('--jwt <token>', 'JWT access token (from "bridge login")')
    .requiredOption('--from-chain <chain>', 'Source chain')
    .requiredOption('--from-token <token>', 'Source token symbol or address')
    .requiredOption('--from-amount <amount>', 'Amount to swap (human-readable)')
    .requiredOption('--to-chain <chain>', 'Destination chain')
    .requiredOption('--to-token <token>', 'Destination token symbol or address')
    .requiredOption('--to-address <address>', 'Recipient address on destination chain')
    .requiredOption('--market <market>', 'Bridge market/protocol (e.g. stargate)')
    .option('--slippage <pct>', 'Slippage tolerance %')
    .option('--feature <feature>', 'Optional feature flag')
    .action(async (opts) => {
      try {
        const fromContract = resolveBridgeToken(opts.fromToken, opts.fromChain)
        const toContract = resolveBridgeToken(opts.toToken, opts.toChain)
        const body: Record<string, string> = {
          fromChain: opts.fromChain,
          fromContract,
          fromAmount: opts.fromAmount,
          toChain: opts.toChain,
          toContract,
          toAddress: opts.toAddress,
          market: opts.market,
        }
        if (opts.slippage) body['slippage'] = opts.slippage
        if (opts.feature) body['feature'] = opts.feature
        const data = await bridgePostAuth('/v2/order/makeSwapOrder', body, opts.jwt)
        out(true, data)
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  cmd
    .command('submit-order')
    .description('Submit signed transactions for a swap order')
    .requiredOption('--jwt <token>', 'JWT access token')
    .requiredOption('--order-id <id>', 'Order ID (from make-order)')
    .requiredOption('--signed-txs <txs>', 'Comma-separated signed tx hex strings')
    .action(async (opts) => {
      try {
        const signedTxs = (opts.signedTxs as string).split(',').map((s: string) => s.trim()).filter(Boolean)
        const body = { orderId: opts.orderId, signedTxs }
        const data = await bridgePostAuth('/v2/order/submitSwapOrder', body, opts.jwt)
        out(true, data)
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  cmd
    .command('swap')
    .description('One-step cross-chain swap: create order → sign txs → submit')
    .option('-w, --wallet <name>', 'Wallet name (default: default wallet)')
    .option('--sl <name>', 'Social Login wallet name')
    .requiredOption('--jwt <token>', 'JWT access token (from "bridge login")')
    .requiredOption('--from-chain <chain>', 'Source chain')
    .requiredOption('--from-token <token>', 'Source token symbol or address')
    .requiredOption('--from-amount <amount>', 'Amount to swap (human-readable)')
    .requiredOption('--to-chain <chain>', 'Destination chain')
    .requiredOption('--to-token <token>', 'Destination token symbol or address')
    .requiredOption('--market <market>', 'Bridge market/protocol (e.g. stargate)')
    .option('--to-address <address>', 'Recipient address (default: same as sender)')
    .option('--slippage <pct>', 'Slippage tolerance %')
    .option('--feature <feature>', 'Optional feature flag')
    .action(async (opts) => {
      try {
        const { wallet } = resolveWallet(opts)
        const fromContract = resolveBridgeToken(opts.fromToken, opts.fromChain)
        const toContract = resolveBridgeToken(opts.toToken, opts.toChain)
        const result = await bridgeSwap(wallet, opts.jwt, {
          fromChain: opts.fromChain,
          fromContract,
          fromAmount: opts.fromAmount,
          toChain: opts.toChain,
          toContract,
          toAddress: opts.toAddress,
          market: opts.market,
          slippage: opts.slippage,
          feature: opts.feature,
        })
        out(true, result)
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  cmd
    .command('order')
    .description('Query the status of a swap order')
    .requiredOption('--jwt <token>', 'JWT access token')
    .requiredOption('--order-id <id>', 'Order ID')
    .action(async (opts) => {
      try {
        const data = await bridgePostAuth('/v2/order/getSwapOrder', { orderId: opts.orderId }, opts.jwt)
        out(true, data)
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  cmd
    .command('history')
    .description('Query historical swap orders')
    .requiredOption('--jwt <token>', 'JWT access token')
    .option('--page <n>', 'Page number')
    .option('--page-size <n>', 'Results per page')
    .option('--status <status>', 'Filter by order status')
    .action(async (opts) => {
      try {
        const body: Record<string, string | number> = {}
        if (opts.page) body['page'] = Number(opts.page)
        if (opts.pageSize) body['pageSize'] = Number(opts.pageSize)
        if (opts.status) body['status'] = opts.status
        const data = await bridgePostAuth('/v2/order/history', body, opts.jwt)
        out(true, data)
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  return cmd
}

export function ecoCommand(): Command {
  const cmd = new Command('eco').description('Ecosystem DeFi operations: DEX swap, cross-chain bridge (L3)')
  cmd.addCommand(swapCommand())
  cmd.addCommand(bridgeCommand())
  return cmd
}
