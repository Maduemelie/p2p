# Technical Remediation Report: Test Runner Scoping Defect in `pricing-engine.test.js`

**Agent**: `explorer_it2_1`  
**Working Directory**: `c:\dev\p2p\.agents\explorer_it2_1`  
**Date**: 2026-09-01T13:22:00Z  
**Target Files**: `test/tier1-feature-coverage/pricing-engine.test.js`, `test/harness/test-runner.js`, `js/pricingEngine.js`  

---

## 1. Executive Summary

During the forensic integrity audit conducted by `auditor_1` and code reviews by `reviewer_1` and `reviewer_2`, a critical execution failure was discovered in the newly introduced Tier 1 test file `test/tier1-feature-coverage/pricing-engine.test.js`. When executed under the project test harness (`node test/run-tests.js --tier=1`), all unit tests in `pricing-engine.test.js` crashed with:
```text
TypeError: Cannot read properties of undefined (reading 'filterCompetitorAds' | 'calculateReferencePrice' | 'calculateBuyPricing' | 'calculateSellPricing')
```

This report provides the exhaustive root-cause analysis of how `test/harness/test-runner.js` manages suite lifecycles and hook registration, compares this against the established conventions across all other Tier 1 suites, verifies the domain mathematical logic in `js/pricingEngine.js`, and formulates an actionable, drop-in remediation plan.

---

## 2. Root-Cause Analysis: `test-runner.js` Lifecycle Architecture

### 2.1 Test Harness Suite Lifecycle Mechanics
In `test/harness/test-runner.js`, test organization is handled by `TestSuiteContext`:

```javascript
class TestSuiteContext {
  constructor() {
    this.suites = [];
    this.currentSuite = null;
    this.beforeAllHooks = [];
    this.afterAllHooks = [];
  }

  describe(title, fn, options = {}) {
    const suite = {
      title,
      tier: options.tier || 1,
      category: options.category || 'General',
      tests: [],
      beforeEachHooks: [],
      afterEachHooks: [],
      beforeAllHooks: [],
      afterAllHooks: []
    };

    const prevSuite = this.currentSuite;
    this.currentSuite = suite;
    this.suites.push(suite);

    try {
      fn();
    } finally {
      this.currentSuite = prevSuite;
    }
  }

  it(title, fn) {
    if (!this.currentSuite) {
      throw new Error(`Test "${title}" must be defined inside a describe() block.`);
    }
    this.currentSuite.tests.push({
      title,
      fn,
      status: 'pending',
      error: null,
      duration: 0
    });
  }

  beforeEach(fn) {
    if (this.currentSuite) this.currentSuite.beforeEachHooks.push(fn);
  }
}
```

### 2.2 The Scoping Breakdown
When `pricing-engine.test.js` was structured with nested `describe()` blocks:
```javascript
let pricingEngine;

describe('Tier 1 — Pricing & Arbitrage Engine Unit Tests', () => {
  beforeEach(async () => {
    pricingEngine = await import('../../js/pricingEngine.js');
  });

  describe('filterCompetitorAds', () => {
    it('PE.FILT.1: ...', () => {
      pricingEngine.filterCompetitorAds(...);
    });
  });
  // ... other nested describe blocks
}, { tier: 1, category: 'Pricing Engine' });
```

The execution flow during module load and runner execution was:
1. **Module Registration Phase**:
   - `describe('Tier 1 — Pricing...')` creates `Suite_0` and pushes it to `this.suites`. `this.currentSuite` is set to `Suite_0`.
   - Inside `Suite_0`, `beforeEach(async () => { pricingEngine = await import(...) })` is called. The hook is pushed into `Suite_0.beforeEachHooks`.
   - Next, `describe('filterCompetitorAds')` creates `Suite_1` and pushes it to `this.suites`. `this.currentSuite` is set to `Suite_1`.
   - Inside `Suite_1`, `it('PE.FILT.1', ...)` registers tests into `Suite_1.tests`. **Crucially, `Suite_1.beforeEachHooks` is an empty array `[]`**.
   - `Suite_1` completes, restoring `this.currentSuite` to `Suite_0`.
   - Subsequent child `describe()` calls create `Suite_2`, `Suite_3`, `Suite_4`, and `Suite_5`, each with `beforeEachHooks = []`.
   - `Suite_0` finishes with `Suite_0.tests = []` (0 direct tests).

