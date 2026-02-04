import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Strategy } from "@polystrat/strategy-sdk";

export type LoadedStrategy = Strategy<any> & { attribution?: any };

type Meta = {
  id: string;
  name: string;
  author: string;
  license: string;
  sourceUrl: string;
  tags?: string[];
  paramsSchema: any;
  uiHints?: any;
};

export async function loadStrategiesFromFolder(): Promise<Record<string, LoadedStrategy>> {
  const root = await findWorkspaceRoot();
  const strategiesDir = path.join(root, "strategies");

  let entries: string[] = [];
  try {
    const dirents = await fs.readdir(strategiesDir, { withFileTypes: true });
    entries = dirents.filter((d) => d.isDirectory() && !d.name.startsWith("_"))
      .map((d) => d.name)
      .sort();
  } catch {
    return {};
  }

  const out: Record<string, LoadedStrategy> = {};

  for (const name of entries) {
    const base = path.join(strategiesDir, name);
    const metaPath = path.join(base, "meta.json");
    const adapterPath = path.join(base, "adapter.ts");

    let meta: Meta;
    try {
      meta = JSON.parse(await fs.readFile(metaPath, "utf8"));
    } catch {
      continue;
    }

    try {
      const modUrl = pathToFileURL(adapterPath).toString();
      const mod: any = await import(modUrl);
      const strategy: LoadedStrategy | undefined = mod.strategy;
      if (!strategy || !strategy.meta?.id) continue;

      // Ensure ids match (hard rule)
      if (strategy.meta.id !== meta.id) {
        throw new Error(`strategy id mismatch in ${name}: meta.json=${meta.id} adapter.ts=${strategy.meta.id}`);
      }

      // attach UI hints for web
      (strategy as any).uiHints = meta.uiHints ?? null;
      out[strategy.meta.id] = strategy;
    } catch {
      continue;
    }
  }

  return out;
}

async function findWorkspaceRoot(): Promise<string> {
  // Start from this file's directory.
  let dir = path.dirname(fileURLToPath(import.meta.url));

  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, "package.json");
    try {
      const raw = await fs.readFile(candidate, "utf8");
      const j = JSON.parse(raw);
      if (j && typeof j === "object" && Array.isArray(j.workspaces)) return dir;
    } catch {
      // ignore
    }

    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return process.cwd();
}
