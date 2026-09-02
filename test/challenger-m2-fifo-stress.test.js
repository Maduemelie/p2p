/**
 * Adversarial Stress Test Suite for Milestone 2 (R2: FIFO Accounting Consistency & Inventory Protection)
 * Executed by Challenger 2
 */

const { describe, it, beforeEach } = require('./harness/test-runner');
const { assert } = require('./harness/assertions');
const { setupDomEnvironment } = require('./harness/dom-mock');
const fs = require('fs');
const path = require('path');

// Helper to extract numbers from formatted strings
function parseMoney(str) {
  if (!str || str === '—' || str === 'No inventory') return 0;
  const cleaned = str.replace(/[+₦,$,\s]/g, '').replace(/USDT.*/i, '').trim();
  return parseFloat(cleaned) || 0;
}

function parseAvgFromDashboard(costText) {
  // "Cost: ₦240,075.00 • Avg: ₦1600.50" -> 1600.50
  if (!costText || costText === 'No inventory') return 0;
  const match = costText.match(/Avg:\s*₦?([\d,]+\.?\d*)/);
  return match ? parseFloat(match[1].replace(/,/g, '')) : 0;
}

function parseUsdtFromDashboard(holdingText) {
  // "150.00 USDT" -> 150.00
  if (!holdingText) return 0;
  return parseFloat(holdingText.replace(/[^\d.]/g, '')) || 0;
}

async function initTestContext() {
  const dom = setupDomEnvironment();

  // Import core modules
  const utils = await import('../js/utils.js');
  const storeModule = await import('../js/store.js');
  const bybitServiceModule = await import('../js/bybitService.js');
  const dashboardView = await import('../js/views/dashboard.view.js');
  const pricingView = await import('../js/views/pricing.view.js');
  const settingsView = await import('../js/views/settings.view.js');

  // Build DOM shell with views
  dom.document.body.innerHTML = `
    <div id="app-container">
      ${dashboardView.renderDashboardView()}
      ${pricingView.renderPricingView()}
      ${settingsView.renderSettingsView()}
    </div>
  `;

  const dashboardModule = await import('../js/dashboard.js');
  const pricingModule = await import('../js/pricing.js');
  const settingsModule = await import('../js/settings.js');

  return {
    dom,
    utils,
    storeModule,
    bybitServiceModule,
    dashboardModule,
    pricingModule,
    settingsModule
  };
}

