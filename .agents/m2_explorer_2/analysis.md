# Milestone 2 Technical Analysis: Live Net Worth Dashboard Widget Reactivity & Event Integration

**Author**: `m2_explorer_2` (Role: M2 Reactivity & Event Integration Explorer)  
**Parent**: Project Orchestrator (`a90fce10-da57-446a-b348-94b9b5b8c1a6`)  
**Target Milestone**: Milestone 2 (M2: Live Net Worth Dashboard Widget UI)  
**Target Files**: `js/dashboard.js`, `js/utils.js`, `js/store.js`  
**Date**: 2026-08-25  

---

## 1. Executive Summary

Milestone 2 establishes the live financial cockpit hero widget on the Dashboard (`#card-net-worth`). This analysis defines the complete reactivity, calculation lifecycle, and event integration architecture for `js/dashboard.js`.

The engine delivers real-time dual-currency Net Worth valuation in both **Nigerian Naira (NGN)** and **Tether (USDT)** by seamlessly synthesizing:
1. **Liquid Bank Cash Ledger**: Aggregated across all linked bank accounts via `store.getComputedBankBalances()` and `calculateTotalBankCash()`.
2. **Authoritative Bybit USDT Balance**: Real-time aggregation of active sell advertisement quantities (`lastQuantity + frozenQuantity`) and free funding balance (`freeForBuyback = totalP2P - adAllocation`), falling back cleanly to internal FIFO inventory (`remainingInventoryUSDT`) when offline.
3. **5-Tier Exchange Rate Hierarchy**: Dynamically resolved via `resolveReferenceRate(...)` (Active Sell Ad price > Latest Trade rate > FIFO avg buy cost > Opening default cost basis > ₦1,500.00 fallback).
4. **Live Delta Comparison**: Absolute and percentage growth badge (`#badge-net-worth-delta`) evaluated against the latest historical snapshot via `calculateSnapshotDelta()`.
5. **Reactive Event Bus Integration**: Instant re-rendering upon `store:updated` (handling `trades`, `banks`, `transfers`, `settings`, `snapshots`, `SNAPSHOTS_UPDATED`, and `all`) and live Bybit API sync updates.

---

## 2. Reactivity & Lifecycle Architecture

### 2.1 State Flow & Lifecycle Sequence Diagram

```
[ Application Boot / Nav to Dashboard ]
                   │
                   ▼
         initDashboard()
                   │
  ┌────────────────┼────────────────────────┐
  ▼                ▼                        ▼
renderDashboardMetrics()   syncAndRenderActiveAd()   syncBybitLiveInventory()
  │                                │                        │
  ├─ calculateFIFOInventoryAndPnL  ├─ fetchActiveAds        ├─ fetchFundingBalance
  ├─ calculateTotalBankCash        ├─ update latestActiveAd ├─ fetchActiveAds
  ├─ resolveReferenceRate          │                        ├─ update latestLiveUsdt
  ├─ calculateNetWorth             ▼                        │
  ├─ calculateSnapshotDelta   renderNetWorthWidget()        ▼
  └─ renderNetWorthWidget()                            renderNetWorthWidget()
                   │
                   ▼
     [ DOM Flushed & Icons Initialized ]
                   │
                   ▼
  [ Event Listener on 'store:updated' ]
                   │
  ┌────────────────┴────────────────────────┐
  ▼                                         ▼
(trades / banks / transfers / snapshots)  (settings / all)
  │                                         │
  └─────────────────┬───────────────────────┘
                    ▼
          renderDashboardMetrics()
          renderNetWorthWidget()
          updateDashboardChart()
```

### 2.2 Module State & Caching Strategy

`js/dashboard.js` maintains lightweight module-level cache variables to eliminate redundant network fetches and ensure synchronous UI updates:

```javascript
let chartInstance = null;
let currentChartPeriod = 'all';
let latestActiveAd = null;       // Cached active Bybit sell ad object
let latestLiveUsdt = null;       // Cached live Bybit total P2P USDT balance (null = use FIFO fallback)
```

- **`latestActiveAd`**: Updated by `syncAndRenderActiveAd()`. Used by `resolveReferenceRate()` as Tier 1 rate source.
- **`latestLiveUsdt`**: Updated by `syncBybitLiveInventory()`. When `null` (initial state or offline error), `renderNetWorthWidget()` falls back directly to `fifoResult.remainingInventoryUSDT`.
- **State Invalidation**: Whenever manual refresh (`#btn-sync-active-ad`) or reactive store events occur, `syncAndRenderActiveAd()` and `syncBybitLiveInventory()` re-verify network state and update the cache.

---

## 3. Detailed Function Design

### 3.1 `renderNetWorthWidget()` Specification

#### Signature
```javascript
export function renderNetWorthWidget(): void
```

