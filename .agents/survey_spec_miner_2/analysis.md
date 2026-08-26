# Specification Mining Analysis: Net Worth & Capital Cycle Tracking

**Author**: survey_spec_miner_2 (Specification & Requirements Miner)  
**Date**: 2026-08-25  
**Working Directory**: `c:\dev\p2p\.agents\survey_spec_miner_2`  
**Target Codebase**: Bybit NGN P2P Trade Tracker (`c:\dev\p2p`)  

---

## 1. Executive Summary

This specification mining document defines the complete technical, mathematical, schema, and architectural requirements for implementing the **Net Worth & Capital Cycle Tracking System** (R1, R2, R3) in the Bybit NGN P2P Trade Tracker application.

The tracker enables Nigerian P2P merchants to monitor their overall capital state in real time, record end-of-day/milestone balance snapshots, and visualize historical portfolio growth across both Nigerian Naira (NGN) and Tether (USDT).

---

## 2. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | R1: Net Worth Engine | Reactive Total Bank Cash Derivation | Computes total liquid Naira cash held across all registered bank accounts by summing current ledger balances | Store bank accounts (`bybit_p2p_banks`), Trades (`bybit_p2p_trades`), Transfers (`bybit_p2p_transfers`) | `totalBankCash: number` (sum of `initialBalance + totalInflow - totalOutflow` across all banks) | If no banks exist, returns `0`. Negative balances (overdrafts) subtract algebraically | `ORIGINAL_REQUEST.md` §R1, `js/store.js:188-257` |
| 2 | R1: Net Worth Engine | Bybit USDT Capital Aggregation | Computes total USDT capital by aggregating locked/active ad volume and free funding balance | Bybit balance API (`/api/balance`), Active ads API (`/api/ads`), or FIFO inventory fallback (`store.getTrades()`, `store.getOpeningInventory()`) | `totalBybitUSDT: number` (`adAllocation + freeForBuyback` or `remainingInventoryUSDT`) | If API is unreachable/unauthorized, gracefully falls back to FIFO remaining inventory | `ORIGINAL_REQUEST.md` §R1, `js/dashboard.js:158-245`, `js/settings.js:117-164` |
| 3 | R1: Net Worth Engine | Exchange Rate Priority & Resolution | Resolves authoritative real-time NGN/USDT reference rate using prioritized cascading fallback | 1. Active Sell Ad Price (`status=10/20`), 2. Recent trade rate, 3. FIFO average cost basis, 4. Opening inventory cost basis, 5. Default fallback (1,500.00) | `effectiveReferenceRate: number` (> 0) | If active ad is offline, falls back seamlessly to internal ledger rates without zero division | `ORIGINAL_REQUEST.md` §R1, `js/dashboard.js:55-153`, `js/pricing.js:163-403` |
| 4 | R1: Net Worth Engine | Real-Time Dual Net Worth Calculation | Calculates live portfolio valuation simultaneously in NGN and USDT | `totalBankCash: number`, `totalUSDT: number`, `rate: number` | `netWorthNGN: number`, `netWorthUSDT: number` | Guard against `rate <= 0`: if rate is 0/invalid, USDT net worth falls back to `totalUSDT` | `ORIGINAL_REQUEST.md` §R1 |
| 5 | R1: Net Worth UI | Live Net Worth Dashboard Widget | Prominent Hero metric display in Dashboard header or Portfolio Overview presenting dual-currency Net Worth | `totalBankCash`, `totalUSDT`, `netWorthNGN`, `netWorthUSDT`, `rate` | Rendered HTML DOM elements with live currency formatting and rate badge | Displays `₦0.00` / `0.00 USDT` when empty; updates reactively on store events | `ORIGINAL_REQUEST.md` §R1, `js/views/dashboard.view.js` |
| 6 | R2: Snapshot System | Snapshot Storage & Schema | Persistent LocalStorage storage of point-in-time net worth snapshots | Snapshot object: `{ id, timestamp, bankCash, usdtBalance, referenceRate, netWorthNgn, netWorthUsdt, notes }` | Persisted JSON array in LocalStorage key `bybit_p2p_net_worth_snapshots` | Invalid JSON or missing key initializes empty array `[]` | `ORIGINAL_REQUEST.md` §R2 |
| 7 | R2: Snapshot System | "End Day / Save Snapshot" Modal Trigger | Modal UI on Dashboard allowing merchants to review, edit reference rate, and save snapshot | User click on `#btn-open-snapshot-modal`, pre-populated live ledger/Bybit values | Modal backdrop `#modal-snapshot-backdrop` with pre-filled inputs and live preview | Non-blocking modal; Esc / backdrop click dismisses safely | `ORIGINAL_REQUEST.md` §R2, `js/views/modals.view.js` |
| 8 | R2: Snapshot System | Editable Reference Rate & Live Recalculation | Allows user to customize reference rate in modal with instant reactive preview of NGN and USDT net worth | User input in `#snapshot-rate-input` (`step="0.01"`), edited bank/USDT overrides | Dynamically updated preview values for `netWorthNgn` and `netWorthUsdt` | Input sanitization: enforces positive numeric rate; disables submit if invalid | `ORIGINAL_REQUEST.md` §R2 |
| 9 | R2: Snapshot System | Snapshot Validation & Persistence | Validates inputs and commits snapshot record to `bybit_p2p_net_worth_snapshots` | Form submission event `#form-save-snapshot` | Added snapshot record, `store:updated` event, toast notification | Prevents NaN, null timestamps, negative rates, or corrupt data types | `ORIGINAL_REQUEST.md` §R2, `js/store.js:68-76` |
| 10 | R3: Historical Analytics | Chronological Delta Computation | Computes absolute and percentage change between consecutive snapshots | Sorted historical snapshots array ($S_0, S_1, \dots, S_n$) | Absolute $\Delta\text{NGN}$, $\% \Delta\text{NGN}$, Absolute $\Delta\text{USDT}$, $\% \Delta\text{USDT}$ | First snapshot returns `—` (no previous); handles 0 previous balance without `NaN`/`Infinity` | `ORIGINAL_REQUEST.md` §R3 |
| 11 | R3: Historical Analytics | Net Worth Trend Line Chart | Visualizes historical net worth growth over time using Chart.js | Historical snapshots sorted by timestamp ascending | Rendered Chart.js line chart canvas `#netWorthTrendChart` | If $< 2$ snapshots, renders clean empty state guidance | `ORIGINAL_REQUEST.md` §R3, `js/dashboard.js:415-568` |
| 12 | R3: Historical Analytics | Dual-Axis / Currency Toggle Control | Allows toggling or dual-axis viewing between NGN growth and USDT growth | User toggle click (`NGN`, `USDT`, `Both`) or segmented control | Re-renders chart datasets with matching currency scales and gradient fills | Retains user selection across page reloads via localStorage | `ORIGINAL_REQUEST.md` §R3 |
| 13 | R3: Data Management | Snapshot JSON Backup & Export | Includes historical net worth snapshots in full database JSON backup export | Store snapshot records from `bybit_p2p_net_worth_snapshots` | Exported JSON payload contains `netWorthSnapshots: [...]` | Zero snapshots export as empty array `[]` | `ORIGINAL_REQUEST.md` §R3, `js/export.js:106-114` |
| 14 | R3: Data Management | Snapshot JSON Import & Migration | Restores and merges net worth snapshots from JSON backup files | Uploaded JSON file containing `netWorthSnapshots` | Reconstituted snapshot records in store with schema validation | Invalid/corrupt records sanitized; recomputes missing net worth fields if needed | `ORIGINAL_REQUEST.md` §R3, `js/export.js:120-151`, `js/store.js:316-344` |
| 15 | R3: Data Management | Snapshot History Table / List | Displays historical snapshot log with timestamps, rates, balances, and deletion actions | Historical snapshot array | Rendered table or card list with formatters and delete confirmation | Deletion recalculates deltas for subsequent records reactively | `ORIGINAL_REQUEST.md` §R3, `js/app.js:233-279` |

