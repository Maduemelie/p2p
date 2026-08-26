# Milestone 4: Chart.js Lifecycle & Trend Controller Analysis

## Executive Summary
This document provides the complete, production-grade architectural and implementation blueprint for Feature 14 (Net Worth Trend Line Chart) in `js/dashboard.js` as part of Milestone 4 (M4: Historical Comparison, Trend Chart & Import/Export Integration).

The implementation establishes a robust, reactive Chart.js controller that visualizes historical Net Worth trajectories across chronological snapshots from `store.getSnapshots()`, seamlessly supporting dual-axis multi-series mode (`both`), single NGN series mode (`ngn`), and single USDT series mode (`usdt`), with dark-themed visual styling, dynamic gradients, rich tooltip annotations, clean empty-state transitions (< 2 snapshots), and full lifecycle destruction preventing canvas memory leaks.

---

## 1. Problem Boundary & Component Specification

### 1.1 Requirements Matrix
| Requirement | Specification | Implementation Detail |
|---|---|---|
| **Data Ingestion** | Retrieve snapshots from `store.getSnapshots()` | Chronologically sorted ascending (oldest first). |
| **Empty State Guard** | Handle $< 2$ snapshots or $0$ snapshots | Show `#chart-networth-empty-state`, hide `#netWorthTrendChart`, destroy active chart instance cleanly. |
| **Active State Display** | Render chart when $\ge 2$ snapshots exist | Hide empty state, reveal canvas `#netWorthTrendChart`, construct Chart.js instance. |
| **X-Axis Formatting** | Snapshot timestamp labels | Format via `formatDateTime(s.timestamp)` / localized compact date `MMM DD, HH:mm`. |
| **Currency Filtering** | Support `'both'`, `'ngn'`, and `'usdt'` modes | Dynamic dataset and scale switching via filter buttons (`#filter-chart-both`, `#filter-chart-ngn`, `#filter-chart-usdt`). |
| **Dual Y-Axes (`'both'`)** | Independent left (NGN) and right (USDT) axes | Left axis `y-ngn` with Emerald `#10b981`, right axis `y-usdt` with Cyan `#06b6d4` (`grid: { drawOnChartArea: false }`). |
| **Single Y-Axis (`'ngn'` / `'usdt'`)** | Single left axis corresponding to selected currency | Left axis `y` formatted with appropriate currency symbol. |
| **Dark Theme Aesthetics** | High contrast dark mode styling | Grid lines `rgba(255, 255, 255, 0.05)`, tick colors `#64748B` / `#10b981` / `#06b6d4`. |
| **Gradient Fills** | Smooth vertical gradients | NGN: `rgba(16, 185, 129, 0.35)` to `0.0`; USDT: `rgba(6, 182, 212, 0.35)` to `0.0`. |
| **Rich Tooltip Callbacks** | Multi-metric inspection | Title: timestamp; Label: Net Worth with currency; AfterBody: Reference Rate, Bank Cash & USDT breakdown, and Notes. |
| **Lifecycle Destruction** | Prevent Canvas memory leaks | `if (netWorthChartInstance) { netWorthChartInstance.destroy(); netWorthChartInstance = null; }` |
| **Reactivity Hooks** | Auto-update on data changes | Wired into `initDashboard()`, `store:updated` listener, and currency filter click handlers. |

---

## 2. Mathematical & Visual Design Blueprint

### 2.1 Color Palette & Visual Assets
- **NGN Series (Naira)**:
  - Line / Stroke Color: `#10B981` (Emerald Green)
  - Point Background Color: `#10B981`
  - Point Border Color: `#0E1626` (Dark background border)
  - Area Fill Gradient: Linear gradient from $y=0$ to $y=260$:
    - Stop 0%: `rgba(16, 185, 129, 0.35)`
    - Stop 100%: `rgba(16, 185, 129, 0.00)`
- **USDT Series (Tether)**:
  - Line / Stroke Color: `#06B6D4` (Cyan / Indigo tint)
  - Point Background Color: `#06B6D4`
  - Point Border Color: `#0E1626`
  - Area Fill Gradient: Linear gradient from $y=0$ to $y=260$:
    - Stop 0%: `rgba(6, 182, 212, 0.35)`
    - Stop 100%: `rgba(6, 182, 212, 0.00)`
- **Chart Background & Grids**:
  - Grid line color: `rgba(255, 255, 255, 0.05)`
  - Axis text tick color: `#64748B` (Muted slate)
  - Tooltip background: `rgba(14, 22, 38, 0.95)` with border `rgba(255, 255, 255, 0.15)`

