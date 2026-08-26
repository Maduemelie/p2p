/**
 * Adversarial Reactivity & Live Update Stress Test Suite for Milestone 2 (M2)
 * (M2: Net Worth Widget UI, Store Event Reactivity, Live Bybit Sync & Delta Tracking)
 * Executed by m2_challenger_1 (Milestone 2 Reactivity Challenger)
 */

const { describe, it, beforeEach } = require('./harness/test-runner');
const { assert } = require('./harness/assertions');
const { setupDomEnvironment } = require('./harness/dom-mock');

let utils;
let store;
let dashboardView;
let dashboardModule;
let bybitServiceModule;
let dom;

async function setupTestEnvironment(options = {}) {
  dom = setupDomEnvironment();
  utils = await import('../js/utils.js');
  const storeMod = await import('../js/store.js');
  store = storeMod.store;
  dashboardView = await import('../js/views/dashboard.view.js');
  dashboardModule = await import('../js/dashboard.js');
  bybitServiceModule = await import('../js/bybitService.js');

  store.clearAllData();

  // Reset bybitService mocks to offline default unless customized
  bybitServiceModule.bybitService.fetchFundingBalance = async () => {
    if (options.fundingBalance !== undefined) return options.fundingBalance;
    throw new Error('Offline default');
  };
  bybitServiceModule.bybitService.fetchActiveAds = async () => {
    if (options.activeAds !== undefined) return options.activeAds;
    throw new Error('Offline default');
  };

  // Setup DOM container
  const container = document.getElementById('view-container') || document.body;
  container.innerHTML = dashboardView.renderDashboardView();

  const canvas = document.getElementById('pnlChart');
  if (canvas) {
    canvas.getContext = () => ({
      createLinearGradient: () => ({ addColorStop: () => {} }),
      clearRect: () => {},
      fillRect: () => {}
    });
  }

  return { utils, store, dashboardView, dashboardModule, bybitServiceModule };
}