#### Step-by-Step Logic
1. **DOM Existence Guard**:
   Check if `#stat-net-worth-ngn`, `#stat-net-worth-usdt`, or `#metric-nw-bank-cash` exist. If not, exit cleanly to support partial DOM rendering during tests or view transitions.
2. **Authoritative FIFO Calculation**:
   Fetch `store.getTrades()` and `store.getOpeningInventory()`. Run `calculateFIFOInventoryAndPnL(trades, openingInventory)` to acquire `remainingInventoryUSDT` and `avgHoldingCostPerUSDT`.
3. **Bank Cash Aggregation**:
   Retrieve reactive bank ledger via `store.getComputedBankBalances()`.
   Compute total cash using `calculateTotalBankCash(computedBankBalances)`.
4. **Bybit USDT Balance Resolution**:
   ```javascript
   const isLiveUsdt = latestLiveUsdt !== null && latestLiveUsdt !== undefined && !isNaN(latestLiveUsdt);
   const totalUsdt = isLiveUsdt ? latestLiveUsdt : (fifoResult.remainingInventoryUSDT || 0);
   ```
5. **Reference Rate Resolution**:
   ```javascript
   const referenceRate = resolveReferenceRate({
     activeSellAd: latestActiveAd,
     latestTrade: trades,
     fifoAvgBuyCost: fifoResult.avgHoldingCostPerUSDT,
     openingDefaultRate: openingInventory?.defaultCostBasis,
     openingInventory: openingInventory,
     fallbackRate: 1500.00
   });
   ```
6. **Dual-Currency Valuation**:
   ```javascript
   const { netWorthNgn, netWorthUsdt } = calculateNetWorth(totalBankCash, totalUsdt, referenceRate);
   ```
7. **DOM Mutation & Formatting**:
   - Update `#stat-net-worth-ngn` with `formatNGN(netWorthNgn)`. Apply `.text-success` (if >= 0) or `.text-danger` (if < 0).
   - Update `#stat-net-worth-usdt` with `formatUSDT(netWorthUsdt)`.
   - Update `#metric-nw-bank-cash` with `formatNGN(totalBankCash)`.
   - Update `#metric-nw-bybit-usdt` with `formatUSDT(totalUsdt)`.
   - Update `#metric-nw-ref-rate` with `formatRate(referenceRate)`.
8. **Live Delta Badge Evaluation**:
   - Retrieve `store.getSnapshots()`.
   - If snapshots exist:
     - Take `latestSnapshot = snapshots[snapshots.length - 1]`.
     - Calculate delta: `const delta = calculateSnapshotDelta({ netWorthNgn, netWorthUsdt }, latestSnapshot)`.
     - If `delta.deltaNgn > 0.001`: Badge class `.badge.badge-success`, icon `trending-up`, text `+₦... (+X.XX%)`.
     - If `delta.deltaNgn < -0.001`: Badge class `.badge.badge-danger`, icon `trending-down`, text `-₦... (-X.XX%)`.
     - Else: Badge class `.badge.badge-neutral`, icon `minus`, text `₦0.00 (0.00%)`.
   - If no snapshots exist:
     - Badge class `.badge.badge-neutral`, icon `info`, text `No Baseline Snapshot`.
9. **Icon Refresh**:
   Call `if (window.lucide) window.lucide.createIcons()`.

---

## 4. DOM Contract & Element Inventory

| DOM Element ID | Component Role | Formatted Example | Fallback / Zero State |
|---|---|---|---|
| `#card-net-worth` | Hero Widget Container | N/A (Card Wrapper) | Rendered in `dashboard.view.js` |
| `#stat-net-worth-ngn` | Primary Net Worth (NGN) | `₦3,552,884.25` | `₦0.00` |
| `#stat-net-worth-usdt` | Secondary Net Worth (USDT) | `2,314.58 USDT` | `0.00 USDT` |
| `#metric-nw-bank-cash` | Sub-metric Bank Cash Ledger | `₦1,250,000.50` | `₦0.00` |
| `#metric-nw-bybit-usdt` | Sub-metric Bybit USDT Balance | `1,500.25 USDT` | `0.00 USDT` (FIFO fallback) |
| `#metric-nw-ref-rate` | Sub-metric Reference Rate | `₦1,535.00 / USDT` | `₦1,500.00 / USDT` |
| `#badge-net-worth-delta` | Live Delta Comparison Badge | `+₦150,000.00 (+5.00%)` | `No Baseline Snapshot` |
| `#btn-open-snapshot-modal` | "End Day / Save Snapshot" Trigger | Click Handler Anchor | Opens Modal (M3) |

---

## 5. Exact Implementation Blueprint for `js/dashboard.js`

Here is the exact, complete drop-in implementation for `js/dashboard.js`:

