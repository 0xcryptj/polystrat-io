import { fetchEventBySlug } from './gamma_slug.js';

function floorTo5m(sec: number) {
  return Math.floor(sec / 300) * 300;
}

export async function fetchCurrentBtc5mEventByTime(opts: { gammaBaseUrl: string; maxTries?: number }) {
  const nowSec = Math.floor(Date.now() / 1000);
  const base = floorTo5m(nowSec);

  // Try nearby 5m buckets to account for clock skew / Polymarket scheduling.
  const candidates: number[] = [];
  for (const delta of [-900, -600, -300, 0, 300, 600, 900]) {
    candidates.push(base + delta);
  }

  for (const ts of candidates.slice(0, opts.maxTries ?? candidates.length)) {
    const slug = `btc-updown-5m-${ts}`;
    try {
      const ev: any = await fetchEventBySlug({ gammaBaseUrl: opts.gammaBaseUrl, slug });
      const endMs = ev.endDate ? new Date(ev.endDate).getTime() : NaN;
      if (Number.isFinite(endMs) && endMs > Date.now()) {
        return ev;
      }
    } catch {
      // ignore
    }
  }

  throw new Error('Could not find current btc-updown-5m event near current time');
}
