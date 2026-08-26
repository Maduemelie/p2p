/**
 * Tier 1: Feature Coverage — Milestone 4 Historical Analytics, Trend Chart & Snapshot Ledger UI
 * Complete unit, DOM lifecycle, and reactive integration tests for Features 13, 14, and 15
 */

const { describe, it, beforeEach } = require('../harness/test-runner');
const { assert } = require('../harness/assertions');
const { setupDomEnvironment, MockElement } = require('../harness/dom-mock');

describe('Tier 1: Milestone 4 Historical Analytics & Trend Chart UI Suite', () => {
  let dom;
  let dashboardViewModule;
  let dashboardModule;
  let storeModule;
  let utilsModule;

  beforeEach(async () => {
    dom = setupDomEnvironment();
    dashboardViewModule = await import('../../js/views/dashboard.view.js');
    dashboardModule = await import('../../js/dashboard.js');
    storeModule = await import('../../js/store.js');
    utilsModule = await import('../../js/utils.js');

    storeModule.store.clearAllData();

    // Mount Dashboard DOM
    dom.document.root.innerHTML = `
      <div id="main-content">
        ${dashboardViewModule.renderDashboardView()}
      </div>
    `;
  });

  // =========================================================================
  // 1. DOM MARKUP INTEGRITY
  // =========================================================================
  it('M4.1: Dashboard view renders #card-net-worth-trend with complete header, canvas, and history table markup', () => {
    const trendCard = dom.document.getElementById('card-net-worth-trend');
    assert.ok(trendCard, '#card-net-worth-trend must exist in dashboard view');

    // Filter buttons
    const filterContainer = dom.document.getElementById('chart-currency-filter');
    const btnBoth = dom.document.getElementById('filter-chart-both');
    const btnNgn = dom.document.getElementById('filter-chart-ngn');
    const btnUsdt = dom.document.getElementById('filter-chart-usdt');
    const btnToggleLog = dom.document.getElementById('btn-toggle-snapshot-log');

    assert.ok(filterContainer, '#chart-currency-filter must exist');
    assert.ok(btnBoth, '#filter-chart-both must exist');
    assert.ok(btnNgn, '#filter-chart-ngn must exist');
    assert.ok(btnUsdt, '#filter-chart-usdt must exist');
    assert.ok(btnToggleLog, '#btn-toggle-snapshot-log must exist');

    // Canvas container and empty state
    const canvas = dom.document.getElementById('netWorthTrendChart');
    const emptyState = dom.document.getElementById('chart-networth-empty-state');
    assert.ok(canvas, '<canvas id="netWorthTrendChart"> must exist');
    assert.ok(emptyState, '#chart-networth-empty-state must exist');

    // History section and table
    const historySection = dom.document.getElementById('snapshot-history-section');
    const table = dom.document.getElementById('table-snapshot-history');
    const tbody = dom.document.getElementById('snapshot-history-tbody');
    const countEl = dom.document.getElementById('snapshot-history-count');
    const countBadge = dom.document.getElementById('snapshot-history-count-badge');

    assert.ok(historySection, '#snapshot-history-section must exist');
    assert.ok(table, '#table-snapshot-history must exist');
    assert.ok(tbody, '#snapshot-history-tbody must exist');
    assert.ok(countEl, '#snapshot-history-count must exist');
    assert.ok(countBadge, '#snapshot-history-count-badge must exist');
  });

  // =========================================================================
  // 2. CHART EMPTY STATE & LIFECYCLE (< 2 SNAPSHOTS)
  // =========================================================================
  it('M4.2: renderNetWorthTrendChart displays empty state and hides canvas when 0 snapshots exist', () => {
    dashboardModule.renderNetWorthTrendChart();

    const canvas = dom.document.getElementById('netWorthTrendChart');
    const emptyState = dom.document.getElementById('chart-networth-empty-state');

    assert.strictEqual(emptyState.classList.contains('hidden'), false, 'Empty state must be visible');
    assert.strictEqual(canvas.classList.contains('hidden'), true, 'Canvas must be hidden');
  });

  it('M4.3: renderNetWorthTrendChart displays empty state when exactly 1 baseline snapshot exists', () => {
    storeModule.store.saveSnapshot({
      bankCash: 1000000,
      usdtBalance: 1000,
      referenceRate: 1500,
      netWorthNgn: 2500000,
      netWorthUsdt: 1666.67
    });

    dashboardModule.renderNetWorthTrendChart();

    const canvas = dom.document.getElementById('netWorthTrendChart');
    const emptyState = dom.document.getElementById('chart-networth-empty-state');

    assert.strictEqual(emptyState.classList.contains('hidden'), false, 'Empty state must be visible with 1 snapshot');
    assert.strictEqual(canvas.classList.contains('hidden'), true, 'Canvas must be hidden with 1 snapshot');
  });

  // =========================================================================
  // 3. CHART ACTIVE RENDERING (>= 2 SNAPSHOTS) & CURRENCY FILTERING
  // =========================================================================
  it('M4.4: renderNetWorthTrendChart builds dual-axis chart when >= 2 snapshots exist in both mode', () => {
    storeModule.store.saveSnapshot({
      timestamp: '2026-08-23T10:00:00Z',
      bankCash: 1000000,
      usdtBalance: 1000,
      referenceRate: 1500,
      netWorthNgn: 2500000,
      netWorthUsdt: 1666.67
    });
    storeModule.store.saveSnapshot({
      timestamp: '2026-08-24T10:00:00Z',
      bankCash: 1200000,
      usdtBalance: 1100,
      referenceRate: 1520,
      netWorthNgn: 2872000,
      netWorthUsdt: 1889.47
    });

    const chart = dashboardModule.renderNetWorthTrendChart('both');

    const canvas = dom.document.getElementById('netWorthTrendChart');
    const emptyState = dom.document.getElementById('chart-networth-empty-state');

    assert.strictEqual(emptyState.classList.contains('hidden'), true, 'Empty state must be hidden');
    assert.strictEqual(canvas.classList.contains('hidden'), false, 'Canvas must be visible');
    assert.ok(chart, 'Chart instance must be created');
    assert.strictEqual(chart.data.labels.length, 2);
    assert.strictEqual(chart.data.datasets.length, 2, 'Both mode must have 2 datasets (NGN & USDT)');
    assert.ok(chart.options.scales['y-ngn'], 'Dual axis must have y-ngn left axis');
    assert.ok(chart.options.scales['y-usdt'], 'Dual axis must have y-usdt right axis');
  });

  it('M4.5: Currency filter switches chart to single NGN and single USDT series with appropriate axis', () => {
    storeModule.store.saveSnapshot({
      timestamp: '2026-08-23T10:00:00Z',
      bankCash: 1000000,
      usdtBalance: 1000,
      referenceRate: 1500,
      netWorthNgn: 2500000,
      netWorthUsdt: 1666.67
    });
    storeModule.store.saveSnapshot({
      timestamp: '2026-08-24T10:00:00Z',
      bankCash: 1200000,
      usdtBalance: 1100,
      referenceRate: 1520,
      netWorthNgn: 2872000,
      netWorthUsdt: 1889.47
    });

    // Test NGN filter
    const ngnChart = dashboardModule.renderNetWorthTrendChart('ngn');
    assert.strictEqual(ngnChart.data.datasets.length, 1);
    assert.ok(ngnChart.data.datasets[0].label.includes('NGN'));
    assert.ok(ngnChart.options.scales.y, 'Single axis must use y scale');

    // Test USDT filter
    const usdtChart = dashboardModule.renderNetWorthTrendChart('usdt');
    assert.strictEqual(usdtChart.data.datasets.length, 1);
    assert.ok(usdtChart.data.datasets[0].label.includes('USDT'));
    assert.ok(usdtChart.options.scales.y, 'Single axis must use y scale');
  });

  it('M4.6: setupNetWorthChartFilters hooks filter button clicks and updates active class and chart series', () => {
    storeModule.store.saveSnapshot({ timestamp: '2026-08-23T10:00:00Z', bankCash: 1000000, usdtBalance: 1000, referenceRate: 1500, netWorthNgn: 2500000, netWorthUsdt: 1666.67 });
    storeModule.store.saveSnapshot({ timestamp: '2026-08-24T10:00:00Z', bankCash: 1200000, usdtBalance: 1100, referenceRate: 1520, netWorthNgn: 2872000, netWorthUsdt: 1889.47 });

    dashboardModule.setupNetWorthChartFilters();

    const btnBoth = dom.document.getElementById('filter-chart-both');
    const btnNgn = dom.document.getElementById('filter-chart-ngn');
    const btnUsdt = dom.document.getElementById('filter-chart-usdt');

    // Click NGN
    btnNgn.click();
    assert.strictEqual(btnNgn.classList.contains('active'), true);
    assert.strictEqual(btnBoth.classList.contains('active'), false);

    // Click USDT
    btnUsdt.click();
    assert.strictEqual(btnUsdt.classList.contains('active'), true);
    assert.strictEqual(btnNgn.classList.contains('active'), false);

    // Click Both
    btnBoth.click();
    assert.strictEqual(btnBoth.classList.contains('active'), true);
    assert.strictEqual(btnUsdt.classList.contains('active'), false);
  });

  // =========================================================================
  // 4. HISTORICAL SNAPSHOT TABLE LEDGER & SEQUENTIAL DELTAS
  // =========================================================================
  it('M4.7: renderSnapshotHistoryTable renders rows in reverse chronological order with sequential deltas', () => {
    const s1 = storeModule.store.saveSnapshot({
      id: 'snp_1',
      timestamp: '2026-08-20T10:00:00Z',
      bankCash: 1000000,
      usdtBalance: 1000,
      referenceRate: 1500,
      netWorthNgn: 2500000,
      netWorthUsdt: 1666.67,
      notes: 'Initial opening baseline'
    });
    const s2 = storeModule.store.saveSnapshot({
      id: 'snp_2',
      timestamp: '2026-08-21T10:00:00Z',
      bankCash: 1200000,
      usdtBalance: 1100,
      referenceRate: 1500,
      netWorthNgn: 2850000,
      netWorthUsdt: 1900.00,
      notes: 'Day 2 profit'
    });
    const s3 = storeModule.store.saveSnapshot({
      id: 'snp_3',
      timestamp: '2026-08-22T10:00:00Z',
      bankCash: 1100000,
      usdtBalance: 1050,
      referenceRate: 1500,
      netWorthNgn: 2675000,
      netWorthUsdt: 1783.33,
      notes: 'Day 3 market dip'
    });

    dashboardModule.renderSnapshotHistoryTable();

    const rows = dom.document.querySelectorAll('#snapshot-history-tbody tr');
    assert.strictEqual(rows.length, 3, 'Must render 3 table rows');

    // Row 0 must be s3 (newest), Row 2 must be s1 (oldest baseline)
    assert.strictEqual(rows[0].getAttribute('data-snapshot-id'), 'snp_3');
    assert.strictEqual(rows[1].getAttribute('data-snapshot-id'), 'snp_2');
    assert.strictEqual(rows[2].getAttribute('data-snapshot-id'), 'snp_1');

    // Delta badges:
    // s1 (row 2) is baseline
    assert.ok(rows[2].innerHTML.includes('Baseline'), 'Row 2 (s1) must have Baseline badge');

    // s2 (row 1) gained ₦350,000 (+14.00%) vs s1 -> badge-success
    assert.ok(rows[1].innerHTML.includes('badge-success'), 'Row 1 (s2) must have positive growth badge');
    assert.ok(rows[1].innerHTML.includes('+₦350,000.00'));

    // s3 (row 0) lost ₦175,000 (-6.14%) vs s2 -> badge-danger
    assert.ok(rows[0].innerHTML.includes('badge-danger'), 'Row 0 (s3) must have negative growth badge');
    assert.ok(rows[0].innerHTML.includes('-₦175,000.00'));
  });

  it('M4.8: Deleting snapshot removes it from store, refreshes table, and recalculates intermediate deltas', () => {
    storeModule.store.saveSnapshot({
      id: 's_a',
      timestamp: '2026-08-20T10:00:00Z',
      bankCash: 1000000,
      usdtBalance: 1000,
      referenceRate: 1500,
      netWorthNgn: 2000000,
      netWorthUsdt: 1333.33
    });
    storeModule.store.saveSnapshot({
      id: 's_b',
      timestamp: '2026-08-21T10:00:00Z',
      bankCash: 1000000,
      usdtBalance: 1000,
      referenceRate: 1500,
      netWorthNgn: 2400000,
      netWorthUsdt: 1600.00
    });
    storeModule.store.saveSnapshot({
      id: 's_c',
      timestamp: '2026-08-22T10:00:00Z',
      bankCash: 1000000,
      usdtBalance: 1000,
      referenceRate: 1500,
      netWorthNgn: 3000000,
      netWorthUsdt: 2000.00
    });

    dashboardModule.renderSnapshotHistoryTable();
    assert.strictEqual(dom.document.querySelectorAll('#snapshot-history-tbody tr').length, 3);

    // Delete intermediate snapshot s_b
    dashboardModule.executeDeleteSnapshot('s_b');

    // Remaining snapshots: s_a and s_c
    const remaining = storeModule.store.getSnapshots();
    assert.strictEqual(remaining.length, 2);
    assert.strictEqual(remaining[0].id, 's_a');
    assert.strictEqual(remaining[1].id, 's_c');

    const rows = dom.document.querySelectorAll('#snapshot-history-tbody tr');
    assert.strictEqual(rows.length, 2);
    assert.strictEqual(rows[0].getAttribute('data-snapshot-id'), 's_c');
    assert.strictEqual(rows[1].getAttribute('data-snapshot-id'), 's_a');

    // s_c delta recalculated vs s_a: ₦3,000,000 - ₦2,000,000 = +₦1,000,000 (+50.00%)
    assert.ok(rows[0].innerHTML.includes('+₦1,000,000.00'));
    assert.ok(rows[0].innerHTML.includes('+50.00%'));
  });

  it('M4.9: History log toggle button expands and collapses history section', () => {
    dashboardModule.setupNetWorthChartFilters();

    const btnToggle = dom.document.getElementById('btn-toggle-snapshot-log');
    const historySection = dom.document.getElementById('snapshot-history-section');

    // Initial state: expanded (not hidden)
    assert.strictEqual(historySection.classList.contains('hidden'), false);

    // Click to collapse
    btnToggle.click();
    assert.strictEqual(historySection.classList.contains('hidden'), true);
    assert.strictEqual(btnToggle.getAttribute('aria-expanded'), 'false');

    // Click to expand again
    btnToggle.click();
    assert.strictEqual(historySection.classList.contains('hidden'), false);
    assert.strictEqual(btnToggle.getAttribute('aria-expanded'), 'true');
  });

  it('M4.10: Reactive event store:updated refreshes both trend chart and snapshot table', () => {
    dashboardModule.initDashboard();

    const tbody = dom.document.getElementById('snapshot-history-tbody');
    assert.strictEqual(tbody.children.length, 0);

    // Add snapshots directly to store and dispatch store:updated
    storeModule.store.saveSnapshot({
      id: 'snap_rx_1',
      timestamp: '2026-08-24T10:00:00Z',
      bankCash: 1000000,
      usdtBalance: 1000,
      referenceRate: 1500,
      netWorthNgn: 2500000,
      netWorthUsdt: 1666.67
    });
    storeModule.store.saveSnapshot({
      id: 'snap_rx_2',
      timestamp: '2026-08-25T10:00:00Z',
      bankCash: 1500000,
      usdtBalance: 1200,
      referenceRate: 1500,
      netWorthNgn: 3300000,
      netWorthUsdt: 2200.00
    });

    window.dispatchEvent(new CustomEvent('store:updated', { detail: { type: 'snapshots' } }));

    const refreshedRows = dom.document.querySelectorAll('#snapshot-history-tbody tr');
    assert.strictEqual(refreshedRows.length, 2, 'Snapshot rows must update reactively');

    const emptyState = dom.document.getElementById('chart-networth-empty-state');
    assert.strictEqual(emptyState.classList.contains('hidden'), true, 'Chart empty state must hide reactively');
  });
}, { tier: 1, category: 'Milestone 4 Historical Analytics & Trend Chart' });
