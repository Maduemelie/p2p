# Comprehensive UI & Visualization Architecture Analysis

**Agent**: `survey_explorer_3` (UI & Visualization Explorer)  
**Date**: 2026-08-25  
**Mission**: Investigate existing UI layout, styling, charting setup, modal patterns, and export/import UX to identify exact integration points for Net Worth and Capital Cycle tracking (R1: Live Net Worth Widget, R2: Snapshot Logging Modal, R3: Delta Badges & Net Worth Trend Line Chart).

---

## Executive Summary

The frontend is a vanilla ES module Single-Page Application (SPA) designed with a slate/navy glassmorphism design system (`css/styles.css`), responsive across desktop (sidebar navigation) and mobile (sticky header + bottom navigation). Dynamic views and modal structures are mounted into `#main-content` and `#modals-container` by `js/app.js`. Chart.js is loaded via CDN (`cdn.jsdelivr.net`) and cached offline by the Service Worker (`sw.js`). All state persists in `localStorage` via `js/store.js` with custom event dispatching (`store:updated`).

This analysis documents the exact architecture of existing components and specifies the integration points for implementing the Net Worth & Capital Cycle tracking features.

---

## 1. Dashboard HTML/CSS/JS Architecture

### 1.1 DOM Structure & Layout Flow
The dashboard view is generated in `js/views/dashboard.view.js` and mounted into `#main-content` as `<section class="app-view active" id="view-dashboard" data-view="dashboard">`.

Current card hierarchy in `dashboard.view.js`:
1. **View Header** (`lines 10–19`):
   - Title: "Dashboard" (`.view-title`)
   - Dynamic greeting (`#dashboard-greeting`: "Good morning / afternoon / evening")
   - Action button: `#btn-dash-quick-add` ("New Trade")
2. **Card ①: Portfolio Overview** (`lines 21–43`):
   - Class: `.card.mb-4`
   - Title: "Portfolio Overview" (`.card-title.mb-3`)
   - Grid: `.portfolio-grid` (3 columns on desktop, 1 column on `<600px` mobile)
     - Column 1: Bank Cash (`#stat-total-bank-cash`, `#stat-bank-cash-subtext`)
     - Column 2: USDT Inventory (`#stat-inventory-holding`, `#stat-inventory-cost`)
     - Column 3: Realized P&L (`#stat-net-pnl`, `#stat-pnl-rate`, `#pnl-roi-badge`)
3. **Card ②: Current Position Card (Active Sell Ad)** (`lines 45–82`):
   - ID: `#card-active-ad-spread`, Class: `.card.mb-4`
   - Header: Live badge (`#active-ad-badge`), title (`#active-ad-title`), refresh button (`#btn-sync-active-ad`)
   - Hero: `.ad-hero-section` displaying live ad price (`#metric-ad-sell-price`), quantity listed (`#metric-ad-qty-stock`)
   - Submetrics: `.ad-submetrics-grid` (Cost basis `#metric-ad-avg-buy-cost`, spread `#metric-ad-spread-usdt`, margin `#metric-ad-margin-pct`, projected profit `#metric-ad-projected-pnl`)
4. **Card ③: Capital Allocation Card** (`lines 84–122`):
   - ID: `#card-capital-allocation`, Class: `.card.mb-4`
   - Total P2P Balance (`#stat-bybit-live-total`)
   - Progress bar: `.allocation-bar-container` (`#allocation-progress-bar`, `#bar-segment-active`, `#bar-segment-free`)
   - Legend: `#stat-bybit-locked`, `#stat-bybit-free`, diff warning `#stat-inventory-diff`
5. **Card ④: Performance Chart Card** (`lines 124–143`):
   - Class: `.card.mb-4`
   - Header: `.chart-header` with title "Realized P&L Trend", subtitle, and segmented time filters (`#chart-time-filter` with `.seg-btn` buttons: `all`, `30d`, `7d`)
   - Chart canvas: `<canvas id="pnlChart"></canvas>` inside `.chart-container` (fixed height `200px`)
   - Empty state fallback: `#chart-empty-state`
6. **Card ⑤: Recent Activity Card** (`lines 145–160`):
   - ID: `#recent-activity-dashboard-card`, Class: `.card.mb-4`
   - Header: "Recent Activity" and link `#btn-view-all-history`
   - Container: `#dashboard-recent-list` (renders latest 5 enriched trades)
7. **Spacer**: `<div class="bottom-nav-spacer"></div>` (prevents mobile bottom nav collision).