```javascript
/**
 * Bybit NGN P2P Trade Tracker — Dashboard Module
 * Calculates FIFO cost-basis performance metrics, manages Net Worth live widget,
 * and coordinates Chart.js analytics
 * Redesigned v2.1 with clean information architecture and capital allocation progress bars.
 */

import { store } from './store.js';
import {
  formatNGN,
  formatUSDT,
  formatRate,
  formatDateTime,
  calculateFIFOInventoryAndPnL,
  calculateTotalBankCash,
  resolveReferenceRate,
  calculateNetWorth,
  calculateSnapshotDelta,
  escapeHtml
} from './utils.js';
import { bybitService } from './bybitService.js';

let chartInstance = null;
let currentChartPeriod = 'all';
let latestActiveAd = null;
let latestLiveUsdt = null;

export function initDashboard() {
  // Set dynamic welcome greeting
  const greetingEl = document.getElementById('dashboard-greeting');
  if (greetingEl) {
    const hrs = new Date().getHours();
    let greet = 'Good day 👋';
    if (hrs < 12) greet = 'Good morning 🌅';
    else if (hrs < 17) greet = 'Good afternoon ☀️';
    else greet = 'Good evening 🌙';
    greetingEl.textContent = greet;
  }

  renderDashboardMetrics();
  renderRecentTradesList();
  initDashboardChart();
  setupPeriodFilters();
  syncAndRenderActiveAd();
  syncBybitLiveInventory();

  // Manual Bybit sync trigger
  const btnSyncAd = document.getElementById('btn-sync-active-ad');
  btnSyncAd?.addEventListener('click', () => {
    syncAndRenderActiveAd(true);
    syncBybitLiveInventory();
  });

  // End Day / Save Snapshot modal trigger (Milestone 3 hook)
  const btnOpenSnapshot = document.getElementById('btn-open-snapshot-modal');
  btnOpenSnapshot?.addEventListener('click', () => {
    if (typeof window.openSaveSnapshotModal === 'function') {
      window.openSaveSnapshotModal();
    } else {
      window.dispatchEvent(new CustomEvent('modal:open-snapshot'));
    }
  });

  // Listen for reactive store updates across all collections
  window.addEventListener('store:updated', (e) => {
    const type = e.detail?.type;
    const handledTypes = ['trades', 'banks', 'transfers', 'settings', 'snapshots', 'SNAPSHOTS_UPDATED', 'all'];
    if (handledTypes.includes(type)) {
      renderDashboardMetrics();
      renderRecentTradesList();
      updateDashboardChart();
      syncAndRenderActiveAd();
      syncBybitLiveInventory();
    }
  });
}

/**
 * Fetch and render Active Bybit Sell Ad & Live Spread Monitor
 */
export async function syncAndRenderActiveAd(showToast = false) {
  const adBadge = document.getElementById('active-ad-badge');
  const adTitle = document.getElementById('active-ad-title');
  const metricAdPrice = document.getElementById('metric-ad-sell-price');
  const metricAdQty = document.getElementById('metric-ad-qty-stock');
  const metricAvgBuy = document.getElementById('metric-ad-avg-buy-cost');
  const metricTotalBought = document.getElementById('metric-ad-total-bought');
  const metricSpread = document.getElementById('metric-ad-spread-usdt');
  const metricMarginPct = document.getElementById('metric-ad-margin-pct');
  const metricProjectedPnl = document.getElementById('metric-ad-projected-pnl');

  try {
    const ads = await bybitService.fetchActiveAds('1', 'USDT');
    // Pick ONLINE sell ad (status 10), or ACTIVE (20/2), or first available
    const activeSellAd = ads.find(a => Number(a.side) === 1 && Number(a.status) === 10)
      || ads.find(a => Number(a.side) === 1 && (Number(a.status) === 20 || Number(a.status) === 2))
      || null;

    latestActiveAd = activeSellAd;

    const trades = store.getTrades();
    const openingInventory = store.getOpeningInventory();
    const fifoResult = calculateFIFOInventoryAndPnL(trades, openingInventory);
    const avgBuyCost = fifoResult.avgHoldingCostPerUSDT || openingInventory.defaultCostBasis || 0;

    if (metricAdPrice) {
      if (activeSellAd) {
        const adPrice = parseFloat(activeSellAd.price) || 0;
        const lastQty = parseFloat(activeSellAd.lastQuantity) || 0;
        const frozenQty = parseFloat(activeSellAd.frozenQuantity) || 0;
        const totalInAd = lastQty + frozenQty;

        const spreadPerUsdt = avgBuyCost > 0 ? (adPrice - avgBuyCost) : 0;
        const marginPct = avgBuyCost > 0 ? (spreadPerUsdt / avgBuyCost) * 100 : 0;
        const projectedGross = spreadPerUsdt * totalInAd;
        const projectedNet = Math.max(0, projectedGross);

        if (adBadge) {
          adBadge.className = 'live-badge';
          adBadge.innerHTML = '<span class="live-badge-dot"></span>Active Sell Ad';
        }
        if (adTitle) adTitle.textContent = `Bybit Sell Ad #${activeSellAd.id}`;
        if (metricAdPrice) metricAdPrice.textContent = `₦${adPrice.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
        if (metricAdQty) metricAdQty.textContent = `${totalInAd.toFixed(2)} USDT listed`;

        if (metricAvgBuy) metricAvgBuy.textContent = `₦${avgBuyCost.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
        if (metricTotalBought) metricTotalBought.textContent = `${fifoResult.remainingInventoryUSDT.toFixed(2)} USDT in stock`;

        if (metricSpread) {
          metricSpread.textContent = `${spreadPerUsdt >= 0 ? '+' : ''}₦${spreadPerUsdt.toFixed(2)} / USDT`;
          metricSpread.className = `ad-submetric-value font-mono ${spreadPerUsdt >= 0 ? 'text-success' : 'text-danger'}`;
        }
        if (metricMarginPct) {
          metricMarginPct.textContent = `${marginPct >= 0 ? '+' : ''}${marginPct.toFixed(2)}% margin`;
          metricMarginPct.className = `ad-submetric-sub ${marginPct >= 0 ? 'text-success' : 'text-danger'}`;
        }
        if (metricProjectedPnl) {
          metricProjectedPnl.textContent = `${projectedNet >= 0 ? '+' : ''}₦${projectedNet.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
          metricProjectedPnl.className = `ad-submetric-value font-mono ${projectedNet >= 0 ? 'text-success' : 'text-danger'}`;
        }

        if (showToast && window.showToast) {
          window.showToast(`Synced Live Bybit Ad @ ₦${adPrice.toFixed(2)} (+₦${spreadPerUsdt.toFixed(2)}/USDT spread)!`, 'success');
        }
      } else {
        if (adBadge) {
          adBadge.className = 'badge badge-neutral';
          adBadge.innerHTML = 'No Active Ad';
        }
        if (adTitle) adTitle.textContent = 'No Live Sell Ad on Bybit';
        if (metricAdPrice) metricAdPrice.textContent = '—';
        if (metricAdQty) metricAdQty.textContent = 'Post a Sell Ad on Bybit';
        if (metricAvgBuy) metricAvgBuy.textContent = `₦${avgBuyCost.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
        if (metricTotalBought) metricTotalBought.textContent = `${fifoResult.remainingInventoryUSDT.toFixed(2)} USDT in stock`;
        if (metricSpread) {
          metricSpread.textContent = '—';
          metricSpread.className = 'ad-submetric-value font-mono text-accent';
        }
        if (metricMarginPct) {
          metricMarginPct.textContent = 'Waiting for active ad';
          metricMarginPct.className = 'ad-submetric-sub';
        }
        if (metricProjectedPnl) {
          metricProjectedPnl.textContent = '₦0.00';
          metricProjectedPnl.className = 'ad-submetric-value font-mono';
        }

        if (showToast && window.showToast) {
          window.showToast('No active Bybit sell advertisements found.', 'info');
        }
      }
    }

    // Reactively update Net Worth with fresh active ad rate
    renderNetWorthWidget();
  } catch (e) {
    console.warn('[Dashboard] Could not sync active ad:', e.message);
  }
}

