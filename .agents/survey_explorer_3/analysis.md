# Test Suite & Mathematical Specification Analysis Report

**Date**: 2026-09-02  
**Author**: survey_explorer_3 (Test Suite & Spec Miner)  
**Workspace**: `c:\dev\p2p`  
**Target Modules**: `js/pricingEngine.js`, `js/pricing.js`, `js/utils.js`, `js/dashboard.js`, `js/views/pricing.view.js`, `test/tier1-feature-coverage/pricing-engine.test.js`

---

## Executive Summary

This report documents the architectural investigation of the test suite and provides the complete mathematical specification for Bybit P2P arbitrage pricing, incorporating:
1. **0.30% Bybit P2P Maker Platform Fee** ($f_{plat} = 0.003$).
2. **Local Fiat Transfer Fees** ($F_{in}, F_{out}$ — default ₦50 fixed or threshold-based > ₦10,000).
3. **Net Cost Basis, Net Pricing, and Effective Profit Margin Models** (Buy Ad Assistant and Sell Ad Assistant).
4. **Recommended Minimum Order Limits** ($V_{min}, L_{min}$) to prevent fixed fiat fee margin erosion.
5. **Trade Size Tier Verification** across ₦5,000, ₦10,000, ₦30,000, and ₦100,000.

---

## 1. Test Suite Architecture & Execution Mechanism

### 1.1 Test Runner & Execution Structure
- **Execution Command**: `npm test` runs `node test/run-tests.js`.
- **Custom Multi-Tier Test Framework**: Built using `test/harness/test-runner.js` providing custom `describe`, `it`/`test`, `beforeEach`, `afterEach`, `beforeAll`, `afterAll` hooks with strict assertions (`test/harness/assertions.js`), mock DOM environment (`test/harness/dom-mock.js`), and mock HTTP client (`test/harness/http-mock.js`).
- **CLI Filtering Flags**:
  - `node test/run-tests.js --tier=1` (Runs Tier 1 Feature Coverage)
  - `node test/run-tests.js --tier=2` (Runs Tier 2 Boundary & Corner Cases)
  - `node test/run-tests.js --tier=3` (Runs Tier 3 Cross-Feature Combinations)
  - `node test/run-tests.js --tier=4` (Runs Tier 4 Real-World Application Scenarios)
  - `node test/run-tests.js --suite=<keyword>` (Filters by suite keyword)
- **Standalone Runners**: Individual runner scripts exist for rapid isolated execution (e.g. `node test/run-challenger-1.js`, `node test/run-challenger-2.js`).

### 1.2 Test Hierarchy & Scope
The repository contains **43 test files** comprising **676 total automated tests**:
1. **Tier 1: Feature Coverage** (12 suites, 421 tests):
   - `pricing-engine.test.js` (21 tests covering dust filtering, reference price calculation, buy pricing, sell pricing, boundary resilience)
   - `r1-m1-calculation-engine.test.js` (Core math, Net Worth, reference rate priority, snapshots)
   - `r1-m2-net-worth-widget.test.js`, `r1-m3-snapshot-modal.test.js`, `net-worth-features.test.js`
   - `r1-api-security.test.js`, `r2-fifo-accounting.test.js`, `r3-multi-bank-reconciliation.test.js`
   - `r4-search-navigation.test.js`, `r4-m4-historical-analytics.test.js`, `r5-offline-pwa.test.js`, `active-buy-sell-ads.test.js`
2. **Tier 2: Boundary & Corner Cases** (6 suites, 159 tests)
3. **Tier 3: Cross-Feature Combinations** (3 suites, 14 tests)
4. **Tier 4: Real-World Scenarios** (4 suites, 10 tests)
   - `arbitrage-reconciliation.test.js` (End-to-end multi-lot arbitrage flow & bank cash reconciliation)
