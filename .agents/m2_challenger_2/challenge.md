# Empirical Challenge Report: Dynamic DOM, Fee Decomposition & Limit Advisor Reactivity

**Target Milestone**: Milestone 2 (UI Controls, Settings & Pricing Assistant)  
**Agent**: `m2_challenger_2` (Role: Dynamic DOM & Order Book Reactivity Challenger)  
**Date**: 2026-09-02  
**Verdict**: **APPROVE**

---

## 1. Challenge Summary

**Overall Risk Assessment**: **LOW**

The Pricing Assistant (`js/views/pricing.view.js`, `js/pricing.js`, `js/pricingEngine.js`) and Settings View (`js/views/settings.view.js`, `js/settings.js`) successfully implement:
1. Transparent Fee Breakdown rendering (Platform Maker Fee, Fiat Inflow/Outflow Fee per unit, and Net Cost Basis / Realized Net Revenue) across varying price tiers (₦1,200 - ₦2,500/USDT) and volume brackets (10 - 1,000 USDT).
2. Mathematically exact Minimum Order Limit Recommendations (`calculateRecommendedLimits`) that bound fixed fee drag $\le 20\%$ of target spread across ₦0, ₦50, and ₦100 fiat fee scenarios with clean formatting and dust clamping (2.0 USDT floor).
3. Immediate dynamic DOM reactivity upon slider/input adjustments and cross-tab/cross-view synchronization via `store:updated` events.
4. Bid/Ask Order Book parsing with accurate limit string representations and click-to-trade prefill direction mapping (bids -> SELL trade, asks -> BUY trade).

---

## 2. Challenges & Stress Dimensions

### Dimension 1: Fee Breakdown Decomposition & Multi-Tier Pricing Accuracy
- **Assumption Challenged**: Platform maker percentage fee ($\\phi = 0.003$) and fiat bank transfer fees ($F_{in}, F_{out}$) are correctly decoupled, formatted per USDT unit, and displayed in both Buy and Sell cards without arithmetic distortion when rates or volumes shift.
- **Attack Scenario**: Tested matrix of prices (₦1,200, ₦1,500, ₦1,800, ₦2,500) and volumes (10, 50, 100, 200, 500 USDT) with variable fee rates (0.15% VIP, 0.30% standard, 0.50% high).
- **Result**: PASSED. Maker Fee, Fiat Fee per Unit, and Net Cost Basis / Net Revenue pills render exact 2-decimal rounded values matching the mathematical engine.

### Dimension 2: Minimum Order Limit Recommendations & Fee Drag Capping
- **Assumption Challenged**: Recommended order limits prevent fixed fiat fees from eating more than 20% of the merchant's target spread ($V_{min} = F / (S \times 0.20)$), while handling ₦0 fee cases (zero fee drag) without division-by-zero or blank text.
- **Attack Scenario**:
  - ₦0 Fiat Fee: Verified clamp to 2.0 USDT dust floor, ₦0 fee drag, and "0% fee drag" text.
  - ₦50 Fiat Fee: Evaluated across spreads ₦2.0 (125 USDT / ₦187,500 limit), ₦5.0 (50 USDT / ₦75,000 limit), ₦10.0 (25 USDT / ₦37,500 limit), ₦20.0 (12.5 USDT / ₦18,750 limit).
  - ₦100 Fiat Fee: Evaluated across spreads ₦2.0 (250 USDT / ₦375,000 limit), ₦5.0 (100 USDT / ₦150,000 limit), ₦10.0 (50 USDT / ₦75,000 limit), ₦20.0 (25 USDT / ₦37,500 limit).
- **Result**: PASSED. Every limit, break-even limit, and text recommendation formatted with exact locale commas and precision.

### Dimension 3: Dynamic Controller Reactivity & Settings Synchronization
- **Assumption Challenged**: Modifying platform fee % or fee defaults in Settings view broadcasts `store:updated` and instantly reflects in Pricing Assistant inputs and margin calculations without requiring full page refresh.
- **Attack Scenario**: Simulated user input events on `#input-platform-fee-pct` and external `store.saveSettings` dispatches.
- **Result**: PASSED. DOM badges (`#pricing-buy-maker-badge`, `#pricing-sell-maker-badge`) and breakdown cards updated synchronously.

### Dimension 4: Live Order Book Depth Rendering & Click-to-Trade Prefill
- **Assumption Challenged**: Bybit P2P order depth correctly maps taker perspective to merchant action (Buy book bids -> merchant SELL trade; Sell book asks -> merchant BUY trade) and formats trade limits.
- **Attack Scenario**: Verified 10-row depth slicing, advertiser name truncation, limit formatting (`₦10,000 - ₦350,000` vs `No Limit`), and `window.prefillTradeForm` callbacks.
- **Result**: PASSED. Direction attributes (`data-direction="SELL"` on bids, `data-direction="BUY"` on asks) and prefill callbacks executed with 100% fidelity.

---

## 3. Stress Test Results Matrix

| # | Test Scenario | Expected Behavior | Actual Behavior | Status |
|---|---------------|-------------------|-----------------|--------|
| 1 | Fee Decomposition (₦1,200 - ₦2,500) | Exact Maker & Fiat fee per unit | Rendered exactly matching formulas | PASS |
| 2 | ₦0 Fiat Transfer Fee | Clamped to 2.0 USDT floor, 0% drag | 2.0 USDT, 0% fee drag displayed | PASS |
| 3 | ₦50 Fiat Fee across ₦2 - ₦20 spreads | Exact $V_{min} = 50 / (S \times 0.20)$ | Exact limits (12.5 - 125 USDT) | PASS |
| 4 | ₦100 Fiat Fee across ₦2 - ₦20 spreads | Exact $V_{min} = 100 / (S \times 0.20)$ | Exact limits (25 - 250 USDT) | PASS |
| 5 | Advisor text DOM updates | Dynamic `#pricing-buy-limit-rec` update | Instant DOM text update | PASS |
| 6 | Direct Platform Fee % input event | Update localStorage & maker badges | Badges updated immediately | PASS |
| 7 | Settings view `store:updated` sync | Synchronize all Pricing inputs | All inputs and margins synchronized | PASS |
| 8 | Order book depth limits & prefill | Correct limits text & SELL/BUY mapping | Accurate prefill data & direction | PASS |

---

## 4. Unchallenged Areas

- Hardware-accelerated Canvas Chart rendering (verified in M4 test suite).
- Multi-device Web Push notifications (out of Milestone 2 scope).
