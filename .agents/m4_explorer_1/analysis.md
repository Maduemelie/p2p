# Milestone 4: Net Worth Growth Trend Chart & Historical Snapshot Log UI Analysis

**Agent**: `m4_explorer_1` (M4 Chart & History UI Layout Explorer)  
**Date**: 2026-08-25  
**Milestone**: Milestone 4 (Historical Comparison, Trend Chart & Import/Export Integration)  
**Target Files**: `js/views/dashboard.view.js`, `css/styles.css`, `js/dashboard.js`

---

## 1. Executive Summary

Milestone 4 introduces historical asset progression analytics to the Bybit NGN P2P Trade Tracker. This investigation provides the complete structural DOM markup, exact HTML template strings, dynamic row renderers, and responsive theme-aware CSS rules for:

1. **`#card-net-worth-trend`**: The dedicated analytics card positioned seamlessly on the Dashboard view.
2. **Chart Header & Currency Filter Controls**: Title header with a 3-way segmented control (`#filter-chart-both`, `#filter-chart-ngn`, `#filter-chart-usdt`) to toggle between dual-axis and single-currency visualizations without vertical scale distortion.
3. **Trend Chart Canvas Container**: Responsive `<canvas id="netWorthTrendChart"></canvas>` wrapper featuring a zero-data / baseline empty state banner (`#chart-networth-empty-state`).
4. **Historical Snapshot Log (`#table-snapshot-history`)**: A comprehensive table/list displaying chronological snapshots with timestamp, liquid bank cash, Bybit USDT holdings, reference exchange rate, total Net Worth (NGN & USDT), sequential growth delta badges ($\Delta\text{NGN}$ and $\Delta\text{USDT}$), optional merchant notes, and single-click delete action buttons (`.btn-delete-snapshot`).
5. **Responsive & Theme Fidelity**: 100% compliant with the existing Slate/Navy glassmorphic dark theme, crisp light mode theme (`[data-theme="light"]`), mobile viewports down to 320px, and keyboard/screen-reader accessibility standards.

---

## 2. Component Architecture & DOM Hierarchy

```
#view-dashboard (.app-view)
│
├── ⓪ #card-net-worth (Live Net Worth Hero Widget)
│
├── ⓪.5 #card-net-worth-trend (Net Worth Growth Trend Card)
│   ├── .card-header-flex (Card Title + Actions)
│   │   ├── Header Titles ("Net Worth Growth Trend", Subtitle)
│   │   └── Header Actions
│   │       ├── #chart-currency-filter (.segmented-control.segmented-sm)
│   │       │   ├── #filter-chart-both [active] ("Both")
│   │       │   ├── #filter-chart-ngn ("₦ NGN")
│   │       │   └── #filter-chart-usdt ("$ USDT")
│   │       └── #btn-toggle-snapshot-log (.btn.btn-xs.btn-outline)
│   │
│   ├── .chart-container.net-worth-chart-container
│   │   ├── <canvas id="netWorthTrendChart"></canvas>
│   │   └── #chart-networth-empty-state (.chart-empty-state)
│   │
│   └── #snapshot-history-section (.snapshot-history-section)
│       ├── .snapshot-section-header
│       │   ├── Subheading ("Snapshot History Log")
│       │   └── #snapshot-history-count (Badge / text: "X snapshots")
│       │
│       ├── #snapshot-history-empty (.snapshot-history-empty.hidden)
│       │
│       └── #snapshot-table-wrapper (.table-responsive)
│           └── #table-snapshot-history (.table.snapshot-history-table)
│               ├── thead (Date, Bank Cash, USDT, Rate, NW NGN, NW USDT, Δ Growth, Notes, Action)
│               └── #snapshot-history-tbody (Dynamic rows with delta badges & delete buttons)
│
├── ① Portfolio Overview Card
├── ② Current Position Card (#card-active-ad-spread)
├── ③ Capital Allocation Card (#card-capital-allocation)
├── ④ Performance Chart Card (Realized P&L Trend)
└── ⑤ Recent Activity Card (#recent-activity-dashboard-card)
```

---

## 3. Exact HTML Template Strings for `js/views/dashboard.view.js`

### 3.1. Main Dashboard Card Template Insertion

The following markup is inserted directly into `renderDashboardView()` in `js/views/dashboard.view.js` immediately following `#card-net-worth` (line 102):