5. **Challenger & Stress Suites** (18 suites, 72 tests):
   - `challenger-1-empirical-pricing-stress.test.js` (5,000 Monte Carlo fuzzed order books, spread cap/floor invariants)
   - `challenger-2-boundary-fuzzing-stress.test.js` (2,000 dust threshold boundary tests, 2,000 trade limit boundary tests, 100 consecutive cross-feature arbitrage round-trips)

---

## 2. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Pricing Engine | Competitor Ad Dust Filtering | Filters out ads below dust threshold: $\max(2.0, \text{avgVol} \times 0.05)$ USDT | `ads: Array`, `avgVol: Number`, `filterLimits: Boolean` | `Array<Ad>` | Null/undefined/empty input returns `[]`; corrupt volume defaults to 100 USDT | `js/pricingEngine.js:14`, `pricing-engine.test.js:21` |
| 2 | Pricing Engine | Transaction Limit Filtering | Rejects competitor ads where target trade fiat amount ($\text{safeAvgVol} \times \text{price}$) falls outside $[\text{minAmount}, \text{maxAmount}]$ | `ads: Array`, `avgVol: Number`, `filterLimits: true` | `Array<Ad>` | Missing/zero limits ignored; supports `minSingleTransAmount` & `maxSingleTransAmount` | `js/pricingEngine.js:31`, `pricing-engine.test.js:55` |
| 3 | Pricing Engine | Reference Rate Calculation | Computes benchmark price via `'competitor'`, `'avg-N'`, or `'vwap-N'` modes | `ads: Array`, `pricingMode: String` | `Number` (NGN rate) | Returns 0 for empty ads; defaults to `'avg-10'` on omitted mode | `js/pricingEngine.js:47`, `pricing-engine.test.js:107` |
| 4 | Pricing Engine | Buy Ad Pricing Assistant | Calculates suggested buy price (+₦0.10 outbid), max buy price cap, and safety gate | `activeBuyAds`, `sortedSellAds`, `targetSpread`, `inflowFee`, `avgVolume`, `pricingMode` | `{ exitPrice, referenceBuyPrice, maxBuyPrice, rawSuggestedBuy, suggestedBuy, isSafe, excessSpread, isOffline }` | Returns `isOffline: true` and 0 values when market depth is missing | `js/pricingEngine.js:95`, `pricing-engine.test.js:172` |
| 5 | Pricing Engine | Sell Ad Pricing Assistant | Calculates suggested sell price (-₦0.10 undercut), break-even price, target sell price floor, and safety gate | `activeSellAds`, `costBasis`, `targetSpread`, `outflowFee`, `avgVolume`, `pricingMode` | `{ referenceSellPrice, breakEven, targetSellPrice, rawSuggestedSell, suggestedSell, isSafe, sellSpread, hasCostBasis, hasCompetitors }` | Returns `hasCostBasis: false` if cost basis $\le 0$; `hasCompetitors: false` if no active sell ads | `js/pricingEngine.js:156`, `pricing-engine.test.js:282` |
| 6 | Accounting | FIFO Cost-Basis & Realized PnL | Matches BUY lots against SELL orders chronologically to compute realized PnL and remaining inventory cost basis | `trades: Array`, `openingInventory: Object` | `{ enrichedTrades, totalRealizedPnL, totalRealizedCostBasis, totalRealizedRevenue, overallROI, remainingInventoryUSDT, inventoryCostBasisNGN, avgHoldingCostPerUSDT, totalUnmatchedSoldUSDT }` | Handles overselling by creating unmatched external inventory lots at 0 profit | `js/utils.js:132`, `r2-fifo-accounting.test.js` |
| 7 | Net Worth | Dual-Currency Net Worth | Computes total liquid assets in NGN and USDT at authoritative reference rate | `totalBankCashNgn`, `totalUsdt`, `referenceRate` | `{ netWorthNgn, netWorthUsdt, bankCashNgn, totalUsdt, referenceRate }` | Non-positive rate returns un-converted values safely | `js/utils.js:479`, `r1-m1-calculation-engine.test.js` |
| 8 | UI View | Pricing Assistant Controller | Binds UI controls, syncs market depth from Bybit proxy, persists settings to localStorage, and updates DOM | Event triggers, DOM elements, localStorage | Rendered DOM elements | Catches proxy query failures gracefully with error toast | `js/pricing.js:19`, `js/views/pricing.view.js` |

