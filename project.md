# MorphCLI Project Documentation

## Overview

`morph-agent` is a Morph L2 blockchain CLI tool designed for AI Agents and developers. It provides wallet management, on-chain operations, DeFi ecosystem interaction, and Agent payment/identity management.

- **Package**: morphcli@0.1.0
- **Entry**: src/index.ts -> dist/index.js
- **Runtime**: Node.js 22+
- **Stack**: TypeScript + Commander.js + Viem + tsup

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    morph-agent CLI                       │
│                   (Commander.js)                         │
├──────────┬──────────┬──────────┬────────────────────────┤
│  wallet  │  onchain │   eco    │      agentpay          │
│   (L1)   │   (L2)   │  (L3)   │       (L4)             │
├──────────┼──────────┼──────────┼────────────────────────┤
│ keystore │ rpc      │ swap     │ x402 (EIP-3009)        │
│ AES-256  │ explorer │ bridge   │ identity (ERC-8004)    │
│          │ altfee   │          │                        │
│          │ 7702     │          │                        │
├──────────┴──────────┴──────────┴────────────────────────┤
│              lib/ shared infrastructure                  │
│  rpc.ts | signer.ts | tx-sender.ts | output.ts          │
│  config.ts | http.ts | altfee.ts | eip7702.ts           │
└─────────────────────────────────────────────────────────┘
```

## Command Structure (4 Layers)

### 1. wallet (L1) — Wallet Management

| Subcommand | Description |
|------------|-------------|
| `create` | Create new wallet (AES-256-GCM encrypted storage) |
| `import` | Import private key |
| `list` | List all wallets (private-key wallets) |
| `address` | Show wallet address |
| `remove` | Delete wallet |
| `balance` | Query balance (supports both private-key and Social Login wallets) |
| `transfer` | Transfer ETH/token (supports both private-key and Social Login wallets) |
| `default` | Set/view default wallet |
| `sl` | Bind Bitget Social Login wallet (TEE-hosted signing) |
| `sl-list` | List all Social Login wallets |
| `sl-remove` | Remove Social Login wallet |

### 2. onchain (L2) — On-chain Operations

#### rpc — Direct RPC calls
| Subcommand | Description |
|------------|-------------|
| `balance` | Query address balance |
| `nonce` | Query nonce |
| `gas` | Query gas price |
| `block` | Query block info |
| `tx` | Query transaction details |
| `call` | Read-only contract call |

#### explorer — Block Explorer API
| Subcommand | Description |
|------------|-------------|
| `address-info` | Address information |
| `txs` | Transaction list |
| `tokens` | Token list |
| `tx` | Transaction details |
| `token-search` | Token search |
| `token-info` | Token information |
| `contract` | Contract information |

#### altfee — Alternative Gas Token Payment (tx type 0x7f)
| Subcommand | Description |
|------------|-------------|
| `tokens` | List supported tokens |
| `token-info` | Token details |
| `estimate` | Estimate fee |
| `send` | Send altfee transaction |

#### 7702 — EIP-7702 Delegation + Batch Call (tx type 0x04)
| Subcommand | Description |
|------------|-------------|
| `delegate` | Check EOA delegation status (isDelegated, delegateContract) |
| `authorize` | Sign authorization only, no tx sent (PK wallet only) |
| `send` | Send single call via 7702 delegation (`-w`/`--sl`, dry-run by default) |
| `batch` | Atomic batch call via SimpleDelegation (`-w`/`--sl`, dry-run by default) |
| `revoke` | Revoke delegation, set delegate to address(0) (`-w`/`--sl`, dry-run by default) |

> `--eip7702` flag is also available on all write commands (wallet transfer, eco swap, agentpay identity, etc.) as a shortcut for single-call 7702 sends.

### 3. eco (L3) — DeFi Ecosystem

#### swap — DEX Aggregated Trading (Bulbaswap)
| Subcommand | Description |
|------------|-------------|
| `quote` | Get quote (add `--recipient` to get executable calldata) |
| `send` | Execute swap (`-w`/`--sl`, `--altfee`/`--eip7702`) |
| `approve` | Approve token spending (`-w`/`--sl`, `--altfee`/`--eip7702`) |
| `allowance` | Query allowance (`-w`/`--sl`, read-only) |

#### bridge — Cross-chain Bridge
| Subcommand | Description |
|------------|-------------|
| `chains` | Supported chains |
| `tokens` | Supported tokens |
| `token-search` | Search tokens |
| `quote` | Get quote |
| `balance` | Query balance |
| `login` | Login |
| `make-order` | Create order |
| `submit-order` | Submit order |
| `swap` | One-click cross-chain swap |
| `order` | Query order |
| `history` | Order history |

### 4. agentpay (L4) — Agent Payments & Identity

#### x402 — HTTP 402 Payment Protocol (EIP-3009)
| Subcommand | Description |
|------------|-------------|
| `supported` | Query supported resources |
| `discover` | Discover payment endpoints |
| `pay` | Execute payment |
| `config` | Configuration management |
| `verify` | Verify payment |
| `settle` | Settle on-chain |
| `register` | Merchant registration |
| `server` | Start local x402 merchant server (dev/testing) |

#### identity — ERC-8004 Agent Identity & Reputation
| Subcommand | Description |
|------------|-------------|
| `registry` | Registry information (read) |
| `info` | Agent info query (read) |
| `balance` | Agent count by address (read) |
| `total` | Total supply (read) |
| `metadata` | Read metadata (read) |
| `reputation` | Reputation summary (read) |
| `read-feedback` | Single feedback entry (read) |
| `reviews` | All feedback list (read) |
| `register` | Register agent, mint NFT (`-w`/`--sl`, `--altfee`/`--eip7702`) |
| `set-metadata` | Set metadata key-value (`-w`/`--sl`, `--altfee`/`--eip7702`) |
| `set-uri` | Set agent URI (`-w`/`--sl`, `--altfee`/`--eip7702`) |
| `set-wallet` | Bind operational wallet (`-w`/`--sl`, `--altfee`/`--eip7702`) |
| `unset-wallet` | Unbind wallet (`-w`/`--sl`, `--altfee`/`--eip7702`) |
| `feedback` | Submit feedback (`-w`/`--sl`, `--altfee`/`--eip7702`) |
| `revoke-feedback` | Revoke feedback (`-w`/`--sl`, `--altfee`/`--eip7702`) |
| `append-response` | Respond to feedback (`-w`/`--sl`, `--altfee`/`--eip7702`) |

## Core Features

- **Encrypted Wallet Storage**: AES-256-GCM encrypted, stored at `~/.morph-agent/wallets/` (private-key) and `~/.morph-agent/social-wallets/` (Social Login)
- **Social Login Wallet**: Bitget TEE-hosted private keys; agent only needs appid/appsecret credentials to call the signing API (bind with `wallet sl`)
- **Dual Wallet Types**: All write commands auto-detect wallet type via `-n` name (checks private-key wallet first, then Social Login)
- **Default Wallet**: First wallet created is automatically set as default
- **Dry-run Mode**: All write operations default to dry-run; use `--broadcast` to actually send
- **Output Format**: Default text output; use `--json` to switch to JSON
- **Testnet Support**: `--hoodi` switches to Morph Hoodi testnet
- **Unified Transaction Modes**: All write commands (transfer, swap, approve, register, feedback, etc.) support:
  - `--altfee <id>`: Pay gas with ERC-20 token (tx type 0x7f). IDs: 4=BGB, 5=USDT, 6=USDC
  - `--eip7702`: Send via EIP-7702 SimpleDelegation (tx type 0x04)
  - Default: standard EIP-1559 (tx type 0x02)
  - Both PK (`-w`) and SL (`--sl`) wallets support all three modes

## Source Structure

```
src/
├── index.ts                    # CLI entry point
├── commands/
│   ├── wallet.ts               # Wallet management commands
│   ├── chain.ts                # RPC, Explorer, Alt-fee, EIP-7702 commands
│   ├── eco.ts                  # DEX Swap, Bridge commands
│   └── agentpay.ts             # x402 payment, ERC-8004 identity commands
├── lib/
│   ├── wallet/
│   │   ├── keystore.ts         # AES-256-GCM encrypted key storage + resolveAnyWallet()
│   │   └── social-login.ts     # Bitget Social Login wallet (TEE signing, API auth, storage)
│   ├── utils/
│   │   ├── rpc.ts              # PublicClient factory
│   │   ├── signer.ts           # WalletClient factory
│   │   ├── tx-sender.ts        # Unified transaction sender (standard/altfee/7702)
│   │   ├── output.ts           # Text/JSON output formatting
│   │   ├── config.ts           # Constants, token addresses, contract config
│   │   └── http.ts             # HTTP request utilities
│   ├── chain/
│   │   ├── altfee.ts           # Alt-fee tx type 0x7f signing
│   │   └── eip7702.ts          # EIP-7702 delegation + batch calls
│   ├── eco/
│   │   ├── swap.ts             # Bulbaswap DEX aggregator
│   │   └── bridge.ts           # Cross-chain bridge
│   └── agentpay/
│       ├── x402/
│       │   ├── client.ts       # x402 discovery + EIP-3009 signing + payment
│       │   ├── register.ts     # Merchant registration
│       │   ├── facilitator.ts  # HMAC verify/settle
│       │   ├── credentials.ts  # Encrypted credential storage
│       │   └── server.ts       # Local x402 merchant server (dev mode)
│       └── identity/
│           └── registry.ts     # ERC-8004 IdentityRegistry + ReputationRegistry
├── contracts/
│   ├── erc20.ts                # ERC-20 ABI
│   ├── identity-registry.ts    # IdentityRegistry ABI
│   └── reputation-registry.ts  # ReputationRegistry ABI
```

## Key Contract Addresses

| Contract | Address | Description |
|----------|---------|-------------|
| IdentityRegistry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | ERC-8004 identity registry (v2.0.0) |
| ReputationRegistry | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | Reputation registry |
| SimpleDelegation | `0x6Dbe92bC5251e205B05151bB72e2977dDd78C1E5` | EIP-7702 delegation contract |
| TokenRegistry | `0x5300000000000000000000000000000000000021` | Alt-fee token registry |

## Network Info

| Network | Chain ID | RPC |
|---------|----------|-----|
| Morph Mainnet | 2818 | `https://rpc-quicknode.morph.network` |
| Morph Hoodi Testnet | 2910 | `https://rpc-hoodi.morph.network` |

## Build & Run

```bash
# Install dependencies
pnpm install

# Dev mode
pnpm dev -- --help

# Build
pnpm build

# Run
node dist/index.js --help

# After global link
morph-agent --help

# Test
pnpm test
pnpm test:watch
```

## Dependencies

### Runtime
- `commander` ^14.0.3 — CLI framework
- `viem` ^2.47.6 — Ethereum interaction library
- `@noble/curves` ^2.0.1 — Elliptic curve cryptography

### Dev
- `tsup` ^8.5.1 — Build tool
- `tsx` ^4.21.0 — TypeScript execution
- `typescript` ^6.0.2
- `vitest` ^4.1.1 — Test framework
- `@vitest/coverage-v8` ^4.1.1 — Coverage

## Safety Rules

- All send/transfer/swap/bridge operations require user intent confirmation before execution
- Private keys are used for local signing only and never sent to any external API
- Amounts use human-readable units (`0.1` = 0.1 ETH, not wei)
- Write operations default to dry-run; explicit `--broadcast` required to execute
