import { getStrategyRegistry } from "./registry.js";
import { InMemoryEventStore, createContext } from "../index.js";

// Minimal QA harness: load all strategies and ensure start/onTick/stop do not throw in paper mode.
// This is NOT financial correctness. It's a safety + packaging gate.

export async function runStrategyQa(): Promise<{ ok: boolean; results: any[] }> {
  const registry = await getStrategyRegistry();
  const results: any[] = [];

  for (const [id, s] of Object.entries(registry)) {
    const store = new InMemoryEventStore();
    const runId = `qa-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const ctx = createContext({ strategyId: id, runId, store });

    const baseConfig: any = { executionMode: "paper", provider: "mock", marketId: "QA_MARKET", pollMs: 2500, moveThreshold: 0.02, paperSize: 5 };

    const tick1: any = {
      source: "qa",
      ts: Date.now(),
      marketId: "QA_MARKET",
      priceYes: 0.5,
      priceNo: 0.5,
      volume: 0,
      liquidity: 0,
      moveThreshold: 0.02,
      paperSize: 5,
      executionMode: "paper",
      provider: "mock"
    };

    const tick2: any = { ...tick1, ts: Date.now() + 1, priceYes: 0.53, priceNo: 0.47 };

    try {
      await s.start(ctx as any, baseConfig);
      await s.onTick(ctx as any, tick1);
      await s.onTick(ctx as any, tick2);
      await s.stop(ctx as any);
      results.push({ id, ok: true, events: store.recent(50) });
    } catch (e: any) {
      results.push({ id, ok: false, error: String(e?.message ?? e), stack: e?.stack ?? null, events: store.recent(50) });
    }
  }

  const ok = results.every((r) => r.ok);
  return { ok, results };
}

if (process.argv[1]?.includes("qaHarness")) {
  const out = await runStrategyQa();
  console.log(JSON.stringify(out, null, 2));
  process.exitCode = out.ok ? 0 : 1;
}