---

## 3. Edge Cases Discovered

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | Dust Filter | `avgVolume = 10` (5% is 0.5 USDT) | Clamped to absolute floor of 2.0 USDT; ad with 1.9 USDT rejected, 2.0 USDT kept. |
| 2 | Dust Filter | `avgVolume = 1000` (5% is 50 USDT) | Scaled threshold to 50.0 USDT; ad with 49.9 USDT rejected, 50.0 USDT kept. |
| 3 | Limit Filter | Corrupt ads containing `null`, `undefined`, primitives, missing price/qty | Safely ignored and discarded without throwing exceptions. |
| 4 | Reference Rate | Zero quantity ads in `vwap-N` mode | Total volume is 0; gracefully falls back to top competitor price `parseFloat(ads[0].price)`. |
| 5 | Buy Pricing | Market sell depth is empty or offline (`sortedSellAds = []`) | Returns `{ isOffline: true, exitPrice: 0, suggestedBuy: 0, isSafe: false }`. |
| 6 | Buy Pricing | Competitor buy bids exceed exit price / spread limit (market inversion) | `rawSuggestedBuy > maxBuyPrice`; caps `suggestedBuy = maxBuyPrice` and flags `isSafe: false`. |
| 7 | Sell Pricing | Cost basis $\le 0$ or negative | Returns `{ hasCostBasis: false, isSafe: false, suggestedSell: 0, breakEven: 0, targetSellPrice: 0 }`. |
| 8 | Sell Pricing | Competitor sell asks drop below cost basis + target spread (market crash) | `rawSuggestedSell < targetSellPrice`; floors `suggestedSell = targetSellPrice` and flags `isSafe: false`. |
| 9 | Fee Amortization | Large fixed fee (e.g. ₦100,000 on 10 USDT volume) | Fee per unit is ₦10,000/USDT; `maxBuyPrice` drops to negative value without runtime crash. |
| 10 | Volume Inputs | `avgVolume` is 0, negative, `NaN`, `null`, or string | Safely defaults to `safeAvgVol = 100` USDT across all engine functions. |

---

## 4. Mathematical Specification & Exact Arbitrage Formulas

### 4.1 Platform Fee Modeling (Bybit P2P Maker Fee)
- **Maker Platform Fee Rate**: $f_{plat} = 0.30\% = 0.003$ (applies to advertisers posting Buy or Sell ads).
- **Taker Fee Rate**: $0.00\%$.
- **Buy Ad Execution (Maker Buying USDT with NGN)**:
  - Maker pays fiat: $V \times P_{buy}$
  - Maker receives gross USDT: $V$
  - Platform fee deducted in crypto: $Fee_{USDT} = V \times f_{plat} = 0.003 V$
  - Net USDT received: $V_{net} = V \times (1 - f_{plat}) = 0.997 V$
  - Fiat-equivalent fee per unit USDT: $Fee_{unit,buy} = P_{buy} \times f_{plat} = 0.003 P_{buy}$
- **Sell Ad Execution (Maker Selling USDT for NGN)**:
  - Maker surrenders USDT: $V \times (1 + f_{plat})$ or receives fiat net of maker fee: $V \times P_{sell} \times (1 - f_{plat})$
  - Platform fee in fiat equivalent per unit USDT: $Fee_{unit,sell} = P_{sell} \times f_{plat} = 0.003 P_{sell}$

---

