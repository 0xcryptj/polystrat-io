# Polymarket Bot (Desktop)

A local, Windows-friendly Polymarket bot focused on **BTC “Up/Down — 5 minutes”**.

## Thesis (what we’re building)
Prediction markets can have **pricing errors** (mispricings) that persist longer than in highly-arbed Wall Street markets.
The BTC 5‑minute Up/Down market is interesting because it:
- resolves quickly (capital can roll every ~5 minutes)
- settles to **$1 per share if correct**, **$0 if wrong** (binary payoff)
- provides a tight feedback loop for testing signal + execution

Goal: build a **paper-first**, data-driven system that:
- pulls **live prices + liquidity** from Polymarket CLOB
- marks PnL correctly (unrealized uses **best bid**; realized uses resolution)
- learns over time (log-growth objective) and only trades when edge is **tradeable after costs**

## Status
- Paper trading: ✅
- Live trading: 🚫 (not wired yet — intentionally)

## Safety defaults
- **DRY RUN** by default (no real orders)
- Per-tier paper ledgers: **t1/t2/t5**, each starts at **$85** (configurable)
- **No-repeat rule**: one exposure per (event,tier) to avoid stacking bets

## Quick start (Windows)
- Double-click: `Start Bot.bat`
- UI: http://127.0.0.1:3188

Stop:
- Double-click: `Stop Bot.bat`

Kill stuck instances:
- `Kill All Bot Instances.bat`

TUI:
- `Start TUI.bat` (keys: `1`/`2`/`5` switch tiers, `q` quit)

## Scripts
- `npm run prod` — build + run (stable)
- `npm run dev` — dev watch (use only while editing)
- `npm run compact` — rotate/compact noisy jsonl logs in `data/`
- `npm run reset:paper` — archive paper/equity state then reset
- `npm run backtest` — run a basic backtest over recorded series (sanity check)

## Config
Edit `config.json`.

## Data layout
Everything is file-based for Windows simplicity:
- `data/paper_t*.json` — paper ledgers
- `data/equity_t*.jsonl` — equity history per tier
- `data/btc5m_series.jsonl` — BTC5m series snapshots
- `data/archive/*` — rotated backups
- `data/backtests/*` — backtest outputs

## Secrets / Environment
Create a `.env` next to `package.json`.

- **Do not commit secrets**.
- `.env.example` contains placeholders only.

Common env vars:
- `POLYMARKET_API_KEY`, `POLYMARKET_API_SECRET`, `POLYMARKET_API_PASSPHRASE` (only for future live trading)
- Optional (future on-chain): `PRIVATE_KEY`, `RPC_URL`, `CHAIN_ID`

## Notes
This is an experimentation rig. “Turn $145 into $45k overnight” is not a spec — it’s a cautionary tale about variance.
We optimize for **log-growth** and survivability first, then scale when the edge is proven.
