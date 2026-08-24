/**
 * Empirical Verification & Stress Test Harness for Milestone 2 (R2)
 * Challenger 1 — Empirical Verification Suite
 */

import { setupDomEnvironment } from './harness/dom-mock.js';
import * as utils from '../js/utils.js';
import { store } from '../js/store.js';
import { bybitService } from '../js/bybitService.js';
import { renderDashboardView } from '../js/views/dashboard.view.js';
import { renderPricingView } from '../js/views/pricing.view.js';
import { renderSettingsView } from '../js/views/settings.view.js';
import * as dashboardModule from '../js/dashboard.js';
import * as pricingModule from '../js/pricing.js';
import * as settingsModule from '../js/settings.js';
import fs from 'fs';
import path from 'path';

let testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  failures: []
};

function runTest(name, fn) {
  testResults.total++;
  try {
    fn();
    testResults.passed++;
    console.log(`  ✔ [PASS] ${name}`);
  } catch (err) {
    testResults.failed++;
    testResults.failures.push({ name, error: err });
    console.log(`  ✖ [FAIL] ${name}`);
    console.log(`     Error: ${err.message}`);
  }
}

async function runAsyncTest(name, fn) {
  testResults.total++;
  try {
    await fn();
    testResults.passed++;
    console.log(`  ✔ [PASS] ${name}`);
  } catch (err) {
    testResults.failed++;
    testResults.failures.push({ name, error: err });
    console.log(`  ✖ [FAIL] ${name}`);
    console.log(`     Error: ${err.message}`);
  }
}

function assertCloseTo(actual, expected, delta = 0.01, msg = '') {
  if (Math.abs(actual - expected) > delta) {
    throw new Error(`${msg}: expected ${expected} (±${delta}), but got ${actual}`);
  }
}

function assertStrictEqual(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`${msg}: expected ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}`);
  }
}

function assertTrue(condition, msg = '') {
  if (!condition) {
    throw new Error(`${msg}: expected condition to be true`);
  }
}

function resetEnvironment() {
  const dom = setupDomEnvironment();
  dom.document.body.innerHTML = `
    <div id="app-container">
      ${renderDashboardView()}
      ${renderPricingView()}
      ${renderSettingsView()}
    </div>
  `;
  dom.localStorage.clear();
  store.clearAllData();
  return dom;
}

console.log('\n======================================================');
console.log('  Challenger 1: Empirical Adversarial Verification (M2)');
console.log('======================================================\n');

// -------------------------------------------------------------
// SUITE 1: FIFO Engine Mathematical Correctness & Oracles
// -------------------------------------------------------------
console.log('--- SUITE 1: FIFO Mathematical Engine & Boundary Cases ---');

runTest('1.1 Zero trades & zero opening inventory returns clean 0 metrics without NaN', () => {
  const result = utils.calculateFIFOInventoryAndPnL([], { startingUsdtBalance: 0, defaultCostBasis: 0 });
  assertStrictEqual(result.remainingInventoryUSDT, 0, 'remainingInventoryUSDT');
  assertStrictEqual(result.inventoryCostBasisNGN, 0, 'inventoryCostBasisNGN');
  assertStrictEqual(result.avgHoldingCostPerUSDT, 0, 'avgHoldingCostPerUSDT');
  assertStrictEqual(result.totalRealizedPnL, 0, 'totalRealizedPnL');
  assertStrictEqual(result.totalRealizedCostBasis, 0, 'totalRealizedCostBasis');
  assertStrictEqual(result.totalRealizedRevenue, 0, 'totalRealizedRevenue');
  assertStrictEqual(result.overallROI, 0, 'overallROI');
  assertStrictEqual(result.totalUnmatchedSoldUSDT, 0, 'totalUnmatchedSoldUSDT');
  assertTrue(!Number.isNaN(result.avgHoldingCostPerUSDT), 'No NaN in avgHoldingCost');
  assertTrue(!Number.isNaN(result.overallROI), 'No NaN in overallROI');
});

