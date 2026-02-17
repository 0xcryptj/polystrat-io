export async function fetchBinanceBtcPrice(timeoutMs = 2500): Promise<number | undefined> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT', { signal: ac.signal as any });
    if (!res.ok) return undefined;
    const json: any = await res.json();
    const p = Number(json?.price);
    return Number.isFinite(p) ? p : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(t);
  }
}
