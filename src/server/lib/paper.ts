import fs from 'node:fs';
import path from 'node:path';

export type PaperPosition = {
  id: string;
  tsOpenMs: number;
  conditionId: string;
  tokenId: string; // NO tokenId for this strategy
  side: 'buy';
  outcome: 'NO';
  price: number; // assumed fill price
  sizeUsd: number;
  status: 'open' | 'closed';
  tsCloseMs?: number;
  closePrice?: number;
  pnlUsd?: number;
  note?: string;
};

export type PaperState = {
  bankrollStartUsd: number;
  bankrollUsd: number;
  positions: PaperPosition[];
};

export class PaperLedger {
  private statePath: string;
  private state: PaperState;

  constructor(dir: string, bankrollStartUsd: number) {
    this.statePath = path.join(dir, 'paper.json');
    this.state = { bankrollStartUsd, bankrollUsd: bankrollStartUsd, positions: [] };
    this.load();

    // If config bankroll differs and there are no positions, reset bankroll.
    if (this.state.positions.length === 0 && this.state.bankrollStartUsd !== bankrollStartUsd) {
      this.state = { bankrollStartUsd, bankrollUsd: bankrollStartUsd, positions: [] };
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

  getState(): PaperState {
    return this.state;
  }

  listPositions(): PaperPosition[] {
    return [...this.state.positions].sort((a, b) => b.tsOpenMs - a.tsOpenMs);
  }

  canOpen(sizeUsd: number): boolean {
    return this.state.bankrollUsd >= sizeUsd;
  }

  hasOpen(conditionId: string): boolean {
    return this.state.positions.some(p => p.status === 'open' && p.conditionId === conditionId);
  }

  open(pos: Omit<PaperPosition, 'status'>) {
    this.state.bankrollUsd = Math.max(0, this.state.bankrollUsd - pos.sizeUsd);
    this.state.positions.push({ ...pos, status: 'open' });
    this.save();
  }

  close(id: string, closePrice: number) {
    const p = this.state.positions.find(x => x.id === id);
    if (!p || p.status !== 'open') return;

    // naive mark-to-market: value = sizeUsd * closePrice (since payout $1 at resolution, this is not exact)
    // For paper we treat token price as mark value per $1 notional.
    const value = p.sizeUsd * closePrice;
    const pnl = value - p.sizeUsd;

    p.status = 'closed';
    p.tsCloseMs = Date.now();
    p.closePrice = closePrice;
    p.pnlUsd = pnl;

    this.state.bankrollUsd += value;
    this.save();
  }
}
