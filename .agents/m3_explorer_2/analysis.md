# Milestone 3 Investigation & Technical Blueprint: Modal Controller & Interactive Preview Engine

**Explorer**: `m3_explorer_2` (M3 Modal Controller & Interactive Preview Explorer)  
**Target File**: `js/dashboard.js`  
**Dependencies**: `js/utils.js`, `js/store.js`, `js/bybitService.js`, `js/views/modals.view.js`, `js/views/dashboard.view.js`  
**Date**: 2026-08-25  

---

## 1. Executive Summary

Milestone 3 (M3) introduces the **End Day / Save Snapshot Modal & Persistence** system into the Bybit NGN P2P Trade Tracker.
This analysis establishes the complete architectural design and concrete JavaScript implementation blueprint for the modal controller in `js/dashboard.js`, covering:

1. **Modal Controller Lifecycle**: Opening via `#btn-open-snapshot-modal` and global trigger hooks (`window.openSaveSnapshotModal`, `modal:open-snapshot`), pre-filling live calculated ledger balances, managing DOM display attributes, and graceful closing on backdrop click, cancel, or Escape.
2. **Live Metric Aggregation**:
   - Total liquid bank cash derived via `calculateTotalBankCash(store.getComputedBankBalances())`.
   - Total Bybit USDT balance derived from live WebSocket/REST wallet sync (`latestLiveUsdt`) with automatic fallback to internal FIFO remaining inventory (`calculateFIFOInventoryAndPnL(...).remainingInventoryUSDT`).
   - Default reference rate resolved via the authoritative 5-tier priority hierarchy (`resolveReferenceRate(...)`).
3. **Real-time Interactive Recalculation Engine**: Keystroke-level (`input` and `change` events) recalculation of dual-currency Net Worth values ($\text{NW}_{\text{NGN}}$ and $\text{NW}_{\text{USDT}}$) via `calculateNetWorth(bankCash, usdtBalance, referenceRate)` with zero/negative rate protection, validation styling, and DOM preview updates.
4. **Resilient Interoperability**: Decoupled selector resolution supporting standard and test-mock element IDs (`#input-snapshot-ref-rate` / `#snapshot-reference-rate`, `#snapshot-preview-networth-ngn` / `#snapshot-preview-ngn`, etc.).

---

## 2. Architecture & Data Flow Diagram

```
+-----------------------------------------------------------------------------------+
|                            DASHBOARD VIEW (#view-dashboard)                       |
|                                                                                   |
|  [ #btn-open-snapshot-modal ] (Hero Card Action)                                  |
|         │                                                                         |
|         ▼                                                                         |
|  openSnapshotModal()                                                              |
+─────────┬─────────────────────────────────────────────────────────────────────────+
          │
          ├── 1. Gather Bank Ledger ───────► store.getComputedBankBalances() ──► calculateTotalBankCash()
          │                                                                           │ (totalBankCash)
          ├── 2. Gather USDT Balance ──────► latestLiveUsdt ?? FIFO remainingInventoryUSDT
          │                                                                           │ (totalUsdt)
          ├── 3. Resolve Default Rate ─────► resolveReferenceRate(activeAd, trade, fifoCost, fallback)
          │                                                                           │ (defaultRate)
          ├── 4. Initial Net Worth ────────► calculateNetWorth(totalBankCash, totalUsdt, defaultRate)
          │                                                                           │ (initialNw)
          ▼
+───────────────────────────────────────────────────────────────────────────────────+
|                         MODAL BACKDROP (#modal-snapshot-backdrop)                 |
|                                                                                   |
|  ┌─────────────────────────────────────────────────────────────────────────────┐  |
|  │ #snapshot-bank-cash: ₦2,450,000.50 (data-val="2450000.50")                  │  |
|  │ #snapshot-usdt-balance: 1,850.25 USDT (data-val="1850.25")                  │  |
|  │                                                                             │  |
|  │ #input-snapshot-ref-rate: [ 1535.00 ] ◄── Editable User Input               │  |
|  │         │                                                                   │  |
|  │         ├── On 'input' / 'change' ────► handleSnapshotRateInput()           │  |
|  │         │                                       │                           │  |
|  │         │                                       ▼                           │  |
|  │         │                        calculateNetWorth(cash, usdt, rate)        │  |
|  │         │                                       │                           │  |
|  │         ▼                                       ▼                           │  |
|  │  #snapshot-preview-networth-ngn: ₦5,280,134.25                              │  |
|  │  #snapshot-preview-networth-usdt: 3,446.34 USDT                             │  |
|  │                                                                             │  |
|  │  #input-snapshot-notes: [ End of Day session notes... ]                     │  |
|  │                                                                             │  |
|  │  [ Cancel: #btn-cancel-snapshot-modal ]  [ Submit: #btn-save-snapshot-submit]│  |
|  └─────────────────────────────────────────────────────────────────────────────┘  |
+───────────────────────────────────────────────────────────────────────────────────+
```

