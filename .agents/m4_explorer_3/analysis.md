# Milestone 4 Technical Analysis & Blueprint: Snapshot History Table & Backup Integration

**Author**: `m4_explorer_3` (Role: M4 History Table & Backup Explorer)  
**Parent**: Project Orchestrator (`a90fce10-da57-446a-b348-94b9b5b8c1a6`)  
**Date**: 2026-08-25  
**Target Files**: `js/dashboard.js`, `js/export.js`, `js/store.js`, `js/views/settings.view.js`, `js/views/dashboard.view.js`

---

## 1. Executive Summary

Milestone 4 completes the historical Net Worth tracking capabilities of the Bybit NGN P2P Trade Tracker. While `m4_explorer_1` standardizes the UI markup/CSS and `m4_explorer_2` designs the Chart.js lifecycle controller, `m4_explorer_3` is tasked with:
1. **Designing the historical snapshot log controller (`renderSnapshotHistoryTable()`)**:
   - Computing sequential deltas for chronological snapshots $S_k$ relative to previous snapshots $S_{k-1}$ ($k \ge 1$) using `calculateSnapshotDelta(S_k, S_{k-1})`.
   - Rendering historical log entries in **reverse chronological order** (newest snapshot first) with dual-currency Net Worth (NGN & USDT), bank cash, USDT inventory, reference rate, delta badges, notes with popover/tooltip, and action buttons.
   - Implementing deletion workflows with confirmation modals, store persistence, reactive updates, and success toasts.
2. **Verifying backup, export, and restore integration**:
   - Auditing `js/export.js`, `js/store.js`, and `js/views/settings.view.js` for JSON snapshot export/import schema integrity, sanitization, and UI event hooks.

---

## 2. Mathematical Model & Sequential Delta Engine

### 2.1 Chronological Snapshot Sequence
Snapshots are persisted in `localStorage` under `bybit_p2p_net_worth_snapshots` and retrieved via `store.getSnapshots()`, which guarantees ascending chronological order:
$$\mathcal{S} = [S_0, S_1, S_2, \dots, S_{N-1}] \quad \text{where } t(S_0) \le t(S_1) \le \dots \le t(S_{N-1})$$

Each snapshot record $S_k$ contains:
- `id`: Unique snapshot string identifier (e.g. `snp_1724590800000_abc123`).
- `timestamp`: ISO-8601 string (e.g. `2026-08-25T13:00:00.000Z`).
- `bankCash`: Liquid Naira balance across reactive bank ledger.
- `usdtBalance`: Bybit USDT funding balance (ad listed + free).
- `referenceRate`: NGN/USDT valuation rate.
- `netWorthNgn`: $T_{\text{bank}} + (U_{\text{bybit}} \times R_{\text{ref}})$.
- `netWorthUsdt`: $U_{\text{bybit}} + (T_{\text{bank}} / R_{\text{ref}})$.
- `notes`: Optional user commentary (up to 500 characters).
- `createdAt`: Epoch millisecond timestamp.

### 2.2 Sequential Delta Formula
For any snapshot $S_k$ in the sequence ($k \in [0, N-1]$):

1. **Initial Baseline ($k = 0$)**:
   - $S_0$ has no predecessor.
   - $\text{isBaseline} = \text{true}$, $\Delta\text{NGN} = 0$, $\%\Delta\text{NGN} = 0$, $\Delta\text{USDT} = 0$, $\%\Delta\text{USDT} = 0$.
   - Display badge: `Baseline` (`badge-neutral`).

2. **Sequential Comparison ($k \ge 1$)**:
   $$\Delta\text{NGN}_k = S_k.\text{netWorthNgn} - S_{k-1}.\text{netWorthNgn}$$
   $$\%\Delta\text{NGN}_k = \begin{cases} 
   \left(\frac{\Delta\text{NGN}_k}{|S_{k-1}.\text{netWorthNgn}|}\right) \times 100 & \text{if } |S_{k-1}.\text{netWorthNgn}| > 0.000001 \\ 
   0 & \text{otherwise} 
   \end{cases}$$
   $$\Delta\text{USDT}_k = S_k.\text{netWorthUsdt} - S_{k-1}.\text{netWorthUsdt}$$
   $$\%\Delta\text{USDT}_k = \begin{cases} 
   \left(\frac{\Delta\text{USDT}_k}{|S_{k-1}.\text{netWorthUsdt}|}\right) \times 100 & \text{if } |S_{k-1}.\text{netWorthUsdt}| > 0.000001 \\ 
   0 & \text{otherwise} 
   \end{cases}$$

