# Analysis: Milestone 3 — Snapshot Form Submission, Validation, Storage Persistence & Feedback

## 1. Executive Summary

Milestone 3 completes the "End Day / Save Snapshot" workflow for the Bybit NGN P2P Trade Tracker. This analysis details the exact contract, validation mechanics, persistence lifecycle, reactive event flow, and user feedback mechanisms for handling the `#form-save-snapshot` form submission in `js/dashboard.js`.

### Key Responsibilities
1. **Form Submission Interception**: Intercept `#form-save-snapshot` `submit` event, prevent default browser behavior (`e.preventDefault()`).
2. **Strict Field Extraction & Validation**:
   - Extract and validate `referenceRate`: must be finite number $> 0$.
   - Extract and validate `bankCash`: finite numeric value (from ledger/state).
   - Extract and validate `usdtBalance`: non-negative finite numeric value (from Bybit funding balance or FIFO inventory).
   - Extract `timestamp`: valid ISO date string (defaulting to `new Date().toISOString()`).
   - Extract `notes`: sanitized and trimmed string.
3. **Error Handling & Feedback**:
   - If `referenceRate <= 0`, `NaN`, or empty: abort submission, do NOT close modal, do NOT persist to store, and show toast error:
     `window.showToast('Please enter a valid exchange rate greater than 0', 'error')`.
4. **Data Persistence via Store**:
   - Invoke `store.saveSnapshot(snapshotData)`.
   - `store.saveSnapshot` validates schema, computes `netWorthNgn` & `netWorthUsdt`, assigns unique ID `snp_<timestamp>_<random>`, timestamps `createdAt`, sorts chronologically in localStorage under `bybit_p2p_net_worth_snapshots`, and dispatches `store:updated`.
5. **Modal Closure & Success Toast**:
   - Close modal by adding `.hidden` to `#modal-snapshot-backdrop`.
   - Trigger success toast:
     `window.showToast('Net worth snapshot saved successfully', 'success')`.
6. **Immediate UI Refresh**:
   - Call `renderDashboardMetrics()`, `renderNetWorthWidget()`, and `updateDashboardChart()` to immediately refresh live widget metrics and the live delta badge.

---

## 2. Component Interaction & Data Flow Architecture

```
User Clicks "End Day / Snapshot" Button (#btn-open-snapshot-modal)
        │
        ▼
openSnapshotModal()
  ├─ Computes live bank cash: calculateTotalBankCash(store.getComputedBankBalances())
  ├─ Computes live USDT: latestLiveUsdt ?? fifoResult.remainingInventoryUSDT
  ├─ Resolves default rate: resolveReferenceRate(...)
  ├─ Pre-populates inputs: #input-snapshot-ref-rate, #input-snapshot-date, etc.
  ├─ Computes initial preview: calculateNetWorth(bankCash, usdtBalance, rate)
  └─ Removes .hidden from #modal-snapshot-backdrop
        │
        ▼
User adjusts rate / notes & clicks "Save Snapshot" (#btn-save-snapshot-submit)
        │
        ▼
#form-save-snapshot 'submit' listener
  ├─ e.preventDefault()
  ├─ Extract rate = parseFloat(#input-snapshot-ref-rate.value)
  │     │
  │     ├─ [INVALID: rate <= 0 || isNaN(rate)]
  │     │    ├─ window.showToast('Please enter a valid exchange rate greater than 0', 'error')
  │     │    └─ RETURN (Modal remains open, form stays intact)
  │     │
  │     └─ [VALID: rate > 0]
  │          ├─ Extract bankCash, usdtBalance, timestamp, notes (trimmed)
  │          ├─ snapshotData = { timestamp, bankCash, usdtBalance, referenceRate, notes }
  │          ├─ store.saveSnapshot(snapshotData)
  │          │    ├─ validateSnapshot(snapshotData) -> derives netWorthNgn & netWorthUsdt
  │          │    ├─ Saves to localStorage['bybit_p2p_net_worth_snapshots']
  │          │    └─ Dispatches window 'store:updated' (type: 'snapshots')
  │          ├─ Close modal: #modal-snapshot-backdrop.classList.add('hidden')
  │          ├─ window.showToast('Net worth snapshot saved successfully', 'success')
  │          └─ Immediate UI refresh: renderNetWorthWidget(), renderDashboardMetrics()
```

