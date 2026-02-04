# DEV_NOTES — polystrat.io

## Repo layout
- `packages/strategy-sdk` — strategy interfaces + event types
- `apps/runner` — local runner + HTTP API (paper mode)
- `apps/web` — Vite + React + TS dashboard
- `strategies/` — future: ingested upstream strategies + adapters

## Install
```powershell
cd $env:USERPROFILE\OneDrive\Desktop\polystrat.io
npm install
```

## Run (2 terminals)
> Start runner first, then web.

### Terminal 1 — Runner
```powershell
cd $env:USERPROFILE\OneDrive\Desktop\polystrat.io\apps\runner
npm run dev
```

Runner default: `http://localhost:3344`

### Terminal 2 — Web
```powershell
cd $env:USERPROFILE\OneDrive\Desktop\polystrat.io\apps\web
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## Local API (runner)
- `GET /strategies`
- `POST /strategies/:id/start`
- `POST /strategies/:id/stop`
- `GET /logs?limit=200`

## Notes
- Paper-mode only.
- No secrets in this repo. Use `.env.example` placeholders only.
- Runner writes local events to `apps/runner/data/events.jsonl` (gitignored).