---

## 3. Edge Cases

| # | Feature | Input / Condition | Observed / Required Behavior |
|---|---------|-------------------|------------------------------|
| 1 | R1: Live Bank Cash | Zero bank accounts configured in store | `totalBankCash = 0.00`. Subtext indicates "0 linked accounts". No runtime error. |
| 2 | R1: Live Bank Cash | One or more bank accounts have negative balance (e.g. initialBalance 0, BUY trade ₦1,000,000) | Algebraically summed: `currentBalance = -1,000,000`. Net Worth formula correctly deducts negative bank balance. Display formatted as `-₦1,000,000.00` in danger color. |
| 3 | R1: Total Bybit USDT | Bybit API offline / proxy token missing | Fallback to FIFO remaining inventory `fifoResult.remainingInventoryUSDT`. If no trades, falls back to `openingInventory.startingUsdtBalance`. If none, evaluates to `0.00`. |
| 4 | R1: Exchange Rate | No active Bybit Sell ad online (`latestActiveAd = null`) | Cascading fallback resolves rate: 1. Most recent trade rate $\to$ 2. FIFO average buy cost $\to$ 3. Opening inventory cost basis $\to$ 4. Standard default `₦1,500.00`. Rate is never `0` or `null`. |
| 5 | R1: Exchange Rate | Active ad price is `0` or negative string | Validated by `parseFloat(ad.price) > 0`. If false, rejected and cascades to next fallback. |
| 6 | R2: Snapshot Modal | User manually types `0` or negative reference rate into modal input | Form validation (`input[min="0.01"]`) triggers browser constraint validation; Save button disabled / blocked. Modal displays error badge: "Rate must be greater than 0". |
| 7 | R2: Snapshot Modal | User opens modal while bank balances are updating in background | Modal initial values reflect authoritative state at open time; rate change triggers immediate live recomputation of `netWorthNgn` and `netWorthUsdt`. |
| 8 | R2: Snapshot Persistence | LocalStorage quota exceeded or corrupted string in key | Store `getItem` returns `[]`; store `saveItem` catches error and reports user-friendly toast without crashing application. |
| 9 | R3: Delta Calculation | Only 1 snapshot exists in history (Initial / baseline snapshot) | Absolute delta = `—` or `₦0.00`, Percentage delta = `—` or `0.00%`. Badge styled neutral ("Baseline Snapshot"). |
| 10 | R3: Delta Calculation | Previous snapshot had `netWorthNgn = 0` (Zero Divisor) | Formula checks divisor: if $S_{n-1} = 0$, returns `+100.0%` (if $S_n > 0$), `-100.0%` (if $S_n < 0$), or `0.0%` (if $S_n = 0$). Never produces `NaN` or `Infinity%`. |
| 11 | R3: Delta Calculation | Snapshots recorded out of chronological order (e.g. backdated timestamp) | System sorts array by `new Date(timestamp).getTime()` ascending before delta computation and before feeding Chart.js. |
| 12 | R3: Delta Calculation | Two snapshots recorded with identical timestamp | Secondary sort by `id` or creation index preserves deterministic order without array instability. |
| 13 | R3: Trend Chart | Exactly 0 or 1 snapshot logged | Chart canvas is hidden or replaced with `#snapshot-chart-empty-state` container: "Log at least 2 snapshots to track your Net Worth trend." |
| 14 | R3: Trend Chart | 100+ snapshots logged over several months | Chart.js options configure responsive point decimation or max ticks limit on x-axis (`maxTicksLimit: 10`) to prevent tick label collision on mobile screens. |
| 15 | R3: JSON Import | Imported JSON has legacy v1 format without `netWorthSnapshots` key | Import succeeds without error; preserves existing snapshots or initializes `[]` safely. |
| 16 | R3: JSON Import | Imported JSON contains malformed snapshot object (e.g. missing `netWorthNgn`) | Import sanitizer computes missing `netWorthNgn = bankCash + (usdtBalance * referenceRate)` and `netWorthUsdt = usdtBalance + (bankCash / referenceRate)`. |
| 17 | R3: JSON Import | Import mode set to "Merge" (non-replace) | Deduplicates snapshots by `id` or exact `(timestamp, bankCash, usdtBalance)` hash to prevent duplicated snapshot points. |
| 18 | R3: Snapshot Deletion | User deletes intermediate snapshot from history | Subsequent snapshot reactively recomputes its delta against the new immediate predecessor; chart re-renders instantly. |

