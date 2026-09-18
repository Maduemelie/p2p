/**
 * Challenger 2: Adversarial Boundary Conditions & Edge Case Verification Suite
 * Targets: calculateSweetSpotPricing in js/pricingEngine.js
 * 
 * Verifies:
 * 1. Empty and malformed order books (sellDepth = [], buyDepth = [])
 * 2. Shallow order books (lengths 1, 2, 3, 4)
 * 3. Tied prices and multimodal clusters
 * 4. Inverted and crossed order books (highest bid > lowest ask)
 * 5. Zero and pathological profit targets (profitTarget = 0, negative, micro, excessive)
 * 6. Zero, negative, and completed session volumes (boughtVolume >= cycleVolume)
 * 7. Zero fees, extreme fees, and corrupted fee rates
 * 8. Monte Carlo fuzzing across 1,000 pathological parameter permutations
 * 9. Empirical reproduction of boundary failure modes & vulnerability cases
 */

const { describe, it, beforeEach } = require('./harness/test-runner');
const { assert } = require('./harness/assertions');

describe('Challenger 2 — 1. Empty & Malformed Order Books', () => {
  let pricingEngine;

  beforeEach(async () => {
    pricingEngine = await import('../js/pricingEngine.js');
  });

  it('1.1: Completely empty books (sellDepth = [], buyDepth = []) degrade gracefully', async () => {
    const result = pricingEngine.calculateSweetSpotPricing({
      sellDepth: [],
      buyDepth: []
    });

    assert.strictEqual(result.isOffline, true, 'isOffline must be true');
    assert.strictEqual(result.status, 'OFFLINE', 'status must be OFFLINE');
    assert.strictEqual(result.sellSweetSpot, 0);
    assert.strictEqual(result.buySweetSpot, 0);
    assert.strictEqual(result.maxBuyPrice, 0);
    assert.strictEqual(result.marketBuySweetSpot, 0);
    assert.strictEqual(result.realizedSpread, 0);
    assert.strictEqual(result.effectiveSellRevenue, 0);
    assert.strictEqual(result.effectiveBuyCost, 0);
    assert.strictEqual(result.markers.sellTargetRank, 0);
    assert.strictEqual(result.markers.buyTargetRank, 0);
    assert.strictEqual(result.markers.sellMarkerPrice, 0);
    assert.strictEqual(result.markers.buyMarkerPrice, 0);
    assert.ok(typeof result.statusMessage === 'string' && result.statusMessage.length > 0);
    assert.ok(!Number.isNaN(result.sellSweetSpot), 'sellSweetSpot must not be NaN');
    assert.ok(!Number.isNaN(result.buySweetSpot), 'buySweetSpot must not be NaN');
  });

  it('1.2: Null, undefined, and non-array depths handle safely without throwing', async () => {
    const tests = [
      { sellDepth: null, buyDepth: null },
      { sellDepth: undefined, buyDepth: undefined },
      { sellDepth: 'string_sell', buyDepth: 12345 },
      { sellDepth: { ads: [] }, buyDepth: false },
      { sellDepth: true, buyDepth: () => {} }
    ];

    for (const params of tests) {
      const result = pricingEngine.calculateSweetSpotPricing(params);
      assert.strictEqual(result.isOffline, true);
      assert.strictEqual(result.status, 'OFFLINE');
      assert.strictEqual(result.sellSweetSpot, 0);
      assert.strictEqual(result.buySweetSpot, 0);
      assert.ok(!Number.isNaN(result.maxBuyPrice));
    }
  });

  it('1.3: Malformed, non-numeric, and non-positive items in depth arrays are cleanly filtered', async () => {
    const malformedSell = [
      null,
      undefined,
      {},
      { foo: 'bar' },
      { price: 'NaN', lastQuantity: '100' },
      { price: '-1500.00', lastQuantity: '100' },
      { price: '0', lastQuantity: '100' },
      { price: 'abc', lastQuantity: '100' }
    ];
    const malformedBuy = [
      { price: null },
      { price: undefined },
      { price: -50 }
    ];

    const result = pricingEngine.calculateSweetSpotPricing({
      sellDepth: malformedSell,
      buyDepth: malformedBuy,
      profitTarget: 7.0
    });

    assert.strictEqual(result.isOffline, true);
    assert.strictEqual(result.status, 'OFFLINE');
    assert.strictEqual(result.sellSweetSpot, 0);
    assert.strictEqual(result.buySweetSpot, 0);
  });

  it('1.4: Asymmetric depth: sellDepth populated, buyDepth empty', async () => {
    const sellDepth = [
      { price: '1500.00', lastQuantity: '100' },
      { price: '1501.00', lastQuantity: '100' },
      { price: '1502.00', lastQuantity: '100' },
      { price: '1504.00', lastQuantity: '100' },
      { price: '1505.00', lastQuantity: '100' }
    ];

    const result = pricingEngine.calculateSweetSpotPricing({
      sellDepth,
      buyDepth: [],
      profitTarget: 7.0,
      tradeVolume: 100,
      filterLimits: false
    });

    assert.strictEqual(result.isOffline, false);
    assert.strictEqual(result.sellSweetSpot, 1504.00);
    assert.strictEqual(result.maxBuyPrice, 1492.01);
    // When buyDepth is empty, marketBuySweetSpot defaults to maxBuyPrice
    assert.strictEqual(result.marketBuySweetSpot, 1492.01);
    assert.strictEqual(result.buySweetSpot, 1492.01);
    assert.strictEqual(result.isSafe, true);
    assert.strictEqual(result.status, 'SAFE');
    assert.strictEqual(result.markers.sellTargetRank, 4);
    assert.strictEqual(result.markers.buyTargetRank, 0);
  });

  it('1.5: Asymmetric depth: sellDepth empty, buyDepth populated (Observed Fallback Behavior)', async () => {
    const buyDepth = [
      { price: '1490.00', lastQuantity: '100' },
      { price: '1489.00', lastQuantity: '100' },
      { price: '1488.00', lastQuantity: '100' },
      { price: '1487.00', lastQuantity: '100' },
      { price: '1486.00', lastQuantity: '100' }
    ];

    const result = pricingEngine.calculateSweetSpotPricing({
      sellDepth: [],
      buyDepth,
      profitTarget: 7.0,
      filterLimits: false
    });

    assert.strictEqual(result.isOffline, true);
    assert.strictEqual(result.status, 'OFFLINE');
    assert.strictEqual(result.sellSweetSpot, 0);
    assert.strictEqual(result.maxBuyPrice, 0);
    // Due to fallback in line 853, marketBuySweetSpot (1487.10) is returned as buySweetSpot
    assert.strictEqual(result.marketBuySweetSpot, 1487.10);
    assert.strictEqual(result.buySweetSpot, 1487.10);
    assert.strictEqual(result.markers.sellTargetRank, 0);
    assert.strictEqual(result.markers.buyTargetRank, 4);
  });

  it('1.6: Invocation with no arguments or empty object calculateSweetSpotPricing()', async () => {
    const resNoArg = pricingEngine.calculateSweetSpotPricing();
    assert.strictEqual(resNoArg.isOffline, true);
    assert.strictEqual(resNoArg.status, 'OFFLINE');

    const resEmptyObj = pricingEngine.calculateSweetSpotPricing({});
    assert.strictEqual(resEmptyObj.isOffline, true);
    assert.strictEqual(resEmptyObj.status, 'OFFLINE');
  });
});