/**
 * Fetch live Bybit wallet balance and compare against FIFO inventory.
 */
export async function syncBybitLiveInventory() {
  const elTotal = document.getElementById('stat-bybit-live-total');
  const elFree = document.getElementById('stat-bybit-free');
  const elLocked = document.getElementById('stat-bybit-locked');
  const elDiff = document.getElementById('stat-inventory-diff');
  const barActive = document.getElementById('bar-segment-active');
  const barFree = document.getElementById('bar-segment-free');

  try {
    let totalP2P = 0;
    let fetchedWallet = false;

    try {
      const balResult = await bybitService.fetchFundingBalance('USDT');
      const usdtItem = balResult?.balance?.find(b => b.coin === 'USDT') || balResult?.balance?.[0];
      if (usdtItem) {
        totalP2P = parseFloat(usdtItem.transferBalance) || 0;
        fetchedWallet = true;
      }
    } catch (e) {
      console.warn('[Dashboard] Could not fetch wallet balance:', e.message);
    }

    // 2. Query active ads directly to determine ad allocation
    let adAllocation = 0;
    try {
      const ads = await bybitService.fetchActiveAds('1', 'USDT');
      const activeAd = ads.find(a => Number(a.side) === 1 && Number(a.status) === 10)
        || ads.find(a => Number(a.side) === 1 && (Number(a.status) === 20 || Number(a.status) === 2))
        || null;
      if (activeAd) {
        adAllocation = (parseFloat(activeAd.lastQuantity) || 0) + (parseFloat(activeAd.frozenQuantity) || 0);
      }
    } catch (e) {
      console.warn('[Dashboard] Could not fetch active ads for live inventory:', e.message);
    }

    // 3. Free for Buyback = Total P2P - Ad Allocation
    const freeForBuyback = Math.max(0, totalP2P - adAllocation);

    if (fetchedWallet || adAllocation > 0) {
      latestLiveUsdt = totalP2P;
    } else {
      latestLiveUsdt = null;
    }

    console.log('[Bybit Inventory Debug]', { totalP2P, adAllocation, freeForBuyback, latestLiveUsdt });

    // Populate Bybit live numbers
    if (elTotal) elTotal.textContent = `${totalP2P.toFixed(2)} USDT`;
    if (elLocked) elLocked.textContent = `${adAllocation.toFixed(2)} USDT`;
    if (elFree) elFree.textContent = `${freeForBuyback.toFixed(2)} USDT`;

    // Update Progress Bar segments visually
    if (barActive && barFree) {
      if (totalP2P > 0) {
        const activePct = (adAllocation / totalP2P) * 100;
        const freePct = (freeForBuyback / totalP2P) * 100;
        barActive.style.width = `${activePct}%`;
        barFree.style.width = `${freePct}%`;
      } else {
        barActive.style.width = '0%';
        barFree.style.width = '0%';
      }
    }

    // Compare FIFO tracked inventory against actual Bybit total
    const trades = store.getTrades();
    const openingInventory = store.getOpeningInventory();
    const fifoResult = calculateFIFOInventoryAndPnL(trades, openingInventory);
    const fifoInventory = fifoResult.remainingInventoryUSDT;
    const diff = fifoInventory - totalP2P;

    if (elDiff) {
      if (Math.abs(diff) > 0.5) {
        elDiff.style.display = 'block';
        elDiff.classList.remove('hidden');
        const sign = diff > 0 ? '+' : '';
        elDiff.innerHTML = `<span class="text-warning">⚠ Sync Diff: ${sign}${diff.toFixed(2)} USDT (App ledger vs Bybit balance)</span>`;
      } else {
        elDiff.style.display = 'block';
        elDiff.classList.remove('hidden');
        elDiff.innerHTML = `<span class="text-success">✓ Ledger & Bybit inventory matched</span>`;
      }
    }

    // Reactively update Net Worth with fresh Bybit live USDT balance
    renderNetWorthWidget();
  } catch (e) {
    console.warn('[Dashboard] Bybit live inventory sync failed:', e.message);
    latestLiveUsdt = null;
    if (elTotal) elTotal.textContent = 'Offline';
    if (barActive && barFree) {
      barActive.style.width = '0%';
      barFree.style.width = '0%';
    }
    renderNetWorthWidget();
  }
}