---

## 3. Form Submission & Validation Specification

### 3.1 Field Extraction Rules & Selectors

To ensure complete resilience against selector naming variations between tests and UI view templates, the submission handler should use dual-lookup selectors:

| Data Field | Primary Selector | Fallback Selector | Extraction Logic |
|------------|------------------|-------------------|------------------|
| **Form** | `#form-save-snapshot` | `form[name="save-snapshot"]` | Element reference |
| **Modal Backdrop** | `#modal-snapshot-backdrop` | `.modal-snapshot` | Add `.hidden` to close |
| **Reference Rate** | `#input-snapshot-ref-rate` | `#snapshot-reference-rate` | `parseFloat(el.value)` |
| **Bank Cash** | `#snapshot-bank-cash` | `data-raw-value` attribute | `parseFloat(el.dataset.raw || el.value)` or calculate live |
| **USDT Balance** | `#snapshot-usdt-balance` | `data-raw-value` attribute | `parseFloat(el.dataset.raw || el.value)` or calculate live |
| **Snapshot Date** | `#input-snapshot-date` | `#snapshot-date` | `el.value ? new Date(el.value).toISOString() : new Date().toISOString()` |
| **Notes** | `#input-snapshot-notes` | `#snapshot-notes` | `typeof el.value === 'string' ? el.value.trim() : ''` |
| **Submit Button** | `#btn-save-snapshot-submit` | `#btn-save-snapshot` | Disable during save, re-enable |
| **Cancel Button** | `#btn-cancel-snapshot-modal` | `#btn-cancel-snapshot` | Close modal on click |
| **Close Icon** | `#btn-close-snapshot-modal` | `.btn-close-modal` | Close modal on click |

### 3.2 Validation Matrix

| Input Condition | Action Taken | Modal State | Storage State | Toast Notification |
|---|---|---|---|---|
| `rate = ""` (empty) | Abort submission | Stays open | Not modified | `'Please enter a valid exchange rate greater than 0'` (error) |
| `rate = 0` | Abort submission | Stays open | Not modified | `'Please enter a valid exchange rate greater than 0'` (error) |
| `rate = -1500.00` | Abort submission | Stays open | Not modified | `'Please enter a valid exchange rate greater than 0'` (error) |
| `rate = "abc"` (NaN) | Abort submission | Stays open | Not modified | `'Please enter a valid exchange rate greater than 0'` (error) |
| `rate = 1535.50` (valid) | Proceed to save | Closed (`.hidden`) | Saved to localStorage | `'Net worth snapshot saved successfully'` (success) |
| `notes = "  Day 1  "` | Trim to `"Day 1"` | Closed (`.hidden`) | Saved with trimmed notes | `'Net worth snapshot saved successfully'` (success) |
| `notes = ""` (empty) | Set to `""` | Closed (`.hidden`) | Saved with empty notes | `'Net worth snapshot saved successfully'` (success) |

---

## 4. Storage Persistence Contract (`js/store.js`)

`store.saveSnapshot(snapshotData)` is the authoritative persistence entry point.

### 4.1 Input Schema to `store.saveSnapshot`
```javascript
{
  timestamp?: string,       // Optional ISO string (defaults to new Date().toISOString())
  bankCash: number,         // Liquid cash in NGN
  usdtBalance: number,      // Bybit USDT assets
  referenceRate: number,    // Exchange rate in NGN per USDT (> 0)
  notes?: string,           // Optional user notes
  id?: string               // Optional (auto-generated if omitted: 'snp_...')
}
```

### 4.2 Output / Saved Schema in `localStorage`
Key: `bybit_p2p_net_worth_snapshots`
```json
[
  {
    "id": "snp_ksd8f2_abc123",
    "timestamp": "2026-08-25T13:30:00.000Z",
    "bankCash": 2450000.50,
    "usdtBalance": 1850.25,
    "referenceRate": 1535.00,
    "netWorthNgn": 5290134.25,
    "netWorthUsdt": 3446.34,
    "notes": "End of trading day snapshot",
    "createdAt": 1724592600000
  }
]
```