// =========================================================================
// SECTION 1: Rapid-Fire Event Floods & Interleaved Ledger Mutations
// =========================================================================
describe('Challenger M2 Reactivity — 1. Rapid-Fire Store Updates & Ledger Mutations', () => {
  beforeEach(async () => {
    await setupTestEnvironment();
  });

  it('1.1: 150 interleaved rapid-fire mutations (Transfers, BUYs, SELLs) maintain exact Net Worth sync', async () => {
    const bank1 = store.addBankAccount({ name: 'First Bank', initialBalance: 1000000 });
    const bank2 = store.addBankAccount({ name: 'Zenith Bank', initialBalance: 2000000 });
    store.setOpeningInventory({ startingUsdtBalance: 1000, defaultCostBasis: 1500 });

    // Sync offline to reset live balances
    await dashboardModule.syncBybitLiveInventory();
    await dashboardModule.syncAndRenderActiveAd();

    dashboardModule.initDashboard();

    // Verify initial state: Bank Cash = ₦3,000,000, USDT = 1,000 @ ₦1,500 => NGN = ₦4,500,000.00, USDT = 3,000.00 USDT
    let statNgn = document.getElementById('stat-net-worth-ngn');
    let statUsdt = document.getElementById('stat-net-worth-usdt');
    let metricBank = document.getElementById('metric-nw-bank-cash');
    let metricUsdt = document.getElementById('metric-nw-bybit-usdt');

    assert.strictEqual(statNgn.textContent, '₦4,500,000.00');
    assert.strictEqual(statUsdt.textContent, '3,000.00 USDT');
    assert.strictEqual(metricBank.textContent, '₦3,000,000.00');
    assert.strictEqual(metricUsdt.textContent, '1,000.00 USDT');

    // Execute 150 rapid mutations (50 transfers, 50 buys, 50 sells)
    for (let i = 1; i <= 50; i++) {
      // 1. Bank-to-bank transfer: 10,000 from Bank 2 to Bank 1
      store.addTransfer({ fromBankId: bank2.id, toBankId: bank1.id, amount: 10000, asset: 'NGN', fee: 0 });
      window.dispatchEvent(new CustomEvent('store:updated', { detail: { type: 'transfers' } }));

      // 2. Buy trade (consumes bank cash from Bank 2, adds USDT inventory)
      store.addTrade({
        type: 'BUY',
        usdtAmount: 10,
        cryptoAmount: 10,
        fiatAmount: 15000,
        ngnAmount: 15000,
        netAmount: 15000,
        rate: 1500,
        bankAccountId: bank2.id,
        date: new Date(Date.now() + i * 100).toISOString()
      });
      window.dispatchEvent(new CustomEvent('store:updated', { detail: { type: 'trades' } }));

      // 3. Sell trade (consumes USDT, adds bank cash to Bank 1)
      store.addTrade({
        type: 'SELL',
        usdtAmount: 5,
        cryptoAmount: 5,
        fiatAmount: 8000, // ₦1,600 / USDT rate
        ngnAmount: 8000,
        netAmount: 8000,
        rate: 1600,
        bankAccountId: bank1.id,
        date: new Date(Date.now() + i * 100 + 50).toISOString()
      });
      window.dispatchEvent(new CustomEvent('store:updated', { detail: { type: 'trades' } }));
    }

    // Mathematical verification after 50 cycles:
    // Bank 1: 1,000,000 + (50 * 10,000 transfer IN = 500,000) + (50 * 8,000 SELL = 400,000) = 1,900,000
    // Bank 2: 2,000,000 - (50 * 10,000 transfer OUT = 500,000) - (50 * 15,000 BUY = 750,000) = 750,000
    // Total Bank Cash = 2,650,000.00
    // USDT remaining: 1000 + (50 * 10 BUY = 500) - (50 * 5 SELL = 250) = 1250 USDT
    // Latest trade rate = 1600.00
    // Net Worth NGN = 2,650,000 + (1250 * 1600) = 2,650,000 + 2,000,000 = ₦4,650,000.00
    // Net Worth USDT = 1250 + (2,650,000 / 1600) = 1250 + 1656.25 = 2,906.25 USDT

    statNgn = document.getElementById('stat-net-worth-ngn');
    statUsdt = document.getElementById('stat-net-worth-usdt');
    metricBank = document.getElementById('metric-nw-bank-cash');
    metricUsdt = document.getElementById('metric-nw-bybit-usdt');
    let metricRate = document.getElementById('metric-nw-ref-rate');

    assert.strictEqual(metricBank.textContent, '₦2,650,000.00');
    assert.strictEqual(metricUsdt.textContent, '1,250.00 USDT');
    assert.strictEqual(metricRate.textContent, '₦1,600.00 / USDT');
    assert.strictEqual(statNgn.textContent, '₦4,650,000.00');
    assert.strictEqual(statUsdt.textContent, '2,906.25 USDT');
  });

  it('1.2: Event flooding with heterogeneous detail types updates widget without drop or crash', async () => {
    store.addBankAccount({ name: 'Kuda Bank', initialBalance: 500000 });
    store.setOpeningInventory({ startingUsdtBalance: 200, defaultCostBasis: 1500 });
    await dashboardModule.syncBybitLiveInventory();
    await dashboardModule.syncAndRenderActiveAd();
    dashboardModule.initDashboard();

    const eventTypes = ['trades', 'banks', 'transfers', 'settings', 'snapshots', 'SNAPSHOTS_UPDATED', 'all', undefined, 'custom_unknown'];

    for (const evtType of eventTypes) {
      window.dispatchEvent(new CustomEvent('store:updated', { detail: evtType ? { type: evtType } : undefined }));
    }

    const statNgn = document.getElementById('stat-net-worth-ngn');
    assert.strictEqual(statNgn.textContent, '₦800,000.00');
  });

  it('1.3: Multi-bank circular fund transfers maintain constant Net Worth while updating bank metrics', async () => {
    const b1 = store.addBankAccount({ name: 'Bank 1', initialBalance: 1000000 });
    const b2 = store.addBankAccount({ name: 'Bank 2', initialBalance: 2000000 });
    const b3 = store.addBankAccount({ name: 'Bank 3', initialBalance: 3000000 });
    store.setOpeningInventory({ startingUsdtBalance: 1000, defaultCostBasis: 1500 });

    await dashboardModule.syncBybitLiveInventory();
    await dashboardModule.syncAndRenderActiveAd();
    dashboardModule.initDashboard();

    const initialNgn = document.getElementById('stat-net-worth-ngn').textContent;
    assert.strictEqual(initialNgn, '₦7,500,000.00');

    // Transfer 500,000 from b1 to b2, then 500,000 from b2 to b3, then 500,000 from b3 to b1
    store.addTransfer({ fromBankId: b1.id, toBankId: b2.id, amount: 500000, date: new Date().toISOString() });
    window.dispatchEvent(new CustomEvent('store:updated', { detail: { type: 'transfers' } }));

    store.addTransfer({ fromBankId: b2.id, toBankId: b3.id, amount: 500000, date: new Date().toISOString() });
    window.dispatchEvent(new CustomEvent('store:updated', { detail: { type: 'transfers' } }));

    // Net worth must remain strictly invariant
    const finalNgn = document.getElementById('stat-net-worth-ngn').textContent;
    const finalUsdt = document.getElementById('stat-net-worth-usdt').textContent;
    const bankCash = document.getElementById('metric-nw-bank-cash').textContent;

    assert.strictEqual(finalNgn, '₦7,500,000.00');
    assert.strictEqual(finalUsdt, '5,000.00 USDT');
    assert.strictEqual(bankCash, '₦6,000,000.00');
  });
});