describe('Challenger 2 — 2. Shallow Books (Lengths 1, 2, 3, 4)', () => {
  let pricingEngine;

  beforeEach(async () => {
    pricingEngine = await import('../js/pricingEngine.js');
  });

  it('2.1: Depth length N = 1 selects Rank 1 ask and bid', async () => {
    const sellDepth = [{ price: '1502.50', lastQuantity: '100' }];
    const buyDepth = [{ price: '1495.20', lastQuantity: '100' }];

    const result = pricingEngine.calculateSweetSpotPricing({
      sellDepth,
      buyDepth,
      profitTarget: 5.0,
      tradeVolume: 100,
      filterLimits: false
    });

    assert.strictEqual(result.sellSweetSpot, 1502.50);
    assert.strictEqual(result.markers.sellTargetRank, 1);
    assert.strictEqual(result.marketBuySweetSpot, 1495.30); // 1495.20 + 0.10
    assert.strictEqual(result.markers.buyTargetRank, 1);
  });

  it('2.2: Depth length N = 2 selects Rank 2 ask and bid', async () => {
    const sellDepth = [
      { price: '1501.00', lastQuantity: '100' },
      { price: '1503.00', lastQuantity: '100' }
    ];
    const buyDepth = [
      { price: '1496.00', lastQuantity: '100' },
      { price: '1494.00', lastQuantity: '100' }
    ];

    const result = pricingEngine.calculateSweetSpotPricing({
      sellDepth,
      buyDepth,
      profitTarget: 5.0,
      tradeVolume: 100,
      filterLimits: false
    });

    assert.strictEqual(result.sellSweetSpot, 1503.00);
    assert.strictEqual(result.markers.sellTargetRank, 2);
    assert.strictEqual(result.marketBuySweetSpot, 1494.10); // 1494.00 + 0.10
    assert.strictEqual(result.markers.buyTargetRank, 2);
  });

  it('2.3: Depth length N = 3 selects Rank 3 ask and bid', async () => {
    const sellDepth = [
      { price: '1500.00', lastQuantity: '100' },
      { price: '1502.00', lastQuantity: '100' },
      { price: '1505.00', lastQuantity: '100' }
    ];
    const buyDepth = [
      { price: '1497.00', lastQuantity: '100' },
      { price: '1495.00', lastQuantity: '100' },
      { price: '1492.00', lastQuantity: '100' }
    ];

    const result = pricingEngine.calculateSweetSpotPricing({
      sellDepth,
      buyDepth,
      profitTarget: 5.0,
      tradeVolume: 100,
      filterLimits: false
    });

    assert.strictEqual(result.sellSweetSpot, 1505.00);
    assert.strictEqual(result.markers.sellTargetRank, 3);
    assert.strictEqual(result.marketBuySweetSpot, 1492.10); // 1492.00 + 0.10
    assert.strictEqual(result.markers.buyTargetRank, 3);
  });

  it('2.4: Depth length N = 4 calculates midpoint of Rank 3 and Rank 4', async () => {
    const sellDepth = [
      { price: '1500.00', lastQuantity: '100' },
      { price: '1502.00', lastQuantity: '100' },
      { price: '1504.00', lastQuantity: '100' },
      { price: '1506.00', lastQuantity: '100' }
    ];
    const buyDepth = [
      { price: '1498.00', lastQuantity: '100' },
      { price: '1496.00', lastQuantity: '100' },
      { price: '1494.00', lastQuantity: '100' },
      { price: '1491.00', lastQuantity: '100' }
    ];

    const result = pricingEngine.calculateSweetSpotPricing({
      sellDepth,
      buyDepth,
      profitTarget: 5.0,
      tradeVolume: 100,
      filterLimits: false
    });

    // Sell: (1504 + 1506) / 2 = 1505.00
    assert.strictEqual(result.sellSweetSpot, 1505.00);
    assert.strictEqual(result.markers.sellTargetRank, 4);

    // Buy: (1494 + 1491) / 2 = 1492.50 -> + 0.10 = 1492.60
    assert.strictEqual(result.marketBuySweetSpot, 1492.60);
    assert.strictEqual(result.markers.buyTargetRank, 4);
  });

  it('2.5: All permutations of asymmetric shallow book sizes (N=1..4, M=1..4)', async () => {
    const makeSell = count => Array.from({ length: count }, (_, i) => ({ price: (1500 + i * 2).toFixed(2), lastQuantity: '100' }));
    const makeBuy = count => Array.from({ length: count }, (_, i) => ({ price: (1490 - i * 2).toFixed(2), lastQuantity: '100' }));

    for (let s = 1; s <= 4; s++) {
      for (let b = 1; b <= 4; b++) {
        const result = pricingEngine.calculateSweetSpotPricing({
          sellDepth: makeSell(s),
          buyDepth: makeBuy(b),
          profitTarget: 6.0,
          tradeVolume: 100,
          filterLimits: false
        });

        assert.ok(result.sellSweetSpot > 0, `Sell sweet spot must be > 0 for s=${s}, b=${b}`);
        assert.ok(result.marketBuySweetSpot > 0, `Market buy sweet spot must be > 0 for s=${s}, b=${b}`);
        assert.strictEqual(result.markers.sellTargetRank, Math.min(s, s >= 4 ? 4 : s));
        assert.strictEqual(result.markers.buyTargetRank, Math.min(b, b >= 4 ? 4 : b));
        assert.ok(!Number.isNaN(result.buySweetSpot));
      }
    }
  });
});

