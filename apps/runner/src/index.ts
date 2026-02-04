import { Strategy, StrategyContext, StrategyEvent } from "@polystrat/strategy-sdk";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type RunnerStatus = {
  runState: "stopped" | "running" | "error";
  strategyId?: string;
  runId?: string;
};

export class FileBackedEventStore {
  private events: StrategyEvent[] = [];

  constructor(private filePath: string) {}

  append(event: StrategyEvent) {
    this.events.push(event);

    // JSONL append (one event per line) for easy local inspection.
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(this.filePath, JSON.stringify(event) + "\n", { encoding: "utf8" });
  }

  recent(limit = 200) {
    return this.events.slice(-limit);
  }
}

const API_BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:3399";
const DEV_USER_ID = process.env.DEV_USER_ID ?? "dev-user-1";

async function postEventToApi(event: StrategyEvent) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 600);
  try {
    await fetch(`${API_BASE_URL}/events/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runId: event.runId,
        strategyId: event.strategyId,
        userId: DEV_USER_ID,
        event
      }),
      signal: ctrl.signal
    });
  } catch {
    // API is optional in dev; swallow errors.
  } finally {
    clearTimeout(t);
  }
}

export function createContext(params: {
  strategyId: string;
  runId: string;
  store: FileBackedEventStore;
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

      // always keep local store
      params.store.append(event);

      // best-effort API forward
      void postEventToApi(event);
    }
  };
}

export function makeToyStrategy(): Strategy<{
  marketId: string;
  tickMs: number;
  jumpThreshold: number;
  basePrice: number;
  size: number;
}> {
  // Random-walk state (kept in-memory per runner process)
  let lastPrice = 0.5;
  let lastDelta = 0;

  return {
    meta: {
      id: "toy-random-walk",
      name: "Toy Random Walk (Paper)",
      description: "Generates a fake price series, emits signals on jumps, and places paper trades."
    },
    configSchema: {
      fields: [
        { key: "marketId", label: "Market ID", type: "string", default: "TEST-MARKET" },
        { key: "tickMs", label: "Tick Interval (ms)", type: "number", default: 2000, min: 500, step: 100 },
        {
          key: "jumpThreshold",
          label: "Jump Threshold (abs Δ)",
          type: "number",
          default: 0.06,
          min: 0.001,
          max: 1,
          step: 0.001
        },
        { key: "basePrice", label: "Start Price", type: "number", default: 0.5, min: 0.01, max: 0.99, step: 0.01 },
        { key: "size", label: "Paper Size", type: "number", default: 5, min: 0.01, step: 0.01 }
      ]
    },
    async start(ctx, config) {
      lastPrice = clamp01(Number(config?.basePrice ?? 0.5));
      lastDelta = 0;
      ctx.emit({ type: "log", level: "info", message: "strategy start", data: config });
    },
    async stop(ctx) {
      ctx.emit({ type: "log", level: "info", message: "strategy stop" });
    },
    async onTick(ctx, input) {
      const marketId = String((input as any)?.marketId ?? "TEST-MARKET");
      const jumpThreshold = Number((input as any)?.jumpThreshold ?? 0.06);
      const size = Number((input as any)?.size ?? 5);

      // Random walk: small noise + occasional jump
      const noise = (Math.random() - 0.5) * 0.02; // [-0.01, 0.01]
      const jump = Math.random() < 0.12 ? (Math.random() - 0.5) * 0.25 : 0; // occasional
      const nextPrice = clamp01(lastPrice + noise + jump);

      lastDelta = nextPrice - lastPrice;
      lastPrice = nextPrice;

      ctx.emit({
        type: "log",
        level: "info",
        message: "tick",
        data: { marketId, price: round3(lastPrice), delta: round3(lastDelta), t: Date.now() }
      });

      if (Math.abs(lastDelta) >= jumpThreshold) {
        const direction = lastDelta > 0 ? "up" : "down";
        ctx.emit({
          type: "signal",
          message: `price jump ${direction} (|Δ|>=${jumpThreshold})`,
          confidence: clamp01(Math.min(1, Math.abs(lastDelta) / (jumpThreshold * 2))),
          data: { marketId, price: round3(lastPrice), delta: round3(lastDelta) }
        });

        ctx.emit({
          type: "paperTrade",
          marketId,
          side: lastDelta > 0 ? "sell" : "buy",
          price: round3(lastPrice),
          size,
          reason: "jump-threshold"
        });
      }
    }
  };
}

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function round3(n: number) {
  return Number(n.toFixed(3));
}