runTest('1.2 Zero trades with positive opening inventory establishes baseline inventory and cost', () => {
  const opening = { startingUsdtBalance: 500, defaultCostBasis: 1520.50 };
  const result = utils.calculateFIFOInventoryAndPnL([], opening);
  assertStrictEqual(result.remainingInventoryUSDT, 500, 'remainingInventoryUSDT');
  assertCloseTo(result.inventoryCostBasisNGN, 500 * 1520.50, 0.01, 'inventoryCostBasisNGN');
  assertCloseTo(result.avgHoldingCostPerUSDT, 1520.50, 0.01, 'avgHoldingCostPerUSDT');
  assertStrictEqual(result.totalRealizedPnL, 0, 'totalRealizedPnL');
});

runTest('1.3 Single BUY trade with fintech transaction fee correctly amortized into cost basis', () => {
  const trades = [
    { id: 'b1', type: 'BUY', date: '2026-08-01T10:00:00Z', rate: 1600, ngnAmount: 480000, usdtAmount: 300, totalFees: 150 }
  ];
  // Net Buy cost = 480,000 + 150 = 480,150 NGN
  // Effective cost per unit = 480,150 / 300 = 1600.50 NGN/USDT
  const result = utils.calculateFIFOInventoryAndPnL(trades);
  assertStrictEqual(result.remainingInventoryUSDT, 300);
  assertCloseTo(result.inventoryCostBasisNGN, 480150, 0.01);
  assertCloseTo(result.avgHoldingCostPerUSDT, 1600.50, 0.01);
  assertStrictEqual(result.totalRealizedPnL, 0);
  assertStrictEqual(result.enrichedTrades[0].realizedPnL, null);
});

runTest('1.4 Single SELL trade with zero prior inventory handled via external unrecorded inventory (0 artificial profit)', () => {
  const trades = [
    { id: 's1', type: 'SELL', date: '2026-08-01T10:00:00Z', rate: 1650, ngnAmount: 330000, usdtAmount: 200, totalFees: 50 }
  ];
  // Net revenue = 330,000 - 50 = 329,950 NGN
  // Rate = 329,950 / 200 = 1649.75 NGN/USDT
  // All 200 USDT is unmatched. Cost basis assigned = 329,950 NGN. Realized PnL = 0.
  const result = utils.calculateFIFOInventoryAndPnL(trades);
  assertStrictEqual(result.remainingInventoryUSDT, 0);
  assertStrictEqual(result.totalUnmatchedSoldUSDT, 200);
  assertCloseTo(result.totalRealizedRevenue, 329950, 0.01);
  assertCloseTo(result.totalRealizedCostBasis, 329950, 0.01);
  assertStrictEqual(result.totalRealizedPnL, 0);
  assertStrictEqual(result.enrichedTrades[0].unmatchedQty, 200);
  assertStrictEqual(result.enrichedTrades[0].matchedLots[0].isUnmatched, true);
});

runTest('1.5 Multi-tier BUYs with weighted average holding cost calculation', () => {
  const trades = [
    { id: 'b1', type: 'BUY', date: '2026-08-01T10:00:00Z', rate: 1500, ngnAmount: 150000, usdtAmount: 100, totalFees: 50 },  // 150,050 NGN (1500.50/u)
    { id: 'b2', type: 'BUY', date: '2026-08-02T10:00:00Z', rate: 1550, ngnAmount: 310000, usdtAmount: 200, totalFees: 100 }, // 310,100 NGN (1550.50/u)
    { id: 'b3', type: 'BUY', date: '2026-08-03T10:00:00Z', rate: 1600, ngnAmount: 480000, usdtAmount: 300, totalFees: 150 }  // 480,150 NGN (1600.50/u)
  ];
  // Total: 600 USDT. Total Cost: 940,300 NGN. Avg Cost: 1567.1667 NGN/USDT
  const result = utils.calculateFIFOInventoryAndPnL(trades);
  assertStrictEqual(result.remainingInventoryUSDT, 600);
  assertCloseTo(result.inventoryCostBasisNGN, 940300, 0.01);
  assertCloseTo(result.avgHoldingCostPerUSDT, 940300 / 600, 0.01);
});

