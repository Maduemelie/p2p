/**
 * Adversarial Stress & Edge-Case Test Suite for Milestone 2:
 * Live Delta Comparison Badge (#badge-net-worth-delta) in js/dashboard.js & js/utils.js
 * Executed by m2_challenger_2 (Milestone 2 Delta Badge Challenger)
 */

const { describe, it, beforeEach } = require('./harness/test-runner');
const { assert } = require('./harness/assertions');
const { setupDomEnvironment } = require('./harness/dom-mock');

let utils;
let storeModule;
let store;
let dashboardView;
let dashboardModule;
let bybitServiceModule;
let dom;

async function initContext() {
  dom = setupDomEnvironment();
  utils = await import('../js/utils.js');
  storeModule = await import('../js/store.js');
  store = storeModule.store;
  dashboardView = await import('../js/views/dashboard.view.js');
  dashboardModule = await import('../js/dashboard.js');
  bybitServiceModule = await import('../js/bybitService.js');

  // Reset bybitService to clean offline defaults
  bybitServiceModule.bybitService.fetchFundingBalance = async () => { throw new Error('offline'); };
  bybitServiceModule.bybitService.fetchActiveAds = async () => [];
  await dashboardModule.syncBybitLiveInventory();
  await dashboardModule.syncAndRenderActiveAd();

  const viewContainer = document.getElementById('view-container') || document.body;
  viewContainer.innerHTML = dashboardView.renderDashboardView();

  store.clearAllData();
  return { utils, store, dashboardModule, dashboardView, dom, bybitServiceModule };
}

