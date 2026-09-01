# Specification Mining & UI Survey Report: Pricing & Arbitrage Assistant

**Author**: `spec_miner_survey_1`  
**Date**: 2026-09-01  
**Scope**: `ORIGINAL_REQUEST.md`, `js/views/pricing.view.js`, `js/pricing.js`, `js/pricingEngine.js`, `server.js`, `api/market-depth.js`, and Design System.

---

## Executive Summary

This report formalizes the complete specification inventory and UI/view architecture for the **Pricing & Arbitrage Assistant** refactoring project. It addresses the four core requirements (**R1–R4**):
1. **R1**: Market Depth & Bybit P2P `/v5/p2p/item/online` Side Classification and `/api/market-depth` Mapping.
2. **R2**: Arbitrage Mathematical Modeling, Spread Protection, and Outbidding/Undercutting Strategy.
3. **R3**: UI/View Architecture, Card Hierarchies, Table Layouts, Badge System, and Taker/Maker Perspective Labels.
4. **R4**: Verification Protocol, Acceptance Criteria, and Deterministic Automated Test Coverage.

---

## 1. Requirement Inventory & Specification Breakdown (R1 – R4)

### R1. Market Depth & Side Classification Specification
- **Bybit API Contract (`/v5/p2p/item/online`)**:
  - **`side: 0` (or `"0"`)**: Represents competitor **Buy Ads** (advertisers buying crypto from users). In Bybit's user-facing web/app UI, these ads appear under the **"Sell"** tab (where retail takers sell their crypto to the advertiser). This dataset constitutes `buyDepth` (Market Bids).
  - **`side: 1` (or `"1"`)**: Represents competitor **Sell Ads** (advertisers selling crypto to users). In Bybit's user-facing web/app UI, these ads appear under the **"Buy"** tab (where retail takers buy crypto from the advertiser). This dataset constitutes `sellDepth` (Market Asks).
- **Observed Defect in `server.js` and `api/market-depth.js`**:
  - In `server.js` (lines 518–534) and `api/market-depth.js` (lines 17–34), `buyPayload` was assigned `side: '1'` and `sellPayload` was assigned `side: '0'`.
  - Consequently, `buyDepth` received competitor sell ads (`side: 1`) and `sellDepth` received competitor buy ads (`side: 0`), resulting in inverted orderbooks and corrupted arbitrage pricing math.
- **Specification Correction**:
  - `buyPayload`: `side: '0'` -> maps to `result.buyDepth`.
  - `sellPayload`: `side: '1'` -> maps to `result.sellDepth`.

### R2. Arbitrage Math & Strategy Specification
- **Buy Pricing Engine (`calculateBuyPricing`)**:
  - **Goal**: Price the merchant's Buy Ad (+₦0.10 outbid above reference buy rate) to acquire USDT while guaranteeing that the profit margin meets or exceeds `targetSpread` upon exit at the cheapest competitor sell rate.
  - **Inputs**: `activeBuyAds`, `sortedSellAds`, `targetSpread`, `inflowFee`, `avgVolume`, `pricingMode`.
  - **Formulas**:
    $$\text{exitPrice} = \text{sortedSellAds}[0]?.price$$
    $$\text{effectiveInflowFee} = \frac{\text{inflowFee}}{\text{avgVolume}}$$
    $$\text{maxBuyPrice} = \text{exitPrice} - \text{targetSpread} - \text{effectiveInflowFee}$$
    $$\text{rawSuggestedBuy} = \text{referenceBuyPrice} + 0.10 \quad (\text{or } \text{maxBuyPrice} \text{ if no ads})$$
    $$\text{suggestedBuy} = \min(\text{rawSuggestedBuy}, \text{maxBuyPrice})$$
    $$\text{isSafe} = (\text{rawSuggestedBuy} \le \text{maxBuyPrice})$$
    $$\text{excessSpread} = \text{exitPrice} - \text{suggestedBuy} - \text{effectiveInflowFee}$$
