import type { Strategy } from "@polystrat/strategy-sdk";
import type { MarketSnapshot } from "../../apps/runner/src/providers/types.js";
import meta from "./meta.json";

// HARD RULES:
// - Upstream code must remain isolated in ./upstream (untouched)
// - Preserve LICENSE + attribution
// - Our code lives ONLY in this adapter.ts
// - Paper mode only

// Import minimal upstream entrypoints here.
// Example:
// import { computeSignal } from "./upstream/index.js";

export type AdapterConfig = {
  marketId: string;
  provider: "mock" | "polymarket";
  pollMs: number;
  // Add upstream params here (mirror meta.json paramsSchema)
};

export const strategy: Strategy<AdapterConfig> = {
  meta: {
    id: meta.id,
    name: meta.name,
    description: `Upstream adapter (paper mode). ${meta.sourceUrl}`,
    tags: meta.categories
  },

  // Runner UI expects strategy.configSchema
  configSchema: meta.paramsSchema,

  async start(ctx, config) {
    ctx.emit({
      type: "log",
      level: "info",
      message: `start ${meta.id} (adapter)`,
      data: { ...config, sourceUrl: meta.sourceUrl, author: meta.author, license: meta.license }
    });
  },

  async stop(ctx) {
    ctx.emit({ type: "log", level: "info", message: `stop ${meta.id} (adapter)` });
  },

  async onTick(ctx, input) {
    const snap = input as unknown as MarketSnapshot;

    // 1) translate MarketSnapshot -> upstream input format
    // const upstreamInput = { price: snap.priceYes, ts: snap.ts, ... };

    // 2) call upstream logic (pure function preferred)
    // const out = computeSignal(upstreamInput)

    // 3) emit events (log/signal/paperTrade)
    ctx.emit({
      type: "log",
      level: "info",
      message: `snapshot ${snap.source} market=${snap.marketId} yes=${snap.priceYes}`
    });

    // ctx.emit({ type: "signal", message: "upstream says BUY", confidence: 0.6, data: out });
    // ctx.emit({ type: "paperTrade", marketId: snap.marketId, side: "buy", price: snap.priceYes, size: 1, reason: "upstream signal" });
  }
};
