# Handoff Report: Codebase Architecture Survey for Net Worth & Capital Cycle System

**Agent**: `survey_explorer_1` (Role: Codebase Architecture Explorer)  
**Parent**: Project Orchestrator (`a90fce10-da57-446a-b348-94b9b5b8c1a6`)  
**Working Directory**: `c:\dev\p2p\.agents\survey_explorer_1`  
**Artifact**: `c:\dev\p2p\.agents\survey_explorer_1\analysis.md`  

---

## 1. Observation

1. **Project Architecture & Entry Points**:
   - Web application entry point: `c:\dev\p2p\index.html` loads `<script type="module" src="js/app.js"></script>` and external CDNs `<script src="https://unpkg.com/lucide@latest"></script>` and `<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>` (lines 23–25).
   - Express server and local proxy: `c:\dev\p2p\server.js` listening on port 3000, serving static root directory via `app.use(express.static(__dirname))` (line 17) and proxying Bybit API requests.
   - Vercel Serverless proxy: `c:\dev\p2p\api/*.js` (`_bybit.js`, `balance.js`, `orders.js`, `ads.js`, `market-depth.js`, `status.js`).
   - Service worker: `c:\dev\p2p\sw.js` managing cache `bybit-p2p-v9` with 24 pre-cached assets in `STATIC_ASSETS`.

2. **Bank Ledger & Dynamic Balance Computation**:
   - Located in `c:\dev\p2p\js\store.js` lines 188–257 in `getComputedBankBalances()`.
   - Formula: `currentBalance = initialBalance - sum(BUY netAmount) + sum(SELL netAmount) - sum(outflow transfer amounts + fees) + sum(inflow transfer amounts)`.
   - In `c:\dev\p2p\js\dashboard.js` lines 305–322 (`renderDashboardMetrics`), total bank cash is calculated by iterating over `store.getComputedBankBalances()` and summing `rec.currentBalance`.

3. **Bybit USDT Funding Balance & Ad Listings State**:
   - `server.js` lines 200–283 (`/api/balance`) calls Bybit `GET /v5/asset/transfer/query-account-coins-balance` and `POST /v5/p2p/item/personal/list`.
   - `js/bybitService.js` lines 72–95 (`fetchFundingBalance`) and lines 138–164 (`fetchActiveAds`).
   - `js/dashboard.js` lines 158–245 (`syncBybitLiveInventory`):
     - `totalP2P`: fetched from `bybitService.fetchFundingBalance('USDT')`.
     - `adAllocation`: calculated by summing `lastQuantity + frozenQuantity` for active sell ads (`side === 1 && status !== 30`).
     - `freeForBuyback = Math.max(0, totalP2P - adAllocation)`.
   - `js/dashboard.js` lines 55–153 (`syncAndRenderActiveAd`):
     - Finds active sell ad (`status === 10` or `20`/`2`), extracts `activeSellAd.price`, computes spread vs FIFO holding cost `avgBuyCost`.

4. **Storage Keys & Reactive Event Pipeline**:
   - Existing keys in `c:\dev\p2p\js\store.js` line 8: `bybit_p2p_version`, `bybit_p2p_trades`, `bybit_p2p_banks`, `bybit_p2p_transfers`, `bybit_p2p_settings`, `bybit_p2p_opening_inventory`.
   - Preferences keys in `js/pricing.js` & `js/app.js`: `bybit_p2p_theme`, `bybit_p2p_proxy_url`, `bybit_p2p_proxy_token`, `bybit_p2p_pricing_*`.
   - Custom event notification bus: `store.notify(eventType, payload)` dispatches `window.dispatchEvent(new CustomEvent('store:updated', { detail: { type, payload, timestamp } }))` (lines 78–82).

5. **Test Infrastructure Execution**:
   - Executing `node test/run-tests.js` executed 133 tests across 4 tiers + challengers.
   - Result: 133 passed, 0 failed, duration 14.2s (100% pass rate).

---

## 2. Logic Chain

1. **State Accessibility**: From Observation #2, bank balances are computed on demand in `store.getComputedBankBalances()` and total cash across all linked bank accounts is accessible via pure summation.
2. **Crypto Valuation**: From Observation #3, total Bybit USDT funding balance is accessible via `bybitService.fetchFundingBalance('USDT')` / `syncBybitLiveInventory()`, with the live Bybit sell ad price from `syncAndRenderActiveAd()` serving as the primary real-time conversion rate.
3. **Net Worth Synthesis**: Combining total bank cash (Observation #2) and total Bybit USDT balance multiplied by reference rate (Observation #3) yields live Net Worth in NGN and USDT (`NGN = Bank Cash + (USDT * Rate)`, `USDT = (Bank Cash / Rate) + USDT`).
4. **Snapshot Storage Extension**: From Observation #4, adding `STORAGE_KEYS.NET_WORTH_SNAPSHOTS = 'bybit_p2p_net_worth_snapshots'` follows the identical pattern of existing store collections (`trades`, `banks`, `transfers`) with full integration into `exportAllData()` and `importAllData()`.
5. **Chart & UI Feasibility**: From Observation #1, Chart.js is already imported in `index.html` and used in `js/dashboard.js` for realized P&L trends. Adding a Net Worth historical line chart and snapshot comparison delta follows the existing chart architecture.

---

## 3. Caveats

- In a completely offline or unauthenticated proxy environment where Bybit API calls fail, Bybit USDT balances fall back gracefully to the app's internal FIFO inventory (`fifoResult.remainingInventoryUSDT`) and reference rates fall back to `fifoResult.avgHoldingCostPerUSDT` / `openingInventory.defaultCostBasis` / default rate.
- No source code modifications were performed during this survey (read-only investigation).

---

## 4. Conclusion

The existing architecture is cleanly modularized and ideal for implementing Requirements R1, R2, and R3:
- **R1 (Live Net Worth Widget)**: Can be integrated into `js/views/dashboard.view.js` and `js/dashboard.js` by combining `store.getComputedBankBalances()` with `syncBybitLiveInventory()` and `syncAndRenderActiveAd()`.
- **R2 (Snapshot Logging)**: Can be implemented via `js/store.js` (`bybit_p2p_net_worth_snapshots`), a new modal template in `js/views/modals.view.js`, and form logic in `js/dashboard.js`.
- **R3 (Historical Comparison & Trend Chart)**: Can be implemented via Chart.js on the dashboard and delta calculation helpers in `js/dashboard.js`, with JSON backup/restore support in `js/export.js`.

---

## 5. Verification Method

- **Test Suite Command**:
  ```bash
  node test/run-tests.js
  ```
- **Inspect Artifact**:
  - Review detailed survey findings in `c:\dev\p2p\.agents\survey_explorer_1\analysis.md`.
- **Invalidation Condition**:
  - The findings in this report would be invalidated if the project structure, store contracts in `js/store.js`, or Bybit API schemas in `server.js` were fundamentally altered without maintaining the reactive event bus or FIFO engine.