### 2.3 Reverse-Chronological Presentation Pipeline
To ensure readability, the presentation algorithm executes in two distinct stages:
1. **Calculation Pass (Ascending Order)**: Compute deltas forward in time ($S_k$ vs $S_{k-1}$).
2. **Display Pass (Descending Order)**: Reverse the enriched snapshot array so that the newest snapshot appears on row 1, followed by earlier snapshots, down to the baseline snapshot at the bottom.

```javascript
// Step 1: Sequential enrichment in chronological order
const enriched = snapshots.map((snapshot, idx) => {
  const isBaseline = idx === 0;
  const delta = isBaseline ? null : calculateSnapshotDelta(snapshot, snapshots[idx - 1]);
  return { ...snapshot, delta, isBaseline, chronologicalIndex: idx + 1 };
});

// Step 2: Reverse for UI display (newest first)
const displayList = [...enriched].reverse();
```

---

## 3. Detailed JavaScript Implementation Blueprint for `js/dashboard.js`

Below is the complete, drop-in blueprint to add to `js/dashboard.js`:

```javascript
/**
 * Render Historical Net Worth Snapshot Table & List
 * Computes sequential deltas (S_k vs S_{k-1}) and renders in reverse chronological order.
 * Handles responsive desktop table and mobile card layout, tooltips for notes, and deletion.
 */
export function renderSnapshotHistoryTable() {
  const tableBody = document.getElementById('snapshot-history-tbody');
  const listContainer = document.getElementById('snapshot-history-list');
  const emptyState = document.getElementById('empty-state-snapshots');
  const countBadge = document.getElementById('snapshot-history-count');
  const cardContainer = document.getElementById('card-snapshot-history');

  // If containers are not present on DOM, exit cleanly
  if (!tableBody && !listContainer && !emptyState) return;

  const snapshots = store.getSnapshots ? store.getSnapshots() : [];
  const totalCount = snapshots.length;

  if (countBadge) {
    countBadge.textContent = `${totalCount} ${totalCount === 1 ? 'snapshot' : 'snapshots'}`;
  }

  // 1. Handle Empty State
  if (totalCount === 0) {
    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-4 text-muted">
            <div class="empty-state-sm">
              <i data-lucide="camera" class="mb-2 text-muted"></i>
              <p class="mb-1 font-bold">No snapshots recorded yet</p>
              <p class="small text-muted mb-0">Click "End Day / Snapshot" to capture your first daily portfolio valuation.</p>
            </div>
          </td>
        </tr>
      `;
    }
    if (listContainer) {
      listContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon-box">
            <i data-lucide="camera"></i>
          </div>
          <p class="empty-title">No snapshots recorded yet</p>
          <p class="empty-subtitle">Click "End Day / Snapshot" to capture your first daily portfolio valuation.</p>
        </div>
      `;
    }
    if (emptyState) {
      emptyState.classList.remove('hidden');
    }
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  if (emptyState) {
    emptyState.classList.add('hidden');
  }

  // 2. Sequential Delta Computation (Ascending Order)
  const enrichedSnapshots = snapshots.map((snapshot, idx) => {
    const isBaseline = idx === 0;
    const previousSnapshot = isBaseline ? null : snapshots[idx - 1];
    const delta = isBaseline ? null : calculateSnapshotDelta(snapshot, previousSnapshot);
    return {
      ...snapshot,
      delta,
      isBaseline,
      seqNumber: idx + 1
    };
  });

  // 3. Reverse for Display (Newest First)
  const displaySnapshots = [...enrichedSnapshots].reverse();

  // 4. Render Desktop Table Body (if present)
  if (tableBody) {
    tableBody.innerHTML = displaySnapshots.map((item) => {
      const dateFormatted = formatDateTime(item.timestamp || item.createdAt);
      const bankCashFormatted = formatNGN(item.bankCash);
      const usdtFormatted = formatUSDT(item.usdtBalance);
      const rateFormatted = formatRate(item.referenceRate);
      const netWorthNgnFormatted = formatNGN(item.netWorthNgn);
      const netWorthUsdtFormatted = formatUSDT(item.netWorthUsdt);

      // Delta Badge Rendering
      let deltaBadgeHtml = '';
      if (item.isBaseline) {
        deltaBadgeHtml = `
          <span class="badge badge-neutral tiny" title="Initial baseline snapshot — no prior comparison">
            <i data-lucide="info"></i>
            <span>Baseline</span>
          </span>
        `;
      } else if (item.delta) {
        const isPos = item.delta.deltaNgn > 0.005;
        const isNeg = item.delta.deltaNgn < -0.005;
        const badgeClass = isPos ? 'badge-success' : (isNeg ? 'badge-danger' : 'badge-neutral');
        const iconName = isPos ? 'trending-up' : (isNeg ? 'trending-down' : 'minus');
        const badgeText = formatDeltaBadgeText(item.delta.deltaNgn, item.delta.pctDeltaNgn);
        const deltaUsdtText = formatDeltaUsdtText(item.delta.deltaUsdt);

        deltaBadgeHtml = `
          <span class="badge ${badgeClass} tiny" title="${deltaUsdtText} vs previous snapshot">
            <i data-lucide="${iconName}"></i>
            <span>${badgeText}</span>
          </span>
        `;
      }

      // Notes display with safe HTML escaping and modal trigger if long
      const notesRaw = typeof item.notes === 'string' ? item.notes.trim() : '';
      let notesHtml = '<span class="text-muted small">—</span>';
      if (notesRaw) {
        const escapedNotes = escapeHtml(notesRaw);
        if (notesRaw.length > 35) {
          notesHtml = `
            <span class="snapshot-note-preview text-truncate" title="${escapedNotes}" style="max-width: 140px; display: inline-block; vertical-align: middle;">
              ${escapedNotes.slice(0, 32)}...
            </span>
            <button type="button" class="btn-link tiny btn-view-note" data-note="${escapedNotes}" data-date="${escapeHtml(dateFormatted)}" title="Read full note">
              <i data-lucide="file-text"></i>
            </button>
          `;
        } else {
          notesHtml = `<span class="snapshot-note small text-muted" title="${escapedNotes}">${escapedNotes}</span>`;
        }
      }

      return `
        <tr class="snapshot-row" data-snapshot-id="${escapeHtml(item.id)}">
          <td class="font-mono small text-nowrap">
            <div class="d-flex align-items-center gap-1">
              <i data-lucide="calendar" class="text-muted" style="width: 14px; height: 14px;"></i>
              <span>${dateFormatted}</span>
            </div>
          </td>
          <td class="font-mono small text-success text-nowrap">${bankCashFormatted}</td>
          <td class="font-mono small text-accent text-nowrap">${usdtFormatted}</td>
          <td class="font-mono small text-muted text-nowrap">${rateFormatted}</td>
          <td class="font-mono fw-bold ${item.netWorthNgn >= 0 ? 'text-success' : 'text-danger'} text-nowrap">
            ${netWorthNgnFormatted}
          </td>
          <td class="font-mono small text-accent text-nowrap">${netWorthUsdtFormatted}</td>
          <td class="text-nowrap">${deltaBadgeHtml}</td>
          <td class="snapshot-notes-cell">${notesHtml}</td>
          <td class="text-end text-nowrap">
            <button 
              type="button" 
              class="btn-icon text-danger btn-delete-snapshot" 
              data-snapshot-id="${escapeHtml(item.id)}" 
              data-id="${escapeHtml(item.id)}"
              data-date="${escapeHtml(dateFormatted)}"
              title="Delete Snapshot" 
              aria-label="Delete Snapshot from ${escapeHtml(dateFormatted)}"
            >
              <i data-lucide="trash-2"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // 5. Render Mobile Card / List Container (if present)
  if (listContainer) {
    listContainer.innerHTML = displaySnapshots.map((item) => {
      const dateFormatted = formatDateTime(item.timestamp || item.createdAt);
      const bankCashFormatted = formatNGN(item.bankCash);
      const usdtFormatted = formatUSDT(item.usdtBalance);
      const rateFormatted = formatRate(item.referenceRate);
      const netWorthNgnFormatted = formatNGN(item.netWorthNgn);
      const netWorthUsdtFormatted = formatUSDT(item.netWorthUsdt);

      let deltaBadgeHtml = '';
      if (item.isBaseline) {
        deltaBadgeHtml = `<span class="badge badge-neutral tiny"><i data-lucide="info"></i> Baseline</span>`;
      } else if (item.delta) {
        const isPos = item.delta.deltaNgn > 0.005;
        const isNeg = item.delta.deltaNgn < -0.005;
        const badgeClass = isPos ? 'badge-success' : (isNeg ? 'badge-danger' : 'badge-neutral');
        const iconName = isPos ? 'trending-up' : (isNeg ? 'trending-down' : 'minus');
        const badgeText = formatDeltaBadgeText(item.delta.deltaNgn, item.delta.pctDeltaNgn);
        deltaBadgeHtml = `<span class="badge ${badgeClass} tiny"><i data-lucide="${iconName}"></i> ${badgeText}</span>`;
      }

      const notesRaw = typeof item.notes === 'string' ? item.notes.trim() : '';
      const notesBlock = notesRaw ? `
        <div class="snapshot-card-notes mt-2 p-2 rounded small text-muted" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);">
          <i data-lucide="file-text" style="width: 12px; height: 12px;" class="me-1"></i>
          <span>${escapeHtml(notesRaw)}</span>
        </div>
      ` : '';

      return `
        <div class="snapshot-card-item card p-3 mb-2" data-snapshot-id="${escapeHtml(item.id)}">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <div class="d-flex align-items-center gap-2">
              <span class="font-mono fw-bold text-muted small">${dateFormatted}</span>
              ${deltaBadgeHtml}
            </div>
            <button 
              type="button" 
              class="btn-icon text-danger btn-delete-snapshot" 
              data-snapshot-id="${escapeHtml(item.id)}" 
              data-id="${escapeHtml(item.id)}"
              data-date="${escapeHtml(dateFormatted)}"
              title="Delete Snapshot"
            >
              <i data-lucide="trash-2"></i>
            </button>
          </div>
          <div class="d-flex justify-content-between align-items-baseline mb-1">
            <span class="text-muted small">Net Worth:</span>
            <div class="text-end">
              <div class="font-mono fw-bold ${item.netWorthNgn >= 0 ? 'text-success' : 'text-danger'}">${netWorthNgnFormatted}</div>
              <div class="font-mono small text-accent">${netWorthUsdtFormatted}</div>
            </div>
          </div>
          <div class="d-flex justify-content-between text-muted small mt-2 pt-2 border-top border-secondary-subtle">
            <span>Bank: <strong class="font-mono text-success">${bankCashFormatted}</strong></span>
            <span>USDT: <strong class="font-mono text-accent">${usdtFormatted}</strong></span>
            <span>Rate: <strong class="font-mono">${rateFormatted}</strong></span>
          </div>
          ${notesBlock}
        </div>
      `;
    }).join('');
  }

  // 6. Bind Event Listeners (Delete buttons & View Note popovers)
  bindSnapshotHistoryActions();

  if (window.lucide) window.lucide.createIcons();
}

