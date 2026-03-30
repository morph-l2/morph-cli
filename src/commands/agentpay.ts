/**
 * agentpay — Agent payment & identity commands (L4)
 *
 * x402: HTTP 402 Payment Required protocol
 *   x402 supported  — query Facilitator supported networks/tokens
 *   x402 discover   — probe a URL for 402 payment requirements
 *   x402 pay        — sign EIP-3009 + pay and get resource
 *   x402 config     — save/show/list/remove HMAC credentials (per-wallet)
 *   x402 verify     — (Merchant) verify payment via Facilitator
 *   x402 settle     — (Merchant) settle payment on-chain
 *   x402 register   — (Merchant) wallet sign-in → get HMAC credentials
 *
 * identity: ERC-8004 Agent Identity & Reputation
 *   identity registry       — contract info
 *   identity info            — query agent info by ID
 *   identity balance         — agent count by address
 *   identity total           — total registered agents
 *   identity metadata        — read agent metadata
 *   identity reputation      — reputation summary
 *   identity register        — register agent (tx)
 *   identity set-metadata    — set metadata key (tx)
 *   identity set-uri         — set agent URI (tx)
 *   identity set-wallet      — bind agent wallet (tx, EIP-712)
 *   identity unset-wallet    — unbind agent wallet (tx)
 *   identity feedback        — give feedback (tx)
 *   identity read-feedback   — read single feedback
 *   identity reviews         — read all feedback
 *   identity revoke-feedback — revoke own feedback (tx)
 *   identity append-response — append response to feedback (tx)
 */
import { Command } from 'commander'
import { out, assertExclusiveWallet } from '../lib/utils/output.js'
import { resolveWalletName } from '../lib/wallet/keystore.js'
import { resolveWallet } from '../lib/wallet/resolve.js'
import { probeX402, payX402, getSupported } from '../lib/agentpay/x402/client.js'
import { verifyPayment, settlePayment } from '../lib/agentpay/x402/facilitator.js'
import { saveCredentials, loadCredentials, listCredentials, removeCredentials } from '../lib/agentpay/x402/credentials.js'
import { registerMerchant } from '../lib/agentpay/x402/register.js'
import { startX402Server } from '../lib/agentpay/x402/server.js'
import {
  getRegistryInfo,
  getAgentInfo,
  getAgentMetadata,
  getAgentBalance,
  getReputationSummary,
  getTotalAgents,
  readFeedback,
  readAllFeedback,
  encodeRegister,
  encodeSetMetadata,
  encodeSetAgentURI,
  encodeSetAgentWallet,
  encodeUnsetAgentWallet,
  encodeGiveFeedback,
  encodeRevokeFeedback,
  encodeAppendResponse,
  IDENTITY_REGISTRY,
  REPUTATION_REGISTRY,
} from '../lib/agentpay/identity/registry.js'
import { createSigner } from '../lib/utils/signer.js'
import { sendTx, addTxModeOptions, parseTxModeOptions, txModeLabel } from '../lib/utils/tx-sender.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Resolve merchant credentials: -w name > inline flags > default wallet */
function resolveCreds(opts: { wallet?: string; sl?: string; accessKey?: string; secretKey?: string }): { accessKey: string; secretKey: string } {
  // Inline credentials take priority
  if (opts.accessKey && opts.secretKey) {
    return { accessKey: opts.accessKey, secretKey: opts.secretKey }
  }
  // Try loading by wallet name
  const name = opts.sl ?? opts.wallet ?? resolveWalletName(undefined)
  const saved = loadCredentials(name)
  if (saved) return { accessKey: saved.accessKey, secretKey: saved.secretKey }
  throw new Error(`No credentials for wallet "${name}". Use "x402 register -w ${name} --save" or "x402 config -w ${name} --access-key ... --secret-key ...".`)
}

// ─── x402 ────────────────────────────────────────────────────────────────────

