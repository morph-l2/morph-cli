# morphcli

Morph L2 CLI — on-chain operations toolchain for AI Agents and developers.

TypeScript + [viem](https://viem.sh/), zero external API dependencies (direct RPC / Blockscout / DEX API), local signing, JSON output.

## Installation

```bash
pnpm install
pnpm build
```

Global use:

```bash
npm link
morph-agent --help
```

Dev mode:

```bash
pnpm dev -- wallet list
```

## Command Overview

```
morph-agent
  ├── wallet           Wallet management (L1)
  │     ├── create       Create wallet (AES-256-GCM encrypted storage)
  │     ├── import       Import private key
  │     ├── list         List all wallets
  │     ├── address      Get address
  │     ├── remove       Delete wallet
  │     ├── balance      Query balance (ETH + BGB + USDC + USDT)
  │     ├── transfer     Transfer ETH/ERC-20 (dry-run by default)
  │     ├── default      Set/view default wallet
  │     ├── sl           Bind Social Login wallet (Bitget TEE)
  │     ├── sl-list      List Social Login wallets
  │     └── sl-remove    Remove Social Login wallet
  │
  ├── onchain          On-chain operations (L2)
  │     ├── rpc          Live RPC queries (gas, block, nonce, receipt)
  │     ├── explorer     Blockscout explorer queries (address, token, contract)
  │     ├── altfee       Alt-Fee ERC-20 gas payment (tx type 0x7f)
  │     │     ├── tokens      List supported fee tokens
  │     │     ├── token-info   Fee token details
  │     │     └── estimate     Estimate feeLimit
  │     └── 7702         EIP-7702 delegation + batch call (tx type 0x04)
  │           ├── delegate    Check EOA delegation status
  │           ├── authorize   Sign authorization (no tx sent, PK only)
  │           ├── send        Send single 7702 call (dry-run by default)
  │           ├── batch       Atomic batch call via SimpleDelegation
  │           └── revoke      Revoke delegation
  │
  ├── eco              DeFi ecosystem (L3)
  │     ├── swap         DEX aggregated trading (Bulbaswap)
  │     │     ├── quote      Get quote
  │     │     ├── send       Execute swap
  │     │     ├── approve    Approve ERC-20 token spending
  │     │     └── allowance  Check allowance
  │     └── bridge       Cross-chain bridge (6 chains)
  │           ├── chains     Supported chains
  │           ├── tokens     Supported tokens
  │           ├── quote      Cross-chain quote
  │           ├── login      Authenticate for bridge
  │           └── swap       One-click cross-chain swap
  │
  └── agentpay         Agent payments & identity (L4)
        ├── x402         HTTP 402 payment protocol
        │     ├── supported    Query Facilitator supported payment methods
        │     ├── discover     Probe URL for 402 payment requirements
        │     ├── pay          Sign EIP-3009 + pay to access resource
        │     ├── register     (Merchant) wallet-signed registration → get HMAC credentials
        │     ├── config       (Merchant) save/manage HMAC credentials
        │     ├── verify       (Merchant) verify payment
        │     ├── settle       (Merchant) on-chain settlement
        │     └── server       (Merchant) start local x402 server (verify + settle)
        └── identity     ERC-8004 Agent identity & reputation
              ├── registry       Registry contract info
              ├── info           Agent info query
              ├── balance        Number of agents owned by address
              ├── metadata       Read agent metadata
              ├── reputation     Reputation summary
              ├── register       Register agent (mint NFT)
              ├── set-metadata   Set metadata key-value
              ├── set-uri        Set agent URI
              ├── set-wallet     Bind operational wallet
              ├── unset-wallet   Unbind wallet
              ├── feedback       Submit feedback
              ├── read-feedback  Read single feedback
              ├── reviews        List all feedback
              ├── revoke-feedback Revoke feedback
              └── append-response Respond to feedback
```

## Architecture

```
src/
├── index.ts                    Entry point (Commander registration)
├── commands/                   Command definition layer
│     ├── wallet.ts               Wallet commands
│     ├── chain.ts                Chain operation commands (incl. altfee, 7702)
│     ├── eco.ts                  Ecosystem commands (swap, bridge)
│     └── agentpay.ts             Agent payment/identity commands
├── contracts/                  Contract ABIs & addresses
│     ├── erc20.ts                ERC-20 standard ABI
│     ├── identity-registry.ts    ERC-8004 IdentityRegistry
│     ├── reputation-registry.ts  ERC-8004 ReputationRegistry
│     └── tokenRegistry.ts       Morph TokenRegistry (Alt-Fee)
└── lib/                        Business logic layer
      ├── wallet/keystore.ts      Private-key wallet (AES-256-GCM encrypted)
      ├── wallet/social-login.ts  Social Login wallet (BGW TEE signing)
      ├── chain/altfee.ts         Alt-Fee tx type 0x7f (PK + SL)
      ├── chain/eip7702.ts        EIP-7702 delegation + batch call (PK + SL)
      ├── eco/swap.ts             DEX aggregation
      ├── eco/bridge.ts           Cross-chain bridge
      ├── agentpay/x402/          x402 payment protocol
      │     ├── client.ts           Payer: EIP-3009 signing + payment flow
      │     ├── facilitator.ts      Merchant: HMAC auth + verify/settle
      │     ├── credentials.ts      HMAC credential encrypted storage
      │     └── server.ts           Local x402 merchant server
      ├── agentpay/identity/      ERC-8004 identity/reputation
      │     └── registry.ts         Contract read/write wrapper
      └── utils/                  Base utilities
            ├── config.ts           Chain params, token registry, contract addresses
            ├── rpc.ts              viem PublicClient
            ├── signer.ts           viem WalletClient (PK only)
            ├── tx-sender.ts        Unified tx sender (standard/altfee/7702/social-login)
            ├── output.ts           JSON output
            └── http.ts             HTTP utilities
```

## Network Info

| Network | Chain ID | RPC |
|---------|----------|-----|
| Morph Mainnet | 2818 | `https://rpc-quicknode.morph.network` |
| Morph Hoodi Testnet | 2910 | `https://rpc-hoodi.morph.network` |

## Wallet System

morphcli supports two wallet types, selected via `-w` (private-key) or `--sl` (Social Login):

| Type | Flag | Signing | Storage |
|------|------|---------|---------|
| Private-key | `-w <name>` | Local ECDSA | `~/.morph-agent/wallets/` |
| Social Login | `--sl <name>` | Bitget TEE API | `~/.morph-agent/social-wallets/` |

Both types support all transaction modes: standard EIP-1559, `--altfee` (0x7f), and `--eip7702` (0x04). SL wallets sign via BGW `EthSign:{hash}`.

## Security Design

- Private keys AES-256-GCM encrypted, stored at `~/.morph-agent/wallets/`
- SL wallet credentials (appid/appsecret) also AES-256-GCM encrypted
- Encryption master key auto-generated at `~/.morph-agent/.encryption-key`
- All write transactions default to dry-run; `--broadcast` required to confirm
- Private keys used for local signing only, never sent to any API
- Merchant Secret Key also AES-256-GCM encrypted storage

## Testing

```bash
pnpm test               # Run all tests
pnpm test -- --coverage  # Coverage report
```

## Development

```bash
pnpm dev -- <command>    # Run directly with tsx
pnpm build               # Build to dist/ with tsup
```

## Stack

- **Runtime**: Node.js 22+
- **Language**: TypeScript 6 (strict)
- **Web3**: viem 2.x (RPC, ABI encoding, signing)
- **CLI**: Commander 14
- **Crypto**: @noble/curves (secp256k1, for alt-fee signing)
- **Build**: tsup (single-file CJS bundle)
- **Test**: Vitest 4

## License

MIT
