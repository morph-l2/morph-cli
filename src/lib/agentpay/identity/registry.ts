/**
 * ERC-8004 Agent Identity & Reputation on Morph L2
 *
 * IdentityRegistry (ERC1967Proxy → IdentityRegistryUpgradeable v2.0.0)
 *   NFT-based agent identity: register, metadata, wallet binding
 *
 * ReputationRegistry (ERC1967Proxy → ReputationRegistryUpgradeable)
 *   On-chain feedback: give feedback, read, summarize
 *
 * NFT info: name="AgentIdentity", symbol="AGENT"
 */
import { encodeFunctionData, toHex } from 'viem'
import { getPublicClient } from '../../utils/rpc.js'
import { IDENTITY_REGISTRY, IDENTITY_ABI } from '../../../contracts/identity-registry.js'
import { REPUTATION_REGISTRY, REPUTATION_ABI } from '../../../contracts/reputation-registry.js'

export { IDENTITY_REGISTRY, REPUTATION_REGISTRY }

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Return true only for contract-level revert errors; rethrow network/RPC errors */
function isContractRevert(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    if (msg.includes('reverted') || msg.includes('execution')) return true
    // If the message doesn't look like a revert, it's probably a network error
    return false
  }
  return false
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AgentInfo {
  agentId: string
  exists: boolean
  owner?: string
  uri?: string
  wallet?: string
}

export interface RegistryInfo {
  name: string
  symbol: string
  version: string
  owner: string
  identityRegistry: string
  reputationRegistry: string
}

export interface AgentReputation {
  agentId: string
  feedbackCount: string
  summaryValue: string
  summaryDecimals: number
  clients: string[]
}

// ─── Identity: Read ──────────────────────────────────────────────────────────

/** Get registry info (name, symbol, version, owner) */
export async function getRegistryInfo(): Promise<RegistryInfo> {
  const client = getPublicClient()

  const [name, symbol, version, owner] = await Promise.all([
    client.readContract({ address: IDENTITY_REGISTRY, abi: IDENTITY_ABI, functionName: 'name' }) as Promise<string>,
    client.readContract({ address: IDENTITY_REGISTRY, abi: IDENTITY_ABI, functionName: 'symbol' }) as Promise<string>,
    client.readContract({ address: IDENTITY_REGISTRY, abi: IDENTITY_ABI, functionName: 'getVersion' }) as Promise<string>,
    client.readContract({ address: IDENTITY_REGISTRY, abi: IDENTITY_ABI, functionName: 'owner' }) as Promise<string>,
  ])

  return {
    name, symbol, version, owner,
    identityRegistry: IDENTITY_REGISTRY,
    reputationRegistry: REPUTATION_REGISTRY,
  }
}

/** Get agent info by ID */
export async function getAgentInfo(agentId: number): Promise<AgentInfo> {
  const client = getPublicClient()
  const id = BigInt(agentId)

  // No agentExists() in v2 — try ownerOf and catch revert
  try {
    const owner = await client.readContract({
      address: IDENTITY_REGISTRY, abi: IDENTITY_ABI, functionName: 'ownerOf', args: [id],
    }) as string

    const [uri, wallet] = await Promise.all([
      client.readContract({ address: IDENTITY_REGISTRY, abi: IDENTITY_ABI, functionName: 'tokenURI', args: [id] }).catch((err) => { if (!isContractRevert(err)) throw err; return '' }) as Promise<string>,
      client.readContract({ address: IDENTITY_REGISTRY, abi: IDENTITY_ABI, functionName: 'getAgentWallet', args: [id] }).catch((err) => { if (!isContractRevert(err)) throw err; return '0x0000000000000000000000000000000000000000' }) as Promise<string>,
    ])

    return {
      agentId: agentId.toString(),
      exists: true,
      owner,
      uri: uri || undefined,
      wallet: wallet === '0x0000000000000000000000000000000000000000' ? undefined : wallet,
    }
  } catch (err) {
    if (!isContractRevert(err)) throw err
    return { agentId: agentId.toString(), exists: false }
  }
}