```html
      <!-- ⓪.5 Net Worth Growth Trend & Snapshot History Card (Milestone 4) -->
      <div class="card mb-4 net-worth-trend-card" id="card-net-worth-trend" role="region" aria-label="Net Worth Growth Trend and History">
        
        <!-- Card Header: Title & Currency Toggle Controls -->
        <div class="card-header-flex mb-3">
          <div>
            <div class="trend-card-badge-group">
              <span class="badge badge-primary tiny">Historical Analytics</span>
            </div>
            <h3 class="card-title mt-1">Net Worth Growth Trend</h3>
            <p class="card-subtitle">Historical wealth trajectory & asset growth across saved snapshots</p>
          </div>

          <div class="trend-header-controls">
            <!-- 3-Way Currency Filter Toggle -->
            <div class="segmented-control segmented-sm" id="chart-currency-filter" role="group" aria-label="Chart Currency Filter">
              <button type="button" class="seg-btn active" id="filter-chart-both" data-currency="both" title="Show both NGN and USDT curves">
                <span>Both</span>
              </button>
              <button type="button" class="seg-btn" id="filter-chart-ngn" data-currency="ngn" title="Show Naira valuation only">
                <span>₦ NGN</span>
              </button>
              <button type="button" class="seg-btn" id="filter-chart-usdt" data-currency="usdt" title="Show USDT valuation only">
                <span>$ USDT</span>
              </button>
            </div>

            <!-- Toggle History View Action Button -->
            <button type="button" class="btn btn-xs btn-outline" id="btn-toggle-snapshot-log" title="Expand or collapse snapshot history table" aria-expanded="true">
              <i data-lucide="list"></i>
              <span id="btn-toggle-snapshot-log-text">Snapshot Log</span>
              <span class="badge badge-neutral tiny ml-1" id="snapshot-history-count-badge">0</span>
            </button>
          </div>
        </div>

        <!-- Chart Canvas Container -->
        <div class="chart-container net-worth-chart-container mb-4" id="net-worth-chart-container">
          <canvas id="netWorthTrendChart" aria-label="Net Worth Growth Trend Line Chart" role="img"></canvas>
          
          <!-- Empty State Banner (Visible when < 2 snapshots exist) -->
          <div class="chart-empty-state" id="chart-networth-empty-state">
            <div class="empty-icon-box mb-2">
              <i data-lucide="trending-up"></i>
            </div>
            <p class="empty-title">No snapshot history yet</p>
            <p class="empty-subtitle">Click <strong>"End Day / Snapshot"</strong> above to record your first closing baseline.</p>
          </div>
        </div>

        <!-- Historical Snapshot Log Section -->
        <div class="snapshot-history-section border-top pt-3" id="snapshot-history-section">
          
          <div class="snapshot-section-header mb-3">
            <div class="d-flex align-items-center gap-2">
              <div class="metric-icon-box primary-tint nw-icon-sm">
                <i data-lucide="history"></i>
              </div>
              <h4 class="card-title text-supporting">Recorded Snapshot Ledger</h4>
            </div>
            <div class="d-flex align-items-center gap-2">
              <span class="text-muted small" id="snapshot-history-count">0 snapshots recorded</span>
            </div>
          </div>

          <!-- Empty State Placeholder for Table -->
          <div class="snapshot-history-empty hidden" id="snapshot-history-empty">
            <div class="empty-state py-4">
              <div class="empty-icon-box">
                <i data-lucide="camera-off"></i>
              </div>
              <p class="empty-title">No snapshots saved yet</p>
              <p class="empty-subtitle">End-of-day snapshots will appear here with sequential growth calculations.</p>
            </div>
          </div>

          <!-- Responsive Table Container -->
          <div class="table-responsive snapshot-table-wrapper" id="snapshot-table-wrapper">
            <table class="table snapshot-history-table" id="table-snapshot-history" aria-label="Historical Net Worth Snapshots">
              <thead>
                <tr>
                  <th scope="col" class="th-date">Date & Time</th>
                  <th scope="col" class="th-bank text-right">Bank Cash (₦)</th>
                  <th scope="col" class="th-usdt text-right">Bybit USDT</th>
                  <th scope="col" class="th-rate text-right">Ref Rate</th>
                  <th scope="col" class="th-networth text-right">Net Worth (NGN)</th>
                  <th scope="col" class="th-networth-usdt text-right">Net Worth (USDT)</th>
                  <th scope="col" class="th-delta text-center">Sequential Δ</th>
                  <th scope="col" class="th-notes">Notes</th>
                  <th scope="col" class="th-actions text-center">Action</th>
                </tr>
              </thead>
              <tbody id="snapshot-history-tbody">
                <!-- Dynamically injected via renderSnapshotHistoryTable() -->
              </tbody>
            </table>
          </div>
        </div>

      </div>
```