- **Sell Pricing Engine (`calculateSellPricing`)**:
  - **Goal**: Price the merchant's Sell Ad (-₦0.10 undercut below reference sell rate) to liquidate USDT while guaranteeing that the net sale price stays at or above `targetSellPrice` (cost basis + target spread + outflow fee).
  - **Inputs**: `activeSellAds`, `costBasis`, `targetSpread`, `outflowFee`, `avgVolume`, `pricingMode`.
  - **Formulas**:
    $$\text{effectiveOutflowFee} = \frac{\text{outflowFee}}{\text{avgVolume}}$$
    $$\text{breakEven} = \text{costBasis} + \text{effectiveOutflowFee}$$
    $$\text{targetSellPrice} = \text{costBasis} + \text{targetSpread} + \text{effectiveOutflowFee}$$
    $$\text{rawSuggestedSell} = \text{referenceSellPrice} - 0.10$$
    $$\text{suggestedSell} = \max(\text{rawSuggestedSell}, \text{targetSellPrice})$$
    $$\text{isSafe} = (\text{rawSuggestedSell} \ge \text{targetSellPrice})$$
    $$\text{sellSpread} = \text{suggestedSell} - \text{costBasis} - \text{effectiveOutflowFee}$$
- **Reference Rate Strategies (`calculateReferencePrice`)**:
  - `competitor`: Top rank price (`ads[0].price`).
  - `avg-N` ($N \in \{5, 10, 20\}$): Simple Arithmetic Mean of top $N$ ads: $\frac{1}{N} \sum_{i=1}^N P_i$.
  - `vwap-N` ($N \in \{5, 10, 20\}$): Volume-Weighted Average Price of top $N$ ads: $\frac{\sum_{i=1}^N (P_i \times Q_i)}{\sum_{i=1}^N Q_i}$.

### R3. UI & Label Consistency Specification
- **Card Layout**:
  - Header: View title, subtitle, refresh button (`#btn-refresh-market-depth`).
  - Settings Card: 7 interactive inputs (Target Spread, Target Volume, Inflow Fee, Outflow Fee, Calculation Mode, Sync Limit, Limit Filter Checkbox).
  - Dual Simulators: Left Card = Buy Ad Assistant (Inflow), Right Card = Sell Ad Assistant (Outflow).
  - Dual Order Books: Left Card = Buy Order Book (Market Bids, 10 rows), Right Card = Sell Order Book (Market Asks, 10 rows).
- **Badge & Color System**:
  - `badge-primary` (Blue): Capital Inflow / Buy Ad Assistant card header badge.
  - `badge-success` (Green): Safe to Outbid / Safe to Undercut status badges; Buy Order Book price column (`text-success`).
  - `badge-danger` (Red): Spread Compressed / Below Target Spread status badges; Sell Order Book price column (`text-danger`).
  - `badge-warning` (Amber): Target sell price highlight (`text-warning`); Capped/floored suggested rates (`text-warning`).
  - `badge-neutral` (Gray): Offline / Empty status indicators.
  - **Defect Identified**: `pricing.view.js` line 154 used `<span class="badge badge-buy">Outflow</span>` on the Sell Ad Assistant card. In the CSS design system, `badge-buy` resolves to green (`--success`), conflicting with outflow semantics. It should use `badge-primary`, `badge-success`, or aligned semantic styling.
- **Taker vs Maker Perspective Clarification**:
  - **Merchant Maker Buy Ad**: Appears under Bybit P2P **"Sell"** tab for retail takers. Merchant acquires USDT.
  - **Merchant Maker Sell Ad**: Appears under Bybit P2P **"Buy"** tab for retail takers. Merchant liquidates USDT.
  - **Order Book Row Click Interaction**:
    - Clicking a row in **Buy Order Book** (`#pricing-buy-orderbook`): The counterparty is a buyer; clicking triggers a **SELL** trade pre-fill (`data-direction="SELL"`).
    - Clicking a row in **Sell Order Book** (`#pricing-sell-orderbook`): The counterparty is a seller; clicking triggers a **BUY** trade pre-fill (`data-direction="BUY"`).

