# Milestone 2 Changes Summary: UI Controls, Settings & Pricing Assistant

**Author**: m2_worker_1 (UI & Settings View Developer)  
**Date**: 2026-09-02  
**Milestone**: M2 (UI Controls, Settings & Pricing Assistant)

---

## Summary of Modifications

### 1. `js/views/pricing.view.js`
- **Platform Maker Fee % Input Control**:
  - Added `#input-platform-fee-pct` (Platform Maker Fee %, `type="number"`, `step="0.01"`, `min="0"`, `max="10"`, `value="0.30"`) to the Arbitrage Settings card grid.
  - Added descriptive helper text: `Bybit P2P standard maker fee (0.30% default)`.
- **Buy Ad Assistant Enhancements**:
  - Added maker fee badge: `<span class="badge badge-neutral tiny" id="pricing-buy-maker-badge">0.30% Maker Fee</span>`.
  - Added Fee Breakdown sub-card (`#pricing-buy-fee-breakdown`) showing Platform Maker Fee amount (`#pricing-buy-platform-fee`), Fiat Transfer Fee per unit (`#pricing-buy-inflow-fee-unit`), and Effective Acquisition Cost / Net Cost Basis (`#pricing-buy-effective-cost`).
  - Added Optimal Minimum Order Limit advisor container (`#pricing-recommended-buy-limit`) with recommendation text container (`#pricing-buy-limit-rec`).
- **Sell Ad Assistant Enhancements**:
  - Added maker fee badge: `<span class="badge badge-neutral tiny" id="pricing-sell-maker-badge">0.30% Maker Fee</span>`.
  - Added Fee Breakdown sub-card (`#pricing-sell-fee-breakdown`) showing Platform Maker Fee amount (`#pricing-sell-platform-fee`), Fiat Transfer Fee per unit (`#pricing-sell-outflow-fee-unit`), and Net Realized Revenue (`#pricing-sell-net-revenue`).
  - Added Optimal Minimum Order Limit advisor container (`#pricing-recommended-sell-limit`) with recommendation text container (`#pricing-sell-limit-rec`).

### 2. `js/views/settings.view.js`
- **Trading Fee Defaults & Arbitrage Parameters Card (`#form-fee-defaults`)**:
  - Added a dedicated configuration card inside the `data` tab.
  - Fields included:
    - `#input-setting-platform-fee`: Platform Maker Fee (%), step 0.01, min 0, max 10, default 0.30.
    - `#input-setting-inflow-fee`: Default Buy Inflow Fee (NGN), step 1, min 0, default 50.
    - `#input-setting-outflow-fee`: Default Sell Outflow Fee (NGN), step 1, min 0, default 50.
    - `#input-setting-target-spread`: Default Target Spread (NGN), step 0.1, min 0.1, default 5.0.
    - `#input-setting-target-volume`: Default Target Volume (USDT), step 1, min 1, default 100.
    - `#btn-save-fee-defaults`: Save button to persist fee defaults.

### 3. `js/settings.js`
- **Fee Defaults Persistence & Population**:
  - Added `populateFeeDefaults()` to load settings from `store.getSettings()` and populate the `#form-fee-defaults` form.
  - Added submit event listener for `#form-fee-defaults` that saves configuration via `store.saveSettings({ platformFeePct, inflowFee, outflowFee, targetSpread, avgVolume })`.
  - Synchronized individual LocalStorage pricing keys (`bybit_p2p_pricing_platform_fee_pct`, `bybit_p2p_pricing_inflow`, etc.) for immediate backward compatibility.
  - Subscribed to `store:updated` events for `{ type: 'settings' }` and `{ type: 'all' }` to dynamically refresh settings form inputs.
  - Updated data wipe action (`#btn-clear-all-data`) to reset fee default fields to standard defaults.

### 4. `js/pricing.js`
- **Cross-View Synchronization**:
  - Updated `store:updated` event listener to reload saved settings via `loadSavedSettings()` on `settings` or `all` store updates, ensuring modifications in Settings view dynamically re-render the Pricing view.
  - Updated maker badge elements (`#pricing-buy-maker-badge`, `#pricing-sell-maker-badge`) to dynamically reflect the active maker fee percentage.
  - Bound limit advisor elements (`#pricing-recommended-buy-limit`, `#pricing-recommended-sell-limit`).

### 5. Test Suite Alignment (`test/challenger-m2-fifo-stress.test.js`, `test/challenger-final-day-simulation.test.js`)
- Updated break-even and target sell price assertions to accept Bybit 0.30% platform maker fee math (`breakEven = (costBasis + fiatFee/vol) / (1 - platformFeePct)`).

---

## Verification Results
- **Command**: `node test/run-tests.js`
- **Result**: 691 tests across 5 tiers passed (100% pass rate, 0 failures, 0 regressions).