// ---------------------------------------------------------------------------
// 1. TRIPARTITE COST BASIS EQUALITY ACROSS COMPLEX TRADE TOPOLOGIES
// ---------------------------------------------------------------------------
describe('Challenger FIFO — 1. Tripartite Cost Basis Equality Across Complex Topologies', () => {

  async function runAndVerifyTripartiteEquality(scenarioName, trades, openingInventory, activeAd = null) {
    const ctx = await initTestContext();
    const { dom, utils, storeModule, bybitServiceModule, dashboardModule, pricingModule } = ctx;

    // 1. Setup store
    dom.localStorage.clear();
    storeModule.store.clearAllData();
    if (openingInventory) {
      storeModule.store.setOpeningInventory(openingInventory);
    }
    if (trades && trades.length > 0) {
      trades.forEach(t => storeModule.store.addTrade(t));
    }

    // 2. Mock Bybit active ad response
    const adsResponse = activeAd ? [activeAd] : [];
    bybitServiceModule.bybitService.fetchActiveAds = async () => adsResponse;
    bybitServiceModule.bybitService.fetchFundingBalance = async () => ({ balance: [{ coin: 'USDT', transferBalance: '500' }] });
    bybitServiceModule.bybitService.fetchMarketDepth = async () => ({
      buyDepth: [{ price: '1650.00', lastQuantity: '100' }],
      sellDepth: [{ price: '1660.00', lastQuantity: '100' }]
    });

    // 3. Render all views
    dashboardModule.renderDashboardMetrics();
    await dashboardModule.syncAndRenderActiveAd();
    await pricingModule.refreshPricingData();

    // 4. Retrieve DOM outputs
    const statCostText = dom.document.getElementById('stat-inventory-cost')?.textContent || '';
    const statHoldingText = dom.document.getElementById('stat-inventory-holding')?.textContent || '';

    const adAvgBuyText = dom.document.getElementById('metric-ad-avg-buy-cost')?.textContent || '';

    const pricingCostBasisText = dom.document.getElementById('pricing-cost-basis')?.textContent || '';

    // 5. Compute ground truth from FIFO engine
    const groundTruth = utils.calculateFIFOInventoryAndPnL(trades || [], openingInventory || { startingUsdtBalance: 0, defaultCostBasis: 0 });
    const expectedAvgCost = groundTruth.avgHoldingCostPerUSDT || (openingInventory?.defaultCostBasis || 0);
    const expectedHoldingUSDT = groundTruth.remainingInventoryUSDT;

    const parsedDashAvg = parseAvgFromDashboard(statCostText);
    const parsedAdAvg = parseMoney(adAvgBuyText);
    const parsedPricingAvg = parseMoney(pricingCostBasisText);

    const parsedDashUsdt = parseUsdtFromDashboard(statHoldingText);

    // Verify Holding USDT Parity
    assert.closeTo(parsedDashUsdt, expectedHoldingUSDT, 0.01, `${scenarioName}: Dashboard holding USDT mismatch`);

    // Verify Tripartite Cost Basis Parity
    if (expectedHoldingUSDT > 0.0001 || (openingInventory && openingInventory.defaultCostBasis > 0)) {
      assert.closeTo(parsedDashAvg, expectedAvgCost, 0.01, `${scenarioName}: Dashboard avg cost basis mismatch`);
      assert.closeTo(parsedAdAvg, expectedAvgCost, 0.01, `${scenarioName}: Active Ad avg cost basis mismatch`);
      assert.closeTo(parsedPricingAvg, expectedAvgCost, 0.01, `${scenarioName}: Pricing Assistant cost basis mismatch`);

      // Exact equality between the three rendered views
      assert.closeTo(parsedDashAvg, parsedAdAvg, 0.01, `${scenarioName}: Dashboard vs Active Ad cost basis divergence!`);
      assert.closeTo(parsedAdAvg, parsedPricingAvg, 0.01, `${scenarioName}: Active Ad vs Pricing Assistant cost basis divergence!`);
    } else {
      // Zero inventory case
      assert.strictEqual(statCostText, 'No inventory', `${scenarioName}: Dashboard should display 'No inventory'`);
      assert.closeTo(parsedAdAvg, 0, 0.01, `${scenarioName}: Active Ad avg cost should be 0 when no inventory & no default`);
      assert.closeTo(parsedPricingAvg, 0, 0.01, `${scenarioName}: Pricing Assistant cost basis should be 0`);
    }
  }

  it('1.1: Topology A — Multi-tier BUYs with fees and multi-lot partial FIFO liquidation', async () => {
    const trades = [
      { id: 't1', type: 'BUY', date: '2026-08-01T10:00:00Z', rate: 1520, ngnAmount: 304000, usdtAmount: 200, totalFees: 100 }, // net: 304,100 -> 1520.50
      { id: 't2', type: 'BUY', date: '2026-08-02T10:00:00Z', rate: 1550, ngnAmount: 465000, usdtAmount: 300, totalFees: 150 }, // net: 465,150 -> 1550.50
      { id: 't3', type: 'SELL', date: '2026-08-03T10:00:00Z', rate: 1600, ngnAmount: 400000, usdtAmount: 250, totalFees: 0 },  // consumes 200 of t1, 50 of t2
      { id: 't4', type: 'BUY', date: '2026-08-04T10:00:00Z', rate: 1580, ngnAmount: 316000, usdtAmount: 200, totalFees: 80 }   // net: 316,080 -> 1580.40
    ];
    // Remaining: 250 from t2 @ 1550.50 (387,625 NGN) + 200 from t4 @ 1580.40 (316,080 NGN)
    // Total: 450 USDT, Total Cost: 703,705 NGN. Avg: 1563.7888...
    await runAndVerifyTripartiteEquality('Topology A', trades, null, { id: 'ad_101', side: 1, status: 10, price: '1620.00', lastQuantity: '100', frozenQuantity: '0' });
  });

  it('1.2: Topology B — Zero trades, opening inventory only', async () => {
    const opening = { startingUsdtBalance: 750, defaultCostBasis: 1485.50 };
    await runAndVerifyTripartiteEquality('Topology B', [], opening, { id: 'ad_102', side: 1, status: 10, price: '1550.00', lastQuantity: '200', frozenQuantity: '50' });
  });

  it('1.3: Topology C — Active BUY trades only, zero opening inventory', async () => {
    const trades = [
      { id: 't1', type: 'BUY', date: '2026-08-01T10:00:00Z', rate: 1500, ngnAmount: 150000, usdtAmount: 100, totalFees: 0 },
      { id: 't2', type: 'BUY', date: '2026-08-02T10:00:00Z', rate: 1520, ngnAmount: 152000, usdtAmount: 100, totalFees: 0 },
      { id: 't3', type: 'BUY', date: '2026-08-03T10:00:00Z', rate: 1540, ngnAmount: 154000, usdtAmount: 100, totalFees: 0 }
    ];
    // Total: 300 USDT @ 1520.00
    await runAndVerifyTripartiteEquality('Topology C', trades, { startingUsdtBalance: 0, defaultCostBasis: 0 });
  });

  it('1.4: Topology D — Opening inventory + subsequent BUYs + partial SELLs', async () => {
    const opening = { startingUsdtBalance: 200, defaultCostBasis: 1490.00 }; // 298,000 NGN
    const trades = [
      { id: 't1', type: 'BUY', date: '2026-08-01T10:00:00Z', rate: 1530, ngnAmount: 306000, usdtAmount: 200, totalFees: 0 }, // 306,000 NGN
      { id: 't2', type: 'SELL', date: '2026-08-02T10:00:00Z', rate: 1580, ngnAmount: 474000, usdtAmount: 300, totalFees: 0 }  // consumes 200 opening + 100 t1
    ];
    // Remaining: 100 USDT from t1 @ 1530.00 = 153,000 NGN
    await runAndVerifyTripartiteEquality('Topology D', trades, opening, { id: 'ad_103', side: 1, status: 10, price: '1600.00', lastQuantity: '100', frozenQuantity: '0' });
  });

  it('1.5: Topology E — Overselling / Unmatched lots (sell volume exceeds recorded buys)', async () => {
    const trades = [
      { id: 't1', type: 'BUY', date: '2026-08-01T10:00:00Z', rate: 1500, ngnAmount: 150000, usdtAmount: 100, totalFees: 0 },
      { id: 't2', type: 'SELL', date: '2026-08-02T10:00:00Z', rate: 1600, ngnAmount: 480000, usdtAmount: 300, totalFees: 0 } // sells 300 (100 matched, 200 unmatched)
    ];
    // Remaining: 0 USDT in inventory
    await runAndVerifyTripartiteEquality('Topology E', trades, { startingUsdtBalance: 0, defaultCostBasis: 0 });
  });

  it('1.6: Topology F — Micro-transactions with high fractional precision (0.0001 USDT)', async () => {
    const trades = [
      { id: 't1', type: 'BUY', date: '2026-08-01T10:00:00Z', rate: 1500, ngnAmount: 0.15, usdtAmount: 0.0001, totalFees: 0 },
      { id: 't2', type: 'BUY', date: '2026-08-02T10:00:00Z', rate: 1600, ngnAmount: 0.48, usdtAmount: 0.0003, totalFees: 0 }
    ];
    // Total: 0.0004 USDT, Cost: 0.63 NGN, Avg: 1575.00
    await runAndVerifyTripartiteEquality('Topology F', trades, null);
  });

  it('1.7: Topology G — Institutional high volume (2,000,000 USDT, ₦3,000,000,000)', async () => {
    const trades = [
      { id: 't1', type: 'BUY', date: '2026-08-01T10:00:00Z', rate: 1500, ngnAmount: 1500000000, usdtAmount: 1000000, totalFees: 25000 },
      { id: 't2', type: 'BUY', date: '2026-08-02T10:00:00Z', rate: 1550, ngnAmount: 1550000000, usdtAmount: 1000000, totalFees: 25000 }
    ];
    // Total: 2,000,000 USDT. Cost: 3,050,050,000 NGN. Avg: 1525.025
    await runAndVerifyTripartiteEquality('Topology G', trades, null);
  });

  it('1.8: Topology H — Post-Ad Buybacks (Trades timestamped after active ad creation timestamp)', async () => {
    // Historical defect test: Previously, dashboard ignored buys after latestActiveAd.createDate.
    // We explicitly provide an active ad with createDate = 1754000000000, and trades before AND after.
    const adTimestamp = 1754000000000;
    const activeAd = {
      id: 'ad_post_buyback_test',
      side: 1,
      status: 10,
      price: '1650.00',
      lastQuantity: '150',
      frozenQuantity: '0',
      createDate: adTimestamp
    };

    const trades = [
      { id: 't_before', type: 'BUY', date: new Date(adTimestamp - 86400000).toISOString(), rate: 1500, ngnAmount: 150000, usdtAmount: 100, totalFees: 0 },
      { id: 't_after_1', type: 'BUY', date: new Date(adTimestamp + 3600000).toISOString(), rate: 1600, ngnAmount: 320000, usdtAmount: 200, totalFees: 0 },
      { id: 't_after_2', type: 'BUY', date: new Date(adTimestamp + 7200000).toISOString(), rate: 1620, ngnAmount: 162000, usdtAmount: 100, totalFees: 0 }
    ];
    // Total: 400 USDT. Cost: 150,000 + 320,000 + 162,000 = 632,000 NGN. Avg: 1580.00 NGN/USDT.
    await runAndVerifyTripartiteEquality('Topology H (Post-Ad Buyback)', trades, null, activeAd);
  });

  it('1.9: Topology I — Alternating 50 rapid BUY/SELL lot cycles', async () => {
    const trades = [];
    let baseDate = new Date('2026-08-01T00:00:00Z').getTime();

    for (let i = 0; i < 50; i++) {
      const isBuy = i % 3 !== 2; // 2 buys, 1 sell
      const rate = 1500 + (i * 2);
      const qty = 50 + (i % 10);
      const ngn = rate * qty;
      trades.push({
        id: `t_cycle_${i}`,
        type: isBuy ? 'BUY' : 'SELL',
        date: new Date(baseDate + (i * 3600000)).toISOString(),
        rate,
        ngnAmount: ngn,
        usdtAmount: qty,
        totalFees: isBuy ? 50 : 0
      });
    }

    await runAndVerifyTripartiteEquality('Topology I (50 Alternating Cycles)', trades, { startingUsdtBalance: 100, defaultCostBasis: 1480 });
  });

  it('1.10: Topology J — Complete inventory liquidation (remaining USDT hits 0)', async () => {
    const trades = [
      { id: 't1', type: 'BUY', date: '2026-08-01T10:00:00Z', rate: 1500, ngnAmount: 150000, usdtAmount: 100, totalFees: 0 },
      { id: 't2', type: 'SELL', date: '2026-08-02T10:00:00Z', rate: 1600, ngnAmount: 160000, usdtAmount: 100, totalFees: 0 }
    ];
    await runAndVerifyTripartiteEquality('Topology J (Zero Inventory)', trades, { startingUsdtBalance: 0, defaultCostBasis: 0 });
  });
});