runTest('1.6 Strict FIFO queue consumption across multiple lots with partial sells', () => {
  const trades = [
    { id: 'b1', type: 'BUY', date: '2026-08-01T10:00:00Z', rate: 1500, ngnAmount: 150000, usdtAmount: 100, totalFees: 50 },  // 100 @ 1500.50 = 150,050
    { id: 'b2', type: 'BUY', date: '2026-08-02T10:00:00Z', rate: 1550, ngnAmount: 310000, usdtAmount: 200, totalFees: 100 }, // 200 @ 1550.50 = 310,100
    { id: 'b3', type: 'BUY', date: '2026-08-03T10:00:00Z', rate: 1600, ngnAmount: 480000, usdtAmount: 300, totalFees: 150 }, // 300 @ 1600.50 = 480,150
    { id: 's1', type: 'SELL', date: '2026-08-04T10:00:00Z', rate: 1650, ngnAmount: 247500, usdtAmount: 150, totalFees: 0 }    // sells 150
  ];
  // SELL 150 USDT consumes:
  // - 100 USDT from b1 (cost = 150,050)
  // - 50 USDT from b2 (cost = 50 * 1550.50 = 77,525)
  // Total matched cost = 227,575 NGN. Sell revenue = 247,500 NGN. Realized PnL = 19,925 NGN.
  // Remaining inventory:
  // - 150 USDT from b2 (cost = 150 * 1550.50 = 232,575)
  // - 300 USDT from b3 (cost = 300 * 1600.50 = 480,150)
  // Total remaining = 450 USDT, Total cost = 712,725 NGN, Avg cost = 712,725 / 450 = 1583.8333 NGN/USDT.
  const result = utils.calculateFIFOInventoryAndPnL(trades);
  assertStrictEqual(result.remainingInventoryUSDT, 450);
  assertCloseTo(result.inventoryCostBasisNGN, 712725, 0.01);
  assertCloseTo(result.avgHoldingCostPerUSDT, 712725 / 450, 0.01);
  assertCloseTo(result.totalRealizedPnL, 19925, 0.01);
  assertStrictEqual(result.enrichedTrades[3].matchedLots.length, 2);
  assertStrictEqual(result.enrichedTrades[3].matchedLots[0].lotId, 'b1');
  assertStrictEqual(result.enrichedTrades[3].matchedLots[0].qty, 100);
  assertStrictEqual(result.enrichedTrades[3].matchedLots[1].lotId, 'b2');
  assertStrictEqual(result.enrichedTrades[3].matchedLots[1].qty, 50);
});

runTest('1.7 Opening inventory seamlessly integrates as earliest FIFO lot', () => {
  const opening = { startingUsdtBalance: 200, defaultCostBasis: 1450.00 }; // 290,000 NGN
  const trades = [
    { id: 'b1', type: 'BUY', date: '2026-08-01T10:00:00Z', rate: 1550, ngnAmount: 310000, usdtAmount: 200, totalFees: 0 },
    { id: 's1', type: 'SELL', date: '2026-08-02T10:00:00Z', rate: 1600, ngnAmount: 480000, usdtAmount: 300, totalFees: 0 }
  ];
  // SELL 300 USDT consumes 200 from Opening (@ 1450 = 290,000) + 100 from b1 (@ 1550 = 155,000)
  // Total cost = 445,000 NGN. Revenue = 480,000 NGN. PnL = 35,000 NGN.
  // Remaining in b1: 100 USDT @ 1550 = 155,000 NGN.
  const result = utils.calculateFIFOInventoryAndPnL(trades, opening);
  assertStrictEqual(result.remainingInventoryUSDT, 100);
  assertCloseTo(result.inventoryCostBasisNGN, 155000, 0.01);
  assertCloseTo(result.avgHoldingCostPerUSDT, 1550.00, 0.01);
  assertCloseTo(result.totalRealizedPnL, 35000, 0.01);
  assertStrictEqual(result.enrichedTrades[1].matchedLots[0].lotId, 'OPENING_BALANCE');
  assertStrictEqual(result.enrichedTrades[1].matchedLots[0].qty, 200);
});

