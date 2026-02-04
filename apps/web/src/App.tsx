import { useEffect, useMemo, useState } from "react";
import { RUNNER_BASE_URL } from "./config";
import { Shell } from "./components/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Button } from "./components/ui/button";

type StrategyStatus = {
  runState: "stopped" | "running" | "error";
  strategyId?: string;
  runId?: string;
};

type Strategy = {
  id: string;
  name: string;
  description?: string;
  configSchema: {
    fields: Array<{
      key: string;
      label: string;
      type: "string" | "number" | "boolean" | "select";
      default?: any;
      min?: number;
      max?: number;
      step?: number;
      options?: Array<{ label: string; value: string }>;
    }>;
  };
  status: StrategyStatus;
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
  const res = await fetch(`${RUNNER_BASE_URL}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

async function apiPost<T>(path: string, body: any): Promise<T> {
  const res = await fetch(`${RUNNER_BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {})
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

type PageKey = "strategy-library" | "runs" | "logs";

export default function App() {
  const [page, setPage] = useState<PageKey>("strategy-library");
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [events, setEvents] = useState<RunnerEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [config, setConfig] = useState<Record<string, any>>({});
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => strategies.find((s) => s.id === selectedId) ?? null,
    [strategies, selectedId]
  );

  // Load saved theme
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") document.documentElement.classList.add("dark");
  }, []);

  // Load strategies
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiGet<{ strategies: Strategy[] }>("/strategies");
        if (cancelled) return;
        setStrategies(data.strategies);
        if (!selectedId && data.strategies[0]) setSelectedId(data.strategies[0].id);
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

  // When selection changes, seed config defaults
  useEffect(() => {
    if (!selected) return;
    const next: Record<string, any> = {};
    for (const f of selected.configSchema.fields) {
      if (typeof f.default !== "undefined") next[f.key] = f.default;
    }
    setConfig(next);
  }, [selected]);

  // Poll logs
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

  const refreshStrategies = async () => {
    const data = await apiGet<{ strategies: Strategy[] }>("/strategies");
    setStrategies(data.strategies);
  };

  const onStart = async () => {
    if (!selected) return;
    setError(null);
    await apiPost(`/strategies/${selected.id}/start`, config);
    await refreshStrategies();
    setPage("runs");
  };

  const onStop = async () => {
    if (!selected) return;
    setError(null);
    await apiPost(`/strategies/${selected.id}/stop`, {});
    await refreshStrategies();
  };

  const newestFirst = useMemo(() => [...events].reverse(), [events]);

  return (
    <Shell
      nav={[
        { key: "strategy-library", label: "Strategy Library" },
        { key: "runs", label: "Runs" },
        { key: "logs", label: "Logs" }
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

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Strategies</CardTitle>
            <div className="text-xs text-mutedForeground">Runner: {RUNNER_BASE_URL}</div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {strategies.map((s) => (
                <button
                  key={s.id}
                  className={
                    "w-full rounded-lg border border-border px-3 py-2 text-left hover:bg-muted " +
                    (selectedId === s.id ? "bg-muted" : "bg-card")
                  }
                  onClick={() => setSelectedId(s.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium">{s.name}</div>
                    <div
                      className={
                        "rounded-full border px-2 py-0.5 text-xs " +
                        (s.status.runState === "running"
                          ? "border-emerald-500/40 text-emerald-400"
                          : s.status.runState === "error"
                            ? "border-red-500/40 text-red-400"
                            : "border-border text-mutedForeground")
                      }
                    >
                      {s.status.runState}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-mutedForeground">{s.description}</div>
                  <div className="mt-1 font-mono text-[11px] text-mutedForeground">{s.id}</div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Config + Controls</CardTitle>
          </CardHeader>
          <CardContent>
            {!selected ? (
              <div className="text-sm text-mutedForeground">Select a strategy</div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-3">
                  {selected.configSchema.fields.map((f) => (
                    <label key={f.key} className="block">
                      <div className="text-xs font-medium">{f.label}</div>
                      <div className="mt-1">
                        {f.type === "number" ? (
                          <input
                            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                            type="number"
                            value={config[f.key] ?? ""}
                            min={f.min}
                            max={f.max}
                            step={f.step}
                            onChange={(e) =>
                              setConfig((c) => ({ ...c, [f.key]: Number(e.target.value) }))
                            }
                          />
                        ) : f.type === "boolean" ? (
                          <input
                            type="checkbox"
                            checked={Boolean(config[f.key])}
                            onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.checked }))}
                          />
                        ) : (
                          <input
                            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                            type="text"
                            value={String(config[f.key] ?? "")}
                            onChange={(e) =>
                              setConfig((c) => ({ ...c, [f.key]: e.target.value }))
                            }
                          />
                        )}
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-mutedForeground">{f.key}</div>
                    </label>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Button onClick={onStart}>Start</Button>
                  <Button variant="outline" onClick={onStop}>
                    Stop
                  </Button>
                  <Button variant="ghost" onClick={refreshStrategies}>
                    Refresh
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Live Events</CardTitle>
            <div className="text-xs text-mutedForeground">Polling /logs</div>
          </CardHeader>
          <CardContent>
            <div className="max-h-[70vh] overflow-auto rounded-lg border border-border">
              {newestFirst.map((e) => (
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
              {newestFirst.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-mutedForeground">
                  No events yet.
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </Shell>
  );
}
