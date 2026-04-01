---
name: morphcli-identity
description: "ERC-8004 agent identity and reputation on Morph L2 via morphcli — register AI agents as on-chain NFTs, set metadata, bind operational wallets, query agent info and reputation, submit and read feedback, revoke feedback, append responses. Use this skill whenever the user wants to register an AI agent on-chain, manage agent identity NFTs, set agent metadata (name, endpoint, description), bind/unbind an agent's operational wallet, query agent info or reputation scores, give feedback on an agent, read agent reviews, or mentions 'ERC-8004', 'AgentIdentity', 'agent NFT', 'register agent', 'agent reputation', 'agent feedback', 'agent wallet binding', 'IdentityRegistry', 'ReputationRegistry', or on-chain agent identity on Morph."
---

# morphcli identity — ERC-8004 Agent Identity & Reputation

On-chain agent identity (NFT) and reputation via `morph-agent agentpay identity`.

- **Text output** by default; add `--json`
- Write commands **broadcast by default** — add `--dry-run` to preview
- `-w` for private-key wallet, `--sl` for Social Login wallet

## Key Contracts

| Contract | Address |
|----------|---------|
| IdentityRegistry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| ReputationRegistry | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |

NFT: `AgentIdentity` / `AGENT`. Agent ID starts from 0. Same addresses on mainnet/testnet (CREATE2).

## Read-only Queries

### registry — Contract info

```bash
morph-agent agentpay identity registry
```

Returns: name, symbol, version, owner.

### info — Agent info by ID

```bash
morph-agent agentpay identity info --agent-id <id>
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `--agent-id <id>` | Yes | Agent ID (uint256, starts from 0) |

Returns: owner address, URI, bound wallet address.

### balance — Agent count by address

```bash
morph-agent agentpay identity balance -a <address>
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `-a, --address <address>` | Yes | Owner address to query |

### total — Total registered agents

```bash
morph-agent agentpay identity total
```

### metadata — Read agent metadata

```bash
morph-agent agentpay identity metadata --agent-id <id> --key <key>
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `--agent-id <id>` | Yes | Agent ID |
| `--key <key>` | Yes | Metadata key. Common keys: `name`, `description`, `endpoint` |

### reputation — Reputation summary

```bash
morph-agent agentpay identity reputation --agent-id <id>
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `--agent-id <id>` | Yes | Agent ID |

Returns: feedback count, total score, unique clients.

### read-feedback — Single feedback entry

```bash
morph-agent agentpay identity read-feedback --agent-id <id> --client <addr> --index <n>
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `--agent-id <id>` | Yes | Agent ID |
| `--client <address>` | Yes | Address of the client who gave feedback |
| `--index <n>` | Yes | Feedback index (starts from 1) |

### reviews — All feedback for an agent

```bash
morph-agent agentpay identity reviews --agent-id <id> [--include-revoked]
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `--agent-id <id>` | Yes | Agent ID |
| `--include-revoked` | No | Include revoked feedback entries |

## Identity Management (broadcasts by default)

### register — Register new agent (mint NFT)

```bash
morph-agent agentpay identity register [-w <wallet>] [--uri <url>] [--dry-run]
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `-w <wallet>` / `--sl <name>` | No | Wallet (default: default wallet) |
| `--uri <url>` | No | Agent metadata URI (e.g. `https://example.com/agent.json`) |

### set-metadata — Set metadata key-value

```bash
morph-agent agentpay identity set-metadata [-w <wallet>] --agent-id <id> --key <key> --value <value> [--dry-run]
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `--agent-id <id>` | Yes | Agent ID (must be owned by caller) |
| `--key <key>` | Yes | Metadata key. Common keys: `name`, `description`, `endpoint` |
| `--value <value>` | Yes | Metadata value (string) |

### set-uri — Set agent URI

```bash
morph-agent agentpay identity set-uri [-w <wallet>] --agent-id <id> --uri <uri> [--dry-run]
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `--agent-id <id>` | Yes | Agent ID (must be owned by caller) |
| `--uri <uri>` | Yes | New metadata URI |

### set-wallet — Bind operational wallet