### 1.2 CSS Classes & Design Tokens (`css/styles.css`)
- **Colors & Theme Tokens**:
  - Backgrounds: `--bg-base` (`#070B14`), `--bg-surface` (`#0E1626`), `--bg-card` (`rgba(18, 28, 47, 0.72)`), `--bg-glass-input` (`rgba(10, 16, 28, 0.65)`)
  - Accents: `--primary` (`#3B82F6`), `--success` (`#10B981`), `--danger` (`#F43F5E`), `--warning` (`#F59E0B`), `--info` (`#8B5CF6`)
  - Typography: `--font-sans` ('Plus Jakarta Sans'), `--font-mono` ('JetBrains Mono')
- **Card Styling** (`styles.css:745–785`):
  - `.card`: `border: 1px solid var(--border-card); border-radius: var(--radius-lg); padding: var(--sp-5); backdrop-filter: blur(16px);`
  - `.card-title`: `font-size: var(--text-subheading); font-weight: 700;`
  - `.card-header-flex`: `display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sp-3);`
- **Badges** (`styles.css:1335–1344`):
  - `.badge`: `font-size: var(--text-tiny); font-weight: 600; padding: 2px 8px; border-radius: var(--radius-full); display: inline-flex; align-items: center; gap: 4px;`
  - Variants: `.badge-success` (green subtle), `.badge-danger` (red subtle), `.badge-warning` (amber subtle), `.badge-primary` (blue subtle), `.badge-neutral`
- **Responsive Breakpoints**:
  - Desktop sidebar: `@media (min-width: 960px)` displays sidebar nav (`.sidebar-nav`, width `240px`), hides mobile header/footer.
  - Mobile: `<960px` displays sticky top header (`.app-header`) and fixed bottom nav (`.bottom-nav`).
  - Mobile Grids:
    - `.portfolio-grid`: `repeat(3, 1fr)` -> `@media (max-width: 600px)` drops to 1 col with dividers.
    - `.ad-submetrics-grid`: `repeat(3, 1fr)` -> `@media (max-width: 480px)` drops to 1 col with dashed dividers.
    - `.stat-chips`: `repeat(2, 1fr)` -> `@media (max-width: 480px)` drops to 1 col.

---

## 2. Modal & Dialog System

### 2.1 DOM & Template Mounting
Modals are rendered by `renderModalsView()` in `js/views/modals.view.js` and mounted into `<div id="modals-container"></div>` (in `index.html:137`) during application boot (`mountAppViews()` in `js/app.js:68`).

### 2.2 Standard Modal DOM Structure
```html
<div class="modal-backdrop hidden" id="modal-[feature]-backdrop">
  <div class="modal-card">
    <div class="modal-header">
      <div>
        <h3 class="modal-title">[Title]</h3>
        <p class="modal-subtitle">[Subtitle]</p>
      </div>
      <button class="btn-icon" id="btn-close-[feature]-modal" aria-label="Close">
        <i data-lucide="x"></i>
      </button>
    </div>
    <form id="form-[feature]" class="modal-body">
      <!-- Input fields, preview widgets, etc. -->
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" id="btn-cancel-[feature]-modal">Cancel</button>
        <button type="submit" class="btn btn-primary" id="btn-submit-[feature]">[Action]</button>
      </div>
    </form>
  </div>
</div>
```

### 2.3 Modal Lifecycle & Event Handling (`js/app.js:284–308`)
- **Opening**: `backdropEl.classList.remove('hidden')`.
- **Closing**: `backdropEl.classList.add('hidden')`.
- **Backdrop Click**: Global click listener in `app.js:303–307` closes any modal when clicking `.modal-backdrop` outside `.modal-card`.
- **Escape Key**: Global keydown listener in `app.js:285–300` adds `.hidden` to all `.modal-backdrop:not(.hidden)` elements.
- **Dynamic Confirm Modal** (`window.showConfirmModal(title, message, onConfirm, type)`): Rendered on-demand into `#confirm-modal-container` (`app.js:233–279`).
- **Toasts** (`window.showToast(message, type, duration)`): Appends notification elements into `#toast-container` (`app.js:198–223`), supports `'info'`, `'success'`, `'error'`.

---

## 3. Charting Setup & Chart.js Architecture

### 3.1 Library Availability & Loading
- Loaded via CDN script in `index.html:24`:
  `<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>`
- Global `Chart` object is available on `window.Chart`.
- Offline PWA Support: `sw.js:113–128` explicitly intercepts and caches all `cdn.jsdelivr.net` requests using a Cache-First strategy.

### 3.2 Existing Chart Rendering Pattern (`js/dashboard.js:445–568`)
- **Canvas Container**: `<div class="chart-container"><canvas id="pnlChart"></canvas>...</div>` (`dashboard.view.js:136–143`).
- **Lifecycle Management**:
  1. Module-scoped instance variable: `let chartInstance = null;` (`dashboard.js:11`).
  2. Before creating or updating:
     ```javascript
     if (chartInstance) {
       chartInstance.destroy();
       chartInstance = null;
     }
     ```
  3. Empty state handling: If data array is empty, toggle `.hidden` on `#chart-empty-state` and destroy instance.