// =========================================================================
// SECTION 1: Exhaustive Verification of the 4 Live Delta Badge States
// =========================================================================
describe('Challenger M2 Delta Badge — 1. Four Core Badge States & DOM Attributes', () => {
  beforeEach(async () => {
    await initContext();
  });

  it('1.1: State A (0-Snapshot Baseline): Displays badge-neutral, info icon, baseline text and guidance tooltip', async () => {
    // Ensure no snapshots in store
    assert.strictEqual(store.getSnapshots().length, 0);

    // Setup non-zero live portfolio
    store.addBankAccount({ name: 'First Bank', initialBalance: 2500000 });
    store.setOpeningInventory({ startingUsdtBalance: 1200, defaultCostBasis: 1520 });

    dashboardModule.renderNetWorthWidget();

    const badge = document.getElementById('badge-net-worth-delta');
    assert.ok(badge, 'Badge element must exist in DOM');
    assert.ok(badge.classList.contains('badge-neutral'), 'Must have badge-neutral class');
    assert.strictEqual(badge.classList.contains('badge-success'), false, 'Must not have badge-success class');
    assert.strictEqual(badge.classList.contains('badge-danger'), false, 'Must not have badge-danger class');

    assert.ok(badge.innerHTML.includes('data-lucide="info"'), 'Must render info icon');
    assert.ok(badge.textContent.includes('Baseline on next snapshot'), 'Must contain baseline placeholder text');
    assert.strictEqual(badge.title, 'Save an End-of-Day snapshot to establish a baseline for daily delta tracking.');
  });

  it('1.2: State B (Positive Growth): Displays badge-success, trending-up icon, + sign on NGN and %, and USDT tooltip', async () => {
    // Previous baseline: ₦3,000,000 NGN, 2,000 USDT @ 2026-08-24T20:00:00.000Z
    store.saveSnapshot({
      timestamp: '2026-08-24T20:00:00.000Z',
      bankCash: 1500000,
      usdtBalance: 1000,
      referenceRate: 1500,
      netWorthNgn: 3000000,
      netWorthUsdt: 2000
    });

    // Current live portfolio: ₦3,450,000 NGN (+₦450,000 / +15.00%), 2,300 USDT (+300 USDT)
    store.addBankAccount({ name: 'GTB', initialBalance: 1950000 });
    store.setOpeningInventory({ startingUsdtBalance: 1000, defaultCostBasis: 1500 });

    dashboardModule.renderNetWorthWidget();

    const badge = document.getElementById('badge-net-worth-delta');
    assert.ok(badge.classList.contains('badge-success'), 'Must have badge-success class');
    assert.strictEqual(badge.classList.contains('badge-danger'), false);
    assert.strictEqual(badge.classList.contains('badge-neutral'), false);

    assert.ok(badge.innerHTML.includes('data-lucide="trending-up"'), 'Must render trending-up icon');
    assert.ok(badge.textContent.includes('+₦450,000.00 (+15.00%)'), 'Must format positive delta with + signs');
    assert.ok(badge.title.includes('+300.00 USDT'), 'Tooltip must indicate +300.00 USDT delta');
    assert.ok(badge.title.includes('vs 24 Aug 2026') || badge.title.includes('vs'), 'Tooltip must reference baseline date');
  });

  it('1.3: State C (Negative Drawdown): Displays badge-danger, trending-down icon, - sign on NGN and %, and negative USDT tooltip', async () => {
    // Previous baseline: ₦5,000,000 NGN, 3,333.33 USDT @ 2026-08-24T22:00:00.000Z
    store.saveSnapshot({
      timestamp: '2026-08-24T22:00:00.000Z',
      bankCash: 3500000,
      usdtBalance: 1000,
      referenceRate: 1500,
      netWorthNgn: 5000000,
      netWorthUsdt: 3333.33
    });

    // Current live portfolio: ₦4,600,000 NGN (-₦400,000 / -8.00%), 3,066.67 USDT (-266.66 USDT)
    store.addBankAccount({ name: 'Zenith Bank', initialBalance: 3100000 });
    store.setOpeningInventory({ startingUsdtBalance: 1000, defaultCostBasis: 1500 });

    dashboardModule.renderNetWorthWidget();

    const badge = document.getElementById('badge-net-worth-delta');
    assert.ok(badge.classList.contains('badge-danger'), 'Must have badge-danger class');
    assert.strictEqual(badge.classList.contains('badge-success'), false);
    assert.strictEqual(badge.classList.contains('badge-neutral'), false);

    assert.ok(badge.innerHTML.includes('data-lucide="trending-down"'), 'Must render trending-down icon');
    assert.ok(badge.textContent.includes('-₦400,000.00 (-8.00%)'), 'Must format negative delta with - signs');
    assert.ok(badge.title.includes('-266.66 USDT') || badge.title.includes('-266.67 USDT'), 'Tooltip must indicate negative USDT delta');
  });

  it('1.4: State D (Flat / Zero Delta): Displays badge-neutral, minus icon, ₦0.00 (0.00%), and 0.00 USDT tooltip', async () => {
    // Baseline snapshot exactly matching current state
    store.saveSnapshot({
      timestamp: '2026-08-25T08:00:00.000Z',
      bankCash: 2000000,
      usdtBalance: 1000,
      referenceRate: 1500,
      netWorthNgn: 3500000,
      netWorthUsdt: 2333.33
    });

    // Current live portfolio matches: Bank Cash 2,000,000, USDT 1000 @ 1500 -> ₦3,500,000 NGN
    store.addBankAccount({ name: 'Access Bank', initialBalance: 2000000 });
    store.setOpeningInventory({ startingUsdtBalance: 1000, defaultCostBasis: 1500 });

    dashboardModule.renderNetWorthWidget();

    const badge = document.getElementById('badge-net-worth-delta');
    assert.ok(badge.classList.contains('badge-neutral'), 'Must have badge-neutral class');
    assert.strictEqual(badge.classList.contains('badge-success'), false);
    assert.strictEqual(badge.classList.contains('badge-danger'), false);

    assert.ok(badge.innerHTML.includes('data-lucide="minus"'), 'Must render minus icon');
    assert.ok(badge.textContent.includes('₦0.00 (0.00%)'), 'Must show ₦0.00 (0.00%)');
    assert.ok(badge.title.includes('0.00 USDT'), 'Tooltip must show 0.00 USDT');
  });

  it('1.5: Micro-threshold epsilon boundaries (0.005 NGN boundary)', async () => {
    // Baseline snapshot
    store.saveSnapshot({
      bankCash: 1000000,
      usdtBalance: 0,
      referenceRate: 1500,
      netWorthNgn: 1000000,
      netWorthUsdt: 666.67
    });

    // Test Sub-Cent Positive: +0.004 NGN -> Must remain flat / neutral
    store.clearAllData();
    store.saveSnapshot({
      bankCash: 1000000,
      usdtBalance: 0,
      referenceRate: 1500,
      netWorthNgn: 1000000,
      netWorthUsdt: 666.67
    });
    store.addBankAccount({ name: 'Bank', initialBalance: 1000000.004 });
    dashboardModule.renderNetWorthWidget();

    let badge = document.getElementById('badge-net-worth-delta');
    assert.ok(badge.classList.contains('badge-neutral'), '+0.004 NGN must be treated as neutral');
    assert.ok(badge.textContent.includes('₦0.00 (0.00%)'));

    // Test Supra-Cent Positive: +0.006 NGN -> Must trigger positive gain
    store.clearAllData();
    store.saveSnapshot({
      bankCash: 1000000,
      usdtBalance: 0,
      referenceRate: 1500,
      netWorthNgn: 1000000,
      netWorthUsdt: 666.67
    });
    store.addBankAccount({ name: 'Bank', initialBalance: 1000000.006 });
    dashboardModule.renderNetWorthWidget();

    badge = document.getElementById('badge-net-worth-delta');
    assert.ok(badge.classList.contains('badge-success'), '+0.006 NGN must trigger badge-success');

    // Test Sub-Cent Negative: -0.004 NGN -> Must remain flat / neutral
    store.clearAllData();
    store.saveSnapshot({
      bankCash: 1000000,
      usdtBalance: 0,
      referenceRate: 1500,
      netWorthNgn: 1000000,
      netWorthUsdt: 666.67
    });
    store.addBankAccount({ name: 'Bank', initialBalance: 999999.996 });
    dashboardModule.renderNetWorthWidget();

    badge = document.getElementById('badge-net-worth-delta');
    assert.ok(badge.classList.contains('badge-neutral'), '-0.004 NGN must be treated as neutral');

    // Test Supra-Cent Negative: -0.006 NGN -> Must trigger negative drawdown
    store.clearAllData();
    store.saveSnapshot({
      bankCash: 1000000,
      usdtBalance: 0,
      referenceRate: 1500,
      netWorthNgn: 1000000,
      netWorthUsdt: 666.67
    });
    store.addBankAccount({ name: 'Bank', initialBalance: 999999.994 });
    dashboardModule.renderNetWorthWidget();

    badge = document.getElementById('badge-net-worth-delta');
    assert.ok(badge.classList.contains('badge-danger'), '-0.006 NGN must trigger badge-danger');
  });
});

