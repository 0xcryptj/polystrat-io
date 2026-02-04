import Fastify from "fastify";
import cors from "@fastify/cors";
import crypto from "node:crypto";

const API_PORT = Number(process.env.PORT ?? 3399);
const RUNNER_BASE_URL = process.env.RUNNER_BASE_URL ?? "http://localhost:3344";

type RunRecord = {
  runId: string;
  strategyId: string;
  status: "running" | "stopped" | "error";
  startedAt: number;
  stoppedAt?: number;
  config: any;
};

const runs = new Map<string, RunRecord>();

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: (origin, cb) => {
    // allow curl/no-origin + local dev origins
    if (!origin) return cb(null, true);
    try {
      const u = new URL(origin);
      const allowedHosts = new Set(["localhost", "127.0.0.1"]);
      if (allowedHosts.has(u.hostname)) return cb(null, true);
      return cb(new Error("origin_not_allowed"), false);
    } catch {
      return cb(new Error("bad_origin"), false);
    }
  },
  methods: ["GET", "POST", "OPTIONS"]
});

app.get("/health", async () => {
  return { ok: true, service: "api" };
});

// ---- Stub auth (dev only) ----
app.post("/auth/signup", async () => {
  return { userId: "dev-user-1" };
});

app.post("/auth/login", async () => {
  return { userId: "dev-user-1" };
});

app.get("/me", async () => {
  return { userId: "dev-user-1", email: "dev@example.com" };
});

// ---- Proxy helpers ----
async function proxyJson(req: { method: string; path: string; body?: any }) {
  const url = `${RUNNER_BASE_URL}${req.path}`;
  const res = await fetch(url, {
    method: req.method,
    headers: {
      "content-type": "application/json"
    },
    body: req.method === "GET" ? undefined : JSON.stringify(req.body ?? {})
  });

  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  return { status: res.status, json };
}

// ---- Strategies + logs (proxy to runner) ----
app.get("/strategies", async (_request, reply) => {
  const out = await proxyJson({ method: "GET", path: "/strategies" });
  return reply.code(out.status).send(out.json);
});

app.post<{ Params: { id: string } }>("/strategies/:id/start", async (request, reply) => {
  const out = await proxyJson({
    method: "POST",
    path: `/strategies/${request.params.id}/start`,
    body: request.body
  });
  return reply.code(out.status).send(out.json);
});

app.post<{ Params: { id: string } }>("/strategies/:id/stop", async (request, reply) => {
  const out = await proxyJson({
    method: "POST",
    path: `/strategies/${request.params.id}/stop`,
    body: {}
  });
  return reply.code(out.status).send(out.json);
});

app.get<{ Querystring: { limit?: string } }>("/logs", async (request, reply) => {
  const limit = request.query.limit ?? "200";
  const out = await proxyJson({ method: "GET", path: `/logs?limit=${encodeURIComponent(limit)}` });
  return reply.code(out.status).send(out.json);
});

// ---- Runs (minimal in-memory; uses runner under the hood) ----
app.get("/runs", async () => {
  return { runs: Array.from(runs.values()) };
});

app.post<{ Body: { strategyId: string; config?: any } }>("/runs/start", async (request, reply) => {
  const strategyId = request.body?.strategyId;
  if (!strategyId) return reply.code(400).send({ ok: false, error: "missing_strategyId" });

  // Call runner start
  const out = await proxyJson({
    method: "POST",
    path: `/strategies/${strategyId}/start`,
    body: request.body?.config ?? {}
  });
  if (out.status >= 400) return reply.code(out.status).send(out.json);

  const runId = crypto.randomUUID();
  const rec: RunRecord = {
    runId,
    strategyId,
    status: "running",
    startedAt: Date.now(),
    config: request.body?.config ?? {}
  };
  runs.set(runId, rec);

  return reply.code(200).send({ ok: true, run: rec, runner: out.json });
});

app.post<{ Params: { runId: string } }>("/runs/:runId/stop", async (request, reply) => {
  const rec = runs.get(request.params.runId);
  if (!rec) return reply.code(404).send({ ok: false, error: "run_not_found" });

  const out = await proxyJson({ method: "POST", path: `/strategies/${rec.strategyId}/stop`, body: {} });
  if (out.status >= 400) return reply.code(out.status).send(out.json);

  rec.status = "stopped";
  rec.stoppedAt = Date.now();
  runs.set(rec.runId, rec);

  return reply.code(200).send({ ok: true, run: rec, runner: out.json });
});

app.listen({ port: API_PORT, host: "127.0.0.1" }).then(() => {
  app.log.info(`[api] listening on http://127.0.0.1:${API_PORT}`);
  app.log.info(`[api] runner base: ${RUNNER_BASE_URL}`);
});
