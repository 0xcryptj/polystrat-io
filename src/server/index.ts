import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './lib/config.js';
import { FileStore } from './lib/store.js';
import { BotService } from '../bot/service.js';
import { fetchMarketBySlug } from '../bot/gamma_market_slug.js';
import { fetchEventBySlug } from '../bot/gamma_slug.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = loadConfig(process.cwd());
const store = new FileStore(path.join(process.cwd(), config.storage.dir));

const bot = new BotService({ config, store });

const app = express();
app.use(express.json());

const BUILD = {
  version: process.env.npm_package_version ?? '0.1.0',
  startedAtIso: new Date().toISOString()
};

// --- UI ---
app.get('/', (_req, res) => {
  // Serve UI from source path so it works in both tsx (src) and dist builds.
  res.sendFile(path.join(process.cwd(), 'src', 'ui', 'index.html'));
});

// --- API ---
app.get('/api/build', (_req, res) => {
  res.json(BUILD);
});

app.get('/api/status', (_req, res) => {
  res.json(bot.getStatus());
});

app.get('/api/markets/cache', (_req, res) => {
  res.json({ items: bot.getMarketCache() });
});

app.get('/api/gamma/market/:slug', async (req, res) => {
  try {
    const market = await fetchMarketBySlug({
      gammaBaseUrl: config.feeds.gammaBaseUrl,
      slug: req.params.slug
    });
    res.json(market);
  } catch (e) {
    res.status(404).json({ error: String(e) });
  }
});

app.get('/api/gamma/event/:slug', async (req, res) => {
  try {
    const event = await fetchEventBySlug({
      gammaBaseUrl: config.feeds.gammaBaseUrl,
      slug: req.params.slug
    });
    res.json(event);
  } catch (e) {
    res.status(404).json({ error: String(e) });
  }
});

app.post('/api/bot/start', async (_req, res) => {
  // Don't block the HTTP response on long startup work (Gamma scans, price checks, etc.)
  bot.start().catch((e) => console.error('[bot.start] failed', e));
  res.json({ ok: true });
});

app.post('/api/bot/stop', async (_req, res) => {
  await bot.stop();
  res.json({ ok: true });
});

app.get('/api/opportunities', (_req, res) => {
  res.json({ items: bot.getRecentOpportunities() });
});

app.get('/api/exposure', (_req, res) => {
  res.json({ items: bot.getExposure() });
});

app.get('/api/paper', (_req, res) => {
  res.json(bot.getPaperOverview());
});

app.get('/api/paper/tiers', (_req, res) => {
  res.json({ tiers: bot.getPaperTiers() });
});

app.get('/api/paper/positions', (req, res) => {
  const tier = String(req.query.tier ?? 't1');
  res.json({ items: bot.getPaperPositions(tier as any) });
});

app.get('/api/paper/equity', (req, res) => {
  const tier = String(req.query.tier ?? 't1');
  res.json({ items: bot.getPaperEquity(tier as any) });
});

app.get('/api/btc5m/state', (_req, res) => {
  res.json(bot.getBtc5mState());
});

app.get('/api/btc5m/series', (req, res) => {
  const limit = Number(req.query.limit ?? 600);
  res.json(bot.getBtc5mSeries(Number.isFinite(limit) ? limit : 600));
});

app.get('/api/dashboard', (req, res) => {
  const tier = String(req.query.tier ?? 't5') as 't1' | 't2' | 't5';
  res.json(bot.getDashboardStats(tier));
});

app.get('/api/dashboard/trades', (req, res) => {
  const tier = String(req.query.tier ?? 't5') as 't1' | 't2' | 't5';
  const limit = Number(req.query.limit ?? 100);
  res.json({ items: bot.getTradeLog(tier, limit) });
});

app.get('/api/dashboard/active-markets', (_req, res) => {
  res.json({ items: bot.getActiveMarkets() });
});

app.listen(config.ui.port, config.ui.bind, () => {
  // eslint-disable-next-line no-console
  console.log(`Polymarket Bot UI: http://${config.ui.bind}:${config.ui.port}`);

  if (config.autostart) {
    bot.start().catch((e) => console.error('[autostart] bot.start failed', e));
  }
});