---

### 3.2. Dynamic Row Renderer Template Function

In `js/dashboard.js` (or a dedicated component renderer), the following function generates individual table rows with full formatting, sequential delta calculations, tooltips, and action handlers:

```javascript
/**
 * Render HTML string for a single snapshot table row in #table-snapshot-history
 * 
 * @param {Object} snapshot - Current snapshot record
 * @param {Object|null} previousSnapshot - Chronologically preceding snapshot
 * @param {number} index - Chronological zero-based index
 * @returns {string} HTML table row string
 */
export function renderSnapshotHistoryRow(snapshot, previousSnapshot, index) {
  const isBaseline = !previousSnapshot;
  const delta = calculateSnapshotDelta(snapshot, previousSnapshot);

  // Delta badge styling
  let deltaBadgeHtml = '';
  if (isBaseline) {
    deltaBadgeHtml = `
      <span class="badge badge-neutral tiny" title="First recorded snapshot established as baseline">
        <i data-lucide="anchor"></i>
        <span>Baseline</span>
      </span>
    `;
  } else {
    const isPositive = delta.deltaNgn > 0.005;
    const isNegative = delta.deltaNgn < -0.005;
    const badgeClass = isPositive ? 'badge-success' : (isNegative ? 'badge-danger' : 'badge-neutral');
    const icon = isPositive ? 'trending-up' : (isNegative ? 'trending-down' : 'minus');
    const ngnText = formatDeltaBadgeText(delta.deltaNgn, delta.pctDeltaNgn);
    const usdtText = formatDeltaUsdtText(delta.deltaUsdt);

    deltaBadgeHtml = `
      <div class="snapshot-delta-stack">
        <span class="badge ${badgeClass} tiny" title="Delta NGN: ${ngnText}">
          <i data-lucide="${icon}"></i>
          <span>${ngnText}</span>
        </span>
        <span class="snapshot-delta-sub font-mono tiny text-muted" title="Delta USDT: ${usdtText}">
          ${usdtText}
        </span>
      </div>
    `;
  }

  // Safe formatting
  const formattedDate = snapshot.timestamp ? formatDateTime(snapshot.timestamp) : '—';
  const formattedBankCash = formatNGN(snapshot.bankCash || 0);
  const formattedUsdt = formatUSDT(snapshot.usdtBalance || 0);
  const formattedRate = formatRate(snapshot.referenceRate || 1500);
  const formattedNwNgn = formatNGN(snapshot.netWorthNgn || 0);
  const formattedNwUsdt = formatUSDT(snapshot.netWorthUsdt || 0);
  const safeNotes = snapshot.notes ? escapeHtml(snapshot.notes) : '';
  const safeId = escapeHtml(snapshot.id);

  return `
    <tr class="snapshot-row" data-snapshot-id="${safeId}" id="row-${safeId}">
      <td class="td-date font-mono text-supporting">
        <div class="td-date-wrapper">
          <i data-lucide="calendar" class="td-icon-muted"></i>
          <span>${formattedDate}</span>
        </div>
      </td>
      <td class="td-bank font-mono text-right text-success">${formattedBankCash}</td>
      <td class="td-usdt font-mono text-right text-accent">${formattedUsdt}</td>
      <td class="td-rate font-mono text-right text-muted">${formattedRate}</td>
      <td class="td-networth font-mono text-right font-bold ${snapshot.netWorthNgn >= 0 ? 'text-success' : 'text-danger'}">${formattedNwNgn}</td>
      <td class="td-networth-usdt font-mono text-right font-bold text-accent">${formattedNwUsdt}</td>
      <td class="td-delta text-center">${deltaBadgeHtml}</td>
      <td class="td-notes text-muted small">
        ${safeNotes ? `<span class="snapshot-notes-text" title="${safeNotes}">${safeNotes}</span>` : '<span class="text-disabled">—</span>'}
      </td>
      <td class="td-actions text-center">
        <button type="button" class="btn-icon btn-xs text-danger btn-delete-snapshot" data-snapshot-id="${safeId}" data-id="${safeId}" title="Delete Snapshot (${formattedDate})" aria-label="Delete Snapshot ${safeId}">
          <i data-lucide="trash-2"></i>
        </button>
      </td>
    </tr>
  `;
}
```