### R4. Verification & Testing Specification
- **Automated Verification Harness**:
  - Unit tests for pure mathematical functions in `js/pricingEngine.js`.
  - Integration tests for `/api/market-depth` payload mapping in `server.js` and `api/market-depth.js`.
  - DOM rendering tests for `pricing.view.js` and `pricing.js` in simulated DOM (`harness/dom-mock.js`).
  - 100% deterministic assertion coverage for outbidding/undercutting capping and flooring rules.

---

## 2. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Market Depth API | `/api/market-depth` Proxy Endpoint | Queries Bybit `/v5/p2p/item/online` for both Buy and Sell order books concurrently | `coin`, `fiat`, `limit`, Auth Token | JSON with `{ buyDepth: [], sellDepth: [] }` | Returns 401 if unauthorized, 500 on Bybit error | `server.js:508`, `api/market-depth.js:3` |
| 2 | Market Depth API | Side 0 Classification | Fetches public ads where merchants are buying crypto (retail takers selling) | `tokenId: 'USDT'`, `currencyId: 'NGN'`, `side: '0'` | Array of ad objects for Buy Depth | Returns empty array if none online | `ORIGINAL_REQUEST.md:17`, `server.js:520` |
| 3 | Market Depth API | Side 1 Classification | Fetches public ads where merchants are selling crypto (retail takers buying) | `tokenId: 'USDT'`, `currencyId: 'NGN'`, `side: '1'` | Array of ad objects for Sell Depth | Returns empty array if none online | `ORIGINAL_REQUEST.md:17`, `server.js:528` |
| 4 | Arbitrage Engine | `filterCompetitorAds` | Filters out dust ads (< 2 USDT or < 5% vol) and ads outside volume limits | `ads`, `avgVolume`, `filterLimits` | Cleaned array of competitive ads | Returns `[]` if `ads` is not array or invalid | `js/pricingEngine.js:14` |
| 5 | Arbitrage Engine | `calculateReferencePrice` (Competitor) | Returns the top rank competitor ad price | `ads`, `pricingMode='competitor'` | Float price of `ads[0]` | Returns 0 if empty | `js/pricingEngine.js:47` |
| 6 | Arbitrage Engine | `calculateReferencePrice` (SMA-N) | Computes simple arithmetic average of top N ads (5, 10, 20) | `ads`, `pricingMode='avg-5'\|'avg-10'\|'avg-20'` | Arithmetic mean of top N prices | Returns 0 if empty | `js/pricingEngine.js:66` |
| 7 | Arbitrage Engine | `calculateReferencePrice` (VWAP-N) | Computes volume-weighted average price of top N ads (5, 10, 20) | `ads`, `pricingMode='vwap-5'\|'vwap-10'\|'vwap-20'` | Weighted mean $\frac{\sum P \cdot Q}{\sum Q}$ | Falls back to SMA if total quantity is 0 | `js/pricingEngine.js:69` |
| 8 | Arbitrage Engine | `calculateBuyPricing` | Calculates recommended Buy ad rate (+₦0.10 outbid) capped at max buy price | `activeBuyAds`, `sortedSellAds`, `targetSpread`, `inflowFee`, `avgVolume`, `pricingMode` | `{ exitPrice, maxBuyPrice, suggestedBuy, isSafe, excessSpread, isOffline }` | Returns `isOffline: true` if exit price $\le 0$ | `js/pricingEngine.js:95` |
| 9 | Arbitrage Engine | `calculateSellPricing` | Calculates recommended Sell ad rate (-₦0.10 undercut) floored at target sell price | `activeSellAds`, `costBasis`, `targetSpread`, `outflowFee`, `avgVolume`, `pricingMode` | `{ breakEven, targetSellPrice, suggestedSell, isSafe, sellSpread, hasCostBasis, hasCompetitors }` | Returns `hasCostBasis: false` if cost basis $\le 0$ | `js/pricingEngine.js:145` |
| 10 | Pricing Controller | `loadSavedSettings` / `saveSettings` | Persists all 7 pricing preferences to `localStorage` | DOM input events (`change`, `input`) | Saved keys prefixed with `bybit_p2p_pricing_*` | Uses fallback defaults if localStorage empty | `js/pricing.js:35,64` |
| 11 | Pricing Controller | `refreshPricingData` | Triggers proxy sync, updates button UI state ("Syncing..."), calls `renderOrderBooks` and `calculateMargins` | Click event on `#btn-refresh-market-depth` or auto-init | Populates DOM tables and cards | Shows error toast if proxy unreachable | `js/pricing.js:134` |
| 12 | Pricing Controller | Dynamic FIFO Integration | Listens to `window` `store:updated` event to re-evaluate cost basis and margins reactively | `store:updated` custom event | Updated cost basis and sell margins | Uses opening inventory default cost basis if no trades | `js/pricing.js:25,183` |
| 13 | UI View | Copy Suggested Rates | Copies suggested buy/sell rate directly to OS clipboard | Click on `#btn-copy-buy-price` or `#btn-copy-sell-price` | Rate in clipboard + Toast notification | Ignored if rate is `₦0.00` or `—` | `js/pricing.js:112,121` |
| 14 | UI View | Order Book Row Click Prefill | Clicking any order book row pre-populates Trade form with counterparty, rate, and volume | Click on `.orderbook-row` | Calls `window.prefillTradeForm({ direction, rate, usdtAmount, counterparty })` | Falls back to clipboard copy if prefill unavailable | `js/pricing.js:416` |
| 15 | UI View | Dynamic Reference Price Labels | Updates label text to reflect active mode (`Top Competitor Buy:`, `Avg Competitor Buy (Top 10):`, `VWAP Buy (Top 10):`) | `pricingMode` selection | Dynamic DOM text content | Defaults to Top Competitor | `js/pricing.js:230,282` |

