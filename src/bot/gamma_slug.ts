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

/**
 * Gamma API: fetch event by slug.
 * Tries GET /events/slug/{slug} first, falls back to GET /events?slug=
 * @see https://docs.polymarket.com/developers/gamma-markets-api
 */
export async function fetchEventBySlug(opts: { gammaBaseUrl: string; slug: string }) {
  // Try direct slug path first (Gamma API)
  const directUrl = `${opts.gammaBaseUrl}/events/slug/${encodeURIComponent(opts.slug)}`;
  let res = await fetch(directUrl, { headers: { Accept: 'application/json' } });
  let ev: any;

  if (res.ok) {
    const body = await res.json();
    ev = Array.isArray(body) ? body[0] : body;
  }

  if (!ev) {
    // Fallback: query param
    const url = new URL(opts.gammaBaseUrl + '/events');
    url.searchParams.set('slug', opts.slug);
    res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Gamma events slug failed: ${res.status} ${txt}`);
    }
    const arr: any[] = await res.json();
    if (!Array.isArray(arr) || !arr.length) throw new Error('Gamma events slug returned empty');
    ev = arr[0];
  }
  const m = Array.isArray(ev.markets) && ev.markets.length ? ev.markets[0] : undefined;
  const tokenIds = parseStringArray(m?.clobTokenIds);

  return {
    slug: opts.slug,
    title: ev.title as string | undefined,
    endDate: (m?.endDate ?? ev.endDate) as string | undefined,
    question: (m?.question ?? ev.title ?? ev.slug) as string,
    conditionId: (m?.conditionId ?? ev.id) as string,
    outcomes: parseStringArray(m?.outcomes) || ['Up', 'Down'],
    tokenIds
  };
}