---

## 4. Mathematical Specifications & Formulas

### 4.1. Live Net Worth Formulations (R1)

Let:
- $B$: Set of all registered bank accounts in the ledger, where each bank $b \in B$ has a computed balance $C_b$:
  $$C_b = \text{initialBalance}_b + \sum_{t \in \text{SELL}_b} \text{netAmount}_t - \sum_{t \in \text{BUY}_b} \text{netAmount}_t + \sum_{x \in \text{XFER\_IN}_b} \text{amount}_x - \sum_{x \in \text{XFER\_OUT}_b} (\text{amount}_x + \text{fee}_x)$$
- $T_{\text{bank}}$: Total liquid Naira cash across all bank accounts:
  $$T_{\text{bank}} = \sum_{b \in B} C_b$$
- $U_{\text{bybit}}$: Total Bybit USDT balance:
  $$U_{\text{bybit}} = \begin{cases}
  U_{\text{funding\_total}} = U_{\text{free}} + U_{\text{locked\_ads}} & \text{if Bybit Live API is available} \\
  U_{\text{fifo\_inventory}} = \text{remainingInventoryUSDT} & \text{if Bybit Live API is offline/unavailable}
  \end{cases}$$
- $R_{\text{ref}}$: Authoritative reference exchange rate (NGN per USDT):
  $$R_{\text{ref}} = \begin{cases}
  P_{\text{active\_sell\_ad}} & \text{if an active sell ad is online} (status \in \{10, 20, 2\}) \\
  R_{\text{last\_trade}} & \text{else if trade history exists and } R_{\text{last\_trade}} > 0 \\
  C_{\text{avg\_fifo}} & \text{else if FIFO inventory cost basis } > 0 \\
  C_{\text{opening}} & \text{else if opening inventory cost basis } > 0 \\
  1500.00 & \text{default constant fallback}
  \end{cases}$$