```bash
morph-agent agentpay identity set-wallet [-w <wallet>] --agent-id <id> --new-wallet <addr> --signature <hex> [--deadline <ts>] [--dry-run]
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `--agent-id <id>` | Yes | Agent ID (must be owned by caller) |
| `--new-wallet <address>` | Yes | New wallet address to bind |
| `--signature <hex>` | Yes | EIP-712 signature from `--new-wallet` (prevents unauthorized binding) |
| `--deadline <timestamp>` | No | Signature expiry (unix timestamp, default: now + 1 hour) |

### unset-wallet — Unbind operational wallet

```bash
morph-agent agentpay identity unset-wallet [-w <wallet>] --agent-id <id> [--dry-run]
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `--agent-id <id>` | Yes | Agent ID (must be owned by caller) |

## Reputation Operations (broadcasts by default)

### feedback — Submit feedback

```bash
morph-agent agentpay identity feedback [-w <wallet>] --agent-id <id> --value <n> [--tag1 <tag>] [--tag2 <tag>] [--endpoint <url>] [--feedback-uri <uri>] [--dry-run]
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `--agent-id <id>` | Yes | Agent ID to rate |
| `--value <n>` | Yes | Feedback score (positive = good, negative = bad, integer) |
| `--tag1 <tag>` | No | Category tag (e.g. `quality`, `speed`, `accuracy`) |
| `--tag2 <tag>` | No | Sub-category tag |
| `--endpoint <url>` | No | Endpoint being rated |
| `--feedback-uri <uri>` | No | Off-chain detailed feedback URI |

### revoke-feedback — Revoke your own feedback

```bash
morph-agent agentpay identity revoke-feedback [-w <wallet>] --agent-id <id> --index <n> [--dry-run]
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `--agent-id <id>` | Yes | Agent ID |
| `--index <n>` | Yes | Feedback index to revoke (starts from 1) |

### append-response — Respond to feedback

```bash
morph-agent agentpay identity append-response [-w <wallet>] --agent-id <id> --client <addr> --index <n> --response-uri <uri> [--dry-run]
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `--agent-id <id>` | Yes | Agent ID |
| `--client <address>` | Yes | Client address who gave the feedback |
| `--index <n>` | Yes | Feedback index |
| `--response-uri <uri>` | Yes | Response URI (off-chain content link) |

## Typical Workflows

### Register Agent + Set Metadata

```bash
morph-agent agentpay identity register -w owner --uri "https://example.com/agent.json"
morph-agent agentpay identity set-metadata -w owner --agent-id 1 --key name --value "MyAgent"
morph-agent agentpay identity set-metadata -w owner --agent-id 1 --key endpoint --value "https://api.myagent.com"
```

### Feedback Cycle

```bash
morph-agent agentpay identity feedback -w user --agent-id 1 --value 100 --tag1 quality
morph-agent agentpay identity reviews --agent-id 1
morph-agent agentpay identity reputation --agent-id 1
```

## Transaction Mode Options

All write commands support these additional flags:

| Option | Description |
|--------|-------------|
| `--altfee <id>` | Pay gas with ERC-20 (tx type 0x7f). IDs: 4=BGB, 5=USDT, 6=USDC |
| `--eip7702` | EIP-7702 delegation (tx type 0x04) |
| `--dry-run` | Preview transaction without sending |

## EIP-7702 Delegation Restriction

**`register()` does NOT work with EIP-7702 delegated wallets.** The IdentityRegistry checks `extcodesize(msg.sender)` and rejects addresses with code. EIP-7702 delegated EOAs have delegation prefix bytecode (`ef0100...`), causing `extcodesize > 0` → revert.

**Workaround**: If the wallet is already delegated, revoke delegation first, then register:

```bash
# Step 1: Revoke delegation
morph-agent onchain 7702 revoke -w <wallet>

# Step 2: Register (now pure EOA)
morph-agent agentpay identity register -w <wallet> --uri "https://..."

# Step 3: Re-delegate if needed
morph-agent onchain 7702 send -w <wallet> --to <any-address> --value 0
```

Other write commands (`set-metadata`, `feedback`, etc.) also have this restriction if the contract checks `extcodesize`. Use `--altfee` instead of `--eip7702` for identity write operations.

## Safety

- **set-wallet requires EIP-712 signature** from the new wallet to prevent malicious binding
- Feedback is permanently recorded on-chain (revoke marks it but doesn't delete)
- Confirm with user before executing write operations (use `--dry-run` to preview)
