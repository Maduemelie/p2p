# Project: Bybit P2P Platform Fees & Net Profit Optimization

## Architecture
- **Pricing Engine (`js/pricingEngine.js`)**: Pure mathematical engine computing reference prices, maximum buy price, target sell price, break-even rates, fee amortizations, and recommended order limits.
- **Pricing Controller (`js/pricing.js`)**: State management, local storage persistence, event subscription (`store:updated`), market depth analysis, and pricing calculation coordination.
- **Store & Settings (`js/store.js`, `js/settings.js`)**: Central storage abstraction for local persistence and event dispatching (`store:updated`) for trading fee defaults.
- **UI Views (`js/views/pricing.view.js`, `js/views/settings.view.js`)**: DOM rendering and event listeners for pricing parameters, fee breakdown display, net profit impact, optimal limit advisor, and fee settings.
- **Utilities & Formatting (`js/utils.js`, `js/dashboard.js`)**: Fee formatting, currency formatting, net profit calculation helpers, and dashboard metrics.
- **Test Suite (`test/tier1-feature-coverage/pricing-engine.test.js`)**: Automated unit and invariant tests executed via `node test/run-tests.js`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Platform Maker Fee Math | Incorporate Bybit 0.3% maker percentage fee ($\phi = 0.003$) into `calculateBuyPricing` and `calculateSellPricing` | M1 | Survey / R1 / R2 |
| 2 | Fiat Transfer Fee Amortization | Support flat & threshold-based inflow/outflow fees ($F_{in}, F_{out}$) combined with percentage fee | M1 | Survey / R1 / R2 |
| 3 | Net Cost Basis & True Break-even | Compute true effective cost basis $P_{buy} \cdot (1+\phi) + F_{in}/V$ and break-even sell price $(C_{fifo} + F_{out}/V)/(1-\phi)$ | M1 | Survey / R2 |
| 4 | Recommended Minimum Order Limits | Implement `calculateRecommendedLimits` ensuring fixed fee drag does not exceed 20% of target spread | M1 | Survey / R2 |
| 5 | Pricing Controller State Persistence | Persist `platformFeePct` (default 0.3%) in `js/pricing.js` and synchronize with `store.js` | M1 | Survey / R2 |
| 6 | Dashboard & Utils Integration | Update `js/utils.js` and `js/dashboard.js` with net profit calculation helpers accounting for platform + fiat fees | M1 | Survey / R2 |
| 7 | Pricing Assistant UI Controls | Add `input-platform-fee-pct` (step 0.01%, default 0.30%) and fee breakdown display to `js/views/pricing.view.js` | M2 | Survey / R3 |
| 8 | Optimal Limit Recommendations UI | Display recommended minimum fiat/USDT order limits and fee drag badge in `js/views/pricing.view.js` | M2 | Survey / R3 |
| 9 | Trading Fee Defaults in Settings | Add fee defaults card (`#form-fee-defaults`) to `js/views/settings.view.js` and wire with `js/settings.js` | M2 | Survey / R3 |
| 10 | Unit Test Suite Expansion | Add comprehensive unit tests in `test/tier1-feature-coverage/pricing-engine.test.js` for 0.3% fee, limit recommendations, and edge cases | M3 | Survey / R4 |
| 11 | Trade Size Sensitivity Tests | Verify fee behavior across ₦5k, ₦10k, ₦30k, ₦100k tiers in automated tests | M3 | Survey / R4 |
| 12 | Full Test Suite Execution | Verify that all test suites pass 100% via `node test/run-tests.js` without regressions | M3 | Survey / R4 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Engine & Arbitrage Math Integration | Update `js/pricingEngine.js`, `js/pricing.js`, `js/utils.js`, `js/dashboard.js`, `js/store.js` with percentage platform fees, fiat transfer fees, net pricing formulas, and `calculateRecommendedLimits`. | none | DONE |
| M2 | UI Controls, Settings & Pricing Assistant | Update `js/views/pricing.view.js`, `js/views/settings.view.js`, `js/settings.js` to render platform fee inputs, fee breakdowns, optimal limit recommendations, and settings persistence. | M1 | DONE |
| M3 | Unit Testing & Trade Size Sensitivity Verification | Update `test/tier1-feature-coverage/pricing-engine.test.js`, run automated tests across ₦5k, ₦10k, ₦30k, ₦100k, and ensure full test suite passes. | M1, M2 | DONE |

## Interface Contracts
### `js/pricingEngine.js` Exports
- `calculateBuyPricing(exitPrice, targetSpread, ads, options)`
  - `options`: `{ avgVolume: number, inflowFee: number, outflowFee: number, platformFeePct: number, pricingMode: string, depthLimit: number, filterLimits: boolean, maxBuyLimit: number }`
  - Returns: `{ exitPrice, targetSpread, effectiveSpread, maxBuyPrice, referenceBuyPrice, suggestedBuy, isCompetitorUndercut, status, feeBreakdown: { platformFeePerUnit, fiatFeePerUnit, totalFeePerUnit, effectiveCostBasis } }`
- `calculateSellPricing(costBasis, targetSpread, ads, options)`
  - `options`: `{ avgVolume: number, outflowFee: number, platformFeePct: number, pricingMode: string, depthLimit: number, filterLimits: boolean, minSellLimit: number }`
  - Returns: `{ costBasis, targetSpread, breakEven, targetSellPrice, referenceSellPrice, suggestedSell, isCompetitorUndercut, status, feeBreakdown: { platformFeePerUnit, fiatFeePerUnit, totalFeePerUnit, netRealizedRevenue } }`
- `calculateRecommendedLimits(price, targetSpread, fiatFee, options)`
  - `options`: `{ maxFeeDragRatio: number (default 0.20), platformFeePct: number }`
  - Returns: `{ minFiatLimit: number, minUsdtLimit: number, breakEvenFiatLimit: number, feeDragRatio: number, recommendedText: string }`

### `js/store.js` Settings Interface
- `getSettings()`: Returns `{ platformFeePct: number, inflowFee: number, outflowFee: number, targetSpread: number, avgVolume: number, ... }`
- `saveSettings(settingsObj)`: Persists settings and dispatches `store:updated` with `{ type: 'settings' }`.

## Code Layout
- `js/pricingEngine.js` - Pure mathematical pricing algorithms & limit calculations (Owner: M1 Worker)
- `js/pricing.js` - Pricing controller and state management (Owner: M1 Worker)
- `js/store.js` - Storage helpers for settings (Owner: M1 Worker)
- `js/utils.js` - Formatting & helper utilities (Owner: M1 Worker)
- `js/dashboard.js` - Dashboard profit and margin calculations (Owner: M1 Worker)
- `js/views/pricing.view.js` - Pricing Assistant UI view (Owner: M2 Worker)
- `js/views/settings.view.js` - Settings view (Owner: M2 Worker)
- `js/settings.js` - Settings controller (Owner: M2 Worker)
- `test/tier1-feature-coverage/pricing-engine.test.js` - Unit test suite (Owner: M3 Worker / Test Writer)
