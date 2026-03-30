---
name: morphcli-identity
description: "ERC-8004 agent identity and reputation on Morph L2 via morphcli — register AI agents as on-chain NFTs, set metadata, bind operational wallets, query agent info and reputation, submit and read feedback, revoke feedback, append responses. Use this skill whenever the user wants to register an AI agent on-chain, manage agent identity NFTs, set agent metadata (name, endpoint, description), bind/unbind an agent's operational wallet, query agent info or reputation scores, give feedback on an agent, read agent reviews, or mentions 'ERC-8004', 'AgentIdentity', 'agent NFT', 'register agent', 'agent reputation', 'agent feedback', 'agent wallet binding', 'IdentityRegistry', 'ReputationRegistry', or on-chain agent identity on Morph."
---

# morphcli identity — ERC-8004 Agent Identity & Reputation

On-chain agent identity (NFT) and reputation via `morph-agent agentpay identity`.

- **Text output** by default; add `--json`
- Write commands **broadcast by default** — add `--dry-run` to preview
- Add `--hoodi` for Morph Hoodi testnet (chain ID 2910)
- `-w` for private-key wallet, `--sl` for Social Login wallet

## Key Contracts

| Contract | Address |
|----------|---------|
| IdentityRegistry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| ReputationRegistry | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |

NFT: `AgentIdentity` / `AGENT`. Agent ID starts from 0. Same addresses on mainnet/testnet (CREATE2).

## Read-only Queries

```bash
morph-agent agentpay identity registry [--hoodi]                                    # Contract info
morph-agent agentpay identity info --agent-id <id> [--hoodi]                        # Agent info
morph-agent agentpay identity balance -a <address> [--hoodi]                        # Agent count
morph-agent agentpay identity metadata --agent-id <id> --key <key> [--hoodi]        # Metadata
morph-agent agentpay identity reputation --agent-id <id> [--hoodi]                  # Reputation
morph-agent agentpay identity read-feedback --agent-id <id> --client <addr> --index <n>  # Single feedback
morph-agent agentpay identity reviews --agent-id <id> [--include-revoked]           # All feedback
```

## Identity Management (broadcasts by default)

```bash
# Register new Agent (mints NFT)
morph-agent agentpay identity register [-w <wallet>] [--uri <url>] [--dry-run]

# Set metadata
morph-agent agentpay identity set-metadata [-w <wallet>] --agent-id <id> --key <key> --value <value> [--dry-run]

# Set Agent URI
morph-agent agentpay identity set-uri [-w <wallet>] --agent-id <id> --uri <uri> [--dry-run]

# Bind operational wallet (requires EIP-712 signature from new wallet)
morph-agent agentpay identity set-wallet [-w <wallet>] --agent-id <id> --new-wallet <addr> --signature <hex> [--dry-run]

# Unbind operational wallet
morph-agent agentpay identity unset-wallet [-w <wallet>] --agent-id <id> [--dry-run]
```

## Reputation Operations (broadcasts by default)

```bash
# Submit feedback
morph-agent agentpay identity feedback [-w <wallet>] --agent-id <id> --value <n> [--tag1 <tag>] [--tag2 <tag>] [--dry-run]

# Revoke feedback (index starts from 1)
morph-agent agentpay identity revoke-feedback [-w <wallet>] --agent-id <id> --index <n> [--dry-run]

# Append response to feedback
morph-agent agentpay identity append-response [-w <wallet>] --agent-id <id> --client <addr> --index <n> --response-uri <uri> [--dry-run]
```

## Typical Workflows

### Register Agent + Set Metadata

```bash
morph-agent agentpay identity register -w owner --uri "https://example.com/agent.json"morph-agent agentpay identity set-metadata -w owner --agent-id 1 --key name --value "MyAgent"morph-agent agentpay identity set-metadata -w owner --agent-id 1 --key endpoint --value "https://api.myagent.com"```

### Feedback Cycle

```bash
morph-agent agentpay identity feedback -w user --agent-id 1 --value 100 --tag1 qualitymorph-agent agentpay identity reviews --agent-id 1
morph-agent agentpay identity reputation --agent-id 1
```

## Transaction Mode Options

| Option | Description |
|--------|-------------|
| `--altfee <id>` | Pay gas with ERC-20 (tx type 0x7f). IDs: 4=BGB, 5=USDT, 6=USDC |
| `--eip7702` | EIP-7702 delegation (tx type 0x04) |

## Safety

- **set-wallet requires EIP-712 signature** from the new wallet to prevent malicious binding
- Feedback is permanently recorded on-chain (revoke marks it but doesn't delete)
- Confirm with user before executing write operations (use `--dry-run` to preview)
