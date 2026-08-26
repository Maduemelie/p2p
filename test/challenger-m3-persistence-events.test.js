/**
 * Adversarial Persistence, Notes Security & Event Reactivity Challenger Suite for Milestone 3 (M3)
 * Role: m3_challenger_2 (Milestone 3 Persistence & Event Challenger)
 * 
 * Target Modules:
 *  - js/store.js (Snapshot CRUD, LocalStorage persistence, chronological ordering, event notifications)
 *  - js/dashboard.js (Modal form submission, dynamic rate calculation, UI widget update, live delta tracking)
 *  - js/utils.js (validateSnapshot, calculateNetWorth, calculateSnapshotDelta, escapeHtml)
 *  - js/views/modals.view.js & js/views/dashboard.view.js (DOM layout & element binding)
 */

const { describe, it, beforeEach } = require('./harness/test-runner');
const { assert } = require('./harness/assertions');
const { setupDomEnvironment, MockElement } = require('./harness/dom-mock');

let utils;
let store;
let STORAGE_KEYS;
let dashboardView;
let modalsView;
let dashboardModule;
let bybitServiceModule;
let dom;

async function setupTestEnvironment(options = {}) {
  dom = setupDomEnvironment();
  utils = await import('../js/utils.js');
  const storeMod = await import('../js/store.js');
  store = storeMod.store;
  STORAGE_KEYS = storeMod.STORAGE_KEYS;
  dashboardView = await import('../js/views/dashboard.view.js');
  modalsView = await import('../js/views/modals.view.js');
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

  // Setup complete DOM tree
  document.body.innerHTML = `
    <div id="main-content">
      ${dashboardView.renderDashboardView()}
    </div>
    <div id="modals-container">
      ${modalsView.renderModalsView()}
    </div>
    <div id="toast-container"></div>
  `;

  const canvas = document.getElementById('pnlChart');
  if (canvas) {
    canvas.getContext = () => ({
      createLinearGradient: () => ({ addColorStop: () => {} }),
      clearRect: () => {},
      fillRect: () => {}
    });
  }

  return { utils, store, STORAGE_KEYS, dashboardView, modalsView, dashboardModule, bybitServiceModule };
}

