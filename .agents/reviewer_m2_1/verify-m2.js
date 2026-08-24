const { setupDomEnvironment, MockElement } = require('../../test/harness/dom-mock');

async function main() {
  const dom = setupDomEnvironment();
  const utils = await import('../../js/utils.js');
  const { store } = await import('../../js/store.js');
  const { bybitService } = await import('../../js/bybitService.js');

  // Explicitly create mock DOM elements needed across dashboard, pricing, and settings
  const els = [
    'stat-net-pnl', 'stat-pnl-rate', 'stat-inventory-holding', 'stat-inventory-cost',
    'stat-total-bank-cash', 'stat-bank-cash-subtext',
    'active-ad-badge', 'active-ad-title', 'metric-ad-sell-price', 'metric-ad-qty-stock',
    'metric-ad-avg-buy-cost', 'metric-ad-total-bought', 'metric-ad-spread-usdt',
    'metric-ad-margin-pct', 'metric-ad-projected-pnl',
    'stat-bybit-live-total', 'stat-bybit-free', 'stat-bybit-locked', 'stat-inventory-diff',
    'bar-segment-active', 'bar-segment-free',
    'input-target-spread', 'input-avg-volume', 'input-inflow-fee', 'input-outflow-fee',
    'input-pricing-mode', 'input-depth-limit', 'input-filter-limits',
    'pricing-exit-price', 'pricing-max-buy', 'pricing-top-buy-competitor',
    'pricing-suggested-buy', 'pricing-buy-status',
    'pricing-cost-basis', 'pricing-break-even', 'pricing-target-sell-price',
    'pricing-top-sell-competitor', 'pricing-suggested-sell', 'pricing-sell-status',
    'input-opening-usdt', 'input-opening-cost-basis', 'form-opening-inventory',
    'settings-free-usdt', 'settings-locked-usdt', 'settings-total-usdt',
    'proxy-status-badge', 'proxy-status-text', 'btn-sync-balance', 'btn-import-bybit-trades'
  ];

  els.forEach(id => {
    const el = new MockElement('div', id);
    dom.document.body.appendChild(el);
  });

  const dashboard = await import('../../js/dashboard.js');
  const pricing = await import('../../js/pricing.js');
  const settings = await import('../../js/settings.js');

  console.log('========================================================');
  console.log('  Milestone 2 Reviewer Independent Verification Suite   ');
  console.log('========================================================\n');

  // ----------------------------------------------------
  // TEST 1: Tripartite FIFO Cost Basis Consistency
  // ----------------------------------------------------
  console.log('--- TEST 1: Tripartite FIFO Cost Basis Consistency ---');
  store.clearAllData();
  store.setOpeningInventory({ startingUsdtBalance: 100, defaultCostBasis: 1500 });
  store.addTrade({ id: 't1', type: 'BUY', date: '2026-08-01T10:00:00Z', rate: 1600, ngnAmount: 320000, usdtAmount: 200, totalFees: 100 });
  store.addTrade({ id: 't2', type: 'SELL', date: '2026-08-02T10:00:00Z', rate: 1700, ngnAmount: 255000, usdtAmount: 150, totalFees: 0 });

  const adCreationTime = new Date('2026-08-03T10:00:00Z').getTime();
  bybitService.fetchActiveAds = async () => [{
    id: 'ad_999', side: 1, status: 10, price: '1720.00', lastQuantity: '100', frozenQuantity: '50', createDate: adCreationTime
  }];
  bybitService.fetchMarketDepth = async () => ({
    buyDepth: [{ price: '1680.00', lastQuantity: '100' }],
    sellDepth: [{ price: '1720.00', lastQuantity: '100' }]
  });

  dashboard.renderDashboardMetrics();
  await dashboard.syncAndRenderActiveAd();
  pricing.initPricing();
  await pricing.refreshPricingData();

  const statCostText = dom.document.getElementById('stat-inventory-cost').textContent;
  const statHoldingText = dom.document.getElementById('stat-inventory-holding').textContent;
  const adAvgBuyText = dom.document.getElementById('metric-ad-avg-buy-cost').textContent;
  const adTotalBoughtText = dom.document.getElementById('metric-ad-total-bought').textContent;
  const pricingCostText = dom.document.getElementById('pricing-cost-basis').textContent;

  console.log('Dashboard Inventory Cost card :', statCostText);
  console.log('Dashboard Inventory Holding   :', statHoldingText);
  console.log('Active Ad Avg Buy Cost        :', adAvgBuyText);
  console.log('Active Ad Total In Stock      :', adTotalBoughtText);
  console.log('Pricing Assistant Cost Basis  :', pricingCostText);

  const fifo = utils.calculateFIFOInventoryAndPnL(store.getTrades(), store.getOpeningInventory());
  console.log('Authoritative FIFO avg cost   : ₦' + fifo.avgHoldingCostPerUSDT.toFixed(2));
  console.log('Authoritative FIFO remaining  :', fifo.remainingInventoryUSDT + ' USDT');

  if (adAvgBuyText.includes('1,600.50') && pricingCostText.includes('1,600.50') && statCostText.includes('1600.50')) {
    console.log('✅ PASS: Tripartite Cost Basis Parity Verified (All show ₦1,600.50)!');
  } else {
    throw new Error('FAIL: Cost basis mismatch');
  }

  // ----------------------------------------------------
  // TEST 2: Active Sell Ad ₦0 Fee Verification
  // ----------------------------------------------------
  console.log('\n--- TEST 2: Active Sell Ad ₦0 Fee Verification ---');
  // Ad listed 150 USDT @ 1720. Avg buy is 1600.50. Spread = 119.50. Total in ad = 150. Gross = 17,925. Net = 17,925 (NOT 17,875).
  const adProjectedPnl = dom.document.getElementById('metric-ad-projected-pnl').textContent;
  console.log('Active Ad Projected PnL:', adProjectedPnl);
  if (adProjectedPnl === '+₦17,925.00') {
    console.log('✅ PASS: Projected profit uses ₦0 fee deduction (+₦17,925.00 exact)!');
  } else {
    throw new Error('FAIL: Projected profit fee error');
  }

  // ----------------------------------------------------
  // TEST 3: Post-Ad Buybacks Equality
  // ----------------------------------------------------
  console.log('\n--- TEST 3: Post-Ad Buybacks FIFO Parity ---');
  // Add BUY trade created AFTER active ad createDate (2026-08-04)
  store.addTrade({
    id: 't3_post_ad',
    type: 'BUY',
    date: '2026-08-04T10:00:00Z',
    rate: 1650,
    ngnAmount: 165000,
    usdtAmount: 100,
    totalFees: 0
  });

  dashboard.renderDashboardMetrics();
  await dashboard.syncAndRenderActiveAd();
  await pricing.refreshPricingData();

  const postStatCostText = dom.document.getElementById('stat-inventory-cost').textContent;
  const postAdAvgBuyText = dom.document.getElementById('metric-ad-avg-buy-cost').textContent;
  const postPricingCostText = dom.document.getElementById('pricing-cost-basis').textContent;

  // New FIFO:
  // Remaining: 150 USDT @ 1600.50 (240,075 NGN) + 100 USDT @ 1650 (165,000 NGN) = 250 USDT, 405,075 NGN -> Avg: 1620.30 NGN/USDT
  console.log('Post-Buyback Dashboard Cost   :', postStatCostText);
  console.log('Post-Buyback Active Ad Avg    :', postAdAvgBuyText);
  console.log('Post-Buyback Pricing Cost     :', postPricingCostText);

  if (postStatCostText.includes('1620.30') && postAdAvgBuyText.includes('1,620.30') && postPricingCostText.includes('1,620.30')) {
    console.log('✅ PASS: Post-ad buybacks do not diverge or override FIFO calculations across all 3 views!');
  } else {
    throw new Error('FAIL: Post-ad buyback divergence detected');
  }

  // ----------------------------------------------------
  // TEST 4: Opening Inventory Protection
  // ----------------------------------------------------
  console.log('\n--- TEST 4: Opening Inventory Protection ---');
  const storedBefore = dom.localStorage.getItem('bybit_p2p_opening_inventory');
  console.log('Stored Opening Inventory before automated syncs:', storedBefore);

  for (let i = 0; i < 50; i++) {
    bybitService.fetchActiveAds = async () => [{ id: 'ad_' + i, side: 1, status: 10, price: '1800', lastQuantity: '999', frozenQuantity: '1' }];
    bybitService.fetchFundingBalance = async () => ({ balance: [{ coin: 'USDT', transferBalance: '5000' }] });
    await dashboard.syncAndRenderActiveAd();
    await dashboard.syncBybitLiveInventory();
  }

  settings.initSettings();
  const btnSyncBalance = dom.document.getElementById('btn-sync-balance');
  if (btnSyncBalance) {
    btnSyncBalance.dispatchEvent({ type: 'click' });
  }

  const storedAfter = dom.localStorage.getItem('bybit_p2p_opening_inventory');
  console.log('Stored Opening Inventory after 50 active ad queries + balance sync:', storedAfter);
  if (storedBefore === storedAfter) {
    console.log('✅ PASS: Opening inventory completely untouched in localStorage!');
  } else {
    throw new Error('FAIL: Opening inventory was mutated unexpectedly');
  }

  // ----------------------------------------------------
  // TEST 5: Form Submission Updates Opening Inventory
  // ----------------------------------------------------
  console.log('\n--- TEST 5: Explicit Form Submission Updates Opening Inventory ---');
  const formOpening = dom.document.getElementById('form-opening-inventory');
  const inputUsdt = dom.document.getElementById('input-opening-usdt');
  const inputCost = dom.document.getElementById('input-opening-cost-basis');

  inputUsdt.value = '777.77';
  inputCost.value = '1555.55';
  formOpening.dispatchEvent({ type: 'submit', preventDefault: () => {} });

  const storedFormSubmit = dom.localStorage.getItem('bybit_p2p_opening_inventory');
  const parsedFormSubmit = JSON.parse(storedFormSubmit);
  if (parsedFormSubmit.startingUsdtBalance === 777.77 && parsedFormSubmit.defaultCostBasis === 1555.55) {
    console.log('✅ PASS: Explicit submission on Data tab correctly updates localStorage (777.77 USDT @ ₦1,555.55)!');
  } else {
    throw new Error('FAIL: Form submit failed to update opening inventory');
  }

  console.log('\n========================================================');
  console.log('  ALL 5 INDEPENDENT REVIEWER TESTS PASSED SUCCESSFULLY! ');
  console.log('========================================================\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
