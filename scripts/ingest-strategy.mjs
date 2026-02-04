#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

function usage() {
  console.log(`\npolystrat strategy ingest (scaffold)\n\nUsage:\n  node scripts/ingest-strategy.mjs \\\n    --id polymarket-arb-signals \\\n    --name "Polymarket Arbitrage Signals" \\\n    --author "polystrat" \\\n    --license "MIT" \\\n    --source https://github.com/runesatsdev/polymarket-arbitrage-bot \\\n    --commit <sha> \\\n    --tags "polymarket,arbitrage,signals"\n\nNotes:\n- This script scaffolds a Strategy Package under ./strategies/<id>/ (meta.json + adapter.ts).\n- It does NOT execute or trust upstream code. You port logic into adapter.ts.\n- --commit is optional but strongly recommended for traceability.\n`);
}

function argMap(argv) {
  const m = new Map();
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
    m.set(key, val);
  }
  return m;
}

function parseTags(s) {
  if (!s) return [];
  return String(s)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const args = argMap(process.argv);
  if (args.has("help") || args.has("h")) return usage();

  const id = String(args.get("id") ?? "").trim();
  const name = String(args.get("name") ?? "").trim();
  const author = String(args.get("author") ?? "").trim();
  const license = String(args.get("license") ?? "").trim();
  const sourceUrl = String(args.get("source") ?? "").trim();
  const commit = String(args.get("commit") ?? "").trim();
  const tags = parseTags(args.get("tags"));

  if (!id || !name || !author || !license || !sourceUrl) {
    usage();
    process.exitCode = 2;
    console.error("Missing required args: --id --name --author --license --source");
    return;
  }

  const root = process.cwd();
  const strategiesDir = path.join(root, "strategies");
  const pkgDir = path.join(strategiesDir, id);
  const metaPath = path.join(pkgDir, "meta.json");
  const adapterPath = path.join(pkgDir, "adapter.ts");

  if (await exists(pkgDir)) {
    process.exitCode = 2;
    console.error(`Refusing to overwrite existing strategy folder: ${pkgDir}`);
    return;
  }

  await fs.mkdir(pkgDir, { recursive: true });

  const meta = {
    id,
    name,
    author,
    license,
    sourceUrl: commit ? `${sourceUrl}#${commit}` : sourceUrl,
    tags,
    // paramsSchema kept for backwards compat with earlier experiments; runner uses configSchema on the strategy.
    paramsSchema: { version: 1 },
    uiHints: {
      kind: "strategy",
      maturity: "draft",
      // what the web UI can show as a safety badge.
      safety: { mode: "paper_only", liveTrading: false, handlesKeys: false }
    }
  };

  const adapter = `import type { Strategy } from "@polystrat/strategy-sdk";\n\n// Strategy Package scaffold\n// Upstream source (pinned): ${meta.sourceUrl}\n// Hard rule: do NOT paste private keys or secret URLs into strategies.\n\nexport const strategy: Strategy<any> = {\n  meta: {\n    id: ${JSON.stringify(id)},\n    name: ${JSON.stringify(name)},\n    description: "TODO: port upstream strategy logic into this adapter",\n    tags: ${JSON.stringify(tags)}\n  },\n\n  // This schema drives the web UI form AND the runner validator.\n  configSchema: {\n    fields: [\n      { key: "provider", label: "Provider", type: "select", default: "polymarket", options: [\n        { label: "Polymarket", value: "polymarket" },\n        { label: "Mock", value: "mock" }\n      ]},\n      { key: "executionMode", label: "Execution Mode", type: "select", default: "paper", options: [\n        { label: "Paper", value: "paper" },\n        { label: "Live (server-gated)", value: "live" }\n      ]}\n    ]\n  },\n\n  async start(ctx, config) {\n    ctx.emit({ type: "log", level: "info", message: "strategy start", data: { config } });\n  },\n\n  async stop(ctx) {\n    ctx.emit({ type: "log", level: "info", message: "strategy stop" });\n  },\n\n  async onTick(ctx, input) {\n    // input: MarketSnapshot or whatever your runner passes.\n    ctx.emit({ type: "log", level: "debug", message: "tick", data: { input } });\n  }\n};\n`;

  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2) + "\n", "utf8");
  await fs.writeFile(adapterPath, adapter, "utf8");

  console.log(`✅ Created strategy package: strategies/${id}`);
  console.log(`- meta.json: ${metaPath}`);
  console.log(`- adapter.ts: ${adapterPath}`);
  console.log("\nNext: implement adapter.ts strategy logic, then run runner and verify it appears in /strategies.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
