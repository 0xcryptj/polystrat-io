import type { AppConfig } from '../server/lib/config.js';
import { fetchEventMarkets } from './gamma_events.js';
import { fetchAskPrice } from './clob_price.js';

function parseNum(x: any): number | undefined {
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
}

function pickNoPrice(m: any): number | undefined {
  // outcomePrices is usually [yes,no] as strings
  const op = m.outcomePrices;
  if (Array.isArray(op) && op.length >= 2) {
    const no = parseNum(op[1]);
    return no;
  }
  if (typeof op === 'string') {
    try {
      const parsed = JSON.parse(op);
      if (Array.isArray(parsed) && parsed.length >= 2) return parseNum(parsed[1]);
    } catch {}
  }
  if (op && typeof op === 'object') {
    // maybe { Yes:0.1, No:0.9 }
    const no = (op.No ?? op.NO ?? op.no);
    return parseNum(no);
  }
  return undefined;
}

function hoursUntil(endDate?: string): number | undefined {
  if (!endDate) return undefined;
  const t = new Date(endDate).getTime();
  if (!Number.isFinite(t)) return undefined;
  return (t - Date.now()) / 36e5;
}

export async function findCasinoNoCandidates(config: AppConfig) {
  const items = await fetchEventMarkets({ gammaBaseUrl: config.feeds.gammaBaseUrl, limit: 200 });

  const out: Array<{ conditionId: string; yesToken: string; noToken: string; noPrice: number; hoursToClose?: number; question?: string; endDate?: string }> = [];
  let checked = 0;
  for (const m of items as any[]) {
    const tokenIds = m.tokenIds as string[];
    if (!tokenIds || tokenIds.length < 2) continue;

    checked++;
    if (checked > 80) break; // keep startup fast

    // Prefer live ask from CLOB (more reliable than Gamma outcomePrices)
    const noPrice = await fetchAskPrice({ tokenId: tokenIds[1], timeoutMs: 2500 });
    if (noPrice === undefined) continue;
    if (noPrice < config.strategy.casinoNo.minNoPrice) continue;

    // Must have an endDate and it must be in the future.
    const h = hoursUntil(m.endDate);
    if (h === undefined) continue;
    if (h <= 0) continue;
    if (h > config.strategy.casinoNo.maxHoursToClose) continue;

    out.push({
      conditionId: m.conditionId,
      yesToken: tokenIds[0],
      noToken: tokenIds[1],
      noPrice,
      hoursToClose: h,
      endDate: m.endDate,
      question: m.question
    });

    if (out.length >= config.strategy.casinoNo.maxConcurrentPositions) break;
  }

  return out;
}
