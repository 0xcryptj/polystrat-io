import { makeHttpClient } from "./http.js";
import type { Market, Orderbook, PriceHistory, PublicProfile } from "./types.js";

// Base URLs from pasted docs
const GAMMA_BASE = "https://gamma-api.polymarket.com";

// CLOB host appears in pasted client example; /book docs did not explicitly restate base URL.
// We will use this host for read-only orderbook calls.
const CLOB_BASE = "https://clob.polymarket.com";

const http = makeHttpClient();

export async function listMarkets(params: {
  limit: number;
  offset: number;
  closed?: boolean;
  includeTag?: boolean;
}): Promise<Market[]> {
  const q = new URLSearchParams();
  q.set("limit", String(params.limit));
  q.set("offset", String(params.offset));
  if (typeof params.closed === "boolean") q.set("closed", String(params.closed));
  if (typeof params.includeTag === "boolean") q.set("include_tag", String(params.includeTag));

  const url = `${GAMMA_BASE}/markets?${q.toString()}`;
  const raw = await http.getJson<any[]>(url);
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeMarket);
}

export async function getMarketBySlug(slug: string, includeTag?: boolean): Promise<Market> {
  const q = new URLSearchParams();
  if (typeof includeTag === "boolean") q.set("include_tag", String(includeTag));

  const url = `${GAMMA_BASE}/markets/slug/${encodeURIComponent(slug)}${q.toString() ? `?${q.toString()}` : ""}`;
  const raw = await http.getJson<any>(url);
  return normalizeMarket(raw);
}

export async function getPublicProfile(address: string): Promise<PublicProfile> {
  const q = new URLSearchParams();
  q.set("address", address);
  const url = `${GAMMA_BASE}/public-profile?${q.toString()}`;
  const raw = await http.getJson<any>(url);

  return {
    address,
    createdAt: raw?.createdAt ?? null,
    proxyWallet: raw?.proxyWallet ?? null,
    profileImage: raw?.profileImage ?? null,
    displayUsernamePublic: raw?.displayUsernamePublic ?? null,
    bio: raw?.bio ?? null,
    pseudonym: raw?.pseudonym ?? null,
    name: raw?.name ?? null,
    users: raw?.users ?? null,
    xUsername: raw?.xUsername ?? null,
    verifiedBadge: raw?.verifiedBadge ?? null,
    raw
  };
}

export async function getPriceHistory(params: {
  marketTokenId: string;
  startTs?: number;
  endTs?: number;
  interval?: "1m" | "1w" | "1d" | "6h" | "1h" | "max";
  fidelity?: number;
}): Promise<PriceHistory> {
  const q = new URLSearchParams();
  q.set("market", params.marketTokenId);
  if (params.startTs != null) q.set("startTs", String(params.startTs));
  if (params.endTs != null) q.set("endTs", String(params.endTs));
  if (params.interval) q.set("interval", params.interval);
  if (params.fidelity != null) q.set("fidelity", String(params.fidelity));

  const url = `${GAMMA_BASE}/prices-history?${q.toString()}`;
  const raw = await http.getJson<any>(url);
  return { marketTokenId: params.marketTokenId, history: raw?.history ?? [], raw };
}

export async function getOrderbookByTokenId(tokenId: string): Promise<Orderbook> {
  const q = new URLSearchParams();
  q.set("token_id", tokenId);
  const url = `${CLOB_BASE}/book?${q.toString()}`;
  const raw = await http.getJson<any>(url);

  return {
    market: String(raw?.market ?? ""),
    assetId: String(raw?.asset_id ?? ""),
    timestamp: String(raw?.timestamp ?? ""),
    hash: String(raw?.hash ?? ""),
    bids: Array.isArray(raw?.bids) ? raw.bids : [],
    asks: Array.isArray(raw?.asks) ? raw.asks : [],
    minOrderSize: String(raw?.min_order_size ?? ""),
    tickSize: String(raw?.tick_size ?? ""),
    negRisk: Boolean(raw?.neg_risk),
    raw
  };
}

function normalizeMarket(raw: any): Market {
  return {
    id: String(raw?.id ?? ""),
    slug: raw?.slug ?? null,
    question: raw?.question ?? null,
    description: raw?.description ?? null,
    conditionId: String(raw?.conditionId ?? ""),

    outcomesRaw: raw?.outcomes ?? null,
    outcomePricesRaw: raw?.outcomePrices ?? null,
    clobTokenIdsRaw: raw?.clobTokenIds ?? null,

    enableOrderBook: raw?.enableOrderBook ?? null,

    bestBid: numOrNull(raw?.bestBid),
    bestAsk: numOrNull(raw?.bestAsk),
    lastTradePrice: numOrNull(raw?.lastTradePrice),
    spread: numOrNull(raw?.spread),

    volumeNum: numOrNull(raw?.volumeNum),
    liquidityNum: numOrNull(raw?.liquidityNum),

    raw
  };
}

function numOrNull(v: any): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