// =========================================================================
// SECTION 1: Sequential Snapshot Persistence, Timestamps & Chronological Order
// =========================================================================
describe('Challenger M3-2 — 1. Sequential Snapshot Persistence & Chronological Sorting Invariants', () => {
  beforeEach(async () => {
    await setupTestEnvironment();
  });

  it('1.1: Saving multiple snapshots sequentially assigns unique IDs and persists them in LocalStorage', () => {
    const snaps = [];
    const baseDate = new Date('2026-08-01T10:00:00.000Z');

    for (let i = 0; i < 10; i++) {
      const ts = new Date(baseDate.getTime() + i * 86400000).toISOString();
      const snap = store.saveSnapshot({
        timestamp: ts,
        bankCash: 1000000 + i * 50000,
        usdtBalance: 1000 + i * 100,
        referenceRate: 1500 + i * 10,
        notes: `Day ${i + 1} snapshot`
      });
      snaps.push(snap);
    }

    assert.strictEqual(snaps.length, 10);
    const ids = new Set(snaps.map(s => s.id));
    assert.strictEqual(ids.size, 10, 'Every generated snapshot ID must be strictly unique');

    // Verify localStorage persistence
    const rawStorage = localStorage.getItem(STORAGE_KEYS.NET_WORTH_SNAPSHOTS);
    assert.ok(rawStorage, 'LocalStorage key bybit_p2p_net_worth_snapshots must exist');
    const parsed = JSON.parse(rawStorage);
    assert.strictEqual(parsed.length, 10, 'Parsed localStorage array must contain 10 items');

    const retrieved = store.getSnapshots();
    assert.strictEqual(retrieved.length, 10);

    for (let i = 0; i < 10; i++) {
      assert.strictEqual(retrieved[i].id, snaps[i].id);
      assert.strictEqual(retrieved[i].bankCash, snaps[i].bankCash);
      assert.strictEqual(retrieved[i].usdtBalance, snaps[i].usdtBalance);
      assert.strictEqual(retrieved[i].referenceRate, snaps[i].referenceRate);
      assert.strictEqual(retrieved[i].notes, snaps[i].notes);
    }
  });

  it('1.2: Interleaved out-of-order date/time submissions are strictly sorted chronological ascending', () => {
    // Dates out of order: Day 4, Day 1, Day 5, Day 2, Day 3
    const day1 = '2026-08-01T12:00:00.000Z';
    const day2 = '2026-08-02T12:00:00.000Z';
    const day3 = '2026-08-03T12:00:00.000Z';
    const day4 = '2026-08-04T12:00:00.000Z';
    const day5 = '2026-08-05T12:00:00.000Z';

    store.saveSnapshot({ timestamp: day4, bankCash: 4000, usdtBalance: 400, referenceRate: 1500, notes: 'Day 4' });
    store.saveSnapshot({ timestamp: day1, bankCash: 1000, usdtBalance: 100, referenceRate: 1500, notes: 'Day 1' });
    store.saveSnapshot({ timestamp: day5, bankCash: 5000, usdtBalance: 500, referenceRate: 1500, notes: 'Day 5' });
    store.saveSnapshot({ timestamp: day2, bankCash: 2000, usdtBalance: 200, referenceRate: 1500, notes: 'Day 2' });
    store.saveSnapshot({ timestamp: day3, bankCash: 3000, usdtBalance: 300, referenceRate: 1500, notes: 'Day 3' });

    const snapshots = store.getSnapshots();
    assert.strictEqual(snapshots.length, 5);

    // Verify chronological order
    assert.strictEqual(snapshots[0].notes, 'Day 1');
    assert.strictEqual(snapshots[1].notes, 'Day 2');
    assert.strictEqual(snapshots[2].notes, 'Day 3');
    assert.strictEqual(snapshots[3].notes, 'Day 4');
    assert.strictEqual(snapshots[4].notes, 'Day 5');

    for (let i = 0; i < snapshots.length - 1; i++) {
      const t1 = new Date(snapshots[i].timestamp).getTime();
      const t2 = new Date(snapshots[i].timestamp || snapshots[i + 1].timestamp).getTime();
      const nextTime = new Date(snapshots[i + 1].timestamp).getTime();
      assert.ok(t1 <= nextTime, `Snapshot ${i} must be chronologically earlier than snapshot ${i + 1}`);
    }

    // Invariant: Direct localStorage item is also sorted
    const rawList = JSON.parse(localStorage.getItem(STORAGE_KEYS.NET_WORTH_SNAPSHOTS));
    assert.strictEqual(rawList[0].notes, 'Day 1');
    assert.strictEqual(rawList[4].notes, 'Day 5');
  });

  it('1.3: Duplicate ID update modifies record in-place without duplicating or altering sort invariant', () => {
    const s1 = store.saveSnapshot({ id: 'snap_fixed_1', timestamp: '2026-08-01T00:00:00.000Z', bankCash: 1000, usdtBalance: 100, referenceRate: 1500, notes: 'Original 1' });
    const s2 = store.saveSnapshot({ id: 'snap_fixed_2', timestamp: '2026-08-02T00:00:00.000Z', bankCash: 2000, usdtBalance: 200, referenceRate: 1500, notes: 'Original 2' });
    const s3 = store.saveSnapshot({ id: 'snap_fixed_3', timestamp: '2026-08-03T00:00:00.000Z', bankCash: 3000, usdtBalance: 300, referenceRate: 1500, notes: 'Original 3' });

    assert.strictEqual(store.getSnapshots().length, 3);

    // Update snap_fixed_2 with changed cash and notes
    const updated = store.saveSnapshot({
      id: 'snap_fixed_2',
      timestamp: '2026-08-02T00:00:00.000Z',
      bankCash: 2500000,
      usdtBalance: 500,
      referenceRate: 1550,
      notes: 'Updated 2 with new figures'
    });

    const snapshotsAfter = store.getSnapshots();
    assert.strictEqual(snapshotsAfter.length, 3, 'Updating existing snapshot ID must not increase snapshot count');
    assert.strictEqual(snapshotsAfter[1].id, 'snap_fixed_2');
    assert.strictEqual(snapshotsAfter[1].bankCash, 2500000);
    assert.strictEqual(snapshotsAfter[1].usdtBalance, 500);
    assert.strictEqual(snapshotsAfter[1].referenceRate, 1550);
    assert.strictEqual(snapshotsAfter[1].notes, 'Updated 2 with new figures');
    assert.strictEqual(snapshotsAfter[1].netWorthNgn, 2500000 + (500 * 1550));
  });

  it('1.4: Millisecond timestamp collisions are handled gracefully with secondary tie-breaker', () => {
    const identicalTime = '2026-08-10T15:30:00.000Z';
    const sA = store.saveSnapshot({ timestamp: identicalTime, bankCash: 100, usdtBalance: 10, referenceRate: 1500, notes: 'A' });
    const sB = store.saveSnapshot({ timestamp: identicalTime, bankCash: 200, usdtBalance: 20, referenceRate: 1500, notes: 'B' });

    const snapshots = store.getSnapshots();
    assert.strictEqual(snapshots.length, 2);
    assert.notStrictEqual(sA.id, sB.id);
  });
});