### 4.2 Local Fiat Transfer Fee Modeling (NGN Inflow & Outflow)
- **Inflow Fee ($F_{in}$)**: Flat transfer fee / fintech debit charge incurred when sending NGN to seller during Buy trade fulfillment (default: ₦50.00).
- **Outflow Fee ($F_{out}$)**: Stamp duty / Electronic Money Transfer Levy (EMTL) or bank fee charged when receiving/transferring NGN during Sell trade fulfillment (default: ₦50.00).
- **Threshold-Based Model**:
  $$F_{fiat}(S_{NGN}) = \begin{cases} ₦0.00 & \text{if } S_{NGN} \le ₦10,000 \\ ₦50.00 & \text{if } S_{NGN} > ₦10,000 \end{cases}$$
  *(where $S_{NGN} = V \times P$ is the trade size in Naira).*
- **Per-Unit Fiat Fee Drag**:
  $$f_{in,unit} = \frac{F_{in}}{V}, \quad f_{out,unit} = \frac{F_{out}}{V}$$

---

### 4.3 Integrated Net Pricing & Profit Margin Formulas

#### Notation:
- $V$: Target trade volume in USDT (default 100 USDT).
- $P_{buy}$: Buy rate (NGN/USDT).
- $P_{sell}$: Sell rate (NGN/USDT).
- $P_{exit}$: Best market exit sell rate (cheapest ask on competitor Sell order book).
- $P_{ref,buy}$: Reference competitor buy rate (from `calculateReferencePrice`).
- $P_{ref,sell}$: Reference competitor sell rate (from `calculateReferencePrice`).
- $C_{FIFO}$: FIFO average inventory holding cost per USDT.
- $S_{target}$: Target spread / margin in NGN per USDT (e.g. ₦5.00/USDT).
- $f_{plat}$: Maker platform fee fraction ($0.003$).
- $F_{in}, F_{out}$: Inflow and outflow fiat fees in NGN.

---

#### A. Buy Ad Pricing Assistant

1. **Net Unit Cost of Acquisition**:
   $$\text{Total Capital Outlay} = (V \times P_{buy}) + (V \times P_{buy} \times f_{plat}) + F_{in} = V \cdot P_{buy} \cdot (1 + f_{plat}) + F_{in}$$
   $$\text{Net Cost Basis per USDT} = C_{net,buy} = P_{buy} \cdot (1 + f_{plat}) + \frac{F_{in}}{V}$$

2. **Net Unit Exit Revenue**:
   $$\text{Net Exit Revenue per USDT} = R_{net,exit} = P_{exit} \cdot (1 - f_{plat}) - \frac{F_{out}}{V}$$

3. **Maximum Allowable Buy Price ($P_{max,buy}$)**:
   To ensure net spread $\ge S_{target}$ ($R_{net,exit} - C_{net,buy} \ge S_{target}$):
   $$P_{exit} \cdot (1 - f_{plat}) - \frac{F_{out}}{V} - \left[ P_{buy} \cdot (1 + f_{plat}) + \frac{F_{in}}{V} \right] \ge S_{target}$$
   $$P_{max,buy} = \frac{P_{exit} \cdot (1 - f_{plat}) - S_{target} - \frac{F_{in} + F_{out}}{V}}{1 + f_{plat}}$$
   *(Single-leg / Inflow-only formulation where outflow fee is accounted on sell leg)*:
   $$P_{max,buy}^{single} = \frac{P_{exit} \cdot (1 - f_{plat}) - S_{target} - \frac{F_{in}}{V}}{1 + f_{plat}}$$

4. **Suggested Buy Price ($P_{suggested,buy}$)**:
   $$P_{raw,buy} = \begin{cases} P_{ref,buy} + 0.10 & \text{if } P_{ref,buy} > 0 \\ P_{max,buy} & \text{if } P_{ref,buy} = 0 \end{cases}$$
   $$P_{suggested,buy} = \min(P_{raw,buy}, P_{max,buy})$$
   $$\text{isSafe} = (P_{raw,buy} \le P_{max,buy})$$

5. **Net Excess Spread**:
   $$\text{Excess Spread} = P_{exit} \cdot (1 - f_{plat}) - P_{suggested,buy} \cdot (1 + f_{plat}) - \frac{F_{in} + F_{out}}{V}$$

---

#### B. Sell Ad Pricing Assistant

