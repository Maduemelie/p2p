# Milestone 1 Challenger Handoff Report: Trade Size & Limit Sensitivity

**Author**: `m1_challenger_2` (Trade Size & Limit Sensitivity Challenger)  
**Role**: Critic / Specialist  
**Date**: 2026-09-02  
**Milestone**: M1 (Engine & Arbitrage Math Integration)  
**Type**: Hard Handoff (Task Complete)  
**Verdict**: **APPROVE**

---

## 1. Observation

1. **Trade Size Sensitivity Across Tiers**:
   - In `test/tier1-feature-coverage/pricing-engine.test.js` (lines 552–582):
     * `PE.TIER.1` (line 552): ₦5,000 Micro-Trade ($V = 3.3333$ USDT at ₦1,500/USDT) exhibits single-leg fixed fee drag of ₦15.00/USDT (300% of ₦5.00 target spread).
     * `PE.TIER.2` (line 565): ₦10,000 Boundary Trade ($V = 6.6667$ USDT) exhibits single-leg fixed fee drag of ₦7.50/USDT (150% of ₦5.00 target spread).
     * `PE.TIER.3` (line 571): ₦30,000 Standard Trade ($V = 20.0$ USDT) exhibits single-leg fixed fee drag of ₦2.50/USDT (50% of ₦5.00 target spread).
     * `PE.TIER.4` (line 577): ₦100,000 Optimal Trade ($V = 66.6667$ USDT) exhibits single-leg fixed fee drag of ₦0.75/USDT (15% of ₦5.00 target spread), satisfying the $\le 20\%$ max fee drag policy ($15\% \le 20\%$).

2. **Mathematical Pricing & Limit Engine Implementation**:
   - `js/pricingEngine.js` (lines 89–100): `normalizeFeeRate` normalizes fee percentage numbers (e.g. `0.3` -> `0.003`, `1.0` -> `0.01`) and fractional values (`0.003` -> `0.003`), clamping invalid/negative inputs to `0`.
   - `js/pricingEngine.js` (lines 135–136, 170): `calculateBuyPricing` computes:
     $$P_{maxBuy} = (1 - \phi) \cdot \left[ P_{exit} \cdot (1 - \phi) - S_{target} - \frac{F_{in} + F_{out}}{V} \right]$$
     with divisor guard $\max(0.0001, 1 - \phi)$, and enforces `suggestedBuy = Math.min(rawSuggestedBuy, maxBuyPrice)` (line 176) with status `'COMPRESSED'` when outbid exceeds ceiling (lines 177, 200).
   - `js/pricingEngine.js` (lines 270–274): `calculateSellPricing` computes:
     $$P_{breakEven} = \frac{C_{fifo} + \frac{F_{out}}{V}}{1 - \phi}, \quad P_{targetSell} = \frac{C_{fifo} + S_{target} + \frac{F_{out}}{V}}{1 - \phi}$$
     and enforces `suggestedSell = Math.max(rawSuggestedSell, targetSellPrice)` (line 305).
   - `js/pricingEngine.js` (lines 361–427): `calculateRecommendedLimits` calculates:
     $$V_{min} = \frac{F}{S \cdot R}, \quad L_{min} = V_{min} \cdot P, \quad V_{be} = \frac{F}{S}, \quad L_{be} = V_{be} \cdot P$$
     with dust floor clamping $\max(2.0, \dots)$ and returns structured limit advice and fee drag percentages.
   - `js/pricingEngine.js` (lines 14–39): `filterCompetitorAds` enforces dust threshold $\max(2.0, \text{safeAvgVol} \times 0.05)$ and transaction limits bounds matching against both Bybit parameter naming schemes (`minAmount`/`maxAmount` and `minSingleTransAmount`/`maxSingleTransAmount`).

3. **Empirical Test Suite Execution Results**:
   - Running `node test/run-tests.js` executed 685 automated tests with exit code 0:
     ```
     Test Execution Summary:
     Total Tests : 685
     Passed      : 685
     Failed      : 0
     Duration    : 35942ms

     Tier Breakdown:
       Tier 1  : 430/430 passed (100.0%)
       Tier 2  : 159/159 passed (100.0%)
       Tier 3  : 14/14 passed (100.0%)
       Tier 4  : 10/10 passed (100.0%)
       Tier 5  : 72/72 passed (100.0%)
     ```
   - In particular:
     * `PE.TIER.1-4` passed (100%).
     * `PE.FEE.1-2` and `PE.LIM.1-3` passed (100%).
     * `Challenger 1` mathematical invariants (1,000 fuzzed states each) passed (100%).
     * `Challenger 2` dust filtering and trade limit boundary fuzzing passed (100%).

