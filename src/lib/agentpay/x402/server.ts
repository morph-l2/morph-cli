/**
 * x402 local merchant server
 *
 * Starts an HTTP server that:
 *   GET /api/free     → 200 (no payment)
 *   GET <paidPath>    → 402 with paymentRequirements
 *   GET <paidPath> + X-PAYMENT header → verifies payment then 200
 *
 * When --verify flag is set, uses real Facilitator HMAC credentials to
 * verify the payment. Otherwise does structural validation only (dev mode).
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { verifyPayment, settlePayment, type FacilitatorCredentials } from './facilitator.js'

export interface ServerOptions {
  port: number
  payTo: string
  price: string       // human-readable USDC e.g. "0.001"
  paidPath: string    // e.g. "/api/resource"
  freePath: string    // e.g. "/api/free"
  creds?: FacilitatorCredentials  // if provided, use real Facilitator verify
}

function usdc(humanAmount: string): string {
  return String(Math.round(parseFloat(humanAmount) * 1e6))
}

export function startX402Server(opts: ServerOptions): void {
  const MORPH_USDC = '0xCfb1186F4e93D60E60a8bDd997427D1F33bc372B'
  const amountRaw = usdc(opts.price)

  const paymentRequirements = {
    scheme: 'exact',
    network: 'eip155:2818',
    maxAmountRequired: amountRaw,
    resource: `http://localhost:${opts.port}${opts.paidPath}`,
    description: 'x402 protected resource',
    mimeType: 'application/json',
    payTo: opts.payTo,
    maxTimeoutSeconds: 15,
    asset: MORPH_USDC,
    extra: { name: 'USDC', version: '2' },
  }

  async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? '/'
    const method = req.method ?? 'GET'

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-PAYMENT, PAYMENT-SIGNATURE')
    if (method === 'OPTIONS') { res.writeHead(204); res.end(); return }

    // Free endpoint
    if (url === opts.freePath) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ message: 'This is free content', path: opts.freePath }))
      return
    }

    // Paid endpoint
    if (url.startsWith(opts.paidPath)) {
      // Accept both PAYMENT-SIGNATURE (base64 JSON, v2) and X-PAYMENT (raw JSON)
      const sigHeader = req.headers['payment-signature'] as string | undefined
      const xPayHeader = req.headers['x-payment'] as string | undefined
      const paymentHeader = sigHeader ?? xPayHeader

      // No payment → 402
      if (!paymentHeader) {
        res.writeHead(402, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          x402Version: 2,
          accepts: [paymentRequirements],
          error: 'Payment Required',
        }))
        return
      }

      // Has payment header — try base64 decode first (PAYMENT-SIGNATURE), then raw JSON (X-PAYMENT)
      let payment: Record<string, unknown>
      try {
        const raw = sigHeader
          ? Buffer.from(paymentHeader, 'base64').toString('utf8')
          : paymentHeader
        payment = JSON.parse(raw)
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid payment header: not valid JSON' }))
        return
      }

      // Real Facilitator verify + settle (when credentials provided)
      if (opts.creds) {
        try {
          // Step 1: Verify signature
          const verifyResult = await verifyPayment(opts.creds, payment, paymentRequirements)
          if (!verifyResult.isValid) {
            res.writeHead(402, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Payment verification failed', reason: verifyResult.invalidReason }))
            return
          }
          // Step 2: Settle on-chain (transfers USDC from payer to merchant)
          const settleResult = await settlePayment(opts.creds, payment, paymentRequirements)
          if (!settleResult.success) {
            res.writeHead(402, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Payment settlement failed', reason: settleResult.errorReason }))
            return
          }
          const auth = (payment.payload as Record<string, unknown>)?.authorization as Record<string, unknown> | undefined
          console.log(`[x402] ✓ Settled | tx: ${settleResult.transaction} | from: ${auth?.from} | amount: ${Number(amountRaw) / 1e6} USDC`)
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: `Facilitator error: ${(e as Error).message}` }))
          return
        }
      } else {
        // Dev mode: structural validation only
        const payload = payment.payload as Record<string, unknown> | undefined
        if (!payload?.signature || !payload?.authorization) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid payment payload: missing signature or authorization' }))
          return
        }
        const auth = payload.authorization as Record<string, unknown>
        if (!auth.from || !auth.to || !auth.value) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid authorization: missing from/to/value' }))
          return
        }
        if (auth.to?.toString().toLowerCase() !== opts.payTo.toLowerCase()) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: `Wrong payTo: expected ${opts.payTo}` }))
          return
        }
        console.log(`[x402] ✓ Payment accepted (dev mode) | from: ${auth.from} | amount: ${Number(auth.value as string) / 1e6} USDC`)
      }

      // Payment OK
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        message: 'Payment accepted. Here is your protected resource.',
        path: opts.paidPath,
        payTo: opts.payTo,
        priceUsdc: opts.price,
      }))
      return
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found', path: url }))
  }

  const server = createServer((req, res) => {
    handler(req, res).catch((e) => {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: (e as Error).message }))
    })
  })

  server.listen(opts.port, () => {
    const mode = opts.creds ? 'verified (Facilitator)' : 'dev (structural only)'
    console.log(`\nx402 merchant server listening on http://localhost:${opts.port}`)
    console.log(`  Free:    GET ${opts.freePath}`)
    console.log(`  Paid:    GET ${opts.paidPath}  (requires ${opts.price} USDC)`)
    console.log(`  PayTo:   ${opts.payTo}`)
    console.log(`  Verify:  ${mode}`)
    console.log(`\nPress Ctrl+C to stop.\n`)
  })
}
