/**
 * Milestone 1 Adversarial Challenger Suite: Trade Limits Validation & Store Persistence
 * Role: m1_challenger_1 (Empirical Challenger)
 * 
 * Adversarial stress testing of:
 * 1. validateTradeLimits (fuzzing, types, NaN, symbols, booleans, extreme values)
 * 2. store.getSettings (self-healing defaults, corrupted storage recovery, partial keys)
 * 3. store.saveSettings (transactional integrity, event dispatching, invalid rejection)
 * 4. Concurrency, state isolation, and re-instantiation persistence
 */

const { describe, it, beforeEach } = require('./harness/test-runner');
const { assert } = require('./harness/assertions');
const { setupDomEnvironment } = require('./harness/dom-mock');

describe('Challenger M1: Adversarial Trade Limits & Store Integrity Stress Suite', () => {
  let dom;
  let storeModule;
  let store;
  let validateTradeLimits;
  let STORAGE_KEYS;

  beforeEach(async () => {
    dom = setupDomEnvironment();
    // Clear storage before each test
    dom.localStorage.clear();
    
    // Import fresh module
    storeModule = await import('../js/store.js');
    store = storeModule.store;
    validateTradeLimits = storeModule.validateTradeLimits;
    STORAGE_KEYS = storeModule.STORAGE_KEYS;

    // Reset store state
    if (store && typeof store.clearAllData === 'function') {
      store.clearAllData();
    }
  });

  // =========================================================================
  // 1. validateTradeLimits Type Fuzzing & Boundary Stress
  // =========================================================================
  it('1.1: Standard valid limits (15,000 and 40,000 NGN) validate successfully with sanitized numbers', () => {
    const res = validateTradeLimits(15000, 40000);
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.errors.length, 0);
    assert.strictEqual(res.sanitized.minTradeLimitNgn, 15000);
    assert.strictEqual(res.sanitized.maxTradeLimitNgn, 40000);
  });

  it('1.2: Boundary identity: identical min and max limits (e.g. 25,000 and 25,000) are valid single-ticket limits', () => {
    const res = validateTradeLimits(25000, 25000);
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.errors.length, 0);
    assert.strictEqual(res.sanitized.minTradeLimitNgn, 25000);
    assert.strictEqual(res.sanitized.maxTradeLimitNgn, 25000);
  });

  it('1.3: String numbers ("15000", "40000") validate and sanitize to strict numeric types', () => {
    const res = validateTradeLimits('15000', '40000');
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(typeof res.sanitized.minTradeLimitNgn, 'number');
    assert.strictEqual(typeof res.sanitized.maxTradeLimitNgn, 'number');
    assert.strictEqual(res.sanitized.minTradeLimitNgn, 15000);
    assert.strictEqual(res.sanitized.maxTradeLimitNgn, 40000);
  });

  it('1.4: String numbers with whitespace padding ("  20000  ", "  50000  ") are cleanly parsed', () => {
    const res = validateTradeLimits('  20000  ', '  50000  ');
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.sanitized.minTradeLimitNgn, 20000);
    assert.strictEqual(res.sanitized.maxTradeLimitNgn, 50000);
  });

  it('1.5: Floating-point decimal limits (15000.50, 40000.75) validate accurately', () => {
    const res = validateTradeLimits(15000.5, 40000.75);
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.sanitized.minTradeLimitNgn, 15000.5);
    assert.strictEqual(res.sanitized.maxTradeLimitNgn, 40000.75);
  });

  it('1.6: Inverted limits (min 50,000 > max 20,000) are rejected with descriptive error message', () => {
    const res = validateTradeLimits(50000, 20000);
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.sanitized, null);
    assert.ok(res.errors.length > 0);
    assert.ok(res.errors[0].includes('cannot exceed maximum trade limit'));
  });

  it('1.7: Inverted boundary off-by-one (min 40,001 vs max 40,000) is rejected', () => {
    const res = validateTradeLimits(40001, 40000);
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.sanitized, null);
  });

  it('1.8: Negative limits are rejected for min, max, or both', () => {
    const resMinNeg = validateTradeLimits(-15000, 40000);
    assert.strictEqual(resMinNeg.isValid, false);
    assert.strictEqual(resMinNeg.sanitized, null);

    const resMaxNeg = validateTradeLimits(15000, -40000);
    assert.strictEqual(resMaxNeg.isValid, false);

    const resBothNeg = validateTradeLimits(-50000, -20000);
    assert.strictEqual(resBothNeg.isValid, false);
    assert.strictEqual(resBothNeg.errors.length, 2);
  });

  it('1.9: Zero limits (0) are strictly rejected as non-positive', () => {
    const resZeroMin = validateTradeLimits(0, 40000);
    assert.strictEqual(resZeroMin.isValid, false);

    const resZeroMax = validateTradeLimits(15000, 0);
    assert.strictEqual(resZeroMax.isValid, false);

    const resZeroBoth = validateTradeLimits(0, 0);
    assert.strictEqual(resZeroBoth.isValid, false);
    assert.strictEqual(resZeroBoth.errors.length, 2);
  });

  it('1.10: Non-numeric strings ("abc", "NaN", "null") are rejected without uncaught exceptions', () => {
    const res1 = validateTradeLimits('abc', 40000);
    assert.strictEqual(res1.isValid, false);

    const res2 = validateTradeLimits(15000, 'xyz');
    assert.strictEqual(res2.isValid, false);

    const res3 = validateTradeLimits('NaN', 'NaN');
    assert.strictEqual(res3.isValid, false);
  });

  it('1.11: Empty string ("") and whitespace-only strings ("   ") are rejected', () => {
    const resEmpty = validateTradeLimits('', 40000);
    assert.strictEqual(resEmpty.isValid, false);

    const resSpaces = validateTradeLimits(15000, '   ');
    assert.strictEqual(resSpaces.isValid, false);
  });

  it('1.12: Partial alphanumeric strings ("15000NGN", "40k", "₦15000") are rejected', () => {
    const res1 = validateTradeLimits('15000NGN', 40000);
    assert.strictEqual(res1.isValid, false);

    const res2 = validateTradeLimits(15000, '40k');
    assert.strictEqual(res2.isValid, false);

    const res3 = validateTradeLimits('₦15000', '₦40000');
    assert.strictEqual(res3.isValid, false);
  });

  it('1.13: Formatted strings with thousands commas ("15,000", "40,000") are rejected (raw numbers required)', () => {
    const res = validateTradeLimits('15,000', '40,000');
    assert.strictEqual(res.isValid, false);
  });

  it('1.14: Boolean values (true, false) are strictly rejected (not coerced to 1 or 0)', () => {
    const resTrue = validateTradeLimits(true, 40000);
    assert.strictEqual(resTrue.isValid, false, 'true must not coerce to 1');

    const resFalse = validateTradeLimits(15000, false);
    assert.strictEqual(resFalse.isValid, false, 'false must not coerce to 0');

    const resBoth = validateTradeLimits(true, false);
    assert.strictEqual(resBoth.isValid, false);
  });

  it('1.15: null and undefined are strictly rejected', () => {
    assert.strictEqual(validateTradeLimits(null, 40000).isValid, false);
    assert.strictEqual(validateTradeLimits(15000, null).isValid, false);
    assert.strictEqual(validateTradeLimits(undefined, 40000).isValid, false);
    assert.strictEqual(validateTradeLimits(15000, undefined).isValid, false);
    assert.strictEqual(validateTradeLimits(null, undefined).isValid, false);
  });

  it('1.16: Non-finite numbers (Infinity, -Infinity, NaN) are strictly rejected', () => {
    assert.strictEqual(validateTradeLimits(Infinity, 40000).isValid, false);
    assert.strictEqual(validateTradeLimits(15000, Infinity).isValid, false);
    assert.strictEqual(validateTradeLimits(-Infinity, 40000).isValid, false);
    assert.strictEqual(validateTradeLimits(NaN, 40000).isValid, false);
    assert.strictEqual(validateTradeLimits(15000, NaN).isValid, false);
  });

  it('1.17: Extreme values: 1e15 (1 quadrillion) and Number.MAX_SAFE_INTEGER are supported safely', () => {
    const res1 = validateTradeLimits(1000, 1e15);
    assert.strictEqual(res1.isValid, true);
    assert.strictEqual(res1.sanitized.maxTradeLimitNgn, 1e15);

    const res2 = validateTradeLimits(1000, Number.MAX_SAFE_INTEGER);
    assert.strictEqual(res2.isValid, true);
    assert.strictEqual(res2.sanitized.maxTradeLimitNgn, Number.MAX_SAFE_INTEGER);
  });

  it('1.18: Object types ({}, [], new Date()) are handled without throwing uncaught exceptions', () => {
    const resObj = validateTradeLimits({}, {});
    assert.strictEqual(resObj.isValid, false);

    const resEmptyArr = validateTradeLimits([], []);
    assert.strictEqual(resEmptyArr.isValid, false);

    const resMultiArr = validateTradeLimits([15000, 20000], 40000);
    assert.strictEqual(resMultiArr.isValid, false);
  });

  it('1.19: Store instance proxy store.validateTradeLimits delegates cleanly to validateTradeLimits', () => {
    const res = store.validateTradeLimits(18000, 50000);
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.sanitized.minTradeLimitNgn, 18000);
    assert.strictEqual(res.sanitized.maxTradeLimitNgn, 50000);
  });

  // =========================================================================
  // 2. Storage Corruption Recovery & Self-Healing in store.getSettings()
  // =========================================================================
  it('2.1: Clean/empty storage returns exact default trade limits (min: 15,000, max: 40,000)', () => {
    const settings = store.getSettings();
    assert.strictEqual(settings.minTradeLimitNgn, 15000);
    assert.strictEqual(settings.maxTradeLimitNgn, 40000);
    assert.strictEqual(typeof settings.minTradeLimitNgn, 'number');
    assert.strictEqual(typeof settings.maxTradeLimitNgn, 'number');
  });

  it('2.2: Persisted valid custom limits are returned without corruption', () => {
    dom.localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify({
      minTradeLimitNgn: 30000,
      maxTradeLimitNgn: 90000,
      targetSpread: 6.0
    }));
    const settings = store.getSettings();
    assert.strictEqual(settings.minTradeLimitNgn, 30000);
    assert.strictEqual(settings.maxTradeLimitNgn, 90000);
    assert.strictEqual(settings.targetSpread, 6.0);
  });

  it('2.3: Storage with string numbers ("25000", "75000") self-heals to numeric types in getSettings()', () => {
    dom.localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify({
      minTradeLimitNgn: '25000',
      maxTradeLimitNgn: '75000'
    }));
    const settings = store.getSettings();
    assert.strictEqual(settings.minTradeLimitNgn, 25000);
    assert.strictEqual(settings.maxTradeLimitNgn, 75000);
    assert.strictEqual(typeof settings.minTradeLimitNgn, 'number');
    assert.strictEqual(typeof settings.maxTradeLimitNgn, 'number');
  });

  it('2.4: Storage with inverted limits (min 60,000 > max 20,000) self-heals to defaults (15,000 / 40,000)', () => {
    dom.localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify({
      minTradeLimitNgn: 60000,
      maxTradeLimitNgn: 20000
    }));
    const settings = store.getSettings();
    assert.strictEqual(settings.minTradeLimitNgn, 15000, 'Inverted min limit must fall back to 15,000 default');
    assert.strictEqual(settings.maxTradeLimitNgn, 40000, 'Inverted max limit must fall back to 40,000 default');
  });

  it('2.5: Storage with negative limits (-5,000 / -1,000) self-heals to default limits', () => {
    dom.localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify({
      minTradeLimitNgn: -5000,
      maxTradeLimitNgn: -1000
    }));
    const settings = store.getSettings();
    assert.strictEqual(settings.minTradeLimitNgn, 15000);
    assert.strictEqual(settings.maxTradeLimitNgn, 40000);
  });

  it('2.6: Storage with zero or non-numeric values self-heals to defaults', () => {
    dom.localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify({
      minTradeLimitNgn: 0,
      maxTradeLimitNgn: 'CORRUPTED_VALUE'
    }));
    const settings = store.getSettings();
    assert.strictEqual(settings.minTradeLimitNgn, 15000);
    assert.strictEqual(settings.maxTradeLimitNgn, 40000);
  });

  it('2.7: Partial valid setting: only minTradeLimitNgn (20,000) specified preserves default max (40,000)', () => {
    dom.localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify({
      minTradeLimitNgn: 20000
    }));
    const settings = store.getSettings();
    assert.strictEqual(settings.minTradeLimitNgn, 20000);
    assert.strictEqual(settings.maxTradeLimitNgn, 40000);
  });

  it('2.8: Partial setting conflict: only minTradeLimitNgn (50,000) exceeding default max (40,000) self-heals both', () => {
    dom.localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify({
      minTradeLimitNgn: 50000
    }));
    const settings = store.getSettings();
    assert.strictEqual(settings.minTradeLimitNgn, 15000);
    assert.strictEqual(settings.maxTradeLimitNgn, 40000);
  });

  it('2.9: Partial setting conflict: only maxTradeLimitNgn (10,000) below default min (15,000) self-heals both', () => {
    dom.localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify({
      maxTradeLimitNgn: 10000
    }));
    const settings = store.getSettings();
    assert.strictEqual(settings.minTradeLimitNgn, 15000);
    assert.strictEqual(settings.maxTradeLimitNgn, 40000);
  });

  it('2.10: Completely malformed JSON in localStorage recovers safely to default settings', () => {
    dom.localStorage.setItem(STORAGE_KEYS.SETTINGS, '{{{{malformed::json@@');
    const settings = store.getSettings();
    assert.strictEqual(typeof settings, 'object');
    assert.strictEqual(settings.minTradeLimitNgn, 15000);
    assert.strictEqual(settings.maxTradeLimitNgn, 40000);
    assert.strictEqual(settings.platformFeePct, 0.3);
  });

  it('2.11: Non-object primitive JSON in localStorage ("12345") recovers safely to default settings', () => {
    dom.localStorage.setItem(STORAGE_KEYS.SETTINGS, '12345');
    const settings = store.getSettings();
    assert.strictEqual(settings.minTradeLimitNgn, 15000);
    assert.strictEqual(settings.maxTradeLimitNgn, 40000);
  });

  // =========================================================================
  // 3. Reactive State Mutations & Transactional Integrity in store.saveSettings()
  // =========================================================================
  it('3.1: Valid saveSettings updates storage and returns full settings object with sanitized limits', () => {
    const updated = store.saveSettings({
      minTradeLimitNgn: 20000,
      maxTradeLimitNgn: 60000,
      targetSpread: 4.5
    });

    assert.strictEqual(updated.minTradeLimitNgn, 20000);
    assert.strictEqual(updated.maxTradeLimitNgn, 60000);
    assert.strictEqual(updated.targetSpread, 4.5);

    const reloaded = store.getSettings();
    assert.strictEqual(reloaded.minTradeLimitNgn, 20000);
    assert.strictEqual(reloaded.maxTradeLimitNgn, 60000);
    assert.strictEqual(reloaded.targetSpread, 4.5);
  });

  it('3.2: Valid saveSettings dispatches "store:updated" CustomEvent on window with detail.type === "settings"', () => {
    let eventReceived = null;
    const listener = (e) => {
      eventReceived = e.detail;
    };
    dom.window.addEventListener('store:updated', listener);

    try {
      store.saveSettings({ minTradeLimitNgn: 22000, maxTradeLimitNgn: 55000 });
      assert.ok(eventReceived !== null, 'store:updated event must be dispatched on window');
      assert.strictEqual(eventReceived.type, 'settings');
      assert.strictEqual(eventReceived.payload.minTradeLimitNgn, 22000);
      assert.strictEqual(eventReceived.payload.maxTradeLimitNgn, 55000);
      assert.ok(typeof eventReceived.timestamp === 'number');
    } finally {
      dom.window.removeEventListener('store:updated', listener);
    }
  });

  it('3.3: Invalid saveSettings (inverted limits min > max) throws Error and does NOT dispatch event', () => {
    let eventDispatched = false;
    const listener = () => { eventDispatched = true; };
    dom.window.addEventListener('store:updated', listener);

    try {
      assert.throws(
        () => store.saveSettings({ minTradeLimitNgn: 70000, maxTradeLimitNgn: 30000 }),
        /Invalid trade limits/
      );
      assert.strictEqual(eventDispatched, false, 'No event should be dispatched when validation fails');
    } finally {
      dom.window.removeEventListener('store:updated', listener);
    }
  });

  it('3.4: Transactional rollback: rejected saveSettings leaves prior storage state completely untouched', () => {
    // Set initial valid state
    store.saveSettings({ minTradeLimitNgn: 25000, maxTradeLimitNgn: 80000, targetSpread: 3.5 });

    // Attempt invalid save
    assert.throws(
      () => store.saveSettings({ minTradeLimitNgn: -9999, maxTradeLimitNgn: 10000 }),
      /Invalid trade limits/
    );

    // Verify storage has not changed
    const current = store.getSettings();
    assert.strictEqual(current.minTradeLimitNgn, 25000, 'min limit must remain untouched');
    assert.strictEqual(current.maxTradeLimitNgn, 80000, 'max limit must remain untouched');
    assert.strictEqual(current.targetSpread, 3.5, 'other settings must remain untouched');
  });

  it('3.5: Non-limit settings update (e.g. targetSpread) safely preserves existing valid trade limits', () => {
    store.saveSettings({ minTradeLimitNgn: 18000, maxTradeLimitNgn: 45000 });
    const updated = store.saveSettings({ targetSpread: 7.2 });

    assert.strictEqual(updated.targetSpread, 7.2);
    assert.strictEqual(updated.minTradeLimitNgn, 18000, 'min limit preserved when updating targetSpread');
    assert.strictEqual(updated.maxTradeLimitNgn, 45000, 'max limit preserved when updating targetSpread');
  });

  it('3.6: Partial limit update (only minTradeLimitNgn) validates against current maxTradeLimitNgn', () => {
    // Current is min: 15000, max: 40000
    store.saveSettings({ minTradeLimitNgn: 25000 });
    let settings = store.getSettings();
    assert.strictEqual(settings.minTradeLimitNgn, 25000);
    assert.strictEqual(settings.maxTradeLimitNgn, 40000);

    // Attempt min > current max (50,000 > 40,000)
    assert.throws(
      () => store.saveSettings({ minTradeLimitNgn: 50000 }),
      /cannot exceed maximum trade limit/
    );

    // Verify state preserved at 25,000
    settings = store.getSettings();
    assert.strictEqual(settings.minTradeLimitNgn, 25000);
  });

  it('3.7: Partial limit update (only maxTradeLimitNgn) validates against current minTradeLimitNgn', () => {
    // Current is min: 15000, max: 40000
    store.saveSettings({ maxTradeLimitNgn: 65000 });
    let settings = store.getSettings();
    assert.strictEqual(settings.maxTradeLimitNgn, 65000);

    // Attempt max < current min (10,000 < 15,000)
    assert.throws(
      () => store.saveSettings({ maxTradeLimitNgn: 10000 }),
      /cannot exceed maximum trade limit/
    );

    // Verify state preserved at 65,000
    settings = store.getSettings();
    assert.strictEqual(settings.maxTradeLimitNgn, 65000);
  });

  it('3.8: String numeric limits in saveSettings ("30000", "70000") are sanitized to numbers before storage', () => {
    const updated = store.saveSettings({ minTradeLimitNgn: '30000', maxTradeLimitNgn: '70000' });
    assert.strictEqual(typeof updated.minTradeLimitNgn, 'number');
    assert.strictEqual(typeof updated.maxTradeLimitNgn, 'number');
    assert.strictEqual(updated.minTradeLimitNgn, 30000);
    assert.strictEqual(updated.maxTradeLimitNgn, 70000);

    // Verify raw JSON in localStorage has numbers, not strings
    const rawSaved = JSON.parse(dom.localStorage.getItem(STORAGE_KEYS.SETTINGS));
    assert.strictEqual(typeof rawSaved.minTradeLimitNgn, 'number');
    assert.strictEqual(typeof rawSaved.maxTradeLimitNgn, 'number');
  });

  it('3.9: Re-instantiating Store from localStorage loads persisted limits accurately', async () => {
    store.saveSettings({ minTradeLimitNgn: 33000, maxTradeLimitNgn: 88000 });
    
    // Create new Store instance
    const freshModule = await import('../js/store.js');
    const freshSettings = freshModule.store.getSettings();
    assert.strictEqual(freshSettings.minTradeLimitNgn, 33000);
    assert.strictEqual(freshSettings.maxTradeLimitNgn, 88000);
  });

  // =========================================================================
  // 4. Concurrency, High-Volume & Stress Invariants
  // =========================================================================
  it('4.1: 50 sequential rapid updates maintain deterministic state and final value', () => {
    for (let i = 1; i <= 50; i++) {
      store.saveSettings({
        minTradeLimitNgn: 15000 + i * 100,
        maxTradeLimitNgn: 40000 + i * 200
      });
    }

    const finalSettings = store.getSettings();
    assert.strictEqual(finalSettings.minTradeLimitNgn, 15000 + 50 * 100);
    assert.strictEqual(finalSettings.maxTradeLimitNgn, 40000 + 50 * 200);
  });

  it('4.2: Alternating valid and invalid saves ensures no corrupted state leaks into subsequent reads', () => {
    for (let i = 1; i <= 20; i++) {
      // Valid save
      store.saveSettings({ minTradeLimitNgn: 10000 + i * 10, maxTradeLimitNgn: 50000 + i * 10 });

      // Invalid save attempt (should throw)
      assert.throws(() => {
        store.saveSettings({ minTradeLimitNgn: 90000, maxTradeLimitNgn: 10000 });
      });

      // Assert state matches the last valid save
      const current = store.getSettings();
      assert.strictEqual(current.minTradeLimitNgn, 10000 + i * 10);
      assert.strictEqual(current.maxTradeLimitNgn, 50000 + i * 10);
    }
  });

  it('4.3: High-precision decimal limits preserve precision through roundtrip', () => {
    const minVal = 15000.125;
    const maxVal = 40000.875;
    store.saveSettings({ minTradeLimitNgn: minVal, maxTradeLimitNgn: maxVal });

    const settings = store.getSettings();
    assert.strictEqual(settings.minTradeLimitNgn, minVal);
    assert.strictEqual(settings.maxTradeLimitNgn, maxVal);
  });

  it('4.4: Multiple reactive listeners on window receive identical events with correct timestamps', () => {
    const received1 = [];
    const received2 = [];

    const l1 = (e) => received1.push(e.detail);
    const l2 = (e) => received2.push(e.detail);

    dom.window.addEventListener('store:updated', l1);
    dom.window.addEventListener('store:updated', l2);

    try {
      store.saveSettings({ minTradeLimitNgn: 21000, maxTradeLimitNgn: 49000 });
      store.saveSettings({ minTradeLimitNgn: 22000, maxTradeLimitNgn: 51000 });

      assert.strictEqual(received1.length, 2);
      assert.strictEqual(received2.length, 2);
      assert.strictEqual(received1[0].payload.minTradeLimitNgn, 21000);
      assert.strictEqual(received2[0].payload.minTradeLimitNgn, 21000);
      assert.strictEqual(received1[1].payload.minTradeLimitNgn, 22000);
      assert.strictEqual(received2[1].payload.minTradeLimitNgn, 22000);
    } finally {
      dom.window.removeEventListener('store:updated', l1);
      dom.window.removeEventListener('store:updated', l2);
    }
  });

  it('4.5: Full export and import roundtrip preserves trade limits across backup/restore', () => {
    store.saveSettings({ minTradeLimitNgn: 27500, maxTradeLimitNgn: 82500 });
    const backup = store.exportAllData();
    assert.strictEqual(backup.settings.minTradeLimitNgn, 27500);
    assert.strictEqual(backup.settings.maxTradeLimitNgn, 82500);

    // Clear and restore
    store.clearAllData();
    assert.strictEqual(store.getSettings().minTradeLimitNgn, 15000); // defaults restored

    store.importAllData(backup, true);
    const restored = store.getSettings();
    assert.strictEqual(restored.minTradeLimitNgn, 27500);
    assert.strictEqual(restored.maxTradeLimitNgn, 82500);
  });
});
