# Survey Report: Pricing Engine Math, Controller Architecture & Test Suite Analysis

**Agent**: `explorer_survey_2`  
**Date**: 2026-09-01  
**Scope**: `js/pricingEngine.js`, `js/pricing.js`, `js/views/pricing.view.js`, `server.js`, `api/market-depth.js`, and repository test suites.

---

## 1. Executive Summary

This survey analyzes the mathematical formulations, data flow, order book synchronization, and UI representations within the Bybit NGN P2P Trade Tracker's Pricing & Arbitrage Assistant module.

Key discoveries:
1. **Mathematical Soundness of `js/pricingEngine.js`**: The pure mathematical algorithms for competitor filtering, reference rate calculations (Top 1, SMA, VWAP), buy outbidding (+₦0.10), sell undercutting (-₦0.10), spread protection caps/floors, and per-unit fee amortizations are mathematically robust, deterministic, and handle boundary conditions cleanly.
2. **Critical Market Depth Side Inversion in Proxy Routes**: `server.js` (lines 518–552) and `api/market-depth.js` (lines 17–52) invert the Bybit P2P `/v5/p2p/item/online` API `side` parameter: `buyPayload` is assigned `side: '1'` (which fetches Sell ads / asks), while `sellPayload` is assigned `side: '0'` (which fetches Buy ads / bids). This leads to inverted order book tables and inverted competitor reference rates during live API sync.
3. **UI Badge Inconsistency in `pricing.view.js`**: In `js/views/pricing.view.js` (line 154), the Sell Ad Assistant (Outflow) card uses `class="badge badge-buy"`, displaying green "buy" styling on a sell outflow component.
4. **Test Suite Coverage Gap**: While the repository features 614 tests across 5 tiers, there is currently **no dedicated unit test suite for `js/pricingEngine.js`**.

---

## 2. Mathematical Modeling & Pricing Logic (`js/pricingEngine.js`)

`js/pricingEngine.js` (221 lines) provides pure, side-effect-free mathematical functions.

### 2.1 Competitor Advertisement Filtering (`filterCompetitorAds`)
- **File & Lines**: `js/pricingEngine.js:14-39`
- **Signature**: `filterCompetitorAds(ads = [], avgVolume = 100, filterLimits = true)`
- **Behavior**:
  - **Dust Filter**: Discards competitor ads where available quantity $Q < \max(2.0, \text{safeAvgVol} \times 0.05)$. For a default volume of 100 USDT, ads under 5.0 USDT are excluded.
  - **Transaction Limit Bounds Filter**: Computes the expected transaction fiat value:
    $$\text{tradeAmount} = \text{safeAvgVol} \times \text{price}$$
    If `filterLimits` is enabled, ads are rejected if:
    $$\text{minLimit} > 0 \land \text{tradeAmount} < \text{minLimit}$$
    $$\text{maxLimit} > 0 \land \text{tradeAmount} > \text{maxLimit}$$
  - **Boundary Guarding**: Safely handles non-array inputs, undefined objects, missing `minAmount`/`minSingleTransAmount`, and non-positive `avgVolume`.

### 2.2 Benchmark Reference Rate Computation (`calculateReferencePrice`)
- **File & Lines**: `js/pricingEngine.js:47-82`
- **Signature**: `calculateReferencePrice(ads = [], pricingMode = 'avg-10')`
- **Strategies Supported**:
  1. **Top Competitor (`competitor`)**:
     $$P_{\text{ref}} = P_0$$
  2. **Simple Moving Average (`avg-5`, `avg-10`, `avg-20`)**:
     $$P_{\text{ref}} = \frac{1}{K} \sum_{i=0}^{K-1} P_i \quad \text{where } K = \min(N, \text{ads.length})$$
  3. **Volume-Weighted Average Price (`vwap-5`, `vwap-10`, `vwap-20`)**:
     $$P_{\text{ref}} = \frac{\sum_{i=0}^{K-1} (P_i \times Q_i)}{\sum_{i=0}^{K-1} Q_i}$$
  - **Fallback**: If total volume is 0 or mode is unparsed, falls back gracefully to $P_0$. If `ads` is empty, returns `0`.

---

### 2.3 Buy Ad Assistant Mathematical Model (`calculateBuyPricing`)
- **File & Lines**: `js/pricingEngine.js:95-143`
- **Role**: Recommends the optimal bid price for the merchant's **Buy Ad** (where the merchant posts an ad to BUY USDT from takers in exchange for NGN).