// =========================================================================
// SECTION 2: Division by Zero & Zero Previous Snapshot Protection
// =========================================================================
describe('Challenger M2 Delta Badge — 2. Division by Zero & Zero Snapshot Edge Cases', () => {
  beforeEach(async () => {
    await initContext();
  });

  it('2.1: Zero baseline snapshot (0 NGN & 0 USDT) with positive live portfolio prevents Infinity/NaN and formats 0.00%', async () => {
    // Snapshot where user had 0 net worth
    store.saveSnapshot({
      timestamp: '2026-08-25T00:00:00.000Z',
      bankCash: 0,
      usdtBalance: 0,
      referenceRate: 1500,
      netWorthNgn: 0,
      netWorthUsdt: 0
    });

    // Live portfolio now has ₦1,500,000 NGN
    store.addBankAccount({ name: 'Kuda Bank', initialBalance: 1500000 });

    dashboardModule.renderNetWorthWidget();

    const badge = document.getElementById('badge-net-worth-delta');
    assert.ok(badge.classList.contains('badge-success'), 'Positive growth from 0 must be badge-success');
    assert.ok(badge.innerHTML.includes('data-lucide="trending-up"'));

    // Check that text does not contain Infinity or NaN
    assert.strictEqual(badge.textContent.includes('Infinity'), false, 'Must not contain Infinity');
    assert.strictEqual(badge.textContent.includes('NaN'), false, 'Must not contain NaN');
    assert.ok(badge.textContent.includes('+₦1,500,000.00 (0.00%)'), 'Percentage must be safely bounded to 0.00%');
  });

  it('2.2: Zero baseline snapshot and zero live portfolio formats clean ₦0.00 (0.00%) neutral badge', async () => {
    store.saveSnapshot({
      bankCash: 0,
      usdtBalance: 0,
      referenceRate: 1500,
      netWorthNgn: 0,
      netWorthUsdt: 0
    });

    // Live portfolio is 0
    dashboardModule.renderNetWorthWidget();

    const badge = document.getElementById('badge-net-worth-delta');
    assert.ok(badge.classList.contains('badge-neutral'));
    assert.ok(badge.innerHTML.includes('data-lucide="minus"'));
    assert.strictEqual(badge.textContent.trim(), '₦0.00 (0.00%)');
    assert.ok(badge.title.includes('0.00 USDT'));
  });

  it('2.3: Zero baseline snapshot with negative live portfolio (overdraft) displays badge-danger with bounded 0.00%', async () => {
    store.saveSnapshot({
      bankCash: 0,
      usdtBalance: 0,
      referenceRate: 1500,
      netWorthNgn: 0,
      netWorthUsdt: 0
    });

    // Overdraft bank account (-₦250,000)
    store.addBankAccount({ name: 'Overdraft Account', initialBalance: -250000 });

    dashboardModule.renderNetWorthWidget();

    const badge = document.getElementById('badge-net-worth-delta');
    assert.ok(badge.classList.contains('badge-danger'), 'Drawdown from 0 into debt must be badge-danger');
    assert.ok(badge.innerHTML.includes('data-lucide="trending-down"'));
    assert.strictEqual(badge.textContent.includes('Infinity'), false);
    assert.strictEqual(badge.textContent.includes('NaN'), false);
    assert.ok(badge.textContent.includes('-₦250,000.00 (0.00%)'));
  });
});

