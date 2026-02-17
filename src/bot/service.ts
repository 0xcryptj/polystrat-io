import type { AppConfig } from '../server/lib/config.js';
import type { FileStore } from '../server/lib/store.js';
import WebSocket from 'ws';
import { fetchTopMarkets } from './gamma.js';
import { PaperLedger, computeUnrealizedPnl } from '../server/lib/paper_multi.js';
import type { TierKey } from '../server/lib/paper_multi.js';
import { findCasinoNoCandidates } from './strategy_casino_no.js';
import { MarketCache } from './market_cache.js';
import { fetchEventBySlug } from './gamma_slug.js';
import { fetchCurrentBtc5mEventByTime } from './gamma_autofollow_btc5m.js';
import { fetchBookTop } from './clob_book.js';
import { startBinanceBtcPrice } from './binance_ws.js';
import { fetchBinanceBtcPrice } from './binance_rest.js';
import { startCoinbaseBtcPrice } from './coinbase_ws.js';
import { fetchCoinbaseBtcUsdPrice } from './coinbase_rest.js';
import { Btc5mSeries } from './btc5m_series.js';

type Opportunity = {
  tsMs: number;
  marketId?: string;
  yesPrice?: number;
  noPrice?: number;
  sumPrice?: number;
  edgeUsd?: number;
  note?: string;
};

type Status = {
  running: boolean;
  mode: 'dry-run' | 'live';
  ws: { connected: boolean; url: string };
  limits: { maxUsdcPerTrade: number; cooldownMs: number };
};

export class BotService {
  private config: AppConfig;
  private store: FileStore;

  private wsMarket: WebSocket | null = null;
  private wsUser: WebSocket | null = null;
  private userBackoffMs = 2000;
  private userConnecting = false;
  private running = false;
  private connected = false;
  private lastActionMs = 0;

  // best prices per tokenId
  private best: Map<string, { bid?: number; ask?: number; bidSize?: number; askSize?: number; tsMs: number }> = new Map();

  // conditionId -> [yesTokenId,noTokenId]
  private pairs: Map<string, [string, string]> = new Map();

  private ledgers: Record<TierKey, PaperLedger>;
  private cache: MarketCache;
  private equityTimer: NodeJS.Timeout | null = null;
  private binance: { stop(): void } | null = null;
  private btcIndex: { tsMs: number; price: number } | null = null;
  private btcPolymarket: { upAsk?: number; downAsk?: number; upAskSize?: number; downAskSize?: number; tsMs?: number } = {};
  private btcEvent: { slug: string; conditionId: string; question: string; endDate?: string; upToken: string; downToken: string } | null = null;
  private btcFollowTimer: NodeJS.Timeout | null = null;
  private btcStartPrice: number | null = null;
  private btcStartTsMs: number | null = null;
  private btcSeries: Btc5mSeries;
  private btcSeriesTimer: NodeJS.Timeout | null = null;
  private btcTradeTimer: NodeJS.Timeout | null = null;
  private btcIndexPollTimer: NodeJS.Timeout | null = null;
  private btcBookPollTimer: NodeJS.Timeout | null = null;

  private pending: Map<string, {
    tier: TierKey;
    eventSlug: string;
    tokenId: string;
    outcome: 'UP'|'DOWN';
    limitPx: number;
    sizeUsd: number;
    expiryIso?: string;
    tsCreatedMs: number;
  }> = new Map();

  constructor(opts: { config: AppConfig; store: FileStore }) {
    this.config = opts.config;
    this.store = opts.store;
    // Market cache for human-readable labels
    this.cache = new MarketCache(this.store.dir);

    // Three paper ledgers, each starts at $85 per your request
    const start = this.config.paper.bankrollUsd;
    this.ledgers = {
      t1: new PaperLedger(this.store.dir, { tier: 't1', betUsd: 1, bankrollStartUsd: start }),
      t2: new PaperLedger(this.store.dir, { tier: 't2', betUsd: 2, bankrollStartUsd: start }),
      t5: new PaperLedger(this.store.dir, { tier: 't5', betUsd: 5, bankrollStartUsd: start })
    };

    this.btcSeries = new Btc5mSeries(this.store.dir);
  }

  getStatus(): Status {
    return {
      running: this.running,
      mode: this.config.mode,
      ws: { connected: this.connected, url: this.config.feeds.clobWsUrl },
      limits: {
        maxUsdcPerTrade: this.config.limits.maxUsdcPerTrade,
        cooldownMs: this.config.limits.cooldownMs
      }
    };
  }