/**
 * Attach Event Listeners to Snapshot History Table Actions
 */
function bindSnapshotHistoryActions() {
  // Delete Snapshot Button Handler
  const deleteButtons = document.querySelectorAll('.btn-delete-snapshot');
  deleteButtons.forEach(btn => {
    // Avoid double binding
    btn.replaceWith(btn.cloneNode(true));
  });

  const refreshedDeleteButtons = document.querySelectorAll('.btn-delete-snapshot');
  refreshedDeleteButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const snapshotId = btn.getAttribute('data-snapshot-id') || btn.getAttribute('data-id');
      const dateStr = btn.getAttribute('data-date') || 'this date';
      if (!snapshotId) return;

      const confirmTitle = 'Delete Snapshot Record?';
      const confirmMsg = `Are you sure you want to delete the Net Worth snapshot from ${dateStr}?\n\nThis will remove it from historical charts and recalculate subsequent deltas.`;

      if (window.showConfirmModal) {
        window.showConfirmModal(
          confirmTitle,
          confirmMsg,
          () => executeDeleteSnapshot(snapshotId),
          'danger'
        );
      } else if (confirm(confirmMsg)) {
        executeDeleteSnapshot(snapshotId);
      }
    });
  });

  // View Full Note Modal/Alert Handler
  const viewNoteButtons = document.querySelectorAll('.btn-view-note');
  viewNoteButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const note = btn.getAttribute('data-note');
      const date = btn.getAttribute('data-date');
      if (window.showConfirmModal) {
        window.showConfirmModal(
          `Snapshot Note (${date})`,
          note,
          () => {},
          'warning'
        );
        // Adjust confirmation button label if needed
        const okBtn = document.getElementById('confirm-modal-ok');
        if (okBtn) okBtn.textContent = 'Close';
      } else {
        alert(`Snapshot Note (${date}):\n\n${note}`);
      }
    });
  });
}