// =========================================================================
// SECTION 3: Negative Previous Snapshot (Debt / Overdraft Baselines)
// =========================================================================
describe('Challenger M2 Delta Badge — 3. Negative Previous Snapshot Scenarios', () => {
  beforeEach(async () => {
    await initContext();
  });

  it('3.1: Debt recovery: Negative baseline snapshot (-₦500,000) transitioning to positive net worth (+₦500,000)', async () => {
    // Baseline snapshot recorded in debt
    store.saveSnapshot({
      timestamp: '2026-08-25T01:00:00.000Z',
      bankCash: -500000,
      usdtBalance: 0,
      referenceRate: 1500,
      netWorthNgn: -500000,
      netWorthUsdt: -333.33
    });

    // Current live portfolio: +₦500,000 NGN (+₦1,000,000 absolute gain, +200.00% recovery)
    store.addBankAccount({ name: 'Recovery Bank', initialBalance: 500000 });

    dashboardModule.renderNetWorthWidget();

    const badge = document.getElementById('badge-net-worth-delta');
    assert.ok(badge.classList.contains('badge-success'), 'Debt recovery must be badge-success');
    assert.ok(badge.innerHTML.includes('data-lucide="trending-up"'));
    assert.ok(badge.textContent.includes('+₦1,000,000.00 (+200.00%)'), 'Percentage must divide by absolute baseline (| -500,000 |) to yield +200.00%');
  });

  it('3.2: Deepening debt: Negative baseline snapshot (-₦400,000) sinking to (-₦700,000)', async () => {
    store.saveSnapshot({
      timestamp: '2026-08-25T02:00:00.000Z',
      bankCash: -400000,
      usdtBalance: 0,
      referenceRate: 1500,
      netWorthNgn: -400000,
      netWorthUsdt: -266.67
    });

    // Current live: -₦700,000 NGN (-₦300,000 drop, -75.00%)
    store.addBankAccount({ name: 'Sinking Account', initialBalance: -700000 });

    dashboardModule.renderNetWorthWidget();

    const badge = document.getElementById('badge-net-worth-delta');
    assert.ok(badge.classList.contains('badge-danger'), 'Deeper debt must be badge-danger');
    assert.ok(badge.innerHTML.includes('data-lucide="trending-down"'));
    assert.ok(badge.textContent.includes('-₦300,000.00 (-75.00%)'));
  });

  it('3.3: Partial debt recovery: Negative baseline snapshot (-₦600,000) improving to (-₦200,000)', async () => {
    store.saveSnapshot({
      timestamp: '2026-08-25T03:00:00.000Z',
      bankCash: -600000,
      usdtBalance: 0,
      referenceRate: 1500,
      netWorthNgn: -600000,
      netWorthUsdt: -400.00
    });

    // Current live: -₦200,000 NGN (+₦400,000 gain, +66.67% improvement)
    store.addBankAccount({ name: 'Improving Account', initialBalance: -200000 });

    dashboardModule.renderNetWorthWidget();

    const badge = document.getElementById('badge-net-worth-delta');
    assert.ok(badge.classList.contains('badge-success'), 'Partial debt improvement (+₦400k) must be badge-success');
    assert.ok(badge.innerHTML.includes('data-lucide="trending-up"'));
    assert.ok(badge.textContent.includes('+₦400,000.00 (+66.67%)'));
  });
});

