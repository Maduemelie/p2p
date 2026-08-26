# Handoff Report: Specification Mining for Net Worth & Capital Cycle Tracking

**Agent**: survey_spec_miner_2 (Role: Specification & Requirements Miner)  
**Parent**: Project Orchestrator (Conversation ID: `a90fce10-da57-446a-b348-94b9b5b8c1a6`)  
**Working Directory**: `c:\dev\p2p\.agents\survey_spec_miner_2`  
**Date**: 2026-08-25  

---

## 1. Observation

1. **User Request & Requirements**:
   `ORIGINAL_REQUEST.md:13-26` defines:
   - "R1. Live Net Worth Dashboard Widget: Calculate and display user's current Net Worth in both Naira (NGN) and USDT on Dashboard view. Sum all bank cash from the app's reactive bank ledger. Fetch/display Bybit USDT funding balance (combining active ad listings and free balances). Provide real-time conversion between NGN and USDT using either active Sell ad rate or fallback rate."
   - "R2. Net Worth Snapshot Logging: Add 'End Day / Save Snapshot' button on Dashboard opening a modal showing calculated bank cash and Bybit USDT balances, with an editable Reference Exchange Rate field. Save completed snapshot (timestamp, bank cash, USDT balance, reference rate, net worth in NGN & USDT, optional notes) to localStorage under `bybit_p2p_net_worth_snapshots`."
   - "R3. Historical Comparison & Trend Chart: Display difference (delta) in Net Worth (both absolute amount and percentage) compared to previous snapshot. Add 'Net Worth Trend' line chart (using Chart.js) visualizing growth of total assets (NGN and USDT) across historical snapshots. Ensure snapshot export/import capability is supported."

2. **Existing Reactive Bank Ledger Architecture**:
   `js/store.js:188-257` defines `getComputedBankBalances()` which computes dynamic ledger balances for all bank accounts as:
   `Balance = initialBalance + Sum(SELL netAmount) - Sum(BUY netAmount) + Sum(Transfer In) - Sum(Transfer Out)`.
   Currently `js/dashboard.js:304-323` sums these balances:
   ```javascript
   const computedBankBalances = store.getComputedBankBalances ? store.getComputedBankBalances() : new Map();
   let totalBankCash = 0;
   computedBankBalances.forEach(rec => {
     totalBankCash += rec.currentBalance;
   });
   ```

3. **Bybit Balance & Active Ad Tracking**:
   `js/dashboard.js:68-153` and `js/dashboard.js:158-245` implement active ad rate queries (`bybitService.fetchActiveAds('1', 'USDT')`) and funding wallet balance (`bybitService.fetchFundingBalance('USDT')`).
   When online, `totalP2P = adAllocation + freeForBuyback`. When offline or unconfigured, the system computes `fifoResult.remainingInventoryUSDT` via `calculateFIFOInventoryAndPnL(trades, openingInventory)` (`js/utils.js:132-294`).

4. **Storage & Serialization**:
   `js/store.js:8-15` defines `STORAGE_KEYS`. Key `bybit_p2p_net_worth_snapshots` is currently absent from `STORAGE_KEYS` and needs to be added.
   `js/export.js:106-151` manages `exportAllData()` and `importAllData(data, replace)` for full backups.

5. **Existing Test Suite Baseline**:
   Execution of `node test/run-tests.js` executed 133 tests across 4 tiers + challenger suites in 2567ms with 100% pass rate (0 failures).

---

## 2. Logic Chain

1. **Live Net Worth (R1) Invariant**:
   - Total liquid cash in NGN is derived purely from the reactive bank ledger (`totalBankCash = sum of bank balances`).
   - Total USDT is derived from live Bybit funding balance (`totalP2P`), falling back to FIFO inventory (`remainingInventoryUSDT`) if Bybit API is offline or unauthenticated.
   - Reference exchange rate $R_{\text{ref}}$ is resolved via priority:
     1. Active Sell Ad rate (`latestActiveAd.price` with status 10/20/2)
     2. Latest trade rate in ledger
     3. FIFO average buy cost (`fifoResult.avgHoldingCostPerUSDT`)
     4. Opening inventory default cost basis (`openingInventory.defaultCostBasis`)
     5. Default fallback `1500.00`
   - Formulas:
     $$\text{NW}_{\text{NGN}} = T_{\text{bank}} + (U_{\text{bybit}} \times R_{\text{ref}})$$
     $$\text{NW}_{\text{USDT}} = U_{\text{bybit}} + \left(\frac{T_{\text{bank}}}{R_{\text{ref}}}\right) \quad (\text{with guard } R_{\text{ref}} > 0)$$

2. **Snapshot Persistence (R2) Integrity**:
   - Snapshot records must be uniquely keyed, timestamped with ISO 8601 strings, and persisted in `bybit_p2p_net_worth_snapshots`.
   - The modal trigger pre-fills calculated live numbers and allows merchant adjustment of the reference exchange rate with instantaneous reactive re-valuation before committing to store.

3. **Historical Comparison & Charting (R3) Correctness**:
   - Sequential snapshots must be sorted chronologically by timestamp ascending.
   - For $k \ge 1$, deltas are computed against $S_{k-1}$.
   - Boundary condition for zero divisor ($S_{k-1} = 0$) is handled algebraically without producing `NaN` or `Infinity`.
   - Chart.js renders a line chart visualizing NGN / USDT growth with toggle/dual-axis controls and empty-state resilience when $< 2$ snapshots exist.
   - JSON export and import must incorporate `netWorthSnapshots` in full backups with schema validation and sanitization.

---

## 3. Caveats

- **No Source Code Modifications Made**: In accordance with the miner role instructions, no source files or test scripts in `c:\dev\p2p` were altered.
- **Assumptions**: Assumed that the reference exchange rate represents NGN per 1 USDT (standard Nigerian P2P quotation format, e.g. ₦1,535.00 / USDT).

---

## 4. Conclusion

The specification mining for the Net Worth and Capital Cycle tracking system is complete, fully specified, and documented in `c:\dev\p2p\.agents\survey_spec_miner_2\analysis.md`. All required data schemas, formulas, UI integration points, edge case matrices, and storage contracts have been thoroughly defined and ready for the implementation team.

---

## 5. Verification Method

1. **Verify Analysis Artifact**:
   Inspect `c:\dev\p2p\.agents\survey_spec_miner_2\analysis.md` to confirm:
   - 15 Discovered Features table with inputs, outputs, error behaviors, and discovery sources.
   - 18 Edge Cases table covering zero bank accounts, negative cash, zero divisors, out-of-order snapshots, malformed imports, etc.
   - Complete mathematical formulations for R1, R2, and R3.
   - TypeScript schema and storage contract definitions.
2. **Verify Codebase Test Suite**:
   Run:
   ```powershell
   node test/run-tests.js
   ```
   (Expected output: 133 tests passed, 0 failures).
