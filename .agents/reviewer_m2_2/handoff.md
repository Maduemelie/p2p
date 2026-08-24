# Handoff Report: Reviewer 2 — Milestone 2 (FIFO Accounting Consistency & Inventory Protection)

## 1. Observation
1. **FIFO Accounting Consistency in `js/dashboard.js`**:
   - In `renderDashboardMetrics()` (lines 255–267, 294–302), all post-ad buyback filtering logic has been removed. The dashboard retrieves authoritative metrics directly from `calculateFIFOInventoryAndPnL(trades, openingInventory)`.
   - `displayInventoryUSDT` uses `remainingInventoryUSDT`, `displayInventoryCostNGN` uses `inventoryCostBasisNGN`, and `displayAvgCostPerUSDT` uses `avgHoldingCostPerUSDT || openingInventory.defaultCostBasis || 0`.
   - String formatting in `#stat-inventory-cost` displays `Cost: ${formatNGN(displayInventoryCostNGN)} • Avg: ₦${displayAvgCostPerUSDT.toFixed(2)}` when `displayInventoryUSDT > 0`, and `'No inventory'` otherwise.
2. **Parity with Pricing Assistant (`js/pricing.js`)**:
   - `calculateMargins()` in `js/pricing.js` (lines 177–178) calculates `costBasis = fifoResult.avgHoldingCostPerUSDT || openingInventory.defaultCostBasis || 0`, identically matching the Dashboard Portfolio Overview.
3. **Active Sell Ad Fee Deduction**:
   - In `js/dashboard.js` (`syncAndRenderActiveAd`, lines 92–94), projected profit is computed as `projectedGross = spreadPerUsdt * totalInAd` and `projectedNet = Math.max(0, projectedGross)`, removing any arbitrary fee deductions (₦0 fee deduction when receiving Naira).
4. **Opening Inventory Key Protection**:
   - `js/dashboard.js` (`syncAndRenderActiveAd`): Does not invoke `store.setOpeningInventory` upon ad detection.
   - `js/settings.js` (`syncSettingsLiveHoldings`): Updates live balance cards (`#settings-total-usdt`, `#settings-locked-usdt`, `#settings-free-usdt`) without calling `store.setOpeningInventory` or modifying opening inventory input fields.
   - Codebase-wide grep confirmed that `store.setOpeningInventory` is exclusively called in `js/settings.js` (line 62) inside the `#form-opening-inventory` submit listener.
5. **Test Execution**:
   - Executed `node test/run-tests.js --suite=fifo`: 11/11 tests passed (100%).
   - Executed `node test/run-tests.js`: 58/63 tests passed across all tiers; all 5 remaining failures strictly belong to unstarted milestones M4 (refId search) and M5 (PWA pre-cache).

## 2. Logic Chain
1. **FIFO Cost Basis Alignment**:
   - By eliminating custom filtering on trade timestamps relative to ad creation dates, the Dashboard, Active Sell Ad Monitor, and Pricing Assistant now share the single authoritative FIFO engine (`calculateFIFOInventoryAndPnL`).
   - The fallback pattern `avgHoldingCostPerUSDT || openingInventory.defaultCostBasis || 0` guarantees consistent behavior when active stock is zero or when opening balance is configured prior to trade entry.
2. **Opening Inventory Mutation Isolation**:
   - Removing automated `store.setOpeningInventory` calls from `syncAndRenderActiveAd()` and `syncSettingsLiveHoldings()` prevents background or sync operations from overwriting user-configured historical opening inventory in `localStorage` (`bybit_p2p_opening_inventory`).
   - Mutations occur only when the user explicitly triggers a submit event on `#form-opening-inventory` in the Data tab.
3. **Active Ad Profit Projection**:
   - Nigerian P2P merchant sales receiving Naira do not incur outgoing transfer fee deductions. Setting `projectedNet = Math.max(0, projectedGross)` ensures accurate profit projections without phantom ₦50 fee penalties.
4. **Adversarial & Integrity Audit**:
   - No hardcoded test responses, facade mockouts, or shortcut bypasses exist in the implementation.
   - Boundary tests for zero inventory, micro-fractions (0.0001 USDT), massive scale (₦1B), overselling, and invalid opening inputs execute genuine arithmetic without NaN, overflow, or logic regressions.

## 3. Caveats
- No caveats. The implementation adheres strictly to the interface contracts defined in `PROJECT.md` and fulfills all acceptance criteria in `ORIGINAL_REQUEST.md`.

## 4. Conclusion
**Verdict: APPROVE**

The implementation of Milestone 2 (R2: FIFO Accounting Consistency & Inventory Protection) is complete, robust, and verified.
- Dashboard Portfolio Overview, Active Sell Ad Card, and Pricing Assistant maintain exact cost basis parity.
- `bybit_p2p_opening_inventory` is fully protected against automated overwrites.
- Active sell ad projected profit correctly uses ₦0 fee deduction.
- 100% of FIFO tests pass (11/11).

## 5. Verification Method
1. **Run FIFO Test Suite**:
   ```bash
   node test/run-tests.js --suite=fifo
   ```
   *Expected Output*: 11/11 passed (100%).
2. **Run Full Test Suite**:
   ```bash
   node test/run-tests.js
   ```
   *Expected Output*: 58/63 passed (failures only in pending M4/M5).
3. **Inspect Implementation Files**:
   - `js/dashboard.js` (lines 79–95, 255–268, 294–302)
   - `js/settings.js` (lines 57–66, 117–164)
   - `js/pricing.js` (lines 175–185)
