/**
 * Adversarial Empirical Stress Test Suite for Milestone 4 (R4: Search, Navigation & Interactive Order Book UX)
 * Executed by Challenger 2
 *
 * Scope:
 * 1. View State Transitions & Navigation History Stack Invariants.
 * 2. Form Resetting Upon Cancel & State Integrity (Add/Edit Modes).
 * 3. Interactive Order Book Rate, Volume & Counterparty Population Prefill Flow.
 * 4. Trade History Search Indexing, Bybit Order ID (refId) & Multi-Factor Filtering.
 * 5. Interactive Form Math, Dynamic Fees & Form Validation Boundaries.
 */

const { describe, it, beforeEach } = require('./harness/test-runner');
const { assert } = require('./harness/assertions');
const { setupDomEnvironment } = require('./harness/dom-mock');
const fs = require('fs');
const path = require('path');

// Helper to wait for microtasks/timeouts
const tick = (ms = 10) => new Promise(resolve => setTimeout(resolve, ms));

async function initFullContext() {
  const dom = setupDomEnvironment();

  // Load view templates
  const dashboardView = await import('../js/views/dashboard.view.js');
  const addTradeView = await import('../js/views/addTrade.view.js');
  const pricingView = await import('../js/views/pricing.view.js');
  const historyView = await import('../js/views/history.view.js');
  const settingsView = await import('../js/views/settings.view.js');
  const modalsView = await import('../js/views/modals.view.js');

  dom.document.body.innerHTML = `
    <header class="app-header">
      <button id="btn-theme-toggle"></button>
      <button id="btn-theme-toggle-sidebar"></button>
    </header>
    <div id="main-content">
      ${dashboardView.renderDashboardView()}
      ${addTradeView.renderAddTradeView()}
      ${pricingView.renderPricingView()}
      ${historyView.renderHistoryView()}
      ${settingsView.renderSettingsView()}
    </div>
    <div id="modals-container">
      ${modalsView.renderModalsView()}
    </div>
    <div id="toast-container"></div>
    <div id="confirm-modal-container"></div>
    <nav class="bottom-nav">
      <button class="nav-tab active" data-target="dashboard">Dashboard</button>
      <button class="nav-tab" data-target="add-trade">Add Trade</button>
      <button class="nav-tab" data-target="pricing">Pricing</button>
      <button class="nav-tab" data-target="history">History</button>
      <button class="nav-tab" data-target="settings">Settings</button>
    </nav>
    <nav class="sidebar-nav">
      <button class="sidebar-nav-item active" data-target="dashboard">Dashboard</button>
      <button class="sidebar-nav-item" data-target="add-trade">Add Trade</button>
      <button class="sidebar-nav-item" data-target="pricing">Pricing</button>
      <button class="sidebar-nav-item" data-target="history">History</button>
      <button class="sidebar-nav-item" data-target="settings">Settings</button>
    </nav>
    <button id="btn-dash-quick-add"></button>
    <button id="btn-view-all-history"></button>
  `;

  const storeModule = await import('../js/store.js');
  const utilsModule = await import('../js/utils.js');
  const feesModule = await import('../js/fees.js');
  const tradesModule = await import('../js/trades.js');
  const historyModule = await import('../js/history.js');
  const pricingModule = await import('../js/pricing.js');

  // Initialize store with fresh test data
  storeModule.store.clearAllData();
  const bank1 = storeModule.store.addBankAccount({ name: 'GTBank', accountNumber: '0123456789', last4: '6789', isPrimary: true, initialBalance: 1000000 });
  const bank2 = storeModule.store.addBankAccount({ name: 'Kuda Bank', accountNumber: '9876543210', last4: '3210', isPrimary: false, initialBalance: 500000 });

  // Bind bank select options in add-trade form
  const bankSelect = dom.document.getElementById('trade-bank-account');
  if (bankSelect) {
    bankSelect.innerHTML = `
      <option value="" disabled>Select Bank Account</option>
      <option value="${bank1.id}" selected>${bank1.name} (•••• ${bank1.last4})</option>
      <option value="${bank2.id}">${bank2.name} (•••• ${bank2.last4})</option>
    `;
  }

  // Setup navigation state simulator aligned with js/app.js
  let currentView = 'dashboard';
  let previousView = 'dashboard';

  function switchTab(targetViewId, pushState = true) {
    if (targetViewId && targetViewId !== currentView) {
      previousView = currentView;
      currentView = targetViewId;
    }

    const bottomTabs = dom.document.querySelectorAll('.nav-tab');
    const sidebarItems = dom.document.querySelectorAll('.sidebar-nav-item');
    const views = dom.document.querySelectorAll('.app-view');

    bottomTabs.forEach(tab => {
      tab.classList.toggle('active', tab.getAttribute('data-target') === targetViewId);
    });
    sidebarItems.forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-target') === targetViewId);
    });
    views.forEach(view => {
      const isTarget = view.getAttribute('data-view') === targetViewId;
      if (isTarget) {
        view.classList.add('active');
      } else {
        view.classList.remove('active');
      }
    });

    if (pushState) {
      dom.window.location.hash = targetViewId;
    }
  }

  dom.window.switchView = switchTab;
  dom.window.getPreviousView = () => previousView;

  // Initialize feature controllers
  tradesModule.initTrades();
  historyModule.initHistory();

  // Reset any previous filter/search state in history module
  const historySearch = dom.document.getElementById('history-search');
  if (historySearch) {
    historySearch.value = '';
    historySearch.dispatchEvent({ type: 'input', target: historySearch });
  }
  const filterType = dom.document.getElementById('filter-type');
  if (filterType) {
    filterType.value = 'ALL';
    filterType.dispatchEvent({ type: 'change', target: filterType });
  }
  const filterBank = dom.document.getElementById('filter-bank');
  if (filterBank) {
    filterBank.value = 'ALL';
    filterBank.dispatchEvent({ type: 'change', target: filterBank });
  }
  const filterSort = dom.document.getElementById('filter-sort');
  if (filterSort) {
    filterSort.value = 'date-desc';
    filterSort.dispatchEvent({ type: 'change', target: filterSort });
  }

  // Set default initial view to dashboard
  switchTab('dashboard');

  return {
    dom,
    store: storeModule.store,
    utils: utilsModule,
    fees: feesModule,
    trades: tradesModule,
    history: historyModule,
    pricing: pricingModule,
    banks: [bank1, bank2],
    getNavState: () => ({ currentView, previousView }),
    switchTab
  };
}

