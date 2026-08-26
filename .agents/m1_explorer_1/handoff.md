# Milestone 1: Mathematical Calculation Engine Handoff Report

- **Agent**: `m1_explorer_1` (Role: M1 Calculation Engine Explorer)
- **Working Directory**: `c:\dev\p2p\.agents\m1_explorer_1`
- **Target Files**: `js/utils.js` (and integration into `js/dashboard.js`, `js/store.js`, `test/`)
- **Recipient**: Project Orchestrator (`a90fce10-da57-446a-b348-94b9b5b8c1a6`)
- **Date**: 2026-08-25T13:14:10Z

---

## 1. Observation

1. **Existing Bank Balance Aggregator in `js/dashboard.js` (Lines 305–312)**:
   ```javascript
   const computedBankBalances = store.getComputedBankBalances ? store.getComputedBankBalances() : new Map();
   let totalBankCash = 0;
   let activeBanksCount = 0;
   computedBankBalances.forEach(rec => {
     totalBankCash += rec.currentBalance;
     activeBanksCount++;
   });
   ```
   *Observation*: `store.getComputedBankBalances()` returns a `Map<string, Object>`. However, there is no centralized pure helper in `js/utils.js` to aggregate bank cash across `Map`, `Array`, or serialized `Object` structures, nor does it currently handle nulls or malformed records.

2. **Existing Reference Rate & Inventory Pricing in `js/dashboard.js` (Lines 71–80)**:
   ```javascript
   const activeSellAd = ads.find(a => Number(a.side) === 1 && Number(a.status) === 10)
     || ads.find(a => Number(a.side) === 1 && (Number(a.status) === 20 || Number(a.status) === 2))
     || null;
   const avgBuyCost = fifoResult.avgHoldingCostPerUSDT || openingInventory.defaultCostBasis || 0;
   ```
   *Observation*: The application uses Bybit Sell Ads (`side: 1`, `status: 10/20/2`), FIFO average holding cost, and opening inventory default cost basis, but lacks a unified, prioritized reference rate resolution function `resolveReferenceRate(options)` that also incorporates the latest trade rate and static fallback rate (`1500.00`).

3. **Requirement Specifications in `PROJECT.md` (Lines 44–54)**:
   - `calculateTotalBankCash(computedBankBalances: Map | Array | Object): number`
   - `resolveReferenceRate(options: { activeSellAd?, latestTrade?, fifoAvgBuyCost?, openingDefaultRate?, fallbackRate? }): number`
   - `calculateNetWorth(totalBankCashNgn, totalUsdt, referenceRate): { netWorthNgn, netWorthUsdt }`
     - Formulas: $\text{NW}_{\text{NGN}} = T_{\text{bank}} + (U_{\text{bybit}} \times R_{\text{ref}})$ and $\text{NW}_{\text{USDT}} = U_{\text{bybit}} + (T_{\text{bank}} / R_{\text{ref}})$
   - `calculateSnapshotDelta(current, previous): { deltaNgn, pctDeltaNgn, deltaUsdt, pctDeltaUsdt }`

4. **Snapshot Storage Contract in `PROJECT.md` (Lines 56–70)**:
   - Key: `bybit_p2p_net_worth_snapshots`
   - Snapshot fields: `id`, `timestamp`, `bankCash`, `usdtBalance`, `referenceRate`, `netWorthNgn`, `netWorthUsdt`, `notes`, `createdAt`.

5. **Existing Test Suite Execution**:
   - Running `node test/run-tests.js` executed 133 tests across Tiers 1–4 with 100% pass rate (0 failures).

---

## 2. Logic Chain

1. **Step 1 — Bank Cash Aggregation**:
   - `store.getComputedBankBalances()` provides accounts with dynamic balances ($C_i$).
   - Polymorphic handling (`instanceof Map`, `Array.isArray()`, `typeof === 'object'`) allows `calculateTotalBankCash` to operate interchangeably on live Map instances, backup JSON objects, and synthetic test arrays.
   - Using `Number(currentBalance) || 0` prevents `NaN` poisoning and preserves negative overdraft balances.

2. **Step 2 — Reference Rate Resolution Hierarchy**:
   - Precedence: Active Sell Ad ($P_{\text{ad}}$) $\to$ Latest Trade ($R_{\text{latest}}$) $\to$ FIFO Holding Cost ($C_{\text{fifo}}$) $\to$ Opening Default Basis ($R_{\text{opening}}$) $\to$ Static Fallback (`1500.00`).
   - Checking `isFinite(rate) && rate > 0` ensures non-positive or corrupted numbers at any priority level seamlessly advance to the next candidate tier.

3. **Step 3 — Closed-Form Net Worth Valuation**:
   - Total liquid assets in NGN must equal bank cash plus crypto converted at the reference rate.
   - Total liquid assets in USDT must equal crypto holdings plus fiat cash converted at the reference rate.
   - When `referenceRate <= 0` or invalid, division by zero is guarded by returning `netWorthNgn = bankCash` and `netWorthUsdt = totalUsdt`, avoiding `Infinity` or `NaN`.

4. **Step 4 — Snapshot Delta & Sign Consistency**:
   - $\Delta = \text{Current} - \text{Previous}$.
   - Percentage delta divides by $|\text{Previous}|$ when $|\text{Previous}| > 10^{-6}$.
   - Dividing by absolute value ensures that migrating from a negative net worth ($-\text{₦}100,000$) to a positive net worth ($+\text{₦}50,000$) calculates as $+150\%$, reflecting true economic growth.
   - When previous is missing or 0, percentage delta defaults safely to `0%`.

5. **Step 5 — Snapshot Validation**:
   - Validates all invariants ($R_{\text{ref}} > 0$, valid date, $U \ge 0$).
   - Automatically computes `netWorthNgn` and `netWorthUsdt` if omitted, and generates unique IDs prefixed with `snp_`.

---

## 3. Caveats

- **External Network Dependency**: Active ad syncing and live Bybit balances are fetched asynchronously over the network. In offline or unauthenticated mode, the calculation engine functions as a pure mathematical layer relying on the fallback rate and cached/FIFO data.
- **Float Rounding**: The calculation engine returns raw numeric IEEE-754 floats to allow flexible downstream formatting (e.g. `formatNGN(nwNgn)` vs `toFixed(2)` for charts).
- **Scope Boundary**: This report focuses on the calculation engine in `js/utils.js`. Store persistence and JSON backup/restore integration are coordinated with `m1_explorer_2` and `m1_explorer_3`.

---

## 4. Conclusion

The Milestone 1 mathematical calculation engine specification is fully defined, validated, and documented in `c:\dev\p2p\.agents\m1_explorer_1\analysis.md`. The 5 functions (`calculateTotalBankCash`, `resolveReferenceRate`, `calculateNetWorth`, `calculateSnapshotDelta`, and `validateSnapshot`) provide complete coverage for all mathematical requirements, edge cases, and zero-divisor boundaries for the Net Worth and Snapshot tracking system.

---

## 5. Verification Method

To independently verify the calculation engine and test suite:
1. **Source Inspection**:
   - Inspect `c:\dev\p2p\.agents\m1_explorer_1\analysis.md` for complete formulas, code implementation, and test suites.
2. **Execute Existing Test Suite**:
   ```powershell
   node test/run-tests.js
   ```
3. **Execution of M1 Unit Tests**:
   - Once implementer applies the functions to `js/utils.js` and creates the test suite in `test/tier1-feature-coverage/r1-m1-calculation-engine.test.js`, run:
   ```powershell
   node test/run-tests.js --tier=1
   ```