describe('Challenger 2 — 3. Tied Prices & Multimodal Clusters', () => {
  let pricingEngine;

  beforeEach(async () => {
    pricingEngine = await import('../js/pricingEngine.js');
  });

  it('3.1: Completely identical / flat prices across sell and buy depth', async () => {
    const sellDepth = Array.from({ length: 8 }, () => ({ price: '1500.00', lastQuantity: '100' }));
    const buyDepth = Array.from({ length: 8 }, () => ({ price: '1490.00', lastQuantity: '100' }));

    const result = pricingEngine.calculateSweetSpotPricing({
      sellDepth,
      buyDepth,
      profitTarget: 7.0,
      tradeVolume: 100,
      filterLimits: false
    });

    assert.strictEqual(result.sellSweetSpot, 1500.00);
    assert.strictEqual(result.marketBuySweetSpot, 1490.10);
    assert.strictEqual(result.markers.sellTargetRank, 4);
    assert.strictEqual(result.markers.buyTargetRank, 4);
  });

  it('3.2: Multimodal clusters with tied rank tiers', async () => {
    // 3 at 1500, 3 at 1505, 4 at 1510
    const sellDepth = [
      { price: '1500.00', lastQuantity: '100' },
      { price: '1500.00', lastQuantity: '100' },
      { price: '1500.00', lastQuantity: '100' }, // Rank 3 = 1500
      { price: '1505.00', lastQuantity: '100' }, // Rank 4 = 1505 (Median)
      { price: '1505.00', lastQuantity: '100' }, // Rank 5 = 1505
      { price: '1505.00', lastQuantity: '100' },
      { price: '1510.00', lastQuantity: '100' }
    ];

    const result = pricingEngine.calculateSweetSpotPricing({
      sellDepth,
      profitTarget: 5.0,
      tradeVolume: 100,
      filterLimits: false
    });

    assert.strictEqual(result.sellSweetSpot, 1505.00);
    assert.strictEqual(result.markers.sellTargetRank, 4);
  });

  it('3.3: Zero nominal spread in depth (Buy prices equal Sell prices)', async () => {
    const sellDepth = Array.from({ length: 5 }, () => ({ price: '1500.00', lastQuantity: '100' }));
    const buyDepth = Array.from({ length: 5 }, () => ({ price: '1500.00', lastQuantity: '100' }));

    const result = pricingEngine.calculateSweetSpotPricing({
      sellDepth,
      buyDepth,
      profitTarget: 7.0,
      tradeVolume: 100,
      filterLimits: false
    });

    assert.strictEqual(result.sellSweetSpot, 1500.00);
    assert.strictEqual(result.maxBuyPrice, 1488.02);
    assert.strictEqual(result.marketBuySweetSpot, 1500.10);
    // Compression triggered and buy rate capped at 1488.02
    assert.strictEqual(result.isCompressed, true);
    assert.strictEqual(result.buySweetSpot, 1488.02);
    assert.strictEqual(result.status, 'COMPRESSED');
    assert.ok(result.realizedSpread >= 7.00);
  });
});

