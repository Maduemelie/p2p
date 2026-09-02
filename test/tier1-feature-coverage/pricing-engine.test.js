/**
 * Tier 1: Feature Coverage — Pricing & Arbitrage Engine Unit Tests
 * Pure mathematical determinism, reference pricing strategies, outbidding/undercutting,
 * spread protection caps and floors, dust filtering, Bybit maker fee math (0.3% & custom),
 * fixed fiat fee amortization (inflow/outflow), simultaneous fee accounting,
 * recommended minimum order limits (drag <= 20%), and trade size tier sensitivity (₦5k, ₦10k, ₦30k, ₦100k).
 */

const { describe, it, beforeEach } = require('../harness/test-runner');
const { assert } = require('../harness/assertions');

describe('Tier 1 — Pricing & Arbitrage Engine Unit Tests', () => {
  let pricingEngine;

  beforeEach(async () => {
    pricingEngine = await import('../../js/pricingEngine.js');
  });

  // =========================================================================
  // 1. Competitor Ad Filtering (filterCompetitorAds)
  // =========================================================================

  it('PE.FILT.1: Returns empty array for non-array, null, or undefined inputs', () => {
    assert.deepStrictEqual(pricingEngine.filterCompetitorAds(null), []);
    assert.deepStrictEqual(pricingEngine.filterCompetitorAds(undefined), []);
    assert.deepStrictEqual(pricingEngine.filterCompetitorAds('not-an-array'), []);
    assert.deepStrictEqual(pricingEngine.filterCompetitorAds({}), []);
    assert.deepStrictEqual(pricingEngine.filterCompetitorAds([]), []);
  });

  it('PE.FILT.2: Dust filter removes ads with quantity below max(2.0, avgVol * 0.05)', () => {
    // For avgVolume = 100, minQty = max(2.0, 100 * 0.05) = 5.0 USDT
    const ads = [
      { price: '1500.00', lastQuantity: '4.9', minAmount: '1000', maxAmount: '500000' }, // Dust (< 5.0)
      { price: '1500.10', lastQuantity: '5.0', minAmount: '1000', maxAmount: '500000' }, // Kept (== 5.0)
      { price: '1500.20', lastQuantity: '100.0', minAmount: '1000', maxAmount: '500000' } // Kept (> 5.0)
    ];

    const filtered = pricingEngine.filterCompetitorAds(ads, 100, false);
    assert.strictEqual(filtered.length, 2, 'Should discard the 4.9 USDT dust ad');
    assert.strictEqual(filtered[0].price, '1500.10');
    assert.strictEqual(filtered[1].price, '1500.20');
  });

  it('PE.FILT.3: Dust filter enforces absolute minimum of 2.0 USDT for small trade volumes', () => {
    // For avgVolume = 10, 10 * 0.05 = 0.5 < 2.0 -> minQty is 2.0 USDT
    const ads = [
      { price: '1500.00', lastQuantity: '1.9', minAmount: '1000', maxAmount: '500000' }, // Dust (< 2.0)
      { price: '1500.10', lastQuantity: '2.0', minAmount: '1000', maxAmount: '500000' }  // Kept (== 2.0)
    ];

    const filtered = pricingEngine.filterCompetitorAds(ads, 10, false);
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].price, '1500.10');
  });

  it('PE.FILT.4: Transaction limits filter rejects ads when target trade fiat amount is outside bounds', () => {
    // avgVolume = 100, price = 1500 -> tradeAmount = 150,000 NGN
    const ads = [
      // Case A: tradeAmount (150k) < minAmount (200k) -> Rejected
      { price: '1500.00', lastQuantity: '500', minAmount: '200000', maxAmount: '1000000' },
      // Case B: tradeAmount (150k) > maxAmount (100k) -> Rejected
      { price: '1500.00', lastQuantity: '500', minAmount: '50000', maxAmount: '100000' },
      // Case C: tradeAmount (150k) is within [50k, 500k] -> Kept
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
      { price: '1500.00', lastQuantity: '500', minSingleTransAmount: '200000', maxSingleTransAmount: '1000000' }, // Rejected (150k < 200k)
      { price: '1500.00', lastQuantity: '500', minSingleTransAmount: '10000', maxSingleTransAmount: '500000' }   // Kept
    ];

    const filtered = pricingEngine.filterCompetitorAds(ads, 100, true);
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].minSingleTransAmount, '10000');
  });

  it('PE.FILT.7: Handles malformed array items and exact boundary limit values', () => {
    // Exact match on limit boundaries: tradeAmount = 150k
    const ads = [
      null,
      undefined,
      { price: '1500.00', lastQuantity: '100', minAmount: '150000', maxAmount: '150000' }, // Exact bounds
      {}
    ];
    const filtered = pricingEngine.filterCompetitorAds(ads, 100, true);
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].minAmount, '150000');
  });

  // =========================================================================
  // 2. Reference Price Computation (calculateReferencePrice)
  // =========================================================================

  const sampleAds = [
    { price: '1500.00', lastQuantity: '100' }, // rank 1
    { price: '1510.00', lastQuantity: '200' }, // rank 2
    { price: '1520.00', lastQuantity: '300' }, // rank 3
    { price: '1530.00', lastQuantity: '400' }, // rank 4
    { price: '1540.00', lastQuantity: '500' }  // rank 5
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
    // Top 3 ads: (1500 + 1510 + 1520) / 3 = 4530 / 3 = 1510.00
    const ref3 = pricingEngine.calculateReferencePrice(sampleAds, 'avg-3');
    assert.closeTo(ref3, 1510.00, 0.001);

    // Top 5 ads: (1500 + 1510 + 1520 + 1530 + 1540) / 5 = 7600 / 5 = 1520.00
    const ref5 = pricingEngine.calculateReferencePrice(sampleAds, 'avg-5');
    assert.closeTo(ref5, 1520.00, 0.001);
  });

  it('PE.REF.4: Mode "vwap-N" computes volume-weighted average price across top N ads', () => {
    // Top 3 ads:
    // (1500*100 + 1510*200 + 1520*300) / (100 + 200 + 300)
    // = (150,000 + 302,000 + 456,000) / 600
    // = 908,000 / 600 = 1513.3333333333333
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
    // Request top 20 when only 5 exist
    const ref = pricingEngine.calculateReferencePrice(sampleAds, 'avg-20');
    assert.closeTo(ref, 1520.00, 0.001);
  });

  it('PE.REF.7: Defaults to avg-10 when pricingMode is omitted, and handles single-ad arrays', () => {
    const defaultRef = pricingEngine.calculateReferencePrice(sampleAds);
    assert.closeTo(defaultRef, 1520.00, 0.001);

    const singleAd = [{ price: '1515.50', lastQuantity: '50' }];
    assert.strictEqual(pricingEngine.calculateReferencePrice(singleAd, 'vwap-5'), 1515.50);
  });

  // =========================================================================
  // 3. Buy Ad Assistant Pricing (calculateBuyPricing)
  // =========================================================================

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

  it('PE.BUY.5: Zero inflow fee and empty parameter invocation resilience', () => {
    const emptyResult = pricingEngine.calculateBuyPricing();
    assert.strictEqual(emptyResult.isOffline, true);

    const zeroFeeResult = pricingEngine.calculateBuyPricing({
      activeBuyAds,
      sortedSellAds,
      targetSpread: 5.0,
      inflowFee: 0,
      avgVolume: 100,
      pricingMode: 'competitor'
    });
    // maxBuyPrice = 1520 - 5 - 0 = 1515.00
    assert.strictEqual(zeroFeeResult.maxBuyPrice, 1515.00);
  });

  // =========================================================================
  // 4. Sell Ad Assistant Pricing (calculateSellPricing)
  // =========================================================================

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

  it('PE.SELL.5: Negative cost basis guard and zero outflow fee calculation', () => {
    const negativeCostResult = pricingEngine.calculateSellPricing({
      activeSellAds,
      costBasis: -100.00,
      targetSpread: 5.0
    });
    assert.strictEqual(negativeCostResult.hasCostBasis, false);

    const zeroFeeResult = pricingEngine.calculateSellPricing({
      activeSellAds,
      costBasis: 1500.00,
      targetSpread: 5.0,
      outflowFee: 0,
      avgVolume: 100,
      pricingMode: 'competitor'
    });
    assert.strictEqual(zeroFeeResult.breakEven, 1500.00);
    assert.strictEqual(zeroFeeResult.targetSellPrice, 1505.00);
  });

  // =========================================================================
  // 5. Boundary & Extreme Value Robustness
  // =========================================================================

  it('PE.BND.1: Zero, negative, or NaN avgVolume safely defaults to 100 USDT', () => {
    const buyZeroVol = pricingEngine.calculateBuyPricing({
      activeBuyAds: [{ price: '1500.00', lastQuantity: '100' }],
      sortedSellAds: [{ price: '1520.00', lastQuantity: '100' }],
      targetSpread: 5.0,
      inflowFee: 50.0,
      avgVolume: 0 // invalid volume
    });

    // safeAvgVol = 100 -> feePerUnit = 50 / 100 = 0.50 -> maxBuyPrice = 1520 - 5 - 0.5 = 1514.50
    assert.closeTo(buyZeroVol.maxBuyPrice, 1514.50, 0.001);

    const sellNaNVol = pricingEngine.calculateSellPricing({
      activeSellAds: [{ price: '1550.00', lastQuantity: '100' }],
      costBasis: 1500.00,
      targetSpread: 5.0,
      outflowFee: 50.0,
      avgVolume: NaN
    });

    // safeAvgVol = 100 -> feePerUnit = 0.50 -> breakEven = 1500.50
    assert.closeTo(sellNaNVol.breakEven, 1500.50, 0.001);
  });

  it('PE.BND.2: High transaction fees are correctly amortized per unit volume', () => {
    // inflowFee = ₦1,000 across 50 USDT volume -> ₦20.00/USDT fee
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

  // =========================================================================
  // 6. Platform Maker Fee Calculations (0.30% & Custom Percentages)
  // =========================================================================

  it('PE.FEE.1: Bybit 0.30% maker fee math in calculateBuyPricing across exit & entry legs', () => {
    // exitPrice = 1520.00, targetSpread = 5.0, inflowFee = 50, outflowFee = 50, avgVolume = 100
    // phi = 0.003 (0.3%)
    // netExitRevenue = 1520 * (1 - 0.003) - (50 / 100) = 1515.44 - 0.50 = 1514.94
    // maxBuyPrice = (1 - 0.003) * [ 1514.94 - 5.0 - 0.50 ] = 0.997 * 1509.44 = 1504.91168
    const result = pricingEngine.calculateBuyPricing({
      activeBuyAds,
      sortedSellAds,
      targetSpread: 5.0,
      inflowFee: 50.0,
      outflowFee: 50.0,
      platformFeePct: 0.3,
      avgVolume: 100.0,
      pricingMode: 'competitor'
    });

    assert.strictEqual(result.exitPrice, 1520.00);
    assert.closeTo(result.maxBuyPrice, 1504.9117, 0.001);
    assert.closeTo(result.rawSuggestedBuy, 1500.10, 0.001);
    assert.closeTo(result.suggestedBuy, 1500.10, 0.001);
    assert.strictEqual(result.isSafe, true);
    assert.ok(result.feeBreakdown, 'Should return structured feeBreakdown object');
    assert.closeTo(result.feeBreakdown.platformFeePerUnit, 1500.10 * 0.003, 0.001);
    assert.closeTo(result.feeBreakdown.fiatFeePerUnit, 1.00, 0.001);
    assert.closeTo(result.feeBreakdown.inflowFeePerUnit, 0.50, 0.001);
    assert.closeTo(result.feeBreakdown.outflowFeePerUnit, 0.50, 0.001);
    assert.closeTo(result.feeBreakdown.effectiveCostBasis, (1500.10 / 0.997) + 0.50, 0.001);
  });

  it('PE.FEE.2: Bybit 0.30% maker fee math in calculateSellPricing for break-even & target sell price', () => {
    // costBasis = 1500.00, targetSpread = 5.0, outflowFee = 50, avgVolume = 100
    // phi = 0.003 (0.3%)
    // breakEven = (1500 + 0.50) / 0.997 = 1505.015045
    // targetSellPrice = (1500 + 5.0 + 0.50) / 0.997 = 1510.030090
    const result = pricingEngine.calculateSellPricing({
      activeSellAds,
      costBasis: 1500.00,
      targetSpread: 5.0,
      outflowFee: 50.0,
      platformFeePct: 0.3,
      avgVolume: 100.0,
      pricingMode: 'competitor'
    });

    assert.closeTo(result.breakEven, 1505.0150, 0.001);
    assert.closeTo(result.targetSellPrice, 1510.0301, 0.001);
    assert.closeTo(result.suggestedSell, 1549.90, 0.001);
    assert.strictEqual(result.isSafe, true);
    assert.ok(result.feeBreakdown, 'Should return structured feeBreakdown object');
    assert.closeTo(result.feeBreakdown.platformFeePerUnit, 1549.90 * 0.003, 0.001);
    assert.closeTo(result.feeBreakdown.fiatFeePerUnit, 0.50, 0.001);
    assert.closeTo(result.feeBreakdown.netRealizedRevenue, 1549.90 * 0.997 - 0.50, 0.001);
  });

  it('PE.FEE.3: Custom percentage fees in calculateBuyPricing (0%, 0.1%, 0.5%, 1.0%, 2.0%)', () => {
    const feeLevels = [
      { feePct: 0.0, expectedMaxBuy: (1520 - 0.50 - 5.0 - 0.50) }, // 1514.00
      { feePct: 0.1, phi: 0.001, expectedMaxBuy: 0.999 * (1520 * 0.999 - 0.50 - 5.0 - 0.50) },
      { feePct: 0.5, phi: 0.005, expectedMaxBuy: 0.995 * (1520 * 0.995 - 0.50 - 5.0 - 0.50) },
      { feePct: 1.0, phi: 0.010, expectedMaxBuy: 0.990 * (1520 * 0.990 - 0.50 - 5.0 - 0.50) },
      { feePct: 2.0, phi: 0.020, expectedMaxBuy: 0.980 * (1520 * 0.980 - 0.50 - 5.0 - 0.50) }
    ];

    for (const lvl of feeLevels) {
      const res = pricingEngine.calculateBuyPricing({
        activeBuyAds,
        sortedSellAds,
        targetSpread: 5.0,
        inflowFee: 50.0,
        outflowFee: 50.0,
        platformFeePct: lvl.feePct,
        avgVolume: 100.0,
        pricingMode: 'competitor'
      });
      assert.closeTo(res.maxBuyPrice, lvl.expectedMaxBuy, 0.01, `Failed at platformFeePct=${lvl.feePct}`);
    }
  });

  it('PE.FEE.4: Custom percentage fees in calculateSellPricing (0%, 0.1%, 0.5%, 1.0%, 2.0%)', () => {
    const feeLevels = [
      { feePct: 0.0, expectedBreakEven: (1500 + 0.50) / 1.0, expectedTargetSell: (1500 + 5.0 + 0.50) / 1.0 },
      { feePct: 0.1, expectedBreakEven: (1500 + 0.50) / 0.999, expectedTargetSell: (1500 + 5.0 + 0.50) / 0.999 },
      { feePct: 0.5, expectedBreakEven: (1500 + 0.50) / 0.995, expectedTargetSell: (1500 + 5.0 + 0.50) / 0.995 },
      { feePct: 1.0, expectedBreakEven: (1500 + 0.50) / 0.990, expectedTargetSell: (1500 + 5.0 + 0.50) / 0.990 },
      { feePct: 2.0, expectedBreakEven: (1500 + 0.50) / 0.980, expectedTargetSell: (1500 + 5.0 + 0.50) / 0.980 }
    ];

    for (const lvl of feeLevels) {
      const res = pricingEngine.calculateSellPricing({
        activeSellAds,
        costBasis: 1500.00,
        targetSpread: 5.0,
        outflowFee: 50.0,
        platformFeePct: lvl.feePct,
        avgVolume: 100.0,
        pricingMode: 'competitor'
      });
      assert.closeTo(res.breakEven, lvl.expectedBreakEven, 0.01, `Break-even failed at feePct=${lvl.feePct}`);
      assert.closeTo(res.targetSellPrice, lvl.expectedTargetSell, 0.01, `Target sell failed at feePct=${lvl.feePct}`);
    }
  });

  it('PE.FEE.5: Fee normalization handles both percentage format (0.3) and decimal fraction format (0.003)', () => {
    const buyPct = pricingEngine.calculateBuyPricing({
      activeBuyAds,
      sortedSellAds,
      targetSpread: 5.0,
      inflowFee: 50.0,
      outflowFee: 50.0,
      platformFeePct: 0.3, // Percentage notation
      avgVolume: 100.0
    });

    const buyFrac = pricingEngine.calculateBuyPricing({
      activeBuyAds,
      sortedSellAds,
      targetSpread: 5.0,
      inflowFee: 50.0,
      outflowFee: 50.0,
      platformFeePct: 0.003, // Decimal rate notation
      avgVolume: 100.0
    });

    assert.closeTo(buyPct.maxBuyPrice, buyFrac.maxBuyPrice, 0.0001);
    assert.closeTo(buyPct.feeBreakdown.platformFeePerUnit, buyFrac.feeBreakdown.platformFeePerUnit, 0.0001);
  });

  it('PE.FEE.6: Negative, NaN, null, and extreme fees are safely clamped or guarded against zero division', () => {
    const negFeeBuy = pricingEngine.calculateBuyPricing({
      activeBuyAds,
      sortedSellAds,
      platformFeePct: -0.5
    });
    assert.strictEqual(negFeeBuy.feeBreakdown.platformFeePerUnit, 0);

    const nanFeeSell = pricingEngine.calculateSellPricing({
      activeSellAds,
      costBasis: 1500,
      platformFeePct: NaN
    });
    assert.strictEqual(nanFeeSell.feeBreakdown.platformFeePerUnit, 0);

    // 100% fee edge case clamped to 0.0001 divisor floor
    const extremeFeeSell = pricingEngine.calculateSellPricing({
      activeSellAds,
      costBasis: 1500,
      platformFeePct: 100.0
    });
    assert.ok(isFinite(extremeFeeSell.breakEven), 'Break-even must not be Infinity on 100% fee');
  });

  // =========================================================================
  // 7. Fixed Fiat Transfer Fee Amortization (Inflow & Outflow)
  // =========================================================================

  it('PE.FIAT.1: Fixed fiat fee amortization across varying trade volumes (10, 50, 100, 500, 1000 USDT)', () => {
    const volumes = [10, 50, 100, 500, 1000];
    const fiatFee = 50.0;

    for (const vol of volumes) {
      const expectedFiatPerUnit = fiatFee / vol;
      const res = pricingEngine.calculateBuyPricing({
        activeBuyAds,
        sortedSellAds,
        targetSpread: 5.0,
        inflowFee: fiatFee,
        outflowFee: 0,
        platformFeePct: 0,
        avgVolume: vol
      });
      assert.closeTo(res.feeBreakdown.inflowFeePerUnit, expectedFiatPerUnit, 0.001);
      assert.closeTo(res.maxBuyPrice, 1520 - 5.0 - expectedFiatPerUnit, 0.001);
    }
  });

  it('PE.FIAT.2: Custom fiat transfer fees (₦0, ₦25, ₦50, ₦100, ₦250) in buy & sell pricing', () => {
    const fiatFeeLevels = [0, 25, 50, 100, 250];

    for (const fee of fiatFeeLevels) {
      const buyRes = pricingEngine.calculateBuyPricing({
        activeBuyAds,
        sortedSellAds,
        targetSpread: 5.0,
        inflowFee: fee,
        outflowFee: fee,
        avgVolume: 100.0
      });
      assert.closeTo(buyRes.feeBreakdown.fiatFeePerUnit, (fee + fee) / 100.0, 0.001);

      const sellRes = pricingEngine.calculateSellPricing({
        activeSellAds,
        costBasis: 1500.0,
        targetSpread: 5.0,
        outflowFee: fee,
        avgVolume: 100.0
      });
      assert.closeTo(sellRes.feeBreakdown.fiatFeePerUnit, fee / 100.0, 0.001);
      assert.closeTo(sellRes.breakEven, 1500.0 + (fee / 100.0), 0.001);
    }
  });

  // =========================================================================
  // 8. Simultaneous Fee Accounting & Net Profit Arbitrage Invariants
  // =========================================================================

  it('PE.SIM.1: Effective cost basis exactly matches true acquisition outlay per USDT', () => {
    // Buy 100 USDT at 1500 NGN with 0.3% maker fee and ₦50 inflow fee
    // Total cash paid = 100 * 1500 + 50 = 150,050 NGN
    // Net USDT credited = 100 * (1 - 0.003) = 99.70 USDT
    // Realized Cost Basis per USDT = 150,050 / 99.70 = 1505.015045 NGN/USDT
    const buyResult = pricingEngine.calculateBuyPricing({
      activeBuyAds: [{ price: '1499.90', lastQuantity: '100' }],
      sortedSellAds: [{ price: '1520.00', lastQuantity: '100' }],
      targetSpread: 5.0,
      inflowFee: 50.0,
      outflowFee: 50.0,
      platformFeePct: 0.3,
      avgVolume: 100.0
    });

    const buyPrice = buyResult.suggestedBuy; // 1500.00
    const phi = 0.003;
    const expectedEffectiveCost = (buyPrice / (1 - phi)) + (50.0 / 100.0);
    assert.closeTo(buyResult.feeBreakdown.effectiveCostBasis, expectedEffectiveCost, 0.001);
  });

  it('PE.SIM.2: Break-even sell price yields exactly ₦0.00 net profit after 0.3% fee and ₦50 outflow', () => {
    const costBasis = 1505.00;
    const outflowFee = 50.0;
    const avgVolume = 100.0;
    const phi = 0.003;

    const sellResult = pricingEngine.calculateSellPricing({
      activeSellAds,
      costBasis,
      targetSpread: 5.0,
      outflowFee,
      platformFeePct: 0.3,
      avgVolume
    });

    const pBreakEven = sellResult.breakEven;
    // Net cash received per USDT = pBreakEven * (1 - phi) - (outflowFee / avgVolume)
    const netRevenuePerUsdt = (pBreakEven * (1 - phi)) - (outflowFee / avgVolume);
    assert.closeTo(netRevenuePerUsdt, costBasis, 0.0001, 'Break-even rate must match cost basis to 4 decimal places');
  });

  it('PE.SIM.3: Target sell price yields exactly target spread after all platform & fiat fees', () => {
    const costBasis = 1500.00;
    const targetSpread = 7.50;
    const outflowFee = 50.0;
    const avgVolume = 100.0;
    const phi = 0.003;

    const sellResult = pricingEngine.calculateSellPricing({
      activeSellAds: [{ price: '1550.00', lastQuantity: '100' }],
      costBasis,
      targetSpread,
      outflowFee,
      platformFeePct: 0.3,
      avgVolume
    });

    const pTarget = sellResult.targetSellPrice;
    const netRevenuePerUsdt = (pTarget * (1 - phi)) - (outflowFee / avgVolume);
    const realizedSpread = netRevenuePerUsdt - costBasis;
    assert.closeTo(realizedSpread, targetSpread, 0.0001, 'Target sell price must yield exact targetSpread');
  });

  it('PE.SIM.4: Full round-trip buy + sell cycle at suggested rates guarantees net realized spread matches targetSpread', () => {
    const exitPrice = 1550.00;
    const targetSpread = 6.00;
    const inflowFee = 50.0;
    const outflowFee = 50.0;
    const avgVolume = 100.0;
    const phi = 0.003;

    // 1. Buy Engine computes maxBuyPrice
    const buyResult = pricingEngine.calculateBuyPricing({
      activeBuyAds: [],
      sortedSellAds: [{ price: exitPrice.toFixed(2), lastQuantity: '500' }],
      targetSpread,
      inflowFee,
      outflowFee,
      platformFeePct: 0.3,
      avgVolume
    });

    const buyPrice = buyResult.maxBuyPrice;
    // Effective cost basis resulting from buy
    const effectiveCostBasis = (buyPrice / (1 - phi)) + (inflowFee / avgVolume);

    // 2. Sell Engine computes targetSellPrice based on effectiveCostBasis
    const sellResult = pricingEngine.calculateSellPricing({
      activeSellAds: [{ price: exitPrice.toFixed(2), lastQuantity: '500' }],
      costBasis: effectiveCostBasis,
      targetSpread,
      outflowFee,
      platformFeePct: 0.3,
      avgVolume
    });

    // Net exit revenue received when selling at exitPrice
    const netExitRevenue = (exitPrice * (1 - phi)) - (outflowFee / avgVolume);
    const roundTripNetProfit = netExitRevenue - effectiveCostBasis;

    assert.closeTo(roundTripNetProfit, targetSpread, 0.0001, 'Round-trip net profit must strictly match targetSpread');
  });

  // =========================================================================
  // 9. Recommended Minimum Order Limits (calculateRecommendedLimits)
  // =========================================================================

  it('PE.LIM.1: Computes minimum volume and fiat limits bounding fee drag <= 20% of target spread', () => {
    // price = 1500.0, targetSpread = 5.0, fiatFee = 50.0, maxFeeDragRatio = 0.20
    // maxFeePerUnit = 5.0 * 0.20 = 1.00 NGN/USDT
    // minVolumeUsdt = 50.0 / 1.00 = 50.00 USDT
    // minFiatLimit = 50 * 1500 = 75,000 NGN
    // breakEvenUsdtLimit = 50 / 5.0 = 10.00 USDT -> 15,000 NGN
    const limits = pricingEngine.calculateRecommendedLimits({
      price: 1500.0,
      targetSpread: 5.0,
      inflowFee: 50.0,
      maxFeeDragRatio: 0.20
    });

    assert.strictEqual(limits.minUsdtLimit, 50.00);
    assert.strictEqual(limits.minFiatLimit, 75000);
    assert.strictEqual(limits.breakEvenUsdtLimit, 10.00);
    assert.strictEqual(limits.breakEvenFiatLimit, 15000);
    assert.closeTo(limits.feeDragRatio, 0.20, 0.001);
    assert.closeTo(limits.feeDragPercent, 20.00, 0.01);
    assert.ok(limits.recommendedText.includes('75,000'), 'Recommendation text must include minimum limit');
  });

  it('PE.LIM.2: calculateRecommendedLimits supports positional parameter signature', () => {
    const limits = pricingEngine.calculateRecommendedLimits(1500.0, 5.0, 50.0, { maxFeeDragRatio: 0.20 });
    assert.strictEqual(limits.minUsdtLimit, 50.00);
    assert.strictEqual(limits.minFiatLimit, 75000);
    assert.strictEqual(limits.breakEvenUsdtLimit, 10.00);
    assert.strictEqual(limits.breakEvenFiatLimit, 15000);
  });

  it('PE.LIM.3: Custom maxFeeDragRatio (10%, 15%, 25%, 50%) scales minimum limits inversely', () => {
    // 10% drag: maxFeePerUnit = 0.50 -> minVol = 100 USDT -> 150,000 NGN
    const lim10 = pricingEngine.calculateRecommendedLimits({ price: 1500, targetSpread: 5, fiatFee: 50, maxFeeDragRatio: 0.10 });
    assert.strictEqual(lim10.minUsdtLimit, 100.00);
    assert.strictEqual(lim10.minFiatLimit, 150000);
    assert.closeTo(lim10.feeDragRatio, 0.10, 0.001);

    // 25% drag: maxFeePerUnit = 1.25 -> minVol = 40 USDT -> 60,000 NGN
    const lim25 = pricingEngine.calculateRecommendedLimits({ price: 1500, targetSpread: 5, fiatFee: 50, maxFeeDragRatio: 0.25 });
    assert.strictEqual(lim25.minUsdtLimit, 40.00);
    assert.strictEqual(lim25.minFiatLimit, 60000);
    assert.closeTo(lim25.feeDragRatio, 0.25, 0.001);

    // 50% drag: maxFeePerUnit = 2.50 -> minVol = 20 USDT -> 30,000 NGN
    const lim50 = pricingEngine.calculateRecommendedLimits({ price: 1500, targetSpread: 5, fiatFee: 50, maxFeeDragRatio: 0.50 });
    assert.strictEqual(lim50.minUsdtLimit, 20.00);
    assert.strictEqual(lim50.minFiatLimit, 30000);
    assert.closeTo(lim50.feeDragRatio, 0.50, 0.001);
  });

  it('PE.LIM.4: Break-even limit calculations accurately represent 100% fee drag wipeout', () => {
    const limits = pricingEngine.calculateRecommendedLimits({
      price: 1600.0,
      targetSpread: 4.0,
      fiatFee: 100.0
    });
    // breakEvenVol = 100 / 4.0 = 25.0 USDT -> 40,000 NGN
    assert.strictEqual(limits.breakEvenUsdtLimit, 25.00);
    assert.strictEqual(limits.breakEvenFiatLimit, 40000);
  });

  it('PE.LIM.5: calculateRecommendedLimits edge cases (0 spread, 0 fee, negative price, null)', () => {
    const zeroFee = pricingEngine.calculateRecommendedLimits({ price: 1500, targetSpread: 5, fiatFee: 0 });
    assert.strictEqual(zeroFee.minUsdtLimit, 2.0); // Clamped to dust floor

    const badInputs = pricingEngine.calculateRecommendedLimits(null);
    assert.ok(badInputs.minFiatLimit > 0, 'Must safely default on null inputs');

    const negPrice = pricingEngine.calculateRecommendedLimits({ price: -1000, targetSpread: 5, fiatFee: 50 });
    assert.ok(negPrice.minFiatLimit > 0, 'Safe price default on negative price');
  });

  it('PE.LIM.6: Formatted recommendation text contains localized Naira symbol and percentage', () => {
    const lim = pricingEngine.calculateRecommendedLimits({ price: 1500, targetSpread: 5, fiatFee: 50 });
    assert.ok(lim.recommendedText.includes('₦75,000'), 'Text should contain ₦75,000');
    assert.ok(lim.recommendedText.includes('50.00 USDT'), 'Text should contain 50.00 USDT');
    assert.ok(lim.recommendedText.includes('20%'), 'Text should contain 20%');
  });

  // =========================================================================
  // 10. Trade Size Sensitivity Tier Tests (₦5k, ₦10k, ₦30k, ₦100k)
  // =========================================================================

  it('PE.TIER.1: ₦5,000 Micro-Trade (Tier 1: High fee drag / loss warning)', () => {
    // Trade Size: ₦5,000 at ₦1,500/USDT -> Volume = 3.3333 USDT
    // Fixed Fiat Fee: ₦50.00
    // Fee Drag per USDT: ₦50 / 3.3333 = ₦15.00/USDT
    // Target Spread: ₦5.00/USDT
    // Fee Drag as % of Spread: 15.00 / 5.00 = 300% (Guaranteed Loss of ₦10.00/USDT)
    const fiatAmount = 5000;
    const price = 1500.0;
    const fiatFee = 50.0;
    const targetSpread = 5.0;
    const volume = fiatAmount / price; // 3.3333 USDT

    const feeDragPerUnit = fiatFee / volume;
    const feeDragRatio = feeDragPerUnit / targetSpread;
    const netSpreadRealized = targetSpread - feeDragPerUnit;

    assert.closeTo(volume, 3.3333, 0.001);
    assert.closeTo(feeDragPerUnit, 15.00, 0.01);
    assert.closeTo(feeDragRatio, 3.00, 0.01, 'Fee drag is 300% of target spread');
    assert.closeTo(netSpreadRealized, -10.00, 0.01, 'Micro-trade experiences net negative margin');

    const limits = pricingEngine.calculateRecommendedLimits({ price, targetSpread, fiatFee });
    assert.ok(volume < limits.breakEvenUsdtLimit, '₦5,000 volume is below break-even threshold (10 USDT)');
    assert.ok(volume < limits.minUsdtLimit, '₦5,000 volume is below 20% drag limit (50 USDT)');
  });

  it('PE.TIER.2: ₦10,000 Boundary Trade (Tier 2: Threshold boundary)', () => {
    // Trade Size: ₦10,000 at ₦1,500/USDT -> Volume = 6.6667 USDT
    // Fixed Fiat Fee: ₦50.00
    // Fee Drag per USDT: ₦50 / 6.6667 = ₦7.50/USDT
    // On ₦5.00 target spread: 150% drag -> -₦2.50/USDT net loss
    // On ₦10.00 target spread: 75% drag -> +₦2.50/USDT net profit
    // Boundary threshold: spread must be >= ₦7.50 to break even
    const fiatAmount = 10000;
    const price = 1500.0;
    const fiatFee = 50.0;
    const volume = fiatAmount / price; // 6.6667 USDT

    const feeDragPerUnit = fiatFee / volume;
    assert.closeTo(volume, 6.6667, 0.001);
    assert.closeTo(feeDragPerUnit, 7.50, 0.01);

    // Case A: ₦5 spread
    const spread5 = 5.0;
    assert.closeTo(feeDragPerUnit / spread5, 1.50, 0.01, '150% drag on ₦5 spread');
    assert.closeTo(spread5 - feeDragPerUnit, -2.50, 0.01, 'Unprofitable under ₦5 spread');

    // Case B: ₦10 spread
    const spread10 = 10.0;
    assert.closeTo(feeDragPerUnit / spread10, 0.75, 0.01, '75% drag on ₦10 spread');
    assert.closeTo(spread10 - feeDragPerUnit, 2.50, 0.01, 'Profitable under ₦10 spread');
  });

  it('PE.TIER.3: ₦30,000 Viable Spread Trade (Tier 3: Viable spread threshold)', () => {
    // Trade Size: ₦30,000 at ₦1,500/USDT -> Volume = 20.00 USDT
    // Fixed Fiat Fee: ₦50.00
    // Fee Drag per USDT: ₦50 / 20.00 = ₦2.50/USDT
    // On ₦5.00 target spread: 50% drag -> +₦2.50/USDT net profit (50% spread retention)
    // On ₦10.00 target spread: 25% drag -> +₦7.50/USDT net profit (75% spread retention)
    const fiatAmount = 30000;
    const price = 1500.0;
    const fiatFee = 50.0;
    const volume = fiatAmount / price; // 20.0 USDT

    const feeDragPerUnit = fiatFee / volume;
    assert.closeTo(volume, 20.00, 0.001);
    assert.closeTo(feeDragPerUnit, 2.50, 0.01);

    const targetSpread = 5.0;
    const feeDragRatio = feeDragPerUnit / targetSpread;
    const netSpreadRealized = targetSpread - feeDragPerUnit;

    assert.closeTo(feeDragRatio, 0.50, 0.01, '50% fee drag on ₦5 spread');
    assert.closeTo(netSpreadRealized, 2.50, 0.01, 'Generates viable net positive spread');

    const limits = pricingEngine.calculateRecommendedLimits({ price, targetSpread, fiatFee });
    assert.ok(volume >= limits.breakEvenUsdtLimit, '₦30,000 volume exceeds break-even threshold');
  });

  it('PE.TIER.4: ₦100,000 Optimal Low-Drag Execution Trade (Tier 4: Optimal low-drag execution)', () => {
    // Trade Size: ₦100,000 at ₦1,500/USDT -> Volume = 66.6667 USDT
    // Fixed Fiat Fee: ₦50.00
    // Fee Drag per USDT: ₦50 / 66.6667 = ₦0.75/USDT
    // On ₦5.00 target spread: 15% drag <= 20% limit -> +₦4.25/USDT net profit (85% spread retention)
    // On ₦10.00 target spread: 7.5% drag -> +₦9.25/USDT net profit (92.5% spread retention)
    const fiatAmount = 100000;
    const price = 1500.0;
    const fiatFee = 50.0;
    const volume = fiatAmount / price; // 66.6667 USDT

    const feeDragPerUnit = fiatFee / volume;
    assert.closeTo(volume, 66.6667, 0.001);
    assert.closeTo(feeDragPerUnit, 0.75, 0.01);

    const targetSpread = 5.0;
    const feeDragRatio = feeDragPerUnit / targetSpread;
    const netSpreadRealized = targetSpread - feeDragPerUnit;

    assert.closeTo(feeDragRatio, 0.15, 0.01, '15% fee drag satisfies <= 20% optimal threshold');
    assert.closeTo(netSpreadRealized, 4.25, 0.01, 'Retains 85% of target spread');

    const limits = pricingEngine.calculateRecommendedLimits({ price, targetSpread, fiatFee });
    assert.ok(volume >= limits.minUsdtLimit, '₦100,000 volume meets recommended minimum limit (50 USDT)');
  });

  it('PE.TIER.5: Comparative sensitivity across all 4 tiers plus institutional tier (₦500k)', () => {
    const tiers = [
      { name: 'Tier 1 (₦5k)', fiat: 5000, expectedVol: 3.3333, expectedDrag: 15.00, viable5Ngn: false },
      { name: 'Tier 2 (₦10k)', fiat: 10000, expectedVol: 6.6667, expectedDrag: 7.50, viable5Ngn: false },
      { name: 'Tier 3 (₦30k)', fiat: 30000, expectedVol: 20.0000, expectedDrag: 2.50, viable5Ngn: true },
      { name: 'Tier 4 (₦100k)', fiat: 100000, expectedVol: 66.6667, expectedDrag: 0.75, viable5Ngn: true },
      { name: 'Tier 5 (₦500k)', fiat: 500000, expectedVol: 333.3333, expectedDrag: 0.15, viable5Ngn: true }
    ];

    const price = 1500.0;
    const fiatFee = 50.0;
    const spread = 5.0;

    for (const t of tiers) {
      const vol = t.fiat / price;
      const drag = fiatFee / vol;
      const netSpread = spread - drag;

      assert.closeTo(vol, t.expectedVol, 0.001, `${t.name} volume mismatch`);
      assert.closeTo(drag, t.expectedDrag, 0.01, `${t.name} drag mismatch`);
      if (t.viable5Ngn) {
        assert.ok(netSpread > 0, `${t.name} should yield positive net spread`);
      } else {
        assert.ok(netSpread < 0, `${t.name} should yield negative net spread`);
      }
    }
  });

  it('PE.TIER.6: Fee drag sensitivity across varying target spreads (₦2, ₦5, ₦10, ₦20) for all 4 tiers', () => {
    const tiersFiat = [5000, 10000, 30000, 100000];
    const spreads = [2.0, 5.0, 10.0, 20.0];
    const price = 1500.0;
    const fiatFee = 50.0;

    for (const fiat of tiersFiat) {
      const vol = fiat / price;
      const dragPerUnit = fiatFee / vol;

      for (const spread of spreads) {
        const dragRatio = dragPerUnit / spread;
        const netSpread = spread - dragPerUnit;

        // Verify mathematical consistency
        assert.closeTo(dragRatio * spread, dragPerUnit, 0.0001);
        assert.closeTo(netSpread + dragPerUnit, spread, 0.0001);
      }
    }
  });
}, { tier: 1, category: 'Pricing Engine' });
