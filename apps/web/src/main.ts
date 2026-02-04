// Credits are derived from loaded strategies (no static list).
import { supabase } from "./supabase";
import { renderLogin } from "./login";
import { renderAccessRequired } from "./accessRequired";
import { buildConfigForm } from "./strategyUi";

type RunnerStatus = { runState: "stopped" | "running" | "error"; strategyId?: string; runId?: string };

type ConfigField =
  | { key: string; label: string; type: "string"; default?: string }
  | { key: string; label: string; type: "number"; default?: number; min?: number; max?: number; step?: number }
  | { key: string; label: string; type: "select"; default?: string; options: { label: string; value: string }[] };

type Strategy = {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  attribution?: null | { author: string; license: string; sourceUrl: string };
  execution?: { serverLiveEnabled: boolean; effectiveMode: "paper" | "live" };
  configSchema: { fields: ConfigField[] };
  status: RunnerStatus;
};

type RunnerLogsResponse = {
  status: RunnerStatus;
  strategyId: string | null;
  runId: string | null;
  events: any[];
};

type BotConfig = {
  positionSizeUsd: number; // 10..1000
  riskCapUsd: number; // 0..5000 (soft cap)
  autoSell: boolean;
  stopLoss: boolean;
  categories: string[];

  profitNotifs: { p10: boolean; p25: boolean; p50: boolean };
  channels: { email: boolean; telegram: boolean; discord: boolean };
};

const DEFAULT_BOT_CONFIG: BotConfig = {
  positionSizeUsd: 50,
  riskCapUsd: 250,
  autoSell: true,
  stopLoss: false,
  categories: ["Politics"],
  profitNotifs: { p10: true, p25: false, p50: false },
  channels: { email: false, telegram: true, discord: false }
};

const CATEGORY_OPTIONS = [
  "Politics",
  "Crypto",
  "Sports",
  "Elections",
  "Tech",
  "Entertainment",
  "Macro",
  "Memes"
];

const RUNNER_URL = localStorage.getItem("runnerUrl") ?? "http://localhost:3344";
const API_URL = localStorage.getItem("apiUrl") ?? "http://localhost:3399";
const app = document.querySelector<HTMLDivElement>("#app")!;

// If anything blows up during boot, show it on-screen (helps when DevTools isn't obvious).
function showFatal(err: any) {
  try {
    const msg = String(err?.message ?? err);
    app.innerHTML = "";
    const pre = document.createElement("pre");
    pre.textContent = `UI error: ${msg}\n\n${err?.stack ?? ""}`;
    app.append(pre);
  } catch {
    // ignore
  }
}

window.addEventListener("error", (e) => showFatal((e as any).error ?? e));
window.addEventListener("unhandledrejection", (e: any) => showFatal(e?.reason ?? e));

let __session: any = null;
let __gate: { allowed: boolean; reason?: string } | null = null;

async function getSession() {
  if (__session) return __session;
  const { data } = await supabase.auth.getSession();
  __session = data.session;
  return __session;
}

async function getGateStatus(): Promise<{ allowed: boolean; reason?: string } | null> {
  const session = await getSession();
  if (!session) return null;

  // cache in-memory per reload; if user changes wallets, they can hit "Re-check".
  if (__gate) return __gate;

  try {
    const j = await apiGet("/gating/status");
    __gate = { allowed: Boolean(j.allowed), reason: String(j.reason ?? "") };
    return __gate;
  } catch (e: any) {
    __gate = { allowed: false, reason: "gate_check_failed" };
    return __gate;
  }
}

supabase.auth.onAuthStateChange((_event, session) => {
  __session = session;
  __gate = null;
  render();
});

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: any = {}, ...children: (Node | string)[]) {
  const n = document.createElement(tag);
  Object.assign(n, props);
  for (const c of children) n.append(c instanceof Node ? c : document.createTextNode(c));
  return n;
}

