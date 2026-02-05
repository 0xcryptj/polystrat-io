# polystrat-io

Token-gated (Solana SPL) strategy dashboard + paper runner.

## Security stance
- No private keys in UI/.env/localStorage.
- No private keys stored server-side.
- Paper mode is the default and only shipped mode.

## Local dev

### 1) Configure env
Create `apps/api/.env.local` (DO NOT COMMIT):

```bash
# Solana RPC
SOL_RPC_URL=https://api.mainnet-beta.solana.com

# Token gate
GATE_MINT=<your_spl_mint>
GATE_MIN_AMOUNT=1

# Session signing (secret)
SESSION_SECRET=dev-change-me

# Shared SQLite DB path (non-secret)
DB_PATH=C:\\Users\\joarb\\.openclaw\\workspace\\apps\\api\\data\\polystrat.db
```

### 2) Run services

```bash
npm -w apps/runner run dev
npm -w apps/api run dev
npm -w apps/web run dev
```

- Web: http://127.0.0.1:5173/
- API: http://localhost:3399
- Runner: http://localhost:3344

### 3) Login
- Open the web UI
- Connect Phantom
- Sign the nonce message
- If your wallet holds the configured SPL token amount, you’ll be let in

## Tests
(TODO) Add unit tests for signature verification + SPL balance check.

## Docs
- See `ARCHITECTURE.md`
