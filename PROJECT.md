# Project: Bybit NGN P2P Trade Tracker - Net Worth & Capital Cycle System

## Architecture
- **Tech Stack**: Vanilla ES Modules SPA (`js/app.js`), Express local proxy & Vercel serverless (`server.js`, `api/*.js`), Service Worker (`sw.js`), Chart.js CDN, Lucide icons.
- **Data Flow & Reactivity**:
  1. Bank Ledger: `store.getComputedBankBalances()` aggregates live bank accounts (`initialBalance + SELLs - BUYs + Inflows - Outflows`).
  2. Bybit Live Balance: `bybitService.fetchFundingBalance('USDT')` + `fetchActiveAds('1', 'USDT')` computes `totalP2P = adAllocation + freeForBuyback`. Fallback to internal FIFO inventory `remainingInventoryUSDT` when offline.
  3. Real-time Exchange Rate: Active Sell Ad price (`status=10/20/2`) > Latest Trade rate > FIFO avg buy cost > Opening default cost basis > Fallback `1500.00`.
  4. Net Worth Engine: Computes $\text{NW}_{\text{NGN}} = T_{\text{bank}} + (U_{\text{bybit}} \times R_{\text{ref}})$ and $\text{NW}_{\text{USDT}} = U_{\text{bybit}} + (T_{\text{bank}} / R_{\text{ref}})$.
  5. Persistence: Snapshots saved under `bybit_p2p_net_worth_snapshots` in localStorage, integrated with reactive event bus `store:updated` and JSON backup/restore.
  6. Visualization: Chart.js multi-series / toggle line chart displaying historical Net Worth trend and sequential delta calculations.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Bank Cash Ledger Aggregation | Sum of reactive balances across all linked bank accounts via `store.getComputedBankBalances()` | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Bybit USDT Balance Resolution | Total USDT funding balance (ad allocation + free balance) with offline FIFO inventory fallback | M1 | ORIGINAL_REQUEST §R1 |
| 3 | Real-Time Reference Rate Engine | Priority-based rate resolution (Active Sell Ad price > trade rate > FIFO cost > fallback) | M1 | ORIGINAL_REQUEST §R1 |
| 4 | Dual-Currency Net Worth Calculation | Mathematical calculation of total wealth in both NGN and USDT with zero/negative guards | M1 | ORIGINAL_REQUEST §R1 |
| 5 | Snapshot Data Store & LocalStorage | CRUD methods for `bybit_p2p_net_worth_snapshots` with validation and reactive event dispatch | M1 | ORIGINAL_REQUEST §R2 |
| 6 | Full Backup JSON Import/Export | Integration of snapshots array into `exportAllData()` and `importAllData()` with schema checks | M1 | ORIGINAL_REQUEST §R3 |
| 7 | Live Net Worth Dashboard Widget UI | Hero card on Dashboard displaying dual-currency Net Worth, breakdown metrics, and live indicators | M2 | ORIGINAL_REQUEST §R1 |
| 8 | Reactive Live Widget Updates | Auto-recalculating widget values on `store:updated` and Bybit sync events | M2 | ORIGINAL_REQUEST §R1 |
| 9 | Live Delta Badge on Dashboard | Visual badge displaying absolute and % delta between live Net Worth and the latest saved snapshot | M2 | ORIGINAL_REQUEST §R3 |
| 10 | "End Day / Save Snapshot" Button & Modal | Dashboard button launching modal pre-populated with live calculated bank cash and Bybit USDT | M3 | ORIGINAL_REQUEST §R2 |
| 11 | Interactive Reference Rate in Modal | Editable reference rate field with instant live recalculated Net Worth preview | M3 | ORIGINAL_REQUEST §R2 |
| 12 | Snapshot Submission & Validation | Form validation (rate > 0, valid timestamp, optional notes) and persistence to localStorage | M3 | ORIGINAL_REQUEST §R2 |
| 13 | Historical Snapshot Delta Calculation | Computing sequential absolute and percentage deltas across chronological snapshots with 0-divisor guards | M4 | ORIGINAL_REQUEST §R3 |
| 14 | Net Worth Trend Line Chart | Chart.js visualization of historical snapshot asset growth (NGN & USDT) with responsive layout and empty state | M4 | ORIGINAL_REQUEST §R3 |
| 15 | Snapshot Management / History UI | View historical snapshot entries, delete/manage records, and inspect snapshot notes | M4 | ORIGINAL_REQUEST §R3 |
| 16 | E2E Requirement-Driven Verification | Pass 100% of opaque-box E2E test suite (Tiers 1-4) | M5 | Project Requirement |
| 17 | Adversarial Hardening & Forensic Audit | White-box stress testing (Tier 5) and forensic integrity audit verification | M5 | Project Requirement |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Core Calculations & Snapshot Store Engine | Calculation formulas, rate resolution, snapshot store CRUD, and backup/restore integration | none | DONE |
| M2 | Live Net Worth Dashboard Widget | Hero widget UI in `dashboard.view.js` and reactive rendering in `dashboard.js` with live delta badge | M1 | DONE |
| M3 | End Day / Save Snapshot Modal & Persistence | Modal markup in `modals.view.js`, form handler, rate override preview, validation, and storage | M1, M2 | DONE |
| M4 | Historical Comparison & Trend Chart | Sequential delta calculation, Chart.js trend visualization, history management, and import/export verification | M1, M2, M3 | DONE |
| M5 | Final E2E Test Pass & Adversarial Hardening | Pass 100% E2E test suite (Tiers 1-4) and complete Tier 5 adversarial verification + forensic audit | M1, M2, M3, M4 | DONE |