// =========================================================================
// SECTION 2: Bybit Live Balance Sync Transitions & Offline/Online Switching
// =========================================================================
describe('Challenger M2 Reactivity — 2. Bybit Live Sync & Offline Fallbacks', () => {
  beforeEach(async () => {
    await setupTestEnvironment();
  });

  it('2.1: Online Bybit sync with active sell ad reflects live wallet balance & ad price in Net Worth', async () => {
    store.addBankAccount({ name: 'GTB', initialBalance: 1500000 });
    store.setOpeningInventory({ startingUsdtBalance: 500, defaultCostBasis: 1450 }); // FIFO has 500 USDT

    // Mock Bybit Service online responses
    bybitServiceModule.bybitService.fetchFundingBalance = async () => ({
      balance: [{ coin: 'USDT', transferBalance: '3500.00' }]
    });
    bybitServiceModule.bybitService.fetchActiveAds = async () => ([
      { side: 1, status: 10, price: '1580.00', lastQuantity: '1000', frozenQuantity: '200' }
    ]);

    await dashboardModule.syncAndRenderActiveAd();
    await dashboardModule.syncBybitLiveInventory();

    const metricBank = document.getElementById('metric-nw-bank-cash');
    const metricUsdt = document.getElementById('metric-nw-bybit-usdt');
    const metricRate = document.getElementById('metric-nw-ref-rate');
    const statNgn = document.getElementById('stat-net-worth-ngn');
    const statUsdt = document.getElementById('stat-net-worth-usdt');

    // Expected:
    // Bank Cash = ₦1,500,000.00
    // Live Bybit USDT = 3,500.00 USDT (overrides FIFO 500)
    // Rate = ₦1,580.00 / USDT (active sell ad price)
    // Net Worth NGN = 1,500,000 + (3500 * 1580 = 5,530,000) = ₦7,030,000.00
    // Net Worth USDT = 3500 + (1,500,000 / 1580 = 949.367) = 4,449.37 USDT

    assert.strictEqual(metricBank.textContent, '₦1,500,000.00');
    assert.strictEqual(metricUsdt.textContent, '3,500.00 USDT');
    assert.strictEqual(metricRate.textContent, '₦1,580.00 / USDT');
    assert.strictEqual(statNgn.textContent, '₦7,030,000.00');
    assert.strictEqual(statUsdt.textContent, '4,449.37 USDT');
  });

  it('2.2: Bybit API network failure falls back to FIFO remaining inventory & cost basis', async () => {
    store.addBankAccount({ name: 'GTB', initialBalance: 1500000 });
    store.setOpeningInventory({ startingUsdtBalance: 800, defaultCostBasis: 1480 });

    // Step 1: Start online with active ad and balance
    bybitServiceModule.bybitService.fetchFundingBalance = async () => ({
      balance: [{ coin: 'USDT', transferBalance: '3500.00' }]
    });
    bybitServiceModule.bybitService.fetchActiveAds = async () => ([
      { side: 1, status: 10, price: '1580.00', lastQuantity: '1000', frozenQuantity: '0' }
    ]);
    await dashboardModule.syncBybitLiveInventory();
    await dashboardModule.syncAndRenderActiveAd();

    let statNgn = document.getElementById('stat-net-worth-ngn');
    assert.strictEqual(statNgn.textContent, '₦7,030,000.00');

    // Step 2: Bybit crashes / goes offline (returns empty ads and throws balance error)
    bybitServiceModule.bybitService.fetchFundingBalance = async () => {
      throw new Error('Network timeout / offline proxy');
    };
    bybitServiceModule.bybitService.fetchActiveAds = async () => [];

    await dashboardModule.syncBybitLiveInventory();
    await dashboardModule.syncAndRenderActiveAd();

    // Expected Fallback:
    // Bank Cash = ₦1,500,000.00
    // USDT = FIFO 800.00 USDT
    // Rate = FIFO Cost Basis ₦1,480.00 / USDT
    // Net Worth NGN = 1,500,000 + (800 * 1480 = 1,184,000) = ₦2,684,000.00
    // Net Worth USDT = 800 + (1,500,000 / 1480 = 1013.5135) = 1,813.51 USDT

    const metricBank = document.getElementById('metric-nw-bank-cash');
    const metricUsdt = document.getElementById('metric-nw-bybit-usdt');
    const metricRate = document.getElementById('metric-nw-ref-rate');
    statNgn = document.getElementById('stat-net-worth-ngn');
    const statUsdt = document.getElementById('stat-net-worth-usdt');

    assert.strictEqual(metricBank.textContent, '₦1,500,000.00');
    assert.strictEqual(metricUsdt.textContent, '800.00 USDT');
    assert.strictEqual(metricRate.textContent, '₦1,480.00 / USDT');
    assert.strictEqual(statNgn.textContent, '₦2,684,000.00');
    assert.strictEqual(statUsdt.textContent, '1,813.51 USDT');
  });

  it('2.3: Bybit online with 0.00 USDT balance accurately displays 0.00 without falsy fallback to FIFO', async () => {
    store.addBankAccount({ name: 'Access Bank', initialBalance: 2000000 });
    store.setOpeningInventory({ startingUsdtBalance: 1200, defaultCostBasis: 1500 }); // FIFO has 1200 USDT

    // Bybit returns 0.00 USDT balance
    bybitServiceModule.bybitService.fetchFundingBalance = async () => ({
      balance: [{ coin: 'USDT', transferBalance: '0.00' }]
    });
    bybitServiceModule.bybitService.fetchActiveAds = async () => [];

    await dashboardModule.syncBybitLiveInventory();
    await dashboardModule.syncAndRenderActiveAd();

    const metricUsdt = document.getElementById('metric-nw-bybit-usdt');
    const statNgn = document.getElementById('stat-net-worth-ngn');
    const statUsdt = document.getElementById('stat-net-worth-usdt');

    // Expected:
    // USDT should be 0.00 USDT (not 1200)
    // Net Worth NGN = 2,000,000 + (0 * 1500) = ₦2,000,000.00
    // Net Worth USDT = 0 + (2,000,000 / 1500) = 1,333.33 USDT
    assert.strictEqual(metricUsdt.textContent, '0.00 USDT');
    assert.strictEqual(statNgn.textContent, '₦2,000,000.00');
    assert.strictEqual(statUsdt.textContent, '1,333.33 USDT');
  });

  it('2.4: Rapid online/offline toggling preserves clean DOM without NaN or race condition artifacts', async () => {
    store.addBankAccount({ name: 'Providus', initialBalance: 1000000 });
    store.setOpeningInventory({ startingUsdtBalance: 500, defaultCostBasis: 1500 });

    let isOnline = false;
    bybitServiceModule.bybitService.fetchFundingBalance = async () => {
      if (isOnline) return { balance: [{ coin: 'USDT', transferBalance: '2500.00' }] };
      throw new Error('Offline');
    };
    bybitServiceModule.bybitService.fetchActiveAds = async () => {
      if (isOnline) return [{ side: 1, status: 10, price: '1600.00' }];
      return [];
    };

    // Cycle 10 times rapidly
    for (let i = 0; i < 10; i++) {
      isOnline = !isOnline;
      await dashboardModule.syncBybitLiveInventory();
      await dashboardModule.syncAndRenderActiveAd();

      const statNgn = document.getElementById('stat-net-worth-ngn');
      const statUsdt = document.getElementById('stat-net-worth-usdt');

      assert.ok(!statNgn.textContent.includes('NaN'), 'Must not contain NaN');
      assert.ok(!statUsdt.textContent.includes('NaN'), 'Must not contain NaN');
      assert.ok(!statNgn.textContent.includes('undefined'), 'Must not contain undefined');
    }
  });
});

