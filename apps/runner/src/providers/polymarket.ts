import type { MarketDataProvider, MarketSnapshot } from "./types.js";

// Read-only public data via Polymarket's Gamma API.
// HARD RULES: no private endpoints, no orders.

type CacheEntry = {
  snapshot: MarketSnapshot;
  fetchedAt: number;
};

export class PolymarketMarketDataProvider implements MarketDataProvider {
  private cache = new Map<string, CacheEntry>();
  private inFlight = new Map<string, Promise<MarketSnapshot>>();
  private lastRequestAt = 0;

  constructor(
    private opts: {
      cacheTtlMs?: number;
      throttleMs?: number;
      baseUrl?: string;
      // If a fetch fails, return cached data as long as it isn't older than this.
      maxStaleMs?: number;
    } = {}
  ) {}

  async getMarketSnapshot(marketId: string): Promise<MarketSnapshot> {
    const now = Date.now();

    const cacheTtlMs = this.opts.cacheTtlMs ?? 1500;
    const throttleMs = this.opts.throttleMs ?? 250;
    const maxStaleMs = this.opts.maxStaleMs ?? 60_000;

    const cached = this.cache.get(marketId);
    if (cached && now - cached.fetchedAt <= cacheTtlMs) return cached.snapshot;

    const existing = this.inFlight.get(marketId);
    if (existing) return existing;

    const p = (async () => {
      // crude global throttle
      const wait = Math.max(0, throttleMs - (now - this.lastRequestAt));
      if (wait) await sleep(wait);
      this.lastRequestAt = Date.now();

      try {
        const snap = await fetchGammaSnapshot(marketId, this.opts.baseUrl);
        this.cache.set(marketId, { snapshot: snap, fetchedAt: Date.now() });
        return snap;
      } catch (err) {
        // Graceful fallback: if we have somewhat-recent cached data, return it.
        if (cached && Date.now() - cached.snapshot.ts <= maxStaleMs) return cached.snapshot;
        throw err;
      } finally {
        this.inFlight.delete(marketId);
      }
    })();

    this.inFlight.set(marketId, p);
    return p;
  }
}

async function fetchGammaSnapshot(marketId: string, baseUrl?: string): Promise<MarketSnapshot> {
  const base = (baseUrl ?? "https://gamma-api.polymarket.com").replace(/\/+$/, "");

  // Gamma supports /markets/<id> and /markets?id=<id> (in some deployments).
  // We'll try the direct form first, then fallback.
  const directUrl = `${base}/markets/${encodeURIComponent(marketId)}`;
  const r1 = await fetch(directUrl, {
    method: "GET",
    headers: {
      "accept": "application/json"
    }
  });

  let raw: any;
  if (r1.ok) {
    raw = await r1.json();
  } else {
    const listUrl = `${base}/markets?id=${encodeURIComponent(marketId)}`;
    const r2 = await fetch(listUrl, { method: "GET", headers: { "accept": "application/json" } });
    if (!r2.ok) throw new Error(`polymarket gamma api error: ${r2.status} ${r2.statusText}`);
    const j = await r2.json();
    raw = Array.isArray(j) ? j[0] : (j?.markets?.[0] ?? j);
  }

  const parsed = parseGammaMarket(raw);
  if (!parsed) throw new Error("polymarket gamma api: unexpected market payload");

  return {
    marketId: String(parsed.marketId),
    ts: Date.now(),
    priceYes: parsed.priceYes,
    priceNo: parsed.priceNo,
    volume: parsed.volume,
    liquidity: parsed.liquidity,
    source: "polymarket",
    raw
  };
}

function parseGammaMarket(raw: any): null | {
  marketId: string;
  priceYes: number;
  priceNo?: number;
  volume?: number;
  liquidity?: number;
} {
  if (!raw || typeof raw !== "object") return null;

  const marketId = String(raw.id ?? raw.marketId ?? raw.conditionId ?? raw.slug ?? "");
  if (!marketId) return null;

  // Common Gamma fields seen in the wild:
  // - outcomePrices: ["0.62","0.38"] (aligned with outcomes)
  // - bestBid / bestAsk on outcome tokens (not always)
  // We'll do a best-effort mapping: treat the first outcome as YES.
  let priceYes: number | undefined;
  let priceNo: number | undefined;

  const outcomePrices = raw.outcomePrices;
  if (Array.isArray(outcomePrices) && outcomePrices.length >= 1) {
    priceYes = toNum(outcomePrices[0]);
    if (outcomePrices.length >= 2) priceNo = toNum(outcomePrices[1]);
  }

  // Alternative shape: raw.prices / raw.price / raw.lastTradePrice
  if (priceYes == null) priceYes = toNum(raw.priceYes ?? raw.price ?? raw.lastTradePrice ?? raw.lastPrice);

  if (priceYes == null || !Number.isFinite(priceYes)) return null;
  priceYes = clamp01(priceYes);

  if (priceNo == null && Number.isFinite(priceYes)) priceNo = clamp01(1 - priceYes);

  const volume = toNum(raw.volumeNum ?? raw.volume ?? raw.volume24hr ?? raw.volume_24hr);
  const liquidity = toNum(raw.liquidityNum ?? raw.liquidity ?? raw.liquidity24hr ?? raw.liquidity_24hr);

  return { marketId, priceYes, priceNo, volume, liquidity };
}

function toNum(v: any): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === "number" ? v : Number(String(v));
  return Number.isFinite(n) ? n : undefined;
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
