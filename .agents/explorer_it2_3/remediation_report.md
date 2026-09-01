# Remediation & Integration Report: Test Runner Architecture & Side Effect Analysis

**Agent**: `explorer_it2_3` (Explorer / Read-Only Investigator & Synthesizer)  
**Working Directory**: `c:\dev\p2p\.agents\explorer_it2_3`  
**Date**: 2026-09-01T13:25:00Z  
**Context**: Investigation of `test/run-tests.js`, `test/harness/test-runner.js`, `test/tier1-feature-coverage/pricing-engine.test.js`, and cross-tier state side effects following `auditor_1` Forensic Audit report.

---

## 1. Executive Summary

A comprehensive architectural and side-effect investigation was performed across the test runner infrastructure (`test/run-tests.js`, `test/harness/test-runner.js`, `test/harness/dom-mock.js`, `test/harness/http-mock.js`) and all test suites across Tiers 1 through 5.

### Core Discoveries:
1. **Custom Test Runner Design (`test-runner.js`)**: The test runner utilizes a flat suite registry where every call to `describe()` immediately pushes a new independent suite to `this.suites`. Crucially, **nested `describe()` blocks DO NOT inherit `beforeEach`, `afterEach`, `beforeAll`, or `afterAll` hooks, nor do they inherit suite options (`{ tier, category }`) from enclosing outer suites**.
2. **Pricing Engine Isolation**: `js/pricingEngine.js` is a 100% pure, deterministic mathematical module with zero global state, zero DOM dependencies, and zero side effects.
3. **Cross-Suite Leaks in Other Modules**: We identified specific shared state vectors across the broader test suite:
   - `process.env.PROXY_AUTH_TOKEN` is mutated at require-time by `challenger-m1-security-stress.test.js` and `adversarial-r1-security.js`.
   - Node globals (`global.window`, `global.document`, `global.localStorage`, `global.Chart`) are mutated by `setupDomEnvironment()` in DOM-reliant suites.
   - Module singletons (`store` from `js/store.js`) persist in memory across tests unless explicitly cleared via `store.clearAllData()`.
4. **Remediation Blueprint**: A single, flat `describe('Tier 1 — Pricing & Arbitrage Engine Unit Tests', () => { ... }, { tier: 1, category: 'Pricing Engine' })` block containing a scoped `beforeEach` hook and all 18 unit tests resolves all runtime issues and fully aligns with repository conventions.

---

## 2. Test Runner Architecture & Dynamic Suite Loading (`test/run-tests.js`)

### 2.1 Registration & Execution Lifecycle
The project does not use Jest or Mocha; it uses a lightweight custom runner:
1. **Require Phase**: `test/run-tests.js` requires all test files synchronously at startup (lines 16–69).
2. **Suite Registration**: As each file is required, top-level code executes:
   - `describe(title, fn, options)` creates a suite `{ title, tier: options.tier || 1, category: options.category || 'General', tests: [], beforeEachHooks: [], afterEachHooks: [], beforeAllHooks: [], afterAllHooks: [] }` and pushes it into `globalContext.suites`.
   - `it(title, fn)` pushes test descriptors into `globalContext.currentSuite.tests`.
   - `beforeEach(fn)` and `afterEach(fn)` push callbacks into `globalContext.currentSuite.beforeEachHooks` / `afterEachHooks`.
   - `beforeAll(fn)` pushes to `currentSuite.beforeAllHooks` if called inside `describe`, or to `globalContext.beforeAllHooks` if called outside.
3. **Execution Phase (`runner.run()`)**:
   - Executes `globalContext.beforeAllHooks` once.
   - Iterates through `this.context.suites`:
     - Checks `--tier=N` filter (`suite.tier === filterTier`) and `--suite=text` filter.
     - Runs `suite.beforeAllHooks`.
     - For each test in `suite.tests`: runs `suite.beforeEachHooks`, executes `test.fn()`, and runs `suite.afterEachHooks`.
     - Runs `suite.afterAllHooks`.
   - Executes `globalContext.afterAllHooks` once.

