/**
 * ERC-8004 IdentityRegistryUpgradeable v2.0.0 — ABI & Address
 *
 * Contract: ERC1967Proxy → IdentityRegistryUpgradeable
 * NFT-based agent identity: register, metadata, wallet binding
 * CREATE2 deterministic address (same on all ERC-8004 chains)
 */

export const IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as const

export const IDENTITY_ABI = [
  { type: 'function', name: 'register', inputs: [], outputs: [{ name: 'agentId', type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'register', inputs: [{ name: 'agentURI', type: 'string' }], outputs: [{ name: 'agentId', type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'register', inputs: [{ name: 'agentURI', type: 'string' }, { name: 'metadata', type: 'tuple[]', components: [{ name: 'metadataKey', type: 'string' }, { name: 'metadataValue', type: 'bytes' }] }], outputs: [{ name: 'agentId', type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'ownerOf', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'tokenURI', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ name: '', type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'name', inputs: [], outputs: [{ name: '', type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'symbol', inputs: [], outputs: [{ name: '', type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'getMetadata', inputs: [{ name: 'agentId', type: 'uint256' }, { name: 'metadataKey', type: 'string' }], outputs: [{ name: 'metadataValue', type: 'bytes' }], stateMutability: 'view' },
  { type: 'function', name: 'setMetadata', inputs: [{ name: 'agentId', type: 'uint256' }, { name: 'metadataKey', type: 'string' }, { name: 'metadataValue', type: 'bytes' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'setAgentURI', inputs: [{ name: 'agentId', type: 'uint256' }, { name: 'newURI', type: 'string' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'getAgentWallet', inputs: [{ name: 'agentId', type: 'uint256' }], outputs: [{ name: 'wallet', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'getVersion', inputs: [], outputs: [{ name: '', type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'owner', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'isAuthorizedOrOwner', inputs: [{ name: 'spender', type: 'address' }, { name: 'agentId', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'agentExists', inputs: [{ name: 'agentId', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'totalAgents', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'setAgentWallet', inputs: [{ name: 'agentId', type: 'uint256' }, { name: 'newWallet', type: 'address' }, { name: 'deadline', type: 'uint256' }, { name: 'signature', type: 'bytes' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'unsetAgentWallet', inputs: [{ name: 'agentId', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
] as const
