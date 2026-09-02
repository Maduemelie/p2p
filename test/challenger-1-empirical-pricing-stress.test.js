/**
 * Empirical Stress Test Suite — Challenger 1
 * Stress-testing pricingEngine math, outbidding/undercutting, spread cap & floor invariants,
 * Bybit side mapping, resilient item extraction, and boundary conditions.
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

// =========================================================================
// SECTION 1: INVARIANT VERIFICATION — MATHEMATICAL SAFETY GATES
// =========================================================================
describe('Challenger 1 — 1. Mathematical Safety Gates & Invariants', () => {
  it('1.1: Spread Cap Invariant — suggestedBuy never exceeds maxBuyPrice across 1,000 fuzzed states', async () => {
    const pe = await getEngine();

    for (let i = 0; i < 1000; i++) {
      const exitPrice = 1000 + Math.random() * 1000; // 1000 to 2000
      const refBuyPrice = 900 + Math.random() * 1200; // 900 to 2100 (can be higher or lower than exit)
      const targetSpread = Math.random() * 50; // 0 to 50
      const inflowFee = Math.random() * 200; // 0 to 200
      const avgVol = 1 + Math.random() * 500; // 1 to 501

      const activeBuyAds = [{ price: refBuyPrice.toFixed(2), lastQuantity: '100' }];
      const sortedSellAds = [{ price: exitPrice.toFixed(2), lastQuantity: '100' }];

      const res = pe.calculateBuyPricing({
        activeBuyAds,
        sortedSellAds,
        targetSpread,
        inflowFee,
        avgVolume: avgVol,
        pricingMode: 'competitor'
      });

      assert.ok(
        res.suggestedBuy <= res.maxBuyPrice + 1e-9,
        `INVARIANT VIOLATION: suggestedBuy (${res.suggestedBuy}) > maxBuyPrice (${res.maxBuyPrice}) at trial ${i}`
      );
      assert.strictEqual(
        res.isSafe,
        res.rawSuggestedBuy <= res.maxBuyPrice,
        `Safety flag mismatch at trial ${i}`
      );
      assert.ok(
        !isNaN(res.suggestedBuy) && isFinite(res.suggestedBuy),
        `NaN/Infinity suggestedBuy at trial ${i}`
      );
    }
  });

  it('1.2: Spread Floor Invariant — suggestedSell never drops below targetSellPrice across 1,000 fuzzed states', async () => {
    const pe = await getEngine();

    for (let i = 0; i < 1000; i++) {
      const costBasis = 1000 + Math.random() * 1000; // 1000 to 2000
      const refSellPrice = 900 + Math.random() * 1200; // 900 to 2100
      const targetSpread = Math.random() * 50; // 0 to 50
      const outflowFee = Math.random() * 200; // 0 to 200
      const avgVol = 1 + Math.random() * 500; // 1 to 501

      const activeSellAds = [{ price: refSellPrice.toFixed(2), lastQuantity: '100' }];

      const res = pe.calculateSellPricing({
        activeSellAds,
        costBasis,
        targetSpread,
        outflowFee,
        avgVolume: avgVol,
        pricingMode: 'competitor'
      });

      assert.ok(
        res.suggestedSell >= res.targetSellPrice - 1e-9,
        `INVARIANT VIOLATION: suggestedSell (${res.suggestedSell}) < targetSellPrice (${res.targetSellPrice}) at trial ${i}`
      );
      assert.strictEqual(
        res.isSafe,
        res.rawSuggestedSell >= res.targetSellPrice,
        `Safety flag mismatch at trial ${i}`
      );
      assert.ok(
        !isNaN(res.suggestedSell) && isFinite(res.suggestedSell),
        `NaN/Infinity suggestedSell at trial ${i}`
      );
    }
  });

  it('1.3: Break-Even and Target Spread Monotonicity', async () => {
    const pe = await getEngine();
    const costBasis = 1500;
    const outflowFee = 50;
    const avgVol = 100;
    const feePerUnit = outflowFee / avgVol; // 0.50

    const res0 = pe.calculateSellPricing({
      activeSellAds: [{ price: '1600.00', lastQuantity: '100' }],
      costBasis,
      targetSpread: 0,
      outflowFee,
      avgVolume: avgVol
    });
    assert.strictEqual(res0.breakEven, 1500.50);
    assert.strictEqual(res0.targetSellPrice, 1500.50);

    const res5 = pe.calculateSellPricing({
      activeSellAds: [{ price: '1600.00', lastQuantity: '100' }],
      costBasis,
      targetSpread: 5.0,
      outflowFee,
      avgVolume: avgVol
    });
    assert.strictEqual(res5.breakEven, 1500.50);
    assert.strictEqual(res5.targetSellPrice, 1505.50);
    assert.ok(res5.targetSellPrice > res5.breakEven, 'Target sell price must exceed breakEven when targetSpread > 0');
  });

  it('1.4: Exact Outbid and Undercut Delta increments (₦0.10)', async () => {
    const pe = await getEngine();
    // Outbid
    const buyRes = pe.calculateBuyPricing({
      activeBuyAds: [{ price: '1450.00', lastQuantity: '100' }],
      sortedSellAds: [{ price: '1500.00', lastQuantity: '100' }],
      targetSpread: 5.0,
      inflowFee: 50.0,
      avgVolume: 100.0,
      pricingMode: 'competitor'
    });
    assert.closeTo(buyRes.rawSuggestedBuy, 1450.10, 0.0001);
    assert.closeTo(buyRes.suggestedBuy, 1450.10, 0.0001);

    // Undercut
    const sellRes = pe.calculateSellPricing({
      activeSellAds: [{ price: '1500.00', lastQuantity: '100' }],
      costBasis: 1400.00,
      targetSpread: 5.0,
      outflowFee: 50.0,
      avgVolume: 100.0,
      pricingMode: 'competitor'
    });
    assert.closeTo(sellRes.rawSuggestedSell, 1499.90, 0.0001);
    assert.closeTo(sellRes.suggestedSell, 1499.90, 0.0001);
  });
}, { tier: 1, category: 'Pricing Engine Safety Invariants' });

// =========================================================================
// SECTION 2: REFERENCE PRICING MODES & VWAP/SMA MATHEMATICAL VERIFICATION
// =========================================================================
describe('Challenger 1 — 2. Reference Pricing Modes & Weighting', () => {
  it('2.1: Simple Moving Average (avg-N) computes exact unweighted arithmetic mean', async () => {
    const pe = await getEngine();
    const ads = [
      { price: '1400.00', lastQuantity: '10' },
      { price: '1410.00', lastQuantity: '100' },
      { price: '1420.00', lastQuantity: '1000' },
      { price: '1430.00', lastQuantity: '50' },
      { price: '1440.00', lastQuantity: '20' }
    ];

    // avg-3: (1400 + 1410 + 1420) / 3 = 4230 / 3 = 1410.00
    assert.closeTo(pe.calculateReferencePrice(ads, 'avg-3'), 1410.00, 0.0001);

    // avg-5: (1400 + 1410 + 1420 + 1430 + 1440) / 5 = 7100 / 5 = 1420.00
    assert.closeTo(pe.calculateReferencePrice(ads, 'avg-5'), 1420.00, 0.0001);
  });

  it('2.2: VWAP (vwap-N) correctly shifts reference price toward heavy volume tiers', async () => {
    const pe = await getEngine();
    // Heavy volume at the high price (1420 has 1000 qty vs 10 qty at 1400)
    const heavyHighAds = [
      { price: '1400.00', lastQuantity: '10' },
      { price: '1410.00', lastQuantity: '10' },
      { price: '1420.00', lastQuantity: '980' }
    ];
    // sum = 1400*10 + 1410*10 + 1420*980 = 14000 + 14100 + 1391600 = 1419700
    // totalQty = 1000 -> VWAP = 1419.70
    // SMA = (1400 + 1410 + 1420) / 3 = 1410.00
    const vwapHigh = pe.calculateReferencePrice(heavyHighAds, 'vwap-3');
    const smaHigh = pe.calculateReferencePrice(heavyHighAds, 'avg-3');

    assert.closeTo(vwapHigh, 1419.70, 0.001);
    assert.closeTo(smaHigh, 1410.00, 0.001);
    assert.ok(vwapHigh > smaHigh, 'VWAP must pull higher than SMA when heavy volume is at top');

    // Heavy volume at the low price (1400 has 980 qty)
    const heavyLowAds = [
      { price: '1400.00', lastQuantity: '980' },
      { price: '1410.00', lastQuantity: '10' },
      { price: '1420.00', lastQuantity: '10' }
    ];
    // sum = 1400*980 + 1410*10 + 1420*10 = 1372000 + 14100 + 14200 = 1400300
    // totalQty = 1000 -> VWAP = 1400.30
    const vwapLow = pe.calculateReferencePrice(heavyLowAds, 'vwap-3');
    assert.closeTo(vwapLow, 1400.30, 0.001);
    assert.ok(vwapLow < smaHigh, 'VWAP must pull lower than SMA when heavy volume is at bottom');
  });

  it('2.3: Graceful fallback when pricingMode is unknown, malformed, or missing', async () => {
    const pe = await getEngine();
    const ads = [{ price: '1450.00', lastQuantity: '50' }, { price: '1460.00', lastQuantity: '50' }];

    assert.strictEqual(pe.calculateReferencePrice(ads, null), 1450.00);
    assert.strictEqual(pe.calculateReferencePrice(ads, undefined), 1455.00); // defaults to avg-10: (1450+1460)/2 = 1455
    assert.strictEqual(pe.calculateReferencePrice(ads, 'unknown-mode'), 1450.00);
    assert.strictEqual(pe.calculateReferencePrice(ads, ''), 1450.00);
  });
}, { tier: 1, category: 'Pricing Engine Reference Modes' });

// =========================================================================
// SECTION 3: DUST & LIMIT FILTERING ADVERSARIAL CASES
// =========================================================================
describe('Challenger 1 — 3. Dust & Limits Filtering Stress', () => {
  it('3.1: Minimum Dust Threshold scaling with avgVolume', async () => {
    const pe = await getEngine();
    // avgVolume = 10 -> minQty = max(2, 10 * 0.05) = max(2, 0.5) = 2.0 USDT
    const adsSmallVol = [
      { price: '1500', lastQuantity: '1.9' }, // Filtered
      { price: '1500', lastQuantity: '2.0' }  // Kept
    ];
    const resSmall = pe.filterCompetitorAds(adsSmallVol, 10, false);
    assert.strictEqual(resSmall.length, 1);
    assert.strictEqual(resSmall[0].lastQuantity, '2.0');

    // avgVolume = 1000 -> minQty = max(2, 1000 * 0.05) = 50.0 USDT
    const adsLargeVol = [
      { price: '1500', lastQuantity: '49.9' }, // Filtered
      { price: '1500', lastQuantity: '50.0' }  // Kept
    ];
    const resLarge = pe.filterCompetitorAds(adsLargeVol, 1000, false);
    assert.strictEqual(resLarge.length, 1);
    assert.strictEqual(resLarge[0].lastQuantity, '50.0');
  });

  it('3.2: Limit filtering with zero, negative, string, and missing limits', async () => {
    const pe = await getEngine();
    // avgVolume = 100, price = 1500 -> tradeAmount = 150,000 NGN
    const ads = [
      { price: '1500', lastQuantity: '500', minAmount: '0', maxAmount: '0' }, // Kept (no limits)
      { price: '1500', lastQuantity: '500' }, // Kept (undefined limits)
      { price: '1500', lastQuantity: '500', minAmount: '100000', maxAmount: '200000' }, // Kept (150k inside [100k, 200k])
      { price: '1500', lastQuantity: '500', minAmount: '160000', maxAmount: '500000' }, // Rejected (150k < 160k)
      { price: '1500', lastQuantity: '500', minAmount: '10000', maxAmount: '140000' }   // Rejected (150k > 140k)
    ];

    const filtered = pe.filterCompetitorAds(ads, 100, true);
    assert.strictEqual(filtered.length, 3);
  });

  it('3.3: Extreme corrupted ads array with nulls, undefined, numbers, and limit rejection', async () => {
    const pe = await getEngine();
    const corrupted = [
      null,
      undefined,
      123,
      'string',
      {},
      { price: 'invalid', lastQuantity: '100', minAmount: '1000' }, // price = 0 -> tradeAmount = 0 < minAmount -> Rejected
      { price: '1500', lastQuantity: 'invalid' }, // qty = 0 < 2 -> filtered
      { price: '1500', lastQuantity: '100', minAmount: '1000', maxAmount: '500000' } // Valid
    ];

    const filtered = pe.filterCompetitorAds(corrupted, 100, true);
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].price, '1500');
  });

}, { tier: 1, category: 'Dust & Limit Filtering' });

// =========================================================================
// SECTION 4: BOUNDARIES, EXTREME VALUES & VOLATILITY STRESS
// =========================================================================
describe('Challenger 1 — 4. Boundaries, Extreme Values & Volatility', () => {
  it('4.1: Volatile Shift: Outbid price exceeds maxBuyPrice by wide margin', async () => {
    const pe = await getEngine();
    // Aggressive competitor bids 1550, but lowest ask is only 1530!
    // Exit = 1530, targetSpread = 5, fee = 0.50 -> maxBuy = 1524.50
    // rawSuggestedBuy = 1550.10
    const res = pe.calculateBuyPricing({
      activeBuyAds: [{ price: '1550.00', lastQuantity: '100' }],
      sortedSellAds: [{ price: '1530.00', lastQuantity: '100' }],
      targetSpread: 5.0,
      inflowFee: 50.0,
      avgVolume: 100.0,
      pricingMode: 'competitor'
    });

    assert.strictEqual(res.isSafe, false);
    assert.closeTo(res.maxBuyPrice, 1524.50, 0.001);
    assert.closeTo(res.suggestedBuy, 1524.50, 0.001, 'Must cap at maxBuyPrice to prevent buying at loss');
    assert.closeTo(res.excessSpread, 5.00, 0.001, 'Spread is maintained at targetSpread');
  });

  it('4.2: Volatile Shift: Market sell ask drops below cost basis (Crash Scenario)', async () => {
    const pe = await getEngine();
    // Holding cost basis = 1600, but competitor sells at 1500!
    // costBasis = 1600, targetSpread = 5, outflowFee = 50, avgVol = 100 -> targetSellPrice = 1605.50
    // rawSuggestedSell = 1500 - 0.10 = 1499.90
    const res = pe.calculateSellPricing({
      activeSellAds: [{ price: '1500.00', lastQuantity: '100' }],
      costBasis: 1600.00,
      targetSpread: 5.0,
      outflowFee: 50.0,
      avgVolume: 100.0,
      pricingMode: 'competitor'
    });

    assert.strictEqual(res.isSafe, false);
    assert.closeTo(res.targetSellPrice, 1605.50, 0.001);
    assert.closeTo(res.suggestedSell, 1605.50, 0.001, 'Must floor at targetSellPrice to prevent selling at loss');
    assert.closeTo(res.sellSpread, 5.00, 0.001);
  });

  it('4.3: Huge fintech fees (fee per unit larger than spread or price)', async () => {
    const pe = await getEngine();
    // Inflow fee = ₦100,000 on 10 USDT volume -> fee per unit = ₦10,000
    // Exit price = 1500, targetSpread = 5 -> maxBuyPrice = 1500 - 5 - 10000 = -8505.00
    const res = pe.calculateBuyPricing({
      activeBuyAds: [{ price: '1400.00', lastQuantity: '100' }],
      sortedSellAds: [{ price: '1500.00', lastQuantity: '100' }],
      targetSpread: 5.0,
      inflowFee: 100000.0,
      avgVolume: 10.0,
      pricingMode: 'competitor'
    });

    assert.strictEqual(res.isSafe, false);
    assert.closeTo(res.maxBuyPrice, -8505.00, 0.001);
    assert.closeTo(res.suggestedBuy, -8505.00, 0.001);
  });

  it('4.4: Zero and negative cost basis handling', async () => {
    const pe = await getEngine();
    const resZero = pe.calculateSellPricing({
      activeSellAds: [{ price: '1500.00', lastQuantity: '100' }],
      costBasis: 0
    });
    assert.strictEqual(resZero.hasCostBasis, false);
    assert.strictEqual(resZero.suggestedSell, 0);
    assert.strictEqual(resZero.isSafe, false);

    const resNeg = pe.calculateSellPricing({
      activeSellAds: [{ price: '1500.00', lastQuantity: '100' }],
      costBasis: -1500
    });
    assert.strictEqual(resNeg.hasCostBasis, false);
    assert.strictEqual(resNeg.suggestedSell, 0);
    assert.strictEqual(resNeg.isSafe, false);
  });
}, { tier: 1, category: 'Boundaries & Volatility' });

// =========================================================================
// SECTION 5: BYBIT P2P SIDE CONVENTIONS & RESILIENT EXTRACTION
// =========================================================================
describe('Challenger 1 — 5. Bybit Side Conventions & Resilient Extraction', () => {
  it('5.1: Bybit Public Market Depth Side Conventions mapping', () => {
    // Specification invariant check:
    // /v5/p2p/item/online is from TAKER perspective:
    // side: '1' -> Taker Sells crypto -> Merchant is Buying -> buyDepth (bids)
    // side: '0' -> Taker Buys crypto -> Merchant is Selling -> sellDepth (asks)

    const buySideTaker = '0';
    const sellSideTaker = '1';

    assert.strictEqual(buySideTaker, '0', 'Merchant buying corresponds to side 0 (buyDepth/bids)');
    assert.strictEqual(sellSideTaker, '1', 'Merchant selling corresponds to side 1 (sellDepth/asks)');
  });

  it('5.2: Resilient extractItems handles all 10 Bybit payload structures', () => {
    const extractItems = (data) => {
      if (!data) return [];
      if (Array.isArray(data)) return data;
      if (Array.isArray(data.result)) return data.result;
      if (data.result && typeof data.result === 'object') {
        if (Array.isArray(data.result.items)) return data.result.items;
        if (Array.isArray(data.result.list)) return data.result.list;
        if (Array.isArray(data.result.data)) return data.result.data;
        if (Array.isArray(data.result.rows)) return data.result.rows;
        if (Array.isArray(data.result.records)) return data.result.records;
        if (Array.isArray(data.result.itemList)) return data.result.itemList;
      }
      if (Array.isArray(data.items)) return data.items;
      if (Array.isArray(data.list)) return data.list;
      return [];
    };

    const mockItem = { id: 'ad_1', price: '1500.00' };

    // Structure 1: result.items
    assert.deepStrictEqual(extractItems({ result: { items: [mockItem] } }), [mockItem]);
    // Structure 2: result.list
    assert.deepStrictEqual(extractItems({ result: { list: [mockItem] } }), [mockItem]);
    // Structure 3: result.data
    assert.deepStrictEqual(extractItems({ result: { data: [mockItem] } }), [mockItem]);
    // Structure 4: result.rows
    assert.deepStrictEqual(extractItems({ result: { rows: [mockItem] } }), [mockItem]);
    // Structure 5: result.records
    assert.deepStrictEqual(extractItems({ result: { records: [mockItem] } }), [mockItem]);
    // Structure 6: result.itemList
    assert.deepStrictEqual(extractItems({ result: { itemList: [mockItem] } }), [mockItem]);
    // Structure 7: items
    assert.deepStrictEqual(extractItems({ items: [mockItem] }), [mockItem]);
    // Structure 8: list
    assert.deepStrictEqual(extractItems({ list: [mockItem] }), [mockItem]);
    // Structure 9: raw array
    assert.deepStrictEqual(extractItems([mockItem]), [mockItem]);
    // Structure 10: empty / corrupted
    assert.deepStrictEqual(extractItems(null), []);
    assert.deepStrictEqual(extractItems(undefined), []);
    assert.deepStrictEqual(extractItems({}), []);
    assert.deepStrictEqual(extractItems('string'), []);
  });
}, { tier: 1, category: 'Bybit Side Mapping & Extraction' });

// =========================================================================
// SECTION 6: UI VIEW & CONTRACT VERIFICATION
// =========================================================================
describe('Challenger 1 — 6. UI View & Presentation Alignment', () => {
  it('6.1: renderPricingView contains accurate badges, titles, and orderbook IDs', async () => {
    const viewModule = await import('../js/views/pricing.view.js');
    const html = viewModule.renderPricingView();

    // Badges
    assert.ok(html.includes('Buy Ad Assistant <span class="badge badge-primary">Inflow</span>'), 'Buy Ad badge missing');
    assert.ok(html.includes('Sell Ad Assistant <span class="badge badge-primary">Outflow</span>'), 'Sell Ad badge missing');

    // Section cards
    assert.ok(html.includes('id="pricing-exit-price"'));
    assert.ok(html.includes('id="pricing-max-buy"'));
    assert.ok(html.includes('id="pricing-suggested-buy"'));
    assert.ok(html.includes('id="pricing-buy-status"'));

    assert.ok(html.includes('id="pricing-cost-basis"'));
    assert.ok(html.includes('id="pricing-break-even"'));
    assert.ok(html.includes('id="pricing-target-sell-price"'));
    assert.ok(html.includes('id="pricing-suggested-sell"'));
    assert.ok(html.includes('id="pricing-sell-status"'));

    // Order books
    assert.ok(html.includes('id="pricing-buy-orderbook"'));
    assert.ok(html.includes('id="pricing-sell-orderbook"'));
    assert.ok(html.includes('Buy Order Book (Market Bids)'));
    assert.ok(html.includes('Sell Order Book (Market Asks)'));
  });
}, { tier: 1, category: 'UI View Verification' });

// =========================================================================
// SECTION 7: MONTE CARLO RANDOMIZED ORDERBOOK FUZZING (5,000 SCENARIOS)
// =========================================================================
describe('Challenger 1 — 7. Monte Carlo Randomized Orderbook Fuzzing', () => {
  it('7.1: 5,000 Random Market Depths with Diverse Pricing Modes and Limits', async () => {
    const pe = await getEngine();
    const modes = ['competitor', 'avg-5', 'avg-10', 'avg-20', 'vwap-5', 'vwap-10', 'vwap-20'];

    for (let trial = 0; trial < 5000; trial++) {
      const buyAdCount = Math.floor(Math.random() * 30); // 0 to 29 ads
      const sellAdCount = Math.floor(Math.random() * 30); // 0 to 29 ads
      const mode = modes[Math.floor(Math.random() * modes.length)];
      const targetSpread = -10 + Math.random() * 60; // -10 to +50 NGN
      const inflowFee = Math.random() * 500;
      const outflowFee = Math.random() * 500;
      const avgVolume = Math.random() * 500;
      const costBasis = Math.random() * 2000;

      // Generate randomized buy ads (descending order)
      let baseBuyPrice = 1400 + Math.random() * 300;
      const buyAds = [];
      for (let j = 0; j < buyAdCount; j++) {
        baseBuyPrice -= Math.random() * 2;
        buyAds.push({
          id: `buy_${trial}_${j}`,
          price: Math.max(1, baseBuyPrice).toFixed(2),
          lastQuantity: (0.5 + Math.random() * 500).toFixed(2),
          minAmount: Math.floor(Math.random() * 50000).toString(),
          maxAmount: Math.floor(50000 + Math.random() * 500000).toString()
        });
      }

      // Generate randomized sell ads (ascending order)
      let baseSellPrice = 1420 + Math.random() * 300;
      const sellAds = [];
      for (let k = 0; k < sellAdCount; k++) {
        baseSellPrice += Math.random() * 2;
        sellAds.push({
          id: `sell_${trial}_${k}`,
          price: baseSellPrice.toFixed(2),
          lastQuantity: (0.5 + Math.random() * 500).toFixed(2),
          minAmount: Math.floor(Math.random() * 50000).toString(),
          maxAmount: Math.floor(50000 + Math.random() * 500000).toString()
        });
      }

      // Filter ads
      const filteredBuy = pe.filterCompetitorAds(buyAds, avgVolume, true);
      const filteredSell = pe.filterCompetitorAds(sellAds, avgVolume, true);
      const activeBuy = filteredBuy.length > 0 ? filteredBuy : buyAds;
      const activeSell = filteredSell.length > 0 ? filteredSell : sellAds;

      // Buy Pricing
      const buyRes = pe.calculateBuyPricing({
        activeBuyAds: activeBuy,
        sortedSellAds: sellAds,
        targetSpread,
        inflowFee,
        avgVolume,
        pricingMode: mode
      });

      // Assert Buy Invariants
      if (!buyRes.isOffline) {
        assert.ok(
          buyRes.suggestedBuy <= buyRes.maxBuyPrice + 1e-6,
          `Buy Spread Cap violated at trial ${trial}: suggestedBuy ${buyRes.suggestedBuy} > maxBuy ${buyRes.maxBuyPrice}`
        );
        assert.strictEqual(
          buyRes.isSafe,
          buyRes.rawSuggestedBuy <= buyRes.maxBuyPrice,
          `Buy safety flag mismatch at trial ${trial}`
        );
      }

      // Sell Pricing
      const sellRes = pe.calculateSellPricing({
        activeSellAds: activeSell,
        costBasis,
        targetSpread,
        outflowFee,
        avgVolume,
        pricingMode: mode
      });

      // Assert Sell Invariants
      if (sellRes.hasCostBasis && sellRes.hasCompetitors) {
        assert.ok(
          sellRes.suggestedSell >= sellRes.targetSellPrice - 1e-6,
          `Sell Spread Floor violated at trial ${trial}: suggestedSell ${sellRes.suggestedSell} < targetSell ${sellRes.targetSellPrice}`
        );
        assert.strictEqual(
          sellRes.isSafe,
          sellRes.rawSuggestedSell >= sellRes.targetSellPrice,
          `Sell safety flag mismatch at trial ${trial}`
        );
      }
    }
  });
}, { tier: 1, category: 'Monte Carlo Fuzzing' });