1. **Break-Even Sell Price ($P_{break-even}$)**:
   Net proceeds must cover FIFO cost basis $C_{FIFO}$:
   $$P_{sell} \cdot (1 - f_{plat}) - \frac{F_{out}}{V} = C_{FIFO}$$
   $$P_{break-even} = \frac{C_{FIFO} + \frac{F_{out}}{V}}{1 - f_{plat}}$$

2. **Target Sell Price ($P_{target,sell}$)**:
   Net proceeds must cover $C_{FIFO} + S_{target}$:
   $$P_{target,sell} = \frac{C_{FIFO} + S_{target} + \frac{F_{out}}{V}}{1 - f_{plat}}$$

3. **Suggested Sell Price ($P_{suggested,sell}$)**:
   $$P_{raw,sell} = P_{ref,sell} - 0.10$$
   $$P_{suggested,sell} = \max(P_{raw,sell}, P_{target,sell})$$
   $$\text{isSafe} = (P_{raw,sell} \ge P_{target,sell})$$

4. **Net Realized Spread**:
   $$\text{Realized Sell Spread} = P_{suggested,sell} \cdot (1 - f_{plat}) - \frac{F_{out}}{V} - C_{FIFO}$$

---

#### C. Effective Profit Margin & Full Round-Trip Arbitrage

1. **Total Net Realized Profit ($\Pi$)**:
   $$\Pi = V \cdot \left[ P_{sell} \cdot (1 - f_{plat}) - P_{buy} \cdot (1 + f_{plat}) \right] - (F_{in} + F_{out})$$

2. **Effective Profit Margin / ROI (%)**:
   $$\text{ROI} \% = \frac{\Pi}{V \cdot P_{buy} \cdot (1 + f_{plat}) + F_{in}} \times 100\%$$

---

## 5. Recommended Minimum Order Limits

### 5.1 The Fixed Fee Drag Problem
Fixed fiat fees ($F_{in} + F_{out} = ₦100$) are constant regardless of trade size. On small trades, the fixed fee per unit ($\frac{F_{total}}{V}$) explodes, consuming the entire gross spread.

### 5.2 Minimum Volume & Limit Derivations
Let $k$ be the maximum allowable fraction of the target spread consumed by the fixed fee (e.g. $k = 10\%$ or $k = 20\%$):
$$\frac{F_{in}}{V} \le k \cdot S_{target} \implies V_{min} \ge \frac{F_{in}}{k \cdot S_{target}}$$

In Naira minimum transaction limit ($L_{min} = V_{min} \times P_{buy}$):
$$L_{min} \ge \frac{F_{in} \cdot P_{buy}}{k \cdot S_{target}}$$

### 5.3 Order Limit Threshold Table ($F_{in} = ₦50, P_{buy} = ₦1,500, S_{target} = ₦5.00/\text{USDT}$)

| Fee Drag Tolerance ($k$) | Fee Drag per USDT | Min Volume ($V_{min}$) | Recommended Min Ad Limit ($L_{min}$) | Status / Recommendation |
|--------------------------|-------------------|------------------------|---------------------------------------|-------------------------|
| **100% (Break-even)** | ₦5.00 / USDT | **10.0 USDT** | **₦15,000** | **Absolute Floor**: Below ₦15,000, trade yields net loss. |
| **50% (High Drag)** | ₦2.50 / USDT | **20.0 USDT** | **₦30,000** | **Marginal**: 50% of profit lost to transfer fee. |
| **20% (Acceptable)** | ₦1.00 / USDT | **50.0 USDT** | **₦75,000** | **Recommended Standard Limit**. |
| **10% (Optimal)** | ₦0.50 / USDT | **100.0 USDT** | **₦150,000** | **Institutional / High Efficiency**. |
| **5% (Ultra-Low Drag)** | ₦0.25 / USDT | **200.0 USDT** | **₦300,000** | **Maximum Capital Yield**. |

---

## 6. Trade Size Tier Verification & Numerical Analysis

