---
name: morphcli-swap
description: "DEX swap on Morph L2 via morphcli — quote token prices from Bulbaswap aggregator, execute swaps (ETH to ERC-20, ERC-20 to ETH, ERC-20 to ERC-20), approve ERC-20 token spending, and check allowances. Use this skill whenever the user wants to swap tokens on Morph, trade ETH for USDC or BGB, exchange ERC-20 tokens via a DEX, approve a router to spend tokens, or check allowances. Trigger for 'swap ETH to USDC', 'Bulbaswap', 'Morph DEX', 'token swap quote', 'execute swap', 'approve USDC', 'check allowance', swap slippage settings, or any intent to trade tokens on Morph L2."
---

# morphcli swap — DEX Token Swap via Bulbaswap on Morph L2

Token swaps through the Bulbaswap DEX aggregator via `morph-agent eco swap`.

- **Text output** by default; add `--json` for structured JSON
- `send` and `approve` **broadcast by default** — add `--dry-run` to preview first
- `-w <name>` for private-key wallet, `--sl <name>` for Social Login wallet
- All swap commands support `--altfee <id>` and `--eip7702` modes

## Swap Flow

**ETH → ERC-20** (2 steps): `quote` → `send`
**ERC-20 → anything** (3 steps): `approve` → `quote` → `send`

## Commands

### 1. Get Quote

```bash
# Price only
morph-agent eco swap quote --amount 0.001 --from ETH --to USDC

# With calldata (add --recipient for executable calldata)
morph-agent eco swap quote --amount 0.001 --from ETH --to USDC --recipient 0x<your_addr>
```

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--amount` | Yes | — | Input amount (human-readable) |
| `--from` | Yes | — | Source: `ETH`, symbol, or `0x` address |
| `--to` | Yes | — | Destination: same format |
| `--recipient` | For send | — | Your address (required for calldata) |
| `--slippage` | No | `1` | Slippage tolerance % |
| `--deadline` | No | `300` | Quote validity (seconds) |

**Key response fields** (with `--recipient`):
```json
{
  "quoteDecimals": "1.234567",
  "methodParameters": {
    "to": "0xc0Ce9a...  (router address)",
    "calldata": "0xd984396a...  (hex encoded)",
    "value": "0.001  (ETH in decimal, pass directly to --value)"
  }
}
```

### 2. Execute Swap

Pass the three `methodParameters` fields directly from the quote output:

```bash
morph-agent eco swap send -w <wallet> \
  --to <methodParameters.to> \
  --value <methodParameters.value> \
  --data <methodParameters.calldata>
```

- `--to`: router address from `methodParameters.to`
- `--data`: calldata hex from `methodParameters.calldata` (**required**)
- `--value`: ETH amount from `methodParameters.value` (`0` for ERC-20 → ETH swaps)
- `--dry-run`: add to preview without sending

> **IMPORTANT**: `quote` MUST include `--recipient <address>` to get `methodParameters`. Without `--recipient`, only price information is returned and `swap send` will fail with `--data not specified`.

### 3. Approve (ERC-20 input only)

```bash
morph-agent eco swap approve -w <wallet> --token USDC --amount max
```

### 4. Check Allowance

```bash
morph-agent eco swap allowance -w <wallet> --token USDC
```

## Complete Examples

### ETH → USDC (private-key wallet)

```bash
# Step 1: Get quote with calldata (--recipient is required)
morph-agent eco swap quote --amount 0.001 --from ETH --to USDC --recipient 0x<your_address>

# Step 2: Execute using values from methodParameters
morph-agent eco swap send -w <wallet> \
  --to 0x<methodParameters.to> \
  --value 0.001 \
  --data 0x<methodParameters.calldata>
```

### ETH → USDC (Social Login wallet)

```bash
morph-agent eco swap quote --amount 0.001 --from ETH --to USDC --recipient 0x<sl_wallet_address>
morph-agent eco swap send --sl <name> \
  --to 0x<methodParameters.to> --value 0.001 --data 0x<methodParameters.calldata>
```

### USDC → ETH

```bash
# Step 1: Approve router (needed for ERC-20 input)
morph-agent eco swap approve -w <wallet> --token USDC --amount max

# Step 2: Quote
morph-agent eco swap quote --amount 10 --from USDC --to ETH --recipient 0x<your_address>

# Step 3: Send (value is 0 for ERC-20 input)
morph-agent eco swap send -w <wallet> \
  --to 0x<methodParameters.to> --value 0 --data 0x<methodParameters.calldata>
```

### Swap via EIP-7702 delegation

```bash
morph-agent eco swap quote --amount 0.001 --from ETH --to USDC --recipient 0x<sl_wallet_address>
morph-agent eco swap send --sl <name> \
  --to 0x<methodParameters.to> --value 0.001 --data 0x<methodParameters.calldata> --eip7702
```

## Token Symbols

`ETH`, `USDC`, `BGB`, `USDT`, `USDC.e`, `USDT.e`, `DAI`, `WBTC`, `weETH`, `WETH`, or any `0x` address.

## Safety

- Always verify quote output before sending (use `--dry-run` to preview)
- For large swaps, check slippage settings
- Confirm with user before executing any swap