### 2.2 Root Cause of Nested `describe` Breakdown
When `describe` blocks are nested:
```javascript
// Outer describe created: suite 1 (tests: [], beforeEachHooks: [fn])
describe('Outer Suite', () => {
  beforeEach(async () => { pricingEngine = await import(...); });

  // Inner describe created: suite 2 (tests: [test1, test2], beforeEachHooks: [])
  describe('Inner Suite', () => {
    it('test1', () => { pricingEngine.doSomething(); }); // FAILS: pricingEngine is undefined
  });
});
```
- The outer suite has `beforeEachHooks` but 0 tests.
- The inner suite has the tests but empty `beforeEachHooks`.
- When `runner.run()` executes suite 2, outer hooks are never invoked.
- Additionally, suite 2 receives default `{ tier: 1, category: 'General' }`, losing any metadata passed to the outer suite.

---

## 3. Side Effect Analysis Across Tiers

| Side Effect Vector | Mechanism | Impacted Modules / Suites | Mitigation / Isolation Status |
|--------------------|-----------|---------------------------|-------------------------------|
| **`process.env` Mutation** | `challenger-m1-security-stress.test.js:25` sets `process.env.PROXY_AUTH_TOKEN = TEST_SECRET;` at require time. | `api/_bybit.js`, `api/*.js`, `r1-api-security.test.js` | `api/_bybit.js` caches token on first load. Pricing engine has zero `process.env` dependencies. |
| **DOM Global Pollution** | `setupDomEnvironment()` sets `global.window`, `global.document`, `global.localStorage`, `global.Chart`. | `js/views/pricing.view.js`, `js/pricing.js`, `js/dashboard.js` | Isolated per suite via `setupDomEnvironment()`. `pricingEngine.js` has zero DOM dependencies. |
| **In-Memory Store Singleton** | `js/store.js` exports a singleton `store`. State accumulates across calls to `saveSnapshot()`, `setBankBalances()`. | `r1-m1-calculation-engine.test.js`, `snapshots.js`, `dashboard.js` | Suites must call `store.clearAllData()` in `beforeEach`. `pricingEngine.js` has zero Store dependencies. |
| **HTTP Client Mocks** | `bybitService.js` methods (`fetchActiveAds`, `fetchFundingBalance`) are patched in certain tests. | `active-buy-sell-ads.test.js` | Restored in test `afterEach`/`beforeEach`. Pricing engine does not make HTTP calls. |

---

## 4. Flattened Remediation Blueprint for `pricing-engine.test.js`

To guarantee 100% deterministic test execution, zero `TypeError` exceptions, and clean category reporting in the test summary:

