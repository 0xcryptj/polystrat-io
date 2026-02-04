import type { Strategy } from "@polystrat/strategy-sdk";
import { makeDummyStrategy, type RunnerStrategyConfig } from "../index.js";
import type { LoadedStrategy } from "./loader.js";
import { loadStrategiesFromFolder } from "./loader.js";

export type AnyRunnerStrategy = Strategy<any> & { attribution?: any; uiHints?: any };

// Loads vendored strategies from /strategies/* (adapter.ts + meta.json)
export async function getStrategyRegistry(): Promise<Record<string, AnyRunnerStrategy>> {
  const toy = makeDummyStrategy() as Strategy<RunnerStrategyConfig>;
  (toy as any).attribution = { author: "polystrat", license: "MIT", sourceUrl: "(internal)" };

  const registry: Record<string, AnyRunnerStrategy> = {
    [toy.meta.id]: toy
  };

  const loaded: Record<string, LoadedStrategy> = await loadStrategiesFromFolder();
  for (const [id, s] of Object.entries(loaded)) registry[id] = s as AnyRunnerStrategy;

  return registry;
}
