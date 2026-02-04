import { Strategy, StrategyContext, StrategyEvent } from "@polystrat/strategy-sdk";
import { randomUUID } from "node:crypto";

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

export function makeDummyStrategy(): Strategy<{ marketId: string; tickMs: number }> {
  return {
    meta: {
      id: "dummy-mean-reversion",
      name: "Dummy Mean Reversion (Paper)",
      description: "Emits fake signals and paper trades on a timer."
    },
    configSchema: {
      fields: [
        { key: "marketId", label: "Market ID", type: "string", default: "TEST-MARKET" },
        { key: "tickMs", label: "Tick Interval (ms)", type: "number", default: 1000, min: 200, step: 50 }
      ]
    },
    async start(ctx, config) {
      ctx.emit({ type: "log", level: "info", message: "strategy start", data: config });
    },
    async stop(ctx) {
      ctx.emit({ type: "log", level: "info", message: "strategy stop" });
    },
    async onTick(ctx, input) {
      ctx.emit({ type: "signal", message: "mock: price spike detected", confidence: 0.62, data: input });
      ctx.emit({
        type: "paperTrade",
        marketId: (input as any)?.marketId ?? "TEST-MARKET",
        side: Math.random() > 0.5 ? "buy" : "sell",
        price: Number(((Math.random() * 0.5) + 0.25).toFixed(3)),
        size: Number(((Math.random() * 10) + 1).toFixed(2)),
        reason: "mock trade"
      });
    }
  };
}
