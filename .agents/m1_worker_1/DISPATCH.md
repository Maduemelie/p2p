## 2026-09-02T05:13:00Z

You are m1_worker_1 (role: Engine & Arbitrage Math Developer).
Your Working Directory is: c:\dev\p2p\.agents\m1_worker_1
Read ORIGINAL_REQUEST.md at: c:\dev\p2p\.agents\ORIGINAL_REQUEST.md
Read PROJECT.md at: c:\dev\p2p\PROJECT.md
Read Survey Analyses at:
- c:\dev\p2p\.agents\survey_explorer_1\analysis.md
- c:\dev\p2p\.agents\survey_explorer_3\analysis.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your task for Milestone 1 (Engine & Arbitrage Math Integration):
1. Write ownership: You own `js/pricingEngine.js`, `js/pricing.js`, `js/utils.js`, `js/dashboard.js`, and `js/store.js`.
2. Implement Platform Maker Fee (default `platformFeePct = 0.3` or `0.003`) and Fiat Transfer Fees (`inflowFee`, `outflowFee`, default ₦50) in `js/pricingEngine.js`:
   - `calculateBuyPricing`:
     - Incorporate platform maker fee % and fiat transfer fees.
     - Accurate formula for `maxBuyPrice`:
       `const maxBuyPrice = (1 - phi) * (exitPrice * (1 - phi) - targetSpread - (inflowFee + outflowFee) / safeAvgVol);` (or algebraic equivalent factoring platform fee on exit and buy legs).
       Ensure `effectiveSpread`, `feeBreakdown` ({ platformFeePerUnit, fiatFeePerUnit, totalFeePerUnit, effectiveCostBasis }), and suggested buy rates are precisely computed.
   - `calculateSellPricing`:
     - Incorporate platform maker fee % and fiat transfer fees.
     - `breakEven = (costBasis + (outflowFee / safeAvgVol)) / (1 - phi)`
     - `targetSellPrice = (costBasis + targetSpread + (outflowFee / safeAvgVol)) / (1 - phi)`
     - Include `feeBreakdown` ({ platformFeePerUnit, fiatFeePerUnit, totalFeePerUnit, netRealizedRevenue }).
   - `calculateRecommendedLimits(price, targetSpread, fiatFee, options)`:
     - Compute minimum trade size ($V_{min}$) and minimum fiat limits ($L_{min}$) where fixed fiat fee drag is $\le$ maxFeeDragRatio (default 20% of target spread).
     - Export this function cleanly in `js/pricingEngine.js`.
3. Update `js/pricing.js`:
   - Manage state for `platformFeePct` (default 0.3), read and write to `localStorage` key `bybit_p2p_pricing_platform_fee_pct` and sync with `store.getSettings()`.
   - Pass `platformFeePct` to `calculateBuyPricing` and `calculateSellPricing`.
   - Update `calculatePricing()` to output the new fee breakdown and limit recommendations to state and DOM.
4. Update `js/store.js`:
   - Add `getSettings()` and `saveSettings(settings)` helper methods with default fallbacks for `platformFeePct: 0.3`, `inflowFee: 50`, `outflowFee: 50`, `targetSpread: 5.0`, `avgVolume: 100`.
   - Ensure `saveSettings` triggers `store:updated` event with `{ type: 'settings' }`.
5. Update `js/utils.js` and `js/dashboard.js` if fee or net profit calculations are referenced there.
6. Verify your implementation by running:
   `node test/run-tests.js`
   Document commands run and test output in your handoff report.
7. Write your changes summary to `c:\dev\p2p\.agents\m1_worker_1\changes.md` and complete handoff report to `c:\dev\p2p\.agents\m1_worker_1\handoff.md`.
8. Send a message to the orchestrator when complete with the path to your handoff report.
