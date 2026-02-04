# Polymarket Docs (Pasted)

This folder is the **single source of truth** for Polymarket documentation used by polystrat.

## Rules

- **Do not browse the web** from the agent. All Polymarket integration work is based on docs you paste here.
- Paste docs as **markdown** into the files below.
- Keep upstream wording intact where possible.

## Where to paste what

- `docs/polymarket/auth.md`
  - Authentication methods, signing, headers
  - Base URLs / environments
  - Rate limits / backoff guidance

- `docs/polymarket/market-data.md`
  - Market data / Gamma API
  - Market object schema
  - Mapping from market -> conditionId / token IDs / outcomes

- `docs/polymarket/clob-api.md`
  - CLOB endpoints
  - Orderbook schema
  - Trades/fills endpoints (public)
  - Websocket docs (if any)

- `docs/polymarket/faq-notes.md`
  - Gotchas, FAQ, edge cases
  - Any notes about what is read-only vs trading

## Formatting guidelines (important)

- Preserve headings (`#`, `##`, `###`) because we index them.
- If you copy from HTML/PDF, add a top heading that names the page.

Example:

```md
# CLOB API — Get Orderbook

## Endpoint
...

## Response
...
```

## Naming / structure

If a file gets too big, split it and reference it from the main file.
Example:

- `clob-api.md`
- `clob-api.orderbook.md`
- `clob-api.websocket.md`

If you do, keep the main file with links + a short index.