---

## 3. Edge Cases & Boundary Conditions

| # | Feature | Input / Condition | Observed Behavior & Handling |
|---|---------|-------------------|------------------------------|
| 1 | `calculateBuyPricing` | Empty `sortedSellAds` (No competitor sell ads online) | `exitPrice` evaluates to 0. Function returns `isOffline: true`, `suggestedBuy: 0`, and UI displays `—` with `badge-neutral` ("Offline"). |
| 2 | `calculateBuyPricing` | Empty `activeBuyAds` (No competitor buy ads online) | `referenceBuyPrice` evaluates to 0. `rawSuggestedBuy` falls back to `maxBuyPrice`, allowing merchant to place maximum safe bid without division by zero or NaN. |
| 3 | `calculateBuyPricing` | Aggressive Competitor Outbidding (`rawSuggestedBuy > maxBuyPrice`) | `suggestedBuy` is capped at `maxBuyPrice`. `isSafe` is `false`. UI renders `badge-danger` ("🔴 Spread Compressed (Capped for Spread)") and amber price text. |
| 4 | `calculateSellPricing` | Zero or Negative `costBasis` (No inventory or uninitialized store) | Returns `hasCostBasis: false`. UI renders `—` across Break-Even, Target Sell, and Suggested Sell with `badge-neutral` ("No inventory costs found"). |
| 5 | `calculateSellPricing` | Empty `activeSellAds` (No competitor sell ads online) | Returns `hasCompetitors: false`. Break-even and Target Sell prices are rendered accurately from cost basis, but suggested sell displays `—` with `badge-neutral` ("No active competitors"). |
| 6 | `calculateSellPricing` | Aggressive Competitor Undercutting (`rawSuggestedSell < targetSellPrice`) | `suggestedSell` is floored at `targetSellPrice`. `isSafe` is `false`. UI renders `badge-danger` ("🔴 Below Target Spread (Floored for Spread)") and amber price text. |
| 7 | `filterCompetitorAds` | Dust Ads with `lastQuantity < Math.max(2, avgVolume * 0.05)` | Dust ads (e.g. 0.5 USDT) are filtered out to prevent skewing average prices and outbidding fake ads. |
| 8 | `filterCompetitorAds` | Large volume trade exceeding `maxSingleTransAmount` | When `filterLimits: true`, ad is rejected if `avgVolume * price > maxLmt`, ensuring merchant only benchmarks against ads capable of fulfilling target order size. |
| 9 | `calculateReferencePrice` | Zero Total Volume in VWAP Calculation ($\sum Q_i = 0$) | Falls back to arithmetic top ad price (`parseFloat(subset[0].price) || 0`) preventing `0 / 0 = NaN`. |
| 10 | `renderOrderBooks` | Zero Ads Available in `buyDepth` or `sellDepth` | Renders a single clean row: `<tr><td colspan="3" class="text-center py-3 text-muted">No Buy ads online</td></tr>`. |
| 11 | `renderOrderBooks` | Ads with missing `nickName`, `memberName`, or `userId` | Falls back gracefully to `'Advertiser'` with `escapeHtml` protection against XSS. |
| 12 | Settings Inputs | Target Volume set to 0, negative, or non-numeric (`NaN`) | `safeAvgVol` defaults safely to `100.0` USDT, preventing division by zero when calculating fee impact (`fee / safeAvgVol`). |

