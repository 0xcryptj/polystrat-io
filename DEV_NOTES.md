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

## Supabase local env

Your Supabase keys live in:
- `apps/web/.env.local` (Vite)
- `apps/api/.env.local` (API)

Never commit these.

## Port conflicts (EADDRINUSE)

Dev servers can pile up (tsx/vite watchers) and you’ll start seeing:
- `EADDRINUSE` on **3344** (runner)
- `EADDRINUSE` on **3399** (api)
- Vite bumping from **5173** → **5174**

### Fix: kill the port holders

Run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/kill-ports.ps1
```

Then restart:

```bash
npm -w apps/runner run dev
npm -w apps/api run dev
npm -w apps/web run dev
```

## Notes
- Paper-mode only.
- No secrets in this repo. Use `.env.example` placeholders only.
