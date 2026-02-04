import type { MarketDataProvider, MarketSnapshot } from "./types.js";

// Simple deterministic-ish mock provider for local testing.
export class MockMarketDataProvider implements MarketDataProvider {
  private state = new Map<string, { priceYes: number; ts: number }>();

  async getMarketSnapshot(marketId: string): Promise<MarketSnapshot> {
    const prev = this.state.get(marketId);
    const ts = Date.now();

    const last = prev?.priceYes ?? 0.5;
    // Mean-reverting random walk, clamped.
    const drift = (0.5 - last) * 0.02;
    const shock = (Math.random() - 0.5) * 0.03;
    const priceYes = clamp01(last + drift + shock);

    this.state.set(marketId, { priceYes, ts });

    return {
      marketId,
      ts,
      priceYes,
      priceNo: 1 - priceYes,
      source: "mock"
    };
  }
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}
