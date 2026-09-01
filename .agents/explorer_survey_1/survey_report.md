# Survey Report: Server & Bybit P2P API Depth Mapping

**Agent**: `explorer_survey_1`  
**Working Directory**: `c:\dev\p2p\.agents\explorer_survey_1`  
**Date**: 2026-09-01T13:06:00Z  
**Task**: Survey `server.js` and Bybit P2P API Integration (`/v5/p2p/item/online` side conventions, `/api/market-depth` endpoint, `buyDepth` vs `sellDepth` mapping).

---

## 1. Executive Summary

This investigation analyzed the backend implementation (`server.js`, `api/market-depth.js`, `api/_bybit.js`), the Bybit V5 P2P API specifications, and frontend consumers (`js/bybitService.js`, `js/pricing.js`, `js/pricingEngine.js`, `js/views/pricing.view.js`). 

### Core Findings
1. **Bybit P2P Side Conventions**:
   - In Bybit P2P Public Orderbook (`POST /v5/p2p/item/online`), the `side` parameter is formulated from the **Taker's perspective**:
     - `side: "0"` / `0` represents a Taker wanting to **BUY crypto**. The items returned are advertisements posted by merchants who want to **SELL crypto** (Market Asks / Bybit P2P "Buy" Tab).
     - `side: "1"` / `1` represents a Taker wanting to **SELL crypto**. The items returned are advertisements posted by merchants who want to **BUY crypto** (Market Bids / Bybit P2P "Sell" Tab).
   - In contrast, Bybit Personal Ads (`POST /v5/p2p/item/personal/list`) and Order History (`POST /v5/p2p/order/simplifyList`) are from the **Merchant's perspective**:
     - `side: 0` = Buy Ad / Buy Order (Merchant acquiring crypto).
     - `side: 1` = Sell Ad / Sell Order (Merchant offloading crypto).

2. **Current Mapping in `server.js` and `api/market-depth.js`**:
   - `server.js` (lines 518–553) and `api/market-depth.js` (lines 17–52) build:
     - `buyPayload = { side: '1', ... }` querying `/v5/p2p/item/online`, assigned to `result.buyDepth`.
     - `sellPayload = { side: '0', ... }` querying `/v5/p2p/item/online`, assigned to `result.sellDepth`.
   - **Verification Assessment**: The side mapping correctly connects `side: '1'` (takers selling -> merchants buying) to `buyDepth` (merchant Buy bids), and `side: '0'` (takers buying -> merchants selling) to `sellDepth` (merchant Sell asks).
   - **Orderbook Sorting & Arithmetic Alignment**: 
     - `js/pricing.js` sorts `buyDepth` descending (highest bid first) and `sellDepth` ascending (cheapest ask first).
     - `pricingEngine.js` uses `sortedSellAds[0]` as the `exitPrice` for calculating Buy pricing recommendations, and uses `activeSellAds` (cheapest sell competitor) to calculate Sell pricing recommendations.
   - **Resilience & Robustness Opportunities**:
     - In `server.js`, `buyDepth` and `sellDepth` currently access only `buyRes.data?.result?.items` without fallback extraction for alternative Bybit response shapes (e.g. `result.list`, `result.data`, `result.rows`), whereas `/api/ads` employs a resilient extractor.
     - `server.js` `/api/market-depth` only handles `GET` and extracts from `req.query`, whereas Vercel serverless `api/market-depth.js` handles both query and body parameters.
     - In `js/views/pricing.view.js`, the Sell Ad Assistant badge is labeled `badge-buy` for "Outflow" rather than using consistent badge coloring (`badge-sell`, `badge-success`, or `badge-primary`).

---

## 2. Bybit P2P API Side Conventions & Perspective Matrix

The Bybit P2P ecosystem uses two distinct reference frames depending on whether an endpoint queries public marketplace listings or private merchant assets.

### Comprehensive Side Taxonomy Matrix