#### Valuation Equations:
1. **Total Net Worth in Naira (NGN)**:
   $$\text{NW}_{\text{NGN}} = T_{\text{bank}} + \left( U_{\text{bybit}} \times R_{\text{ref}} \right)$$

2. **Total Net Worth in Tether (USDT)**:
   $$\text{NW}_{\text{USDT}} = \begin{cases}
   U_{\text{bybit}} + \left( \frac{T_{\text{bank}}}{R_{\text{ref}}} \right) & \text{if } R_{\text{ref}} > 0 \\
   U_{\text{bybit}} & \text{if } R_{\text{ref}} \le 0
   \end{cases}$$

---

### 4.2. Snapshot Delta & Percentage Formulations (R3)

Given an array of snapshots ordered chronologically:
$$S = [S_0, S_1, S_2, \dots, S_n]$$
For any snapshot $S_k$ where $k \ge 1$ and its immediate chronological predecessor $S_{k-1}$:

1. **Absolute Naira Delta ($\Delta\text{NGN}$)**:
   $$\Delta\text{NGN}_k = S_k.\text{netWorthNgn} - S_{k-1}.\text{netWorthNgn}$$

2. **Percentage Naira Growth ($\%\Delta\text{NGN}$)**:
   $$\%\Delta\text{NGN}_k = \begin{cases}
   \left( \frac{\Delta\text{NGN}_k}{S_{k-1}.\text{netWorthNgn}} \right) \times 100 & \text{if } S_{k-1}.\text{netWorthNgn} > 0 \\
   +100.0\% & \text{if } S_{k-1}.\text{netWorthNgn} = 0 \text{ and } S_k.\text{netWorthNgn} > 0 \\
   -100.0\% & \text{if } S_{k-1}.\text{netWorthNgn} = 0 \text{ and } S_k.\text{netWorthNgn} < 0 \\
   0.0\% & \text{if } S_{k-1}.\text{netWorthNgn} = 0 \text{ and } S_k.\text{netWorthNgn} = 0
   \end{cases}$$

3. **Absolute USDT Delta ($\Delta\text{USDT}$)**:
   $$\Delta\text{USDT}_k = S_k.\text{netWorthUsdt} - S_{k-1}.\text{netWorthUsdt}$$

4. **Percentage USDT Growth ($\%\Delta\text{USDT}$)**:
   $$\%\Delta\text{USDT}_k = \begin{cases}
   \left( \frac{\Delta\text{USDT}_k}{S_{k-1}.\text{netWorthUsdt}} \right) \times 100 & \text{if } S_{k-1}.\text{netWorthUsdt} > 0 \\
   +100.0\% & \text{if } S_{k-1}.\text{netWorthUsdt} = 0 \text{ and } S_k.\text{netWorthUsdt} > 0 \\
   -100.0\% & \text{if } S_{k-1}.\text{netWorthUsdt} = 0 \text{ and } S_k.\text{netWorthUsdt} < 0 \\
   0.0\% & \text{if } S_{k-1}.\text{netWorthUsdt} = 0 \text{ and } S_k.\text{netWorthUsdt} = 0
   \end{cases}$$

---

## 5. Data Schemas & Storage Specifications

### 5.1. Storage Keys Constant Definition

