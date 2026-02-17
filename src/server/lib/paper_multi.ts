import fs from 'node:fs';
import path from 'node:path';

export type TierKey = 't1' | 't2' | 't5';

export type PaperPosition = {
  id: string;
  tsOpenMs: number;
  conditionId: string;
  question?: string;
  tokenId: string; // strategy-specific token (NO token for casino-no)
  outcomeLabel?: string; // e.g. UP/DOWN/NO
  expiryIso?: string;
  side: 'buy';
  price: number; // assumed fill price (USDC per share)
  sizeUsd: number; // USDC spent
  status: 'open' | 'closed';
  tsCloseMs?: number;
  closePrice?: number; // 0..1 for binary resolution, or mark-to-market
  realizedPnlUsd?: number;

  // Resolution metadata (optional, used by btc5m paper)
  result?: 'win' | 'loss' | 'push';
  startIndexPrice?: number;
  endIndexPrice?: number;
  note?: string;
};

export type PaperState = {
  tier: TierKey;
  bankrollStartUsd: number;
  bankrollUsd: number;
  positions: PaperPosition[];
};

export type EquityPoint = { tsMs: number; bankrollUsd: number; unrealizedPnlUsd: number; totalPnlUsd: number };

export class PaperLedger {
  readonly tier: TierKey;
  readonly betUsd: number;
  private statePath: string;
  private equityPath: string;
  private state: PaperState;

  constructor(dir: string, opts: { tier: TierKey; betUsd: number; bankrollStartUsd: number }) {
    this.tier = opts.tier;
    this.betUsd = opts.betUsd;

    this.statePath = path.join(dir, `paper_${opts.tier}.json`);
    this.equityPath = path.join(dir, `equity_${opts.tier}.jsonl`);

    this.state = { tier: opts.tier, bankrollStartUsd: opts.bankrollStartUsd, bankrollUsd: opts.bankrollStartUsd, positions: [] };
    this.load();

    // Reset bankroll if empty and config changed
    if (this.state.positions.length === 0 && this.state.bankrollStartUsd !== opts.bankrollStartUsd) {
      this.state = { tier: opts.tier, bankrollStartUsd: opts.bankrollStartUsd, bankrollUsd: opts.bankrollStartUsd, positions: [] };
      this.save();
    }
  }

  private load() {
    if (!fs.existsSync(this.statePath)) return;
    try {
      const raw = fs.readFileSync(this.statePath, 'utf-8');
      const parsed = JSON.parse(raw) as PaperState;
      if (parsed && typeof parsed.bankrollUsd === 'number' && Array.isArray(parsed.positions)) {
        this.state = parsed;
      }
    } catch {
      // ignore
    }
  }

  private save() {
    fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2));
  }

  getState() {
    return this.state;
  }

  listPositions() {
    return [...this.state.positions].sort((a, b) => b.tsOpenMs - a.tsOpenMs);
  }

  openCount() {
    return this.state.positions.filter((p) => p.status === 'open').length;
  }

  canOpen(sizeUsd: number) {
    return this.state.bankrollUsd >= sizeUsd;
  }

  hasOpen(conditionId: string) {
    return this.state.positions.some((p) => p.status === 'open' && p.conditionId === conditionId);
  }

  open(pos: Omit<PaperPosition, 'status'>) {
    this.state.bankrollUsd = Math.max(0, this.state.bankrollUsd - pos.sizeUsd);
    this.state.positions.push({ ...pos, status: 'open' });
    this.save();
  }

  close(id: string, closePrice: number) {
    const p = this.state.positions.find((x) => x.id === id);
    if (!p || p.status !== 'open') return;

    // mark-to-market approximation: value = sizeUsd * closePrice
    const value = p.sizeUsd * closePrice;
    const pnl = value - p.sizeUsd;

    p.status = 'closed';
    p.tsCloseMs = Date.now();
    p.closePrice = closePrice;
    p.realizedPnlUsd = pnl;

    this.state.bankrollUsd += value;
    this.save();
  }

  // For binary markets: you buy shares at entry price.
  // shares = sizeUsd / entryPrice; payout at resolution is 1 USDC/share if win else 0.
  resolveBinary(id: string, opts: { won: boolean; push?: boolean; startIndexPrice?: number; endIndexPrice?: number }) {
    const p = this.state.positions.find((x) => x.id === id);
    if (!p || p.status !== 'open') return;

    const shares = p.price > 0 ? p.sizeUsd / p.price : 0;

    let value = 0;
    let closePrice = 0;
    let result: 'win' | 'loss' | 'push' = 'loss';

    if (opts.push) {
      value = p.sizeUsd;
      closePrice = p.price;
      result = 'push';
    } else if (opts.won) {
      value = shares * 1.0;
      closePrice = 1.0;
      result = 'win';
    } else {
      value = 0;
      closePrice = 0;
      result = 'loss';
    }

    const pnl = value - p.sizeUsd;

    p.status = 'closed';
    p.tsCloseMs = Date.now();
    p.closePrice = closePrice;
    p.realizedPnlUsd = pnl;
    p.result = result;
    p.startIndexPrice = opts.startIndexPrice ?? p.startIndexPrice;
    p.endIndexPrice = opts.endIndexPrice ?? p.endIndexPrice;

    this.state.bankrollUsd += value;
    this.save();
  }

  appendEquity(pt: EquityPoint) {
    fs.appendFileSync(this.equityPath, JSON.stringify(pt) + '\n');
  }

  readEquity(limit = 500): EquityPoint[] {
    if (!fs.existsSync(this.equityPath)) return [];
    const raw = fs.readFileSync(this.equityPath, 'utf-8');
    const lines = raw.trim().split(/\r?\n/).filter(Boolean);
    const tail = lines.slice(-limit);
    const out: EquityPoint[] = [];
    for (const line of tail) {
      try {
        out.push(JSON.parse(line));
      } catch {}
    }
    return out;
  }
}

export function computeUnrealizedPnl(ledger: PaperLedger, priceOfToken: (tokenId: string) => number | undefined) {
  let unreal = 0;
  for (const p of ledger.getState().positions) {
    if (p.status !== 'open') continue;
    const px = priceOfToken(p.tokenId);
    if (px === undefined) continue;
    unreal += p.sizeUsd * px - p.sizeUsd;
  }
  return unreal;
}