2. **Runner Execution Phase (`TestRunner.run()`)**:
   - The runner loops over each suite in `this.context.suites` sequentially:
     ```javascript
     for (const suite of this.context.suites) {
       for (const hook of suite.beforeAllHooks) { await hook(); }
       for (const t of suite.tests) {
         for (const hook of suite.beforeEachHooks) { await hook(); }
         await t.fn();
         // ...
       }
       for (const hook of suite.afterAllHooks) { await hook(); }
     }
     ```
   - **`Suite_0`**: `suite.tests.length === 0`. The runner loops over 0 tests, so `Suite_0.beforeEachHooks` is **never invoked**.
   - **`Suite_1` (`filterCompetitorAds`)**: `suite.tests` contains 6 tests. For each test, it executes `Suite_1.beforeEachHooks` (which is empty). `pricingEngine` remains `undefined`. `t.fn()` immediately throws `TypeError: Cannot read properties of undefined (reading 'filterCompetitorAds')`.
   - **`Suite_2`–`Suite_5`**: Identical crash for all remaining 17 tests.

3. **Key Finding**: `test-runner.js` was designed as a flat multi-suite coordinator, not a hierarchical tree runner like Jest or Mocha. It contains **no hook inheritance or cascading mechanism** between parent and child `describe()` scopes.

---

## 3. Comparative Architecture Across Tier 1 Test Suites

An exhaustive audit of all existing Tier 1 test files in `test/tier1-feature-coverage/` reveals the established architectural convention:

| Test File | Structure | Hook Placement | Status |
|-----------|-----------|----------------|:------:|
| `r1-m1-calculation-engine.test.js` | Single top-level `describe()` | `beforeEach` at top of describe | **PASS** |
| `r1-m2-net-worth-widget.test.js` | Single top-level `describe()` | `beforeEach` at top of describe | **PASS** |
| `r1-m3-snapshot-modal.test.js` | Single top-level `describe()` | `beforeEach` at top of describe | **PASS** |
| `net-worth-features.test.js` | Single top-level `describe()` | `beforeEach` at top of describe | **PASS** |
| `r1-api-security.test.js` | Single top-level `describe()` | Top-level imports / inline handlers | **PASS** |
| `r2-fifo-accounting.test.js` | Single top-level `describe()` | `beforeEach` at top of describe | **PASS** |
| `r3-multi-bank-reconciliation.test.js` | Single top-level `describe()` | `beforeEach` at top of describe | **PASS** |
| `r4-search-navigation.test.js` | Single top-level `describe()` | `beforeEach` at top of describe | **PASS** |
| `r4-m4-historical-analytics.test.js` | Single top-level `describe()` | `beforeEach` at top of describe | **PASS** |
| `r5-offline-pwa.test.js` | Single top-level `describe()` | `beforeEach` at top of describe | **PASS** |
| `active-buy-sell-ads.test.js` | Single top-level `describe()` | `beforeEach` at top of describe | **PASS** |
| `pricing-engine.test.js` (Defective) | 1 outer `describe` + 5 nested `describe` | `beforeEach` on outer describe | **FAIL** |

**Conclusion**: The flat single `describe()` architecture is the universal standard for all Tier 1 feature coverage suites in this project. `pricing-engine.test.js` was the sole outlier using nested `describe()` blocks.

---

## 4. Domain Logic & Assertion Authenticity Verification

Static and algorithmic analysis was performed on all 23 test assertions in `pricing-engine.test.js` against the implementation in `js/pricingEngine.js`:

### 4.1 Filter Competitor Ads (`filterCompetitorAds`)
- **Dust Filter Formula**: $\text{minQty} = \max(2.0, \text{safeAvgVol} \times 0.05)$.
  - For $\text{avgVolume} = 100$: $\text{minQty} = 5.0$ USDT. Test `PE.FILT.2` validates filtering $4.9$ USDT dust while keeping $\ge 5.0$ USDT.
  - For $\text{avgVolume} = 10$: $\text{minQty} = 2.0$ USDT. Test `PE.FILT.3` validates filtering $1.9$ USDT dust while keeping $\ge 2.0$ USDT.
- **Trade Limits**: $\text{tradeAmount} = \text{safeAvgVol} \times \text{price}$. Test `PE.FILT.4` tests bounds $[\text{minAmount}, \text{maxAmount}]$, and `PE.FILT.6` tests Bybit aliases `minSingleTransAmount` / `maxSingleTransAmount`.
- **Verdict**: Fully sound, rigorous, and authentic.

