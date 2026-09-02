# Original User Request

## 2026-09-02T05:07:59Z

Research Bybit P2P platform maker transaction fees (0.3%) and local transfer fees (e.g. ₦50 for transactions > ₦10,000), then update the Bybit P2P Tracker engine (`js/pricingEngine.js`, `js/pricing.js`, `js/utils.js`, `js/dashboard.js`, and `js/views/pricing.view.js`) to incorporate percentage platform fees and transaction limits for net profit optimization.

Working directory: c:\dev\p2p

## Requirements

### R1. Bybit P2P Fee Model Research & Analysis
- Analyze Bybit P2P fee structure for advertisers/makers (0.3% maker transaction fee on completed P2P buy/sell orders).
- Determine how percentage platform fees (0.3% crypto/fiat deduction) interact with fixed fiat transfer fees (e.g. ₦50 for transfers > ₦10,000) across different trade sizes and order limit bounds (e.g. ₦5,000 – ₦30,000).

### R2. Arbitrage Math & Engine Integration
- Update `calculateBuyPricing` and `calculateSellPricing` in `js/pricingEngine.js` to incorporate:
  - Percentage platform fee `platformFeePct` (default: 0.3%).
  - Fixed per-transaction fee `inflowFee` / `outflowFee` (default: ₦50).
  - Effective net cost basis and recommended buy/sell rates accounting for percentage and fixed fees simultaneously.
- Compute recommended minimum order limits (e.g., ₦10,000 or custom threshold) to prevent small trades from being eaten away by fixed transaction fees.

### R3. UI Controls & Settings
- Add Bybit Platform Fee (%) input settings to `js/views/pricing.view.js` and `js/views/settings.view.js`.
- Display net fee breakdown (Platform Fee + Transfer Fee = Total Fee per USDT) and optimal order limit recommendations in the Pricing Assistant UI.

### R4. Verification
- Verify mathematical accuracy via automated unit tests in `test/tier1-feature-coverage/pricing-engine.test.js`.
- Test edge cases across varying trade sizes (₦5,000, ₦10,000, ₦30,000, ₦100,000).

## Acceptance Criteria

### Functionality
- [ ] Bybit 0.3% platform fee is configurable and factored into max buy price, break-even sell price, and recommended rates.
- [ ] Net profit remains positive across all valid trade sizes within recommended order limit bounds.
- [ ] Automated unit tests pass with 100% accuracy for fee-adjusted arbitrage math.