In `js/store.js`:
```javascript
const STORAGE_KEYS = {
  VERSION: 'bybit_p2p_version',
  TRADES: 'bybit_p2p_trades',
  BANKS: 'bybit_p2p_banks',
  TRANSFERS: 'bybit_p2p_transfers',
  SETTINGS: 'bybit_p2p_settings',
  OPENING_INVENTORY: 'bybit_p2p_opening_inventory',
  NET_WORTH_SNAPSHOTS: 'bybit_p2p_net_worth_snapshots' // Required R2 key
};
```

### 5.2. NetWorthSnapshot Schema

```typescript
interface NetWorthSnapshot {
  id: string;              // e.g. "snap_m1a2b3c4_x9y8z7"
  timestamp: string;       // ISO 8601 string, e.g. "2026-08-25T18:30:00.000Z"
  bankCash: number;        // Total NGN bank cash (e.g. 3500000.00)
  usdtBalance: number;     // Total USDT (e.g. 1250.00)
  referenceRate: number;   // NGN/USDT reference rate (e.g. 1540.50)
  netWorthNgn: number;     // bankCash + (usdtBalance * referenceRate) -> 5,425,625.00
  netWorthUsdt: number;    // usdtBalance + (bankCash / referenceRate) -> 3,521.99
  notes?: string;          // Optional user note, e.g. "End of Day close"
  createdAt?: string;      // Optional metadata timestamp
}
```

### 5.3. Full Backup JSON Schema (v1.1)

```json
{
  "version": 1,
  "exportedAt": "2026-08-25T18:30:00.000Z",
  "trades": [ ... ],
  "bankAccounts": [ ... ],
  "transfers": [ ... ],
  "openingInventory": {
    "startingUsdtBalance": 1000.0,
    "defaultCostBasis": 1450.0
  },
  "netWorthSnapshots": [
    {
      "id": "snap_1724601600000_a1b2c3",
      "timestamp": "2026-08-25T18:00:00.000Z",
      "bankCash": 4500000.0,
      "usdtBalance": 2100.5,
      "referenceRate": 1535.0,
      "netWorthNgn": 7724267.5,
      "netWorthUsdt": 5032.0961,
      "notes": "Day 1 trading close"
    }
  ]
}
```

---

## 6. UI & Interaction Flow Specifications

### 6.1. Live Net Worth Hero Widget (Dashboard View)
Located in `js/views/dashboard.view.js` as the primary header metric:
1. **Total Net Worth (NGN)**: Highlighted in large font (e.g. `₦7,724,267.50`) with primary brand glow.
2. **Total Net Worth (USDT)**: Highlighted in secondary mono font (e.g. `5,032.10 USDT`).
3. **Reference Rate Badge**: Indicates active conversion rate (e.g. `Rate: ₦1,535.00/USDT (Live Ad)` or `(Ledger Fallback)`).
4. **Action Button**: `"End Day / Save Snapshot"` button (`#btn-open-snapshot-modal`) prominently placed next to or within the Net Worth card.

### 6.2. Snapshot Modal (`#modal-snapshot-backdrop`)
Located in `js/views/modals.view.js`:
- **Modal Header**: "Log Net Worth Snapshot" / "End of Day Balance Capture".
- **Fields**:
  - `Date & Time` (`#snapshot-date-input`): `datetime-local` pre-populated with current local time (`getLocalIsoDateTime()`).
  - `Bank Cash Balance (₦)` (`#snapshot-bank-cash`): Read-only / editable pre-populated from `T_bank`.
  - `Bybit USDT Balance` (`#snapshot-usdt-balance`): Read-only / editable pre-populated from `U_bybit`.
  - `Reference Exchange Rate (₦/USDT)` (`#snapshot-rate-input`): Editable numeric input pre-populated with `R_ref`.
  - **Live Preview Callout**:
    - Calculated Total NGN: `<span id="snapshot-preview-ngn">₦0.00</span>`
    - Calculated Total USDT: `<span id="snapshot-preview-usdt">0.00 USDT</span>`
  - `Notes (Optional)` (`#snapshot-notes-input`): Text input for journal annotations.
- **Actions**:
  - Cancel (`#btn-cancel-snapshot-modal`) $\to$ Closes modal.
  - Save Snapshot (`#btn-save-snapshot`) $\to$ Validates inputs, saves to store, triggers `store:updated`, closes modal, shows success toast.

### 6.3. Historical Comparison & Trend Chart
- **Historical Comparison Card / Section**:
  - Displays latest snapshot comparison:
    - Current Net Worth vs Previous Snapshot
    - Absolute delta: `+₦125,400.00` / `+81.70 USDT`
    - Percentage badge: `+1.65% Growth` (Success badge) or `-0.82%` (Danger badge)
  - Time elapsed since last snapshot (e.g. "Captured 6 hours ago").
