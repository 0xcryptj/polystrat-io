import "dotenv/config";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { serialize as serializeCookie } from "cookie";

import { migrate, openDb } from "./db/db.js";
import { verifySolanaMessageSignature } from "./auth/solana.js";
import { signSession } from "./auth/session.js";
import { requireSession } from "./auth/middleware.js";
import { getSplTokenBalance, getSplTokenDecimals } from "./solana/rpc.js";

import { runnerGet, runnerPost } from "./runnerProxy.js";

const PORT = Number(process.env.PORT ?? 3399);

// Non-secret config (allowed): SPL mint, min amount, RPC URL
const GATE_MINT = String(process.env.GATE_MINT ?? "").trim();
const GATE_MIN_AMOUNT = String(process.env.GATE_MIN_AMOUNT ?? "1").trim(); // UI-friendly, e.g. "1" token

function json(res: http.ServerResponse, code: number, body: any) {
  res.statusCode = code;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body, null, 2));
}

function notFound(res: http.ServerResponse) {
  json(res, 404, { error: "not_found" });
}

async function readJsonBody(req: http.IncomingMessage): Promise<any> {
  return await new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("invalid_json"));
      }
    });
    req.on("error", reject);
  });
}

const WEB_ORIGIN = String(process.env.WEB_ORIGIN ?? "http://127.0.0.1:5173");

