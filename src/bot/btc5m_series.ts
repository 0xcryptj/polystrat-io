import fs from 'node:fs';
import path from 'node:path';

export type Btc5mPoint = {
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
  sumAsk?: number;
  sumEdge?: number;
};

export class Btc5mSeries {
  private filePath: string;

  constructor(dir: string) {
    this.filePath = path.join(dir, 'btc5m_series.jsonl');
  }

  append(p: Btc5mPoint) {
    fs.appendFileSync(this.filePath, JSON.stringify(p) + '\n');
  }

  tail(limit = 600): Btc5mPoint[] {
    if (!fs.existsSync(this.filePath)) return [];
    const raw = fs.readFileSync(this.filePath, 'utf-8');
    const lines = raw.trim().split(/\r?\n/).filter(Boolean);
    const tail = lines.slice(-limit);
    const out: Btc5mPoint[] = [];
    for (const line of tail) {
      try { out.push(JSON.parse(line)); } catch {}
    }
    return out;
  }

  // Best-effort: find the first indexPrice point at/after a timestamp.
  // Uses a tail read to avoid loading the entire file.
  firstIndexAfter(tsMs: number, limit = 3000): number | undefined {
    const items = this.tail(limit);
    for (const p of items) {
      if (p.tsMs >= tsMs && typeof p.indexPrice === 'number' && Number.isFinite(p.indexPrice)) return p.indexPrice;
    }
    return undefined;
  }
}