We evaluate the mathematical behavior across four standard trade size tiers under:
- Base Rate: $P = ₦1,500.00 / \text{USDT}$
- Target Spread: $S_{target} = ₦5.00 / \text{USDT}$
- Platform Fee: $f_{plat} = 0.30\%$ ($0.003$)
- Platform Fee per unit: $1500 \times 0.003 = ₦4.50 / \text{USDT}$
- Exit Price (Market Sell): $P_{exit} = ₦1,520.00 / \text{USDT}$

### 6.1 Summary Comparison Table Across Tiers

| Parameter | Tier 1 (₦5,000) | Tier 2 (₦10,000) | Tier 3 (₦30,000) | Tier 4 (₦100,000) |
|---|---|---|---|---|
| **Trade Volume ($V$)** | **3.33 USDT** | **6.67 USDT** | **20.00 USDT** | **66.67 USDT** |
| **Flat Fiat Fee ($F_{in}$)** | ₦50.00 | ₦50.00 | ₦50.00 | ₦50.00 |
| **Fiat Fee per USDT ($F_{in}/V$)** | **₦15.00 / USDT** | **₦7.50 / USDT** | **₦2.50 / USDT** | **₦0.75 / USDT** |
| **Platform Fee per USDT ($P \times 0.003$)** | ₦4.50 / USDT | ₦4.50 / USDT | ₦4.50 / USDT | ₦4.50 / USDT |
| **Total Buy Friction per USDT** | **₦19.50 / USDT** | **₦12.00 / USDT** | **₦7.00 / USDT** | **₦5.25 / USDT** |
| **Max Buy Price ($P_{max,buy}$)** | **₦1,491.43** | **₦1,498.90** | **₦1,503.89** | **₦1,505.63** |
| **Break-Even Sell (Cost Basis ₦1,500)** | **₦1,519.56** | **₦1,512.04** | **₦1,507.02** | **₦1,505.27** |
| **Target Sell Price (Cost + ₦5)** | **₦1,524.57** | **₦1,517.05** | **₦1,512.04** | **₦1,510.28** |
| **Fee Drag % of ₦5 Spread** | **300.0%** (Severe Loss) | **150.0%** (Loss) | **50.0%** (Viable) | **15.0%** (Optimal) |
| **Threshold Model Fee ($F_{in}$)** | ₦0.00 | ₦0.00 | ₦50.00 | ₦50.00 |
| **Threshold $P_{max,buy}$** | **₦1,506.38** | **₦1,506.38** | **₦1,503.89** | **₦1,505.63** |

---

### 6.2 Detailed Tier Profiles

#### Tier 1: ₦5,000 Trade Size (Micro-Trade)
- **Trade Volume**: $V = 3.3333 \text{ USDT}$.
- **Flat Fee Model**:
  - $F_{in} = ₦50.00 \implies \text{Fee per unit} = ₦15.00/\text{USDT}$.
  - Total round-trip fixed fee drag = $₦30.00/\text{USDT}$.
  - Combined friction (platform + fixed) = $₦30.00 + ₦9.00 = ₦39.00/\text{USDT}$ ($2.6\%$).
  - **Verdict: UNPROFITABLE / CRITICAL LOSS**. An advertiser with min limit ₦5,000 and flat ₦50 transfer fee will lose money on every completed micro-order.
- **Threshold Fee Model ($\le ₦10,000 \implies F = ₦0$)**:
  - Inflow fee is waived ($₦0$).
  - Friction is solely the 0.3% platform fee ($₦4.50/\text{USDT}$).
  - **Verdict: PROFITABLE** only if fintech zero-fee tier applies.

#### Tier 2: ₦10,000 Trade Size (Boundary Kink Point)
- **Trade Volume**: $V = 6.6667 \text{ USDT}$.
- **Flat Fee Model**:
  - $F_{in} = ₦50.00 \implies \text{Fee per unit} = ₦7.50/\text{USDT}$.
  - Fixed fee consumes 150% of the ₦5.00 target spread.
  - **Verdict: UNPROFITABLE under flat fee**.
