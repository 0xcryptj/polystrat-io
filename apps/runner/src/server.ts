import http from "node:http";
import { InMemoryEventStore, createContext, RunnerStatus } from "./index.js";
import type { MarketDataProvider, MarketSnapshot } from "./providers/types.js";
import { MockMarketDataProvider } from "./providers/mock.js";
import { PolymarketMarketDataProvider } from "./providers/polymarket.js";
import { getStrategyRegistry } from "./strategies/registry.js";

const PORT = Number(process.env.PORT ?? 3344);

// Execution gating (paper vs live)
// HARD RULE: live trading must be impossible unless explicitly enabled server-side.
const SERVER_LIVE_ENABLED = String(process.env.EXECUTION_LIVE_ENABLED ?? "false").toLowerCase() === "true";

const store = new InMemoryEventStore();
let registry: Record<string, any> = {};

async function ensureRegistry() {
  // Lazy load so we can async scan /strategies.
  if (Object.keys(registry).length) return;
  registry = await getStrategyRegistry();
}

type ExecutionMode = "paper" | "live";

type Running = {
  strategyId: string;
  status: RunnerStatus;
  tickTimer: NodeJS.Timeout | null;
  lastConfig: any;
  provider: MarketDataProvider | null;
  execution: {
    requestedMode: ExecutionMode;
    effectiveMode: ExecutionMode;
    serverLiveEnabled: boolean;
    reasons: string[];
  };
};

let running: Running | null = null;

function json(res: http.ServerResponse, code: number, body: any) {
  res.statusCode = code;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body, null, 2));
}

function notFound(res: http.ServerResponse) {
  json(res, 404, { error: "not_found" });
}

async function start(strategyId: string, config: any) {
  if (running?.status.runState === "running") return;

  await ensureRegistry();
  const strategy = registry[strategyId];
  if (!strategy) throw new Error(`unknown strategy: ${strategyId}`);

  const status: RunnerStatus = { runState: "running", strategyId: strategy.meta.id, runId: crypto.randomUUID() };
  const ctx = createContext({ strategyId: strategy.meta.id, runId: status.runId!, store });

  // Execution mode gating (paper vs live)
  const requestedMode: ExecutionMode = String(config?.executionMode ?? "paper") === "live" ? "live" : "paper";
  let effectiveMode: ExecutionMode = requestedMode;
  const reasons: string[] = [];

  if (requestedMode === "live") {
    if (!SERVER_LIVE_ENABLED) {
      effectiveMode = "paper";
      reasons.push("server_live_disabled");
    }
    if (!config?.userEnableLive) {
      effectiveMode = "paper";
      reasons.push("user_not_enabled");
    }
    if (!config?.walletConnected) {
      effectiveMode = "paper";
      reasons.push("wallet_not_connected");
    }
    if (!config?.planApproved) {
      effectiveMode = "paper";
      reasons.push("plan_check_failed");
    }

    if (effectiveMode !== "live") {
      ctx.emit({
        type: "error",
        message: `live execution blocked; forcing paper mode (${reasons.join(",") || "unknown"})`,
        data: { requestedMode, effectiveMode, reasons }
      });
    }
  }

  // Ensure strategies always see the effective mode.
  const effectiveConfig = { ...config, executionMode: effectiveMode };

  // Provider selection (read-only).
  const providerKey = String(config?.provider ?? "mock");
  const provider: MarketDataProvider =
    providerKey === "polymarket"
      ? new PolymarketMarketDataProvider({
          cacheTtlMs: Math.max(250, Number(config?.pollMs ?? 2500) - 250),
          throttleMs: 250,
          maxStaleMs: 60_000
        })
      : new MockMarketDataProvider();

  await strategy.start(ctx, effectiveConfig);

  const pollMs = clampInt(Number(effectiveConfig?.pollMs ?? 2500), 500, 60_000);
  const tickTimer = setInterval(async () => {
    // HARD RULE: graceful failure. A transient provider/network error should not kill the runner.
    const tickCtx = createContext({ strategyId: strategy.meta.id, runId: status.runId!, store });

    try {
      const marketId = String(effectiveConfig?.marketId ?? "").trim();
      if (!marketId) {
        tickCtx.emit({ type: "error", message: "missing marketId (set config.marketId)" });
        return;
      }

      const snap = await provider.getMarketSnapshot(marketId);

      // Pass strategy config bits through the tick payload (keeps StrategyContext clean).
      const enriched: MarketSnapshot & Record<string, any> = {
        ...snap,
        moveThreshold: Number(effectiveConfig?.moveThreshold ?? 0.02),
        paperSize: Number(effectiveConfig?.paperSize ?? 5),
        executionMode: effectiveMode
      };

      await strategy.onTick(tickCtx, enriched as any);
    } catch (err: any) {
      tickCtx.emit({ type: "error", message: String(err?.message ?? err), stack: err?.stack });
      // keep running
    }
  }, pollMs);

  running = {
    strategyId: strategy.meta.id,
    status,
    tickTimer,
    lastConfig: effectiveConfig,
    provider,
    execution: {
      requestedMode,
      effectiveMode,
      serverLiveEnabled: SERVER_LIVE_ENABLED,
      reasons
    }
  };
}