// =========================================================================
// SECTION 4: Corrupted Snapshot Records & Timestamp Anomalies
// =========================================================================
describe('Challenger M2 Delta Badge — 4. Corrupted Snapshots & Timestamp Fault Tolerance', () => {
  beforeEach(async () => {
    await initContext();
  });

  it('4.1: Corrupted timestamp string in snapshot does not crash widget and falls back gracefully in tooltip', async () => {
    // Snapshot with completely invalid timestamp string
    const corruptedSnapshot = {
      id: 'snp_corrupt_time',
      timestamp: 'NOT_A_VALID_DATE_STRING_12345',
      bankCash: 1000000,
      usdtBalance: 500,
      referenceRate: 1500,
      netWorthNgn: 1750000,
      netWorthUsdt: 1166.67
    };

    // Directly inject to bypass store validation and test rendering resilience
    localStorage.setItem('bybit_p2p_net_worth_snapshots', JSON.stringify([corruptedSnapshot]));

    store.addBankAccount({ name: 'Safe Bank', initialBalance: 2000000 });
    store.setOpeningInventory({ startingUsdtBalance: 500, defaultCostBasis: 1500 });

    // Must not throw an unhandled exception
    dashboardModule.renderNetWorthWidget();

    const badge = document.getElementById('badge-net-worth-delta');
    assert.ok(badge, 'Badge must render');
    assert.ok(badge.classList.contains('badge-success'));
    assert.ok(badge.textContent.includes('+₦1,000,000.00'));
    // formatDateTime('NOT_A_VALID_DATE_STRING_12345') returns '—'
    assert.ok(badge.title.includes('vs —') || badge.title.includes('vs latest snapshot'));
  });

  it('4.2: Snapshot with missing or non-numeric netWorthNgn fields defaults safely to 0 without NaN pollution', async () => {
    const malformedSnapshot = {
      id: 'snp_malformed_fields',
      timestamp: '2026-08-25T10:00:00.000Z',
      bankCash: 'invalid_string',
      usdtBalance: undefined,
      referenceRate: 1500,
      netWorthNgn: null,
      netWorthUsdt: NaN
    };

    localStorage.setItem('bybit_p2p_net_worth_snapshots', JSON.stringify([malformedSnapshot]));

    store.addBankAccount({ name: 'Zenith', initialBalance: 1200000 });

    dashboardModule.renderNetWorthWidget();

    const badge = document.getElementById('badge-net-worth-delta');
    assert.ok(badge, 'Badge must render');
    assert.strictEqual(badge.textContent.includes('NaN'), false);
    assert.strictEqual(badge.textContent.includes('undefined'), false);
    assert.ok(badge.classList.contains('badge-success'));
  });

  it('4.3: Snapshot store containing null or empty objects recovers cleanly without crashing renderNetWorthWidget()', async () => {
    localStorage.setItem('bybit_p2p_net_worth_snapshots', JSON.stringify([null, {}, undefined]));

    store.addBankAccount({ name: 'Wema', initialBalance: 500000 });

    dashboardModule.renderNetWorthWidget();

    const badge = document.getElementById('badge-net-worth-delta');
    assert.ok(badge);
    assert.strictEqual(badge.textContent.includes('NaN'), false);
  });
});

