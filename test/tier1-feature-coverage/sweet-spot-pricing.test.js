/**
 * Tier 1: Feature Coverage — Sweet Spot Pricing Engine Core Tests
 * Validates calculateSweetSpotPricing mathematical correctness, Rank 3–5 median extraction,
 * shallow book graceful fallbacks, safe buy ceiling, spread compression capping,
 * cycle progress guidance, and 3-tier maker ladder allocations.
 */

const { describe, it, beforeEach } = require('../harness/test-runner');
const { assert } = require('../harness/assertions');

describe('Tier 1 — Sweet Spot Pricing Engine Core', () => {
  let pricingEngine;

  beforeEach(async () => {
    pricingEngine = await import('../../js/pricingEngine.js');
  });

  // =========================================================================
  // 1. Sell Sweet Spot & Rank 3-5 Median Extraction with Fallbacks
  // =========================================================================

  it('SS.SELL.1: Extracts Rank 4 (median of Ranks 3-5) when depth >= 5', () => {
    const sellDepth = [
      { price: '1500.00', lastQuantity: '100', minAmount: '1000', maxAmount: '500000' }, // Rank 1
      { price: '1501.50', lastQuantity: '100', minAmount: '1000', maxAmount: '500000' }, // Rank 2
      { price: '1503.00', lastQuantity: '100', minAmount: '1000', maxAmount: '500000' }, // Rank 3
      { price: '1504.00', lastQuantity: '100', minAmount: '1000', maxAmount: '500000' }, // Rank 4 (Median)
      { price: '1505.50', lastQuantity: '100', minAmount: '1000', maxAmount: '500000' }, // Rank 5
      { price: '1507.00', lastQuantity: '100', minAmount: '1000', maxAmount: '500000' }  // Rank 6
    ];

    const result = pricingEngine.calculateSweetSpotPricing({
      sellDepth,
      profitTarget: 7.0,
      tradeVolume: 100
    });

    assert.strictEqual(result.sellSweetSpot, 1504.00, 'Sell sweet spot must be Rank 4 (median of Rank 3-5)');
    assert.strictEqual(result.markers.sellTargetRank, 4);
    assert.strictEqual(result.markers.sellMarkerPrice, 1504.00);
  });

  it('SS.SELL.2: Graceful fallback for shallow books (N=4, N=3, N=2, N=1, N=0)', () => {
    // N = 4: (p3 + p4) / 2
    const depth4 = [
      { price: '1500.00', lastQuantity: '100' },
      { price: '1501.00', lastQuantity: '100' },
      { price: '1503.00', lastQuantity: '100' },
      { price: '1505.00', lastQuantity: '100' }
    ];
    const res4 = pricingEngine.calculateSweetSpotPricing({ sellDepth: depth4, profitTarget: 5.0, filterLimits: false });
    assert.strictEqual(res4.sellSweetSpot, 1504.00, 'N=4 must average p3 and p4: (1503+1505)/2 = 1504');

    // N = 3: p3
    const depth3 = depth4.slice(0, 3);
    const res3 = pricingEngine.calculateSweetSpotPricing({ sellDepth: depth3, profitTarget: 5.0, filterLimits: false });
    assert.strictEqual(res3.sellSweetSpot, 1503.00, 'N=3 must return p3');

    // N = 2: p2
    const depth2 = depth4.slice(0, 2);
    const res2 = pricingEngine.calculateSweetSpotPricing({ sellDepth: depth2, profitTarget: 5.0, filterLimits: false });
    assert.strictEqual(res2.sellSweetSpot, 1501.00, 'N=2 must return p2');

    // N = 1: p1
    const depth1 = depth4.slice(0, 1);
    const res1 = pricingEngine.calculateSweetSpotPricing({ sellDepth: depth1, profitTarget: 5.0, filterLimits: false });
    assert.strictEqual(res1.sellSweetSpot, 1500.00, 'N=1 must return p1');

    // N = 0: 0 and OFFLINE status
    const res0 = pricingEngine.calculateSweetSpotPricing({ sellDepth: [], profitTarget: 5.0 });
    assert.strictEqual(res0.sellSweetSpot, 0, 'N=0 must return 0');
    assert.strictEqual(res0.isOffline, true);
    assert.strictEqual(res0.status, 'OFFLINE');
  });

  // =========================================================================
  // 2. Maximum Safe Buy Rate & Mathematical Invariant Spread Guarantee
  // =========================================================================

  it('SS.MATH.1: Correctly nets 0.3% maker fee and ₦50 stamp duty into maxBuyPrice', () => {
    // Sell Sweet Spot = 1504.00, Profit Target = 7.00, Trade Volume = 100 USDT, Inflow Fee = 50 NGN
    // Inflow Fee per unit = 50 / 100 = 0.50 NGN
    // Effective Sell Rev = 1504.00 (0% sell fee)
    // maxBuyPrice = (1 - 0.003) * (1504.00 - 7.00 - 0.50) = 0.997 * 1496.50 = 1492.0105
    // Strictly floored to 2 decimals -> 1492.01 NGN
    const sellDepth = [
      { price: '1500.00', lastQuantity: '100' },
      { price: '1501.00', lastQuantity: '100' },
      { price: '1503.00', lastQuantity: '100' },
      { price: '1504.00', lastQuantity: '100' },
      { price: '1506.00', lastQuantity: '100' }
    ];

    const result = pricingEngine.calculateSweetSpotPricing({
      sellDepth,
      profitTarget: 7.0,
      tradeVolume: 100,
      platformFeePct: 0.3,
      inflowFee: 50.0,
      filterLimits: false
    });

    assert.strictEqual(result.maxBuyPrice, 1492.01);
    assert.strictEqual(result.effectiveSellRevenue, 1504.00);

    // Effective Buy Cost at maxBuyPrice: (1492.01 / 0.997) + 0.50 = 1496.499498 + 0.50 = 1496.999498
    // Realized Spread: 1504.00 - 1497.00 = 7.00 NGN/USDT
    assert.ok(result.realizedSpread >= 7.00, 'Realized spread must be >= target profit');
    assert.strictEqual(result.profitTarget, 7.0);
  });

  it('SS.MATH.2: Verifies Spread Guarantee across 500 randomized parameter configurations', () => {
    for (let i = 0; i < 500; i++) {
      const pSell = 1400 + Math.random() * 300; // 1400 - 1700 NGN
      const targetProfit = Math.round((1 + Math.random() * 20) * 100) / 100; // 1.00 - 21.00 NGN
      const tradeVol = 20 + Math.random() * 500; // 20 - 520 USDT
      const inflowFee = 50;

      const sellDepth = [
        { price: (pSell - 4).toFixed(2), lastQuantity: '100' },
        { price: (pSell - 2).toFixed(2), lastQuantity: '100' },
        { price: (pSell - 1).toFixed(2), lastQuantity: '100' },
        { price: pSell.toFixed(2), lastQuantity: '100' },
        { price: (pSell + 2).toFixed(2), lastQuantity: '100' }
      ];

      const result = pricingEngine.calculateSweetSpotPricing({
        sellDepth,
        profitTarget: targetProfit,
        tradeVolume: tradeVol,
        platformFeePct: 0.3,
        inflowFee,
        filterLimits: false
      });

      if (result.maxBuyPrice > 0) {
        const netSpread = result.effectiveSellRevenue - result.effectiveBuyCost;
        assert.ok(
          netSpread >= targetProfit - 1e-4,
          `Spread guarantee invariant violated: netSpread (${netSpread}) < targetProfit (${targetProfit})`
        );
      }
    }
  });

  // =========================================================================
  // 3. Market Buy Sweet Spot & Spread Compression Handling
  // =========================================================================

  it('SS.COMPRESS.1: Clamps buySweetSpot to maxBuyPrice and flags COMPRESSED when market bids are high', () => {
    const sellDepth = [
      { price: '1500.00', lastQuantity: '100' },
      { price: '1501.00', lastQuantity: '100' },
      { price: '1502.00', lastQuantity: '100' },
      { price: '1504.00', lastQuantity: '100' }, // Sell sweet spot = 1504.00 -> maxBuyPrice = 1492.01
      { price: '1506.00', lastQuantity: '100' }
    ];

    // High market bids: Rank 4 is 1495.00 -> Market Buy Sweet Spot = 1495.10 > 1492.01
    const buyDepth = [
      { price: '1498.00', lastQuantity: '100' },
      { price: '1497.00', lastQuantity: '100' },
      { price: '1496.00', lastQuantity: '100' },
      { price: '1495.00', lastQuantity: '100' },
      { price: '1494.00', lastQuantity: '100' }
    ];

    const result = pricingEngine.calculateSweetSpotPricing({
      sellDepth,
      buyDepth,
      profitTarget: 7.0,
      tradeVolume: 100,
      filterLimits: false
    });

    assert.strictEqual(result.marketBuySweetSpot, 1495.10);
    assert.strictEqual(result.maxBuyPrice, 1492.01);
    assert.strictEqual(result.buySweetSpot, 1492.01, 'buySweetSpot must be clamped to maxBuyPrice');
    assert.strictEqual(result.isSafe, false);
    assert.strictEqual(result.isCompressed, true);
    assert.strictEqual(result.status, 'COMPRESSED');
    assert.ok(result.statusMessage.includes('Spread compression detected'));
  });

  it('SS.COMPRESS.2: Uses marketBuySweetSpot and flags SAFE when market bids are within safe ceiling', () => {
    const sellDepth = [
      { price: '1500.00', lastQuantity: '100' },
      { price: '1501.00', lastQuantity: '100' },
      { price: '1502.00', lastQuantity: '100' },
      { price: '1504.00', lastQuantity: '100' }, // Sell sweet spot = 1504.00 -> maxBuyPrice = 1492.01
      { price: '1506.00', lastQuantity: '100' }
    ];

    // Low market bids: Rank 4 is 1488.00 -> Market Buy Sweet Spot = 1488.10 <= 1492.01
    const buyDepth = [
      { price: '1491.00', lastQuantity: '100' },
      { price: '1490.00', lastQuantity: '100' },
      { price: '1489.00', lastQuantity: '100' },
      { price: '1488.00', lastQuantity: '100' },
      { price: '1487.00', lastQuantity: '100' }
    ];

    const result = pricingEngine.calculateSweetSpotPricing({
      sellDepth,
      buyDepth,
      profitTarget: 7.0,
      tradeVolume: 100,
      filterLimits: false
    });

    assert.strictEqual(result.marketBuySweetSpot, 1488.10);
    assert.strictEqual(result.buySweetSpot, 1488.10);
    assert.strictEqual(result.isSafe, true);
    assert.strictEqual(result.isCompressed, false);
    assert.strictEqual(result.status, 'SAFE');
    assert.ok(result.realizedSpread > 7.0, 'Merchant captures bonus spread above target profit');
  });

  // =========================================================================
  // 4. Cycle Guidance & 3-Tier Limit Ladder Allocations
  // =========================================================================

  it('SS.GUIDANCE.1: Correctly tracks cycle progress and needed remaining rate', () => {
    const sellDepth = [
      { price: '1500.00', lastQuantity: '100' },
      { price: '1501.00', lastQuantity: '100' },
      { price: '1503.00', lastQuantity: '100' },
      { price: '1504.00', lastQuantity: '100' },
      { price: '1506.00', lastQuantity: '100' }
    ];

    // 100,000 USDT cycle, maxBuyPrice = 1492.01
    // Bought 20,000 USDT at 1490.00
    // Remaining = 80,000 USDT
    // Total budget = 100,000 * 1492.01 = 149,201,000
    // Spent budget = 20,000 * 1490.00 = 29,800,000
    // Needed remaining = (149,201,000 - 29,800,000) / 80,000 = 119,401,000 / 80,000 = 1492.5125 -> 1492.51
    const result = pricingEngine.calculateSweetSpotPricing({
      sellDepth,
      profitTarget: 7.0,
      cycleVolume: 100000,
      tradeVolume: 100,
      boughtVolume: 20000,
      boughtAvgPrice: 1490.00,
      filterLimits: false
    });

    assert.strictEqual(result.cycleGuidance.cycleVolume, 100000);
    assert.strictEqual(result.cycleGuidance.boughtVolume, 20000);
    assert.strictEqual(result.cycleGuidance.remainingVolume, 80000);
    assert.strictEqual(result.cycleGuidance.progressPercent, 20);
    assert.strictEqual(result.cycleGuidance.isTargetAchieved, false);
    assert.strictEqual(result.cycleGuidance.targetAvgBuyRate, 1492.01);
    assert.strictEqual(result.cycleGuidance.neededRemainingRate, 1492.51);

    // Verify 3-Tier Ladder allocations (40% / 40% / 20%)
    assert.strictEqual(result.brackets.length, 3);
    const [t1, t2, t3] = result.brackets;

    assert.strictEqual(t1.volumeUsdt, 32000, 'Tier 1 must be 40% of remaining 80,000 = 32,000');
    assert.strictEqual(t1.targetPrice, 1492.51, 'Tier 1 must anchor to neededRemainingRate');

    assert.strictEqual(t2.volumeUsdt, 32000, 'Tier 2 must be 40% of remaining 80,000 = 32,000');
    assert.ok(t2.targetPrice < t1.targetPrice, 'Tier 2 must offer discount below Tier 1');

    assert.strictEqual(t3.volumeUsdt, 16000, 'Tier 3 must be 20% of remaining 80,000 = 16,000');
    assert.ok(t3.targetPrice < t2.targetPrice, 'Tier 3 must offer deep discount below Tier 2');

    // Volume-weighted average of ladder must be <= neededRemainingRate
    assert.ok(result.actualWeightedAvg <= 1492.51, 'Actual weighted average of tiers must be <= needed rate');
  });

  // =========================================================================
  // 5. Edge Cases & Boundary Handling
  // =========================================================================

  it('SS.EDGE.1: Handles excessive profit target gracefully (INVALID_TARGET)', () => {
    const sellDepth = [
      { price: '1500.00', lastQuantity: '100' },
      { price: '1501.00', lastQuantity: '100' },
      { price: '1502.00', lastQuantity: '100' },
      { price: '1503.00', lastQuantity: '100' },
      { price: '1504.00', lastQuantity: '100' }
    ];

    // Target profit of ₦2,000 exceeds entire sell price
    const result = pricingEngine.calculateSweetSpotPricing({
      sellDepth,
      profitTarget: 2000.0,
      filterLimits: false
    });

    assert.strictEqual(result.status, 'INVALID_TARGET');
    assert.strictEqual(result.maxBuyPrice, 0);
    assert.strictEqual(result.buySweetSpot, 0);
    assert.ok(result.statusMessage.includes('exceeds feasible market spread'));
  });

  it('SS.EDGE.2: Zero profit target calculates exact break-even rate', () => {
    const sellDepth = [
      { price: '1500.00', lastQuantity: '100' },
      { price: '1501.00', lastQuantity: '100' },
      { price: '1502.00', lastQuantity: '100' },
      { price: '1504.00', lastQuantity: '100' },
      { price: '1505.00', lastQuantity: '100' }
    ];

    const result = pricingEngine.calculateSweetSpotPricing({
      sellDepth,
      profitTarget: 0,
      tradeVolume: 100,
      filterLimits: false
    });

    // maxBuyPrice = floor(0.997 * (1504 - 0 - 0.50)) = floor(0.997 * 1503.5) = floor(1498.9895) = 1498.98
    assert.strictEqual(result.maxBuyPrice, 1498.98);
    assert.ok(result.realizedSpread >= 0, 'Realized spread must be >= 0 for break-even target');
  });

  it('SS.EDGE.3: Completely empty order books return safe OFFLINE structure without exceptions', () => {
    const result = pricingEngine.calculateSweetSpotPricing({
      sellDepth: [],
      buyDepth: []
    });

    assert.strictEqual(result.isOffline, true);
    assert.strictEqual(result.status, 'OFFLINE');
    assert.strictEqual(result.sellSweetSpot, 0);
    assert.strictEqual(result.buySweetSpot, 0);
    assert.strictEqual(result.maxBuyPrice, 0);
    assert.strictEqual(result.marketBuySweetSpot, 0);
    assert.strictEqual(result.effectiveSellRevenue, 0);
    assert.strictEqual(result.effectiveBuyCost, 0);
    assert.strictEqual(result.realizedSpread, 0);
    assert.strictEqual(result.markers.sellTargetRank, 0);
    assert.strictEqual(result.markers.buyTargetRank, 0);
  });

  // =========================================================================
  // 6. Empirical Mathematical Stress & Fuzzing (Challenger 1)
  // =========================================================================

  it('SS.CHALLENGER.1: Invariant 1 — Fuzz 1,500+ randomized depth configurations: netSpread >= profitTarget whenever buySweetSpot <= maxBuyPrice', () => {
    for (let i = 0; i < 1500; i++) {
      const baseSellPrice = 1000 + Math.random() * 1500; // 1,000 to 2,500 NGN
      const profitTarget = Math.round((1.0 + Math.random() * 49.0) * 100) / 100; // 1.00 to 50.00 NGN
      const tradeVolume = Math.round((10 + Math.random() * 990) * 10) / 10; // 10 to 1,000 USDT
      const cycleVolume = Math.round(100 + Math.random() * 99900); // 100 to 100,000 USDT
      const platformFeePct = Math.random() < 0.8 ? 0.3 : (0.1 + Math.random() * 0.9);
      const inflowFee = Math.random() < 0.8 ? 50.0 : (Math.random() * 100);

      const sellCount = 3 + Math.floor(Math.random() * 10);
      const sellDepth = [];
      let p = baseSellPrice;
      for (let s = 0; s < sellCount; s++) {
        p += Math.random() * 2.5;
        sellDepth.push({ price: p.toFixed(2), lastQuantity: (20 + Math.random() * 200).toFixed(2) });
      }

      const buyCount = 3 + Math.floor(Math.random() * 10);
      const buyDepth = [];
      let b = baseSellPrice - profitTarget + ((Math.random() * 20) - 10);
      for (let s = 0; s < buyCount; s++) {
        b -= Math.random() * 2.5;
        buyDepth.push({ price: Math.max(10, b).toFixed(2), lastQuantity: (20 + Math.random() * 200).toFixed(2) });
      }

      const result = pricingEngine.calculateSweetSpotPricing({
        sellDepth,
        buyDepth,
        profitTarget,
        cycleVolume,
        tradeVolume,
        platformFeePct,
        inflowFee,
        filterLimits: false
      });

      if (result.sellSweetSpot > 0 && result.maxBuyPrice > 0 && result.buySweetSpot <= result.maxBuyPrice) {
        const netSpread = result.effectiveSellRevenue - result.effectiveBuyCost;
        assert.ok(
          netSpread >= profitTarget - 1e-4,
          `Invariant 1 Violation at trial ${i}: netSpread (${netSpread}) < profitTarget (${profitTarget})`
        );
      }
    }
  });

  it('SS.CHALLENGER.2: Invariant 2 — At maxBuyPrice, net profit strictly equals profit target (within precision / cents)', () => {
    let maxDiff = 0;
    for (let i = 0; i < 1500; i++) {
      const baseSellPrice = 1000 + Math.random() * 1500;
      const profitTarget = Math.round((1.0 + Math.random() * 49.0) * 100) / 100;
      const tradeVolume = Math.round((10 + Math.random() * 990) * 10) / 10;
      const platformFeePct = Math.random() < 0.8 ? 0.3 : (0.1 + Math.random() * 0.9);
      const inflowFee = Math.random() < 0.8 ? 50.0 : (Math.random() * 100);

      const sellDepth = [
        { price: baseSellPrice.toFixed(2), lastQuantity: '100' },
        { price: (baseSellPrice + 1).toFixed(2), lastQuantity: '100' },
        { price: (baseSellPrice + 2).toFixed(2), lastQuantity: '100' },
        { price: (baseSellPrice + 3).toFixed(2), lastQuantity: '100' },
        { price: (baseSellPrice + 4).toFixed(2), lastQuantity: '100' }
      ];

      const result = pricingEngine.calculateSweetSpotPricing({
        sellDepth,
        profitTarget,
        tradeVolume,
        platformFeePct,
        inflowFee,
        filterLimits: false
      });

      if (result.sellSweetSpot > 0 && result.maxBuyPrice > 0) {
        const phi = pricingEngine.normalizeFeeRate(platformFeePct);
        const costAtCeiling = (result.maxBuyPrice / (1 - phi)) + (inflowFee / tradeVolume);
        const profitAtCeiling = result.effectiveSellRevenue - costAtCeiling;
        const diff = profitAtCeiling - profitTarget;
        if (Math.abs(diff) > maxDiff) maxDiff = Math.abs(diff);

        // Due to Math.floor to 2 decimal places, profitAtCeiling >= profitTarget always, and diff <= 0.015 NGN
        assert.ok(
          profitAtCeiling >= profitTarget - 1e-4,
          `Invariant 2 Undercut at trial ${i}: profitAtCeiling (${profitAtCeiling}) < profitTarget (${profitTarget})`
        );
        assert.ok(
          diff <= 0.015,
          `Invariant 2 Precision Violation at trial ${i}: diff (${diff}) exceeds 0.015 NGN`
        );
      }
    }
  });

  it('SS.CHALLENGER.3: Invariant 3 — Clamping: when marketBuySweetSpot > maxBuyPrice, buySweetSpot === maxBuyPrice and status === COMPRESSED', () => {
    for (let i = 0; i < 1000; i++) {
      const pSell = 1200 + Math.random() * 1000;
      const profitTarget = Math.round((2.0 + Math.random() * 20.0) * 100) / 100;
      const tradeVolume = 50 + Math.random() * 200;

      const sellDepth = [
        { price: pSell.toFixed(2), lastQuantity: '100' },
        { price: (pSell + 1).toFixed(2), lastQuantity: '100' },
        { price: (pSell + 2).toFixed(2), lastQuantity: '100' },
        { price: (pSell + 3).toFixed(2), lastQuantity: '100' },
        { price: (pSell + 4).toFixed(2), lastQuantity: '100' }
      ];

      // Calculate approximate maxBuyPrice
      const approxMaxBuy = 0.997 * ((pSell + 3) - profitTarget - (50 / tradeVolume));
      // Adversarially set market bids either clearly above (compressed) or clearly below (safe)
      const isAdversariallyCompressed = Math.random() < 0.6;
      const bidBase = isAdversariallyCompressed ? (approxMaxBuy + 5 + Math.random() * 10) : (approxMaxBuy - 5 - Math.random() * 10);

      const buyDepth = [
        { price: (bidBase + 2).toFixed(2), lastQuantity: '100' },
        { price: (bidBase + 1).toFixed(2), lastQuantity: '100' },
        { price: bidBase.toFixed(2), lastQuantity: '100' },
        { price: (bidBase - 0.10).toFixed(2), lastQuantity: '100' }, // rank 4 bid -> marketBuySweetSpot = bidBase
        { price: (bidBase - 1).toFixed(2), lastQuantity: '100' }
      ];

      const result = pricingEngine.calculateSweetSpotPricing({
        sellDepth,
        buyDepth,
        profitTarget,
        tradeVolume,
        filterLimits: false
      });

      if (result.marketBuySweetSpot > result.maxBuyPrice) {
        assert.strictEqual(
          result.buySweetSpot,
          result.maxBuyPrice,
          `Clamping failed: buySweetSpot (${result.buySweetSpot}) !== maxBuyPrice (${result.maxBuyPrice})`
        );
        assert.strictEqual(result.status, 'COMPRESSED');
        assert.strictEqual(result.isCompressed, true);
        assert.strictEqual(result.isSafe, false);
      } else {
        assert.strictEqual(result.buySweetSpot, result.marketBuySweetSpot);
        assert.strictEqual(result.status, 'SAFE');
        assert.strictEqual(result.isCompressed, false);
        assert.strictEqual(result.isSafe, true);
      }
    }
  });

  it('SS.CHALLENGER.4: Invariant 4 — Tier ladder average: actualWeightedAvg <= neededRemainingRate across all cycle states', () => {
    const cycleVolumes = [1, 5, 10, 50, 100, 500, 1000, 5000, 20000, 100000];
    for (const vol of cycleVolumes) {
      for (let step = 0; step < 10; step++) {
        const boughtFraction = step / 10; // 0% to 90%
        const boughtVol = Math.round(vol * boughtFraction);
        const boughtAvg = 1490.00 + (Math.random() * 6 - 3);

        const result = pricingEngine.calculateSweetSpotPricing({
          sellDepth: [
            { price: '1500.00', lastQuantity: '100' },
            { price: '1501.00', lastQuantity: '100' },
            { price: '1502.00', lastQuantity: '100' },
            { price: '1504.00', lastQuantity: '100' },
            { price: '1506.00', lastQuantity: '100' }
          ],
          profitTarget: 7.0,
          cycleVolume: vol,
          tradeVolume: 100,
          boughtVolume: boughtVol,
          boughtAvgPrice: boughtAvg,
          filterLimits: false
        });

        if (result.cycleGuidance.neededRemainingRate > 1.0) {
          assert.ok(
            result.actualWeightedAvg <= result.cycleGuidance.neededRemainingRate + 0.01,
            `Tier ladder average violation: actualWeightedAvg (${result.actualWeightedAvg}) > neededRemainingRate (${result.cycleGuidance.neededRemainingRate})`
          );
        }

        // Bracket volume conservation: sum(brackets) === volToDistribute
        const [t1, t2, t3] = result.brackets;
        const totalTierVol = t1.volumeUsdt + t2.volumeUsdt + t3.volumeUsdt;
        const expectedDistribute = result.cycleGuidance.remainingVolume > 0 ? result.cycleGuidance.remainingVolume : vol;
        assert.strictEqual(totalTierVol, expectedDistribute, `Tier volumes must sum exactly to expected distribution volume`);
      }
    }
  });

  it('SS.CHALLENGER.5: Adversarial Boundary Stress — Identical prices, crossed books, and micro volumes', () => {
    // A. Flat order book (all competitors at exact same price)
    const flatDepth = [
      { price: '1500.00', lastQuantity: '100' },
      { price: '1500.00', lastQuantity: '100' },
      { price: '1500.00', lastQuantity: '100' },
      { price: '1500.00', lastQuantity: '100' },
      { price: '1500.00', lastQuantity: '100' }
    ];
    const flatRes = pricingEngine.calculateSweetSpotPricing({
      sellDepth: flatDepth,
      buyDepth: flatDepth,
      profitTarget: 5.0,
      tradeVolume: 100,
      filterLimits: false
    });
    assert.strictEqual(flatRes.sellSweetSpot, 1500.00);
    assert.strictEqual(flatRes.marketBuySweetSpot, 1500.10);
    // maxBuyPrice = floor(0.997 * (1500 - 5 - 0.50)) = floor(0.997 * 1494.50) = 1490.01
    assert.strictEqual(flatRes.maxBuyPrice, 1490.01);
    assert.strictEqual(flatRes.buySweetSpot, 1490.01);
    assert.strictEqual(flatRes.status, 'COMPRESSED');

    // B. Micro Trade Volume: 1 USDT (inflow fee per unit = 50 / 1 = ₦50 fee drag)
    const microRes = pricingEngine.calculateSweetSpotPricing({
      sellDepth: flatDepth,
      profitTarget: 5.0,
      tradeVolume: 1.0,
      inflowFee: 50.0,
      filterLimits: false
    });
    // rawMaxBuy = 0.997 * (1500 - 5 - 50) = 0.997 * 1445 = 1440.665 -> 1440.66
    assert.strictEqual(microRes.maxBuyPrice, 1440.66);
    assert.ok(microRes.realizedSpread >= 5.0, 'Realized spread must meet profit target even under ₦50/USDT micro fee drag');

    // C. Massive Trade Volume: 10,000 USDT
    // First verify dust filter cutoff: with 100 USDT ads, 5% of 10,000 = 500 USDT threshold,
    // so 100 USDT ads are filtered as dust -> OFFLINE
    const dustFilteredRes = pricingEngine.calculateSweetSpotPricing({
      sellDepth: flatDepth,
      profitTarget: 5.0,
      tradeVolume: 10000.0,
      inflowFee: 50.0,
      filterLimits: false
    });
    assert.strictEqual(dustFilteredRes.isOffline, true, 'Ads < 500 USDT are filtered as dust when tradeVolume=10,000');
    assert.strictEqual(dustFilteredRes.maxBuyPrice, 0);

    // Now test with institutional liquidity (1,000 USDT per ad >= 500 USDT dust floor)
    const deepFlatDepth = flatDepth.map(ad => ({ ...ad, lastQuantity: '1000' }));
    const macroRes = pricingEngine.calculateSweetSpotPricing({
      sellDepth: deepFlatDepth,
      profitTarget: 5.0,
      tradeVolume: 10000.0,
      inflowFee: 50.0,
      filterLimits: false
    });
    // rawMaxBuy = 0.997 * (1500 - 5 - 0.005) = 0.997 * 1494.995 = 1490.510015 -> 1490.51
    assert.strictEqual(macroRes.maxBuyPrice, 1490.51);
    assert.ok(macroRes.realizedSpread >= 5.0, 'Realized spread must meet profit target at macro volume');
  });
}, { tier: 1, category: 'Pricing Engine' });