/** Get agent metadata by key */
export async function getAgentMetadata(agentId: number, key: string): Promise<string> {
  const client = getPublicClient()
  const result = await client.readContract({
    address: IDENTITY_REGISTRY,
    abi: IDENTITY_ABI,
    functionName: 'getMetadata',
    args: [BigInt(agentId), key],
  }) as `0x${string}`

  if (!result || result === '0x') return ''
  try {
    return Buffer.from(result.slice(2), 'hex').toString('utf8')
  } catch {
    return result
  }
}

/** Get number of agents owned by an address */
export async function getAgentBalance(address: string): Promise<string> {
  const client = getPublicClient()
  const result = await client.readContract({
    address: IDENTITY_REGISTRY,
    abi: IDENTITY_ABI,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
  }) as bigint
  return result.toString()
}

/** Get total number of registered agents (may not be supported on all deployments) */
export async function getTotalAgents(): Promise<string> {
  const client = getPublicClient()
  try {
    const result = await client.readContract({
      address: IDENTITY_REGISTRY,
      abi: IDENTITY_ABI,
      functionName: 'totalAgents',
    }) as bigint
    return result.toString()
  } catch (err) {
    if (!isContractRevert(err)) throw err
    throw new Error('totalAgents() not supported on this contract deployment. Try querying individual agent IDs.')
  }
}

// ─── Identity: Write (returns calldata for signing) ──────────────────────────

/** Encode register() calldata */
export function encodeRegister(uri?: string): `0x${string}` {
  if (uri) {
    return encodeFunctionData({
      abi: IDENTITY_ABI,
      functionName: 'register',
      args: [uri],
    })
  }
  return encodeFunctionData({
    abi: IDENTITY_ABI,
    functionName: 'register',
    args: [],
  })
}

/** Encode setMetadata() calldata */
export function encodeSetMetadata(agentId: number, key: string, value: string): `0x${string}` {
  const valueBytes = toHex(new TextEncoder().encode(value)) as `0x${string}`
  return encodeFunctionData({
    abi: IDENTITY_ABI,
    functionName: 'setMetadata',
    args: [BigInt(agentId), key, valueBytes],
  })
}

/** Encode setAgentURI() calldata */
export function encodeSetAgentURI(agentId: number, newURI: string): `0x${string}` {
  return encodeFunctionData({
    abi: IDENTITY_ABI,
    functionName: 'setAgentURI',
    args: [BigInt(agentId), newURI],
  })
}

// ─── Reputation: Read ────────────────────────────────────────────────────────

/** Get reputation summary for an agent */
export async function getReputationSummary(agentId: number): Promise<AgentReputation> {
  const client = getPublicClient()
  const id = BigInt(agentId)

  // Step 1: get clients first (getSummary requires non-empty clientAddresses)
  const clients = await client.readContract({
    address: REPUTATION_REGISTRY, abi: REPUTATION_ABI,
    functionName: 'getClients', args: [id],
  }) as string[]

  // Step 2: if no clients, return empty summary
  if (!clients || clients.length === 0) {
    return {
      agentId: agentId.toString(),
      feedbackCount: '0',
      summaryValue: '0',
      summaryDecimals: 0,
      clients: [],
    }
  }

  // Step 3: get summary with actual client addresses
  const summary = await client.readContract({
    address: REPUTATION_REGISTRY, abi: REPUTATION_ABI,
    functionName: 'getSummary', args: [id, clients as `0x${string}`[], '', ''],
  }) as [bigint, bigint, number]

  return {
    agentId: agentId.toString(),
    feedbackCount: summary[0].toString(),
    summaryValue: summary[1].toString(),
    summaryDecimals: summary[2],
    clients: clients as string[],
  }
}

// ─── Reputation: Write (returns calldata for signing) ─────────────────────────