---

## 2. Logic Chain

1. **Loss Prevention under Small Trade Sizes (Observation 1 & 2)**:
   - At ₦5,000 (Tier 1) and ₦10,000 (Tier 2), fixed bank transfer fees ($F_{in} = ₦50$) generate regressive unit drag of ₦15.00/USDT and ₦7.50/USDT respectively.
   - Because these unit drag values exceed the target spread of ₦5.00/USDT (drag ratios of 300% and 150%), unconstrained market outbidding would produce guaranteed negative realized net revenue ($-₦19.17$/USDT and $-₦4.07$/USDT).
   - By deriving $P_{maxBuy}$ with full simultaneous fee accounting and clamping `suggestedBuy = Math.min(rawSuggestedBuy, maxBuyPrice)`, `pricingEngine.js` prevents outbidding beyond the mathematical safety ceiling and flags `COMPRESSED`.
   - Furthermore, `calculateRecommendedLimits` computes `breakEvenFiatLimit = ₦15,000` (10.0 USDT) and `minFiatLimit = ₦75,000` (50.0 USDT), providing actionable limit guidance.

2. **Spread Viability and Margin Retention at Scale (Observation 1 & 2)**:
   - At ₦30,000 (Tier 3), volume (20.0 USDT) exceeds break-even (10.0 USDT), enabling viable net spread ($+₦5.83$/USDT), but unit fee drag (₦2.50/USDT) consumes 50% of spread.
   - At ₦100,000 (Tier 4), volume (66.67 USDT) exceeds the recommended limit (50.0 USDT), bounding fee drag to 15% ($< 20\%$) and retaining 85% of gross spread.

3. **Boundary Robustness & Invariant Stability (Observation 2 & 3)**:
   - Dust filtering smoothly transitions across the kink point at $\text{avgVolume} = 40.0$ USDT with no discontinuities.
   - Fuzzing across 5,000 randomized market depths, malformed ads, string numbers, nulls, and extreme fees produced 0 unhandled exceptions and 0 NaN corruptions.
   - All 685 tests in the automated suite pass with 100% precision.

---

## 3. Caveats

- In pure mathematical pricing mode where `platformFeePct` is explicitly passed as `0`, the engine treats the fee rate as `0` for backwards compatibility with baseline tests. In application runtime (`js/pricing.js`), `platformFeePct` defaults to `0.3` (0.3%).
- UI controls and visual presentation components are scheduled for Milestone 2 (`js/views/pricing.view.js` and `js/views/settings.view.js`). The pricing controller dynamically updates these UI elements when present in the DOM.

---

## 4. Conclusion

**Verdict: APPROVE**

Milestone 1 (Engine & Arbitrage Math Integration) has been thoroughly stress-tested and empirically validated:
1. **Trade size sensitivity** across ₦5k, ₦10k, ₦30k, and ₦100k accurately models fixed fee drag, loss prevention caps, and margin retention.
2. **Recommended order limit algorithms** mathematically constrain fee drag $\le 20\%$ and compute accurate break-even bounds.
3. **Bybit 0.3% maker platform fees** and fiat transfer fees are simultaneously accounted for on both buy and sell legs.
4. **Boundary fuzzing, dust filtering, and fee normalization** are resilient against all adversarial inputs.

---

## 5. Verification Method

To independently verify all findings:
1. **Run Full Test Suite**:
   ```powershell
   node test/run-tests.js
   ```
   *Expected*: All 685 tests pass across Tiers 1 through 5 with 0 failures.

2. **Run Tier 1 Feature Coverage Tests**:
   ```powershell
   node test/run-tests.js --tier=1
   ```
   *Expected*: 430/430 tests pass, including `PE.TIER.1-4`, `PE.FEE.1-2`, `PE.LIM.1-3`, `PE.FILT.1-7`, `PE.REF.1-7`, `PE.BUY.1-3`, `PE.SELL.1-5`, and `PE.BND.1-3`.

3. **Inspect Challenge Report**:
   Read `c:\dev\p2p\.agents\m1_challenger_2\challenge.md` for complete tabular breakdowns and mathematical proofs.
