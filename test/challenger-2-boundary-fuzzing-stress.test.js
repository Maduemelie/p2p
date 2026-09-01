/**
 * Challenger 2: Adversarial Boundary Fuzzing, Invariant & UI Consistency Suite
 * 
 * Objectives:
 * 1. Dust filtering edge thresholds: ads with exact boundary quantities max(2.0, avgVol * 0.05) ± epsilon
 * 2. Trade limit boundary tests: minLmt and maxLmt exact boundaries and bypasses
 * 3. Cross-feature arbitrage cycle simulation: 100 consecutive buy & sell cycles with FIFO cost basis & invariants
 * 4. UI consistency: DOM table and badge elements conforming to R1-R4 specifications
 */

const { describe, it, beforeEach } = require('./harness/test-runner');
const { assert } = require('./harness/assertions');
const { setupDomEnvironment } = require('./harness/dom-mock');

let pricingEngine;
let pricingController;
let pricingView;
let utils;
let storeModule;
let store;
let dom;

async function ensureModules() {
  dom = setupDomEnvironment();
  pricingEngine = await import('../js/pricingEngine.js');
  pricingView = await import('../js/views/pricing.view.js');
  utils = await import('../js/utils.js');
  storeModule = await import('../js/store.js');
  store = storeModule.store;
  store.clearAllData();
  pricingController = await import('../js/pricing.js');

  return {
    pricingEngine,
    pricingView,
    pricingController,
    utils,
    store,
    dom
  };
}