---

## 3. Exact Implementation Blueprint for `js/dashboard.js`

### 3.1 Module-Level State Variables
```javascript
// Chart.js instance and filter state for Net Worth Trend
let netWorthChartInstance = null;
let currentNetWorthChartCurrency = 'both';
```

### 3.2 `renderNetWorthTrendChart(currencyFilter)` Controller Function
```javascript
/**
 * Render Historical Net Worth Trend Line Chart (Milestone 4 — Feature 14)
 * Visualizes asset valuation growth across historical snapshots.
 * Supports dual-axis (NGN & USDT) and single-currency filtered views.
 * Handles lifecycle destruction, gradient creation, and clean empty state transitions (< 2 snapshots).
 * 
 * @param {'both'|'ngn'|'usdt'} [currencyFilter='both']
 */
export function renderNetWorthTrendChart(currencyFilter = currentNetWorthChartCurrency) {
  const canvas = document.getElementById('netWorthTrendChart') || document.getElementById('netWorthChart');
  const emptyState = document.getElementById('chart-networth-empty-state') || document.getElementById('chart-networth-empty');
  
  if (!canvas) return;

  const snapshots = store.getSnapshots ? store.getSnapshots() : [];
  currentNetWorthChartCurrency = (currencyFilter || 'both').toLowerCase();

  // Guard: Minimum 2 snapshots required to draw a meaningful trend line
  if (!snapshots || snapshots.length < 2) {
    if (emptyState) {
      emptyState.classList.remove('hidden');
      const subtitle = emptyState.querySelector('.empty-subtitle') || emptyState.querySelector('p');
      if (subtitle) {
        subtitle.textContent = (snapshots && snapshots.length === 1)
          ? 'Record at least 2 daily snapshots to visualize growth trend'
          : 'Save snapshots via "End Day / Snapshot" to track historical net worth trend';
      }
    }
    if (canvas) {
      canvas.classList.add('hidden');
    }
    if (netWorthChartInstance) {
      netWorthChartInstance.destroy();
      netWorthChartInstance = null;
    }
    return;
  }

  // Active state: Hide empty state, reveal canvas
  if (emptyState) {
    emptyState.classList.add('hidden');
  }
  if (canvas) {
    canvas.classList.remove('hidden');
  }

  // Lifecycle management: Destroy existing chart instance before re-creating
  if (netWorthChartInstance) {
    netWorthChartInstance.destroy();
    netWorthChartInstance = null;
  }

  // Generate chronological X-axis labels
  const labels = snapshots.map((s, idx) => {
    if (!s.timestamp) return `#${idx + 1}`;
    const d = new Date(s.timestamp);
    if (isNaN(d.getTime())) return `#${idx + 1}`;
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  });

  const ctx = canvas.getContext('2d');
  
  // Safe linear gradients with fallback for headless/mock environments
  let ngnGradient = 'rgba(16, 185, 129, 0.2)';
  let usdtGradient = 'rgba(6, 182, 212, 0.2)';
  try {
    if (ctx && typeof ctx.createLinearGradient === 'function') {
      const grad1 = ctx.createLinearGradient(0, 0, 0, canvas.height || 260);
      grad1.addColorStop(0, 'rgba(16, 185, 129, 0.35)');
      grad1.addColorStop(1, 'rgba(16, 185, 129, 0.00)');
      ngnGradient = grad1;

      const grad2 = ctx.createLinearGradient(0, 0, 0, canvas.height || 260);
      grad2.addColorStop(0, 'rgba(6, 182, 212, 0.35)');
      grad2.addColorStop(1, 'rgba(6, 182, 212, 0.00)');
      usdtGradient = grad2;
    }
  } catch (e) {
    console.warn('[Dashboard] Could not construct canvas gradients:', e);
  }

  const pointRadius = snapshots.length > 25 ? 2 : 4;
  const pointHoverRadius = snapshots.length > 25 ? 4 : 6;

  // Base Dataset Configurations
  const ngnDataset = {
    label: 'Net Worth (NGN)',
    data: snapshots.map(s => Number(s.netWorthNgn) || 0),
    borderColor: '#10b981',
    backgroundColor: ngnGradient,
    borderWidth: 2.5,
    fill: true,
    tension: 0.35,
    yAxisID: currentNetWorthChartCurrency === 'both' ? 'y-ngn' : 'y',
    pointBackgroundColor: '#10b981',
    pointBorderColor: '#0E1626',
    pointBorderWidth: 2,
    pointRadius: pointRadius,
    pointHoverRadius: pointHoverRadius
  };

  const usdtDataset = {
    label: 'Net Worth (USDT)',
    data: snapshots.map(s => Number(s.netWorthUsdt) || 0),
    borderColor: '#06b6d4',
    backgroundColor: usdtGradient,
    borderWidth: 2.5,
    fill: true,
    tension: 0.35,
    yAxisID: currentNetWorthChartCurrency === 'both' ? 'y-usdt' : 'y',
    pointBackgroundColor: '#06b6d4',
    pointBorderColor: '#0E1626',
    pointBorderWidth: 2,
    pointRadius: pointRadius,
    pointHoverRadius: pointHoverRadius
  };

  let datasets = [];
  let scales = {};

  if (currentNetWorthChartCurrency === 'ngn') {
    datasets = [ngnDataset];
    scales = {
      x: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#64748B', font: { size: 11 } }
      },
      y: {
        type: 'linear',
        position: 'left',
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: {
          color: '#10b981',
          font: { size: 11 },
          callback: (val) => formatNGN(val, 0)
        }
      }
    };
  } else if (currentNetWorthChartCurrency === 'usdt') {
    datasets = [usdtDataset];
    scales = {
      x: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#64748B', font: { size: 11 } }
      },
      y: {
        type: 'linear',
        position: 'left',
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: {
          color: '#06b6d4',
          font: { size: 11 },
          callback: (val) => formatUSDT(val, 0)
        }
      }
    };
  } else {
    // 'both' (Dual dataset with dual Y-axes)
    datasets = [ngnDataset, usdtDataset];
    scales = {
      x: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#64748B', font: { size: 11 } }
      },
      'y-ngn': {
        type: 'linear',
        position: 'left',
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: {
          color: '#10b981',
          font: { size: 11 },
          callback: (val) => formatNGN(val, 0)
        },
        title: {
          display: true,
          text: 'Naira (NGN)',
          color: '#10b981',
          font: { size: 11, weight: '600' }
        }
      },
      'y-usdt': {
        type: 'linear',
        position: 'right',
        grid: { drawOnChartArea: false }, // Prevent overlapping grid lines on canvas
        ticks: {
          color: '#06b6d4',
          font: { size: 11 },
          callback: (val) => formatUSDT(val, 0)
        },
        title: {
          display: true,
          text: 'USDT Equiv',
          color: '#06b6d4',
          font: { size: 11, weight: '600' }
        }
      }
    };
  }

  // Construct Chart.js instance
  netWorthChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index'
      },
      plugins: {
        legend: {
          display: currentNetWorthChartCurrency === 'both',
          position: 'top',
          labels: {
            color: '#94A3B8',
            font: { size: 12, family: 'Plus Jakarta Sans, sans-serif' },
            boxWidth: 12,
            usePointStyle: true,
            pointStyle: 'circle'
          }
        },
        tooltip: {
          backgroundColor: 'rgba(14, 22, 38, 0.95)',
          titleColor: '#F8FAFC',
          bodyColor: '#94A3B8',
          borderColor: 'rgba(255, 255, 255, 0.15)',
          borderWidth: 1,
          padding: 12,
          boxPadding: 4,
          usePointStyle: true,
          callbacks: {
            title: (items) => {
              if (!items || !items.length) return '';
              const idx = items[0].dataIndex;
              const snp = snapshots[idx];
              return snp?.timestamp ? formatDateTime(snp.timestamp) : (items[0].label || '');
            },
            label: (context) => {
              const isNgn = context.dataset.label?.includes('NGN') || context.dataset.yAxisID === 'y-ngn';
              const val = context.parsed.y;
              return isNgn
                ? ` Net Worth (NGN): ${formatNGN(val)}`
                : ` Net Worth (USDT): ${formatUSDT(val)}`;
            },
            afterBody: (items) => {
              if (!items || !items.length) return [];
              const idx = items[0].dataIndex;
              const snp = snapshots[idx];
              if (!snp) return [];
              const lines = [];
              if (snp.referenceRate) {
                lines.push(`Rate: ${formatRate(snp.referenceRate)}`);
              }
              if (snp.bankCash !== undefined && snp.usdtBalance !== undefined) {
                lines.push(`Bank: ${formatNGN(snp.bankCash)} | USDT: ${formatUSDT(snp.usdtBalance)}`);
              }
              if (snp.notes) {
                const truncatedNotes = snp.notes.length > 40 ? `${snp.notes.slice(0, 37)}...` : snp.notes;
                lines.push(`Note: "${truncatedNotes}"`);
              }
              return lines;
            }
          }
        }
      },
      scales
    }
  });

  return netWorthChartInstance;
}
```

### 3.3 `setupNetWorthChartFilters()` Event Binder
```javascript
/**
 * Setup currency filter toggles for Net Worth Trend Chart ('both', 'ngn', 'usdt')
 */