describe('Challenger 2 — 4. Inverted & Crossed Order Books', () => {
  let pricingEngine;

  beforeEach(async () => {
    pricingEngine = await import('../js/pricingEngine.js');
  });

  it('4.1: Inverted book (highest bid significantly exceeds lowest ask)', async () => {
    // Crossed market: Lowest sell ask is 1500.00, highest buy bid is 1525.00
    const sellDepth = [
      { price: '1500.00', lastQuantity: '100' },
      { price: '1501.00', lastQuantity: '100' },
      { price: '1502.00', lastQuantity: '100' },
      { price: '1504.00', lastQuantity: '100' }, // Sell sweet spot = 1504.00
      { price: '1506.00', lastQuantity: '100' }
    ];
    const buyDepth = [
      { price: '1525.00', lastQuantity: '100' },
      { price: '1520.00', lastQuantity: '100' },
      { price: '1518.00', lastQuantity: '100' },
      { price: '1515.00', lastQuantity: '100' }, // Market buy sweet spot = 1515.10
      { price: '1512.00', lastQuantity: '100' }
    ];

    const result = pricingEngine.calculateSweetSpotPricing({
      sellDepth,
      buyDepth,
      profitTarget: 7.0,
      tradeVolume: 100,
      filterLimits: false
    });

    assert.strictEqual(result.sellSweetSpot, 1504.00);
    assert.strictEqual(result.maxBuyPrice, 1492.01);
    assert.strictEqual(result.marketBuySweetSpot, 1515.10);
    assert.strictEqual(result.buySweetSpot, 1492.01, 'buySweetSpot must strictly cap to maxBuyPrice');
    assert.strictEqual(result.isCompressed, true);
    assert.strictEqual(result.status, 'COMPRESSED');
    assert.ok(result.realizedSpread >= 7.00, 'Invariant: Spread guarantee must hold despite crossed order books');
  });

  it('4.2: Extreme crash market where sell ask < profitTarget + fees', async () => {
    const sellDepth = [
      { price: '5.00', lastQuantity: '100' },
      { price: '5.20', lastQuantity: '100' },
      { price: '5.40', lastQuantity: '100' },
      { price: '5.50', lastQuantity: '100' },
      { price: '6.00', lastQuantity: '100' }
    ];

    const result = pricingEngine.calculateSweetSpotPricing({
      sellDepth,
      profitTarget: 7.0,
      tradeVolume: 100,
      filterLimits: false
    });

    assert.strictEqual(result.sellSweetSpot, 5.50);
    assert.strictEqual(result.maxBuyPrice, 0, 'maxBuyPrice must floor to 0 when spread is impossible');
    assert.strictEqual(result.buySweetSpot, 0);
    assert.strictEqual(result.status, 'INVALID_TARGET');
  });
});

