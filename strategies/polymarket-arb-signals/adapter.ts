import type { Strategy } from "@polystrat/strategy-sdk";

// Ported strategy adapter (safe): based on concepts from
// https://github.com/runesatsdev/polymarket-arbitrage-bot
// Hard rule: no private keys. Emits signals/paperTrade only.

type Cfg = {
  // discovery
  topMarkets: number;
  scanIntervalSec: number;
  minEdge: number; // minimum arb edge (e.g. 0.02 = 2%)
  includeClosed: boolean;
  // execution
  executionMode: "paper" | "live"; // live is server-gated and should be blocked today
  paperSizeUsd: number;
};

const GAMMA_BASE = "https://gamma-api.polymarket.com";
const CLOB_BASE = "https://clob.polymarket.com";

async function getJson(url: string) {
  const r = await fetch(url, { headers: { "accept": "application/json" } });
  if (!r.ok) throw new Error(`http ${r.status} for ${url}`);
  return await r.json();
}

async function listMarkets(limit: number, offset: number, closed: boolean) {
  const q = new URLSearchParams();
  q.set("limit", String(limit));
  q.set("offset", String(offset));
  q.set("closed", String(closed));
  // include_tag true helps sometimes, but it's bigger payload; keep off for speed.
  const url = `${GAMMA_BASE}/markets?${q.toString()}`;
  const raw = await getJson(url);
  return Array.isArray(raw) ? raw : [];
}

function parseOutcomes(m: any): { outcomes: string[]; prices: number[]; tokenIds: string[] } | null {
  try {
    const outcomes = Array.isArray(m?.outcomes) ? m.outcomes.map(String) : JSON.parse(String(m?.outcomes ?? "[]"));
    const prices = Array.isArray(m?.outcomePrices) ? m.outcomePrices.map(Number) : JSON.parse(String(m?.outcomePrices ?? "[]")).map(Number);
    const tokenIds = Array.isArray(m?.clobTokenIds) ? m.clobTokenIds.map(String) : JSON.parse(String(m?.clobTokenIds ?? "[]"));
    if (!Array.isArray(outcomes) || !Array.isArray(prices) || !Array.isArray(tokenIds)) return null;
    if (!outcomes.length || outcomes.length !== prices.length || outcomes.length !== tokenIds.length) return null;
    return { outcomes, prices, tokenIds };
  } catch {
    return null;
  }
}

async function getMidByTokenId(tokenId: string): Promise<number | null> {
  const q = new URLSearchParams();
  q.set("token_id", tokenId);
  const url = `${CLOB_BASE}/book?${q.toString()}`;
  const ob = await getJson(url);
  const bids = Array.isArray(ob?.bids) ? ob.bids : [];
  const asks = Array.isArray(ob?.asks) ? ob.asks : [];
  const bestBid = bids.length ? Number(bids[0]?.price ?? bids[0]?.[0]) : NaN;
  const bestAsk = asks.length ? Number(asks[0]?.price ?? asks[0]?.[0]) : NaN;
  if (!Number.isFinite(bestBid) || !Number.isFinite(bestAsk)) return null;
  return (bestBid + bestAsk) / 2;
}