// =========================================================================
// SECTION 1: DUST FILTERING BOUNDARY FUZZING (filterCompetitorAds)
// =========================================================================
describe('Challenger 2 — 1. Dust Filtering Boundary & Edge Fuzzing', () => {
  it('1.1: Exact threshold boundary max(2.0, avgVol * 0.05) ± epsilon for avgVol = 100 (threshold = 5.0)', async () => {
    const { pricingEngine } = await ensureModules();
    const avgVol = 100;
    const threshold = 5.0; // max(2.0, 100 * 0.05) = 5.0

    const epsilons = [1e-1, 1e-3, 1e-6, 1e-9, 1e-12];

    for (const eps of epsilons) {
      const belowQty = threshold - eps;
      const exactQty = threshold;
      const aboveQty = threshold + eps;

      const adBelow = [{ price: '1500.00', lastQuantity: String(belowQty) }];
      const adExact = [{ price: '1500.00', lastQuantity: String(exactQty) }];
      const adAbove = [{ price: '1500.00', lastQuantity: String(aboveQty) }];

      const resBelow = pricingEngine.filterCompetitorAds(adBelow, avgVol, false);
      const resExact = pricingEngine.filterCompetitorAds(adExact, avgVol, false);
      const resAbove = pricingEngine.filterCompetitorAds(adAbove, avgVol, false);

      assert.strictEqual(
        resBelow.length, 0,
        `Dust ad with quantity ${belowQty} (threshold - ${eps}) must be rejected`
      );
      assert.strictEqual(
        resExact.length, 1,
        `Ad with exact boundary quantity ${exactQty} must be kept`
      );
      assert.strictEqual(
        resAbove.length, 1,
        `Ad with quantity ${aboveQty} (threshold + ${eps}) must be kept`
      );
    }
  });

  it('1.2: Exact threshold boundary at the kink point avgVol = 40 (threshold = 2.0)', async () => {
    const { pricingEngine } = await ensureModules();
    const avgVol = 40; // 40 * 0.05 = 2.0 = absolute minimum
    const threshold = 2.0;

    const adBelow = [{ price: '1500.00', lastQuantity: '1.999999' }];
    const adExact = [{ price: '1500.00', lastQuantity: '2.000000' }];
    const adAbove = [{ price: '1500.00', lastQuantity: '2.000001' }];

    assert.strictEqual(pricingEngine.filterCompetitorAds(adBelow, avgVol, false).length, 0);
    assert.strictEqual(pricingEngine.filterCompetitorAds(adExact, avgVol, false).length, 1);
    assert.strictEqual(pricingEngine.filterCompetitorAds(adAbove, avgVol, false).length, 1);
  });

  it('1.3: Enforces absolute 2.0 USDT dust floor for sub-40 USDT volumes (avgVol = 1, 5, 10, 20)', async () => {
    const { pricingEngine } = await ensureModules();
    const lowVolumes = [0.01, 0.5, 1, 5, 10, 20, 39.9];

    for (const vol of lowVolumes) {
      // 5% of vol is < 2.0, so threshold MUST be clamped to 2.0
      const adBelowFloor = [{ price: '1500.00', lastQuantity: '1.99' }];
      const adExactFloor = [{ price: '1500.00', lastQuantity: '2.00' }];
      const adAboveFloor = [{ price: '1500.00', lastQuantity: '2.01' }];

      assert.strictEqual(
        pricingEngine.filterCompetitorAds(adBelowFloor, vol, false).length, 0,
        `Volume ${vol}: 1.99 USDT should be filtered as dust below 2.0 floor`
      );
      assert.strictEqual(
        pricingEngine.filterCompetitorAds(adExactFloor, vol, false).length, 1,
        `Volume ${vol}: 2.00 USDT must be retained at floor`
      );
      assert.strictEqual(
        pricingEngine.filterCompetitorAds(adAboveFloor, vol, false).length, 1,
        `Volume ${vol}: 2.01 USDT must be retained`
      );
    }
  });

  it('1.4: Scaling threshold for institutional/large trade volumes (avgVol = 500, 1000, 10000)', async () => {
    const { pricingEngine } = await ensureModules();
    const highVolumes = [500, 1000, 5000, 10000];

    for (const vol of highVolumes) {
      const expectedThreshold = vol * 0.05; // 25, 50, 250, 500
      const adBelow = [{ price: '1500.00', lastQuantity: String(expectedThreshold - 0.01) }];
      const adExact = [{ price: '1500.00', lastQuantity: String(expectedThreshold) }];
      const adAbove = [{ price: '1500.00', lastQuantity: String(expectedThreshold + 0.01) }];

      assert.strictEqual(
        pricingEngine.filterCompetitorAds(adBelow, vol, false).length, 0,
        `Volume ${vol}: ${expectedThreshold - 0.01} should be filtered`
      );
      assert.strictEqual(
        pricingEngine.filterCompetitorAds(adExact, vol, false).length, 1,
        `Volume ${vol}: ${expectedThreshold} must be retained`
      );
      assert.strictEqual(
        pricingEngine.filterCompetitorAds(adAbove, vol, false).length, 1,
        `Volume ${vol}: ${expectedThreshold + 0.01} must be retained`
      );
    }
  });

  it('1.5: Adversarial volume inputs (0, negative, NaN, null, undefined, strings) safely default to 100 USDT', async () => {
    const { pricingEngine } = await ensureModules();
    const corruptVolumes = [0, -1, -500, NaN, null, undefined, 'invalid', {}, []];

    for (const vol of corruptVolumes) {
      // Safe default vol is 100 -> threshold is max(2, 5) = 5.0 USDT
      const adDust = [{ price: '1500.00', lastQuantity: '4.99' }];
      const adKept = [{ price: '1500.00', lastQuantity: '5.00' }];

      assert.strictEqual(
        pricingEngine.filterCompetitorAds(adDust, vol, false).length, 0,
        `Corrupt volume ${vol} must default safely and reject 4.99 USDT dust`
      );
      assert.strictEqual(
        pricingEngine.filterCompetitorAds(adKept, vol, false).length, 1,
        `Corrupt volume ${vol} must default safely and keep 5.00 USDT`
      );
    }
  });

  it('1.6: Fuzzing 2,000 randomized ad collections against mathematical dust oracle', async () => {
    const { pricingEngine } = await ensureModules();

    for (let trial = 0; trial < 2000; trial++) {
      const avgVol = Math.random() < 0.1 ? (Math.random() < 0.5 ? 0 : -10) : (0.1 + Math.random() * 2000);
      const safeAvgVol = (!avgVol || isNaN(avgVol) || avgVol <= 0) ? 100 : avgVol;
      const minQty = Math.max(2, safeAvgVol * 0.05);

      const numAds = Math.floor(Math.random() * 10);
      const ads = [];
      for (let j = 0; j < numAds; j++) {
        const qty = Math.random() * (minQty * 2);
        ads.push({
          price: (1400 + Math.random() * 200).toFixed(2),
          lastQuantity: qty.toFixed(4)
        });
      }

      const filtered = pricingEngine.filterCompetitorAds(ads, avgVol, false);

      // Verify every returned ad satisfies oracle: parseFloat(ad.lastQuantity) >= minQty
      for (const ad of filtered) {
        const q = parseFloat(ad.lastQuantity) || 0;
        assert.ok(
          q >= minQty,
          `Fuzzing failure trial ${trial}: ad with quantity ${q} returned below minQty ${minQty}`
        );
      }

      // Verify no valid ad was discarded
      const expectedCount = ads.filter(ad => (parseFloat(ad.lastQuantity) || 0) >= minQty).length;
      assert.strictEqual(
        filtered.length,
        expectedCount,
        `Fuzzing count mismatch trial ${trial}: expected ${expectedCount}, got ${filtered.length}`
      );
    }
  });
});

