# Empirical Challenger 2 Report: Milestone 2 (R2: FIFO Accounting Consistency & Inventory Protection)

## 1. Observation
An empirical adversarial test suite was authored and executed in `test/challenger-m2-fifo-stress.test.js` (via runner `test/run-challenger-m2.js`), specifically targeting the three core areas of Milestone 2:

1. **Tripartite Cost Basis & Inventory Parity**:
   - Tested 10 diverse trade dataset topologies:
     - **Topology A**: Multi-tier BUYs with fees + multi-lot partial FIFO liquidation.
     - **Topology B**: Zero trades, opening inventory only (`750 USDT @ ₦1485.50`).
     - **Topology C**: Active BUY trades only, zero opening inventory.
     - **Topology D**: Opening inventory + subsequent BUYs + partial SELLs.
     - **Topology E**: Overselling / Unmatched lots (sell volume exceeds recorded buy lots).
     - **Topology F**: High-precision micro-transactions (`0.0001 USDT`).
     - **Topology G**: High-volume institutional dataset (`2,000,000 USDT`, `₦3,000,000,000`).
     - **Topology H**: Post-Ad Buybacks (trades occurring before and after the active ad's creation timestamp `createDate`).
     - **Topology I**: 50 rapid alternating BUY/SELL lot cycles.
     - **Topology J**: Complete inventory liquidation (remaining USDT hits 0).
   - In all 10 scenarios, the rendered values across all three UI surfaces were extracted and compared:
     - Dashboard Portfolio Overview (`#stat-inventory-cost` & `#stat-inventory-holding`)
     - Active Sell Ad Card (`#metric-ad-avg-buy-cost`)
     - Pricing Assistant View (`#pricing-cost-basis`)
   - **Observed Result**: 10/10 topologies exhibited **exact numerical equality** across all three views (within `0.0001` precision). The historical bug where post-ad buybacks caused dashboard metrics to diverge from the Pricing Assistant has been verified to be completely resolved.

2. **Opening Inventory Preservation Under Stress**:
   - Simulated 200 consecutive rapid ad syncs (`syncAndRenderActiveAd()`) and balance queries (`syncBybitLiveInventory()`) with rotating ad IDs, prices, and wallet balances.
   - Simulated 50 full-cycle tab navigations across all 7 views (`dashboard`, `pricing`, `trades`, `history`, `banks`, `transfers`, `settings`) while dispatching asynchronous `store:updated` events.
   - Tested explicit form submission on the Data tab (`#form-opening-inventory`).
   - **Observed Result**: `localStorage.getItem('bybit_p2p_opening_inventory')` remained 100% byte-for-byte identical across all 200 rapid sync calls and 50 tab navigation cycles. Opening inventory was mutated strictly and exclusively upon explicit user form submission on the Data tab.

3. **Active Sell Ad Card Calculations & ₦0 Fee Deduction**:
   - Positive spread scenario (`Ad Price = ₦1650`, `Cost Basis = ₦1500`, `Listed = 250 USDT`):
     - Projected profit rendered: `+₦37,500.00` (strictly `250 × 150`, with `₦0` fee deduction, confirming removal of the historical `₦50` stamp duty defect).
   - Negative spread scenario (`Ad Price = ₦1550`, `Cost Basis = ₦1650`):
     - Spread rendered: `₦-100.00 / USDT` (`text-danger`), margin `-6.06%`, and projected profit clamped cleanly to `+₦0.00`.
   - Empty state scenario (no active ad):
     - Renders clean fallback placeholders without `NaN` or unhandled exceptions.

4. **FIFO Engine Purity & Stress Harness**:
   - Confirmed `calculateFIFOInventoryAndPnL` is pure and does not mutate input trade objects or opening inventory configurations.
   - Successfully processed a 500-lot queue consumed by a single massive sell order with exact mathematical cost conservation (`totalRealizedCostBasis` = `totalBuyCost`, `totalRealizedPnL` = `sellRevenue - totalBuyCost`).

## 2. Logic Chain
1. **Cost Basis Alignment**:
   - `renderDashboardMetrics()` in `js/dashboard.js`, `syncAndRenderActiveAd()` in `js/dashboard.js`, and `calculateMargins()` in `js/pricing.js` all directly query `calculateFIFOInventoryAndPnL(trades, openingInventory)`.
   - All three controllers derive average cost basis identically: `fifoResult.avgHoldingCostPerUSDT || openingInventory.defaultCostBasis || 0`.
   - Because no intermediate post-ad filtering or ad-specific lot mutations exist in `js/dashboard.js`, all three UI components remain synchronized regardless of trade timestamps relative to active ad creation times.

2. **Inventory Protection Invariant**:
   - Neither `syncAndRenderActiveAd()` nor `syncBybitLiveInventory()` in `js/dashboard.js`, nor `syncSettingsLiveHoldings()` in `js/settings.js` call `store.setOpeningInventory()`.
   - The only write path to `STORAGE_KEYS.OPENING_INVENTORY` is `store.setOpeningInventory()`, which is exclusively invoked by the `#form-opening-inventory` event listener in `js/settings.js` and JSON restore in `js/export.js`.
   - Therefore, automated Bybit synchronization events are completely decoupled from user-defined opening inventory.

3. **Fee Rule Conformance**:
   - `syncAndRenderActiveAd()` calculates `projectedGross = spreadPerUsdt * totalInAd` and `projectedNet = Math.max(0, projectedGross)`, removing any stamp duty or debit deductions.
   - This matches Nigerian merchant banking rules where Naira bank inflows from P2P sales incur `₦0` deductions.

## 3. Caveats
- No caveats. All 20 empirical stress tests and 58 regression tests passed. The 5 remaining failing tests in the test suite belong strictly to unstarted future milestones (M4 refId search and M5 service worker pre-cache).

## 4. Conclusion
**Verdict: APPROVE**

Milestone 2 (R2: FIFO Accounting Consistency & Inventory Protection) has satisfied all acceptance criteria with robust empirical proof:
- Tripartite cost basis equality across Dashboard Portfolio Overview, Active Sell Ad Card, and Pricing Assistant is 100% verified across complex trade topologies.
- Opening inventory is completely protected against automated overwrites during rapid syncs and view transitions.
- Active sell ad projected profit is calculated with ₦0 fee deduction.

## 5. Verification Method
To independently execute and verify the empirical findings:

1. **Execute Milestone 2 Challenger Stress Suite**:
   ```bash
   node test/run-challenger-m2.js
   ```
   *Expected Result*: 20/20 tests pass (100%).

2. **Execute Full Project Test Suite**:
   ```bash
   node test/run-tests.js
   ```
   *Expected Result*: 58/63 tests pass (100% pass across Tier 1 & 2 for R1, R2, R3; 0 regressions).
