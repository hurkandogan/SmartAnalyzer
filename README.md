# SmartAnalyser

A full-stack personal finance platform that aggregates live brokerage and exchange data, tracks portfolio performance, and delivers automated daily stock analysis — all in one self-hosted system.

## Overview

SmartAnalyser connects to **Interactive Brokers (IBKR) TWS**, **Kraken** (crypto exchange), and **Twelve Data** to pull live positions and prices, then syncs everything to **Firebase Firestore** as the single source of truth. A React dashboard renders the portfolio in real time via polling.

The system is built around two distinct sync strategies:

| User type | Behavior |
|---|---|
| **Private (owner)** | Full mirror — quantities, avg cost, live prices pulled directly from IBKR and Kraken. Stale assets deleted automatically. |
| **Other users** | Price-only updates — quantity and cost basis untouched, only `current_price` / `market_value` refreshed. |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     React Frontend                      │
│              (Vite + Tailwind + DaisyUI)                │
└────────────────────────┬────────────────────────────────┘
                         │ REST
┌────────────────────────▼────────────────────────────────┐
│                  Hono API Server (Node.js)               │
│   /api/portfolio   /api/watchlist   /api/jobs           │
└──────┬───────────────────────────────────┬──────────────┘
       │                                   │
┌──────▼──────┐  ┌──────────┐  ┌──────────▼────────────┐
│   Firebase  │  │  Cron    │  │   Job Runners          │
│  Firestore  │  │ Scheduler│  │  portfolioSync         │
│             │◄─┤          ├─►│  dailyStockAnalysis    │
│  users/     │  │  hourly  │  │  currencyUpdate        │
│  watchlist/ │  │  daily   │  └────────────────────────┘
│  stocks/    │  └──────────┘           │
│  currencies/│               ┌─────────┼──────────┐
└─────────────┘          ┌────▼───┐ ┌───▼───┐ ┌────▼─────────┐
                         │  IBKR  │ │Kraken │ │ Twelve Data  │
                         │  TWS   │ │  API  │ │     API      │
                         └────────┘ └───────┘ └──────────────┘
```

---

## Features

### Portfolio Sync
- Reads live **positions and cash balances** from IBKR TWS via the `@stoqey/ib` API client
- Reads **crypto balances** from Kraken (aggregates staked + liquid, skips fiat)
- **Three-tier price resolution** per asset:
  1. IBKR market data snapshot (realtime / delayed)
  2. Twelve Data REST API (USD equities only — rate-limited to 8 req/min)
  3. IBKR `reqHistoricalData` as final fallback (no subscription required)
- Options handling: `MIDPOINT` historical data used instead of `TRADES` (low-volume contracts); TwelveData is explicitly skipped to avoid returning the underlying price
- **Price cache** shared between private and other-user syncs — a price fetched during the owner's sync is reused for other users, avoiding duplicate API calls
- Deletes Firestore assets that no longer exist in live brokerage data (source-scoped: IBKR and Kraken deleted independently, only when their respective connections succeed)
- Preserves user-defined `category_id` across syncs

### Daily Stock Analysis
- Iterates the watchlist stored in Firestore
- Fetches delayed snapshot (price, volume, high/low) from IBKR
- Fetches contract details (sector, industry, exchange)
- Fetches fundamental ratios via IBKR generic tick 258 (P/E, PEG, ROE, ROIC, market cap)
- Writes a timestamped record to the `stocks/` collection

### Portfolio History
- After each sync, writes a daily snapshot to `portfolio_history/YYYY-MM-DD`
- Includes total market value, cost basis, unrealized P&L, and category-level allocation breakdown

### Watchlist Management
- REST API to add/remove symbols
- Validates symbols against IBKR contract definitions before saving

### Currency Update
- Daily exchange rate refresh stored in Firestore `currencies/` collection

---

## Tech Stack

### Backend
| Layer | Technology |
|---|---|
| Runtime | Node.js ≥ 20 (ESM) |
| HTTP framework | [Hono](https://hono.dev) |
| IBKR client | [@stoqey/ib](https://github.com/stoqey/ib) |
| Database | Firebase Firestore (via Admin SDK) |
| Scheduler | node-cron |
| Logging | Winston |
| Process manager | PM2 |

### Frontend
| Layer | Technology |
|---|---|
| Framework | React 19 |
| Build tool | Vite |
| Styling | Tailwind CSS v4 + DaisyUI |

### External APIs
| API | Purpose | Notes |
|---|---|---|
| IBKR TWS | Positions, prices, fundamentals | Local socket — requires TWS or IB Gateway running |
| Kraken | Crypto balances + prices | Private + public endpoints |
| Twelve Data | Equity prices (fallback) | Free tier: 800 req/day, 8 req/min |

---

## Project Structure

```
SmartAnalyser/
├── src/
│   ├── index.js              # Entry point — HTTP server + Firebase init + scheduler
│   ├── config/
│   │   ├── index.js          # Environment variable bindings
│   │   └── symbols.js        # Kraken symbol mappings and price pairs
│   ├── jobs/
│   │   ├── scheduler.js      # Cron job definitions
│   │   ├── portfolioSync.js  # Main sync logic (private + other users)
│   │   ├── dailyStockAnalysis.js
│   │   └── currencyUpdate.js
│   ├── routes/
│   │   ├── portfolio.js      # GET /api/portfolio/all
│   │   ├── watchlist.js      # GET/POST/DELETE /api/watchlist
│   │   └── jobs.js           # POST /api/jobs/:name — manual triggers
│   ├── services/
│   │   ├── ibkr.js           # IBKR TWS wrapper (connect, positions, prices, historical)
│   │   ├── kraken.js         # Kraken REST client (balance, prices)
│   │   ├── twelveData.js     # Twelve Data price fallback
│   │   ├── firebase.js       # Firestore read/write helpers
│   │   └── currency.js       # Exchange rate fetching
│   └── utils/
│       └── logger.js         # Winston logger (console + file)
├── client/                   # React frontend (served as static from the API server)
│   └── src/
│       ├── App.jsx
│       └── components/
│           ├── PortfolioTable.jsx
│           ├── WatchlistPanel.jsx
│           ├── JobPanel.jsx
│           └── ConnectionStatus.jsx
├── logs/                     # Winston log output
├── ecosystem.config.cjs      # PM2 configuration
└── .env                      # Environment variables (not committed)
```

---

## Setup

### Prerequisites
- Node.js ≥ 20
- Interactive Brokers TWS or IB Gateway running locally (port 7497 for paper, 7496 for live)
- Firebase project with Firestore enabled and a service account key
- Kraken account with API key (read permissions)
- Twelve Data account with API key (free tier sufficient)

### Installation

```bash
# Backend
npm install

