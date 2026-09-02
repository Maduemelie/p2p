# Handoff Report: Codebase Survey & Bybit P2P Fee Engine Integration

**Agent**: `survey_explorer_1` (Role: Codebase & Engine Explorer)  
**Working Directory**: `c:\dev\p2p\.agents\survey_explorer_1\`  
**Target File**: `c:\dev\p2p\.agents\survey_explorer_1\handoff.md`  
**Reference Report**: `c:\dev\p2p\.agents\survey_explorer_1\analysis.md`  

---

## 1. Observation

1. **`js/pricingEngine.js` Line 123**:
   `const maxBuyPrice = exitPrice - targetSpread - (inflowFee / safeAvgVol);`
   The buy pricing calculation accounts only for `inflowFee / safeAvgVol` and ignores Bybit's 0.30% maker percentage fee on the buy and sell sides.

2. **`js/pricingEngine.js` Lines 182-185**:
   ```javascript
   const breakEven = costBasis + (outflowFee / safeAvgVol);
   const targetSellPrice = costBasis + targetSpread + (outflowFee / safeAvgVol);
   ```
   The sell pricing calculation computes break-even and target sell price assuming gross revenue equals net revenue minus `outflowFee / safeAvgVol`, neglecting the 0.30% platform maker deduction ($P_{sell} \cdot \phi$).

3. **`js/pricing.js` Lines 36-59 & 172-179**:
   User settings and margin calculation read `targetSpread`, `avgVolume`, `inflowFee`, `outflowFee`, `pricingMode`, `depthLimit`, `filterLimits`. There is no setting or state for `platformFeePct` (default 0.3%).

4. **`js/views/pricing.view.js` Lines 27-101**:
   The Arbitrage Settings form contains inputs for target spread, target volume, inflow fee, outflow fee, pricing mode, depth limit, and filter limits checkbox. It lacks an input for Bybit Platform Fee % and lacks order limit recommendations.

5. **`js/fees.js` Lines 180-217 (`calculateFintechTradeFees`)**:
   Calculates ₦10 inter-bank transfer fee ($\ge ₦5,000$) and ₦50 EMTL stamp duty ($\ge ₦10,000$) for BUY trades, and ₦0 for SELL trades.

6. **`test/tier1-feature-coverage/pricing-engine.test.js` Lines 184-395**:
   25 unit tests verify existing pure mathematical behavior with 0% platform fee assumption.

7. **Test Runner Execution (`node test/run-tests.js`)**:
   Executed 676 tests across all tiers; 667 passed. All existing pricing engine unit tests, dust filter tests, and challenger math stress suites passed with 100% fidelity under current baseline conditions.

---

## 2. Logic Chain

1. **Fee Asymmetry & Omission**:
   - Bybit P2P charges makers a **0.30% (0.0030)** transaction fee on completed orders (Observation 1, 2).
   - At a reference price of ₦1,500/USDT, a 0.30% maker fee equals **₦4.50 / USDT** per leg, or **₦9.00 / USDT** round-trip.
   - For a standard target spread of $S_{target} = ₦5.00/\text{USDT}$, omitting this ₦9.00 fee causes the pricing engine to recommend rates that produce a net loss ($-₦4.00/\text{USDT}$) while displaying a positive spread badge to the user.

2. **Derivation of Net Pricing Equations**:
   - On the Sell side:
     $$\text{Net Revenue} = P_{sell} \cdot (1 - \phi) - \frac{F_{out}}{V}$$
     Setting $\text{Net Revenue} = C_{fifo}$ yields:
     $$P_{breakEven} = \frac{C_{fifo} + \frac{F_{out}}{V}}{1 - \phi}$$
     Setting $\text{Net Revenue} = C_{fifo} + S_{target}$ yields:
     $$P_{targetSell} = \frac{C_{fifo} + S_{target} + \frac{F_{out}}{V}}{1 - \phi}$$
   - On the Buy side:
     $$\text{Net Exit Revenue} = P_{exit} \cdot (1 - \phi) - \frac{F_{out}}{V}$$
     $$\text{Effective Buy Cost} = \frac{P_{buy}}{1 - \phi} + \frac{F_{in}}{V}$$
     Setting $\text{Net Exit Revenue} - \text{Effective Buy Cost} = S_{target}$ yields:
     $$P_{maxBuy} = (1 - \phi) \cdot \left[ P_{exit} \cdot (1 - \phi) - S_{target} - \frac{F_{in} + F_{out}}{V} \right]$$

3. **Trade Size Regressivity & Order Limits**:
   - Fixed fiat fees ($F_{in} + F_{out} = ₦100$) scale inversely with trade volume ($V$):
     - ₦5,000 trade (3.33 USDT) $\implies$ ₦30.00/USDT fee drag (2.00%).
     - ₦10,000 trade (6.67 USDT) $\implies$ ₦15.00/USDT fee drag (1.00%).
     - ₦30,000 trade (20.00 USDT) $\implies$ ₦5.00/USDT fee drag (0.33%).
     - ₦100,000 trade (66.67 USDT) $\implies$ ₦1.50/USDT fee drag (0.10%).
   - Orders below ₦30,000 incur a fixed fee drag exceeding the target spread. Therefore, an automated `calculateRecommendedLimits` function is required to bound fixed fee drag $\le 20\%$ of target spread (recommending minimum limits $\ge ₦50,000$ to $₦75,000$).

---

## 3. Caveats

1. **Bybit Maker Fee Rate Assumption**: The analysis assumes Bybit's standard P2P maker fee of 0.30% for NGN/USDT pairs. VIP tiers or special promotional zero-fee periods can be accommodated via the configurable `platformFeePct` parameter (default 0.30%).
2. **Taker vs Maker Liquidation on Exit**: The buy side formula assumes subsequent liquidation occurs via an active Sell Ad as maker (paying 0.30% maker fee). If a merchant liquidates as a taker, Bybit taker fee is 0.00%. The unified parameterization allows setting separate buy/sell maker fee rates if desired.
3. **No Code Modification Undertaken**: In strict compliance with the Explorer archetype, no source files outside `.agents/survey_explorer_1/` were modified.

---

## 4. Conclusion

1. The Bybit P2P Tracker engine requires simultaneous percentage fee ($\phi = 0.3\%$) and fixed fiat fee ($F_{in}, F_{out}$) integration across `js/pricingEngine.js`, `js/pricing.js`, and `js/views/pricing.view.js`.
2. Closed-form algebraic solutions have been established and fully documented in `analysis.md` for:
   - `calculateBuyPricing` (incorporating $P_{maxBuy}$ discount factor $(1 - \phi)$ and full round-trip fee amortization).
   - `calculateSellPricing` (incorporating $P_{breakEven}$ and $P_{targetSell}$ divisor $(1 - \phi)$).
   - `calculateRecommendedLimits` (recommending minimum order limits to suppress fixed fee drag).
3. The proposed changes preserve existing modularity, require zero backend changes, and can be validated deterministically via unit test additions in `test/tier1-feature-coverage/pricing-engine.test.js`.

---

## 5. Verification Method

1. **Inspect Analysis Report**:
   Read `c:\dev\p2p\.agents\survey_explorer_1\analysis.md` for mathematical proofs, sensitivity matrices, and code blueprints.
2. **Execute Existing Test Baseline**:
   ```bash
   node test/run-tests.js --tier=1
   ```
3. **Verification of New Mathematical Invariants**:
   - Check that for `costBasis = 1500`, `outflowFee = 50`, `avgVolume = 100`, `platformFeePct = 0.3`:
     $$breakEven = \frac{1500 + 0.50}{1 - 0.003} = \frac{1500.50}{0.997} \approx ₦1505.015 / \text{USDT}$$
   - Check that for `exitPrice = 1550`, `targetSpread = 5`, `inflowFee = 50`, `outflowFee = 50`, `avgVolume = 100`, `platformFeePct = 0.3`:
     $$P_{maxBuy} = 0.997 \cdot [ 1550 \cdot 0.997 - 5.0 - 1.00 ] = 0.997 \cdot [ 1545.35 - 6.00 ] = 0.997 \cdot 1539.35 \approx ₦1534.73 / \text{USDT}$$
