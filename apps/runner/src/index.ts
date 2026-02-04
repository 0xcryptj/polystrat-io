import { Strategy, StrategyContext, StrategyEvent } from "@polystrat/strategy-sdk";
import { randomUUID } from "node:crypto";
import type { MarketSnapshot } from "./providers/types.js";

export type RunnerStatus = {
  runState: "stopped" | "running" | "error";
  strategyId?: string;
  runId?: string;
};

export class InMemoryEventStore {
  private events: StrategyEvent[] = [];

  append(event: StrategyEvent) {
    this.events.push(event);
  }

  recent(limit = 200) {
    return this.events.slice(-limit);
  }
}

export function createContext(params: {
  strategyId: string;
  runId: string;
  store: InMemoryEventStore;
}): StrategyContext {
  return {
    now: () => Date.now(),
    emit: (e) => {
      const event: StrategyEvent = {
        ...e,
        id: randomUUID(),
        ts: Date.now(),
        strategyId: params.strategyId,
        runId: params.runId
      } as StrategyEvent;
      params.store.append(event);
    }
  };
}

export type RunnerStrategyConfig = {
  marketId: string;
  provider: "mock" | "polymarket";
  pollMs: number;
  // Threshold for signals, expressed as absolute YES price move (e.g. 0.02 == 2%).
  moveThreshold: number;
  // Paper trade size (units are arbitrary in paper mode).
  paperSize: number;
};

// "Toy" strategy: reacts to live (read-only) market snapshots.
export function makeDummyStrategy(): Strategy<RunnerStrategyConfig> {
  let last: MarketSnapshot | null = null;

  return {
    meta: {
      id: "toy-live-threshold",
      name: "Toy Live Threshold (Paper)",
      description: "Consumes market snapshots and emits signals + paper trades on threshold moves.",
      tags: ["built-in"]
    },
    // Optional attribution block (consumed by the web UI)
    attribution: {
      author: "polystrat",
      license: "MIT",
      sourceUrl: "(internal)"
    },
    configSchema: {
      fields: [
        { key: "marketId", label: "Market ID", type: "string", default: "" },
        {
          key: "provider",
          label: "Data Provider",
          type: "select",
          default: "mock",
          options: [
            { label: "Mock", value: "mock" },
            { label: "Polymarket (public, read-only)", value: "polymarket" }
          ]
        },
        { key: "pollMs", label: "Poll interval (ms)", type: "number", default: 2500, min: 500, step: 250 },
        { key: "moveThreshold", label: "Signal threshold (YES Δ)", type: "number", default: 0.02, min: 0.001, step: 0.001 },
        { key: "paperSize", label: "Paper size", type: "number", default: 5, min: 0.01, step: 0.01 }
      ]
    },

    async start(ctx, config) {
      ctx.emit({ type: "log", level: "info", message: "strategy start", data: config });
      last = null;
    },

    async stop(ctx) {
      ctx.emit({ type: "log", level: "info", message: "strategy stop" });
      last = null;
    },

    async onTick(ctx, input) {
      const snap = input as unknown as MarketSnapshot;

      // Always log what we see (useful for verifying live ingestion).
      ctx.emit({
        type: "log",
        level: "info",
        message: `snapshot ${snap.source} market=${snap.marketId} yes=${snap.priceYes.toFixed(4)} no=${(snap.priceNo ?? (1 - snap.priceYes)).toFixed(4)}`,
        data: {
          ts: snap.ts,
          volume: snap.volume,
          liquidity: snap.liquidity
        }
      });

      if (!last) {
        last = snap;
        return;
      }

      const move = snap.priceYes - last.priceYes;
      last = snap;

      const threshold = Number((snap as any).moveThreshold ?? undefined);
      // Config is not passed in tick input; strategy relies on runner to keep the same config.
      // We'll embed threshold in runner input for cleanliness; if missing, default.
      const th = Number.isFinite(threshold) ? threshold : 0.02;

      if (Math.abs(move) < th) return;

      const direction = move > 0 ? "up" : "down";
      ctx.emit({
        type: "signal",
        message: `YES moved ${direction} by ${move.toFixed(4)} (>= ${th.toFixed(4)})`,
        confidence: clamp01(Math.abs(move) / (th * 2)),
        data: { move, threshold: th, snapTs: snap.ts, priceYes: snap.priceYes }
      });

      // Paper trade: buy when YES dips, sell when YES pumps (mean reversion toy logic).
      const side = move < 0 ? "buy" : "sell";
      const paperSize = Number((snap as any).paperSize ?? undefined);
      const size = Number.isFinite(paperSize) ? paperSize : 5;

      ctx.emit({
        type: "paperTrade",
        marketId: snap.marketId,
        side,
        price: snap.priceYes,
        size,
        reason: `toy mean-reversion: YES ${direction} move ${move.toFixed(4)}`,
        data: { provider: snap.source }
      });
    }
  };
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}