function icon(kind: "bot" | "bell" | "sliders" | "book" | "chart") {
  const paths: Record<string, string> = {
    bot: "M10 5a2 2 0 1 1 4 0v2h2a3 3 0 0 1 3 3v5a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-5a3 3 0 0 1 3-3h2V5zm-2 7a1.5 1.5 0 1 0 0.001 0zM16 12a1.5 1.5 0 1 0 0.001 0z",
    bell: "M12 22a2 2 0 0 0 2-2H10a2 2 0 0 0 2 2zm6-6V11a6 6 0 1 0-12 0v5l-2 2v1h16v-1l-2-2z",
    sliders: "M4 21v-7m0-4V3m10 18v-9m0-4V3m6 18v-3m0-4V3M3 14h2m9-2h2m5 6h2M3 10h2m9 8h2m5-8h2",
    book: "M4 19a2 2 0 0 0 2 2h12V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14zm2-2h10",
    chart: "M4 19h16M6 17V9m4 8V5m4 12v-6m4 6V7"
  };
  return el(
    "svg",
    { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", style: "opacity:.9" },
    el("path", { d: paths[kind], stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" })
  );
}

function fmtUsd(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}

function loadBotConfig(): BotConfig {
  try {
    const raw = localStorage.getItem("botConfig");
    if (!raw) return structuredClone(DEFAULT_BOT_CONFIG);
    const j = JSON.parse(raw);
    return { ...structuredClone(DEFAULT_BOT_CONFIG), ...j };
  } catch {
    return structuredClone(DEFAULT_BOT_CONFIG);
  }
}

function saveBotConfig(c: BotConfig) {
  localStorage.setItem("botConfig", JSON.stringify(c));
}

async function getStrategies(): Promise<Strategy[]> {
  const j = await apiGet("/runner/strategies");
  return j.strategies as Strategy[];
}

type TraderProfile = {
  address: string;
  nickname?: string;
  createdAt: number;
  tags: string[];
  status: "active" | "paused";
};

type TraderStats = {
  address: string;
  totalVolume?: number;
  winRate?: number;
  activePositionsCount?: number;
  lastTradeTime?: number;
  pnl?: { realized?: number; unrealized?: number; total?: number; currency?: string };
  unavailableReason?: string;
};

async function apiGet(path: string) {
  const session = await getSession();
  const token = session?.access_token as string | undefined;

  const r = await fetch(`${API_URL}${path}`, {
    headers: token ? { "authorization": `Bearer ${token}` } : {}
  });
  if (!r.ok) throw new Error(`api ${path}: ${r.status}`);
  return await r.json();
}

async function apiPost(path: string, body: any) {
  const session = await getSession();
  const token = session?.access_token as string | undefined;

  const r = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { "authorization": `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`api ${path}: ${r.status}`);
  return await r.json();
}

async function apiDelete(path: string) {
  const session = await getSession();
  const token = session?.access_token as string | undefined;

  const r = await fetch(`${API_URL}${path}`, {
    method: "DELETE",
    headers: token ? { "authorization": `Bearer ${token}` } : {}
  });
  if (!r.ok) throw new Error(`api ${path}: ${r.status}`);
  return await r.json();
}

async function listTraders(): Promise<TraderProfile[]> {
  const j = await apiGet("/traders");
  return j.traders as TraderProfile[];
}

async function addTrader(address: string, nickname?: string) {
  return await apiPost("/traders", { address, nickname });
}

async function removeTrader(address: string) {
  return await apiDelete(`/traders/${encodeURIComponent(address)}`);
}

async function getTraderStats(address: string): Promise<TraderStats> {
  return await apiGet(`/traders/${encodeURIComponent(address)}/stats`);
}

async function getTraderPositions(address: string): Promise<any> {
  return await apiGet(`/traders/${encodeURIComponent(address)}/positions`);
}

async function getTraderTrades(address: string, limit = 50): Promise<any> {
  return await apiGet(`/traders/${encodeURIComponent(address)}/trades?limit=${limit}`);
}

async function startStrategy(strategyId: string, config: any) {
  await apiPost(`/runner/strategies/${encodeURIComponent(strategyId)}/start`, config);
}

async function stopStrategy(strategyId: string) {
  await apiPost(`/runner/strategies/${encodeURIComponent(strategyId)}/stop`, {});
}

async function getLogs(limit = 200): Promise<RunnerLogsResponse> {
  return (await apiGet(`/runner/logs?limit=${encodeURIComponent(String(limit))}`)) as RunnerLogsResponse;
}

function formatEvent(e: any) {
  const ts = new Date(e.ts ?? Date.now()).toLocaleTimeString();
  if (e.type === "log") return `${ts} [${e.level}] ${e.message}`;
  if (e.type === "error") return `${ts} [error] ${e.message}`;
  if (e.type === "signal") return `${ts} [signal] ${e.message}`;
  if (e.type === "paperTrade") return `${ts} [paper] ${e.side} ${e.marketId} @ ${Number(e.price).toFixed(4)} x ${e.size}`;
  return `${ts} ${JSON.stringify(e)}`;
}

function card(title: string, subtitle: string, leftIcon?: Node, ...children: Node[]) {
  const h = el(
    "div",
    { className: "cardHeader" },
    el("div", { className: "cardTitle" }, leftIcon ?? "", el("h2", {}, title), el("span", { className: "muted" }, subtitle))
  );
  return el("div", { className: "card" }, h, ...children);
}

function section(title: string, desc: string, leftIcon?: Node, ...children: Node[]) {
  return el(
    "div",
    { className: "section" },
    el(
      "div",
      { className: "sectionTitle" },
      leftIcon ?? "",
      el("b", {}, title),
      el("span", { className: "muted" }, desc)
    ),
    ...children
  );
}

function toggle(label: string, value: boolean, onChange: (v: boolean) => void) {
  const root = el(
    "div",
    {
      className: `toggle ${value ? "toggleOn" : ""}`,
      onclick: () => {
        value = !value;
        root.className = `toggle ${value ? "toggleOn" : ""}`;
        onChange(value);
      }
    },
    el("div", { className: "toggleDot" }),
    el("div", {}, el("div", { style: "font-size:13px" }, label), el("div", { className: "muted" }, value ? "Enabled" : "Disabled"))
  );
  return root;
}

function slider(label: string, value: number, min: number, max: number, step: number, renderValue: (n: number) => string, onChange: (v: number) => void) {
  const vEl = el("span", { className: "pill green" }, renderValue(value));
  const input = el("input", { type: "range", min, max, step, value: String(value) }) as HTMLInputElement;
  input.addEventListener("input", () => {
    const v = Number(input.value);
    vEl.textContent = renderValue(v);
    onChange(v);
  });

  return el(
    "div",
    { className: "field" },
    el("div", { className: "fieldLabel" }, el("span", {}, label), vEl),
    input
  );
}

function chipMulti(options: string[], selected: Set<string>, onChange: (sel: Set<string>) => void) {
  const root = el("div", { className: "chips" });
  for (const o of options) {
    const c = el("div", {
      className: `chip ${selected.has(o) ? "chipOn" : ""}`,
      onclick: () => {
        if (selected.has(o)) selected.delete(o);
        else selected.add(o);
        c.className = `chip ${selected.has(o) ? "chipOn" : ""}`;
        onChange(new Set(selected));
      }
    }, o);
    root.append(c);
  }
  return root;
}

function topbar(opts?: { email?: string | null; gateAllowed?: boolean | null }) {
  const route = (location.hash || "#dashboard").replace("#", "");
  const navBtn = (hash: string, label: string) =>
    el(
      "button",
      {
        className: `btn ${route === hash.replace("#", "") ? "primary" : ""}`,
        onclick: () => {
          location.hash = hash;
          render();
        }
      },
      label
    );

  const gatePill =
    opts?.gateAllowed == null
      ? el("span", { className: "pill" }, "Gate: ?")
      : opts.gateAllowed
        ? el("span", { className: "pill green" }, "Token Holder")
        : el("span", { className: "pill" }, "No Access");

  const account = el(
    "div",
    { className: "row" },
    gatePill,
    opts?.email ? el("span", { className: "pill" }, opts.email) : el("span", { className: "pill" }, "signed out"),
    el(
      "button",
      {
        className: "btn",
        onclick: async () => {
          await supabase.auth.signOut();
          location.hash = "#login";
        }
      },
      "Sign out"
    )
  );

  return el(
    "div",
    { className: "topbar" },
    el(
      "div",
      { className: "brand" },
      el("span", { className: "pill" }, "polystrat"),
      el("span", { className: "pill green", title: "Execution is locked to paper mode" }, "Paper Mode"),
      el("h1", {}, "Dashboard")
    ),
    el(
      "div",
      { className: "nav" },
      navBtn("#dashboard", "Strategies"),
      navBtn("#markets", "Markets"),
      navBtn("#analytics", "Analytics"),
      navBtn("#wallets", "Wallets"),
      navBtn("#traders", "Traders"),
      navBtn("#bot-config", "Bot Config"),
      navBtn("#notifications", "Notifications"),
      navBtn("#credits", "Credits")
    ),
    account
  );
}

async function renderDashboard() {
  const grid = el("div", { className: "grid" });
  const strategies = await getStrategies();

  for (const s of strategies) {
    const logsPre = el("pre", { textContent: "loading logs..." });

    const statusRow = el(
      "div",
      { className: "row" },
      el("span", { className: `pill ${s.status.runState === "running" ? "green" : ""}` }, s.status.runState),
      s.attribution?.license ? el("span", { className: "pill" }, s.attribution.license) : el("span", { className: "pill" }, "local"),
      s.attribution?.author ? el("span", { className: "muted" }, `by ${s.attribution.author}`) : el("span", { className: "muted" }, ""),
      s.attribution?.sourceUrl && s.attribution.sourceUrl !== "(internal)" ? el("a", { href: s.attribution.sourceUrl, target: "_blank" }, "source") : el("span", { className: "muted" }, "")
    );

    // Schema-driven config UI
    const form = buildConfigForm({ el, fields: (s.configSchema?.fields ?? []) as any[] });

    const startBtn = el(
      "button",
      {
        className: "btn primary",
        onclick: async () => {
          const cfg = form.getValues();

          // Always enforce paper mode in UI
          cfg.executionMode = "paper";
          cfg.userEnableLive = false;
          cfg.walletConnected = false;
          cfg.planApproved = false;

          await startStrategy(s.id, cfg);
        }
      },
      "Start"
    );

    const stopBtn = el(
      "button",
      {
        className: "btn danger",
        onclick: async () => {
          await stopStrategy(s.id);
        }
      },
      "Stop"
    );

    const controls = el(
      "div",
      { className: "grid" },
      el(
        "div",
        { className: "section span7" },
        el("div", { className: "row" }, startBtn, stopBtn),
        el("div", { style: "margin-top:10px" }, form.node)
      ),
      el(
        "div",
        { className: "section span5" },
        el("div", { className: "muted" }, "Events"),
        el("div", { style: "margin-top:10px" }, logsPre)
      )
    );

    const c = card(s.name, s.description ?? "", icon("chart"), statusRow, el("div", { style: "margin-top:12px" }, controls));
    grid.append(c);
  }

  const refresh = async () => {
    try {
      const j = await getLogs(200);
      const txt = (j.events ?? []).map(formatEvent).join("\n");
      grid.querySelectorAll("pre").forEach((p) => (p.textContent = txt));
    } catch (e: any) {
      const msg = `log fetch failed: ${String(e?.message ?? e)}`;
      grid.querySelectorAll("pre").forEach((p) => (p.textContent = msg));
    }
  };

  await refresh();
  window.clearInterval((window as any).__logsTimer);
  (window as any).__logsTimer = window.setInterval(refresh, 1000);

  return grid;
}

function renderBotConfig() {
  const cfg = loadBotConfig();

  const presets = {
    Conservative: { positionSizeUsd: 25, riskCapUsd: 100, autoSell: true, stopLoss: true, categories: ["Politics", "Elections"] },
    Balanced: { positionSizeUsd: 75, riskCapUsd: 300, autoSell: true, stopLoss: false, categories: ["Politics", "Crypto"] },
    Degenerate: { positionSizeUsd: 250, riskCapUsd: 1000, autoSell: false, stopLoss: false, categories: ["Memes", "Crypto"] }
  } as const;

  const applyPreset = (p: keyof typeof presets) => {
    const next = { ...cfg, ...presets[p] };
    saveBotConfig(next);
    render();
  };

  const position = slider("Position size", cfg.positionSizeUsd, 10, 1000, 10, fmtUsd, (v) => {
    cfg.positionSizeUsd = v;
    saveBotConfig(cfg);
  });

  const risk = slider("Risk cap", cfg.riskCapUsd, 0, 5000, 25, fmtUsd, (v) => {
    cfg.riskCapUsd = v;
    saveBotConfig(cfg);
  });

  const autoSell = toggle("Auto-sell", cfg.autoSell, (v) => {
    cfg.autoSell = v;
    saveBotConfig(cfg);
  });

  const stopLoss = toggle("Stop-loss", cfg.stopLoss, (v) => {
    cfg.stopLoss = v;
    saveBotConfig(cfg);
  });

  const catSet = new Set(cfg.categories);
  const cats = chipMulti(CATEGORY_OPTIONS, catSet, (sel) => {
    cfg.categories = Array.from(sel);
    saveBotConfig(cfg);
  });

  const presetRow = el(
    "div",
    { className: "row" },
    el("span", { className: "muted" }, "Presets"),
    ...Object.keys(presets).map((k) =>
      el(
        "button",
        { className: "btn", onclick: () => applyPreset(k as keyof typeof presets) },
        k
      )
    )
  );

  const layout = el(
    "div",
    { className: "grid" },
    card(
      "Bot Configuration",
      "Modern dashboard controls (saved locally)",
      icon("sliders"),
      el(
        "div",
        { className: "grid", style: "margin-top:12px" },
        el(
          "div",
          { className: "section span6" },
          el("div", { className: "row" }, presetRow),
          el("div", { style: "margin-top:12px" }, position),
          el("div", { style: "margin-top:12px" }, risk)
        ),
        el(
          "div",
          { className: "section span6" },
          el("div", { className: "row" }, autoSell, stopLoss),
          el("div", { style: "margin-top:12px" }, el("div", { className: "muted" }, "Categories"), cats)
        )
      )
    )
  );

  return layout;
}

function renderNotifications() {
  const cfg = loadBotConfig();

  const p10 = toggle("10% profit", cfg.profitNotifs.p10, (v) => {
    cfg.profitNotifs.p10 = v;
    saveBotConfig(cfg);
  });
  const p25 = toggle("25% profit", cfg.profitNotifs.p25, (v) => {
    cfg.profitNotifs.p25 = v;
    saveBotConfig(cfg);
  });
  const p50 = toggle("50% profit", cfg.profitNotifs.p50, (v) => {
    cfg.profitNotifs.p50 = v;
    saveBotConfig(cfg);
  });

  const email = toggle("Email", cfg.channels.email, (v) => {
    cfg.channels.email = v;
    saveBotConfig(cfg);
  });
  const telegram = toggle("Telegram", cfg.channels.telegram, (v) => {
    cfg.channels.telegram = v;
    saveBotConfig(cfg);
  });
  const discord = toggle("Discord", cfg.channels.discord, (v) => {
    cfg.channels.discord = v;
    saveBotConfig(cfg);
  });

  return el(
    "div",
    { className: "grid" },
    card(
      "Notification Settings",
      "UI only (no delivery yet)",
      icon("bell"),
      el(
        "div",
        { className: "grid", style: "margin-top:12px" },
        section("Profit thresholds", "Choose when to be bothered", icon("chart"), el("div", { className: "row" }, p10, p25, p50)),
        section("Channels", "Wiring comes later", icon("book"), el("div", { className: "row" }, email, telegram, discord))
      )
    )
  );
}

function fmtPct(n: number | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function fmtTime(ts: number | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

async function renderTraders() {
  const grid = el("div", { className: "grid" });

  const addressInput = el("input", { placeholder: "wallet address" }) as HTMLInputElement;
  const nickInput = el("input", { placeholder: "nickname (optional)" }) as HTMLInputElement;

  const addBtn = el(
    "button",
    {
      className: "btn primary",
      onclick: async () => {
        await addTrader(addressInput.value.trim(), nickInput.value.trim() || undefined);
        addressInput.value = "";
        nickInput.value = "";
        render();
      }
    },
    "Follow"
  );

  grid.append(
    card(
      "Trader Profiles",
      `API: ${API_URL} (in-memory)`,
      icon("bot"),
      section(
        "Follow a trader",
        "Read-only. Copy rules are paper-only for now.",
        icon("sliders"),
        el(
          "div",
          { className: "row" },
          el(
            "div",
            { className: "field" },
            el("div", { className: "fieldLabel" }, el("span", {}, "Address"), el("span", { className: "muted" }, "required")),
            addressInput
          ),
          el(
            "div",
            { className: "field" },
            el("div", { className: "fieldLabel" }, el("span", {}, "Nickname"), el("span", { className: "muted" }, "optional")),
            nickInput
          ),
          addBtn
        )
      )
    )
  );

  let traders: TraderProfile[] = [];
  try {
    traders = await listTraders();
  } catch (e: any) {
    grid.append(card("Error", String(e?.message ?? e), icon("bell")));
    return grid;
  }

  if (!traders.length) {
    grid.append(card("No traders", "Add a wallet address to start tracking.", icon("chart")));
    return grid;
  }

  for (const t of traders) {
    let stats: TraderStats | null = null;
    try {
      stats = await getTraderStats(t.address);
    } catch {
      stats = null;
    }

    const openBtn = el(
      "button",
      { className: "btn", onclick: () => (location.hash = `#traders/${encodeURIComponent(t.address)}`) },
      "Details"
    );
    const delBtn = el(
      "button",
      {
        className: "btn danger",
        onclick: async () => {
          await removeTrader(t.address);
          render();
        }
      },
      "Remove"
    );

    grid.append(
      card(
        t.nickname ?? "Trader",
        "Read-only follow",
        icon("bot"),
        el("div", { className: "row" }, openBtn, delBtn),
        section(
          "Summary",
          "Performance metrics (when available)",
          icon("chart"),
          el("div", { className: "row" },
            el("span", { className: "pill" }, t.status),
            el("span", { className: "muted" }, t.address)
          ),
          el("div", { className: "row", style: "margin-top:10px" },
            el("div", { className: "pill" }, `Win rate: ${fmtPct(stats?.winRate)}`),
            el("div", { className: "pill" }, `Volume: ${stats?.totalVolume ?? "—"}`),
            el("div", { className: "pill" }, `Active positions: ${stats?.activePositionsCount ?? "—"}`),
            el("div", { className: "pill" }, `Last trade: ${fmtTime(stats?.lastTradeTime)}`)
          ),
          stats?.unavailableReason ? el("div", { className: "muted", style: "margin-top:10px" }, stats.unavailableReason) : el("div", {})
        ),
        section(
          "Copy setup (paper)",
          "Rules saved locally (not executing live)",
          icon("sliders"),
          el("div", { className: "muted" }, "Coming next: per-trader copy rules (size scaling, allowlist categories, max risk).")
        )
      )
    );
  }

  return grid;
}

async function renderTraderDetail(address: string) {
  const grid = el("div", { className: "grid" });

  const back = el(
    "button",
    { className: "btn", onclick: () => (location.hash = "#traders") },
    "Back"
  );

  let stats: TraderStats | null = null;
  let positions: any = null;
  let trades: any = null;

  try {
    stats = await getTraderStats(address);
  } catch (e: any) {
    stats = { address, unavailableReason: String(e?.message ?? e) };
  }

  try {
    positions = await getTraderPositions(address);
  } catch (e: any) {
    positions = { error: String(e?.message ?? e) };
  }

  try {
    trades = await getTraderTrades(address, 50);
  } catch (e: any) {
    trades = { error: String(e?.message ?? e) };
  }

  grid.append(
    card(
      "Trader",
      address,
      icon("bot"),
      el("div", { className: "row" }, back),
      section(
        "Computed summary",
        "Best-effort (depends on available endpoints)",
        icon("chart"),
        el("div", { className: "row" },
          el("div", { className: "pill" }, `Win rate: ${fmtPct(stats?.winRate)}`),
          el("div", { className: "pill" }, `Volume: ${stats?.totalVolume ?? "—"}`),
          el("div", { className: "pill" }, `Active positions: ${stats?.activePositionsCount ?? "—"}`),
          el("div", { className: "pill" }, `Last trade: ${fmtTime(stats?.lastTradeTime)}`)
        ),
        stats?.unavailableReason ? el("div", { className: "muted", style: "margin-top:10px" }, stats.unavailableReason) : el("div", {})
      ),
      section("Positions", "Table view", icon("book"), el("pre", { textContent: JSON.stringify(positions, null, 2) })),
      section("Recent trades", "Table view", icon("book"), el("pre", { textContent: JSON.stringify(trades, null, 2) }))
    )
  );

  return grid;
}

function fmtNum(n: any, digits = 2): string {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

function fmtCompact(n: any): string {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}m`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(Math.round(v));
}

function parseJsonArray(raw: any): any[] | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t.startsWith("[")) return null;
  try {
    const j = JSON.parse(t);
    return Array.isArray(j) ? j : null;
  } catch {
    return null;
  }
}

function statusBadges(m: any) {
  const closed = Boolean(m?.raw?.closed ?? m?.raw?.closed === true);
  const active = m?.raw?.active;
  const uma = typeof m?.raw?.umaResolutionStatus === "string" ? m.raw.umaResolutionStatus : null;

  const badges: Node[] = [];

  if (uma && uma.toLowerCase().includes("resolved")) {
    badges.push(el("span", { className: "pill green" }, "Resolved"));
  } else if (closed) {
    badges.push(el("span", { className: "pill" }, "Closed"));
  } else if (active === true || m?.raw?.closed === false) {
    badges.push(el("span", { className: "pill green" }, "Active"));
  } else {
    badges.push(el("span", { className: "pill" }, "Status?"));
  }

  if (m?.enableOrderBook) badges.push(el("span", { className: "pill green" }, "Orderbook"));

  return badges;
}

function outcomePills(m: any) {
  const outs = parseJsonArray(m?.outcomesRaw);
  const prices = parseJsonArray(m?.outcomePricesRaw);

  if (!outs || !prices || outs.length !== prices.length) return el("span", { className: "muted" }, "—");

  const pills = el("div", { className: "row" });
  for (let i = 0; i < outs.length; i++) {
    const label = String(outs[i]);
    const p = Number(prices[i]);
    const pct = Number.isFinite(p) ? `${(p * 100).toFixed(1)}%` : "—";
    pills.append(el("span", { className: "pill" }, `${label} ${pct}`));
  }
  return pills;
}

async function renderMarkets() {
  const grid = el("div", { className: "grid" });

  const q = el("input", { placeholder: "Search markets… (question or slug)" }) as HTMLInputElement;

  const sortKeySelect = el(
    "select",
    {},
    el("option", { value: "volume" }, "Sort: Volume"),
    el("option", { value: "liquidity" }, "Sort: Liquidity"),
    el("option", { value: "endDate" }, "Sort: End date")
  ) as HTMLSelectElement;

  const sortDirToggle = el(
    "button",
    {
      className: "btn",
      onclick: () => {
        const v = sortDirToggle.getAttribute("data-dir") === "asc" ? "desc" : "asc";
        sortDirToggle.setAttribute("data-dir", v);
        sortDirToggle.textContent = v === "asc" ? "Asc" : "Desc";
        load();
      }
    },
    "Desc"
  );
  sortDirToggle.setAttribute("data-dir", "desc");

  const limit = slider("Limit", 50, 10, 200, 10, (n) => String(n), () => {});
  const limitInput = limit.querySelector("input") as HTMLInputElement;

  const tableWrap = el("div", { className: "section", style: "padding:0" });

  const table = el("table");
  const thead = el(
    "thead",
    {},
    el(
      "tr",
      {},
      el("th", {}, "Market"),
      el("th", {}, "Outcomes"),
      el("th", { className: "right" }, "Volume"),
      el("th", { className: "right" }, "Liquidity"),
      el("th", {}, "Status")
    )
  );
  const tbody = el("tbody");
  table.append(thead, tbody);
  tableWrap.append(table);

  async function load() {
    tbody.innerHTML = "";

    const query = q.value.trim();
    const lim = Number(limitInput.value);

    let data: any;
    try {
      data = await apiGet(`/polymarket/markets?query=${encodeURIComponent(query)}&limit=${encodeURIComponent(String(lim))}`);
    } catch (e: any) {
      tbody.append(el("tr", {}, el("td", { colSpan: 5, className: "muted" }, String(e?.message ?? e))));
      return;
    }

    let markets = (data?.markets ?? []) as any[];

    const sortKey = sortKeySelect.value;
    const dir = sortDirToggle.getAttribute("data-dir") === "asc" ? 1 : -1;

    markets = markets.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });

    for (const m of markets) {
      const slug = m.slug ?? m.id;

      const open = el(
        "button",
        {
          className: "btn",
          onclick: () => {
            location.hash = `#markets/${encodeURIComponent(slug)}`;
          }
        },
        "Open"
      );

      const marketCell = el(
        "div",
        {},
        el("div", {}, el("b", {}, m.question ?? "(no question)")),
        el("div", { className: "muted mono" }, slug),
        el("div", { className: "row", style: "margin-top:6px" }, open)
      );

      const statusCell = el("div", { className: "row" }, ...statusBadges(m));

      tbody.append(
        el(
          "tr",
          {},
          el("td", {}, marketCell),
          el("td", {}, outcomePills(m)),
          el("td", { className: "right" }, fmtCompact(m.volumeNum)),
          el("td", { className: "right" }, fmtCompact(m.liquidityNum)),
          el("td", {}, statusCell)
        )
      );
    }

    if (!markets.length) {
      tbody.append(el("tr", {}, el("td", { colSpan: 5, className: "muted" }, "No results.")));
    }
  }

  function sortValue(m: any, key: string) {
    if (key === "liquidity") return Number(m.liquidityNum ?? -1);
    if (key === "endDate") {
      const d = m?.raw?.endDateIso ?? m?.raw?.endDate ?? null;
      const t = d ? Date.parse(String(d)) : 0;
      return Number.isFinite(t) ? t : 0;
    }
    return Number(m.volumeNum ?? -1);
  }

  q.addEventListener("keydown", (e) => {
    if (e.key === "Enter") load();
  });
  limitInput.addEventListener("input", () => load());
  sortKeySelect.addEventListener("change", () => load());

  grid.append(
    card(
      "Markets",
      "Gamma markets (read-only)",
      icon("chart"),
      section(
        "Filters",
        `API: ${API_URL} (uses /polymarket/markets)`,
        icon("sliders"),
        el("div", { className: "row" }, q, sortKeySelect, sortDirToggle, limit)
      ),
      el("div", { style: "margin-top:12px" }, tableWrap)
    )
  );

  await load();
  return grid;
}

