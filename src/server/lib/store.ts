import fs from 'node:fs';
import path from 'node:path';

export type ExposureRow = {
  marketId: string;
  outcome: string;
  status: 'open' | 'closed';
  openedAtMs: number;
  closedAtMs?: number;
  meta?: any;
};

export type OpportunityRow = {
  tsMs: number;
  marketId?: string;
  yesPrice?: number;
  noPrice?: number;
  sumPrice?: number;
  edgeUsd?: number;
  note?: string;
};

export class FileStore {
  public dir: string;
  private exposurePath: string;
  private opportunitiesPath: string;

  private exposure: Map<string, ExposureRow> = new Map();
  private recentOps: OpportunityRow[] = [];

  constructor(dir: string) {
    this.dir = dir;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    this.exposurePath = path.join(dir, 'exposure.json');
    this.opportunitiesPath = path.join(dir, 'opportunities.jsonl');

    this.loadExposure();
    this.loadOpportunities();
  }

  private loadOpportunities() {
    if (!fs.existsSync(this.opportunitiesPath)) return;
    try {
      const lines = fs.readFileSync(this.opportunitiesPath, 'utf-8').trim().split('\n').filter(Boolean);
      for (const line of lines.slice(-2000)) {
        try {
          const op = JSON.parse(line) as OpportunityRow;
          this.recentOps.push(op);
        } catch {
          // skip malformed lines
        }
      }
      if (this.recentOps.length > 2000) this.recentOps = this.recentOps.slice(-2000);
    } catch {
      // ignore
    }
  }

  private loadExposure() {
    if (!fs.existsSync(this.exposurePath)) return;
    try {
      const raw = fs.readFileSync(this.exposurePath, 'utf-8');
      const arr = JSON.parse(raw) as ExposureRow[];
      for (const row of arr) {
        this.exposure.set(this.key(row.marketId, row.outcome), row);
      }
    } catch {
      // ignore
    }
  }

  private persistExposure() {
    const arr = Array.from(this.exposure.values());
    fs.writeFileSync(this.exposurePath, JSON.stringify(arr, null, 2));
  }

  private key(marketId: string, outcome: string) {
    return `${marketId}::${outcome}`;
  }

  listExposure(limit = 200): ExposureRow[] {
    return Array.from(this.exposure.values())
      .sort((a, b) => b.openedAtMs - a.openedAtMs)
      .slice(0, limit);
  }

  getExposure(marketId: string, outcome: string): ExposureRow | undefined {
    return this.exposure.get(this.key(marketId, outcome));
  }

  upsertExposure(row: ExposureRow) {
    this.exposure.set(this.key(row.marketId, row.outcome), row);
    this.persistExposure();
  }

  appendOpportunity(op: OpportunityRow) {
    this.recentOps.push(op);
    if (this.recentOps.length > 2000) this.recentOps.splice(0, this.recentOps.length - 2000);
    fs.appendFileSync(this.opportunitiesPath, JSON.stringify(op) + '\n');
  }

  listRecentOpportunities(limit = 200): OpportunityRow[] {
    return this.recentOps.slice(-limit).reverse();
  }
}