/**
 * Execute snapshot deletion and trigger reactive UI refresh
 * @param {string} snapshotId
 */
export function executeDeleteSnapshot(snapshotId) {
  try {
    const deleted = store.deleteSnapshot(snapshotId);
    if (deleted) {
      if (window.showToast) {
        window.showToast('Snapshot deleted successfully.', 'success');
      }
      // Reactive UI refresh
      renderSnapshotHistoryTable();
      renderNetWorthWidget();
      if (typeof window.renderNetWorthTrendChart === 'function') {
        window.renderNetWorthTrendChart();
      }
    } else {
      if (window.showToast) {
        window.showToast('Snapshot record not found.', 'error');
      }
    }
  } catch (err) {
    console.error('[Dashboard] Error deleting snapshot:', err);
    if (window.showToast) {
      window.showToast('Failed to delete snapshot.', 'error');
    }
  }
}
```

---

## 4. DOM Layout & HTML Markup Integration

### 4.1 Card Container in `js/views/dashboard.view.js`
`m4_explorer_1` designs the container card placed below the Net Worth Trend Chart:

```html
<!-- Snapshot History Log Card -->
<div class="card mb-4" id="card-snapshot-history">
  <div class="card-header-flex mb-3">
    <div>
      <h3 class="card-title">Net Worth Snapshot History</h3>
      <p class="card-subtitle">Chronological ledger of end-of-day balances and sequential growth</p>
    </div>
    <div class="d-flex align-items-center gap-2">
      <span class="badge badge-neutral" id="snapshot-history-count">0 snapshots</span>
    </div>
  </div>

  <!-- Desktop Responsive Table View -->
  <div class="table-responsive d-none d-md-block" id="snapshot-history-table-container">
    <table class="table table-hover align-middle mb-0" id="table-snapshot-history">
      <thead>
        <tr>
          <th>Date & Time</th>
          <th>Bank Cash</th>
          <th>Bybit USDT</th>
          <th>Ref Rate</th>
          <th>Net Worth (NGN)</th>
          <th>Net Worth (USDT)</th>
          <th>Sequential Delta</th>
          <th>Notes</th>
          <th class="text-end">Action</th>
        </tr>
      </thead>
      <tbody id="snapshot-history-tbody">
        <!-- Rendered by renderSnapshotHistoryTable() -->
      </tbody>
    </table>
  </div>

  <!-- Mobile Card List View -->
  <div class="d-md-none" id="snapshot-history-list">
    <!-- Rendered by renderSnapshotHistoryTable() -->
  </div>

  <!-- Empty State Fallback Container -->
  <div class="empty-state hidden" id="empty-state-snapshots">
    <div class="empty-icon-box">
      <i data-lucide="camera"></i>
    </div>
    <p class="empty-title">No snapshots recorded yet</p>
    <p class="empty-subtitle">Click "End Day / Snapshot" on the dashboard to record your first closing valuation.</p>
  </div>