## Interface Contracts
### `js/utils.js` / Calculation Engine ↔ UI Views
- `calculateTotalBankCash(computedBankBalances: Map | Array | Object): number`
  - Input: Result from `store.getComputedBankBalances()`
  - Output: Sum of `rec.currentBalance` across all accounts.
- `resolveReferenceRate(options: { activeSellAd?: object, latestTrade?: object, fifoAvgBuyCost?: number, openingDefaultRate?: number, fallbackRate?: number }): number`
  - Returns positive numeric rate in NGN per USDT.
- `calculateNetWorth(totalBankCashNgn: number, totalUsdt: number, referenceRate: number): { netWorthNgn: number, netWorthUsdt: number }`
  - Formulas: $\text{NW}_{\text{NGN}} = T_{\text{bank}} + (U_{\text{bybit}} \times R_{\text{ref}})$, $\text{NW}_{\text{USDT}} = U_{\text{bybit}} + (T_{\text{bank}} / R_{\text{ref}})$.
- `calculateSnapshotDelta(current: object, previous: object): { deltaNgn: number, pctDeltaNgn: number, deltaUsdt: number, pctDeltaUsdt: number }`
  - Calculates difference and % change with division-by-zero protection.

### `js/store.js` ↔ Application Layer
- `STORAGE_KEYS.NET_WORTH_SNAPSHOTS = 'bybit_p2p_net_worth_snapshots'`
- Snapshot Schema:
  ```json
  {
    "id": "snp_1724590800000_abc123",
    "timestamp": "2026-08-25T13:00:00.000Z",
    "bankCash": 1250000.50,
    "usdtBalance": 1500.25,
    "referenceRate": 1535.00,
    "netWorthNgn": 3552884.25,
    "netWorthUsdt": 2314.58,
    "notes": "End of trading day snapshot",
    "createdAt": 1724590800000
  }
  ```
- Store Methods:
  - `store.getSnapshots(): Array<Snapshot>` (sorted chronologically)
  - `store.saveSnapshot(snapshotData): Snapshot` (validates, assigns id/createdAt, saves to localStorage, fires `store:updated`)
  - `store.deleteSnapshot(snapshotId): boolean` (removes snapshot, fires `store:updated`)
  - `store.clearSnapshots(): void`
  - Integration: `store.exportAllData()` includes `snapshots: store.getSnapshots()`, `store.importAllData()` parses and restores snapshots.

## Code Layout
- `js/store.js`: Storage keys, snapshot CRUD, import/export schema integration.
- `js/utils.js`: Pure mathematical formulas for bank cash aggregation, rate priority resolution, net worth valuation, and snapshot delta computation.
- `js/views/dashboard.view.js`: Live Net Worth Hero card markup, breakdown pills, delta badge, Net Worth Trend canvas, and snapshot history table.
- `js/views/modals.view.js`: End Day / Save Snapshot modal markup with editable reference rate and notes.
- `js/dashboard.js`: Live widget calculations, modal lifecycle, reactive event listeners, Chart.js Net Worth trend rendering, currency filter toggle, and snapshot deletion handling.
- `js/export.js`: JSON backup/restore handler for snapshots.
- `test/`: Automated test suites covering calculations, store persistence, modal validation, historical deltas, charting lifecycle, and E2E scenarios.