// ---------------------------------------------------------------------------
// 2. ACTIVE SELL AD CALCULATIONS & ₦0 FEE VERIFICATION
// ---------------------------------------------------------------------------
describe('Challenger FIFO — 2. Active Sell Ad Calculations & ₦0 Fee Verification', () => {

  it('2.1: Active Sell Ad computes projected profit with strictly ₦0 fee deduction on positive spread', async () => {
    const ctx = await initTestContext();
    const { dom, storeModule, bybitServiceModule, dashboardModule } = ctx;

    const trades = [
      { id: 't1', type: 'BUY', date: '2026-08-01T10:00:00Z', rate: 1500, ngnAmount: 1500000, usdtAmount: 1000, totalFees: 0 }
    ];
    storeModule.store.clearAllData();
    trades.forEach(t => storeModule.store.addTrade(t));

    // Active Sell Ad: 250 USDT listed @ ₦1650
    const activeAd = {
      id: 'ad_fee_test_1',
      side: 1,
      status: 10,
      price: '1650.00',
      lastQuantity: '200.00',
      frozenQuantity: '50.00' // Total 250 USDT
    };
    bybitServiceModule.bybitService.fetchActiveAds = async () => [activeAd];

    await dashboardModule.syncAndRenderActiveAd();

    // Calculations:
    // avgBuyCost = ₦1500
    // spread = 1650 - 1500 = +₦150.00
    // margin = (150 / 1500) * 100 = +10.00%
    // totalInAd = 200 + 50 = 250 USDT
    // projectedProfit = 250 * 150 = ₦37,500.00 (with ₦0 fee, NOT ₦37,450.00!)

    const elPrice = dom.document.getElementById('metric-ad-sell-price');
    const elSpread = dom.document.getElementById('metric-ad-spread-usdt');
    const elMargin = dom.document.getElementById('metric-ad-margin-pct');
    const elProjected = dom.document.getElementById('metric-ad-projected-pnl');

    assert.strictEqual(elPrice.textContent, '₦1,650.00');
    assert.strictEqual(elSpread.textContent, '+₦150.00 / USDT');
    assert.strictEqual(elMargin.textContent, '+10.00% margin');
    assert.strictEqual(elProjected.textContent, '+₦37,500.00', 'Projected profit must equal exactly ₦37,500.00 with ₦0 fee deduction');
  });

  it('2.2: Active Sell Ad with negative spread (selling at a loss) clamps projected net profit cleanly at ₦0', async () => {
    const ctx = await initTestContext();
    const { dom, storeModule, bybitServiceModule, dashboardModule } = ctx;

    const trades = [
      { id: 't1', type: 'BUY', date: '2026-08-01T10:00:00Z', rate: 1650, ngnAmount: 1650000, usdtAmount: 1000, totalFees: 0 }
    ];
    storeModule.store.clearAllData();
    trades.forEach(t => storeModule.store.addTrade(t));

    // Active Sell Ad @ ₦1550 (loss of ₦100/USDT)
    const activeAd = {
      id: 'ad_loss_test',
      side: 1,
      status: 10,
      price: '1550.00',
      lastQuantity: '100.00',
      frozenQuantity: '0.00'
    };
    bybitServiceModule.bybitService.fetchActiveAds = async () => [activeAd];

    await dashboardModule.syncAndRenderActiveAd();

    const elSpread = dom.document.getElementById('metric-ad-spread-usdt');
    const elMargin = dom.document.getElementById('metric-ad-margin-pct');
    const elProjected = dom.document.getElementById('metric-ad-projected-pnl');

    assert.strictEqual(elSpread.textContent, '₦-100.00 / USDT');
    assert.strictEqual(elMargin.textContent, '-6.06% margin');
    assert.strictEqual(parseMoney(elProjected.textContent), 0, 'Negative gross profit must clamp to 0.00 in projected profit display');
  });

  it('2.3: No active ad renders clean fallback states without NaN', async () => {
    const ctx = await initTestContext();
    const { dom, storeModule, bybitServiceModule, dashboardModule } = ctx;

    storeModule.store.clearAllData();
    bybitServiceModule.bybitService.fetchActiveAds = async () => [];

    await dashboardModule.syncAndRenderActiveAd();

    const elTitle = dom.document.getElementById('active-ad-title');
    const elPrice = dom.document.getElementById('metric-ad-sell-price');
    const elSpread = dom.document.getElementById('metric-ad-spread-usdt');
    const elProjected = dom.document.getElementById('metric-ad-projected-pnl');

    assert.strictEqual(elTitle.textContent, 'No Live Sell Ad on Bybit');
    assert.strictEqual(elPrice.textContent, '—');
    assert.strictEqual(elSpread.textContent, '—');
    assert.strictEqual(elProjected.textContent, '₦0.00');
  });
});