/** Encode giveFeedback() calldata */
export function encodeGiveFeedback(
  agentId: number, value: number,
  tag1 = '', tag2 = '', endpoint = '', feedbackURI = '',
): `0x${string}` {
  const feedbackHash = '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`
  return encodeFunctionData({
    abi: REPUTATION_ABI,
    functionName: 'giveFeedback',
    args: [BigInt(agentId), BigInt(value), 0, tag1, tag2, endpoint, feedbackURI, feedbackHash],
  })
}

/** Encode revokeFeedback() calldata */
export function encodeRevokeFeedback(agentId: number, feedbackIndex: number): `0x${string}` {
  return encodeFunctionData({
    abi: REPUTATION_ABI,
    functionName: 'revokeFeedback',
    args: [BigInt(agentId), BigInt(feedbackIndex)],
  })
}

/** Encode appendResponse() calldata */
export function encodeAppendResponse(
  agentId: number, clientAddress: string, feedbackIndex: number,
  responseURI: string, responseHash = '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
): `0x${string}` {
  return encodeFunctionData({
    abi: REPUTATION_ABI,
    functionName: 'appendResponse',
    args: [BigInt(agentId), clientAddress as `0x${string}`, BigInt(feedbackIndex), responseURI, responseHash],
  })
}

/** Encode setAgentWallet() calldata — requires EIP-712 signature from newWallet */
export function encodeSetAgentWallet(
  agentId: number, newWallet: string, deadline: bigint, signature: `0x${string}`,
): `0x${string}` {
  return encodeFunctionData({
    abi: IDENTITY_ABI,
    functionName: 'setAgentWallet',
    args: [BigInt(agentId), newWallet as `0x${string}`, deadline, signature],
  })
}

/** Encode unsetAgentWallet() calldata */
export function encodeUnsetAgentWallet(agentId: number): `0x${string}` {
  return encodeFunctionData({
    abi: IDENTITY_ABI,
    functionName: 'unsetAgentWallet',
    args: [BigInt(agentId)],
  })
}

/** Read single feedback entry */
export async function readFeedback(
  agentId: number, clientAddress: string, feedbackIndex: number,
): Promise<{ value: string; valueDecimals: number; tag1: string; tag2: string; isRevoked: boolean }> {
  const client = getPublicClient()
  const result = await client.readContract({
    address: REPUTATION_REGISTRY, abi: REPUTATION_ABI,
    functionName: 'readFeedback',
    args: [BigInt(agentId), clientAddress as `0x${string}`, BigInt(feedbackIndex)],
  }) as [bigint, number, string, string, boolean]
  return {
    value: result[0].toString(),
    valueDecimals: result[1],
    tag1: result[2],
    tag2: result[3],
    isRevoked: result[4],
  }
}

/** Read all feedback for an agent */
export async function readAllFeedback(
  agentId: number, includeRevoked = false,
): Promise<Array<{ client: string; index: string; value: string; decimals: number; tag1: string; tag2: string; revoked: boolean }>> {
  const client = getPublicClient()
  const id = BigInt(agentId)

  // Get clients first
  const clients = await client.readContract({
    address: REPUTATION_REGISTRY, abi: REPUTATION_ABI,
    functionName: 'getClients', args: [id],
  }) as string[]

  if (!clients || clients.length === 0) return []

  const result = await client.readContract({
    address: REPUTATION_REGISTRY, abi: REPUTATION_ABI,
    functionName: 'readAllFeedback',
    args: [id, clients as `0x${string}`[], '', '', includeRevoked],
  }) as [string[], bigint[], bigint[], number[], string[], string[], boolean[]]

  const feedbacks: Array<{ client: string; index: string; value: string; decimals: number; tag1: string; tag2: string; revoked: boolean }> = []
  for (let i = 0; i < result[0].length; i++) {
    feedbacks.push({
      client: result[0][i],
      index: result[1][i].toString(),
      value: result[2][i].toString(),
      decimals: result[3][i],
      tag1: result[4][i],
      tag2: result[5][i],
      revoked: result[6][i],
    })
  }
  return feedbacks
}

export { IDENTITY_ABI, REPUTATION_ABI }
