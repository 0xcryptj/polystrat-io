export type BookTop = { bid?: number; bidSize?: number; ask?: number; askSize?: number; tsMs: number };

export async function fetchAskPrice(opts: { clobBaseUrl?: string; tokenId: string; timeoutMs?: number }): Promise<number | undefined> {
  const base = opts.clobBaseUrl ?? 'https://clob.polymarket.com';
  const url = new URL(base + '/price');
  url.searchParams.set('token_id', opts.tokenId);
  url.searchParams.set('side', 'buy'); // buy -> ask

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), opts.timeoutMs ?? 3000);
  try {
    const res = await fetch(url.toString(), { headers: { Accept: 'application/json' }, signal: ac.signal as any });
    if (!res.ok) return undefined;
    const json: any = await res.json();
    const p = Number(json?.price ?? json?.result?.price);
    return Number.isFinite(p) ? p : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(t);
  }
}
