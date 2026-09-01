# Original User Request

## 2026-08-24T17:04:50Z

Implement and verify the full stabilization, security hardening, accounting alignment, and UX improvements identified in the application audit for the Bybit NGN P2P Trade Tracker.

Working directory: c:\dev\p2p
Integrity mode: development

## Requirements

### R1. API Proxy Security & Token Authorization
Secure the Bybit API proxy endpoints (`/api/balance`, `/api/orders`, `/api/ads`, `/api/market-depth`) by requiring a shared secret or authorization token between the frontend client and the backend server (both Express and Vercel serverless routes), preventing unauthorized access while maintaining seamless frontend integration.

### R2. FIFO Accounting Consistency & Inventory Protection
Unify inventory cost basis and quantity calculations across the application so that the Dashboard Portfolio Overview, Active Sell Ad Monitor, and Pricing Assistant always reflect the authoritative FIFO holding cost. Ensure live Bybit ad syncing does not overwrite user-defined historical opening inventory configurations.

### R3. Comprehensive Multi-Bank Order Reconciliation
Enable bank account assignment for all imported Bybit P2P orders (both BUY and SELL) during trade batch imports, ensuring that cash inflows and outflows are credited/debited to the user's correct bank accounts without defaulting all sales to a single account.

### R4. Search, Navigation & Interactive Order Book UX
Enhance trade history search to index Bybit Order IDs (`refId`), connect live market depth order book rows to automatically populate and navigate to the trade entry form, and add clear cancel/back navigation controls on mobile sub-views.

### R5. Complete Offline PWA Pre-caching
Update the Service Worker caching manifest to pre-cache all local JavaScript modules, view templates, styles, and assets so that the application functions reliably offline without missing script dependencies.

## Acceptance Criteria

### Security & Access Control
- [ ] Direct unauthenticated HTTP requests to `/api/balance`, `/api/orders`, and `/api/ads` return `401 Unauthorized`.
- [ ] Validated frontend requests with the configured token successfully retrieve Bybit data.

### Accounting & Calculation Integrity
- [ ] Dashboard Portfolio Overview and Pricing Assistant display identical average cost basis per USDT for the same trade dataset.
- [ ] Running balance sync or detecting new active ads does not modify the `bybit_p2p_opening_inventory` localStorage key without explicit user action on the Data tab.
- [ ] Projected profit on active Sell ads calculates with a ₦0 fee deduction when receiving Naira.

### Order Import & Bank Ledgers
- [ ] The order import modal allows assigning specific bank accounts for both BUY and SELL orders.
- [ ] Ledger balances update accurately for the chosen bank accounts upon completing an import.

### Search & Navigation
- [ ] Pasting a Bybit Order ID (`refId`) into the Trade History search bar immediately displays the matching trade.
- [ ] Tapping an order book row in the Pricing Assistant navigates to the trade form with pre-filled rate and volume.
- [ ] "Record Trade" form includes an accessible "Cancel / Back" button that returns to the previous screen.

### PWA Offline Resilience
- [ ] All local JS controller files (`js/*.js`) and view templates (`js/views/*.js`) are included in the Service Worker pre-cache list.
- [ ] The application successfully loads the shell and navigates between views when offline.

## 2026-08-25T13:06:54Z

Implement a Net Worth and Capital Cycle tracking system in the Bybit NGN P2P Trade Tracker application.

Working directory: c:/dev/p2p
Integrity mode: benchmark

## Requirements

### R1. Live Net Worth Dashboard Widget
Calculate and display the user's current Net Worth in both Naira (NGN) and USDT on the Dashboard view.
* Sum all bank cash from the app's reactive bank ledger.
* Fetch/display the Bybit USDT funding balance (combining active ad listings and free balances).
* Provide a real-time conversion between NGN and USDT using either the active Sell ad rate or a fallback rate.

