# Milestone 3 Test Report: Unit Testing & Trade Size Sensitivity Verification

**Author**: m3_worker_1 (Test Suite & Verification Writer)  
**Date**: 2026-09-02  
**Milestone**: M3 (Unit Testing & Trade Size Sensitivity Verification)  
**Test Suite Target**: `test/tier1-feature-coverage/pricing-engine.test.js`

---

## 1. Executive Summary
Milestone 3 expanded and verified the pure mathematical pricing and arbitrage engine test coverage in `test/tier1-feature-coverage/pricing-engine.test.js`. The suite delivers complete test coverage across 10 functional sections, establishing exhaustive mathematical verification for platform maker percentage fees (0.30% default and custom tiers), fixed fiat transfer fee amortizations (₦50 default and custom tiers), simultaneous round-trip fee accounting, recommended minimum order limits ($\le 20\%$ target spread fee drag), and explicit trade size tier sensitivity (₦5,000, ₦10,000, ₦30,000, ₦100,000).

---

## 2. Test Suite Architecture & Coverage Matrix

| Section # | Test ID Prefix | Coverage Focus | Test Count | Key Invariants Verified |
|---|---|---|---|---|
| **1** | `PE.FILT.1-7` | Competitor Ad Filtering | 7 | Null/empty input rejection, dust filtering threshold ($\max(2.0, V \times 0.05)$), transaction limit bounds (`minAmount`, `maxAmount`, `minSingleTransAmount`, `maxSingleTransAmount`), malformed array fault tolerance. |
| **2** | `PE.REF.1-7` | Reference Price Computation | 7 | Null/empty safety (returns 0), mode `competitor` top-of-book extraction, mode `avg-N` arithmetic mean, mode `vwap-N` volume-weighted average price, zero-volume fallback, out-of-bounds `N` handling. |
| **3** | `PE.BUY.1-5` | Buy Ad Assistant Pricing | 5 | Standard outbidding (+₦0.10), spread compression capping at `maxBuyPrice` (`isSafe: false`), offline market depth zeroing, empty competitor buy fallback, zero inflow fee resilience. |
| **4** | `PE.SELL.1-5` | Sell Ad Assistant Pricing | 5 | Standard undercutting (-₦0.10), competitor undercut floor at `targetSellPrice` (`isSafe: false`), missing cost basis guard, empty sell competitor handling, negative cost basis guard. |
| **5** | `PE.BND.1-3` | Boundary & Extreme Values | 3 | Zero/negative/NaN `avgVolume` fallback to 100 USDT, high fee unit amortization, negative target spread handling. |
| **6** | `PE.FEE.1-6` | Platform Maker Fee Math | 6 | Bybit 0.30% maker fee math on exit and entry legs in `calculateBuyPricing`, 0.30% maker fee in `calculateSellPricing` for break-even and target sell rates, custom fee tiers (0%, 0.1%, 0.5%, 1.0%, 2.0%), dual-format fee normalization (percentage notation `0.3` vs fraction `0.003`), negative/NaN fee clamping, 100% fee edge case divisor floor. |
| **7** | `PE.FIAT.1-2` | Fiat Transfer Fee Amortization | 2 | Per-unit fiat amortization ($F/V$) across varying trade volumes (10, 50, 100, 500, 1000 USDT), custom fiat fees (₦0, ₦25, ₦50, ₦100, ₦250) in buy and sell engines. |
| **8** | `PE.SIM.1-5` | Simultaneous Fee Accounting | 4 | True net acquisition cost basis matches cash outlay ($P_{buy}/(1-\phi) + F_{in}/V$), break-even sell price yields exactly ₦0.00 net profit after all fees, target sell price guarantees exact $S_{target}$ net profit, full round-trip buy+sell arbitrage cycle net profit invariant conservation. |
| **9** | `PE.LIM.1-6` | Recommended Minimum Limits | 6 | 20% max fee drag bounding, positional parameter signature, inverse scaling across custom `maxFeeDragRatio` (10%, 15%, 25%, 50%), break-even volume (100% drag wipeout), edge case handling (0 spread, 0 fee, negative price), localized Naira (`₦`) string formatting. |
| **10** | `PE.TIER.1-6` | Trade Size Sensitivity Tests | 6 | Explicit testing of ₦5k (300% fee drag, guaranteed loss), ₦10k (150% fee drag, boundary threshold), ₦30k (50% fee drag, viable spread), ₦100k (15% fee drag, optimal $\le 20\%$ execution), 5-tier comparative sensitivity matrix (including institutional ₦500k), and cross-spread sensitivity matrix (₦2, ₦5, ₦10, ₦20). |

---

## 3. Mathematical Verification Details