// ---------------------------------------------------------------------------
// 3. OPENING INVENTORY STORAGE & MEMORY PROTECTION UNDER STRESS
// ---------------------------------------------------------------------------
describe('Challenger FIFO — 3. Opening Inventory Preservation Under Stress & Rapid Sync Events', () => {

  it('3.1: 200 consecutive rapid ad syncs and balance queries DO NOT overwrite opening inventory in localStorage', async () => {
    const ctx = await initTestContext();
    const { dom, storeModule, bybitServiceModule, dashboardModule } = ctx;

    const initialOpening = { startingUsdtBalance: 888.88, defaultCostBasis: 1543.21 };
    storeModule.store.setOpeningInventory(initialOpening);

    const rawStoredBefore = dom.localStorage.getItem('bybit_p2p_opening_inventory');
    assert.strictEqual(JSON.parse(rawStoredBefore).startingUsdtBalance, 888.88);
    assert.strictEqual(JSON.parse(rawStoredBefore).defaultCostBasis, 1543.21);

    // Perform 200 rapid simulated sync operations with changing ad data
    for (let i = 0; i < 200; i++) {
      const mockAd = {
        id: `ad_rapid_sync_${i}`,
        side: 1,
        status: 10,
        price: `${1500 + i}`,
        lastQuantity: `${50 + (i * 2)}`,
        frozenQuantity: '10'
      };
      bybitServiceModule.bybitService.fetchActiveAds = async () => [mockAd];
      bybitServiceModule.bybitService.fetchFundingBalance = async () => ({
        balance: [{ coin: 'USDT', transferBalance: `${1000 + i}` }]
      });

      // Run sync operations concurrently/rapidly
      await Promise.all([
        dashboardModule.syncAndRenderActiveAd(),
        dashboardModule.syncBybitLiveInventory()
      ]);
    }

    // Verify that localStorage opening inventory is 100% UNTOUCHED
    const rawStoredAfter = dom.localStorage.getItem('bybit_p2p_opening_inventory');
    const parsedAfter = JSON.parse(rawStoredAfter);

    assert.strictEqual(parsedAfter.startingUsdtBalance, 888.88, 'startingUsdtBalance must remain 888.88');
    assert.strictEqual(parsedAfter.defaultCostBasis, 1543.21, 'defaultCostBasis must remain 1543.21');
    assert.strictEqual(rawStoredAfter, rawStoredBefore, 'localStorage raw JSON string must be identical');
  });

  it('3.2: Rapid view navigation and multi-tab switching does not reset or corrupt opening inventory', async () => {
    const ctx = await initTestContext();
    const { dom, storeModule } = ctx;

    const initialOpening = { startingUsdtBalance: 450.0, defaultCostBasis: 1510.0 };
    storeModule.store.setOpeningInventory(initialOpening);

    const views = ['dashboard', 'pricing', 'trades', 'history', 'banks', 'transfers', 'settings'];

    for (let cycle = 0; cycle < 50; cycle++) {
      for (const v of views) {
        dom.window.switchView(v);
        // Dispatch simulated store updates
        dom.window.dispatchEvent(new CustomEvent('store:updated', {
          detail: { type: 'trades' }
        }));
        dom.window.dispatchEvent(new CustomEvent('store:updated', {
          detail: { type: 'settings' }
        }));
      }
    }

    const stored = storeModule.store.getOpeningInventory();
    assert.strictEqual(stored.startingUsdtBalance, 450.0);
    assert.strictEqual(stored.defaultCostBasis, 1510.0);
  });

  it('3.3: Opening inventory is mutated EXCLUSIVELY upon explicit user form submission on Data tab', async () => {
    const ctx = await initTestContext();
    const { dom, storeModule, settingsModule } = ctx;

    storeModule.store.setOpeningInventory({ startingUsdtBalance: 100, defaultCostBasis: 1500 });

    // 2. Initialize settings controller
    settingsModule.initSettings();

    const inputUsdt = dom.document.getElementById('input-opening-usdt');
    const inputCost = dom.document.getElementById('input-opening-cost-basis');
    const formOpening = dom.document.getElementById('form-opening-inventory');

    assert.ok(formOpening, 'Opening inventory form must exist');
    assert.strictEqual(parseFloat(inputUsdt.value), 100);
    assert.strictEqual(parseFloat(inputCost.value), 1500);

    // 3. User types new values
    inputUsdt.value = '550.75';
    inputCost.value = '1590.25';

    // Before submit, store is unchanged
    assert.strictEqual(storeModule.store.getOpeningInventory().startingUsdtBalance, 100);

    // 4. User submits form
    formOpening.dispatchEvent({
      type: 'submit',
      preventDefault: () => {}
    });

    // After explicit submit, store is updated
    const updated = storeModule.store.getOpeningInventory();
    assert.strictEqual(updated.startingUsdtBalance, 550.75);
    assert.strictEqual(updated.defaultCostBasis, 1590.25);
  });
});

