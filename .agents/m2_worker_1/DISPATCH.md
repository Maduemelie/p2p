## 2026-08-25T13:31:58Z

Implement Milestone 2 (M2: Live Net Worth Dashboard Widget UI & Reactive Updates) based on the Explorer blueprints:
1. `js/views/dashboard.view.js`:
   - Add `#card-net-worth` Hero Card to the top of the dashboard (above `#card-active-ad-spread` / Portfolio Overview).
   - Render:
     - Primary Net Worth in NGN (`#stat-net-worth-ngn`) and USDT (`#stat-net-worth-usdt`).
     - Breakdown sub-metrics: Bank Cash NGN (`#metric-nw-bank-cash`), Bybit USDT (`#metric-nw-bybit-usdt`), Reference Exchange Rate (`#metric-nw-ref-rate`).
     - Delta comparison badge container (`#badge-net-worth-delta`).
     - "End Day / Save Snapshot" button hook (`#btn-open-snapshot-modal`).
2. `js/dashboard.js`:
   - Implement `renderNetWorthWidget()`:
     - Retrieve Bank Cash via `calculateTotalBankCash(store.getComputedBankBalances())`.
     - Retrieve Bybit USDT balance (funding wallet + active ad allocation, or FIFO inventory fallback).
     - Resolve Reference Exchange Rate via `resolveReferenceRate(...)`.
     - Calculate Net Worth via `calculateNetWorth(...)`.
     - Calculate live snapshot delta via `calculateSnapshotDelta(...)` against the latest snapshot in `store.getSnapshots()`.
     - Update all DOM elements with formatted values.
     - Update `#badge-net-worth-delta` with appropriate visual styling (.badge-success, .badge-danger, .badge-neutral), text, and tooltip.
   - Hook `renderNetWorthWidget()` into `renderDashboardMetrics()`, `syncAndRenderActiveAd()`, `syncBybitLiveInventory()`, and the `store:updated` event listener in `initDashboard()`.
3. CSS / Styles:
   - Ensure clean alignment, typography, and theme styling in `css/styles.css` matching existing card designs.
4. Testing & Verification:
   - Run `node test/run-tests.js`. Ensure 100% tests pass (all 395+ tests).
