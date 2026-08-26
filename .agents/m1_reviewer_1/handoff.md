# Milestone 1 Review & Adversarial Challenge Report

**Reviewer**: `m1_reviewer_1` (Milestone 1 Reviewer & Adversarial Critic)  
**Parent**: Project Orchestrator (`a90fce10-da57-446a-b348-94b9b5b8c1a6`)  
**Date**: 2026-08-25  
**Milestone**: Milestone 1 (M1: Core Calculations & Snapshot Store Engine)  
**Verdict**: **APPROVE**

---

## 1. Observation

### 1.1 Source Code Verification
1. **`c:\dev\p2p\js\utils.js`**:
   - `calculateTotalBankCash(computedBankBalances)` (Lines 319–363):
     - Verified support for `Map` instances (iterating `computedBankBalances.values()`), `Array` instances, and plain `Object` dictionaries.
     - Correctly checks for `.currentBalance` or `.balance`, casts to finite numbers, and handles negative overdraft balances without clipping to 0.
     - Safely returns `0` for empty, `null`, `undefined`, or non-collection inputs.
   - `resolveReferenceRate(options)` (Lines 383–461):
     - Implements 5-tier fallback priority hierarchy:
       1. Active Bybit Sell Ad price (`options.activeSellAd` where `isSellSide` checks `side === 1` and `isActiveStatus` checks `status in [10, 20, 2]`).
       2. Latest trade rate (`options.latestTrade`, supporting array sorted chronologically descending, single trade object, or numeric rate).
       3. FIFO avg buy cost (`options.fifoAvgBuyCost > 0`).
       4. Opening default cost basis (`options.openingDefaultRate` or `options.openingInventory.defaultCostBasis > 0`).
       5. Fallback rate (`options.fallbackRate > 0` or default `1500.00`).
     - Rejects non-positive or non-finite rates at each stage.
   - `calculateNetWorth(totalBankCashNgn, totalUsdt, referenceRate)` (Lines 474–499):
     - Mathematical formula implementation:
       $$\text{NW}_{\text{NGN}} = T_{\text{bank}} + (U_{\text{bybit}} \times R_{\text{ref}})$$
       $$\text{NW}_{\text{USDT}} = U_{\text{bybit}} + (T_{\text{bank}} / R_{\text{ref}})$$
     - Division by zero and negative rate guard: when `rate <= 0 || !isFinite(rate)`, returns `netWorthNgn: bankCash` and `netWorthUsdt: usdt`, avoiding `Infinity` or `NaN`.
     - Rounds `netWorthNgn` and `netWorthUsdt` to 2 decimal places.
   - `calculateSnapshotDelta(current, previous)` (Lines 510–542):
     - Absolute differences: $\Delta_{\text{NGN}} = \text{NW}_{\text{NGN, c}} - \text{NW}_{\text{NGN, p}}$, $\Delta_{\text{USDT}} = \text{NW}_{\text{USDT, c}} - \text{NW}_{\text{USDT, p}}$.
     - Percentage deltas: $\%\Delta = \frac{\Delta}{|\text{NW}_{\text{p}}|} \times 100$.
     - Division by zero baseline protection: when $|\text{NW}_{\text{p}}| \le 0.000001$, returns `0%`.
     - Sign-preserving negative baseline handling: transition from negative net worth to positive net worth correctly yields a positive growth percentage.
     - Gracefully returns all 0s when `current` or `previous` is `null` or `undefined`.
   - `validateSnapshot(snapshotData)` (Lines 550–631):
     - Validates object type, positive reference rate (`rate > 0`), valid date string/timestamp, finite bank cash, and non-negative USDT balance (`usdtBalance >= 0`).
     - Auto-assigns unique ID (`snp_<timestamp>_<rand>`), ISO timestamp, and createdAt if missing.
     - Derives `netWorthNgn` and `netWorthUsdt` if omitted.

