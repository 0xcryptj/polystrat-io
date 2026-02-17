type GammaEvent = {
  id: string;
  closed?: boolean;
  active?: boolean;
  startDate?: string;
  start_date?: string;
  startTime?: string;
  eventStartTime?: string;
  markets?: any[];
  question?: string;
  title?: string;
  slug?: string;
  updatedAt?: string;
};

function parseStringArray(value?: string | string[] | null): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {}
    return trimmed.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function parseOutcomePrices(value: any): number[] | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    const a = value.map((x) => Number(x)).filter((n) => Number.isFinite(n));
    return a.length >= 2 ? a : undefined;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parseOutcomePrices(parsed);
    } catch {}
  }
  return undefined;
}

function pickEndTime(event: GammaEvent, market: any): string | undefined {
  return (
    market?.endDate ||
    market?.end_date ||
    market?.endDateIso ||
    market?.end_date_iso ||
    event.startDate ||
    event.start_date ||
    event.eventStartTime ||
    event.startTime
  );
}

export async function fetchEventMarkets(opts: { gammaBaseUrl: string; limit: number }) {
  const url = new URL(opts.gammaBaseUrl + '/events');
  url.searchParams.set('active', 'true');
  url.searchParams.set('closed', 'false');
  url.searchParams.set('limit', String(Math.min(Math.max(opts.limit, 50), 200)));

  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Gamma events failed: ${res.status} ${txt}`);
  }
  const events = (await res.json()) as GammaEvent[];
  if (!Array.isArray(events)) throw new Error('Gamma events returned non-array');

  const out: Array<{ conditionId: string; tokenIds: string[]; question?: string; endDate?: string; outcomePrices?: number[] }> = [];

  for (const ev of events) {
    const markets = Array.isArray(ev.markets) ? ev.markets : [];
    for (const m of markets) {
      const tokenIds = parseStringArray(m?.clobTokenIds);
      if (tokenIds.length < 2) continue;

      const conditionId = m?.conditionId ?? m?.id ?? ev.id;
      const q = m?.question ?? ev.question ?? ev.title;
      const endDate = pickEndTime(ev, m);
      const outcomePrices = parseOutcomePrices(m?.outcomePrices);

      out.push({ conditionId: String(conditionId), tokenIds: tokenIds.slice(0, 2), question: q, endDate, outcomePrices });
    }
  }

  return out;
}