### 4.2 Reference Price Computation (`calculateReferencePrice`)
- **Modes**:
  - `competitor`: Returns top ad price directly (`PE.REF.2`).
  - `avg-N`: Computes unweighted arithmetic mean $\frac{1}{N} \sum P_i$ (`PE.REF.3`).
  - `vwap-N`: Computes volume-weighted average price $\frac{\sum P_i Q_i}{\sum Q_i}$ (`PE.REF.4`).
- **Guards**: Empty collections return `0` (`PE.REF.1`), zero total volume in VWAP falls back to top price (`PE.REF.5`), $N > \text{available}$ handles graceful truncation (`PE.REF.6`).
- **Verdict**: Mathematically exact.

### 4.3 Buy Pricing Math (`calculateBuyPricing`)
- **Outbid Delta**: $\text{rawSuggestedBuy} = \text{referenceBuyPrice} + 0.10$ (`PE.BUY.1`).
- **Spread Cap Protection**:
  $$\text{maxBuyPrice} = P_{\text{exit}} - \text{targetSpread} - \left(\frac{\text{inflowFee}}{\text{safeAvgVol}}\right)$$
  $$\text{suggestedBuy} = \min(\text{rawSuggestedBuy}, \text{maxBuyPrice})$$
- **Safety Status**: $\text{isSafe} = (\text{rawSuggestedBuy} \le \text{maxBuyPrice})$. Test `PE.BUY.2` validates spread compression capping and safety flag flipping.
- **Edge States**: Empty sell orderbook sets `isOffline: true` (`PE.BUY.3`), empty active buy orderbook defaults suggested rate to `maxBuyPrice` with `isSafe: true` (`PE.BUY.4`).
- **Verdict**: Mathematically exact and aligns with ORIGINAL_REQUEST R2.

### 4.4 Sell Pricing Math (`calculateSellPricing`)
- **Undercut Delta**: $\text{rawSuggestedSell} = \text{referenceSellPrice} - 0.10$ (`PE.SELL.1`).
- **Break-Even & Target Floors**:
  $$\text{breakEven} = \text{costBasis} + \left(\frac{\text{outflowFee}}{\text{safeAvgVol}}\right)$$
  $$\text{targetSellPrice} = \text{costBasis} + \text{targetSpread} + \left(\frac{\text{outflowFee}}{\text{safeAvgVol}}\right)$$
  $$\text{suggestedSell} = \max(\text{rawSuggestedSell}, \text{targetSellPrice})$$
- **Safety Status**: $\text{isSafe} = (\text{rawSuggestedSell} \ge \text{targetSellPrice})$. Test `PE.SELL.2` validates floored undercut and safety flag flipping.
- **Edge States**: Missing cost basis sets `hasCostBasis: false`, `isSafe: false` (`PE.SELL.3`), empty sell orderbook computes break-even and target sell rate (`PE.SELL.4`).
- **Verdict**: Mathematically exact and aligns with ORIGINAL_REQUEST R2.

### 4.5 Boundary & Extreme Value Robustness
- **Invalid Volume Fallback**: Non-numeric, negative, or zero volume defaults safely to 100 USDT without producing `NaN` or `Infinity` (`PE.BND.1`).
- **Fee Amortization**: Large fees correctly amortized per unit volume (`PE.BND.2`).
- **Negative Target Spread**: Handled deterministically without throwing exceptions (`PE.BND.3`).
- **Verdict**: Robust and adversarial-hardened.

---

## 5. Concrete Remediation Plan

### 5.1 Evaluated Strategies

| Strategy | Description | Architectural Fit | Recommendation |
|----------|-------------|:-----------------:|:--------------:|
| **Option A: Canonical Suite Flattening** | Remove 5 inner `describe()` blocks, place all 23 `it()` blocks directly inside top-level `describe()` with `beforeEach` module import. | **100% (Native Project Pattern)** | **SELECTED (Canonical)** |
| **Option B: Helper Accessor (`getEngine()`)** | Introduce async helper function to resolve `pricingEngine` dynamically inside each test. | 75% (Adds boilerplate) | Alternative |
| **Option C: Top-Level `beforeAll` at File Scope** | Place `beforeAll` outside `describe` blocks. | 50% (Sub-suites lose tier/category metadata) | Not Recommended |

### 5.2 Remediation Specification (Option A)