describe('Challenger 2 — 5. Profit Target Boundaries & Edge Fuzzing', () => {
  let pricingEngine;

  beforeEach(async () => {
    pricingEngine = await import('../js/pricingEngine.js');
  });

  const baseSell = [
    { price: '1500.00', lastQuantity: '100' },
    { price: '1501.00', lastQuantity: '100' },
    { price: '1502.00', lastQuantity: '100' },
    { price: '1504.00', lastQuantity: '100' },
    { price: '1505.00', lastQuantity: '100' }
  ];

  it('5.1: Zero profit target (profitTarget = 0) calculates exact break-even rate', async () => {
    const result = pricingEngine.calculateSweetSpotPricing({
      sellDepth: baseSell,
      profitTarget: 0,
      tradeVolume: 100,
      filterLimits: false
    });

    // 0.997 * (1504.00 - 0 - 0.50) = 0.997 * 1503.50 = 1498.9895 -> floor -> 1498.98
    assert.strictEqual(result.maxBuyPrice, 1498.98);
    assert.strictEqual(result.profitTarget, 0);
    assert.ok(result.realizedSpread >= 0, 'Break-even spread must be >= 0');
    // Tier ladder stepDiscount must default safely to >= 1.00
    assert.strictEqual(result.brackets[0].targetPrice, 1498.98);
    assert.strictEqual(result.brackets[1].targetPrice, 1497.98);
  });

  it('5.2: Micro profit target (profitTarget = 0.01 NGN/USDT)', async () => {
    const result = pricingEngine.calculateSweetSpotPricing({
      sellDepth: baseSell,
      profitTarget: 0.01,
      tradeVolume: 100,
      filterLimits: false
    });

    assert.ok(result.maxBuyPrice > 0);
    assert.ok(result.realizedSpread >= 0.01 - 1e-4);
    assert.strictEqual(result.brackets[0].targetPrice, result.maxBuyPrice);
  });

  it('5.3: Negative profit target (intentional loss / inventory liquidation)', async () => {
    const result = pricingEngine.calculateSweetSpotPricing({
      sellDepth: baseSell,
      profitTarget: -10.0,
      tradeVolume: 100,
      filterLimits: false
    });

    assert.ok(result.maxBuyPrice > 1504.00, 'Negative profit target yields buy price higher than sell price');
    assert.ok(!Number.isNaN(result.maxBuyPrice));
    assert.ok(!Number.isNaN(result.realizedSpread));
  });

  it('5.4: Corrupted profitTarget inputs (null, undefined, NaN, string, objects)', async () => {
    // null coerces to Number(null) === 0
    const resNull = pricingEngine.calculateSweetSpotPricing({
      sellDepth: baseSell,
      profitTarget: null,
      tradeVolume: 100,
      filterLimits: false
    });
    assert.strictEqual(resNull.profitTarget, 0);

    // Non-convertible primitives fall back to default 7.0
    const corrupted = [
      { profitTarget: undefined },
      { profitTarget: NaN },
      { profitTarget: 'invalid_target' },
      { profitTarget: {} }
    ];

    for (const c of corrupted) {
      const result = pricingEngine.calculateSweetSpotPricing({
        sellDepth: baseSell,
        ...c,
        tradeVolume: 100,
        filterLimits: false
      });

      assert.strictEqual(result.profitTarget, 7.0);
      assert.strictEqual(result.maxBuyPrice, 1492.01);
      assert.ok(!Number.isNaN(result.realizedSpread));
    }
  });
});