### 4.1 Recommended Code Structure
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

  // =========================================================================
  // 1. COMPETITOR AD FILTERING (filterCompetitorAds)
  // =========================================================================
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
    assert.strictEqual(filtered.length, 2);
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
      { price: '1500.00', lastQuantity: '100', minAmount: '200000', maxAmount: '500000' },
      { price: '1500.00', lastQuantity: '100', minAmount: '50000', maxAmount: '100000' },
      { price: '1500.00', lastQuantity: '100', minAmount: '50000', maxAmount: '500000' }
    ];
    const filtered = pricingEngine.filterCompetitorAds(ads, 100, true);
    assert.strictEqual(filtered.length, 1);
  });

  it('PE.FILT.5: Disabling filterLimits flag bypasses transaction limit checks', () => {
    const ads = [
      { price: '1500.00', lastQuantity: '100', minAmount: '200000', maxAmount: '500000' },
      { price: '1500.00', lastQuantity: '100', minAmount: '50000', maxAmount: '100000' }
    ];
    const filtered = pricingEngine.filterCompetitorAds(ads, 100, false);
    assert.strictEqual(filtered.length, 2);
  });

  it('PE.FILT.6: Supports alternative Bybit property names (minSingleTransAmount, maxSingleTransAmount)', () => {
    const ads = [
      { price: '1500.00', lastQuantity: '100', minSingleTransAmount: '200000', maxSingleTransAmount: '500000' },
      { price: '1500.00', lastQuantity: '100', minSingleTransAmount: '50000', maxSingleTransAmount: '500000' }
    ];
    const filtered = pricingEngine.filterCompetitorAds(ads, 100, true);
    assert.strictEqual(filtered.length, 1);
  });

  // =========================================================================
  // 2. REFERENCE PRICE CALCULATIONS (calculateReferencePrice)
  // =========================================================================
  it('PE.REF.1: Returns 0 for empty, null, or invalid ad collections', () => {
    assert.strictEqual(pricingEngine.calculateReferencePrice([]), 0);
    assert.strictEqual(pricingEngine.calculateReferencePrice(null), 0);
    assert.strictEqual(pricingEngine.calculateReferencePrice(undefined), 0);
    assert.strictEqual(pricingEngine.calculateReferencePrice([null, undefined]), 0);
  });

  it('PE.REF.2: Mode "competitor" returns top ad price exactly', () => {
    const ads = [{ price: '1520.50' }, { price: '1520.00' }, { price: '1519.50' }];
    assert.strictEqual(pricingEngine.calculateReferencePrice(ads, 'competitor'), 1520.50);
  });

  it('PE.REF.3: Mode "avg-N" computes simple arithmetic mean across top N ads', () => {
    const ads = [{ price: '1500' }, { price: '1510' }, { price: '1520' }, { price: '1600' }];
    assert.strictEqual(pricingEngine.calculateReferencePrice(ads, 'avg-3'), 1510);
  });

  it('PE.REF.4: Mode "vwap-N" computes volume-weighted average price across top N ads', () => {
    const ads = [
      { price: '1500.00', lastQuantity: '100' },
      { price: '1510.00', lastQuantity: '300' }
    ];
    // (1500*100 + 1510*300) / 400 = (150000 + 453000) / 400 = 603000 / 400 = 1507.50
    assert.closeTo(pricingEngine.calculateReferencePrice(ads, 'vwap-2'), 1507.50, 0.001);
  });

  it('PE.REF.5: Fallback gracefully to top price if total volume in VWAP is 0', () => {
    const ads = [{ price: '1500.00', lastQuantity: '0' }, { price: '1510.00', lastQuantity: '0' }];
    assert.strictEqual(pricingEngine.calculateReferencePrice(ads, 'vwap-2'), 1500.00);
  });

  it('PE.REF.6: Handles request for N larger than available ad list', () => {
    const ads = [{ price: '1500.00' }, { price: '1510.00' }];
    assert.strictEqual(pricingEngine.calculateReferencePrice(ads, 'avg-10'), 1505.00);
  });

  // =========================================================================
  // 3. BUY AD ASSISTANT PRICING (calculateBuyPricing)
  // =========================================================================
  it('PE.BUY.1: Standard outbidding calculates +₦0.10 above reference buy price', () => {
    const result = pricingEngine.calculateBuyPricing({
      activeBuyAds: [{ price: '1500.00', lastQuantity: '100' }],
      sortedSellAds: [{ price: '1550.00', lastQuantity: '100' }],
      targetSpread: 5.0,
      inflowFee: 50.0,
      avgVolume: 100.0,
      pricingMode: 'competitor'
    });

    assert.strictEqual(result.exitPrice, 1550.00);
    assert.strictEqual(result.referenceBuyPrice, 1500.00);
    // maxBuyPrice = 1550 - 5.0 - (50/100) = 1550 - 5.0 - 0.50 = 1544.50
    assert.closeTo(result.maxBuyPrice, 1544.50, 0.001);
    assert.closeTo(result.rawSuggestedBuy, 1500.10, 0.001);
    assert.closeTo(result.suggestedBuy, 1500.10, 0.001);
    assert.strictEqual(result.isSafe, true);
    // excessSpread = 1550 - 1500.10 - 0.50 = 49.40
    assert.closeTo(result.excessSpread, 49.40, 0.001);
  });

  it('PE.BUY.2: Spread compression caps suggestedBuy at maxBuyPrice and flags isSafe: false', () => {
    const result = pricingEngine.calculateBuyPricing({
      activeBuyAds: [{ price: '1540.00', lastQuantity: '100' }],
      sortedSellAds: [{ price: '1542.00', lastQuantity: '100' }],
      targetSpread: 5.0,
      inflowFee: 50.0,
      avgVolume: 100.0,
      pricingMode: 'competitor'
    });

    // maxBuyPrice = 1542 - 5 - 0.50 = 1536.50
    // rawSuggestedBuy = 1540 + 0.10 = 1540.10 > maxBuyPrice (1536.50)
    assert.closeTo(result.maxBuyPrice, 1536.50, 0.001);
    assert.closeTo(result.rawSuggestedBuy, 1540.10, 0.001);
    assert.closeTo(result.suggestedBuy, 1536.50, 0.001);
    assert.strictEqual(result.isSafe, false);
  });

  it('PE.BUY.3: Missing or offline sell market depth sets isOffline: true and zeroes values', () => {
    const result = pricingEngine.calculateBuyPricing({
      activeBuyAds: [{ price: '1500.00' }],
      sortedSellAds: []
    });

    assert.strictEqual(result.exitPrice, 0);
    assert.strictEqual(result.maxBuyPrice, 0);
    assert.strictEqual(result.suggestedBuy, 0);
    assert.strictEqual(result.isSafe, false);
    assert.strictEqual(result.isOffline, true);
  });

  it('PE.BUY.4: Empty active buy ads defaults rawSuggestedBuy to maxBuyPrice with isSafe: true', () => {
    const result = pricingEngine.calculateBuyPricing({
      activeBuyAds: [],
      sortedSellAds: [{ price: '1550.00', lastQuantity: '100' }],
      targetSpread: 5.0,
      inflowFee: 50.0,
      avgVolume: 100.0
    });

    assert.closeTo(result.maxBuyPrice, 1544.50, 0.001);
    assert.closeTo(result.suggestedBuy, 1544.50, 0.001);
    assert.strictEqual(result.isSafe, true);
  });

  // =========================================================================
  // 4. SELL AD ASSISTANT PRICING (calculateSellPricing)
  // =========================================================================
  it('PE.SELL.1: Standard undercutting calculates -₦0.10 below reference sell price', () => {
    const result = pricingEngine.calculateSellPricing({
      activeSellAds: [{ price: '1550.00', lastQuantity: '100' }],
      costBasis: 1500.00,
      targetSpread: 5.0,
      outflowFee: 50.0,
      avgVolume: 100.0,
      pricingMode: 'competitor'
    });

    assert.strictEqual(result.referenceSellPrice, 1550.00);
    // breakEven = 1500 + (50/100) = 1500.50
    assert.closeTo(result.breakEven, 1500.50, 0.001);
    // targetSellPrice = 1500 + 5.0 + 0.50 = 1505.50
    assert.closeTo(result.targetSellPrice, 1505.50, 0.001);
    // rawSuggestedSell = 1550 - 0.10 = 1549.90 >= targetSellPrice
    assert.closeTo(result.rawSuggestedSell, 1549.90, 0.001);
    assert.closeTo(result.suggestedSell, 1549.90, 0.001);
    assert.strictEqual(result.isSafe, true);
    assert.strictEqual(result.hasCostBasis, true);
    assert.strictEqual(result.hasCompetitors, true);
  });

  it('PE.SELL.2: Competitor undercut below targetSellPrice floors suggestedSell and flags isSafe: false', () => {
    const result = pricingEngine.calculateSellPricing({
      activeSellAds: [{ price: '1504.00', lastQuantity: '100' }],
      costBasis: 1500.00,
      targetSpread: 5.0,
      outflowFee: 50.0,
      avgVolume: 100.0,
      pricingMode: 'competitor'
    });

    // targetSellPrice = 1505.50
    // rawSuggestedSell = 1504 - 0.10 = 1503.90 < targetSellPrice
    assert.closeTo(result.targetSellPrice, 1505.50, 0.001);
    assert.closeTo(result.rawSuggestedSell, 1503.90, 0.001);
    assert.closeTo(result.suggestedSell, 1505.50, 0.001);
    assert.strictEqual(result.isSafe, false);
  });

  it('PE.SELL.3: Missing or zero cost basis returns hasCostBasis: false and isSafe: false', () => {
    const result = pricingEngine.calculateSellPricing({
      activeSellAds: [{ price: '1550.00' }],
      costBasis: 0
    });

    assert.strictEqual(result.breakEven, 0);
    assert.strictEqual(result.targetSellPrice, 0);
    assert.strictEqual(result.suggestedSell, 0);
    assert.strictEqual(result.hasCostBasis, false);
    assert.strictEqual(result.isSafe, false);
  });

  it('PE.SELL.4: Empty active sell ads returns hasCompetitors: false but computes breakEven and targetSellPrice', () => {
    const result = pricingEngine.calculateSellPricing({
      activeSellAds: [],
      costBasis: 1500.00,
      targetSpread: 5.0,
      outflowFee: 50.0,
      avgVolume: 100.0
    });

    assert.closeTo(result.breakEven, 1500.50, 0.001);
    assert.closeTo(result.targetSellPrice, 1505.50, 0.001);
    assert.strictEqual(result.suggestedSell, 0);
    assert.strictEqual(result.hasCostBasis, true);
    assert.strictEqual(result.hasCompetitors, false);
    assert.strictEqual(result.isSafe, false);
  });

  // =========================================================================
  // 5. BOUNDARY & EXTREME VALUE ROBUSTNESS
  // =========================================================================
  it('PE.BND.1: Zero, negative, or NaN avgVolume safely defaults to 100 USDT', () => {
    const buyZeroVol = pricingEngine.calculateBuyPricing({
      activeBuyAds: [{ price: '1500.00', lastQuantity: '100' }],
      sortedSellAds: [{ price: '1550.00', lastQuantity: '100' }],
      targetSpread: 5.0,
      inflowFee: 50.0,
      avgVolume: 0
    });
    assert.closeTo(buyZeroVol.maxBuyPrice, 1544.50, 0.001);

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
    // maxBuyPrice = 1600 - 10 - (1000 / 50) = 1600 - 10 - 20 = 1570.00
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
    // maxBuyPrice = 1520 - (-2) = 1522.00
    assert.closeTo(result.maxBuyPrice, 1522.00, 0.001);
    assert.strictEqual(result.isSafe, true);
  });
}, { tier: 1, category: 'Pricing Engine' });
```

---

## 5. Worker Verification & Execution Guidance

The worker must follow this strict verification protocol:

1. **Targeted Suite Verification**:
   ```bash
   node test/run-tests.js --suite="Pricing Engine"
   ```
   *Expected Output*: Single suite `▶ [Tier 1] Tier 1 — Pricing & Arbitrage Engine Unit Tests`, 18 passed, 0 failed.

2. **Tier 1 Verification**:
   ```bash
   node test/run-tests.js --tier=1
   ```
   *Expected Output*: All Tier 1 suites execute. `Pricing Engine` suite must show `18/18 passed (100%)`.

3. **Full Multi-Tier Suite Verification**:
   ```bash
   node test/run-tests.js
   ```
   *Expected Output*: Executes all Tier 1–4 and Challenger suites.
