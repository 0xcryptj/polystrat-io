# Competitor Spec (Public Info Only)

> Strict rule: This doc is compiled **only** from publicly accessible pages.
> No scraping protected endpoints, no paywall bypass, no login-required content.

## Competitors Reviewed

### 1) Polymarket Trading Bot
- Name: Polymarket Trading Bot
- URL: https://www.polytradingbot.net/
- Date reviewed: 2026-02-03

### 2) Squawkr Backtester
- Name: Squawkr (Backtester)
- URL: https://squawkr.xyz/backtest
- Date reviewed: 2026-02-03

---

## Summary

### Polymarket Trading Bot (polytradingbot.net)
Public landing page positions this as an **AI-powered Polymarket trading bot** with **non-custodial** wallet connection, **multi-strategy** support, “sub-150ms” execution claims, and dashboards for performance tracking. It advertises built-in strategies (trend, mean reversion, arbitrage, volume, event-driven, multi-strategy portfolio) plus **backtesting** and alerts (email/Telegram depending on plan).

### Squawkr (squawkr.xyz)
Public page is a simple **Polymarket backtester / copy trading tester** flow: measure connection speed, pick category/timeframe/strategy (implied), and a “Copy Trading Tester” where you input a wallet address and simulate following that user’s historical trades.

---

## User Journey (High Level)

### Polymarket Trading Bot
1. Landing page with value props + “Launch Trading Bot” (leads to login)
2. Connect wallet (claims MetaMask + WalletConnect)
3. Select a pre-built strategy (or customize on higher tier)
4. Configure risk parameters / position sizing
5. Activate and monitor via real-time dashboards
6. Receive alerts; stop/adjust parameters anytime

### Squawkr Backtester
1. Landing page → “Start”
2. Backtest page
3. Optional: “Test” connection speed
4. Copy trading tester: enter wallet address → fetch trade history (implied) → simulate following

---

## Feature Inventory (Publicly Described)

### Strategy Controls
- Start/stop bots
- Multi-strategy / portfolio approach (explicit)
- “Smart position sizing” (explicit)
- Risk management called out (stop-loss / position sizing / diversification) but specifics not detailed publicly

### Monitoring / Observability
- Real-time performance tracking: P&L, win rates (explicit)
- Live dashboards / analytics (explicit)
- Alerts/notifications:
  - Email alerts (Basic)
  - Email + Telegram alerts (Advanced)
  - “Multi-channel alerts” (Pro)

### Backtesting / Optimization
- Strategy backtesting promoted on landing page
- Advanced/Pro tiers explicitly include backtesting
- Squawkr provides “copy trading tester” backtest flow based on a wallet address

### Security / Custody
- “Secure & Non-Custodial” (explicit)
- “Keys stay with you — we never have custody” (explicit)
- Mentions encrypted connections and “regular security audits” (explicit, no details linked)

### Pricing / Gating
Polytradingbot lists subscription tiers:
- Basic: $99/mo — 1 active bot, 3 pre-built strategies, basic analytics, email alerts
- Advanced: $299/mo — 5 active bots, all strategies + custom building, advanced analytics/reporting, email+Telegram alerts, backtesting
- Pro: $499/mo — unlimited bots, all strategies + API access, premium analytics, multi-channel alerts, advanced backtesting, white glove support

Squawkr pricing not present on the public page snippet we reviewed.

---

## UX Notes

### Polymarket Trading Bot
- Landing layout: hero CTA, feature bullets, strategy cards with win-rate numbers, “getting started” steps, pricing table, FAQ.
- Strategy library is presented as pre-built named strategies.

### Squawkr
- Minimal flow UI; copy emphasizes not trusting untested strategies.
- Backtest page frames steps (“Step 1…”) and has a dedicated copy-trading tester.

---

## Safety Controls (Publicly Described)
- Polytradingbot claims “advanced risk management” including stop-loss and position sizing; does not publicly enumerate hard controls (daily max loss, kill switch, allowlists, etc.).
- Squawkr pages reviewed do not list explicit safety controls.

---

## Assumptions / Inferences (Clearly Marked)
- Assumption: competitor “backtesting” likely requires historical price/probability time series; details are not public.
- Assumption: “API access” tier implies programmatic bot control, but endpoints/permissions not public.

---

## Sources (Links)
- https://www.polytradingbot.net/
- https://squawkr.xyz/
- https://squawkr.xyz/backtest
