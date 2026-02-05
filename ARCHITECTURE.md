# polystrat-io — Architecture (v1)

## Goal
Token-gated (Solana SPL) web app to run **paper** strategies and track wallets. No private keys anywhere.

## Non‑negotiable security rules
- Users never paste private keys into UI, `.env`, config files, or localStorage.
- Server never stores raw private keys. No key-upload endpoints.
- v1 ships paper mode end-to-end.
- “Live trading” is a separate feature flag + delegated bot wallet model + strict risk limits (not shipped by default).

---

## Auth flow (Solana token gate)

```text
Browser (Phantom)
  |  POST /auth/nonce { address }
  |<------------------ { nonce, message }
  |  signMessage(message)
  |  POST /auth/verify { address, signature }
  |      - verify signature
  |      - check SPL token balance for configured mint + min amount
  |      - issue session JWT
  |<------------------ Set-Cookie: ps_session=JWT (HttpOnly)
  |
  |  GET /me (cookie)
  |<------------------ { userId, solAddress }
```

### Gate check
- API calls Solana JSON-RPC:
  - `getTokenSupply(mint)` → decimals
  - `getTokenAccountsByOwner(owner, { mint })` → sum balances
- Compare to `GATE_MIN_AMOUNT`.

### Session
- API issues a JWT stored in `ps_session` cookie (HttpOnly, SameSite=Lax).
- All dashboard + API routes require a valid session cookie.

---

## Data model (SQLite)

Tables:
- `users(id, sol_address, created_at)`
- `nonces(sol_address, nonce, message, expires_at)`
- `tracked_wallets(id, user_id, chain, address, paused, created_at)`
- `pnl_snapshots(id, user_id, ts, total_usd)`

Notes:
- No secrets stored.
- tracked wallets are per-user.

---

## Paper vs Live model

### Paper (v1)
- Runner maintains a per-user paper loop.
- Each tick:
  - load **unpaused** tracked wallets for that user
  - fetch data via adapters (TODO) or stub
  - emit simulated trades and write/update `pnl_snapshots`

### Live (NOT shipped)
- Feature flag + separate “bot wallet” model.
- Strict limits:
  - max position size
  - daily loss limit
  - allowlist markets
- Delegated signing only (never user keys).

---

## Components
- `apps/web` (Vite): dashboard UI, Phantom connect + sign.
- `apps/api` (Node HTTP): auth, token gate, tracked wallets CRUD, paper runner proxy.
- `apps/runner` (Node HTTP): strategies registry + paper runner loop + status.

---

## Environment variables
Allowed (non-secret):
- `SOL_RPC_URL` (RPC endpoint)
- `GATE_MINT` (SPL mint address)
- `GATE_MIN_AMOUNT` (token amount, human units)

Secret (dev default exists, MUST be overridden for prod):
- `SESSION_SECRET` (JWT HMAC key)

DB:
- `DB_PATH` (path to sqlite db file)
