# Handoff Report — Explorer Survey 1: Server & Bybit P2P API Depth Mapping

**Agent**: `explorer_survey_1`  
**Working Directory**: `c:\dev\p2p\.agents\explorer_survey_1`  
**Parent Agent**: `9715ceef-643e-43fe-b45d-faeb52875532` (`orchestrator_1`)  
**Date**: 2026-09-01T13:07:00Z  
**Type**: Hard Handoff (Task Complete)

---

## 1. Observation

1. **`server.js` (lines 504–560) & `api/market-depth.js` (lines 1–60)**:
   - In `/api/market-depth`, `buyPayload` is constructed as:
     ```javascript
     const buyPayload = {
       tokenId: coin,
       currencyId: fiat,
       side: '1',
       page: '1',
       size: String(limit)
     };
     ```
     and assigned to `result.buyDepth: buyRes.data?.result?.items || []`.
   - `sellPayload` is constructed as:
     ```javascript
     const sellPayload = {
       tokenId: coin,
       currencyId: fiat,
       side: '0',
       page: '1',
       size: String(limit)
     };
     ```
     and assigned to `result.sellDepth: sellRes.data?.result?.items || []`.
   - The route is protected by `validateAuth` middleware mounted at line 194 (`app.use('/api/market-depth', validateAuth)`), returning HTTP 401 when unauthorized.

2. **Bybit V5 P2P API Endpoint Perspective Specifications**:
   - `/v5/p2p/item/online` (Public Order Book API):
     - `side: "0"` / `0`: Taker is BUYING crypto -> Returns advertisements of merchants who are **SELLING crypto** (Market Asks / Bybit P2P "Buy" Tab).
     - `side: "1"` / `1`: Taker is SELLING crypto -> Returns advertisements of merchants who are **BUYING crypto** (Market Bids / Bybit P2P "Sell" Tab).
   - `/v5/p2p/item/personal/list` (Personal Ads API):
     - `side: 0` = Buy Ad (merchant buying crypto).
     - `side: 1` = Sell Ad (merchant selling crypto).
   - `/v5/p2p/order/simplifyList` (Order History API):
     - `side: 0` = BUY order.
     - `side: 1` = SELL order.

3. **`js/pricing.js` (lines 193–220, 331–413)**:
   - `buyAds` are taken from `cachedMarketDepth.buyDepth` and sorted descending (`b.price - a.price`), populating `#pricing-buy-orderbook` with highest bid first.
   - `sellAds` are taken from `cachedMarketDepth.sellDepth` and sorted ascending (`a.price - b.price`), populating `#pricing-sell-orderbook` with lowest ask first.
   - Orderbook row clicks attach `data-direction="SELL"` on the Buy book and `data-direction="BUY"` on the Sell book for trade recording.

4. **`js/pricingEngine.js` (lines 95–220)**:
   - `calculateBuyPricing` uses `sortedSellAds[0]` as `exitPrice`, outbids `referenceBuyPrice` by +₦0.10, and caps at `maxBuyPrice = exitPrice - targetSpread - (inflowFee / volume)`.
   - `calculateSellPricing` uses `costBasis` (from FIFO) and `outflowFee`, undercuts `referenceSellPrice` by -₦0.10, and floors at `targetSellPrice = costBasis + targetSpread + (outflowFee / volume)`.

5. **`js/views/pricing.view.js` (lines 112, 154)**:
   - Line 112: `Buy Ad Assistant <span class="badge badge-primary">Inflow</span>`
   - Line 154: `Sell Ad Assistant <span class="badge badge-buy">Outflow</span>` (`badge-buy` has green text/bg despite representing Sell Outflow).

6. **Test Suite Status (`test/run-tests.js`)**:
   - Security middleware is tested in `test/tier1-feature-coverage/r1-api-security.test.js`.
   - FIFO accounting is tested in `test/tier1-feature-coverage/r2-fifo-accounting.test.js` and `test/tier4-real-world-scenarios/arbitrage-reconciliation.test.js`.
   - No direct unit tests currently exist for `pricingEngine.js` or `server.js` `/api/market-depth` response envelope shapes.

---

## 2. Logic Chain

1. **Premise 1**: In `/v5/p2p/item/online`, Bybit filters ads by the taker's action (`side: '1'` is taker selling -> merchant buying; `side: '0'` is taker buying -> merchant selling).
2. **Premise 2**: In `server.js` and `api/market-depth.js`, `buyPayload` specifies `side: '1'` and assigns the response to `buyDepth`. `sellPayload` specifies `side: '0'` and assigns the response to `sellDepth`.
3. **Inference 1**: `buyDepth` accurately receives merchant BUY ads (bids) and `sellDepth` accurately receives merchant SELL ads (asks). The side assignment in `server.js` is correct and not inverted.
4. **Premise 3**: In `pricing.js` and `pricingEngine.js`, the buy pricing simulator calculates how to outbid competitor buy ads (`buyDepth`) while ensuring exit price (`sellDepth[0]`) leaves sufficient margin after fees and target spread. The sell pricing simulator calculates how to undercut competitor sell ads (`sellDepth`) while ensuring the price does not drop below FIFO cost basis + target spread + fees.
5. **Inference 2**: The arithmetic relationships between `buyDepth`, `sellDepth`, FIFO cost basis, and order book tables are conceptually sound, but backend payload extraction in `server.js` should be made resilient against API schema variations (`result.list`, `result.rows`, `result.data`), and the UI badge color on Sell Ad Assistant (`badge-buy`) should be corrected.

---

## 3. Caveats

- **Caveat 1**: Live Bybit API requests require active network connectivity and valid Bybit API credentials. Static analysis and mock environments were used to confirm structure and behavior.
- **Caveat 2**: Bybit may return empty arrays or throttle if rate limits are exceeded; fallback handling in frontend (`pricing.js`) prevents UI crashing when depth is empty.

---

## 4. Conclusion

1. **Side Mapping Status**: The side conventions in `server.js` and `api/market-depth.js` (`side: '1'` -> `buyDepth`, `side: '0'` -> `sellDepth`) are verified accurate according to Bybit V5 P2P API specifications.
2. **Backend Improvements**:
   - Add resilient response parsing (`extractItems`) in `server.js` and `api/market-depth.js`.
   - Support `app.all('/api/market-depth')` with `req.query || req.body` parameter resolution.
3. **UI Improvements**:
   - Fix badge class in `js/views/pricing.view.js` line 154 from `badge-buy` to `badge-primary` / `badge-sell`.
4. **Test Infrastructure**:
   - Add a unit test suite for `js/pricingEngine.js` (`filterCompetitorAds`, `calculateReferencePrice`, `calculateBuyPricing`, `calculateSellPricing`).

---

## 5. Verification Method

1. **Codebase Inspection**:
   - Inspect `server.js` (lines 504–560) and `api/market-depth.js` (lines 1–60) to verify payload side parameters.
   - Inspect `js/pricing.js` (lines 193–220) and `js/pricingEngine.js` (lines 95–220) to trace orderbook consumption.
2. **Run Test Suite**:
   - Run `node test/run-tests.js` to ensure all existing security, accounting, and lifecycle tests pass.
3. **Invalidation Conditions**:
   - If Bybit `/v5/p2p/item/online` with `side: '1'` returned merchant sell ads rather than buy ads, `buyDepth` would contain asks rather than bids.
   - If `node test/run-tests.js` fails with unhandled exceptions.