export const strategy: Strategy<Cfg> = {
  meta: {
    id: "polymarket-arb-signals",
    name: "Polymarket Arbitrage Signals",
    description: "Detects simple probability-sum arbitrage opportunities and emits signals (paper-only).",
    tags: ["polymarket", "arbitrage", "signals"]
  },

  configSchema: {
    fields: [
      { key: "topMarkets", label: "Top markets", type: "number", default: 50, min: 5, max: 100, step: 1, required: true },
      { key: "scanIntervalSec", label: "Scan interval (sec)", type: "number", default: 60, min: 10, max: 3600, step: 1, required: true },
      { key: "minEdge", label: "Min edge", type: "number", default: 0.02, min: 0.0, max: 0.2, step: 0.005, required: true },
      { key: "includeClosed", label: "Include closed markets", type: "boolean", default: false },
      { key: "paperSizeUsd", label: "Paper size (USD)", type: "number", default: 50, min: 1, max: 1000, step: 1 },
      {
        key: "executionMode",
        label: "Execution Mode",
        type: "select",
        default: "paper",
        options: [
          { label: "Paper", value: "paper" },
          { label: "Live (server-gated)", value: "live" }
        ]
      }
    ]
  },

  async start(ctx, config) {
    ctx.emit({ type: "log", level: "info", message: "arb-signals start", data: { config: { ...config, executionMode: "paper" } } });
  },

  async stop(ctx) {
    ctx.emit({ type: "log", level: "info", message: "arb-signals stop" });
  },

  async onTick(ctx, input: any) {
    // Runner calls onTick frequently (pollMs). We self-throttle using scanIntervalSec.
    const now = ctx.now();
    const last = (globalThis as any).__arb_last_scan_ts ?? 0;
    const cfg: Cfg = {
      topMarkets: Number((input as any)?.topMarkets ?? 50),
      scanIntervalSec: Number((input as any)?.scanIntervalSec ?? 60),
      minEdge: Number((input as any)?.minEdge ?? 0.02),
      includeClosed: Boolean((input as any)?.includeClosed ?? false),
      executionMode: ((input as any)?.executionMode === "live" ? "live" : "paper"),
      paperSizeUsd: Number((input as any)?.paperSizeUsd ?? 50)
    };

    if (now - last < cfg.scanIntervalSec * 1000) return;
    (globalThis as any).__arb_last_scan_ts = now;

    // Pull top markets from Gamma and compute naive arb (sum of mid prices != 1)
    const markets = await listMarkets(Math.max(5, Math.min(100, cfg.topMarkets)), 0, cfg.includeClosed);

    let scanned = 0;
    let found = 0;

    for (const m of markets) {
      const parsed = parseOutcomes(m);
      if (!parsed) continue;

      // Only attempt if 2-8 outcomes for now.
      if (parsed.outcomes.length < 2 || parsed.outcomes.length > 8) continue;

      scanned++;

      // Use orderbook mids if possible; fall back to gamma outcomePrices.
      const mids: (number | null)[] = [];
      for (const tokenId of parsed.tokenIds) {
        try {
          const mid = await getMidByTokenId(tokenId);
          mids.push(mid);
        } catch {
          mids.push(null);
        }
      }

      const prices = mids.every((x) => typeof x === "number" && Number.isFinite(x))
        ? (mids as number[])
        : parsed.prices;

      const sum = prices.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
      const edge = 1 - sum;

      if (edge >= cfg.minEdge) {
        found++;
        const question = String(m?.question ?? m?.title ?? m?.slug ?? "market");
        ctx.emit({
          type: "signal",
          message: `arb: sum=${sum.toFixed(4)} edge=${edge.toFixed(4)} on ${question}`,
          confidence: Math.max(0, Math.min(1, edge / Math.max(cfg.minEdge, 0.0001))),
          data: {
            marketId: String(m?.id ?? ""),
            slug: m?.slug ?? null,
            outcomes: parsed.outcomes,
            prices,
            sum,
            edge,
            source: "gamma+clob"
          }
        });

        // Optional paper trade suggestion: buy all outcomes with equal size.
        if (cfg.executionMode === "paper") {
          const perLeg = cfg.paperSizeUsd / prices.length;
          for (let i = 0; i < prices.length; i++) {
            const p = prices[i];
            if (!Number.isFinite(p) || p <= 0) continue;
            ctx.emit({
              type: "paperTrade",
              marketId: String(m?.id ?? ""),
              side: "buy",
              price: p,
              size: perLeg,
              reason: "arb_buy_all"
            });
          }
        }
      }

      if (scanned >= cfg.topMarkets) break;
    }

    ctx.emit({ type: "log", level: "info", message: "scan complete", data: { scanned, found } });
  }
};
