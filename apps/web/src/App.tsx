import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "./config";
import { Shell } from "./components/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import { Switch } from "./components/ui/switch";
import { Modal } from "./components/ui/modal";

type CatalogParam = {
  key: string;
  type: "string" | "number" | "boolean";
  default?: any;
  min?: number;
  max?: number;
  step?: number;
};

type StrategyMeta = {
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

type RunRecord = {
  runId: string;
  strategyId: string;
  status: "running" | "stopped" | "error";
  startedAt: number;
  stoppedAt?: number;
  config: any;
};

type RunnerEvent = {
  id: string;
  ts: number;
  strategyId: string;
  runId: string;
  type: "log" | "signal" | "error" | "paperTrade";
  [k: string]: any;
};

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

async function apiPost<T>(path: string, body: any): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {})
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

async function apiPatch<T>(path: string, body: any): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {})
  });
  if (!res.ok) throw new Error(`PATCH ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "DELETE"
  });
  if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

type PageKey = "dashboard" | "library" | "my" | "runs" | "settings";

export default function App() {
  const [page, setPage] = useState<PageKey>("dashboard");
  const [error, setError] = useState<string | null>(null);

  // catalog + my strategies
  const [catalog, setCatalog] = useState<StrategyMeta[]>([]);
  const [myStrategies, setMyStrategies] = useState<MyStrategy[]>([]);

  // runs + events
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [events, setEvents] = useState<RunnerEvent[]>([]);

  // ui state
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [activeMyId, setActiveMyId] = useState<string | null>(null);
  const [draftConfig, setDraftConfig] = useState<Record<string, any>>({});

  const catalogById = useMemo(() => new Map(catalog.map((s) => [s.id, s])), [catalog]);

  const activeMy = useMemo(
    () => myStrategies.find((s) => s.id === activeMyId) ?? null,
    [myStrategies, activeMyId]
  );

  const activeMeta = useMemo(
    () => (activeMy ? catalogById.get(activeMy.strategyId) ?? null : null),
    [activeMy, catalogById]
  );

  // Theme init
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") document.documentElement.classList.add("dark");
  }, []);

  const refreshCatalog = async () => {
    const data = await apiGet<{ strategies: StrategyMeta[] }>("/strategy-catalog");
    setCatalog(data.strategies ?? []);
  };

  const refreshMy = async () => {
    const data = await apiGet<{ strategies: MyStrategy[] }>("/my-strategies");
    setMyStrategies(data.strategies ?? []);
  };

  const refreshRuns = async () => {
    const data = await apiGet<{ runs: RunRecord[] }>("/runs");
    setRuns(data.runs ?? []);
  };

  // initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await Promise.all([refreshCatalog(), refreshMy(), refreshRuns()]);
      } catch (e: any) {
        if (cancelled) return;
        setError(String(e?.message ?? e));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll events from API (back-compat uses /logs which returns payload array)
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const data = await apiGet<{ events: RunnerEvent[] }>("/logs?limit=200");
        if (cancelled) return;
        setEvents(data.events ?? []);
      } catch (e: any) {
        if (cancelled) return;
        setError(String(e?.message ?? e));
      }
    };

    tick();
    const id = window.setInterval(tick, 1200);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const tagOptions = useMemo(() => {
    const s = new Set<string>();
    for (const m of catalog) for (const t of m.tags ?? []) s.add(t);
    return Array.from(s.values()).sort();
  }, [catalog]);

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.filter((m) => {
      const matchesQ =
        !q ||
        m.name.toLowerCase().includes(q) ||
        (m.description ?? "").toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q);
      const matchesTag = !tag || (m.tags ?? []).includes(tag);
      return matchesQ && matchesTag;
    });
  }, [catalog, search, tag]);

  const addFromLibrary = async (strategyId: string) => {
    setError(null);
    try {
      await apiPost("/my-strategies", { strategyId });
      await refreshMy();
      setPage("my");
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  };

  const toggleEnabled = async (myId: string, enabled: boolean) => {
    setError(null);
    try {
      await apiPatch(`/my-strategies/${myId}`, { enabled });
      await refreshMy();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  };

  const openConfigure = (myId: string) => {
    const rec = myStrategies.find((s) => s.id === myId);
    if (!rec) return;

    const meta = catalogById.get(rec.strategyId);
    const seeded: Record<string, any> = { ...rec.config };
    for (const p of meta?.paramsSchema ?? []) {
      if (typeof seeded[p.key] === "undefined" && typeof p.default !== "undefined") {
        seeded[p.key] = p.default;
      }
    }

    setActiveMyId(myId);
    setDraftConfig(seeded);
    setConfigOpen(true);
  };

  const saveConfigure = async () => {
    if (!activeMy) return;
    setError(null);
    try {
      await apiPatch(`/my-strategies/${activeMy.id}`, { config: draftConfig });
      await refreshMy();
      setConfigOpen(false);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  };

  const removeMy = async (myId: string) => {
    setError(null);
    try {
      await apiDelete(`/my-strategies/${myId}`);
      await refreshMy();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  };

  const startRun = async (strategyId: string, config: any) => {
    setError(null);
    try {
      await apiPost("/runs/start", { strategyId, config });
      await refreshRuns();
      setPage("runs");
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  };

  const stopRun = async (runId: string) => {
    setError(null);
    try {
      await apiPost(`/runs/${runId}/stop`, {});
      await refreshRuns();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  };

  const newestFirst = useMemo(() => [...events].reverse(), [events]);

  return (
    <Shell
      nav={[
        { key: "dashboard", label: "Dashboard" },
        { key: "library", label: "Strategy Library" },
        { key: "my", label: "My Strategies" },
        { key: "runs", label: "Runs" },
        { key: "settings", label: "Settings" }
      ]}
      active={page}
      onSelect={(k) => setPage(k as PageKey)}
    >
      {error ? (
        <Card className="mb-4 border-red-500/30">
          <CardHeader>
            <CardTitle className="text-red-400">Error</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-mutedForeground">{error}</CardContent>
        </Card>
      ) : null}

      {page === "dashboard" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Catalog</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{catalog.length}</div>
              <div className="text-xs text-mutedForeground">strategies available</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>My Strategies</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{myStrategies.length}</div>
              <div className="text-xs text-mutedForeground">configs saved</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Runs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{runs.length}</div>
              <div className="text-xs text-mutedForeground">recent runs (memory)</div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Live Events</CardTitle>
              <div className="text-xs text-mutedForeground">API: {API_BASE_URL} (polling /logs)</div>
            </CardHeader>
            <CardContent>
              <div className="max-h-[55vh] overflow-auto rounded-lg border border-border">
                {newestFirst.slice(0, 50).map((e) => (
                  <div key={e.id} className="border-b border-border px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="font-mono text-[11px] text-mutedForeground">
                        {new Date(e.ts).toLocaleTimeString()}
                      </div>
                      <div className="font-mono text-[11px] text-mutedForeground">{e.type}</div>
                    </div>
                    <div className="mt-1 text-sm">
                      {e.type === "paperTrade"
                        ? `${e.side} ${e.size} @ ${e.price} (${e.marketId})`
                        : e.message}
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-mutedForeground">
                      {e.strategyId} / {e.runId}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {page === "library" ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold">Strategy Library</div>
              <div className="text-xs text-mutedForeground">Local catalog (strategies/*/meta.json)</div>
            </div>
            <div className="flex gap-2">
              <input
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm md:w-72"
                placeholder="Search strategies…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Button variant="outline" onClick={() => refreshCatalog()}>
                Refresh
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className={
                "rounded-full border px-3 py-1 text-xs " +
                (!tag ? "border-primary/40 text-foreground" : "border-border text-mutedForeground")
              }
              onClick={() => setTag(null)}
            >
              All
            </button>
            {tagOptions.map((t) => (
              <button
                key={t}
                className={
                  "rounded-full border px-3 py-1 text-xs " +
                  (tag === t ? "border-primary/40 text-foreground" : "border-border text-mutedForeground")
                }
                onClick={() => setTag(tag === t ? null : t)}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredCatalog.map((m) => (
              <Card key={m.id}>
                <CardHeader>
                  <CardTitle>{m.name}</CardTitle>
                  <div className="text-xs text-mutedForeground">{m.description}</div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {(m.tags ?? []).map((t) => (
                      <Badge key={t}>{t}</Badge>
                    ))}
                  </div>
                  <div className="mt-3 font-mono text-[11px] text-mutedForeground">{m.id}</div>
                  <div className="mt-4 flex gap-2">
                    <Button onClick={() => addFromLibrary(m.id)}>Add</Button>
                    <Button variant="outline" onClick={() => setPage("my")}>Go to My</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      {page === "my" ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">My Strategies</div>
              <div className="text-xs text-mutedForeground">Per-user configs (in-memory)</div>
            </div>
            <Button variant="outline" onClick={() => refreshMy()}>
              Refresh
            </Button>
          </div>

          <Card>
            <CardContent className="pt-4">
              <div className="grid gap-3">
                {myStrategies.map((s) => {
                  const meta = catalogById.get(s.strategyId);
                  return (
                    <div
                      key={s.id}
                      className="flex flex-col gap-3 rounded-lg border border-border p-3 md:flex-row md:items-center md:justify-between"
                    >
                      <div>
                        <div className="text-sm font-medium">
                          {s.nickname ?? meta?.name ?? s.strategyId}
                        </div>
                        <div className="text-xs text-mutedForeground">{meta?.description}</div>
                        <div className="mt-1 font-mono text-[11px] text-mutedForeground">
                          {s.strategyId} · {new Date(s.updatedAt).toLocaleString()}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2">
                          <div className="text-xs text-mutedForeground">Enabled</div>
                          <Switch checked={s.enabled} onCheckedChange={(v) => toggleEnabled(s.id, v)} />
                        </div>
                        <Button variant="outline" onClick={() => openConfigure(s.id)}>
                          Configure
                        </Button>
                        <Button
                          onClick={() => startRun(s.strategyId, s.config)}
                          disabled={!s.enabled}
                        >
                          Start Run
                        </Button>
                        <Button variant="ghost" onClick={() => removeMy(s.id)}>
                          Remove
                        </Button>
                      </div>
                    </div>
                  );
                })}

                {myStrategies.length === 0 ? (
                  <div className="py-10 text-center text-sm text-mutedForeground">
                    No strategies yet. Go to Strategy Library and add one.
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {page === "runs" ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Runs</div>
              <div className="text-xs text-mutedForeground">API memory store (will be DB later)</div>
            </div>
            <Button variant="outline" onClick={() => refreshRuns()}>
              Refresh
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Start a run</CardTitle>
              <div className="text-xs text-mutedForeground">Only enabled strategies can start.</div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2">
                {myStrategies.filter((s) => s.enabled).map((s) => {
                  const meta = catalogById.get(s.strategyId);
                  const latest = runs
                    .filter((r) => r.strategyId === s.strategyId)
                    .sort((a, b) => b.startedAt - a.startedAt)[0];

                  return (
                    <div key={s.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                      <div>
                        <div className="text-sm font-medium">{meta?.name ?? s.strategyId}</div>
                        <div className="text-xs text-mutedForeground">
                          {latest ? `latest: ${latest.status}` : "no runs yet"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button onClick={() => startRun(s.strategyId, s.config)}>Start</Button>
                        {latest?.status === "running" ? (
                          <Button variant="outline" onClick={() => stopRun(latest.runId)}>
                            Stop latest
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}

                {myStrategies.filter((s) => s.enabled).length === 0 ? (
                  <div className="text-sm text-mutedForeground">No enabled strategies. Enable one in My Strategies.</div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Run history</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {runs
                  .slice()
                  .sort((a, b) => b.startedAt - a.startedAt)
                  .map((r) => (
                    <div
                      key={r.runId}
                      className="flex flex-col gap-3 rounded-lg border border-border p-3 md:flex-row md:items-center md:justify-between"
                    >
                      <div>
                        <div className="text-sm font-medium">{catalogById.get(r.strategyId)?.name ?? r.strategyId}</div>
                        <div className="mt-1 font-mono text-[11px] text-mutedForeground">runId: {r.runId}</div>
                        <div className="mt-1 text-xs text-mutedForeground">
                          {new Date(r.startedAt).toLocaleString()} · {r.status}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {r.status === "running" ? (
                          <Button variant="outline" onClick={() => stopRun(r.runId)}>
                            Stop
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}

                {runs.length === 0 ? (
                  <div className="py-10 text-center text-sm text-mutedForeground">No runs yet.</div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {page === "settings" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Dev Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm">API_BASE_URL</div>
              <div className="mt-1 font-mono text-xs text-mutedForeground">{API_BASE_URL}</div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Modal
        open={configOpen}
        title={`Configure: ${activeMeta?.name ?? activeMy?.strategyId ?? ""}`}
        onClose={() => setConfigOpen(false)}
      >
        {!activeMy || !activeMeta ? (
          <div className="text-sm text-mutedForeground">No strategy selected</div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3">
              {(activeMeta.paramsSchema ?? []).map((p) => {
                const v = draftConfig[p.key];
                return (
                  <div key={p.key} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">{p.key}</div>
                      <div className="font-mono text-xs text-mutedForeground">{String(v ?? "")}</div>
                    </div>

                    {p.type === "number" ? (
                      <div className="mt-2">
                        <input
                          className="w-full"
                          type="range"
                          min={p.min ?? 0}
                          max={p.max ?? 1}
                          step={p.step ?? 0.01}
                          value={typeof v === "number" ? v : p.default ?? 0}
                          onChange={(e) =>
                            setDraftConfig((c) => ({ ...c, [p.key]: Number(e.target.value) }))
                          }
                        />
                        <input
                          className="mt-2 h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                          type="number"
                          value={typeof v === "number" ? v : p.default ?? 0}
                          min={p.min}
                          max={p.max}
                          step={p.step}
                          onChange={(e) =>
                            setDraftConfig((c) => ({ ...c, [p.key]: Number(e.target.value) }))
                          }
                        />
                      </div>
                    ) : p.type === "boolean" ? (
                      <div className="mt-2 flex items-center gap-2">
                        <Switch
                          checked={Boolean(v)}
                          onCheckedChange={(nv) => setDraftConfig((c) => ({ ...c, [p.key]: nv }))}
                        />
                        <div className="text-xs text-mutedForeground">{Boolean(v) ? "On" : "Off"}</div>
                      </div>
                    ) : (
                      <div className="mt-2">
                        <input
                          className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                          type="text"
                          value={String(v ?? "")}
                          onChange={(e) => setDraftConfig((c) => ({ ...c, [p.key]: e.target.value }))}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfigOpen(false)}>
                Cancel
              </Button>
              <Button onClick={saveConfigure}>Save</Button>
            </div>
          </div>
        )}
      </Modal>
    </Shell>
  );
}
