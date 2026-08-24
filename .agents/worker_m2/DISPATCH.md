## 2026-08-24T17:36:06Z

You are the Milestone 2 Worker specializing in FIFO Accounting Consistency & Inventory Protection.
Your Working Directory: c:\dev\p2p\.agents\worker_m2\

Read:
- ORIGINAL_REQUEST.md at c:\dev\p2p\ORIGINAL_REQUEST.md
- PROJECT.md at c:\dev\p2p\PROJECT.md
- Survey Accounting Analysis at c:\dev\p2p\.agents\survey_accounting\analysis.md
- TEST_READY.md at c:\dev\p2p\TEST_READY.md

Exclusive Write Ownership:
- js/dashboard.js
- js/settings.js (specifically syncSettingsLiveHoldings opening inventory removal)

Mandatory Integrity Warning:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Mission & Implementation Requirements:
1. FIFO Accounting Consistency (js/dashboard.js):
   - In renderDashboardMetrics(), remove the ad-hoc post-ad buyback override (which recalculates buybacks strictly after latestActiveAd.createDate).
   - Ensure statInventoryHolding, statInventoryCost, and statInventoryAvg strictly use the authoritative FIFO engine output (remainingInventoryUSDT, inventoryCostBasisNGN, and avgHoldingCostPerUSDT || openingInventory.defaultCostBasis || 0), achieving complete parity with js/pricing.js and Trade History.
2. Opening Inventory Key Protection (js/dashboard.js & js/settings.js):
   - In js/dashboard.js syncAndRenderActiveAd(), remove the automated store.setOpeningInventory overwrite when a new active ad ID is detected.
   - In js/settings.js syncSettingsLiveHoldings(), remove the automated store.setOpeningInventory overwrite when clicking "Sync Holdings".
   - Ensure store.setOpeningInventory is ONLY called when the user explicitly submits the opening inventory form on the Data tab (js/settings.js formOpeningInventory).
3. Active Sell Ad Fee Calculation (js/dashboard.js):
   - In js/dashboard.js syncAndRenderActiveAd(), update projected profit calculation to remove the hardcoded - 50 NGN deduction (projectedNet = Math.max(0, projectedGross), reflecting ₦0 fee deduction when receiving Naira).
4. Verification:
   - Run: node test/run-tests.js --suite=fifo
   - Run: node test/run-tests.js
   - Verify that all FIFO accounting tests pass and no regressions occur.

Write your report to c:\dev\p2p\.agents\worker_m2\handoff.md and send a handoff message when done.