function x402Command(): Command {
  const cmd = new Command('x402').description('HTTP 402 payment protocol (user + merchant)')

  cmd
    .command('supported')
    .description('Query Morph Facilitator supported payment methods and networks')
    .action(async () => {
      try {
        const data = await getSupported()
        out(true, data)
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  cmd
    .command('discover')
    .description('Probe a URL and decode the 402 payment requirements')
    .requiredOption('--url <url>', 'Target URL to probe')
    .action(async (opts) => {
      try {
        const result = await probeX402(opts.url)

        if (!result.requiresPayment) {
          out(true, {
            url: result.url,
            status: result.status,
            requiresPayment: false,
            note: 'Endpoint did not return 402 — no payment needed',
          })
          return
        }

        out(true, {
          url: result.url,
          status: 402,
          requiresPayment: true,
          paymentRequirements: result.paymentRequirements,
          rawHeaders: result.rawHeaders,
          note: 'Use "agentpay x402 pay --url <url>" to pay and get the resource',
        })
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  cmd
    .command('pay')
    .description('Pay a 402-gated resource: probe → sign EIP-3009 → get resource. Dry-run by default.')
    .option('-w, --wallet <name>', 'Private-key wallet name (default: default wallet)')
    .option('--sl <name>', 'Social Login wallet name')
    .requiredOption('--url <url>', 'Target URL')
    .option('--max-payment <usdc>', 'Max payment in USDC (default: 1.0)', '1.0')
    .option('--method <method>', 'HTTP method (default: GET)', 'GET')
    .option('--dry-run', 'Preview payment without signing')
    .action(async (opts) => {
      try {
        const { wallet, address, type } = resolveWallet(opts)

        const probe = await probeX402(opts.url)

        if (!probe.requiresPayment) {
          out(true, { url: opts.url, status: probe.status, note: 'Endpoint did not return 402 — no payment needed' })
          return
        }

        if (!probe.paymentRequirements?.length) {
          out(false, { url: opts.url, error: 'Got 402 but could not parse payment requirements', body: probe.body, rawHeaders: probe.rawHeaders })
          process.exit(1)
        }

        const req = probe.paymentRequirements[0]
        const amount = req.amount ?? req.maxAmountRequired ?? '0'
        const amountHuman = (Number(amount) / 1e6).toFixed(6)

        if (opts.dryRun) {
          out(true, {
            dryRun: true, url: opts.url, from: address, payTo: req.payTo,
            amount: amountHuman + ' USDC', amountRaw: amount, network: req.network,
            scheme: req.scheme, maxPayment: opts.maxPayment + ' USDC',
            note: 'Add --dry-run to preview without signing',
          })
          return
        }

        const result = await payX402(wallet, opts.url, { maxPayment: parseFloat(opts.maxPayment), method: opts.method })

        if (!result.paid) {
          out(true, { url: opts.url, paid: false, note: 'No payment required' })
          return
        }

        out(true, {
          url: opts.url, paid: true,
          from: result.paymentPayload?.payload.authorization.from,
          payTo: result.paymentPayload?.payload.authorization.to,
          amount: amountHuman + ' USDC',
          responseStatus: result.response?.status,
          responseBody: result.response?.body,
        })
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  // ─── Merchant: config ─────────────────────────────────────────────────

  cmd
    .command('config')
    .description('(Merchant) Save, show, list, or remove HMAC credentials (per-wallet, Secret Key encrypted)')
    .option('-w, --wallet <name>', 'Wallet name (credential key)')
    .option('--sl <name>', 'Social Login wallet name (credential key)')
    .option('--access-key <key>', 'Morph Access Key (morph_ak_...)')
    .option('--secret-key <key>', 'Morph Secret Key (morph_sk_...)')
    .option('--address <address>', 'Wallet address to associate')
    .option('--show', 'Show saved credentials (Secret Key masked)')
    .option('--list', 'List all saved credentials')
    .option('--remove', 'Remove saved credentials')
    .action(async (opts) => {
      try {
        assertExclusiveWallet(opts)
        // List all
        if (opts.list) {
          const all = listCredentials()
          if (all.length === 0) { out(true, { count: 0, note: 'No credentials saved.' }); return }
          out(true, all)
          return
        }

        // Need a wallet name for other operations
        const name = opts.sl ?? opts.wallet
        if (!name) {
          out(false, { error: 'Provide -w <wallet> or --sl <name> to identify credentials. Use --list to see all.' })
          process.exit(1)
        }

        if (opts.remove) {
          const removed = removeCredentials(name)
          out(true, { name, removed, note: removed ? 'Credentials removed' : 'No credentials found' })
          return
        }

        if (opts.show) {
          const creds = loadCredentials(name)
          if (!creds) { out(true, { name, saved: false, note: 'No credentials saved. Use "x402 register" or "x402 config" to save.' }); return }
          out(true, {
            name: creds.name,
            address: creds.address,
            accessKey: creds.accessKey,
            secretKey: creds.secretKey.slice(0, 12) + '...' + creds.secretKey.slice(-4),
          })
          return
        }

        if (opts.accessKey && opts.secretKey) {
          const address = opts.address ?? ''
          saveCredentials(name, address, opts.accessKey, opts.secretKey)
          out(true, {
            saved: true,
            name,
            address: address || '(not specified)',
            accessKey: opts.accessKey,
            note: `Credentials saved at ~/.morph-agent/x402-credentials/${name}.json`,
          })
          return
        }

        out(false, { error: 'Provide --access-key and --secret-key to save, or --show to view, or --list to list all, or --remove to delete' })
        process.exit(1)
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  // ─── Merchant: verify ───────────────────────────────────────────────────

  cmd
    .command('verify')
    .description('(Merchant) Verify a payment payload via Facilitator. Uses saved or inline credentials.')
    .option('-w, --wallet <name>', 'Wallet name to load credentials (default: default wallet)')
    .option('--sl <name>', 'Social Login wallet name to load credentials')
    .option('--access-key <key>', 'Morph Access Key (or use saved credentials)')
    .option('--secret-key <key>', 'Morph Secret Key (or use saved credentials)')
    .requiredOption('--payload <json>', 'Payment payload JSON')
    .requiredOption('--requirements <json>', 'Payment requirements JSON')
    .action(async (opts) => {
      try {
        const creds = resolveCreds(opts)
        const payload = JSON.parse(opts.payload)
        const requirements = JSON.parse(opts.requirements)
        const result = await verifyPayment(creds, payload, requirements)
        out(true, result)
      } catch (e) {
        const msg = (e as Error).message
        out(false, { error: msg.includes('JSON') ? 'Invalid JSON in --payload or --requirements' : msg })
        process.exit(1)
      }
    })

  // ─── Merchant: settle ───────────────────────────────────────────────────

  cmd
    .command('settle')
    .description('(Merchant) Settle payment on-chain via Facilitator. Uses saved or inline credentials.')
    .option('-w, --wallet <name>', 'Wallet name to load credentials (default: default wallet)')
    .option('--sl <name>', 'Social Login wallet name to load credentials')
    .option('--access-key <key>', 'Morph Access Key (or use saved credentials)')
    .option('--secret-key <key>', 'Morph Secret Key (or use saved credentials)')
    .requiredOption('--payload <json>', 'Payment payload JSON')
    .requiredOption('--requirements <json>', 'Payment requirements JSON')
    .action(async (opts) => {
      try {
        const creds = resolveCreds(opts)
        const payload = JSON.parse(opts.payload)
        const requirements = JSON.parse(opts.requirements)
        const result = await settlePayment(creds, payload, requirements)
        out(true, result)
      } catch (e) {
        const msg = (e as Error).message
        out(false, { error: msg.includes('JSON') ? 'Invalid JSON in --payload or --requirements' : msg })
        process.exit(1)
      }
    })

  // ─── Merchant: register ──────────────────────────────────────────────────

  cmd
    .command('register')
    .description('(Merchant) Register with Morph Facilitator to get HMAC credentials. Signs a message with your wallet.')
    .option('-w, --wallet <name>', 'Private-key wallet name (default: default wallet)')
    .option('--sl <name>', 'Social Login wallet name')
    .option('--save', 'Auto-save credentials locally (encrypted)')
    .action(async (opts) => {
      try {
        const { wallet, name, address, type } = resolveWallet(opts)

        // Check if credentials already saved locally — use live wallet address, not saved address
        const saved = loadCredentials(name)
        if (saved && saved.secretKey.startsWith('morph_sk_')) {
          const sk = saved.secretKey
          const masked = sk.length > 16
            ? sk.slice(0, 12) + '...' + sk.slice(-4)
            : '***'
          out(true, {
            walletName: name,
            walletType: type,
            address,
            accessKey: saved.accessKey,
            secretKey: masked,
            note: 'Credentials already saved locally. Use "x402 config -w ' + name + ' --show" to view.',
          })
          return
        }

        const result = await registerMerchant(wallet)

        const hasRealSecret = result.secretKey && result.secretKey.startsWith('morph_sk_')
        if (opts.save && result.accessKey && hasRealSecret) {
          saveCredentials(name, result.address, result.accessKey, result.secretKey)
        }

        out(true, {
          walletName: name,
          walletType: type,
          address: result.address,
          accessKey: result.accessKey,
          secretKey: hasRealSecret ? result.secretKey : '(not available — already registered, secret only shown once)',
          isNew: result.isNew,
          saved: opts.save
            ? (hasRealSecret ? true : false)
            : undefined,
          note: result.isNew
            ? 'Credentials created! Secret Key is only shown once. Use --save to encrypt and store locally.'
            : hasRealSecret
              ? 'Key already exists but Secret Key was retrieved.'
              : 'Key already exists. Secret Key not available — use "x402 config" to set manually if you have it.',
        })
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  // ─── Merchant: server ──────────────────────────────────────────────────

  cmd
    .command('server')
    .description('(Merchant) Start a local x402 merchant server for testing.')
    .option('--port <port>', 'Port to listen on', '8080')
    .option('--pay-to <address>', 'Recipient address for payments')
    .option('--price <usdc>', 'Price in USDC (e.g. "0.001")', '0.001')
    .option('--path <path>', 'Paid endpoint path', '/api/resource')
    .option('--free-path <path>', 'Free endpoint path', '/api/free')
    .option('--dev', 'Dev mode: structural validation only, skip Facilitator verify/settle')
    .option('-w, --wallet <name>', 'Wallet name to load credentials')
    .option('--sl <name>', 'Social Login wallet name to load credentials')
    .action(async (opts) => {
      try {
        let creds: { accessKey: string; secretKey: string } | undefined
        if (!opts.dev) {
          try {
            creds = resolveCreds(opts)
          } catch (e) {
            out(false, { error: `Credentials required (use --dev to skip): ${(e as Error).message}` })
            process.exit(1)
          }
        }

        // Resolve payTo: from option, or from wallet address, or prompt
        let payTo = opts.payTo as string | undefined
        if (!payTo) {
          try {
            const { address } = resolveWallet(opts)
            payTo = address
          } catch {
            out(false, { error: 'Provide --pay-to <address> or -w <wallet> / --sl <name> to use wallet address as payTo' })
            process.exit(1)
          }
        }

        startX402Server({
          port: parseInt(opts.port),
          payTo,
          price: opts.price,
          paidPath: opts.path,
          freePath: opts.freePath,
          creds,
        })
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  return cmd
}

// ─── ERC-8004 Identity ───────────────────────────────────────────────────────

function identityCommand(): Command {
  const cmd = new Command('identity').description('ERC-8004 agent identity & reputation on-chain')

  cmd
    .command('registry')
    .description('Show registry contract info (name, symbol, version, owner)')
    .option('--hoodi', 'Use Morph Hoodi testnet')
    .action(async (opts) => {
      try {
        const info = await getRegistryInfo(opts.hoodi)
        out(true, info)
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  cmd
    .command('info')
    .description('Get agent info by ID (owner, URI, wallet)')
    .requiredOption('--agent-id <id>', 'Agent ID (uint256)')
    .option('--hoodi', 'Use Morph Hoodi testnet')
    .action(async (opts) => {
      try {
        const info = await getAgentInfo(parseInt(opts.agentId), opts.hoodi)
        out(true, info)
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  cmd
    .command('balance')
    .description('Get number of agents owned by an address')
    .requiredOption('-a, --address <address>', 'Owner address')
    .option('--hoodi', 'Use Morph Hoodi testnet')
    .action(async (opts) => {
      try {
        const count = await getAgentBalance(opts.address, opts.hoodi)
        out(true, { address: opts.address, agentCount: count })
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  cmd
    .command('metadata')
    .description('Read agent metadata by key')
    .requiredOption('--agent-id <id>', 'Agent ID')
    .requiredOption('--key <key>', 'Metadata key (e.g. "name", "description", "endpoint")')
    .option('--hoodi', 'Use Morph Hoodi testnet')
    .action(async (opts) => {
      try {
        const value = await getAgentMetadata(parseInt(opts.agentId), opts.key, opts.hoodi)
        out(true, { agentId: opts.agentId, key: opts.key, value })
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  cmd
    .command('reputation')
    .description('Get agent reputation summary (feedback count, score, clients)')
    .requiredOption('--agent-id <id>', 'Agent ID')
    .option('--hoodi', 'Use Morph Hoodi testnet')
    .action(async (opts) => {
      try {
        const rep = await getReputationSummary(parseInt(opts.agentId), opts.hoodi)
        out(true, rep)
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  {
    const registerCmd = cmd
      .command('register')
      .description('Register a new agent on IdentityRegistry. Dry-run by default.')
      .option('-w, --wallet <name>', 'Private-key wallet name (default: default wallet)')
      .option('--sl <name>', 'Social Login wallet name')
      .option('--uri <uri>', 'Agent URI (metadata URL)')
      .option('--dry-run', 'Preview transaction without sending')
      .option('--hoodi', 'Use Morph Hoodi testnet')
    addTxModeOptions(registerCmd)
    registerCmd.action(async (opts) => {
      try {
        const { wallet, address } = resolveWallet(opts)

        const calldata = encodeRegister(opts.uri)
        const txMode = parseTxModeOptions(opts)

        if (opts.dryRun) {
          out(true, {
            dryRun: true, from: address, to: IDENTITY_REGISTRY,
            uri: opts.uri ?? '(none)', calldataLength: calldata.length,
            txMode: txModeLabel(txMode),
            note: 'Add --dry-run to preview without sending',
          })
          return
        }

        const result = await sendTx(wallet, { to: IDENTITY_REGISTRY, data: calldata }, txMode)
        out(true, {
          hash: result.hash, txType: result.txType,
          from: address, contract: IDENTITY_REGISTRY,
          uri: opts.uri ?? '(none)',
          note: 'Agent registered. Use "agentpay identity info" to check.',
        })
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })
  }

  // ─── total ──────────────────────────────────────────────────────────────

  cmd
    .command('total')
    .description('Get total number of registered agents')
    .option('--hoodi', 'Use Morph Hoodi testnet')
    .action(async (opts) => {
      try {
        const total = await getTotalAgents(opts.hoodi)
        out(true, { totalAgents: total })
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  // ─── set-metadata ─────────────────────────────────────────────────────

  {
    const setMetaCmd = cmd
      .command('set-metadata')
      .description('Set agent metadata key-value pair. Dry-run by default.')
      .option('-w, --wallet <name>', 'Private-key wallet name (default: default wallet)')
      .option('--sl <name>', 'Social Login wallet name')
      .requiredOption('--agent-id <id>', 'Agent ID')
      .requiredOption('--key <key>', 'Metadata key (e.g. "name", "description", "endpoint")')
      .requiredOption('--value <value>', 'Metadata value')
      .option('--dry-run', 'Preview transaction without sending')
      .option('--hoodi', 'Use Morph Hoodi testnet')
    addTxModeOptions(setMetaCmd)
    setMetaCmd.action(async (opts) => {
      try {
        const { wallet, address } = resolveWallet(opts)

        const calldata = encodeSetMetadata(parseInt(opts.agentId), opts.key, opts.value)
        const txMode = parseTxModeOptions(opts)

        if (opts.dryRun) {
          out(true, {
            dryRun: true, from: address, to: IDENTITY_REGISTRY,
            agentId: opts.agentId, key: opts.key, value: opts.value,
            txMode: txModeLabel(txMode),
            note: 'Add --dry-run to preview without sending',
          })
          return
        }

        const result = await sendTx(wallet, { to: IDENTITY_REGISTRY, data: calldata }, txMode)
        out(true, { hash: result.hash, txType: result.txType, from: address, agentId: opts.agentId, key: opts.key, value: opts.value })
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })
  }

  // ─── set-uri ──────────────────────────────────────────────────────────

  {
    const setUriCmd = cmd
      .command('set-uri')
      .description('Set agent URI (metadata URL). Dry-run by default.')
      .option('-w, --wallet <name>', 'Private-key wallet name (default: default wallet)')
      .option('--sl <name>', 'Social Login wallet name')
      .requiredOption('--agent-id <id>', 'Agent ID')
      .requiredOption('--uri <uri>', 'New agent URI')
      .option('--dry-run', 'Preview transaction without sending')
      .option('--hoodi', 'Use Morph Hoodi testnet')
    addTxModeOptions(setUriCmd)
    setUriCmd.action(async (opts) => {
      try {
        const { wallet, address } = resolveWallet(opts)

        const calldata = encodeSetAgentURI(parseInt(opts.agentId), opts.uri)
        const txMode = parseTxModeOptions(opts)

        if (opts.dryRun) {
          out(true, {
            dryRun: true, from: address, to: IDENTITY_REGISTRY,
            agentId: opts.agentId, uri: opts.uri,
            txMode: txModeLabel(txMode),
            note: 'Add --dry-run to preview without sending',
          })
          return
        }

        const result = await sendTx(wallet, { to: IDENTITY_REGISTRY, data: calldata }, txMode)
        out(true, { hash: result.hash, txType: result.txType, from: address, agentId: opts.agentId, uri: opts.uri })
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })
  }

  // ─── set-wallet ───────────────────────────────────────────────────────

  {
    const setWalletCmd = cmd
      .command('set-wallet')
      .description('Bind an operational wallet to agent (requires EIP-712 signature from newWallet). Dry-run by default.')
      .option('-w, --wallet <name>', 'Private-key wallet name (agent owner, default: default wallet)')
      .option('--sl <name>', 'Social Login wallet name (agent owner)')
      .requiredOption('--agent-id <id>', 'Agent ID')
      .requiredOption('--new-wallet <address>', 'New wallet address to bind')
      .requiredOption('--signature <hex>', 'EIP-712 signature from newWallet (0x...)')
      .option('--deadline <timestamp>', 'Signature deadline (unix timestamp)', String(Math.floor(Date.now() / 1000) + 3600))
      .option('--dry-run', 'Preview transaction without sending')
      .option('--hoodi', 'Use Morph Hoodi testnet')
    addTxModeOptions(setWalletCmd)
    setWalletCmd.action(async (opts) => {
      try {
        const { wallet, address } = resolveWallet(opts)

        const deadline = BigInt(opts.deadline)
        const calldata = encodeSetAgentWallet(parseInt(opts.agentId), opts.newWallet, deadline, opts.signature as `0x${string}`)
        const txMode = parseTxModeOptions(opts)

        if (opts.dryRun) {
          out(true, {
            dryRun: true, from: address, to: IDENTITY_REGISTRY,
            agentId: opts.agentId, newWallet: opts.newWallet, deadline: opts.deadline,
            txMode: txModeLabel(txMode),
            note: 'Add --dry-run to preview without sending',
          })
          return
        }

        const result = await sendTx(wallet, { to: IDENTITY_REGISTRY, data: calldata }, txMode)
        out(true, { hash: result.hash, txType: result.txType, from: address, agentId: opts.agentId, newWallet: opts.newWallet })
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })
  }

  // ─── unset-wallet ─────────────────────────────────────────────────────

  {
    const unsetWalletCmd = cmd
      .command('unset-wallet')
      .description('Unbind agent operational wallet. Dry-run by default.')
      .option('-w, --wallet <name>', 'Private-key wallet name (agent owner, default: default wallet)')
      .option('--sl <name>', 'Social Login wallet name (agent owner)')
      .requiredOption('--agent-id <id>', 'Agent ID')
      .option('--dry-run', 'Preview transaction without sending')
      .option('--hoodi', 'Use Morph Hoodi testnet')
    addTxModeOptions(unsetWalletCmd)
    unsetWalletCmd.action(async (opts) => {
      try {
        const { wallet, address } = resolveWallet(opts)

        const calldata = encodeUnsetAgentWallet(parseInt(opts.agentId))
        const txMode = parseTxModeOptions(opts)

        if (opts.dryRun) {
          out(true, {
            dryRun: true, from: address, to: IDENTITY_REGISTRY,
            agentId: opts.agentId, action: 'unset wallet',
            txMode: txModeLabel(txMode),
            note: 'Add --dry-run to preview without sending',
          })
          return
        }

        const result = await sendTx(wallet, { to: IDENTITY_REGISTRY, data: calldata }, txMode)
        out(true, { hash: result.hash, txType: result.txType, from: address, agentId: opts.agentId, action: 'wallet unset' })
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })
  }

  // ─── feedback (give) ──────────────────────────────────────────────────

  {
    const feedbackCmd = cmd
      .command('feedback')
      .description('Give feedback to an agent. Dry-run by default.')
      .option('-w, --wallet <name>', 'Private-key wallet name (default: default wallet)')
      .option('--sl <name>', 'Social Login wallet name')
      .requiredOption('--agent-id <id>', 'Agent ID')
      .requiredOption('--value <n>', 'Feedback value (positive or negative integer)')
      .option('--tag1 <tag>', 'Tag 1 (category)', '')
      .option('--tag2 <tag>', 'Tag 2 (sub-category)', '')
      .option('--endpoint <url>', 'Endpoint being rated', '')
      .option('--feedback-uri <uri>', 'Off-chain feedback URI', '')
      .option('--dry-run', 'Preview transaction without sending')
      .option('--hoodi', 'Use Morph Hoodi testnet')
    addTxModeOptions(feedbackCmd)
    feedbackCmd.action(async (opts) => {
      try {
        const { wallet, address } = resolveWallet(opts)

        const calldata = encodeGiveFeedback(
          parseInt(opts.agentId), parseInt(opts.value),
          opts.tag1, opts.tag2, opts.endpoint, opts.feedbackUri,
        )
        const txMode = parseTxModeOptions(opts)

        if (opts.dryRun) {
          out(true, {
            dryRun: true, from: address, to: REPUTATION_REGISTRY,
            agentId: opts.agentId, value: opts.value, tag1: opts.tag1, tag2: opts.tag2,
            txMode: txModeLabel(txMode),
            note: 'Add --dry-run to preview without sending',
          })
          return
        }

        const result = await sendTx(wallet, { to: REPUTATION_REGISTRY, data: calldata }, txMode)
        out(true, { hash: result.hash, txType: result.txType, from: address, agentId: opts.agentId, value: opts.value })
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })
  }

  // ─── read-feedback ────────────────────────────────────────────────────

  cmd
    .command('read-feedback')
    .description('Read a single feedback entry')
    .requiredOption('--agent-id <id>', 'Agent ID')
    .requiredOption('--client <address>', 'Client address who gave feedback')
    .requiredOption('--index <n>', 'Feedback index')
    .option('--hoodi', 'Use Morph Hoodi testnet')
    .action(async (opts) => {
      try {
        const fb = await readFeedback(parseInt(opts.agentId), opts.client, parseInt(opts.index), opts.hoodi)
        out(true, { agentId: opts.agentId, client: opts.client, index: opts.index, ...fb })
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  // ─── reviews (read all feedback) ──────────────────────────────────────

  cmd
    .command('reviews')
    .description('Read all feedback for an agent')
    .requiredOption('--agent-id <id>', 'Agent ID')
    .option('--include-revoked', 'Include revoked feedback')
    .option('--hoodi', 'Use Morph Hoodi testnet')
    .action(async (opts) => {
      try {
        const feedbacks = await readAllFeedback(parseInt(opts.agentId), opts.hoodi, opts.includeRevoked)
        if (feedbacks.length === 0) {
          out(true, { agentId: opts.agentId, feedbackCount: 0, note: 'No feedback found' })
          return
        }
        out(true, feedbacks)
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })

  // ─── revoke-feedback ──────────────────────────────────────────────────

  {
    const revokeCmd = cmd
      .command('revoke-feedback')
      .description('Revoke your own feedback. Dry-run by default.')
      .option('-w, --wallet <name>', 'Private-key wallet name (default: default wallet)')
      .option('--sl <name>', 'Social Login wallet name')
      .requiredOption('--agent-id <id>', 'Agent ID')
      .requiredOption('--index <n>', 'Feedback index to revoke')
      .option('--dry-run', 'Preview transaction without sending')
      .option('--hoodi', 'Use Morph Hoodi testnet')
    addTxModeOptions(revokeCmd)
    revokeCmd.action(async (opts) => {
      try {
        const { wallet, address } = resolveWallet(opts)

        const calldata = encodeRevokeFeedback(parseInt(opts.agentId), parseInt(opts.index))
        const txMode = parseTxModeOptions(opts)

        if (opts.dryRun) {
          out(true, {
            dryRun: true, from: address, to: REPUTATION_REGISTRY,
            agentId: opts.agentId, feedbackIndex: opts.index,
            txMode: txModeLabel(txMode),
            note: 'Add --dry-run to preview without sending',
          })
          return
        }

        const result = await sendTx(wallet, { to: REPUTATION_REGISTRY, data: calldata }, txMode)
        out(true, { hash: result.hash, txType: result.txType, from: address, agentId: opts.agentId, feedbackIndex: opts.index, action: 'feedback revoked' })
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })
  }

  // ─── append-response ──────────────────────────────────────────────────

  {
    const appendCmd = cmd
      .command('append-response')
      .description('Append a response to feedback (multi-party verification). Dry-run by default.')
      .option('-w, --wallet <name>', 'Private-key wallet name (default: default wallet)')
      .option('--sl <name>', 'Social Login wallet name')
      .requiredOption('--agent-id <id>', 'Agent ID')
      .requiredOption('--client <address>', 'Client address who gave feedback')
      .requiredOption('--index <n>', 'Feedback index')
      .requiredOption('--response-uri <uri>', 'Response URI')
      .option('--dry-run', 'Preview transaction without sending')
      .option('--hoodi', 'Use Morph Hoodi testnet')
    addTxModeOptions(appendCmd)
    appendCmd.action(async (opts) => {
      try {
        const { wallet, address } = resolveWallet(opts)

        const calldata = encodeAppendResponse(
          parseInt(opts.agentId), opts.client, parseInt(opts.index), opts.responseUri,
        )
        const txMode = parseTxModeOptions(opts)

        if (opts.dryRun) {
          out(true, {
            dryRun: true, from: address, to: REPUTATION_REGISTRY,
            agentId: opts.agentId, client: opts.client, feedbackIndex: opts.index,
            responseUri: opts.responseUri,
            txMode: txModeLabel(txMode),
            note: 'Add --dry-run to preview without sending',
          })
          return
        }

        const result = await sendTx(wallet, { to: REPUTATION_REGISTRY, data: calldata }, txMode)
        out(true, { hash: result.hash, txType: result.txType, from: address, agentId: opts.agentId, feedbackIndex: opts.index, action: 'response appended' })
      } catch (e) { out(false, { error: (e as Error).message }); process.exit(1) }
    })
  }

  return cmd
}

// ─── Main ────────────────────────────────────────────────────────────────────

export function agentpayCommand(): Command {
  const cmd = new Command('agentpay').description('Agent payment & identity: x402 payments, ERC-8004 identity (L4)')
  cmd.addCommand(x402Command())
  cmd.addCommand(identityCommand())
  return cmd
}