// =========================================================================
// SECTION 3: Extreme Price Swings, Rate Hierarchies & Boundary Rates
// =========================================================================
describe('Challenger M2 Reactivity — 3. Extreme Price Swings & Rate Hierarchy Stress', () => {
  beforeEach(async () => {
    await setupTestEnvironment();
  });

  it('3.1: Extreme Hyperinflation rate (₦10,000,000 / USDT) renders exact valuation without arithmetic overflow', async () => {
    store.addBankAccount({ name: 'Zenith', initialBalance: 5000000 });
    store.setOpeningInventory({ startingUsdtBalance: 1000, defaultCostBasis: 10000000 });

    await dashboardModule.syncBybitLiveInventory();
    await dashboardModule.syncAndRenderActiveAd();
    dashboardModule.renderNetWorthWidget();

    const statNgn = document.getElementById('stat-net-worth-ngn');
    const statUsdt = document.getElementById('stat-net-worth-usdt');
    const metricRate = document.getElementById('metric-nw-ref-rate');

    // 5,000,000 + (1000 * 10,000,000) = 10,005,000,000.00 NGN
    // 1000 + (5,000,000 / 10,000,000) = 1000.50 USDT
    assert.strictEqual(statNgn.textContent, '₦10,005,000,000.00');
    assert.strictEqual(statUsdt.textContent, '1,000.50 USDT');
    assert.strictEqual(metricRate.textContent, '₦10,000,000.00 / USDT');
  });

  it('3.2: Extreme Micro Rate (₦0.01 / USDT) expands USDT equivalent accurately', async () => {
    store.addBankAccount({ name: 'Opay', initialBalance: 1000 });
    store.setOpeningInventory({ startingUsdtBalance: 100, defaultCostBasis: 0.01 });

    await dashboardModule.syncBybitLiveInventory();
    await dashboardModule.syncAndRenderActiveAd();
    dashboardModule.renderNetWorthWidget();

    const statNgn = document.getElementById('stat-net-worth-ngn');
    const statUsdt = document.getElementById('stat-net-worth-usdt');
    const metricRate = document.getElementById('metric-nw-ref-rate');

    // 1000 + (100 * 0.01 = 1) = ₦1,001.00
    // 100 + (1000 / 0.01 = 100,000) = 100,100.00 USDT
    assert.strictEqual(statNgn.textContent, '₦1,001.00');
    assert.strictEqual(statUsdt.textContent, '100,100.00 USDT');
    assert.strictEqual(metricRate.textContent, '₦0.01 / USDT');
  });

  it('3.3: 5-Tier Reference Rate Fallback cascades down systematically', async () => {
    const bank = store.addBankAccount({ name: 'Stanbic', initialBalance: 1000000 });
    store.setOpeningInventory({ startingUsdtBalance: 500, defaultCostBasis: 1450 }); // Tier 4 / 5 default

    // Tier 1: Active Sell Ad online (status 10)
    bybitServiceModule.bybitService.fetchActiveAds = async () => [
      { side: 1, status: 10, price: '1650.00' }
    ];
    await dashboardModule.syncAndRenderActiveAd();
    let metricRate = document.getElementById('metric-nw-ref-rate');
    assert.strictEqual(metricRate.textContent, '₦1,650.00 / USDT');

    // Tier 2: Active Sell Ad (status 20)
    bybitServiceModule.bybitService.fetchActiveAds = async () => [
      { side: 1, status: 20, price: '1640.00' }
    ];
    await dashboardModule.syncAndRenderActiveAd();
    metricRate = document.getElementById('metric-nw-ref-rate');
    assert.strictEqual(metricRate.textContent, '₦1,640.00 / USDT');

    // Tier 3: No active ads -> Latest Trade rate (1625.00)
    bybitServiceModule.bybitService.fetchActiveAds = async () => [];
    store.addTrade({
      type: 'SELL',
      cryptoAmount: 100,
      fiatAmount: 162500,
      rate: 1625.00,
      bankAccountId: bank.id,
      date: new Date().toISOString()
    });
    await dashboardModule.syncAndRenderActiveAd();
    dashboardModule.renderNetWorthWidget();
    metricRate = document.getElementById('metric-nw-ref-rate');
    assert.strictEqual(metricRate.textContent, '₦1,625.00 / USDT');

    // Tier 4: Clear trades -> Opening inventory default basis (1450.00)
    const trades = store.getTrades();
    trades.forEach(t => store.deleteTrade(t.id));
    dashboardModule.renderNetWorthWidget();
    metricRate = document.getElementById('metric-nw-ref-rate');
    assert.strictEqual(metricRate.textContent, '₦1,450.00 / USDT');

    // Tier 5: Clear opening inventory -> System fallback (1500.00)
    store.setOpeningInventory({ startingUsdtBalance: 0, defaultCostBasis: 0 });
    dashboardModule.renderNetWorthWidget();
    metricRate = document.getElementById('metric-nw-ref-rate');
    assert.strictEqual(metricRate.textContent, '₦1,500.00 / USDT');
  });

  it('3.4: Buy Ads (side 0) and Paused Ads (status 30) are correctly ignored as Tier 1 rate sources', async () => {
    store.addBankAccount({ name: 'GTB', initialBalance: 1000000 });
    store.setOpeningInventory({ startingUsdtBalance: 500, defaultCostBasis: 1520 });

    // Buy ad (side 0) @ 1650 and paused sell ad (status 30) @ 1640
    bybitServiceModule.bybitService.fetchActiveAds = async () => [
      { side: 0, status: 10, price: '1650.00' }, // BUY ad, must be ignored
      { side: 1, status: 30, price: '1640.00' }  // Paused SELL ad, must be ignored
    ];

    await dashboardModule.syncAndRenderActiveAd();
    const metricRate = document.getElementById('metric-nw-ref-rate');

    // Should ignore and fallback to opening default basis 1520.00
    assert.strictEqual(metricRate.textContent, '₦1,520.00 / USDT');
  });
});

