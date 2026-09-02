# Technical Analysis: Bybit P2P Fee Model, Arbitrage Engine Math & Order Limit Optimization

**Author**: survey_explorer_1 (Codebase & Engine Explorer)  
**Date**: 2026-09-02  
**Target Repository**: `c:\dev\p2p\`  

---

## 1. Executive Summary

This report delivers an exhaustive technical investigation of the **Bybit P2P Tracker** codebase (`js/pricingEngine.js`, `js/pricing.js`, `js/utils.js`, `js/dashboard.js`, `js/fees.js`, `js/views/pricing.view.js`, `js/views/settings.view.js`, and `test/tier1-feature-coverage/pricing-engine.test.js`). 

The primary objective is to formulate and integrate the **Bybit P2P 0.30% maker percentage fee** alongside **local Nigerian fiat transfer fees** (e.g. ₦10 inter-bank transfer fee and ₦50 Electronic Money Transfer Levy / Stamp Duty for transactions >= ₦10,000) into the pricing and arbitrage engine.

### Key Takeaways:
1. **Current Engine Gap**: The existing pricing engine (`js/pricingEngine.js`) accounts solely for fixed fiat fees amortized by volume (`inflowFee / avgVolume` and `outflowFee / avgVolume`). It completely omits Bybit's **0.3% maker transaction fee**, resulting in significant overestimation of net profit margins (by ~₦4.50 to ₦9.00 per USDT traded) and unsafe suggested bid/ask prices.
2. **Asymmetric Fee Impact Across Trade Sizes**: Fixed fiat fees (₦50) exhibit severe **regressive fee drag** on small orders (e.g., 1.00% fee drag on ₦5,000 trades vs. 0.05% on ₦100,000 trades), whereas the 0.3% maker fee imposes a constant proportional load. Combining both fees reveals that trades under ₦30,000 compress net margins substantially unless transaction limits are enforced.
3. **Simultaneous Fee Accounting Solution**: Closed-form algebraic solutions have been derived for `maxBuyPrice`, `suggestedBuy`, `breakEven`, `targetSellPrice`, `suggestedSell`, and `recommendedMinOrderLimit` that guarantee the merchant's target net spread is protected after all platform and banking deductions.
4. **Architectural Cohesion**: Modifications are isolated to the pure mathematical domain layer (`js/pricingEngine.js`), with clean reactive bindings in `js/pricing.js`, UI controls in `js/views/pricing.view.js`, and enhanced FIFO/dashboard projections in `js/dashboard.js` and `js/fees.js`.

---

## 2. Codebase Architecture & Current State Audit

### 2.1 File Map & Responsibilities

| File Path | Role & Architectural Layer | Current State & Fee Capabilities |
|---|---|---|
| `js/pricingEngine.js` | **Domain Layer (Pure Math Engine)** | Computes `filterCompetitorAds`, `calculateReferencePrice` (SMA-N, VWAP-N, Top 1), `calculateBuyPricing`, and `calculateSellPricing`. Currently accounts only for `inflowFee` and `outflowFee`. Does not accept `platformFeePct`. |
| `js/pricing.js` | **Controller Layer** | Fetches live depth from `/api/market-depth`, manages user preferences in `localStorage`, computes FIFO cost basis from store, and coordinates UI rendering. |
| `js/views/pricing.view.js` | **Presentation Layer (UI Template)** | Renders Arbitrage Settings, Buy Ad Assistant (Inflow), Sell Ad Assistant (Outflow), and Market Depth order books. Currently lacks `platformFeePct` input and order limit recommendations. |
| `js/utils.js` | **Core Utilities & FIFO Engine** | Implements `calculateTradeBreakdown`, `calculateFIFOInventoryAndPnL`, `calculateNetWorth`, `calculateSnapshotDelta`, `formatNGN`, `formatUSDT`. |
| `js/dashboard.js` | **Dashboard Controller** | Calculates realized P&L, inventory metrics, live Bybit sync, and active ad projected profit (`syncAndRenderActiveAd`). Active ad projected profit currently omits 0.3% maker fee. |
| `js/fees.js` | **Fee Management & Fintech Calculations** | Manages dynamic fee rows for trade entry and includes `calculateFintechTradeFees` (₦10 transfer fee >= ₦5k, ₦50 stamp duty >= ₦10k). |
| `js/settings.js` / `js/views/settings.view.js` | **Settings & Integration Controller** | Handles Bybit proxy sync, opening inventory, CSV/JSON backups, and batch order bank assignment. |
| `test/tier1-feature-coverage/pricing-engine.test.js` | **Unit Test Suite** | 25 deterministic unit tests for pricing engine covering dust filtering, SMA/VWAP reference pricing, outbid/undercut, spread caps/floors, and boundary handling. |

---

### 2.2 Inspection of Existing Pricing Formulas in `js/pricingEngine.js`

#### Buy Side (Existing):
```javascript
// Current Buy Pricing Math (js/pricingEngine.js:123-131)
const maxBuyPrice = exitPrice - targetSpread - (inflowFee / safeAvgVol);
const rawSuggestedBuy = referenceBuyPrice > 0 ? (referenceBuyPrice + 0.10) : maxBuyPrice;
const suggestedBuy = Math.min(rawSuggestedBuy, maxBuyPrice);
const isSafe = rawSuggestedBuy <= maxBuyPrice;
const excessSpread = exitPrice - suggestedBuy - (inflowFee / safeAvgVol);
```
**Deficiencies**:
1. When buying USDT as an ad maker, Bybit deducts a `0.3%` maker fee from the crypto released, meaning the merchant receives only `(1 - 0.003) = 0.997 USDT` per unit, or pays `BuyPrice / (1 - 0.003)` in effective NGN per net USDT acquired.
2. When subsequently liquidating at `exitPrice`, Bybit again deducts `0.3%` maker fee on the sell ad (if selling as maker) or taker fee, and the merchant incurs `outflowFee`. The current formula assumes zero sell-side platform fees and zero outflow fees when calculating the buy ceiling `maxBuyPrice`.
3. Consequently, if `exitPrice = 1520`, `targetSpread = 5`, `inflowFee = 50`, `vol = 100`:
   - Current engine computes `maxBuyPrice = 1520 - 5 - 0.50 = 1514.50`.
   - If merchant buys at `1514.50` and sells at `1520.00`:
     - Maker fee on buy: `1514.50 * 0.003 = ₦4.54`
     - Maker fee on sell: `1520.00 * 0.003 = ₦4.56`
     - Fiat fees: `0.50 (inflow) + 0.50 (outflow) = ₦1.00`
     - Total fee load: `4.54 + 4.56 + 1.00 = ₦10.10 / USDT`!
     - Realized spread: `(1520 - 1514.50) - 10.10 = 5.50 - 10.10 = -₦4.60 / USDT` (A **net loss** instead of +₦5.00 profit!).

#### Sell Side (Existing):
```javascript
// Current Sell Pricing Math (js/pricingEngine.js:182-207)
const breakEven = costBasis + (outflowFee / safeAvgVol);
const targetSellPrice = costBasis + targetSpread + (outflowFee / safeAvgVol);
const rawSuggestedSell = referenceSellPrice - 0.10;
const suggestedSell = Math.max(rawSuggestedSell, targetSellPrice);
const isSafe = rawSuggestedSell >= targetSellPrice;
const sellSpread = suggestedSell - costBasis - (outflowFee / safeAvgVol);
```
**Deficiencies**:
1. When selling USDT as an ad maker, the gross proceeds from selling 1 USDT at `suggestedSell` are reduced by Bybit's `0.3%` platform fee: `Net Revenue = suggestedSell * (1 - platformFeePct) - (outflowFee / safeAvgVol)`.
2. Break-even occurs when `Net Revenue = costBasis`, which requires `suggestedSell * (1 - platformFeePct) = costBasis + (outflowFee / safeAvgVol)`.
3. The existing formula fails to divide by `(1 - platformFeePct)`. At `costBasis = 1500`, `outflowFee = 50`, `vol = 100`:
   - Current engine computes `breakEven = 1500 + 0.50 = 1500.50`.
   - Selling at `1500.50`: Gross revenue = `1500.50`. Bybit 0.3% fee = `1500.50 * 0.003 = ₦4.50`. Net revenue = `1500.50 - 4.50 - 0.50 = ₦1495.50`.
   - The merchant incurs a **₦4.50 loss per USDT** on a trade labeled as "Break-Even"!

---

## 3. Bybit P2P Fee Model & Economic Mechanics

### 3.1 Maker vs Taker Fee Structure
- **Bybit P2P Maker Fee**: **0.30% (0.0030)** per completed trade for the advertiser (ad poster).
- **Bybit P2P Taker Fee**: **0.00% (0.0000)** for retail users responding to advertisements.
- **Side Semantics & Flow Mapping**:

```
+-----------------------------------------------------------------------------------+
| BUY AD (Merchant is Maker)                                                        |
| - Merchant posts ad to BUY USDT (Paying NGN)                                      |
| - Appears on Bybit P2P Order Book under "SELL" tab for Takers                     |
| - Taker sells USDT -> Escrow releases USDT to Merchant minus 0.30% platform fee   |
| - Merchant transfers NGN to Taker via Bank/Fintech (Incurring Inflow Transfer Fee)|
+-----------------------------------------------------------------------------------+