- **Threshold Fee Model**:
  - Exactly at the CBN ₦10,000 zero-stamp-duty ceiling ($F = ₦0$).
  - **Verdict: PROFITABLE** under zero-fee threshold.

#### Tier 3: ₦30,000 Trade Size (Standard Small Trade)
- **Trade Volume**: $V = 20.0000 \text{ USDT}$.
- **Fee Profile**:
  - $F_{in} = ₦50.00 \implies \text{Fee per unit} = ₦2.50/\text{USDT}$.
  - Platform fee per unit = $₦4.50/\text{USDT}$.
  - Total buy leg friction = $₦7.00/\text{USDT}$.
  - Round-trip break-even gross spread = $2 \times 2.50 + 2 \times 4.50 = ₦14.00/\text{USDT}$ ($0.93\%$).
  - **Verdict: MODERATELY PROFITABLE**. The merchant can achieve a ₦5 spread if market spread $\ge ₦19.00/\text{USDT}$. Fee drag is 50% of target spread.

#### Tier 4: ₦100,000 Trade Size (Optimal Commercial Tier)
- **Trade Volume**: $V = 66.6667 \text{ USDT}$.
- **Fee Profile**:
  - $F_{in} = ₦50.00 \implies \text{Fee per unit} = ₦0.75/\text{USDT}$.
  - Platform fee per unit = $₦4.50/\text{USDT}$.
  - Total buy leg friction = $₦5.25/\text{USDT}$.
  - Round-trip break-even gross spread = $2 \times 0.75 + 2 \times 4.50 = ₦10.50/\text{USDT}$ ($0.70\%$).
  - Fee drag is only 15% of the ₦5 target spread.
  - **Verdict: HIGHLY EFFICIENT & RECOMMENDED**. Optimal balance between trade velocity and margin preservation.

---

## 7. Recommendations for Engine & UI Implementation

1. **Parameter Defaults in `pricingEngine.js`**:
   - `platformFeePct`: default `0.003` (0.3%).
   - `inflowFee`: default `50.0` (₦50).
   - `outflowFee`: default `50.0` (₦50).
   - `avgVolume`: default `100.0` (100 USDT).
   - `targetSpread`: default `5.0` (₦5.00/USDT).
2. **Formula Upgrades in `pricingEngine.js`**:
   - Upgrade `maxBuyPrice` to account for `platformFeePct`:
     $$P_{max,buy} = \frac{P_{exit} \cdot (1 - \text{platformFeePct}) - \text{targetSpread} - (\text{inflowFee} / \text{avgVolume})}{1 + \text{platformFeePct}}$$
   - Upgrade `breakEven` and `targetSellPrice` in `calculateSellPricing`:
     $$P_{break-even} = \frac{\text{costBasis} + (\text{outflowFee} / \text{avgVolume})}{1 - \text{platformFeePct}}$$
     $$P_{target,sell} = \frac{\text{costBasis} + \text{targetSpread} + (\text{outflowFee} / \text{avgVolume})}{1 - \text{platformFeePct}}$$
3. **Add Minimum Order Limit Advisor to `pricingEngine.js`**:
   - Export helper function `calculateRecommendedLimits({ inflowFee, targetSpread, price, maxFeeDragPct = 0.20 })`:
     $$V_{min} = \frac{\text{inflowFee}}{\text{maxFeeDragPct} \cdot \text{targetSpread}}, \quad L_{min} = V_{min} \cdot \text{price}$$
4. **UI Additions (`pricing.view.js` and `settings.view.js`)**:
   - Add Platform Maker Fee input field (`input-platform-fee-pct`, default `0.3%`).
   - Add Minimum Order Limit recommendation badge/card in Pricing Assistant UI (e.g. "Recommended Min Limit: ₦75,000 to cap fee drag at 20%").
   - Display Fee Breakdown tooltip/pills showing Maker Fee (₦/USDT) and Transfer Fee (₦/USDT).