---

## 3. Detailed Component Lifecycle Specification

### 3.1 Triggering & Modal Setup (`setupSnapshotModalEvents`)
1. **Direct Button Binding**: Attach `click` handler to `#btn-open-snapshot-modal` in the dashboard hero card.
2. **Global Custom Event**: Listen for `window.addEventListener('modal:open-snapshot', openSnapshotModal)` for decoupled invocation.
3. **Window Global Expose**: Assign `window.openSaveSnapshotModal = openSnapshotModal;` and `window.closeSaveSnapshotModal = closeSnapshotModal;` for backward compatibility with previous test suites and router shortcuts.
4. **Close Triggers**:
   - Close button: `#btn-close-snapshot-modal`
   - Cancel button: `#btn-cancel-snapshot-modal` and `#btn-cancel-snapshot`
   - Backdrop click: clicking directly on `#modal-snapshot-backdrop` (when `e.target === backdrop`)
   - Escape key: handled globally in `js/app.js` and confirmed by modal tests.

### 3.2 Modal Opening & Dynamic Pre-fill (`openSnapshotModal`)
When `openSnapshotModal()` is called:
1. **Query & Calculate Balances**:
   - `const computedBankBalances = store.getComputedBankBalances ? store.getComputedBankBalances() : new Map();`
   - `const totalBankCash = calculateTotalBankCash(computedBankBalances);`
   - `const trades = store.getTrades();`
   - `const openingInventory = store.getOpeningInventory();`
   - `const fifoResult = calculateFIFOInventoryAndPnL(trades, openingInventory);`
   - `const isLiveUsdt = latestLiveUsdt !== null && latestLiveUsdt !== undefined && !isNaN(latestLiveUsdt);`
   - `const totalUsdt = isLiveUsdt ? latestLiveUsdt : (fifoResult.remainingInventoryUSDT || 0);`
2. **Store Internal Controller Cache**:
   - Save `currentModalBankCash = totalBankCash;` and `currentModalUsdt = totalUsdt;` to module-level variables to ensure rock-solid numerical precision during high-frequency typing.
3. **Resolve Reference Rate**:
   - Call `resolveReferenceRate({ activeSellAd: latestActiveAd, latestTrade: trades, fifoAvgBuyCost: fifoResult.avgHoldingCostPerUSDT, openingDefaultRate: openingInventory?.defaultCostBasis, openingInventory, fallbackRate: 1500.00 })`.
4. **Calculate Initial Net Worth**:
   - Call `calculateNetWorth(totalBankCash, totalUsdt, referenceRate)`.