+-----------------------------------------------------------------------------------+
| SELL AD (Merchant is Maker)                                                       |
| - Merchant posts ad to SELL USDT (Receiving NGN)                                  |
| - Appears on Bybit P2P Order Book under "BUY" tab for Takers                      |
| - Taker sends NGN to Merchant's Bank Account (May incur EMTL Outflow Stamp Duty)  |
| - Escrow releases USDT to Taker -> Merchant pays 0.30% platform fee on USDT       |
+-----------------------------------------------------------------------------------+
```

### 3.2 Nigerian Banking / Fintech Transfer Fees (Inflow & Outflow)
1. **Inflow Fee (`inflowFee`)**: Incurred when the merchant executes a BUY order (sending NGN from bank/fintech):
   - **Inter-bank transfer fee**: Free below ₦5,000 on fintechs (OPay, PalmPay, Moniepoint); ₦10 flat between ₦5,000 and ₦50,000; up to ₦50 on commercial banks.
   - **EMTL Levy / Stamp Duty**: ₦50 flat for transfers >= ₦10,000.
   - **Standard Default**: `₦50.00` (covers stamp duty + inter-bank fee).
2. **Outflow Fee (`outflowFee`)**: Incurred when the merchant receives NGN on a SELL order:
   - **Inward Stamp Duty**: Under Nigerian CBN regulations, inward electronic transfers of ₦10,000 and above to business/merchant accounts are assessed a ₦50 Electronic Money Transfer Levy (EMTL).
   - **Standard Default**: `₦50.00`.

---

## 4. Mathematical Formulations & Derivations

Let:
- $P_{buy}$ = Suggested Buy Price (NGN/USDT)
- $P_{sell}$ = Suggested Sell Price (NGN/USDT)
- $P_{exit}$ = Lowest competitor Sell Ask in market (NGN/USDT)
- $P_{ref,buy}$ = Filtered reference buy benchmark (SMA-N, VWAP-N, or Top 1)
- $P_{ref,sell}$ = Filtered reference sell benchmark (SMA-N, VWAP-N, or Top 1)
- $C_{fifo}$ = Authoritative FIFO inventory holding cost basis (NGN/USDT)
- $S_{target}$ = Target net profit spread per USDT (NGN/USDT)
- $V$ = Target transaction volume in USDT ($avgVolume > 0$)
- $F_{in}$ = Fiat payment inflow fee in NGN ($inflowFee$)
- $F_{out}$ = Fiat payment outflow fee in NGN ($outflowFee$)
- $\phi$ = Bybit P2P maker percentage fee fraction (e.g., $0.3\% = 0.0030$)

---

### 4.1 Sell Side Mathematical Formulation

When selling 1 USDT at price $P_{sell}$:
$$\text{Gross Revenue} = P_{sell}$$
$$\text{Bybit Maker Fee} = \phi \cdot P_{sell}$$
$$\text{Fiat Outflow Fee per Unit} = \frac{F_{out}}{V}$$
$$\text{Net Revenue per USDT} = P_{sell} \cdot (1 - \phi) - \frac{F_{out}}{V}$$

#### 1. Exact Break-Even Sell Price ($P_{breakEven}$):
Setting $\text{Net Revenue} = C_{fifo}$:
$$P_{breakEven} \cdot (1 - \phi) - \frac{F_{out}}{V} = C_{fifo}$$
$$P_{breakEven} = \frac{C_{fifo} + \frac{F_{out}}{V}}{1 - \phi}$$

#### 2. Exact Target Sell Price ($P_{targetSell}$):
Setting $\text{Net Revenue} = C_{fifo} + S_{target}$:
$$P_{targetSell} \cdot (1 - \phi) - \frac{F_{out}}{V} = C_{fifo} + S_{target}$$
$$P_{targetSell} = \frac{C_{fifo} + S_{target} + \frac{F_{out}}{V}}{1 - \phi}$$

#### 3. Undercutting & Safety Rules:
$$P_{rawSuggestedSell} = P_{ref,sell} - 0.10$$
$$P_{suggestedSell} = \max\left(P_{rawSuggestedSell}, P_{targetSell}\right)$$
$$\text{isSafe} = P_{rawSuggestedSell} \ge P_{targetSell}$$
$$\text{Net Sell Spread} = P_{suggestedSell} \cdot (1 - \phi) - C_{fifo} - \frac{F_{out}}{V}$$

---

### 4.2 Buy Side Mathematical Formulation

When purchasing 1 USDT at price $P_{buy}$, the net cost basis incurred is:
$$\text{Effective Buy Cost per USDT} = \frac{P_{buy} + \frac{F_{in}}{V}}{1 - \phi} \quad \text{or} \quad P_{buy} \cdot (1 + \phi) + \frac{F_{in}}{V}$$
*(Using exact Bybit escrow deduction: Merchant pays $P_{buy}$ fiat for $(1 - \phi)$ USDT, giving $\frac{P_{buy}}{1 - \phi}$ per USDT).*

When subsequently liquidating at market exit price $P_{exit}$ (with sell-side maker fee $\phi$ and outflow fee $F_{out}$):
$$\text{Net Exit Revenue per USDT} = P_{exit} \cdot (1 - \phi) - \frac{F_{out}}{V}$$

To ensure the round-trip net arbitrage spread is at least $S_{target}$:
$$\text{Net Exit Revenue} - \text{Effective Buy Cost} \ge S_{target}$$
$$\left[ P_{exit} \cdot (1 - \phi) - \frac{F_{out}}{V} \right] - \left[ \frac{P_{buy}}{1 - \phi} + \frac{F_{in}}{V} \right] \ge S_{target}$$

Solving for maximum permissible buy price $P_{maxBuy}$:
$$\frac{P_{buy}}{1 - \phi} \le P_{exit} \cdot (1 - \phi) - S_{target} - \frac{F_{in} + F_{out}}{V}$$
$$P_{maxBuy} = (1 - \phi) \cdot \left[ P_{exit} \cdot (1 - \phi) - S_{target} - \frac{F_{in} + F_{out}}{V} \right]$$

#### Outbidding & Safety Rules:
$$P_{rawSuggestedBuy} = P_{ref,buy} > 0 \ ? \ (P_{ref,buy} + 0.10) : P_{maxBuy}$$
$$P_{suggestedBuy} = \min\left(P_{rawSuggestedBuy}, P_{maxBuy}\right)$$
$$\text{isSafe} = P_{rawSuggestedBuy} \le P_{maxBuy}$$
$$\text{Net Excess Spread} = P_{exit} \cdot (1 - \phi) - \frac{F_{out}}{V} - \left( \frac{P_{suggestedBuy}}{1 - \phi} + \frac{F_{in}}{V} \right)$$

---

## 5. Trade Size Sensitivity & Order Limit Optimization

Fixed fees ($F_{in} = ₦50, F_{out} = ₦50$) impose a variable cost per USDT depending on trade volume $V$. Percentage fees ($\phi = 0.3\%$) scale linearly with trade value.

### 5.1 Empirical Sensitivity Table Across Trade Sizes (at $P = ₦1,500.00$)

| Trade Fiat Size (NGN) | Volume $V$ (USDT) | Fixed Fiat Fee ($F_{in} + F_{out}$) | Fixed Fee Drag (₦/USDT) | Fixed Fee Drag (%) | Bybit Maker Fee (0.3% x 2) | Total Fee Load (₦/USDT) | Total Fee Drag (%) | Min Profitable Gross Spread Needed for +₦5.00 Net Spread |
|---|---|---|---|---|---|---|---|---|
| **₦5,000** | 3.33 USDT | ₦100.00 | **₦30.00 / USDT** | **2.00%** | ₦9.00 / USDT | **₦39.00 / USDT** | **2.60%** | **₦44.00 / USDT** |
| **₦10,000** | 6.67 USDT | ₦100.00 | **₦15.00 / USDT** | **1.00%** | ₦9.00 / USDT | **₦24.00 / USDT** | **1.60%** | **₦29.00 / USDT** |
| **₦30,000** | 20.00 USDT | ₦100.00 | **₦5.00 / USDT** | **0.33%** | ₦9.00 / USDT | **₦14.00 / USDT** | **0.93%** | **₦19.00 / USDT** |
| **₦50,000** | 33.33 USDT | ₦100.00 | **₦3.00 / USDT** | **0.20%** | ₦9.00 / USDT | **₦12.00 / USDT** | **0.80%** | **₦17.00 / USDT** |
| **₦100,000** | 66.67 USDT | ₦100.00 | **₦1.50 / USDT** | **0.10%** | ₦9.00 / USDT | **₦10.50 / USDT** | **0.70%** | **₦15.50 / USDT** |
| **₦500,000** | 333.33 USDT | ₦100.00 | **₦0.30 / USDT** | **0.02%** | ₦9.00 / USDT | **₦9.30 / USDT** | **0.62%** | **₦14.30 / USDT** |
| **₦1,000,000** | 666.67 USDT | ₦100.00 | **₦0.15 / USDT** | **0.01%** | ₦9.00 / USDT | **₦9.15 / USDT** | **0.61%** | **₦14.15 / USDT** |

### 5.2 Key Insights from Sensitivity Analysis:
1. **The ₦10,000 Kink Point**: For trades <= ₦10,000, fixed fiat fees (₦30.00 to ₦15.00/USDT) exceed the typical P2P market spread (₦10 to ₦15/USDT), causing **guaranteed negative net profit** on standard merchant ads.
2. **Optimal Recommended Minimum Limit**: To prevent fixed fees from consuming more than 20% of a standard ₦5.00 spread (<= ₦1.00/USDT fixed fee drag per leg), the target order volume must satisfy:
   $$V \ge \frac{F_{in}}{₦1.00} = 50\text{ USDT} \implies \text{Min Order Limit} \ge ₦75,000$$
   Or for a balanced limit where fixed fee drag <= 0.20% of trade value:
   $$V_{min} \ge \frac{F_{in} + F_{out}}{P \cdot 0.0020} = \frac{100}{1500 \cdot 0.0020} \approx 33.33\text{ USDT} \implies \text{Min Limit} \ge ₦50,000$$

### 5.3 Recommended Minimum Limit Algorithm (`calculateRecommendedLimits`)
```javascript
/**
 * Calculate recommended minimum and maximum order transaction limits
 * to bound fixed fiat fee drag within acceptable threshold (default 0.20% or maxFeeDragPerUnit)
 */