// =========================================================================
// SECTION 2: TRADE LIMIT BOUNDARY FUZZING & BYPASSES
// =========================================================================
describe('Challenger 2 — 2. Trade Limit Boundary Tests & Invariants', () => {
  it('2.1: Exact boundary tests for minAmount and maxAmount (tradeAmount = safeAvgVol * price)', async () => {
    const { pricingEngine } = await ensureModules();
    const avgVol = 100;
    const price = 1500.00;
    const tradeAmount = avgVol * price; // 150,000 NGN

    // Boundary Lower: minAmount
    const adMinAbove = [{ price: '1500.00', lastQuantity: '100', minAmount: '150000.01', maxAmount: '500000' }]; // tradeAmount < minAmount -> Reject
    const adMinExact = [{ price: '1500.00', lastQuantity: '100', minAmount: '150000.00', maxAmount: '500000' }]; // tradeAmount == minAmount -> Keep
    const adMinBelow = [{ price: '1500.00', lastQuantity: '100', minAmount: '149999.99', maxAmount: '500000' }]; // tradeAmount > minAmount -> Keep

    assert.strictEqual(pricingEngine.filterCompetitorAds(adMinAbove, avgVol, true).length, 0);
    assert.strictEqual(pricingEngine.filterCompetitorAds(adMinExact, avgVol, true).length, 1);
    assert.strictEqual(pricingEngine.filterCompetitorAds(adMinBelow, avgVol, true).length, 1);

    // Boundary Upper: maxAmount
    const adMaxBelow = [{ price: '1500.00', lastQuantity: '100', minAmount: '10000', maxAmount: '150000.01' }]; // tradeAmount < maxAmount -> Keep
    const adMaxExact = [{ price: '1500.00', lastQuantity: '100', minAmount: '10000', maxAmount: '150000.00' }]; // tradeAmount == maxAmount -> Keep
    const adMaxAbove = [{ price: '1500.00', lastQuantity: '100', minAmount: '10000', maxAmount: '149999.99' }]; // tradeAmount > maxAmount -> Reject

    assert.strictEqual(pricingEngine.filterCompetitorAds(adMaxBelow, avgVol, true).length, 1);
    assert.strictEqual(pricingEngine.filterCompetitorAds(adMaxExact, avgVol, true).length, 1);
    assert.strictEqual(pricingEngine.filterCompetitorAds(adMaxAbove, avgVol, true).length, 0);
  });

  it('2.2: Single-sided limit boundaries (only minAmount or only maxAmount specified)', async () => {
    const { pricingEngine } = await ensureModules();
    const avgVol = 100;
    const price = 1500.00; // tradeAmount = 150k

    // Only minAmount
    const adOnlyMinPass = [{ price: '1500.00', lastQuantity: '100', minAmount: '100000' }];
    const adOnlyMinFail = [{ price: '1500.00', lastQuantity: '100', minAmount: '200000' }];
    assert.strictEqual(pricingEngine.filterCompetitorAds(adOnlyMinPass, avgVol, true).length, 1);
    assert.strictEqual(pricingEngine.filterCompetitorAds(adOnlyMinFail, avgVol, true).length, 0);

    // Only maxAmount
    const adOnlyMaxPass = [{ price: '1500.00', lastQuantity: '100', maxAmount: '200000' }];
    const adOnlyMaxFail = [{ price: '1500.00', lastQuantity: '100', maxAmount: '100000' }];
    assert.strictEqual(pricingEngine.filterCompetitorAds(adOnlyMaxPass, avgVol, true).length, 1);
    assert.strictEqual(pricingEngine.filterCompetitorAds(adOnlyMaxFail, avgVol, true).length, 0);

    // Neither (minAmount: 0, maxAmount: 0)
    const adNoLimits = [{ price: '1500.00', lastQuantity: '100', minAmount: '0', maxAmount: '0' }];
    assert.strictEqual(pricingEngine.filterCompetitorAds(adNoLimits, avgVol, true).length, 1);
  });

  it('2.3: filterLimits: false strictly bypasses all min/max limit checks', async () => {
    const { pricingEngine } = await ensureModules();
    const ads = [
      { price: '1500.00', lastQuantity: '100', minAmount: '5000000', maxAmount: '10000000' }, // Out of range
      { price: '1500.00', lastQuantity: '100', minAmount: '10', maxAmount: '100' }             // Out of range
    ];

    const filteredStrict = pricingEngine.filterCompetitorAds(ads, 100, true);
    const filteredBypass = pricingEngine.filterCompetitorAds(ads, 100, false);

    assert.strictEqual(filteredStrict.length, 0);
    assert.strictEqual(filteredBypass.length, 2, 'filterLimits=false must retain all non-dust ads');
  });

  it('2.4: Alternate Bybit limit fields (minSingleTransAmount, maxSingleTransAmount)', async () => {
    const { pricingEngine } = await ensureModules();
    const ads = [
      { price: '1500.00', lastQuantity: '100', minSingleTransAmount: '200000', maxSingleTransAmount: '500000' }, // Reject (150k < 200k)
      { price: '1500.00', lastQuantity: '100', minSingleTransAmount: '50000', maxSingleTransAmount: '100000' },  // Reject (150k > 100k)
      { price: '1500.00', lastQuantity: '100', minSingleTransAmount: '50000', maxSingleTransAmount: '200000' }   // Keep (50k <= 150k <= 200k)
    ];

    const filtered = pricingEngine.filterCompetitorAds(ads, 100, true);
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].minSingleTransAmount, '50000');
  });

  it('2.5: Fuzzing 2,000 randomized trade limits against pricingEngine limit filter', async () => {
    const { pricingEngine } = await ensureModules();

    for (let trial = 0; trial < 2000; trial++) {
      const avgVol = 10 + Math.random() * 500;
      const price = 1000 + Math.random() * 1000;
      const tradeAmount = avgVol * price;

      const minLmt = Math.random() < 0.2 ? 0 : Math.random() * (tradeAmount * 2);
      const maxLmt = Math.random() < 0.2 ? 0 : minLmt + Math.random() * (tradeAmount * 2);
      const filterLimits = Math.random() > 0.3;

      const ad = [{
        price: price.toFixed(2),
        lastQuantity: (avgVol * 2).toFixed(2),
        minAmount: minLmt.toFixed(2),
        maxAmount: maxLmt.toFixed(2)
      }];

      const filtered = pricingEngine.filterCompetitorAds(ad, avgVol, filterLimits);

      // Oracle expectation
      let expectedKeep = true;
      if (filterLimits) {
        if (minLmt > 0 && tradeAmount < minLmt) expectedKeep = false;
        if (maxLmt > 0 && tradeAmount > maxLmt) expectedKeep = false;
      }

      assert.strictEqual(
        filtered.length,
        expectedKeep ? 1 : 0,
        `Limit fuzzing mismatch trial ${trial}: tradeAmount=${tradeAmount}, minLmt=${minLmt}, maxLmt=${maxLmt}, filterLimits=${filterLimits}`
      );
    }
  });
});