// =========================================================================
// SECTION 5: Extreme Numeric Boundaries & Large-Scale Integer Overflows
// =========================================================================
describe('Challenger M2 Delta Badge — 5. Extreme Values, Billions & Float Invariant Stress', () => {
  beforeEach(async () => {
    await initContext();
  });

  it('5.1: Handles mega/billion-scale figures (50 Billion NGN) with formatted thousands separators', async () => {
    // 50,000,000,000 NGN baseline (30B bank cash + 10M USDT @ ₦2,000)
    store.saveSnapshot({
      bankCash: 30000000000,
      usdtBalance: 10000000,
      referenceRate: 2000,
      netWorthNgn: 50000000000,
      netWorthUsdt: 25000000
    });

    // Current live: 55,000,000,000 NGN (35B bank cash + 10M USDT @ ₦2,000 -> +₦5,000,000,000 / +10.00%)
    store.addBankAccount({ name: 'Mega Bank A', initialBalance: 35000000000 });
    store.setOpeningInventory({ startingUsdtBalance: 10000000, defaultCostBasis: 2000 });

    dashboardModule.renderNetWorthWidget();

    const badge = document.getElementById('badge-net-worth-delta');
    assert.ok(badge.classList.contains('badge-success'));
    assert.ok(badge.textContent.includes('+₦5,000,000,000.00 (+10.00%)'));
  });

  it('5.2: IEEE 754 float drift protection (prevents 0.00000000000004 float artifact display)', async () => {
    // Baseline: ₦1,000,000.10
    store.saveSnapshot({
      bankCash: 1000000.10,
      usdtBalance: 0,
      referenceRate: 1500,
      netWorthNgn: 1000000.10,
      netWorthUsdt: 666.67
    });

    // Current live: ₦1,000,000.30 -> Raw float delta is 0.19999999999999996
    store.addBankAccount({ name: 'Float Account', initialBalance: 1000000.30 });

    dashboardModule.renderNetWorthWidget();

    const badge = document.getElementById('badge-net-worth-delta');
    assert.ok(badge.classList.contains('badge-success'));
    // Must be formatted cleanly to 2 decimals (+₦0.20 (+0.00%))
    assert.ok(badge.textContent.includes('+₦0.20 (0.00%)') || badge.textContent.includes('+₦0.20 (+0.00%)'));
    assert.strictEqual(badge.textContent.includes('0.199999'), false, 'Float drift must be cleanly rounded');
  });

  it('5.3: Pure mathematical utility calculateSnapshotDelta handles extreme null/primitive inputs safely', async () => {
    // Null current / previous
    const r1 = utils.calculateSnapshotDelta(null, null);
    assert.deepStrictEqual(r1, { deltaNgn: 0, pctDeltaNgn: 0, deltaUsdt: 0, pctDeltaUsdt: 0 });

    const r2 = utils.calculateSnapshotDelta(undefined, { netWorthNgn: 1000 });
    assert.deepStrictEqual(r2, { deltaNgn: 0, pctDeltaNgn: 0, deltaUsdt: 0, pctDeltaUsdt: 0 });

    // Primitive number inputs instead of objects
    const r3 = utils.calculateSnapshotDelta(1500, 1000);
    assert.strictEqual(r3.deltaNgn, 500);
    assert.strictEqual(r3.pctDeltaNgn, 50);

    // Negative baseline with primitive numbers
    const r4 = utils.calculateSnapshotDelta(-200, -500);
    assert.strictEqual(r4.deltaNgn, 300);
    assert.strictEqual(r4.pctDeltaNgn, 60);
  });
});