---

## 4. Complete CSS Stylesheet Additions for `css/styles.css`

The following CSS rules are appended to `css/styles.css` under the Milestone 4 section:

```css
/* ==========================================================================
   NET WORTH GROWTH TREND & SNAPSHOT HISTORY (Milestone 4)
   ========================================================================== */

/* Main Card Wrapper */
.net-worth-trend-card {
  position: relative;
  background: linear-gradient(135deg, rgba(18, 28, 47, 0.82) 0%, rgba(14, 22, 38, 0.90) 100%);
  border: 1px solid var(--border-default);
  box-shadow: var(--shadow-md), inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

[data-theme="light"] .net-worth-trend-card {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.92) 0%, rgba(248, 250, 252, 0.88) 100%);
  border: 1px solid var(--border-card);
  box-shadow: var(--shadow-sm);
}

.trend-card-badge-group {
  margin-bottom: var(--sp-1);
}

/* Header Controls & Filter Group */
.trend-header-controls {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
}

#chart-currency-filter .seg-btn {
  padding: 4px 10px;
  font-size: var(--text-caption);
  font-weight: 600;
}

#chart-currency-filter .seg-btn.active {
  background: var(--primary);
  color: #FFFFFF;
  box-shadow: 0 2px 6px var(--primary-glow);
}

/* Chart Canvas Container */
.net-worth-chart-container {
  position: relative;
  width: 100%;
  height: 280px;
  border-radius: var(--radius-md);
  background: rgba(7, 11, 20, 0.40);
  border: 1px solid rgba(255, 255, 255, 0.04);
  padding: var(--sp-2);
}

[data-theme="light"] .net-worth-chart-container {
  background: rgba(241, 245, 249, 0.60);
  border: 1px solid rgba(0, 0, 0, 0.05);
}

/* Empty State Canvas Overlay */
#chart-networth-empty-state {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--bg-surface);
  border-radius: var(--radius-md);
  border: 1px dashed var(--border-elevated);
  padding: var(--sp-4);
  text-align: center;
  z-index: 2;
}

#chart-networth-empty-state .empty-icon-box {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  background: var(--primary-subtle);
  color: var(--primary-text);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

#chart-networth-empty-state .empty-icon-box svg {
  width: 24px;
  height: 24px;
}

/* ==========================================================================
   SNAPSHOT HISTORY TABLE & LEDGER STYLES
   ========================================================================== */

.snapshot-history-section {
  border-top: 1px solid var(--border-default);
}

.snapshot-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.table-responsive.snapshot-table-wrapper {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-default);
  background: var(--bg-surface);
}

.snapshot-history-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-supporting);
  white-space: nowrap;
}

.snapshot-history-table thead th {
  background: var(--bg-surface-elevated);
  color: var(--text-muted);
  font-size: var(--text-tiny);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: var(--sp-3) var(--sp-4);
  border-bottom: 1px solid var(--border-elevated);
  position: sticky;
  top: 0;
  z-index: 1;
}

.snapshot-history-table tbody td {
  padding: var(--sp-3) var(--sp-4);
  border-bottom: 1px solid var(--border-default);
  vertical-align: middle;
}

.snapshot-history-table tbody tr:last-child td {
  border-bottom: none;
}

.snapshot-history-table tbody tr {
  transition: background var(--duration-fast) var(--ease-out);
}

.snapshot-history-table tbody tr:hover {
  background: var(--bg-hover);
}

/* Table Column Widths & Alignments */
.snapshot-history-table .th-date,
.snapshot-history-table .td-date {
  min-width: 155px;
}

.snapshot-history-table .th-bank,
.snapshot-history-table .td-bank {
  min-width: 130px;
}

.snapshot-history-table .th-usdt,
.snapshot-history-table .td-usdt {
  min-width: 120px;
}

.snapshot-history-table .th-rate,
.snapshot-history-table .td-rate {
  min-width: 110px;
}

.snapshot-history-table .th-networth,
.snapshot-history-table .td-networth {
  min-width: 145px;
}

.snapshot-history-table .th-networth-usdt,
.snapshot-history-table .td-networth-usdt {
  min-width: 130px;
}

.snapshot-history-table .th-delta,
.snapshot-history-table .td-delta {
  min-width: 175px;
}

.snapshot-history-table .th-notes,
.snapshot-history-table .td-notes {
  min-width: 160px;
  max-width: 260px;
}

.snapshot-history-table .th-actions,
.snapshot-history-table .td-actions {
  min-width: 70px;
}

/* Date Icon Alignment */
.td-date-wrapper {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.td-icon-muted {
  width: 13px;
  height: 13px;
  color: var(--text-muted);
}

/* Sequential Delta Badge & Subtext Stack */
.snapshot-delta-stack {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.snapshot-delta-sub {
  font-size: var(--text-tiny);
  line-height: 1;
}

/* Notes Text Truncation */
.snapshot-notes-text {
  display: block;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Delete Action Button */
.btn-delete-snapshot {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  transition: all var(--duration-fast) var(--ease-out);
}

.btn-delete-snapshot:hover {
  background: var(--danger-subtle);
  color: var(--danger);
  border-color: var(--danger-subtle);
  transform: scale(1.05);
}

.btn-delete-snapshot svg {
  width: 13px;
  height: 13px;
}

/* ==========================================================================
   RESPONSIVE BREAKPOINTS (Mobile & Tablet)
   ========================================================================== */

@media (max-width: 768px) {
  .net-worth-chart-container {
    height: 240px;
  }

  .trend-header-controls {
    width: 100%;
    justify-content: space-between;
    margin-top: var(--sp-2);
  }

  .snapshot-history-table thead th,
  .snapshot-history-table tbody td {
    padding: var(--sp-2) var(--sp-3);
  }
}

@media (max-width: 480px) {
  .net-worth-chart-container {
    height: 200px;
    padding: var(--sp-1);
  }

  .trend-header-controls {
    flex-direction: column;
    align-items: stretch;
    gap: var(--sp-2);
  }

  #chart-currency-filter {
    width: 100%;
  }

  #chart-currency-filter .seg-btn {
    flex: 1;
    text-align: center;
    padding: 6px 4px;
    font-size: var(--text-tiny);
  }

  #btn-toggle-snapshot-log {
    width: 100%;
    justify-content: center;
  }

  .snapshot-section-header {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-2);
  }
}
```

