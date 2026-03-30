---
name: morphcli-chain
description: "Morph L2 chain operations via morphcli — RPC queries (balance, nonce, gas price, block, tx details, contract call), Blockscout explorer (address info, tx history, token holdings, contract info, token search), alt-fee gas payment with ERC-20 tokens (tx type 0x7f), and EIP-7702 delegation management (delegate, send, batch, revoke). Use this skill whenever the user wants to query Morph chain data, look up transactions or blocks, check gas prices, explore address history on Morph, search or inspect tokens, query contract state, pay gas fees with ERC-20 tokens instead of ETH, or manage EIP-7702 delegations. Trigger when the user mentions 'Morph RPC', 'check nonce', 'gas price on Morph', 'look up tx hash', 'Morph explorer', 'Blockscout', 'token holders', 'alt-fee', 'altfee', 'pay gas with USDC', 'pay gas with BGB', 'tx type 0x7f', 'EIP-7702', '7702 delegation', 'batch call', 'revoke delegation', or wants any on-chain read from Morph L2."
---

# morphcli chain — RPC, Explorer, Alt-Fee & EIP-7702 on Morph L2

`morph-agent onchain` has four subgroups: `rpc` (real-time), `explorer` (Blockscout historical), `altfee` (ERC-20 gas payment), `7702` (EIP-7702 delegation).

- **Text output** by default; add `--json` for structured JSON
- Add `--hoodi` to switch to Morph Hoodi testnet (chain ID 2910)

## onchain rpc — Real-time Chain Queries

```bash
morph-agent onchain rpc balance --address 0x<addr>           # ETH balance
morph-agent onchain rpc nonce --address 0x<addr>             # Transaction count
morph-agent onchain rpc gas                                   # Current gas price
morph-agent onchain rpc block                                 # Latest block
morph-agent onchain rpc block --number 12345678               # Specific block
morph-agent onchain rpc tx --hash 0x<txhash>                  # Transaction details
morph-agent onchain rpc call --to 0x<addr> --data 0x<hex>    # Read-only contract call
```

Morph L2 gas is very low (~0.021 Gwei).

## onchain explorer — Blockscout Historical Queries

```bash
morph-agent onchain explorer address-info -a 0x<addr>        # Address overview
morph-agent onchain explorer txs -a 0x<addr> [--limit 20]    # Transaction history
morph-agent onchain explorer tokens -a 0x<addr>              # Token holdings
morph-agent onchain explorer tx --hash 0x<txhash>            # Transaction details
morph-agent onchain explorer token-search --query USDC       # Search tokens
morph-agent onchain explorer token-info --token 0x<addr>     # Token details
morph-agent onchain explorer contract -a 0x<addr>            # Contract info + ABI
```

### Morph Mainnet Token Addresses

| Symbol | Address | Decimals | Note |
|--------|---------|----------|------|
| **USDC** | `0xCfb1186F4e93D60E60a8bDd997427D1F33bc372B` | 6 | Native USDC (CLI default) |
| USDC.e | `0xe34c91815d7fc18A9e2148bcD4241d0a5848b693` | 6 | Bridged version |
| USDT | `0xe7cd86e13AC4309349F30B3435a9d337750fC82D` | 6 | Native USDT |
| BGB | `0x389C08Bc23A7317000a1FD76c7c5B0cb0b4640b5` | 18 | |
| WETH | `0x5300000000000000000000000000000000000011` | 18 | |

When the user says "USDC", use native USDC (`0xCfb1...72B`) unless bridged version is explicitly requested.

## onchain altfee — Pay Gas with ERC-20 (tx type 0x7f)

Morph supports paying gas with ERC-20 tokens via tx type `0x7f`. TokenRegistry predeploy at `0x5300000000000000000000000000000000000021`.

```bash
morph-agent onchain altfee tokens                              # List supported fee tokens
morph-agent onchain altfee token-info --id 6                   # Specific token details
morph-agent onchain altfee estimate --id 6 [--gas-limit 21000] # Estimate fee
```

### Recommended Fee Token IDs (Mainnet)

| ID | Token |
|----|-------|
| 4  | BGB   |
| 5  | USDT  |
| 6  | USDC  |

Add `--altfee <id>` to any write command to use alt-fee:
```bash
morph-agent wallet transfer --to 0x... --amount 0.1 --altfee 5
```

## Network Info

| Network | Chain ID | RPC | Blockscout API |
|---------|----------|-----|----------------|
| Morph Mainnet | 2818 | `https://rpc-quicknode.morph.network` | `https://explorer-api.morph.network/api/v2` |
| Morph Hoodi | 2910 | `https://rpc-hoodi.morph.network` | `https://explorer-api-hoodi.morph.network/api/v2` |

## onchain 7702 — EIP-7702 Delegation Query

```bash
morph-agent onchain 7702 delegate --address 0x<addr>        # Check if delegated
```

Output shows `isDelegated: true/false` and `delegateContract` address (e.g., SimpleDelegation `0x6Dbe...C1E5`).

To **use** EIP-7702 delegation in write commands, add `--eip7702`:
```bash
morph-agent wallet transfer -w <wallet> --to 0x<addr> --amount 0.1 --eip7702
```

Both PK and SL wallets support `--eip7702`. SL wallets sign EIP-7702 authorization via BGW `EthSign:{hash}`.

**Note**: For self-delegation (sender == authority), auth nonce must be `txNonce + 1` due to geth nonce ordering. This is handled automatically by morphcli.

## Safety

- Fee estimates include 10% buffer but do NOT include L1 data fee
- Always confirm with user before broadcasting