---

## 4. UI Structure & Element ID Registry

| Container Card | Element Type | DOM ID | Function / Purpose | CSS Classes |
|----------------|--------------|--------|-------------------|-------------|
| **View Header** | Button | `btn-refresh-market-depth` | Triggers manual market depth refresh | `btn btn-sm btn-outline` |
| **Settings Card** | Input (Number) | `input-target-spread` | Target spread per USDT (NGN) | `form-input font-mono` |
| **Settings Card** | Input (Number) | `input-avg-volume` | Target transaction volume (USDT) | `form-input font-mono` |
| **Settings Card** | Input (Number) | `input-inflow-fee` | Buy payment inflow fee (NGN) | `form-input font-mono` |
| **Settings Card** | Input (Number) | `input-outflow-fee` | Sell payment outflow fee (NGN) | `form-input font-mono` |
| **Settings Card** | Select | `input-pricing-mode` | Pricing mode (competitor, avg-N, vwap-N) | `form-select` |
| **Settings Card** | Select | `input-depth-limit` | Market depth sync size (10, 20, 50, 100) | `form-select` |
| **Settings Card** | Checkbox | `input-filter-limits` | Toggle volume & limit filters | Default checkbox |
| **Buy Ad Assistant** | Value (Span) | `pricing-exit-price` | Lowest competitor ask (Exit Price) | `font-mono fw-bold` |
| **Buy Ad Assistant** | Value (Span) | `pricing-max-buy` | Max Buy Price ceiling for spread protection | `font-mono fw-bold` |
| **Buy Ad Assistant** | Value (Span) | `pricing-top-buy-competitor` | Benchmark reference buy price | `font-mono fw-bold` |
| **Buy Ad Assistant** | Hero Value (Div) | `pricing-suggested-buy` | Recommended Buy Ad rate (+0.10 outbid) | `font-mono text-success fw-bold my-1` |
| **Buy Ad Assistant** | Badge Container | `pricing-buy-status` | Safety status badge (Safe/Capped/Offline) | `badge badge-success / badge-danger / badge-neutral` |
| **Buy Ad Assistant** | Button | `btn-copy-buy-price` | Copy suggested buy price to clipboard | `btn btn-sm btn-outline btn-block` |
| **Sell Ad Assistant** | Value (Span) | `pricing-cost-basis` | FIFO average cost basis per USDT | `font-mono fw-bold text-accent` |
| **Sell Ad Assistant** | Value (Span) | `pricing-break-even` | Break-even sell floor (Cost + Outflow Fee) | `font-mono fw-bold` |
| **Sell Ad Assistant** | Value (Span) | `pricing-target-sell-price` | Target sell floor (Cost + Target Spread + Fee) | `font-mono fw-bold text-warning` |
| **Sell Ad Assistant** | Value (Span) | `pricing-top-sell-competitor` | Benchmark reference sell price | `font-mono fw-bold` |
| **Sell Ad Assistant** | Hero Value (Div) | `pricing-suggested-sell` | Recommended Sell Ad rate (-0.10 undercut) | `font-mono text-success fw-bold my-1` |
| **Sell Ad Assistant** | Badge Container | `pricing-sell-status` | Safety status badge (Safe/Floored/Offline) | `badge badge-success / badge-danger / badge-neutral` |
| **Sell Ad Assistant** | Button | `btn-copy-sell-price` | Copy suggested sell price to clipboard | `btn btn-sm btn-outline btn-block` |
| **Buy Order Book** | Table | `pricing-buy-orderbook` | Table listing top 10 market bids | `market-depth-table` |
| **Sell Order Book** | Table | `pricing-sell-orderbook` | Table listing top 10 market asks | `market-depth-table` |

