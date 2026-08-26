/**
 * Tier 1: Feature Coverage — M1: Mathematical Calculation Engine & Snapshot Store
 */

const { describe, it, beforeEach } = require('../harness/test-runner');
const { assert } = require('../harness/assertions');
const { setupDomEnvironment } = require('../harness/dom-mock');

describe('Tier 1 — M1: Core Calculations & Snapshot Store Engine', () => {
  let dom;
  let utils;
  let store;
  let STORAGE_KEYS;

  beforeEach(async () => {
    dom = setupDomEnvironment();
    utils = await import('../../js/utils.js');
    const storeModule = await import('../../js/store.js');
    store = storeModule.store;
    STORAGE_KEYS = storeModule.STORAGE_KEYS;
    store.clearAllData();
  });

  // 1. calculateTotalBankCash
  it('M1.1: Aggregates cash across Map from store.getComputedBankBalances()', () => {
    const bankMap = new Map([
      ['b1', { initialBalance: 100000, currentBalance: 500000 }],
      ['b2', { initialBalance: 200000, currentBalance: 750000 }],
      ['b3', { initialBalance: 50000, currentBalance: 250000 }]
    ]);
    const total = utils.calculateTotalBankCash(bankMap);
    assert.strictEqual(total, 1500000, 'Sum should equal ₦1,500,000');
  });

  it('M1.2: Accurately handles negative overdraft balances and zero values', () => {
    const bankMap = new Map([
      ['b1', { currentBalance: 600000 }],
      ['b2', { currentBalance: -100000 }],
      ['b3', { currentBalance: 0 }]
    ]);
    const total = utils.calculateTotalBankCash(bankMap);
    assert.strictEqual(total, 500000, 'Sum should deduct overdraft balance to ₦500,000');
  });

  it('M1.3: Polymorphically supports Arrays, Objects, and handles null/undefined safely', () => {
    assert.strictEqual(utils.calculateTotalBankCash(null), 0);
    assert.strictEqual(utils.calculateTotalBankCash(undefined), 0);
    assert.strictEqual(utils.calculateTotalBankCash([]), 0);
    assert.strictEqual(utils.calculateTotalBankCash(new Map()), 0);
    assert.strictEqual(utils.calculateTotalBankCash([{ currentBalance: 1200 }, { currentBalance: 800 }]), 2000);
    assert.strictEqual(utils.calculateTotalBankCash({ a: { currentBalance: 300 }, b: { currentBalance: 700 } }), 1000);
    assert.strictEqual(utils.calculateTotalBankCash([{ balance: 500 }, { currentBalance: '1500' }]), 2000);
  });

  // 2. resolveReferenceRate
  it('M1.4: Tier 1 - Active Sell Ad rate takes highest precedence', () => {
    const rate = utils.resolveReferenceRate({
      activeSellAd: { price: '1650.50', side: 1, status: 10 },
      latestTrade: { rate: 1600.00 },
      fifoAvgBuyCost: 1580.00,
      openingDefaultRate: 1550.00,
      fallbackRate: 1500.00
    });
    assert.strictEqual(rate, 1650.50);
  });

  it('M1.5: Tier 2 - Uses Latest Trade rate when active ad is offline or missing', () => {
    const rateOfflineAd = utils.resolveReferenceRate({
      activeSellAd: { price: '1700.00', side: 1, status: 30 }, // offline
      latestTrade: { rate: 1625.00 },
      fifoAvgBuyCost: 1580.00
    });
    assert.strictEqual(rateOfflineAd, 1625.00);

    const rateBuyAd = utils.resolveReferenceRate({
      activeSellAd: { price: '1600.00', side: 0, status: 10 }, // BUY ad, not SELL
      latestTrade: { rate: 1630.00 }
    });
    assert.strictEqual(rateBuyAd, 1630.00);

    const rateTradeArray = utils.resolveReferenceRate({
      latestTrade: [
        { date: '2026-08-20T10:00:00Z', rate: 1590.00 },
        { date: '2026-08-25T12:00:00Z', rate: 1640.00 }
      ]
    });
    assert.strictEqual(rateTradeArray, 1640.00);
  });

  it('M1.6: Tier 3 & 4 - Falls back to FIFO avg cost, opening default, or 1500.00', () => {
    const rateFifo = utils.resolveReferenceRate({ fifoAvgBuyCost: 1585.50 });
    assert.strictEqual(rateFifo, 1585.50);

    const rateOpening = utils.resolveReferenceRate({ openingDefaultRate: 1560.00 });
    assert.strictEqual(rateOpening, 1560.00);

    const rateOpeningObj = utils.resolveReferenceRate({ openingInventory: { defaultCostBasis: 1565.00 } });
    assert.strictEqual(rateOpeningObj, 1565.00);

    const rateFallback = utils.resolveReferenceRate({});
    assert.strictEqual(rateFallback, 1500.00);

    const rateCustomFallback = utils.resolveReferenceRate({ fallbackRate: 1575.25 });
    assert.strictEqual(rateCustomFallback, 1575.25);
  });

  // 3. calculateNetWorth
  it('M1.7: Evaluates dual-currency Net Worth with mathematical exactness', () => {
    const bankCash = 1250000;
    const totalUsdt = 1500;
    const rate = 1535;

    const result = utils.calculateNetWorth(bankCash, totalUsdt, rate);
    // NW_NGN = 1250000 + (1500 * 1535) = 1250000 + 2302500 = 3552500
    // NW_USDT = 1500 + (1250000 / 1535) = 1500 + 814.3322... = 2314.33
    assert.strictEqual(result.netWorthNgn, 3552500);
    assert.closeTo(result.netWorthUsdt, 2314.33, 0.01);
    assert.strictEqual(result.bankCashNgn, 1250000);
    assert.strictEqual(result.totalUsdt, 1500);
    assert.strictEqual(result.referenceRate, 1535);
  });

  it('M1.8: Handles zero/negative rates and overdrafts safely without division by zero', () => {
    const resultZeroRate = utils.calculateNetWorth(500000, 200, 0);
    assert.strictEqual(resultZeroRate.netWorthNgn, 500000);
    assert.strictEqual(resultZeroRate.netWorthUsdt, 200);

    const resultNegativeRate = utils.calculateNetWorth(500000, 200, -100);
    assert.strictEqual(resultNegativeRate.netWorthNgn, 500000);
    assert.strictEqual(resultNegativeRate.netWorthUsdt, 200);

    const resultNegativeCash = utils.calculateNetWorth(-50000, 100, 1500);
    assert.strictEqual(resultNegativeCash.netWorthNgn, 100000); // -50000 + (100 * 1500) = 100000
    assert.closeTo(resultNegativeCash.netWorthUsdt, 66.67, 0.01); // 100 + (-50000 / 1500) = 66.67
  });

  // 4. calculateSnapshotDelta
  it('M1.9: Computes positive, negative, and zero percentage deltas', () => {
    const prev = { netWorthNgn: 1000000, netWorthUsdt: 1000 };
    const currGrowth = { netWorthNgn: 1100000, netWorthUsdt: 1100 };
    const delta1 = utils.calculateSnapshotDelta(currGrowth, prev);

    assert.strictEqual(delta1.deltaNgn, 100000);
    assert.closeTo(delta1.pctDeltaNgn, 10.0, 0.01);
    assert.strictEqual(delta1.deltaUsdt, 100);
    assert.closeTo(delta1.pctDeltaUsdt, 10.0, 0.01);

    const currDrop = { netWorthNgn: 950000, netWorthUsdt: 950 };
    const delta2 = utils.calculateSnapshotDelta(currDrop, prev);
    assert.strictEqual(delta2.deltaNgn, -50000);
    assert.closeTo(delta2.pctDeltaNgn, -5.0, 0.01);
  });

  it('M1.10: Handles null previous snapshot and zero/negative divisor baselines cleanly', () => {
    const deltaNull = utils.calculateSnapshotDelta({ netWorthNgn: 500000, netWorthUsdt: 500 }, null);
    assert.strictEqual(deltaNull.deltaNgn, 0);
    assert.strictEqual(deltaNull.pctDeltaNgn, 0);

    const deltaZeroPrev = utils.calculateSnapshotDelta({ netWorthNgn: 500000, netWorthUsdt: 500 }, { netWorthNgn: 0, netWorthUsdt: 0 });
    assert.strictEqual(deltaZeroPrev.deltaNgn, 500000);
    assert.strictEqual(deltaZeroPrev.pctDeltaNgn, 0);

    // Sign-preserving negative baseline: from -100,000 to +50,000 => delta +150,000 => +150%
    const deltaNegativeBase = utils.calculateSnapshotDelta({ netWorthNgn: 50000, netWorthUsdt: 50 }, { netWorthNgn: -100000, netWorthUsdt: -100 });
    assert.strictEqual(deltaNegativeBase.deltaNgn, 150000);
    assert.closeTo(deltaNegativeBase.pctDeltaNgn, 150.0, 0.01);
  });

  // 5. validateSnapshot
  it('M1.11: Validates and sanitizes valid snapshot record', () => {
    const raw = {
      bankCash: 1000000,
      usdtBalance: 500,
      referenceRate: 1550,
      notes: 'End of day trading snapshot'
    };
    const result = utils.validateSnapshot(raw);
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.sanitized.bankCash, 1000000);
    assert.strictEqual(result.sanitized.usdtBalance, 500);
    assert.strictEqual(result.sanitized.referenceRate, 1550);
    assert.strictEqual(result.sanitized.netWorthNgn, 1775000); // 1000000 + 500*1550
    assert.ok(result.sanitized.id.startsWith('snp_'));
    assert.strictEqual(result.sanitized.notes, 'End of day trading snapshot');
  });

  it('M1.12: Rejects snapshots with invalid or negative reference rates / USDT balances', () => {
    const invalidRate = utils.validateSnapshot({ bankCash: 100, usdtBalance: 50, referenceRate: -10 });
    assert.strictEqual(invalidRate.isValid, false);
    assert.ok(invalidRate.errors.some(e => e.includes('positive number')));

    const invalidUsdt = utils.validateSnapshot({ bankCash: 100, usdtBalance: -5, referenceRate: 1500 });
    assert.strictEqual(invalidUsdt.isValid, false);
    assert.ok(invalidUsdt.errors.some(e => e.includes('non-negative')));

    const nonObject = utils.validateSnapshot('invalid');
    assert.strictEqual(nonObject.isValid, false);
  });

  // 6. Snapshot Store CRUD & Integration
  it('M1.13: saveSnapshot persists snapshot, maintains chronological ordering, and fires notifications', () => {
    const events = [];
    dom.window.addEventListener('store:updated', (e) => events.push(e.detail));

    const s2 = store.saveSnapshot({ timestamp: '2026-08-25T14:00:00Z', bankCash: 500000, usdtBalance: 300, referenceRate: 1500 });
    const s1 = store.saveSnapshot({ timestamp: '2026-08-25T10:00:00Z', bankCash: 400000, usdtBalance: 200, referenceRate: 1500 });
    const s3 = store.saveSnapshot({ timestamp: '2026-08-25T18:00:00Z', bankCash: 600000, usdtBalance: 400, referenceRate: 1500 });

    const snapshots = store.getSnapshots();
    assert.strictEqual(snapshots.length, 3);
    assert.strictEqual(snapshots[0].id, s1.id, 'Oldest snapshot s1 must come first');
    assert.strictEqual(snapshots[1].id, s2.id, 'Intermediate snapshot s2 must come second');
    assert.strictEqual(snapshots[2].id, s3.id, 'Newest snapshot s3 must come third');

    assert.isAbove(events.length, 0, 'Notifications must be emitted');
    assert.ok(events.some(e => e.type === 'snapshots' || e.type === 'SNAPSHOTS_UPDATED'));
  });

  it('M1.14: getSnapshotById, deleteSnapshot, and clearSnapshots manage collection cleanly', () => {
    const s1 = store.saveSnapshot({ id: 'snp_test_1', bankCash: 100000, usdtBalance: 50, referenceRate: 1500 });
    const s2 = store.saveSnapshot({ id: 'snp_test_2', bankCash: 200000, usdtBalance: 100, referenceRate: 1500 });

    const found = store.getSnapshotById('snp_test_1');
    assert.strictEqual(found.id, s1.id);
    assert.strictEqual(store.getSnapshotById('non_existent'), null);

    const deleted = store.deleteSnapshot('snp_test_1');
    assert.strictEqual(deleted, true);
    assert.strictEqual(store.getSnapshots().length, 1);
    assert.strictEqual(store.getSnapshots()[0].id, s2.id);

    store.clearSnapshots();
    assert.strictEqual(store.getSnapshots().length, 0);
  });

  it('M1.15: exportAllData and importAllData seamlessly serialize and restore snapshots (replace and merge)', () => {
    store.saveSnapshot({ id: 'snp_exp_1', timestamp: '2026-08-25T10:00:00Z', bankCash: 100000, usdtBalance: 50, referenceRate: 1500 });
    store.saveSnapshot({ id: 'snp_exp_2', timestamp: '2026-08-25T11:00:00Z', bankCash: 200000, usdtBalance: 100, referenceRate: 1500 });

    const backup = store.exportAllData();
    assert.ok(Array.isArray(backup.snapshots));
    assert.strictEqual(backup.snapshots.length, 2);

    // Clear all
    store.clearAllData();
    assert.strictEqual(store.getSnapshots().length, 0);

    // Restore with replace mode
    store.importAllData(backup, true);
    assert.strictEqual(store.getSnapshots().length, 2);

    // Merge mode: Add 1 existing (snp_exp_2) and 1 new (snp_exp_3)
    const mergePayload = {
      version: 1,
      snapshots: [
        { id: 'snp_exp_2', timestamp: '2026-08-25T11:00:00Z', bankCash: 200000, usdtBalance: 100, referenceRate: 1500 },
        { id: 'snp_exp_3', timestamp: '2026-08-25T12:00:00Z', bankCash: 300000, usdtBalance: 150, referenceRate: 1500 }
      ]
    };
    store.importAllData(mergePayload, false);
    const afterMerge = store.getSnapshots();
    assert.strictEqual(afterMerge.length, 3, 'Should have snp_exp_1, snp_exp_2, snp_exp_3 without duplicates');
    assert.strictEqual(afterMerge[0].id, 'snp_exp_1');
    assert.strictEqual(afterMerge[1].id, 'snp_exp_2');
    assert.strictEqual(afterMerge[2].id, 'snp_exp_3');
  });
}, { tier: 1, category: 'M1: Mathematical Calculation Engine' });
