export type GammaMarket = {
  id: string;
  conditionId?: string;
  slug?: string;
  question?: string;
  active?: boolean;
  closed?: boolean;
  volume?: string;
  liquidity?: string;
  clobTokenIds?: string | string[] | null;
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
    } catch {
      // fallthrough
    }
    return trimmed.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function num(s?: string): number {
  if (!s) return 0;
  const n = Number(String(s).trim());
  return Number.isFinite(n) ? n : 0;
}

export async function fetchTopMarkets(opts: {
  gammaBaseUrl: string;
  limit: number;
}): Promise<Array<{ conditionId: string; tokenIds: string[]; question?: string; endDate?: string; outcomes?: string[]; outcomePrices?: any }>> {
  const url = new URL(opts.gammaBaseUrl + '/markets');
  url.searchParams.set('active', 'true');
  url.searchParams.set('closed', 'false');
  url.searchParams.set('limit', String(Math.min(Math.max(opts.limit * 5, 20), 200)));

  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Gamma markets failed: ${res.status} ${txt}`);
  }
  const raw = (await res.json()) as GammaMarket[];
  if (!Array.isArray(raw)) throw new Error('Gamma markets returned non-array');

  // sort by volume then liquidity (best-effort)
  const sorted = raw
    .map((m: any) => ({
      conditionId: m.conditionId ?? m.id,
      tokenIds: parseStringArray(m.clobTokenIds),
      question: m.question,
      endDate: (m.endDate ?? m.end_date ?? m.endDateIso ?? m.end_date_iso ?? m.endTime ?? m.end_time) as string | undefined,
      outcomes: m.outcomes ? (Array.isArray(m.outcomes) ? m.outcomes : parseStringArray(m.outcomes)) : undefined,
      outcomePrices: m.outcomePrices ?? m.outcome_prices,
      score: num(m.volume) * 1e6 + num(m.liquidity)
    }))
    .filter(x => x.conditionId && x.tokenIds.length >= 2)
    .sort((a, b) => b.score - a.score);

  // take top N unique conditionIds
  const out: Array<{ conditionId: string; tokenIds: string[]; question?: string }> = [];
  const seen = new Set<string>();
  for (const m of sorted) {
    if (seen.has(m.conditionId)) continue;
    seen.add(m.conditionId);
    out.push({ conditionId: m.conditionId, tokenIds: m.tokenIds.slice(0, 2), question: m.question });
    if (out.length >= opts.limit) break;
  }
  return out;
}
