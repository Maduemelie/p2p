# Project: Bybit NGN P2P Trade Tracker Stabilization, Security & Alignment

## Architecture
The Bybit NGN P2P Trade Tracker is a Progressive Web App (PWA) with a dual-backend deployment architecture:
1. **Frontend Client**: Vanilla ES Module Single-Page Application (SPA) structured into controllers (`js/*.js`), reactive store with `localStorage` persistence (`js/store.js`), FIFO accounting engine (`js/utils.js`), fee calculation engine (`js/fees.js`), Bybit API client (`js/bybitService.js`), and view templates (`js/views/*.js`).
2. **Local/Node Backend**: Express server (`server.js`) serving static assets and proxying signed requests to Bybit P2P OpenAPI endpoints (`/api/balance`, `/api/orders`, `/api/ads`, `/api/market-depth`).
3. **Serverless Cloud Backend**: Vercel Serverless Functions (`api/*.js`, `api/_bybit.js`) configured for region `fra1`.
4. **Offline Resilience**: Service Worker (`sw.js`) maintaining complete pre-cached asset manifest for offline operation and network-resilient caching.

```
+-----------------------------------------------------------------------------------+
|                                Browser Client (PWA)                              |
|  +-------------------+  +--------------------+  +------------------------------+  |
|  |  Views & Layouts  |  | Controllers / App  |  | FIFO Engine (js/utils.js)    |  |
|  | (js/views/*.js)   |  | (js/dashboard.js,  |  | & Fee Engine (js/fees.js)    |  |
|  |                   |  |  js/pricing.js,    |  +------------------------------+  |
|  |                   |  |  js/history.js,    |  | Reactive Store (js/store.js) |  |
|  |                   |  |  js/trades.js,     |  | - Trades, Bank Ledgers,      |  |
|  |                   |  |  js/settings.js)   |  |   Opening Inventory          |  |
|  +-------------------+  +--------------------+  +------------------------------+  |
|            |                      |                                               |
|            |                      v                                               |
|            |            +--------------------+                                    |
|            |            | js/bybitService.js | (Auth Headers: Bearer/x-proxy-token)|
|            |            +--------------------+                                    |
+------------|----------------------|-----------------------------------------------+
             |                      |
             v                      v
+------------------------+  +-------------------------------------------------------+
| Service Worker (sw.js) |  |             API Proxy (Express / Vercel)              |
| Pre-caches all JS/CSS/ |  | - /api/balance      - /api/ads                        |
| View assets for offline|  | - /api/orders       - /api/market-depth               |
| reliability            |  | -> Enforces PROXY_AUTH_TOKEN validation (401 on fail) |
+------------------------+  +-------------------------------------------------------+
                                                    |
                                                    v
                                       +-------------------------+
                                       | Bybit OpenAPI Endpoints |
                                       +-------------------------+
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | API Proxy Security & Token Authorization | Enforce `PROXY_AUTH_TOKEN` verification on `/api/balance`, `/api/orders`, `/api/ads`, `/api/market-depth` (Express & Vercel); return `401 Unauthorized` for missing/invalid tokens; update frontend `bybitService.js` and Settings UI | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Timing-Safe Auth & CORS Alignment | Implement `timingSafeEqual` comparison and allow `Authorization`, `x-proxy-token`, `x-api-token` in Vercel CORS preflights | M1 | Survey Backend |
| 3 | FIFO Accounting Cost Basis Parity | Ensure Dashboard Portfolio Overview, Active Sell Ad Monitor, and Pricing Assistant all strictly display the authoritative FIFO cost basis without post-ad buyback distortion | M2 | ORIGINAL_REQUEST §R2 |
| 4 | Opening Inventory Key Protection | Prevent automated overwrites of `bybit_p2p_opening_inventory` during live ad sync or balance sync; restrict changes strictly to explicit user submissions in Data tab | M2 | ORIGINAL_REQUEST §R2 |
| 5 | Active Sell Ad ₦0 Fee Calculation | Remove hardcoded ₦50 stamp duty fee deduction on active Sell ads when receiving Naira | M2 | ORIGINAL_REQUEST §R2 |
| 6 | Multi-Bank Order Assignment (BUY & SELL) | Update import modal to render bank selection dropdowns for both BUY and SELL orders without auto-defaulting sales to primary account | M3 | ORIGINAL_REQUEST §R3 |
| 7 | Multi-Bank Ledger Accounting | Accurately credit/debit individual bank account ledgers and compute reactive balances upon completed batch imports | M3 | ORIGINAL_REQUEST §R3 |
| 8 | Trade History Order ID (`refId`) Search | Index Bybit Order ID (`refId`) and internal `id` in Trade History search matching and display refId in expanded details | M4 | ORIGINAL_REQUEST §R4 |
| 9 | Pricing Assistant Order Book Row Interaction | Make Buy/Sell order book rows clickable to prefill rate, volume, and direction into trade form and navigate to Record Trade view | M4 | ORIGINAL_REQUEST §R4 |
| 10 | Accessible Cancel/Back Navigation | Add accessible Cancel / Back buttons to the Record Trade header and form action controls with previous view history restoration | M4 | ORIGINAL_REQUEST §R4 |
| 11 | Complete PWA Offline Pre-cache Manifest | Update `sw.js` `STATIC_ASSETS` to include all 24 local JS controllers, view templates, styles, and assets to prevent offline ES module load failure | M5 | ORIGINAL_REQUEST §R5 |
| 12 | End-to-End Test Harness & Verification | 4-tier automated test suite verifying all security, accounting, ledger, search, UX, and offline requirements | M-E2E & M-FINAL | ORIGINAL_REQUEST Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M-E2E | E2E Testing Suite (Tiers 1-4) | Comprehensive opaque-box test infrastructure & suites covering R1–R5 | none | DONE |
| M1 | R1: API Proxy Security & Token Auth | `server.js`, `api/*.js`, `js/bybitService.js`, `js/settings.js`, `js/views/settings.view.js` | none | DONE |
| M2 | R2: FIFO Accounting & Inventory Protection | `js/dashboard.js`, `js/settings.js`, `js/views/dashboard.view.js`, `js/pricing.js` | none | DONE |
| M3 | R3: Multi-Bank Order Reconciliation | `js/views/modals.view.js`, `js/settings.js`, `js/store.js` | none | DONE |
| M4 | R4: Search, Navigation & Order Book UX | `js/history.js`, `js/views/history.view.js`, `js/pricing.js`, `js/trades.js`, `js/views/addTrade.view.js`, `js/app.js` | none | DONE |
| M5 | R5: Complete Offline PWA Pre-caching | `sw.js`, `manifest.json` | M1–M4 | DONE |
| M-FINAL | E2E Verification & Adversarial Hardening | 100% E2E test pass + Tier 5 adversarial stress testing | M-E2E, M1–M5 | DONE |

## Interface Contracts

### 1. API Proxy Security Contract (`/api/*` Endpoints)
- **Protected Endpoints**: `/api/balance`, `/api/orders`, `/api/ads`, `/api/market-depth`
- **Unprotected Endpoints**: `/api/status` (exposes `{ status: 'ok', authRequired: boolean, ... }`)
- **Authentication Headers**:
  - `Authorization: Bearer <token>`
  - `x-proxy-token: <token>`
  - `x-api-token: <token>`
  - Query parameter fallback: `?token=<token>`
- **Unauthorized Response**:
  - HTTP Status: `401 Unauthorized`
  - JSON Body: `{ "retCode": 401, "retMsg": "Unauthorized: Invalid or missing proxy authorization token" }`
- **Frontend Storage Key**: `localStorage.getItem('bybit_p2p_proxy_token')`

### 2. FIFO Accounting Contract (`js/utils.js` <-> Views)
- **Engine Signature**: `calculateFIFOInventoryAndPnL(trades, openingInventory)`
- **Return Contract**:
  - `remainingInventoryUSDT`: Total USDT currently held in portfolio
  - `inventoryCostBasisNGN`: Total acquisition cost in NGN
  - `avgHoldingCostPerUSDT`: Average NGN acquisition cost per USDT (`inventoryCostBasisNGN / remainingInventoryUSDT`)
- **Display Standard**: All views (`js/dashboard.js`, `js/pricing.js`, `js/history.js`) must use `fifoResult.avgHoldingCostPerUSDT || openingInventory.defaultCostBasis || 0`.
- **Opening Inventory Key**: `localStorage.getItem('bybit_p2p_opening_inventory')` (`{ startingUsdtBalance: number, defaultCostBasis: number }`). Mutated ONLY via `#form-opening-inventory` submission.

### 3. Multi-Bank Import Contract (`js/settings.js` <-> `js/views/modals.view.js` <-> `js/store.js`)
- **Import Modal**: Renders both `BUY` and `SELL` orders in `#assign-banks-items-list`.
- **Trade Schema**:
  ```javascript
  {
    id: string,
    refId: string, // Bybit Order ID
    type: 'BUY' | 'SELL',
    usdtAmount: number,
    rate: number,
    ngnAmount: number,
    bankAccountId: string, // Must match a bank.id in store
    feeOption: string,
    totalFees: number,
    netAmount: number,
    date: string,
    counterparty: string,
    notes: string
  }
  ```
- **Ledger Invariant**: `BUY` reduces bank balance by `netAmount` (`totalOutflow += netAmount`), `SELL` increases bank balance by `netAmount` (`totalInflow += netAmount`).

### 4. Interactive Order Book & Trade Navigation Contract (`js/pricing.js` <-> `js/trades.js` <-> `js/app.js`)
- **Order Book Click Function**:
  `window.prefillTradeForm({ direction, rate, usdtAmount, counterparty, notes })`
  - Market Ask row click -> `direction = 'BUY'`, `rate = ad.price`, `usdtAmount = ad.lastQuantity`
  - Market Bid row click -> `direction = 'SELL'`, `rate = ad.price`, `usdtAmount = ad.lastQuantity`
- **Navigation Flow**: Sets form inputs, calls `recalculateTradeSummary()`, and triggers `window.switchView('add-trade')`.
- **Cancel / Back Flow**: `#btn-cancel-trade` and `#btn-form-cancel` reset the form and return to `previousView` (tracked in `js/app.js`).

### 5. Service Worker Pre-cache Manifest (`sw.js`)
- **Cache Name**: `bybit-p2p-v9`
- **Manifest**: Must include all root assets (`./`, `./index.html`, `./manifest.json`, `./css/styles.css`, `./css/styles.css?v=2.5`, icon files), all 7 controllers (`js/*.js`), all utility/store modules (`js/store.js`, `js/utils.js`, `js/fees.js`, `js/export.js`, `js/bybitService.js`), and all 6 view templates (`js/views/*.js`).

## Code Layout
- `server.js`: Express server & API proxy
- `api/`: Vercel serverless functions (`_bybit.js`, `balance.js`, `orders.js`, `ads.js`, `market-depth.js`, `status.js`)
- `js/app.js`: Main application entry point & routing
- `js/store.js`: LocalStorage data store & bank ledger calculations
- `js/utils.js`: Core math, FIFO engine, and formatting helpers
- `js/fees.js`: Nigerian fintech fee calculation rules
- `js/bybitService.js`: Frontend API client for Bybit proxy
- `js/dashboard.js`: Dashboard controller & portfolio metrics
- `js/trades.js`: Trade entry, editing, prefill & validation controller
- `js/pricing.js`: Pricing assistant, margin simulator & live order book controller
- `js/history.js`: Trade history search, filtering & export controller
- `js/banks.js`: Bank accounts management controller
- `js/transfers.js`: Bank-to-bank transfer controller
- `js/settings.js`: Settings, opening inventory, Bybit sync & import controller
- `js/views/`: View template modules (`dashboard.view.js`, `addTrade.view.js`, `pricing.view.js`, `history.view.js`, `settings.view.js`, `modals.view.js`)
- `sw.js`: Service worker & offline caching
- `test/`: Automated test suites & test runner
