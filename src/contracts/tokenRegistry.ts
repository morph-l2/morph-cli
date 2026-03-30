/** Morph TokenRegistry (0x5300...0021) ABI — alt-fee token management */
export const TOKEN_REGISTRY_ABI = [
  {
    name: 'getTokenList',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{
      name: '',
      type: 'tuple[]',
      components: [
        { name: 'tokenID', type: 'uint16' },
        { name: 'tokenAddress', type: 'address' },
      ],
    }],
  },
  {
    name: 'getTokenInfo',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint16' }],
    outputs: [
      {
        name: 'info',
        type: 'tuple',
        components: [
          { name: 'tokenAddress', type: 'address' },
          { name: 'balanceSlot', type: 'bytes32' },
          { name: 'isActive', type: 'bool' },
          { name: 'decimals', type: 'uint8' },
          { name: 'scale', type: 'uint256' },
        ],
      },
      { name: 'hasBalanceSlot', type: 'bool' },
    ],
  },
  {
    name: 'priceRatio',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint16' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const