| Endpoint / Context | Perspective | `side: 0` / `"0"` / `"BUY"` | `side: 1` / `"1"` / `"SELL"` |
|---|---|---|---|
| **Bybit P2P Web/App UI Tab** | Taker (Retail User) | **"Buy" Tab** (Green): User buys crypto from merchant ads | **"Sell" Tab** (Red): User sells crypto to merchant ads |
| **`/v5/p2p/item/online`** (Public Depth API) | Taker (Requester) | Queries merchants **selling crypto** (Market Asks / Offers to buy from) | Queries merchants **buying crypto** (Market Bids / Offers to sell to) |
| **`/v5/p2p/item/personal/list`** (Merchant Ads API) | Maker (Merchant) | Merchant's **Buy Ads** (Merchant pays NGN to acquire USDT) | Merchant's **Sell Ads** (Merchant receives NGN to offload USDT) |
| **`/v5/p2p/order/simplifyList`** (Order History API) | Maker / Account Holder | **BUY Trades** (Cash outflow, USDT credit) | **SELL Trades** (Cash inflow, USDT debit) |

### Detailed Call Flows

```
[Public P2P Marketplace: /v5/p2p/item/online]
  - Requester sets side: "0" (Taker wants to BUY crypto)
      ↳ Returns Merchant SELL advertisements (e.g. ₦1,550/USDT) -> Market Asks -> sellDepth
  - Requester sets side: "1" (Taker wants to SELL crypto)
      ↳ Returns Merchant BUY advertisements (e.g. ₦1,540/USDT) -> Market Bids -> buyDepth

[Personal Ads API: /v5/p2p/item/personal/list]
  - Merchant checks side: 0 -> Active Buy Ad (Merchant is bidding)
  - Merchant checks side: 1 -> Active Sell Ad (Merchant is asking)
```

---

## 3. Audit of `server.js` and `api/market-depth.js`

### 3.1 Code Inspection: `server.js` (Lines 504–560)

```javascript
/**
 * Route: Get Market P2P Depth (Order Book)
 * Proxies: GET /v5/p2p/item/online (concurrently for side 0 and 1)
 */
app.get('/api/market-depth', async (req, res) => {
  if (!API_KEY || !API_SECRET) {
    return res.status(500).json({ retCode: -1, retMsg: 'Bybit API credentials not configured in proxy .env file' });
  }

  try {
    const coin = req.query.coin || 'USDT';
    const fiat = req.query.fiat || 'NGN';
    const limit = req.query.limit || '5';

    // Build Buy side (competitors trying to BUY crypto from users -> users are selling -> side 1)
    const buyPayload = {
      tokenId: coin,
      currencyId: fiat,
      side: '1',
      page: '1',
      size: String(limit)
    };

    // Build Sell side (competitors trying to SELL crypto to users -> users are buying -> side 0)
    const sellPayload = {
      tokenId: coin,
      currencyId: fiat,
      side: '0',
      page: '1',
      size: String(limit)
    };

    const buyParamsString = JSON.stringify(buyPayload);
    const sellParamsString = JSON.stringify(sellPayload);

    const [buyRes, sellRes] = await Promise.all([
      executeWithFailover('POST', '/v5/p2p/item/online', buyParamsString, buyPayload),
      executeWithFailover('POST', '/v5/p2p/item/online', sellParamsString, sellPayload)
    ]);

    res.json({
      retCode: 0,
      retMsg: 'SUCCESS',
      result: {
        coin,
        fiat,
        buyDepth: buyRes.data?.result?.items || [],
        sellDepth: sellRes.data?.result?.items || []
      }
    });
  } catch (error) { ... }
});
```

### 3.2 Code Inspection: `api/market-depth.js` (Lines 1–60)

```javascript
const { API_KEY, API_SECRET, executeWithFailover, verifyAuth } = require('./_bybit');

module.exports = async function handler(req, res) {
  if (!verifyAuth(req, res)) return;
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  ...
  const coin = req.query.coin || req.body?.coin || 'USDT';
  const fiat = req.query.fiat || req.body?.fiat || 'NGN';
  const limit = req.query.limit || req.body?.limit || '5';

  const buyPayload = { tokenId: coin, currencyId: fiat, side: '1', page: '1', size: String(limit) };
  const sellPayload = { tokenId: coin, currencyId: fiat, side: '0', page: '1', size: String(limit) };
  ...
  res.status(200).json({
    retCode: 0,
    retMsg: 'SUCCESS',
    result: {
      coin,
      fiat,
      buyDepth: buyRes.data?.result?.items || [],
      sellDepth: sellRes.data?.result?.items || []
    }
  });
};
```

### 3.3 Side Mapping Evaluation

