type Me = { ok: boolean; userId: string; solAddress: string };

type Strategy = {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  attribution?: null | { author: string; license: string; sourceUrl: string };
  configSchema?: any;
  status?: any;
};

type TrackedWallet = { id: string; chain: string; address: string; paused: boolean; created_at: number };

type PaperStatus = { userId: string; running: boolean; lastTickTs: number | null; lastError: string | null };

type PnlSnapshot = { ts: number; total_usd: number };

const API_URL = localStorage.getItem("apiUrl") ?? "http://localhost:3399";
const app = document.querySelector<HTMLDivElement>("#app")!;

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

function card(title: string, subtitle: string, leftIcon?: Node, ...children: Node[]) {
  return el(
    "div",
    { className: "card" },
    el(
      "div",
      { className: "cardHeader" },
      el("div", { className: "cardTitle" }, leftIcon ?? el("span"), el("h2", {}, title)),
      el("div", { className: "muted" }, subtitle)
    ),
    ...children
  );
}

function appShell(opts: { solAddress?: string | null }, content: Node) {
  const route = (location.hash || "#dashboard").replace("#", "");

  const titleMap: Record<string, string> = {
    dashboard: "Dashboard",
    wallets: "Tracked Wallets",
    login: "Login"
  };
  const baseRoute = route.split("/")[0];
  const title = titleMap[baseRoute] ?? "Polystrat";

  const navItem = (hash: string, label: string, kind: Parameters<typeof icon>[0]) => {
    const active = route === hash.replace("#", "") || route.startsWith(hash.replace("#", "") + "/");
    return el(
      "button",
      {
        className: `navItem ${active ? "navItemOn" : ""}`,
        onclick: () => {
          location.hash = hash;
          render();
        }
      },
      icon(kind),
      el("span", {}, label)
    );
  };

  const sidebar = el(
    "aside",
    { className: "sidebar" },
    el(
      "div",
      { className: "sideBrand" },
      el("div", { className: "sideLogo" }, "P"),
      el("div", {}, el("div", { className: "sideTitle" }, "polystrat"), el("div", { className: "muted" }, "token gated"))
    ),
    el("div", { className: "sideSection" }, navItem("#dashboard", "Dashboard", "chart"), navItem("#wallets", "Wallet Manager", "sliders")),
    el(
      "div",
      { className: "sideFooter" },
      el("div", { className: "muted" }, opts.solAddress ? `wallet: ${opts.solAddress.slice(0, 4)}…${opts.solAddress.slice(-4)}` : "not logged in"),
      el(
        "button",
        {
          className: "btn",
          style: "margin-top:10px; width:100%",
          onclick: async () => {
            await apiPost("/auth/logout", {});
            location.hash = "#login";
            render();
          }
        },
        "Logout"
      )
    )
  );

  const header = el(
    "header",
    { className: "header" },
    el("div", { className: "headerTitle" }, el("h1", {}, title), el("div", { className: "muted" }, "paper-first, no private keys")),
    el("div", { className: "row" }, el("span", { className: "pill" }, "PAPER"))
  );

  return el("div", { className: "appShell" }, sidebar, el("main", { className: "main" }, header, el("div", { className: "mainInner" }, content)));
}