async function renderMarketDetail(slug: string) {
  const grid = el("div", { className: "grid" });

  const back = el("button", { className: "btn", onclick: () => (location.hash = "#markets") }, "Back");

  let m: any;
  try {
    m = await apiGet("/polymarket/market/" + encodeURIComponent(slug));
  } catch (e: any) {
    grid.append(card("Error", String(e?.message ?? e), icon("bell"), el("div", { className: "row" }, back)));
    return grid;
  }

  const bestBid = m.bestBid;
  const bestAsk = m.bestAsk;
  const mid = typeof bestBid === "number" && typeof bestAsk === "number" ? (bestBid + bestAsk) / 2 : null;
  const spread = typeof bestBid === "number" && typeof bestAsk === "number" ? (bestAsk - bestBid) : m.spread;

  const headerCards = el(
    "div",
    { className: "grid", style: "margin-top:12px" },
    el(
      "div",
      { className: "section span6" },
      el("div", { className: "muted" }, "Best Bid"),
      el("div", { style: "font-size:18px" }, fmtNum(bestBid, 4))
    ),
    el(
      "div",
      { className: "section span6" },
      el("div", { className: "muted" }, "Best Ask"),
      el("div", { style: "font-size:18px" }, fmtNum(bestAsk, 4))
    ),
    el(
      "div",
      { className: "section span6" },
      el("div", { className: "muted" }, "Mid"),
      el("div", { style: "font-size:18px" }, mid == null ? "—" : fmtNum(mid, 4))
    ),
    el(
      "div",
      { className: "section span6" },
      el("div", { className: "muted" }, "Spread"),
      el("div", { style: "font-size:18px" }, spread == null ? "—" : fmtNum(spread, 4))
    )
  );

  // Orderbooks
  const tokenIds = parseJsonArray(m.clobTokenIdsRaw) ?? [];

  const orderbookSection = el(
    "div",
    { className: "grid", style: "margin-top:12px" },
    el("div", { className: "muted" }, tokenIds.length ? "Orderbooks" : "Orderbook unavailable")
  );

  if (!tokenIds.length) {
    orderbookSection.append(el("div", { className: "muted" }, "Gamma did not provide clobTokenIds in a parseable format."));
  } else {
    const books = await Promise.all(
      tokenIds.slice(0, 2).map(async (id: any) => {
        try {
          return await apiGet("/polymarket/orderbook/" + encodeURIComponent(String(id)));
        } catch (e: any) {
          return { error: String(e?.message ?? e), assetId: String(id), bids: [], asks: [] };
        }
      })
    );

    for (const b of books) {
      const title = `token ${String(b.assetId).slice(0, 10)}…`;

      const bids = Array.isArray(b.bids) ? b.bids.slice(0, 10) : [];
      const asks = Array.isArray(b.asks) ? b.asks.slice(0, 10) : [];

      const bidsTable = renderLevelsTable(bids);
      const asksTable = renderLevelsTable(asks);

      orderbookSection.append(
        el(
          "div",
          { className: "grid" },
          el(
            "div",
            { className: "section span6" },
            el("div", { className: "row" }, el("b", {}, `${title} — Bids`), el("span", { className: "pill" }, `tick ${b.tickSize ?? "—"}`)),
            bidsTable
          ),
          el(
            "div",
            { className: "section span6" },
            el("div", { className: "row" }, el("b", {}, `${title} — Asks`), el("span", { className: "pill" }, `min ${b.minOrderSize ?? "—"}`)),
            asksTable
          )
        )
      );
    }
  }

  const debug = el(
    "details",
    { style: "margin-top:12px" },
    el("summary", {}, "Debug (IDs)")
  );
  debug.append(
    el("div", { className: "muted", style: "margin-top:10px" }, `conditionId: ${m.conditionId}`),
    el("div", { className: "muted mono" }, `clobTokenIdsRaw: ${m.clobTokenIdsRaw ?? "—"}`)
  );

  grid.append(
    card(
      m.question ?? "Market",
      m.slug ?? m.id,
      icon("chart"),
      el("div", { className: "row" }, back, ...statusBadges(m)),
      section("Overview", "Read-only (Gamma)", icon("book"), el("div", { className: "muted" }, m.description ?? ""), el("div", { style: "margin-top:10px" }, outcomePills(m))),
      headerCards,
      section("Orderbook", "Top 10 levels", icon("chart"), orderbookSection),
      section("Recent trades", "Not implemented (docs missing)", icon("bell"), el("div", { className: "muted" }, "Trades endpoint not implemented yet.")),
      debug
    )
  );

  return grid;
}