/**
 * Compute portfolio metrics and update summary cards using FIFO engine
 */
export function renderDashboardMetrics() {
  const trades = store.getTrades();
  const openingInventory = store.getOpeningInventory();

  // Run FIFO engine
  const fifoResult = calculateFIFOInventoryAndPnL(trades, openingInventory);
  const {
    totalRealizedPnL,
    overallROI,
    remainingInventoryUSDT,
    inventoryCostBasisNGN,
    avgHoldingCostPerUSDT
  } = fifoResult;

  // Inventory display values strictly from authoritative FIFO engine output
  const displayInventoryUSDT = remainingInventoryUSDT;
  const displayInventoryCostNGN = inventoryCostBasisNGN;
  const displayAvgCostPerUSDT = avgHoldingCostPerUSDT || openingInventory.defaultCostBasis || 0;

  // DOM Elements
  const statNetPnl = document.getElementById('stat-net-pnl');
  const statPnlRate = document.getElementById('stat-pnl-rate');
  const statInventoryHolding = document.getElementById('stat-inventory-holding');
  const statInventoryCost = document.getElementById('stat-inventory-cost');

  // 1. Realized P&L
  if (statNetPnl) {
    statNetPnl.textContent = `${totalRealizedPnL >= 0 ? '+' : ''}${formatNGN(totalRealizedPnL)}`;
    statNetPnl.className = `portfolio-value font-mono ${totalRealizedPnL >= 0 ? 'text-success' : 'text-danger'}`;
  }

  if (statPnlRate) {
    const roiStr = Math.abs(overallROI).toFixed(2);
    const isProfitable = totalRealizedPnL >= 0;
    statPnlRate.innerHTML = `
      <span class="badge ${isProfitable ? 'badge-success' : 'badge-danger'}" id="pnl-roi-badge">
        <i data-lucide="${isProfitable ? 'trending-up' : 'trending-down'}" id="pnl-icon"></i>
        <span>${isProfitable ? '+' : '-'}${roiStr}% ROI</span>
      </span>
    `;
  }

  // 2. USDT Inventory
  if (statInventoryHolding) {
    statInventoryHolding.textContent = formatUSDT(displayInventoryUSDT);
  }
  if (statInventoryCost) {
    if (displayInventoryUSDT > 0) {
      statInventoryCost.textContent = `Cost: ${formatNGN(displayInventoryCostNGN)} • Avg: ₦${displayAvgCostPerUSDT.toFixed(2)}`;
    } else {
      statInventoryCost.textContent = 'No inventory';
    }
  }

  // 3. Total Bank Cash Balance
  const computedBankBalances = store.getComputedBankBalances ? store.getComputedBankBalances() : new Map();
  const totalBankCash = calculateTotalBankCash(computedBankBalances);
  let activeBanksCount = 0;
  if (computedBankBalances instanceof Map) {
    activeBanksCount = computedBankBalances.size;
  } else if (Array.isArray(computedBankBalances)) {
    activeBanksCount = computedBankBalances.length;
  } else if (computedBankBalances && typeof computedBankBalances === 'object') {
    activeBanksCount = Object.keys(computedBankBalances).length;
  }

  const statTotalBankCash = document.getElementById('stat-total-bank-cash');
  const statBankCashSubtext = document.getElementById('stat-bank-cash-subtext');

  if (statTotalBankCash) {
    statTotalBankCash.textContent = formatNGN(totalBankCash);
    statTotalBankCash.className = `portfolio-value font-mono ${totalBankCash >= 0 ? 'text-success' : 'text-danger'}`;
  }
  if (statBankCashSubtext) {
    statBankCashSubtext.textContent = `Across ${activeBanksCount} linked ${activeBanksCount === 1 ? 'account' : 'accounts'}`;
  }

  // 4. Live Net Worth Hero Widget
  renderNetWorthWidget();

  if (window.lucide) window.lucide.createIcons();
}

