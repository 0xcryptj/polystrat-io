export type MarketSnapshot = {
  marketId: string;
  ts: number;
  priceYes: number;
  priceNo?: number;
  volume?: number;
  liquidity?: number;
  source: "polymarket" | "mock";
  raw?: any;
};

export interface MarketDataProvider {
  getMarketSnapshot(marketId: string): Promise<MarketSnapshot>;
}