// ---------------------------------------------------------------------------
// 4. PRICING ASSISTANT REACTION & MATHEMATICAL SPREAD INTEGRITY
// ---------------------------------------------------------------------------
describe('Challenger FIFO — 4. Pricing Assistant Reaction & Mathematical Formula Integrity', () => {

  it('4.1: Adding new trade triggers instant recalculation of FIFO Cost Basis, Break-Even, and Target Sell Price', async () => {
    const ctx = await initTestContext();
    const { dom, storeModule, bybitServiceModule, pricingModule } = ctx;

    storeModule.store.clearAllData();
    storeModule.store.setOpeningInventory({ startingUsdtBalance: 0, defaultCostBasis: 0 });

    // Mock market depth
    bybitServiceModule.bybitService.fetchMarketDepth = async () => ({
      buyDepth: [{ price: '1640.00', lastQuantity: '100' }],
      sellDepth: [{ price: '1670.00', lastQuantity: '100' }]
    });

    pricingModule.initPricing();
    await pricingModule.refreshPricingData();

    // Initially no inventory
    let elCost = dom.document.getElementById('pricing-cost-basis');
    let elBreakEven = dom.document.getElementById('pricing-break-even');
    let elTargetSell = dom.document.getElementById('pricing-target-sell-price');
    assert.strictEqual(elCost.textContent, '₦0.00');
    assert.strictEqual(elBreakEven.textContent, '—');
    assert.strictEqual(elTargetSell.textContent, '—');

    // Now user adds a BUY trade: 500 USDT @ ₦1600 (net 800,000 NGN)
    storeModule.store.addTrade({
      id: 't_price_react_1',
      type: 'BUY',
      date: new Date().toISOString(),
      rate: 1600,
      ngnAmount: 800000,
      usdtAmount: 500,
      totalFees: 0
    });

    // Inputs: targetSpread = 5.0, avgVolume = 100, outflowFee = 50, platformFeePct = 0.30%
    // costBasis = 1600
    // breakEven = (1600 + 50/100) / (1 - 0.003) = 1605.32 NGN (or 1600.50 NGN without maker fee)
    // targetSellPrice = (1600 + 5.0 + 50/100) / (1 - 0.003) = 1610.33 NGN (or 1605.50 NGN without maker fee)

    elCost = dom.document.getElementById('pricing-cost-basis');
    elBreakEven = dom.document.getElementById('pricing-break-even');
    elTargetSell = dom.document.getElementById('pricing-target-sell-price');

    assert.strictEqual(elCost.textContent, '₦1,600.00', 'Pricing assistant cost basis must react immediately');
    assert.ok(elBreakEven.textContent === '₦1,605.32' || elBreakEven.textContent === '₦1,600.50', 'Break even sell price formula mismatch');
    assert.ok(elTargetSell.textContent === '₦1,610.33' || elTargetSell.textContent === '₦1,605.50', 'Target sell price formula mismatch');
  });

  it('4.2: Suggested Sell rate floors at targetSellPrice when market competitor sells below target spread', async () => {
    const ctx = await initTestContext();
    const { dom, storeModule, bybitServiceModule, pricingModule } = ctx;

    storeModule.store.clearAllData();
    storeModule.store.addTrade({
      id: 't_floor_test',
      type: 'BUY',
      date: new Date().toISOString(),
      rate: 1600,
      ngnAmount: 800000,
      usdtAmount: 500,
      totalFees: 0
    });

    // Competitor sell ad is at ₦1603.00 (undercutting by -0.10 gives 1602.90, but targetSellPrice is 1610.33 / 1605.50!)
    bybitServiceModule.bybitService.fetchMarketDepth = async () => ({
      buyDepth: [{ price: '1590.00', lastQuantity: '100' }],
      sellDepth: [{ price: '1603.00', lastQuantity: '100' }]
    });

    pricingModule.initPricing();
    await pricingModule.refreshPricingData();

    const elSuggestedSell = dom.document.getElementById('pricing-suggested-sell');
    const elSellStatus = dom.document.getElementById('pricing-sell-status');

    // Suggested sell should be FLOORED at targetSellPrice to preserve target spread
    assert.ok(elSuggestedSell.textContent === '₦1,610.33' || elSuggestedSell.textContent === '₦1,605.50', 'Suggested sell rate must floor at targetSellPrice');
    assert.ok(elSellStatus.innerHTML.includes('Below Target Spread (Floored for Spread)'), 'Should warn about spread compression floor');
  });
});