function renderLevelsTable(levels: any[]) {
  const table = el("table");
  const head = el("thead", {}, el("tr", {}, el("th", { className: "right" }, "Price"), el("th", { className: "right" }, "Size")));
  const body = el("tbody");

  for (const l of levels) {
    // Based on observed real response: { price: "0.001", size: "13794.14" }
    const price = l?.price ?? "—";
    const size = l?.size ?? "—";
    body.append(el("tr", {}, el("td", { className: "right mono" }, String(price)), el("td", { className: "right mono" }, String(size))));
  }

  if (!levels.length) body.append(el("tr", {}, el("td", { colSpan: 2, className: "muted" }, "No levels")));

  table.append(head, body);
  return table;
}

async function renderAnalytics() {
  const grid = el("div", { className: "grid" });

  const tools = [
    {
      name: "Polymarket Analytics",
      url: "https://polymarketanalytics.com",
      desc: "Market-wide analytics, trader dashboards, and whale activity.",
      tags: ["Whales", "Trader Stats", "Markets"]
    },
    {
      name: "PredictFolio",
      url: "https://predictfolio.com",
      desc: "PnL, win rates, and trader comparisons across Polymarket.",
      tags: ["PnL", "Win Rate", "Comparisons"]
    },
    {
      name: "PolymarketDash",
      url: "https://polymark.et",
      desc: "Aggregated Polymarket analytics and trader stats tools.",
      tags: ["Analytics", "Trader Stats"]
    }
  ];

  const cards = el(
    "div",
    { className: "grid" },
    ...tools.map((t) => {
      const open = el(
        "a",
        {
          href: t.url,
          target: "_blank",
          rel: "noopener noreferrer",
          className: "btn primary",
          style: "display:inline-flex; align-items:center; gap:8px;"
        },
        "Open tool →",
        icon("chart")
      );

      const tagRow = el("div", { className: "row", style: "margin-top:10px" }, ...t.tags.map((x) => el("span", { className: "pill" }, x)));

      return el(
        "div",
        { className: "card" },
        el(
          "div",
          { className: "cardHeader" },
          el("div", { className: "cardTitle" }, el("h2", {}, t.name), el("span", { className: "muted" }, "External tool")),
          open
        ),
        el("div", { className: "section" }, el("div", { className: "muted" }, t.desc), tagRow)
      );
    })
  );

  grid.append(
    card(
      "Analytics & Research",
      "External tools for whale tracking, insider research, and trader performance.",
      icon("chart"),
      el("div", { className: "muted", style: "margin-top:8px" }, "We intentionally link out instead of re-building analytics dashboards."),
      el("div", { style: "margin-top:12px" }, cards),
      el(
        "div",
        { className: "muted", style: "margin-top:12px" },
        "External tools are operated independently. Polystrat does not control or verify third-party analytics."
      )
    )
  );

  return grid;
}