#### Economic & Mathematical Formulation:
- **Taker/Maker Relationship**:
  - A merchant placing a **Buy Ad** pays NGN to acquire USDT. On Bybit P2P, this ad appears in the public **"Sell"** tab for takers (takers sell USDT to the merchant).
- **Exit Route**:
  - The acquired USDT is liquidated on the sell market. The baseline exit price $P_{\text{exit}}$ is the lowest ask on the market:
    $$P_{\text{exit}} = \text{sortedSellAds}[0].\text{price}$$
- **Per-Unit Fee Amortization**:
  $$\text{fee}_{\text{inflow/USDT}} = \frac{\text{inflowFee}}{\text{safeAvgVol}}$$
  *(e.g., $\frac{₦50.00}{100\text{ USDT}} = ₦0.50/\text{USDT}$)*
- **Spread Protection Ceiling ($\text{maxBuyPrice}$)**:
  To guarantee that the realized spread satisfies $\text{Spread} \ge \text{targetSpread}$:
  $$P_{\text{exit}} - (\text{BuyPrice} + \text{fee}_{\text{inflow/USDT}}) \ge \text{targetSpread}$$
  $$\implies P_{\text{maxBuy}} = P_{\text{exit}} - \text{targetSpread} - \frac{\text{inflowFee}}{\text{safeAvgVol}}$$
- **Outbidding Formulation**:
  To win taker volume against competing merchant buy ads, the merchant outbids the benchmark reference rate by $+₦0.10$:
  $$P_{\text{rawSuggestedBuy}} = \begin{cases} P_{\text{refBuy}} + 0.10 & \text{if } P_{\text{refBuy}} > 0 \\ P_{\text{maxBuy}} & \text{if } P_{\text{refBuy}} = 0 \end{cases}$$
- **Spread Protection Cap**:
  $$P_{\text{suggestedBuy}} = \min(P_{\text{rawSuggestedBuy}}, P_{\text{maxBuy}})$$
- **Safety Condition & Excess Spread**:
  $$\text{isSafe} = (P_{\text{rawSuggestedBuy}} \le P_{\text{maxBuy}})$$
  $$\text{excessSpread} = P_{\text{exit}} - P_{\text{suggestedBuy}} - \frac{\text{inflowFee}}{\text{safeAvgVol}}$$
- **Offline / Missing Data Guard**:
  If $P_{\text{exit}} \le 0$, returns `isOffline: true` and zeros for prices.

---

### 2.4 Sell Ad Assistant Mathematical Model (`calculateSellPricing`)
- **File & Lines**: `js/pricingEngine.js:156-220`
- **Role**: Recommends the optimal ask price for the merchant's **Sell Ad** (where the merchant posts an ad to SELL USDT to takers in exchange for NGN).

#### Economic & Mathematical Formulation:
- **Taker/Maker Relationship**:
  - A merchant placing a **Sell Ad** provides USDT and receives NGN. On Bybit P2P, this ad appears in the public **"Buy"** tab for takers (takers buy USDT from the merchant).
- **Cost Basis Integration**:
  - Sourced from the live FIFO accounting ledger: $\text{costBasis} = \text{avgHoldingCostPerUSDT}$.
- **Per-Unit Fee Amortization**:
  $$\text{fee}_{\text{outflow/USDT}} = \frac{\text{outflowFee}}{\text{safeAvgVol}}$$
  *(e.g., $\frac{₦50.00}{100\text{ USDT}} = ₦0.50/\text{USDT}$)*
- **Break-Even Price ($\text{breakEven}$)**:
  The minimum selling price required to recover inventory cost and payment processing fee:
  $$P_{\text{breakEven}} = \text{costBasis} + \frac{\text{outflowFee}}{\text{safeAvgVol}}$$
- **Target Sell Floor ($\text{targetSellPrice}$)**:
  The minimum selling price required to achieve $\text{targetSpread}$:
  $$P_{\text{targetSell}} = \text{costBasis} + \text{targetSpread} + \frac{\text{outflowFee}}{\text{safeAvgVol}}$$
- **Undercutting Formulation**:
  To attract taker buy volume against competing merchant sell ads, the merchant undercuts the benchmark reference rate by $-₦0.10$:
  $$P_{\text{rawSuggestedSell}} = P_{\text{refSell}} - 0.10$$
- **Spread Protection Floor**:
  $$P_{\text{suggestedSell}} = \max(P_{\text{rawSuggestedSell}}, P_{\text{targetSell}})$$