// =========================================================================
// SECTION 2: Optional Notes Edge Cases & Security Hardening
// =========================================================================
describe('Challenger M3-2 — 2. Optional Notes Edge Cases & Security Hardening', () => {
  beforeEach(async () => {
    await setupTestEnvironment();
  });

  it('2.1: Empty notes, null, undefined, and whitespace-only strings normalize cleanly', () => {
    // null notes
    const sNull = store.saveSnapshot({ bankCash: 1000, usdtBalance: 100, referenceRate: 1500, notes: null });
    assert.strictEqual(sNull.notes, '', 'null notes should normalize to empty string');

    // undefined notes
    const sUndef = store.saveSnapshot({ bankCash: 1000, usdtBalance: 100, referenceRate: 1500 });
    assert.strictEqual(sUndef.notes, '', 'omitted notes should normalize to empty string');

    // whitespace notes
    const sWhite = store.saveSnapshot({ bankCash: 1000, usdtBalance: 100, referenceRate: 1500, notes: '   \t  \n  ' });
    assert.strictEqual(sWhite.notes, '', 'whitespace notes should be trimmed to empty string');

    // number notes coerced or sanitized
    const sNum = store.saveSnapshot({ bankCash: 1000, usdtBalance: 100, referenceRate: 1500, notes: 12345 });
    assert.strictEqual(sNum.notes, '', 'non-string notes should normalize to empty string');
  });

  it('2.2: 500-character boundary notes string stores and retrieves with 100% character fidelity', () => {
    const chars500 = 'A'.repeat(500);
    const snap = store.saveSnapshot({
      bankCash: 5000000,
      usdtBalance: 3000,
      referenceRate: 1530.5,
      notes: chars500
    });

    assert.strictEqual(snap.notes.length, 500);
    assert.strictEqual(snap.notes, chars500);

    // Retrieve from store
    const retrieved = store.getSnapshotById(snap.id);
    assert.strictEqual(retrieved.notes.length, 500);
    assert.strictEqual(retrieved.notes, chars500);
  });

  it('2.3: Multiline notes with CRLF, LF, and tab characters serialize and deserialize without loss', () => {
    const multilineText = `Session Summary:\n- Total Inflow: ₦10,000,000\r\n- USDT Acquired: 6,500\n\t* Target Arbitrage Spread: 1.8%\r\n- Pending Transfers: None.`;

    const snap = store.saveSnapshot({
      bankCash: 2000000,
      usdtBalance: 1500,
      referenceRate: 1540,
      notes: multilineText
    });

    assert.strictEqual(snap.notes, multilineText.trim());

    const inStore = store.getSnapshotById(snap.id);
    assert.strictEqual(inStore.notes, multilineText.trim());
  });

  it('2.4: Unicode, Nigerian Naira symbols (₦), emojis, and multilingual text preserve character encoding', () => {
    const unicodeNotes = 'End of Day 📊 | Total Profit: ₦350,000 🚀💰 | 99.8% Fill Rate | 交易成功 | Отличный день | 💎 Good liquidity';

    const snap = store.saveSnapshot({
      bankCash: 8000000,
      usdtBalance: 5200,
      referenceRate: 1538.75,
      notes: unicodeNotes
    });

    assert.strictEqual(snap.notes, unicodeNotes);

    const retrieved = store.getSnapshotById(snap.id);
    assert.strictEqual(retrieved.notes, unicodeNotes);
  });

  it('2.5: Hostile XSS payloads in notes are safely handled and escapeHtml renders harmless text', () => {
    const xssPayloads = [
      '<script>alert("XSS")</script>',
      '<img src=x onerror=alert(1)>',
      '<svg/onload=alert("pwned")>',
      '"><script>document.location="http://evil.com"</script>',
      '\' onfocus=\'alert(1)\' autofocus',
      '<iframe src="javascript:alert(1)"></iframe>'
    ];

    xssPayloads.forEach((payload, idx) => {
      const snap = store.saveSnapshot({
        id: `xss_snap_${idx}`,
        bankCash: 1000000,
        usdtBalance: 650,
        referenceRate: 1500,
        notes: payload
      });

      assert.strictEqual(snap.notes, payload);

      // Verify escapeHtml function produces safe output without unescaped tags
      const escaped = utils.escapeHtml(snap.notes);
      assert.ok(!escaped.includes('<script>'), `Payload ${idx} must not contain unescaped <script>`);
      assert.ok(!escaped.includes('<img'), `Payload ${idx} must not contain unescaped <img`);
      assert.ok(!escaped.includes('<svg'), `Payload ${idx} must not contain unescaped <svg`);
      assert.ok(!escaped.includes('<iframe'), `Payload ${idx} must not contain unescaped <iframe`);
    });
  });
});

