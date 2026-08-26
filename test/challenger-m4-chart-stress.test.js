/**
 * Milestone 4 Empirical Challenger: Chart.js Stress & Adversarial Test Suite
 * 
 * Target: `js/dashboard.js`, `js/views/dashboard.view.js`, `js/utils.js`, `js/store.js`
 * Agent: `m4_challenger_1` (Role: Milestone 4 Chart.js Stress Challenger)
 * 
 * Dimensions Challenged:
 * 1. Chart Lifecycle & Rapid Currency Filter Switches (Instance destruction, canvas reuse, memory leak prevention)
 * 2. Snapshot Edge Cases (0 snapshots, 1 snapshot, 2 snapshots, 100+ dense historical snapshots)
 * 3. Extreme Valuation Numbers, Axes, and Tooltips (Trillions, negative, zero, floats, NaNs, long notes, XSS)
 * 4. Dual vs Single Y-Axis Mechanics & Scale Integrity
 * 5. Reactive Event Handling, Deletion Sync & Dynamic DOM Transitions
 */

const { describe, it, beforeEach } = require('./harness/test-runner');
const { assert } = require('./harness/assertions');
const { setupDomEnvironment, MockElement } = require('./harness/dom-mock');

describe('Challenger M4: Chart.js Lifecycle, Filter Switching & Edge Stress Suite', () => {
  let dom;
  let dashboardViewModule;
  let dashboardModule;
  let storeModule;
  let utilsModule;
  let chartDestroyCount = 0;
  let createdChartInstances = [];

  class InstrumentedMockChart {
    constructor(ctx, config = {}) {
      this.ctx = ctx;
      this.type = config.type || 'line';
      this.data = config.data || { labels: [], datasets: [] };
      this.options = config.options || {};
      this.destroyed = false;
      createdChartInstances.push(this);
    }
    destroy() {
      this.destroyed = true;
      chartDestroyCount++;
    }
    update() {}
  }

  beforeEach(async () => {
    dom = setupDomEnvironment();
    chartDestroyCount = 0;
    createdChartInstances = [];

    // Replace global Chart with Instrumented Mock
    global.Chart = InstrumentedMockChart;
    dom.window.Chart = InstrumentedMockChart;

    dashboardViewModule = await import('../js/views/dashboard.view.js');
    dashboardModule = await import('../js/dashboard.js');
    storeModule = await import('../js/store.js');
    utilsModule = await import('../js/utils.js');

    storeModule.store.clearAllData();

    // Mount Dashboard View DOM
    dom.document.root.innerHTML = `
      <div id="main-content">
        ${dashboardViewModule.renderDashboardView()}
      </div>
    `;
  });

  // =========================================================================
  // 1. CHART LIFECYCLE & RAPID CURRENCY FILTER SWITCHING
  // =========================================================================

  it('M4-CH-CHART.1: Destroy old Chart instance whenever renderNetWorthTrendChart is re-invoked', () => {
    storeModule.store.saveSnapshot({ timestamp: '2026-08-20T10:00:00Z', bankCash: 1000000, usdtBalance: 1000, referenceRate: 1500, netWorthNgn: 2500000, netWorthUsdt: 1666.67 });
    storeModule.store.saveSnapshot({ timestamp: '2026-08-21T10:00:00Z', bankCash: 1200000, usdtBalance: 1100, referenceRate: 1500, netWorthNgn: 2850000, netWorthUsdt: 1900.00 });

    // Initial render
    const chart1 = dashboardModule.renderNetWorthTrendChart('both');
    assert.ok(chart1, 'Initial chart instance must be created');
    assert.strictEqual(chart1.destroyed, false);

    // Re-render with NGN
    const chart2 = dashboardModule.renderNetWorthTrendChart('ngn');
    assert.ok(chart2, 'Second chart instance must be created');
    assert.strictEqual(chart1.destroyed, true, 'First chart must be destroyed');
    assert.strictEqual(chart2.destroyed, false);

    // Re-render with USDT
    const chart3 = dashboardModule.renderNetWorthTrendChart('usdt');
    assert.strictEqual(chart2.destroyed, true, 'Second chart must be destroyed');
    assert.strictEqual(chart3.destroyed, false);
  });

  it('M4-CH-CHART.2: Rapid 60-cycle currency filter switching stress test (both -> ngn -> usdt -> both)', () => {
    storeModule.store.saveSnapshot({ timestamp: '2026-08-20T10:00:00Z', bankCash: 1000000, usdtBalance: 1000, referenceRate: 1500, netWorthNgn: 2500000, netWorthUsdt: 1666.67 });
    storeModule.store.saveSnapshot({ timestamp: '2026-08-21T10:00:00Z', bankCash: 1200000, usdtBalance: 1100, referenceRate: 1500, netWorthNgn: 2850000, netWorthUsdt: 1900.00 });

    // Reset tracking counters prior to loop execution
    createdChartInstances = [];
    chartDestroyCount = 0;

    const sequence = [
      { curr: 'ngn', expectedDatasets: 1, expectedScale: 'y' },
      { curr: 'usdt', expectedDatasets: 1, expectedScale: 'y' },
      { curr: 'both', expectedDatasets: 2, expectedScale: 'y-ngn' },
      { curr: 'usdt', expectedDatasets: 1, expectedScale: 'y' },
      { curr: 'ngn', expectedDatasets: 1, expectedScale: 'y' },
      { curr: 'both', expectedDatasets: 2, expectedScale: 'y-ngn' }
    ];

    // Execute 10 iterations of the 6-step sequence = 60 programmatic switches
    for (let cycle = 0; cycle < 10; cycle++) {
      for (const step of sequence) {
        dashboardModule.renderNetWorthTrendChart(step.curr);
        const activeChart = createdChartInstances[createdChartInstances.length - 1];
        assert.ok(activeChart, 'Active chart must exist');
        assert.strictEqual(activeChart.destroyed, false, 'Current chart must not be marked destroyed');
        assert.strictEqual(activeChart.data.datasets.length, step.expectedDatasets, `Cycle ${cycle} ${step.curr} dataset count mismatch`);
        assert.ok(activeChart.options.scales[step.expectedScale], `Cycle ${cycle} ${step.curr} scale mismatch`);
      }
    }

    assert.strictEqual(createdChartInstances.length, 60, 'Exactly 60 instances created');
    assert.strictEqual(chartDestroyCount, 60, 'Exactly 60 prior instances destroyed across all calls');
  });

  it('M4-CH-CHART.3: Invalid currency string arguments fallback gracefully to active/both mode without throwing', () => {
    storeModule.store.saveSnapshot({ timestamp: '2026-08-20T10:00:00Z', bankCash: 1000000, usdtBalance: 1000, referenceRate: 1500, netWorthNgn: 2500000, netWorthUsdt: 1666.67 });
    storeModule.store.saveSnapshot({ timestamp: '2026-08-21T10:00:00Z', bankCash: 1200000, usdtBalance: 1100, referenceRate: 1500, netWorthNgn: 2850000, netWorthUsdt: 1900.00 });

    const testInputs = ['UNKNOWN', '', null, undefined, 'NGN_USDT', 'BOTH', 'ngn', 'usdt'];

    for (const invalid of testInputs) {
      assert.doesNotThrow(() => {
        const chart = dashboardModule.renderNetWorthTrendChart(invalid);
        assert.ok(chart, `Must handle string input [${invalid}] safely`);
      }, `Input ${invalid} must not throw`);
    }
  });

  it('M4-CH-CHART.4: Missing canvas element in DOM exits cleanly with null', () => {
    // Remove canvas from DOM
    const canvas = dom.document.getElementById('netWorthTrendChart');
    if (canvas && canvas.parentElement) {
      canvas.parentElement.children = canvas.parentElement.children.filter(c => c !== canvas);
    }

    const result = dashboardModule.renderNetWorthTrendChart('both');
    assert.strictEqual(result, null, 'Must return null when canvas is missing');
  });

  it('M4-CH-CHART.5: Missing global Chart constructor exits cleanly with null without crash', () => {
    storeModule.store.saveSnapshot({ timestamp: '2026-08-20T10:00:00Z', bankCash: 1000000, usdtBalance: 1000, referenceRate: 1500, netWorthNgn: 2500000, netWorthUsdt: 1666.67 });
    storeModule.store.saveSnapshot({ timestamp: '2026-08-21T10:00:00Z', bankCash: 1200000, usdtBalance: 1100, referenceRate: 1500, netWorthNgn: 2850000, netWorthUsdt: 1900.00 });

    const originalGlobalChart = global.Chart;
    delete global.Chart;
    delete dom.window.Chart;

    const result = dashboardModule.renderNetWorthTrendChart('both');
    assert.strictEqual(result, null, 'Must return null safely when Chart is undefined');

    // Restore
    global.Chart = originalGlobalChart;
    dom.window.Chart = originalGlobalChart;
  });

  // =========================================================================
  // 2. SNAPSHOT BOUNDARY & EMPTY STATE LOGIC (0, 1, 2, 100+ DENSE)
  // =========================================================================

  it('M4-CH-CHART.6: 0 snapshots displays empty state banner with initial guidance, hides canvas, returns null', () => {
    assert.strictEqual(storeModule.store.getSnapshots().length, 0);

    const chart = dashboardModule.renderNetWorthTrendChart('both');
    assert.strictEqual(chart, null);

    const canvas = dom.document.getElementById('netWorthTrendChart');
    const emptyState = dom.document.getElementById('chart-networth-empty-state');

    assert.strictEqual(canvas.classList.contains('hidden'), true, 'Canvas must be hidden');
    assert.strictEqual(emptyState.classList.contains('hidden'), false, 'Empty state must be visible');
  });

  it('M4-CH-CHART.7: 1 snapshot displays empty state banner with 2-snapshot requirement guidance, hides canvas, returns null', () => {
    storeModule.store.saveSnapshot({
      timestamp: '2026-08-20T10:00:00Z',
      bankCash: 1000000,
      usdtBalance: 1000,
      referenceRate: 1500,
      netWorthNgn: 2500000,
      netWorthUsdt: 1666.67
    });

    const chart = dashboardModule.renderNetWorthTrendChart('both');
    assert.strictEqual(chart, null);

    const canvas = dom.document.getElementById('netWorthTrendChart');
    const emptyState = dom.document.getElementById('chart-networth-empty-state');

    assert.strictEqual(canvas.classList.contains('hidden'), true, 'Canvas must be hidden');
    assert.strictEqual(emptyState.classList.contains('hidden'), false, 'Empty state must be visible');
  });

  it('M4-CH-CHART.8: Dynamic snapshot transition: 0 -> 1 -> 2 -> 3 -> 2 -> 1 -> 0 with clean state transitions', () => {
    const canvas = dom.document.getElementById('netWorthTrendChart');
    const emptyState = dom.document.getElementById('chart-networth-empty-state');

    // Step 1: 0 snapshots
    dashboardModule.renderNetWorthTrendChart();
    assert.strictEqual(canvas.classList.contains('hidden'), true);
    assert.strictEqual(emptyState.classList.contains('hidden'), false);

    // Step 2: Add 1st snapshot -> still < 2 snapshots
    const s1 = storeModule.store.saveSnapshot({ id: 's1', timestamp: '2026-08-20T10:00:00Z', bankCash: 1000000, usdtBalance: 1000, referenceRate: 1500, netWorthNgn: 2500000, netWorthUsdt: 1666.67 });
    dashboardModule.renderNetWorthTrendChart();
    assert.strictEqual(canvas.classList.contains('hidden'), true);
    assert.strictEqual(emptyState.classList.contains('hidden'), false);

    // Step 3: Add 2nd snapshot -> >= 2 snapshots (Active Chart)
    const s2 = storeModule.store.saveSnapshot({ id: 's2', timestamp: '2026-08-21T10:00:00Z', bankCash: 1200000, usdtBalance: 1100, referenceRate: 1500, netWorthNgn: 2850000, netWorthUsdt: 1900.00 });
    const chartStep3 = dashboardModule.renderNetWorthTrendChart();
    assert.ok(chartStep3);
    assert.strictEqual(canvas.classList.contains('hidden'), false, 'Canvas must be revealed');
    assert.strictEqual(emptyState.classList.contains('hidden'), true, 'Empty state must be hidden');
    assert.strictEqual(chartStep3.data.labels.length, 2);

    // Step 4: Add 3rd snapshot
    const s3 = storeModule.store.saveSnapshot({ id: 's3', timestamp: '2026-08-22T10:00:00Z', bankCash: 1400000, usdtBalance: 1200, referenceRate: 1500, netWorthNgn: 3200000, netWorthUsdt: 2133.33 });
    const chartStep4 = dashboardModule.renderNetWorthTrendChart();
    assert.strictEqual(chartStep4.data.labels.length, 3);

    // Step 5: Delete 3rd snapshot -> drops to 2 snapshots
    dashboardModule.executeDeleteSnapshot('s3');
    const chartStep5 = createdChartInstances[createdChartInstances.length - 1];
    assert.strictEqual(canvas.classList.contains('hidden'), false);
    assert.strictEqual(emptyState.classList.contains('hidden'), true);
    assert.strictEqual(chartStep5.data.labels.length, 2);

    // Step 6: Delete 2nd snapshot -> drops to 1 snapshot (< 2)
    dashboardModule.executeDeleteSnapshot('s2');
    assert.strictEqual(canvas.classList.contains('hidden'), true, 'Canvas must hide when falling to 1 snapshot');
    assert.strictEqual(emptyState.classList.contains('hidden'), false, 'Empty state must show when falling to 1 snapshot');

    // Step 7: Delete 1st snapshot -> drops to 0 snapshots
    dashboardModule.executeDeleteSnapshot('s1');
    assert.strictEqual(canvas.classList.contains('hidden'), true);
    assert.strictEqual(emptyState.classList.contains('hidden'), false);
  });

  it('M4-CH-CHART.9: Dense historical data (25 vs 26 vs 120 snapshots) adjusts pointRadius and pointHoverRadius', () => {
    // Test 25 snapshots: pointRadius=4, pointHoverRadius=6
    for (let i = 0; i < 25; i++) {
      storeModule.store.saveSnapshot({
        id: `dense_25_${i}`,
        timestamp: new Date(Date.now() - (25 - i) * 86400000).toISOString(),
        bankCash: 1000000 + i * 10000,
        usdtBalance: 1000 + i * 10,
        referenceRate: 1500,
        netWorthNgn: 2500000 + i * 25000,
        netWorthUsdt: 1666.67 + i * 16.67
      });
    }

    const chart25 = dashboardModule.renderNetWorthTrendChart('both');
    assert.strictEqual(chart25.data.datasets[0].pointRadius, 4, '25 snapshots should have pointRadius=4');
    assert.strictEqual(chart25.data.datasets[0].pointHoverRadius, 6, '25 snapshots should have pointHoverRadius=6');

    // Add 26th snapshot: threshold crossed -> pointRadius=2, pointHoverRadius=4
    storeModule.store.saveSnapshot({
      id: 'dense_26',
      timestamp: new Date().toISOString(),
      bankCash: 1260000,
      usdtBalance: 1260,
      referenceRate: 1500,
      netWorthNgn: 3150000,
      netWorthUsdt: 2100.00
    });

    const chart26 = dashboardModule.renderNetWorthTrendChart('both');
    assert.strictEqual(chart26.data.datasets[0].pointRadius, 2, '26 snapshots should shrink pointRadius to 2');
    assert.strictEqual(chart26.data.datasets[0].pointHoverRadius, 4, '26 snapshots should shrink pointHoverRadius to 4');

    // Add up to 120 dense snapshots
    for (let i = 27; i <= 120; i++) {
      storeModule.store.saveSnapshot({
        id: `dense_120_${i}`,
        timestamp: new Date(Date.now() + i * 86400000).toISOString(),
        bankCash: 1000000 + i * 10000,
        usdtBalance: 1000 + i * 10,
        referenceRate: 1500,
        netWorthNgn: 2500000 + i * 25000,
        netWorthUsdt: 1666.67 + i * 16.67
      });
    }

    const chart120 = dashboardModule.renderNetWorthTrendChart('both');
    assert.strictEqual(chart120.data.labels.length, 120, '120 labels must be generated');
    assert.strictEqual(chart120.data.datasets[0].data.length, 120, '120 NGN points mapped');
    assert.strictEqual(chart120.data.datasets[1].data.length, 120, '120 USDT points mapped');
    assert.strictEqual(chart120.data.datasets[0].pointRadius, 2);
    assert.strictEqual(chart120.data.datasets[0].pointHoverRadius, 4);
  });

  it('M4-CH-CHART.10: Malformed/corrupted timestamps in snapshots fallback cleanly to index numbers in X-axis labels', () => {
    // Inject corrupted timestamps directly into localStorage to test rendering robustness
    const corruptedSnapshots = [
      { id: 'bad_1', timestamp: null, bankCash: 1000000, usdtBalance: 1000, referenceRate: 1500, netWorthNgn: 2500000, netWorthUsdt: 1666.67 },
      { id: 'bad_2', timestamp: 'INVALID_DATE_STRING', bankCash: 1200000, usdtBalance: 1100, referenceRate: 1500, netWorthNgn: 2850000, netWorthUsdt: 1900.00 },
      { id: 'good_3', timestamp: '2026-08-25T14:30:00.000Z', bankCash: 1300000, usdtBalance: 1150, referenceRate: 1500, netWorthNgn: 3025000, netWorthUsdt: 2016.67 }
    ];
    dom.localStorage.setItem('bybit_p2p_net_worth_snapshots', JSON.stringify(corruptedSnapshots));

    const chart = dashboardModule.renderNetWorthTrendChart('both');
    assert.ok(chart);
    assert.strictEqual(chart.data.labels[0], '#1', 'Null timestamp must fallback to #1');
    assert.strictEqual(chart.data.labels[1], '#2', 'Invalid date string must fallback to #2');
    assert.ok(chart.data.labels[2].includes('Aug') || chart.data.labels[2].includes('25'), 'Valid date formatted cleanly');
  });

  // =========================================================================
  // 3. EXTREME VALUATION NUMBERS, AXES TICK CALLBACKS & TOOLTIPS
  // =========================================================================

  it('M4-CH-CHART.11: Extreme valuations (Trillions NGN, Hundreds of Millions USDT, Zero, Negative) format properly', () => {
    // 1. Extreme Wealth (1 Trillion NGN)
    storeModule.store.saveSnapshot({
      id: 'snp_trillion',
      timestamp: '2026-08-20T10:00:00Z',
      bankCash: 500000000000,
      usdtBalance: 333333333.33,
      referenceRate: 1500,
      netWorthNgn: 1000000000000,
      netWorthUsdt: 666666666.67
    });

    // 2. Total Zero Net Worth
    storeModule.store.saveSnapshot({
      id: 'snp_zero',
      timestamp: '2026-08-21T10:00:00Z',
      bankCash: 0,
      usdtBalance: 0,
      referenceRate: 1500,
      netWorthNgn: 0,
      netWorthUsdt: 0
    });

    // 3. Severe Negative Net Worth (-₦50,000,000 NGN)
    storeModule.store.saveSnapshot({
      id: 'snp_negative',
      timestamp: '2026-08-22T10:00:00Z',
      bankCash: -60000000,
      usdtBalance: 6666.67,
      referenceRate: 1500,
      netWorthNgn: -50000000,
      netWorthUsdt: -33333.33
    });

    // 4. High-precision float valuation
    storeModule.store.saveSnapshot({
      id: 'snp_float',
      timestamp: '2026-08-23T10:00:00Z',
      bankCash: 1234567.8912,
      usdtBalance: 823.0452,
      referenceRate: 1500.1234,
      netWorthNgn: 2469248.8876,
      netWorthUsdt: 1646.0305
    });

    const chart = dashboardModule.renderNetWorthTrendChart('both');
    assert.ok(chart);

    // Verify dataset raw mapping
    assert.strictEqual(chart.data.datasets[0].data[0], 1000000000000);
    assert.strictEqual(chart.data.datasets[0].data[1], 0);
    assert.strictEqual(chart.data.datasets[0].data[2], -50000000);
    assert.strictEqual(chart.data.datasets[0].data[3], 2469248.8876);

    // Test Y-NGN Tick Callback
    const ngnTickFn = chart.options.scales['y-ngn'].ticks.callback;
    assert.strictEqual(ngnTickFn(1000000000000), '₦1,000,000,000,000');
    assert.strictEqual(ngnTickFn(0), '₦0');
    assert.strictEqual(ngnTickFn(-50000000), '-₦50,000,000');

    // Test Y-USDT Tick Callback
    const usdtTickFn = chart.options.scales['y-usdt'].ticks.callback;
    assert.strictEqual(usdtTickFn(666666666.67), '666,666,667 USDT');
    assert.strictEqual(usdtTickFn(0), '0 USDT');
    assert.strictEqual(usdtTickFn(-33333.33), '-33,333 USDT');
  });

  it('M4-CH-CHART.12: Tooltip callbacks (title, label, afterBody) execute safely across edge cases', () => {
    storeModule.store.saveSnapshot({
      id: 'snp_full',
      timestamp: '2026-08-24T15:30:00Z',
      bankCash: 1500000,
      usdtBalance: 1000,
      referenceRate: 1520,
      netWorthNgn: 3020000,
      netWorthUsdt: 1986.84,
      notes: 'Standard trading day with regular arbitrage'
    });

    storeModule.store.saveSnapshot({
      id: 'snp_sparse',
      timestamp: '2026-08-25T15:30:00Z',
      bankCash: 0,
      usdtBalance: 0,
      referenceRate: null,
      netWorthNgn: 0,
      netWorthUsdt: 0,
      notes: ''
    });

    storeModule.store.saveSnapshot({
      id: 'snp_long_notes_xss',
      timestamp: '2026-08-26T15:30:00Z',
      bankCash: 2000000,
      usdtBalance: 1500,
      referenceRate: 1550,
      netWorthNgn: 4325000,
      netWorthUsdt: 2790.32,
      notes: '<script>alert("XSS")</script> Very long notes that exceed forty characters to verify truncation in Chart.js tooltips!'
    });

    const chart = dashboardModule.renderNetWorthTrendChart('both');
    const tooltipCallbacks = chart.options.plugins.tooltip.callbacks;

    // 1. Test Title Callback
    assert.ok(tooltipCallbacks.title([{ dataIndex: 0 }]).includes('2026') || tooltipCallbacks.title([{ dataIndex: 0 }]).includes('Aug'));
    assert.strictEqual(tooltipCallbacks.title([]), '', 'Empty items array returns empty string');
    assert.strictEqual(tooltipCallbacks.title(null), '', 'Null items returns empty string');

    // 2. Test Label Callback
    const ngnContext = { dataset: { label: 'Net Worth (₦ NGN)', yAxisID: 'y-ngn' }, parsed: { y: 3020000 } };
    const usdtContext = { dataset: { label: 'Net Worth ($ USDT)', yAxisID: 'y-usdt' }, parsed: { y: 1986.84 } };

    assert.strictEqual(tooltipCallbacks.label(ngnContext), ' Net Worth (NGN): ₦3,020,000.00');
    assert.strictEqual(tooltipCallbacks.label(usdtContext), ' Net Worth (USDT): 1,986.84 USDT');

    // 3. Test afterBody Callback for full snapshot (Index 0)
    const afterBody0 = tooltipCallbacks.afterBody([{ dataIndex: 0 }]);
    assert.strictEqual(afterBody0.length, 3);
    assert.strictEqual(afterBody0[0], 'Rate: ₦1,520.00 / USDT');
    assert.strictEqual(afterBody0[1], 'Bank: ₦1,500,000.00 | USDT: 1,000.00 USDT');
    assert.ok(afterBody0[2].includes('Standard trading day'));

    // 4. Test afterBody Callback for sparse snapshot (Index 1)
    const afterBody1 = tooltipCallbacks.afterBody([{ dataIndex: 1 }]);
    assert.strictEqual(afterBody1.length, 2);
    assert.strictEqual(afterBody1[0], 'Rate: ₦1,500.00 / USDT');
    assert.strictEqual(afterBody1[1], 'Bank: ₦0.00 | USDT: 0.00 USDT');

    // 5. Test afterBody Callback for long notes snapshot (Index 2)
    const afterBody2 = tooltipCallbacks.afterBody([{ dataIndex: 2 }]);
    assert.strictEqual(afterBody2.length, 3);
    assert.ok(afterBody2[2].endsWith('..."'), 'Notes > 40 chars must be truncated with ellipsis');

    // 6. Test afterBody Boundary calls
    assert.deepStrictEqual(tooltipCallbacks.afterBody([]), []);
    assert.deepStrictEqual(tooltipCallbacks.afterBody(null), []);
    assert.deepStrictEqual(tooltipCallbacks.afterBody([{ dataIndex: 999 }]), []);
  });

  it('M4-CH-CHART.13: Malformed snapshot fields (NaN, null, strings, missing numbers) map safely without crashing', () => {
    const malformedList = [
      { id: 'mal_1', timestamp: '2026-08-20T10:00:00Z', netWorthNgn: '3500000', netWorthUsdt: null },
      { id: 'mal_2', timestamp: '2026-08-21T10:00:00Z', netWorthNgn: undefined, netWorthUsdt: NaN },
      { id: 'mal_3', timestamp: '2026-08-22T10:00:00Z', netWorthNgn: 'invalid_nan', netWorthUsdt: '500.55' }
    ];
    dom.localStorage.setItem('bybit_p2p_net_worth_snapshots', JSON.stringify(malformedList));

    const chart = dashboardModule.renderNetWorthTrendChart('both');
    assert.ok(chart);

    // Mappings:
    // mal_1: NGN='3500000' -> 3500000, USDT=null -> 0
    assert.strictEqual(chart.data.datasets[0].data[0], 3500000);
    assert.strictEqual(chart.data.datasets[1].data[0], 0);

    // mal_2: NGN=undefined -> 0, USDT=NaN -> 0
    assert.strictEqual(chart.data.datasets[0].data[1], 0);
    assert.strictEqual(chart.data.datasets[1].data[1], 0);

    // mal_3: NGN='invalid_nan' -> 0, USDT='500.55' -> 500.55
    assert.strictEqual(chart.data.datasets[0].data[2], 0);
    assert.strictEqual(chart.data.datasets[1].data[2], 500.55);
  });

  // =========================================================================
  // 4. DUAL VS SINGLE Y-AXIS MECHANICS & SCALE ISOLATION
  // =========================================================================

  it('M4-CH-CHART.14: Dual Y-axis mode ("both") isolates scales and prevents grid collision', () => {
    storeModule.store.saveSnapshot({ timestamp: '2026-08-20T10:00:00Z', bankCash: 1000000, usdtBalance: 1000, referenceRate: 1500, netWorthNgn: 2500000, netWorthUsdt: 1666.67 });
    storeModule.store.saveSnapshot({ timestamp: '2026-08-21T10:00:00Z', bankCash: 1200000, usdtBalance: 1100, referenceRate: 1500, netWorthNgn: 2850000, netWorthUsdt: 1900.00 });

    const chart = dashboardModule.renderNetWorthTrendChart('both');

    assert.strictEqual(chart.options.plugins.legend.display, true, 'Legend must display in dual mode');
    assert.strictEqual(chart.options.scales['y-ngn'].position, 'left');
    assert.strictEqual(chart.options.scales['y-usdt'].position, 'right');
    assert.strictEqual(chart.options.scales['y-usdt'].grid.drawOnChartArea, false, 'Right axis must disable grid area drawing to prevent line overlap');
    assert.strictEqual(chart.data.datasets[0].yAxisID, 'y-ngn');
    assert.strictEqual(chart.data.datasets[1].yAxisID, 'y-usdt');
  });

  it('M4-CH-CHART.15: Single Y-axis modes ("ngn" and "usdt") hide legend and unify scale on "y"', () => {
    storeModule.store.saveSnapshot({ timestamp: '2026-08-20T10:00:00Z', bankCash: 1000000, usdtBalance: 1000, referenceRate: 1500, netWorthNgn: 2500000, netWorthUsdt: 1666.67 });
    storeModule.store.saveSnapshot({ timestamp: '2026-08-21T10:00:00Z', bankCash: 1200000, usdtBalance: 1100, referenceRate: 1500, netWorthNgn: 2850000, netWorthUsdt: 1900.00 });

    // NGN mode
    const ngnChart = dashboardModule.renderNetWorthTrendChart('ngn');
    assert.strictEqual(ngnChart.options.plugins.legend.display, false, 'Legend hidden in single mode');
    assert.strictEqual(ngnChart.data.datasets.length, 1);
    assert.strictEqual(ngnChart.data.datasets[0].yAxisID, 'y');
    assert.ok(ngnChart.options.scales.y);
    assert.strictEqual(ngnChart.options.scales['y-ngn'], undefined);
    assert.strictEqual(ngnChart.options.scales['y-usdt'], undefined);

    // USDT mode
    const usdtChart = dashboardModule.renderNetWorthTrendChart('usdt');
    assert.strictEqual(usdtChart.options.plugins.legend.display, false, 'Legend hidden in single mode');
    assert.strictEqual(usdtChart.data.datasets.length, 1);
    assert.strictEqual(usdtChart.data.datasets[0].yAxisID, 'y');
    assert.ok(usdtChart.options.scales.y);
    assert.strictEqual(usdtChart.options.scales['y-ngn'], undefined);
    assert.strictEqual(usdtChart.options.scales['y-usdt'], undefined);
  });

  // =========================================================================
  // 5. REACTIVITY, STORE UPDATES & LEDGER DELETION INTEGRATION
  // =========================================================================

  it('M4-CH-CHART.16: Event "store:updated" across multiple domain types re-renders chart reactively', () => {
    dashboardModule.initDashboard();

    // 0 snapshots initially
    const emptyState = dom.document.getElementById('chart-networth-empty-state');
    const canvas = dom.document.getElementById('netWorthTrendChart');
    assert.strictEqual(emptyState.classList.contains('hidden'), false);
    assert.strictEqual(canvas.classList.contains('hidden'), true);

    // Add 2 snapshots to store
    storeModule.store.saveSnapshot({ timestamp: '2026-08-20T10:00:00Z', bankCash: 1000000, usdtBalance: 1000, referenceRate: 1500, netWorthNgn: 2500000, netWorthUsdt: 1666.67 });
    storeModule.store.saveSnapshot({ timestamp: '2026-08-21T10:00:00Z', bankCash: 1200000, usdtBalance: 1100, referenceRate: 1500, netWorthNgn: 2850000, netWorthUsdt: 1900.00 });

    // Dispatch store:updated with type='snapshots'
    window.dispatchEvent(new CustomEvent('store:updated', { detail: { type: 'snapshots' } }));

    assert.strictEqual(emptyState.classList.contains('hidden'), true, 'Empty state must hide after reactive update');
    assert.strictEqual(canvas.classList.contains('hidden'), false, 'Canvas must show after reactive update');

    const activeChart = createdChartInstances[createdChartInstances.length - 1];
    assert.ok(activeChart);
    assert.strictEqual(activeChart.data.labels.length, 2);

    // Dispatch store:updated with type='all'
    window.dispatchEvent(new CustomEvent('store:updated', { detail: { type: 'all' } }));
    assert.strictEqual(createdChartInstances.length >= 2, true, 'Re-renders on all update');
  });

  it('M4-CH-CHART.17: Deleting snapshot triggers live chart data re-mapping without page reload', () => {
    storeModule.store.saveSnapshot({ id: 'snp_1', timestamp: '2026-08-20T10:00:00Z', bankCash: 1000000, usdtBalance: 1000, referenceRate: 1500, netWorthNgn: 2500000, netWorthUsdt: 1666.67 });
    storeModule.store.saveSnapshot({ id: 'snp_2', timestamp: '2026-08-21T10:00:00Z', bankCash: 1200000, usdtBalance: 1100, referenceRate: 1500, netWorthNgn: 2850000, netWorthUsdt: 1900.00 });
    storeModule.store.saveSnapshot({ id: 'snp_3', timestamp: '2026-08-22T10:00:00Z', bankCash: 1400000, usdtBalance: 1200, referenceRate: 1500, netWorthNgn: 3200000, netWorthUsdt: 2133.33 });

    dashboardModule.renderNetWorthTrendChart('both');
    let activeChart = createdChartInstances[createdChartInstances.length - 1];
    assert.strictEqual(activeChart.data.labels.length, 3);
    assert.strictEqual(activeChart.data.datasets[0].data[1], 2850000);

    // Delete intermediate snapshot snp_2
    dashboardModule.executeDeleteSnapshot('snp_2');

    activeChart = createdChartInstances[createdChartInstances.length - 1];
    assert.strictEqual(activeChart.data.labels.length, 2, 'Chart must now have 2 points');
    assert.strictEqual(activeChart.data.datasets[0].data[0], 2500000, 'Point 1 must be snp_1');
    assert.strictEqual(activeChart.data.datasets[0].data[1], 3200000, 'Point 2 must be snp_3');
  });
}, { tier: 2, category: 'Challenger M4: Chart.js Stress & Adversarial Suite' });
