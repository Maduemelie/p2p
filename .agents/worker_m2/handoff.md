# Handoff Report: Milestone 2 — FIFO Accounting Consistency & Inventory Protection

## 1. Observation
Prior to the implementation, three critical calculation and inventory state integrity defects were identified in `js/dashboard.js` and `js/settings.js`:
- **Post-Ad Buyback Override in Dashboard**: In `js/dashboard.js` (`renderDashboardMetrics`), lines 292–316 conditionally filtered and summed BUY orders strictly timestamped after `latestActiveAd.createDate`. This overrode the authoritative FIFO engine output from `calculateFIFOInventoryAndPnL()`, leading to divergence between the Dashboard Portfolio Overview card (`#stat-inventory-holding`, `#stat-inventory-cost`), the Active Sell Ad Card, and the Pricing Assistant (`#pricing-cost-basis` in `js/pricing.js`).
- **Automated Opening Inventory Overwrites**:
  - `js/dashboard.js` (`syncAndRenderActiveAd`): Automatically executed `store.setOpeningInventory({ startingUsdtBalance: adOriginalQty, defaultCostBasis: avgBuyCost })` whenever a new active ad ID was detected.
  - `js/settings.js` (`syncSettingsLiveHoldings`): Automatically executed `store.setOpeningInventory({ startingUsdtBalance: adOriginalQty, defaultCostBasis: avgBuyCost })` whenever the user triggered live holdings sync.
  Both corrupted user-configured historical opening balances (`bybit_p2p_opening_inventory`).
- **Hardcoded Active Sell Ad Fee Deduction**: In `js/dashboard.js` (`syncAndRenderActiveAd`), line 122 calculated projected profit with `Math.max(0, projectedGross - 50)`, subtracting an arbitrary ₦50 stamp duty fee despite merchant P2P sales incurring ₦0 fee deductions when receiving Naira.

## 2. Logic Chain
1. **Enforcing FIFO Parity**:
   - In `renderDashboardMetrics()` (`js/dashboard.js`), removed the post-ad buyback filtering loop.
   - Set `displayInventoryUSDT = remainingInventoryUSDT`, `displayInventoryCostNGN = inventoryCostBasisNGN`, and `displayAvgCostPerUSDT = avgHoldingCostPerUSDT || openingInventory.defaultCostBasis || 0`.
   - Updated `#stat-inventory-cost` to format cost and average cost directly from the FIFO engine output (`displayInventoryUSDT > 0 ? `Cost: ${formatNGN(displayInventoryCostNGN)} • Avg: ₦${displayAvgCostPerUSDT.toFixed(2)}` : 'No inventory'`), matching `js/pricing.js` and Trade History.
2. **Protecting Opening Inventory**:
   - In `syncAndRenderActiveAd()` (`js/dashboard.js`), removed the automated `store.setOpeningInventory` block on new ad detection. Detecting an active ad now strictly updates the active ad card display metrics without mutating stored opening inventory.
   - In `syncSettingsLiveHoldings()` (`js/settings.js`), removed `store.setOpeningInventory` and DOM input overrides. Holdings sync now updates live balance cards (`#settings-total-usdt`, `#settings-locked-usdt`, `#settings-free-usdt`) and displays confirmation toast without overwriting `bybit_p2p_opening_inventory`.
   - Ensured `store.setOpeningInventory` is exclusively invoked upon explicit user form submission on the Data tab (`#form-opening-inventory`).
3. **Aligning Active Sell Ad Fee Calculation**:
   - In `syncAndRenderActiveAd()` (`js/dashboard.js`), updated projected profit to `projectedNet = Math.max(0, projectedGross)`, adhering to Nigerian banking fee rules (₦0 fee deduction when receiving Naira).

## 3. Caveats
- No caveats. All changes are strictly scoped to the assigned write ownership files (`js/dashboard.js`, `js/settings.js`), preserve all existing APIs, and introduce zero side effects.

## 4. Conclusion
Milestone 2 (R2: FIFO Accounting Consistency & Inventory Protection) is complete and fully verified.
- The Dashboard Portfolio Overview, Active Sell Ad Monitor, and Pricing Assistant now display identical, authoritative FIFO cost bases and inventory quantities.
- User-configured opening inventory in localStorage is fully protected against automated overwrites during live balance or ad syncing.
- Active sell ad projected profit calculates with ₦0 fee deduction.

## 5. Verification Method
1. **FIFO Test Suite**:
   ```bash
   node test/run-tests.js --suite=fifo
   ```
   *Result*: 11/11 tests passed (100%).
2. **Full Test Suite & Regression Check**:
   ```bash
   node test/run-tests.js
   ```
   *Result*: 58/63 tests passed. The 5 remaining failures belong to M4 (search refId) and M5 (service worker pre-cache), with zero regressions across any test tiers.