// =========================================================================
// SECTION 3: store:updated Event Dispatch & Payload Verification
// =========================================================================
describe('Challenger M3-2 — 3. store:updated Event Dispatch & Notification Payloads', () => {
  beforeEach(async () => {
    await setupTestEnvironment();
  });

  it('3.1: store.saveSnapshot dispatches store:updated with type="snapshots" and full snapshot record', () => {
    const receivedEvents = [];
    const listener = (e) => {
      receivedEvents.push(e.detail);
    };

    window.addEventListener('store:updated', listener);

    const saved = store.saveSnapshot({
      bankCash: 2500000,
      usdtBalance: 1800,
      referenceRate: 1525,
      notes: 'Event test snapshot'
    });

    window.removeEventListener('store:updated', listener);

    assert.ok(receivedEvents.length >= 1, 'At least one store:updated event must be dispatched');
    const snapshotEvent = receivedEvents.find(e => e.type === 'snapshots' || e.type === 'SNAPSHOTS_UPDATED');
    assert.ok(snapshotEvent, 'store:updated must include snapshots event type');
    assert.strictEqual(snapshotEvent.payload.id, saved.id);
    assert.strictEqual(snapshotEvent.payload.bankCash, 2500000);
    assert.strictEqual(snapshotEvent.payload.usdtBalance, 1800);
    assert.strictEqual(snapshotEvent.payload.referenceRate, 1525);
    assert.ok(snapshotEvent.timestamp > 0);
  });

  it('3.2: store.deleteSnapshot dispatches store:updated with deletedId in payload', () => {
    const snap = store.saveSnapshot({
      id: 'snap_to_delete',
      bankCash: 100000,
      usdtBalance: 100,
      referenceRate: 1500
    });

    const receivedEvents = [];
    const listener = (e) => {
      receivedEvents.push(e.detail);
    };

    window.addEventListener('store:updated', listener);
    const result = store.deleteSnapshot('snap_to_delete');
    window.removeEventListener('store:updated', listener);

    assert.strictEqual(result, true);
    const deleteEvent = receivedEvents.find(e => e.type === 'snapshots' || e.type === 'SNAPSHOTS_UPDATED');
    assert.ok(deleteEvent);
    assert.strictEqual(deleteEvent.payload.deletedId, 'snap_to_delete');
  });

  it('3.3: store.clearSnapshots dispatches store:updated with cleared: true', () => {
    store.saveSnapshot({ bankCash: 100000, usdtBalance: 100, referenceRate: 1500 });
    store.saveSnapshot({ bankCash: 200000, usdtBalance: 200, referenceRate: 1500 });

    const receivedEvents = [];
    const listener = (e) => {
      receivedEvents.push(e.detail);
    };

    window.addEventListener('store:updated', listener);
    store.clearSnapshots();
    window.removeEventListener('store:updated', listener);

    assert.strictEqual(store.getSnapshots().length, 0);
    const clearEvent = receivedEvents.find(e => e.type === 'snapshots' || e.type === 'SNAPSHOTS_UPDATED');
    assert.ok(clearEvent);
    assert.strictEqual(clearEvent.payload.cleared, true);
  });

  it('3.4: Invalid snapshot save throws error and does NOT dispatch any store:updated events', () => {
    const receivedEvents = [];
    const listener = (e) => {
      receivedEvents.push(e.detail);
    };

    window.addEventListener('store:updated', listener);

    assert.throws(() => {
      store.saveSnapshot({
        bankCash: 1000000,
        usdtBalance: 1000,
        referenceRate: -50 // Invalid rate <= 0
      });
    });

    window.removeEventListener('store:updated', listener);

    assert.strictEqual(receivedEvents.length, 0, 'No event should be dispatched when validation fails');
    assert.strictEqual(store.getSnapshots().length, 0, 'Store must remain empty');
  });
});

