---
name: morphcli-wallet
description: "Wallet operations on Morph L2 via morphcli — create wallet, import private key, check ETH/ERC-20 balance, transfer tokens, manage default wallet, bind Social Login wallet (TEE signing). Use this skill whenever the user wants to manage wallets, check balances, send ETH or tokens on Morph L2, or use a Social Login wallet. Trigger for: creating/importing wallets, checking balances, transferring ETH or ERC-20 tokens, setting a default wallet, binding a Bitget Social Login wallet, or switching between private-key and SL wallets. Also trigger when the user mentions 'morph wallet', 'Morph balance', 'send ETH on Morph', 'transfer USDC', 'social login wallet', 'SL wallet', 'TEE signing', 'BGW wallet', 'default wallet', 'altfee transfer', 'EIP-7702 transfer', or asks about supported tokens on Morph L2."
---

# morphcli wallet — Wallet Management on Morph L2

Local key management and on-chain operations via `morph-agent wallet`.

## Key Facts

- Private keys encrypted with **AES-256-GCM** at `~/.morph-agent/wallets/<name>.json`
- **Text output** by default; add `--json` for structured JSON (recommended for AI agents)
- Transfers **broadcast by default** — add `--dry-run` to preview first
- Amounts use human-readable units (`0.1` = 0.1 ETH, not wei)
- Add `--hoodi` to switch to Morph Hoodi testnet (chain ID 2910)

## Dual Wallet System

morphcli supports two types of wallets, selected via mutually exclusive flags:

| Flag | Type | Signing | Storage |
|------|------|---------|---------|
| `-w <name>` | Private-key | Local ECDSA | `~/.morph-agent/wallets/` |
| `--sl <name>` | Social Login | Bitget TEE API | `~/.morph-agent/social-wallets/` |

Using both `-w` and `--sl` in the same command will error. When neither is specified, the default private-key wallet is used.

**Social Login wallets** use Bitget's TEE (Trusted Execution Environment) to custody private keys — the agent only needs `appid` and `appsecret` credentials. SL wallets support all transaction modes including `--altfee` (0x7f), `--eip7702` (0x04), and EIP-3009 signing (e.g., x402 pay). Signing is done via BGW `EthSign:{hash}` API.

## Default Wallet

The first wallet created automatically becomes the default. All commands that accept `-w` use the default when the flag is omitted.

```bash
morph-agent wallet default                # View current default
morph-agent wallet default --set <name>   # Change default
```

## Commands

### Create & Import

```bash
morph-agent wallet create [-n <name>]                        # Generate new wallet
morph-agent wallet import -n <name> -k 0x<private_key>       # Import from private key
morph-agent wallet import -n <name> -f /path/to/key.txt      # Import from file
```

### List, Address, Remove

```bash
morph-agent wallet list                   # List all private-key wallets
morph-agent wallet address [-n <name>]    # View address
morph-agent wallet remove [-n <name>]     # Remove wallet
```

### Social Login Wallet

```bash
morph-agent wallet sl -n <name> --appid <appid> --appsecret <hex>   # Bind SL wallet
morph-agent wallet sl-list                                            # List SL wallets
morph-agent wallet sl-remove -n <name>                                # Remove SL wallet
```

### Check Balance

```bash
morph-agent wallet balance [-w <name>]                         # ETH + USDC + BGB + USDT
morph-agent wallet balance --sl <name>                         # SL wallet balance
morph-agent wallet balance --address 0x<addr>                  # Any address
morph-agent wallet balance --token USDC                        # Specific token
morph-agent wallet balance --token 0xCfb...72B                 # By contract address
```

**Text output example:**
```
name     main
address  0x8CB8e0a1FFF2dCBb2B853dB43DeDac4599979CB3
ETH      0.000283
BGB      0.1
USDC     0.520781
USDT     0.1
```

### Transfer

```bash
# ETH transfer
morph-agent wallet transfer -w main --to 0x<addr> --amount 0.1

# Preview first (dry-run)
morph-agent wallet transfer --to 0x<addr> --amount 0.1 --dry-run

# SL wallet — ERC-20 transfer
morph-agent wallet transfer --sl bgw --to 0x<addr> --amount 50 --token USDC

# Pay gas with BGB (alt-fee, tx type 0x7f)
morph-agent wallet transfer --to 0x<addr> --amount 0.1 --altfee 4

# Send via EIP-7702 delegation (tx type 0x04)
morph-agent wallet transfer --to 0x<addr> --amount 0.1 --eip7702

# Testnet
morph-agent wallet transfer --to 0x<addr> --amount 1 --hoodi
```

### Transaction Mode Options (all write commands)

| Option | Description |
|--------|-------------|
| `--altfee <id>` | Pay gas with ERC-20 (tx type 0x7f). IDs: 4=BGB, 5=USDT, 6=USDC |
| `--eip7702` | EIP-7702 delegation (tx type 0x04, SimpleDelegation) |

## Supported Tokens

| Symbol | Address | Decimals |
|--------|---------|----------|
| **ETH** | Native | 18 |
| **BGB** | `0x389C08Bc23A7317000a1FD76c7c5B0cb0b4640b5` | 18 |
| **USDC** | `0xCfb1186F4e93D60E60a8bDd997427D1F33bc372B` | 6 |
| **USDT** | `0xe7cd86e13AC4309349F30B3435a9d337750fC82D` | 6 |
| `0x...` | Any ERC-20 contract address | auto-detected |

## Network Info

| Network | Chain ID | RPC |
|---------|----------|-----|
| Morph Mainnet | 2818 | `https://rpc-quicknode.morph.network` |
| Morph Hoodi Testnet | 2910 | `https://rpc-hoodi.morph.network` |

## Safety

- **Always confirm with user before executing transfers** — they are irreversible
- Never expose private keys in output
- Use `--dry-run` to preview large transfers before sending
- SL wallet credentials are AES-256-GCM encrypted before storage
