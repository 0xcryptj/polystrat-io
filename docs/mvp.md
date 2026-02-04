# polystrat.io — MVP (Thin Slice)

## Goal
Deliver a working end-to-end “paper mode” strategy run loop with a simple dashboard.

This MVP is **not** live trading. It is a controlled sandbox to prove:
- strategy packaging + lifecycle
- runner orchestration + event/log plumbing
- dashboard control plane (start/stop/config)

## Thin Slice Definition
A user can:
1) Open the dashboard
2) See a list of strategies (at least 1 dummy strategy)
3) Configure the strategy parameters (simple form)
4) Start the strategy (paper mode)
5) Watch logs/events update (tail/refresh)
6) Stop the strategy

## Non-Goals (Day 1)
- Real Polymarket execution/signing
- Wallet connect/auth
- Payments/subscriptions
- Multi-tenant hosting
- Production-grade persistence

## Core Components
- **Strategy SDK**: interfaces/types for strategies + events
- **Runner service**: loads strategy, runs tick loop, persists events, exposes HTTP API
- **Web app**: reads API, provides basic controls & log viewer

## Milestones
### M0 — Docs + Scaffold
- Repo structure + minimal packages
- Basic docs in /docs

### M1 — Strategy SDK
- Types/interfaces for metadata, config schema, lifecycle, events

### M2 — Runner (local)
- Dummy strategy loaded
- Tick loop with mock market data
- Events emitted and persisted
- HTTP API endpoints working

### M3 — Web dashboard (skeleton)
- Strategies list + status
- Strategy detail: config + start/stop
- Logs page: recent events

## Acceptance Criteria
- `runner` can be started locally and responds to:
  - `GET /strategies`
  - `POST /strategies/:id/start`
  - `POST /strategies/:id/stop`
  - `GET /logs`
- `web` can display strategy list and recent logs
- All trades are clearly marked **PAPER**

## Risks / Unknowns
- Polymarket data sources for historical & realtime (future)
- How we’ll standardize strategy ingestion from open-source repos
- Backtesting data model (future: squawkr-like UX)
