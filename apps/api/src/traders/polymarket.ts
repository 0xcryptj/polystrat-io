// Polymarket trader data integration (READ-ONLY)
//
// Per project rules: we ONLY implement from pasted docs in docs/polymarket/*.md.
// Right now those docs have not been pasted, so this file intentionally
// returns "not available" responses instead of guessing endpoints.

export type TraderStats = {
  address: string;
  totalVolume?: number;
  winRate?: number;
  activePositionsCount?: number;
  lastTradeTime?: number;
  pnl?: {
    realized?: number;
    unrealized?: number;
    total?: number;
    currency?: string;
  };
  source?: string;
  unavailableReason?: string;
};

export async function getTraderStatsFromPolymarket(address: string): Promise<TraderStats> {
  return {
    address,
    unavailableReason: "Polymarket trader endpoints not implemented yet (paste docs for positions-by-address + trades/fills-by-address + mark pricing)."
  };
}

export async function getTraderPositionsFromPolymarket(address: string): Promise<any> {
  return {
    address,
    unavailableReason: "Positions-by-address endpoint docs not pasted yet."
  };
}

export async function getTraderTradesFromPolymarket(address: string, limit: number): Promise<any> {
  return {
    address,
    limit,
    unavailableReason: "Trades/fills-by-address endpoint docs not pasted yet."
  };
}