async function renderWallets() {
  const grid = el("div", { className: "grid" });

  const msg = el("div", { className: "muted" }, "");

  async function refresh() {
    try {
      const j = await apiGet("/wallets");
      return j.wallets as any[];
    } catch (e: any) {
      msg.textContent = String(e?.message ?? e);
      return [];
    }
  }

  const listWrap = el("div", { className: "section" });

  async function renderList() {
    listWrap.innerHTML = "";
    const wallets = await refresh();

    if (!wallets.length) {
      listWrap.append(el("div", { className: "muted" }, "No linked wallets yet."));
      return;
    }

    const table = el("table");
    table.append(
      el("thead", {}, el("tr", {}, el("th", {}, "Chain"), el("th", {}, "Address"), el("th", {}, "Created"), el("th", {}, ""))),
      el(
        "tbody",
        {},
        ...wallets.map((w) => {
          const del = el(
            "button",
            {
              className: "btn danger",
              onclick: async () => {
                await apiDelete(`/wallets/${encodeURIComponent(w.id)}`);
                await renderList();
              }
            },
            "Remove"
          );
          return el(
            "tr",
            {},
            el("td", {}, String(w.chain)),
            el("td", { className: "mono" }, String(w.address)),
            el("td", {}, String(w.created_at ?? "")),
            el("td", {}, del)
          );
        })
      )
    );
    listWrap.append(table);
  }

  async function connectMetaMask() {
    msg.textContent = "Connecting MetaMask…";
    const eth = (window as any).ethereum;
    if (!eth) {
      msg.textContent = "MetaMask not detected (window.ethereum missing).";
      return;
    }

    const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
    const address = accounts?.[0];
    if (!address) {
      msg.textContent = "No account selected.";
      return;
    }

    const session = await getSession();
    const userId = session?.user?.id;

    const message = `polystrat wallet link\nuserId: ${userId}\nchain: evm\naddress: ${address}\nts: ${new Date().toISOString()}`;

    // personal_sign expects params [message, address]
    const signature: string = await eth.request({ method: "personal_sign", params: [message, address] });

    await apiPost("/wallets/link", { chain: "evm", address, message, signature });
    msg.textContent = "Linked EVM wallet.";
    await renderList();
  }

  async function connectPhantom() {
    msg.textContent = "Connecting Phantom…";
    const sol = (window as any).solana;
    if (!sol || !sol.isPhantom) {
      msg.textContent = "Phantom not detected (window.solana missing).";
      return;
    }

    const resp = await sol.connect();
    const address = String(resp?.publicKey?.toString?.() ?? sol.publicKey?.toString?.() ?? "");
    if (!address) {
      msg.textContent = "No Solana public key.";
      return;
    }

    const session = await getSession();
    const userId = session?.user?.id;

    const message = `polystrat wallet link\nuserId: ${userId}\nchain: sol\naddress: ${address}\nts: ${new Date().toISOString()}`;

    const encoded = new TextEncoder().encode(message);
    const signed = await sol.signMessage(encoded, "utf8");

    // signed.signature is Uint8Array
    const signature = Buffer.from(signed.signature).toString("base64");

    await apiPost("/wallets/link", { chain: "sol", address, message, signature });
    msg.textContent = "Linked Solana wallet.";
    await renderList();
  }

  grid.append(
    card(
      "Wallets",
      "Link wallets to your account (read-only)",
      icon("sliders"),
      section(
        "Connect",
        "No trading. No private keys stored.",
        icon("bot"),
        el(
          "div",
          { className: "row" },
          el("button", { className: "btn primary", onclick: connectMetaMask }, "Connect MetaMask (EVM)"),
          el("button", { className: "btn primary", onclick: connectPhantom }, "Connect Phantom (Solana)"),
          el("div", { className: "spacer" }),
          el("div", { className: "muted" }, "Sign a one-time message to prove ownership")
        ),
        el("div", { style: "margin-top:10px" }, msg)
      ),
      section("Linked wallets", "Stored in Supabase (RLS protected)", icon("book"), listWrap)
    )
  );

  await renderList();
  return grid;
}