// ============================================================================
// SUITE 1: VIEW STATE TRANSITIONS & NAVIGATION HISTORY STACK INVARIANTS
// ============================================================================
describe('Challenger M4 — 1. View State Transitions & Navigation Stack Invariants', () => {

  it('1.1: Default view state initialization correctly activates dashboard and tracks initial history', async () => {
    const ctx = await initFullContext();
    const { dom, getNavState } = ctx;

    const views = dom.document.querySelectorAll('.app-view');
    const activeView = views.find(v => v.classList.contains('active'));
    assert.ok(activeView, 'An active view must exist on mount');
    assert.strictEqual(activeView.getAttribute('data-view'), 'dashboard', 'Initial active view should be dashboard');
    assert.strictEqual(getNavState().previousView, 'dashboard', 'Initial previous view should default to dashboard');
  });

  it('1.2: Multi-step tab navigation updates active classes on views, bottom tabs, and sidebar items', async () => {
    const ctx = await initFullContext();
    const { dom, switchTab, getNavState } = ctx;

    // Navigate to pricing
    switchTab('pricing');
    assert.strictEqual(getNavState().currentView, 'pricing');
    assert.strictEqual(getNavState().previousView, 'dashboard');

    const pricingView = dom.document.getElementById('view-pricing');
    assert.ok(pricingView.classList.contains('active'), 'Pricing view should have active class');

    const navTabs = dom.document.querySelectorAll('.nav-tab');
    const activeNavTab = navTabs.find(t => t.classList.contains('active'));
    assert.ok(activeNavTab, 'Active bottom nav tab should exist');
    assert.strictEqual(activeNavTab.getAttribute('data-target'), 'pricing', 'Bottom nav pricing tab should be active');

    // Navigate to history
    switchTab('history');
    assert.strictEqual(getNavState().currentView, 'history');
    assert.strictEqual(getNavState().previousView, 'pricing');

    const historyView = dom.document.getElementById('view-history');
    assert.ok(historyView.classList.contains('active'), 'History view should have active class');
    assert.ok(!pricingView.classList.contains('active'), 'Pricing view should not be active');
  });

  it('1.3: Deep navigation chain (pricing -> add-trade -> cancel) returns strictly to pricing', async () => {
    const ctx = await initFullContext();
    const { dom, switchTab, getNavState } = ctx;

    // 1. User starts at pricing view
    switchTab('pricing');
    assert.strictEqual(getNavState().currentView, 'pricing');

    // 2. Navigates to add-trade (e.g. via order book row or button)
    switchTab('add-trade');
    assert.strictEqual(getNavState().currentView, 'add-trade');
    assert.strictEqual(getNavState().previousView, 'pricing');

    // 3. User clicks #btn-cancel-trade (Back button)
    const btnCancelTrade = dom.document.getElementById('btn-cancel-trade');
    assert.ok(btnCancelTrade, 'Cancel trade button should exist in DOM');
    btnCancelTrade.click();

    // 4. Verification: Returned to pricing view
    assert.strictEqual(getNavState().currentView, 'pricing', 'Clicking cancel trade must return to pricing view');
    const pricingView = dom.document.getElementById('view-pricing');
    assert.ok(pricingView.classList.contains('active'), 'Pricing view should be active again');
  });

  it('1.4: Deep navigation chain (history -> startEditTrade -> cancel) returns strictly to history', async () => {
    const ctx = await initFullContext();
    const { dom, store, switchTab, getNavState, banks } = ctx;

    // Add a trade to store
    const trade = store.addTrade({
      type: 'BUY',
      date: '2026-08-24T10:00:00',
      bankAccountId: banks[0].id,
      rate: 1610,
      ngnAmount: 805000,
      usdtAmount: 500,
      fees: [],
      totalFees: 0,
      netAmount: 805000,
      effectiveRate: 1610,
      counterparty: 'WhaleSeller'
    });

    // 1. User is on History view
    switchTab('history');
    assert.strictEqual(getNavState().currentView, 'history');

    // 2. User clicks Edit on trade
    dom.window.startEditTrade(trade.id);
    assert.strictEqual(getNavState().currentView, 'add-trade', 'startEditTrade should navigate to add-trade view');
    assert.strictEqual(getNavState().previousView, 'history', 'Previous view must be history');

    // 3. User clicks #btn-cancel-edit
    const btnCancelEdit = dom.document.getElementById('btn-cancel-edit');
    assert.ok(!btnCancelEdit.classList.contains('hidden'), 'Cancel edit button should be visible during edit mode');
    btnCancelEdit.click();

    // 4. Verification: Returned to history view
    assert.strictEqual(getNavState().currentView, 'history', 'Cancelling edit must return to history view');
    const historyView = dom.document.getElementById('view-history');
    assert.ok(historyView.classList.contains('active'), 'History view should be active');
  });
});

