import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { RUNNER_BASE_URL } from "./config";

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

function App() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [events, setEvents] = useState<RunnerEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [config, setConfig] = useState<Record<string, any>>({});
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => strategies.find((s) => s.id === selectedId) ?? null,
    [strategies, selectedId]
  );

  // Load strategies
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiGet<{ strategies: Strategy[] }>("/strategies");
        if (cancelled) return;
        setStrategies(data.strategies);
        if (!selectedId && data.strategies[0]) {
          setSelectedId(data.strategies[0].id);
        }
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
    const id = window.setInterval(tick, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const onStart = async () => {
    if (!selected) return;
    setError(null);
    await apiPost(`/strategies/${selected.id}/start`, config);
    const data = await apiGet<{ strategies: Strategy[] }>("/strategies");
    setStrategies(data.strategies);
  };

  const onStop = async () => {
    if (!selected) return;
    setError(null);
    await apiPost(`/strategies/${selected.id}/stop`, {});
    const data = await apiGet<{ strategies: Strategy[] }>("/strategies");
    setStrategies(data.strategies);
  };

  const newestFirst = useMemo(() => [...events].reverse(), [events]);

  return (
    <div className="page">
      <header className="header">
        <div>
          <div className="title">polystrat.io — thin slice (paper mode)</div>
          <div className="subtitle">Runner: {RUNNER_BASE_URL}</div>
        </div>
        {error ? <div className="error">{error}</div> : null}
      </header>

      <main className="grid">
        <section className="panel">
          <h2>Strategies</h2>
          <div className="strategyList">
            {strategies.map((s) => (
              <button
                key={s.id}
                className={`strategyItem ${selectedId === s.id ? "active" : ""}`}
                onClick={() => setSelectedId(s.id)}
              >
                <div className="row">
                  <div className="name">{s.name}</div>
                  <div className={`badge ${s.status.runState}`}>{s.status.runState}</div>
                </div>
                <div className="desc">{s.description}</div>
                <div className="mono">id: {s.id}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>Config + Controls</h2>
          {!selected ? (
            <div className="muted">No strategy selected</div>
          ) : (
            <>
              <div className="form">
                {selected.configSchema.fields.map((f) => (
                  <label key={f.key} className="field">
                    <div className="label">{f.label}</div>
                    {f.type === "number" ? (
                      <input
                        type="number"
                        value={config[f.key] ?? ""}
                        min={f.min}
                        max={f.max}
                        step={f.step}
                        onChange={(e) => setConfig((c) => ({ ...c, [f.key]: Number(e.target.value) }))}
                      />
                    ) : f.type === "boolean" ? (
                      <input
                        type="checkbox"
                        checked={Boolean(config[f.key])}
                        onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.checked }))}
                      />
                    ) : f.type === "select" ? (
                      <select
                        value={String(config[f.key] ?? "")}
                        onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))}
                      >
                        {(f.options ?? []).map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={String(config[f.key] ?? "")}
                        onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))}
                      />
                    )}
                    <div className="mono muted">{f.key}</div>
                  </label>
                ))}
              </div>

              <div className="controls">
                <button className="btn" onClick={onStart}>
                  Start
                </button>
                <button className="btn" onClick={onStop}>
                  Stop
                </button>
              </div>
            </>
          )}
        </section>

        <section className="panel logs">
          <h2>Logs (polling)</h2>
          <div className="logList">
            {newestFirst.map((e) => (
              <div key={e.id} className={`logRow ${e.type}`}>
                <div className="mono ts">{new Date(e.ts).toLocaleTimeString()}</div>
                <div className="mono type">{e.type}</div>
                <div className="msg">
                  {e.type === "log" ? e.message : null}
                  {e.type === "signal" ? e.message : null}
                  {e.type === "error" ? e.message : null}
                  {e.type === "paperTrade" ? `${e.side} ${e.size} @ ${e.price} (${e.marketId})` : null}
                  <div className="mono muted small">{e.strategyId} / {e.runId}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="footer">
        Paper mode only. No wallets. No payments. No Polymarket execution.
      </footer>
    </div>
  );
}

export default App;