async function renderCredits() {
  const box = card("Credits", "Attribution for loaded strategies", icon("book"));

  const body = el("div", { style: "margin-top:12px" });

  let strategies: any[] = [];
  try {
    strategies = await getStrategies();
  } catch (e: any) {
    body.append(el("div", { className: "muted" }, String(e?.message ?? e)));
    box.append(body);
    return el("div", { className: "grid" }, box);
  }

  const external = strategies.filter((s) => s.attribution?.sourceUrl && s.attribution.sourceUrl !== "(internal)");

  if (!external.length) {
    body.append(el("div", { className: "muted" }, "No external strategies loaded."));
  } else {
    const list = el("div", { className: "grid" });
    for (const s of external) {
      list.append(
        el(
          "div",
          { className: "section span6" },
          el("div", { className: "row" }, el("span", { className: "pill" }, String(s.attribution.license ?? "")), el("b", {}, String(s.name ?? s.id))),
          el("div", { className: "muted", style: "margin-top:6px" }, `by ${String(s.attribution.author ?? "")}`),
          el("div", { style: "margin-top:8px" }, el("a", { href: s.attribution.sourceUrl, target: "_blank" }, s.attribution.sourceUrl))
        )
      );
    }
    body.append(list);
  }

  box.append(body);
  return el("div", { className: "grid" }, box);
}

