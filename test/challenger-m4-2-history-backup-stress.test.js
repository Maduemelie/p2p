/**
 * Challenger 2 Adversarial Stress Test Suite — Milestone 4 (R4)
 * Historical Snapshot Calculations, Sequential Deltas, Deletion Reactivity & JSON Backup/Restore
 * 
 * Challenge Dimensions:
 * 1. Sequential Deltas: Alternating swings, 0-divisor previous baseline, negative debt baseline, precision rounding.
 * 2. Deletion Reactivity: Deleting latest snapshot (hero widget reactivity), middle snapshot (delta re-chaining), baseline snapshot (re-baselining), cascading down to 1 and 0 (empty states).
 * 3. JSON Backup & Restore: Full export/import roundtrip, merge mode deduplication, legacy schema migration, hostile payload handling, XSS note sanitization.
 * 4. High-Volume Scale & Long Notes: 100+ snapshots scale, pointRadius scaling, multi-line unicode notes escaping.
 */

const { describe, it, beforeEach } = require('./harness/test-runner');
const { assert } = require('./harness/assertions');
const { setupDomEnvironment } = require('./harness/dom-mock');

describe('Challenger 2 — M4 Historical Calculations, Deletion Reactivity & Backup Suite', () => {
  let dom;

  beforeEach(() => {
    dom = setupDomEnvironment();
  });

  // =========================================================================
  // TASK 1: SEQUENTIAL DELTAS ADVERSARIAL STRESS
  // =========================================================================

  it('M4-CH2.1: Alternating positive and negative swings calculate accurate mathematical deltas and badges', async () => {
    const { calculateSnapshotDelta, formatDeltaBadgeText, formatDeltaUsdtText } = await import('../js/utils.js');

    // Volatility Matrix: Sequence of alternating market movements
    const snapshots = [
      { netWorthNgn: 1000000, netWorthUsdt: 666.67 }, // S1: Baseline
      { netWorthNgn: 2500000, netWorthUsdt: 1666.67 }, // S2: +150% surge
      { netWorthNgn: 500000, netWorthUsdt: 333.33 },  // S3: -80% crash
      { netWorthNgn: 2000000, netWorthUsdt: 1333.33 }, // S4: +300% rebound
      { netWorthNgn: 1000000, netWorthUsdt: 666.67 },  // S5: -50% dip
      { netWorthNgn: 1000000, netWorthUsdt: 666.67 }   // S6: 0.00% flat
    ];

    // S2 vs S1 (+150.00%)
    const d2 = calculateSnapshotDelta(snapshots[1], snapshots[0]);
    assert.strictEqual(d2.deltaNgn, 1500000);
    assert.strictEqual(d2.pctDeltaNgn, 150.00);
    assert.strictEqual(d2.deltaUsdt, 1000.00);
    assert.strictEqual(d2.pctDeltaUsdt, 150.00);
    assert.ok(formatDeltaBadgeText(d2.deltaNgn, d2.pctDeltaNgn).includes('+₦1,500,000.00 (+150.00%)'));
    assert.strictEqual(formatDeltaUsdtText(d2.deltaUsdt), '+1000.00 USDT');

    // S3 vs S2 (-80.00%)
    const d3 = calculateSnapshotDelta(snapshots[2], snapshots[1]);
    assert.strictEqual(d3.deltaNgn, -2000000);
    assert.strictEqual(d3.pctDeltaNgn, -80.00);
    assert.strictEqual(d3.deltaUsdt, -1333.34);
    assert.strictEqual(d3.pctDeltaUsdt, -80.00);
    assert.ok(formatDeltaBadgeText(d3.deltaNgn, d3.pctDeltaNgn).includes('-₦2,000,000.00 (-80.00%)'));
    assert.strictEqual(formatDeltaUsdtText(d3.deltaUsdt), '-1333.34 USDT');

    // S4 vs S3 (+300.00%)
    const d4 = calculateSnapshotDelta(snapshots[3], snapshots[2]);
    assert.strictEqual(d4.deltaNgn, 1500000);
    assert.strictEqual(d4.pctDeltaNgn, 300.00);
    assert.strictEqual(d4.deltaUsdt, 1000.00);
    assert.strictEqual(d4.pctDeltaUsdt, 300.00);
    assert.ok(formatDeltaBadgeText(d4.deltaNgn, d4.pctDeltaNgn).includes('+₦1,500,000.00 (+300.00%)'));

    // S5 vs S4 (-50.00%)
    const d5 = calculateSnapshotDelta(snapshots[4], snapshots[3]);
    assert.strictEqual(d5.deltaNgn, -1000000);
    assert.strictEqual(d5.pctDeltaNgn, -50.00);

    // S6 vs S5 (0.00% flat)
    const d6 = calculateSnapshotDelta(snapshots[5], snapshots[4]);
    assert.strictEqual(d6.deltaNgn, 0);
    assert.strictEqual(d6.pctDeltaNgn, 0);
    assert.strictEqual(formatDeltaBadgeText(d6.deltaNgn, d6.pctDeltaNgn), '₦0.00 (0.00%)');
    assert.strictEqual(formatDeltaUsdtText(d6.deltaUsdt), '0.00 USDT');
  });

  it('M4-CH2.2: 0-divisor previous baseline and sub-epsilon values are guarded against NaN / Infinity', async () => {
    const { calculateSnapshotDelta, formatDeltaBadgeText } = await import('../js/utils.js');

    // Case A: Previous Net Worth is exactly 0
    const zeroBaselinePrev = { netWorthNgn: 0, netWorthUsdt: 0 };
    const currentPositive = { netWorthNgn: 1500000, netWorthUsdt: 1000 };

    const deltaA = calculateSnapshotDelta(currentPositive, zeroBaselinePrev);
    assert.strictEqual(deltaA.deltaNgn, 1500000);
    assert.strictEqual(deltaA.pctDeltaNgn, 0, 'Percentage delta must be 0 when prev is 0 to avoid Division by Zero');
    assert.strictEqual(deltaA.deltaUsdt, 1000);
    assert.strictEqual(deltaA.pctDeltaUsdt, 0);
    assert.strictEqual(isNaN(deltaA.pctDeltaNgn), false);
    assert.strictEqual(isFinite(deltaA.pctDeltaNgn), true);

    // Case B: Sub-epsilon previous baseline (0.0000001 < 0.000001)
    const microPrev = { netWorthNgn: 0.00000005, netWorthUsdt: 0.00000005 };
    const deltaB = calculateSnapshotDelta(currentPositive, microPrev);
    assert.strictEqual(deltaB.pctDeltaNgn, 0, 'Sub-epsilon previous value must trigger safe 0% delta');

    // Case C: Null / Undefined / Empty inputs
    assert.deepStrictEqual(calculateSnapshotDelta(null, currentPositive), { deltaNgn: 0, pctDeltaNgn: 0, deltaUsdt: 0, pctDeltaUsdt: 0 });
    assert.deepStrictEqual(calculateSnapshotDelta(currentPositive, null), { deltaNgn: 0, pctDeltaNgn: 0, deltaUsdt: 0, pctDeltaUsdt: 0 });
    assert.deepStrictEqual(calculateSnapshotDelta(undefined, undefined), { deltaNgn: 0, pctDeltaNgn: 0, deltaUsdt: 0, pctDeltaUsdt: 0 });
    assert.deepStrictEqual(calculateSnapshotDelta({}, {}), { deltaNgn: 0, pctDeltaNgn: 0, deltaUsdt: 0, pctDeltaUsdt: 0 });
  });

  it('M4-CH2.3: Negative debt baseline transitions calculate mathematically sound deltas and badges', async () => {
    const { calculateSnapshotDelta, formatDeltaBadgeText } = await import('../js/utils.js');

    // Transition 1: From Net Debt (-₦500k) to Net Surplus (+₦200k)
    // Absolute delta = 200,000 - (-500,000) = +700,000 NGN
    // Percentage = (+700,000 / |-500,000|) * 100 = +140.00%
    const prevDebt = { netWorthNgn: -500000, netWorthUsdt: -333.33 };
    const currSurplus = { netWorthNgn: 200000, netWorthUsdt: 133.33 };
    const delta1 = calculateSnapshotDelta(currSurplus, prevDebt);

    assert.strictEqual(delta1.deltaNgn, 700000);
    assert.strictEqual(delta1.pctDeltaNgn, 140.00);
    assert.ok(formatDeltaBadgeText(delta1.deltaNgn, delta1.pctDeltaNgn).includes('+₦700,000.00 (+140.00%)'));

    // Transition 2: From Net Debt (-₦500k) to deeper Debt (-₦800k)
    // Absolute delta = -800,000 - (-500,000) = -300,000 NGN
    // Percentage = (-300,000 / |-500,000|) * 100 = -60.00%
    const deeperDebt = { netWorthNgn: -800000, netWorthUsdt: -533.33 };
    const delta2 = calculateSnapshotDelta(deeperDebt, prevDebt);

    assert.strictEqual(delta2.deltaNgn, -300000);
    assert.strictEqual(delta2.pctDeltaNgn, -60.00);
    assert.ok(formatDeltaBadgeText(delta2.deltaNgn, delta2.pctDeltaNgn).includes('-₦300,000.00 (-60.00%)'));
  });

  // =========================================================================
  // TASK 2: SNAPSHOT DELETION REACTIVITY & DYNAMIC RE-CHAINING
  // =========================================================================

  it('M4-CH2.4: Deleting latest snapshot (S_N) immediately updates live hero widget delta badge to S_{N-1}', async () => {
    const { renderDashboardView } = await import('../js/views/dashboard.view.js');
    dom.document.root.innerHTML = `<div id="main-content">${renderDashboardView()}</div>`;

    const { store } = await import('../js/store.js');
    const { initDashboard, executeDeleteSnapshot } = await import('../js/dashboard.js');

    store.clearAllData();
    const bank = store.addBankAccount({ name: 'Stanbic Bank', last4: '9901', initialBalance: 5000000 });

    // S1: Aug 20 (Net worth: ₦5,000,000)
    const s1 = store.saveSnapshot({
      id: 'snp_aug20',
      timestamp: '2026-08-20T10:00:00Z',
      bankCash: 5000000,
      usdtBalance: 0,
      referenceRate: 1500,
      netWorthNgn: 5000000,
      netWorthUsdt: 3333.33
    });

    // S2: Aug 21 (Net worth: ₦6,000,000)
    const s2 = store.saveSnapshot({
      id: 'snp_aug21',
      timestamp: '2026-08-21T10:00:00Z',
      bankCash: 6000000,
      usdtBalance: 0,
      referenceRate: 1500,
      netWorthNgn: 6000000,
      netWorthUsdt: 4000.00
    });

    // S3: Aug 22 (Net worth: ₦7,500,000)
    const s3 = store.saveSnapshot({
      id: 'snp_aug22',
      timestamp: '2026-08-22T10:00:00Z',
      bankCash: 7500000,
      usdtBalance: 0,
      referenceRate: 1500,
      netWorthNgn: 7500000,
      netWorthUsdt: 5000.00
    });

    initDashboard();

    // Live bank balance is ₦5,000,000.
    // When S3 is latest (₦7,500,000), live delta vs S3 = ₦5,000,000 - ₦7,500,000 = -₦2,500,000 (-33.33%)
    const badgeDelta = dom.document.getElementById('badge-net-worth-delta');
    assert.ok(badgeDelta.innerHTML.includes('-₦2,500,000.00'));
    assert.ok(badgeDelta.title.includes('2026'));

    // Now delete S3 (the latest snapshot)
    executeDeleteSnapshot('snp_aug22');

    // Store must now contain only S1 and S2
    const remaining = store.getSnapshots();
    assert.strictEqual(remaining.length, 2);
    assert.strictEqual(remaining[1].id, 'snp_aug21');

    // Live hero widget must immediately compare against S2 (₦6,000,000):
    // Live delta vs S2 = ₦5,000,000 - ₦6,000,000 = -₦1,000,000 (-16.67%)
    assert.ok(badgeDelta.innerHTML.includes('-₦1,000,000.00'), `Hero delta badge must compare against S2, got ${badgeDelta.innerHTML}`);
    assert.ok(badgeDelta.innerHTML.includes('-16.67%'));
  });

  it('M4-CH2.5: Deleting middle snapshot (S_k) re-chains subsequent snapshot deltas dynamically', async () => {
    const { renderDashboardView } = await import('../js/views/dashboard.view.js');
    dom.document.root.innerHTML = `<div id="main-content">${renderDashboardView()}</div>`;

    const { store } = await import('../js/store.js');
    const { initDashboard, executeDeleteSnapshot } = await import('../js/dashboard.js');

    store.clearAllData();

    // 4 Sequential Daily Snapshots:
    // S1: ₦1,000,000
    // S2: ₦1,200,000 (+₦200,000 vs S1)
    // S3: ₦1,800,000 (+₦600,000 vs S2)
    // S4: ₦2,000,000 (+₦200,000 vs S3)
    store.saveSnapshot({ id: 's1', timestamp: '2026-08-01T10:00:00Z', netWorthNgn: 1000000, netWorthUsdt: 666.67, bankCash: 1000000, usdtBalance: 0, referenceRate: 1500 });
    store.saveSnapshot({ id: 's2', timestamp: '2026-08-02T10:00:00Z', netWorthNgn: 1200000, netWorthUsdt: 800.00, bankCash: 1200000, usdtBalance: 0, referenceRate: 1500 });
    store.saveSnapshot({ id: 's3', timestamp: '2026-08-03T10:00:00Z', netWorthNgn: 1800000, netWorthUsdt: 1200.00, bankCash: 1800000, usdtBalance: 0, referenceRate: 1500 });
    store.saveSnapshot({ id: 's4', timestamp: '2026-08-04T10:00:00Z', netWorthNgn: 2000000, netWorthUsdt: 1333.33, bankCash: 2000000, usdtBalance: 0, referenceRate: 1500 });

    initDashboard();

    let rows = dom.document.querySelectorAll('#snapshot-history-tbody tr');
    assert.strictEqual(rows.length, 4);

    // Initial check: S3 (row index 1) compared against S2 (+₦600,000.00 / +50.00%)
    assert.ok(rows[1].innerHTML.includes('s3'));
    assert.ok(rows[1].innerHTML.includes('+₦600,000.00'));
    assert.ok(rows[1].innerHTML.includes('+50.00%'));

    // Delete Middle Snapshot S2
    executeDeleteSnapshot('s2');

    rows = dom.document.querySelectorAll('#snapshot-history-tbody tr');
    assert.strictEqual(rows.length, 3, 'Must have 3 rows after deletion');

    // Rows are reverse-chronological: [0]=S4, [1]=S3, [2]=S1
    assert.strictEqual(rows[0].getAttribute('data-snapshot-id'), 's4');
    assert.strictEqual(rows[1].getAttribute('data-snapshot-id'), 's3');
    assert.strictEqual(rows[2].getAttribute('data-snapshot-id'), 's1');

    // Re-chained delta check:
    // S3 is now compared directly against S1 (₦1,800,000 - ₦1,000,000 = +₦800,000 / +80.00%)
    assert.ok(rows[1].innerHTML.includes('+₦800,000.00'), `S3 must now show +₦800,000.00 vs S1, got ${rows[1].innerHTML}`);
    assert.ok(rows[1].innerHTML.includes('+80.00%'), `S3 must now show +80.00% vs S1, got ${rows[1].innerHTML}`);

    // S4 is still compared against S3 (₦2,000,000 - ₦1,800,000 = +₦200,000 / +11.11%)
    assert.ok(rows[0].innerHTML.includes('+₦200,000.00'));
    assert.ok(rows[0].innerHTML.includes('+11.11%'));
  });

  it('M4-CH2.6: Deleting baseline snapshot (S_1) promotes S_2 to new baseline with Baseline badge', async () => {
    const { renderDashboardView } = await import('../js/views/dashboard.view.js');
    dom.document.root.innerHTML = `<div id="main-content">${renderDashboardView()}</div>`;

    const { store } = await import('../js/store.js');
    const { initDashboard, executeDeleteSnapshot } = await import('../js/dashboard.js');

    store.clearAllData();
    store.saveSnapshot({ id: 's1', timestamp: '2026-08-01T10:00:00Z', netWorthNgn: 1000000, netWorthUsdt: 666.67, bankCash: 1000000, usdtBalance: 0, referenceRate: 1500 });
    store.saveSnapshot({ id: 's2', timestamp: '2026-08-02T10:00:00Z', netWorthNgn: 1500000, netWorthUsdt: 1000.00, bankCash: 1500000, usdtBalance: 0, referenceRate: 1500 });
    store.saveSnapshot({ id: 's3', timestamp: '2026-08-03T10:00:00Z', netWorthNgn: 1800000, netWorthUsdt: 1200.00, bankCash: 1800000, usdtBalance: 0, referenceRate: 1500 });

    initDashboard();

    // Delete oldest snapshot S1
    executeDeleteSnapshot('s1');

    const rows = dom.document.querySelectorAll('#snapshot-history-tbody tr');
    assert.strictEqual(rows.length, 2);

    // Row 1 (S2) is now the oldest snapshot in the store and must display Baseline badge
    assert.strictEqual(rows[1].getAttribute('data-snapshot-id'), 's2');
    assert.ok(rows[1].innerHTML.includes('Baseline'), 'S2 must now be marked as Baseline');

    // Row 0 (S3) compares against S2 (₦1,800,000 - ₦1,500,000 = +₦300,000 / +20.00%)
    assert.strictEqual(rows[0].getAttribute('data-snapshot-id'), 's3');
    assert.ok(rows[0].innerHTML.includes('+₦300,000.00'));
    assert.ok(rows[0].innerHTML.includes('+20.00%'));
  });

  it('M4-CH2.7: Deleting all snapshots down to 1 and 0 triggers immediate empty state transitions', async () => {
    const { renderDashboardView } = await import('../js/views/dashboard.view.js');
    dom.document.root.innerHTML = `<div id="main-content">${renderDashboardView()}</div>`;

    const { store } = await import('../js/store.js');
    const { initDashboard, executeDeleteSnapshot } = await import('../js/dashboard.js');

    store.clearAllData();
    store.saveSnapshot({ id: 'snap_a', timestamp: '2026-08-01T10:00:00Z', netWorthNgn: 1000000, netWorthUsdt: 666.67, bankCash: 1000000, usdtBalance: 0, referenceRate: 1500 });
    store.saveSnapshot({ id: 'snap_b', timestamp: '2026-08-02T10:00:00Z', netWorthNgn: 1500000, netWorthUsdt: 1000.00, bankCash: 1500000, usdtBalance: 0, referenceRate: 1500 });

    initDashboard();

    const canvas = dom.document.getElementById('netWorthTrendChart');
    const chartEmptyState = dom.document.getElementById('chart-networth-empty-state');
    const tableEmptyState = dom.document.getElementById('snapshot-history-empty');
    const badgeDelta = dom.document.getElementById('badge-net-worth-delta');

    // Initial state (2 snapshots): Chart visible, empty state hidden
    assert.strictEqual(canvas.classList.contains('hidden'), false);
    assert.strictEqual(chartEmptyState.classList.contains('hidden'), true);

    // Step 1: Delete snap_b -> 1 snapshot left
    executeDeleteSnapshot('snap_b');

    // Chart requires >= 2 snapshots -> Canvas hidden, Chart empty state shown
    assert.strictEqual(canvas.classList.contains('hidden'), true, 'Canvas must be hidden when only 1 snapshot remains');
    assert.strictEqual(chartEmptyState.classList.contains('hidden'), false, 'Chart empty state must be visible with 1 snapshot');

    // Step 2: Delete snap_a -> 0 snapshots left
    executeDeleteSnapshot('snap_a');

    // Table empty state visible, canvas hidden
    assert.strictEqual(canvas.classList.contains('hidden'), true, 'Canvas must remain hidden with 0 snapshots');
    assert.strictEqual(chartEmptyState.classList.contains('hidden'), false, 'Chart empty state must remain visible with 0 snapshots');
    assert.strictEqual(tableEmptyState.classList.contains('hidden'), false, 'Table empty state must be shown when 0 snapshots exist');
    assert.strictEqual(dom.document.querySelectorAll('#snapshot-history-tbody tr').length, 0);

    // Live hero delta badge shows baseline guidance
    assert.ok(badgeDelta.innerHTML.includes('Baseline on next snapshot') || badgeDelta.textContent.includes('Baseline on next snapshot'));
    assert.strictEqual(badgeDelta.className, 'badge badge-neutral');
  });

  // =========================================================================
  // TASK 3: JSON BACKUP EXPORT / IMPORT ROUNDTRIP & SCHEMA HARDENING
  // =========================================================================

  it('M4-CH2.8: Full JSON backup export and import roundtrip preserves 100% of snapshot metadata', async () => {
    const { store } = await import('../js/store.js');
    store.clearAllData();

    const bank = store.addBankAccount({ name: 'Zenith Direct', last4: '4455', initialBalance: 10000000 });
    const trade = store.addTrade({
      type: 'BUY',
      rate: 1610,
      usdtAmount: 1000,
      ngnAmount: 1610000,
      bankAccountId: bank.id,
      date: '2026-08-20T12:00:00.000Z'
    });

    const s1 = store.saveSnapshot({
      id: 'snp_full_1',
      timestamp: '2026-08-21T00:00:00.000Z',
      bankCash: 8390000,
      usdtBalance: 1000,
      referenceRate: 1615.50,
      netWorthNgn: 10005500,
      netWorthUsdt: 6193.44,
      notes: 'Post-trade audit snapshot with ₦1615.50 reference rate'
    });

    const s2 = store.saveSnapshot({
      id: 'snp_full_2',
      timestamp: '2026-08-22T00:00:00.000Z',
      bankCash: 9500000,
      usdtBalance: 800,
      referenceRate: 1620.00,
      netWorthNgn: 10796000,
      netWorthUsdt: 6664.20,
      notes: 'End of week closing'
    });

    // 1. Export Data
    const backupJson = store.exportAllData();
    assert.ok(backupJson.version);
    assert.ok(backupJson.exportedAt);
    assert.strictEqual(backupJson.snapshots.length, 2);
    assert.strictEqual(backupJson.snapshots[0].id, 'snp_full_1');
    assert.strictEqual(backupJson.snapshots[1].id, 'snp_full_2');

    // 2. Clear Database Completely
    store.clearAllData();
    assert.strictEqual(store.getSnapshots().length, 0);
    assert.strictEqual(store.getTrades().length, 0);

    // 3. Restore from Backup
    store.importAllData(backupJson, true);

    const restoredSnapshots = store.getSnapshots();
    assert.strictEqual(restoredSnapshots.length, 2);
    assert.strictEqual(restoredSnapshots[0].id, 'snp_full_1');
    assert.strictEqual(restoredSnapshots[0].notes, 'Post-trade audit snapshot with ₦1615.50 reference rate');
    assert.strictEqual(restoredSnapshots[0].referenceRate, 1615.50);
    assert.strictEqual(restoredSnapshots[0].netWorthNgn, 10005500);

    assert.strictEqual(restoredSnapshots[1].id, 'snp_full_2');
    assert.strictEqual(restoredSnapshots[1].notes, 'End of week closing');
  });

  it('M4-CH2.9: Non-destructive merge import (replace=false) deduplicates snapshots by ID and sorts chronologically', async () => {
    const { store } = await import('../js/store.js');
    store.clearAllData();

    // Existing in database: S1 (Aug 10) and S3 (Aug 30)
    store.saveSnapshot({ id: 'snp_merge_1', timestamp: '2026-08-10T10:00:00Z', bankCash: 1000000, usdtBalance: 500, referenceRate: 1500 });
    store.saveSnapshot({ id: 'snp_merge_3', timestamp: '2026-08-30T10:00:00Z', bankCash: 3000000, usdtBalance: 1500, referenceRate: 1500 });

    // Payload to merge: S1 (duplicate ID), S2 (Aug 20 - new), S4 (Sep 05 - new)
    const mergePayload = {
      snapshots: [
        { id: 'snp_merge_1', timestamp: '2026-08-10T10:00:00Z', bankCash: 1000000, usdtBalance: 500, referenceRate: 1500 },
        { id: 'snp_merge_2', timestamp: '2026-08-20T10:00:00Z', bankCash: 2000000, usdtBalance: 1000, referenceRate: 1500 },
        { id: 'snp_merge_4', timestamp: '2026-09-05T10:00:00Z', bankCash: 4000000, usdtBalance: 2000, referenceRate: 1500 }
      ]
    };

    store.importAllData(mergePayload, false);

    const merged = store.getSnapshots();
    assert.strictEqual(merged.length, 4, 'Must have exactly 4 snapshots without duplicate S1');
    assert.strictEqual(merged[0].id, 'snp_merge_1');
    assert.strictEqual(merged[1].id, 'snp_merge_2');
    assert.strictEqual(merged[2].id, 'snp_merge_3');
    assert.strictEqual(merged[3].id, 'snp_merge_4');
  });

  it('M4-CH2.10: Import sanitizes legacy property aliases and missing calculated fields', async () => {
    const { store } = await import('../js/store.js');
    store.clearAllData();

    const legacyPayload = {
      snapshots: [
        {
          // Legacy field names: bankCashNGN, totalUsdt, missing netWorthNgn & netWorthUsdt & id
          bankCashNGN: 2000000,
          totalUsdt: 1500,
          referenceRate: 1600.00,
          notes: 'Legacy schema snapshot from v1.0',
          createdAt: 1724000000000
        }
      ]
    };

    store.importAllData(legacyPayload, true);

    const imported = store.getSnapshots();
    assert.strictEqual(imported.length, 1);
    const snp = imported[0];

    assert.ok(snp.id.startsWith('snp_'), 'Must auto-generate valid snapshot ID');
    assert.strictEqual(snp.bankCash, 2000000);
    assert.strictEqual(snp.usdtBalance, 1500);
    assert.strictEqual(snp.referenceRate, 1600.00);
    // Calculated: 2,000,000 + (1,500 * 1,600) = 4,400,000 NGN
    assert.strictEqual(snp.netWorthNgn, 4400000);
    // Calculated: 1,500 + (2,000,000 / 1,600) = 2,750 USDT
    assert.strictEqual(snp.netWorthUsdt, 2750);
  });

  it('M4-CH2.11: Import sanitizes hostile XSS scripts in snapshot notes and ignores corrupted items', async () => {
    const { store } = await import('../js/store.js');
    const { renderSnapshotHistoryRow } = await import('../js/dashboard.js');
    store.clearAllData();

    const hostilePayload = {
      snapshots: [
        null,
        'invalid string',
        { referenceRate: -500, bankCash: 'not-a-number' }, // Invalid rate & cash
        {
          id: 'snp_xss',
          timestamp: '2026-08-25T10:00:00Z',
          bankCash: 1000000,
          usdtBalance: 500,
          referenceRate: 1500,
          notes: '<script>alert("XSS")</script><img src=x onerror=alert(1)> & "Safe"'
        }
      ]
    };

    store.importAllData(hostilePayload, true);

    const snapshots = store.getSnapshots();
    assert.strictEqual(snapshots.length, 2, 'Corrupted items should either be safely sanitized with defaults or validly stored');

    const xssSnapshot = snapshots.find(s => s.id === 'snp_xss');
    assert.ok(xssSnapshot, 'Valid structured snapshot with hostile note must be imported');

    // Render table row and verify HTML escaping
    const rowHtml = renderSnapshotHistoryRow(xssSnapshot, null, 0);
    assert.ok(!rowHtml.includes('<script>'), 'Row HTML must not contain unescaped script tag');
    assert.ok(rowHtml.includes('&lt;script&gt;') || rowHtml.includes('alert(&quot;XSS&quot;)'), 'Notes must be safely escaped');
  });

  // =========================================================================
  // TASK 4: SCALE & PERFORMANCE STRESS
  // =========================================================================

  it('M4-CH2.12: High-volume stress (100+ snapshots) maintains chronological order and scales chart pointRadius', async () => {
    const { renderDashboardView } = await import('../js/views/dashboard.view.js');
    dom.document.root.innerHTML = `<div id="main-content">${renderDashboardView()}</div>`;

    const { store } = await import('../js/store.js');
    const { renderNetWorthTrendChart, renderSnapshotHistoryTable } = await import('../js/dashboard.js');

    store.clearAllData();

    // Generate 100 snapshots across 100 days
    const baseTime = new Date('2026-01-01T00:00:00Z').getTime();
    for (let i = 0; i < 100; i++) {
      store.saveSnapshot({
        id: `snp_scale_${String(i).padStart(3, '0')}`,
        timestamp: new Date(baseTime + i * 86400000).toISOString(),
        bankCash: 1000000 + i * 50000,
        usdtBalance: 1000 + i * 20,
        referenceRate: 1500 + (i % 20),
        netWorthNgn: 2500000 + i * 80000,
        netWorthUsdt: 1666.67 + i * 50,
        notes: `Daily snapshot #${i + 1}`
      });
    }

    const chart = renderNetWorthTrendChart('both');
    assert.ok(chart);
    assert.strictEqual(chart.data.labels.length, 100);
    // Point radius should be reduced to 2 for dense chart (> 25 items)
    assert.strictEqual(chart.data.datasets[0].pointRadius, 2);
    assert.strictEqual(chart.data.datasets[1].pointRadius, 2);

    renderSnapshotHistoryTable();
    const rows = dom.document.querySelectorAll('#snapshot-history-tbody tr');
    assert.strictEqual(rows.length, 100);

    // Row 0 must be the 100th snapshot (newest), Row 99 must be the 1st snapshot (baseline)
    assert.strictEqual(rows[0].getAttribute('data-snapshot-id'), 'snp_scale_099');
    assert.strictEqual(rows[99].getAttribute('data-snapshot-id'), 'snp_scale_000');
    assert.ok(rows[99].innerHTML.includes('Baseline'));
  });

  it('M4-CH2.13: Long multi-line snapshot notes truncate in table and open full view modal on click', async () => {
    const { renderDashboardView } = await import('../js/views/dashboard.view.js');
    dom.document.root.innerHTML = `<div id="main-content">${renderDashboardView()}</div>`;

    const { store } = await import('../js/store.js');
    const { renderSnapshotHistoryTable } = await import('../js/dashboard.js');

    store.clearAllData();
    const longNote = 'This is an extensive multi-paragraph trading day note with details on bank liquidity, Bybit spread arbitrage, and merchant counterparty risk management.\n\nArbitrage ROI: +18.5% over 14 trade cycles.';
    
    store.saveSnapshot({
      id: 'snp_long_note',
      timestamp: '2026-08-25T18:00:00Z',
      bankCash: 5000000,
      usdtBalance: 3000,
      referenceRate: 1620,
      netWorthNgn: 9860000,
      netWorthUsdt: 6086.42,
      notes: longNote
    });

    renderSnapshotHistoryTable();

    const row = dom.document.querySelector('#snapshot-history-tbody tr');
    assert.ok(row);

    const noteBtn = row.querySelector('.btn-view-note');
    assert.ok(noteBtn, 'Must render .btn-view-note button for notes > 35 characters');
    assert.strictEqual(noteBtn.getAttribute('data-note'), longNote);

    // Clicking note button triggers confirm modal with full text
    let modalOpened = false;
    dom.window.showConfirmModal = (title, message, onConfirm, type) => {
      modalOpened = true;
      assert.ok(title.includes('Snapshot Note'));
      assert.strictEqual(message, longNote);
    };

    noteBtn.click();
    assert.strictEqual(modalOpened, true, 'Clicking note button must display full note in modal');
  });
}, { tier: 2, category: 'Challenger M4-2: History & Backup Stress' });