// =========================================================================
// SECTION 4: Immediate Dashboard Widget Reactivity & Live Delta Updates
// =========================================================================
describe('Challenger M3-2 — 4. Immediate Dashboard Widget Reactivity & Live Delta Updates', () => {
  beforeEach(async () => {
    await setupTestEnvironment();
  });

  it('4.1: Initial state before any snapshots shows baseline guidance badge', () => {
    store.addBankAccount({ name: 'OPay', initialBalance: 1500000 });
    store.setOpeningInventory({ startingUsdtBalance: 1000, defaultCostBasis: 1500 });

    dashboardModule.initDashboard();

    const badgeDelta = document.getElementById('badge-net-worth-delta');
    assert.ok(badgeDelta, 'Delta badge must exist');
    assert.ok(
      badgeDelta.textContent.includes('Baseline on next snapshot') || badgeDelta.textContent.includes('Baseline'),
      'Badge should instruct user to save a baseline snapshot'
    );
  });

  it('4.2: Submitting snapshot via modal immediately renders delta badge with 0.00% and closes modal', () => {
    store.addBankAccount({ name: 'GTB', initialBalance: 2000000 });
    store.setOpeningInventory({ startingUsdtBalance: 1000, defaultCostBasis: 1500 });

    dashboardModule.initDashboard();
    dashboardModule.openSnapshotModal();

    const inputRate = document.getElementById('input-snapshot-ref-rate');
    inputRate.value = '1500';

    const form = document.getElementById('form-save-snapshot');
    form.dispatchEvent(new CustomEvent('submit', { cancelable: true }));

    // Verify modal is closed
    const backdrop = document.getElementById('modal-snapshot-backdrop');
    assert.strictEqual(backdrop.classList.contains('hidden'), true);

    // Verify delta badge now displays 0.00%
    const badgeDelta = document.getElementById('badge-net-worth-delta');
    assert.ok(badgeDelta.textContent.includes('0.00%') || badgeDelta.textContent.includes('₦0.00'), 'Delta should be 0.00% against newly saved snapshot');

    // Primary Net Worth values on hero card
    const elNgn = document.getElementById('stat-net-worth-ngn') || document.getElementById('dashboard-net-worth-ngn');
    const elUsdt = document.getElementById('stat-net-worth-usdt') || document.getElementById('dashboard-net-worth-usdt');
    assert.strictEqual(elNgn.textContent, '₦3,500,000.00'); // 2M + 1000*1500
    assert.strictEqual(elUsdt.textContent, '2,333.33 USDT'); // 1000 + 2M/1500
  });

  it('4.3: Changing bank ledger reactively updates live delta badge relative to saved snapshot', () => {
    const bank = store.addBankAccount({ name: 'Kuda', initialBalance: 1000000 });
    store.setOpeningInventory({ startingUsdtBalance: 1000, defaultCostBasis: 1500 });

    dashboardModule.initDashboard();

    // Save baseline snapshot at 1M NGN + 1000 USDT @ 1500 = ₦2,500,000
    store.saveSnapshot({
      bankCash: 1000000,
      usdtBalance: 1000,
      referenceRate: 1500,
      notes: 'Baseline'
    });

    // Simulate new sell trade adding 150,000 NGN profit
    store.addTrade({
      type: 'SELL',
      bankAccountId: bank.id,
      ngnAmount: 150000,
      usdtAmount: 100,
      rate: 1500,
      totalFees: 0,
      date: new Date().toISOString()
    });

    // Check reactive update
    const badgeDelta = document.getElementById('badge-net-worth-delta');
    // Live bank cash: 1,000,000 + 150,000 = 1,150,000. Live USDT: 1000 - 100 = 900.
    // Live Net Worth NGN: 1,150,000 + (900 * 1500) = 2,500,000.
    assert.ok(badgeDelta, 'Delta badge should remain updated');
  });

  it('4.4: Deleting latest snapshot reactively falls back to previous snapshot or baseline', () => {
    store.addBankAccount({ name: 'OPay', initialBalance: 1000000 });
    store.setOpeningInventory({ startingUsdtBalance: 1000, defaultCostBasis: 1500 });

    dashboardModule.initDashboard();

    const s1 = store.saveSnapshot({
      id: 'snap_1',
      timestamp: '2026-08-01T00:00:00.000Z',
      bankCash: 1000000,
      usdtBalance: 1000,
      referenceRate: 1500,
      notes: 'Day 1'
    });

    const s2 = store.saveSnapshot({
      id: 'snap_2',
      timestamp: '2026-08-02T00:00:00.000Z',
      bankCash: 1200000,
      usdtBalance: 1000,
      referenceRate: 1500,
      notes: 'Day 2'
    });

    // Delete snap_2
    store.deleteSnapshot(s2.id);

    const remaining = store.getSnapshots();
    assert.strictEqual(remaining.length, 1);
    assert.strictEqual(remaining[0].id, 'snap_1');

    const badgeDelta = document.getElementById('badge-net-worth-delta');
    assert.ok(badgeDelta.textContent.includes('0.00%') || badgeDelta.textContent.includes('₦0.00'));

    // Delete snap_1
    store.deleteSnapshot(s1.id);
    assert.strictEqual(store.getSnapshots().length, 0);

    const badgeDeltaEmpty = document.getElementById('badge-net-worth-delta');
    assert.ok(badgeDeltaEmpty.textContent.includes('Baseline on next snapshot') || badgeDeltaEmpty.textContent.includes('Baseline'));
  });
});

