/**
 * x402 test server with real Facilitator verify + settle
 *
 * Starts a local HTTP server that:
 *   GET /api/resource → 402 with paymentRequirements
 *   GET /api/resource + X-PAYMENT header → verify + settle via Facilitator → 200
 *   GET /api/free → 200 (no payment needed)
 *
 * Requires HMAC credentials: set env vars or pass as args.
 *
 * Usage:
 *   MORPH_AK=morph_ak_... MORPH_SK=morph_sk_... npx tsx tests/x402-mock-server.ts
 *   npx tsx tests/x402-mock-server.ts --access-key morph_ak_... --secret-key morph_sk_...
 *   npx tsx tests/x402-mock-server.ts --dev   # structural validation only (no credentials needed)
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { verifyPayment, settlePayment, type FacilitatorCredentials } from '../src/lib/agentpay/x402/facilitator.js'

const PORT = 9402
const MORPH_USDC = '0xCfb1186F4e93D60E60a8bDd997427D1F33bc372B'
const MERCHANT_ADDRESS = '0x98a55f86E1a57bBf28e4eA9dD719874075Fe6513'

// ─── Parse credentials ──────────────────────────────────────────────────────

function parseCreds(): FacilitatorCredentials | null {
  const args = process.argv.slice(2)
  const devIndex = args.indexOf('--dev')
  if (devIndex !== -1) return null

  let accessKey = process.env.MORPH_AK ?? ''
  let secretKey = process.env.MORPH_SK ?? ''

  const akIndex = args.indexOf('--access-key')
  if (akIndex !== -1 && args[akIndex + 1]) accessKey = args[akIndex + 1]
  const skIndex = args.indexOf('--secret-key')
  if (skIndex !== -1 && args[skIndex + 1]) secretKey = args[skIndex + 1]

  if (!accessKey || !secretKey) {
    console.error('Error: HMAC credentials required.')
    console.error('  Set MORPH_AK + MORPH_SK env vars, or pass --access-key + --secret-key')
    console.error('  Use --dev for structural validation only (no Facilitator)')
    process.exit(1)
  }

  return { accessKey, secretKey }
}

const creds = parseCreds()

const paymentRequirements = {
  scheme: 'exact',
  network: 'eip155:2818',
  maxAmountRequired: '1000', // 0.001 USDC
  asset: MORPH_USDC,
  payTo: MERCHANT_ADDRESS,
  maxTimeoutSeconds: 15,
  extra: {
    name: 'USDC',
    version: '2',
  },
}

async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = req.url ?? '/'

  // Free endpoint — no payment
  if (url === '/api/free') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ message: 'This is free content' }))
    return
  }

  // Paid endpoint
  if (url === '/api/resource') {
    const paymentHeader = req.headers['x-payment'] as string | undefined

    if (!paymentHeader) {
      // No payment → return 402
      res.writeHead(402, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        x402Version: 2,
        accepts: [paymentRequirements],
        error: 'Payment Required',
      }))
      return
    }

    // Has payment header → parse
    let payment: Record<string, unknown>
    try {
      payment = JSON.parse(paymentHeader)
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: `Failed to parse X-PAYMENT: ${(e as Error).message}` }))
      return
    }

    if (creds) {
      // ── Real Facilitator verify + settle ────────────────────────────────
      try {
        const verifyResult = await verifyPayment(creds, payment, paymentRequirements)
        if (!verifyResult.isValid) {
          res.writeHead(402, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Payment verification failed', reason: verifyResult.invalidReason }))
          return
        }

        const settleResult = await settlePayment(creds, payment, paymentRequirements)
        if (!settleResult.success) {
          res.writeHead(402, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Payment settlement failed', reason: settleResult.errorReason }))
          return
        }

        const auth = (payment.payload as Record<string, unknown>)?.authorization as Record<string, unknown> | undefined
        console.log(`[x402] ✓ Settled | tx: ${settleResult.transaction} | from: ${auth?.from} | amount: ${Number(paymentRequirements.maxAmountRequired) / 1e6} USDC`)

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          message: 'Payment settled! Here is your protected data.',
          data: {
            answer: 'The meaning of life is 42.',
            payer: auth?.from,
            amountPaid: `${Number(paymentRequirements.maxAmountRequired) / 1e6} USDC`,
            transaction: settleResult.transaction,
          },
        }))
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: `Facilitator error: ${(e as Error).message}` }))
      }
    } else {
      // ── Dev mode: structural validation only ────────────────────────────
      const payload = payment.payload as Record<string, unknown> | undefined
      if (!payload?.signature || !payload?.authorization) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid payment payload structure' }))
        return
      }

      const auth = payload.authorization as Record<string, unknown>
      if (!auth.from || !auth.to || !auth.value) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Missing authorization fields' }))
        return
      }

      if (auth.to?.toString().toLowerCase() !== MERCHANT_ADDRESS.toLowerCase()) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: `Wrong payTo: expected ${MERCHANT_ADDRESS}, got ${auth.to}` }))
        return
      }

      console.log(`[x402] ✓ Payment accepted (dev mode) | from: ${auth.from} | amount: ${Number(auth.value as string) / 1e6} USDC`)

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        message: 'Payment accepted (dev mode). Here is your protected data.',
        data: {
          answer: 'The meaning of life is 42.',
          payer: auth.from,
          amountPaid: `${Number(auth.value as string) / 1e6} USDC`,
        },
      }))
    }
    return
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
}

const server = createServer((req, res) => {
  handler(req, res).catch((e) => {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: (e as Error).message }))
  })
})

const mode = creds ? 'verified (Facilitator verify + settle)' : 'dev (structural only)'
server.listen(PORT, () => {
  console.log(`x402 test server running on http://localhost:${PORT}`)
  console.log(`  GET /api/free     → 200 (no payment)`)
  console.log(`  GET /api/resource → 402 (needs payment)`)
  console.log(`  Merchant: ${MERCHANT_ADDRESS}`)
  console.log(`  Price: 0.001 USDC`)
  console.log(`  Mode: ${mode}`)
  console.log()
})