// =========================================================================
// SECTION 6: Chronological Ordering & Dynamic Mutation Reactivity
// =========================================================================
describe('Challenger M2 Delta Badge — 6. Chronological Sorting & Mutation Lifecycle', () => {
  beforeEach(async () => {
    await initContext();
  });

  it('6.1: Delta badge always targets the chronologically newest snapshot, regardless of insertion sequence', async () => {
    // Add Snapshot 1 (Middle date: 2026-08-20)
    store.saveSnapshot({
      id: 'snp_mid',
      timestamp: '2026-08-20T12:00:00.000Z',
      bankCash: 2000000,
      usdtBalance: 0,
      referenceRate: 1500,
      netWorthNgn: 2000000,
      netWorthUsdt: 1333.33
    });

    // Add Snapshot 2 (Oldest date: 2026-08-10)
    store.saveSnapshot({
      id: 'snp_old',
      timestamp: '2026-08-10T12:00:00.000Z',
      bankCash: 1000000,
      usdtBalance: 0,
      referenceRate: 1500,
      netWorthNgn: 1000000,
      netWorthUsdt: 666.67
    });

    // Add Snapshot 3 (Newest date: 2026-08-25) -> ₦3,000,000
    store.saveSnapshot({
      id: 'snp_newest',
      timestamp: '2026-08-25T12:00:00.000Z',
      bankCash: 3000000,
      usdtBalance: 0,
      referenceRate: 1500,
      netWorthNgn: 3000000,
      netWorthUsdt: 2000.00
    });

    // Live portfolio: ₦3,300,000 (+₦300,000 / +10.00% compared to NEWEST 3,000,000)
    store.addBankAccount({ name: 'Active Bank', initialBalance: 3300000 });

    dashboardModule.renderNetWorthWidget();

    const badge = document.getElementById('badge-net-worth-delta');
    assert.ok(badge.classList.contains('badge-success'));
    // If it compared to oldest (1,000,000), it would be +₦2,300,000 (+230.00%)
    // Must compare against newest (3,000,000) -> +₦300,000.00 (+10.00%)
    assert.ok(badge.textContent.includes('+₦300,000.00 (+10.00%)'), 'Must compare against newest snapshot');
  });

  it('6.2: Snapshot deletion reactively retargets badge to previous snapshot or baseline', async () => {
    // Snapshot A: ₦2,000,000 @ Aug 20
    const snapA = store.saveSnapshot({
      timestamp: '2026-08-20T12:00:00.000Z',
      bankCash: 2000000,
      usdtBalance: 0,
      referenceRate: 1500,
      netWorthNgn: 2000000,
      netWorthUsdt: 1333.33
    });

    // Snapshot B: ₦3,000,000 @ Aug 25
    const snapB = store.saveSnapshot({
      timestamp: '2026-08-25T12:00:00.000Z',
      bankCash: 3000000,
      usdtBalance: 0,
      referenceRate: 1500,
      netWorthNgn: 3000000,
      netWorthUsdt: 2000.00
    });

    // Live: ₦2,500,000
    store.addBankAccount({ name: 'Live Bank', initialBalance: 2500000 });

    dashboardModule.renderNetWorthWidget();

    let badge = document.getElementById('badge-net-worth-delta');
    // Compared to Snap B (3,000,000) -> Drawdown -₦500,000 (-16.67%)
    assert.ok(badge.classList.contains('badge-danger'));
    assert.ok(badge.textContent.includes('-₦500,000.00 (-16.67%)'));

    // Now delete Snapshot B
    store.deleteSnapshot(snapB.id);
    dashboardModule.renderNetWorthWidget();

    badge = document.getElementById('badge-net-worth-delta');
    // Now compared to Snap A (2,000,000) -> Gain +₦500,000 (+25.00%)
    assert.ok(badge.classList.contains('badge-success'), 'Must retarget to Snap A and become badge-success');
    assert.ok(badge.textContent.includes('+₦500,000.00 (+25.00%)'));

    // Delete Snapshot A -> Zero snapshots remaining
    store.deleteSnapshot(snapA.id);
    dashboardModule.renderNetWorthWidget();

    badge = document.getElementById('badge-net-worth-delta');
    assert.ok(badge.classList.contains('badge-neutral'), 'Must revert to 0-snapshot baseline mode');
    assert.ok(badge.textContent.includes('Baseline on next snapshot'));
  });

  it('6.3: High-frequency reactive event fuzzing (50 rapid store:updated events) maintains consistent state', async () => {
    dashboardModule.initDashboard();

    store.saveSnapshot({
      timestamp: '2026-08-25T00:00:00.000Z',
      bankCash: 1000000,
      usdtBalance: 0,
      referenceRate: 1500,
      netWorthNgn: 1000000,
      netWorthUsdt: 666.67
    });

    const bank = store.addBankAccount({ name: 'Fuzz Bank', initialBalance: 1000000 });

    // Dispatch 50 rapid store updates modifying bank account
    for (let i = 1; i <= 50; i++) {
      store.updateBankAccount(bank.id, { initialBalance: 1000000 + i * 10000 });
      window.dispatchEvent(new CustomEvent('store:updated', { detail: { type: 'banks' } }));
    }

    // Final balance is 1,000,000 + 500,000 = 1,500,000 -> +₦500,000 (+50.00%)
    const badge = document.getElementById('badge-net-worth-delta');
    assert.ok(badge.classList.contains('badge-success'));
    assert.ok(badge.textContent.includes('+₦500,000.00 (+50.00%)'));
  });
});
