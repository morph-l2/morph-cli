import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock fetch globally ─────────────────────────────────────────────────────

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// ─── Mock wallet decrypt ─────────────────────────────────────────────────────

vi.mock('../../src/lib/wallet/keystore.js', () => ({
  decrypt: () => '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
}))

import { probeX402, signEIP3009, getSupported } from '../../src/lib/agentpay/x402/client.js'
import type { PaymentRequirements } from '../../src/lib/agentpay/x402/client.js'
import type { WalletData } from '../../src/lib/wallet/keystore.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MOCK_WALLET: WalletData = {
  name: 'test',
  address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  privateKey: { nonce: '', ciphertext: '', tag: '' },
  createdAt: new Date().toISOString(),
}

const MOCK_REQUIREMENTS: PaymentRequirements = {
  scheme: 'exact',
  network: 'eip155:2818',
  amount: '1000',
  asset: '0xCfb1186F4e93D60E60a8bDd997427D1F33bc372B',
  payTo: '0x98a55f86E1a57bBf28e4eA9dD719874075Fe6513',
  extra: { name: 'USD Coin', version: '1' },
}

beforeEach(() => {
  mockFetch.mockReset()
})

// ─── probeX402 ───────────────────────────────────────────────────────────────

describe('probeX402', () => {
  it('returns requiresPayment=false for non-402 response', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      headers: new Headers(),
    })

    const result = await probeX402('https://example.com/api')
    expect(result.requiresPayment).toBe(false)
    expect(result.status).toBe(200)
    expect(result.url).toBe('https://example.com/api')
  })

  it('returns requiresPayment=true with paymentRequirements for 402', async () => {
    mockFetch.mockResolvedValue({
      status: 402,
      headers: new Headers(),
      json: async () => ({
        x402Version: 2,
        paymentRequirements: [MOCK_REQUIREMENTS],
        error: 'Payment Required',
      }),
    })

    const result = await probeX402('https://example.com/paid')
    expect(result.requiresPayment).toBe(true)
    expect(result.status).toBe(402)
    expect(result.paymentRequirements).toHaveLength(1)
    expect(result.paymentRequirements![0].payTo).toBe(MOCK_REQUIREMENTS.payTo)
    expect(result.paymentRequirements![0].amount).toBe('1000')
  })

  it('parses single payment requirement object (not array)', async () => {
    mockFetch.mockResolvedValue({
      status: 402,
      headers: new Headers(),
      json: async () => ({
        payTo: '0xABCD',
        scheme: 'exact',
        network: 'eip155:2818',
        amount: '500',
      }),
    })

    const result = await probeX402('https://example.com/single')
    expect(result.requiresPayment).toBe(true)
    expect(result.paymentRequirements).toHaveLength(1)
    expect(result.paymentRequirements![0].payTo).toBe('0xABCD')
  })

  it('falls back to x-payment header when body has no requirements', async () => {
    mockFetch.mockResolvedValue({
      status: 402,
      headers: new Headers({
        'x-payment': JSON.stringify([MOCK_REQUIREMENTS]),
      }),
      json: async () => ({ error: 'payment required' }),
    })

    const result = await probeX402('https://example.com/header')
    expect(result.requiresPayment).toBe(true)
    expect(result.paymentRequirements).toHaveLength(1)
    expect(result.rawHeaders).toHaveProperty('x-payment')
  })

  it('handles non-JSON 402 response gracefully', async () => {
    mockFetch.mockResolvedValue({
      status: 402,
      headers: new Headers(),
      json: async () => { throw new Error('not json') },
    })

    const result = await probeX402('https://example.com/text')
    expect(result.requiresPayment).toBe(true)
    expect(result.paymentRequirements).toBeUndefined()
  })
})

// ─── signEIP3009 ─────────────────────────────────────────────────────────────

describe('signEIP3009', () => {
  it('returns valid payment payload with signature', async () => {
    const payload = await signEIP3009(MOCK_WALLET, MOCK_REQUIREMENTS)

    expect(payload.x402Version).toBe(2)
    expect(payload.accepted.scheme).toBe('exact')
    expect(payload.accepted.network).toBe('eip155:2818')
    expect(payload.payload.signature).toMatch(/^0x[0-9a-fA-F]+$/)
    expect(payload.payload.authorization.to).toBe(MOCK_REQUIREMENTS.payTo)
    expect(payload.payload.authorization.value).toBe('1000')
    expect(payload.payload.authorization.nonce).toMatch(/^0x/)
  })

  it('uses amount field from requirements', async () => {
    const payload = await signEIP3009(MOCK_WALLET, {
      ...MOCK_REQUIREMENTS,
      amount: '5000',
    })
    expect(payload.payload.authorization.value).toBe('5000')
  })

  it('falls back to maxAmountRequired when amount is undefined', async () => {
    const { amount, ...rest } = MOCK_REQUIREMENTS
    const payload = await signEIP3009(MOCK_WALLET, {
      ...rest,
      maxAmountRequired: '2000',
    })
    expect(payload.payload.authorization.value).toBe('2000')
  })

  it('validBefore is ~1 hour in the future', async () => {
    const payload = await signEIP3009(MOCK_WALLET, MOCK_REQUIREMENTS)
    const validBefore = parseInt(payload.payload.authorization.validBefore)
    const now = Math.floor(Date.now() / 1000)
    expect(validBefore).toBeGreaterThan(now + 3500)
    expect(validBefore).toBeLessThan(now + 3700)
  })

  it('different calls produce different nonces', async () => {
    const p1 = await signEIP3009(MOCK_WALLET, MOCK_REQUIREMENTS)
    // Small delay to ensure Date.now() differs
    await new Promise(r => setTimeout(r, 5))
    const p2 = await signEIP3009(MOCK_WALLET, MOCK_REQUIREMENTS)
    expect(p1.payload.authorization.nonce).not.toBe(p2.payload.authorization.nonce)
  })
})

// ─── getSupported ────────────────────────────────────────────────────────────

describe('getSupported', () => {
  it('returns supported payment methods from facilitator', async () => {
    const mockData = {
      kinds: [{ x402Version: 2, scheme: 'exact', network: 'eip155:2818' }],
      extensions: [],
      signers: {},
    }
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockData,
    })

    const result = await getSupported()
    expect(result.kinds).toHaveLength(1)
    expect(result.kinds[0].network).toBe('eip155:2818')
  })

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    })

    await expect(getSupported()).rejects.toThrow('Facilitator /v2/supported returned 500')
  })
})