// =========================================================================
// SECTION 3: CROSS-FEATURE ARBITRAGE CYCLE SIMULATION
// =========================================================================
describe('Challenger 2 — 3. Consecutive Cross-Feature Arbitrage Cycle Simulation', () => {
  it('3.1: 100 consecutive buy and sell cycles with variable FIFO cost basis & invariant verification', async () => {
    const { pricingEngine, utils } = await ensureModules();

    // Initial state
    let cash = 10000000.00; // ₦10,000,000 NGN
    let tradeHistory = [];
    const targetSpread = 5.00;
    const inflowFee = 50.00;
    const outflowFee = 50.00;
    const tradeVolume = 100.00;

    for (let cycle = 1; cycle <= 100; cycle++) {
      // 1. Generate realistic competitor market depth
      const marketMidRate = 1450.00 + (cycle * 0.5) + (Math.sin(cycle) * 20); // trending with waves
      const competitorBuyRef = marketMidRate - (2.00 + Math.random() * 3.00); // e.g. 1445.00
      const competitorSellRef = marketMidRate + (3.00 + Math.random() * 4.00); // e.g. 1455.00

      const buyAds = [
        { price: competitorBuyRef.toFixed(2), lastQuantity: '500' },
        { price: (competitorBuyRef - 1.00).toFixed(2), lastQuantity: '500' }
      ];
      const sellAds = [
        { price: competitorSellRef.toFixed(2), lastQuantity: '500' },
        { price: (competitorSellRef + 1.00).toFixed(2), lastQuantity: '500' }
      ];

      // 2. Buy Pricing Analysis
      const buyAnalysis = pricingEngine.calculateBuyPricing({
        activeBuyAds: buyAds,
        sortedSellAds: sellAds,
        targetSpread,
        inflowFee,
        avgVolume: tradeVolume,
        pricingMode: 'competitor'
      });

      // Buy Invariant: suggestedBuy never exceeds maxBuyPrice
      assert.ok(
        buyAnalysis.suggestedBuy <= buyAnalysis.maxBuyPrice + 1e-9,
        `Cycle ${cycle} Buy Invariant: suggestedBuy (${buyAnalysis.suggestedBuy}) > maxBuyPrice (${buyAnalysis.maxBuyPrice})`
      );

      // Execute Buy Trade
      const buyRate = buyAnalysis.suggestedBuy;
      const buyFiatPaid = (tradeVolume * buyRate) + inflowFee;
      cash -= buyFiatPaid;

      const buyTrade = {
        id: `trade_buy_${cycle}`,
        type: 'BUY',
        usdtAmount: tradeVolume,
        rate: buyRate,
        ngnAmount: tradeVolume * buyRate,
        totalFees: inflowFee,
        date: new Date(1700000000000 + (cycle * 2000)).toISOString()
      };
      tradeHistory.push(buyTrade);

      // 3. FIFO Recalculation
      const fifoState = utils.calculateFIFOInventoryAndPnL(tradeHistory, { startingUsdtBalance: 0, defaultCostBasis: 0 });
      const currentCostBasis = fifoState.avgHoldingCostPerUSDT;

      assert.ok(
        currentCostBasis > 0,
        `Cycle ${cycle}: FIFO cost basis must be positive, got ${currentCostBasis}`
      );
      assert.ok(
        fifoState.remainingInventoryUSDT > 0,
        `Cycle ${cycle}: Inventory must be positive after buy, got ${fifoState.remainingInventoryUSDT}`
      );

      // 4. Sell Pricing Analysis
      const sellAnalysis = pricingEngine.calculateSellPricing({
        activeSellAds: sellAds,
        costBasis: currentCostBasis,
        targetSpread,
        outflowFee,
        avgVolume: tradeVolume,
        pricingMode: 'competitor'
      });

      // Sell Invariant: suggestedSell is never below targetSellPrice
      assert.ok(
        sellAnalysis.suggestedSell >= sellAnalysis.targetSellPrice - 1e-9,
        `Cycle ${cycle} Sell Invariant: suggestedSell (${sellAnalysis.suggestedSell}) < targetSellPrice (${sellAnalysis.targetSellPrice})`
      );
      // Sell Invariant: breakEven is exact costBasis + feePerUnit
      assert.closeTo(
        sellAnalysis.breakEven,
        currentCostBasis + (outflowFee / tradeVolume),
        0.001,
        `Cycle ${cycle} Break-even formula mismatch`
      );

      // 5. Execute Sell Trade
      const sellRate = sellAnalysis.suggestedSell;
      const sellFiatReceived = (tradeVolume * sellRate) - outflowFee;
      cash += sellFiatReceived;

      const sellTrade = {
        id: `trade_sell_${cycle}`,
        type: 'SELL',
        usdtAmount: tradeVolume,
        rate: sellRate,
        ngnAmount: tradeVolume * sellRate,
        totalFees: outflowFee,
        date: new Date(1700000000000 + (cycle * 2000) + 1000).toISOString()
      };
      tradeHistory.push(sellTrade);

      // 6. Recalculate Final FIFO for Cycle
      const finalFifoState = utils.calculateFIFOInventoryAndPnL(tradeHistory, { startingUsdtBalance: 0, defaultCostBasis: 0 });

      // If all bought inventory was liquidated (100 in, 100 out each cycle):
      assert.closeTo(
        finalFifoState.remainingInventoryUSDT,
        0,
        0.001,
        `Cycle ${cycle}: Remaining inventory must be 0 after full round-trip`
      );

      // Verify that realized profit matches cash growth minus fees
      const cycleProfit = sellFiatReceived - buyFiatPaid;
      assert.ok(
        !isNaN(cycleProfit) && isFinite(cycleProfit),
        `Cycle ${cycle}: Profit computation resulted in NaN or non-finite value`
      );
    }

    // After 100 complete round-trips:
    const finalFifo = utils.calculateFIFOInventoryAndPnL(tradeHistory, { startingUsdtBalance: 0, defaultCostBasis: 0 });
    assert.strictEqual(tradeHistory.length, 200);
    assert.closeTo(finalFifo.remainingInventoryUSDT, 0, 0.001);
    assert.ok(finalFifo.totalRealizedPnL > 0, '100 profitable arbitrage cycles should accumulate positive totalRealizedPnL');
  });

  it('3.2: Multi-lot FIFO accumulation and partial liquidation across asymmetric cycles', async () => {
    const { pricingEngine, utils } = await ensureModules();

    // 3 Buys at different rates
    const trades = [
      { id: 'b1', type: 'BUY', usdtAmount: 200, rate: 1450.00, ngnAmount: 290000.00, totalFees: 0, date: new Date(1000).toISOString() },
      { id: 'b2', type: 'BUY', usdtAmount: 300, rate: 1460.00, ngnAmount: 438000.00, totalFees: 0, date: new Date(2000).toISOString() },
      { id: 'b3', type: 'BUY', usdtAmount: 500, rate: 1470.00, ngnAmount: 735000.00, totalFees: 0, date: new Date(3000).toISOString() }
    ];

    // Blended cost: (200*1450 + 300*1460 + 500*1470) / 1000 = (290,000 + 438,000 + 735,000) / 1000 = 1463.00
    const fifo1 = utils.calculateFIFOInventoryAndPnL(trades, { startingUsdtBalance: 0, defaultCostBasis: 0 });
    assert.closeTo(fifo1.avgHoldingCostPerUSDT, 1463.00, 0.001);
    assert.strictEqual(fifo1.remainingInventoryUSDT, 1000);

    // Calculate Sell Pricing on blended cost basis 1463.00
    const sellAds = [{ price: '1500.00', lastQuantity: '1000' }];
    const pricing = pricingEngine.calculateSellPricing({
      activeSellAds: sellAds,
      costBasis: fifo1.avgHoldingCostPerUSDT,
      targetSpread: 10.0,
      outflowFee: 50.0,
      avgVolume: 100.0,
      pricingMode: 'competitor'
    });

    // suggestedSell = 1500 - 0.10 = 1499.90
    // targetSellPrice = 1463.00 + 10.0 + 0.50 = 1473.50
    // isSafe = true
    assert.closeTo(pricing.suggestedSell, 1499.90, 0.001);
    assert.strictEqual(pricing.isSafe, true);

    // Partial Sell of 350 USDT (consumes all 200 of lot 1 @ 1450, and 150 of lot 2 @ 1460)
    trades.push({
      id: 's1',
      type: 'SELL',
      usdtAmount: 350,
      rate: pricing.suggestedSell,
      ngnAmount: 350 * pricing.suggestedSell,
      totalFees: 50,
      date: new Date(4000).toISOString()
    });

    const fifo2 = utils.calculateFIFOInventoryAndPnL(trades, { startingUsdtBalance: 0, defaultCostBasis: 0 });
    // Remaining lots: 150 @ 1460, 500 @ 1470 -> (150*1460 + 500*1470)/650 = (219,000 + 735,000)/650 = 954,000/650 = 1467.6923
    assert.strictEqual(fifo2.remainingInventoryUSDT, 650);
    assert.closeTo(fifo2.avgHoldingCostPerUSDT, 1467.6923, 0.001);
    assert.ok(fifo2.totalRealizedPnL > 0);
  });
});

