# SmartAnalyser / Metrixfolio

> **Note to Reviewers:** This project is a product of **Vibe Coding**—an AI-assisted development methodology where the developer orchestrates complex architectural workflows, prompts, and iterates alongside advanced AI agents to rapidly build full-stack applications.

Metrixfolio (SmartAnalyser) is an advanced financial analytics platform designed for algorithmic trading, options analysis, and market data visualization. It aggregates data from multiple sources (IBKR, Yahoo Finance, Kraken), computes sophisticated technical and macroeconomic indicators, and presents actionable insights through a modern Next.js dashboard and a Telegram bot.

## 🏗 Architecture Overview

The system is split into three primary components:

1. **Frontend (Next.js - `metrixfolio/`)**
   - Built with Next.js 15 (App Router), React, TailwindCSS, and DaisyUI.
   - Provides a responsive, aesthetic dashboard featuring:
     - **Auto-healing Watchlists:** Real-time prices, IV, and sector/industry data that self-heals missing metadata by querying the backend.
     - **Options Flow & Signals:** Visualizing options sweeps, bullish/bearish flows, and historical premium trends.
     - **Market Weather:** A dashboard showing a unified sentiment score based on technicals (RSI, MFI, Moving Averages), macro events (Fed rates, VIX), and options data (Put/Call ratios).

2. **Backend Services (Node.js - `src/`)**
   - Scheduled cron jobs for data mining, daily options updates, and swing trading scans.
   - Firebase Admin integration for managing Firestore schemas securely.
   - **Telegram Bot Integration:** Delivers real-time notifications, market weather reports, and swing trading alerts directly to users.

3. **Data Science & AI Engine (Python FastAPI - `python/`)**
   - The heavy-lifting mathematical engine.
   - Integrates with Interactive Brokers (IBKR) via `ib_insync`, Yahoo Finance, and Kraken API.
   - Performs complex calculations using Pandas and NumPy, calculating moving averages, Bollinger Bands, Implied Volatility percentiles (IVP), and options pricing models (Black-Scholes).
   - Generates AI-driven insights using Google's Gemini models for macro-economic summaries.

## 🚀 Key Features

- **Algorithmic Options Flow:** Analyzes and stores daily options data for thousands of tickers, categorizing sweeps, blocks, and institutional flow.
- **Swing Trade Scanner:** Automatically filters the market for high-probability setups (e.g., RSI divergences, MACD crossovers, high volume breakouts) and saves them to the database.
- **Auto-Healing Watchlist:** A resilient watchlist that self-updates and fetches missing contract metadata dynamically.
- **Market Weather Indicator:** A proprietary "weather" score evaluating the overall market sentiment to guide portfolio exposure (Sunny vs. Stormy).

## 🛠 Tech Stack

- **Frontend:** Next.js 15, React, TailwindCSS, DaisyUI
- **Backend:** Node.js, Express, Firebase Admin, Telegram API
- **Data/Analytics:** Python, FastAPI, Pandas, NumPy, YFinance, IBKR API
- **Database:** Firebase Firestore (Realtime NoSQL) + PostgreSQL (for relational data)
- **Deployment:** PM2 Ecosystem for microservices orchestration

## 💻 Getting Started

### Prerequisites
- Node.js v18+
- Python 3.10+
- Firebase Project & Service Account (`serviceAccountKey.json`)
- `.env` variables for Next.js, Node.js, and Python.

### Running the Project locally
You can spin up the entire ecosystem (Node.js worker + Python FastAPI) using PM2:
```bash
npm run start:all
```
For the frontend UI, navigate to the `metrixfolio` directory:
```bash
cd metrixfolio
npm run dev
```

## 🔐 Security
- All sensitive API keys, Telegram tokens, and Firebase credentials are injected via environment variables.
- `serviceAccountKey.json` and `.env` are strictly excluded from source control.
- Firestore security rules are applied for client-side data access in Next.js.