2. **`c:\dev\p2p\js\store.js`**:
   - `STORAGE_KEYS.NET_WORTH_SNAPSHOTS` is configured as `'bybit_p2p_net_worth_snapshots'`.
   - `getSnapshots()` (Lines 310–326): Retrieves, validates array format, and returns snapshots sorted chronologically ascending (`oldest -> newest`).
   - `getSnapshotById(id)` (Lines 332–336): Retrieves single snapshot or `null`.
   - `saveSnapshot(snapshotData)` (Lines 347–380): Validates schema, performs upsert, enforces chronological ordering in storage, and dispatches `store:updated` event notifications (`snapshots` and `SNAPSHOTS_UPDATED`).
   - `deleteSnapshot(id)` (Lines 387–400): Removes snapshot, updates LocalStorage, and dispatches `store:updated` notifications.
   - `clearSnapshots()` (Lines 405–409): Resets snapshots to `[]` and dispatches notifications.
   - `exportAllData()` (Lines 413–423): Serializes full application state including `snapshots: this.getSnapshots()`.
   - `importAllData(data, replace)` (Lines 425–493): Correctly parses snapshots in both replace and merge modes with ID deduplication and sanitization.
   - `clearAllData()` (Lines 495–504): Cleans up `STORAGE_KEYS.NET_WORTH_SNAPSHOTS` along with all other app collections.

3. **`c:\dev\p2p\js\export.js`**:
   - `exportFullBackupJSON()` includes snapshot collection from `store.exportAllData()`.
   - `importBackupJSON(file)` includes `snapshots` in schema validation and restore summary prompt dialog.

4. **`c:\dev\p2p\test\tier1-feature-coverage\r1-m1-calculation-engine.test.js`**:
   - 15 comprehensive unit tests exercising all mathematical edge cases, priority hierarchies, snapshot CRUD operations, and backup/restore flows.

### 1.2 Test Execution Results
- Executed `node test/run-tests.js`:
```
Test Execution Summary:
Total Tests : 341
Passed      : 341
Failed      : 0
Duration    : 2369ms

Tier Breakdown:
  Tier 1  : 188/188 passed (100.0%)
  Tier 2  : 129/129 passed (100.0%)
  Tier 3  : 14/14 passed (100.0%)
  Tier 4  : 10/10 passed (100.0%)
```

---

## 2. Logic Chain

1. **Mathematical Rigor & Zero Safety**:
   - Observation: `calculateNetWorth` guards against `rate <= 0` and non-finite rates; `calculateSnapshotDelta` checks `Math.abs(prevNgn) > 0.000001` before dividing.
   - Logic: No combination of invalid inputs (0 rate, negative cash, null baselines) can produce `NaN`, `Infinity`, or uncaught runtime exceptions in the calculation engine.

2. **Hierarchical Determinism**:
   - Observation: `resolveReferenceRate` evaluates options in strict precedence order: active Sell ad (side 1, online status) -> latest trade -> FIFO cost -> opening default -> fallback.
   - Logic: The system guarantees a deterministic and valid positive exchange rate regardless of network or inventory state.

3. **Store Integrity & Ordering Invariant**:
   - Observation: Both `getSnapshots()`, `saveSnapshot()`, and `importAllData()` sort snapshots chronologically by ISO timestamp with `createdAt` fallback.
   - Logic: Downstream time-series visualizers (such as Chart.js in Milestone 4) and sequential delta calculations will always receive data in strict temporal order without inversion anomalies.

4. **Integrity & Non-Evasion Check**:
   - Observation: All functions in `js/utils.js` and `js/store.js` implement genuine mathematical and storage logic; no hardcoded test mocks, bypasses, or dummy implementations exist.
   - Logic: The work satisfies all benchmark integrity constraints.

---

## 3. Caveats

- **UI Rendering Integration**: Full DOM rendering for the Live Net Worth Hero Widget, End Day modal, and Chart.js trend visualization will be implemented and reviewed in Milestones 2, 3, and 4. The underlying calculation and data store contracts reviewed here fully support these downstream interfaces.

---

## 4. Conclusion

**Verdict: APPROVE**

The Milestone 1 work product meets 100% of the functional, mathematical, and persistence specifications described in `ORIGINAL_REQUEST.md` and `PROJECT.md`. All unit and regression test suites pass with 100% success rate (341/341 tests passing).

---

## 5. Verification Method

To independently reproduce the verification:
1. Run the entire automated test runner:
   ```bash
   node test/run-tests.js
   ```
   **Expected**: 341 tests pass, 0 failures.
2. Run Tier 1 test suites specifically:
   ```bash
   node test/run-tests.js --tier=1
   ```
   **Expected**: 188 tests pass, 0 failures.
3. Inspect `c:\dev\p2p\js\utils.js`, `c:\dev\p2p\js\store.js`, and `c:\dev\p2p\js\export.js` for interface contract compliance.