### 3.1. Platform Maker Fee Invariant Verification
- **Buy Leg ($P_{maxBuy}$)**:
  $$P_{maxBuy} = (1 - \phi) \left[ P_{exit}(1 - \phi) - S_{target} - \frac{F_{in} + F_{out}}{V} \right]$$
  For $P_{exit} = 1520.00$, $S_{target} = 5.0$, $F_{in} = 50$, $F_{out} = 50$, $V = 100$, $\phi = 0.003$:
  $$P_{maxBuy} = 0.997 \times [1520 \times 0.997 - 0.50 - 5.0 - 0.50] = 0.997 \times 1509.44 = 1504.91168 \text{ NGN/USDT}$$
  Verified to $10^{-4}$ precision.
- **Sell Leg ($P_{breakEven}$ & $P_{targetSell}$)**:
  $$P_{breakEven} = \frac{C_{fifo} + \frac{F_{out}}{V}}{1 - \phi} = \frac{1500 + 0.50}{0.997} = 1505.015045 \text{ NGN/USDT}$$
  $$P_{targetSell} = \frac{C_{fifo} + S_{target} + \frac{F_{out}}{V}}{1 - \phi} = \frac{1500 + 5.0 + 0.50}{0.997} = 1510.030090 \text{ NGN/USDT}$$
  Verified to $10^{-4}$ precision.

### 3.2. Trade Size Sensitivity Tier Analysis
At baseline reference price $P = 1500 \text{ NGN/USDT}$, fixed fiat fee $F = ₦50$, target spread $S_{target} = ₦5.00$:

1. **Tier 1: ₦5,000 Micro-Trade**
   - Volume: $V = 5,000 / 1,500 = 3.3333 \text{ USDT}$
   - Fee Drag: $50 / 3.3333 = ₦15.00/\text{USDT}$
   - Drag as % of Spread: $15.00 / 5.00 = 300\%$
   - Net Realized Margin: $5.00 - 15.00 = -₦10.00/\text{USDT}$ (**Guaranteed Net Loss**)
   - Classification: Below break-even volume ($10.0 \text{ USDT}$) and below recommended limit ($50.0 \text{ USDT}$).

2. **Tier 2: ₦10,000 Boundary Trade**
   - Volume: $V = 10,000 / 1,500 = 6.6667 \text{ USDT}$
   - Fee Drag: $50 / 6.6667 = ₦7.50/\text{USDT}$
   - Drag on ₦5.00 spread: $7.50 / 5.00 = 150\%$ ($-₦2.50/\text{USDT}$ loss)
   - Drag on ₦10.00 spread: $7.50 / 10.00 = 75\%$ ($+₦2.50/\text{USDT}$ profit)
   - Classification: Critical threshold boundary; requires spread $\ge ₦7.50$ to break even.

3. **Tier 3: ₦30,000 Viable Spread Trade**
   - Volume: $V = 30,000 / 1,500 = 20.00 \text{ USDT}$
   - Fee Drag: $50 / 20.00 = ₦2.50/\text{USDT}$
   - Drag as % of Spread: $2.50 / 5.00 = 50\%$
   - Net Realized Margin: $5.00 - 2.50 = +₦2.50/\text{USDT}$ (**50% spread retention**)
   - Classification: Viable profitable execution; exceeds break-even volume.

4. **Tier 4: ₦100,000 Optimal Execution Trade**
   - Volume: $V = 100,000 / 1,500 = 66.6667 \text{ USDT}$
   - Fee Drag: $50 / 66.6667 = ₦0.75/\text{USDT}$
   - Drag as % of Spread: $0.75 / 5.00 = 15\%$ ($\le 20\%$ target constraint)
   - Net Realized Margin: $5.00 - 0.75 = +₦4.25/\text{USDT}$ (**85% spread retention**)
   - Classification: Optimal low-drag execution; meets and exceeds recommended minimum limit ($50.0 \text{ USDT}$).

---

## 4. Test Suite Execution & Verification Results

### Test Execution Command
```powershell
node test/run-tests.js
```

### Output Summary
```
------------------------------------------------------
Test Execution Summary:
Total Tests : 733
Passed      : 733
Failed      : 0
Duration    : 29277ms

Tier Breakdown:
  Tier 1  : 475/475 passed (100.0%)
  Tier 2  : 159/159 passed (100.0%)
  Tier 3  : 14/14 passed (100.0%)
  Tier 4  : 10/10 passed (100.0%)
  Tier 5  : 75/75 passed (100.0%)
======================================================
```
- **Total Tests**: 733
- **Passing Tests**: 733 (100.0%)
- **Failing Tests**: 0
- **Regressions**: 0
