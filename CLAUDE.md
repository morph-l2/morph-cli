# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

All-in-one CLI toolchain for Morph L2, designed for AI Agents and developers.

## Project Structure

```
src/
├── index.ts                  # CLI entry point, registers four top-level commands
├── commands/                 # Command layer (argument parsing)
│   ├── wallet.ts             # wallet — wallet management
│   ├── chain.ts              # onchain — RPC/Explorer/altfee/7702
│   ├── eco.ts                # eco — swap/bridge
│   └── agentpay.ts           # agentpay — x402/identity
├── lib/
│   ├── wallet/
│   │   ├── keystore.ts       # Private-key wallet: AES-256-GCM encrypted storage
│   │   └── social-login.ts   # Social Login wallet: BGW TEE-hosted signing
│   ├── utils/
│   │   ├── config.ts         # Network/token/contract address constants
│   │   ├── rpc.ts            # viem publicClient factory
│   │   ├── signer.ts         # walletClient construction (private-key decrypt + sign)
│   │   ├── tx-sender.ts      # Unified send entry (standard/altfee/7702/social-login)
│   │   └── output.ts         # JSON/text unified output
│   ├── chain/
│   │   ├── altfee.ts         # tx type 0x7f signing
│   │   └── eip7702.ts        # tx type 0x04 delegation
│   ├── eco/
│   │   ├── swap.ts           # Bulbaswap DEX
│   │   └── bridge.ts         # Cross-chain bridge
│   └── agentpay/
│       ├── x402/             # HTTP 402 payment protocol
│       └── identity/         # ERC-8004 Agent identity & reputation
└── contracts/                # ABI definitions
```

## Common Commands

```bash
pnpm build                         # compile TypeScript → dist/ (CJS via tsup)
pnpm dev -- <command> [args]       # run directly via tsx (no build needed)
pnpm test                          # run all tests (vitest)
pnpm test -- tests/unit/keystore   # run a single test file
pnpm test -- --coverage            # run with coverage report
```

Integration tests actually write to `~/.morph-agent/` (real wallet files). Unit tests mock `config.ts` to redirect to a temp dir.

## Development Guidelines

- **Runtime**: Node.js 22+, package manager pnpm
- **Build**: `pnpm build` (tsup, CJS output to dist/)
- **Dev**: `pnpm dev -- <command>` runs TypeScript directly via tsx
- **Branch**: develop on `dev` branch; only merge to `main` on explicit instruction

## Command System

| Command | Layer | Description |
|---------|-------|-------------|
| `wallet` | L1 | Wallet management: private-key wallet + Social Login wallet |
| `onchain` | L2 | On-chain queries: rpc / explorer / altfee / 7702 |
| `eco` | L3 | DeFi: swap (Bulbaswap) / bridge |
| `agentpay` | L4 | Agent payments: x402 (pay/register/server) / identity (ERC-8004) |

## Wallet System

**Private-key wallet** (`-w`): locally AES-256-GCM encrypted, stored at `~/.morph-agent/wallets/`
**Social Login wallet** (`--sl`): BGW TEE-hosted signing, stored at `~/.morph-agent/social-wallets/`

- `wallet create/import/address/remove` use `-n` to specify wallet name (naming operations)
- `wallet balance/transfer` and all write commands use `-w` (private-key) or `--sl` (Social Login) to select wallet

## Transaction Mode Options (common to all write commands)

All write commands (wallet transfer, eco swap/approve, agentpay identity write ops) support these flags:

| Option | Description |
|--------|-------------|
| `--altfee <id>` | Pay gas with ERC-20 (tx type 0x7f). IDs: 4=BGB, 5=USDT, 6=USDC |
| `--eip7702` | Send via EIP-7702 SimpleDelegation (tx type 0x04) |
| `--dry-run` | Preview without sending (default is broadcast) |
| `--hoodi` | Switch to Morph Hoodi testnet (chain ID 2910) |

Both `-w` (private-key) and `--sl` (Social Login) wallets support all three tx modes.

## EIP-7702 Notes

- `onchain 7702 delegate` — check delegation status
- `onchain 7702 send/batch` — explicit 7702 tx (`-w`/`--sl`)
- `onchain 7702 revoke` — revoke delegation (`-w`/`--sl`)
- Self-delegation nonce: geth-based chains increment sender nonce before processing auth list. morphcli uses `txNonce + 1` as auth nonce automatically.

## Output Format

All commands use `out(success, data)`, default text format, `--json` switches to JSON:
```typescript
out(true, { key: value })   // success
out(false, { error: msg })  // failure + process.exit(1)
```

## Networks

| Network | Chain ID | RPC |
|---------|----------|-----|
| Morph Mainnet | 2818 | `https://rpc-quicknode.morph.network` |
| Morph Hoodi | 2910 | `https://rpc-hoodi.morph.network` |

## Key Contracts

| Contract | Address |
|----------|---------|
| TokenRegistry (altfee) | `0x5300000000000000000000000000000000000021` |
| SimpleDelegation (7702, ERC-1271) | `0xBD7093Ded667289F9808Fa0C678F81dbB4d2eEb7` |
| IdentityRegistry (ERC-8004) | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| ReputationRegistry | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |

## Architecture Patterns

### Wallet Resolution (dual-path)

All write commands accept either `-w <name>` (private-key) or `--sl <name>` (Social Login). The resolution flow:
1. `resolveWallet(opts)` in `lib/wallet/resolve.ts` — enforces mutual exclusivity, loads the correct wallet type
2. Returns a union `WalletData | SocialWalletConfig` — callers pass this directly to `sendTx()`

### Transaction Dispatch (three-mode)

`sendTx()` in `lib/utils/tx-sender.ts` is the single entry point for all on-chain writes. It dispatches based on `TxOptions`:
- **Standard** (default) — EIP-1559 via viem `walletClient.sendTransaction()`
- **Alt-fee** (`--altfee <id>`) — custom tx type `0x7f`, RLP-encode + sign locally via `lib/chain/altfee.ts`
- **EIP-7702** (`--eip7702`) — type `0x04` delegation via `lib/chain/eip7702.ts`

Each mode handles both private-key and Social Login wallets internally.

### Command Layer Convention

Each command file in `src/commands/` exports a factory `<name>Command(): Command` (commander.js). Write commands follow the pattern:
1. Parse wallet with `resolveWallet(opts)`
2. Dry-run preview (default) — show what would happen
3. Execute with `--broadcast` — call `sendTx()` and output result via `out()`

### Data Storage

All local state lives under `~/.morph-agent/`:
- `wallets/*.json` — AES-256-GCM encrypted private keys
- `social-wallets/*.json` — encrypted BGW credentials
- `x402-credentials/*.json` — HMAC merchant credentials
- `config.json` — default wallet setting
- `.encryption-key` — 32-byte key file (mode 0600)

## Adding a New Command

1. `src/commands/<name>.ts` exports `<name>Command(): Command`
2. `src/index.ts` registers: `program.addCommand(<name>Command())`
3. Add new token/contract addresses to `src/lib/utils/config.ts`
4. Add new ABIs to `src/contracts/`
