# Challenge Report: Iteration 2 Empirical Math & Test Verification

**Verdict**: **`APPROVE`**
**Target**: `js/pricingEngine.js`, `test/tier1-feature-coverage/pricing-engine.test.js`, and Iteration 2 Pricing Engine Math Models.
**Author**: `challenger_it2_1`
**Timestamp**: 2026-09-01T14:30:00Z

---

## 1. Executive Summary
An empirical investigation was conducted on the Pricing & Arbitrage Engine (`js/pricingEngine.js`) and its associated test harnesses. We executed the test suites, tested mathematical safety invariants, evaluated outbidding/undercutting mechanics, assessed dust/limit filtering, and ran Monte Carlo fuzzing over 8,000 randomized market configurations.

The pricing engine implementation exhibits mathematical determinism, correct spread cap and floor clamping, accurate fee amortizations, and robust edge-case handling. All pricing engine unit tests, invariant stress suites, and boundary fuzzing suites passed with 0 failures.

---

## 2. Empirical Test Execution Results

### 2.1 Test Suite Run (`node test/run-tests.js --tier=1`)
- **Total Tests Executed in Tier 1**: 421
- **Tier 1 Pass Rate**: 415 / 421 (98.6%)
- **Pricing Engine Domain Tests**: 100% Pass (0 failures)
  - `test/tier1-feature-coverage/pricing-engine.test.js`: **24/24 Passed (100%)**
  - `test/challenger-1-empirical-pricing-stress.test.js`: **13/13 Passed (100%)**
  - `test/challenger-2-boundary-fuzzing-stress.test.js`: **15/15 Passed (100%)**
- **Non-Pricing Engine Failures Observed (6)**:
  - 3 failures in `r4-m4-historical-analytics.test.js` (M4 historical analytics table DOM rendering)
  - 2 failures in `active-buy-sell-ads.test.js` (ADS.5, ADS.17 status formatting strings)
  - 1 failure in `challenger-m2-reactivity-adversarial.test.js` (3.3 reference rate fallback label formatting)
  *(None of these failures are related to `pricingEngine.js` or Iteration 2 math models).*

---

## 3. Mathematical Model Empirical Verification

### 3.1 Buy Pricing Model (`calculateBuyPricing`)
- **Mathematical Formula**:
  $$\text{maxBuyPrice} = \text{exitPrice} - \text{targetSpread} - \frac{\text{inflowFee}}{\text{safeAvgVol}}$$
  $$\text{rawSuggestedBuy} = \text{referenceBuyPrice} + 0.10$$
  $$\text{suggestedBuy} = \min(\text{rawSuggestedBuy}, \text{maxBuyPrice})$$
  $$\text{isSafe} = (\text{rawSuggestedBuy} \le \text{maxBuyPrice})$$
- **Verification Results**:
  1. **Outbid Increment**: Standard outbid adds exactly $+₦0.10$ to the reference price. Verified across regular and fractional decimals.
  2. **Spread Cap Protection**: When competitor bids compress margins ($\text{rawSuggestedBuy} > \text{maxBuyPrice}$), `suggestedBuy` is strictly capped at `maxBuyPrice`, setting `isSafe: false` and maintaining the minimum target spread without buying at a deficit. Verified across 1,000 fuzzed states.
  3. **Offline / Missing Market Depth**: When sell depth is empty or top ask is $\le 0$, returns `isOffline: true`, `exitPrice: 0`, `suggestedBuy: 0`, and `isSafe: false`.
  4. **Volume Safeguards**: Zero, negative, or `NaN` volume safely defaults to 100 USDT, preventing division-by-zero errors.

### 3.2 Sell Pricing Model (`calculateSellPricing`)
- **Mathematical Formula**:
  $$\text{breakEven} = \text{costBasis} + \frac{\text{outflowFee}}{\text{safeAvgVol}}$$
  $$\text{targetSellPrice} = \text{costBasis} + \text{targetSpread} + \frac{\text{outflowFee}}{\text{safeAvgVol}}$$
  $$\text{rawSuggestedSell} = \text{referenceSellPrice} - 0.10$$
  $$\text{suggestedSell} = \max(\text{rawSuggestedSell}, \text{targetSellPrice})$$
  $$\text{isSafe} = (\text{rawSuggestedSell} \ge \text{targetSellPrice})$$