export function setupNetWorthChartFilters() {
  const filterContainer = document.getElementById('chart-currency-filter') || document.getElementById('chart-networth-currency-filter');
  const btnBoth = document.getElementById('filter-chart-both');
  const btnNgn = document.getElementById('filter-chart-ngn');
  const btnUsdt = document.getElementById('filter-chart-usdt');

  const updateActiveButtons = (activeCurrency) => {
    [btnBoth, btnNgn, btnUsdt].forEach(btn => {
      if (!btn) return;
      const targetCurr = btn.getAttribute('data-currency') || btn.id.replace('filter-chart-', '');
      if (targetCurr === activeCurrency) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    if (filterContainer) {
      filterContainer.querySelectorAll('.seg-btn, .btn-filter').forEach(btn => {
        const curr = btn.getAttribute('data-currency') || (btn.id ? btn.id.replace('filter-chart-', '') : '');
        if (curr === activeCurrency) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }
  };

  btnBoth?.addEventListener('click', () => {
    updateActiveButtons('both');
    renderNetWorthTrendChart('both');
  });

  btnNgn?.addEventListener('click', () => {
    updateActiveButtons('ngn');
    renderNetWorthTrendChart('ngn');
  });

  btnUsdt?.addEventListener('click', () => {
    updateActiveButtons('usdt');
    renderNetWorthTrendChart('usdt');
  });

  // Delegated handler for dynamically mounted buttons
  if (filterContainer) {
    filterContainer.querySelectorAll('[data-currency]').forEach(btn => {
      btn.addEventListener('click', () => {
        const curr = btn.getAttribute('data-currency') || 'both';
        updateActiveButtons(curr);
        renderNetWorthTrendChart(curr);
      });
    });
  }
}
```

### 3.4 Lifecycle & Reactivity Integration in `initDashboard()`
In `js/dashboard.js`:
```javascript
export function initDashboard() {
  // ... existing greetings ...

  renderDashboardMetrics();
  renderRecentTradesList();
  initDashboardChart();
  setupPeriodFilters();
  syncAndRenderActiveAd();
  syncBybitLiveInventory();
  setupSnapshotModalEvents();

  // Milestone 4: Initialize Net Worth Trend Chart and Currency Filters
  renderNetWorthTrendChart('both');
  setupNetWorthChartFilters();

  // ... sync buttons ...

  // Reactivity listener
  window.addEventListener('store:updated', (e) => {
    const type = e.detail?.type;
    const handledTypes = ['trades', 'banks', 'transfers', 'settings', 'snapshots', 'SNAPSHOTS_UPDATED', 'all'];
    if (!type || handledTypes.includes(type)) {
      renderDashboardMetrics();
      renderRecentTradesList();
      updateDashboardChart();
      syncAndRenderActiveAd();
      syncBybitLiveInventory();
      
      // Milestone 4: Reactively re-render Net Worth Trend Chart
      renderNetWorthTrendChart();
    }
  });
}
```

---

## 4. Edge Cases & Boundary Handling

1. **0 or 1 Snapshot (Below Minimum Trend Baseline)**:
   - When 0 or 1 snapshots exist, empty state is displayed and canvas is hidden with `classList.add('hidden')`.
   - Any prior `netWorthChartInstance` is destroyed to avoid ghost charts or canvas artifacts.
2. **Flatline Datasets (All Snapshots Have Identical Valuation)**:
   - Linear scale in Chart.js naturally handles identical data points without division-by-zero crashes.
3. **High Volume Snapshots (100+ points)**:
   - Dynamic `pointRadius` adjustment (reduces from 4px to 2px when $> 25$ snapshots) ensures sharp visualization without cluttered data point dots.
4. **Offline & Headless Mode Resiliency**:
   - `createLinearGradient` is wrapped in a try/catch with fallback to standard rgba colors, guaranteeing zero-crash operation in headless DOM testing environments (e.g. `test/harness/dom-mock.js`).
5. **Secondary Y-Axis Overlap**:
   - `y-usdt` scale sets `grid: { drawOnChartArea: false }`, ensuring right-axis grid lines do not clash with left-axis grid lines.
