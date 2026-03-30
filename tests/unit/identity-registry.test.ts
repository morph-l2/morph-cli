import { describe, it, expect } from 'vitest'
import { encodeFunctionData, toHex } from 'viem'
import {
  encodeRegister,
  encodeSetMetadata,
  encodeSetAgentURI,
  encodeGiveFeedback,
} from '../../src/lib/agentpay/identity/registry.js'
import { IDENTITY_REGISTRY, IDENTITY_ABI } from '../../src/contracts/identity-registry.js'
import { REPUTATION_REGISTRY, REPUTATION_ABI } from '../../src/contracts/reputation-registry.js'

// ─── Contract addresses ──────────────────────────────────────────────────────

describe('contract addresses', () => {
  it('IDENTITY_REGISTRY is valid checksum address', () => {
    expect(IDENTITY_REGISTRY).toMatch(/^0x[0-9a-fA-F]{40}$/)
    expect(IDENTITY_REGISTRY).toBe('0x8004A169FB4a3325136EB29fA0ceB6D2e539a432')
  })

  it('REPUTATION_REGISTRY is valid checksum address', () => {
    expect(REPUTATION_REGISTRY).toMatch(/^0x[0-9a-fA-F]{40}$/)
    expect(REPUTATION_REGISTRY).toBe('0x8004BAa17C55a88189AE136b182e5fdA19dE9b63')
  })
})

// ─── ABI structure ───────────────────────────────────────────────────────────

describe('IDENTITY_ABI', () => {
  it('has register function (3 overloads)', () => {
    const registerFns = IDENTITY_ABI.filter(f => f.name === 'register')
    expect(registerFns).toHaveLength(3)
  })

  it('has ownerOf, balanceOf, tokenURI view functions', () => {
    const viewFns = ['ownerOf', 'balanceOf', 'tokenURI']
    for (const fn of viewFns) {
      expect(IDENTITY_ABI.some(f => f.name === fn)).toBe(true)
    }
  })

  it('has metadata functions (getMetadata, setMetadata)', () => {
    expect(IDENTITY_ABI.some(f => f.name === 'getMetadata')).toBe(true)
    expect(IDENTITY_ABI.some(f => f.name === 'setMetadata')).toBe(true)
  })

  it('has getVersion and owner admin functions', () => {
    expect(IDENTITY_ABI.some(f => f.name === 'getVersion')).toBe(true)
    expect(IDENTITY_ABI.some(f => f.name === 'owner')).toBe(true)
  })
})

describe('REPUTATION_ABI', () => {
  it('has giveFeedback function', () => {
    expect(REPUTATION_ABI.some(f => f.name === 'giveFeedback')).toBe(true)
  })

  it('has getSummary with correct inputs', () => {
    const fn = REPUTATION_ABI.find(f => f.name === 'getSummary')
    expect(fn).toBeDefined()
    expect(fn!.inputs).toHaveLength(4) // agentId, clientAddresses[], tag1, tag2
    expect(fn!.inputs[1].type).toBe('address[]')
  })

  it('has getClients function', () => {
    expect(REPUTATION_ABI.some(f => f.name === 'getClients')).toBe(true)
  })
})

// ─── Calldata encoding ──────────────────────────────────────────────────────

describe('encodeRegister', () => {
  it('encodes register() without URI', () => {
    const data = encodeRegister()
    expect(data).toMatch(/^0x/)
    expect(data.length).toBeGreaterThanOrEqual(10) // 0x + 4-byte selector
  })

  it('encodes register(uri) with URI', () => {
    const data = encodeRegister('https://example.com/agent.json')
    expect(data).toMatch(/^0x/)
    expect(data.length).toBeGreaterThan(10)
    // Should be different from no-arg version (different function selector)
    const noUri = encodeRegister()
    expect(data.slice(0, 10)).not.toBe(noUri.slice(0, 10))
  })
})

describe('encodeSetMetadata', () => {
  it('encodes setMetadata calldata correctly', () => {
    const data = encodeSetMetadata(1, 'name', 'TestAgent')
    expect(data).toMatch(/^0x/)
    expect(data.length).toBeGreaterThan(10)
  })
})

describe('encodeSetAgentURI', () => {
  it('encodes setAgentURI calldata correctly', () => {
    const data = encodeSetAgentURI(1, 'https://new-uri.com')
    expect(data).toMatch(/^0x/)
    expect(data.length).toBeGreaterThan(10)
  })
})

describe('encodeGiveFeedback', () => {
  it('encodes giveFeedback calldata with defaults', () => {
    const data = encodeGiveFeedback(1, 100)
    expect(data).toMatch(/^0x/)
    expect(data.length).toBeGreaterThan(10)
  })

  it('encodes giveFeedback calldata with tags', () => {
    const data = encodeGiveFeedback(1, 100, 'quality', 'fast', 'https://api.com', 'ipfs://Qm...')
    expect(data).toMatch(/^0x/)
    // Should be different (longer) than default version
    const defaultData = encodeGiveFeedback(1, 100)
    expect(data.length).toBeGreaterThanOrEqual(defaultData.length)
  })
})