export function calculateRecommendedLimits({
  price = 1500.0,
  inflowFee = 50.0,
  outflowFee = 50.0,
  targetSpread = 5.0,
  maxFeeDragRatio = 0.20, // Max 20% of target spread allocated to fiat fee
  totalCapitalUsdt = 1000.0
} = {}) {
  const safePrice = price > 0 ? price : 1500.0;
  const maxFeePerUnit = Math.max(0.50, targetSpread * maxFeeDragRatio);
  
  // Single leg minimum volume to keep fee <= maxFeePerUnit
  const minVolBuy = inflowFee > 0 ? (inflowFee / maxFeePerUnit) : 10.0;
  const minVolSell = outflowFee > 0 ? (outflowFee / maxFeePerUnit) : 10.0;
  const minVol = Math.max(10.0, Math.max(minVolBuy, minVolSell));
  
  const minLimitNgn = Math.ceil((minVol * safePrice) / 1000) * 1000; // Round to nearest ₦1,000
  const maxLimitNgn = Math.floor((Math.max(minVol * 2, totalCapitalUsdt) * safePrice) / 5000) * 5000;

  return {
    minVolumeUsdt: minVol,
    minLimitNgn,
    maxLimitNgn,
    feeDragPerUnit: (inflowFee / minVol),
    feeDragPercent: ((inflowFee / (minVol * safePrice)) * 100)
  };
}
```

---

## 6. Proposed Implementation Blueprint

### 6.1 `js/pricingEngine.js` Refactor Proposal

```javascript
/**
 * Calculate Buy Ad pricing recommendation with Bybit 0.3% maker fee & fiat inflow fee
 */