### 4.3 Reactive Event Dispatched
`store.saveSnapshot` emits a custom event on `window`:
```javascript
window.dispatchEvent(new CustomEvent('store:updated', {
  detail: {
    type: 'snapshots',
    payload: savedSnapshot,
    timestamp: Date.now()
  }
}));
```
This automatically triggers `initDashboard`'s `store:updated` listener to execute:
- `renderDashboardMetrics()`
- `renderRecentTradesList()`
- `updateDashboardChart()`
- `renderNetWorthWidget()` (recalculates live delta badge against newest snapshot)

---

## 5. Exact JavaScript Implementation Blueprints

### Blueprint 5.1: Modal Form Setup & Submit Handler (`js/dashboard.js`)

```javascript
/**
 * State variable to cache prefilled snapshot values when opening modal
 */
let currentSnapshotModalData = {
  bankCash: 0,
  usdtBalance: 0,
  referenceRate: 1500.00
};

/**
 * Open "End Day / Save Snapshot" modal with prefilled live balances
 */
export function openSnapshotModal() {
  const modalBackdrop = document.getElementById('modal-snapshot-backdrop');
  if (!modalBackdrop) return;

  const trades = store.getTrades();
  const openingInventory = store.getOpeningInventory();
  const fifoResult = calculateFIFOInventoryAndPnL(trades, openingInventory);

  // 1. Calculate live bank cash
  const computedBankBalances = store.getComputedBankBalances ? store.getComputedBankBalances() : new Map();
  const bankCash = calculateTotalBankCash(computedBankBalances);

  // 2. Calculate live Bybit USDT balance
  const isLiveUsdt = latestLiveUsdt !== null && latestLiveUsdt !== undefined && !isNaN(latestLiveUsdt);
  const usdtBalance = isLiveUsdt ? latestLiveUsdt : (fifoResult.remainingInventoryUSDT || 0);

  // 3. Resolve default reference rate
  const defaultRate = resolveReferenceRate({
    activeSellAd: latestActiveAd,
    latestTrade: trades,
    fifoAvgBuyCost: fifoResult.avgHoldingCostPerUSDT,
    openingDefaultRate: openingInventory?.defaultCostBasis,
    openingInventory: openingInventory,
    fallbackRate: 1500.00
  });

  currentSnapshotModalData = {
    bankCash,
    usdtBalance,
    referenceRate: defaultRate
  };

  // 4. Prepopulate DOM elements
  const elBankCash = document.getElementById('snapshot-bank-cash');
  if (elBankCash) {
    if (elBankCash.tagName === 'INPUT') {
      elBankCash.value = bankCash.toFixed(2);
    } else {
      elBankCash.textContent = formatNGN(bankCash);
    }
    elBankCash.setAttribute('data-raw-value', bankCash.toString());
  }

  const elUsdt = document.getElementById('snapshot-usdt-balance');
  if (elUsdt) {
    if (elUsdt.tagName === 'INPUT') {
      elUsdt.value = usdtBalance.toFixed(2);
    } else {
      elUsdt.textContent = formatUSDT(usdtBalance);
    }
    elUsdt.setAttribute('data-raw-value', usdtBalance.toString());
  }

  const rateInput = document.getElementById('input-snapshot-ref-rate') || document.getElementById('snapshot-reference-rate');
  if (rateInput) {
    rateInput.value = defaultRate > 0 ? defaultRate.toString() : '1500';
  }

  const dateInput = document.getElementById('input-snapshot-date') || document.getElementById('snapshot-date');
  if (dateInput) {
    dateInput.value = getLocalIsoDateTime(new Date());
  }

  const notesInput = document.getElementById('input-snapshot-notes') || document.getElementById('snapshot-notes');
  if (notesInput) {
    notesInput.value = '';
  }

  // 5. Update initial preview
  updateSnapshotModalPreview(defaultRate);

  // 6. Display modal
  modalBackdrop.classList.remove('hidden');

  if (window.lucide) window.lucide.createIcons();
}

/**
 * Dynamically recalculate and update preview Net Worth inside snapshot modal
 * @param {number} rate
 */
export function updateSnapshotModalPreview(rate) {
  const previewNgn = document.getElementById('snapshot-preview-networth-ngn') || document.getElementById('snapshot-preview-ngn');
  const previewUsdt = document.getElementById('snapshot-preview-networth-usdt') || document.getElementById('snapshot-preview-usdt');

  const bankCash = currentSnapshotModalData.bankCash || 0;
  const usdtBalance = currentSnapshotModalData.usdtBalance || 0;
  const validRate = Number(rate) > 0 ? Number(rate) : 0;

  const { netWorthNgn, netWorthUsdt } = calculateNetWorth(bankCash, usdtBalance, validRate);

  if (previewNgn) {
    previewNgn.textContent = formatNGN(netWorthNgn);
  }
  if (previewUsdt) {
    previewUsdt.textContent = formatUSDT(netWorthUsdt);
  }
}

/**
 * Close the snapshot modal and optionally reset inputs
 */
export function closeSnapshotModal() {
  const modalBackdrop = document.getElementById('modal-snapshot-backdrop');
  if (modalBackdrop) {
    modalBackdrop.classList.add('hidden');
  }
}

/**
 * Bind form submit, input change, cancel, and close events for Save Snapshot modal
 */
export function setupSnapshotModal() {
  const form = document.getElementById('form-save-snapshot');
  const modalBackdrop = document.getElementById('modal-snapshot-backdrop');
  const btnClose = document.getElementById('btn-close-snapshot-modal');
  const btnCancel = document.getElementById('btn-cancel-snapshot-modal') || document.getElementById('btn-cancel-snapshot');
  const rateInput = document.getElementById('input-snapshot-ref-rate') || document.getElementById('snapshot-reference-rate');

  // Close handlers
  btnClose?.addEventListener('click', () => closeSnapshotModal());
  btnCancel?.addEventListener('click', () => closeSnapshotModal());

  // Real-time rate change preview
  rateInput?.addEventListener('input', () => {
    const rateVal = parseFloat(rateInput.value);
    updateSnapshotModalPreview(rateVal);
  });

  // Form submit handler
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      // 1. Extract rate
      const currentRateInput = document.getElementById('input-snapshot-ref-rate') || document.getElementById('snapshot-reference-rate');
      const rawRate = currentRateInput ? currentRateInput.value : '';
      const referenceRate = parseFloat(rawRate);

      // 2. Validate reference rate (> 0)
      if (isNaN(referenceRate) || !isFinite(referenceRate) || referenceRate <= 0) {
        if (window.showToast) {
          window.showToast('Please enter a valid exchange rate greater than 0', 'error');
        }
        currentRateInput?.focus();
        return;
      }

      // 3. Extract bankCash and usdtBalance
      let bankCash = currentSnapshotModalData.bankCash;
      let usdtBalance = currentSnapshotModalData.usdtBalance;

      const elBankCash = document.getElementById('snapshot-bank-cash');
      if (elBankCash) {
        const rawAttr = elBankCash.getAttribute('data-raw-value') || elBankCash.value;
        if (rawAttr !== null && rawAttr !== undefined && !isNaN(Number(rawAttr))) {
          bankCash = Number(rawAttr);
        }
      }

      const elUsdt = document.getElementById('snapshot-usdt-balance');
      if (elUsdt) {
        const rawAttr = elUsdt.getAttribute('data-raw-value') || elUsdt.value;
        if (rawAttr !== null && rawAttr !== undefined && !isNaN(Number(rawAttr))) {
          usdtBalance = Number(rawAttr);
        }
      }

      // 4. Extract timestamp
      const dateInput = document.getElementById('input-snapshot-date') || document.getElementById('snapshot-date');
      let timestamp = new Date().toISOString();
      if (dateInput && dateInput.value) {
        const parsedDate = new Date(dateInput.value);
        if (!isNaN(parsedDate.getTime())) {
          timestamp = parsedDate.toISOString();
        }
      }

      // 5. Extract notes
      const notesInput = document.getElementById('input-snapshot-notes') || document.getElementById('snapshot-notes');
      const notes = notesInput && typeof notesInput.value === 'string' ? notesInput.value.trim() : '';

      // 6. Build snapshot object
      const snapshotPayload = {
        timestamp,
        bankCash,
        usdtBalance,
        referenceRate,
        notes
      };

      try {
        // 7. Persist snapshot
        const saved = store.saveSnapshot(snapshotPayload);

        // 8. Close modal
        closeSnapshotModal();

        // 9. Toast success feedback
        if (window.showToast) {
          window.showToast('Net worth snapshot saved successfully', 'success');
        }

        // 10. Immediately refresh UI metrics & live delta badge
        renderDashboardMetrics();
        renderNetWorthWidget();
        updateDashboardChart();

        return saved;
      } catch (err) {
        console.error('[Dashboard] Error saving snapshot:', err);
        if (window.showToast) {
          window.showToast(err.message || 'Failed to save snapshot', 'error');
        }
      }
    });
  }
}
```