runTest('1.8 Out-of-order date timestamps are sorted chronologically before FIFO execution', () => {
  const tradesUnsorted = [
    { id: 's1', type: 'SELL', date: '2026-08-03T10:00:00Z', rate: 1600, ngnAmount: 160000, usdtAmount: 100, totalFees: 0 },
    { id: 'b1', type: 'BUY', date: '2026-08-01T10:00:00Z', rate: 1500, ngnAmount: 150000, usdtAmount: 100, totalFees: 0 },
    { id: 'b2', type: 'BUY', date: '2026-08-02T10:00:00Z', rate: 1550, ngnAmount: 155000, usdtAmount: 100, totalFees: 0 }
  ];
  // Sorted order: b1, b2, s1.
  // s1 consumes b1 (100 @ 1500). PnL = 10,000 NGN.
  // Remaining: b2 (100 @ 1550).
  const result = utils.calculateFIFOInventoryAndPnL(tradesUnsorted);
  assertStrictEqual(result.remainingInventoryUSDT, 100);
  assertCloseTo(result.avgHoldingCostPerUSDT, 1550.00, 0.01);
  assertCloseTo(result.totalRealizedPnL, 10000, 0.01);
});

runTest('1.9 Property-based stress test: 500 random transactions satisfy strict conservation invariants', () => {
  const numTrades = 500;
  const trades = [];
  let baseDate = new Date('2026-01-01T00:00:00Z').getTime();

  let totalBuyUsdt = 0;
  let totalSellUsdt = 0;
  let totalBuyNetNGN = 0;

  for (let i = 0; i < numTrades; i++) {
    const isBuy = Math.random() > 0.4; // 60% buy, 40% sell
    const rate = 1400 + Math.floor(Math.random() * 300);
    const usdt = Math.round((10 + Math.random() * 200) * 100) / 100;
    const grossNGN = rate * usdt;
    const fee = Math.floor(Math.random() * 100);

    if (isBuy) {
      totalBuyUsdt += usdt;
      totalBuyNetNGN += (grossNGN + fee);
      trades.push({
        id: `stress_b_${i}`,
        type: 'BUY',
        date: new Date(baseDate + (i * 60000)).toISOString(),
        rate,
        ngnAmount: grossNGN,
        usdtAmount: usdt,
        totalFees: fee
      });
    } else {
      totalSellUsdt += usdt;
      trades.push({
        id: `stress_s_${i}`,
        type: 'SELL',
        date: new Date(baseDate + (i * 60000)).toISOString(),
        rate,
        ngnAmount: grossNGN,
        usdtAmount: usdt,
        totalFees: fee
      });
    }
  }

  const opening = { startingUsdtBalance: 300, defaultCostBasis: 1450 };
  const openingCost = 300 * 1450;
  const result = utils.calculateFIFOInventoryAndPnL(trades, opening);

  // Invariant 1: Inventory >= 0
  assertTrue(result.remainingInventoryUSDT >= 0, 'Inventory >= 0');
  assertTrue(result.inventoryCostBasisNGN >= 0, 'Cost basis >= 0');

  // Invariant 2: Cost basis ratio
  if (result.remainingInventoryUSDT > 0.0001) {
    assertCloseTo(result.avgHoldingCostPerUSDT, result.inventoryCostBasisNGN / result.remainingInventoryUSDT, 0.01, 'Avg holding cost identity');
  }

  // Invariant 3: PnL + Cost === Revenue
  assertCloseTo(result.totalRealizedCostBasis + result.totalRealizedPnL, result.totalRealizedRevenue, 0.1, 'Realized Revenue = CostBasis + PnL');

  // Invariant 4: Volume conservation: Initial + Buys = Sells + Remaining - Unmatched
  const totalInflowUSDT = 300 + totalBuyUsdt;
  const totalOutflowUSDT = totalSellUsdt + result.remainingInventoryUSDT - result.totalUnmatchedSoldUSDT;
  assertCloseTo(totalInflowUSDT, totalOutflowUSDT, 0.01, 'USDT Volume Conservation');
});

