import 'dotenv/config';
import blessed from 'blessed';
import contrib from 'blessed-contrib';

const API = 'http://127.0.0.1:3188';

type Tier = 't1' | 't2' | 't5';
let currentTier: Tier = 't1';

async function getJson(path: string) {
  const res = await fetch(API + path);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

function fmt(n: any, d = 2) {
  const x = Number(n);
  return Number.isFinite(x) ? x.toFixed(d) : '—';
}

function pnlColor(n: any) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '{gray-fg}—{/gray-fg}';
  if (x > 0) return `{green-fg}+${x.toFixed(4)}{/green-fg}`;
  if (x < 0) return `{red-fg}${x.toFixed(4)}{/red-fg}`;
  return `{yellow-fg}${x.toFixed(4)}{/yellow-fg}`;
}

const screen = blessed.screen({ smartCSR: true, title: 'Polymarket Bot TUI' });

// hotkeys
screen.key(['escape', 'q', 'C-c'], () => process.exit(0));
screen.key(['1'], () => { currentTier = 't1'; });
screen.key(['2'], () => { currentTier = 't2'; });
screen.key(['5'], () => { currentTier = 't5'; });

const grid = new contrib.grid({ rows: 12, cols: 12, screen });

const header = grid.set(0, 0, 2, 12, blessed.box, {
  label: 'Status (keys: 1/2/5 tier, q quit)',
  tags: true,
  border: 'line',
  style: { border: { fg: 'cyan' } }
});

const equityLine = grid.set(2, 0, 5, 8, contrib.line, {
  label: 'Equity (cash + unrealized) · current tier',
  showLegend: false,
  border: 'line',
  style: { border: { fg: 'cyan' } },
  wholeNumbersOnly: false
});

const btcLine = grid.set(2, 8, 5, 4, contrib.line, {
  label: 'BTC5m probs (ask)',
  showLegend: false,
  border: 'line',
  style: { border: { fg: 'cyan' } },
  wholeNumbersOnly: false,
  minY: 0,
  maxY: 1
});

const posTable = grid.set(7, 0, 5, 12, contrib.table, {
  label: 'Positions (open + recent) · current tier',
  border: 'line',
  style: { border: { fg: 'cyan' }, header: { fg: 'cyan', bold: true } },
  columnSpacing: 1,
  columnWidth: [11, 5, 9, 6, 6, 9, 9, 26]
});

function setHeaderContent(opts: {
  running: boolean;
  ws: boolean;
  slug: string;
  end: string;
  start: any;
  idx: any;
  deltaPct: any;
  upAsk: any;
  upSz: any;
  downAsk: any;
  downSz: any;
  tierStats: any;
}) {
  const t = opts.tierStats ?? {};
  const cash = fmt(t.bankrollUsd, 2);
  const unreal = pnlColor(t.unrealizedPnlUsd);
  const realized = pnlColor(t.realizedPnlUsd);
  const total = pnlColor(t.totalPnlUsd);
  const wr = (t.winRatePct == null) ? '—' : `${Number(t.winRatePct).toFixed(1)}%`;

  const deltaStr = (opts.deltaPct == null || !Number.isFinite(Number(opts.deltaPct)))
    ? '{gray-fg}—{/gray-fg}'
    : (Number(opts.deltaPct) >= 0 ? `{green-fg}${Number(opts.deltaPct).toFixed(3)}%{/green-fg}` : `{red-fg}${Number(opts.deltaPct).toFixed(3)}%{/red-fg}`);

  header.setContent(
    `{bold}Bot:{/bold} ${opts.running ? '{green-fg}RUNNING{/green-fg}' : '{red-fg}STOPPED{/red-fg}'}  ` +
    `{bold}WS:{/bold} ${opts.ws ? '{green-fg}connected{/green-fg}' : '{red-fg}disconnected{/red-fg}'}  ` +
    `{bold}Tier:{/bold} {bold}${currentTier}{/bold}  ` +
    `{bold}Cash:{/bold} ${cash}  {bold}Unreal:{/bold} ${unreal}  {bold}Real:{/bold} ${realized}  {bold}Total:{/bold} ${total}  {bold}WR:{/bold} ${wr}\n` +
    `{bold}Event:{/bold} ${opts.slug}  {bold}Ends:{/bold} ${opts.end}\n` +
    `{bold}Price to beat:{/bold} ${fmt(opts.start, 2)}  {bold}Index:{/bold} ${fmt(opts.idx, 2)}  {bold}Δ:{/bold} ${deltaStr}  ` +
    `{bold}UpAsk:{/bold} ${fmt(opts.upAsk, 3)} (sz ${fmt(opts.upSz, 0)})  {bold}DownAsk:{/bold} ${fmt(opts.downAsk, 3)} (sz ${fmt(opts.downSz, 0)})`
  );
}

