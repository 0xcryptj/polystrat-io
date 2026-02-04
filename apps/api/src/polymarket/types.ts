// Polymarket read-only types.
// IMPORTANT: These are derived strictly from pasted docs in docs/polymarket/*.md.

export type Outcome = {
  label: string;
};

export type Market = {
  id: string;
  slug: string | null;
  question: string | null;
  description: string | null;
  conditionId: string;

  // Docs list these as string|null, but format is unspecified in pasted excerpt.
  outcomesRaw: string | null;
  outcomePricesRaw: string | null;
  clobTokenIdsRaw: string | null;

  enableOrderBook: boolean | null;

  bestBid: number | null;
  bestAsk: number | null;
  lastTradePrice: number | null;
  spread: number | null;

  volumeNum: number | null;
  liquidityNum: number | null;

  raw: any;
};

export type OrderbookLevel = any; // child attributes not pasted yet

export type Orderbook = {
  market: string;
  assetId: string;
  timestamp: string;
  hash: string;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  minOrderSize: string;
  tickSize: string;
  negRisk: boolean;
  raw: any;
};

export type PriceHistoryPoint = any; // child attributes not pasted yet

export type PriceHistory = {
  marketTokenId: string;
  history: PriceHistoryPoint[];
  raw: any;
};

export type PublicProfile = {
  address: string;
  createdAt: string | null;
  proxyWallet: string | null;
  profileImage: string | null;
  displayUsernamePublic: boolean | null;
  bio: string | null;
  pseudonym: string | null;
  name: string | null;
  users: any[] | null;
  xUsername: string | null;
  verifiedBadge: boolean | null;
  raw: any;
};
