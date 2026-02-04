# DEV_NOTES — polystrat.io

## Repo layout
- `packages/strategy-sdk` — strategy interfaces + event types
- `apps/runner` — local runner + HTTP API (paper mode)
- `apps/web` — dashboard (later: real UI)
- `strategies/` — future: ingested upstream strategies + adapters

## How to run (later, after deps are installed)
> We are not installing dependencies yet. These commands will work once we add deps.

### Runner
```powershell
cd apps/runner
npm run dev
```

### Web
```powershell
cd apps/web
npm run dev
```

## Local API (runner)
- `GET /strategies`
- `POST /strategies/:id/start`
- `POST /strategies/:id/stop`
- `GET /logs`

## Notes
- Paper-mode only.
- No secrets in this repo. Use `.env.example` placeholders only.