/**
 * Render Live Net Worth Dashboard Widget (#card-net-worth)
 * Computes dual-currency valuation (NGN & USDT) from reactive bank cash ledger,
 * live Bybit funding USDT balance (or FIFO fallback), and priority reference rate.
 * Renders live delta badge vs latest historical snapshot.
 */
export function renderNetWorthWidget() {
  const elNetWorthNgn = document.getElementById('stat-net-worth-ngn');
  const elNetWorthUsdt = document.getElementById('stat-net-worth-usdt');
  const elNwBankCash = document.getElementById('metric-nw-bank-cash');
  const elNwBybitUsdt = document.getElementById('metric-nw-bybit-usdt');
  const elNwRefRate = document.getElementById('metric-nw-ref-rate');
  const elBadgeDelta = document.getElementById('badge-net-worth-delta');

  // If hero card elements are not present, exit cleanly
  if (!elNetWorthNgn && !elNetWorthUsdt && !elNwBankCash) return;

  const trades = store.getTrades();
  const openingInventory = store.getOpeningInventory();
  const fifoResult = calculateFIFOInventoryAndPnL(trades, openingInventory);

  // 1. Total Bank Cash
  const computedBankBalances = store.getComputedBankBalances ? store.getComputedBankBalances() : new Map();
  const totalBankCash = calculateTotalBankCash(computedBankBalances);

  // 2. Total USDT (Live Bybit balance fallback to FIFO inventory)
  const isLiveUsdt = latestLiveUsdt !== null && latestLiveUsdt !== undefined && !isNaN(latestLiveUsdt);
  const totalUsdt = isLiveUsdt ? latestLiveUsdt : (fifoResult.remainingInventoryUSDT || 0);

  // 3. Reference Exchange Rate Resolution (5-tier priority hierarchy)
  const referenceRate = resolveReferenceRate({
    activeSellAd: latestActiveAd,
    latestTrade: trades,
    fifoAvgBuyCost: fifoResult.avgHoldingCostPerUSDT,
    openingDefaultRate: openingInventory?.defaultCostBasis,
    openingInventory: openingInventory,
    fallbackRate: 1500.00
  });

  // 4. Dual-Currency Net Worth Calculation
  const { netWorthNgn, netWorthUsdt } = calculateNetWorth(totalBankCash, totalUsdt, referenceRate);

  // 5. Update Primary Valuation
  if (elNetWorthNgn) {
    elNetWorthNgn.textContent = formatNGN(netWorthNgn);
    elNetWorthNgn.className = `net-worth-primary font-mono ${netWorthNgn >= 0 ? 'text-success' : 'text-danger'}`;
  }

  if (elNetWorthUsdt) {
    elNetWorthUsdt.textContent = formatUSDT(netWorthUsdt);
  }

  // 6. Update Breakdown Sub-metrics
  if (elNwBankCash) {
    elNwBankCash.textContent = formatNGN(totalBankCash);
  }

  if (elNwBybitUsdt) {
    elNwBybitUsdt.textContent = formatUSDT(totalUsdt);
  }

  if (elNwRefRate) {
    elNwRefRate.textContent = formatRate(referenceRate);
  }

  // 7. Update Live Delta Comparison Badge
  if (elBadgeDelta) {
    const snapshots = store.getSnapshots ? store.getSnapshots() : [];
    if (snapshots.length > 0) {
      const latestSnapshot = snapshots[snapshots.length - 1];
      const delta = calculateSnapshotDelta({ netWorthNgn, netWorthUsdt }, latestSnapshot);

      const isPositive = delta.deltaNgn > 0.001;
      const isNegative = delta.deltaNgn < -0.001;
      const sign = isPositive ? '+' : '';

      if (isPositive) {
        elBadgeDelta.className = 'badge badge-success';
        elBadgeDelta.innerHTML = `
          <i data-lucide="trending-up"></i>
          <span>${sign}${formatNGN(delta.deltaNgn)} (${sign}${delta.pctDeltaNgn.toFixed(2)}%)</span>
        `;
      } else if (isNegative) {
        elBadgeDelta.className = 'badge badge-danger';
        elBadgeDelta.innerHTML = `
          <i data-lucide="trending-down"></i>
          <span>${formatNGN(delta.deltaNgn)} (${delta.pctDeltaNgn.toFixed(2)}%)</span>
        `;
      } else {
        elBadgeDelta.className = 'badge badge-neutral';
        elBadgeDelta.innerHTML = `
          <i data-lucide="minus"></i>
          <span>₦0.00 (0.00%)</span>
        `;
      }
      elBadgeDelta.title = `Compared to snapshot from ${formatDateTime(latestSnapshot.timestamp)}`;
    } else {
      elBadgeDelta.className = 'badge badge-neutral';
      elBadgeDelta.innerHTML = `
        <i data-lucide="info"></i>
        <span>No Baseline Snapshot</span>
      `;
      elBadgeDelta.title = 'Save your first snapshot to start tracking growth deltas';
    }
  }

  if (window.lucide) window.lucide.createIcons();
}

