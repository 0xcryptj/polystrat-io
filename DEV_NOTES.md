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

## Run (3 terminals)
> Start runner first, then API, then web.

### Terminal 1 — Runner
```powershell
cd $env:USERPROFILE\OneDrive\Desktop\polystrat.io\apps\runner
npm run dev
```

Runner default: `http://localhost:3344`

### Terminal 2 — API
```powershell
cd $env:USERPROFILE\OneDrive\Desktop\polystrat.io\apps\api
npm run dev
```

API default: `http://localhost:3399`

### Terminal 3 — Web
```powershell
cd $env:USERPROFILE\OneDrive\Desktop\polystrat.io\apps\web
npm run dev
```

Open the URL Vite prints (usually `http://127.0.0.1:5173`).

## Local API (runner)
- `GET /strategies`
- `POST /strategies/:id/start`
- `POST /strategies/:id/stop`
- `GET /logs?limit=200`

## Notes
- Paper-mode only.
- No secrets in this repo. Use `.env.example` placeholders only.
- Runner writes local events to `apps/runner/data/events.jsonl` (gitignored).
