import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock fetch ──────────────────────────────────────────────────────────────

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { verifyPayment, settlePayment } from '../../src/lib/agentpay/x402/facilitator.js'
import type { FacilitatorCredentials } from '../../src/lib/agentpay/x402/facilitator.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MOCK_CREDS: FacilitatorCredentials = {
  accessKey: 'morph_ak_test123',
  secretKey: 'morph_sk_test456',
}

const MOCK_PAYLOAD = {
  signature: '0xabc',
  authorization: {
    from: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    to: '0x98a55f86E1a57bBf28e4eA9dD719874075Fe6513',
    value: '1000',
    validAfter: '0',
    validBefore: '9999999999',
    nonce: '0x1234',
  },
}

const MOCK_REQUIREMENTS = {
  scheme: 'exact',
  network: 'eip155:2818',
  amount: '1000',
  payTo: '0x98a55f86E1a57bBf28e4eA9dD719874075Fe6513',
}

beforeEach(() => {
  mockFetch.mockReset()
})

// ─── verifyPayment ───────────────────────────────────────────────────────────

describe('verifyPayment', () => {
  it('sends correct request to facilitator /v2/verify', async () => {
    const mockBody = { isValid: true, invalidReason: '', payer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' }
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(mockBody),
      json: async () => mockBody,
    })

    const result = await verifyPayment(MOCK_CREDS, MOCK_PAYLOAD, MOCK_REQUIREMENTS)

    expect(result.isValid).toBe(true)
    expect(result.payer).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')

    // Check fetch was called with correct URL and headers
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toContain('/v2/verify')
    expect(opts.method).toBe('POST')
    expect(opts.headers['Content-Type']).toBe('application/json')
    expect(opts.headers['MORPH-ACCESS-KEY']).toBe('morph_ak_test123')
    expect(opts.headers['MORPH-ACCESS-TIMESTAMP']).toBeTruthy()
    expect(opts.headers['MORPH-ACCESS-SIGN']).toBeTruthy()

    // Check body structure
    const body = JSON.parse(opts.body)
    expect(body.x402Version).toBe(2)
    expect(body.paymentPayload).toEqual(MOCK_PAYLOAD)
    expect(body.paymentRequirements).toEqual(MOCK_REQUIREMENTS)
  })

  it('throws on non-ok response with invalidReason', async () => {
    const body = { invalidReason: 'Invalid signature' }
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify(body),
      json: async () => body,
    })

    await expect(verifyPayment(MOCK_CREDS, MOCK_PAYLOAD, MOCK_REQUIREMENTS))
      .rejects.toThrow('Facilitator HTTP 400: Invalid signature')
  })

  it('uses HTTP status as fallback error message', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => '{}',
      json: async () => ({}),
    })

    await expect(verifyPayment(MOCK_CREDS, MOCK_PAYLOAD, MOCK_REQUIREMENTS))
      .rejects.toThrow('Facilitator HTTP 500')
  })
})

// ─── settlePayment ───────────────────────────────────────────────────────────

describe('settlePayment', () => {
  it('sends correct request to facilitator /v2/settle', async () => {
    const body = { success: true, errorReason: '', payer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', transaction: '0xdeadbeef', network: 'eip155:2818' }
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(body),
      json: async () => body,
    })

    const result = await settlePayment(MOCK_CREDS, MOCK_PAYLOAD, MOCK_REQUIREMENTS)

    expect(result.success).toBe(true)
    expect(result.transaction).toBe('0xdeadbeef')

    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toContain('/v2/settle')
    expect(opts.method).toBe('POST')
  })

  it('throws on non-ok response with errorReason', async () => {
    const body = { errorReason: 'Payment already settled' }
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify(body),
      json: async () => body,
    })

    await expect(settlePayment(MOCK_CREDS, MOCK_PAYLOAD, MOCK_REQUIREMENTS))
      .rejects.toThrow('Facilitator HTTP 400: Payment already settled')
  })
})

// ─── HMAC signing consistency ────────────────────────────────────────────────

describe('HMAC signing', () => {
  it('includes all required MORPH-ACCESS headers', async () => {
    const body = { isValid: true, invalidReason: '', payer: '0x' }
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(body),
      json: async () => body,
    })

    await verifyPayment(MOCK_CREDS, MOCK_PAYLOAD, MOCK_REQUIREMENTS)

    const headers = mockFetch.mock.calls[0][1].headers
    expect(headers).toHaveProperty('MORPH-ACCESS-KEY')
    expect(headers).toHaveProperty('MORPH-ACCESS-TIMESTAMP')
    expect(headers).toHaveProperty('MORPH-ACCESS-SIGN')
    expect(headers['MORPH-ACCESS-KEY']).toBe(MOCK_CREDS.accessKey)
  })

  it('timestamp is recent (within 5 seconds)', async () => {
    const body = { isValid: true, invalidReason: '', payer: '0x' }
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(body),
      json: async () => body,
    })

    const before = Date.now()
    await verifyPayment(MOCK_CREDS, MOCK_PAYLOAD, MOCK_REQUIREMENTS)
    const after = Date.now()

    const ts = parseInt(mockFetch.mock.calls[0][1].headers['MORPH-ACCESS-TIMESTAMP'])
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)
  })
})
