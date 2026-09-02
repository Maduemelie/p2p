# Mathematical & Core Engine Review Report: Milestone 1

**Reviewer**: m1_reviewer_1 (Mathematical & Engine Reviewer / Adversarial Critic)  
**Date**: 2026-09-02  
**Target Milestone**: M1 (Engine & Arbitrage Math Integration)  
**Target Files**:
- `js/pricingEngine.js`
- `js/pricing.js`
- `js/store.js`
- `js/dashboard.js` / `js/utils.js`
- `test/tier1-feature-coverage/pricing-engine.test.js`

---

## 1. Review Summary

**Verdict**: **APPROVE**  
**Integrity Status**: **CLEAN (No Integrity Violations Detected)**  
**Overall Risk Assessment**: **LOW**

The implementation in `js/pricingEngine.js`, `js/pricing.js`, and `js/store.js` flawlessly models Bybit P2P 0.30% maker fees ($\phi = 0.003$), fiat inflow/outflow transaction fees ($F_{in}, F_{out}$), effective cost basis, true break-even rates, target sell prices, and order limit advisory mathematics. All 685 unit, integration, boundary, and stress tests pass with 100% reliability.

---

## 2. Mathematical Formulations & Derivation Verification

### 2.1 Buy Side Formulations (`calculateBuyPricing`)

1. **Net Exit Revenue ($R_{exit}$)**:
   When liquidating crypto on the sell side at exit price $P_{exit}$, Bybit deducts maker fee fraction $\phi$ (0.003) and the bank transfer incurs outflow fee $F_{out}$ amortized over trade volume $V$:
   $$R_{exit} = P_{exit} \cdot (1 - \phi) - \frac{F_{out}}{V}$$

2. **Effective Buy Cost Basis ($C_{buy}$)**:
   When purchasing crypto on the buy side at nominal rate $P_{buy}$, the merchant pays $P_{buy}$ NGN per nominal USDT and receives $(1 - \phi)$ USDT net, plus fixed inflow fee $F_{in}$:
   $$C_{buy} = \frac{P_{buy}}{1 - \phi} + \frac{F_{in}}{V}$$

3. **Maximum Allowable Buy Price ($P_{maxBuy}$)**:
   To ensure net spread $\ge S_{target}$ (i.e. $R_{exit} - C_{buy} = S_{target}$):
   $$\left[ P_{exit} \cdot (1 - \phi) - \frac{F_{out}}{V} \right] - \left[ \frac{P_{maxBuy}}{1 - \phi} + \frac{F_{in}}{V} \right] = S_{target}$$
   $$\frac{P_{maxBuy}}{1 - \phi} = P_{exit} \cdot (1 - \phi) - S_{target} - \frac{F_{in} + F_{out}}{V}$$
   $$P_{maxBuy} = (1 - \phi) \cdot \left[ P_{exit} \cdot (1 - \phi) - S_{target} - \frac{F_{in} + F_{out}}{V} \right]$$
   **Implementation Check (`pricingEngine.js:165-170`)**:
   ```javascript
   const netExitRevenue = (exitPrice * (1 - phi)) - (safeOutflowFee / safeAvgVol);
   const maxBuyPrice = (1 - phi) * (netExitRevenue - safeTargetSpread - (safeInflowFee / safeAvgVol));
   ```
   **Verification**: **EXACT MATCH**.

4. **Fee Breakdown & Cost Basis Metrics**:
   - Platform fee per unit: $P_{suggestedBuy} \cdot \phi$
   - Total fiat fee per unit: $\frac{F_{in} + F_{out}}{V}$
   - Round-trip fee per unit: $P_{buy}\phi + P_{exit}\phi + \frac{F_{in} + F_{out}}{V}$
   - Effective Cost Basis: $\frac{P_{suggestedBuy}}{1 - \phi} + \frac{F_{in}}{V}$
   - Excess Spread: $R_{exit} - C_{buy}$

---

### 2.2 Sell Side Formulations (`calculateSellPricing`)

1. **Break-Even Rate ($P_{breakEven}$)**:
   Net revenue from selling 1 USDT must recover FIFO holding cost basis $C_{fifo}$:
   $$P_{breakEven} \cdot (1 - \phi) - \frac{F_{out}}{V} = C_{fifo}$$
   $$P_{breakEven} = \frac{C_{fifo} + \frac{F_{out}}{V}}{1 - \phi}$$
   **Implementation Check (`pricingEngine.js:271`)**:
   ```javascript
   const breakEven = (costBasis + (safeOutflowFee / safeAvgVol)) / divisor;
   ```
   **Verification**: **EXACT MATCH**.

2. **Target Sell Price ($P_{targetSell}$)**:
   Net revenue must deliver target spread $S_{target}$ above $C_{fifo}$:
   $$P_{targetSell} \cdot (1 - \phi) - \frac{F_{out}}{V} = C_{fifo} + S_{target}$$
   $$P_{targetSell} = \frac{C_{fifo} + S_{target} + \frac{F_{out}}{V}}{1 - \phi}$$
   **Implementation Check (`pricingEngine.js:274`)**:
   ```javascript
   const targetSellPrice = (costBasis + safeTargetSpread + (safeOutflowFee / safeAvgVol)) / divisor;
   ```
   **Verification**: **EXACT MATCH**.