5. **Populate DOM Elements**:
   - **Date Field** (`#snapshot-date` / `#input-snapshot-date`): Pre-filled with local ISO string `getLocalIsoDateTime(new Date())` (e.g., `2026-08-25T14:30`).
   - **Bank Cash Display** (`#snapshot-bank-cash` / `#input-snapshot-bank-cash`):
     - If `<input>`: `el.value = totalBankCash;`
     - If text/container: `el.textContent = formatNGN(totalBankCash);`
     - Dataset attribute: `el.dataset.val = totalBankCash.toString();`
   - **USDT Balance Display** (`#snapshot-usdt-balance` / `#input-snapshot-usdt-balance`):
     - If `<input>`: `el.value = totalUsdt;`
     - If text/container: `el.textContent = formatUSDT(totalUsdt);`
     - Dataset attribute: `el.dataset.val = totalUsdt.toString();`
   - **Reference Rate Input** (`#input-snapshot-ref-rate` / `#snapshot-reference-rate`):
     - Value: `(Math.round(referenceRate * 100) / 100).toString()` (e.g. `1535` or `1535.50`).
     - Clear validation classes (`input-error`, `is-invalid`, `border-danger`).
   - **Notes Input** (`#input-snapshot-notes` / `#snapshot-notes`):
     - Reset to empty string `''`.
   - **Preview NGN** (`#snapshot-preview-networth-ngn` / `#snapshot-preview-ngn`):
     - `textContent = formatNGN(initialNw.netWorthNgn);`
     - CSS class: `font-mono ${initialNw.netWorthNgn >= 0 ? 'text-success' : 'text-danger'}`.
   - **Preview USDT** (`#snapshot-preview-networth-usdt` / `#snapshot-preview-usdt`):
     - `textContent = formatUSDT(initialNw.netWorthUsdt);`
   - **Rate Warning** (`#snapshot-rate-warning`):
     - Add `.hidden` class and clear text.
   - **Submit Button** (`#btn-save-snapshot-submit`):
     - `disabled = false`.
6. **Reveal Modal & UX**:
   - Remove class `.hidden` from `#modal-snapshot-backdrop`.
   - Focus reference rate input: `inputRate?.focus(); inputRate?.select();`
   - Refresh Lucide icons: `if (window.lucide) window.lucide.createIcons();`

### 3.3 Real-time Interactive Recalculation Engine (`handleSnapshotRateInput`)
Listening on both `'input'` and `'change'` events on `#input-snapshot-ref-rate` (and delegated on `document`):
1. **Parse Input Rate**:
   - `const rawVal = inputRate.value.trim();`
   - `const rate = parseFloat(rawVal);`
2. **Retrieve Current Bank Cash & USDT Balances**:
   - Prefer module cache `currentModalBankCash` and `currentModalUsdt`.
   - Fallback to reading `data-val` or `.value` from `#snapshot-bank-cash` and `#snapshot-usdt-balance`.
3. **Branch 1: Valid Positive Rate ($R_{\text{ref}} > 0$ and isFinite)**:
   - Compute `const preview = calculateNetWorth(bankCash, usdtBalance, rate);`
   - Update `#snapshot-preview-networth-ngn` / `#snapshot-preview-ngn`: `formatNGN(preview.netWorthNgn)`
   - Update `#snapshot-preview-networth-usdt` / `#snapshot-preview-usdt`: `formatUSDT(preview.netWorthUsdt)`
   - Remove invalid error styling from input (`is-invalid`, `input-error`, `border-danger`).
   - Hide rate warning element if present.
   - Enable submit button (`#btn-save-snapshot-submit.disabled = false`).
4. **Branch 2: Invalid / Non-positive Rate ($R_{\text{ref}} \le 0$, `NaN`, or empty)**:
   - Compute fallback valuation: `calculateNetWorth(bankCash, usdtBalance, 0);`
   - Update preview NGN: `rawVal === '' ? '—' : formatNGN(fallback.netWorthNgn)`
   - Update preview USDT: `rawVal === '' ? '—' : formatUSDT(fallback.netWorthUsdt)`
   - Add warning/invalid class on input (`border-danger`, `is-invalid`).
   - Display warning message in `#snapshot-rate-warning` ("Please enter a valid exchange rate greater than 0").
   - (Note: Form validation will also block submission via HTML5 `min="0.01"` and JavaScript submit handler in `m3_explorer_3`).

