# Token Gating (Platform Access)

This project supports token-gated access. Users can sign in, but **platform routes + API** can be blocked unless the user holds a minimum amount of a specific token.

## Config

Token gating is configured via environment variables (do not commit secrets).

## Enabled / disabled

Token gating is **disabled by default**.

- `GATE_ENABLED=false` → do not enforce gating (everyone allowed)
- `GATE_ENABLED=true` → enforce the configured token gate

### Token types

- `evm-erc20` (EVM / MetaMask)
- `sol-spl` (Solana / Phantom)

### Required env vars (API)

#### Common

- `GATE_TOKEN_TYPE` = `evm-erc20` | `sol-spl`
- `GATE_MIN_BALANCE` = minimum balance (human units) e.g. `10` or `0.5`

#### EVM ERC-20

- `GATE_EVM_RPC_URL` = JSON-RPC endpoint (read-only)
- `GATE_EVM_TOKEN_ADDRESS` = ERC-20 contract address
- `GATE_EVM_TOKEN_DECIMALS` = token decimals (e.g. 6, 18)

#### Solana SPL (planned)

- `GATE_SOL_RPC_URL` = Solana RPC endpoint (read-only)
- `GATE_SOL_MINT` = SPL token mint address
- `GATE_SOL_TOKEN_DECIMALS` = token decimals

## API

- `GET /gating/status`
  - requires Supabase auth
  - checks if the user has at least one linked wallet for the configured chain
  - checks token balance >= minimum
  - returns:

```json
{
  "allowed": false,
  "reason": "no_wallet_linked" | "below_minimum" | "missing_config" | "rpc_error" | "unsupported_token_type" | "ok",
  "details": {
    "tokenType": "evm-erc20",
    "token": "0x...",
    "minimum": "10",
    "checked": [{"chain":"evm","address":"0x...","balance":"1.23"}]
  }
}
```

Protected endpoints must call the gating middleware.

## Web

- After login, the app calls `/gating/status`.
- If not allowed, routes redirect to `#/access-required`.
- Top bar shows a badge:
  - `Token Holder` (allowed)
  - `No Access` (blocked)

Login/account pages remain accessible even when blocked.
