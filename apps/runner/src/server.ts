import http from "node:http";
import crypto from "node:crypto";
import { makeToyStrategy, FileBackedEventStore, createContext, RunnerStatus } from "./index";

const PORT = Number(process.env.PORT ?? 3344);

const strategy = makeToyStrategy();
const store = new FileBackedEventStore("data/events.jsonl");

let status: RunnerStatus = { runState: "stopped" };
let tickTimer: NodeJS.Timeout | null = null;

function json(res: http.ServerResponse, code: number, body: any) {
  res.statusCode = code;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body, null, 2));
}

function notFound(res: http.ServerResponse) {
  json(res, 404, { error: "not_found" });
}

async function start(config: any) {
  if (status.runState === "running") return;
  status = { runState: "running", strategyId: strategy.meta.id, runId: crypto.randomUUID() };

  const ctx = createContext({ strategyId: strategy.meta.id, runId: status.runId!, store });
  await strategy.start(ctx, config);

  const tickMs = Number(config?.tickMs ?? 1000);
  tickTimer = setInterval(async () => {
    try {
      const tickCtx = createContext({ strategyId: strategy.meta.id, runId: status.runId!, store });
      await strategy.onTick(tickCtx, {
        marketId: config?.marketId ?? "TEST-MARKET",
        jumpThreshold: config?.jumpThreshold,
        size: config?.size,
        t: Date.now()
      });
    } catch (err: any) {
      const errCtx = createContext({ strategyId: strategy.meta.id, runId: status.runId!, store });
      errCtx.emit({ type: "error", message: String(err?.message ?? err), stack: err?.stack });
      status = { ...status, runState: "error" };
      if (tickTimer) clearInterval(tickTimer);
      tickTimer = null;
    }
  }, tickMs);
}

async function stop() {
  if (status.runState !== "running") return;
  const ctx = createContext({ strategyId: strategy.meta.id, runId: status.runId!, store });
  await strategy.stop(ctx);
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
  status = { runState: "stopped" };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  // Basic CORS for local dev
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
  if (req.method === "OPTIONS") return res.end();

  if (req.method === "GET" && url.pathname === "/strategies") {
    return json(res, 200, {
      strategies: [
        {
          ...strategy.meta,
          configSchema: strategy.configSchema,
          status
        }
      ]
    });
  }

  if (req.method === "POST" && url.pathname === `/strategies/${strategy.meta.id}/start`) {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      let config: any = {};
      try {
        config = body ? JSON.parse(body) : {};
      } catch {
        return json(res, 400, { ok: false, error: "bad_json" });
      }

      await start(config);
      return json(res, 200, { ok: true, status });
    });
    return;
  }

  if (req.method === "POST" && url.pathname === `/strategies/${strategy.meta.id}/stop`) {
    await stop();
    return json(res, 200, { ok: true, status });
  }

  if (req.method === "GET" && url.pathname === "/logs") {
    const limit = Number(url.searchParams.get("limit") ?? 200);
    return json(res, 200, {
      status,
      strategyId: strategy.meta.id,
      runId: status.runId ?? null,
      events: store.recent(limit)
    });
  }

  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, { ok: true });
  }

  return notFound(res);
});

server.listen(PORT, () => {
  console.log(`[runner] listening on http://localhost:${PORT}`);
  console.log(`[runner] strategy: ${strategy.meta.id}`);
});