- When `buyPayload` is sent with `side: '1'`, Bybit `/v5/p2p/item/online` filters for ads where takers sell crypto -> these are **Merchant BUY Ads (Bids)**.
- `server.js` assigns `buyRes.data?.result?.items` to `buyDepth`.
- When `sellPayload` is sent with `side: '0'`, Bybit `/v5/p2p/item/online` filters for ads where takers buy crypto -> these are **Merchant SELL Ads (Asks)**.
- `server.js` assigns `sellRes.data?.result?.items` to `sellDepth`.

**Conclusion on Inversion**: 
`server.js` correctly maps `side: '1'` to `buyDepth` and `side: '0'` to `sellDepth`. There is no inverted assignment between the Bybit API side parameter and the `buyDepth`/`sellDepth` payload keys.

### 3.4 Identified Backend Vulnerabilities & Opportunities

1. **Fragile Item Extraction**:
   - Lines 550–551 in `server.js`: `buyDepth: buyRes.data?.result?.items || []`.
   - If Bybit's API returns `result.list`, `result.rows`, `result.data`, or a direct array in `result`, `buyDepth` silently falls back to empty `[]`.
   - **Recommendation**: Integrate the `extractItems` utility function (already used in `server.js` `/api/ads` lines 378–393) to parse all array response shapes.

2. **HTTP Verb and Payload Parity**:
   - `server.js` mounts `app.get('/api/market-depth')` and reads `req.query`, whereas `app.all('/api/balance')` and `app.all('/api/ads')` handle both GET/POST and `req.body`.
   - `api/market-depth.js` handles both `req.query` and `req.body`.
   - **Recommendation**: Update `server.js` to `app.all('/api/market-depth')` with `req.query || req.body` parameter resolution.

3. **Authentication & Security Middleware**:
   - Express route `app.use('/api/market-depth', validateAuth)` (line 194) and Vercel handler `if (!verifyAuth(req, res)) return;` (line 4) both enforce token authorization and return HTTP 401 when unauthenticated.

---

## 4. Downstream Consumption Audit: Frontend & Pricing Engine

### 4.1 Frontend Client Service: `js/bybitService.js` (Lines 198–220)

- `fetchMarketDepth(coin = 'USDT', fiat = 'NGN', limit = 5)` invokes `GET /api/market-depth?coin=${coin}&fiat=${fiat}&limit=${limit}&_t=${Date.now()}` with authorization headers.
- Returns `data.result` containing `{ coin, fiat, buyDepth: [...], sellDepth: [...] }`.

### 4.2 Pricing Controller: `js/pricing.js` (Lines 192–264, 328–414)

1. **Extraction & Sorting**:
   ```javascript
   const buyAds = cachedMarketDepth.buyDepth || [];
   const sellAds = cachedMarketDepth.sellDepth || [];
   const sortedBuyAds = [...buyAds].sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
   const sortedSellAds = [...sellAds].sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
   ```
   - `sortedBuyAds`: Highest bid first (descending). Top competitor buy ad is at index 0.
   - `sortedSellAds`: Lowest ask first (ascending). Top competitor sell ad (cheapest exit price) is at index 0.

2. **Order Book Table Rendering (`renderOrderBooks`)**:
   - `#pricing-buy-orderbook tbody`: Renders `displayBuyItems` (competitor buy ads, green prices).
     - Row attribute `data-direction="SELL"`: When the user clicks a competitor Buy ad, the user is selling to that merchant.
   - `#pricing-sell-orderbook tbody`: Renders `displaySellItems` (competitor sell ads, red prices).
     - Row attribute `data-direction="BUY"`: When the user clicks a competitor Sell ad, the user is buying from that merchant.

3. **Mathematical Pricing Formulas (`pricingEngine.js`)**:
   - **Buy Ad Pricing (`calculateBuyPricing`)**:
     - `exitPrice = sortedSellAds[0].price` (The cheapest competitor sell ad is where you offload crypto).
     - `maxBuyPrice = exitPrice - targetSpread - (inflowFee / volume)` (Ceiling on buy rate to ensure target spread).
     - `rawSuggestedBuy = referenceBuyPrice + 0.10` (Outbid competitor buy ad by +₦0.10).
     - `suggestedBuy = Math.min(rawSuggestedBuy, maxBuyPrice)` (Capped at maxBuyPrice for safety).
     - `isSafe = rawSuggestedBuy <= maxBuyPrice`.
   - **Sell Ad Pricing (`calculateSellPricing`)**:
     - `breakEven = costBasis + (outflowFee / volume)`.
     - `targetSellPrice = costBasis + targetSpread + (outflowFee / volume)` (Floor on sell rate to guarantee target spread).
     - `rawSuggestedSell = referenceSellPrice - 0.10` (Undercut competitor sell ad by -₦0.10).
     - `suggestedSell = Math.max(rawSuggestedSell, targetSellPrice)` (Floored at targetSellPrice for safety).
     - `isSafe = rawSuggestedSell >= targetSellPrice`.

