import fs from 'node:fs';
import path from 'node:path';

type Pt = {
  tsMs: number;
  eventSlug: string;
  endDate?: string;
  indexPrice?: number;
  indexStartPrice?: number;
  indexDeltaPct?: number;
  upAsk?: number;
  downAsk?: number;
  impliedUp?: number;
  impliedDown?: number;
};

type Window = {
  eventSlug: string;
  startTsMs: number;
  endTsMs: number;
  startIndex?: number;
  endIndex?: number;
  upPrices: number[];
  downPrices: number[];
};

function readJsonl(filePath: string, limitLines = 500000): any[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const slice = lines.length > limitLines ? lines.slice(-limitLines) : lines;
  const out: any[] = [];
  for (const l of slice) {
    try { out.push(JSON.parse(l)); } catch {}
  }
  return out;
}

function groupWindows(points: Pt[]): Window[] {
  const by = new Map<string, Window>();
  for (const p of points) {
    if (!p.eventSlug) continue;
    let w = by.get(p.eventSlug);
    if (!w) {
      const endTs = p.endDate ? new Date(p.endDate).getTime() : NaN;
      w = {
        eventSlug: p.eventSlug,
        startTsMs: p.tsMs,
        endTsMs: Number.isFinite(endTs) ? endTs : p.tsMs,
        startIndex: p.indexStartPrice,
        endIndex: undefined,
        upPrices: [],
        downPrices: []
      };
      by.set(p.eventSlug, w);
    }
    w.startTsMs = Math.min(w.startTsMs, p.tsMs);
    if (p.indexStartPrice && !w.startIndex) w.startIndex = p.indexStartPrice;
    if (typeof p.indexPrice === 'number' && Number.isFinite(p.indexPrice)) w.endIndex = p.indexPrice;
    if (typeof p.impliedUp === 'number' && Number.isFinite(p.impliedUp)) w.upPrices.push(p.impliedUp);
    if (typeof p.impliedDown === 'number' && Number.isFinite(p.impliedDown)) w.downPrices.push(p.impliedDown);
  }
  return Array.from(by.values()).sort((a, b) => a.startTsMs - b.startTsMs);
}

// A very simple baseline backtest:
// - pick side using sign of deltaPct at decision time
// - entry price uses last impliedUp/Down seen in window
// - settle by comparing endIndex to startIndex
function backtest(windows: Window[]) {
  let trades = 0;
  let wins = 0;
  let losses = 0;
  let pnl = 0;

  for (const w of windows) {
    if (!w.startIndex || !w.endIndex) continue;
    const delta = (w.endIndex - w.startIndex);

    const upPx = w.upPrices.length ? w.upPrices[w.upPrices.length - 1] : undefined;
    const downPx = w.downPrices.length ? w.downPrices[w.downPrices.length - 1] : undefined;
    if (upPx == null || downPx == null) continue;

    // decision: follow move from start->end (cheating baseline; used to sanity-check settlement math)
    const outcome: 'UP' | 'DOWN' = delta >= 0 ? 'UP' : 'DOWN';
    const entryPx = outcome === 'UP' ? upPx : downPx;

    // 1 USDC spent per trade
    const size = 1;
    const shares = entryPx > 0 ? size / entryPx : 0;
    const won = (delta > 0 && outcome === 'UP') || (delta < 0 && outcome === 'DOWN') || (delta === 0);

    let value = 0;
    if (delta === 0) value = size; // push
    else value = won ? shares * 1.0 : 0;

    const tradePnl = value - size;

    trades += 1;
    pnl += tradePnl;
    if (delta === 0) {
      // ignore for win/loss
    } else if (won) wins += 1;
    else losses += 1;
  }

  return {
    trades,
    wins,
    losses,
    winRate: (wins + losses) ? wins / (wins + losses) : null,
    pnl,
    avgPnl: trades ? pnl / trades : null
  };
}

function main() {
  const root = process.cwd();
  const dataDir = path.join(root, 'data');
  const seriesPath = path.join(dataDir, 'btc5m_series.jsonl');
  const pts = readJsonl(seriesPath) as Pt[];
  const windows = groupWindows(pts);
  const stats = backtest(windows);

  const outDir = path.join(dataDir, 'backtests');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(outDir, `btc5m_backtest.${ts}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), stats }, null, 2));
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ outPath, stats }, null, 2));
}

main();