// =========================================================================
// SECTION 4: Bank Overdrafts, Negative Capital & Zero States
// =========================================================================
describe('Challenger M2 Reactivity — 4. Overdrafts, Negative Capital & Zero States', () => {
  beforeEach(async () => {
    await setupTestEnvironment();
  });

  it('4.1: Complete Zero State (0 Bank Cash, 0 USDT) renders ₦0.00 with .text-success', async () => {
    store.clearAllData();
    await dashboardModule.syncBybitLiveInventory();
    await dashboardModule.syncAndRenderActiveAd();
    dashboardModule.renderNetWorthWidget();

    const statNgn = document.getElementById('stat-net-worth-ngn');
    const statUsdt = document.getElementById('stat-net-worth-usdt');

    assert.strictEqual(statNgn.textContent, '₦0.00');
    assert.strictEqual(statUsdt.textContent, '0.00 USDT');
    assert.ok(statNgn.classList.contains('text-success'), '0 value should have text-success');
  });

  it('4.2: Bank Overdraft (-₦1,000,000) partially offset by USDT holdings calculates exact positive Net Worth', async () => {
    const bank = store.addBankAccount({ name: 'Overdraft Account', initialBalance: -1000000 });
    store.setOpeningInventory({ startingUsdtBalance: 1000, defaultCostBasis: 1500 }); // 1000 @ 1500 = 1,500,000 NGN

    await dashboardModule.syncBybitLiveInventory();
    await dashboardModule.syncAndRenderActiveAd();
    dashboardModule.renderNetWorthWidget();

    const statNgn = document.getElementById('stat-net-worth-ngn');
    const statUsdt = document.getElementById('stat-net-worth-usdt');
    const metricBank = document.getElementById('metric-nw-bank-cash');

    // NGN = -1,000,000 + 1,500,000 = ₦500,000.00
    // USDT = 1000 + (-1,000,000 / 1500) = 1000 - 666.67 = 333.33 USDT
    assert.strictEqual(metricBank.textContent, '-₦1,000,000.00');
    assert.strictEqual(statNgn.textContent, '₦500,000.00');
    assert.strictEqual(statUsdt.textContent, '333.33 USDT');
    assert.ok(statNgn.classList.contains('text-success'));
  });

  it('4.3: Deep Net Insolvent State (-₦5,000,000) renders negative valuation with .text-danger', async () => {
    store.addBankAccount({ name: 'Deficit Bank', initialBalance: -5000000 });
    store.setOpeningInventory({ startingUsdtBalance: 1000, defaultCostBasis: 1500 }); // 1000 @ 1500 = 1,500,000 NGN

    await dashboardModule.syncBybitLiveInventory();
    await dashboardModule.syncAndRenderActiveAd();
    dashboardModule.renderNetWorthWidget();

    const statNgn = document.getElementById('stat-net-worth-ngn');
    const statUsdt = document.getElementById('stat-net-worth-usdt');

    // NGN = -5,000,000 + 1,500,000 = -₦3,500,000.00
    // USDT = 1000 + (-5,000,000 / 1500) = 1000 - 3333.33 = -2,333.33 USDT
    assert.strictEqual(statNgn.textContent, '-₦3,500,000.00');
    assert.strictEqual(statUsdt.textContent, '-2,333.33 USDT');
    assert.ok(statNgn.classList.contains('text-danger'), 'Negative net worth must have text-danger');
  });
});

