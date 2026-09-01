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

  // ==========================================
  // 2. Reference Price Computation (calculateReferencePrice)
  // ==========================================

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
    // exitPrice = 1520.00
    // targetSpread = 5.0, inflowFee = 50, avgVolume = 100 -> feePerUnit = 0.50
    // maxBuyPrice = 1520.00 - 5.0 - 0.50 = 1514.50
    // referenceBuyPrice = 1500.00 (competitor mode)
    // rawSuggestedBuy = 1500.00 + 0.10 = 1500.10
    // suggestedBuy = min(1500.10, 1514.50) = 1500.10
    // isSafe = true (1500.10 <= 1514.50)
    // excessSpread = 1520.00 - 1500.10 - 0.50 = 19.40

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
    // High competitor buy ad near sell price
    const tightBuyAds = [{ price: '1518.00', lastQuantity: '500' }];
    // exitPrice = 1520.00
    // maxBuyPrice = 1520 - 5.0 - 0.50 = 1514.50
    // rawSuggestedBuy = 1518.00 + 0.10 = 1518.10 > 1514.50
    // suggestedBuy should cap at 1514.50, isSafe: false

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

  // ==========================================
  // 4. Sell Ad Assistant Pricing (calculateSellPricing)
  // ==========================================

  const activeSellAds = [
    { price: '1550.00', lastQuantity: '500' },
    { price: '1555.00', lastQuantity: '500' }
  ];

  it('PE.SELL.1: Standard undercutting calculates -₦0.10 below reference sell price', () => {
    // costBasis = 1500.00
    // targetSpread = 5.0, outflowFee = 50, avgVolume = 100 -> feePerUnit = 0.50
    // breakEven = 1500.00 + 0.50 = 1500.50
    // targetSellPrice = 1500.00 + 5.0 + 0.50 = 1505.50
    // referenceSellPrice = 1550.00 (competitor mode)
    // rawSuggestedSell = 1550.00 - 0.10 = 1549.90
    // suggestedSell = max(1549.90, 1505.50) = 1549.90
    // isSafe = true (1549.90 >= 1505.50)
    // sellSpread = 1549.90 - 1500.00 - 0.50 = 49.40

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
    // Competitor sell ad price is depressed below target margin
    const depressedSellAds = [{ price: '1504.00', lastQuantity: '500' }];
    // costBasis = 1500.00, targetSpread = 5.0, feePerUnit = 0.50 -> targetSellPrice = 1505.50
    // rawSuggestedSell = 1504.00 - 0.10 = 1503.90 < targetSellPrice
    // suggestedSell should floor at 1505.50, isSafe: false

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

  // ==========================================
  // 5. Boundary & Extreme Value Robustness
  // ==========================================

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
}, { tier: 1, category: 'Pricing Engine' });
