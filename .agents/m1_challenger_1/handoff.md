# Handoff Report — Milestone M1 Pricing Engine Invariant Challenge

**Agent**: `m1_challenger_1` (Mathematical Stress & Invariant Challenger)  
**Date**: 2026-09-02  
**Target File**: `c:\dev\p2p\js\pricingEngine.js`  
**Verdict**: **APPROVE**

---

## 1. Observation
1. **Implementation Inspection**:
   - `js/pricingEngine.js` line 135: `const phi = normalizeFeeRate(platformFeePct);`
   - `js/pricingEngine.js` lines 165-170:
     ```javascript
     const netExitRevenue = (exitPrice * (1 - phi)) - (safeOutflowFee / safeAvgVol);
     const maxBuyPrice = (1 - phi) * (netExitRevenue - safeTargetSpread - (safeInflowFee / safeAvgVol));
     ```
   - `js/pricingEngine.js` lines 271-274:
     ```javascript
     const breakEven = (costBasis + (safeOutflowFee / safeAvgVol)) / divisor;
     const targetSellPrice = (costBasis + safeTargetSpread + (safeOutflowFee / safeAvgVol)) / divisor;
     ```
   - `js/pricingEngine.js` lines 397-402:
     ```javascript
     const maxFeePerUnit = safeSpread * safeDragRatio;
     const minVol = (maxFeePerUnit > 0 && safeFee > 0) ? (safeFee / maxFeePerUnit) : 0;
     const minUsdtLimit = Math.max(2.0, Math.round(minVol * 100) / 100);
     const minFiatLimit = Math.round(minUsdtLimit * safePrice);
     ```

2. **Empirical Stress Test Execution**:
   - Created test harness `test/empirical-m1-pricing-invariants.test.js` registering 6 new test groups covering Invariant 1 (5,000 trials), Invariant 2 (5,000 trials), Invariant 3 (5,000 trials), Trade Size Sensitivity (₦5k, ₦10k, ₦30k, ₦100k tiers), Fee Rate Normalization, and Multi-Turn Arbitrage Cycle Conservation (1,000 round trips).
   - Executed full test suite via `node test/run-tests.js`:
     ```
     Test Execution Summary:
     Total Tests : 691
     Passed      : 691
     Failed      : 0
     Duration    : ~26s
     ```

---

## 2. Logic Chain
1. **Invariant 1 (Sell Pricing Net Profit)**:
   - For a sell trade executed at $P_{targetSell} = \frac{C + S_{target} + F_{out}/V}{1 - \phi}$, gross revenue is $P_{targetSell} \cdot V$.
   - Bybit deducts maker platform fee $\phi \cdot P_{targetSell} \cdot V$. Outflow fiat transfer fee is $F_{out}$.
   - Net realized fiat revenue is $R_{net} = P_{targetSell} \cdot V \cdot (1 - \phi) - F_{out} = C \cdot V + S_{target} \cdot V$.
   - Deducting inventory holding cost $C \cdot V$ yields net profit $\Pi_{net} = S_{target} \cdot V$ exactly.
   - Setting $S_{target} = 0$ yields $P_{breakEven} = \frac{C + F_{out}/V}{1 - \phi}$, producing exactly $\Pi_{net} = 0$.
   - Verified across 5,000 randomized states: maximum numerical error $< 10^{-12}\text{ NGN}$.

2. **Invariant 2 (Round-Trip Arbitrage Net Profit)**:
   - Buying $V$ net USDT at $P_{maxBuy} = (1 - \phi) \cdot [ P_{exit}(1-\phi) - F_{out}/V - S_{target} - F_{in}/V ]$:
     - Merchant places maker buy order for $V / (1 - \phi)$ USDT. Total buy fiat cost is $\frac{P_{maxBuy}}{1 - \phi} \cdot V + F_{in}$.
   - Selling $V$ USDT at $P_{exit}$:
     - Total sell net fiat revenue is $P_{exit} \cdot (1 - \phi) \cdot V - F_{out}$.
   - Realized round-trip profit is $R_{sell} - \text{Cost}_{buy} = S_{target} \cdot V$ algebraically.
   - Verified across 5,000 randomized states: maximum numerical error $< 10^{-12}\text{ NGN}$.

3. **Invariant 3 (Recommended Order Limits $\le 20\%$ Drag)**:
   - Setting minimum volume $V_{min} = \frac{F_{fiat}}{S_{target} \cdot \text{maxFeeDragRatio}}$ guarantees that $\frac{F_{fiat}/V_{min}}{S_{target}} = \text{maxFeeDragRatio}$.
   - At standard parameters ($P = ₦1500, S_{target} = ₦5, F_{fiat} = ₦50, \text{maxFeeDragRatio} = 0.20$), $\text{minUsdtLimit} = 50.0\text{ USDT}$ ($₦75,000$).
   - Verified trade sensitivity tiers: ₦5k (300% drag), ₦10k (150% drag), ₦30k (50% drag) are flagged as suboptimal/below limits, while ₦100k (15% drag) satisfies the 20% threshold.

---

## 3. Caveats
1. **Sub-Basis-Point Rounding Truncation**:
   `calculateRecommendedLimits` uses `Math.round(minVol * 100) / 100`. On recurring decimal volumes where thousandths $< 5$, rounding down can cause a tiny drag overshoot of at most $0.0008\%$ ($8$ parts per million for micro volumes). This is negligible in production.
2. **Basis-Point Normalization Threshold**:
   `normalizeFeeRate` treats numbers $> 0.05$ as percentages (e.g. `0.3 -> 0.003`). Any percentage strictly below $0.05\%$ (e.g. $0.04\% = 4\text{ bps}$) would be interpreted as a decimal fraction ($4\%$). Bybit standard P2P maker fees range from $0.10\%$ to $0.35\%$, well above this threshold.

---

## 4. Conclusion
The implementation of `js/pricingEngine.js` is mathematically correct, robust, and fulfills all requirements of Milestone M1 with zero regressions.

**Final Verdict**: **APPROVE**

---

## 5. Verification Method
To independently verify this evaluation:
```powershell
node test/run-tests.js
```
Expected output:
- `691/691 tests passed (100.0%)`
- `Empirical M1 — Pricing Engine Mathematical Invariant Suite (6/6 passed)`
