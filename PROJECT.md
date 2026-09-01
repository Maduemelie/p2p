# Project: Pricing & Arbitrage Assistant Refactoring

## Architecture
The Pricing & Arbitrage Assistant is a modular system for P2P cryptocurrency arbitrage trading across Bybit P2P and local fiat currencies (NGN):
1. **Backend Layer (`server.js`, `api/market-depth.js`)**:
   - Proxies Bybit V5 P2P API (`/v5/p2p/item/online`).
   - Handles public orderbook depth queries for `buyDepth` (merchant Buy ads / Bids, queried via `side: '1'`) and `sellDepth` (merchant Sell ads / Asks, queried via `side: '0'`).
   - Enforces authentication (`validateAuth`) and provides resilient JSON response parsing via `extractItems`.
2. **Pricing Engine Domain Layer (`js/pricingEngine.js`)**:
   - Pure, deterministic computational engine for P2P arbitrage pricing.
   - `filterCompetitorAds`: Filters dust and bounds orders by trade limits.
   - `calculateReferencePrice`: Implements Competitor Top 1, Simple Moving Average (SMA-N), and Volume-Weighted Average Price (VWAP-N).
   - `calculateBuyPricing`: Outbids competitor buy ads by +₦0.10 while enforcing `maxBuyPrice` spread cap protection against lowest sell ask and inflow fees.
   - `calculateSellPricing`: Undercuts competitor sell ads by -₦0.10 while enforcing `targetSellPrice` spread floor above FIFO cost basis and outflow fees.
3. **Controller & State Layer (`js/pricing.js`)**:
   - Fetches `/api/market-depth`, updates cached market depth, orchestrates pricing engine calculations with user input (capital, spread, fees, filters).
   - Handles DOM events, click-to-prefill actions on orderbook rows, and manages FIFO inventory snapshots.
4. **UI & View Presentation Layer (`js/views/pricing.view.js`)**:
   - Generates HTML for Pricing Dashboard: Market Depth Sync, Buy Ad Assistant (Inflow), Sell Ad Assistant (Outflow), Buy Order Book, Sell Order Book, and Arbitrage Opportunities summary.

## Feature Inventory
| # | Feature | Description | Milestone | Source | Status |
|---|---------|-------------|-----------|--------|--------|
| F1 | Market Depth API & Side Mapping | Accurate Bybit `/v5/p2p/item/online` public orderbook mapping (`side: '1'` -> buyDepth bids, `side: '0'` -> sellDepth asks) with resilient item extraction | M1 | ORIGINAL_REQUEST R1 | DONE |
| F2 | Pricing Engine Buy Math | Outbidding competitor buy ads by +0.10 with `maxBuyPrice` spread cap protection and inflow fee amortization | M2 | ORIGINAL_REQUEST R2 | DONE |
| F3 | Pricing Engine Sell Math | Undercutting competitor sell ads by -0.10 with `targetSellPrice` and `breakEvenPrice` floors above FIFO cost basis and outflow fees | M2 | ORIGINAL_REQUEST R2 | DONE |
| F4 | Reference Price Calculations | Pure calculations for Competitor Top 1, SMA-N, and VWAP-N with dust & limit filtering | M2 | ORIGINAL_REQUEST R2 | DONE |
| F5 | UI View & Badge Alignment | Consistent badges (`badge-primary` on Inflow & Outflow headers), taker/maker labels, and responsive orderbook tables | M3 | ORIGINAL_REQUEST R3 | DONE |
| F6 | Order Book Rendering & Prefill | High-bid and low-ask sorting with click-to-trade prefill handlers | M3 | ORIGINAL_REQUEST R3, R4 | DONE |
| F7 | Comprehensive Unit & E2E Testing | Deterministic unit tests for pricingEngine (25 tests), API mock tests, boundary testing (4,000+ trials), and Monte Carlo invariant stress suites (8,000+ scenarios) | M4 | ORIGINAL_REQUEST R4 | DONE |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Backend API & Market Depth Robustness | `server.js`, `api/market-depth.js` side mapping verification, resilient item extraction, documentation | none | DONE |
| M2 | UI View & Badge Consistency | `js/views/pricing.view.js`, `js/pricing.js` badge alignment, label clarity, maker/taker perspective | M1 | DONE |
| M3 | Comprehensive Pricing Engine Test Suite | `test/tier1-feature-coverage/pricing-engine.test.js` covering pure math, boundaries, limits, VWAP, SMA | M1, M2 | DONE |
| M4 | 100% Test Pass & Adversarial Hardening | E2E test verification, adversarial edge testing, gate verification | M1, M2, M3 | DONE |

## Interface Contracts
### Backend API (`/api/market-depth`)
- Method: `GET` / `POST` (`app.all`)
- Parameters: `fiat` (string, e.g. "NGN"), `coin` (string, e.g. "USDT"), `limit` (number, default 20)
- Response Shape:
  ```json
  {
    "success": true,
    "buyDepth": [ { "userId": "...", "price": "1450.00", "lastQuantity": "500", "minAmount": "10000", "maxAmount": "500000", "payments": ["Bank Transfer"] } ],
    "sellDepth": [ { "userId": "...", "price": "1470.00", "lastQuantity": "1000", "minAmount": "20000", "maxAmount": "1000000", "payments": ["Bank Transfer"] } ],
    "timestamp": 1725195600000
  }
  ```

### Pricing Engine (`js/pricingEngine.js`)
- `calculateBuyPricing(buyAds, sellAds, config)`:
  - Returns: `{ referencePrice, suggestedBuyPrice, rawSuggestedBuy, maxBuyPrice, isSafe, exitPrice, spread, expectedProfit, feePerUnit }`
- `calculateSellPricing(sellAds, config)`:
  - Returns: `{ referencePrice, suggestedSellPrice, rawSuggestedSell, breakEvenPrice, targetSellPrice, isSafe, costBasis, spread, expectedProfit, feePerUnit }`

## Code Layout
- `server.js`: Express server, proxy endpoints, auth middleware.
- `api/market-depth.js`: Standalone market depth handler.
- `js/pricingEngine.js`: Pure mathematical pricing functions.
- `js/pricing.js`: Pricing controller, event handlers, DOM bindings.
- `js/views/pricing.view.js`: Pricing HTML templates and UI components.
- `test/tier1-feature-coverage/pricing-engine.test.js`: Deterministic pricing engine unit tests.
- `test/challenger-1-empirical-pricing-stress.test.js`: Monte Carlo pricing invariant stress harness.
- `test/challenger-2-boundary-fuzzing-stress.test.js`: Boundary fuzzing and cycle harness.
- `test/run-tests.js`: Test runner harness.