// -------------------------------------------------------------
// SUITE 2: Opening Inventory Protection Against Automated Syncs
// -------------------------------------------------------------
console.log('\n--- SUITE 2: Opening Inventory Protection Against Syncs ---');

await runAsyncTest('2.1 syncAndRenderActiveAd() does not overwrite bybit_p2p_opening_inventory when new ad is detected', async () => {
  const dom = resetEnvironment();
  const initialOpening = { startingUsdtBalance: 777.77, defaultCostBasis: 1533.33 };
  store.setOpeningInventory(initialOpening);

  // Verify initial state
  const rawBefore = dom.localStorage.getItem('bybit_p2p_opening_inventory');
  assertStrictEqual(JSON.parse(rawBefore).startingUsdtBalance, 777.77);

  // Mock Bybit returning a new active ad with completely different quantity and price
  bybitService.fetchActiveAds = async () => [{
    id: 'new_active_ad_9999',
    side: 1,
    status: 10,
    price: '1680.00',
    lastQuantity: '45.00',
    frozenQuantity: '5.00'
  }];

  // Run ad sync
  await dashboardModule.syncAndRenderActiveAd();

  // Verify localStorage remains pristine
  const rawAfter = dom.localStorage.getItem('bybit_p2p_opening_inventory');
  const parsedAfter = JSON.parse(rawAfter);
  assertStrictEqual(parsedAfter.startingUsdtBalance, 777.77, 'startingUsdtBalance must remain 777.77');
  assertStrictEqual(parsedAfter.defaultCostBasis, 1533.33, 'defaultCostBasis must remain 1533.33');
});

await runAsyncTest('2.2 syncSettingsLiveHoldings() does not mutate stored opening inventory', async () => {
  const dom = resetEnvironment();
  const initialOpening = { startingUsdtBalance: 250.0, defaultCostBasis: 1495.0 };
  store.setOpeningInventory(initialOpening);

  // Mock Bybit returning wallet balances
  bybitService.fetchFundingBalance = async () => ({
    balance: [{ coin: 'USDT', transferBalance: '1200.50' }]
  });
  bybitService.fetchActiveAds = async () => [{
    id: 'ad_holdings_test',
    side: 1,
    status: 10,
    price: '1650.00',
    lastQuantity: '300.00',
    frozenQuantity: '0.00'
  }];

  // Initialize settings and trigger balance sync
  settingsModule.initSettings();
  const btnSyncBalance = dom.document.getElementById('btn-sync-balance');
  btnSyncBalance?.dispatchEvent({ type: 'click' });

  // Wait a tick for async handlers
  await new Promise(r => setTimeout(r, 50));

  // Verify holdings cards updated
  const elTotal = dom.document.getElementById('settings-total-usdt');
  const elLocked = dom.document.getElementById('settings-locked-usdt');
  const elFree = dom.document.getElementById('settings-free-usdt');
  assertStrictEqual(elTotal.textContent, '1200.50 USDT');
  assertStrictEqual(elLocked.textContent, '300.00 USDT');
  assertStrictEqual(elFree.textContent, '900.50 USDT');

  // Verify opening inventory was NOT overwritten
  const storedOpening = store.getOpeningInventory();
  assertStrictEqual(storedOpening.startingUsdtBalance, 250.0);
  assertStrictEqual(storedOpening.defaultCostBasis, 1495.0);

  // Verify opening inputs on Data tab were not polluted
  const inputUsdt = dom.document.getElementById('input-opening-usdt');
  const inputCost = dom.document.getElementById('input-opening-cost-basis');
  assertStrictEqual(parseFloat(inputUsdt.value), 250.0);
  assertStrictEqual(parseFloat(inputCost.value), 1495.0);
});