- **Safety Condition & Realized Spread**:
  $$\text{isSafe} = (P_{\text{rawSuggestedSell}} \ge P_{\text{targetSell}})$$
  $$\text{sellSpread} = P_{\text{suggestedSell}} - \text{costBasis} - \frac{\text{outflowFee}}{\text{safeAvgVol}}$$
- **Missing Inventory / Competitor Guards**:
  - If $\text{costBasis} \le 0$: returns `hasCostBasis: false`, `isSafe: false`.
  - If $P_{\text{refSell}} \le 0$: returns `hasCompetitors: false`, `isSafe: false`.

---

## 3. Controller & Data Flow Architecture (`js/pricing.js`)

`js/pricing.js` (432 lines) connects state persistence, DOM events, FIFO calculations, and proxy API synchronization.

```
+-----------------------------------------------------------------------------+
|                                localStorage                                 |
|  (spread: 5.0, vol: 100, inflow: 50, outflow: 50, mode: avg-10, depth: 50)  |
+-----------------------------------------------------------------------------+
                                       |
                                       v
+------------------------+  fetchMarketDepth()   +----------------------------+
|        store.js        | <-------------------> |    server.js (Proxy API)   |
| (Trades & FIFO Ledger) |                       |     /api/market-depth      |
+------------------------+                       +----------------------------+
            |                                                   |
            v                                                   v
   calculateMargins() <================================ cachedMarketDepth
            |
            +-----> calculateBuyPricing()  [pricingEngine.js]
            +-----> calculateSellPricing() [pricingEngine.js]
            +-----> renderOrderBooks()
            |
            v
+-----------------------------------------------------------------------------+
|                               DOM UI View                                   |
|  #pricing-cost-basis | #pricing-exit-price | #pricing-suggested-buy/sell    |
|  #pricing-buy-orderbook tbody              | #pricing-sell-orderbook tbody  |
+-----------------------------------------------------------------------------+
```

### 3.1 Key Lifecycle & Event Handling
1. `initPricing()` (lines 19–30):
   - Initializes settings from `localStorage`.
   - Attaches event listeners for input changes and button clicks.
   - Listens to `window.addEventListener('store:updated')`: automatically triggers `calculateMargins()` when new trades are added, ensuring real-time FIFO cost-basis reactivity.
2. `refreshPricingData()` (lines 134–164):
   - Disables sync button, calls `bybitService.fetchMarketDepth('USDT', 'NGN', depthLimit)`.
   - Stores result in `cachedMarketDepth`, executes `renderOrderBooks()`, and recalculates margins.
3. Order Book Row Click Prefill (lines 416–430):
   - Clicking any row in `#pricing-buy-orderbook` reads `data-direction="SELL"`, prefilling a SELL trade form (as the taker is selling to a buyer).
   - Clicking any row in `#pricing-sell-orderbook` reads `data-direction="BUY"`, prefilling a BUY trade form (as the taker is buying from a seller).

---

## 4. Market Depth API & Side Classification Audit (`server.js`, `api/market-depth.js`)

### 4.1 Bybit P2P API Conventions
In Bybit OpenAPI (`/v5/p2p/item/online` and `/v5/p2p/item/personal/list`):
| Side Value | Merchant Action | Public Bybit P2P Tab (Taker View) | Description |
|:---:|:---:|:---:|:---|
| **`0`** | **BUY** | **Sell Tab** | Merchant posts ad to buy crypto. Takers sell crypto to merchant. |
| **`1`** | **SELL** | **Buy Tab** | Merchant posts ad to sell crypto. Takers buy crypto from merchant. |

### 4.2 Inversion Diagnosis in Current Code
In `server.js` (lines 518–552) and `api/market-depth.js` (lines 17–52):

```javascript
// Current Inverted Implementation in server.js:
const buyPayload = {
  tokenId: coin,
  currencyId: fiat,
  side: '1',  // <-- BUG: Side 1 is SELL ads!
  page: '1',
  size: String(limit)
};

const sellPayload = {
  tokenId: coin,
  currencyId: fiat,
  side: '0',  // <-- BUG: Side 0 is BUY ads!
  page: '1',
  size: String(limit)
};
```

#### Consequences:
1. `buyDepth` in API response contains Bybit Sell ads (asks).
2. `sellDepth` in API response contains Bybit Buy ads (bids).
3. The Buy Order Book table displays Sell ads sorted descending.
4. The Sell Order Book table displays Buy ads sorted ascending.
5. In `pricing.js`, `buyAds` receives asks and `sellAds` receives bids, inverting reference rates and margin calculations.