describe('Challenger 2 — 6. Volume & Session Completion Boundaries', () => {
  let pricingEngine;

  beforeEach(async () => {
    pricingEngine = await import('../js/pricingEngine.js');
  });

  const baseSell = [
    { price: '1500.00', lastQuantity: '100' },
    { price: '1501.00', lastQuantity: '100' },
    { price: '1502.00', lastQuantity: '100' },
    { price: '1504.00', lastQuantity: '100' },
    { price: '1505.00', lastQuantity: '100' }
  ];

  it('6.1: Zero and negative cycleVolume default to 100,000 USDT safely', async () => {
    const zeros = [0, -100, -999999, NaN, null, undefined, 'zero'];
    for (const z of zeros) {
      const result = pricingEngine.calculateSweetSpotPricing({
        sellDepth: baseSell,
        cycleVolume: z,
        filterLimits: false
      });
      assert.strictEqual(result.cycleGuidance.cycleVolume, 100000, `Must default cycleVolume for ${z}`);
      assert.ok(!Number.isNaN(result.cycleGuidance.remainingVolume));
    }
  });

  it('6.2: Zero and negative tradeVolume default to 100 USDT safely', async () => {
    const zeros = [0, -100, NaN, null, undefined, 'trade_vol'];
    for (const z of zeros) {
      const result = pricingEngine.calculateSweetSpotPricing({
        sellDepth: baseSell,
        tradeVolume: z,
        profitTarget: 7.0,
        filterLimits: false
      });
      assert.strictEqual(result.maxBuyPrice, 1492.01);
      assert.ok(!Number.isNaN(result.feeBreakdown.fiatFeePerUnit));
    }
  });

  it('6.3: Session completed exactly (boughtVolume == cycleVolume)', async () => {
    const result = pricingEngine.calculateSweetSpotPricing({
      sellDepth: baseSell,
      cycleVolume: 50000,
      boughtVolume: 50000,
      boughtAvgPrice: 1490.00,
      filterLimits: false
    });

    assert.strictEqual(result.cycleGuidance.boughtVolume, 50000);
    assert.strictEqual(result.cycleGuidance.remainingVolume, 0);
    assert.strictEqual(result.cycleGuidance.progressPercent, 100);
    assert.strictEqual(result.cycleGuidance.isTargetAchieved, true);
    assert.strictEqual(result.cycleGuidance.neededRemainingRate, result.maxBuyPrice);

    assert.strictEqual(result.brackets[0].volumeUsdt, 20000); // 40% of 50k
    assert.strictEqual(result.brackets[1].volumeUsdt, 20000); // 40% of 50k
    assert.strictEqual(result.brackets[2].volumeUsdt, 10000); // 20% of 50k
    assert.ok(!Number.isNaN(result.actualWeightedAvg));
  });

  it('6.4: Session overfilled (boughtVolume > cycleVolume)', async () => {
    const result = pricingEngine.calculateSweetSpotPricing({
      sellDepth: baseSell,
      cycleVolume: 50000,
      boughtVolume: 75000,
      boughtAvgPrice: 1490.00,
      filterLimits: false
    });

    assert.strictEqual(result.cycleGuidance.boughtVolume, 75000);
    assert.strictEqual(result.cycleGuidance.remainingVolume, 0);
    assert.strictEqual(result.cycleGuidance.progressPercent, 100);
    assert.strictEqual(result.cycleGuidance.isTargetAchieved, true);
    assert.ok(!Number.isNaN(result.actualWeightedAvg));
  });

  it('6.5: Negative boughtVolume and boughtAvgPrice sanitize to 0', async () => {
    const result = pricingEngine.calculateSweetSpotPricing({
      sellDepth: baseSell,
      cycleVolume: 100000,
      boughtVolume: -5000,
      boughtAvgPrice: -1500,
      filterLimits: false
    });

    assert.strictEqual(result.cycleGuidance.boughtVolume, 0);
    assert.strictEqual(result.cycleGuidance.remainingVolume, 100000);
    assert.strictEqual(result.cycleGuidance.progressPercent, 0);
    assert.strictEqual(result.cycleGuidance.isTargetAchieved, false);
  });
});

describe('Challenger 2 — 7. Zero & Extreme Fees Boundaries', () => {
  let pricingEngine;

  beforeEach(async () => {
    pricingEngine = await import('../js/pricingEngine.js');
  });

  const baseSell = [
    { price: '1500.00', lastQuantity: '100' },
    { price: '1501.00', lastQuantity: '100' },
    { price: '1502.00', lastQuantity: '100' },
    { price: '1504.00', lastQuantity: '100' },
    { price: '1505.00', lastQuantity: '100' }
  ];

  it('7.1: Zero fees (platformFeePct = 0, inflowFee = 0, outflowFee = 0)', async () => {
    const result = pricingEngine.calculateSweetSpotPricing({
      sellDepth: baseSell,
      profitTarget: 7.0,
      platformFeePct: 0,
      platformFeePctSell: 0,
      inflowFee: 0,
      outflowFee: 0,
      filterLimits: false
    });

    assert.strictEqual(result.sellSweetSpot, 1504.00);
    assert.strictEqual(result.effectiveSellRevenue, 1504.00);
    assert.strictEqual(result.maxBuyPrice, 1497.00);
    assert.strictEqual(result.effectiveBuyCost, 1497.00);
    assert.strictEqual(result.realizedSpread, 7.00);
    assert.strictEqual(result.feeBreakdown.platformFeePerUnit, 0);
    assert.strictEqual(result.feeBreakdown.fiatFeePerUnit, 0);
    assert.strictEqual(result.feeBreakdown.totalFeePerUnit, 0);
  });

  it('7.2: Platform fee 100% boundary handles safely without division by zero', async () => {
    const result = pricingEngine.calculateSweetSpotPricing({
      sellDepth: baseSell,
      platformFeePct: 100.0,
      filterLimits: false
    });

    assert.strictEqual(result.maxBuyPrice, 0);
    assert.strictEqual(result.status, 'INVALID_TARGET');
    assert.ok(!Number.isNaN(result.effectiveBuyCost));
  });

  it('7.3: Extreme fiat fees (₦10,000,000 stamp duty)', async () => {
    const result = pricingEngine.calculateSweetSpotPricing({
      sellDepth: baseSell,
      inflowFee: 10000000.0,
      tradeVolume: 100,
      filterLimits: false
    });

    assert.strictEqual(result.maxBuyPrice, 0);
    assert.strictEqual(result.status, 'INVALID_TARGET');
  });

  it('7.4: Corrupted, NaN, and string fee inputs normalize safely', async () => {
    const tests = [
      { platformFeePct: NaN, inflowFee: null, outflowFee: undefined },
      { platformFeePct: 'invalid', inflowFee: 'not_a_number' },
      { platformFeePct: -10, inflowFee: -50 }
    ];

    for (const t of tests) {
      const result = pricingEngine.calculateSweetSpotPricing({
        sellDepth: baseSell,
        ...t,
        profitTarget: 7.0,
        filterLimits: false
      });

      assert.ok(result.sellSweetSpot > 0);
      assert.ok(!Number.isNaN(result.maxBuyPrice));
      assert.ok(!Number.isNaN(result.realizedSpread));
      assert.ok(!Number.isNaN(result.feeBreakdown.totalFeePerUnit));
    }
  });
});

