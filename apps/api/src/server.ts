import Fastify from "fastify";
import cors from "@fastify/cors";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const API_PORT = Number(process.env.PORT ?? 3399);
const RUNNER_BASE_URL = process.env.RUNNER_BASE_URL ?? "http://localhost:3344";
const DEV_USER_ID = process.env.DEV_USER_ID ?? "dev-user-1";

type RunRecord = {
  runId: string;
  strategyId: string;
  status: "running" | "stopped" | "error";
  startedAt: number;
  stoppedAt?: number;
  config: any;
};

const runs = new Map<string, RunRecord>();

type IngestEvent = {
  id?: string;
  ts?: number;
  runId: string;
  strategyId: string;
  userId: string;
  type: string;
  [k: string]: any;
};

type EventRecord = Required<Pick<IngestEvent, "runId" | "strategyId" | "userId" | "type">> & {
  id: string;
  ts: number;
  payload: any;
};

const EVENT_BUFFER_LIMIT = Number(process.env.EVENT_BUFFER_LIMIT ?? 2000);
const EVENT_JSONL_PATH = process.env.EVENT_JSONL_PATH ?? "data/events.jsonl";

const eventBuffer: EventRecord[] = [];

function appendEvent(rec: EventRecord) {
  eventBuffer.push(rec);
  if (eventBuffer.length > EVENT_BUFFER_LIMIT) {
    eventBuffer.splice(0, eventBuffer.length - EVENT_BUFFER_LIMIT);
  }

  // Optional append-only JSONL for dev
  try {
    const dir = path.dirname(EVENT_JSONL_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(EVENT_JSONL_PATH, JSON.stringify(rec) + "\n", { encoding: "utf8" });
  } catch {
    // swallow
  }
}

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

type CatalogParam = {
  key: string;
  type: "string" | "number" | "boolean";
  default?: any;
  min?: number;
  max?: number;
  step?: number;
};

type CatalogMeta = {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  author?: string;
  license?: string;
  sourceUrl?: string;
  paramsSchema?: CatalogParam[];
};

type MyStrategy = {
  id: string;
  userId: string;
  strategyId: string;
  nickname?: string;
  enabled: boolean;
  config: Record<string, any>;
  createdAt: number;
  updatedAt: number;
};

const myStrategies = new Map<string, MyStrategy>();

function readStrategyCatalog(): CatalogMeta[] {
  const root = process.cwd();
  // apps/api -> repo root
  const repoRoot = path.resolve(root, "..", "..");
  const strategiesDir = path.join(repoRoot, "strategies");

  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(strategiesDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const metas: CatalogMeta[] = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (ent.name.startsWith(".")) continue;
    if (ent.name === "_template") continue;

    const metaPath = path.join(strategiesDir, ent.name, "meta.json");
    if (!fs.existsSync(metaPath)) continue;
    try {
      const raw = fs.readFileSync(metaPath, "utf8");
      const meta = JSON.parse(raw);
      if (meta && typeof meta.id === "string") metas.push(meta as CatalogMeta);
    } catch {
      // ignore bad meta
    }
  }

  return metas;
}

// ---- Stub auth (dev only) ----
app.post("/auth/signup", async () => {
  return { userId: DEV_USER_ID };
});

app.post("/auth/login", async () => {
  return { userId: DEV_USER_ID };
});

app.get("/me", async () => {
  return { userId: DEV_USER_ID, email: "dev@example.com" };
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

// ---- Strategy catalog (local files) ----
app.get("/strategy-catalog", async () => {
  return { strategies: readStrategyCatalog() };
});

// ---- My Strategies (in-memory, per dev user) ----
app.get("/my-strategies", async () => {
  const list = Array.from(myStrategies.values()).filter((s) => s.userId === DEV_USER_ID);
  return { strategies: list };
});

app.post<{ Body: { strategyId: string; nickname?: string; config?: any } }>(
  "/my-strategies",
  async (request, reply) => {
    const strategyId = request.body?.strategyId;
    if (!strategyId) return reply.code(400).send({ ok: false, error: "missing_strategyId" });

    const id = crypto.randomUUID();
    const now = Date.now();
    const rec: MyStrategy = {
      id,
      userId: DEV_USER_ID,
      strategyId,
      nickname: request.body?.nickname,
      enabled: false,
      config: request.body?.config ?? {},
      createdAt: now,
      updatedAt: now
    };
    myStrategies.set(id, rec);
    return reply.code(200).send({ ok: true, strategy: rec });
  }
);

app.patch<{ Params: { id: string }; Body: { enabled?: boolean; config?: any; nickname?: string } }>(
  "/my-strategies/:id",
  async (request, reply) => {
    const rec = myStrategies.get(request.params.id);
    if (!rec || rec.userId !== DEV_USER_ID) return reply.code(404).send({ ok: false, error: "not_found" });

    const next: MyStrategy = {
      ...rec,
      enabled: typeof request.body?.enabled === "boolean" ? request.body.enabled : rec.enabled,
      nickname: typeof request.body?.nickname === "string" ? request.body.nickname : rec.nickname,
      config: typeof request.body?.config === "object" && request.body.config ? request.body.config : rec.config,
      updatedAt: Date.now()
    };
    myStrategies.set(next.id, next);
    return reply.code(200).send({ ok: true, strategy: next });
  }
);

app.delete<{ Params: { id: string } }>("/my-strategies/:id", async (request, reply) => {
  const rec = myStrategies.get(request.params.id);
  if (!rec || rec.userId !== DEV_USER_ID) return reply.code(404).send({ ok: false, error: "not_found" });

  myStrategies.delete(request.params.id);
  return reply.code(200).send({ ok: true });
});

// ---- Runner strategies + logs (proxy to runner) ----
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

// ---- Events ingest (runner -> api) ----
app.post<{
  Body:
    | { runId: string; strategyId: string; userId: string; events: any[] }
    | { runId: string; strategyId: string; userId: string; event: any }
    | any;
}>("/events/ingest", async (request, reply) => {
  const body: any = request.body ?? {};
  const runId = body.runId;
  const strategyId = body.strategyId;
  const userId = body.userId ?? "dev-user-1";

  const events: any[] = Array.isArray(body.events) ? body.events : body.event ? [body.event] : [];
  if (!runId || !strategyId || events.length === 0) {
    return reply.code(400).send({ ok: false, error: "missing_fields" });
  }

  for (const e of events) {
    const rec: EventRecord = {
      id: e?.id ?? crypto.randomUUID(),
      ts: typeof e?.ts === "number" ? e.ts : Date.now(),
      runId,
      strategyId,
      userId,
      type: String(e?.type ?? "log"),
      payload: e
    };
    appendEvent(rec);
  }

  return reply.code(200).send({ ok: true, ingested: events.length });
});

app.get<{ Querystring: { limit?: string; runId?: string } }>("/events", async (request) => {
  const limit = Math.min(2000, Math.max(1, Number(request.query.limit ?? 200)));
  const runId = request.query.runId;

  const filtered = runId ? eventBuffer.filter((e) => e.runId === runId) : eventBuffer;
  const events = filtered.slice(-limit);

  return { events };
});

// Back-compat: /logs now aliases /events (web used to call /logs)
app.get<{ Querystring: { limit?: string; runId?: string } }>("/logs", async (request) => {
  const limit = Math.min(2000, Math.max(1, Number(request.query.limit ?? 200)));
  const runId = request.query.runId;

  const filtered = runId ? eventBuffer.filter((e) => e.runId === runId) : eventBuffer;
  const events = filtered.slice(-limit).map((e) => e.payload);

  return {
    status: { runState: "running" },
    strategyId: null,
    runId: runId ?? null,
    events
  };
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
