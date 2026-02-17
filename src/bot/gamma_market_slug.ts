/**
 * Gamma API: fetch market by slug.
 * Endpoint: GET /markets/slug/{slug}
 * @see https://docs.polymarket.com/api-reference/markets/get-market-by-slug
 */

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
    return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export type GammaMarketBySlug = {
  conditionId: string;
  slug: string;
  question?: string;
  endDate?: string;
  tokenIds: string[];
  outcomes?: string[];
  outcomePrices?: number[];
  volume?: string;
  liquidity?: string;
  active?: boolean;
  closed?: boolean;
};

export async function fetchMarketBySlug(opts: {
  gammaBaseUrl: string;
  slug: string;
  includeTag?: boolean;
}): Promise<GammaMarketBySlug> {
  const url = new URL(`${opts.gammaBaseUrl}/markets/slug/${encodeURIComponent(opts.slug)}`);
  if (opts.includeTag) url.searchParams.set('include_tag', 'true');

  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Gamma market slug failed: ${res.status} ${txt}`);
  }
  const m = (await res.json()) as Record<string, unknown>;
  const tokenIds = parseStringArray(m?.clobTokenIds as string | string[] | null);

  return {
    conditionId: (m.conditionId ?? m.id) as string,
    slug: (m.slug ?? opts.slug) as string,
    question: m.question as string | undefined,
    endDate: (m.endDate ?? m.endDateIso ?? m.end_date_iso) as string | undefined,
    tokenIds,
    outcomes: m.outcomes ? parseStringArray(m.outcomes as string) : undefined,
    outcomePrices: Array.isArray(m.outcomePrices)
      ? (m.outcomePrices as unknown[]).map((x) => Number(x)).filter(Number.isFinite)
      : undefined,
    volume: m.volume as string | undefined,
    liquidity: m.liquidity as string | undefined,
    active: m.active as boolean | undefined,
    closed: m.closed as boolean | undefined
  };
}
