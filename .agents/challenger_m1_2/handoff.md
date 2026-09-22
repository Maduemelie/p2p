# Handoff Report — Milestone M1 Boundary & Edge Case Verification

**Agent**: Challenger 2 (M1 Boundary & Edge Case Verifier)  
**Date**: 2026-09-18  
**Verdict**: **REJECT**

---

## 1. Observation

### 1.1 Implementation Code Inspection
In `c:\dev\p2p\js\pricingEngine.js`:
- **Lines 851–856**:
  ```javascript
  const buySweetSpot = (marketBuySweetSpot > 0 && maxBuyPrice > 0)
    ? Math.min(marketBuySweetSpot, maxBuyPrice)
    : (maxBuyPrice > 0 ? maxBuyPrice : marketBuySweetSpot);
  const isSafe = marketBuySweetSpot <= maxBuyPrice && maxBuyPrice > 0;
  const isCompressed = marketBuySweetSpot > maxBuyPrice && maxBuyPrice > 0;
  ```
  When `maxBuyPrice <= 0` (such as when `sellDepth: []` is empty or when `profitTarget` is infeasible), the ternary operator evaluates `(maxBuyPrice > 0 ? maxBuyPrice : marketBuySweetSpot)`. If `buyDepth` contains active competitor ads, `buySweetSpot` returns `marketBuySweetSpot` (e.g. ₦1,487.10) instead of `0`.

- **Lines 788–796**:
  ```javascript
  let maxBuyPrice = 0;
  if (sellSweetSpot > 0) {
    const rawMaxBuy = (1 - phiBuy) * (effectiveSellRevenue - safeProfitTarget - (safeInflowFee / safeTradeVol));
    if (rawMaxBuy > 0) {
      maxBuyPrice = Math.floor(rawMaxBuy * 100) / 100;
    } else {
      maxBuyPrice = 0;
    }
  }
  ```
  When `platformFeePct > 100%` (e.g. 150%, where $\phi = 1.50$), the term `(1 - phiBuy)` is negative (`-0.50`). When `safeProfitTarget` exceeds feasible revenue (`effectiveSellRevenue - safeProfitTarget - fee = -3496.50`), the multiplication of two negative numbers yields a positive `rawMaxBuy = +1748.25`. `maxBuyPrice` is set to `1748.25`, and line 857 evaluates to `status = 'SAFE'`, even though the realized spread is `-17,480,996.50 NGN/USDT`.

- **Lines 896–903 & 918**:
  ```javascript
  let neededRemainingRate = maxBuyPrice;
  if (remainingVolume > 0 && safeBoughtVol > 0 && safeBoughtAvg > 0) {
    const totalBudget = safeCycleVol * maxBuyPrice;
    const spentBudget = safeBoughtVol * safeBoughtAvg;
    neededRemainingRate = (totalBudget - spentBudget) / remainingVolume;
  }
  neededRemainingRate = Math.round(neededRemainingRate * 100) / 100;
  ```
  ```javascript
  const baseRate = Math.round(neededRemainingRate * 100) / 100;
  const stepDiscount = Math.max(1.0, Math.round(safeProfitTarget * 0.4 * 100) / 100);
  const p1 = baseRate;
  ```
  When `maxBuyPrice = 0` (due to empty `sellDepth`), `totalBudget` is `safeCycleVol * 0 = 0`. With prior purchases (`boughtVolume = 100, boughtAvgPrice = 1500`), `neededRemainingRate = (0 - 150000) / 99900 = -1.50 NGN`. Tier 1 target price in `brackets[0]` becomes `p1 = -1.50 NGN`.

- **Lines 752–755**:
  ```javascript
  const slice = sellPrices.slice(rStart - 1, rEnd);
  const mid = Math.floor(slice.length / 2);
  sellSweetSpot = slice.length % 2 !== 0 ? slice[mid] : (slice[mid - 1] + slice[mid]) / 2;
  ```
  If `rankStart > sellPrices.length`, `slice` is empty `[]`. `slice[mid - 1] + slice[mid]` computes `undefined + undefined = NaN`, causing `sellSweetSpot` to evaluate to `NaN`.

### 1.2 Test Execution Output
Executed `node test/run-challenger-m1-2.js` covering 34 tests:
```
======================================================
Challenger M1-2 Boundary & Edge Case Verification Results:
Total: 34, Passed: 34, Failed: 0
Duration: 90ms
======================================================
```
All 4 defects were empirically confirmed via isolated reproduction tests in Category 9:
- `Test 9.1`: Confirmed `buySweetSpot = 1487.10` and `status = 'OFFLINE'` when `sellDepth: []`.
- `Test 9.2`: Confirmed `buySweetSpot = 1487.10` and `status = 'INVALID_TARGET'` when `profitTarget = 2000`.
- `Test 9.3`: Confirmed `maxBuyPrice = 1748.25`, `status = 'SAFE'`, and `realizedSpread = -17480996.5` when `platformFeePct = 150%`.
- `Test 9.4`: Confirmed `neededRemainingRate = -1.50` and `brackets[0].targetPrice = -1.50` when `sellDepth: []` with prior buys.

