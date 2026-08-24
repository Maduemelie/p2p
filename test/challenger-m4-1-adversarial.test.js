/**
 * Challenger 1 Adversarial Stress Test Suite — Milestone 4 (R4)
 * 
 * Dimensions:
 * 1. Trade History Search Adversarial Stress (16-19 digit refIds, whitespace, case, regex chars, UUIDs, fuzzing, XSS)
 * 2. Pricing Assistant Order Book Row Click & Prefill Stress (Bid/Ask taker inversion, float precision, zero/huge bounds, toast, math sync)
 * 3. Cancel / Back Button Multi-Path Navigation Stress (Deep stacks, edit mode reset, form state clearing, transition sequences)
 */

const { describe, it, beforeEach } = require('./harness/test-runner');
const { assert } = require('./harness/assertions');
const { setupDomEnvironment } = require('./harness/dom-mock');
const fs = require('fs');
const path = require('path');

describe('Challenger 1 — M4 Adversarial Search, Prefill & Navigation Suite', () => {
  let dom;

  beforeEach(() => {
    dom = setupDomEnvironment();
  });

  // =========================================================================
  // TASK 1: ADVERSARIAL TRADE HISTORY SEARCH STRESS
  // =========================================================================

  it('M4-CH1.1: RefId search handles 16, 17, 18, and 19 digit Bybit Order IDs with exact and partial matching', async () => {
    const { renderHistoryView } = await import('../js/views/history.view.js');
    dom.document.root.innerHTML = `<div id="main-content">${renderHistoryView()}</div>`;

    const { store } = await import('../js/store.js');
    store.clearAllData();
    const bank = store.addBankAccount({ name: 'Kuda Bank', last4: '5566', initialBalance: 10000000 });

    const refIds = [
      '1600000000000001',       // 16 digits distinct
      '17000000000000002',      // 17 digits distinct
      '180000000000000003',     // 18 digits distinct
      '1900000000000000004',    // 19 digits distinct
      '9999999999999999999',    // 19 digits max
      '1000000000000000'        // 16 digits min
    ];

    const sharedPrefixTrades = [
      '88887777666655551',
      '88887777666655552',
      '88887777666655553'
    ];

    const allTrades = [...refIds, ...sharedPrefixTrades];

    allTrades.forEach((refId, i) => {
      store.addTrade({
        type: i % 2 === 0 ? 'BUY' : 'SELL',
        refId: refId,
        counterparty: `Trader_${refId.slice(-4)}`,
        rate: 1600 + i,
        usdtAmount: 100,
        ngnAmount: (1600 + i) * 100,
        bankAccountId: bank.id,
        date: new Date(Date.now() - i * 10000).toISOString()
      });
    });

    const { initHistory } = await import('../js/history.js');
    initHistory();

    const searchInput = dom.document.getElementById('history-search');
    const countEl = dom.document.getElementById('history-trade-count');
    const container = dom.document.getElementById('trades-history-container');

    // 1. Test exact matching for each distinct length
    for (const refId of refIds) {
      searchInput.value = refId;
      searchInput.dispatchEvent({ type: 'input', target: searchInput, closest: (s) => searchInput.closest(s) });
      assert.ok(countEl.textContent.includes('1 match'), `Expected exactly 1 match for ${refId.length}-digit refId ${refId}, got ${countEl.textContent}`);
      assert.ok(container.innerHTML.includes(refId), `Rendered card must display Bybit Order ID ${refId}`);
    }

    // 2. Test prefix matching for shared prefix '8888777766665555'
    searchInput.value = '8888777766665555';
    searchInput.dispatchEvent({ type: 'input', target: searchInput, closest: (s) => searchInput.closest(s) });
    assert.ok(countEl.textContent.includes('3 matches'), `Expected 3 matches for shared prefix, got ${countEl.textContent}`);

    // 3. Test suffix matching
    searchInput.value = '00000003';
    searchInput.dispatchEvent({ type: 'input', target: searchInput, closest: (s) => searchInput.closest(s) });
    assert.ok(countEl.textContent.includes('1 match'), `Expected 1 match for unique suffix, got ${countEl.textContent}`);
  });

  it('M4-CH1.2: RefId search normalizes leading/trailing whitespace, tabs, and newlines', async () => {
    const { renderHistoryView } = await import('../js/views/history.view.js');
    dom.document.root.innerHTML = `<div id="main-content">${renderHistoryView()}</div>`;

    const { store } = await import('../js/store.js');
    store.clearAllData();
    const bank = store.addBankAccount({ name: 'Zenith Bank', last4: '1122', initialBalance: 5000000 });

    store.addTrade({
      type: 'BUY',
      refId: '1982736450192837',
      counterparty: 'WhitespaceTester',
      rate: 1610,
      usdtAmount: 50,
      ngnAmount: 80500,
      bankAccountId: bank.id,
      date: new Date().toISOString()
    });

    const { initHistory } = await import('../js/history.js');
    initHistory();

    const searchInput = dom.document.getElementById('history-search');
    const countEl = dom.document.getElementById('history-trade-count');

    const testQueries = [
      '  1982736450192837  ',
      '\t1982736450192837\t',
      ' \n 1982736450192837 \n ',
      '   1982736450192837',
      '1982736450192837   '
    ];

    for (const q of testQueries) {
      searchInput.value = q;
      searchInput.dispatchEvent({ type: 'input', target: searchInput, closest: (s) => searchInput.closest(s) });
      assert.ok(countEl.textContent.includes('1 match'), `Query with whitespace [${JSON.stringify(q)}] must match trimmed trade`);
    }
  });

  it('M4-CH1.3: Search handles mixed uppercase/lowercase and case-insensitive alphanumeric Order IDs', async () => {
    const { renderHistoryView } = await import('../js/views/history.view.js');
    dom.document.root.innerHTML = `<div id="main-content">${renderHistoryView()}</div>`;

    const { store } = await import('../js/store.js');
    store.clearAllData();
    const bank = store.addBankAccount({ name: 'Opay', last4: '8877', initialBalance: 2000000 });

    store.addTrade({
      type: 'SELL',
      refId: 'BYBIT-ORDER-2026-XyZ',
      counterparty: 'ApexMerchant',
      rate: 1620,
      usdtAmount: 120,
      ngnAmount: 194400,
      bankAccountId: bank.id,
      date: new Date().toISOString()
    });

    const { initHistory } = await import('../js/history.js');
    initHistory();

    const searchInput = dom.document.getElementById('history-search');
    const countEl = dom.document.getElementById('history-trade-count');

    const casingQueries = [
      'bybit-order-2026-xyz',
      'BYBIT-ORDER-2026-XYZ',
      'ByBit-Order-2026-XyZ',
      'xyz',
      'XYZ',
      'APEXMERCHANT',
      'apexmerchant'
    ];

    for (const q of casingQueries) {
      searchInput.value = q;
      searchInput.dispatchEvent({ type: 'input', target: searchInput, closest: (s) => searchInput.closest(s) });
      assert.ok(countEl.textContent.includes('1 match'), `Case-insensitive search [${q}] must match trade`);
    }
  });

  it('M4-CH1.4: Search executes literal matching with regex special characters without regex crash', async () => {
    const { renderHistoryView } = await import('../js/views/history.view.js');
    dom.document.root.innerHTML = `<div id="main-content">${renderHistoryView()}</div>`;

    const { store } = await import('../js/store.js');
    store.clearAllData();
    const bank = store.addBankAccount({ name: 'Palmpay', last4: '4433', initialBalance: 1000000 });

    store.addTrade({
      type: 'BUY',
      refId: 'ORD[2026]*VIP+TEST(v1)?$100^#1',
      counterparty: 'RegexNinja (Pro)+[VIP]',
      rate: 1615,
      usdtAmount: 80,
      ngnAmount: 129200,
      bankAccountId: bank.id,
      notes: 'Contains regex chars: .* \\d+ (a|b) [A-Z] $ ^ + ?',
      date: new Date().toISOString()
    });

    const { initHistory } = await import('../js/history.js');
    initHistory();

    const searchInput = dom.document.getElementById('history-search');
    const countEl = dom.document.getElementById('history-trade-count');

    const specialCharQueries = [
      'ORD[2026]*VIP',
      'TEST(v1)?',
      '$100^#1',
      '[VIP]',
      '(Pro)+',
      '.*',
      '\\d+',
      '(a|b)',
      '[A-Z]',
      '+',
      '?',
      '^',
      '$',
      '*',
      '(',
      ')',
      '[',
      ']'
    ];

    for (const q of specialCharQueries) {
      searchInput.value = q;
      assert.doesNotThrow(() => {
        searchInput.dispatchEvent({ type: 'input', target: searchInput, closest: (s) => searchInput.closest(s) });
      }, `Search query "${q}" must not throw regex error`);
      assert.ok(countEl.textContent.includes('1 match'), `Query "${q}" should match trade containing "${q}"`);
    }
  });

  it('M4-CH1.5: Search indexes and matches internal UUIDs and trade.id', async () => {
    const { renderHistoryView } = await import('../js/views/history.view.js');
    dom.document.root.innerHTML = `<div id="main-content">${renderHistoryView()}</div>`;

    const { store } = await import('../js/store.js');
    store.clearAllData();
    const bank = store.addBankAccount({ name: 'GTBank', last4: '3322', initialBalance: 2000000 });

    const tradeId = 'c497a348-7e6c-48b2-a1fe-0a851f161495';
    store.addTrade({
      id: tradeId,
      type: 'SELL',
      counterparty: 'UuidTrader',
      rate: 1625,
      usdtAmount: 250,
      ngnAmount: 406250,
      bankAccountId: bank.id,
      date: new Date().toISOString()
    });

    const { initHistory } = await import('../js/history.js');
    initHistory();

    const searchInput = dom.document.getElementById('history-search');
    const countEl = dom.document.getElementById('history-trade-count');

    // 1. Search full UUID
    searchInput.value = tradeId;
    searchInput.dispatchEvent({ type: 'input', target: searchInput, closest: (s) => searchInput.closest(s) });
    assert.ok(countEl.textContent.includes('1 match'), 'Search should find trade by full internal UUID');

    // 2. Search partial UUID
    searchInput.value = 'c497a348';
    searchInput.dispatchEvent({ type: 'input', target: searchInput, closest: (s) => searchInput.closest(s) });
    assert.ok(countEl.textContent.includes('1 match'), 'Search should find trade by partial internal UUID prefix');
  });

  it('M4-CH1.6: Fuzz testing search against 300 synthetic trades across multiple fields and filters', async () => {
    const { renderHistoryView } = await import('../js/views/history.view.js');
    dom.document.root.innerHTML = `<div id="main-content">${renderHistoryView()}</div>`;

    const { store } = await import('../js/store.js');
    store.clearAllData();
    const bank1 = store.addBankAccount({ name: 'Access Bank', last4: '1001', initialBalance: 50000000 });
    const bank2 = store.addBankAccount({ name: 'Providus Bank', last4: '2002', initialBalance: 50000000 });

    for (let i = 0; i < 300; i++) {
      const trade = {
        type: i % 3 === 0 ? 'BUY' : 'SELL',
        refId: `18${String(i).padStart(6, '0')}${Math.floor(Math.random() * 100000000)}`,
        counterparty: `Merchant_Alpha_${i % 25}`,
        rate: 1550 + (i % 100),
        usdtAmount: 50 + (i * 2),
        ngnAmount: (1550 + (i % 100)) * (50 + (i * 2)),
        bankAccountId: i % 2 === 0 ? bank1.id : bank2.id,
        notes: `Arbitrage batch ${i} with code [SYNTH-${i % 10}]`,
        date: new Date(Date.now() - i * 60000).toISOString()
      };
      store.addTrade(trade);
    }

    const { initHistory } = await import('../js/history.js');
    initHistory();

    const searchInput = dom.document.getElementById('history-search');
    const countEl = dom.document.getElementById('history-trade-count');

    // Test specific sub-queries
    searchInput.value = 'SYNTH-5';
    searchInput.dispatchEvent({ type: 'input', target: searchInput, closest: (s) => searchInput.closest(s) });
    assert.ok(countEl.textContent.includes('30 matches'), `Expected 30 matches for SYNTH-5, got ${countEl.textContent}`);

    // Test counterparty group query
    searchInput.value = 'Merchant_Alpha_7';
    searchInput.dispatchEvent({ type: 'input', target: searchInput, closest: (s) => searchInput.closest(s) });
    assert.ok(countEl.textContent.includes('12 matches'), `Expected 12 matches for Merchant_Alpha_7, got ${countEl.textContent}`);
  });

  // =========================================================================
  // TASK 2: PRICING ASSISTANT ORDER BOOK ROW CLICK & PREFILL STRESS
  // =========================================================================

  it('M4-CH1.7: Order book row prefill correctly inverts direction for Buy Depth (SELL) and Sell Depth (BUY)', async () => {
    const { renderPricingView } = await import('../js/views/pricing.view.js');
    const { renderAddTradeView } = await import('../js/views/addTrade.view.js');

    dom.document.root.innerHTML = `
      <div id="main-content">
        ${renderPricingView()}
        ${renderAddTradeView()}
      </div>
    `;

    const { initTrades } = await import('../js/trades.js');
    initTrades();

    let capturedPrefill = null;
    let switchedView = null;
    dom.window.prefillTradeForm = (opts) => {
      capturedPrefill = opts;
      switchedView = 'add-trade';
    };

    const { bybitService } = await import('../js/bybitService.js');
    bybitService.fetchMarketDepth = async () => ({
      buyDepth: [
        { price: '1605.50', lastQuantity: '2500.00', minAmount: '100000', maxAmount: '4000000', nickName: 'HighBidBuyer' }
      ],
      sellDepth: [
        { price: '1612.75', lastQuantity: '1800.00', minAmount: '50000', maxAmount: '2500000', nickName: 'LowAskSeller' }
      ]
    });

    const { refreshPricingData } = await import('../js/pricing.js');
    await refreshPricingData();

    // 1. Test clicking Buy ad (Advertiser buys USDT) -> Taker sells USDT -> Direction must be SELL
    const buyRow = dom.document.querySelector('#pricing-buy-orderbook .orderbook-row');
    buyRow.click();
    assert.strictEqual(switchedView, 'add-trade');
    assert.strictEqual(capturedPrefill.direction, 'SELL', 'Taker interacting with Buy ad must SELL');
    assert.strictEqual(capturedPrefill.rate, 1605.50);
    assert.strictEqual(capturedPrefill.usdtAmount, 2500.00);
    assert.strictEqual(capturedPrefill.counterparty, 'HighBidBuyer');

    // 2. Test clicking Sell ad (Advertiser sells USDT) -> Taker buys USDT -> Direction must be BUY
    const sellRow = dom.document.querySelector('#pricing-sell-orderbook .orderbook-row');
    sellRow.click();
    assert.strictEqual(capturedPrefill.direction, 'BUY', 'Taker interacting with Sell ad must BUY');
    assert.strictEqual(capturedPrefill.rate, 1612.75);
    assert.strictEqual(capturedPrefill.usdtAmount, 1800.00);
    assert.strictEqual(capturedPrefill.counterparty, 'LowAskSeller');
  });

  it('M4-CH1.8: Order book prefill handles extreme rate & volume values (micro amounts, high decimals, huge values)', async () => {
    const { renderAddTradeView } = await import('../js/views/addTrade.view.js');
    dom.document.root.innerHTML = `<div id="main-content">${renderAddTradeView()}</div>`;

    const { initTrades, prefillTradeForm } = await import('../js/trades.js');
    initTrades();

    const rateInput = dom.document.getElementById('trade-rate');
    const usdtInput = dom.document.getElementById('trade-usdt');
    const ngnInput = dom.document.getElementById('trade-ngn');
    const summaryGross = dom.document.getElementById('summary-gross-ngn');

    // Test Case A: High precision float rate and volume
    prefillTradeForm({
      direction: 'BUY',
      rate: 1615.1234,
      usdtAmount: 345.6789,
      counterparty: 'PrecisionTrader'
    });

    assert.strictEqual(parseFloat(rateInput.value), 1615.1234);
    assert.strictEqual(parseFloat(usdtInput.value), 345.6789);
    const expectedNgnA = (1615.1234 * 345.6789).toFixed(2);
    assert.strictEqual(parseFloat(ngnInput.value), parseFloat(expectedNgnA));
    assert.ok(summaryGross.textContent.includes('558,314.15') || summaryGross.textContent.includes('₦'), 'Gross summary formatted');

    // Test Case B: Huge institutional volume (₦160,000,000 NGN)
    prefillTradeForm({
      direction: 'SELL',
      rate: 1600.00,
      usdtAmount: 100000.00,
      counterparty: 'InstitutionalDesk'
    });

    assert.strictEqual(parseFloat(rateInput.value), 1600.00);
    assert.strictEqual(parseFloat(usdtInput.value), 100000.00);
    assert.strictEqual(parseFloat(ngnInput.value), 160000000.00);

    // Test Case C: Micro retail amount (0.5 USDT at ₦1650)
    prefillTradeForm({
      direction: 'BUY',
      rate: 1650.00,
      usdtAmount: 0.5,
      counterparty: 'MicroBuyer'
    });

    assert.strictEqual(parseFloat(rateInput.value), 1650.00);
    assert.strictEqual(parseFloat(usdtInput.value), 0.5);
    assert.strictEqual(parseFloat(ngnInput.value), 825.00);
  });

  it('M4-CH1.9: Order book row with null/empty advertiser info and HTML entities handles escaping safely', async () => {
    const { renderPricingView } = await import('../js/views/pricing.view.js');
    dom.document.root.innerHTML = `<div id="main-content">${renderPricingView()}</div>`;

    const { bybitService } = await import('../js/bybitService.js');
    bybitService.fetchMarketDepth = async () => ({
      buyDepth: [
        { price: '1610.00', lastQuantity: '100.00', nickName: null, memberName: null, userId: null }
      ],
      sellDepth: [
        { price: '1620.00', lastQuantity: '200.00', nickName: '<script>alert("xss")</script> & "Whale"' }
      ]
    });

    const { refreshPricingData } = await import('../js/pricing.js');
    await refreshPricingData();

    // Check fallback for null nickname
    const buyRow = dom.document.querySelector('#pricing-buy-orderbook .orderbook-row');
    assert.strictEqual(buyRow.getAttribute('data-counterparty'), 'Advertiser', 'Null name should fallback to Advertiser');

    // Check HTML escaping in sell row
    const sellRow = dom.document.querySelector('#pricing-sell-orderbook .orderbook-row');
    const escapedAttr = sellRow.getAttribute('data-counterparty');
    assert.ok(!escapedAttr.includes('<script>'), 'Counterparty attribute must be HTML escaped');
  });

  // =========================================================================
  // TASK 3: CANCEL / BACK BUTTON MULTI-PATH NAVIGATION STRESS
  // =========================================================================

  it('M4-CH1.10: Navigation Sequence 1: Dashboard -> Trade -> Cancel returns to Dashboard and clears form', async () => {
    const { renderDashboardView } = await import('../js/views/dashboard.view.js');
    const { renderAddTradeView } = await import('../js/views/addTrade.view.js');

    dom.document.root.innerHTML = `
      <div id="main-content">
        ${renderDashboardView()}
        ${renderAddTradeView()}
      </div>
    `;

    let currentView = 'dashboard';
    let previousView = 'dashboard';

    function switchView(target) {
      if (target && target !== currentView) {
        previousView = currentView;
        currentView = target;
      }
    }
    dom.window.switchView = switchView;
    dom.window.getPreviousView = () => previousView;

    const { initTrades } = await import('../js/trades.js');
    initTrades();

    assert.strictEqual(currentView, 'dashboard');

    switchView('add-trade');
    assert.strictEqual(currentView, 'add-trade');
    assert.strictEqual(previousView, 'dashboard');

    const rateInput = dom.document.getElementById('trade-rate');
    rateInput.value = '1650';

    const btnCancelTrade = dom.document.getElementById('btn-cancel-trade');
    btnCancelTrade.click();

    assert.strictEqual(currentView, 'dashboard', 'Header Back must return to dashboard');
    assert.strictEqual(rateInput.value, '', 'Form inputs must be cleared on back');

    switchView('add-trade');
    rateInput.value = '1700';
    const btnFormCancel = dom.document.getElementById('btn-form-cancel');
    btnFormCancel.click();

    assert.strictEqual(currentView, 'dashboard', 'Form Cancel button must return to dashboard');
    assert.strictEqual(rateInput.value, '', 'Form inputs must be cleared on cancel');
  });

  it('M4-CH1.11: Navigation Sequence 2: Pricing -> Order Book Row -> Trade Form -> Cancel returns to Pricing', async () => {
    const { renderPricingView } = await import('../js/views/pricing.view.js');
    const { renderAddTradeView } = await import('../js/views/addTrade.view.js');

    dom.document.root.innerHTML = `
      <div id="main-content">
        ${renderPricingView()}
        ${renderAddTradeView()}
      </div>
    `;

    let currentView = 'dashboard';
    let previousView = 'dashboard';

    function switchView(target) {
      if (target && target !== currentView) {
        previousView = currentView;
        currentView = target;
      }
    }
    dom.window.switchView = switchView;
    dom.window.getPreviousView = () => previousView;

    const { initTrades, prefillTradeForm } = await import('../js/trades.js');
    initTrades();

    switchView('pricing');
    assert.strictEqual(currentView, 'pricing');

    prefillTradeForm({
      direction: 'SELL',
      rate: 1618.50,
      usdtAmount: 500,
      counterparty: 'OrderBookMaker'
    });

    assert.strictEqual(currentView, 'add-trade');
    assert.strictEqual(previousView, 'pricing');

    const btnCancelTrade = dom.document.getElementById('btn-cancel-trade');
    btnCancelTrade.click();

    assert.strictEqual(currentView, 'pricing', 'Must navigate back to pricing view');
    const rateInput = dom.document.getElementById('trade-rate');
    assert.strictEqual(rateInput.value, '', 'Prefilled form state must be reset upon cancel');
  });

  it('M4-CH1.12: Navigation Sequence 3: Settings -> History -> Trade -> Back restores History view', async () => {
    const { renderSettingsView } = await import('../js/views/settings.view.js');
    const { renderHistoryView } = await import('../js/views/history.view.js');
    const { renderAddTradeView } = await import('../js/views/addTrade.view.js');

    dom.document.root.innerHTML = `
      <div id="main-content">
        ${renderSettingsView()}
        ${renderHistoryView()}
        ${renderAddTradeView()}
      </div>
    `;

    let currentView = 'dashboard';
    let previousView = 'dashboard';

    function switchView(target) {
      if (target && target !== currentView) {
        previousView = currentView;
        currentView = target;
      }
    }
    dom.window.switchView = switchView;
    dom.window.getPreviousView = () => previousView;

    const { initTrades } = await import('../js/trades.js');
    initTrades();

    // 1. Settings
    switchView('settings');
    assert.strictEqual(currentView, 'settings');

    // 2. History
    switchView('history');
    assert.strictEqual(currentView, 'history');
    assert.strictEqual(previousView, 'settings');

    // 3. Trade Entry
    switchView('add-trade');
    assert.strictEqual(currentView, 'add-trade');
    assert.strictEqual(previousView, 'history');

    // 4. Back button
    const btnCancelTrade = dom.document.getElementById('btn-cancel-trade');
    btnCancelTrade.click();

    assert.strictEqual(currentView, 'history', 'Must restore immediate previous view (history), not earlier settings');
  });

  it('M4-CH1.13: Edit mode cancelation resets editing flags, restores title, and hides edit alerts', async () => {
    const { renderAddTradeView } = await import('../js/views/addTrade.view.js');
    dom.document.root.innerHTML = `<div id="main-content">${renderAddTradeView()}</div>`;

    const { store } = await import('../js/store.js');
    store.clearAllData();
    const bank = store.addBankAccount({ name: 'Test Bank', last4: '7788', initialBalance: 1000000 });

    const savedTrade = store.addTrade({
      type: 'SELL',
      rate: 1630,
      usdtAmount: 400,
      ngnAmount: 652000,
      bankAccountId: bank.id,
      date: '2026-08-24T12:00:00.000Z',
      counterparty: 'EditTarget',
      notes: 'Initial note'
    });

    let currentView = 'history';
    let previousView = 'dashboard';

    function switchView(target) {
      if (target && target !== currentView) {
        previousView = currentView;
        currentView = target;
      }
    }
    dom.window.switchView = switchView;
    dom.window.getPreviousView = () => previousView;

    const { initTrades, startEditTrade } = await import('../js/trades.js');
    initTrades();

    // Start editing an existing trade by passing saved trade ID
    startEditTrade(savedTrade.id);

    const formTitle = dom.document.getElementById('trade-form-title');
    const alertEdit = dom.document.getElementById('edit-mode-alert');
    const btnCancelEdit = dom.document.getElementById('btn-cancel-edit');
    const rateInput = dom.document.getElementById('trade-rate');

    assert.strictEqual(formTitle.textContent, 'Edit Trade');
    assert.strictEqual(alertEdit.classList.contains('hidden'), false, 'Edit alert should be visible');
    assert.strictEqual(btnCancelEdit.classList.contains('hidden'), false, 'Cancel edit button should be visible');
    assert.strictEqual(parseFloat(rateInput.value), 1630);

    // Cancel edit
    btnCancelEdit.click();

    assert.strictEqual(formTitle.textContent, 'Record Trade', 'Form title should be restored');
    assert.strictEqual(alertEdit.classList.contains('hidden'), true, 'Edit alert should be hidden');
    assert.strictEqual(btnCancelEdit.classList.contains('hidden'), true, 'Cancel edit button should be hidden');
    assert.strictEqual(rateInput.value, '', 'Form fields should be cleared');
  });
}, { tier: 2, category: 'Challenger M4-1: Search & Navigation Stress' });