---

## 5. Integration Guide for `js/dashboard.js`

To connect the UI markup with the data model, `js/dashboard.js` implements the following lifecycle and event handling patterns:

### 5.1. Module State Variables
```javascript
let trendChartInstance = null;
let currentTrendCurrency = 'both'; // 'both' | 'ngn' | 'usdt'
let isSnapshotLogExpanded = true;
```

### 5.2. Chart Rendering Logic
```javascript
/**
 * Render or update Net Worth Growth Trend line chart (#netWorthTrendChart)
 */
export function updateNetWorthTrendChart() {
  const canvas = document.getElementById('netWorthTrendChart');
  const emptyState = document.getElementById('chart-networth-empty-state');
  if (!canvas) return;

  const snapshots = store.getSnapshots ? store.getSnapshots() : [];

  // Empty state guard (< 2 snapshots)
  if (!snapshots || snapshots.length < 2) {
    if (emptyState) emptyState.classList.remove('hidden');
    if (trendChartInstance) {
      trendChartInstance.destroy();
      trendChartInstance = null;
    }
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');

  const labels = snapshots.map(s => formatDateTime(s.timestamp));
  const dataNgn = snapshots.map(s => Number(s.netWorthNgn) || 0);
  const dataUsdt = snapshots.map(s => Number(s.netWorthUsdt) || 0);

  const ctx = canvas.getContext('2d');
  if (trendChartInstance) {
    trendChartInstance.destroy();
  }

  // Gradients
  const gradNgn = ctx.createLinearGradient(0, 0, 0, 260);
  gradNgn.addColorStop(0, 'rgba(16, 185, 129, 0.35)');
  gradNgn.addColorStop(1, 'rgba(16, 185, 129, 0.00)');

  const gradUsdt = ctx.createLinearGradient(0, 0, 0, 260);
  gradUsdt.addColorStop(0, 'rgba(59, 130, 246, 0.30)');
  gradUsdt.addColorStop(1, 'rgba(59, 130, 246, 0.00)');

  const datasets = [];
  const scales = {
    x: {
      grid: { color: 'rgba(255, 255, 255, 0.05)' },
      ticks: { color: '#64748B', font: { size: 10 } }
    }
  };

  if (currentTrendCurrency === 'both' || currentTrendCurrency === 'ngn') {
    datasets.push({
      label: 'Net Worth (₦ NGN)',
      data: dataNgn,
      borderColor: '#10B981',
      backgroundColor: gradNgn,
      borderWidth: 2.5,
      fill: currentTrendCurrency === 'ngn',
      tension: 0.3,
      yAxisID: 'yNgn',
      pointBackgroundColor: '#10B981',
      pointRadius: 4,
      pointHoverRadius: 6
    });

    scales.yNgn = {
      type: 'linear',
      position: 'left',
      grid: { color: 'rgba(255, 255, 255, 0.05)' },
      ticks: {
        color: '#10B981',
        font: { size: 10 },
        callback: (v) => formatNGN(v, 0)
      }
    };
  }

  if (currentTrendCurrency === 'both' || currentTrendCurrency === 'usdt') {
    datasets.push({
      label: 'Net Worth ($ USDT)',
      data: dataUsdt,
      borderColor: '#3B82F6',
      backgroundColor: gradUsdt,
      borderWidth: 2.5,
      fill: currentTrendCurrency === 'usdt',
      tension: 0.3,
      yAxisID: currentTrendCurrency === 'both' ? 'yUsdt' : 'yNgn',
      pointBackgroundColor: '#3B82F6',
      pointRadius: 4,
      pointHoverRadius: 6
    });

    if (currentTrendCurrency === 'both') {
      scales.yUsdt = {
        type: 'linear',
        position: 'right',
        grid: { drawOnChartArea: false },
        ticks: {
          color: '#3B82F6',
          font: { size: 10 },
          callback: (v) => `${Number(v).toLocaleString()} $`
        }
      };
    }
  }

  trendChartInstance = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: {
          display: currentTrendCurrency === 'both',
          labels: { color: '#94A3B8', font: { size: 11 } }
        },
        tooltip: {
          backgroundColor: 'rgba(14, 22, 38, 0.95)',
          titleColor: '#F8FAFC',
          bodyColor: '#94A3B8',
          borderColor: 'rgba(255, 255, 255, 0.15)',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: (ctx) => {
              if (ctx.dataset.yAxisID === 'yNgn') {
                return `Net Worth: ${formatNGN(ctx.parsed.y)}`;
              }
              return `USDT Equiv: ${formatUSDT(ctx.parsed.y)}`;
            }
          }
        }
      },
      scales
    }
  });
}
```