### R2. Net Worth Snapshot Logging
Implement a lightweight snapshot system that lets the user record their balances at the end of a day or trading cycle.
* Add an "End Day / Save Snapshot" button on the Dashboard.
* The button opens a modal showing calculated bank cash and Bybit USDT balances, with an editable Reference Exchange Rate field.
* Save the completed snapshot (timestamp, bank cash, USDT balance, reference rate, net worth in NGN & USDT, and optional notes) to `localStorage` under `bybit_p2p_net_worth_snapshots`.

### R3. Historical Comparison & Trend Chart
* Display the difference (delta) in Net Worth (both absolute amount and percentage) compared to the previous snapshot.
* Add a "Net Worth Trend" line chart (using Chart.js) that visualizes the growth of total assets (NGN and USDT) across historical snapshots.

## Acceptance Criteria

### Net Worth Calculation
- [ ] The dashboard correctly calculates total bank cash and Bybit USDT balance.
- [ ] Net worth is displayed in both NGN and USDT base valuations.

### Snapshot Lifecycle
- [ ] Users can manually save a snapshot with a custom or prefilled exchange rate.
- [ ] Snapshots are persisted in LocalStorage and can be exported/imported.

### Comparison & Visualizations
- [ ] Delta metric correctly displays positive/negative percentage changes relative to the previous day/cycle.
- [ ] A line chart displays cumulative net worth value in NGN and USDT.

## 2026-08-26T07:19:57Z

# Teamwork Project Prompt — Draft

> Status: Launched
> Goal: Craft prompt → get user approval → delegate to teamwork_preview
> Requested team: small, focused team

This is a single self-contained fix; keep it small and focused.
Analyze the Bybit NGN P2P Trade Tracker application to identify and remove unused code (dead code), and refactor reusable components into separate modules. Generate a report of the changes.

Working directory: c:\dev\p2p
Integrity mode: benchmark

## Requirements

### R1. Dead Code Removal
Identify and safely remove unused functions, variables, files, and unreachable code paths across the codebase.

### R2. Component Extraction
Identify components or utility functions that have high reuse potential but are currently tightly coupled, and extract them into separate, cleanly imported ES modules.

### R3. Refactoring Report
Generate a detailed report named `refactor_report.md` in the working directory that lists exactly what dead code was removed and which components were extracted.

## Acceptance Criteria

### Verification
- [ ] All existing automated tests must pass after the removals and refactoring are complete.
- [ ] `refactor_report.md` is present in the working directory and documents the changes.
- [ ] No application functionality is broken (verified via test suite).

## 2026-09-01T11:17:13Z

This is a single self-contained fix; keep it small and focused.
Research Bybit P2P API endpoints (specifically `/v5/p2p/item/personal/list` and related active ad list APIs), review the Bybit P2P Tracker codebase (`server.js`, `js/bybitService.js`, `js/dashboard.js`), diagnose why active Buy Ads on Bybit are not returning or displaying in the app, and fix the code to correctly fetch and display both Buy and Sell active ads.

Working directory: c:\dev\p2p

## Requirements

### R1. Bybit P2P API Research & Endpoint Diagnosis
Inspect the actual Bybit P2P API request/response structures for personal advertisements (`POST /v5/p2p/item/personal/list` or alternative endpoints).
- Determine exact payload fields required by Bybit to return active Buy ads (`side=0` vs `side=1`, `side="BUY"`, `side="SELL"`, token, etc.).
- Identify why current requests return empty lists for active Buy ads.

### R2. Codebase Audit & Fix
- Audit `server.js` (proxy server endpoints) and `js/bybitService.js` / `js/dashboard.js`.
- Modify the proxy server and client-side sync logic so both active Buy ads and active Sell ads are reliably fetched and rendered.

### R3. Verification
- Verify that `fetchActiveAds` correctly returns active Buy ads.
- Verify that the Dashboard UI displays both Active Sell Ad and Active Buy Ad cards with full accurate metrics (live buy price, targeted USDT, fiat allocation).

## Acceptance Criteria

### Functionality
- [ ] Active Buy ads created on Bybit are successfully fetched by the proxy server and rendered on the Dashboard.
- [ ] Active Sell ads continue to work without regression.
- [ ] No syntax errors, uncaught promise rejections, or broken UI elements on the Dashboard.