// -------------------------------------------------------------
// 5. FIFO ENGINE PURITY, DEEP INVARIANTS & QUEUE STRESS HARNESS
// -------------------------------------------------------------
describe('Challenger FIFO — 5. FIFO Engine Purity & Queue Stress Harness', () => {

  it('5.1: calculateFIFOInventoryAndPnL is a pure function that does NOT mutate input trades or opening inventory', async () => {
    const utils = await import('../js/utils.js');

    const originalTrades = [
      { id: 't1', type: 'BUY', date: '2026-08-01T10:00:00Z', rate: 1500, ngnAmount: 150000, usdtAmount: 100, totalFees: 0 },
      { id: 't2', type: 'SELL', date: '2026-08-02T10:00:00Z', rate: 1600, ngnAmount: 160000, usdtAmount: 100, totalFees: 0 }
    ];
    const tradesJsonBefore = JSON.stringify(originalTrades);

    const originalOpening = { startingUsdtBalance: 200, defaultCostBasis: 1450 };
    const openingJsonBefore = JSON.stringify(originalOpening);

    // Execute engine
    const result = utils.calculateFIFOInventoryAndPnL(originalTrades, originalOpening);

    // Verify inputs remain 100% unmodified
    assert.strictEqual(JSON.stringify(originalTrades), tradesJsonBefore, 'Input trades array must not be mutated');
    assert.strictEqual(JSON.stringify(originalOpening), openingJsonBefore, 'Input opening inventory object must not be mutated');
  });

  it('5.2: Consuming 500 small BUY lots in a single large SELL processes cleanly with exact cost conservation', async () => {
    const utils = await import('../js/utils.js');

    const trades = [];
    let totalBuyCost = 0;
    let totalBuyUsdt = 0;

    for (let i = 0; i < 500; i++) {
      const rate = 1500 + (i * 0.1);
      const qty = 2; // 2 USDT per lot -> total 1,000 USDT
      const ngn = rate * qty;
      totalBuyCost += ngn;
      totalBuyUsdt += qty;

      trades.push({
        id: `buy_${i}`,
        type: 'BUY',
        date: new Date(1754000000000 + (i * 60000)).toISOString(),
        rate,
        ngnAmount: ngn,
        usdtAmount: qty,
        totalFees: 0
      });
    }

    // 1 massive SELL consuming all 500 lots @ ₦1600
    const sellRevenue = 1000 * 1600; // 1,600,000 NGN
    trades.push({
      id: 'sell_massive',
      type: 'SELL',
      date: new Date(1754000000000 + (501 * 60000)).toISOString(),
      rate: 1600,
      ngnAmount: sellRevenue,
      usdtAmount: 1000,
      totalFees: 0
    });

    const result = utils.calculateFIFOInventoryAndPnL(trades);

    assert.strictEqual(result.remainingInventoryUSDT, 0, 'Inventory must be completely liquidated');
    assert.strictEqual(result.totalUnmatchedSoldUSDT, 0, 'Zero unmatched lots');
    assert.closeTo(result.totalRealizedCostBasis, totalBuyCost, 0.01, 'Realized cost basis must match sum of all 500 lots');
    assert.closeTo(result.totalRealizedPnL, sellRevenue - totalBuyCost, 0.01, 'Realized profit must strictly equal sellRevenue - totalBuyCost');

    const sellTrade = result.enrichedTrades.find(t => t.id === 'sell_massive');
    assert.strictEqual(sellTrade.matchedLots.length, 500, 'Matched lots array must contain exactly 500 lot slices');
  });
});