  getRecentOpportunities(): Opportunity[] {
    // Filter out noisy book-tick spam; keep only meaningful derived opportunities.
    const items = this.store.listRecentOpportunities(500)
      .filter((op) => !(op.note && String(op.note).toLowerCase().includes('book update')))
      .filter((op) => !(op.note && String(op.note).toLowerCase().includes('book tick')));

    // Dedupe by marketId+prices so UI doesn't become a slot machine.
    const seen = new Set<string>();
    const out: Opportunity[] = [];
    for (const op of items) {
      const key = `${op.marketId ?? ''}|${op.yesPrice ?? ''}|${op.noPrice ?? ''}|${op.sumPrice ?? ''}|${op.note ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(op);
      if (out.length >= 200) break;
    }
    return out;
  }

  getPaperOverview() {
    const tiers: any = {};
    for (const k of Object.keys(this.ledgers) as TierKey[]) {
      const l = this.ledgers[k];
      const unreal = computeUnrealizedPnl(l, (tokenId) => this.best.get(tokenId)?.bid);
      const realized = l
        .listPositions()
        .filter((p) => p.status === 'closed' && typeof p.realizedPnlUsd === 'number')
        .reduce((a, p) => a + (p.realizedPnlUsd ?? 0), 0);
      const total = realized + unreal;
      const closed = l.listPositions().filter((p) => p.status === 'closed');
      const wins = closed.filter((p) => (p.realizedPnlUsd ?? 0) > 0).length;
      const wr = closed.length ? (wins / closed.length) * 100 : null;

      tiers[k] = {
        betUsd: l.betUsd,
        bankrollStartUsd: l.getState().bankrollStartUsd,
        bankrollUsd: l.getState().bankrollUsd,
        openPositions: l.openCount(),
        unrealizedPnlUsd: unreal,
        realizedPnlUsd: realized,
        totalPnlUsd: total,
        winRatePct: wr
      };
    }
    return { tiers };
  }

  getPaperTiers() {
    return Object.keys(this.ledgers);
  }

  getPaperPositions(tier: TierKey) {
    const items = this.ledgers[tier].listPositions();
    return items.map((p) => {
      const markBid = this.best.get(p.tokenId)?.bid;
      const unrealizedPnlUsd = (p.status === 'open' && typeof markBid === 'number' && Number.isFinite(markBid))
        ? (p.sizeUsd * markBid - p.sizeUsd)
        : undefined;
      const expMs = p.expiryIso ? new Date(p.expiryIso).getTime() : undefined;
      const expired = (p.status === 'open' && typeof expMs === 'number' && Number.isFinite(expMs) && Date.now() > expMs);
      return { ...p, markBid, unrealizedPnlUsd, expired };
    });
  }

  getPaperEquity(tier: TierKey) {
    return this.ledgers[tier].readEquity(500);
  }

  getBtc5mState() {
    return {
      event: this.btcEvent,
      startPrice: this.btcStartPrice,
      index: this.btcIndex,
      book: this.btcPolymarket
    };
  }

  getBtc5mSeries(limit = 600) {
    return { items: this.btcSeries.tail(limit) };
  }

  getExposure(): Array<{ marketId: string; outcome: string; status: string; openedAtMs: number }> {
    return this.store.listExposure(200).map((r) => ({
      marketId: r.marketId,
      outcome: r.outcome,
      status: r.status,
      openedAtMs: r.openedAtMs
    }));
  }

  getMarketCache() {
    return this.cache.listAll();
  }

  /** Aggregated dashboard stats for a tier (KPI cards, PNL distribution, etc.) */
  getDashboardStats(tier: TierKey) {
    const l = this.ledgers[tier];
    const unreal = computeUnrealizedPnl(l, (tokenId) => this.best.get(tokenId)?.bid);
    const positions = l.listPositions();
    const closed = positions.filter((p) => p.status === 'closed');
    const realized = closed
      .filter((p) => typeof p.realizedPnlUsd === 'number')
      .reduce((a, p) => a + (p.realizedPnlUsd ?? 0), 0);
    const totalPnl = realized + unreal;
    const wins = closed.filter((p) => (p.realizedPnlUsd ?? 0) > 0).length;
    const losses = closed.filter((p) => (p.realizedPnlUsd ?? 0) < 0).length;
    const winRate = closed.length ? (wins / closed.length) * 100 : null;

    const pnlValues = closed
      .map((p) => p.realizedPnlUsd)
      .filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
    const avgWin = wins > 0
      ? pnlValues.filter((x) => x > 0).reduce((a, b) => a + b, 0) / wins
      : 0;
    const avgLoss = losses > 0
      ? pnlValues.filter((x) => x < 0).reduce((a, b) => a + b, 0) / losses
      : 0;
    const largestWin = pnlValues.length ? Math.max(...pnlValues.filter((x) => x > 0), 0) : 0;
    const largestLoss = pnlValues.length ? Math.min(...pnlValues.filter((x) => x < 0), 0) : 0;

    const start = l.getState().bankrollStartUsd;
    const roi = start > 0 ? (totalPnl / start) * 100 : 0;

    return {
      balance: l.getState().bankrollUsd + unreal,
      startBalance: start,
      totalPnl,
      roi,
      winRate,
      totalTrades: positions.length,
      closedPositions: closed.length,
      wins,
      losses,
      openPositions: l.openCount(),
      avgWin,
      avgLoss,
      largestWin,
      largestLoss,
      avgPnlPerTrade: closed.length ? realized / closed.length : 0,
      pnlDistribution: pnlValues
    };
  }

  /** Trade log entries (BUY at open, SELL at close) for UI */
  getTradeLog(tier: TierKey, limit = 100) {
    const positions = this.ledgers[tier].listPositions();
    const entries: Array<{ tsMs: number; action: 'BUY' | 'SELL'; outcome: string; price: number; sizeUsd: number; pnl?: number; market?: string }> = [];
    for (const p of positions) {
      const outcome = p.outcomeLabel === 'UP' ? 'YES_UP' : p.outcomeLabel === 'DOWN' ? 'YES_DOWN' : (p.outcomeLabel ?? 'YES');
      entries.push({
        tsMs: p.tsOpenMs,
        action: 'BUY',
        outcome,
        price: p.price,
        sizeUsd: p.sizeUsd,
        market: p.question
      });
      if (p.status === 'closed' && p.tsCloseMs) {
        entries.push({
          tsMs: p.tsCloseMs,
          action: 'SELL',
          outcome,
          price: p.closePrice ?? 0,
          sizeUsd: p.sizeUsd,
          pnl: p.realizedPnlUsd,
          market: p.question
        });
      }
    }
    entries.sort((a, b) => b.tsMs - a.tsMs);
    return entries.slice(0, limit);
  }

  /** Active markets (from pairs + cache) for dashboard */
  getActiveMarkets() {
    const out: Array<{ conditionId: string; question?: string }> = [];
    for (const [condId] of this.pairs) {
      const c = this.cache.get(condId);
      out.push({ conditionId: condId, question: c?.question });
    }
    return out;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Pick what to watch.
    // - casino-no: choose candidates via Gamma and subscribe to their YES+NO tokenIds
    // - otherwise: optionally auto-pick topN
    if (!this.config.strategy.watch.marketIds.length) {
      // Ensure BTC 5m market is subscribed (live event)
      if (this.config.strategy.btc5m.enabled) {
        await this.refreshBtc5mEvent();
      }
      try {
        if (this.config.strategy.enabledStrategies.casinoNo && this.config.strategy.kind === 'casino-no') {
          const cands = await findCasinoNoCandidates(this.config);
          for (const c of cands) {
            this.pairs.set(c.conditionId, [c.yesToken, c.noToken]);
            this.cache.upsert({
              conditionId: c.conditionId,
              question: c.question,
              yesTokenId: c.yesToken,
              noTokenId: c.noToken,
              outcomes: ['Yes', 'No'],
              endDate: c.endDate
            });

            for (const tier of Object.keys(this.ledgers) as TierKey[]) {
              const l = this.ledgers[tier];
              if (l.hasOpen(c.conditionId)) continue;
              if (!l.canOpen(l.betUsd)) continue;
              l.open({
                id: `${tier}:${c.conditionId}:${Date.now()}`,
                tsOpenMs: Date.now(),
                conditionId: c.conditionId,
                question: c.question,
                tokenId: c.noToken,
                outcomeLabel: 'NO',
                expiryIso: c.endDate,
                side: 'buy',
                price: c.noPrice,
                sizeUsd: l.betUsd,
                note: c.question
              });
            }
          }

          const tokens: string[] = [];
          for (const [, pair] of this.pairs) tokens.push(pair[0], pair[1]);
          this.config.strategy.watch.marketIds = Array.from(new Set(tokens));
          // eslint-disable-next-line no-console
          console.log(`[casino-no] candidates=${cands.length} subscribing tokens=${this.config.strategy.watch.marketIds.length}`);

          // start equity sampling
          if (!this.equityTimer) {
            this.equityTimer = setInterval(() => this.sampleEquity(), 5000);
          }
        } else if (this.config.strategy.watch.autoTopN > 0) {
          const top = await fetchTopMarkets({
            gammaBaseUrl: this.config.feeds.gammaBaseUrl,
            limit: this.config.strategy.watch.autoTopN
          });

          for (const m of top as any[]) {
            const [a, b] = m.tokenIds as [string, string];
            this.pairs.set(m.conditionId, [a, b]);
          }

          const tokens: string[] = [];
          for (const [, pair] of this.pairs) tokens.push(pair[0], pair[1]);
          this.config.strategy.watch.marketIds = Array.from(new Set(tokens));
          // eslint-disable-next-line no-console
          console.log(`[gamma] autoTopN=${top.length} -> subscribing tokens=${this.config.strategy.watch.marketIds.length}`);
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.log('[gamma] selection failed:', String(e));
      }
    }

    // Start BTC index feed (for btc5m strategy)
    if (this.config.strategy.btc5m.enabled) {
      const onTick = (t: { tsMs: number; price: number }) => {
        this.btcIndex = t;
        if (this.btcStartPrice === null) {
          this.btcStartPrice = t.price;
          this.btcStartTsMs = Date.now();
        }
      };

      if (this.config.strategy.btc5m.indexSource === 'binance') {
        this.binance = startBinanceBtcPrice(onTick);
        // REST fallback (some VPNs block Binance)
        if (!this.btcIndexPollTimer) {
          this.btcIndexPollTimer = setInterval(async () => {
            if (this.btcIndex && Date.now() - this.btcIndex.tsMs < 5_000) return;
            const p = await fetchBinanceBtcPrice();
            if (p === undefined) return;
            onTick({ tsMs: Date.now(), price: p });
          }, 1000);
        }
      } else {
        // default: coinbase
        this.binance = startCoinbaseBtcPrice(onTick);
      }
    }

    this.connectMarketWs();
    // Follow BTC 5m (auto-updates event slug)
    if (this.config.strategy.btc5m.enabled && this.config.strategy.btc5m.autoFollow) {
      this.btcFollowTimer = setInterval(() => this.refreshBtc5mEvent().catch(() => {}), 30_000);
      this.refreshBtc5mEvent().catch(() => {});
    }

    // Series sampler for chart (append point every second)
    if (!this.btcSeriesTimer) {
      this.btcSeriesTimer = setInterval(() => this.sampleBtcSeries(), 1000);
    }

    // Equity sampling (drives dashboard balance chart)
    if (!this.equityTimer) {
      this.equityTimer = setInterval(() => this.sampleEquity(), 2000);
    }

    // BTC orderbook poller (Polymarket REST book endpoint) - ensures we have live bid/ask even if WS is weird.
    if (!this.btcBookPollTimer) {
      this.btcBookPollTimer = setInterval(() => {
        this.pollBtcBook().catch(() => {});
      }, 1000);
    }

    // Trading loop (paper positions)
    if (!this.btcTradeTimer) {
      this.btcTradeTimer = setInterval(() => {
        this.tickBtcPaperTrading().catch(() => {});
      }, 3000);
    }

    // user WS is noisy; keep disabled in paper for now
    // this.connectUserWs();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.connected = false;
    if (this.equityTimer) {
      clearInterval(this.equityTimer);
      this.equityTimer = null;
    }
    if (this.binance) {
      this.binance.stop();
      this.binance = null;
    }
    if (this.btcFollowTimer) {
      clearInterval(this.btcFollowTimer);
      this.btcFollowTimer = null;
    }
    if (this.btcSeriesTimer) {
      clearInterval(this.btcSeriesTimer);
      this.btcSeriesTimer = null;
    }
    if (this.btcTradeTimer) {
      clearInterval(this.btcTradeTimer);
      this.btcTradeTimer = null;
    }
    if (this.btcIndexPollTimer) {
      clearInterval(this.btcIndexPollTimer);
      this.btcIndexPollTimer = null;
    }
    if (this.btcBookPollTimer) {
      clearInterval(this.btcBookPollTimer);
      this.btcBookPollTimer = null;
    }
    this.pending.clear();

    const closeWs = (ws: WebSocket | null) => {
      if (!ws) return;
      ws.removeAllListeners();
      try {
        ws.close();
      } catch {}
    };

    closeWs(this.wsMarket);
    closeWs(this.wsUser);
    this.wsMarket = null;
    this.wsUser = null;
  }

  private connectMarketWs() {
    const url = this.config.feeds.clobWsUrl;
    this.wsMarket = new WebSocket(url);

    this.wsMarket.on('open', () => {
      this.connected = true;
      // eslint-disable-next-line no-console
      console.log('[ws/market] connected', url);

      const assets = this.config.strategy.watch.marketIds;
      if (assets.length) {
        const sub = { type: 'market', assets_ids: assets };
        this.wsMarket?.send(JSON.stringify(sub));
        // eslint-disable-next-line no-console
        console.log('[ws/market] subscribed', assets.length, 'assets');
      } else {
        // eslint-disable-next-line no-console
        console.log('[ws/market] no assets configured yet (config.strategy.watch.marketIds).');
      }
    });

    this.wsMarket.on('message', (data) => {
      if (!this.running) return;
      this.handleWsMessage(data.toString());
    });

    this.wsMarket.on('close', () => {
      this.connected = false;
      if (this.running) setTimeout(() => this.connectMarketWs(), 1000);
    });

    this.wsMarket.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.log('[ws/market] error', String(err));
    });
  }

  private async refreshBtc5mEvent() {
    try {
      const requestedSlug = this.config.strategy.btc5m.eventSlug;
      const ev = this.config.strategy.btc5m.autoFollow
        ? await fetchCurrentBtc5mEventByTime({ gammaBaseUrl: this.config.feeds.gammaBaseUrl })
        : await fetchEventBySlug({ gammaBaseUrl: this.config.feeds.gammaBaseUrl, slug: requestedSlug });

      const tokenIds = (ev as any).tokenIds as string[] | undefined;
      if (!tokenIds || tokenIds.length < 2) return;

      const [up, down] = tokenIds as [string, string];
      const resolvedSlug = (ev as any).slug ?? requestedSlug;

      const next = {
        slug: resolvedSlug,
        conditionId: (ev as any).conditionId,
        question: (ev as any).question,
        endDate: (ev as any).endDate,
        upToken: up,
        downToken: down
      };

      const changed = !this.btcEvent || this.btcEvent.upToken !== next.upToken || this.btcEvent.downToken !== next.downToken;
      this.btcEvent = next;

      if (changed) {
        // reset 5m window start anchor
        this.btcStartPrice = this.btcIndex?.price ?? null;
        this.btcStartTsMs = Date.now();
      }

      // cache for UI (keyed by slug)
      this.cache.upsert({ conditionId: resolvedSlug, question: ev.question, yesTokenId: up, noTokenId: down, outcomes: ev.outcomes, endDate: ev.endDate });
      // keep config updated so UI reflects the current event
      this.config.strategy.btc5m.eventSlug = resolvedSlug;

      // ensure subscribed
      this.pairs.set(ev.conditionId, [up, down]);

      // Reset BTC book state
      this.btcPolymarket = {};

      // If market WS is already open, re-subscribe by reconnecting (simplest, avoids growing subscriptions)
      if (changed && this.wsMarket) {
        try { this.wsMarket.close(); } catch {}
      }

      // Ensure watch list includes these tokens
      const tokens = new Set(this.config.strategy.watch.marketIds);
      tokens.add(up);
      tokens.add(down);
      this.config.strategy.watch.marketIds = Array.from(tokens);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('[btc5m] refresh failed', String(e));
    }
  }

  private connectUserWs() {
    if (this.userConnecting) return;
    if (this.wsUser && (this.wsUser.readyState === WebSocket.OPEN || this.wsUser.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const apiKey = process.env.POLYMARKET_API_KEY;
    const secret = process.env.POLYMARKET_API_SECRET;
    const passphrase = process.env.POLYMARKET_API_PASSPHRASE;
    if (!apiKey || !secret || !passphrase) {
      // eslint-disable-next-line no-console
      console.log('[ws/user] creds missing; skipping user WS');
      return;
    }

    this.userConnecting = true;
    const url = this.config.feeds.clobUserWsUrl;
    const ws = new WebSocket(url);
    this.wsUser = ws;

    ws.on('open', () => {
      this.userConnecting = false;
      this.userBackoffMs = 2000;
      // eslint-disable-next-line no-console
      console.log('[ws/user] connected', url);

      const authMsg: any = {
        type: 'user',
        auth: { apiKey, secret, passphrase }
      };
      ws.send(JSON.stringify(authMsg));
      // eslint-disable-next-line no-console
      console.log('[ws/user] auth sent');
    });

    ws.on('message', (data) => {
      // eslint-disable-next-line no-console
      console.log('[ws/user] msg', data.toString().slice(0, 300));
    });

    ws.on('close', (code, reason) => {
      this.userConnecting = false;
      // eslint-disable-next-line no-console
      console.log('[ws/user] closed', code, reason?.toString?.() ?? '');

      if (!this.running) return;
      const wait = this.userBackoffMs;
      this.userBackoffMs = Math.min(this.userBackoffMs * 2, 30000);
      setTimeout(() => this.connectUserWs(), wait);
    });

    ws.on('error', (err) => {
      this.userConnecting = false;
      // eslint-disable-next-line no-console
      console.log('[ws/user] error', String(err));
    });
  }

  private handleWsMessage(raw: string) {
    // v0: just attempt to parse JSON and look for obvious yes/no best prices.
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    // Polymarket market channel emits messages like: { event_type: 'book', asset_id, bids, asks, ... }
    // We'll handle that shape first.
    const assetId = msg.asset_id ?? msg.assetId;
    const eventType = msg.event_type ?? msg.type;

    if ((eventType === 'book' || msg.bids || msg.asks) && assetId) {
      // WS may emit bids/asks as arrays of [price,size] or objects {price,size}
      const firstBid = Array.isArray(msg.bids) && msg.bids.length ? msg.bids[0] : undefined;
      const firstAsk = Array.isArray(msg.asks) && msg.asks.length ? msg.asks[0] : undefined;
      const bestBid = firstBid ? Number(Array.isArray(firstBid) ? firstBid[0] : firstBid.price) : undefined;
      const bestAsk = firstAsk ? Number(Array.isArray(firstAsk) ? firstAsk[0] : firstAsk.price) : undefined;
      const bestBidSize = firstBid ? Number(Array.isArray(firstBid) ? firstBid[1] : firstBid.size) : undefined;
      const bestAskSize = firstAsk ? Number(Array.isArray(firstAsk) ? firstAsk[1] : firstAsk.size) : undefined;

      // With only one assetId (YES token), we can't compute YES+NO yet.
      // We'll record best bid/ask and later pair with the opposite tokenId for true sum-to-one.
      if (Number.isFinite(bestBid) || Number.isFinite(bestAsk)) {
        // NOTE: do not spam opportunities for every book tick.
        // We only record paired-edge opportunities (sum-to-one) and/or strategy decisions.
        const op: Opportunity = {
          tsMs: Date.now(),
          marketId: String(assetId),
          yesPrice: Number.isFinite(bestBid) ? bestBid : undefined,
          noPrice: undefined,
          sumPrice: undefined,
          edgeUsd: undefined,
          note: 'book tick'
        };
        // store best prices
        this.best.set(String(assetId), { bid: bestBid, ask: bestAsk, bidSize: bestBidSize, askSize: bestAskSize, tsMs: Date.now() });

        // Track BTC 5m Up/Down token asks for lag checks (if this asset belongs)
        if (this.btcEvent) {
          if (String(assetId) === this.btcEvent.upToken) {
            this.btcPolymarket.upAsk = bestAsk;
            this.btcPolymarket.upAskSize = bestAskSize;
          }
          if (String(assetId) === this.btcEvent.downToken) {
            this.btcPolymarket.downAsk = bestAsk;
            this.btcPolymarket.downAskSize = bestAskSize;
          }
          this.btcPolymarket.tsMs = Date.now();
        }

        // If we can find a paired token, compute naive sum-to-one edge using asks (cost to buy both).
        for (const [cond, pair] of this.pairs) {
          if (pair[0] === String(assetId) || pair[1] === String(assetId)) {
            const a = this.best.get(pair[0]);
            const b = this.best.get(pair[1]);
            if (a?.ask !== undefined && b?.ask !== undefined) {
              const sum = a.ask + b.ask;
              const edge = 1 - sum;
              if (edge >= this.config.strategy.minEdgeUsd) {
                const op2: Opportunity = {
                  tsMs: Date.now(),
                  marketId: cond,
                  yesPrice: a.ask,
                  noPrice: b.ask,
                  sumPrice: sum,
                  edgeUsd: edge,
                  note: 'sum-to-one using asks (fees NOT included)'
                };
                this.recordOpportunity(op2);
                this.maybeAct(op2);
              }
            }
            break;
          }
        }

        // intentionally not recording `op` to avoid UI spam
      }
      return;
    }

    // Fallback: legacy heuristic
    const marketId = msg.marketId ?? msg.market_id ?? msg.market;
    const yes = msg.yes?.best ?? msg.bestYes ?? msg.best_yes ?? msg.best_yes_price;
    const no = msg.no?.best ?? msg.bestNo ?? msg.best_no ?? msg.best_no_price;

    if (typeof yes === 'number' && typeof no === 'number') {
      const sum = yes + no;
      const edge = 1 - sum; // naive, ignores fees

      if (edge >= this.config.strategy.minEdgeUsd) {
        const op: Opportunity = {
          tsMs: Date.now(),
          marketId,
          yesPrice: yes,
          noPrice: no,
          sumPrice: sum,
          edgeUsd: edge,
          note: 'heuristic sum-to-one (fees NOT included)'
        };
        this.recordOpportunity(op);
        this.maybeAct(op);
      }
    }
  }

  private recordOpportunity(op: Opportunity) {
    this.store.appendOpportunity(op);
  }

  private sampleBtcSeries() {
    if (!this.btcEvent) return;
    const upAsk = this.btcPolymarket.upAsk;
    const downAsk = this.btcPolymarket.downAsk;
    const impliedUp = typeof upAsk === 'number' ? upAsk : undefined;
    const impliedDown = typeof downAsk === 'number' ? downAsk : undefined;
    const sumAsk = (impliedUp !== undefined && impliedDown !== undefined) ? impliedUp + impliedDown : undefined;
    const sumEdge = sumAsk !== undefined ? 1 - sumAsk : undefined;

    const indexPrice = this.btcIndex?.price;
    const start = this.btcStartPrice ?? undefined;
    const deltaPct = (indexPrice !== undefined && start !== undefined) ? (indexPrice - start) / start : undefined;

    this.btcSeries.append({
      tsMs: Date.now(),
      eventSlug: this.btcEvent.slug,
      endDate: this.btcEvent.endDate,
      indexPrice,
      indexStartPrice: start,
      indexDeltaPct: deltaPct,
      upAsk,
      downAsk,
      impliedUp,
      impliedDown,
      sumAsk,
      sumEdge
    });
  }

  private async pollBtcBook() {
    if (!this.btcEvent) return;
    const up = this.btcEvent.upToken;
    const down = this.btcEvent.downToken;

    const [upTop, downTop] = await Promise.all([
      fetchBookTop({ tokenId: up, timeoutMs: 2500 }),
      fetchBookTop({ tokenId: down, timeoutMs: 2500 })
    ]);

    if (upTop) {
      const prev = this.best.get(up) ?? { tsMs: 0 };
      this.best.set(up, { ...prev, bid: upTop.bid, ask: upTop.ask, bidSize: upTop.bidSize, askSize: upTop.askSize, tsMs: upTop.tsMs });
      if (typeof upTop.ask === 'number') {
        this.btcPolymarket.upAsk = upTop.ask;
        this.btcPolymarket.upAskSize = upTop.askSize;
      }
    }

    if (downTop) {
      const prev = this.best.get(down) ?? { tsMs: 0 };
      this.best.set(down, { ...prev, bid: downTop.bid, ask: downTop.ask, bidSize: downTop.bidSize, askSize: downTop.askSize, tsMs: downTop.tsMs });
      if (typeof downTop.ask === 'number') {
        this.btcPolymarket.downAsk = downTop.ask;
        this.btcPolymarket.downAskSize = downTop.askSize;
      }
    }

    this.btcPolymarket.tsMs = Date.now();
  }

  private async tickBtcPaperTrading() {
    if (!this.config.strategy.btc5m.enabled) return;
    if (!this.btcEvent) return;
    if (!this.btcIndex || !Number.isFinite(this.btcIndex.price)) return;
    if (this.btcStartPrice === null || !Number.isFinite(this.btcStartPrice)) return;

    const upAsk = this.btcPolymarket.upAsk;
    const downAsk = this.btcPolymarket.downAsk;
    if (!Number.isFinite(upAsk) || !Number.isFinite(downAsk)) return;

    // implied probability from asks (rough)
    const impliedUp = upAsk as number;
    const impliedDown = downAsk as number;

    // index-derived directional bias from start of window
    const deltaPct = (this.btcIndex.price - this.btcStartPrice) / this.btcStartPrice;

    // very simple mapping: bias ranges [-0.25, +0.25]
    const bias = Math.max(-0.25, Math.min(0.25, deltaPct * 50));
    const modelUp = 0.5 + bias;

    const lag = modelUp - impliedUp;
    const absLag = Math.abs(lag);
    if (absLag < this.config.strategy.btc5m.minLagPct) return;

    const side: 'UP' | 'DOWN' = lag > 0 ? 'UP' : 'DOWN';
    const tokenId = side === 'UP' ? this.btcEvent.upToken : this.btcEvent.downToken;
    // Use the actual best ask at the time of placement (not a stale sampled value)
    const entryPx = this.best.get(tokenId)?.ask ?? (side === 'UP' ? impliedUp : impliedDown);

    // Don't buy garbage prices like 0.99 unless model is basically 99% sure.
    const pModel = side === 'UP' ? modelUp : (1 - modelUp);
    const modelEdge = pModel - entryPx;
    if (entryPx > this.config.strategy.btc5m.maxEntryPrice) return;
    if (modelEdge < this.config.strategy.btc5m.minModelEdge) return;

    // Instead of instant fills, place a paper limit order and fill only if the live ask crosses.
    for (const tier of Object.keys(this.ledgers) as TierKey[]) {
      const l = this.ledgers[tier];
      const key = `${tier}:${this.btcEvent.slug}`;
      const posKey = `${this.btcEvent.slug}:${tier}`;
      if (l.hasOpen(posKey)) continue;
      if (this.pending.has(key)) continue;
      if (!l.canOpen(l.betUsd)) continue;

      // limit price = min(maxEntryPrice, model price - edge cushion)
      const maxPx = this.config.strategy.btc5m.maxEntryPrice;
      const cushion = this.config.strategy.btc5m.minModelEdge;
      const limitPx = Math.max(0.01, Math.min(maxPx, pModel - cushion));

      this.pending.set(key, {
        tier,
        eventSlug: this.btcEvent.slug,
        tokenId,
        outcome: side,
        limitPx,
        sizeUsd: l.betUsd,
        expiryIso: this.btcEvent.endDate,
        tsCreatedMs: Date.now()
      });
    }

    // Attempt to fill pending orders using live asks
    for (const [key, o] of Array.from(this.pending.entries())) {
      if (!this.btcEvent) break;
      if (o.eventSlug !== this.btcEvent.slug) continue;
      const l = this.ledgers[o.tier];
      const posKey = `${o.eventSlug}:${o.tier}`;
      if (l.hasOpen(posKey)) {
        this.pending.delete(key);
        continue;
      }

      const ask = this.best.get(o.tokenId)?.ask;
      if (typeof ask !== 'number' || !Number.isFinite(ask)) continue;
      if (ask > o.limitPx) continue;

      if (!l.canOpen(o.sizeUsd)) {
        this.pending.delete(key);
        continue;
      }

      l.open({
        id: `${o.tier}:${o.eventSlug}:${Date.now()}`,
        tsOpenMs: Date.now(),
        conditionId: posKey,
        question: `${this.btcEvent.question} (${o.outcome})`,
        tokenId: o.tokenId,
        outcomeLabel: o.outcome,
        expiryIso: o.expiryIso,
        side: 'buy',
        price: ask,
        sizeUsd: o.sizeUsd,
        startIndexPrice: this.btcStartPrice ?? undefined,
        note: `LIMIT fill ask=${ask.toFixed(3)} <= ${o.limitPx.toFixed(3)} model=${pModel.toFixed(3)}`
      });

      this.pending.delete(key);
    }

    // resolve positions after expiry using index start vs end (binary settlement)
    // NOTE: do NOT mark-to-market at bid on expiry; that can be wildly wrong for binary payouts.
    const now = Date.now();
    for (const tier of Object.keys(this.ledgers) as TierKey[]) {
      const l = this.ledgers[tier];
      for (const p of l.listPositions()) {
        if (p.status !== 'open') continue;
        if (!p.expiryIso) continue;
        const expMs = new Date(p.expiryIso).getTime();
        if (!Number.isFinite(expMs)) continue;
        // small grace period so we have a post-expiry index tick
        if (now < expMs + 1000) continue;

        const start = p.startIndexPrice;
        // Prefer a captured post-expiry index point (stable across restarts)
        let end = this.btcSeries.firstIndexAfter(expMs + 1000);
        // Fallback to current index tick
        if (end === undefined) end = this.btcIndex?.price;
        // Final fallback: one-shot REST price
        if (end === undefined) end = await fetchCoinbaseBtcUsdPrice();

        if (!Number.isFinite(start as any) || !Number.isFinite(end as any)) continue;

        let outcome: 'UP' | 'DOWN' | undefined;
        if (p.outcomeLabel === 'UP' || p.outcomeLabel === 'DOWN') outcome = p.outcomeLabel;
        // If we ever use YES/NO style here, we'd map differently.
        if (!outcome) continue;

        const d = (end as number) - (start as number);
        if (d === 0) {
          l.resolveBinary(p.id, { won: false, push: true, startIndexPrice: start as number, endIndexPrice: end as number });
        } else {
          const won = (d > 0 && outcome === 'UP') || (d < 0 && outcome === 'DOWN');
          l.resolveBinary(p.id, { won, startIndexPrice: start as number, endIndexPrice: end as number });
        }
      }
    }
  }

  private sampleEquity() {
    for (const tier of Object.keys(this.ledgers) as TierKey[]) {
      const l = this.ledgers[tier];
      const unreal = computeUnrealizedPnl(l, (tokenId) => this.best.get(tokenId)?.bid);
      const realized = l
        .listPositions()
        .filter((p) => p.status === 'closed' && typeof p.realizedPnlUsd === 'number')
        .reduce((a, p) => a + (p.realizedPnlUsd ?? 0), 0);
      const total = realized + unreal;
      l.appendEquity({ tsMs: Date.now(), bankrollUsd: l.getState().bankrollUsd, unrealizedPnlUsd: unreal, totalPnlUsd: total });
    }
  }

  private maybeAct(op: Opportunity) {
    // BTC 5m signals (paper)
    if (this.config.strategy.btc5m.enabled && this.btcEvent && this.btcIndex && this.btcPolymarket.upAsk !== undefined && this.btcPolymarket.downAsk !== undefined) {
      const pUp = this.btcPolymarket.upAsk;
      const pDown = this.btcPolymarket.downAsk;
      const sum = pUp + pDown;
      const edge = 1 - sum;
      if (edge > 0.02) {
        this.recordOpportunity({ tsMs: Date.now(), marketId: this.btcEvent.slug, yesPrice: pUp, noPrice: pDown, sumPrice: sum, edgeUsd: edge, note: 'btc5m sum-to-one anomaly (asks)' });
      }
    }

    const now = Date.now();
    if (now - this.lastActionMs < this.config.limits.cooldownMs) return;

    // strict no-repeat rule: if exposure exists for this market/outcome, do nothing.
    // (In arb you'd need both sides, but for now we enforce the guard infrastructure.)
    if (!op.marketId) return;

    // This is intentionally conservative until we wire real order placement.
    this.lastActionMs = now;

    // eslint-disable-next-line no-console
    console.log(`[bot] opportunity market=${op.marketId} edge=${op.edgeUsd?.toFixed(4)} mode=${this.config.mode}`);

    if (this.config.mode === 'dry-run') return;

    // LIVE MODE TODO:
    // - compute fee-adjusted edge
    // - place paired orders with FOK/IOC if supported
    // - reconcile fills; if partial, hedge/close
    throw new Error('live mode not implemented yet');
  }
}