/**
 * Render recent 5 trades feed on the dashboard with FIFO P&L annotations
 */
export function renderRecentTradesList() {
  const container = document.getElementById('dashboard-recent-list');
  if (!container) return;

  const trades = store.getTrades();
  const openingInventory = store.getOpeningInventory();
  const { enrichedTrades } = calculateFIFOInventoryAndPnL(trades, openingInventory);

  const recentTrades = [...enrichedTrades].reverse().slice(0, 5);

  if (recentTrades.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon-box">
          <i data-lucide="inbox"></i>
        </div>
        <p class="empty-title">No trades logged yet</p>
        <p class="empty-subtitle">Click "New Trade" to record your first Bybit P2P order.</p>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  const banks = store.getBankAccounts();
  const bankMap = new Map(banks.map(b => [b.id, b]));

  container.innerHTML = recentTrades.map(trade => {
    const isBuy = trade.type === 'BUY';
    const bank = bankMap.get(trade.bankAccountId);
    const bankLabel = bank ? `${bank.name} •••• ${bank.last4}` : 'Unknown Bank';

    let pnlBadge = '';
    if (!isBuy && trade.realizedPnL !== null) {
      const isProfitable = trade.realizedPnL >= 0;
      pnlBadge = `
        <span class="badge ${isProfitable ? 'badge-success' : 'badge-danger'}">
          P&L: ${formatNGN(trade.realizedPnL)}
        </span>
      `;
    }

    return `
      <div class="trade-list-item cursor-pointer trade-preview-item" data-trade-id="${escapeHtml(trade.id)}">
        <div class="trade-list-left">
          <div class="trade-type-indicator ${isBuy ? 'buy-indicator' : 'sell-indicator'}">
            <i data-lucide="${isBuy ? 'arrow-down-left' : 'arrow-up-right'}"></i>
          </div>
          <div class="trade-list-info">
            <div class="d-flex align-items-center gap-2">
              <span class="trade-list-primary">${formatNGN(trade.ngnAmount)}</span>
              <span class="badge ${isBuy ? 'badge-buy' : 'badge-sell'}">
                ${trade.type}
              </span>
              ${pnlBadge}
            </div>
            <p class="trade-list-secondary">
              ${formatUSDT(trade.usdtAmount)} @ ₦${Number(trade.rate).toLocaleString('en-US', { minimumFractionDigits: 2 })} • ${escapeHtml(bankLabel)}
            </p>
          </div>
        </div>
        <div class="trade-list-right">
          <div class="text-muted small">${formatDateTime(trade.date)}</div>
          ${trade.unmatchedQty > 0 ? `<div class="text-warning small">⚠️ ${formatUSDT(trade.unmatchedQty)} unmatched</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();

  container.querySelectorAll('.trade-preview-item').forEach(item => {
    item.addEventListener('click', () => {
      const tradeId = item.getAttribute('data-trade-id');
      if (window.startEditTrade) {
        window.startEditTrade(tradeId);
      }
    });
  });
}

/**
 * Initialize Chart.js graph
 */
function initDashboardChart() {
  const canvas = document.getElementById('pnlChart');
  if (!canvas) return;

  updateDashboardChart();
}

/**
 * Filter time period handler
 */
function setupPeriodFilters() {
  const filterContainer = document.getElementById('chart-time-filter');
  if (!filterContainer) return;

  const buttons = filterContainer.querySelectorAll('.seg-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentChartPeriod = btn.getAttribute('data-period') || 'all';
      updateDashboardChart();
    });
  });
}

