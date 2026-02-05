import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";

type PaperRunState = {
  userId: string;
  running: boolean;
  lastTickTs: number | null;
  lastError: string | null;
  timer: NodeJS.Timeout | null;
};

const states = new Map<string, PaperRunState>();

const DB_PATH = process.env.DB_PATH || path.join(findWorkspaceRoot(), "apps", "api", "data", "polystrat.db");

function openDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  return db;
}

function findWorkspaceRoot(): string {
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

export function startPaperRun(userId: string, intervalMs = 5000) {
  const existing = states.get(userId);
  if (existing?.running) return;

  const st: PaperRunState = {
    userId,
    running: true,
    lastTickTs: null,
    lastError: null,
    timer: null
  };

  const tick = () => {
    st.lastTickTs = Date.now();
    try {
      const db = openDb();

      // pull tracked wallets (unpaused)
      const wallets = db
        .prepare("select chain,address from tracked_wallets where user_id=? and paused=0")
        .all(userId) as any[];

      // SUPER MVP: stub PnL. Each tick adds +0.5 USD per active tracked wallet.
      const delta = wallets.length * 0.5;

      const last = db.prepare("select total_usd from pnl_snapshots where user_id=? order by ts desc limit 1").get(userId) as any;
      const prev = last?.total_usd != null ? Number(last.total_usd) : 0;
      const next = prev + delta;

      db.prepare("insert into pnl_snapshots(id,user_id,ts,total_usd) values(?,?,?,?)")
        .run(`p_${randomUUID()}`, userId, Date.now(), next);

      st.lastError = null;
    } catch (e: any) {
      st.lastError = String(e?.message ?? e);
    }
  };

  st.timer = setInterval(tick, intervalMs);
  // tick once immediately
  tick();
  states.set(userId, st);
}

export function stopPaperRun(userId: string) {
  const st = states.get(userId);
  if (!st) return;
  if (st.timer) clearInterval(st.timer);
  st.running = false;
  st.timer = null;
  states.set(userId, st);
}

export function getPaperStatus(userId: string) {
  const st = states.get(userId);
  return {
    userId,
    running: Boolean(st?.running),
    lastTickTs: st?.lastTickTs ?? null,
    lastError: st?.lastError ?? null
  };
}

export function getPaperPnl(userId: string) {
  try {
    const db = openDb();
    const rows = db
      .prepare("select ts,total_usd from pnl_snapshots where user_id=? order by ts desc limit 200")
      .all(userId) as any[];
    return { ok: true, snapshots: rows.reverse() };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e), snapshots: [] };
  }
}