describe('Challenger 2 — 8. Monte Carlo Pathological Fuzzing (1,000 Iterations)', () => {
  let pricingEngine;

  beforeEach(async () => {
    pricingEngine = await import('../js/pricingEngine.js');
  });

  it('8.1: Validates invariant spread guarantee across 1,000 fuzzing iterations within valid fee bounds (0% <= fee <= 100%)', async () => {
    const randomChoice = arr => arr[Math.floor(Math.random() * arr.length)];

    for (let i = 0; i < 1000; i++) {
      const sellLen = Math.floor(Math.random() * 11);
      const buyLen = Math.floor(Math.random() * 11);

      const sellDepth = Array.from({ length: sellLen }, () => {
        const p = 1200 + Math.random() * 600;
        return randomChoice([
          { price: p.toFixed(2), lastQuantity: (10 + Math.random() * 500).toFixed(2) },
          { price: p.toFixed(2) },
          { price: '0' },
          { price: '-50' },
          null,
          undefined
        ]);
      });

      const buyDepth = Array.from({ length: buyLen }, () => {
        const p = 1100 + Math.random() * 600;
        return randomChoice([
          { price: p.toFixed(2), lastQuantity: (10 + Math.random() * 500).toFixed(2) },
          { price: p.toFixed(2) },
          null
        ]);
      });

      const profitTarget = randomChoice([0, 0.01, 7.0, -5.0, 5000.0, NaN, null, 'text', Math.random() * 30]);
      const cycleVolume = randomChoice([0, -100, 50000, 100000, NaN, Math.random() * 200000]);
      const tradeVolume = randomChoice([0, -10, 50, 100, 500, NaN, Math.random() * 500]);
      const platformFeePct = randomChoice([0, 0.3, 1.0, 5.0, 10.0, 50.0, 100.0, -1, NaN]);
      const inflowFee = randomChoice([0, 50, 1000000, -50, NaN]);
      const boughtVolume = randomChoice([0, 20000, 100000, 150000, -100, NaN]);
      const boughtAvgPrice = randomChoice([0, 1490, 2000, -100, NaN]);

      let result;
      try {
        result = pricingEngine.calculateSweetSpotPricing({
          sellDepth,
          buyDepth,
          profitTarget,
          cycleVolume,
          tradeVolume,
          platformFeePct,
          inflowFee,
          boughtVolume,
          boughtAvgPrice,
          filterLimits: false
        });
      } catch (err) {
        assert.fail(`Fuzzing iteration ${i} threw uncaught exception: ${err.message}`);
      }

      assert.ok(result !== null && typeof result === 'object');
      assert.ok(!Number.isNaN(result.sellSweetSpot));
      assert.ok(!Number.isNaN(result.buySweetSpot));
      assert.ok(!Number.isNaN(result.maxBuyPrice));
      assert.ok(!Number.isNaN(result.marketBuySweetSpot));
      assert.ok(!Number.isNaN(result.effectiveSellRevenue));
      assert.ok(!Number.isNaN(result.effectiveBuyCost));
      assert.ok(!Number.isNaN(result.realizedSpread));
      assert.ok(['SAFE', 'COMPRESSED', 'OFFLINE', 'INVALID_TARGET'].includes(result.status));

      if (result.sellSweetSpot > 0 && result.maxBuyPrice > 0 && typeof profitTarget === 'number' && !isNaN(profitTarget) && profitTarget >= 0) {
        const netSpread = result.effectiveSellRevenue - result.effectiveBuyCost;
        assert.ok(
          netSpread >= profitTarget - 1e-4,
          `Iteration ${i}: Spread guarantee violated: netSpread (${netSpread}) < target (${profitTarget})`
        );
      }
    }
  });
});

