import { BookTop } from './clob_price.js';

export async function fetchBookTop(opts: { clobBaseUrl?: string; tokenId: string; timeoutMs?: number }): Promise<BookTop | undefined> {
  const base = opts.clobBaseUrl ?? 'https://clob.polymarket.com';
  const url = new URL(base + '/book');
  url.searchParams.set('token_id', opts.tokenId);

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), opts.timeoutMs ?? 3000);
  try {
    const res = await fetch(url.toString(), { headers: { Accept: 'application/json' }, signal: ac.signal as any });
    if (!res.ok) return undefined;
    const json: any = await res.json();

    const firstBid = Array.isArray(json?.bids) && json.bids.length ? json.bids[0] : undefined;
    const firstAsk = Array.isArray(json?.asks) && json.asks.length ? json.asks[0] : undefined;

    const bid = firstBid ? Number(firstBid.price ?? firstBid[0]) : undefined;
    const bidSize = firstBid ? Number(firstBid.size ?? firstBid[1]) : undefined;
    const ask = firstAsk ? Number(firstAsk.price ?? firstAsk[0]) : undefined;
    const askSize = firstAsk ? Number(firstAsk.size ?? firstAsk[1]) : undefined;

    return {
      bid: Number.isFinite(bid as any) ? bid : undefined,
      bidSize: Number.isFinite(bidSize as any) ? bidSize : undefined,
      ask: Number.isFinite(ask as any) ? ask : undefined,
      askSize: Number.isFinite(askSize as any) ? askSize : undefined,
      tsMs: Date.now()
    };
  } catch {
    return undefined;
  } finally {
    clearTimeout(t);
  }
}