async function tick() {
  const status = await getJson('/api/status');
  const paper = await getJson('/api/paper');
  const tierStats = paper?.tiers?.[currentTier];

  const btc = await getJson('/api/btc5m/state');
  const series = await getJson('/api/btc5m/series?limit=90');
  const eq = await getJson(`/api/paper/equity?tier=${currentTier}`);
  const pos = await getJson(`/api/paper/positions?tier=${currentTier}`);

  const slug = btc?.event?.slug ?? 'n/a';
  const end = btc?.event?.endDate ? new Date(btc.event.endDate).toLocaleTimeString() : 'n/a';
  const idx = btc?.index?.price;
  const start = btc?.startPrice;
  const deltaPct = (start != null && idx != null) ? ((Number(idx) - Number(start)) / Number(start)) * 100 : null;

  setHeaderContent({
    running: !!status.running,
    ws: !!status.ws.connected,
    slug,
    end,
    start,
    idx,
    deltaPct,
    upAsk: btc?.book?.upAsk,
    upSz: btc?.book?.upAskSize,
    downAsk: btc?.book?.downAsk,
    downSz: btc?.book?.downAskSize,
    tierStats
  });

  // Equity chart
  const eqItems = (eq.items || []).slice(-120);
  const eqX = eqItems.map((p: any) => new Date(p.tsMs).toLocaleTimeString());
  const eqY = eqItems.map((p: any) => (Number(p.bankrollUsd || 0) + Number(p.unrealizedPnlUsd || 0)));
  equityLine.setData([{ title: 'Equity', x: eqX, y: eqY, style: { line: 'green' } }]);

  // BTC prob chart (asks)
  const sItems = (series.items || []).slice(-90);
  const sx = sItems.map((p: any) => new Date(p.tsMs).toLocaleTimeString());
  const upY = sItems.map((p: any) => (typeof p.impliedUp === 'number' ? p.impliedUp : null));
  const downY = sItems.map((p: any) => (typeof p.impliedDown === 'number' ? p.impliedDown : null));
  btcLine.setData([
    { title: 'UP', x: sx, y: upY, style: { line: 'cyan' } },
    { title: 'DOWN', x: sx, y: downY, style: { line: 'red' } }
  ]);

  // Positions table (show open first, then recent)
  const items = (pos.items || []) as any[];
  items.sort((a, b) => {
    const ao = a.status === 'open' ? 0 : 1;
    const bo = b.status === 'open' ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return (b.tsOpenMs || 0) - (a.tsOpenMs || 0);
  });

  const now = Date.now();
  const rows: string[][] = [];
  for (const p of items.slice(0, 15)) {
    const opened = p.tsOpenMs ? new Date(p.tsOpenMs).toLocaleTimeString() : '—';
    const side = String(p.outcomeLabel ?? '').slice(0, 6);
    const entry = fmt(p.price, 3);
    const mark = (p.markBid == null) ? '—' : fmt(p.markBid, 3);

    const uNum = (p.unrealizedPnlUsd == null) ? null : Number(p.unrealizedPnlUsd);
    const rNum = (p.realizedPnlUsd == null) ? null : Number(p.realizedPnlUsd);
    const u = (uNum == null || !Number.isFinite(uNum)) ? '—' : uNum.toFixed(4);
    const r = (rNum == null || !Number.isFinite(rNum)) ? '—' : rNum.toFixed(4);

    const expMs = p.expiryIso ? new Date(p.expiryIso).getTime() : null;
    let ttl = '—';
    if (expMs != null && Number.isFinite(expMs)) {
      const sec = Math.floor((expMs - now) / 1000);
      ttl = sec >= 0 ? `${sec}s` : `EXPR`;
    }

    const st = p.status === 'closed'
      ? (p.result ? `closed/${p.result}` : 'closed')
      : (ttl === 'EXPR' ? 'open/expired' : 'open');

    const q = String(p.question ?? '').slice(0, 24);

    rows.push([opened, side, ttl, entry, mark, u, r, `${st} ${q}`]);
  }

  (posTable as any).setData({
    headers: ['Opened', 'Side', 'TTL', 'Entry', 'Bid', 'Unrl', 'Real', 'Status/Q'],
    data: rows
  });

  screen.render();
}

async function loop() {
  try {
    await tick();
  } catch (e: any) {
    header.setContent(`{red-fg}Error:{/red-fg} ${String(e?.message ?? e)}`);
    screen.render();
  } finally {
    setTimeout(loop, 1000);
  }
}

void loop();