### 5.3. Table Rendering & Event Delegation
```javascript
/**
 * Render Historical Snapshot Log table (#table-snapshot-history)
 */
export function renderSnapshotHistoryTable() {
  const tbody = document.getElementById('snapshot-history-tbody');
  const emptyState = document.getElementById('snapshot-history-empty');
  const tableWrapper = document.getElementById('snapshot-table-wrapper');
  const countEl = document.getElementById('snapshot-history-count');
  const countBadge = document.getElementById('snapshot-history-count-badge');
  if (!tbody) return;

  const snapshots = store.getSnapshots ? store.getSnapshots() : [];

  if (countEl) countEl.textContent = `${snapshots.length} ${snapshots.length === 1 ? 'snapshot' : 'snapshots'} recorded`;
  if (countBadge) countBadge.textContent = snapshots.length.toString();

  if (snapshots.length === 0) {
    if (emptyState) emptyState.classList.remove('hidden');
    if (tableWrapper) tableWrapper.classList.add('hidden');
    tbody.innerHTML = '';
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');
  if (tableWrapper) tableWrapper.classList.remove('hidden');

  // Render rows in reverse chronological order (newest on top) while maintaining correct chronological delta references
  const rowsHtml = snapshots.map((snap, idx) => {
    const prevSnap = idx > 0 ? snapshots[idx - 1] : null;
    return renderSnapshotHistoryRow(snap, prevSnap, idx);
  }).reverse().join('');

  tbody.innerHTML = rowsHtml;
  if (window.lucide) window.lucide.createIcons();

  // Attach delete handlers via delegation
  tbody.querySelectorAll('.btn-delete-snapshot').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const snapshotId = btn.getAttribute('data-snapshot-id') || btn.getAttribute('data-id');
      if (snapshotId && confirm('Are you sure you want to delete this historical snapshot?')) {
        store.deleteSnapshot(snapshotId);
        if (window.showToast) window.showToast('Snapshot deleted', 'info');
        renderDashboardMetrics();
        updateNetWorthTrendChart();
        renderSnapshotHistoryTable();
      }
    });
  });
}
```