The recommended fix replaces `test/tier1-feature-coverage/pricing-engine.test.js` with the canonical flat structure.

#### Key Structural Changes:
1. Import `{ describe, it, beforeEach }` from `../harness/test-runner`.
2. Define a single top-level `describe('Tier 1 — Pricing & Arbitrage Engine Unit Tests', () => { ... }, { tier: 1, category: 'Pricing Engine' })`.
3. Declare `let pricingEngine;` and `beforeEach(async () => { pricingEngine = await import('../../js/pricingEngine.js'); });` at the top of the suite.
4. Convert all 5 inner `describe` blocks into clean section comments:
   - `// 1. Competitor Ad Filtering (filterCompetitorAds)` (PE.FILT.1–6)
   - `// 2. Reference Price Computation (calculateReferencePrice)` (PE.REF.1–6)
   - `// 3. Buy Ad Assistant Pricing (calculateBuyPricing)` (PE.BUY.1–4)
   - `// 4. Sell Ad Assistant Pricing (calculateSellPricing)` (PE.SELL.1–4)
   - `// 5. Boundary & Extreme Value Robustness` (PE.BND.1–3)

#### Proposed File Content (`proposed_pricing-engine.test.js`):

```javascript
/**
 * Tier 1: Feature Coverage — Pricing & Arbitrage Engine Unit Tests
 * Pure mathematical determinism, reference pricing strategies, outbidding/undercutting,
 * spread protection caps and floors, dust filtering, and boundary resilience.
 */

const { describe, it, beforeEach } = require('../harness/test-runner');
const { assert } = require('../harness/assertions');

describe('Tier 1 — Pricing & Arbitrage Engine Unit Tests', () => {
  let pricingEngine;

  beforeEach(async () => {
    pricingEngine = await import('../../js/pricingEngine.js');
  });

  // ==========================================
  // 1. Competitor Ad Filtering (filterCompetitorAds)
  // ==========================================
  it('PE.FILT.1: Returns empty array for non-array, null, or undefined inputs', () => {
    assert.deepStrictEqual(pricingEngine.filterCompetitorAds(null), []);
    assert.deepStrictEqual(pricingEngine.filterCompetitorAds(undefined), []);
    assert.deepStrictEqual(pricingEngine.filterCompetitorAds('not-an-array'), []);
    assert.deepStrictEqual(pricingEngine.filterCompetitorAds({}), []);
    assert.deepStrictEqual(pricingEngine.filterCompetitorAds([]), []);
  });

  it('PE.FILT.2: Dust filter removes ads with quantity below max(2.0, avgVol * 0.05)', () => {
    const ads = [
      { price: '1500.00', lastQuantity: '4.9', minAmount: '1000', maxAmount: '500000' },
      { price: '1500.10', lastQuantity: '5.0', minAmount: '1000', maxAmount: '500000' },
      { price: '1500.20', lastQuantity: '100.0', minAmount: '1000', maxAmount: '500000' }
    ];
    const filtered = pricingEngine.filterCompetitorAds(ads, 100, false);
    assert.strictEqual(filtered.length, 2, 'Should discard the 4.9 USDT dust ad');
    assert.strictEqual(filtered[0].price, '1500.10');
    assert.strictEqual(filtered[1].price, '1500.20');
  });

  it('PE.FILT.3: Dust filter enforces absolute minimum of 2.0 USDT for small trade volumes', () => {
    const ads = [
      { price: '1500.00', lastQuantity: '1.9', minAmount: '1000', maxAmount: '500000' },
      { price: '1500.10', lastQuantity: '2.0', minAmount: '1000', maxAmount: '500000' }
    ];
    const filtered = pricingEngine.filterCompetitorAds(ads, 10, false);
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].price, '1500.10');
  });

  it('PE.FILT.4: Transaction limits filter rejects ads when target trade fiat amount is outside bounds', () => {
    const ads = [
      { price: '1500.00', lastQuantity: '500', minAmount: '200000', maxAmount: '1000000' },
      { price: '1500.00', lastQuantity: '500', minAmount: '50000', maxAmount: '100000' },
      { price: '1500.00', lastQuantity: '500', minAmount: '50000', maxAmount: '500000' }
    ];
    const filtered = pricingEngine.filterCompetitorAds(ads, 100, true);
    assert.strictEqual(filtered.length, 1, 'Only ads enclosing 150k NGN trade amount should survive');
    assert.strictEqual(filtered[0].minAmount, '50000');
    assert.strictEqual(filtered[0].maxAmount, '500000');
  });

  it('PE.FILT.5: Disabling filterLimits flag bypasses transaction limit checks', () => {
    const ads = [
      { price: '1500.00', lastQuantity: '500', minAmount: '200000', maxAmount: '1000000' },
      { price: '1500.00', lastQuantity: '500', minAmount: '50000', maxAmount: '500000' }
    ];
    const filtered = pricingEngine.filterCompetitorAds(ads, 100, false);
    assert.strictEqual(filtered.length, 2, 'All non-dust ads should survive when filterLimits is false');
  });

  it('PE.FILT.6: Supports alternative Bybit property names (minSingleTransAmount, maxSingleTransAmount)', () => {
    const ads = [
      { price: '1500.00', lastQuantity: '500', minSingleTransAmount: '200000', maxSingleTransAmount: '1000000' },
      { price: '1500.00', lastQuantity: '500', minSingleTransAmount: '10000', maxSingleTransAmount: '500000' }
    ];
    const filtered = pricingEngine.filterCompetitorAds(ads, 100, true);
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].minSingleTransAmount, '10000');
  });

  // ==========================================
  // 2. Reference Price Computation (calculateReferencePrice)
  // ==========================================
  const sampleAds = [
    { price: '1500.00', lastQuantity: '100' },
    { price: '1510.00', lastQuantity: '200' },
    { price: '1520.00', lastQuantity: '300' },
    { price: '1530.00', lastQuantity: '400' },
    { price: '1540.00', lastQuantity: '500' }
  ];

  it('PE.REF.1: Returns 0 for empty, null, or invalid ad collections', () => {
    assert.strictEqual(pricingEngine.calculateReferencePrice([], 'competitor'), 0);
    assert.strictEqual(pricingEngine.calculateReferencePrice(null, 'avg-10'), 0);
    assert.strictEqual(pricingEngine.calculateReferencePrice([null, undefined], 'vwap-5'), 0);
  });

  it('PE.REF.2: Mode "competitor" returns top ad price exactly', () => {
    const ref = pricingEngine.calculateReferencePrice(sampleAds, 'competitor');
    assert.strictEqual(ref, 1500.00);
  });

  it('PE.REF.3: Mode "avg-N" computes simple arithmetic mean across top N ads', () => {
    const ref3 = pricingEngine.calculateReferencePrice(sampleAds, 'avg-3');
    assert.closeTo(ref3, 1510.00, 0.001);
    const ref5 = pricingEngine.calculateReferencePrice(sampleAds, 'avg-5');
    assert.closeTo(ref5, 1520.00, 0.001);
  });

  it('PE.REF.4: Mode "vwap-N" computes volume-weighted average price across top N ads', () => {
    const vwap3 = pricingEngine.calculateReferencePrice(sampleAds, 'vwap-3');
    assert.closeTo(vwap3, 1513.3333, 0.001);
  });

  it('PE.REF.5: Fallback gracefully to top price if total volume in VWAP is 0', () => {
    const zeroQtyAds = [
      { price: '1550.00', lastQuantity: '0' },
      { price: '1560.00', lastQuantity: '0' }
    ];
    const ref = pricingEngine.calculateReferencePrice(zeroQtyAds, 'vwap-5');
    assert.strictEqual(ref, 1550.00);
  });

  it('PE.REF.6: Handles request for N larger than available ad list', () => {
    const ref = pricingEngine.calculateReferencePrice(sampleAds, 'avg-20');
    assert.closeTo(ref, 1520.00, 0.001);
  });

  // ==========================================
  // 3. Buy Ad Assistant Pricing (calculateBuyPricing)
  // ==========================================
  const activeBuyAds = [
    { price: '1500.00', lastQuantity: '500' },
    { price: '1498.00', lastQuantity: '500' }
  ];
  const sortedSellAds = [
    { price: '1520.00', lastQuantity: '500' },
    { price: '1525.00', lastQuantity: '500' }
  ];

  it('PE.BUY.1: Standard outbidding calculates +₦0.10 above reference buy price', () => {
    const result = pricingEngine.calculateBuyPricing({
      activeBuyAds,
      sortedSellAds,
      targetSpread: 5.0,
      inflowFee: 50.0,
      avgVolume: 100.0,
      pricingMode: 'competitor'
    });
    assert.strictEqual(result.exitPrice, 1520.00);
    assert.strictEqual(result.referenceBuyPrice, 1500.00);
    assert.closeTo(result.maxBuyPrice, 1514.50, 0.001);
    assert.closeTo(result.rawSuggestedBuy, 1500.10, 0.001);
    assert.closeTo(result.suggestedBuy, 1500.10, 0.001);
    assert.strictEqual(result.isSafe, true);
    assert.closeTo(result.excessSpread, 19.40, 0.001);
    assert.strictEqual(result.isOffline, false);
  });

  it('PE.BUY.2: Spread compression caps suggestedBuy at maxBuyPrice and flags isSafe: false', () => {
    const tightBuyAds = [{ price: '1518.00', lastQuantity: '500' }];
    const result = pricingEngine.calculateBuyPricing({
      activeBuyAds: tightBuyAds,
      sortedSellAds,
      targetSpread: 5.0,
      inflowFee: 50.0,
      avgVolume: 100.0,
      pricingMode: 'competitor'
    });
    assert.closeTo(result.rawSuggestedBuy, 1518.10, 0.001);
    assert.closeTo(result.suggestedBuy, 1514.50, 0.001);
    assert.strictEqual(result.isSafe, false);
    assert.closeTo(result.excessSpread, 5.00, 0.001, 'Capped rate preserves exact target spread');
  });

  it('PE.BUY.3: Missing or offline sell market depth sets isOffline: true and zeroes values', () => {
    const result = pricingEngine.calculateBuyPricing({
      activeBuyAds,
      sortedSellAds: [],
      targetSpread: 5.0
    });
    assert.strictEqual(result.isOffline, true);
    assert.strictEqual(result.exitPrice, 0);
    assert.strictEqual(result.suggestedBuy, 0);
    assert.strictEqual(result.isSafe, false);
  });

  it('PE.BUY.4: Empty active buy ads defaults rawSuggestedBuy to maxBuyPrice with isSafe: true', () => {
    const result = pricingEngine.calculateBuyPricing({
      activeBuyAds: [],
      sortedSellAds,
      targetSpread: 5.0,
      inflowFee: 50.0,
      avgVolume: 100.0,
      pricingMode: 'competitor'
    });
    assert.strictEqual(result.referenceBuyPrice, 0);
    assert.closeTo(result.maxBuyPrice, 1514.50, 0.001);
    assert.closeTo(result.rawSuggestedBuy, 1514.50, 0.001);
    assert.closeTo(result.suggestedBuy, 1514.50, 0.001);
    assert.strictEqual(result.isSafe, true);
  });

  // ==========================================
  // 4. Sell Ad Assistant Pricing (calculateSellPricing)
  // ==========================================
  const activeSellAds = [
    { price: '1550.00', lastQuantity: '500' },
    { price: '1555.00', lastQuantity: '500' }
  ];

  it('PE.SELL.1: Standard undercutting calculates -₦0.10 below reference sell price', () => {
    const result = pricingEngine.calculateSellPricing({
      activeSellAds,
      costBasis: 1500.00,
      targetSpread: 5.0,
      outflowFee: 50.0,
      avgVolume: 100.0,
      pricingMode: 'competitor'
    });
    assert.strictEqual(result.hasCostBasis, true);
    assert.strictEqual(result.hasCompetitors, true);
    assert.strictEqual(result.referenceSellPrice, 1550.00);
    assert.closeTo(result.breakEven, 1500.50, 0.001);
    assert.closeTo(result.targetSellPrice, 1505.50, 0.001);
    assert.closeTo(result.rawSuggestedSell, 1549.90, 0.001);
    assert.closeTo(result.suggestedSell, 1549.90, 0.001);
    assert.strictEqual(result.isSafe, true);
    assert.closeTo(result.sellSpread, 49.40, 0.001);
  });

  it('PE.SELL.2: Competitor undercut below targetSellPrice floors suggestedSell and flags isSafe: false', () => {
    const depressedSellAds = [{ price: '1504.00', lastQuantity: '500' }];
    const result = pricingEngine.calculateSellPricing({
      activeSellAds: depressedSellAds,
      costBasis: 1500.00,
      targetSpread: 5.0,
      outflowFee: 50.0,
      avgVolume: 100.0,
      pricingMode: 'competitor'
    });
    assert.closeTo(result.rawSuggestedSell, 1503.90, 0.001);
    assert.closeTo(result.suggestedSell, 1505.50, 0.001);
    assert.strictEqual(result.isSafe, false);
    assert.closeTo(result.sellSpread, 5.00, 0.001, 'Floored rate guarantees target spread');
  });

  it('PE.SELL.3: Missing or zero cost basis returns hasCostBasis: false and isSafe: false', () => {
    const result = pricingEngine.calculateSellPricing({
      activeSellAds,
      costBasis: 0,
      targetSpread: 5.0
    });
    assert.strictEqual(result.hasCostBasis, false);
    assert.strictEqual(result.isSafe, false);
    assert.strictEqual(result.suggestedSell, 0);
    assert.strictEqual(result.breakEven, 0);
    assert.strictEqual(result.targetSellPrice, 0);
  });

  it('PE.SELL.4: Empty active sell ads returns hasCompetitors: false but computes breakEven and targetSellPrice', () => {
    const result = pricingEngine.calculateSellPricing({
      activeSellAds: [],
      costBasis: 1500.00,
      targetSpread: 5.0,
      outflowFee: 50.0,
      avgVolume: 100.0,
      pricingMode: 'competitor'
    });
    assert.strictEqual(result.hasCostBasis, true);
    assert.strictEqual(result.hasCompetitors, false);
    assert.strictEqual(result.isSafe, false);
    assert.strictEqual(result.suggestedSell, 0);
    assert.closeTo(result.breakEven, 1500.50, 0.001);
    assert.closeTo(result.targetSellPrice, 1505.50, 0.001);
  });

  // ==========================================
  // 5. Boundary & Extreme Value Robustness
  // ==========================================
  it('PE.BND.1: Zero, negative, or NaN avgVolume safely defaults to 100 USDT', () => {
    const buyZeroVol = pricingEngine.calculateBuyPricing({
      activeBuyAds: [{ price: '1500.00', lastQuantity: '100' }],
      sortedSellAds: [{ price: '1520.00', lastQuantity: '100' }],
      targetSpread: 5.0,
      inflowFee: 50.0,
      avgVolume: 0
    });
    assert.closeTo(buyZeroVol.maxBuyPrice, 1514.50, 0.001);

    const sellNaNVol = pricingEngine.calculateSellPricing({
      activeSellAds: [{ price: '1550.00', lastQuantity: '100' }],
      costBasis: 1500.00,
      targetSpread: 5.0,
      outflowFee: 50.0,
      avgVolume: NaN
    });
    assert.closeTo(sellNaNVol.breakEven, 1500.50, 0.001);
  });

  it('PE.BND.2: High transaction fees are correctly amortized per unit volume', () => {
    const result = pricingEngine.calculateBuyPricing({
      activeBuyAds: [{ price: '1500.00', lastQuantity: '100' }],
      sortedSellAds: [{ price: '1600.00', lastQuantity: '100' }],
      targetSpread: 10.0,
      inflowFee: 1000.0,
      avgVolume: 50.0
    });
    assert.closeTo(result.maxBuyPrice, 1570.00, 0.001);
  });

  it('PE.BND.3: Negative target spread parameter behaves predictably without throwing', () => {
    const result = pricingEngine.calculateBuyPricing({
      activeBuyAds: [{ price: '1500.00', lastQuantity: '100' }],
      sortedSellAds: [{ price: '1520.00', lastQuantity: '100' }],
      targetSpread: -2.0,
      inflowFee: 0,
      avgVolume: 100
    });
    assert.closeTo(result.maxBuyPrice, 1522.00, 0.001);
    assert.strictEqual(result.isSafe, true);
  });
}, { tier: 1, category: 'Pricing Engine' });
```

---

## 6. Verification and Validation Method

1. **Unit Test Execution**:
   ```bash
   node test/run-tests.js --suite=pricing
   ```
   **Expected**: `Tier 1 — Pricing & Arbitrage Engine Unit Tests` executes with 23 passed, 0 failed.

2. **Tier 1 Full Suite Execution**:
   ```bash
   node test/run-tests.js --tier=1
   ```
   **Expected**: 100% of the 23 unit tests in `pricing-engine.test.js` pass cleanly without `TypeError` crashes.

3. **Challenger Invariant Suites**:
   ```bash
   node test/run-tests.js --suite=empirical
   node test/run-tests.js --suite=fuzzing
   ```
   **Expected**: All mathematical invariant checks, Monte Carlo orderbook simulations (5,000 trials), and boundary fuzzing tests continue passing 100%.