</div>
```

---

## 5. Verification of Backup, Export & Restore Integration

### 5.1 Verification Matrix

| Component | Function / Hook | Expected Behavior | Verification Status |
|-----------|-----------------|-------------------|---------------------|
| `js/store.js` | `exportAllData()` | Returns object containing `snapshots: store.getSnapshots()`. | **VERIFIED** (lines 413–423) |
| `js/store.js` | `importAllData(data, replace=true)` | Validates, sanitizes, and sorts snapshots. Replaces or merges snapshots and dispatches `notify('all')`. | **VERIFIED** (lines 425–493) |
| `js/store.js` | `clearAllData()` | Purges `STORAGE_KEYS.NET_WORTH_SNAPSHOTS` and notifies listeners. | **VERIFIED** (lines 495–503) |
| `js/export.js` | `exportFullBackupJSON()` | Serializes full backup including snapshots and triggers download `bybit_p2p_backup_YYYY-MM-DD.json`. | **VERIFIED** (lines 106–114) |
| `js/export.js` | `importBackupJSON(file)` | Reads JSON file, validates schema, prompts confirmation summarizing snapshot count, and imports data. | **VERIFIED** (lines 119–158) |
| `js/views/settings.view.js` | `#btn-export-json` | Triggers `exportFullBackupJSON()`. | **VERIFIED** (lines 406–408 in `settings.js`) |
| `js/views/settings.view.js` | `#input-import-json` | Triggers `importBackupJSON(file)` on file selection. | **VERIFIED** (lines 411–417 in `settings.js`) |
| `js/views/settings.view.js` | `#btn-clear-all-data` | Prompts confirmation modal and invokes `store.clearAllData()`. | **VERIFIED** (lines 420–435 in `settings.js`) |