async function stop(strategyId: string) {
  if (!running || running.status.runState !== "running") return;
  if (running.strategyId !== strategyId) return;

  await ensureRegistry();
  const strategy = registry[strategyId];
  if (!strategy) return;

  const ctx = createContext({ strategyId, runId: running.status.runId!, store });
  await strategy.stop(ctx);

  if (running.tickTimer) clearInterval(running.tickTimer);
  running = null;
}

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  // Basic CORS for local dev
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
  if (req.method === "OPTIONS") return res.end();

  if (req.method === "GET" && url.pathname === "/strategies") {
    await ensureRegistry();

    const strategies = Object.values(registry).map((s: any) => {
      const isRunning = running?.status.runState === "running" && running?.strategyId === s.meta.id;
      const status: RunnerStatus = isRunning ? running!.status : { runState: "stopped" };
      return {
        ...s.meta,
        attribution: s.attribution ?? null,
        uiHints: s.uiHints ?? null,
        execution: {
          serverLiveEnabled: SERVER_LIVE_ENABLED,
          effectiveMode: isRunning ? running!.execution.effectiveMode : "paper"
        },
        configSchema: s.configSchema,
        status
      };
    });

    return json(res, 200, { strategies });
  }

  const mStart = url.pathname.match(/^\/strategies\/([^/]+)\/start$/);
  if (req.method === "POST" && mStart) {
    const strategyId = decodeURIComponent(mStart[1]);
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      const config = body ? JSON.parse(body) : {};
      await start(strategyId, config);
      return json(res, 200, { ok: true, status: running?.status ?? { runState: "stopped" } });
    });
    return;
  }

  const mStop = url.pathname.match(/^\/strategies\/([^/]+)\/stop$/);
  if (req.method === "POST" && mStop) {
    const strategyId = decodeURIComponent(mStop[1]);
    await stop(strategyId);
    return json(res, 200, { ok: true, status: running?.status ?? { runState: "stopped" } });
  }

  if (req.method === "GET" && url.pathname === "/logs") {
    const limit = Number(url.searchParams.get("limit") ?? 200);
    return json(res, 200, {
      status: running?.status ?? { runState: "stopped" },
      strategyId: running?.strategyId ?? null,
      runId: running?.status.runId ?? null,
      execution: running?.execution ?? {
        requestedMode: "paper",
        effectiveMode: "paper",
        serverLiveEnabled: SERVER_LIVE_ENABLED,
        reasons: []
      },
      events: store.recent(limit)
    });
  }

  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, { ok: true });
  }

  return notFound(res);
});

server.listen(PORT, async () => {
  await ensureRegistry();
  console.log(`[runner] listening on http://localhost:${PORT}`);
  console.log(`[runner] strategies: ${Object.keys(registry).join(", ")}`);
});