runTest('2.3 Opening inventory is strictly mutated upon explicit user form submission on Data tab', () => {
  const dom = resetEnvironment();
  store.setOpeningInventory({ startingUsdtBalance: 100, defaultCostBasis: 1500 });
  settingsModule.initSettings();

  const inputUsdt = dom.document.getElementById('input-opening-usdt');
  const inputCost = dom.document.getElementById('input-opening-cost-basis');
  const formOpening = dom.document.getElementById('form-opening-inventory');

  inputUsdt.value = '820.45';
  inputCost.value = '1575.80';

  // Before submit, store is unchanged
  assertStrictEqual(store.getOpeningInventory().startingUsdtBalance, 100);

  // Submit form
  formOpening.dispatchEvent({
    type: 'submit',
    preventDefault: () => {}
  });

  // After submit, store reflects new values
  const updated = store.getOpeningInventory();
  assertStrictEqual(updated.startingUsdtBalance, 820.45);
  assertStrictEqual(updated.defaultCostBasis, 1575.80);
});

// -------------------------------------------------------------
// SUITE 3: Tripartite Cost Basis Parity Across Views
// -------------------------------------------------------------
console.log('\n--- SUITE 3: Tripartite Cost Basis Parity (Dashboard, Active Ad, Pricing) ---');

await runAsyncTest('3.1 Dashboard, Active Ad Monitor, and Pricing Assistant display identical FIFO cost basis', async () => {
  const dom = resetEnvironment();

  // Setup trades
  const trades = [
    { id: 't1', type: 'BUY', date: '2026-08-01T10:00:00Z', rate: 1520, ngnAmount: 304000, usdtAmount: 200, totalFees: 100 },
    { id: 't2', type: 'BUY', date: '2026-08-02T10:00:00Z', rate: 1560, ngnAmount: 468000, usdtAmount: 300, totalFees: 150 },
    { id: 't3', type: 'SELL', date: '2026-08-03T10:00:00Z', rate: 1620, ngnAmount: 405000, usdtAmount: 250, totalFees: 0 }
  ];
  trades.forEach(t => store.addTrade(t));

  const opening = { startingUsdtBalance: 100, defaultCostBasis: 1500.00 };
  store.setOpeningInventory(opening);

  // Mock Bybit responses
  const activeAd = {
    id: 'ad_tripartite_test',
    side: 1,
    status: 10,
    price: '1650.00',
    lastQuantity: '150.00',
    frozenQuantity: '0.00'
  };
  bybitService.fetchActiveAds = async () => [activeAd];
  bybitService.fetchFundingBalance = async () => ({ balance: [{ coin: 'USDT', transferBalance: '350' }] });
  bybitService.fetchMarketDepth = async () => ({
    buyDepth: [{ price: '1630.00', lastQuantity: '100' }],
    sellDepth: [{ price: '1660.00', lastQuantity: '100' }]
  });

  // Render modules
  dashboardModule.renderDashboardMetrics();
  await dashboardModule.syncAndRenderActiveAd();
  await pricingModule.refreshPricingData();

  // Calculate ground truth
  const groundTruth = utils.calculateFIFOInventoryAndPnL(trades, opening);
  const expectedAvgCost = groundTruth.avgHoldingCostPerUSDT;
  const expectedInventory = groundTruth.remainingInventoryUSDT;

  // Extract from DOM
  const dashCostText = dom.document.getElementById('stat-inventory-cost')?.textContent || '';
  const dashHoldText = dom.document.getElementById('stat-inventory-holding')?.textContent || '';
  const adAvgBuyText = dom.document.getElementById('metric-ad-avg-buy-cost')?.textContent || '';
  const adHoldText = dom.document.getElementById('metric-ad-total-bought')?.textContent || '';
  const pricingCostText = dom.document.getElementById('pricing-cost-basis')?.textContent || '';

  // Extract numbers
  const parseNum = (str) => parseFloat(str.replace(/[^\d.]/g, '')) || 0;
  const dashAvgCostMatch = dashCostText.match(/Avg:\s*₦?([\d,]+\.?\d*)/);
  const dashAvgCost = dashAvgCostMatch ? parseFloat(dashAvgCostMatch[1].replace(/,/g, '')) : 0;
  const adAvgCost = parseNum(adAvgBuyText);
  const pricingAvgCost = parseNum(pricingCostText);

  // Assert Parity
  assertCloseTo(dashAvgCost, expectedAvgCost, 0.01, 'Dashboard Avg Cost Basis');
  assertCloseTo(adAvgCost, expectedAvgCost, 0.01, 'Active Ad Avg Buy Cost');
  assertCloseTo(pricingAvgCost, expectedAvgCost, 0.01, 'Pricing Assistant Cost Basis');
  assertCloseTo(dashAvgCost, pricingAvgCost, 0.01, 'Dashboard vs Pricing Parity');
  assertCloseTo(adAvgCost, pricingAvgCost, 0.01, 'Active Ad vs Pricing Parity');

  // Assert Holding USDT Parity
  assertCloseTo(parseNum(dashHoldText), expectedInventory, 0.01, 'Dashboard USDT Holding');
  assertCloseTo(parseNum(adHoldText), expectedInventory, 0.01, 'Active Ad USDT in Stock');
});