async function render() {
  app.innerHTML = "";

  const route = (location.hash || "#dashboard").replace("#", "");
  const session = await getSession();
  const email = session?.user?.email ?? null;

  // Routes that don't require auth
  if (route === "login") {
    app.append(topbar({ email, gateAllowed: null }));
    app.append(el("div", { style: "margin-top:10px" }, renderLogin(el)));
    return;
  }

  // Must be signed in for most routes
  const protectedRoutes = ["markets", "analytics", "wallets", "traders", "bot-config", "notifications", "dashboard"]; // credits is harmless
  const isProtected = protectedRoutes.some((p) => route === p || route.startsWith(p + "/"));
  if (isProtected && !session) {
    location.hash = "#login";
    app.append(topbar({ email, gateAllowed: null }));
    app.append(el("div", { style: "margin-top:10px" }, renderLogin(el)));
    return;
  }

  // Token gate (platform access): allow login + credits + wallets, but block platform features
  // Token gate (temporarily disabled by default server-side). If the API says allowed=true, we treat it as open.
  const gate = await getGateStatus();
  const allowed = gate?.allowed ?? null;

  const gatedRoutes = ["markets", "analytics", "traders", "bot-config", "notifications", "dashboard"];
  const isGatedRoute = gatedRoutes.some((p) => route === p || route.startsWith(p + "/"));

  if (session && isGatedRoute && allowed === false) {
    location.hash = "#access-required";
  }

  if (route === "access-required") {
    app.append(topbar({ email, gateAllowed: allowed }));
    app.append(el("div", { style: "margin-top:10px" }, renderAccessRequired(el, gate?.reason)));
    return;
  }

  app.append(topbar({ email, gateAllowed: allowed }));

  const content = el("div", { style: "margin-top:10px" });
  app.append(content);

  try {
    if (route === "bot-config") content.append(renderBotConfig());
    else if (route === "notifications") content.append(renderNotifications());
    else if (route === "credits") content.append(await renderCredits());
    else if (route === "analytics") content.append(await renderAnalytics());
    else if (route === "wallets") content.append(await renderWallets());
    else if (route === "markets") content.append(await renderMarkets());
    else if (route.startsWith("markets/")) {
      const slug = decodeURIComponent(route.slice("markets/".length));
      content.append(await renderMarketDetail(slug));
    }
    else if (route === "traders") content.append(await renderTraders());
    else if (route.startsWith("traders/")) {
      const address = decodeURIComponent(route.slice("traders/".length));
      content.append(await renderTraderDetail(address));
    } else content.append(await renderDashboard());
  } catch (e: any) {
    content.append(el("div", { className: "card" }, el("div", { className: "muted" }, String(e?.message ?? e))));
  }
}

window.addEventListener("hashchange", () => render());
render();
