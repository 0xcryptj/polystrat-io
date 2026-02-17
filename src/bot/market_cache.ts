import fs from 'node:fs';
import path from 'node:path';

export type MarketCacheRow = {
  conditionId: string;
  question?: string;
  yesTokenId?: string;
  noTokenId?: string;
  outcomes?: string[];
  endDate?: string;
  updatedAtMs: number;
};

export class MarketCache {
  private filePath: string;
  private map: Map<string, MarketCacheRow> = new Map();

  constructor(dir: string) {
    this.filePath = path.join(dir, 'market_cache.json');
    this.load();
  }

  private load() {
    if (!fs.existsSync(this.filePath)) return;
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const arr = JSON.parse(raw) as MarketCacheRow[];
      if (Array.isArray(arr)) {
        for (const r of arr) this.map.set(r.conditionId, r);
      }
    } catch {
      // ignore
    }
  }

  private save() {
    const arr = Array.from(this.map.values());
    fs.writeFileSync(this.filePath, JSON.stringify(arr, null, 2));
  }

  get(conditionId: string) {
    return this.map.get(conditionId);
  }

  listAll(): MarketCacheRow[] {
    return Array.from(this.map.values());
  }

  upsert(row: Omit<MarketCacheRow, 'updatedAtMs'>) {
    this.map.set(row.conditionId, { ...row, updatedAtMs: Date.now() });
    this.save();
  }
}
