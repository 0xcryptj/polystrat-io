export async function fetchCoinbaseBtcUsdPrice(timeoutMs = 2500): Promise<number | undefined> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.exchange.coinbase.com/products/BTC-USD/ticker', {
      signal: ac.signal as any,
      headers: { 'user-agent': 'polymarket-bot-paper' }
    });
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
