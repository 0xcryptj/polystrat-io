# polystrat.io — DB Schema (Plan)

This is the **target schema** for a multi-user strategy platform. For the current dev milestone, `userId` is stubbed (no real auth yet).

## Design goals
- Multi-user by default (everything belongs to a user/workspace)
- Strategy catalog is global; user configs are per-user
- Runs are immutable-ish records (start/stop timestamps + config snapshot)
- Events are append-only and linked to runs

---

## Tables

### `users`
Represents an account.

- `id` (uuid, PK)
- `email` (text, unique, not null)
- `created_at` (timestamptz, not null, default now())
- `updated_at` (timestamptz, not null, default now())

Notes:
- In Supabase, `auth.users` may be the source of truth; this table can be a profile table keyed by the auth user id.

---

### `wallets`
Wallets linked to a user (wallet login is later; we store metadata now).

- `id` (uuid, PK)
- `user_id` (uuid, FK → users.id, not null)
- `chain` (text, not null) — e.g. `evm`, `solana`
- `address` (text, not null)
- `label` (text, nullable)
- `created_at` (timestamptz, default now())

Indexes:
- unique (`chain`, `address`)
- index (`user_id`)

---

### `strategies_catalog`
Global catalog of strategies available on the platform.

- `id` (text, PK) — stable identifier, e.g. `toy-random-walk` or `mean-reversion-v1`
- `name` (text, not null)
- `description` (text, nullable)
- `source_type` (text, not null) — `internal` | `oss`
- `repo_url` (text, nullable)
- `license` (text, nullable)
- `author` (text, nullable)
- `created_at` (timestamptz, default now())

Notes:
- For OSS ingestion later, this maps to `strategies/<name>/meta.json`.

---

### `user_strategies`
A user’s configured strategy instance (config + enabled flag). Think “my bot config”.

- `id` (uuid, PK)
- `user_id` (uuid, FK → users.id, not null)
- `strategy_id` (text, FK → strategies_catalog.id, not null)
- `name` (text, not null) — user-facing label
- `config` (jsonb, not null, default '{}')
- `enabled` (boolean, not null, default false)
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

Indexes:
- index (`user_id`)
- index (`strategy_id`)

---

### `runs`
A single execution run of a strategy instance.

- `id` (uuid, PK)
- `user_id` (uuid, FK → users.id, not null)
- `user_strategy_id` (uuid, FK → user_strategies.id, nullable)
- `strategy_id` (text, FK → strategies_catalog.id, not null)
- `status` (text, not null) — `running` | `stopped` | `error`
- `started_at` (timestamptz, not null)
- `stopped_at` (timestamptz, nullable)
- `config_snapshot` (jsonb, not null)
- `runner_instance_id` (text, nullable) — for future scaling

Indexes:
- index (`user_id`)
- index (`strategy_id`)
- index (`status`)

---

### `events`
Append-only event stream produced by runners.

- `id` (uuid, PK)
- `run_id` (uuid, FK → runs.id, not null)
- `user_id` (uuid, FK → users.id, not null)
- `strategy_id` (text, FK → strategies_catalog.id, not null)
- `ts` (timestamptz, not null)
- `type` (text, not null) — `log` | `signal` | `error` | `paperTrade` | ...
- `payload` (jsonb, not null)

Indexes:
- index (`run_id`, `ts`)
- index (`user_id`, `ts`)

---

## Relationships (summary)
- users 1—N wallets
- users 1—N user_strategies
- strategies_catalog 1—N user_strategies
- users 1—N runs
- runs 1—N events

---

## Notes for the current dev milestone
- We are not implementing real auth/DB yet.
- API will accept `userId` as a stub (e.g. `dev-user-1`) and keep events in memory + optional JSONL.