- **Chart.js Configuration Standard**:
  - Type: `'line'`
  - Tension: `0.35` (smooth cubic bezier curves)
  - Colors:
    - Net positive: Border `#10B981`, linear gradient from `rgba(16, 185, 129, 0.35)` to `rgba(0, 0, 0, 0.0)`
    - Net negative: Border `#F43F5E`, linear gradient from `rgba(244, 63, 94, 0.35)` to `rgba(0, 0, 0, 0.0)`
  - Options:
    ```javascript
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(14, 22, 38, 0.95)',
          titleColor: '#F8FAFC',
          bodyColor: '#94A3B8',
          borderColor: 'rgba(255, 255, 255, 0.15)',
          borderWidth: 1,
          padding: 10,
          displayColors: false,
          callbacks: { label: (ctx) => `...` }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748B', font: { size: 11 } }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748B', font: { size: 11 }, callback: (val) => formatNGN(val, 0) }
        }
      }
    }
    ```

---

## 4. Export / Import UI & Mechanics

### 4.1 UI Triggers & Placement
- **History View** (`js/views/history.view.js:13–21`):
  - `#btn-export-csv-inline` (CSV)
  - `#btn-export-quick` (JSON)
- **Settings View Data Tab** (`js/views/settings.view.js:194–256`):
  - Action Card 1: "Export CSV" (`#btn-export-csv`)
  - Action Card 2: "JSON Backup" (`#btn-export-json`)
  - Action Card 3: "Restore" (`#input-import-json` `<input type="file" accept=".json">`)
  - Action Card 4: "Reset All Data" (`#btn-clear-all-data`)

### 4.2 File Download & Upload Mechanics (`js/export.js`)
- **Download Utility**: `triggerFileDownload(blob, filename)` (`export.js:13–22`):
  Creates temporary object URL via `URL.createObjectURL(blob)`, appends anchor element `<a>`, clicks, removes, and calls `URL.revokeObjectURL(url)`.
- **JSON Backup Schema**:
  ```javascript
  {
    version: 1,
    exportedAt: "2026-08-25T14:00:00.000Z",
    trades: [...],
    bankAccounts: [...],
    transfers: [...],
    openingInventory: {...}
    // Integration point: snapshots: [...]
  }
  ```
- **JSON Import Utility**: `importBackupJSON(file)` (`export.js:120–151`):
  Reads file with `FileReader.readAsText()`, validates structure, prompts confirmation, invokes `store.importAllData(data, true)`, and notifies via `window.showToast()`.

---

## 5. Exact Integration Points for Net Worth System

### 5.1 R1: Live Net Worth Dashboard Widget
- **Visual Location**: At the top of `view-dashboard` (directly beneath `.view-header` or integrated as a prominent Hero Card before/above Portfolio Overview).
- **Target Files**:
  - `js/views/dashboard.view.js`: Add `#card-net-worth` or hero stats component.
  - `js/dashboard.js`: Add `renderNetWorthWidget()` and call it in `initDashboard()` and inside `window.addEventListener('store:updated')`.
- **Component Anatomy & ID Blueprint**:
  - Container: `<div class="card mb-4" id="card-net-worth">`
  - Header:
    - Title: `Live Net Worth`
    - Delta Badge: `<span class="badge badge-success" id="net-worth-delta-badge"><i data-lucide="trending-up"></i> +₦0.00 (+0.0%)</span>`
    - Action: `<button class="btn btn-xs btn-primary" id="btn-open-snapshot-modal"><i data-lucide="camera"></i> <span>End Day / Save Snapshot</span></button>`
  - Primary Hero Displays:
    - NGN Total: `<div class="hero-stat-value text-success font-mono" id="stat-net-worth-ngn">₦0.00</div>`
    - USDT Total: `<div class="hero-stat-sub font-mono text-accent" id="stat-net-worth-usdt">0.00 USDT</div>`
  - Breakdown / Sub-metrics Grid (`.ad-submetrics-grid` or `.stat-chips`):
    - Cell 1: **Bank Cash Total** (`#stat-nw-bank-cash`) — derived from `store.getComputedBankBalances()`
    - Cell 2: **Bybit USDT Balance** (`#stat-nw-bybit-usdt`) — derived from Bybit total balance (free + locked in ads)
    - Cell 3: **Conversion Rate** (`#stat-nw-conversion-rate`) — live Sell ad rate, or fallback (cost basis / market depth / opening rate) with reference badge.