export function calculateBuyPricing({
  activeBuyAds = [],
  sortedSellAds = [],
  targetSpread = 5.0,
  inflowFee = 50.0,
  outflowFee = 50.0,
  platformFeePct = 0.3, // Percentage, e.g. 0.3 for 0.3%
  avgVolume = 100.0,
  pricingMode = 'avg-10'
} = {}) {
  const validSellAds = Array.isArray(sortedSellAds) ? sortedSellAds.filter(ad => ad && typeof ad === 'object') : [];
  const topSellCompetitor = validSellAds[0];
  const exitPrice = topSellCompetitor ? (parseFloat(topSellCompetitor.price) || 0) : 0;
  const referenceBuyPrice = calculateReferencePrice(activeBuyAds, pricingMode);
  const safeAvgVol = (!avgVolume || isNaN(avgVolume) || avgVolume <= 0) ? 100 : avgVolume;
  const feeRate = Math.max(0, (platformFeePct || 0) / 100);

  if (exitPrice <= 0) {
    return {
      exitPrice: 0,
      referenceBuyPrice,
      maxBuyPrice: 0,
      rawSuggestedBuy: 0,
      suggestedBuy: 0,
      isSafe: false,
      excessSpread: 0,
      feePerUnit: 0,
      isOffline: true
    };
  }

  // Net Exit Revenue received after sell maker fee and outflow fiat fee
  const netExitRevenue = exitPrice * (1 - feeRate) - (outflowFee / safeAvgVol);

  // Maximum Buy Price to guarantee targetSpread net profit:
  // netExitRevenue - [ maxBuyPrice / (1 - feeRate) + (inflowFee / safeAvgVol) ] = targetSpread
  const maxBuyPrice = (1 - feeRate) * (netExitRevenue - targetSpread - (inflowFee / safeAvgVol));

  // Suggested Buy Price: outbid reference price by +₦0.10
  const rawSuggestedBuy = referenceBuyPrice > 0 ? (referenceBuyPrice + 0.10) : maxBuyPrice;
  const suggestedBuy = Math.min(rawSuggestedBuy, maxBuyPrice);
  const isSafe = rawSuggestedBuy <= maxBuyPrice;

  // Realized net excess spread per USDT at suggestedBuy
  const effectiveBuyCost = (suggestedBuy / (1 - feeRate)) + (inflowFee / safeAvgVol);
  const excessSpread = netExitRevenue - effectiveBuyCost;
  const totalFeePerUnit = (suggestedBuy * feeRate) + (inflowFee / safeAvgVol);

  return {
    exitPrice,
    referenceBuyPrice,
    maxBuyPrice: Math.max(0, maxBuyPrice),
    rawSuggestedBuy,
    suggestedBuy: Math.max(0, suggestedBuy),
    isSafe,
    excessSpread,
    feePerUnit: totalFeePerUnit,
    isOffline: false
  };
}