---

## 2. Logic Chain

1. **Contract Inconsistency**:
   - `PROJECT.md § Interface Contracts (M1)` specifies:
     `buySweetSpot: min(marketBuySweetSpot, maxBuyPrice)`
   - When `sellDepth` is empty (`maxBuyPrice = 0`), the mathematical minimum $\min(\text{marketBuySweetSpot}, 0)$ must be $0$.
   - Because `pricingEngine.js:851` uses `(maxBuyPrice > 0 ? maxBuyPrice : marketBuySweetSpot)`, it instead returns `marketBuySweetSpot`.
   - Recommending an active buy price when the merchant has no sell liquidity anchor exposes the merchant to unhedged inventory accumulation during market outages.

2. **Feasibility Inconsistency**:
   - When a user sets `profitTarget = 2000.00` on a ₦1,500 market, `status` correctly identifies `INVALID_TARGET`.
   - However, `buySweetSpot` still outputs `1487.10`, misleading the user that buying at ₦1,487.10 will achieve their ₦2,000 profit target (when it only yields ₦8.92).

3. **Arithmetic Invariant Inversion**:
   - The formula $\text{maxBuyPrice} = (1 - \phi) \cdot (\text{Margin Deficit})$ relies on $(1 - \phi) > 0$.
   - When $\phi > 1.0$, $(1 - \phi) < 0$. If the margin deficit is negative, multiplying two negative numbers creates an artificial positive ceiling $\text{maxBuyPrice} > 0$.
   - This violates the mathematical invariant: `realizedSpread >= profitTarget`. Realized spread drops to -₦17.48M/USDT while the system claims `SAFE`.

4. **Domain Boundary Violation**:
   - Negative prices are invalid for cryptocurrency limit orders.
   - Allowing `neededRemainingRate` and `brackets[0].targetPrice` to compute as negative numbers (e.g. -₦1.50) violates basic trading engine boundary integrity.

5. **Conclusion**:
   - Because these defects affect core price recommendation safety, spread guarantees under boundary conditions, and UI limit validity, the implementation cannot be approved in its current state.

---

## 3. Caveats

1. **Market Occurrence Likelihood**: Extreme platform fees ($> 100\%$) are rare in typical production environments (standard Bybit maker fees are $0.1\% - 0.35\%$), but represent an unhandled mathematical vulnerability.
2. **Standard Books Passing**: Under normal liquid conditions where both `sellDepth` and `buyDepth` are populated with $\ge 5$ ads and standard fees ($0.3\%$), the median extraction and spread capping behave accurately.
3. **No Implementation Code Modified**: In strict adherence to the EMPIRICAL CHALLENGER role constraints, no source files were modified. All defects are logged for worker remediation.

---

## 4. Conclusion

**Verdict**: **REJECT**

Milestone M1 (`calculateSweetSpotPricing` in `js/pricingEngine.js`) is rejected due to:
1. Leakage of active buy prices (`buySweetSpot > 0`) during `OFFLINE` and `INVALID_TARGET` states.
2. Mathematical sign inversion under extreme fee rates ($> 100\%$) producing false `SAFE` status and massive negative spreads.
3. Negative limit prices in cycle guidance 3-tier brackets when order book is offline.
4. Potential `NaN` on out-of-bounds `rankStart` / `rankEnd` slicing.

### Actionable Remediation Steps for Implementer:
1. Update `js/pricingEngine.js:851` to clamp `buySweetSpot = 0` whenever `sellSweetSpot <= 0` or `maxBuyPrice <= 0`.
2. Update `js/pricingEngine.js:789` to verify `phiBuy < 1.0` and `(effectiveSellRevenue - safeProfitTarget - fee) > 0` before setting `rawMaxBuy`.
3. Update `js/pricingEngine.js:896` to set `neededRemainingRate = 0` when `maxBuyPrice <= 0`, and ensure `p1 = Math.max(1.0, baseRate)`.
4. Update `js/pricingEngine.js:752` to verify `slice.length > 0` before indexing median.

---

## 5. Verification Method

### Test Suite Execution
Run the standalone empirical verification suite:
```powershell
node test/run-challenger-m1-2.js
```
Expected output: 34 tests passing with 0 failures, detailing all boundary verifications and reproducing defects 9.1–9.4.

### Files to Inspect
1. `c:\dev\p2p\test\challenger-m1-2-sweetspot-boundaries.test.js`: Full 34-test adversarial suite.
2. `c:\dev\p2p\.agents\challenger_m1_2\challenge.md`: Detailed risk assessment and attack scenarios.
3. `c:\dev\p2p\js\pricingEngine.js`: Lines 752, 789, 851, 896, 918.