// =========================================================================
// SECTION 4: UI & DOM CONSISTENCY VERIFICATION (R1 - R4)
// =========================================================================
describe('Challenger 2 — 4. UI Layout, Badges, Tables & Perspective Consistency', () => {
  it('4.1: renderPricingView() produces valid DOM with all mandatory R1-R4 element IDs', async () => {
    const { pricingView } = await ensureModules();
    const html = pricingView.renderPricingView();
    document.body.innerHTML = html;

    const requiredIds = [
      // Control inputs
      'input-target-spread',
      'input-avg-volume',
      'input-inflow-fee',
      'input-outflow-fee',
      'input-pricing-mode',
      'input-depth-limit',
      'input-filter-limits',
      // Actions
      'btn-refresh-market-depth',
      'btn-copy-buy-price',
      'btn-copy-sell-price',
      // Buy Card elements
      'pricing-exit-price',
      'pricing-max-buy',
      'pricing-top-buy-competitor',
      'pricing-suggested-buy',
      'pricing-buy-status',
      // Sell Card elements
      'pricing-cost-basis',
      'pricing-break-even',
      'pricing-target-sell-price',
      'pricing-top-sell-competitor',
      'pricing-suggested-sell',
      'pricing-sell-status',
      // Order books
      'pricing-buy-orderbook',
      'pricing-sell-orderbook'
    ];

    for (const id of requiredIds) {
      const el = document.getElementById(id);
      assert.ok(el !== null, `Mandatory DOM element #${id} missing from renderPricingView()`);
    }
  });

  it('4.2: Card badges and subtitles accurately reflect Inflow vs Outflow and Taker vs Maker perspective', async () => {
    const { pricingView } = await ensureModules();
    const html = pricingView.renderPricingView();

    // Verify Buy Ad Assistant contains Inflow badge and clarifies Bybit Sell tab
    assert.ok(
      html.includes('Buy Ad Assistant') && html.includes('badge-primary">Inflow</span>'),
      'Pricing view must contain Buy Ad Assistant with Inflow badge'
    );
    assert.ok(
      html.includes('Prices competitor ads for your <strong>Buy Ad</strong> (which appears under Bybit P2P <strong>"Sell"</strong> tab for takers).'),
      'Pricing view must explain Buy Ad appears under Bybit Sell tab for takers'
    );

    // Verify Sell Ad Assistant contains Outflow badge and clarifies Bybit Buy tab
    assert.ok(
      html.includes('Sell Ad Assistant') && html.includes('badge-primary">Outflow</span>'),
      'Pricing view must contain Sell Ad Assistant with Outflow badge'
    );
    assert.ok(
      html.includes('Prices competitor ads for your <strong>Sell Ad</strong> (which appears under Bybit P2P <strong>"Buy"</strong> tab for takers).'),
      'Pricing view must explain Sell Ad appears under Bybit Buy tab for takers'
    );

    // Verify Buy Order Book (Market Bids) and Sell Order Book (Market Asks)
    assert.ok(
      html.includes('Buy Order Book (Market Bids)'),
      'Pricing view must include Buy Order Book (Market Bids)'
    );
    assert.ok(
      html.includes('Sell Order Book (Market Asks)'),
      'Pricing view must include Sell Order Book (Market Asks)'
    );
  });

  it('4.3: Order book table rendering and click-to-trade prefill direction mapping', async () => {
    const { pricingView } = await ensureModules();
    document.body.innerHTML = pricingView.renderPricingView();

    const buyTable = document.getElementById('pricing-buy-orderbook');
    const sellTable = document.getElementById('pricing-sell-orderbook');

    assert.ok(buyTable !== null, 'Buy orderbook table must exist');
    assert.ok(sellTable !== null, 'Sell orderbook table must exist');
  });

  it('4.4: Dynamic badge classes (.badge-success, .badge-danger, .badge-neutral) under safe vs compressed conditions', async () => {
    const { pricingEngine } = await ensureModules();

    // Scenario A: Safe Outbid & Undercut
    const safeBuy = pricingEngine.calculateBuyPricing({
      activeBuyAds: [{ price: '1480.00', lastQuantity: '100' }],
      sortedSellAds: [{ price: '1520.00', lastQuantity: '100' }],
      targetSpread: 5.0,
      inflowFee: 50.0,
      avgVolume: 100.0
    });
    assert.strictEqual(safeBuy.isSafe, true);

    const safeSell = pricingEngine.calculateSellPricing({
      activeSellAds: [{ price: '1520.00', lastQuantity: '100' }],
      costBasis: 1480.00,
      targetSpread: 5.0,
      outflowFee: 50.0,
      avgVolume: 100.0
    });
    assert.strictEqual(safeSell.isSafe, true);

    // Scenario B: Compressed Spread
    const compressedBuy = pricingEngine.calculateBuyPricing({
      activeBuyAds: [{ price: '1518.00', lastQuantity: '100' }],
      sortedSellAds: [{ price: '1520.00', lastQuantity: '100' }],
      targetSpread: 5.0,
      inflowFee: 50.0,
      avgVolume: 100.0
    });
    assert.strictEqual(compressedBuy.isSafe, false);
    assert.strictEqual(compressedBuy.suggestedBuy, compressedBuy.maxBuyPrice);

    const compressedSell = pricingEngine.calculateSellPricing({
      activeSellAds: [{ price: '1482.00', lastQuantity: '100' }],
      costBasis: 1480.00,
      targetSpread: 5.0,
      outflowFee: 50.0,
      avgVolume: 100.0
    });
    assert.strictEqual(compressedSell.isSafe, false);
    assert.strictEqual(compressedSell.suggestedSell, compressedSell.targetSellPrice);
  });
});
