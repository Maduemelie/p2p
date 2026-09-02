# Handoff Report: UI Controls, Settings & Pricing Assistant Fee Integration

**Date**: 2026-09-02  
**Agent**: `survey_explorer_2` (UI & Settings Explorer)  
**Assigned Directory**: `c:\dev\p2p\.agents\survey_explorer_2`  
**Reference Report**: `c:\dev\p2p\.agents\survey_explorer_2\analysis.md`

---

## 1. Observation

1. **`js/views/pricing.view.js` (lines 26–100, 107–194)**:
   - Contains inputs for `input-target-spread` (default 5.0), `input-avg-volume` (default 100), `input-inflow-fee` (default 50), `input-outflow-fee` (default 50), `input-pricing-mode` (default avg-10), `input-depth-limit` (default 50), and `input-filter-limits`.
   - **Lacks** an input for Platform Maker Fee percentage (`input-platform-fee-pct`, default 0.30%).
   - The Buy Ad Assistant card displays `#pricing-exit-price`, `#pricing-max-buy`, `#pricing-top-buy-competitor`, `#pricing-suggested-buy`, and `#pricing-buy-status`.
   - The Sell Ad Assistant card displays `#pricing-cost-basis`, `#pricing-break-even`, `#pricing-target-sell-price`, `#pricing-top-sell-competitor`, `#pricing-suggested-sell`, and `#pricing-sell-status`.
   - **Lacks** fee breakdown sub-cards (platform fee amount in ₦/USDT vs flat fiat transfer fee per unit), true effective cost basis / net realized revenue, projected net trade profit in NGN, and optimal minimum order limit recommendations.

2. **`js/pricing.js` (lines 35–80, 169–325)**:
   - Persists pricing settings in `localStorage` (`bybit_p2p_pricing_spread`, `bybit_p2p_pricing_volume`, `bybit_p2p_pricing_inflow`, `bybit_p2p_pricing_outflow`, `bybit_p2p_pricing_mode`, `bybit_p2p_pricing_depth_limit`, `bybit_p2p_pricing_filter_limits`).
   - Does not load, save, or pass `platformFeePct` (default 0.30) to `pricingEngine.js`.
   - Listens to `store:updated` for types `'trades'`, `'all'`, `'settings'` to recalculate margins.

3. **`js/views/settings.view.js` (lines 16–20, 142–272)**:
   - Contains 3 sub-tabs (`accounts`, `bybit-sync`, `data`).
   - Houses bank accounts, transfer log, Bybit live sync credentials, and opening inventory.
   - **Lacks** a centralized "Trading Fee Defaults & Arbitrage Parameters" card to persist default platform maker fee percentage, fiat transfer fees, and baseline spread/volume targets.

4. **`js/store.js` (lines 8–16, 57–84)**:
   - Defines `STORAGE_KEYS.SETTINGS = 'bybit_p2p_settings'` but has no `getSettings()` / `saveSettings()` helper methods.
   - Dispatches `store:updated` via `window.dispatchEvent(new CustomEvent('store:updated', { detail: { type, payload, timestamp } }))`.

5. **`js/pricingEngine.js` (lines 95–220)**:
   - Currently computes `maxBuyPrice = exitPrice - targetSpread - (inflowFee / safeAvgVol)` and `targetSellPrice = costBasis + targetSpread + (outflowFee / safeAvgVol)`.
   - Omits the Bybit platform maker fee percentage ($p_{maker} = 0.003$), leading to an underestimation of true cost basis by ~₦4.50/USDT and overestimation of net profit.

---

## 2. Logic Chain

1. **Simultaneous Fee Accounting**:
   - When buying USDT as a maker at price $P_{buy}$, the merchant incurs a flat inflow fee $F_{in} / V$ and a 0.3% maker deduction ($P_{buy} \times p_{maker}$).
   - The true effective buy cost is $P_{buy} \times (1 + p_{maker}) + (F_{in} / V)$.
   - To guarantee a target spread $S_{target}$ against the market sell exit price $P_{exit}$, the maximum allowable buy price is $\mathbf{MaxBuyPrice} = \frac{P_{exit} - S_{target} - (F_{in} / V)}{1 + p_{maker}}$.
   - Similarly, when selling USDT as a maker at $P_{sell}$, net revenue is $P_{sell} \times (1 - p_{maker}) - (F_{out} / V)$.
   - The required target sell price is $\mathbf{TargetSellPrice} = \frac{C_{fifo} + S_{target} + (F_{out} / V)}{1 - p_{maker}}$, and break-even price is $\mathbf{BreakEven} = \frac{C_{fifo} + (F_{out} / V)}{1 - p_{maker}}$.