async function apiGet(path: string) {
  const r = await fetch(`${API_URL}${path}`, { credentials: "include" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `api ${path}: ${r.status}`);
  return j;
}

async function apiPost(path: string, body: any) {
  const r = await fetch(`${API_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `api ${path}: ${r.status}`);
  return j;
}

async function apiDelete(path: string) {
  const r = await fetch(`${API_URL}${path}`, { method: "DELETE", credentials: "include" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `api ${path}: ${r.status}`);
  return j;
}

async function getMe(): Promise<Me | null> {
  try {
    const j = (await apiGet("/me")) as any;
    return j as Me;
  } catch {
    return null;
  }
}

async function renderLogin() {
  const msg = el("div", { className: "muted", style: "margin-top:10px" }, "");

  async function connectPhantomAndLogin() {
    msg.textContent = "Connecting Phantom…";
    const sol = (window as any).solana;
    if (!sol || !sol.isPhantom) {
      msg.textContent = "Phantom not detected.";
      return;
    }

    const resp = await sol.connect();
    const address = String(resp?.publicKey?.toString?.() ?? sol.publicKey?.toString?.() ?? "");
    if (!address) {
      msg.textContent = "No Solana public key.";
      return;
    }

    msg.textContent = "Requesting nonce…";
    const n = await apiPost("/auth/nonce", { address });

    msg.textContent = "Signing message…";
    const encoded = new TextEncoder().encode(String(n.message));
    const signed = await sol.signMessage(encoded, "utf8");
    const sigBytes: Uint8Array = signed.signature;
    const signature = btoa(String.fromCharCode(...sigBytes));

    msg.textContent = "Verifying…";
    await apiPost("/auth/verify", { address, signature });

    msg.textContent = "Logged in.";
    location.hash = "#dashboard";
    render();
  }

  return el(
    "div",
    {},
    card(
      "Token-gated login",
      "Connect wallet + sign nonce. No keys. No .env pasting.",
      icon("sliders"),
      el(
        "div",
        { style: "margin-top:12px" },
        el("button", { className: "btn primary", onclick: connectPhantomAndLogin }, "Connect Phantom + Login"),
        msg
      )
    )
  );
}

async function renderWalletManager() {
  const msg = el("div", { className: "muted" }, "");
  const input = el("input", { type: "text", placeholder: "Comma separated addresses", style: "width: min(720px, 90vw)" }) as HTMLInputElement;

  const listWrap = el("div", { className: "section", style: "margin-top:12px" });

  async function refresh() {
    listWrap.innerHTML = "";
    msg.textContent = "";
    const j = await apiGet("/tracked-wallets");
    const wallets = (j.wallets ?? []) as TrackedWallet[];

    if (!wallets.length) {
      listWrap.append(el("div", { className: "muted" }, "No tracked wallets yet."));
      return;
    }

    const table = el("table");
    table.append(
      el("thead", {}, el("tr", {}, el("th", {}, "Chain"), el("th", {}, "Address"), el("th", {}, "Paused"), el("th", {}, ""))),
      el(
        "tbody",
        {},
        ...wallets.map((w) => {
          const pauseBtn = el(
            "button",
            {
              className: "btn",
              onclick: async () => {
                await apiPost(`/tracked-wallets/${encodeURIComponent(w.id)}/pause`, { paused: !w.paused });
                await refresh();
              }
            },
            w.paused ? "Unpause" : "Pause"
          );
          const delBtn = el(
            "button",
            {
              className: "btn danger",
              onclick: async () => {
                await apiDelete(`/tracked-wallets/${encodeURIComponent(w.id)}`);
                await refresh();
              }
            },
            "Remove"
          );

          return el("tr", {}, el("td", {}, w.chain), el("td", { className: "mono" }, w.address), el("td", {}, String(w.paused)), el("td", {}, el("div", { className: "row" }, pauseBtn, delBtn)));
        })
      )
    );
    listWrap.append(table);
  }

  async function addMany() {
    const raw = input.value;
    const addrs = raw
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

    if (!addrs.length) return;

    msg.textContent = "Adding…";
    for (const a of addrs) {
      // MVP: assume EVM for 0x…, else sol
      const chain = a.startsWith("0x") ? "evm" : "sol";
      try {
        await apiPost("/tracked-wallets", { chain, address: a });
      } catch (e: any) {
        // ignore duplicates
        msg.textContent = String(e?.message ?? e);
      }
    }
    input.value = "";
    msg.textContent = "Done.";
    await refresh();
  }

  const ui = el(
    "div",
    {},
    card(
      "Wallet tracking manager",
      "Add/remove tracked wallets. Pause/unpause is respected by the paper runner.",
      icon("book"),
      el("div", { style: "margin-top:12px" }, el("div", { className: "row" }, input, el("button", { className: "btn primary", onclick: addMany }, "Add"))),
      el("div", { style: "margin-top:10px" }, msg),
      listWrap
    )
  );

  await refresh();
  return ui;
}

async function renderDashboard(me: Me) {
  const grid = el("div", { className: "grid" });

  // Strategies list
  let strategies: Strategy[] = [];
  try {
    const j = await apiGet("/strategies");
    strategies = (j.strategies ?? []) as Strategy[];
  } catch (e: any) {
    strategies = [];
    grid.append(card("Strategies", "", icon("chart"), el("div", { className: "muted" }, String(e?.message ?? e))));
  }

  const stratList = el(
    "div",
    { className: "section", style: "margin-top:12px" },
    ...(strategies.length
      ? strategies.map((s) =>
          el(
            "div",
            { className: "row", style: "justify-content:space-between; padding: 10px 0; border-bottom: '1px solid var(--border)'" },
            el("div", {}, el("b", {}, s.name), el("div", { className: "muted" }, s.description ?? "")),
            el(
              "button",
              {
                className: "btn",
                onclick: () => {
                  alert(`Strategy ${s.id} wiring: start/stop via runner already exists; paper runner loop is separate in v1.`);
                }
              },
              "View"
            )
          )
        )
      : [el("div", { className: "muted" }, "No strategies loaded.")])
  );

  // Paper runner controls + PnL
  const statusPre = el("pre", { textContent: "loading…" });
  const pnlPre = el("pre", { textContent: "loading…" });

  async function refreshPaper() {
    const st = await apiGet("/paper/status");
    statusPre.textContent = JSON.stringify(st, null, 2);
    const pnl = await apiGet("/paper/pnl");
    pnlPre.textContent = JSON.stringify(pnl, null, 2);
  }

  const startBtn = el("button", {
    className: "btn primary",
    onclick: async () => {
      await apiPost("/paper/start", {});
      await refreshPaper();
    }
  }, "Start paper runner");

  const stopBtn = el("button", {
    className: "btn danger",
    onclick: async () => {
      await apiPost("/paper/stop", {});
      await refreshPaper();
    }
  }, "Stop");

  const refreshBtn = el("button", {
    className: "btn",
    onclick: refreshPaper
  }, "Refresh");

  grid.append(
    card("Strategies", "Loaded from runner metadata", icon("bot"), stratList),
    card(
      "Paper runner",
      "Simulated loop. No private keys. Produces PnL snapshots.",
      icon("chart"),
      el("div", { className: "row", style: "margin-top:12px" }, startBtn, stopBtn, refreshBtn),
      el("div", { className: "grid", style: "margin-top:12px" },
        el("div", { className: "section span6" }, el("div", { className: "muted" }, "Status"), el("div", { style: "margin-top:8px" }, statusPre)),
        el("div", { className: "section span6" }, el("div", { className: "muted" }, "PnL snapshots"), el("div", { style: "margin-top:8px" }, pnlPre))
      )
    )
  );

  await refreshPaper();
  return grid;
}

async function render() {
  app.innerHTML = "";
  const route = (location.hash || "#dashboard").replace("#", "");

  const me = await getMe();
  if (!me && route !== "login") {
    location.hash = "#login";
  }

  if (route === "login") {
    const content = await renderLogin();
    app.append(appShell({ solAddress: me?.solAddress ?? null }, content));
    return;
  }

  if (!me) {
    const content = await renderLogin();
    app.append(appShell({ solAddress: null }, content));
    return;
  }

  let content: Node;
  if (route === "wallets") content = await renderWalletManager();
  else content = await renderDashboard(me);

  app.append(appShell({ solAddress: me.solAddress }, content));
}

window.addEventListener("hashchange", () => render());
render();