### 5.2 JSON Schema Contract
```json
{
  "version": 1,
  "exportedAt": "2026-08-25T20:00:00.000Z",
  "trades": [],
  "bankAccounts": [],
  "transfers": [],
  "openingInventory": { "startingUsdtBalance": 0, "defaultCostBasis": 0 },
  "snapshots": [
    {
      "id": "snp_1724590800000_abc123",
      "timestamp": "2026-08-25T13:00:00.000Z",
      "bankCash": 1250000.50,
      "usdtBalance": 1500.25,
      "referenceRate": 1535.00,
      "netWorthNgn": 3552884.25,
      "netWorthUsdt": 2314.58,
      "notes": "End of daily trading session",
      "createdAt": 1724590800000
    }
  ]
}
```

---

## 6. Edge Cases & Safeguards

1. **Intermediate Snapshot Deletion**:
   - When snapshot $S_k$ is deleted from $[S_0, S_1, S_2, S_3]$, $S_{k+1}$'s delta must dynamically recalculate against $S_{k-1}$.
   - Verified by test `F15.4`: Deleting an intermediate snapshot dynamically recalculates subsequent deltas without error.
2. **Zero and Negative Denominators**:
   - `calculateSnapshotDelta` protects against division by zero ($|S_{k-1}.\text{netWorthNgn}| \le 0.000001$) by returning `pctDelta = 0.00%`.
3. **HTML Sanitization**:
   - All user inputs (notes, IDs, dates) rendered in DOM are passed through `escapeHtml()` to neutralize potential XSS payloads.
4. **Reactivity**:
   - Deleting or adding a snapshot fires `store.notify('snapshots')` and `store.notify('SNAPSHOTS_UPDATED')`.
   - `dashboard.js` listens to `store:updated` and automatically refreshes metrics, chart, and history table.

---

## 7. Test Specifications & Assertions

```javascript
// Test 1: Sequential Delta Calculation across 3 Snapshots
const s1 = { netWorthNgn: 1000000, netWorthUsdt: 1000 };
const s2 = { netWorthNgn: 1200000, netWorthUsdt: 1100 };
const s3 = { netWorthNgn: 1150000, netWorthUsdt: 1050 };

const d1 = calculateSnapshotDelta(s2, s1);
assert.strictEqual(d1.deltaNgn, 200000);
assert.strictEqual(d1.pctDeltaNgn, 20.00);

const d2 = calculateSnapshotDelta(s3, s2);
assert.strictEqual(d2.deltaNgn, -50000);
assert.closeTo(d2.pctDeltaNgn, -4.17, 0.01);

// Test 2: Reverse Chronological Order Rendering
const tableRows = document.querySelectorAll('#snapshot-history-tbody tr');
assert.strictEqual(tableRows[0].getAttribute('data-snapshot-id'), 'snp_3', 'Newest snapshot should be first');
assert.strictEqual(tableRows[2].getAttribute('data-snapshot-id'), 'snp_1', 'Oldest snapshot should be last');
```