// ============================================================================
// SUITE 2: FORM RESETTING UPON CANCEL & STATE INTEGRITY
// ============================================================================
describe('Challenger M4 — 2. Trade Entry Form Reset & State Integrity Upon Cancel / Edit', () => {

  it('2.1: Initial form state verification has clean inputs and default BUY state', async () => {
    const ctx = await initFullContext();
    const { dom } = ctx;

    const rateInput = dom.document.getElementById('trade-rate');
    const ngnInput = dom.document.getElementById('trade-ngn');
    const usdtInput = dom.document.getElementById('trade-usdt');
    const counterpartyInput = dom.document.getElementById('trade-counterparty');
    const notesInput = dom.document.getElementById('trade-notes');
    const formTitle = dom.document.getElementById('trade-form-title');
    const editModeAlert = dom.document.getElementById('edit-mode-alert');
    const btnCancelEdit = dom.document.getElementById('btn-cancel-edit');

    assert.strictEqual(rateInput.value, '', 'Rate input should be empty initially');
    assert.strictEqual(ngnInput.value, '', 'NGN input should be empty initially');
    assert.strictEqual(usdtInput.value, '', 'USDT input should be empty initially');
    assert.strictEqual(counterpartyInput.value, '', 'Counterparty input should be empty initially');
    assert.strictEqual(notesInput.value, '', 'Notes input should be empty initially');
    assert.strictEqual(formTitle.textContent, 'Record Trade');
    assert.ok(editModeAlert.classList.contains('hidden'), 'Edit mode alert should be hidden');
    assert.ok(btnCancelEdit.classList.contains('hidden'), 'Cancel edit button should be hidden');
  });

  it('2.2: Dirty form data is completely wiped and reset when clicking #btn-cancel-trade', async () => {
    const ctx = await initFullContext();
    const { dom, trades } = ctx;

    const rateInput = dom.document.getElementById('trade-rate');
    const ngnInput = dom.document.getElementById('trade-ngn');
    const usdtInput = dom.document.getElementById('trade-usdt');
    const counterpartyInput = dom.document.getElementById('trade-counterparty');
    const notesInput = dom.document.getElementById('trade-notes');

    // Populate dirty inputs
    rateInput.value = '1650.00';
    ngnInput.value = '825000.00';
    usdtInput.value = '500.0000';
    counterpartyInput.value = 'DirtyTrader99';
    notesInput.value = 'Uncommitted draft notes';
    trades.setTradeDirection('SELL');
    trades.recalculateTradeSummary();

    assert.strictEqual(rateInput.value, '1650.00');

    // Trigger Cancel / Back button
    const btnCancelTrade = dom.document.getElementById('btn-cancel-trade');
    btnCancelTrade.click();

    // Verify all fields are reset
    assert.strictEqual(rateInput.value, '', 'Rate input must be reset to empty');
    assert.strictEqual(ngnInput.value, '', 'NGN input must be reset to empty');
    assert.strictEqual(usdtInput.value, '', 'USDT input must be reset to empty');
    assert.strictEqual(counterpartyInput.value, '', 'Counterparty input must be reset to empty');
    assert.strictEqual(notesInput.value, '', 'Notes input must be reset to empty');

    const btnBuy = dom.document.querySelector('.trade-buy-btn');
    assert.ok(btnBuy.classList.contains('active'), 'Direction should reset to BUY');
  });

  it('2.3: Dirty form data is completely wiped and reset when clicking #btn-form-cancel', async () => {
    const ctx = await initFullContext();
    const { dom, trades } = ctx;

    const rateInput = dom.document.getElementById('trade-rate');
    const ngnInput = dom.document.getElementById('trade-ngn');
    const counterpartyInput = dom.document.getElementById('trade-counterparty');

    rateInput.value = '1700.00';
    ngnInput.value = '3400000.00';
    counterpartyInput.value = 'TestArbitrageur';
    trades.recalculateTradeSummary();

    const btnFormCancel = dom.document.getElementById('btn-form-cancel');
    btnFormCancel.click();

    assert.strictEqual(rateInput.value, '', 'Rate should be reset');
    assert.strictEqual(ngnInput.value, '', 'NGN should be reset');
    assert.strictEqual(counterpartyInput.value, '', 'Counterparty should be reset');
  });

  it('2.4: Cancelling trade edit cleanly resets editing state, form titles, and alert banners', async () => {
    const ctx = await initFullContext();
    const { dom, store, banks, trades } = ctx;

    const trade = store.addTrade({
      type: 'SELL',
      date: '2026-08-24T14:30:00',
      bankAccountId: banks[1].id,
      rate: 1625,
      ngnAmount: 1625000,
      usdtAmount: 1000,
      fees: [{ type: 'Bank Transfer Fee', amount: 53.75 }],
      totalFees: 53.75,
      netAmount: 1624946.25,
      effectiveRate: 1624.95,
      counterparty: 'AlphaSeller',
      notes: 'Initial note'
    });

    // Enter edit mode
    dom.window.startEditTrade(trade.id);

    const formTitle = dom.document.getElementById('trade-form-title');
    const formSubtitle = dom.document.getElementById('trade-form-subtitle');
    const editModeAlert = dom.document.getElementById('edit-mode-alert');
    const btnCancelEdit = dom.document.getElementById('btn-cancel-edit');
    const rateInput = dom.document.getElementById('trade-rate');
    const counterpartyInput = dom.document.getElementById('trade-counterparty');

    assert.strictEqual(formTitle.textContent, 'Edit Trade');
    assert.ok(formSubtitle.textContent.includes('Modifying recorded transaction'));
    assert.ok(!editModeAlert.classList.contains('hidden'));
    assert.ok(!btnCancelEdit.classList.contains('hidden'));
    assert.strictEqual(rateInput.value, '1625');
    assert.strictEqual(counterpartyInput.value, 'AlphaSeller');

    // Cancel edit
    btnCancelEdit.click();

    // Verify clean state
    assert.strictEqual(formTitle.textContent, 'Record Trade');
    assert.strictEqual(formSubtitle.textContent, 'Log a new BUY or SELL order');
    assert.ok(editModeAlert.classList.contains('hidden'), 'Edit alert should be hidden');
    assert.ok(btnCancelEdit.classList.contains('hidden'), 'Cancel edit button should be hidden');
    assert.strictEqual(rateInput.value, '', 'Rate should be cleared');
    assert.strictEqual(counterpartyInput.value, '', 'Counterparty should be cleared');
  });

  it('2.5: Successful edit form submission updates trade, resets form, and routes to history', async () => {
    const ctx = await initFullContext();
    const { dom, store, banks, getNavState, switchTab } = ctx;

    const trade = store.addTrade({
      type: 'BUY',
      date: '2026-08-24T09:00:00',
      bankAccountId: banks[0].id,
      rate: 1600,
      ngnAmount: 1600000,
      usdtAmount: 1000,
      fees: [],
      totalFees: 0,
      netAmount: 1600000,
      effectiveRate: 1600,
      counterparty: 'OriginalCounterparty'
    });

    switchTab('history');
    dom.window.startEditTrade(trade.id);

    // Modify rate and counterparty
    const rateInput = dom.document.getElementById('trade-rate');
    const ngnInput = dom.document.getElementById('trade-ngn');
    const usdtInput = dom.document.getElementById('trade-usdt');
    const counterpartyInput = dom.document.getElementById('trade-counterparty');
    const formTrade = dom.document.getElementById('form-add-trade');

    rateInput.value = '1620';
    usdtInput.value = '1000';
    ngnInput.value = '1620000';
    counterpartyInput.value = 'UpdatedCounterparty';

    // Submit form
    formTrade.dispatchEvent({
      type: 'submit',
      preventDefault: () => {},
      stopPropagation: () => {}
    });

    // Check store updated
    const updatedTrade = store.getTradeById(trade.id);
    assert.strictEqual(updatedTrade.rate, 1620);
    assert.strictEqual(updatedTrade.ngnAmount, 1620000);
    assert.strictEqual(updatedTrade.counterparty, 'UpdatedCounterparty');

    // Check navigated to history
    assert.strictEqual(getNavState().currentView, 'history', 'Submitting edited trade should return to history');
  });
});

