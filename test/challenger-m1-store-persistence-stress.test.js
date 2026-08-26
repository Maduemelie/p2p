/**
 * Milestone 1 Adversarial Challenger Suite: Store & Persistence Integrity
 * Role: m1_challenger_2 (Store & Persistence Challenger)
 * 
 * Stress-tests storage persistence, serialization, sorting invariants, duplicate IDs,
 * timestamp collisions, corrupted LocalStorage / malformed JSON imports, and event reactivity.
 */

const { describe, it, beforeEach } = require('./harness/test-runner');
const { assert } = require('./harness/assertions');
const { setupDomEnvironment } = require('./harness/dom-mock');

describe('Challenger 2: Adversarial Store Persistence, Serialization & Invariant Stress Suite', () => {
  let dom;
  let utils;
  let store;
  let STORAGE_KEYS;

  beforeEach(async () => {
    dom = setupDomEnvironment();
    utils = await import('../js/utils.js');
    const storeModule = await import('../js/store.js');
    store = storeModule.store;
    STORAGE_KEYS = storeModule.STORAGE_KEYS;
    store.clearAllData();
  });

  // =========================================================================
  // 1. Out-of-Order Snapshot Insertions & Chronological Sorting Invariants
  // =========================================================================
  it('1.1: 50 randomly shuffled snapshots inserted out-of-order are strictly sorted ascending', () => {
    const baseTime = new Date('2026-01-01T00:00:00.000Z').getTime();
    const oneDay = 24 * 60 * 60 * 1000;

    // Generate 50 timestamps across 50 days
    const timestamps = [];
    for (let i = 0; i < 50; i++) {
      timestamps.push(new Date(baseTime + i * oneDay).toISOString());
    }

    // Shuffle timestamps randomly
    const shuffled = [...timestamps].sort(() => Math.random() - 0.5);

    // Save snapshots in shuffled order
    shuffled.forEach((ts, idx) => {
      store.saveSnapshot({
        id: `rand_snap_${idx}`,
        timestamp: ts,
        bankCash: 100000 + idx * 1000,
        usdtBalance: 100 + idx,
        referenceRate: 1500
      });
    });

    const snapshots = store.getSnapshots();
    assert.strictEqual(snapshots.length, 50, 'All 50 snapshots must be saved');

    // Invariant: strict non-decreasing chronological order
    for (let i = 0; i < snapshots.length - 1; i++) {
      const tCurr = new Date(snapshots[i].timestamp).getTime();
      const tNext = new Date(snapshots[i + 1].timestamp).getTime();
      assert.ok(tCurr <= tNext, `Snapshot at index ${i} (${snapshots[i].timestamp}) must be <= index ${i + 1} (${snapshots[i + 1].timestamp})`);
    }

    // Verify oldest is day 0 and newest is day 49
    assert.strictEqual(snapshots[0].timestamp, timestamps[0], 'First snapshot must be the oldest');
    assert.strictEqual(snapshots[49].timestamp, timestamps[49], 'Last snapshot must be the newest');
  });

  it('1.2: Complete reverse chronological insertion (newest -> oldest) strictly maintains ascending order', () => {
    const dates = [
      '2026-08-25T18:00:00.000Z',
      '2026-08-25T14:00:00.000Z',
      '2026-08-25T10:00:00.000Z',
      '2026-08-25T06:00:00.000Z',
      '2026-08-24T22:00:00.000Z',
      '2026-08-20T12:00:00.000Z',
      '2026-08-01T00:00:00.000Z'
    ];

    dates.forEach((d, idx) => {
      store.saveSnapshot({
        id: `rev_${idx}`,
        timestamp: d,
        bankCash: 500000,
        usdtBalance: 300,
        referenceRate: 1520
      });
    });

    const snapshots = store.getSnapshots();
    assert.strictEqual(snapshots.length, dates.length);

    // Verify strictly ascending order
    for (let i = 0; i < snapshots.length - 1; i++) {
      const t1 = new Date(snapshots[i].timestamp).getTime();
      const t2 = new Date(snapshots[i + 1].timestamp).getTime();
      assert.isBelow(t1, t2, `Snapshot ${i} must precede snapshot ${i + 1}`);
    }

    assert.strictEqual(snapshots[0].timestamp, '2026-08-01T00:00:00.000Z');
    assert.strictEqual(snapshots[snapshots.length - 1].timestamp, '2026-08-25T18:00:00.000Z');
  });

  it('1.3: Interleaving past snapshot between existing ones dynamically shifts indices without data corruption', () => {
    store.saveSnapshot({ id: 's1', timestamp: '2026-08-25T08:00:00Z', bankCash: 100000, usdtBalance: 100, referenceRate: 1500 });
    store.saveSnapshot({ id: 's3', timestamp: '2026-08-25T16:00:00Z', bankCash: 300000, usdtBalance: 300, referenceRate: 1500 });

    let list = store.getSnapshots();
    assert.strictEqual(list.length, 2);
    assert.strictEqual(list[0].id, 's1');
    assert.strictEqual(list[1].id, 's3');

    // Insert s2 between s1 and s3
    store.saveSnapshot({ id: 's2', timestamp: '2026-08-25T12:00:00Z', bankCash: 200000, usdtBalance: 200, referenceRate: 1500 });

    list = store.getSnapshots();
    assert.strictEqual(list.length, 3);
    assert.strictEqual(list[0].id, 's1');
    assert.strictEqual(list[1].id, 's2');
    assert.strictEqual(list[2].id, 's3');
  });

  it('1.4: ISO 8601 strings with diverse timezone offsets are sorted accurately by absolute UTC instant', () => {
    // 14:00 UTC+1 (13:00 UTC) vs 13:30 UTC+0 (13:30 UTC) vs 12:00 UTC-2 (14:00 UTC)
    store.saveSnapshot({ id: 'utc_plus_1', timestamp: '2026-08-25T14:00:00+01:00', bankCash: 100, usdtBalance: 10, referenceRate: 1500 }); // 13:00 UTC
    store.saveSnapshot({ id: 'utc_zero', timestamp: '2026-08-25T13:30:00Z', bankCash: 200, usdtBalance: 20, referenceRate: 1500 });       // 13:30 UTC
    store.saveSnapshot({ id: 'utc_minus_2', timestamp: '2026-08-25T12:00:00-02:00', bankCash: 300, usdtBalance: 30, referenceRate: 1500 }); // 14:00 UTC

    const sorted = store.getSnapshots();
    assert.strictEqual(sorted.length, 3);
    assert.strictEqual(sorted[0].id, 'utc_plus_1', '13:00 UTC must be first');
    assert.strictEqual(sorted[1].id, 'utc_zero', '13:30 UTC must be second');
    assert.strictEqual(sorted[2].id, 'utc_minus_2', '14:00 UTC must be third');
  });

  it('1.5: Updating existing snapshot with modified timestamp dynamically re-sorts storage collection', () => {
    store.saveSnapshot({ id: 'move_me', timestamp: '2026-08-25T10:00:00Z', bankCash: 100, usdtBalance: 10, referenceRate: 1500 });
    store.saveSnapshot({ id: 'stay_here', timestamp: '2026-08-25T12:00:00Z', bankCash: 200, usdtBalance: 20, referenceRate: 1500 });

    assert.strictEqual(store.getSnapshots()[0].id, 'move_me');
    assert.strictEqual(store.getSnapshots()[1].id, 'stay_here');

    // Update 'move_me' to a later time (15:00:00Z)
    store.saveSnapshot({ id: 'move_me', timestamp: '2026-08-25T15:00:00Z', bankCash: 150, usdtBalance: 15, referenceRate: 1500 });

    const updated = store.getSnapshots();
    assert.strictEqual(updated.length, 2, 'Count must remain 2');
    assert.strictEqual(updated[0].id, 'stay_here', 'stay_here is now earlier than move_me');
    assert.strictEqual(updated[1].id, 'move_me', 'move_me moved to second position');
    assert.strictEqual(updated[1].bankCash, 150);
  });

  // =========================================================================
  // 2. Duplicate Snapshot IDs & Timestamp Collision Stress
  // =========================================================================
  it('2.1: Saving snapshot with duplicate ID replaces existing entry in-place and preserves total count', () => {
    store.saveSnapshot({ id: 'fixed_id', timestamp: '2026-08-25T10:00:00Z', bankCash: 500000, usdtBalance: 200, referenceRate: 1500, notes: 'Initial note' });
    assert.strictEqual(store.getSnapshots().length, 1);
    assert.strictEqual(store.getSnapshots()[0].bankCash, 500000);
    assert.strictEqual(store.getSnapshots()[0].notes, 'Initial note');

    // Overwrite with same ID
    store.saveSnapshot({ id: 'fixed_id', timestamp: '2026-08-25T10:00:00Z', bankCash: 750000, usdtBalance: 300, referenceRate: 1550, notes: 'Updated note' });

    assert.strictEqual(store.getSnapshots().length, 1, 'Array length must still be 1');
    const retrieved = store.getSnapshotById('fixed_id');
    assert.strictEqual(retrieved.bankCash, 750000);
    assert.strictEqual(retrieved.usdtBalance, 300);
    assert.strictEqual(retrieved.referenceRate, 1550);
    assert.strictEqual(retrieved.notes, 'Updated note');
  });

  it('2.2: Distinct snapshots with identical timestamp strings break ties cleanly via createdAt without dropping records', () => {
    const fixedTimestamp = '2026-08-25T12:00:00.000Z';

    store.saveSnapshot({ id: 'collision_1', timestamp: fixedTimestamp, createdAt: 1000, bankCash: 100, usdtBalance: 10, referenceRate: 1500 });
    store.saveSnapshot({ id: 'collision_2', timestamp: fixedTimestamp, createdAt: 2000, bankCash: 200, usdtBalance: 20, referenceRate: 1500 });
    store.saveSnapshot({ id: 'collision_3', timestamp: fixedTimestamp, createdAt: 3000, bankCash: 300, usdtBalance: 30, referenceRate: 1500 });

    const all = store.getSnapshots();
    assert.strictEqual(all.length, 3, 'All 3 colliding snapshots must be preserved');
    assert.strictEqual(all[0].id, 'collision_1');
    assert.strictEqual(all[1].id, 'collision_2');
    assert.strictEqual(all[2].id, 'collision_3');
  });

  it('2.3: Rapid generateId uniqueness stress test generates 1,000 IDs with zero collisions', () => {
    const idSet = new Set();
    for (let i = 0; i < 1000; i++) {
      const id = utils.generateId('snp');
      assert.ok(id.startsWith('snp_'), 'Must have prefix');
      assert.strictEqual(idSet.has(id), false, `Collision detected on ID: ${id}`);
      idSet.add(id);
    }
    assert.strictEqual(idSet.size, 1000);
  });

  it('2.4: Merge import (importAllData replace=false) deduplicates overlapping IDs and adds unseen records', () => {
    store.saveSnapshot({ id: 'existing_1', timestamp: '2026-08-25T10:00:00Z', bankCash: 100000, usdtBalance: 100, referenceRate: 1500, notes: 'Original' });
    store.saveSnapshot({ id: 'existing_2', timestamp: '2026-08-25T12:00:00Z', bankCash: 200000, usdtBalance: 200, referenceRate: 1500 });

    const mergeBackup = {
      version: 1,
      snapshots: [
        { id: 'existing_1', timestamp: '2026-08-25T10:00:00Z', bankCash: 999999, usdtBalance: 999, referenceRate: 1500, notes: 'Should be ignored in merge' },
        { id: 'new_3', timestamp: '2026-08-25T14:00:00Z', bankCash: 300000, usdtBalance: 300, referenceRate: 1500 },
        { id: 'new_4', timestamp: '2026-08-25T08:00:00Z', bankCash: 50000, usdtBalance: 50, referenceRate: 1500 }
      ]
    };

    store.importAllData(mergeBackup, false);

    const snapshots = store.getSnapshots();
    assert.strictEqual(snapshots.length, 4, 'Must have 4 snapshots total (2 existing + 2 new)');

    // In merge mode, existing records are preserved intact
    const existing1 = store.getSnapshotById('existing_1');
    assert.strictEqual(existing1.notes, 'Original');
    assert.strictEqual(existing1.bankCash, 100000);

    // Verify sorting includes newly inserted early snapshot new_4 at the top
    assert.strictEqual(snapshots[0].id, 'new_4');
    assert.strictEqual(snapshots[1].id, 'existing_1');
    assert.strictEqual(snapshots[2].id, 'existing_2');
    assert.strictEqual(snapshots[3].id, 'new_3');
  });

  it('2.5: Merge import with exact duplicate payload is 100% idempotent', () => {
    store.saveSnapshot({ id: 's1', timestamp: '2026-08-25T10:00:00Z', bankCash: 100000, usdtBalance: 100, referenceRate: 1500 });
    store.saveSnapshot({ id: 's2', timestamp: '2026-08-25T12:00:00Z', bankCash: 200000, usdtBalance: 200, referenceRate: 1500 });

    const exportData = store.exportAllData();

    // Merge import own export 3 times
    store.importAllData(exportData, false);
    store.importAllData(exportData, false);
    store.importAllData(exportData, false);

    const snapshots = store.getSnapshots();
    assert.strictEqual(snapshots.length, 2, 'Length must remain exactly 2 after idempotent merges');
  });

  // =========================================================================
  // 3. Storage Corruption, Malformed LocalStorage & Malformed JSON Import Recovery
  // =========================================================================
  it('3.1: Corrupted / truncated JSON in localStorage does not crash store methods and falls back to []', () => {
    const corruptPayloads = [
      '{ "unclosed": json ',
      'undefined',
      'NaN',
      '{"id": [unterminated',
      '<<< invalid XML / HTML >>>',
      '\0\0\0 binary trash \xff\xfe'
    ];

    corruptPayloads.forEach(payload => {
      localStorage.setItem(STORAGE_KEYS.NET_WORTH_SNAPSHOTS, payload);

      let result;
      assert.doesNotThrow(() => {
        result = store.getSnapshots();
      }, `getSnapshots() should not crash on payload: ${payload}`);

      assert.ok(Array.isArray(result));
      assert.strictEqual(result.length, 0);

      // Saving a snapshot on top of corrupt storage should recover gracefully
      assert.doesNotThrow(() => {
        store.saveSnapshot({ bankCash: 100, usdtBalance: 10, referenceRate: 1500 });
      }, `saveSnapshot() should recover from corrupted storage`);

      assert.strictEqual(store.getSnapshots().length, 1);
    });
  });

  it('3.2: LocalStorage containing JSON primitive types falls back cleanly to []', () => {
    const nonArrayJson = ['12345', '"plain_string"', 'true', 'false', '{"object": "not_an_array"}'];

    nonArrayJson.forEach(val => {
      localStorage.setItem(STORAGE_KEYS.NET_WORTH_SNAPSHOTS, val);
      const result = store.getSnapshots();
      assert.ok(Array.isArray(result), `Must return array for ${val}`);
      assert.strictEqual(result.length, 0);
    });
  });

  it('3.3: LocalStorage array containing non-object or null entries is filtered without crashing', () => {
    const dirtyArray = [
      null,
      undefined,
      42,
      'string_entry',
      true,
      { id: 'valid_snap', timestamp: '2026-08-25T10:00:00Z', bankCash: 100, usdtBalance: 10, referenceRate: 1500 }
    ];

    localStorage.setItem(STORAGE_KEYS.NET_WORTH_SNAPSHOTS, JSON.stringify(dirtyArray));
    const snapshots = store.getSnapshots();

    assert.strictEqual(snapshots.length, 1);
    assert.strictEqual(snapshots[0].id, 'valid_snap');
  });

  it('3.4: importAllData auto-repairs and sanitizes malformed snapshot records with legacy or missing fields', () => {
    const malformedBackup = {
      version: 1,
      snapshots: [
        null, // null entry
        'not an object', // primitive
        {
          // Missing id, legacy bankCashNGN, totalUsdt, missing netWorth fields
          timestamp: '2026-08-25T10:00:00Z',
          bankCashNGN: '500000',
          totalUsdt: '200',
          referenceRate: '1500',
          notes: 'Legacy formatted snapshot'
        },
        {
          // Missing timestamp -> validateSnapshot assigns ISO timestamp and preserves createdAt
          id: 'legacy_created_at_only',
          createdAt: 1724580000000,
          bankCash: 250000,
          usdtBalance: 100,
          referenceRate: 1500
        },
        {
          // Invalid rate <= 0 -> fallback to 1500
          id: 'zero_rate_snapshot',
          timestamp: '2026-08-25T12:00:00Z',
          bankCash: 100000,
          usdtBalance: 50,
          referenceRate: -50
        }
      ]
    };

    store.importAllData(malformedBackup, true);
    const snapshots = store.getSnapshots();

    assert.strictEqual(snapshots.length, 3, '3 valid/repairable snapshots should be restored');

    const legacySnap = snapshots.find(s => s.notes === 'Legacy formatted snapshot');
    assert.ok(legacySnap);
    assert.ok(legacySnap.id.startsWith('snp_'));
    assert.strictEqual(legacySnap.bankCash, 500000);
    assert.strictEqual(legacySnap.usdtBalance, 200);
    assert.strictEqual(legacySnap.netWorthNgn, 800000); // 500000 + 200*1500

    const createdSnap = snapshots.find(s => s.id === 'legacy_created_at_only');
    assert.ok(createdSnap);
    assert.strictEqual(createdSnap.createdAt, 1724580000000);
    assert.ok(typeof createdSnap.timestamp === 'string');
    assert.ok(!isNaN(new Date(createdSnap.timestamp).getTime()));

    const fixedRateSnap = snapshots.find(s => s.id === 'zero_rate_snapshot');
    assert.ok(fixedRateSnap);
    assert.strictEqual(fixedRateSnap.referenceRate, 1500, 'Invalid negative rate must fall back to 1500');
  });

  it('3.5: importAllData with missing snapshots property preserves existing snapshots in merge mode', () => {
    store.saveSnapshot({ id: 'snap_merged_1', bankCash: 100000, usdtBalance: 10, referenceRate: 1500 });

    const partialBackup = {
      trades: [],
      bankAccounts: []
    };

    store.importAllData(partialBackup, false); // merge mode
    assert.strictEqual(store.getSnapshots().length, 1);
    assert.strictEqual(store.getSnapshots()[0].id, 'snap_merged_1');
  });

  it('3.6: importAllData strictly rejects invalid root payloads (null, non-object, string)', () => {
    assert.throws(() => store.importAllData(null), /Invalid JSON backup/);
    assert.throws(() => store.importAllData('not a valid backup'), /Invalid JSON backup/);
    assert.throws(() => store.importAllData(12345), /Invalid JSON backup/);
    assert.throws(() => store.importAllData(undefined), /Invalid JSON backup/);
  });

  // =========================================================================
  // 4. Event Reactivity & Notification Dispatch Lifecycle
  // =========================================================================
  it('4.1: saveSnapshot emits store:updated events with types "snapshots" and "SNAPSHOTS_UPDATED"', () => {
    const receivedEvents = [];
    dom.window.addEventListener('store:updated', (e) => {
      receivedEvents.push(e.detail);
    });

    store.saveSnapshot({
      id: 'ev_test_1',
      bankCash: 500000,
      usdtBalance: 200,
      referenceRate: 1500,
      notes: 'Event test'
    });

    assert.strictEqual(receivedEvents.length, 2, 'Should emit 2 events for backwards and forward compatibility');
    
    const snapEvent = receivedEvents.find(e => e.type === 'snapshots');
    assert.ok(snapEvent);
    assert.strictEqual(snapEvent.payload.id, 'ev_test_1');
    assert.strictEqual(snapEvent.payload.bankCash, 500000);
    assert.ok(typeof snapEvent.timestamp === 'number');

    const updatedEvent = receivedEvents.find(e => e.type === 'SNAPSHOTS_UPDATED');
    assert.ok(updatedEvent);
    assert.strictEqual(updatedEvent.payload.id, 'ev_test_1');
  });

  it('4.2: deleteSnapshot emits store:updated events with payload { deletedId }', () => {
    store.saveSnapshot({ id: 'del_me', bankCash: 100000, usdtBalance: 10, referenceRate: 1500 });

    const receivedEvents = [];
    dom.window.addEventListener('store:updated', (e) => receivedEvents.push(e.detail));

    const result = store.deleteSnapshot('del_me');
    assert.strictEqual(result, true);

    assert.strictEqual(receivedEvents.length, 2);
    assert.strictEqual(receivedEvents[0].payload.deletedId, 'del_me');
    assert.strictEqual(receivedEvents[1].payload.deletedId, 'del_me');
  });

  it('4.3: deleteSnapshot on non-existent ID returns false and does NOT emit notifications', () => {
    const receivedEvents = [];
    dom.window.addEventListener('store:updated', (e) => receivedEvents.push(e.detail));

    const result = store.deleteSnapshot('does_not_exist_xyz');
    assert.strictEqual(result, false);
    assert.strictEqual(receivedEvents.length, 0, 'No events should be fired for failed deletion');
  });

  it('4.4: clearSnapshots emits store:updated events with { cleared: true, action: "clear" }', () => {
    store.saveSnapshot({ id: 's1', bankCash: 100000, usdtBalance: 10, referenceRate: 1500 });
    store.saveSnapshot({ id: 's2', bankCash: 200000, usdtBalance: 20, referenceRate: 1500 });

    const receivedEvents = [];
    dom.window.addEventListener('store:updated', (e) => receivedEvents.push(e.detail));

    store.clearSnapshots();
    assert.strictEqual(store.getSnapshots().length, 0);

    assert.strictEqual(receivedEvents.length, 2);
    assert.strictEqual(receivedEvents[0].payload.cleared, true);
    assert.strictEqual(receivedEvents[0].payload.action, 'clear');
    assert.strictEqual(receivedEvents[1].payload.cleared, true);
  });

  it('4.5: High-concurrency CRUD burst (50 saves, 25 deletes) maintains exact event ordering and storage consistency', () => {
    const events = [];
    dom.window.addEventListener('store:updated', (e) => events.push(e.detail));

    for (let i = 0; i < 50; i++) {
      store.saveSnapshot({ id: `burst_${i}`, bankCash: i * 1000, usdtBalance: i, referenceRate: 1500 });
    }

    assert.strictEqual(store.getSnapshots().length, 50);

    for (let i = 0; i < 25; i++) {
      store.deleteSnapshot(`burst_${i}`);
    }

    assert.strictEqual(store.getSnapshots().length, 25);
    // Total events = (50 saves * 2) + (25 deletes * 2) = 150 events
    assert.strictEqual(events.length, 150);
  });

  it('4.6: clearAllData cleans snapshots storage key and dispatches "all" event', () => {
    store.saveSnapshot({ id: 'will_be_cleared', bankCash: 100000, usdtBalance: 10, referenceRate: 1500 });

    const receivedEvents = [];
    dom.window.addEventListener('store:updated', (e) => receivedEvents.push(e.detail));

    store.clearAllData();

    assert.strictEqual(store.getSnapshots().length, 0);
    assert.strictEqual(localStorage.getItem(STORAGE_KEYS.NET_WORTH_SNAPSHOTS), null);

    assert.ok(receivedEvents.some(e => e.type === 'all'));
  });

  // =========================================================================
  // 5. Adversarial Validation & Serialization Round-Trip Integrity
  // =========================================================================
  it('5.1: saveSnapshot strictly throws on zero or negative reference rates', () => {
    assert.throws(() => {
      store.saveSnapshot({ bankCash: 100000, usdtBalance: 10, referenceRate: 0 });
    }, /positive number/);

    assert.throws(() => {
      store.saveSnapshot({ bankCash: 100000, usdtBalance: 10, referenceRate: -1500 });
    }, /positive number/);

    assert.throws(() => {
      store.saveSnapshot({ bankCash: 100000, usdtBalance: 10, referenceRate: 'invalid_rate' });
    }, /positive number/);
  });

  it('5.2: saveSnapshot strictly throws on negative USDT balance', () => {
    assert.throws(() => {
      store.saveSnapshot({ bankCash: 100000, usdtBalance: -10, referenceRate: 1500 });
    }, /non-negative/);
  });

  it('5.3: saveSnapshot strictly throws on NaN bank cash or invalid timestamps', () => {
    assert.throws(() => {
      store.saveSnapshot({ bankCash: NaN, usdtBalance: 10, referenceRate: 1500 });
    }, /finite number/);

    assert.throws(() => {
      store.saveSnapshot({ bankCash: 100000, usdtBalance: 10, referenceRate: 1500, timestamp: 'invalid-date-string' });
    }, /valid ISO date/);
  });

  it('5.4: Full backup export/import round-trip preserves 50 complex snapshots with 100% deep equality', () => {
    const generated = [];
    const baseTime = new Date('2026-08-01T00:00:00.000Z').getTime();

    for (let i = 0; i < 50; i++) {
      const s = store.saveSnapshot({
        id: `roundtrip_${i}`,
        timestamp: new Date(baseTime + i * 3600000).toISOString(),
        bankCash: (i % 2 === 0 ? 1 : -1) * (100000 + i * 500.50), // alternate positive and overdraft
        usdtBalance: 500 + i * 1.25,
        referenceRate: 1520.50 + i * 0.25,
        notes: `Snapshot note with special chars & <script>alert("${i}")</script> "quotes" 'apostrophes'`
      });
      generated.push(s);
    }

    // Export full backup JSON
    const backup = store.exportAllData();
    assert.ok(Array.isArray(backup.snapshots));
    assert.strictEqual(backup.snapshots.length, 50);

    // Clear all data
    store.clearAllData();
    assert.strictEqual(store.getSnapshots().length, 0);

    // Restore full backup JSON
    store.importAllData(backup, true);
    const restored = store.getSnapshots();

    assert.strictEqual(restored.length, 50);

    for (let i = 0; i < 50; i++) {
      assert.strictEqual(restored[i].id, generated[i].id);
      assert.strictEqual(restored[i].timestamp, generated[i].timestamp);
      assert.closeTo(restored[i].bankCash, generated[i].bankCash, 0.001);
      assert.closeTo(restored[i].usdtBalance, generated[i].usdtBalance, 0.001);
      assert.closeTo(restored[i].referenceRate, generated[i].referenceRate, 0.001);
      assert.closeTo(restored[i].netWorthNgn, generated[i].netWorthNgn, 0.001);
      assert.closeTo(restored[i].netWorthUsdt, generated[i].netWorthUsdt, 0.001);
      assert.strictEqual(restored[i].notes, generated[i].notes);
    }
  });

  it('5.5: Extreme numbers (₦1 Trillion cash, 100M USDT) store and calculate net worth without overflow or NaN', () => {
    const hugeSnapshot = store.saveSnapshot({
      id: 'whale_snapshot',
      bankCash: 1000000000000.50, // ₦1 Trillion
      usdtBalance: 100000000.00,    // 100 Million USDT
      referenceRate: 1600.00
    });

    // NW_NGN = 1,000,000,000,000.50 + (100,000,000 * 1600) = 1,000,000,000,000.50 + 160,000,000,000 = 1,160,000,000,000.50
    assert.strictEqual(hugeSnapshot.netWorthNgn, 1160000000000.50);
    assert.closeTo(hugeSnapshot.netWorthUsdt, 725000000.00, 0.01);

    const retrieved = store.getSnapshotById('whale_snapshot');
    assert.strictEqual(retrieved.netWorthNgn, 1160000000000.50);
  });

  // =========================================================================
  // 6. Micro-Performance & Defensive Immutability Benchmark
  // =========================================================================
  it('6.1: Storing, sorting, and retrieving 500 snapshots executes within performance budget (< 1500ms)', () => {
    const baseTime = Date.now();
    const start = Date.now();

    for (let i = 0; i < 500; i++) {
      store.saveSnapshot({
        id: `perf_${i}`,
        timestamp: new Date(baseTime + (500 - i) * 1000).toISOString(), // reverse order to force sorting
        bankCash: 100000 + i,
        usdtBalance: 100 + i,
        referenceRate: 1500
      });
    }

    const snapshots = store.getSnapshots();
    const duration = Date.now() - start;

    assert.strictEqual(snapshots.length, 500);
    assert.isBelow(duration, 3000, `CRUD and sort on 500 records took ${duration}ms, must be < 3000ms`);
  });

  it('6.2: getSnapshots() returns isolated clones that do not mutate store if modified by caller', () => {
    store.saveSnapshot({ id: 'immutable_test', bankCash: 500000, usdtBalance: 100, referenceRate: 1500 });

    const list1 = store.getSnapshots();
    assert.strictEqual(list1.length, 1);

    // Caller mutates array and object
    list1.push({ id: 'polluted_item' });
    list1[0].bankCash = 999999999;

    const list2 = store.getSnapshots();
    assert.strictEqual(list2.length, 1, 'Internal store array must not be modified');
    // Verify stored snapshot is unmodified
    assert.strictEqual(list2[0].bankCash, 500000, 'Internal snapshot fields must remain intact');
  });
}, { tier: 5, category: 'M1 Storage Persistence & Invariants' });