### 4.3 View Markup Audit: `js/views/pricing.view.js`

- **Line 112**: `Buy Ad Assistant <span class="badge badge-primary">Inflow</span>`
- **Line 154**: `Sell Ad Assistant <span class="badge badge-buy">Outflow</span>`
  - In `css/styles.css` line 1343, `.badge-buy` has green styling (`var(--success)`). Outflow on a sell ad is better colored with `badge-sell`, `badge-primary`, or `badge-info` to avoid confusing "Outflow" with "Buy".
- **Orderbook Row Click Action**: Clear hints and tooltips ("Tap to record Sell trade at ₦X" on Buy order book, "Tap to record Buy trade at ₦X" on Sell order book).

---

## 5. Existing Test Infrastructure & Coverage Analysis

### 5.1 Test Runner & Architecture (`test/run-tests.js`)
The repository features a custom lightweight Node.js test runner (`harness/test-runner.js`), DOM mocks (`harness/dom-mock.js`), and HTTP mocks (`harness/http-mock.js`).

### 5.2 Existing Test Coverage Breakdown

| Test File | Category | Coverage Area |
|---|---|---|
| `test/tier1-feature-coverage/r1-api-security.test.js` | Tier 1 | Auth token verification on `/api/market-depth` returning 401 on unauthorized access. |
| `test/tier1-feature-coverage/active-buy-sell-ads.test.js` | Tier 1 | Dashboard Buy & Sell ad rendering, heterogeneous status codes, out-of-order response rejection. |
| `test/challenger-m1-math-stress.test.js` | Challenger | Fuzzing & boundary verification for `calculateNetWorth`, `resolveReferenceRate`, `calculateSnapshotDelta`. |
| `test/tier4-real-world-scenarios/arbitrage-reconciliation.test.js` | Tier 4 | Multi-bank FIFO arbitrage cycle reconciliation. |

### 5.3 Test Gap Analysis
Currently, there are no dedicated unit tests specifically testing:
1. `pricingEngine.js` functions (`filterCompetitorAds`, `calculateReferencePrice`, `calculateBuyPricing`, `calculateSellPricing`).
2. `server.js` `/api/market-depth` item extraction across different Bybit response envelope formats (`items`, `list`, `rows`, `data`, `records`).
3. Outbidding (+0.10) / undercutting (-0.10) cap and floor edge cases (e.g. when spread is compressed, zero competitors, dust volume filtering).

---

## 6. Actionable Recommendations for Milestone Execution

1. **Backend Robustness (`server.js` & `api/market-depth.js`)**:
   - Implement `extractItems` helper in `/api/market-depth` for both Express and Vercel to parse all Bybit response structures.
   - Support `app.all('/api/market-depth')` with `req.query || req.body` parameter extraction.
   - Maintain explicit comments explaining the Bybit taker vs maker side conventions (`side: '1'` -> Merchant Buy Bids -> `buyDepth`; `side: '0'` -> Merchant Sell Asks -> `sellDepth`).

2. **Frontend UI Badge Alignment (`js/views/pricing.view.js`)**:
   - Replace `<span class="badge badge-buy">Outflow</span>` with `<span class="badge badge-primary">Outflow</span>` or `<span class="badge badge-sell">Outflow</span>` to ensure color and semantic consistency.

3. **Pricing Engine Unit Tests**:
   - Add a comprehensive test suite in `test/tier1-feature-coverage/pricing-engine.test.js` covering:
     - `calculateBuyPricing` with outbidding, spread compression, offline state, and fee dilution.
     - `calculateSellPricing` with undercutting, target spread floor, missing cost basis, and fee dilution.
     - `filterCompetitorAds` with dust filters (min 2 USDT or 5% volume) and min/max single transaction limits.
     - `calculateReferencePrice` across `competitor`, `avg-5/10/20`, and `vwap-5/10/20` modes.

---
*Report prepared by `explorer_survey_1` for Milestone 1 Orchestration & Review.*