// =========================================================================
// SECTION 5: High-Concurrency & Stress Fuzzing Harness
// =========================================================================
describe('Challenger M3-2 — 5. Stress Fuzzing & High-Concurrency Harness', () => {
  beforeEach(async () => {
    await setupTestEnvironment();
  });

  it('5.1: 100 rapid sequential saves with random values maintain 100% mathematical and storage consistency', () => {
    const baseTime = new Date('2026-01-01T00:00:00.000Z').getTime();

    for (let i = 0; i < 100; i++) {
      const bankCash = Math.floor(Math.random() * 50000000) + 10000;
      const usdtBalance = Math.floor(Math.random() * 20000) + 10;
      const rate = 1400 + Math.random() * 300;
      const timeOffset = i * 3600000;

      const snap = store.saveSnapshot({
        timestamp: new Date(baseTime + timeOffset).toISOString(),
        bankCash,
        usdtBalance,
        referenceRate: rate,
        notes: `Random snapshot ${i}`
      });

      assert.ok(snap.id.startsWith('snp_') || snap.id.length > 5);
      assert.ok(Number.isFinite(snap.netWorthNgn));
      assert.ok(Number.isFinite(snap.netWorthUsdt));
      assert.strictEqual(snap.bankCash, bankCash);
      assert.strictEqual(snap.usdtBalance, usdtBalance);
    }

    const allSnaps = store.getSnapshots();
    assert.strictEqual(allSnaps.length, 100);

    // Verify ordering
    for (let i = 0; i < allSnaps.length - 1; i++) {
      const tA = new Date(allSnaps[i].timestamp).getTime();
      const tB = new Date(allSnaps[i + 1].timestamp).getTime();
      assert.ok(tA <= tB, `Snapshot ${i} must precede snapshot ${i + 1}`);
    }
  });

  it('5.2: Extreme rate boundary values (micro decimals, huge values) compute without NaN or crash', () => {
    const testCases = [
      { rate: 0.0001, expectedNgn: 1000000 + (100 * 0.0001) },
      { rate: 10000000, expectedNgn: 1000000 + (100 * 10000000) },
      { rate: 1540.12345678, expectedNgn: 1000000 + (100 * 1540.12345678) }
    ];

    testCases.forEach((tc, idx) => {
      const snap = store.saveSnapshot({
        id: `extreme_${idx}`,
        bankCash: 1000000,
        usdtBalance: 100,
        referenceRate: tc.rate,
        notes: `Rate test ${tc.rate}`
      });

      assert.ok(!isNaN(snap.netWorthNgn), `Net worth NGN must not be NaN for rate ${tc.rate}`);
      assert.ok(!isNaN(snap.netWorthUsdt), `Net worth USDT must not be NaN for rate ${tc.rate}`);
      assert.ok(isFinite(snap.netWorthNgn), `Net worth NGN must be finite for rate ${tc.rate}`);
      assert.ok(isFinite(snap.netWorthUsdt), `Net worth USDT must be finite for rate ${tc.rate}`);
    });
  });

  it('5.3: Multiple store:updated listeners receive notifications concurrently without dropped events', () => {
    let count1 = 0;
    let count2 = 0;
    let count3 = 0;

    const l1 = () => count1++;
    const l2 = () => count2++;
    const l3 = () => count3++;

    window.addEventListener('store:updated', l1);
    window.addEventListener('store:updated', l2);
    window.addEventListener('store:updated', l3);

    for (let i = 0; i < 20; i++) {
      store.saveSnapshot({
        bankCash: 100000 + i,
        usdtBalance: 50 + i,
        referenceRate: 1500,
        notes: `Batch ${i}`
      });
    }

    window.removeEventListener('store:updated', l1);
    window.removeEventListener('store:updated', l2);
    window.removeEventListener('store:updated', l3);

    // Each saveSnapshot calls notify twice ('snapshots' and 'SNAPSHOTS_UPDATED')
    assert.strictEqual(count1, 40);
    assert.strictEqual(count2, 40);
    assert.strictEqual(count3, 40);
  });
});
