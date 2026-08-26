/**
 * Tier 1: Feature Coverage — M2: Live Net Worth Dashboard Widget UI & Reactive Updates
 */

const { describe, it, beforeEach } = require('../harness/test-runner');
const { assert } = require('../harness/assertions');
const { setupDomEnvironment, MockElement } = require('../harness/dom-mock');

describe('Tier 1 — M2: Live Net Worth Dashboard Widget & Reactive Updates', () => {
  let dom;
  let utils;
  let store;
  let dashboardView;
  let dashboardModule;

  beforeEach(async () => {
    dom = setupDomEnvironment();
    utils = await import('../../js/utils.js');
    const storeModule = await import('../../js/store.js');
    store = storeModule.store;
    dashboardView = await import('../../js/views/dashboard.view.js');
    dashboardModule = await import('../../js/dashboard.js');
    store.clearAllData();
  });

  // ========================================================
  // 1. Template Structure & DOM Hierarchy
  // ========================================================
  it('M2.1: renderDashboardView() includes #card-net-worth Hero Card and essential elements', () => {
    const html = dashboardView.renderDashboardView();
    assert.ok(html.includes('id="card-net-worth"'), 'Must contain #card-net-worth');
    assert.ok(html.includes('id="stat-net-worth-ngn"'), 'Must contain #stat-net-worth-ngn');
    assert.ok(html.includes('id="stat-net-worth-usdt"'), 'Must contain #stat-net-worth-usdt');
    assert.ok(html.includes('id="badge-net-worth-delta"'), 'Must contain #badge-net-worth-delta');
    assert.ok(html.includes('id="btn-open-snapshot-modal"'), 'Must contain #btn-open-snapshot-modal');
    assert.ok(html.includes('id="metric-nw-bank-cash"'), 'Must contain #metric-nw-bank-cash');
    assert.ok(html.includes('id="metric-nw-bybit-usdt"'), 'Must contain #metric-nw-bybit-usdt');
    assert.ok(html.includes('id="metric-nw-ref-rate"'), 'Must contain #metric-nw-ref-rate');
  });

  // ========================================================
  // 2. renderNetWorthWidget() Calculation & Formatting
  // ========================================================
  it('M2.2: renderNetWorthWidget() populates DOM with computed bank cash, USDT, reference rate, and net worth', () => {
    // Setup DOM
    const viewContainer = document.getElementById('view-container') || document.body;
    viewContainer.innerHTML = dashboardView.renderDashboardView();

    // Setup Store Data: Bank Cash = ₦2,000,000, FIFO USDT = 1,000 @ ₦1,500
    store.addBankAccount({ name: 'Access Bank', initialBalance: 2000000 });
    store.setOpeningInventory({ startingUsdtBalance: 1000, defaultCostBasis: 1500 });

    dashboardModule.renderNetWorthWidget();

    const statNgn = document.getElementById('stat-net-worth-ngn');
    const statUsdt = document.getElementById('stat-net-worth-usdt');
    const metricBank = document.getElementById('metric-nw-bank-cash');
    const metricUsdt = document.getElementById('metric-nw-bybit-usdt');
    const metricRate = document.getElementById('metric-nw-ref-rate');

    // Expected: Bank Cash = ₦2,000,000, USDT = 1000 @ 1500 => NGN = ₦3,500,000.00, USDT = 2,333.33 USDT
    assert.strictEqual(statNgn.textContent, '₦3,500,000.00');
    assert.strictEqual(statUsdt.textContent, '2,333.33 USDT');
    assert.strictEqual(metricBank.textContent, '₦2,000,000.00');
    assert.strictEqual(metricUsdt.textContent, '1,000.00 USDT');
    assert.strictEqual(metricRate.textContent, '₦1,500.00 / USDT');
  });

  // ========================================================
  // 3. Live Delta Badge States
  // ========================================================
  it('M2.3: Delta Badge displays "Baseline on next snapshot" when no snapshots exist', () => {
    const viewContainer = document.getElementById('view-container') || document.body;
    viewContainer.innerHTML = dashboardView.renderDashboardView();

    store.addBankAccount({ name: 'GTB', initialBalance: 1000000 });
    dashboardModule.renderNetWorthWidget();

    const badge = document.getElementById('badge-net-worth-delta');
    assert.ok(badge.classList.contains('badge-neutral'));
    assert.ok(badge.textContent.includes('Baseline on next snapshot'));
    assert.ok(badge.innerHTML.includes('data-lucide="info"'));
  });

  it('M2.4: Delta Badge displays positive gain (.badge-success, trending-up, + sign) when net worth increased', () => {
    const viewContainer = document.getElementById('view-container') || document.body;
    viewContainer.innerHTML = dashboardView.renderDashboardView();

    // Baseline snapshot: ₦3,000,000
    store.saveSnapshot({
      bankCash: 1500000,
      usdtBalance: 1000,
      referenceRate: 1500,
      netWorthNgn: 3000000,
      netWorthUsdt: 2000
    });

    // Current state: ₦3,300,000 (10% gain)
    store.addBankAccount({ name: 'OPay', initialBalance: 1800000 });
    store.setOpeningInventory({ startingUsdtBalance: 1000, defaultCostBasis: 1500 });

    dashboardModule.renderNetWorthWidget();

    const badge = document.getElementById('badge-net-worth-delta');
    assert.ok(badge.classList.contains('badge-success'), 'Should have badge-success class');
    assert.ok(badge.innerHTML.includes('data-lucide="trending-up"'), 'Should show trending-up icon');
    assert.ok(badge.textContent.includes('+₦300,000.00 (+10.00%)'), 'Should show formatted +₦300k and +10%');
  });

  it('M2.5: Delta Badge displays negative drop (.badge-danger, trending-down) when net worth decreased', () => {
    const viewContainer = document.getElementById('view-container') || document.body;
    viewContainer.innerHTML = dashboardView.renderDashboardView();

    // Baseline snapshot: ₦4,000,000
    store.saveSnapshot({
      bankCash: 2500000,
      usdtBalance: 1000,
      referenceRate: 1500,
      netWorthNgn: 4000000,
      netWorthUsdt: 2666.67
    });

    // Current state: ₦3,800,000 (-5% drop)
    store.addBankAccount({ name: 'Kuda', initialBalance: 2300000 });
    store.setOpeningInventory({ startingUsdtBalance: 1000, defaultCostBasis: 1500 });

    dashboardModule.renderNetWorthWidget();

    const badge = document.getElementById('badge-net-worth-delta');
    assert.ok(badge.classList.contains('badge-danger'), 'Should have badge-danger class');
    assert.ok(badge.innerHTML.includes('data-lucide="trending-down"'), 'Should show trending-down icon');
    assert.ok(badge.textContent.includes('-₦200,000.00 (-5.00%)'), 'Should show formatted -₦200k and -5%');
  });

  it('M2.6: Delta Badge displays neutral flat (.badge-neutral, minus) when net worth matches baseline', () => {
    const viewContainer = document.getElementById('view-container') || document.body;
    viewContainer.innerHTML = dashboardView.renderDashboardView();

    // Baseline snapshot: ₦3,500,000
    store.saveSnapshot({
      bankCash: 2000000,
      usdtBalance: 1000,
      referenceRate: 1500,
      netWorthNgn: 3500000,
      netWorthUsdt: 2333.33
    });

    // Current state: ₦3,500,000
    store.addBankAccount({ name: 'Zenith', initialBalance: 2000000 });
    store.setOpeningInventory({ startingUsdtBalance: 1000, defaultCostBasis: 1500 });

    dashboardModule.renderNetWorthWidget();

    const badge = document.getElementById('badge-net-worth-delta');
    assert.ok(badge.classList.contains('badge-neutral'), 'Should have badge-neutral class');
    assert.ok(badge.innerHTML.includes('data-lucide="minus"'), 'Should show minus icon');
    assert.ok(badge.textContent.includes('₦0.00 (0.00%)'), 'Should show ₦0.00 (0.00%)');
  });

  // ========================================================
  // 4. Reactivity & Event Flow
  // ========================================================
  it('M2.7: initDashboard() hooks store:updated events to recalculate Net Worth widget', () => {
    const viewContainer = document.getElementById('view-container') || document.body;
    viewContainer.innerHTML = dashboardView.renderDashboardView();

    dashboardModule.initDashboard();

    const bank = store.addBankAccount({ name: 'Stanbic', initialBalance: 1000000 });
    store.setOpeningInventory({ startingUsdtBalance: 500, defaultCostBasis: 1500 });

    // Trigger store update
    window.dispatchEvent(new CustomEvent('store:updated', { detail: { type: 'trades' } }));

    const statNgn = document.getElementById('stat-net-worth-ngn');
    assert.strictEqual(statNgn.textContent, '₦1,750,000.00');
  });

  it('M2.8: #btn-open-snapshot-modal click dispatches modal:open-snapshot event or invokes handler', () => {
    const viewContainer = document.getElementById('view-container') || document.body;
    viewContainer.innerHTML = dashboardView.renderDashboardView();

    let modalOpened = false;
    window.addEventListener('modal:open-snapshot', () => {
      modalOpened = true;
    });

    dashboardModule.initDashboard();

    const btn = document.getElementById('btn-open-snapshot-modal');
    assert.ok(btn, 'Button must exist');
    btn.click();

    assert.strictEqual(modalOpened, true, 'Clicking button must dispatch modal:open-snapshot event');
  });

  // ========================================================
  // 5. Utility Formatting Helpers
  // ========================================================
  it('M2.9: formatDeltaBadgeText formats positive, negative, zero, and micro values', () => {
    assert.strictEqual(utils.formatDeltaBadgeText(150000, 5), '+₦150,000.00 (+5.00%)');
    assert.strictEqual(utils.formatDeltaBadgeText(-75000, -2.5), '-₦75,000.00 (-2.50%)');
    assert.strictEqual(utils.formatDeltaBadgeText(0, 0), '₦0.00 (0.00%)');
    assert.strictEqual(utils.formatDeltaBadgeText(0.001, 0), '₦0.00 (0.00%)');
  });

  it('M2.10: formatDeltaUsdtText formats positive, negative, and zero USDT deltas', () => {
    assert.strictEqual(utils.formatDeltaUsdtText(200), '+200.00 USDT');
    assert.strictEqual(utils.formatDeltaUsdtText(-125.5), '-125.50 USDT');
    assert.strictEqual(utils.formatDeltaUsdtText(0), '0.00 USDT');
  });
}, { tier: 1, category: 'Net Worth Widget' });
