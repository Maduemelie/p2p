# Milestone 1 Changes Summary: Engine & Arbitrage Math Integration

**Author**: m1_worker_1 (Engine & Arbitrage Math Developer)  
**Date**: 2026-09-02  
**Milestone**: M1 (Engine & Arbitrage Math Integration)

---

## Summary of Modifications

### 1. `js/pricingEngine.js`
- **Platform Maker Fee Math**: Integrated Bybit's 0.30% maker fee fraction ($\phi = 0.003$) and fiat transfer fees ($F_{in}, F_{out}$) into `calculateBuyPricing` and `calculateSellPricing`.
- **`calculateBuyPricing` Formula**:
  $$P_{maxBuy} = (1 - \phi) \cdot \left[ P_{exit} \cdot (1 - \phi) - S_{target} - \frac{F_{in} + F_{out}}{V} \right]$$
  Computes `effectiveCostBasis = (suggestedBuy / (1 - phi)) + (inflowFee / safeAvgVol)`, `effectiveSpread`, `excessSpread`, and `feeBreakdown` containing `platformFeePerUnit`, `fiatFeePerUnit`, `inflowFeePerUnit`, `outflowFeePerUnit`, `totalFeePerUnit`, `roundTripFeePerUnit`, and `effectiveCostBasis`.
- **`calculateSellPricing` Formula**:
  $$P_{breakEven} = \frac{C_{fifo} + \frac{F_{out}}{V}}{1 - \phi}$$
  $$P_{targetSell} = \frac{C_{fifo} + S_{target} + \frac{F_{out}}{V}}{1 - \phi}$$
  Computes `netRealizedRevenue = (suggestedSell * (1 - phi)) - (outflowFee / safeAvgVol)`, `sellSpread`, and `feeBreakdown` containing `platformFeePerUnit`, `fiatFeePerUnit`, `totalFeePerUnit`, and `netRealizedRevenue`.
- **`calculateRecommendedLimits` Export**:
  Implemented order limit calculator computing minimum trade volume ($V_{min}$) and minimum fiat limits ($L_{min}$) where fixed fiat fee drag is bounded within `maxFeeDragRatio` (default 20% of target spread). Supports both positional and object argument formats.

### 2. `js/pricing.js`
- **Platform Fee State Management**: Added persistence for `platformFeePct` (default 0.3%) stored in `localStorage` key `bybit_p2p_pricing_platform_fee_pct` and synchronized with `store.getSettings()`.
- **Engine Invocation**: Passes `platformFeePct`, `inflowFee`, `outflowFee` into `calculateBuyPricing` and `calculateSellPricing`.
- **Limit & Fee Breakdown DOM Rendering**: Injected fee breakdown badges and minimum limit recommendation advisor elements.
- **Export**: Cleanly exported `calculatePricing` as alias to `calculateMargins`.

### 3. `js/store.js`
- **`getSettings()` Helper**: Added settings getter with default fallbacks for `platformFeePct: 0.3`, `inflowFee: 50`, `outflowFee: 50`, `targetSpread: 5.0`, `avgVolume: 100`, `pricingMode: 'avg-10'`, `depthLimit: 50`, `filterLimits: true`.
- **`saveSettings(settings)` Helper**: Added settings persistence method that writes to LocalStorage and triggers `store:updated` event with `{ type: 'settings' }`.
- **Backup & Clear Integration**: Updated `exportAllData`, `importAllData`, and `clearAllData` to manage `settings`.

### 4. `js/dashboard.js` & `js/snapshots.js`
- **Active Ad Filtering Resilience**: Updated ad status filter in `syncAndRenderActiveAd` to recognize both active and paused ads (excluding only deleted/cancelled ads) and format status safely.
- **Table Ledger Rendering**: Removed extra trailing pagination row inside `tbody` so row queries reflect exact snapshot items.

### 5. `test/tier1-feature-coverage/pricing-engine.test.js`
- Added Section 6: Bybit 0.30% Platform Maker Fee Integration tests (`PE.FEE.1`, `PE.FEE.2`).
- Added Section 7: Recommended Minimum Order Limits tests (`PE.LIM.1`, `PE.LIM.2`, `PE.LIM.3`).
- Added Section 8: Trade Size Sensitivity Verification tests across ₦5k, ₦10k, ₦30k, ₦100k tiers (`PE.TIER.1`, `PE.TIER.2`, `PE.TIER.3`, `PE.TIER.4`).

---

## Verification Results
- **Command**: `node test/run-tests.js`
- **Result**: 685 tests across 5 tiers passed (100% pass rate, 0 failures).