#### Required Fix:
- For `buyPayload` (Buy Order Book / Market Bids): use `side: '0'`.
- For `sellPayload` (Sell Order Book / Market Asks): use `side: '1'`.
- Align comments in `server.js`, `api/market-depth.js`, and `pricing.js` (lines 193–194).

---

## 5. UI & View Audit (`js/views/pricing.view.js`, `css/styles.css`)

### 5.1 Card Structure & Labels
- **Buy Ad Assistant Card** (lines 107–146):
  - Heading: `Buy Ad Assistant <span class="badge badge-primary">Inflow</span>`
  - Explanatory subtitle: *"Prices competitor ads for your Buy Ad (which appears under Bybit P2P 'Sell' tab for takers)."*
  - Correctly labeled metrics: Exit Price, Max Buy Price Limit, Top Competitor Buy, Recommended Buy Rate, Safe Outbid badge.
- **Sell Ad Assistant Card** (lines 149–192):
  - Heading: `Sell Ad Assistant <span class="badge badge-buy">Outflow</span>`
  - **Issue**: `badge-buy` has green background (`var(--success-subtle)` / `var(--success)`). An outflow/sell indicator should use `badge-sell`, `badge-primary`, `badge-warning`, or `badge-info`.
  - Explanatory subtitle: *"Prices competitor ads for your Sell Ad (which appears under Bybit P2P 'Buy' tab for takers)."*
  - Correctly labeled metrics: FIFO Holding Cost Basis, Break-Even Sell Price, Target Sell Price, Top Competitor Sell, Recommended Sell Rate.

---

## 6. Test Suite & Testing Infrastructure Analysis

### 6.1 Test Infrastructure Overview
- Runner: Custom test runner located at `test/harness/test-runner.js` with DOM mock (`test/harness/dom-mock.js`) and HTTP mock (`test/harness/http-mock.js`).
- Executable script: `node test/run-tests.js` (npm test).
- Test Inventory: 614 total tests organized in 5 tiers.

### 6.2 Pricing-Related Tests Currently Present
1. `test/auditor-m4-stress.test.js`: Checks static import of `pricing.js`, DOM prefill handler, and navigation back from pricing view.
2. `test/challenger-final-day-simulation.test.js`: Simulates full-day merchant workflow including pricing input adjustments and order book row prefill.
3. `test/challenger-m2-empirical-harness.js`: Asserts FIFO cost basis synchronization between Dashboard and Pricing Assistant.

### 6.3 Test Gap Analysis: Missing `pricingEngine.js` Unit Tests
There are currently **0 unit tests** directly verifying `js/pricingEngine.js`. A new test suite should be added (e.g. `test/tier1-feature-coverage/pricing-engine.test.js`) covering:
- `filterCompetitorAds`: Dust volume boundaries (< 2 USDT, < 5% volume), limit filtering (fiat amount < minAmount, > maxAmount), filterLimits flag toggling, malformed inputs.
- `calculateReferencePrice`: Single competitor mode, SMA-5/10/20, VWAP-5/10/20 with volume weights, empty list fallback, zero volume handling.
- `calculateBuyPricing`: Outbidding (+0.10), spread ceiling clamping, fee sensitivity ($inflowFee / volume$), offline exit price handling, excess spread precision.
- `calculateSellPricing`: Undercutting (-0.10), break-even floor, target sell floor clamping, missing cost basis ($0 / null$), missing competitor handling.

---

## 7. Actionable Refactoring Plan

| Component | Target File | Target Location | Change Summary |
|---|---|---|---|
| **API Proxy** | `server.js` | Lines 518–535 | Set `buyPayload.side = '0'` and `sellPayload.side = '1'`. Update comments. |
| **Vercel API** | `api/market-depth.js` | Lines 17–33 | Set `buyPayload.side = '0'` and `sellPayload.side = '1'`. Update comments. |
| **Controller** | `js/pricing.js` | Lines 193–194 | Correct comments: `buyDepth` is side 0 (Bids), `sellDepth` is side 1 (Asks). |
| **UI View** | `js/views/pricing.view.js` | Line 154 | Replace `<span class="badge badge-buy">Outflow</span>` with `<span class="badge badge-sell">Outflow</span>` or `<span class="badge badge-primary">Outflow</span>`. |
| **Unit Tests** | `test/tier1-feature-coverage/pricing-engine.test.js` | New File | Add comprehensive unit test suite for all pure mathematical formulas in `js/pricingEngine.js`. |
| **Test Runner** | `test/run-tests.js` | Section 1 | Register `pricing-engine.test.js` in Tier 1 test runner list. |