describe('Challenger 2 — 9. Empirical Reproduction of Boundary Defects & Pathological Failures', () => {
  let pricingEngine;

  beforeEach(async () => {
    pricingEngine = await import('../js/pricingEngine.js');
  });

  const baseSell = [
    { price: '1500.00', lastQuantity: '100' },
    { price: '1501.00', lastQuantity: '100' },
    { price: '1502.00', lastQuantity: '100' },
    { price: '1504.00', lastQuantity: '100' },
    { price: '1505.00', lastQuantity: '100' }
  ];

  const baseBuy = [
    { price: '1490.00', lastQuantity: '100' },
    { price: '1489.00', lastQuantity: '100' },
    { price: '1488.00', lastQuantity: '100' },
    { price: '1487.00', lastQuantity: '100' },
    { price: '1486.00', lastQuantity: '100' }
  ];

  it('9.1: DEFECT 1 — buySweetSpot leaks active market bid when order book is OFFLINE (sellDepth = [])', async () => {
    // When sell book is empty, merchant has no sell anchor to safely exit.
    // However, pricingEngine returns buySweetSpot = 1487.10 instead of 0!
    const result = pricingEngine.calculateSweetSpotPricing({
      sellDepth: [],
      buyDepth: baseBuy,
      profitTarget: 7.0,
      filterLimits: false
    });

    assert.strictEqual(result.status, 'OFFLINE');
    assert.strictEqual(result.sellSweetSpot, 0);
    assert.strictEqual(result.maxBuyPrice, 0);
    // VULNERABILITY CONFIRMATION: buySweetSpot is populated despite offline status
    assert.strictEqual(result.buySweetSpot, 1487.10, 'CONFIRMED BUG: buySweetSpot returns market bid when OFFLINE');
    assert.ok(result.effectiveBuyCost > 0, 'CONFIRMED BUG: effectiveBuyCost computed without sell anchor');
  });

  it('9.2: DEFECT 2 — buySweetSpot leaks active market bid when status is INVALID_TARGET', async () => {
    // When profitTarget exceeds sell price, target is impossible.
    // maxBuyPrice = 0, status = INVALID_TARGET.
    // However, buySweetSpot falls back to marketBuySweetSpot (1487.10) instead of 0!
    const result = pricingEngine.calculateSweetSpotPricing({
      sellDepth: baseSell,
      buyDepth: baseBuy,
      profitTarget: 2000.0, // Impossible target
      filterLimits: false
    });

    assert.strictEqual(result.status, 'INVALID_TARGET');
    assert.strictEqual(result.maxBuyPrice, 0);
    // VULNERABILITY CONFIRMATION: buySweetSpot is 1487.10 instead of 0
    assert.strictEqual(result.buySweetSpot, 1487.10, 'CONFIRMED BUG: buySweetSpot returns active bid under INVALID_TARGET');
    // If merchant trades at this suggestedBuy (1487.10), realized profit is ~8.92 NGN, NOT 2,000 NGN!
    assert.ok(result.realizedSpread < 2000.0, 'CONFIRMED BUG: Target profit of 2,000 NGN completely fails');
  });

  it('9.3: DEFECT 3 — Extreme fees > 100% invert sign producing false SAFE status and massive loss', async () => {
    // When platformFeePct = 150%, 1 - phiBuy = -0.5.
    // With profitTarget = 5000 on sell price 1504, effectiveSellRevenue - target is negative (-3496.5).
    // (-0.5) * (-3496.5) = +1748.25! Produces maxBuyPrice = 1748.25 and status = 'SAFE'!
    const result = pricingEngine.calculateSweetSpotPricing({
      sellDepth: baseSell,
      profitTarget: 5000.0,
      platformFeePct: 150.0,
      filterLimits: false
    });

    // VULNERABILITY CONFIRMATION:
    assert.strictEqual(result.status, 'SAFE', 'CONFIRMED BUG: Inverted sign causes false SAFE status');
    assert.strictEqual(result.maxBuyPrice, 1748.25, 'CONFIRMED BUG: False positive maxBuyPrice generated');
    assert.strictEqual(result.realizedSpread, -17480996.5, 'CONFIRMED BUG: Realized spread is -17.48M NGN/USDT');
  });

  it('9.4: DEFECT 4 — Negative neededRemainingRate and negative Tier 1 targetPrice when OFFLINE with prior purchases', async () => {
    // When sellDepth is empty, maxBuyPrice = 0.
    // Total budget = 0 * safeCycleVol = 0.
    // If user bought 100 USDT at 1500 NGN, spentBudget = 150,000.
    // neededRemainingRate = (0 - 150,000) / 99,900 = -1.50 NGN!
    const result = pricingEngine.calculateSweetSpotPricing({
      sellDepth: [],
      cycleVolume: 100000,
      boughtVolume: 100,
      boughtAvgPrice: 1500,
      filterLimits: false
    });

    assert.strictEqual(result.cycleGuidance.neededRemainingRate, -1.50, 'CONFIRMED BUG: Negative remaining rate');
    assert.strictEqual(result.brackets[0].targetPrice, -1.50, 'CONFIRMED BUG: Negative Tier 1 target price');
    assert.strictEqual(result.brackets[0].totalNgn, -59940, 'CONFIRMED BUG: Negative total NGN allocation');
  });
});