### 5.2 R2: Net Worth Snapshot Logging & Snapshot Modal
- **Visual Location & Trigger**: Trigger button `#btn-open-snapshot-modal` on Dashboard view header / Net Worth Card.
- **Target Files**:
  - `js/views/modals.view.js`: Add `#modal-snapshot-backdrop`.
  - `js/dashboard.js`: Wire open/close modal handlers, form submission, live calculated net worth preview on rate edit.
  - `js/store.js`: Add storage key `bybit_p2p_net_worth_snapshots`, CRUD methods (`getSnapshots()`, `addSnapshot()`, `deleteSnapshot()`), and include snapshots in `exportAllData()`, `importAllData()`, and `clearAllData()`.
- **Modal Structure Blueprint**:
  - Modal ID: `#modal-snapshot-backdrop`
  - Form ID: `#form-save-snapshot`
  - Inputs:
    1. Snapshot Date & Time (`#input-snapshot-date`, `datetime-local`, default now)
    2. Bank Cash Readout (₦) (`#snapshot-preview-bank-cash`)
    3. USDT Balance Readout (`#snapshot-preview-usdt-balance`)
    4. Reference Exchange Rate input (`#input-snapshot-rate`, `number`, step `0.01`, required, pre-filled with live active sell ad rate or latest rate)
    5. Calculated Live Net Worth Preview:
       - Net Worth NGN (`#snapshot-calc-ngn`) = `Bank Cash + (USDT Balance * Reference Rate)`
       - Net Worth USDT (`#snapshot-calc-usdt`) = `(Bank Cash / Reference Rate) + USDT Balance`
    6. Notes (`#input-snapshot-notes`, `text`, optional)
  - Footer: Cancel `#btn-cancel-snapshot-modal` and Save `#btn-save-snapshot-submit`.
- **Snapshot Schema**:
  ```javascript
  {
    id: "snapshot_m1abc_123",
    timestamp: "2026-08-25T14:00:00.000Z",
    date: "2026-08-25T14:00:00.000Z",
    bankCashNGN: 5200000.00,
    usdtBalance: 3500.00,
    referenceRate: 1510.50,
    netWorthNGN: 10486750.00,
    netWorthUSDT: 6942.57,
    notes: "End of trading day"
  }
  ```

### 5.3 R3: Historical Comparison & Trend Chart + Export/Import UX
- **Delta Indicator Integration**:
  - Compare current live Net Worth (or latest snapshot) against the preceding snapshot in `store.getSnapshots()`.
  - Absolute Difference: `deltaNGN = currentNetWorthNGN - prevNetWorthNGN`
  - Percentage Difference: `pctDelta = prevNetWorthNGN > 0 ? (deltaNGN / prevNetWorthNGN) * 100 : 0`
  - Badge Rendering: Apply `.badge-success` for positive delta (`trending-up` icon) or `.badge-danger` for negative delta (`trending-down` icon).
- **Net Worth Trend Line Chart**:
  - DOM Placement: In `dashboard.view.js`, either add a dedicated Net Worth Trend card or provide a tabbed selector (`Realized P&L` | `Net Worth Trend`) on the chart card.
  - Canvas ID: `<canvas id="netWorthChart"></canvas>` (or dynamic dataset switching on the chart canvas).
  - Chart.js Instance: Managed cleanly with destroy/create lifecycle.
  - Data Mapping: Sorted historical snapshots chronologically (`labels: dateLabels`, `datasets: [{ label: 'Net Worth (₦)', data: [snapshot.netWorthNGN, ...], ... }]`).
  - Empty state: Show empty state when snapshots count `< 1` or `< 2`.
- **Export & Import UX Integration**:
  - `js/export.js`:
    - `exportFullBackupJSON()`: Store exports include `snapshots: store.getSnapshots()`.
    - `importBackupJSON()`: Restores `snapshots` array to `bybit_p2p_net_worth_snapshots`.
  - `js/store.js`:
    - Update `exportAllData()`, `importAllData()`, and `clearAllData()` to handle `STORAGE_KEYS.SNAPSHOTS`.

---

## 6. Verification and Risk Assessment

1. **Design System Consistency**:
   All proposed UI elements use existing CSS variables (`--bg-card`, `--success`, `--danger`, `--primary`, `--font-mono`), standard card containers (`.card`), badge classes (`.badge`, `.badge-success`), and modal classes (`.modal-backdrop`, `.modal-card`).
2. **Chart.js Memory Leaks**:
   Ensure all chart instances (both `pnlChart` and `netWorthChart`) track instance variables and invoke `.destroy()` before re-instantiation.
3. **PWA Offline Pre-caching**:
   Ensure `sw.js` cache list remains aligned if new modules or templates are introduced (all existing view files are already listed in `STATIC_ASSETS`).
4. **Zero-breaking Changes**:
   All 133 existing tests across Tiers 1–4 passed with 100% pass rate. Adding the Net Worth card and snapshot modal adheres strictly to existing interface contracts.