- **Net Worth Trend Chart (`#netWorthTrendChart`)**:
  - Interactive Chart.js line graph.
  - Segmented control: `[NGN (₦)] [USDT ($)] [Both]` to switch currency views without vertical scale compression.
  - Point tooltips displaying formatted date, Net Worth, Bank Cash, USDT Balance, and Reference Rate used.
  - Empty state when $< 2$ snapshots exist.
- **Snapshot History Log / Management**:
  - Collapsible or tabbed table listing all recorded snapshots.
  - Columns: `Date`, `Bank Cash (₦)`, `USDT Balance`, `Rate (₦)`, `Net Worth (₦)`, `Net Worth (USDT)`, `Δ NGN (%)`, `Actions (Delete)`.

---

## 7. Store Methods & Contract Additions

To be integrated in `js/store.js`:

```javascript
// --- Net Worth Snapshots CRUD ---

getSnapshots() {
  const snapshots = this.getItem(STORAGE_KEYS.NET_WORTH_SNAPSHOTS, []);
  // Always return sorted chronologically by timestamp ascending
  return snapshots.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

getSnapshotById(id) {
  return this.getSnapshots().find(s => s.id === id) || null;
}

addSnapshot(snapshotData) {
  const snapshots = this.getSnapshots();
  const rate = Number(snapshotData.referenceRate) || 1;
  const bankCash = Number(snapshotData.bankCash) || 0;
  const usdtBalance = Number(snapshotData.usdtBalance) || 0;
  
  const netWorthNgn = Number(snapshotData.netWorthNgn) || (bankCash + (usdtBalance * rate));
  const netWorthUsdt = Number(snapshotData.netWorthUsdt) || (usdtBalance + (rate > 0 ? bankCash / rate : 0));

  const newSnapshot = {
    id: snapshotData.id || generateId('snapshot'),
    timestamp: snapshotData.timestamp || new Date().toISOString(),
    bankCash,
    usdtBalance,
    referenceRate: rate,
    netWorthNgn,
    netWorthUsdt,
    notes: snapshotData.notes ? String(snapshotData.notes).trim() : '',
    createdAt: new Date().toISOString()
  };

  snapshots.push(newSnapshot);
  // Keep sorted
  snapshots.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  this.saveItem(STORAGE_KEYS.NET_WORTH_SNAPSHOTS, snapshots);
  this.notify('snapshots', newSnapshot);
  return newSnapshot;
}

deleteSnapshot(id) {
  const snapshots = this.getSnapshots();
  const filtered = snapshots.filter(s => s.id !== id);
  this.saveItem(STORAGE_KEYS.NET_WORTH_SNAPSHOTS, filtered);
  this.notify('snapshots', { deletedId: id });
  return true;
}

clearSnapshots() {
  this.saveItem(STORAGE_KEYS.NET_WORTH_SNAPSHOTS, []);
  this.notify('snapshots', { cleared: true });
}
```

---

## 8. Verification & Test Strategy

To verify this specification during implementation:
1. **Tier 1 Unit Tests**:
   - `test-store-snapshots.js`: CRUD operations, chronological ordering, schema integrity, and localStorage isolation.
   - `test-net-worth-calculations.js`: Mathematical verification of `NW_NGN`, `NW_USDT`, `T_bank`, and cascading exchange rate resolution.
   - `test-delta-computations.js`: Exhaustive verification of absolute and percentage deltas, zero divisors, negative values, and single snapshot baseline.
2. **Tier 2 Boundary & Stress Tests**:
   - 0 linked bank accounts, negative bank accounts, 0 USDT balance, micro fractions (0.0001 USDT).
   - Rate boundary matrix: rate = 0.01, 1000, 2000, 100000.
   - 500 rapid sequential snapshots test.
3. **Tier 3 Integration & UI Tests**:
   - Modal opening, pre-population of live ledger numbers, editable rate input recalculation, submission flow.
   - Full JSON backup export, JSON restore, and merge deduplication.
   - Chart rendering, currency toggling, and empty state verification.

---

## 9. Conclusion

This specification provides a complete, unambiguous, and mathematically sound foundation for the implementation of R1, R2, and R3. All data models, fallback cascades, UI flows, and edge cases have been rigorously analyzed and mapped to the existing vanilla ES module architecture of `c:\dev\p2p`.
