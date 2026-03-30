---
name: morphcli-agentpay
description: "x402 HTTP payment protocol for AI agents via morphcli — discover 402-gated APIs, pay for resources with EIP-3009 USDC signatures, register as a merchant, manage HMAC credentials, verify and settle payments, and start a local test server. Use this skill whenever the user wants to access a pay-per-request API, pay for an x402-protected resource, test an x402 merchant server locally, register a wallet with the Morph Facilitator, manage HMAC credentials, verify a payment payload, or settle USDC on-chain. Trigger for: 'x402', 'HTTP 402', 'pay for API access', 'pay-per-request', 'EIP-3009', 'agent payment', 'Morph Facilitator', 'HMAC credentials', 'merchant register', 'verify payment', 'settle payment', 'x402 server', 'start merchant server', or any payment-gated API workflow on Morph."
---

# morphcli agentpay — x402 HTTP Payment Protocol

HTTP 402 payment workflow for AI agents and merchants via `morph-agent agentpay x402`.

- Payments use **EIP-3009 off-chain signatures** — no gas consumed
- `pay` **broadcasts by default** — add `--dry-run` to preview first
- Facilitator: `https://morph-rails.morph.network/x402`
- Payment network: Morph Mainnet (eip155:2818)
- Payment token: USDC `0xCfb1186F4e93D60E60a8bDd997427D1F33bc372B`

> x402 `pay` supports both **private-key wallets** (`-w`) and **Social Login wallets** (`--sl`). SL wallets sign EIP-3009 via BGW TEE (`EthSign:{hash}` format).

## User-Side Commands

```bash
# Query supported payment methods
morph-agent agentpay x402 supported

# Probe a URL for 402 requirements
morph-agent agentpay x402 discover --url <url>

# Pay for a resource
morph-agent agentpay x402 pay -w <wallet> --url <url>

# Pay with max payment limit
morph-agent agentpay x402 pay -w <wallet> --url <url> --max-payment 1.0

# Preview payment without sending
morph-agent agentpay x402 pay -w <wallet> --url <url> --dry-run
```

## Merchant-Side Commands

```bash
# Register with Facilitator (get HMAC credentials, --save encrypts locally)
morph-agent agentpay x402 register -w <wallet> [--save]

# Manage credentials
morph-agent agentpay x402 config -w <wallet> --show
morph-agent agentpay x402 config --list
morph-agent agentpay x402 config -w <wallet> --remove
morph-agent agentpay x402 config -w <wallet> --access-key morph_ak_... --secret-key morph_sk_...

# Verify payment
morph-agent agentpay x402 verify -w <wallet> --payload '<json>' --requirements '<json>'

# Settle on-chain
morph-agent agentpay x402 settle -w <wallet> --payload '<json>' --requirements '<json>'

# Start local test server
morph-agent agentpay x402 server -w <wallet> [--port 8080] [--price 0.001] [--verify]
```

### Local Test Server

```bash
# Dev mode (structural validation only)
morph-agent agentpay x402 server -w agent --price 0.001

# Verified mode (real Facilitator HMAC check, requires saved credentials)
morph-agent agentpay x402 server -w merchant --verify

# Custom payTo and paths
morph-agent agentpay x402 server --pay-to 0x<addr> --price 0.005 --path /api/data --free-path /health
```

| Option | Default | Description |
|--------|---------|-------------|
| `--port` | 8080 | Port |
| `--pay-to` | wallet address | Payment recipient |
| `--price` | 0.001 | Price in USDC |
| `--path` | /api/resource | Paid endpoint |
| `--free-path` | /api/free | Free endpoint |
| `--verify` | off | Real Facilitator verification |

## Typical Workflows

### User: Pay a 402-gated API

```bash
morph-agent agentpay x402 discover --url https://api.example.com/resource
morph-agent agentpay x402 pay -w main --url https://api.example.com/resource --dry-run   # preview
morph-agent agentpay x402 pay -w main --url https://api.example.com/resource              # execute
```

### Merchant: Register + Run Server

```bash
morph-agent agentpay x402 register -w merchant --save
morph-agent agentpay x402 server -w merchant --verify --price 0.001
```

## x402 v2 Protocol Flow

1. Request → 402 + `accepts[]` array
2. Parse: `payTo`, `amount`, `asset`, `network`
3. Sign EIP-3009 `transferWithAuthorization` (off-chain, no gas)
4. Resend with `X-PAYMENT` header
5. Server verifies → Facilitator settles USDC → returns resource

## EIP-7702 + ERC-1271 Compatibility

SimpleDelegation (`0xBD7093Ded667289F9808Fa0C678F81dbB4d2eEb7`) implements ERC-1271 `isValidSignature()`, allowing EIP-7702 delegated EOAs to pass USDC FiatTokenV2.2 signature verification during x402 settlement.