// =========================================================================
// SECTION 5: Live Delta Badge State Matrix & Precision Boundaries
// =========================================================================
describe('Challenger M2 Reactivity — 5. Live Delta Badge State Matrix & Precision Boundaries', () => {
  beforeEach(async () => {
    await setupTestEnvironment();
  });

  it('5.1: Micro-movement threshold (< ₦0.005) evaluates to flat neutral (₦0.00, minus icon)', async () => {
    store.saveSnapshot({
      bankCash: 1000000,
      usdtBalance: 1000,
      referenceRate: 1500,
      netWorthNgn: 2500000,
      netWorthUsdt: 1666.67
    });

    // Current state has a +₦0.004 difference (within 0.005 epsilon)
    store.addBankAccount({ name: 'Bank', initialBalance: 1000000.004 });
    store.setOpeningInventory({ startingUsdtBalance: 1000, defaultCostBasis: 1500 });

    await dashboardModule.syncBybitLiveInventory();
    await dashboardModule.syncAndRenderActiveAd();
    dashboardModule.renderNetWorthWidget();

    const badge = document.getElementById('badge-net-worth-delta');
    assert.ok(badge.classList.contains('badge-neutral'), 'Sub-cent variation must be neutral');
    assert.ok(badge.innerHTML.includes('data-lucide="minus"'));
    assert.ok(badge.textContent.includes('₦0.00 (0.00%)'));
  });

  it('5.2: Division-by-zero protection on 0-baseline snapshot produces 0.00% without NaN/Infinity', async () => {
    store.saveSnapshot({
      bankCash: 0,
      usdtBalance: 0,
      referenceRate: 1500,
      netWorthNgn: 0,
      netWorthUsdt: 0
    });

    // Current state grew to ₦1,000,000
    store.addBankAccount({ name: 'Bank', initialBalance: 1000000 });
    await dashboardModule.syncBybitLiveInventory();
    await dashboardModule.syncAndRenderActiveAd();
    dashboardModule.renderNetWorthWidget();

    const badge = document.getElementById('badge-net-worth-delta');
    assert.ok(badge.classList.contains('badge-success'));
    assert.ok(badge.textContent.includes('+₦1,000,000.00 (0.00%)'));
  });

  it('5.3: Multiple sequential snapshots always compare against the latest chronological snapshot', async () => {
    const baseTime = Date.now();

    // Snapshot 1 (Yesterday): ₦2,000,000
    store.saveSnapshot({
      id: 'snp_1',
      timestamp: new Date(baseTime - 86400000).toISOString(),
      bankCash: 1000000,
      usdtBalance: 1000,
      referenceRate: 1000,
      netWorthNgn: 2000000,
      netWorthUsdt: 2000
    });

    // Snapshot 2 (Today morning): ₦3,000,000
    store.saveSnapshot({
      id: 'snp_2',
      timestamp: new Date(baseTime - 3600000).toISOString(),
      bankCash: 1500000,
      usdtBalance: 1000,
      referenceRate: 1500,
      netWorthNgn: 3000000,
      netWorthUsdt: 2000
    });

    // Current state: ₦3,300,000 (+₦300,000 vs snp_2, not +₦1,300,000 vs snp_1)
    store.addBankAccount({ name: 'Bank', initialBalance: 1800000 });
    store.setOpeningInventory({ startingUsdtBalance: 1000, defaultCostBasis: 1500 });

    await dashboardModule.syncBybitLiveInventory();
    await dashboardModule.syncAndRenderActiveAd();
    dashboardModule.renderNetWorthWidget();

    const badge = document.getElementById('badge-net-worth-delta');
    assert.ok(badge.textContent.includes('+₦300,000.00 (+10.00%)'), 'Must compare against latest snapshot (snp_2)');
  });
});