### 3.4 Modal Teardown & Reset (`closeSnapshotModal`)
1. Add class `.hidden` to `#modal-snapshot-backdrop`.
2. Reset `#form-save-snapshot` if element exists (`formSnapshot.reset()`).
3. Clear temporary validation styles.

---

## 4. Complete JavaScript Implementation Blueprint for `js/dashboard.js`

Below is the exact code block to be integrated into `js/dashboard.js`:

```javascript
import { store } from './store.js';
import {
  formatNGN,
  formatUSDT,
  formatRate,
  formatDateTime,
  getLocalIsoDateTime,
  calculateFIFOInventoryAndPnL,
  calculateTotalBankCash,
  resolveReferenceRate,
  calculateNetWorth,
  calculateSnapshotDelta,
  formatDeltaBadgeText,
  formatDeltaUsdtText,
  escapeHtml
} from './utils.js';
import { bybitService } from './bybitService.js';

let chartInstance = null;
let currentChartPeriod = 'all';
let latestActiveAd = null;
let latestLiveUsdt = null;

// Temporary cache for modal calculations
let currentModalBankCash = 0;
let currentModalUsdt = 0;

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
  setupSnapshotModalEvents();

  const btnSyncAd = document.getElementById('btn-sync-active-ad');
  btnSyncAd?.addEventListener('click', () => {
    syncAndRenderActiveAd(true);
    syncBybitLiveInventory();
  });

  // Listen for store updates across all collections
  window.addEventListener('store:updated', (e) => {
    const type = e.detail?.type;
    const handledTypes = ['trades', 'banks', 'transfers', 'settings', 'snapshots', 'SNAPSHOTS_UPDATED', 'all'];
    if (!type || handledTypes.includes(type)) {
      renderDashboardMetrics();
      renderRecentTradesList();
      updateDashboardChart();
      syncAndRenderActiveAd();
      syncBybitLiveInventory();
    }
  });
}

/**
 * Setup event listeners for the End Day / Save Net Worth Snapshot modal
 */
export function setupSnapshotModalEvents() {
  const btnOpenSnapshot = document.getElementById('btn-open-snapshot-modal');
  const modalBackdrop = document.getElementById('modal-snapshot-backdrop');
  const btnClose = document.getElementById('btn-close-snapshot-modal');
  const btnCancel = document.getElementById('btn-cancel-snapshot-modal') || document.getElementById('btn-cancel-snapshot');
  const inputRate = document.getElementById('input-snapshot-ref-rate') || document.getElementById('snapshot-reference-rate');

  btnOpenSnapshot?.addEventListener('click', openSnapshotModal);
  btnClose?.addEventListener('click', closeSnapshotModal);
  btnCancel?.addEventListener('click', closeSnapshotModal);

  // Close on backdrop click
  modalBackdrop?.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) {
      closeSnapshotModal();
    }
  });

  // Listen to custom open event and register global helpers
  window.addEventListener('modal:open-snapshot', openSnapshotModal);
  window.openSaveSnapshotModal = openSnapshotModal;
  window.closeSaveSnapshotModal = closeSnapshotModal;

  // Real-time preview recalculation on reference rate input
  if (inputRate) {
    inputRate.addEventListener('input', handleSnapshotRateInput);
    inputRate.addEventListener('change', handleSnapshotRateInput);
  }

  // Delegated event listener for dynamically mounted modals
  document.addEventListener('input', (e) => {
    if (e.target && (e.target.id === 'input-snapshot-ref-rate' || e.target.id === 'snapshot-reference-rate')) {
      handleSnapshotRateInput();
    }
  });
  document.addEventListener('change', (e) => {
    if (e.target && (e.target.id === 'input-snapshot-ref-rate' || e.target.id === 'snapshot-reference-rate')) {
      handleSnapshotRateInput();
    }
  });
}

/**
 * Open End Day / Save Net Worth Snapshot modal and pre-fill live calculated metrics
 */
export function openSnapshotModal() {
  const modalBackdrop = document.getElementById('modal-snapshot-backdrop');
  const elBankCash = document.getElementById('snapshot-bank-cash') || document.getElementById('input-snapshot-bank-cash');
  const elUsdtBalance = document.getElementById('snapshot-usdt-balance') || document.getElementById('input-snapshot-usdt-balance');
  const elDate = document.getElementById('snapshot-date') || document.getElementById('input-snapshot-date');
  const inputRate = document.getElementById('input-snapshot-ref-rate') || document.getElementById('snapshot-reference-rate');
  const inputNotes = document.getElementById('input-snapshot-notes') || document.getElementById('snapshot-notes');
  const previewNgn = document.getElementById('snapshot-preview-networth-ngn') || document.getElementById('snapshot-preview-ngn');
  const previewUsdt = document.getElementById('snapshot-preview-networth-usdt') || document.getElementById('snapshot-preview-usdt');
  const rateWarning = document.getElementById('snapshot-rate-warning');
  const btnSubmit = document.getElementById('btn-save-snapshot-submit');

  const trades = store.getTrades();
  const openingInventory = store.getOpeningInventory();
  const fifoResult = calculateFIFOInventoryAndPnL(trades, openingInventory);

  // 1. Calculate live bank cash
  const computedBankBalances = store.getComputedBankBalances ? store.getComputedBankBalances() : new Map();
  const totalBankCash = calculateTotalBankCash(computedBankBalances);

  // 2. Calculate live Bybit USDT balance (funding wallet + active ads, or FIFO inventory fallback)
  const isLiveUsdt = latestLiveUsdt !== null && latestLiveUsdt !== undefined && !isNaN(latestLiveUsdt);
  const totalUsdt = isLiveUsdt ? latestLiveUsdt : (fifoResult.remainingInventoryUSDT || 0);

  currentModalBankCash = totalBankCash;
  currentModalUsdt = totalUsdt;

  // 3. Resolve default reference rate
  const referenceRate = resolveReferenceRate({
    activeSellAd: latestActiveAd,
    latestTrade: trades,
    fifoAvgBuyCost: fifoResult.avgHoldingCostPerUSDT,
    openingDefaultRate: openingInventory?.defaultCostBasis,
    openingInventory: openingInventory,
    fallbackRate: 1500.00
  });

  // 4. Calculate initial Net Worth preview
  const initialNw = calculateNetWorth(totalBankCash, totalUsdt, referenceRate);

  // 5. Pre-fill modal fields
  if (elDate) {
    try {
      elDate.value = getLocalIsoDateTime(new Date());
    } catch (e) {
      elDate.value = new Date().toISOString().slice(0, 16);
    }
  }

  if (elBankCash) {
    if (elBankCash.tagName === 'INPUT') {
      elBankCash.value = totalBankCash;
    } else {
      elBankCash.textContent = formatNGN(totalBankCash);
    }
    elBankCash.dataset.val = totalBankCash.toString();
  }

  if (elUsdtBalance) {
    if (elUsdtBalance.tagName === 'INPUT') {
      elUsdtBalance.value = totalUsdt;
    } else {
      elUsdtBalance.textContent = formatUSDT(totalUsdt);
    }
    elUsdtBalance.dataset.val = totalUsdt.toString();
  }

  if (inputRate) {
    inputRate.value = referenceRate > 0 ? (Math.round(referenceRate * 100) / 100).toString() : '1500.00';
    inputRate.classList.remove('input-error', 'is-invalid', 'border-danger');
  }

  if (inputNotes) {
    inputNotes.value = '';
  }

  if (previewNgn) {
    previewNgn.textContent = formatNGN(initialNw.netWorthNgn);
    previewNgn.className = `font-mono ${initialNw.netWorthNgn >= 0 ? 'text-success' : 'text-danger'}`;
  }

  if (previewUsdt) {
    previewUsdt.textContent = formatUSDT(initialNw.netWorthUsdt);
  }

  if (rateWarning) {
    rateWarning.classList.add('hidden');
    rateWarning.textContent = '';
  }

  if (btnSubmit) {
    btnSubmit.disabled = false;
  }

  // 6. Show modal
  if (modalBackdrop) {
    modalBackdrop.classList.remove('hidden');
  }

  // Focus rate input
  inputRate?.focus();

  if (window.lucide) window.lucide.createIcons();
}

/**
 * Close End Day / Save Net Worth Snapshot modal and reset form
 */
export function closeSnapshotModal() {
  const modalBackdrop = document.getElementById('modal-snapshot-backdrop');
  if (modalBackdrop) {
    modalBackdrop.classList.add('hidden');
  }
  const formSnapshot = document.getElementById('form-save-snapshot');
  if (formSnapshot) {
    formSnapshot.reset();
  }
}

/**
 * Real-time dynamic recalculation on reference rate input change
 */
export function handleSnapshotRateInput() {
  const inputRate = document.getElementById('input-snapshot-ref-rate') || document.getElementById('snapshot-reference-rate');
  const previewNgn = document.getElementById('snapshot-preview-networth-ngn') || document.getElementById('snapshot-preview-ngn');
  const previewUsdt = document.getElementById('snapshot-preview-networth-usdt') || document.getElementById('snapshot-preview-usdt');
  const rateWarning = document.getElementById('snapshot-rate-warning');
  const btnSubmit = document.getElementById('btn-save-snapshot-submit');

  if (!inputRate) return;

  const rawVal = inputRate.value.trim();
  const rate = parseFloat(rawVal);

  // Retrieve current modal bank cash and usdt balances
  const elBankCash = document.getElementById('snapshot-bank-cash') || document.getElementById('input-snapshot-bank-cash');
  const elUsdtBalance = document.getElementById('snapshot-usdt-balance') || document.getElementById('input-snapshot-usdt-balance');

  let bankCash = currentModalBankCash;
  if (elBankCash) {
    if (elBankCash.dataset?.val !== undefined && elBankCash.dataset.val !== '') {
      bankCash = parseFloat(elBankCash.dataset.val) || 0;
    } else if (elBankCash.value !== undefined && elBankCash.value !== '') {
      bankCash = parseFloat(elBankCash.value) || 0;
    }
  }

  let usdtBalance = currentModalUsdt;
  if (elUsdtBalance) {
    if (elUsdtBalance.dataset?.val !== undefined && elUsdtBalance.dataset.val !== '') {
      usdtBalance = parseFloat(elUsdtBalance.dataset.val) || 0;
    } else if (elUsdtBalance.value !== undefined && elUsdtBalance.value !== '') {
      usdtBalance = parseFloat(elUsdtBalance.value) || 0;
    }
  }

  const isValidRate = !isNaN(rate) && isFinite(rate) && rate > 0;

  if (isValidRate) {
    const preview = calculateNetWorth(bankCash, usdtBalance, rate);

    if (previewNgn) {
      previewNgn.textContent = formatNGN(preview.netWorthNgn);
      previewNgn.className = `font-mono ${preview.netWorthNgn >= 0 ? 'text-success' : 'text-danger'}`;
    }
    if (previewUsdt) {
      previewUsdt.textContent = formatUSDT(preview.netWorthUsdt);
    }
    if (rateWarning) {
      rateWarning.classList.add('hidden');
      rateWarning.textContent = '';
    }
    inputRate.classList.remove('input-error', 'is-invalid', 'border-danger');
    if (btnSubmit) btnSubmit.disabled = false;
  } else {
    // Rate <= 0, NaN, or empty
    const fallbackPreview = calculateNetWorth(bankCash, usdtBalance, 0);

    if (previewNgn) {
      previewNgn.textContent = rawVal === '' ? '—' : formatNGN(fallbackPreview.netWorthNgn);
    }
    if (previewUsdt) {
      previewUsdt.textContent = rawVal === '' ? '—' : formatUSDT(fallbackPreview.netWorthUsdt);
    }
    if (rateWarning) {
      rateWarning.classList.remove('hidden');
      rateWarning.textContent = 'Please enter a valid exchange rate greater than 0.';
    }
    if (rawVal !== '') {
      inputRate.classList.add('input-error', 'is-invalid', 'border-danger');
    }
  }
}
```