function setCors(req: http.IncomingMessage, res: http.ServerResponse) {
  // For cookie auth, we must NOT use "*". Reflect/allowlist the dev origin.
  const origin = String(req.headers.origin ?? "");
  const allow = origin && origin === WEB_ORIGIN ? origin : WEB_ORIGIN;

  res.setHeader("access-control-allow-origin", allow);
  res.setHeader("vary", "origin");
  res.setHeader("access-control-allow-credentials", "true");
  res.setHeader("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
}

function requireGateConfigured() {
  if (!GATE_MINT) throw new Error("gate_mint_not_configured");
}

async function checkTokenGate(solAddress: string): Promise<{ allowed: boolean; reason?: string; balanceRaw?: string; decimals?: number }> {
  requireGateConfigured();

  const decimals = await getSplTokenDecimals({ mint: GATE_MINT });
  const bal = await getSplTokenBalance({ owner: solAddress, mint: GATE_MINT });

  // Convert min amount (string tokens) -> raw units bigint
  const minTokens = Number(GATE_MIN_AMOUNT);
  const minRaw = BigInt(Math.floor(minTokens * 10 ** decimals));

  const allowed = bal >= minRaw;
  return { allowed, reason: allowed ? "ok" : "insufficient_token_balance", balanceRaw: bal.toString(), decimals };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  setCors(req, res);
  if (req.method === "OPTIONS") return res.end();

  // --- Boot ---
  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, { ok: true });
  }

  // --- Auth: Solana token-gated session ---
  // 1) Client requests nonce
  if (req.method === "POST" && url.pathname === "/auth/nonce") {
    try {
      const body = await readJsonBody(req);
      const solAddress = String(body?.address ?? "").trim();
      if (!solAddress) return json(res, 400, { ok: false, error: "missing_address" });

      requireGateConfigured();

      const nonce = randomUUID();
      const expiresAt = Date.now() + 5 * 60_000;
      const message = `polystrat login\naddress: ${solAddress}\nnonce: ${nonce}`;

      const db = openDb();
      migrate(db);
      db.prepare(
        "insert into nonces(sol_address, nonce, message, expires_at) values(?,?,?,?) on conflict(sol_address) do update set nonce=excluded.nonce, message=excluded.message, expires_at=excluded.expires_at"
      ).run(solAddress, nonce, message, expiresAt);

      return json(res, 200, { ok: true, nonce, message, expiresAt });
    } catch (e: any) {
      return json(res, 400, { ok: false, error: String(e?.message ?? e) });
    }
  }

  // 2) Client signs message containing nonce; server verifies signature + token balance; issues cookie
  if (req.method === "POST" && url.pathname === "/auth/verify") {
    try {
      const body = await readJsonBody(req);
      const solAddress = String(body?.address ?? "").trim();
      const signature = String(body?.signature ?? "").trim(); // base64

      if (!solAddress || !signature) return json(res, 400, { ok: false, error: "missing_address_or_signature" });

      const db = openDb();
      migrate(db);
      const row = db.prepare("select nonce, message, expires_at from nonces where sol_address=?").get(solAddress) as any;
      if (!row) return json(res, 400, { ok: false, error: "missing_nonce" });
      if (Date.now() > Number(row.expires_at)) return json(res, 400, { ok: false, error: "nonce_expired" });

      const message = String(row.message ?? "");
      if (!message) return json(res, 400, { ok: false, error: "missing_message" });

      const okSig = verifySolanaMessageSignature({ address: solAddress, message, signatureBase64: signature });
      if (!okSig) return json(res, 401, { ok: false, error: "invalid_signature" });

      const gate = await checkTokenGate(solAddress);
      if (!gate.allowed) return json(res, 403, { ok: false, error: "token_gate_failed", gate });

      // upsert user
      const userId = `u_${solAddress}`;
      db.prepare("insert into users(id, sol_address, created_at) values(?,?,?) on conflict(id) do nothing")
        .run(userId, solAddress, Date.now());

      // consume nonce
      db.prepare("delete from nonces where sol_address=?").run(solAddress);

      const jwt = await signSession({ sub: userId, sol: solAddress });
      // NOTE: For Vite dev, we can't reliably use SameSite=None without https.
      const cookie = serializeCookie("ps_session", jwt, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7
      });
      res.setHeader("set-cookie", cookie);

      return json(res, 200, { ok: true, userId, solAddress, gate });
    } catch (e: any) {
      return json(res, 400, { ok: false, error: String(e?.message ?? e) });
    }
  }

  if (req.method === "POST" && url.pathname === "/auth/logout") {
    res.setHeader(
      "set-cookie",
      serializeCookie("ps_session", "", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 0
      })
    );
    return json(res, 200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/me") {
    try {
      const s = await requireSession(req);
      return json(res, 200, { ok: true, userId: s.userId, solAddress: s.solAddress });
    } catch {
      return json(res, 401, { ok: false, error: "unauthorized" });
    }
  }

  // --- Strategy dashboard routes (protected) ---
  if (req.method === "GET" && url.pathname === "/strategies") {
    // proxy to runner; must be authenticated + token-gated via login
    try {
      await requireSession(req);
    } catch {
      return json(res, 401, { error: "unauthorized" });
    }
    const r = await runnerGet("/strategies");
    res.statusCode = r.status;
    res.setHeader("content-type", r.contentType);
    return res.end(r.text);
  }

  // tracked wallets CRUD
  if (req.method === "GET" && url.pathname === "/tracked-wallets") {
    try {
      const s = await requireSession(req);
      const db = openDb();
      migrate(db);
      const wallets = db
        .prepare("select id, chain, address, paused, created_at from tracked_wallets where user_id=? order by created_at desc")
        .all(s.userId)
        .map((w: any) => ({ ...w, paused: Boolean(w.paused) }));
      return json(res, 200, { wallets });
    } catch {
      return json(res, 401, { error: "unauthorized" });
    }
  }

  if (req.method === "POST" && url.pathname === "/tracked-wallets") {
    try {
      const s = await requireSession(req);
      const body = await readJsonBody(req);

      const chain = String(body?.chain ?? "").trim();
      const address = String(body?.address ?? "").trim();
      if (!chain || !address) return json(res, 400, { ok: false, error: "missing_chain_or_address" });

      const db = openDb();
      migrate(db);
      const id = randomUUID();
      db.prepare("insert into tracked_wallets(id, user_id, chain, address, paused, created_at) values(?,?,?,?,?,?)")
        .run(id, s.userId, chain, address, 0, Date.now());

      return json(res, 200, { ok: true, id });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      return json(res, 400, { ok: false, error: msg.includes("UNIQUE") ? "already_tracked" : msg });
    }
  }

  const pauseMatch = url.pathname.match(/^\/tracked-wallets\/([^/]+)\/pause$/);
  if (req.method === "POST" && pauseMatch) {
    try {
      const s = await requireSession(req);
      const id = decodeURIComponent(pauseMatch[1]);
      const body = await readJsonBody(req);
      const paused = Boolean(body?.paused);
      const db = openDb();
      migrate(db);
      db.prepare("update tracked_wallets set paused=? where id=? and user_id=?").run(paused ? 1 : 0, id, s.userId);
      return json(res, 200, { ok: true });
    } catch {
      return json(res, 401, { error: "unauthorized" });
    }
  }

  const delMatch = url.pathname.match(/^\/tracked-wallets\/([^/]+)$/);
  if (req.method === "DELETE" && delMatch) {
    try {
      const s = await requireSession(req);
      const id = decodeURIComponent(delMatch[1]);
      const db = openDb();
      migrate(db);
      db.prepare("delete from tracked_wallets where id=? and user_id=?").run(id, s.userId);
      return json(res, 200, { ok: true });
    } catch {
      return json(res, 401, { error: "unauthorized" });
    }
  }

  // Paper runner control (protected)
  if (req.method === "POST" && url.pathname === "/paper/start") {
    try {
      const s = await requireSession(req);
      const r = await runnerPost("/paper/start", { userId: s.userId });
      res.statusCode = r.status;
      res.setHeader("content-type", r.contentType);
      return res.end(r.text);
    } catch {
      return json(res, 401, { error: "unauthorized" });
    }
  }

  if (req.method === "POST" && url.pathname === "/paper/stop") {
    try {
      const s = await requireSession(req);
      const r = await runnerPost("/paper/stop", { userId: s.userId });
      res.statusCode = r.status;
      res.setHeader("content-type", r.contentType);
      return res.end(r.text);
    } catch {
      return json(res, 401, { error: "unauthorized" });
    }
  }

  if (req.method === "GET" && url.pathname === "/paper/status") {
    try {
      const s = await requireSession(req);
      const r = await runnerGet(`/paper/status?userId=${encodeURIComponent(s.userId)}`);
      res.statusCode = r.status;
      res.setHeader("content-type", r.contentType);
      return res.end(r.text);
    } catch {
      return json(res, 401, { error: "unauthorized" });
    }
  }

  if (req.method === "GET" && url.pathname === "/paper/pnl") {
    try {
      const s = await requireSession(req);
      const r = await runnerGet(`/paper/pnl?userId=${encodeURIComponent(s.userId)}`);
      res.statusCode = r.status;
      res.setHeader("content-type", r.contentType);
      return res.end(r.text);
    } catch {
      return json(res, 401, { error: "unauthorized" });
    }
  }

  return notFound(res);
});

server.listen(PORT, () => {
  const db = openDb();
  migrate(db);
  console.log(`[api] listening on http://localhost:${PORT}`);
});
