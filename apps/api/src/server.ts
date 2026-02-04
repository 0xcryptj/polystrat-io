import "dotenv/config";
import http from "node:http";
import { buildPolymarketDocsIndex } from "./docsIndex.js";
import { deleteTrader, listTraders, upsertTrader } from "./traders/store.js";
import { getTraderPositionsFromPolymarket, getTraderStatsFromPolymarket, getTraderTradesFromPolymarket } from "./traders/polymarket.js";
import { getMarketBySlug, getOrderbookByTokenId, listMarkets } from "./polymarket/public.js";
import { verifySupabaseJwt } from "./auth/supabase.js";
import { makeUserSupabaseClient } from "./wallets/supabase.js";
import { verifyWalletLink } from "./wallets/verify.js";
import { getGatingStatus } from "./gating/index.js";
import { requireTokenGate } from "./gating/middleware.js";
import { runnerGet, runnerPost } from "./runnerProxy.js";

const PORT = Number(process.env.PORT ?? 3399);

function json(res: http.ServerResponse, code: number, body: any) {
  res.statusCode = code;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body, null, 2));
}

function notFound(res: http.ServerResponse) {
  json(res, 404, { error: "not_found" });
}

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

async function requireUser(req: http.IncomingMessage): Promise<{ userId: string; email: string | null; accessToken: string }> {
  const auth = String(req.headers.authorization ?? "");
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) throw new Error("missing_authorization");
  const token = m[1];
  const user = await verifySupabaseJwt(token);
  return { userId: user.userId, email: user.email, accessToken: token };
}