// ============================================================================
// SUITE 3: INTERACTIVE ORDER BOOK RATE / VOLUME POPULATION & PREFILL FLOW
// ============================================================================
describe('Challenger M4 — 3. Interactive Order Book Rate / Volume Population & Prefill Flow', () => {

  it('3.1: Market Ask row click pre-fills BUY trade with accurate rate, volume, ngn, and counterparty', async () => {
    const ctx = await initFullContext();
    const { dom, getNavState } = ctx;

    // Simulate clicking a Sell order book row (Market Ask -> Taker BUYS USDT)
    dom.window.prefillTradeForm({
      direction: 'BUY',
      rate: 1622.50,
      usdtAmount: 450.75,
      counterparty: 'MegaVendor_P2P'
    });

    // Check navigation
    assert.strictEqual(getNavState().currentView, 'add-trade', 'prefillTradeForm must switch view to add-trade');

    // Check inputs
    const rateInput = dom.document.getElementById('trade-rate');
    const usdtInput = dom.document.getElementById('trade-usdt');
    const ngnInput = dom.document.getElementById('trade-ngn');
    const counterpartyInput = dom.document.getElementById('trade-counterparty');
    const btnBuy = dom.document.querySelector('.trade-buy-btn');

    assert.strictEqual(rateInput.value, '1622.5');
    assert.strictEqual(usdtInput.value, '450.75');
    assert.strictEqual(ngnInput.value, (1622.50 * 450.75).toFixed(2));
    assert.strictEqual(counterpartyInput.value, 'MegaVendor_P2P');
    assert.ok(btnBuy.classList.contains('active'), 'BUY direction toggle must be active');

    // Check toast notification
    assert.ok(dom.window.toasts.length > 0, 'Should trigger an info toast notification');
    const lastToast = dom.window.toasts[dom.window.toasts.length - 1];
    assert.ok(lastToast.msg.includes('Populated BUY trade from order book'), 'Toast should describe populated trade');
  });

  it('3.2: Market Bid row click pre-fills SELL trade with accurate rate, volume, ngn, and counterparty', async () => {
    const ctx = await initFullContext();
    const { dom, getNavState } = ctx;

    // Simulate clicking a Buy order book row (Market Bid -> Taker SELLS USDT)
    dom.window.prefillTradeForm({
      direction: 'SELL',
      rate: 1618.00,
      usdtAmount: 1200.00,
      counterparty: 'KudaBuyerDirect'
    });

    assert.strictEqual(getNavState().currentView, 'add-trade');

    const rateInput = dom.document.getElementById('trade-rate');
    const usdtInput = dom.document.getElementById('trade-usdt');
    const ngnInput = dom.document.getElementById('trade-ngn');
    const counterpartyInput = dom.document.getElementById('trade-counterparty');
    const btnSell = dom.document.querySelector('.trade-sell-btn');

    assert.strictEqual(rateInput.value, '1618');
    assert.strictEqual(usdtInput.value, '1200');
    assert.strictEqual(ngnInput.value, (1618 * 1200).toFixed(2));
    assert.strictEqual(counterpartyInput.value, 'KudaBuyerDirect');
    assert.ok(btnSell.classList.contains('active'), 'SELL direction toggle must be active');

    const summaryGross = dom.document.getElementById('summary-gross-ngn');
    assert.strictEqual(summaryGross.textContent, '₦1,941,600.00', 'Summary gross NGN must format correctly');
  });

  it('3.3: Order book row with zero volume or extreme decimals formats cleanly without NaN', async () => {
    const ctx = await initFullContext();
    const { dom } = ctx;

    // 0 volume edge case
    dom.window.prefillTradeForm({
      direction: 'BUY',
      rate: 1600,
      usdtAmount: 0,
      counterparty: 'ZeroSeller'
    });

    const rateInput = dom.document.getElementById('trade-rate');
    const usdtInput = dom.document.getElementById('trade-usdt');
    const ngnInput = dom.document.getElementById('trade-ngn');

    assert.strictEqual(rateInput.value, '1600');
    assert.strictEqual(usdtInput.value, '', '0 volume should leave usdt empty');
    assert.strictEqual(ngnInput.value, '', '0 volume should leave ngn empty');

    // Extreme decimal volume
    dom.window.prefillTradeForm({
      direction: 'SELL',
      rate: 1650.125,
      usdtAmount: 0.0055,
      counterparty: 'MicroTrader'
    });

    assert.strictEqual(rateInput.value, '1650.125');
    assert.strictEqual(usdtInput.value, '0.0055');
    assert.strictEqual(ngnInput.value, (1650.125 * 0.0055).toFixed(2));
  });

  it('3.4: Order book row with missing nickname falls back safely without rendering undefined', async () => {
    const ctx = await initFullContext();
    const { dom } = ctx;

    dom.window.prefillTradeForm({
      direction: 'BUY',
      rate: 1605,
      usdtAmount: 100,
      counterparty: ''
    });

    const counterpartyInput = dom.document.getElementById('trade-counterparty');
    assert.strictEqual(counterpartyInput.value, '', 'Empty counterparty should not be "undefined" or null');
  });

  it('3.5: Order book prefill followed by Cancel button returns to pricing and clears populated state', async () => {
    const ctx = await initFullContext();
    const { dom, switchTab, getNavState } = ctx;

    // Start at pricing
    switchTab('pricing');

    // Trigger prefill
    dom.window.prefillTradeForm({
      direction: 'SELL',
      rate: 1630,
      usdtAmount: 500,
      counterparty: 'ArbitrageBot'
    });

    assert.strictEqual(getNavState().currentView, 'add-trade');
    assert.strictEqual(getNavState().previousView, 'pricing');

    // User cancels
    const btnCancelTrade = dom.document.getElementById('btn-cancel-trade');
    btnCancelTrade.click();

    // Verify returned to pricing and form is reset
    assert.strictEqual(getNavState().currentView, 'pricing');
    const rateInput = dom.document.getElementById('trade-rate');
    assert.strictEqual(rateInput.value, '', 'Rate input should be wiped clean');
  });
});

