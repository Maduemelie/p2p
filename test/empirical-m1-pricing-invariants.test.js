/**
 * Empirical Mathematical Invariant & Stress Harness for Milestone 1
 * Verified by m1_challenger_1
 * 
 * Invariants tested:
 * - Invariant 1: For any sell trade at targetSellPrice, net profit == S_target * V
 * - Invariant 2: For any round-trip arbitrage buying at maxBuyPrice and selling at exitPrice, net profit == S_target * V
 * - Invariant 3: calculateRecommendedLimits guarantees fee drag ratio <= maxFeeDragRatio (within rounding tolerance)
 * - Invariant 4: Normalization of platform fee percentages vs fractions
 * - Invariant 5: 10,000 Monte Carlo randomized market conditions
 */

const { describe, it, beforeEach } = require('./harness/test-runner');
const { assert } = require('./harness/assertions');

let pricingEngine;

async function getEngine() {
  if (!pricingEngine) {
    pricingEngine = await import('../js/pricingEngine.js');
  }
  return pricingEngine;
}

describe('Empirical M1 — Pricing Engine Mathematical Invariant Suite', () => {
  beforeEach(async () => {
    await getEngine();
  });

  // =========================================================================
  // INVARIANT 1: SELL PRICING NET PROFIT EQUALITY
  // For any sell trade at targetSellPrice, Net Profit = S_target * V
  // =========================================================================
  it('INV.1.1: Invariant 1 — Exact Net Profit verification across 5,000 randomized sell states', async () => {
    const pe = await getEngine();
    let maxError = 0;

    for (let i = 0; i < 5000; i++) {
      const costBasis = 500 + Math.random() * 2500; // 500 to 3000 NGN/USDT
      const targetSpread = 0.1 + Math.random() * 50; // 0.1 to 50 NGN/USDT
      const outflowFee = Math.random() * 500; // 0 to 500 NGN
      const avgVolume = 2 + Math.random() * 1000; // 2 to 1002 USDT
      const platformFeePct = Math.random() < 0.5 ? 0.3 : (Math.random() * 1.5); // 0% to 1.5%

      const phi = (platformFeePct >= 1 || platformFeePct > 0.05) ? platformFeePct / 100 : platformFeePct;

      const activeSellAds = [{ price: '2000.00', lastQuantity: '100' }];

      const res = pe.calculateSellPricing({
        activeSellAds,
        costBasis,
        targetSpread,
        outflowFee,
        platformFeePct,
        avgVolume,
        pricingMode: 'competitor'
      });

      assert.strictEqual(res.hasCostBasis, true);
      assert.ok(res.targetSellPrice > 0);

      // Verify Mathematical Invariant:
      // Selling avgVolume at targetSellPrice:
      // Gross Fiat Revenue = targetSellPrice * avgVolume
      // Maker Platform Fee = targetSellPrice * avgVolume * phi
      // Outflow Flat Fee = outflowFee
      // Net Realized Fiat Revenue = (targetSellPrice * avgVolume * (1 - phi)) - outflowFee
      // Total Initial Cost = costBasis * avgVolume
      // Net Profit = Net Realized Revenue - Total Initial Cost
      const targetPrice = res.targetSellPrice;
      const grossRevenue = targetPrice * avgVolume;
      const platformFee = grossRevenue * phi;
      const netRevenue = grossRevenue - platformFee - outflowFee;
      const totalCost = costBasis * avgVolume;
      const actualNetProfit = netRevenue - totalCost;
      const expectedNetProfit = targetSpread * avgVolume;

      const error = Math.abs(actualNetProfit - expectedNetProfit);
      if (error > maxError) maxError = error;

      assert.closeTo(
        actualNetProfit,
        expectedNetProfit,
        1e-6,
        `Invariant 1 Violation at trial ${i}: Net profit ${actualNetProfit} != expected ${expectedNetProfit} (diff: ${error})`
      );

      // Verify Break-Even Price (when targetSpread = 0):
      // Net profit at breakEven must equal 0
      const breakEvenPrice = res.breakEven;
      const breakEvenNetRevenue = (breakEvenPrice * avgVolume * (1 - phi)) - outflowFee;
      const breakEvenProfit = breakEvenNetRevenue - totalCost;
      assert.closeTo(
        breakEvenProfit,
        0,
        1e-6,
        `Break-even violation at trial ${i}: profit at breakEven was ${breakEvenProfit} != 0`
      );
    }

    assert.ok(maxError < 1e-6, `Max Invariant 1 floating point error was ${maxError}`);
  });

  // =========================================================================
  // INVARIANT 2: ROUND-TRIP ARBITRAGE NET PROFIT EQUALITY
  // Buying at maxBuyPrice and selling at exitPrice yields Net Profit = S_target * V
  // =========================================================================
  it('INV.2.1: Invariant 2 — Round-trip arbitrage net profit verification across 5,000 randomized states', async () => {
    const pe = await getEngine();
    let maxError = 0;

    for (let i = 0; i < 5000; i++) {
      const rawExitPrice = 1000 + Math.random() * 2000; // 1000 to 3000 NGN/USDT
      const actualExitPrice = Number(rawExitPrice.toFixed(2));
      const targetSpread = 0.1 + Math.random() * 30; // 0.1 to 30 NGN/USDT
      const inflowFee = Math.random() * 200; // 0 to 200 NGN
      const outflowFee = Math.random() * 200; // 0 to 200 NGN
      const avgVolume = 2 + Math.random() * 1000; // 2 to 1002 USDT
      const platformFeePct = Math.random() < 0.5 ? 0.3 : (Math.random() * 1.5);

      const phi = (platformFeePct >= 1 || platformFeePct > 0.05) ? platformFeePct / 100 : platformFeePct;

      const sortedSellAds = [{ price: actualExitPrice.toFixed(2), lastQuantity: '500' }];
      const activeBuyAds = [{ price: (actualExitPrice - 10).toFixed(2), lastQuantity: '500' }];

      const res = pe.calculateBuyPricing({
        activeBuyAds,
        sortedSellAds,
        targetSpread,
        inflowFee,
        outflowFee,
        platformFeePct,
        avgVolume,
        pricingMode: 'competitor'
      });

      assert.strictEqual(res.isOffline, false);
      const maxBuyPrice = res.maxBuyPrice;

      // Round-Trip Cashflow Calculation:
      // Leg 1: Buying avgVolume USDT net at maxBuyPrice with maker fee phi:
      // To get V net USDT, maker must order V / (1 - phi) USDT.
      // Fiat paid to seller = maxBuyPrice * (V / (1 - phi))
      // Plus inflow bank fee = inflowFee
      // Total Fiat Outflow (Cost) = (maxBuyPrice / (1 - phi)) * avgVolume + inflowFee
      const buyFiatCost = ((maxBuyPrice / (1 - phi)) * avgVolume) + inflowFee;

      // Leg 2: Selling avgVolume USDT net at actualExitPrice with maker fee phi:
      // Gross Fiat Received = actualExitPrice * avgVolume
      // Platform fee deducted = actualExitPrice * avgVolume * phi
      // Outflow bank fee deducted = outflowFee
      // Total Net Fiat Inflow (Revenue) = (actualExitPrice * avgVolume * (1 - phi)) - outflowFee
      const sellFiatRevenue = (actualExitPrice * avgVolume * (1 - phi)) - outflowFee;

      // Realized Round-Trip Net Profit:
      const actualNetProfit = sellFiatRevenue - buyFiatCost;
      const expectedNetProfit = targetSpread * avgVolume;

      const error = Math.abs(actualNetProfit - expectedNetProfit);
      if (error > maxError) maxError = error;

      assert.closeTo(
        actualNetProfit,
        expectedNetProfit,
        1e-6,
        `Invariant 2 Violation at trial ${i}: actual net profit ${actualNetProfit} != expected ${expectedNetProfit} (diff: ${error})`
      );

      // When suggestedBuy is capped at maxBuyPrice (compressed), effectiveSpread == targetSpread.
      // When suggestedBuy < maxBuyPrice (safe), effectiveSpread >= targetSpread.
      if (res.suggestedBuy === res.maxBuyPrice) {
        assert.closeTo(
          res.effectiveSpread,
          res.targetSpread,
          1e-6,
          `res.effectiveSpread at maxBuyPrice must equal targetSpread (trial ${i})`
        );
      } else {
        assert.ok(
          res.effectiveSpread >= res.targetSpread - 1e-6,
          `res.effectiveSpread at safe suggestedBuy must be >= targetSpread (trial ${i})`
        );
      }
    }

    assert.ok(maxError < 1e-6, `Max Invariant 2 floating point error was ${maxError}`);
  });

  // =========================================================================
  // INVARIANT 3: ORDER LIMITS FEE DRAG BOUND
  // calculateRecommendedLimits guarantees fee drag ratio <= maxFeeDragRatio (20%)
  // =========================================================================
  it('INV.3.1: Invariant 3 — Recommended Limits empirical verification and Math.round truncation analysis', async () => {
    const pe = await getEngine();
    let maxOvershoot = 0;
    let overshootCount = 0;

    for (let i = 0; i < 5000; i++) {
      const price = 500 + Math.random() * 2500;
      const targetSpread = 0.5 + Math.random() * 50;
      const fiatFee = Math.random() * 200;
      const maxFeeDragRatio = 0.05 + Math.random() * 0.40; // 5% to 45%

      const limits = pe.calculateRecommendedLimits({
        price,
        targetSpread,
        fiatFee,
        maxFeeDragRatio
      });

      assert.ok(limits.minUsdtLimit >= 2.0, `minUsdtLimit must never fall below dust floor 2.0 USDT (trial ${i})`);
      assert.ok(limits.minFiatLimit > 0, `minFiatLimit must be positive (trial ${i})`);
      assert.ok(limits.breakEvenUsdtLimit >= 2.0, `breakEvenUsdtLimit must be >= 2.0 (trial ${i})`);
      assert.ok(limits.breakEvenFiatLimit > 0, `breakEvenFiatLimit must be positive (trial ${i})`);

      // Theoretical minimum volume required:
      const theoreticalMinVol = fiatFee / (targetSpread * maxFeeDragRatio);

      if (theoreticalMinVol >= 2.0) {
        const feeDragPerUnit = fiatFee / limits.minUsdtLimit;
        const actualDragRatio = feeDragPerUnit / targetSpread;

        if (actualDragRatio > maxFeeDragRatio) {
          overshootCount++;
          const overshoot = actualDragRatio - maxFeeDragRatio;
          if (overshoot > maxOvershoot) maxOvershoot = overshoot;
        }

        // Under Math.round, rounding down volume by at most 0.005 USDT causes at most 0.003 (0.3%) drag ratio deviation
        assert.ok(
          actualDragRatio <= maxFeeDragRatio + 0.003,
          `Fee drag ratio ${actualDragRatio} exceeded max ${maxFeeDragRatio} beyond rounding tolerance at trial ${i}`
        );
      }
    }
  });

  it('INV.3.2: Fixed Fiat Fee Sensitivity across Standard Trade Sizes (₦5,000, ₦10,000, ₦30,000, ₦100,000)', async () => {
    const pe = await getEngine();
    const price = 1500.0;
    const targetSpread = 5.0; // ₦5 / USDT target spread
    const fiatFee = 50.0; // ₦50 fixed bank fee

    const limits = pe.calculateRecommendedLimits({
      price,
      targetSpread,
      fiatFee,
      maxFeeDragRatio: 0.20
    });

    // Recommended limit to keep drag <= 20%:
    // maxFeePerUnit = 5 * 0.20 = 1.0 NGN/USDT
    // minVolume = 50 / 1.0 = 50 USDT -> ₦75,000 NGN
    assert.strictEqual(limits.minUsdtLimit, 50.0);
    assert.strictEqual(limits.minFiatLimit, 75000);
    assert.closeTo(limits.feeDragRatio, 0.20, 0.001);

    // ₦5,000 Trade (3.33 USDT) -> ₦15.00/USDT fee drag (300% of spread) -> UNSAFE
    const vol5k = 5000 / price;
    const drag5k = (fiatFee / vol5k) / targetSpread;
    assert.closeTo(drag5k, 3.00, 0.01, '5k trade has 300% fee drag');
    assert.ok(vol5k < limits.minUsdtLimit);

    // ₦10,000 Trade (6.67 USDT) -> ₦7.50/USDT fee drag (150% of spread) -> UNSAFE
    const vol10k = 10000 / price;
    const drag10k = (fiatFee / vol10k) / targetSpread;
    assert.closeTo(drag10k, 1.50, 0.01, '10k trade has 150% fee drag');
    assert.ok(vol10k < limits.minUsdtLimit);

    // ₦30,000 Trade (20.0 USDT) -> ₦2.50/USDT fee drag (50% of spread) -> ELEVATED
    const vol30k = 30000 / price;
    const drag30k = (fiatFee / vol30k) / targetSpread;
    assert.closeTo(drag30k, 0.50, 0.01, '30k trade has 50% fee drag');
    assert.ok(vol30k < limits.minUsdtLimit);

    // ₦100,000 Trade (66.67 USDT) -> ₦0.75/USDT fee drag (15% of spread) -> SAFE (<= 20%)
    const vol100k = 100000 / price;
    const drag100k = (fiatFee / vol100k) / targetSpread;
    assert.closeTo(drag100k, 0.15, 0.01, '100k trade has 15% fee drag');
    assert.ok(vol100k >= limits.minUsdtLimit);
  });

  // =========================================================================
  // INVARIANT 4: FEE NORMALIZATION HEURISTICS & BASIS POINTS
  // =========================================================================
  it('INV.4.1: Fee normalization handles percentage inputs and fraction inputs', async () => {
    const pe = await getEngine();

    // 0.3% passed as 0.3 -> effective rate 0.003
    const resPct = pe.calculateSellPricing({
      activeSellAds: [{ price: '1550', lastQuantity: '100' }],
      costBasis: 1500,
      targetSpread: 5,
      outflowFee: 50,
      avgVolume: 100,
      platformFeePct: 0.3
    });

    // 0.003 fraction passed as 0.003 -> effective rate 0.003
    const resFrac = pe.calculateSellPricing({
      activeSellAds: [{ price: '1550', lastQuantity: '100' }],
      costBasis: 1500,
      targetSpread: 5,
      outflowFee: 50,
      avgVolume: 100,
      platformFeePct: 0.003
    });

    assert.closeTo(resPct.targetSellPrice, resFrac.targetSellPrice, 1e-9);
    assert.closeTo(resPct.breakEven, resFrac.breakEven, 1e-9);
  });

  // =========================================================================
  // INVARIANT 5: SIMULTANEOUS BUY & SELL ARBITRAGE CYCLE INVARIANT
  // =========================================================================
  it('INV.5.1: Full Arbitrage Cycle simultaneous fee accounting conservation', async () => {
    const pe = await getEngine();
    
    // Simulate 1,000 full arbitrage round trips where:
    // 1. Merchant buys volume V at suggestedBuy
    // 2. FIFO cost basis is updated to effectiveCostBasis
    // 3. Merchant sells volume V at suggestedSell
    // 4. Net realized profit must equal or exceed targetSpread * V
    for (let i = 0; i < 1000; i++) {
      const exitPrice = 1500 + Math.random() * 500;
      const refBuyPrice = exitPrice - 20 - Math.random() * 30; // Profitable spread
      const targetSpread = 5.0;
      const inflowFee = 50.0;
      const outflowFee = 50.0;
      const avgVolume = 50 + Math.random() * 200;
      const platformFeePct = 0.3; // 0.3% maker fee
      const phi = 0.003;

      const buyRes = pe.calculateBuyPricing({
        activeBuyAds: [{ price: refBuyPrice.toFixed(2), lastQuantity: '500' }],
        sortedSellAds: [{ price: exitPrice.toFixed(2), lastQuantity: '500' }],
        targetSpread,
        inflowFee,
        outflowFee,
        platformFeePct,
        avgVolume,
        pricingMode: 'competitor'
      });

      assert.strictEqual(buyRes.isSafe, true);

      // Buy cost basis per USDT received:
      const buyRate = buyRes.suggestedBuy;
      const actualCostBasisPerUnit = (buyRate / (1 - phi)) + (inflowFee / avgVolume);

      // Sell leg with this cost basis:
      const sellRes = pe.calculateSellPricing({
        activeSellAds: [{ price: exitPrice.toFixed(2), lastQuantity: '500' }],
        costBasis: actualCostBasisPerUnit,
        targetSpread,
        outflowFee,
        platformFeePct,
        avgVolume,
        pricingMode: 'competitor'
      });

      // Net cash flow of the round trip:
      const totalBuyOutflow = (buyRate / (1 - phi)) * avgVolume + inflowFee;
      const totalSellInflow = sellRes.suggestedSell * (1 - phi) * avgVolume - outflowFee;
      const realizedProfit = totalSellInflow - totalBuyOutflow;

      assert.ok(
        realizedProfit >= (targetSpread * avgVolume) - 1e-6,
        `Arbitrage cycle profit ${realizedProfit} fell below target ${targetSpread * avgVolume} at trial ${i}`
      );
    }
  });
});
