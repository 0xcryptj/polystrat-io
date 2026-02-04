# Polymarket Authentication / Rate Limits (PASTED PARTIAL)

> Source: user-pasted excerpts (original reference URLs provided but not fetched).

## CLOB Authentication

The CLOB uses two levels of authentication: L1 (Private Key) and L2 (API Key).

Authentication is not required to access client public methods and public endpoints.

### L1 Authentication

L1 authentication uses the wallet’s private key to sign an EIP-712 message used in the request header.

REST headers for L1:
- `POLY_ADDRESS` — Polygon signer address
- `POLY_SIGNATURE` — CLOB EIP 712 signature
- `POLY_TIMESTAMP` — Current UNIX timestamp
- `POLY_NONCE` — Nonce (default 0)

Endpoints mentioned:
- Create API credentials: `POST {clob-endpoint}/auth/api-key`
- Derive API credentials: `GET {clob-endpoint}/auth/derive-api-key`

### L2 Authentication

L2 uses API credentials (apiKey, secret, passphrase) and signs requests using HMAC-SHA256.

REST headers for L2:
- `POLY_ADDRESS`
- `POLY_SIGNATURE` (HMAC)
- `POLY_TIMESTAMP`
- `POLY_API_KEY`
- `POLY_PASSPHRASE`

## Missing details needed (please paste)

For READ-ONLY integration we need rate limit specifics:
- documented limits
- 429 behavior and any `Retry-After` header
- any backoff guidance

For later (execution plumbing gated behind env) we will eventually need the full signing spec (string-to-sign, canonicalization), but we will not implement execution until those docs are pasted.