await runAsyncTest('3.2 Post-ad buybacks correctly update Dashboard, Active Ad, and Pricing cost bases', async () => {
  const dom = resetEnvironment();
  const adTimestamp = 1754000000000;
  const activeAd = {
    id: 'ad_post_buyback',
    side: 1,
    status: 10,
    price: '1680.00',
    lastQuantity: '100.00',
    frozenQuantity: '0.00',
    createDate: adTimestamp
  };
  bybitService.fetchActiveAds = async () => [activeAd];
  bybitService.fetchFundingBalance = async () => ({ balance: [{ coin: 'USDT', transferBalance: '300' }] });
  bybitService.fetchMarketDepth = async () => ({
    buyDepth: [{ price: '1650.00', lastQuantity: '50' }],
    sellDepth: [{ price: '1690.00', lastQuantity: '50' }]
  });

  // Pre-ad buy: 100 USDT @ 1500
  store.addTrade({
    id: 't_pre',
    type: 'BUY',
    date: new Date(adTimestamp - 3600000).toISOString(),
    rate: 1500,
    ngnAmount: 150000,
    usdtAmount: 100,
    totalFees: 0
  });

  // Post-ad buy: 200 USDT @ 1600
  store.addTrade({
    id: 't_post',
    type: 'BUY',
    date: new Date(adTimestamp + 3600000).toISOString(),
    rate: 1600,
    ngnAmount: 320000,
    usdtAmount: 200,
    totalFees: 0
  });

  // Total: 300 USDT, Total Cost: 470,000 NGN. Avg Cost: 1566.6667 NGN/USDT
  dashboardModule.renderDashboardMetrics();
  await dashboardModule.syncAndRenderActiveAd();
  await pricingModule.refreshPricingData();

  const dashCostText = dom.document.getElementById('stat-inventory-cost')?.textContent || '';
  const pricingCostText = dom.document.getElementById('pricing-cost-basis')?.textContent || '';
  const adAvgBuyText = dom.document.getElementById('metric-ad-avg-buy-cost')?.textContent || '';

  const parseNum = (str) => parseFloat(str.replace(/[^\d.]/g, '')) || 0;
  const dashAvgCostMatch = dashCostText.match(/Avg:\s*₦?([\d,]+\.?\d*)/);
  const dashAvgCost = dashAvgCostMatch ? parseFloat(dashAvgCostMatch[1].replace(/,/g, '')) : 0;

  assertCloseTo(dashAvgCost, 1566.67, 0.02, 'Dashboard Avg Cost includes post-ad buybacks');
  assertCloseTo(parseNum(pricingCostText), 1566.67, 0.02, 'Pricing Assistant includes post-ad buybacks');
  assertCloseTo(parseNum(adAvgBuyText), 1566.67, 0.02, 'Active Ad includes post-ad buybacks');
});

