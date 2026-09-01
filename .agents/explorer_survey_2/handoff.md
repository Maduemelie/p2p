# Handoff Report: Pricing Engine Math & Logic Survey

**Agent**: `explorer_survey_2`  
**Date**: 2026-09-01  
**Working Directory**: `c:\dev\p2p\.agents\explorer_survey_2`  
**Parent Conversation ID**: `9715ceef-643e-43fe-b45d-faeb52875532`

---

## 1. Observation

1. **Pure Mathematical Engine (`js/pricingEngine.js`)**:
   - `filterCompetitorAds` (`js/pricingEngine.js:14-39`): Excludes dust where quantity $< \max(2.0, \text{safeAvgVol} \times 0.05)$ and transaction limits where $\text{tradeAmount} < \text{minLmt}$ or $\text{tradeAmount} > \text{maxLmt}$.
   - `calculateReferencePrice` (`js/pricingEngine.js:47-82`): Implements `competitor` (top 1), `avg-N` (SMA), and `vwap-N` (VWAP) weighted by `lastQuantity`. Returns `0` when ads list is empty.
   - `calculateBuyPricing` (`js/pricingEngine.js:95-143`):
     - Exit price: $P_{\text{exit}} = \text{sortedSellAds}[0].\text{price}$
     - Inflow fee per unit: $\text{fee} = \text{inflowFee} / \text{safeAvgVol}$
     - Maximum Buy limit: $P_{\text{maxBuy}} = P_{\text{exit}} - \text{targetSpread} - \text{fee}$
     - Outbid recommendation: $P_{\text{rawSuggestedBuy}} = P_{\text{refBuy}} + 0.10$
     - Spread cap: $P_{\text{suggestedBuy}} = \min(P_{\text{rawSuggestedBuy}}, P_{\text{maxBuy}})$
     - Safety flag: $\text{isSafe} = P_{\text{rawSuggestedBuy}} \le P_{\text{maxBuy}}$
   - `calculateSellPricing` (`js/pricingEngine.js:156-220`):
     - Break-even price: $P_{\text{breakEven}} = \text{costBasis} + (\text{outflowFee} / \text{safeAvgVol})$
     - Target sell price: $P_{\text{targetSell}} = \text{costBasis} + \text{targetSpread} + (\text{outflowFee} / \text{safeAvgVol})$
     - Undercut recommendation: $P_{\text{rawSuggestedSell}} = P_{\text{refSell}} - 0.10$
     - Spread floor: $P_{\text{suggestedSell}} = \max(P_{\text{rawSuggestedSell}}, P_{\text{targetSell}})$
     - Safety flag: $\text{isSafe} = P_{\text{rawSuggestedSell}} \ge P_{\text{targetSell}}$

2. **Market Depth API Side Inversion (`server.js` and `api/market-depth.js`)**:
   - In `server.js:518-535` and `api/market-depth.js:17-33`:
     ```javascript
     const buyPayload = { tokenId: coin, currencyId: fiat, side: '1', page: '1', size: String(limit) };
     const sellPayload = { tokenId: coin, currencyId: fiat, side: '0', page: '1', size: String(limit) };
     ```
   - In Bybit OpenAPI: `side: 0` = Buy ads (merchant buys crypto), `side: 1` = Sell ads (merchant sells crypto).
   - `server.js:547-552` maps `buyDepth: buyRes.data...` and `sellDepth: sellRes.data...`, returning inverted lists.

3. **UI Badge Mismatch (`js/views/pricing.view.js`)**:
   - `js/views/pricing.view.js:154`:
     `<h3 class="card-title">Sell Ad Assistant <span class="badge badge-buy">Outflow</span></h3>`
     `badge-buy` applies green styling to a Sell/Outflow card badge.

4. **Testing Infrastructure & Coverage**:
   - Custom test runner at `test/harness/test-runner.js` executed via `node test/run-tests.js`.
   - 614 tests present across 5 tiers.
   - 0 unit tests exist specifically targeting `js/pricingEngine.js`.

---

## 2. Logic Chain

1. **Premise 1**: In Bybit P2P `/v5/p2p/item/online`, `side: '0'` corresponds to advertisements placed by merchants to buy crypto (displayed in the "Sell" tab for takers), and `side: '1'` corresponds to advertisements placed by merchants to sell crypto (displayed in the "Buy" tab for takers).
2. **Premise 2**: `server.js` and `api/market-depth.js` currently send `side: '1'` for `buyPayload` and `side: '0'` for `sellPayload`.
3. **Deduction 1**: Therefore, `cachedMarketDepth.buyDepth` contains Sell ads (asks) and `cachedMarketDepth.sellDepth` contains Buy ads (bids).
4. **Deduction 2**: Downstream in `js/pricing.js`, `buyAds` receives asks and `sellAds` receives bids, inverting order book sorting and feeding inverted competitor benchmark rates to `calculateBuyPricing` and `calculateSellPricing`.
5. **Premise 3**: In `js/pricingEngine.js`, the mathematical formulas for outbidding ($+0.10$), undercutting ($-0.10$), spread caps ($\min$), spread floors ($\max$), and per-unit fee amortizations are pure and mathematically correct assuming properly categorized input arrays.
6. **Deduction 3**: Correcting `side: '0'` for `buyPayload` and `side: '1'` for `sellPayload` will restore accurate market depth population and mathematical recommendations without altering the pure math equations in `pricingEngine.js`.

---

## 3. Caveats

- **External API Behavior**: Direct live calls to Bybit API require valid API keys or proxy configuration; offline fallback returns mock/empty depth.
- **Existing Snapshot/Reactivity Test Failures**: The 9 failing tests observed in the general test suite pertain to Snapshot history table delta recalculation (Milestone 4) and active ad status string formatting, not `pricingEngine.js` formulas.

---

## 4. Conclusion

1. The mathematical formulas in `js/pricingEngine.js` are valid, robust, and correctly implement outbidding, undercutting, spread protection, and break-even calculations.
2. The core bug causing inverted order books and corrupted pricing outputs is located in `server.js:518-535` and `api/market-depth.js:17-33` where `buyPayload` and `sellPayload` have inverted `side` values (`'1'` vs `'0'`).
3. Minor UI badge fix is needed in `js/views/pricing.view.js:154` (`badge-buy` $\rightarrow$ `badge-sell`).
4. A dedicated unit test suite for `js/pricingEngine.js` should be created in `test/tier1-feature-coverage/pricing-engine.test.js` to ensure 100% deterministic mathematical verification.

---

## 5. Verification Method

To independently verify:
1. **Source Inspection**:
   - Inspect `server.js:518-552` and `api/market-depth.js:17-52` to verify `side` values.
   - Inspect `js/pricingEngine.js:95-220` to verify mathematical formulas.
   - Inspect `js/views/pricing.view.js:154` to verify the badge class.
2. **Execute Test Suite**:
   ```powershell
   node test/run-tests.js
   ```
3. **Invalidation Condition**:
   - If Bybit OpenAPI documentation defines `side: 0` as Sell crypto and `side: 1` as Buy crypto, this conclusion would be invalidated. (Verified against Bybit V5 P2P OpenAPI specification: `side 0 = Buy crypto`, `side 1 = Sell crypto`).