3. **Net Realized Revenue & Spread**:
   $$\text{netRealizedRevenue} = P_{suggestedSell} \cdot (1 - \phi) - \frac{F_{out}}{V}$$
   $$\text{sellSpread} = \text{netRealizedRevenue} - C_{fifo}$$
   **Verification**: **EXACT MATCH**.

---

### 2.3 Recommended Minimum Order Limits (`calculateRecommendedLimits`)

1. **Mathematical Objective**:
   Fixed fiat transfer fees ($F_{in}, F_{out}$) inflict heavy regressive drag on small trade sizes ($F/V$). The advisor bounds fixed fee drag to at most $\alpha$ (default $\alpha = 0.20$ or 20%) of the target spread $S_{target}$:
   $$\text{Fee Drag} = \frac{F}{V} \le \alpha \cdot S_{target}$$
   $$V_{min} = \frac{F}{\alpha \cdot S_{target}}$$
   $$L_{min} (\text{NGN}) = V_{min} \cdot P$$

2. **Break-Even Limit ($L_{breakEven}$)**:
   Trade size below which fixed fiat fee consumes 100% of target spread:
   $$V_{breakEven} = \frac{F}{S_{target}}$$
   $$L_{breakEven} (\text{NGN}) = V_{breakEven} \cdot P$$

3. **Implementation Check (`pricingEngine.js:361-427`)**:
   - Supports both object-oriented (`{ price, targetSpread, fiatFee, maxFeeDragRatio }`) and positional parameter signatures (`price, targetSpread, fiatFee, options`).
   - Clamps minimum USDT limit to absolute dust floor (2.0 USDT).
   - Generates formatted advisor text with localized currency strings.
   **Verification**: **EXACT MATCH**.

---

## 3. Adversarial Stress-Testing & Edge Cases

| Scenario | Input Values | Engine Handling & Behavior | Risk Level | Status |
|---|---|---|---|---|
| **Zero Fees** | $\phi=0, F_{in}=0, F_{out}=0$ | Smoothly degrades to baseline arithmetic ($P_{exit} - S_{target}$, $C_{fifo} + S_{target}$). | None | PASSED |
| **High Fiat Fees** | $F_{in} = ₦10,000, V = 10$ | Calculates amortized drag ₦1,000/USDT, drops $P_{maxBuy}$ below 0, caps `suggestedBuy`, sets `isSafe: false`. | None | PASSED |
| **Micro-Trade Volumes** | $V \to 0, V < 0, V = \text{NaN}$ | Safely defaults `safeAvgVol = 100`, prevents division-by-zero ($F/V \to \infty$). | None | PASSED |
| **Negative Target Spread** | $S_{target} = -₦2.00$ | Correctly handles negative offset without NaN or throwing. | None | PASSED |
| **Zero / Negative Cost Basis** | $C_{fifo} \le 0$ | Returns `hasCostBasis: false`, `isSafe: false`, zeroes suggested rates. | None | PASSED |
| **Empty Competitor Books** | `activeBuyAds = []`, `sortedSellAds = []` | Returns `isOffline: true` / `hasCompetitors: false` cleanly. | None | PASSED |
| **Fee Rate Representation** | Both `0.3` (0.3%) and `0.003` (fraction) | Normalized by `normalizeFeeRate` to `0.003` consistently. | None | PASSED |
| **Omitted / Null Arguments** | `calculateBuyPricing()`, `calculateRecommendedLimits(null)` | Default destructured arguments protect against runtime crashes. | None | PASSED |

---

## 4. Store & Persistence Layer Review (`js/store.js`)

1. **`getSettings()`**:
   Provides robust defaults:
   `{ platformFeePct: 0.3, inflowFee: 50, outflowFee: 50, targetSpread: 5.0, avgVolume: 100, pricingMode: 'avg-10', depthLimit: 50, filterLimits: true }`.
2. **`saveSettings(settings)`**:
   Persists merged settings to `bybit_p2p_settings` in `localStorage` and dispatches reactive event `store:updated` with `{ type: 'settings' }`.
3. **Backup, Restore & Reset Integration**:
   `exportAllData()`, `importAllData()`, and `clearAllData()` properly serialize, sanitize, and restore `settings`.

---

## 5. Verified Claims & Test Results

- **Test Command**: `node test/run-tests.js`
- **Total Tests**: 685
- **Passed**: 685 (100.0%)
- **Failed**: 0
- **Duration**: 45,492 ms
- **Tier Breakdown**:
  - Tier 1 (Feature Coverage): 430/430 (100.0%)
  - Tier 2 (Boundary & Corner Cases): 159/159 (100.0%)
  - Tier 3 (Cross-Feature Combinations): 14/14 (100.0%)
  - Tier 4 (Real-World Application Scenarios): 10/10 (100.0%)
  - Tier 5 (Challenger & Stress Suites): 72/72 (100.0%)

---

## 6. Conclusion

The mathematical engine and storage persistence are thoroughly verified, robust against edge cases and hostile inputs, and ready for UI integration in Milestone 2.