/**
 * Re-render Chart.js with cumulative FIFO Realized P&L
 */
export function updateDashboardChart() {
  const canvas = document.getElementById('pnlChart');
  const emptyState = document.getElementById('chart-empty-state');
  if (!canvas) return;

  const trades = store.getTrades();
  const openingInventory = store.getOpeningInventory();

  if (trades.length === 0) {
    if (emptyState) emptyState.classList.remove('hidden');
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    return;
  }

  const { enrichedTrades } = calculateFIFOInventoryAndPnL(trades, openingInventory);

  if (emptyState) emptyState.classList.add('hidden');

  const now = new Date().getTime();
  let filteredTrades = enrichedTrades;

  if (currentChartPeriod === '7d') {
    const cutoff = now - (7 * 24 * 60 * 60 * 1000);
    filteredTrades = enrichedTrades.filter(t => new Date(t.date).getTime() >= cutoff);
  } else if (currentChartPeriod === '30d') {
    const cutoff = now - (30 * 24 * 60 * 60 * 1000);
    filteredTrades = enrichedTrades.filter(t => new Date(t.date).getTime() >= cutoff);
  }

  if (filteredTrades.length === 0) {
    filteredTrades = enrichedTrades;
  }

  let runningPnL = 0;
  const labels = [];
  const pnlData = [];

  filteredTrades.forEach((trade, idx) => {
    if (trade.type === 'SELL' && trade.realizedPnL !== null) {
      runningPnL += trade.realizedPnL;
    }

    const dateObj = new Date(trade.date);
    const dateLabel = isNaN(dateObj.getTime()) ? `#${idx + 1}` : dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    labels.push(dateLabel);
    pnlData.push(runningPnL);
  });

  const ctx = canvas.getContext('2d');
  if (chartInstance) {
    chartInstance.destroy();
  }

  const isNetPositive = runningPnL >= 0;
  const strokeColor = isNetPositive ? '#10B981' : '#F43F5E';

  const gradient = ctx.createLinearGradient(0, 0, 0, 200);
  gradient.addColorStop(0, isNetPositive ? 'rgba(16, 185, 129, 0.35)' : 'rgba(244, 63, 94, 0.35)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0.0)');

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Realized P&L (₦)',
        data: pnlData,
        borderColor: strokeColor,
        backgroundColor: gradient,
        borderWidth: 2.5,
        fill: true,
        tension: 0.35,
        pointBackgroundColor: strokeColor,
        pointBorderColor: '#0E1626',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index'
      },
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
          callbacks: {
            label: (context) => `Realized P&L: ${formatNGN(context.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748B', font: { size: 11 } }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            color: '#64748B',
            font: { size: 11 },
            callback: (val) => formatNGN(val, 0)
          }
        }
      }
    }
  });
}
```

---

## 6. Verification & Test Plan

1. **Unit Test Coverage**:
   - Verify that `renderNetWorthWidget()` calculates accurate NGN and USDT valuations across empty, partial, and full balance configurations.
   - Verify that `calculateTotalBankCash(store.getComputedBankBalances())` integrates seamlessly without float drift.
   - Verify that Bybit live USDT balance (`latestLiveUsdt`) takes precedence when online and falls back to FIFO `remainingInventoryUSDT` when offline.
   - Verify that the delta badge displays correct styling (`badge-success`, `badge-danger`, `badge-neutral`) and formatting (`+₦... (+X.XX%)`).
2. **Reactivity Test Suite**:
   - Adding, editing, and deleting trades, banks, transfers, and snapshots triggers immediate widget recalculation via `store:updated`.
3. **Boundary Invariants**:
   - Zero bank cash and zero USDT balance returns `₦0.00` and `0.00 USDT`.
   - Division-by-zero rate guards prevent `NaN` or `Infinity`.
   - Missing DOM elements do not throw errors or cause unhandled exceptions.
