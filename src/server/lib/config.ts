import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const ConfigSchema = z.object({
  mode: z.enum(['dry-run', 'live']).default('dry-run'),
  ui: z.object({
    port: z.number().int().positive().default(3188),
    bind: z.string().default('127.0.0.1')
  }),
  feeds: z.object({
    clobWsUrl: z.string().url(),
    clobUserWsUrl: z.string().url().default('wss://ws-subscriptions-clob.polymarket.com/ws/user'),
    gammaBaseUrl: z.string().url().default('https://gamma-api.polymarket.com')
  }),
  paper: z.object({
    bankrollUsd: z.number().positive().default(85)
  }).default({ bankrollUsd: 85 }),
  autostart: z.boolean().default(true),
  limits: z.object({
    maxUsdcPerTrade: z.number().positive().default(1),
    maxOpenOrders: z.number().int().nonnegative().default(2),
    cooldownMs: z.number().int().nonnegative().default(15000)
  }),
  strategy: z.object({
    kind: z.enum(['btc5m', 'casino-no', 'sum-to-one', 'maker']).default('btc5m'),
    enabled: z.boolean().default(true),
    enabledStrategies: z.object({
      casinoNo: z.boolean().default(false),
      btc5m: z.boolean().default(true)
    }).default({ casinoNo: false, btc5m: true }),
    minEdgeUsd: z.number().nonnegative().default(0.03),
    casinoNo: z.object({
      minNoPrice: z.number().min(0).max(1).default(0.98),
      maxHoursToClose: z.number().positive().default(24),
      maxConcurrentPositions: z.number().int().positive().default(10)
    }).default({ minNoPrice: 0.98, maxHoursToClose: 24, maxConcurrentPositions: 10 }),
    btc5m: z.object({
      enabled: z.boolean().default(true),
      autoFollow: z.boolean().default(true),
      seriesId: z.number().int().positive().default(10684),
      eventSlug: z.string().default('btc-updown-5m-1771297500'),
      minLagPct: z.number().min(0).max(1).default(0.0015),
      indexSource: z.enum(['coinbase','binance']).default('coinbase'),
      maxEntryPrice: z.number().min(0).max(1).default(0.65),
      minModelEdge: z.number().min(0).max(1).default(0.02)
    }).default({ enabled: true, autoFollow: true, seriesId: 10684, eventSlug: 'btc-updown-5m-1771297500', minLagPct: 0.0015 }),
    watch: z.object({
      marketIds: z.array(z.string()).default([]),
      autoTopN: z.number().int().min(0).max(200).default(0)
    })
  }),
  storage: z.object({
    dir: z.string().default('./data')
  })
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(cwd: string): AppConfig {
  const configPath = path.join(cwd, 'config.json');
  const raw = fs.readFileSync(configPath, 'utf-8');
  const parsed = JSON.parse(raw);
  return ConfigSchema.parse(parsed);
}