# Frontend
cd client && npm install
```

### Environment Variables

Create a `.env` file in the project root:

```env
PORT=3500

IBKR_HOST=127.0.0.1
IBKR_PORT=7497
IBKR_CLIENT_ID=1

FIREBASE_USER_ID=<your-firestore-user-document-id>
FIREBASE_SERVICE_ACCOUNT=./serviceAccountKey.json

KRAKEN_API_KEY=<your-kraken-api-key>
KRAKEN_API_SECRET=<your-kraken-api-secret>

TWELVE_DATA_API_KEY=<your-twelve-data-api-key>
```

Place your Firebase service account JSON at the path specified by `FIREBASE_SERVICE_ACCOUNT`.

### Running

```bash
# Development (auto-restart on file change)
npm run dev

# Build frontend
npm run build:client

# Production (PM2)
pm2 start ecosystem.config.cjs
pm2 logs smart-analyser
```

### Manual Job Triggers

```bash
# Portfolio sync
curl -X POST http://localhost:3500/api/jobs/portfolio-sync

# Daily stock analysis
curl -X POST http://localhost:3500/api/jobs/stock-analysis

# Currency update
curl -X POST http://localhost:3500/api/jobs/currency-update
```

---

## Cron Schedule

| Job | Schedule | Description |
|---|---|---|
| Portfolio Sync | Every hour, Mon–Fri | Syncs positions and prices |
| Daily Stock Analysis | Mon–Fri at 21:30 | Post-market fundamentals snapshot |
| Currency Update | Daily at 08:00 | Exchange rate refresh |

---

## Key Design Decisions

**Rate limiting** — IBKR TWS enforces a per-second request limit. All market data calls go through a 300ms sequential slot mechanism, preventing connection drops from burst requests.

**Nonce management (Kraken)** — Kraken requires strictly increasing 64-bit integer nonces. The implementation uses `BigInt` arithmetic (`Date.now() * 1_000_000n`) to avoid IEEE-754 precision loss at nanosecond scale, with a monotonicity clamp for rapid successive calls.

**Graceful degradation** — Each external connection (IBKR, Kraken) is isolated. If IBKR fails, Kraken sync still runs. If Kraken fails, IBKR sync still runs. Asset deletion is only performed when the corresponding connection succeeds, preventing false deletions during outages.

**Source-scoped deletion** — Firestore assets are tagged with `source: 'IBKR'` or `source: 'KRAKEN'`. Deletion logic respects this boundary — a Kraken outage will not cause IBKR assets to be deleted, and vice versa.

---

## License

MIT
