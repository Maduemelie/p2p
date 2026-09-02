# Milestone 1 Mathematical & Core Engine Review Handoff Report

**Author**: m1_reviewer_1 (Mathematical & Engine Reviewer / Adversarial Critic)  
**Date**: 2026-09-02  
**Milestone**: M1 (Engine & Arbitrage Math Integration)  
**Type**: Hard Handoff (Task Complete)  
**Verdict**: **APPROVE**

---

## 1. Observation

1. **Inspected Source Files**:
   - `js/pricingEngine.js` (lines 89-100, 117-213, 229-339, 361-427): Evaluated `normalizeFeeRate`, `calculateBuyPricing`, `calculateSellPricing`, and `calculateRecommendedLimits`.
   - `js/pricing.js` (lines 36-68, 73-108, 199-335, 410-434): Evaluated settings persistence, fee parameter dispatching, and limit recommendations.
   - `js/store.js` (lines 302-341, 469-566): Evaluated `getSettings`, `saveSettings`, default constants, and backup serialization.
   - `test/tier1-feature-coverage/pricing-engine.test.js` (lines 453-583): Evaluated tests `PE.FEE.1-2`, `PE.LIM.1-3`, and `PE.TIER.1-4`.

2. **Automated Test Suite Execution (`node test/run-tests.js`)**:
   - Executed full test suite containing 685 tests across 5 tiers.
   - Result:
     ```
     Test Execution Summary:
     Total Tests : 685
     Passed      : 685
     Failed      : 0
     Duration    : 45492ms

     Tier Breakdown:
       Tier 1  : 430/430 passed (100.0%)
       Tier 2  : 159/159 passed (100.0%)
       Tier 3  : 14/14 passed (100.0%)
       Tier 4  : 10/10 passed (100.0%)
       Tier 5  : 72/72 passed (100.0%)
     ```

3. **Integrity & Anti-Facade Audit**:
   - Verified that no hardcoded test values, mock bypasses, or dummy implementations exist in `js/pricingEngine.js`, `js/pricing.js`, or `js/store.js`.
   - Verified mathematical determinism across all pricing modes (`competitor`, `avg-N`, `vwap-N`).

---

## 2. Logic Chain

1. **Buy-Side Simultaneous Fee Formulation**:
   - $P_{maxBuy} = (1 - \phi) \cdot \left[ P_{exit}(1 - \phi) - S_{target} - \frac{F_{in} + F_{out}}{V} \right]$ accounts simultaneously for the maker percentage fee $\phi$ deducted on both legs as well as fixed fiat fees.
   - At $P_{maxBuy}$, net exit revenue minus effective buy cost equals exactly the target spread $S_{target}$.
   - Capping `suggestedBuy` at `maxBuyPrice` guarantees that merchant ads never compress profit margins below $S_{target}$.

2. **Sell-Side Break-Even & Target Formulation**:
   - $P_{breakEven} = \frac{C_{fifo} + \frac{F_{out}}{V}}{1 - \phi}$ and $P_{targetSell} = \frac{C_{fifo} + S_{target} + \frac{F_{out}}{V}}{1 - \phi}$ accurately scale holding costs and target margins to account for the Bybit maker fee.
   - Undercutting competitor prices is floored at `targetSellPrice`, preventing race-to-the-bottom undercutting that would incur net losses.

3. **Recommended Minimum Order Limits**:
   - By constraining fixed fee drag $\frac{F}{V} \le \alpha \cdot S_{target}$ (default $\alpha = 0.20$), `calculateRecommendedLimits` establishes a protective volume floor ($V_{min} = \frac{F}{\alpha \cdot S_{target}}$) preventing micro-trade fee erosion.

4. **Edge Case Resilience**:
   - Safe volume fallbacks prevent division-by-zero on $V \le 0$ or NaN.
   - Rate normalizer handles both percentage values (`0.3`) and fraction rates (`0.003`).
   - Pure baseline arithmetic is preserved when fees are zero ($\phi = 0, F = 0$), maintaining 100% backwards compatibility with legacy tests.

---

## 3. Caveats

- **Milestone Scope**: Milestone 1 implements and tests the mathematical engine, controllers, and store persistence layer. The full UI controls and settings view cards are scheduled for Milestone 2 (`js/views/pricing.view.js` and `js/views/settings.view.js`).
- **Fee Rate Input Flexibility**: The `normalizeFeeRate` helper treats inputs $> 0.05$ as percentages (dividing by 100) and inputs $\le 0.05$ as fractions. This covers standard Bybit maker fee tiers (0.1% to 1.0%), but inputs should adhere to either standard percentages (e.g. `0.3`) or fractions (e.g. `0.003`).

---

## 4. Conclusion

**Verdict: APPROVE**

Milestone 1 satisfies all requirements set forth in `PROJECT.md` and `ORIGINAL_REQUEST.md`:
- Bybit 0.30% platform maker fee math is accurately formulated.
- Fiat inflow and outflow transfer fees are amortized over trade volumes.
- Order limit advisor provides mathematical bounds on fee drag.
- All 685 automated tests pass with zero regressions.

---

## 5. Verification Method

To independently verify this review:
1. Run the full automated test suite:
   ```powershell
   node test/run-tests.js
   ```
   Verify 685/685 tests pass (100%).
2. Run Tier 1 unit tests:
   ```powershell
   node test/run-tests.js --tier=1
   ```
   Verify 430/430 tests pass.
3. Review detailed findings in `c:\dev\p2p\.agents\m1_reviewer_1\review.md`.