// -------------------------------------------------------------
// SUITE 4: Active Sell Ad ₦0 Fee Deduction & Profit Projection
// -------------------------------------------------------------
console.log('\n--- SUITE 4: Active Sell Ad ₦0 Fee Deduction & Projected PnL ---');

await runAsyncTest('4.1 Active Sell Ad computes projected profit with exactly ₦0 fee deduction', async () => {
  const dom = resetEnvironment();

  // Buy 500 USDT @ 1500
  store.addTrade({
    id: 't1',
    type: 'BUY',
    date: '2026-08-01T10:00:00Z',
    rate: 1500,
    ngnAmount: 750000,
    usdtAmount: 500,
    totalFees: 0
  });

  // Active Sell Ad: 250 USDT (200 last + 50 frozen) @ ₦1620
  const activeAd = {
    id: 'ad_fee_zero_test',
    side: 1,
    status: 10,
    price: '1620.00',
    lastQuantity: '200.00',
    frozenQuantity: '50.00'
  };
  bybitService.fetchActiveAds = async () => [activeAd];

  await dashboardModule.syncAndRenderActiveAd();

  // Calculations:
  // avgCost = 1500 NGN
  // spread = 1620 - 1500 = +120.00 NGN/USDT
  // margin = (120 / 1500) * 100 = 8.00%
  // totalInAd = 250 USDT
  // projectedNet = 250 * 120 = ₦30,000.00 (MUST NOT subtract ₦50 stamp duty!)
  const elPrice = dom.document.getElementById('metric-ad-sell-price');
  const elSpread = dom.document.getElementById('metric-ad-spread-usdt');
  const elMargin = dom.document.getElementById('metric-ad-margin-pct');
  const elProjected = dom.document.getElementById('metric-ad-projected-pnl');

  assertStrictEqual(elPrice.textContent, '₦1,620.00');
  assertStrictEqual(elSpread.textContent, '+₦120.00 / USDT');
  assertStrictEqual(elMargin.textContent, '+8.00% margin');
  assertStrictEqual(elProjected.textContent, '+₦30,000.00', 'Projected profit must be ₦30,000.00 with ₦0 fee deduction');
});

await runAsyncTest('4.2 Active Sell Ad with negative spread clamps projected profit to ₦0.00', async () => {
  const dom = resetEnvironment();

  // Buy 500 USDT @ 1650
  store.addTrade({
    id: 't1',
    type: 'BUY',
    date: '2026-08-01T10:00:00Z',
    rate: 1650,
    ngnAmount: 825000,
    usdtAmount: 500,
    totalFees: 0
  });

  // Active Sell Ad @ ₦1580 (negative spread: -₦70.00/USDT)
  const activeAd = {
    id: 'ad_neg_spread',
    side: 1,
    status: 10,
    price: '1580.00',
    lastQuantity: '100.00',
    frozenQuantity: '0.00'
  };
  bybitService.fetchActiveAds = async () => [activeAd];

  await dashboardModule.syncAndRenderActiveAd();

  const elSpread = dom.document.getElementById('metric-ad-spread-usdt');
  const elMargin = dom.document.getElementById('metric-ad-margin-pct');
  const elProjected = dom.document.getElementById('metric-ad-projected-pnl');

  assertStrictEqual(elSpread.textContent, '₦-70.00 / USDT');
  assertStrictEqual(elMargin.textContent, '-4.24% margin');
  assertStrictEqual(elProjected.textContent, '₦0.00', 'Negative spread projected net must clamp to ₦0.00');
});

// -------------------------------------------------------------
// SUMMARY
// -------------------------------------------------------------
console.log('\n======================================================');
console.log(`Empirical Test Results:`);
console.log(`Total: ${testResults.total}, Passed: ${testResults.passed}, Failed: ${testResults.failed}`);
console.log('======================================================\n');

if (testResults.failed > 0) {
  console.error('FAILURES:');
  testResults.failures.forEach(f => {
    console.error(`- ${f.name}: ${f.error.message}`);
  });
  process.exit(1);
} else {
  console.log('ALL EMPIRICAL TESTS PASSED SUCCESSFULLY (100%)');
  process.exit(0);
}