async function readJsonBody(req: http.IncomingMessage): Promise<any> {
  return await new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error("invalid_json"));
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  // Basic CORS for local dev
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
  if (req.method === "OPTIONS") return res.end();

  if (req.method === "GET" && url.pathname === "/docs/polymarket") {
    const index = await buildPolymarketDocsIndex();
    return json(res, 200, index);
  }

  // Auth (read-only): verify Supabase JWT and return basic identity
  if (req.method === "GET" && url.pathname === "/me") {
    try {
      const u = await requireUser(req);
      return json(res, 200, { userId: u.userId, email: u.email });
    } catch (e: any) {
      return json(res, 401, { error: "unauthorized", message: String(e?.message ?? e) });
    }
  }

  // Wallet linking (read-only)
  if (req.method === "GET" && url.pathname === "/wallets") {
    try {
      const u = await requireUser(req);
      const sb = makeUserSupabaseClient(u.accessToken);
      const { data, error } = await sb.from("wallets").select("id,user_id,chain,address,created_at").order("created_at", { ascending: false });
      if (error) return json(res, 400, { error: "supabase_error", message: error.message });
      return json(res, 200, { wallets: data ?? [] });
    } catch (e: any) {
      return json(res, 401, { error: "unauthorized", message: String(e?.message ?? e) });
    }
  }

  // Token gating status (auth required; NOT gated)
  if (req.method === "GET" && url.pathname === "/gating/status") {
    try {
      const u = await requireUser(req);
      const sb = makeUserSupabaseClient(u.accessToken);
      const { data, error } = await sb.from("wallets").select("id,user_id,chain,address,created_at");
      if (error) return json(res, 400, { error: "supabase_error", message: error.message });
      const status = await getGatingStatus({ wallets: (data ?? []) as any });
      return json(res, 200, status);
    } catch (e: any) {
      return json(res, 401, { error: "unauthorized", message: String(e?.message ?? e) });
    }
  }

  if (req.method === "POST" && url.pathname === "/wallets/link") {
    try {
      const u = await requireUser(req);
      const body = await readJsonBody(req);

      const chain = String(body?.chain ?? "");
      const address = String(body?.address ?? "");
      const message = String(body?.message ?? "");
      const signature = String(body?.signature ?? "");

      if (chain !== "evm" && chain !== "sol") return json(res, 400, { error: "invalid_chain" });

      // Verify ownership (no storage of signature beyond verification)
      const v = verifyWalletLink({ chain: chain as any, address, message, signature });
      if (!v.ok) return json(res, 400, { error: "invalid_signature", message: v.error });

      // Bind the signed message to this user to avoid trivial cross-user replay.
      if (!message.includes(u.userId)) {
        return json(res, 400, { error: "message_missing_user_id", message: "link message must include the userId" });
      }

      const sb = makeUserSupabaseClient(u.accessToken);
      const { data, error } = await sb
        .from("wallets")
        .insert({ user_id: u.userId, chain, address })
        .select("id,user_id,chain,address,created_at")
        .single();

      if (error) return json(res, 400, { error: "supabase_error", message: error.message });
      return json(res, 200, { ok: true, wallet: data });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      const code = msg.includes("missing_authorization") ? 401 : 400;
      return json(res, code, { error: "bad_request", message: msg });
    }
  }

  const delWallet = url.pathname.match(/^\/wallets\/([^/]+)$/);
  if (req.method === "DELETE" && delWallet) {
    try {
      const u = await requireUser(req);
      const id = decodeURIComponent(delWallet[1]);
      const sb = makeUserSupabaseClient(u.accessToken);
      const { error } = await sb.from("wallets").delete().eq("id", id);
      if (error) return json(res, 400, { error: "supabase_error", message: error.message });
      return json(res, 200, { ok: true });
    } catch (e: any) {
      return json(res, 401, { error: "unauthorized", message: String(e?.message ?? e) });
    }
  }

  // Trader Profiles (in-memory)
  if (req.method === "GET" && url.pathname === "/traders") {
    return json(res, 200, { traders: listTraders() });
  }

  if (req.method === "POST" && url.pathname === "/traders") {
    try {
      const body = await readJsonBody(req);
      const profile = upsertTrader({ address: String(body?.address ?? ""), nickname: body?.nickname ? String(body.nickname) : undefined });
      return json(res, 200, { ok: true, trader: profile });
    } catch (e: any) {
      return json(res, 400, { ok: false, error: String(e?.message ?? e) });
    }
  }

  const del = url.pathname.match(/^\/traders\/([^/]+)$/);
  if (req.method === "DELETE" && del) {
    const address = decodeURIComponent(del[1]);
    const ok = deleteTrader(address);
    return json(res, 200, { ok });
  }

  // Runner proxy (token-gated)
  if (url.pathname === "/runner/strategies" && req.method === "GET") {
    let u: any;
    try {
      u = await requireUser(req);
    } catch {
      return json(res, 401, { error: "unauthorized" });
    }
    const gate = await requireTokenGate({ req, accessToken: u.accessToken });
    if (!gate.allowed) return json(res, 403, gate.status);

    const r = await runnerGet("/strategies");
    res.statusCode = r.status;
    res.setHeader("content-type", r.contentType);
    return res.end(r.text);
  }

  const rStart = url.pathname.match(/^\/runner\/strategies\/([^/]+)\/start$/);
  if (rStart && req.method === "POST") {
    let u: any;
    try {
      u = await requireUser(req);
    } catch {
      return json(res, 401, { error: "unauthorized" });
    }
    const gate = await requireTokenGate({ req, accessToken: u.accessToken });
    if (!gate.allowed) return json(res, 403, gate.status);

    const id = decodeURIComponent(rStart[1]);
    const body = await readJsonBody(req);
    const r = await runnerPost(`/strategies/${encodeURIComponent(id)}/start`, body);
    res.statusCode = r.status;
    res.setHeader("content-type", r.contentType);
    return res.end(r.text);
  }

  const rStop = url.pathname.match(/^\/runner\/strategies\/([^/]+)\/stop$/);
  if (rStop && req.method === "POST") {
    let u: any;
    try {
      u = await requireUser(req);
    } catch {
      return json(res, 401, { error: "unauthorized" });
    }
    const gate = await requireTokenGate({ req, accessToken: u.accessToken });
    if (!gate.allowed) return json(res, 403, gate.status);

    const id = decodeURIComponent(rStop[1]);
    const r = await runnerPost(`/strategies/${encodeURIComponent(id)}/stop`, {});
    res.statusCode = r.status;
    res.setHeader("content-type", r.contentType);
    return res.end(r.text);
  }

  if (url.pathname === "/runner/logs" && req.method === "GET") {
    let u: any;
    try {
      u = await requireUser(req);
    } catch {
      return json(res, 401, { error: "unauthorized" });
    }
    const gate = await requireTokenGate({ req, accessToken: u.accessToken });
    if (!gate.allowed) return json(res, 403, gate.status);

    const limit = url.searchParams.get("limit") ?? "200";
    const r = await runnerGet(`/logs?limit=${encodeURIComponent(limit)}`);
    res.statusCode = r.status;
    res.setHeader("content-type", r.contentType);
    return res.end(r.text);
  }

  // Polymarket (READ-ONLY) — proxy + normalize (gated behind Supabase auth + token gate)
  if (req.method === "GET" && url.pathname === "/polymarket/markets") {
    let u: any;
    try {
      u = await requireUser(req);
    } catch (e: any) {
      return json(res, 401, { error: "unauthorized", message: "missing/invalid Authorization Bearer token" });
    }

    const gate = await requireTokenGate({ req, accessToken: u.accessToken });
    if (!gate.allowed) return json(res, 403, gate.status);

    const limit = Number(url.searchParams.get("limit") ?? 50);
    const query = String(url.searchParams.get("query") ?? "").trim().toLowerCase();

    const markets = await listMarkets({
      limit: clampInt(limit, 0, 200),
      offset: 0,
      closed: false,
      includeTag: true
    });

    const filtered = query
      ? markets.filter((m) => (m.question ?? "").toLowerCase().includes(query) || (m.slug ?? "").toLowerCase().includes(query))
      : markets;

    return json(res, 200, { markets: filtered });
  }

  const mMarket = url.pathname.match(/^\/polymarket\/market\/([^/]+)$/);
  if (req.method === "GET" && mMarket) {
    let u: any;
    try {
      u = await requireUser(req);
    } catch {
      return json(res, 401, { error: "unauthorized" });
    }

    const gate = await requireTokenGate({ req, accessToken: u.accessToken });
    if (!gate.allowed) return json(res, 403, gate.status);

    const marketId = decodeURIComponent(mMarket[1]);
    // Based on pasted docs, we only have a market-by-slug endpoint.
    const m = await getMarketBySlug(marketId, true);
    return json(res, 200, m);
  }

  const mBook = url.pathname.match(/^\/polymarket\/orderbook\/([^/]+)$/);
  if (req.method === "GET" && mBook) {
    let u: any;
    try {
      u = await requireUser(req);
    } catch {
      return json(res, 401, { error: "unauthorized" });
    }

    const gate = await requireTokenGate({ req, accessToken: u.accessToken });
    if (!gate.allowed) return json(res, 403, gate.status);

    const tokenId = decodeURIComponent(mBook[1]);
    // Docs explicitly define orderbook by token_id. We do NOT guess market->token mapping here.
    const book = await getOrderbookByTokenId(tokenId);
    return json(res, 200, book);
  }

  if (req.method === "GET" && url.pathname.startsWith("/polymarket/trades/")) {
    return json(res, 501, {
      error: "not_implemented",
      message: "Trades endpoint docs not pasted yet (need path + schema)."
    });
  }

  // Trader read-only Polymarket data (pending docs)
  const traderStats = url.pathname.match(/^\/traders\/([^/]+)\/stats$/);
  if (req.method === "GET" && traderStats) {
    const address = decodeURIComponent(traderStats[1]);
    const stats = await getTraderStatsFromPolymarket(address);
    return json(res, 200, stats);
  }

  const traderPositions = url.pathname.match(/^\/traders\/([^/]+)\/positions$/);
  if (req.method === "GET" && traderPositions) {
    const address = decodeURIComponent(traderPositions[1]);
    const positions = await getTraderPositionsFromPolymarket(address);
    return json(res, 200, positions);
  }

  const traderTrades = url.pathname.match(/^\/traders\/([^/]+)\/trades$/);
  if (req.method === "GET" && traderTrades) {
    const address = decodeURIComponent(traderTrades[1]);
    const limit = Number(url.searchParams.get("limit") ?? 50);
    const trades = await getTraderTradesFromPolymarket(address, Number.isFinite(limit) ? limit : 50);
    return json(res, 200, trades);
  }

  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, { ok: true });
  }

  return notFound(res);
});

server.listen(PORT, () => {
  console.log(`[api] listening on http://localhost:${PORT}`);
});