/**
 * Calculate Sell Ad pricing recommendation with Bybit 0.3% maker fee & fiat outflow fee
 */
export function calculateSellPricing({
  activeSellAds = [],
  costBasis = 0,
  targetSpread = 5.0,
  outflowFee = 50.0,
  platformFeePct = 0.3, // Percentage, e.g. 0.3 for 0.3%
  avgVolume = 100.0,
  pricingMode = 'avg-10'
} = {}) {
  const referenceSellPrice = calculateReferencePrice(activeSellAds, pricingMode);
  const safeAvgVol = (!avgVolume || isNaN(avgVolume) || avgVolume <= 0) ? 100 : avgVolume;
  const feeRate = Math.max(0, (platformFeePct || 0) / 100);
  const divisor = Math.max(0.0001, 1 - feeRate);

  if (costBasis <= 0) {
    return {
      referenceSellPrice,
      breakEven: 0,
      targetSellPrice: 0,
      rawSuggestedSell: 0,
      suggestedSell: 0,
      isSafe: false,
      sellSpread: 0,
      feePerUnit: 0,
      hasCostBasis: false,
      hasCompetitors: referenceSellPrice > 0
    };
  }

  // Break-even sell price: Price where net revenue = costBasis
  const breakEven = (costBasis + (outflowFee / safeAvgVol)) / divisor;

  // Target Sell price: Price where net revenue = costBasis + targetSpread
  const targetSellPrice = (costBasis + targetSpread + (outflowFee / safeAvgVol)) / divisor;

  if (referenceSellPrice <= 0) {
    return {
      referenceSellPrice: 0,
      breakEven,
      targetSellPrice,
      rawSuggestedSell: 0,
      suggestedSell: 0,
      isSafe: false,
      sellSpread: 0,
      feePerUnit: 0,
      hasCostBasis: true,
      hasCompetitors: false
    };
  }

  // Suggested Sell price: undercut reference by -₦0.10
  const rawSuggestedSell = referenceSellPrice - 0.10;
  const suggestedSell = Math.max(rawSuggestedSell, targetSellPrice);
  const isSafe = rawSuggestedSell >= targetSellPrice;

  // Net realized spread above cost basis at suggestedSell
  const netRevenue = (suggestedSell * (1 - feeRate)) - (outflowFee / safeAvgVol);
  const sellSpread = netRevenue - costBasis;
  const totalFeePerUnit = (suggestedSell * feeRate) + (outflowFee / safeAvgVol);

  return {
    referenceSellPrice,
    breakEven,
    targetSellPrice,
    rawSuggestedSell,
    suggestedSell,
    isSafe,
    sellSpread,
    feePerUnit: totalFeePerUnit,
    hasCostBasis: true,
    hasCompetitors: true
  };
}
```

---

### 6.2 `js/pricing.js` Updates
1. Add `input-platform-fee` (default `0.3`) to `loadSavedSettings`, `saveSettings`, and `setupListeners`.
2. Retrieve `platformFeePct` in `calculateMargins()`:
   ```javascript
   const platformFeePct = parseFloat(document.getElementById('input-platform-fee')?.value) ?? 0.3;
   ```
3. Pass `platformFeePct`, `inflowFee`, and `outflowFee` into both `calculateBuyPricing` and `calculateSellPricing`.
4. Render detailed fee breakdown badges in the Buy and Sell Assistant UI cards.

---

### 6.3 `js/views/pricing.view.js` Updates
1. Add input field in Settings Card:
   ```html
   <div class="form-group col-12 col-md-6">
     <label for="input-platform-fee" class="form-label">
       <i data-lucide="percent"></i> Bybit Maker Fee
     </label>
     <div class="input-affix-wrapper">
       <input type="number" step="0.05" min="0" id="input-platform-fee" class="form-input font-mono" value="0.30">
       <span class="input-suffix">% (0.3% default)</span>
     </div>
     <p class="form-helper">Platform transaction fee charged on P2P ad maker orders</p>
   </div>
   ```
2. Add Fee Breakdown and Recommended Order Limits widgets in the Buy & Sell Ad Assistant cards.

---

## 7. Verification Method & Test Matrix

To independently verify the implementation and math:

1. **Unit Test Suite (`test/tier1-feature-coverage/pricing-engine.test.js`)**:
   - Verify outbidding with `platformFeePct = 0.3%` and `inflowFee = 50.0`.
   - Verify undercutting with `platformFeePct = 0.3%` and `outflowFee = 50.0`.
   - Verify trade size tests across ₦5,000, ₦10,000, ₦30,000, ₦100,000.
   - Verify `calculateRecommendedLimits` bounds fixed fee drag below the specified ratio.
2. **Test Command**:
   ```bash
   node test/run-tests.js --tier=1
   ```
3. **Boundary Invariants to Assert**:
   - $P_{suggestedBuy} \le P_{maxBuy}$ strictly holds under all competitor bid conditions.
   - $P_{suggestedSell} \ge P_{targetSell}$ strictly holds under all competitor ask conditions.
   - At $P_{suggestedSell} = P_{targetSell}$, net profit $\equiv S_{target} \pm 10^{-5}$.
   - At $P_{suggestedBuy} = P_{maxBuy}$, net excess spread $\equiv S_{target} \pm 10^{-5}$.