2. **Fee Drag & Optimal Order Limits**:
   - A fixed ₦50 fiat transfer fee creates severe fee drag on small orders: on a ₦5,000 order (3.33 USDT), the fiat fee is ₦15.00/USDT, creating a 390% fee drag that causes an immediate ₦48.33 net loss on a ₦5 spread.
   - At 20 USDT (₦30,000), fee drag drops to ₦2.50/USDT (50% of ₦5 spread).
   - At 100 USDT (₦150,000), fee drag drops to ₦0.50/USDT (10% of ₦5 spread).
   - Therefore, the UI must dynamically recommend an **Optimal Minimum Order Limit** ($\ge \text{₦}30,000$ to $\text{₦}50,000$) where fee drag is capped at $\le 20\%$ of gross spread.

3. **UI & Settings Integration**:
   - In `pricing.view.js`: Add `#input-platform-fee-pct` (default `0.30%`) to Arbitrage Settings; add fee breakdown boxes, net profit banners, and recommended order limits to both Buy and Sell cards.
   - In `settings.view.js`: Add a `#form-fee-defaults` card enabling users to configure default maker fee %, inflow fee, outflow fee, target spread, and order limits.
   - In `store.js` & `settings.js`: Wire `store.getSettings()` and `store.saveSettings()` to persist these defaults and dispatch `store:updated` with `{ type: 'settings' }` for instant cross-view synchronization.

---

## 3. Caveats

1. **VIP Tier Customization**: Bybit P2P VIP tiers offer reduced maker fees (e.g. 0.25%, 0.15%, or 0.00%). The proposed UI allows full numerical customization with step 0.01% (defaulting to 0.30%).
2. **Dynamic Fintech Transfer Tiers**: Inter-bank fees can vary (e.g. ₦10 for transfers $< \text{₦}50,000$, ₦25/₦50 for higher amounts or EMTL stamp duty). The user can adjust the flat fee parameter freely in the UI.
3. **No Direct Source Modification**: This exploration provides complete analysis, HTML templates, CSS classes, and mathematical formulas in `analysis.md` without modifying source files directly.

---

## 4. Conclusion

1. **Pricing Assistant UI**:
   - Must add `input-platform-fee-pct` to the Arbitrage Settings card.
   - Must add a fee breakdown box displaying platform fee amount (₦/USDT), fiat fee per unit (₦/USDT), and effective cost/revenue basis.
   - Must add a net profit impact banner showing projected net trade profit (₦) and optimal minimum order limit recommendation ($\ge \text{₦}30,000$).
2. **Settings UI**:
   - Must add a "Trading Fees & Arbitrage Defaults" card (`#form-fee-defaults`) in `settings.view.js` for persistent configuration.
3. **Store & Reactivity**:
   - `store.js` must implement `getSettings()` and `saveSettings()` using `STORAGE_KEYS.SETTINGS`, mirroring values to individual `localStorage` pricing keys and notifying listeners via `store:updated`.

---

## 5. Verification Method

1. **Automated Unit Testing**:
   - Run the test suite:
     ```bash
     node test/run-tests.js --tier=1 --suite=pricing
     ```
   - Verify that all unit tests in `test/tier1-feature-coverage/pricing-engine.test.js` pass across ₦5k, ₦10k, ₦30k, ₦100k trade tiers.
2. **DOM & Settings Verification**:
   - Inspect `js/views/pricing.view.js` and `js/views/settings.view.js` to ensure all input IDs and target element IDs match the architectural specification in `analysis.md`.
3. **Reactivity Check**:
   - Updating fee defaults in Settings dispatches `store:updated` and immediately recalculates Buy/Sell rates, fee breakdowns, and profit projections in Pricing Assistant.