### Blueprint 5.2: Integration into `initDashboard` in `js/dashboard.js`

```javascript
export function initDashboard() {
  // Existing greetings & metric initialization
  renderDashboardMetrics();
  renderRecentTradesList();
  initDashboardChart();
  setupPeriodFilters();
  syncAndRenderActiveAd();
  syncBybitLiveInventory();

  // Bind snapshot modal controls
  setupSnapshotModal();

  // Wire End Day / Snapshot button to open modal
  const btnOpenSnapshot = document.getElementById('btn-open-snapshot-modal');
  btnOpenSnapshot?.addEventListener('click', () => {
    openSnapshotModal();
  });

  // Global window hook for modal opening
  window.openSaveSnapshotModal = openSnapshotModal;

  // Global event listener for custom dispatch
  window.addEventListener('modal:open-snapshot', () => {
    openSnapshotModal();
  });
}
```

---

## 6. Test Specifications for Verification

### Test 1: Successful Snapshot Submission & Storage
```javascript
it('Submits #form-save-snapshot, saves to store, closes modal, and shows success toast', () => {
  let toastMsg = null, toastType = null;
  window.showToast = (msg, type) => { toastMsg = msg; toastType = type; };

  openSnapshotModal();
  const rateInput = document.getElementById('input-snapshot-ref-rate') || document.getElementById('snapshot-reference-rate');
  rateInput.value = '1540.00';

  const form = document.getElementById('form-save-snapshot');
  form.dispatchEvent(new Event('submit', { cancelable: true }));

  const snapshots = store.getSnapshots();
  assert.strictEqual(snapshots.length, 1);
  assert.strictEqual(snapshots[0].referenceRate, 1540.00);
  assert.strictEqual(toastMsg, 'Net worth snapshot saved successfully');
  assert.strictEqual(toastType, 'success');

  const backdrop = document.getElementById('modal-snapshot-backdrop');
  assert.ok(backdrop.classList.contains('hidden'));
});
```