### 5.4. Filter & Toggle Event Listeners Setup
```javascript
/**
 * Bind currency filter buttons and history drawer toggle
 */
export function setupTrendChartEvents() {
  const filterContainer = document.getElementById('chart-currency-filter');
  const btnBoth = document.getElementById('filter-chart-both');
  const btnNgn = document.getElementById('filter-chart-ngn');
  const btnUsdt = document.getElementById('filter-chart-usdt');
  const btnToggleLog = document.getElementById('btn-toggle-snapshot-log');
  const historySection = document.getElementById('snapshot-history-section');

  const buttons = [btnBoth, btnNgn, btnUsdt].filter(Boolean);
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTrendCurrency = btn.getAttribute('data-currency') || 'both';
      updateNetWorthTrendChart();
    });
  });

  btnToggleLog?.addEventListener('click', () => {
    isSnapshotLogExpanded = !isSnapshotLogExpanded;
    if (historySection) {
      if (isSnapshotLogExpanded) {
        historySection.classList.remove('hidden');
        btnToggleLog.setAttribute('aria-expanded', 'true');
      } else {
        historySection.classList.add('hidden');
        btnToggleLog.setAttribute('aria-expanded', 'false');
      }
    }
  });
}
```

---

## 6. Verification & Contract Matrix

| Feature | DOM Element / Interface | Expected Behavior | Contract Source |
|---|---|---|---|
| Trend Card | `#card-net-worth-trend` | Rendered on dashboard beneath live net worth | `PROJECT.md:81`, `ORIGINAL_REQUEST §R3` |
| Filter Buttons | `#filter-chart-both`, `#filter-chart-ngn`, `#filter-chart-usdt` | 3-way toggle switching `both`, `ngn`, and `usdt` datasets | `test/tier1-feature-coverage/net-worth-features.test.js:1165` |
| Canvas Element | `<canvas id="netWorthTrendChart"></canvas>` | Chart.js instance with dual/single Y-axes | `test/tier1-feature-coverage/net-worth-features.test.js:1191` |
| Empty State | `#chart-networth-empty-state` | Visible when `< 2` snapshots exist; hidden otherwise | `test/tier1-feature-coverage/net-worth-features.test.js:1137` |
| History Table | `#table-snapshot-history` | Renders columns for Date, Bank Cash, USDT, Rate, NW, Δ, Notes, Actions | `PROJECT.md:30`, `ORIGINAL_REQUEST §R3` |
| Delta Badge | `.snapshot-delta-stack .badge` | Computes sequential $\Delta\text{NGN}$ and $\Delta\text{USDT}$ vs previous snapshot | `js/utils.js:510`, `test/tier1-feature-coverage/net-worth-features.test.js:1064` |
| Delete Button | `.btn-delete-snapshot[data-snapshot-id]` | Removes snapshot from store and reactively refreshes table and chart | `store.deleteSnapshot()`, `test/tier1-feature-coverage/net-worth-features.test.js:1236` |

---

## 7. Next Steps for Implementation (Worker)

1. Append `#card-net-worth-trend` HTML template string to `renderDashboardView()` in `js/views/dashboard.view.js`.
2. Append Milestone 4 CSS rules to `css/styles.css`.
3. Add `updateNetWorthTrendChart()`, `renderSnapshotHistoryTable()`, `renderSnapshotHistoryRow()`, and `setupTrendChartEvents()` to `js/dashboard.js`.
4. Run full test suite (`node test/run-tests.js`) and ensure 100% pass rate.