---

## 5. Acceptance Criteria & Testable Invariants

1. **AC-1 (Side Mapping Accuracy)**:
   - When calling `/v5/p2p/item/online` for `buyDepth`, the payload `side` must strictly be `'0'`.
   - When calling `/v5/p2p/item/online` for `sellDepth`, the payload `side` must strictly be `'1'`.
2. **AC-2 (Order Book Sorting Determinism)**:
   - `buyDepth` rows must be rendered in strictly descending order by price ($P_1 \ge P_2 \ge \dots \ge P_n$).
   - `sellDepth` rows must be rendered in strictly ascending order by price ($P_1 \le P_2 \le \dots \le P_n$).
3. **AC-3 (Buy Spread Protection)**:
   - Suggested buy price must never exceed `exitPrice - targetSpread - (inflowFee / avgVolume)`.
   - If reference rate outbid exceeds ceiling, suggested buy rate is capped at `maxBuyPrice` and status badge displays `badge-danger`.
4. **AC-4 (Sell Spread Protection)**:
   - Suggested sell price must never fall below `costBasis + targetSpread + (outflowFee / avgVolume)`.
   - If reference rate undercut falls below floor, suggested sell rate is floored at `targetSellPrice` and status badge displays `badge-danger`.
5. **AC-5 (UI Badge Consistency)**:
   - Inflow / Buy card uses `badge-primary` (Blue).
   - Outflow / Sell card uses `badge-primary` or semantic equivalent, removing the misassigned `badge-buy` class.
   - Profit and safe badges use `badge-success` (Green); warning and capped badges use `badge-danger` (Red) or `text-warning` (Amber).
6. **AC-6 (Order Book Taker Interaction)**:
   - Clicking a row in `#pricing-buy-orderbook` triggers a SELL trade prefill (`direction: 'SELL'`).
   - Clicking a row in `#pricing-sell-orderbook` triggers a BUY trade prefill (`direction: 'BUY'`).

---

## 6. Conclusion & Recommendations

The specification survey confirms that the architecture of `js/pricingEngine.js` and `js/pricing.js` is structurally sound and modular. The primary defects to be resolved by the implementation team are:
1. Fixing the inverted `side: '1'` vs `side: '0'` payloads in `server.js` (`/api/market-depth`) and `api/market-depth.js`.
2. Correcting the badge class on line 154 of `js/views/pricing.view.js` from `badge-buy` to `badge-primary` or appropriate design-system class.
3. Adding a comprehensive test suite in `test/` to verify deterministic buy/sell pricing math and orderbook sync without inversion.