- **Verification Results**:
  1. **Undercut Increment**: Standard undercut subtracts exactly $-₦0.10$ from the reference price.
  2. **Spread Floor Protection**: When market sell prices drop below the target margin ($\text{rawSuggestedSell} < \text{targetSellPrice}$), `suggestedSell` is strictly floored at `targetSellPrice`, setting `isSafe: false` and protecting the inventory cost basis. Verified across 1,000 fuzzed states.
  3. **Zero / Missing Cost Basis**: When `costBasis <= 0`, returns `hasCostBasis: false`, `suggestedSell: 0`, and `isSafe: false`.
  4. **Missing Competitor Depth**: When active sell depth is empty, returns `hasCompetitors: false` while computing deterministic `breakEven` and `targetSellPrice`.

### 3.3 Reference Price Strategies (`calculateReferencePrice`)
- **Competitor Top 1**: Returns top ad price directly.
- **SMA-N (`avg-N`)**: Computes unweighted arithmetic mean across top $N$ ads: $\frac{1}{N}\sum_{i=1}^N P_i$.
- **VWAP-N (`vwap-N`)**: Computes volume-weighted average price: $\frac{\sum P_i Q_i}{\sum Q_i}$. Gracefully falls back to top price if total volume is 0.
- **Malformed Inputs**: Null, undefined, empty array, or unknown pricing modes safely default without throwing exceptions.

### 3.4 Dust & Limit Filtering (`filterCompetitorAds`)
- **Dust Threshold**: Filter enforces $\text{minQty} = \max(2.0, \text{safeAvgVol} \times 0.05)$.
  - For 100 USDT volume: threshold is 5.0 USDT.
  - For small volume (e.g. 10 USDT): threshold enforces absolute floor of 2.0 USDT.
- **Transaction Limits**: Evaluates $\text{tradeAmount} = \text{safeAvgVol} \times \text{price}$. Rejects ads where $\text{tradeAmount} < \text{minAmount}$ or $\text{tradeAmount} > \text{maxAmount}$. Supports Bybit alternative fields `minSingleTransAmount` and `maxSingleTransAmount`.
- **Corrupted Inputs**: Nulls, non-objects, and missing limit fields handled cleanly.

---

## 4. Adversarial Stress & Fuzzing Assessment

| Challenge Area | Adversarial Test Scenario | Expected Outcome | Actual Result | Verdict |
|---|---|---|---|:---:|
| **Spread Cap Invariant** | 1,000 random buy market depths with volatile competitor bids | $\text{suggestedBuy} \le \text{maxBuyPrice} + 10^{-9}$ | 1,000 / 1,000 passed | **PASS** |
| **Spread Floor Invariant** | 1,000 random sell market depths with depressed competitor asks | $\text{suggestedSell} \ge \text{targetSellPrice} - 10^{-9}$ | 1,000 / 1,000 passed | **PASS** |
| **Monte Carlo Fuzzing** | 5,000 randomized orderbooks with random modes, spreads, and fees | No NaN, no unbounded prices, strict invariant adherence | 5,000 / 5,000 passed | **PASS** |
| **Dust Boundary Testing** | 2,000 randomized ad collections around threshold $\pm\epsilon$ | Accurate dust elimination per formula | 2,000 / 2,000 passed | **PASS** |
| **Consecutive Cycles** | 100 consecutive buy/sell arbitrage cycles with FIFO cost updates | Continuous invariant preservation | 100 / 100 passed | **PASS** |

---

## 5. Unchallenged Areas / Out-of-Scope
- Backend proxy network latency against live Bybit API endpoints (simulated via mock payloads in test harness).
- UI chart rendering components covered under Milestone 4 tests.

---

## 6. Final Recommendation
**Verdict**: **`APPROVE`**
The math models and test executions for Iteration 2 meet all functional, mathematical, and adversarial safety requirements.
