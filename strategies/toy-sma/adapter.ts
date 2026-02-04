import type { Strategy } from "@polystrat/strategy-sdk";
import type { MarketSnapshot } from "../../apps/runner/src/providers/types.js";
import meta from "./meta.json";

// HARD RULES:
// - upstream code is isolated in ./upstream and must remain untouched
// - preserve LICENSE and attribution
// - our code lives ONLY in this adapter.ts + meta.json
// - paper mode only

import { initState, pushPrice, sma, type SmaState } from "./upstream/sma.js";

export type AdapterConfig = {
  marketId: string;
  provider: "mock" | "polymarket";
  pollMs: number;
  fast: number;
  slow: number;
  threshold: number;
  paperSize: number;
};

export const strategy: Strategy<AdapterConfig> & { attribution: any } = {
  meta: {
    id: meta.id,
    name: meta.name,
    description: `Upstream adapter (paper mode). ${meta.sourceUrl}`,
    tags: meta.tags
  },

  attribution: {
    author: meta.author,
    license: meta.license,
    sourceUrl: meta.sourceUrl
  },

  configSchema: meta.paramsSchema,

  async start(ctx, config) {
    configCache = config;
    ctx.emit({ type: "log", level: "info", message: `start ${meta.id}`, data: config });
    state = initState();
  },

  async stop(ctx) {
    ctx.emit({ type: "log", level: "info", message: `stop ${meta.id}` });
    state = initState();
  },

  async onTick(ctx, input) {
    const snap = input as unknown as MarketSnapshot;

    // only paper
    ctx.emit({ type: "log", level: "info", message: `snapshot yes=${snap.priceYes.toFixed(4)}`, data: { marketId: snap.marketId, source: snap.source } });

    pushPrice(state, snap.priceYes, Math.max(configCache.slow * 3, 100));
    const fast = sma(state.values, configCache.fast);
    const slow = sma(state.values, configCache.slow);

    if (fast == null || slow == null) return;

    const diff = fast - slow;
    if (Math.abs(diff) < configCache.threshold) return;

    const side = diff > 0 ? "buy" : "sell";

    ctx.emit({
      type: "signal",
      message: `SMA crossover: fast=${fast.toFixed(4)} slow=${slow.toFixed(4)} diff=${diff.toFixed(4)}`,
      confidence: clamp01(Math.abs(diff) / (configCache.threshold * 3)),
      data: { fast, slow, diff }
    });

    ctx.emit({
      type: "paperTrade",
      marketId: snap.marketId,
      side,
      price: snap.priceYes,
      size: configCache.paperSize,
      reason: "toy sma crossover",
      data: { provider: snap.source }
    });
  }
};

let state: SmaState = initState();
let configCache: AdapterConfig = {
  marketId: "",
  provider: "polymarket",
  pollMs: 2500,
  fast: 5,
  slow: 15,
  threshold: 0.003,
  paperSize: 5
};

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}
