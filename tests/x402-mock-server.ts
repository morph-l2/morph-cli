/**
 * Mock x402 server for end-to-end testing
 *
 * Starts a local HTTP server that:
 *   GET /api/resource → 402 with paymentRequirements
 *   GET /api/resource + X-PAYMENT header → 200 with protected data
 *   GET /api/free → 200 (no payment needed)
 *
 * Usage: npx tsx test/x402-mock-server.ts
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'http'

const PORT = 9402
const MORPH_USDC = '0xCfb1186F4e93D60E60a8bDd997427D1F33bc372B'
const MERCHANT_ADDRESS = '0x98a55f86E1a57bBf28e4eA9dD719874075Fe6513'

const paymentRequirements = {
  scheme: 'exact',
  network: 'eip155:2818',
  amount: '1000', // 0.001 USDC
  asset: MORPH_USDC,
  payTo: MERCHANT_ADDRESS,
  extra: {
    name: 'USD Coin',
    version: '1',
  },
}

function handler(req: IncomingMessage, res: ServerResponse) {
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
        paymentRequirements: [paymentRequirements],
        error: 'Payment Required',
      }))
      return
    }

    // Has payment header → validate structure
    try {
      const payment = JSON.parse(paymentHeader)

      if (!payment.payload?.signature || !payment.payload?.authorization) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid payment payload structure' }))
        return
      }

      const auth = payment.payload.authorization

      // Basic validation
      if (!auth.from || !auth.to || !auth.value) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Missing authorization fields' }))
        return
      }

      // Check payTo matches
      if (auth.to.toLowerCase() !== MERCHANT_ADDRESS.toLowerCase()) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: `Wrong payTo: expected ${MERCHANT_ADDRESS}, got ${auth.to}` }))
        return
      }

      // Log received payment for inspection
      console.log('\n=== Payment Received ===')
      console.log('From:', auth.from)
      console.log('To:', auth.to)
      console.log('Value:', auth.value, `(${Number(auth.value) / 1e6} USDC)`)
      console.log('ValidAfter:', auth.validAfter)
      console.log('ValidBefore:', auth.validBefore)
      console.log('Nonce:', auth.nonce)
      console.log('Signature:', payment.payload.signature.slice(0, 20) + '...')
      console.log('Scheme:', payment.scheme)
      console.log('Network:', payment.network)
      console.log('========================\n')

      // Payment accepted (mock — in production, would call verify/settle)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        message: 'Payment accepted! Here is your protected data.',
        data: {
          answer: 'The meaning of life is 42.',
          payer: auth.from,
          amountPaid: `${Number(auth.value) / 1e6} USDC`,
        },
      }))
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: `Failed to parse X-PAYMENT: ${(e as Error).message}` }))
    }
    return
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
}

const server = createServer(handler)
server.listen(PORT, () => {
  console.log(`x402 mock server running on http://localhost:${PORT}`)
  console.log(`  GET /api/free     → 200 (no payment)`)
  console.log(`  GET /api/resource → 402 (needs payment)`)
  console.log(`  Merchant: ${MERCHANT_ADDRESS}`)
  console.log(`  Price: 0.001 USDC`)
  console.log()
})
