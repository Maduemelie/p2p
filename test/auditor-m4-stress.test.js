/**
 * Milestone 4 Forensic Stress & Integrity Verification Suite
 * Independent auditor checks for R4: Search, Navigation & Interactive Order Book UX
 */

const { setupDomEnvironment } = require('./harness/dom-mock');
const { assert } = require('./harness/assertions');
const fs = require('fs');
const path = require('path');

async function runM4ForensicAudit() {
  console.log('================================================================');
  console.log('STARTING FORENSIC AUDIT: Milestone 4 (R4 UX, Search & Navigation)');
  console.log('================================================================\n');

  let passedChecks = 0;
  let totalChecks = 0;

  function check(name, fn) {
    totalChecks++;
    try {
      fn();
      console.log(`[PASS] Check ${totalChecks}: ${name}`);
      passedChecks++;
    } catch (err) {
      console.error(`[FAIL] Check ${totalChecks}: ${name}`);
      console.error(`       Error: ${err.message}`);
      if (err.stack) console.error(`       Stack: ${err.stack.split('\n')[1]}`);
      throw err;
    }
  }

  async function asyncCheck(name, fn) {
    totalChecks++;
    try {
      await fn();
      console.log(`[PASS] Check ${totalChecks}: ${name}`);
      passedChecks++;
    } catch (err) {
      console.error(`[FAIL] Check ${totalChecks}: ${name}`);
      console.error(`       Error: ${err.message}`);
      if (err.stack) console.error(`       Stack: ${err.stack.split('\n')[1]}`);
      throw err;
    }
  }

  // -------------------------------------------------------------
  // PHASE 1: STATIC CODE INTEGRITY & ANTI-FACADE FORENSICS
  // -------------------------------------------------------------
  console.log('--- Phase 1: Static Code Integrity & Anti-Facade Analysis ---');

  const filesToCheck = [
    'js/history.js',
    'js/views/history.view.js',
    'js/pricing.js',
    'js/trades.js',
    'js/views/addTrade.view.js',
    'js/app.js'
  ];

  check('All Milestone 4 target files exist and are non-empty', () => {
    filesToCheck.forEach(relPath => {
      const fullPath = path.resolve(__dirname, '..', relPath);
      assert.ok(fs.existsSync(fullPath), `File must exist: ${relPath}`);
      const content = fs.readFileSync(fullPath, 'utf-8');
      assert.ok(content.trim().length > 50, `File must not be a stub: ${relPath}`);
    });
  });

  check('Static check: No hardcoded test refIds or facade constants in history.js', () => {
    const content = fs.readFileSync(path.resolve(__dirname, '../js/history.js'), 'utf-8');
    assert.ok(content.includes('trade.refId'), 'history.js must inspect trade.refId dynamically');
    assert.ok(content.includes('Bybit Order ID:') || content.includes('refId'), 'history.js must render Bybit Order ID in detail view');
    assert.ok(!content.includes('1849302948572019'), 'Must not contain hardcoded test order IDs');
    assert.ok(!content.includes('9928174029184711'), 'Must not contain hardcoded test order IDs');
  });

  check('Static check: Order book row prefill and direction mapping in pricing.js', () => {
    const content = fs.readFileSync(path.resolve(__dirname, '../js/pricing.js'), 'utf-8');
    assert.ok(content.includes('prefillTradeForm'), 'pricing.js must integrate with window.prefillTradeForm');
    assert.ok(content.includes('data-direction="SELL"'), 'Buy order book rows must set direction to SELL');
    assert.ok(content.includes('data-direction="BUY"'), 'Sell order book rows must set direction to BUY');
    assert.ok(content.includes('data-rate'), 'order book rows must bind data-rate');
    assert.ok(content.includes('data-volume'), 'order book rows must bind data-volume');
  });

  check('Static check: Cancel and Back navigation elements in addTrade.view.js and trades.js', () => {
    const viewContent = fs.readFileSync(path.resolve(__dirname, '../js/views/addTrade.view.js'), 'utf-8');
    const tradesContent = fs.readFileSync(path.resolve(__dirname, '../js/trades.js'), 'utf-8');

    assert.ok(viewContent.includes('btn-cancel-trade'), 'addTrade.view.js must have header Back button (#btn-cancel-trade)');
    assert.ok(viewContent.includes('btn-form-cancel'), 'addTrade.view.js must have form Cancel button (#btn-form-cancel)');
    assert.ok(tradesContent.includes('resetTradeForm'), 'trades.js must implement resetTradeForm()');
    assert.ok(tradesContent.includes('window.getPreviousView'), 'trades.js must query window.getPreviousView()');
  });

  // -------------------------------------------------------------
  // PHASE 2: DYNAMIC EMPIRICAL SEARCH INTEGRITY (REFID)
  // -------------------------------------------------------------
  console.log('\n--- Phase 2: Dynamic Empirical Search Integrity (refId) ---');

  await asyncCheck('Dynamic Search: 50 randomized trades with unique refIds filtered accurately', async () => {
    const dom = setupDomEnvironment();
    const { renderHistoryView } = await import('../js/views/history.view.js');
    const { renderDashboardView } = await import('../js/views/dashboard.view.js');
    const { renderAddTradeView } = await import('../js/views/addTrade.view.js');
    const { renderPricingView } = await import('../js/views/pricing.view.js');
    const { renderSettingsView } = await import('../js/views/settings.view.js');
    const { renderModalsView } = await import('../js/views/modals.view.js');

    dom.document.root.innerHTML = `
      <div id="main-content">
        ${renderDashboardView()}
        ${renderAddTradeView()}
        ${renderPricingView()}
        ${renderHistoryView()}
        ${renderSettingsView()}
      </div>
      <div id="modals-container">${renderModalsView()}</div>
    `;

    const { store } = await import('../js/store.js');
    store.clearAllData();
    const bank = store.addBankAccount({ name: 'Access Bank', last4: '9988', initialBalance: 5000000 });

    const generatedRefIds = [];
    for (let i = 0; i < 50; i++) {
      const refId = `BYBIT_ORDER_${Date.now()}_${i}_${Math.floor(Math.random() * 1000000)}`;
      generatedRefIds.push(refId);
      store.addTrade({
        type: i % 2 === 0 ? 'BUY' : 'SELL',
        refId,
        counterparty: `Counterparty_${i}`,
        rate: 1600 + i,
        usdtAmount: 100 + i,
        ngnAmount: (1600 + i) * (100 + i),
        bankAccountId: bank.id,
        date: new Date(Date.now() - i * 3600000).toISOString(),
        notes: `Random trade note #${i}`
      });
    }

    const { initHistory } = await import('../js/history.js');
    initHistory();

    const searchInput = dom.document.getElementById('history-search');
    const container = dom.document.getElementById('trades-history-container');
    const countEl = dom.document.getElementById('history-trade-count');

    // Test 10 random exact refId lookups
    for (let k = 0; k < 10; k++) {
      const targetRefId = generatedRefIds[k * 5];
      searchInput.value = targetRefId;
      searchInput.dispatchEvent({ type: 'input', target: searchInput, closest: (s) => searchInput.closest(s) });

      assert.ok(countEl.textContent.includes('1 match'), `Search for ${targetRefId} should yield 1 match`);
      assert.ok(container.innerHTML.includes(targetRefId), `Rendered HTML must display ${targetRefId}`);
    }

    // Test partial prefix lookup
    searchInput.value = 'BYBIT_ORDER';
    searchInput.dispatchEvent({ type: 'input', target: searchInput, closest: (s) => searchInput.closest(s) });
    assert.ok(countEl.textContent.includes('50 matches'), 'Search for BYBIT_ORDER should match all 50 trades');

    // Test non-matching query
    searchInput.value = 'NON_EXISTENT_REF_ID_9999999';
    searchInput.dispatchEvent({ type: 'input', target: searchInput, closest: (s) => searchInput.closest(s) });
    assert.ok(countEl.textContent.includes('0 matches'), 'Non-existent refId should yield 0 matches');
    assert.ok(container.innerHTML.includes('No matching trades'), 'Container should render empty state');

    // Clear search
    const btnClear = dom.document.getElementById('btn-clear-search');
    btnClear.click();
    assert.strictEqual(searchInput.value, '');
    assert.ok(countEl.textContent.includes('50 matches'), 'Clearing search should restore all 50 trades');
  });

  await asyncCheck('Dynamic Search: Numeric refId types and special characters match without throw', async () => {
    const dom = setupDomEnvironment();
    const { renderHistoryView } = await import('../js/views/history.view.js');
    dom.document.root.innerHTML = `<div id="main-content">${renderHistoryView()}</div>`;

    const { store } = await import('../js/store.js');
    store.clearAllData();
    const bank = store.addBankAccount({ name: 'GTBank', last4: '1234', initialBalance: 1000000 });

    store.addTrade({
      type: 'BUY',
      refId: 1849302948572019, // numeric type
      counterparty: 'NumericTrader',
      rate: 1600,
      usdtAmount: 100,
      ngnAmount: 160000,
      bankAccountId: bank.id,
      date: new Date().toISOString()
    });

    store.addTrade({
      type: 'SELL',
      refId: 'ORD#2026-X[SPECIAL]',
      counterparty: 'SpecialTrader',
      rate: 1650,
      usdtAmount: 200,
      ngnAmount: 330000,
      bankAccountId: bank.id,
      date: new Date().toISOString()
    });

    const { initHistory } = await import('../js/history.js');
    initHistory();

    const searchInput = dom.document.getElementById('history-search');
    const countEl = dom.document.getElementById('history-trade-count');

    // Test numeric search
    searchInput.value = '1849302948572019';
    searchInput.dispatchEvent({ type: 'input', target: searchInput, closest: (s) => searchInput.closest(s) });
    assert.ok(countEl.textContent.includes('1 match'), 'Numeric refId must match string search input');

    // Test special characters search: brackets, hashes, hyphens
    searchInput.value = 'X[SPECIAL]';
    searchInput.dispatchEvent({ type: 'input', target: searchInput, closest: (s) => searchInput.closest(s) });
    assert.ok(countEl.textContent.includes('1 match'), 'Special characters in refId must match without regex crash');
  });

  // -------------------------------------------------------------
  // PHASE 3: INTERACTIVE ORDER BOOK ROW PREFILL & VIEW NAVIGATION
  // -------------------------------------------------------------
  console.log('\n--- Phase 3: Interactive Order Book UX & Navigation ---');

  await asyncCheck('Order Book Click: Tapping Buy/Sell rows dynamically prefills form and navigates', async () => {
    const dom = setupDomEnvironment();
    const { renderDashboardView } = await import('../js/views/dashboard.view.js');
    const { renderAddTradeView } = await import('../js/views/addTrade.view.js');
    const { renderPricingView } = await import('../js/views/pricing.view.js');
    const { renderHistoryView } = await import('../js/views/history.view.js');
    const { renderSettingsView } = await import('../js/views/settings.view.js');
    const { renderModalsView } = await import('../js/views/modals.view.js');

    dom.document.root.innerHTML = `
      <div id="main-content">
        ${renderDashboardView()}
        ${renderAddTradeView()}
        ${renderPricingView()}
        ${renderHistoryView()}
        ${renderSettingsView()}
      </div>
      <div id="modals-container">${renderModalsView()}</div>
    `;

    const { initTrades, prefillTradeForm } = await import('../js/trades.js');
    initTrades();

    let navigatedView = null;
    dom.window.switchView = (viewName) => {
      navigatedView = viewName;
    };

    // Test direct prefillTradeForm for BUY
    prefillTradeForm({
      direction: 'BUY',
      rate: 1625.50,
      usdtAmount: 450.0,
      counterparty: 'TopSellerGlobal',
      notes: 'Prefilled from live market depth'
    });

    assert.strictEqual(navigatedView, 'add-trade', 'Should navigate to add-trade view');
    const rateInput = dom.document.getElementById('trade-rate');
    const usdtInput = dom.document.getElementById('trade-usdt');
    const ngnInput = dom.document.getElementById('trade-ngn');
    const counterpartyInput = dom.document.getElementById('trade-counterparty');
    const notesInput = dom.document.getElementById('trade-notes');
    const btnSubmitLabel = dom.document.getElementById('btn-submit-label');

    assert.strictEqual(parseFloat(rateInput.value), 1625.50);
    assert.strictEqual(parseFloat(usdtInput.value), 450.0);
    assert.strictEqual(parseFloat(ngnInput.value), (1625.50 * 450).toFixed(2) * 1);
    assert.strictEqual(counterpartyInput.value, 'TopSellerGlobal');
    assert.strictEqual(notesInput.value, 'Prefilled from live market depth');
    assert.strictEqual(btnSubmitLabel.textContent, 'Save Buy Trade');

    // Test direct prefillTradeForm for SELL
    prefillTradeForm({
      direction: 'SELL',
      rate: 1618.00,
      usdtAmount: 720.5,
      counterparty: 'HighVolumeBuyer',
      notes: 'Quick sell order'
    });

    assert.strictEqual(parseFloat(rateInput.value), 1618.00);
    assert.strictEqual(parseFloat(usdtInput.value), 720.5);
    assert.strictEqual(parseFloat(ngnInput.value), (1618.00 * 720.5).toFixed(2) * 1);
    assert.strictEqual(counterpartyInput.value, 'HighVolumeBuyer');
    assert.strictEqual(btnSubmitLabel.textContent, 'Save Sell Trade');
  });

  await asyncCheck('Pricing Assistant Order Book: Live mock depth triggers prefill with correct Buy/Sell inverted direction', async () => {
    const dom = setupDomEnvironment();
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

    let lastPrefilled = null;
    let switchedView = null;

    dom.window.prefillTradeForm = (opts) => {
      lastPrefilled = opts;
      switchedView = 'add-trade';
    };

    // Import pricing and mock market depth
    const { bybitService } = await import('../js/bybitService.js');
    const mockDepth = {
      buyDepth: [
        { price: '1615.00', lastQuantity: '1500.00', minAmount: '50000', maxAmount: '2000000', nickName: 'MarketMakerBuyer' }
      ],
      sellDepth: [
        { price: '1622.00', lastQuantity: '800.00', minAmount: '50000', maxAmount: '1200000', nickName: 'MarketMakerSeller' }
      ]
    };

    // Mock fetchMarketDepth
    bybitService.fetchMarketDepth = async () => mockDepth;

    const { refreshPricingData } = await import('../js/pricing.js');
    await refreshPricingData();

    // Verify Buy table rendered row with direction SELL
    const buyRow = dom.document.querySelector('#pricing-buy-orderbook .orderbook-row');
    assert.ok(buyRow, 'Buy orderbook table must render rows');
    assert.strictEqual(buyRow.getAttribute('data-direction'), 'SELL', 'Clicking Buy ad should create SELL trade');
    assert.strictEqual(buyRow.getAttribute('data-rate'), '1615');
    assert.strictEqual(buyRow.getAttribute('data-volume'), '1500');

    // Trigger click on Buy row
    buyRow.click();
    assert.strictEqual(switchedView, 'add-trade');
    assert.strictEqual(lastPrefilled.direction, 'SELL');
    assert.strictEqual(lastPrefilled.rate, 1615);
    assert.strictEqual(lastPrefilled.usdtAmount, 1500);
    assert.strictEqual(lastPrefilled.counterparty, 'MarketMakerBuyer');

    // Verify Sell table rendered row with direction BUY
    const sellRow = dom.document.querySelector('#pricing-sell-orderbook .orderbook-row');
    assert.ok(sellRow, 'Sell orderbook table must render rows');
    assert.strictEqual(sellRow.getAttribute('data-direction'), 'BUY', 'Clicking Sell ad should create BUY trade');
    assert.strictEqual(sellRow.getAttribute('data-rate'), '1622');
    assert.strictEqual(sellRow.getAttribute('data-volume'), '800');

    // Trigger click on Sell row
    sellRow.click();
    assert.strictEqual(lastPrefilled.direction, 'BUY');
    assert.strictEqual(lastPrefilled.rate, 1622);
    assert.strictEqual(lastPrefilled.usdtAmount, 800);
    assert.strictEqual(lastPrefilled.counterparty, 'MarketMakerSeller');
  });

  // -------------------------------------------------------------
  // PHASE 4: CANCEL & BACK NAVIGATION FIDELITY
  // -------------------------------------------------------------
  console.log('\n--- Phase 4: Cancel & Back Navigation Fidelity ---');

  await asyncCheck('Cancel/Back Navigation: Restores previous screen and resets form cleanly', async () => {
    const dom = setupDomEnvironment();
    const { renderDashboardView } = await import('../js/views/dashboard.view.js');
    const { renderAddTradeView } = await import('../js/views/addTrade.view.js');
    const { renderPricingView } = await import('../js/views/pricing.view.js');
    const { renderHistoryView } = await import('../js/views/history.view.js');
    const { renderSettingsView } = await import('../js/views/settings.view.js');
    const { renderModalsView } = await import('../js/views/modals.view.js');

    dom.document.root.innerHTML = `
      <nav>
        <button class="nav-tab active" data-target="dashboard">Dash</button>
        <button class="nav-tab" data-target="pricing">Pricing</button>
        <button class="nav-tab" data-target="history">History</button>
        <button class="nav-tab" data-target="settings">Settings</button>
        <button class="nav-tab" data-target="add-trade">Add</button>
      </nav>
      <div id="main-content">
        ${renderDashboardView()}
        ${renderAddTradeView()}
        ${renderPricingView()}
        ${renderHistoryView()}
        ${renderSettingsView()}
      </div>
      <div id="modals-container">${renderModalsView()}</div>
    `;

    // Initialize navigation in app.js style
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

    const { initTrades, prefillTradeForm, resetTradeForm } = await import('../js/trades.js');
    initTrades();

    // Scenario A: User navigates from 'pricing' to 'add-trade'
    switchView('pricing');
    assert.strictEqual(currentView, 'pricing');

    // Click order book row -> opens add-trade
    prefillTradeForm({ direction: 'BUY', rate: 1600, usdtAmount: 100 });
    assert.strictEqual(currentView, 'add-trade');
    assert.strictEqual(previousView, 'pricing');

    // User clicks header Back button (#btn-cancel-trade)
    const btnCancelTrade = dom.document.getElementById('btn-cancel-trade');
    btnCancelTrade.click();
    assert.strictEqual(currentView, 'pricing', 'Header Back button must return to pricing view');

    // Scenario B: User navigates from 'history' to 'add-trade'
    switchView('history');
    switchView('add-trade');
    assert.strictEqual(currentView, 'add-trade');
    assert.strictEqual(previousView, 'history');

    // User clicks form Cancel button (#btn-form-cancel)
    const btnFormCancel = dom.document.getElementById('btn-form-cancel');
    btnFormCancel.click();
    assert.strictEqual(currentView, 'history', 'Form Cancel button must return to history view');

    // Verify form was reset
    const rateInput = dom.document.getElementById('trade-rate');
    assert.strictEqual(rateInput.value, '', 'Form rate input should be empty after cancel');

    // Scenario C: User navigates from 'settings' to 'add-trade'
    switchView('settings');
    switchView('add-trade');
    assert.strictEqual(currentView, 'add-trade');
    assert.strictEqual(previousView, 'settings');

    const btnCancelEdit = dom.document.getElementById('btn-cancel-edit');
    btnCancelEdit.click();
    assert.strictEqual(currentView, 'settings', 'Cancel Edit button must return to settings view');
  });

  console.log('\n================================================================');
  console.log(`FORENSIC AUDIT COMPLETE: ${passedChecks}/${totalChecks} checks passed (100%)`);
  console.log('VERDICT: CLEAN (No integrity violations)');
  console.log('================================================================\n');
}

runM4ForensicAudit().catch(err => {
  console.error('Audit encountered fatal error:', err);
  process.exit(1);
});