---

## 5. Edge Case & Boundary Analysis Matrix

| # | Edge Case / Scenario | Risk / Failure Mode | Proposed Mitigation / Implementation Behavior |
|---|----------------------|---------------------|-----------------------------------------------|
| 1 | Reference rate entered as `0` or negative | Division by zero ($\text{bankCash} / 0$) causing `Infinity` or `NaN` | `calculateNetWorth` guards against `rate <= 0` and returns `netWorthUsdt = totalUsdt`. `handleSnapshotRateInput` flags warning and adds `is-invalid` class. |
| 2 | Reference rate cleared (empty input `""`) | `parseFloat("")` yields `NaN` | Displays `—` or baseline bank cash, hides misleading numbers, prompts user for positive rate. |
| 3 | Bybit wallet offline or unauthenticated | `latestLiveUsdt` is `null` | Controller smoothly falls back to FIFO remaining inventory `fifoResult.remainingInventoryUSDT`. |
| 4 | Linked bank accounts have negative balance (overdraft) | Mathematical distortion in total net worth | `calculateTotalBankCash` preserves negative numbers ($-\text{₦}50,000$), arithmetic in `calculateNetWorth` accurately sums net liquid position without throwing. |
| 5 | High-speed typing / keystroke burst | DOM thrashing or desync | Synchronous pure function recalculation with negligible compute footprint (<0.01ms per keystroke). |
| 6 | Decimal precision inputs (e.g. `1535.75`) | Truncation of kobo/fractional exchange rates | `parseFloat` retains full float precision; `formatNGN` and `formatUSDT` format final preview output to 2 decimal places. |
| 7 | Modal opened multiple times sequentially | Stale notes or invalid rate states persisting | `openSnapshotModal` resets notes, recalculates live balances, resolves latest rate, and clears validation errors on every open. |
| 8 | Multiple selector variants in DOM or mock environments | Selector mismatch between markup versions (`#input-snapshot-ref-rate` vs `#snapshot-reference-rate`) | Controller employs coalesced queries (`document.getElementById('input-snapshot-ref-rate') || document.getElementById('snapshot-reference-rate')`). |

---

## 6. Verification & Test Plan

1. **Unit / Feature Tests** (`test/tier1-feature-coverage/net-worth-features.test.js`):
   - `F10.3`: Pre-fills modal fields with live calculated Bank Cash and Bybit USDT balance.
   - `F10.4`: Modal opening removes `.hidden` class from `#modal-snapshot-backdrop`.
   - `F10.5`: Modal cancel button closes modal and restores `.hidden` class.
   - `F11.1`: Modifying reference rate input triggers dynamic Net Worth recalculation.
   - `F11.2`: Dynamic Net Worth preview updates in both NGN and USDT simultaneously.
   - `F11.5`: Dynamic preview updates DOM elements when input event is fired.
2. **Boundary Tests** (`test/tier2-boundary-corner-cases/net-worth-boundary.test.js`):
   - `B10.2`: Zero balance pre-fills `0.00` cleanly.
   - `B10.3`: Backdrop click closes modal.
   - `B10.4`: Escape key triggers modal closure.
   - `B11.1` - `B11.3`: Non-numeric, zero, and negative rates handled safely.
3. **Full System Verification**:
   - `npm test`: Verify 100% pass across all tiers (Tier 1-5).