### Test 2: Error Handling on Zero or Negative Rate
```javascript
it('Rejects submission when rate is <= 0 or NaN, shows error toast, and keeps modal open', () => {
  let toastMsg = null, toastType = null;
  window.showToast = (msg, type) => { toastMsg = msg; toastType = type; };

  openSnapshotModal();
  const rateInput = document.getElementById('input-snapshot-ref-rate') || document.getElementById('snapshot-reference-rate');
  rateInput.value = '0';

  const form = document.getElementById('form-save-snapshot');
  form.dispatchEvent(new Event('submit', { cancelable: true }));

  const snapshots = store.getSnapshots();
  assert.strictEqual(snapshots.length, 0, 'No snapshot should be saved');
  assert.strictEqual(toastMsg, 'Please enter a valid exchange rate greater than 0');
  assert.strictEqual(toastType, 'error');

  const backdrop = document.getElementById('modal-snapshot-backdrop');
  assert.ok(!backdrop.classList.contains('hidden'), 'Modal must remain open on validation error');
});
```

### Test 3: Live Delta Badge Immediate Update on Save
```javascript
it('Updates live delta badge from baseline state to active delta immediately after snapshot save', () => {
  // Baseline initial state
  renderNetWorthWidget();
  const badge = document.getElementById('badge-net-worth-delta');
  assert.ok(badge.textContent.includes('Baseline on next snapshot') || badge.textContent.includes('No Baseline'));

  // Save snapshot
  openSnapshotModal();
  const rateInput = document.getElementById('input-snapshot-ref-rate') || document.getElementById('snapshot-reference-rate');
  rateInput.value = '1500';
  document.getElementById('form-save-snapshot').dispatchEvent(new Event('submit', { cancelable: true }));

  // Re-check badge
  const updatedBadge = document.getElementById('badge-net-worth-delta');
  assert.ok(updatedBadge.textContent.includes('0.00%') || updatedBadge.textContent.includes('₦0.00'));
});
```