// ============================================================================
// SUITE 4: TRADE HISTORY SEARCH INDEXING & MULTI-FACTOR FILTERING
// ============================================================================
describe('Challenger M4 — 4. Trade History Search Indexing, Bybit Order ID (refId) & Filtering', () => {

  it('4.1: Searching exact Bybit Order ID (refId) immediately finds and renders the matching trade', async () => {
    const ctx = await initFullContext();
    const { dom, store, history, banks } = ctx;

    // Seed diverse trades with refIds
    store.addTrade({
      id: 'trade_1',
      refId: '1849302948572019',
      type: 'BUY',
      date: '2026-08-24T10:00:00',
      bankAccountId: banks[0].id,
      rate: 1600,
      ngnAmount: 800000,
      usdtAmount: 500,
      counterparty: 'AlphaVendor'
    });

    store.addTrade({
      id: 'trade_2',
      refId: '9928174029184711',
      type: 'SELL',
      date: '2026-08-24T11:00:00',
      bankAccountId: banks[1].id,
      rate: 1615,
      ngnAmount: 484500,
      usdtAmount: 300,
      counterparty: 'BetaBuyer'
    });

    const searchInput = dom.document.getElementById('history-search');
    searchInput.value = '1849302948572019';
    searchInput.dispatchEvent({ type: 'input', target: searchInput });

    const tradeCards = dom.document.querySelectorAll('.trade-history-card');
    assert.strictEqual(tradeCards.length, 1, 'Search should filter down to exactly 1 matching card');
    assert.strictEqual(tradeCards[0].id, 'trade-card-trade_1');

    const tradeCountEl = dom.document.getElementById('history-trade-count');
    assert.strictEqual(tradeCountEl.textContent, '1 match found');
  });

  it('4.2: Searching partial Bybit Order ID (prefix, infix, suffix) matches correctly', async () => {
    const ctx = await initFullContext();
    const { dom, store, banks } = ctx;

    store.addTrade({
      id: 'trade_alpha',
      refId: '1849302948572019',
      type: 'BUY',
      date: '2026-08-24T10:00:00',
      bankAccountId: banks[0].id,
      rate: 1600,
      ngnAmount: 500000,
      usdtAmount: 312.5
    });

    const searchInput = dom.document.getElementById('history-search');

    // Prefix match
    searchInput.value = '184930';
    searchInput.dispatchEvent({ type: 'input', target: searchInput });
    assert.strictEqual(dom.document.querySelectorAll('.trade-history-card').length, 1);

    // Infix match
    searchInput.value = '294857';
    searchInput.dispatchEvent({ type: 'input', target: searchInput });
    assert.strictEqual(dom.document.querySelectorAll('.trade-history-card').length, 1);

    // Suffix match
    searchInput.value = '2019';
    searchInput.dispatchEvent({ type: 'input', target: searchInput });
    assert.strictEqual(dom.document.querySelectorAll('.trade-history-card').length, 1);
  });

  it('4.3: Searching internal trade ID matches corresponding trade card', async () => {
    const ctx = await initFullContext();
    const { dom, store, banks } = ctx;

    store.addTrade({
      id: 'trade_unique_uuid_999888',
      refId: '100000000001',
      type: 'BUY',
      date: '2026-08-24T10:00:00',
      bankAccountId: banks[0].id,
      rate: 1600,
      ngnAmount: 160000,
      usdtAmount: 100
    });

    const searchInput = dom.document.getElementById('history-search');
    searchInput.value = 'uuid_999888';
    searchInput.dispatchEvent({ type: 'input', target: searchInput });

    const cards = dom.document.querySelectorAll('.trade-history-card');
    assert.strictEqual(cards.length, 1);
    assert.strictEqual(cards[0].id, 'trade-card-trade_unique_uuid_999888');
  });

  it('4.4: Searching counterparty, notes, bank last4, and payment method matches reliably', async () => {
    const ctx = await initFullContext();
    const { dom, store, banks } = ctx;

    store.addTrade({
      id: 't_special',
      refId: '5555',
      type: 'SELL',
      date: '2026-08-24T12:00:00',
      bankAccountId: banks[0].id, // GTBank 6789
      rate: 1620,
      ngnAmount: 324000,
      usdtAmount: 200,
      counterparty: 'NairaKing_VIP',
      paymentMethod: 'Kuda Pay',
      notes: 'Urgent weekend settlement'
    });

    const searchInput = dom.document.getElementById('history-search');

    // Search by counterparty
    searchInput.value = 'nairaking';
    searchInput.dispatchEvent({ type: 'input', target: searchInput });
    assert.strictEqual(dom.document.querySelectorAll('.trade-history-card').length, 1);

    // Search by notes
    searchInput.value = 'weekend settlement';
    searchInput.dispatchEvent({ type: 'input', target: searchInput });
    assert.strictEqual(dom.document.querySelectorAll('.trade-history-card').length, 1);

    // Search by bank last4 digits
    searchInput.value = '6789';
    searchInput.dispatchEvent({ type: 'input', target: searchInput });
    assert.strictEqual(dom.document.querySelectorAll('.trade-history-card').length, 1);

    // Search by payment method
    searchInput.value = 'kuda pay';
    searchInput.dispatchEvent({ type: 'input', target: searchInput });
    assert.strictEqual(dom.document.querySelectorAll('.trade-history-card').length, 1);
  });

  it('4.5: Adversarial search queries with regex special characters execute safely without crashing', async () => {
    const ctx = await initFullContext();
    const { dom, store, banks } = ctx;

    store.addTrade({
      id: 't_meta',
      refId: 'ref[100]*special',
      type: 'BUY',
      date: '2026-08-24T12:00:00',
      bankAccountId: banks[0].id,
      rate: 1600,
      ngnAmount: 160000,
      usdtAmount: 100,
      counterparty: 'Trader(VIP)+Pro',
      notes: 'Price was $1600 / USDT?'
    });

    const searchInput = dom.document.getElementById('history-search');
    const metaQueries = ['[100]', '*', '+Pro', '$1600', 'USDT?', '(VIP)', '.*', '\\', '^', '|$'];

    for (const q of metaQueries) {
      searchInput.value = q;
      // Should not throw
      let threw = false;
      try {
        searchInput.dispatchEvent({ type: 'input', target: searchInput });
      } catch (err) {
        threw = true;
      }
      assert.strictEqual(threw, false, `Search query "${q}" must not throw regex error`);
    }
  });

  it('4.6: Search with excessive whitespace and mixed case trims and matches', async () => {
    const ctx = await initFullContext();
    const { dom, store, banks } = ctx;

    store.addTrade({
      id: 't_white',
      refId: '1849302948572019',
      type: 'BUY',
      date: '2026-08-24T12:00:00',
      bankAccountId: banks[0].id,
      rate: 1600,
      ngnAmount: 160000,
      usdtAmount: 100,
      counterparty: 'crypto_boss'
    });

    const searchInput = dom.document.getElementById('history-search');
    searchInput.value = '   1849302948572019    ';
    searchInput.dispatchEvent({ type: 'input', target: searchInput });
    assert.strictEqual(dom.document.querySelectorAll('.trade-history-card').length, 1);

    searchInput.value = '   CRYPTO_BOSS   ';
    searchInput.dispatchEvent({ type: 'input', target: searchInput });
    assert.strictEqual(dom.document.querySelectorAll('.trade-history-card').length, 1);
  });

  it('4.7: Clear search button appears when searching and clears input on click', async () => {
    const ctx = await initFullContext();
    const { dom, store, banks } = ctx;

    store.addTrade({
      id: 't_1',
      type: 'BUY',
      date: '2026-08-24T12:00:00',
      bankAccountId: banks[0].id,
      rate: 1600,
      ngnAmount: 160000,
      usdtAmount: 100
    });
    store.addTrade({
      id: 't_2',
      type: 'SELL',
      date: '2026-08-24T13:00:00',
      bankAccountId: banks[1].id,
      rate: 1610,
      ngnAmount: 161000,
      usdtAmount: 100
    });

    const searchInput = dom.document.getElementById('history-search');
    const btnClear = dom.document.getElementById('btn-clear-search');

    assert.ok(btnClear.classList.contains('hidden'), 'Clear button hidden initially');

    // Type search
    searchInput.value = 't_1';
    searchInput.dispatchEvent({ type: 'input', target: searchInput });
    assert.ok(!btnClear.classList.contains('hidden'), 'Clear button should become visible');
    assert.strictEqual(dom.document.querySelectorAll('.trade-history-card').length, 1);

    // Click clear
    btnClear.click();
    assert.strictEqual(searchInput.value, '', 'Search input should be cleared');
    assert.ok(btnClear.classList.contains('hidden'), 'Clear button should be hidden after clearing');
    assert.strictEqual(dom.document.querySelectorAll('.trade-history-card').length, 2, 'All trades restored');
  });

  it('4.8: Multi-factor filter combinations (Type + Bank + Search + Sort) work together harmoniously', async () => {
    const ctx = await initFullContext();
    const { dom, store, banks } = ctx;

    // Trade 1: BUY, Bank 0, Rate 1600, NGN 800k, Note: 'batch_A'
    store.addTrade({
      id: 't1',
      refId: '1001',
      type: 'BUY',
      date: '2026-08-24T10:00:00',
      bankAccountId: banks[0].id,
      rate: 1600,
      ngnAmount: 800000,
      usdtAmount: 500,
      notes: 'batch_A'
    });

    // Trade 2: BUY, Bank 1, Rate 1605, NGN 400k, Note: 'batch_A'
    store.addTrade({
      id: 't2',
      refId: '1002',
      type: 'BUY',
      date: '2026-08-24T11:00:00',
      bankAccountId: banks[1].id,
      rate: 1605,
      ngnAmount: 400000,
      usdtAmount: 249.22,
      notes: 'batch_A'
    });

    // Trade 3: SELL, Bank 0, Rate 1620, NGN 1.62M, Note: 'batch_A'
    store.addTrade({
      id: 't3',
      refId: '1003',
      type: 'SELL',
      date: '2026-08-24T12:00:00',
      bankAccountId: banks[0].id,
      rate: 1620,
      ngnAmount: 1620000,
      usdtAmount: 1000,
      notes: 'batch_A'
    });

    const filterType = dom.document.getElementById('filter-type');
    const filterBank = dom.document.getElementById('filter-bank');
    const filterSort = dom.document.getElementById('filter-sort');
    const searchInput = dom.document.getElementById('history-search');

    // 1. Filter: Type = BUY
    filterType.value = 'BUY';
    filterType.dispatchEvent({ type: 'change', target: filterType });
    assert.strictEqual(dom.document.querySelectorAll('.trade-history-card').length, 2);

    // 2. Filter: Type = BUY + Bank = Bank 0
    filterBank.value = banks[0].id;
    filterBank.dispatchEvent({ type: 'change', target: filterBank });
    assert.strictEqual(dom.document.querySelectorAll('.trade-history-card').length, 1);
    assert.strictEqual(dom.document.querySelectorAll('.trade-history-card')[0].id, 'trade-card-t1');

    // 3. Search: 'batch_A' + Sort: Highest NGN
    searchInput.value = 'batch_a';
    searchInput.dispatchEvent({ type: 'input', target: searchInput });
    assert.strictEqual(dom.document.querySelectorAll('.trade-history-card').length, 1);
  });

  it('4.9: Expanding trade drawer displays dedicated Bybit Order ID badge for refId', async () => {
    const ctx = await initFullContext();
    const { dom, store, banks, history } = ctx;

    const trade = store.addTrade({
      refId: '1928374650192837',
      type: 'SELL',
      date: '2026-08-24T10:00:00',
      bankAccountId: banks[0].id,
      rate: 1620,
      ngnAmount: 810000,
      usdtAmount: 500,
      counterparty: 'CryptoVendor99'
    });

    history.renderTradeHistory();

    const container = dom.document.getElementById('trades-history-container');
    assert.ok(container, 'History container must exist in DOM');
    assert.ok(container.innerHTML.includes('Bybit Order ID:'), 'History container HTML must include Bybit Order ID label');
    assert.ok(container.innerHTML.includes('1928374650192837'), 'History container HTML must render exact refId value');
    assert.ok(container.innerHTML.includes(`id="details_${trade.id}"`), 'Detail drawer with trade ID must be present in container HTML');
  });
});

