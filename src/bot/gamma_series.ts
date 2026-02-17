import { fetchEventBySlug } from './gamma_slug.js';

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

export async function fetchLatestActiveEventInSeries(opts: { gammaBaseUrl: string; seriesId: number; maxLookaheadMinutes?: number }) {
  const url = new URL(opts.gammaBaseUrl + '/events');
  url.searchParams.set('series_id', String(opts.seriesId));
  url.searchParams.set('active', 'true');
  url.searchParams.set('closed', 'false');
  url.searchParams.set('limit', '200');

  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Gamma events series_id failed: ${res.status} ${txt}`);
  }
  const arr: any[] = await res.json();
  if (!Array.isArray(arr) || !arr.length) throw new Error('Gamma series returned empty');

  const now = Date.now();
  const lookaheadMs = (opts.maxLookaheadMinutes ?? 60) * 60_000;

  // pick event whose market endDate is > now and soonest
  let best: any | null = null;
  let bestEnd = Infinity;

  for (const ev of arr) {
    const m = Array.isArray(ev.markets) && ev.markets.length ? ev.markets[0] : undefined;
    const end = m?.endDate ?? ev.endDate;
    const endMs = end ? new Date(end).getTime() : NaN;
    if (!Number.isFinite(endMs)) continue;
    if (endMs <= now) continue;
    if (endMs - now > lookaheadMs) continue;

    if (endMs < bestEnd) {
      bestEnd = endMs;
      best = ev;
    }
  }

  if (!best) {
    // fallback: just pick by slug from first element
    const slug = arr[0]?.slug;
    if (!slug) throw new Error('No suitable event found in series');
    return fetchEventBySlug({ gammaBaseUrl: opts.gammaBaseUrl, slug });
  }

  const slug = best.slug as string;
  return fetchEventBySlug({ gammaBaseUrl: opts.gammaBaseUrl, slug });
}

export function parseOutcomes(value: any): string[] {
  const out = parseStringArray(value);
  return out.length ? out : ['Up', 'Down'];
}