// =========================================================================
// SECTION 6: Concurrency, Defensive DOM Resilience & UI Hooks
// =========================================================================
describe('Challenger M2 Reactivity — 6. Concurrency, Defensive DOM Resilience & UI Hooks', () => {
  beforeEach(async () => {
    await setupTestEnvironment();
  });

  it('6.1: Concurrent asynchronous Bybit syncs interleaved with store updates execute safely', async () => {
    store.addBankAccount({ name: 'Sterling', initialBalance: 1000000 });
    store.setOpeningInventory({ startingUsdtBalance: 500, defaultCostBasis: 1500 });

    bybitServiceModule.bybitService.fetchFundingBalance = async () => {
      await new Promise(r => setTimeout(r, 10));
      return { balance: [{ coin: 'USDT', transferBalance: '1500.00' }] };
    };

    bybitServiceModule.bybitService.fetchActiveAds = async () => {
      await new Promise(r => setTimeout(r, 15));
      return [{ side: 1, status: 10, price: '1550.00' }];
    };

    dashboardModule.initDashboard();

    // Fire multiple concurrent promises
    const p1 = dashboardModule.syncBybitLiveInventory();
    const p2 = dashboardModule.syncAndRenderActiveAd();
    window.dispatchEvent(new CustomEvent('store:updated', { detail: { type: 'trades' } }));
    const p3 = dashboardModule.syncBybitLiveInventory();

    await Promise.all([p1, p2, p3]);

    const statNgn = document.getElementById('stat-net-worth-ngn');
    const statUsdt = document.getElementById('stat-net-worth-usdt');

    // Final state: 1,000,000 + (1500 * 1550 = 2,325,000) = ₦3,325,000.00
    assert.strictEqual(statNgn.textContent, '₦3,325,000.00');
    assert.strictEqual(statUsdt.textContent, '2,145.16 USDT');
  });

  it('6.2: renderNetWorthWidget() handles empty/unmounted DOM gracefully without throwing', async () => {
    const container = document.getElementById('view-container') || document.body;
    container.innerHTML = '<div>Other view without net worth widget</div>';

    // Must execute cleanly without error
    let threw = false;
    try {
      dashboardModule.renderNetWorthWidget();
    } catch (e) {
      threw = true;
    }

    assert.strictEqual(threw, false, 'Should exit cleanly when widget elements are absent');
  });

  it('6.3: "End Day / Save Snapshot" button handler supports both window.openSaveSnapshotModal and custom event', async () => {
    let windowFuncCalled = false;
    let customEventFired = false;

    // Test window handler hook
    window.openSaveSnapshotModal = () => {
      windowFuncCalled = true;
    };
    window.addEventListener('modal:open-snapshot', () => {
      customEventFired = true;
    });

    dashboardModule.initDashboard();

    const btn = document.getElementById('btn-open-snapshot-modal');
    btn.click();
    assert.strictEqual(windowFuncCalled, true, 'Should invoke window.openSaveSnapshotModal if available');

    // Test custom event fallback when window handler is not defined
    delete window.openSaveSnapshotModal;
    btn.click();
    assert.strictEqual(customEventFired, true, 'Should dispatch modal:open-snapshot custom event if window function absent');
  });
}, { tier: 5, category: 'Milestone 2 Reactivity & Live Updates' });