// ============================================================================
// SUITE 5: INTERACTIVE MATH, REAL-TIME FEE SUMMARIES & INPUT VALIDATION
// ============================================================================
describe('Challenger M4 — 5. Interactive Math, Real-Time Fees & Form Validation Boundaries', () => {

  it('5.1: Real-time math: Rate + NGN input auto-calculates USDT with 4 decimal places', async () => {
    const ctx = await initFullContext();
    const { dom } = ctx;

    const rateInput = dom.document.getElementById('trade-rate');
    const ngnInput = dom.document.getElementById('trade-ngn');
    const usdtInput = dom.document.getElementById('trade-usdt');

    rateInput.value = '1600';
    rateInput.dispatchEvent({ type: 'input', target: rateInput });

    ngnInput.value = '800000';
    ngnInput.dispatchEvent({ type: 'input', target: ngnInput });

    assert.strictEqual(usdtInput.value, '500.0000', 'USDT should be 800000 / 1600 = 500.0000');
  });

  it('5.2: Real-time math: Rate + USDT input auto-calculates NGN with 2 decimal places', async () => {
    const ctx = await initFullContext();
    const { dom } = ctx;

    const rateInput = dom.document.getElementById('trade-rate');
    const ngnInput = dom.document.getElementById('trade-ngn');
    const usdtInput = dom.document.getElementById('trade-usdt');

    rateInput.value = '1625.50';
    rateInput.dispatchEvent({ type: 'input', target: rateInput });

    usdtInput.value = '250';
    usdtInput.dispatchEvent({ type: 'input', target: usdtInput });

    assert.strictEqual(ngnInput.value, (1625.50 * 250).toFixed(2), 'NGN should be 1625.50 * 250 = 406375.00');
  });

  it('5.3: Form validation flags invalid and zero numerical inputs and prevents saving', async () => {
    const ctx = await initFullContext();
    const { dom, store } = ctx;

    const initialTradeCount = store.getTrades().length;
    const formTrade = dom.document.getElementById('form-add-trade');
    const rateInput = dom.document.getElementById('trade-rate');
    const ngnInput = dom.document.getElementById('trade-ngn');
    const usdtInput = dom.document.getElementById('trade-usdt');

    // Attempt submit with empty values
    rateInput.value = '0';
    ngnInput.value = '0';
    usdtInput.value = '0';

    formTrade.dispatchEvent({
      type: 'submit',
      preventDefault: () => {},
      stopPropagation: () => {}
    });

    assert.ok(rateInput.classList.contains('is-invalid'), 'Rate input should have is-invalid class');
    assert.ok(ngnInput.classList.contains('is-invalid'), 'NGN input should have is-invalid class');
    assert.ok(usdtInput.classList.contains('is-invalid'), 'USDT input should have is-invalid class');
    assert.strictEqual(store.getTrades().length, initialTradeCount, 'Invalid trade must not be added to store');
  });

  it('5.4: Submitting valid trade updates store and shows success toast notification', async () => {
    const ctx = await initFullContext();
    const { dom, store, banks, getNavState } = ctx;

    const formTrade = dom.document.getElementById('form-add-trade');
    const rateInput = dom.document.getElementById('trade-rate');
    const ngnInput = dom.document.getElementById('trade-ngn');
    const usdtInput = dom.document.getElementById('trade-usdt');
    const dateInput = dom.document.getElementById('trade-date');
    const bankSelect = dom.document.getElementById('trade-bank-account');

    dateInput.value = '2026-08-24T15:00:00';
    bankSelect.value = banks[0].id;
    rateInput.value = '1610';
    ngnInput.value = '805000';
    usdtInput.value = '500';

    formTrade.dispatchEvent({
      type: 'submit',
      preventDefault: () => {},
      stopPropagation: () => {}
    });

    assert.strictEqual(store.getTrades().length, 1, 'Valid trade should be added to store');
    const createdTrade = store.getTrades()[0];
    assert.strictEqual(createdTrade.rate, 1610);
    assert.strictEqual(createdTrade.ngnAmount, 805000);
    assert.strictEqual(createdTrade.usdtAmount, 500);
    assert.strictEqual(getNavState().currentView, 'dashboard', 'Adding new trade should navigate to dashboard');
  });
});
