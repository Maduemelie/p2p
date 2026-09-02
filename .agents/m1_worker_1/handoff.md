# Milestone 1 Handoff Report: Engine & Arbitrage Math Integration

**Author**: m1_worker_1 (Engine & Arbitrage Math Developer)  
**Date**: 2026-09-02  
**Milestone**: M1 (Engine & Arbitrage Math Integration)  
**Type**: Hard Handoff (Task Complete)

---

## 1. Observation

1. **Initial Codebase Analysis**:
   - `js/pricingEngine.js` previously implemented `maxBuyPrice = exitPrice - targetSpread - (inflowFee / safeAvgVol)` and `breakEven = costBasis + (outflowFee / safeAvgVol)`. It lacked accounting for Bybit's 0.30% maker fee ($\phi = 0.003$), leading to margin compression on merchant ads.
   - `calculateRecommendedLimits` was absent from `pricingEngine.js`.
   - `js/store.js` lacked `getSettings()` and `saveSettings()` abstractions with defaults for `platformFeePct: 0.3`, `inflowFee: 50`, `outflowFee: 50`, `targetSpread: 5.0`, `avgVolume: 100`.
   - `js/pricing.js` did not manage `platformFeePct` state or pass platform fee parameters into pricing calculations.

2. **Automated Test Run Output**:
   - Running `node test/run-tests.js` executed 685 automated tests spanning Tier 1 (Feature Coverage), Tier 2 (Boundary & Corner Cases), Tier 3 (Cross-Feature), Tier 4 (Real-World Application Scenarios), and Tier 5 (Challenger & Stress Suites).
   - Test execution completed with exit code 0:
     ```
     Test Execution Summary:
     Total Tests : 685
     Passed      : 685
     Failed      : 0
     Duration    : 26159ms

     Tier Breakdown:
       Tier 1  : 430/430 passed (100.0%)
       Tier 2  : 159/159 passed (100.0%)
       Tier 3  : 14/14 passed (100.0%)
       Tier 4  : 10/10 passed (100.0%)
       Tier 5  : 72/72 passed (100.0%)
     ```

---

## 2. Logic Chain

1. **Simultaneous Fee Accounting in `pricingEngine.js`**:
   - On the buy side, the maker receives $(1 - \phi)$ USDT for every $P_{buy}$ NGN paid, incurring an effective fiat acquisition cost of $\frac{P_{buy}}{1 - \phi} + \frac{F_{in}}{V}$.
   - On the sell side, liquidating at $P_{exit}$ yields net revenue of $P_{exit} \cdot (1 - \phi) - \frac{F_{out}}{V}$.
   - Equating net exit revenue minus effective buy cost to the target spread $S_{target}$ derives the exact ceiling:
     $$P_{maxBuy} = (1 - \phi) \cdot \left[ P_{exit} \cdot (1 - \phi) - S_{target} - \frac{F_{in} + F_{out}}{V} \right]$$
   - On the sell side, break-even requires net revenue to equal $C_{fifo}$, yielding $P_{breakEven} = \frac{C_{fifo} + \frac{F_{out}}{V}}{1 - \phi}$, and target sell price requires net revenue to equal $C_{fifo} + S_{target}$, yielding $P_{targetSell} = \frac{C_{fifo} + S_{target} + \frac{F_{out}}{V}}{1 - \phi}$.

2. **Order Limit Advisory Algorithm (`calculateRecommendedLimits`)**:
   - Fixed fiat fees ($F_{in}$) cause regressive drag on smaller volumes ($F_{in}/V$).
   - To constrain fiat fee drag to $\le \text{maxFeeDragRatio} \cdot S_{target}$ (default 20%), the minimum required trade volume is $V_{min} = \frac{F_{in}}{S_{target} \cdot \text{maxFeeDragRatio}}$ and minimum fiat limit is $L_{min} = V_{min} \cdot P$.
   - This prevents merchants from posting micro-limits (e.g. ₦5,000) that result in guaranteed losses due to fixed banking fees.

3. **Controller & Storage Synchronization**:
   - `store.getSettings()` provides unified fallback defaults (`platformFeePct: 0.3`, `inflowFee: 50`, `outflowFee: 50`, `targetSpread: 5.0`, `avgVolume: 100`).
   - `store.saveSettings()` persists updates to `bybit_p2p_settings` and emits `store:updated` with `{ type: 'settings' }`.
   - `pricing.js` reads `platformFeePct` from DOM / LocalStorage (`bybit_p2p_pricing_platform_fee_pct`), propagates fee parameters into `calculateBuyPricing` and `calculateSellPricing`, and computes limit recommendations for presentation.

---

## 3. Caveats

- In pure mathematical calculations where `platformFeePct` is omitted or 0, the engine defaults to 0 to maintain backwards compatibility with legacy tests that test unfee'd baseline arithmetic. In application usage, `pricing.js` and `store.getSettings()` supply `0.3` (0.3%) by default.
- UI elements in `js/views/pricing.view.js` and `js/views/settings.view.js` are planned for Milestone 2. DOM elements for fee inputs and breakdowns are dynamically updated when present in the DOM.

---

## 4. Conclusion

Milestone 1 (Engine & Arbitrage Math Integration) is completely implemented and verified:
1. `pricingEngine.js` features mathematical derivations for Bybit 0.30% platform maker fees, fiat transfer fees, break-even prices, target sell prices, and `calculateRecommendedLimits`.
2. `pricing.js` manages platform fee state and limit advisory data.
3. `store.js` provides `getSettings()` and `saveSettings()` with full reactive event broadcasting.
4. All 685 automated tests pass with 100% success rate across all 5 test tiers.

---

## 5. Verification Method

To independently verify the implementation:
1. Run the test suite:
   ```powershell
   node test/run-tests.js
   ```
   Confirm that all 685 tests pass across Tiers 1 through 5.
2. Run Tier 1 Feature Coverage specifically:
   ```powershell
   node test/run-tests.js --tier=1
   ```
   Confirm all 430 Tier 1 tests pass, including `PE.FEE.1-2`, `PE.LIM.1-3`, and `PE.TIER.1-4`.
3. Inspect `js/pricingEngine.js`, `js/pricing.js`, `js/store.js`, `js/dashboard.js`, and `js/snapshots.js`.
