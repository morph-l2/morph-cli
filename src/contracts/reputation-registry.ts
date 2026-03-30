/**
 * ERC-8004 ReputationRegistryUpgradeable — ABI & Address
 *
 * Contract: ERC1967Proxy → ReputationRegistryUpgradeable
 * On-chain feedback: give feedback, read, summarize
 * CREATE2 deterministic address (same on all ERC-8004 chains)
 */

export const REPUTATION_REGISTRY = '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63' as const

export const REPUTATION_ABI = [
  { type: 'function', name: 'giveFeedback', inputs: [{ name: 'agentId', type: 'uint256' }, { name: 'value', type: 'int128' }, { name: 'valueDecimals', type: 'uint8' }, { name: 'tag1', type: 'string' }, { name: 'tag2', type: 'string' }, { name: 'endpoint', type: 'string' }, { name: 'feedbackURI', type: 'string' }, { name: 'feedbackHash', type: 'bytes32' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'readFeedback', inputs: [{ name: 'agentId', type: 'uint256' }, { name: 'clientAddress', type: 'address' }, { name: 'feedbackIndex', type: 'uint64' }], outputs: [{ name: 'value', type: 'int128' }, { name: 'valueDecimals', type: 'uint8' }, { name: 'tag1', type: 'string' }, { name: 'tag2', type: 'string' }, { name: 'isRevoked', type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'getSummary', inputs: [{ name: 'agentId', type: 'uint256' }, { name: 'clientAddresses', type: 'address[]' }, { name: 'tag1', type: 'string' }, { name: 'tag2', type: 'string' }], outputs: [{ name: 'count', type: 'uint64' }, { name: 'summaryValue', type: 'int128' }, { name: 'summaryValueDecimals', type: 'uint8' }], stateMutability: 'view' },
  { type: 'function', name: 'getClients', inputs: [{ name: 'agentId', type: 'uint256' }], outputs: [{ name: 'clientList', type: 'address[]' }], stateMutability: 'view' },
  { type: 'function', name: 'getLastIndex', inputs: [{ name: 'agentId', type: 'uint256' }, { name: 'clientAddress', type: 'address' }], outputs: [{ name: 'lastIndex', type: 'uint64' }], stateMutability: 'view' },
  { type: 'function', name: 'getIdentityRegistry', inputs: [], outputs: [{ name: 'registry', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'readAllFeedback', inputs: [{ name: 'agentId', type: 'uint256' }, { name: 'clientAddresses', type: 'address[]' }, { name: 'tag1', type: 'string' }, { name: 'tag2', type: 'string' }, { name: 'includeRevoked', type: 'bool' }], outputs: [{ name: 'clients', type: 'address[]' }, { name: 'indices', type: 'uint64[]' }, { name: 'values', type: 'int128[]' }, { name: 'decimals', type: 'uint8[]' }, { name: 'tag1s', type: 'string[]' }, { name: 'tag2s', type: 'string[]' }, { name: 'revoked', type: 'bool[]' }], stateMutability: 'view' },
  { type: 'function', name: 'revokeFeedback', inputs: [{ name: 'agentId', type: 'uint256' }, { name: 'feedbackIndex', type: 'uint64' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'appendResponse', inputs: [{ name: 'agentId', type: 'uint256' }, { name: 'clientAddress', type: 'address' }, { name: 'feedbackIndex', type: 'uint64' }, { name: 'responseURI', type: 'string' }, { name: 'responseHash', type: 'bytes32' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'getResponseCount', inputs: [{ name: 'agentId', type: 'uint256' }, { name: 'clientAddress', type: 'address' }, { name: 'feedbackIndex', type: 'uint64' }, { name: 'responders', type: 'address[]' }], outputs: [{ name: 'count', type: 'uint64' }], stateMutability: 'view' },
] as const
