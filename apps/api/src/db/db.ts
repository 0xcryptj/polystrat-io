import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = process.env.DB_PATH || path.join(findWorkspaceRoot(), "apps", "api", "data", "polystrat.db");

export function openDb() {
  const dir = path.dirname(DB_PATH);
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  return db;
}

export function migrate(db = openDb()) {
  db.exec(`
  create table if not exists users (
    id text primary key,
    sol_address text not null unique,
    created_at integer not null
  );

  create table if not exists nonces (
    sol_address text primary key,
    nonce text not null,
    message text null,
    expires_at integer not null
  );

  create table if not exists tracked_wallets (
    id text primary key,
    user_id text not null,
    chain text not null,
    address text not null,
    paused integer not null default 0,
    created_at integer not null,
    unique(user_id, chain, address)
  );

  create table if not exists pnl_snapshots (
    id text primary key,
    user_id text not null,
    ts integer not null,
    total_usd real not null
  );
  `);

  // Lightweight migrations for dev: try to add new columns without breaking existing dbs.
  try {
    db.exec("alter table nonces add column message text");
  } catch {
    // ignore if already exists
  }
}

function findWorkspaceRoot(): string {
  // Walk up a few directories looking for a package.json with workspaces.
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, "package.json");
    try {
      const raw = fs.readFileSync(candidate, "utf8");
      const j = JSON.parse(raw);
      if (j && typeof j === "object" && Array.isArray(j.workspaces)) return dir;
    } catch {
      // ignore
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}
