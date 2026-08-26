/**
 * Milestone 5 Challenger 2 Adversarial Stress Test Suite
 * System Boundaries, Edge Recovery, Backup Corruption Resilience, Float Precision & Non-ASCII Integrity
 */

const { describe, it, beforeEach } = require('./harness/test-runner');
const { assert } = require('./harness/assertions');
const { setupDomEnvironment } = require('./harness/dom-mock');

describe('Challenger 2 — M5: System Boundaries, Recovery & Corruption Resilience', () => {
  let dom;
  let store;
  let utils;
  let exportModule;

  beforeEach(async () => {
    dom = setupDomEnvironment();
    const storeMod = await import('../js/store.js');
    store = storeMod.store;
    store.clearAllData();

    utils = await import('../js/utils.js');
    exportModule = await import('../js/export.js');
  });

  // =========================================================================
  // 1. CORRUPT & INVALID SNAPSHOT PAYLOAD IMPORTS IN JS/EXPORT.JS & JS/STORE.JS
  // =========================================================================

  it('M5-BND.1: importBackupJSON safely ignores null, undefined, or missing file parameter', () => {
    let toastCalled = false;
    window.showToast = () => { toastCalled = true; };

    // Call with null / undefined
    exportModule.importBackupJSON(null);
    exportModule.importBackupJSON(undefined);

    assert.strictEqual(toastCalled, false, 'No toast or crash when file is null/undefined');
  });

  it('M5-BND.2: importBackupJSON catches FileReader onerror and displays error toast', () => {
    return new Promise((resolve) => {
      let toastMsg = null;
      let toastType = null;
      window.showToast = (msg, type) => {
        toastMsg = msg;
        toastType = type;
      };

      // Mock File & FileReader with simulated error
      class MockFailingFileReader {
        readAsText(file) {
          setTimeout(() => {
            if (typeof this.onerror === 'function') {
              this.onerror(new Error('File read permission denied'));
            }
            assert.strictEqual(toastType, 'error');
            assert.ok(toastMsg.includes('Could not read the selected file'));
            resolve();
          }, 5);
        }
      }

      global.FileReader = MockFailingFileReader;
      exportModule.importBackupJSON({ name: 'corrupt.json' });
    });
  });

  it('M5-BND.3: Malformed JSON string (SyntaxError / truncated JSON) triggers error toast without crashing', () => {
    return new Promise((resolve) => {
      let toastMsg = null;
      let toastType = null;
      window.showToast = (msg, type) => {
        toastMsg = msg;
        toastType = type;
      };

      class MockCorruptFileReader {
        readAsText(file) {
          setTimeout(() => {
            if (typeof this.onload === 'function') {
              // SyntaxError payload
              this.onload({ target: { result: '{"trades": [ { "id": "t1", "rate": 1500, broken...' } });
            }
            assert.strictEqual(toastType, 'error');
            assert.ok(toastMsg.includes('Import failed:'));
            resolve();
          }, 5);
        }
      }

      global.FileReader = MockCorruptFileReader;
      exportModule.importBackupJSON({ name: 'broken.json' });
    });
  });

  it('M5-BND.4: Valid JSON syntax with unrecognized / missing schema keys throws expected error toast', () => {
    return new Promise((resolve) => {
      let toastMsg = null;
      let toastType = null;
      window.showToast = (msg, type) => {
        toastMsg = msg;
        toastType = type;
      };

      class MockInvalidSchemaFileReader {
        readAsText(file) {
          setTimeout(() => {
            if (typeof this.onload === 'function') {
              // Valid JSON but invalid schema
              this.onload({ target: { result: JSON.stringify({ unknownField: true, count: 42 }) } });
            }
            assert.strictEqual(toastType, 'error');
            assert.ok(toastMsg.includes('Invalid or unrecognised JSON backup schema'));
            resolve();
          }, 5);
        }
      }

      global.FileReader = MockInvalidSchemaFileReader;
      exportModule.importBackupJSON({ name: 'invalid-schema.json' });
    });
  });

  it('M5-BND.5: Cancelling restoration in confirm() leaves existing store state completely untouched', () => {
    return new Promise((resolve) => {
      // Seed initial trade
      store.addTrade({
        id: 'existing_trade_1',
        type: 'BUY',
        rate: 1500,
        usdtAmount: 100,
        ngnAmount: 150000,
        bankAccountId: 'bank_opay_default',
        date: '2026-08-20T10:00:00Z'
      });
      assert.strictEqual(store.getTrades().length, 1);

      // User clicks Cancel on confirm modal
      global.confirm = () => false;

      class MockValidFileReader {
        readAsText(file) {
          setTimeout(() => {
            if (typeof this.onload === 'function') {
              const payload = {
                trades: [{ id: 'new_trade_2', type: 'SELL', rate: 1600, usdtAmount: 50, ngnAmount: 80000, bankAccountId: 'bank_opay_default', date: '2026-08-21T10:00:00Z' }]
              };
              this.onload({ target: { result: JSON.stringify(payload) } });
            }
            // State should NOT have changed
            assert.strictEqual(store.getTrades().length, 1);
            assert.strictEqual(store.getTrades()[0].id, 'existing_trade_1');
            resolve();
          }, 5);
        }
      }

      global.FileReader = MockValidFileReader;
      exportModule.importBackupJSON({ name: 'valid.json' });
    });
  });

  it('M5-BND.6: Confirming valid backup restoration imports data and displays success toast', () => {
    return new Promise((resolve) => {
      let toastMsg = null;
      let toastType = null;
      window.showToast = (msg, type) => {
        toastMsg = msg;
        toastType = type;
      };

      global.confirm = () => true;

      class MockValidFileReader {
        readAsText(file) {
          setTimeout(() => {
            if (typeof this.onload === 'function') {
              const payload = {
                trades: [{ id: 'restored_trade_1', type: 'BUY', rate: 1500, usdtAmount: 100, ngnAmount: 150000, bankAccountId: 'bank_opay_default', date: '2026-08-21T10:00:00Z' }],
                snapshots: [{ id: 'snp_1', bankCash: 500000, usdtBalance: 200, referenceRate: 1500, netWorthNgn: 800000, netWorthUsdt: 533.33, timestamp: '2026-08-21T12:00:00Z' }]
              };
              this.onload({ target: { result: JSON.stringify(payload) } });
            }
            assert.strictEqual(toastType, 'success');
            assert.ok(toastMsg.includes('Backup restored successfully'));
            assert.strictEqual(store.getTrades().length, 1);
            assert.strictEqual(store.getTrades()[0].id, 'restored_trade_1');
            assert.strictEqual(store.getSnapshots().length, 1);
            resolve();
          }, 5);
        }
      }

      global.FileReader = MockValidFileReader;
      exportModule.importBackupJSON({ name: 'valid.json' });
    });
  });

  it('M5-BND.7: Corrupt snapshot array entries (null, primitives, invalid rates, negative balances) are safely sanitized', () => {
    const hostileBackup = {
      trades: [],
      snapshots: [
        null,
        undefined,
        42,
        'invalid_string',
        false,
        {}, // empty object
        { referenceRate: -500, bankCash: 100000, usdtBalance: 50 }, // negative rate
        { referenceRate: 'NaN', bankCash: 'invalid', usdtBalance: -100 }, // invalid numbers & negative usdt
        { timestamp: 'not-a-date', createdAt: 'not-a-number', referenceRate: 0 }, // invalid dates & 0 rate
        { id: 'valid_snp_1', timestamp: '2026-08-20T10:00:00Z', bankCash: 250000, usdtBalance: 150, referenceRate: 1550 }
      ]
    };

    const result = store.importAllData(hostileBackup, true);
    assert.strictEqual(result, true);

    const snapshots = store.getSnapshots();
    assert.ok(snapshots.length >= 1, 'Sanitized snapshots should be saved');

    snapshots.forEach(s => {
      assert.strictEqual(typeof s.id, 'string');
      assert.ok(s.id.length > 0);
      assert.strictEqual(typeof s.timestamp, 'string');
      assert.ok(!isNaN(new Date(s.timestamp).getTime()), `Timestamp must be valid ISO: ${s.timestamp}`);
      assert.strictEqual(typeof s.bankCash, 'number');
      assert.ok(isFinite(s.bankCash));
      assert.strictEqual(typeof s.usdtBalance, 'number');
      assert.ok(isFinite(s.usdtBalance) && s.usdtBalance >= 0);
      assert.strictEqual(typeof s.referenceRate, 'number');
      assert.ok(isFinite(s.referenceRate) && s.referenceRate > 0);
      assert.strictEqual(typeof s.netWorthNgn, 'number');
      assert.ok(isFinite(s.netWorthNgn));
      assert.strictEqual(typeof s.netWorthUsdt, 'number');
      assert.ok(isFinite(s.netWorthUsdt));
    });
  });

  it('M5-BND.8: Prototype pollution payloads in backup JSON do not pollute Object prototype', () => {
    const maliciousPayload = JSON.parse('{"__proto__": {"polluted": "yes"}, "trades": [], "snapshots": []}');
    store.importAllData(maliciousPayload, true);

    const testObj = {};
    assert.strictEqual(testObj.polluted, undefined, 'Object prototype must NOT be polluted');
  });

  it('M5-BND.9: exportTradesToCSV with 0 trades displays informative toast and does not initiate download', () => {
    let toastMsg = null;
    let toastType = null;
    window.showToast = (msg, type) => {
      toastMsg = msg;
      toastType = type;
    };

    assert.strictEqual(store.getTrades().length, 0);
    exportModule.exportTradesToCSV();

    assert.strictEqual(toastType, 'info');
    assert.strictEqual(toastMsg, 'No trades to export.');
  });

  it('M5-BND.10: exportFullBackupJSON exports complete data structure with version and timestamps', () => {
    const backup = store.exportAllData();
    assert.strictEqual(typeof backup.version, 'number');
    assert.strictEqual(typeof backup.exportedAt, 'string');
    assert.ok(Array.isArray(backup.trades));
    assert.ok(Array.isArray(backup.bankAccounts));
    assert.ok(Array.isArray(backup.transfers));
    assert.ok(typeof backup.openingInventory === 'object');
    assert.ok(Array.isArray(backup.snapshots));
  });

  // =========================================================================
  // 2. CLEAR ALL SNAPSHOTS & RESTORE VIA JSON BACKUP
  // =========================================================================

  it('M5-BND.11: store.clearSnapshots() clears ONLY snapshots while keeping trades, banks, transfers, and inventory intact', () => {
    // 1. Setup rich state
    const bank = store.addBankAccount({ name: 'Zenith Bank', last4: '4321', initialBalance: 2500000 });
    store.setOpeningInventory({ startingUsdtBalance: 500, defaultCostBasis: 1480 });
    store.addTrade({
      id: 'trade_s1',
      type: 'BUY',
      bankAccountId: bank.id,
      ngnAmount: 750000,
      usdtAmount: 500,
      rate: 1500,
      date: '2026-08-22T09:00:00Z'
    });
    store.addTransfer({
      asset: 'NGN',
      fromBankId: bank.id,
      toBankId: 'bank_opay_default',
      amount: 200000,
      fee: 0,
      date: '2026-08-22T10:00:00Z'
    });
    store.saveSnapshot({
      id: 'snp_test_1',
      timestamp: '2026-08-22T12:00:00Z',
      bankCash: 1550000,
      usdtBalance: 1000,
      referenceRate: 1500,
      notes: 'Pre-clear snapshot'
    });

    assert.strictEqual(store.getSnapshots().length, 1);
    assert.strictEqual(store.getTrades().length, 1);
    assert.strictEqual(store.getTransfers().length, 1);
    assert.strictEqual(store.getOpeningInventory().startingUsdtBalance, 500);

    // 2. Clear snapshots
    store.clearSnapshots();

    // 3. Verify snapshots is empty but other collections are preserved
    assert.strictEqual(store.getSnapshots().length, 0);
    assert.strictEqual(store.getTrades().length, 1);
    assert.strictEqual(store.getTransfers().length, 1);
    assert.strictEqual(store.getBankAccounts().length, 4); // 3 defaults + 1 Zenith
    assert.strictEqual(store.getOpeningInventory().startingUsdtBalance, 500);
  });

  it('M5-BND.12: store.clearSnapshots() notifies reactive listeners with cleared detail payload', () => {
    let eventPayload = null;
    let updateEventCount = 0;

    window.addEventListener('store:updated', (e) => {
      if (e.detail.type === 'snapshots' || e.detail.type === 'SNAPSHOTS_UPDATED') {
        eventPayload = e.detail.payload;
        updateEventCount++;
      }
    });

    store.clearSnapshots();
    assert.ok(updateEventCount >= 1, 'CustomEvent store:updated must be dispatched');
    assert.ok(eventPayload && eventPayload.cleared === true);
    assert.strictEqual(eventPayload.action, 'clear');
  });

  it('M5-BND.13: Full cycle: Export -> Clear Snapshots -> Wipe All -> Restore JSON -> 100% Chronological Parity', () => {
    // 1. Populate initial state with 3 snapshots at different timestamps
    store.saveSnapshot({ id: 'snp_chron_2', timestamp: '2026-08-23T14:00:00Z', bankCash: 1200000, usdtBalance: 800, referenceRate: 1510, notes: 'Day 2' });
    store.saveSnapshot({ id: 'snp_chron_1', timestamp: '2026-08-22T10:00:00Z', bankCash: 1000000, usdtBalance: 500, referenceRate: 1500, notes: 'Day 1' });
    store.saveSnapshot({ id: 'snp_chron_3', timestamp: '2026-08-24T18:00:00Z', bankCash: 1500000, usdtBalance: 1200, referenceRate: 1520, notes: 'Day 3' });

    const exportedBackup = store.exportAllData();
    assert.strictEqual(exportedBackup.snapshots.length, 3);

    // 2. Clear snapshots
    store.clearSnapshots();
    assert.strictEqual(store.getSnapshots().length, 0);

    // 3. Clear all data
    store.clearAllData();
    assert.strictEqual(store.getTrades().length, 0);
    assert.strictEqual(store.getSnapshots().length, 0);

    // 4. Restore backup
    store.importAllData(exportedBackup, true);

    // 5. Verify 100% exact parity and ascending chronological order
    const restored = store.getSnapshots();
    assert.strictEqual(restored.length, 3);
    assert.strictEqual(restored[0].id, 'snp_chron_1');
    assert.strictEqual(restored[1].id, 'snp_chron_2');
    assert.strictEqual(restored[2].id, 'snp_chron_3');
    assert.strictEqual(restored[0].notes, 'Day 1');
    assert.strictEqual(restored[1].notes, 'Day 2');
    assert.strictEqual(restored[2].notes, 'Day 3');
    assert.strictEqual(restored[0].referenceRate, 1500);
    assert.strictEqual(restored[1].referenceRate, 1510);
    assert.strictEqual(restored[2].referenceRate, 1520);
  });

  it('M5-BND.14: Merge restore (replace=false) preserves newly added snapshot while merging backup snapshots without duplicates', () => {
    // 1. Initial snapshot in backup
    store.saveSnapshot({ id: 'snp_backup_A', timestamp: '2026-08-20T10:00:00Z', bankCash: 500000, usdtBalance: 300, referenceRate: 1500 });
    const backup = store.exportAllData();

    // 2. Clear snapshots and add a new live snapshot
    store.clearSnapshots();
    store.saveSnapshot({ id: 'snp_live_B', timestamp: '2026-08-21T10:00:00Z', bankCash: 600000, usdtBalance: 400, referenceRate: 1505 });

    // 3. Import backup in merge mode
    store.importAllData(backup, false);

    const merged = store.getSnapshots();
    assert.strictEqual(merged.length, 2);
    const ids = merged.map(s => s.id);
    assert.ok(ids.includes('snp_backup_A'));
    assert.ok(ids.includes('snp_live_B'));
    // Chronological order: A (Aug 20) before B (Aug 21)
    assert.strictEqual(merged[0].id, 'snp_backup_A');
    assert.strictEqual(merged[1].id, 'snp_live_B');
  });

  // =========================================================================
  // 3. EXTREME FLOAT PRECISION BOUNDARIES
  // =========================================================================

  it('M5-BND.15: 4-decimal USDT volumes (0.0001 USDT) calculate trade breakdown and FIFO cost basis accurately, while sub-epsilon dust is safely guarded', () => {
    const breakdown = utils.calculateTradeBreakdown('BUY', 0.15, 0.0001, 0.0001);
    assert.strictEqual(Math.round(breakdown.netAmount * 10000) / 10000, 0.1501);
    assert.ok(breakdown.effectiveRate > 0);
    assert.ok(isFinite(breakdown.effectiveRate));

    // Test in FIFO engine with 4-decimal USDT (Bybit standard precision)
    const standardMicroTrade = [{
      id: 'micro_trade_1',
      type: 'BUY',
      usdtAmount: 0.0001,
      ngnAmount: 0.15,
      totalFees: 0,
      rate: 1500,
      date: '2026-08-20T10:00:00Z'
    }];
    const fifo = utils.calculateFIFOInventoryAndPnL(standardMicroTrade);
    assert.strictEqual(fifo.remainingInventoryUSDT, 0.0001);

    // Sub-epsilon dust (< 1e-6) is safely guarded to 0 to prevent residual floating point dust
    const dustTrade = [{
      id: 'dust_trade_1',
      type: 'BUY',
      usdtAmount: 0.00000001,
      ngnAmount: 0.015,
      totalFees: 0,
      rate: 1500000,
      date: '2026-08-20T10:00:00Z'
    }];
    const dustFifo = utils.calculateFIFOInventoryAndPnL(dustTrade);
    assert.strictEqual(dustFifo.remainingInventoryUSDT, 0);
  });

  it('M5-BND.16: Huge volume numbers (10 Trillion NGN, 10 Billion USDT) execute without NaN or formatting corruption', () => {
    const bigNgn = 10000000000000; // 10 Trillion
    const bigUsdt = 10000000000;   // 10 Billion

    const formattedNgn = utils.formatNGN(bigNgn);
    assert.ok(formattedNgn.includes('₦10,000,000,000,000.00'));

    const formattedUsdt = utils.formatUSDT(bigUsdt);
    assert.ok(formattedUsdt.includes('10,000,000,000.00 USDT'));

    const netWorth = utils.calculateNetWorth(bigNgn, bigUsdt, 1500);
    assert.ok(isFinite(netWorth.netWorthNgn));
    assert.ok(isFinite(netWorth.netWorthUsdt));
    assert.strictEqual(netWorth.netWorthNgn, bigNgn + (bigUsdt * 1500));
  });

  it('M5-BND.17: Repeating decimal fractions (1/3, 100/7) in FIFO engine preserve exact lot quantities without lot leakage', () => {
    const trades = [
      { id: 'b1', type: 'BUY', usdtAmount: 1 / 3, ngnAmount: 500, totalFees: 0, rate: 1500, date: '2026-08-20T08:00:00Z' },
      { id: 'b2', type: 'BUY', usdtAmount: 2 / 3, ngnAmount: 1000, totalFees: 0, rate: 1500, date: '2026-08-20T09:00:00Z' },
      { id: 's1', type: 'SELL', usdtAmount: 1.0, ngnAmount: 1600, totalFees: 0, rate: 1600, date: '2026-08-20T10:00:00Z' }
    ];

    const fifo = utils.calculateFIFOInventoryAndPnL(trades);
    assert.ok(Math.abs(fifo.remainingInventoryUSDT) < 1e-12, 'Inventory should be exactly 0 after selling total 1.0 USDT');
    assert.strictEqual(fifo.totalRealizedPnL, 100);
  });

  it('M5-BND.18: calculateNetWorth and calculateSnapshotDelta maintain clean 2-decimal rounded precision', () => {
    const netWorth = utils.calculateNetWorth(1250000.33333333, 450.77777777, 1500.55555555);
    assert.strictEqual(netWorth.netWorthNgn, Math.round((1250000.33333333 + (450.77777777 * 1500.55555555)) * 100) / 100);
    assert.strictEqual(netWorth.netWorthUsdt, Math.round((450.77777777 + (1250000.33333333 / 1500.55555555)) * 100) / 100);

    const delta = utils.calculateSnapshotDelta(
      { netWorthNgn: 1500000.123, netWorthUsdt: 1000.456 },
      { netWorthNgn: 1200000.789, netWorthUsdt: 800.999 }
    );
    assert.strictEqual(delta.deltaNgn, 299999.33);
    assert.strictEqual(delta.pctDeltaNgn, 25.00);
    assert.strictEqual(delta.deltaUsdt, 199.46);
    assert.strictEqual(delta.pctDeltaUsdt, 24.90);
  });

  it('M5-BND.19: Boundary formatting: formatNGN handles sub-cent threshold and explicit negative strings', () => {
    assert.strictEqual(utils.formatNGN(0), '₦0.00');
    assert.strictEqual(utils.formatNGN(0.004), '₦0.00');
    assert.strictEqual(utils.formatNGN(0.005), '₦0.01');
    assert.strictEqual(utils.formatNGN(-0.005), '-₦0.01');
    assert.strictEqual(utils.formatNGN(-1500000.5), '-₦1,500,000.50');
    assert.strictEqual(utils.formatUSDT(0), '0.00 USDT');
    assert.strictEqual(utils.formatRate(0), '₦0.00 / USDT');
  });

  // =========================================================================
  // 4. ZERO-BALANCE BANKS & DYNAMIC LEDGER BEHAVIOR
  // =========================================================================

  it('M5-BND.20: Bank account with initialBalance=0 computes initial balance 0, inflow 0, outflow 0', () => {
    const zeroBank = store.addBankAccount({ name: 'Zero Bank', last4: '0000', initialBalance: 0 });
    const balances = store.getComputedBankBalances();
    const record = balances.get(zeroBank.id);

    assert.ok(record);
    assert.strictEqual(record.initialBalance, 0);
    assert.strictEqual(record.currentBalance, 0);
    assert.strictEqual(record.totalInflow, 0);
    assert.strictEqual(record.totalOutflow, 0);
    assert.strictEqual(record.totalFees, 0);
  });

  it('M5-BND.21: BUY trade on 0-balance bank creates exact negative currentBalance and records outflow', () => {
    const zeroBank = store.addBankAccount({ name: 'Zero Bank Buy', last4: '0001', initialBalance: 0 });
    store.addTrade({
      id: 'trade_zero_buy',
      type: 'BUY',
      bankAccountId: zeroBank.id,
      ngnAmount: 300000,
      totalFees: 500,
      netAmount: 300500,
      usdtAmount: 200,
      rate: 1500,
      date: '2026-08-20T10:00:00Z'
    });

    const balances = store.getComputedBankBalances();
    const record = balances.get(zeroBank.id);

    assert.strictEqual(record.currentBalance, -300500);
    assert.strictEqual(record.totalOutflow, 300500);
    assert.strictEqual(record.totalInflow, 0);
    assert.strictEqual(record.totalFees, 500);
  });

  it('M5-BND.22: SELL trade on 0-balance bank creates positive currentBalance and records inflow', () => {
    const zeroBank = store.addBankAccount({ name: 'Zero Bank Sell', last4: '0002', initialBalance: 0 });
    store.addTrade({
      id: 'trade_zero_sell',
      type: 'SELL',
      bankAccountId: zeroBank.id,
      ngnAmount: 480000,
      totalFees: 100,
      netAmount: 479900,
      usdtAmount: 300,
      rate: 1600,
      date: '2026-08-20T11:00:00Z'
    });

    const balances = store.getComputedBankBalances();
    const record = balances.get(zeroBank.id);

    assert.strictEqual(record.currentBalance, 479900);
    assert.strictEqual(record.totalInflow, 479900);
    assert.strictEqual(record.totalOutflow, 0);
    assert.strictEqual(record.totalFees, 100);
  });

  it('M5-BND.23: NGN transfer between two 0-balance banks correctly debits sender and credits recipient', () => {
    const bankA = store.addBankAccount({ name: 'Bank A Zero', last4: '1111', initialBalance: 0 });
    const bankB = store.addBankAccount({ name: 'Bank B Zero', last4: '2222', initialBalance: 0 });

    store.addTransfer({
      asset: 'NGN',
      fromBankId: bankA.id,
      toBankId: bankB.id,
      amount: 150000,
      fee: 50,
      date: '2026-08-20T12:00:00Z'
    });

    const balances = store.getComputedBankBalances();
    const recA = balances.get(bankA.id);
    const recB = balances.get(bankB.id);

    assert.strictEqual(recA.currentBalance, -150050); // -(150000 + 50)
    assert.strictEqual(recA.totalOutflow, 150050);
    assert.strictEqual(recA.totalFees, 50);

    assert.strictEqual(recB.currentBalance, 150000);
    assert.strictEqual(recB.totalInflow, 150000);
  });

  it('M5-BND.24: Opening a snapshot when all banks have 0 balance correctly sets bankCash=0 and evaluates net worth solely from crypto inventory', () => {
    store.addBankAccount({ name: 'Z1', last4: '01', initialBalance: 0 });
    store.addBankAccount({ name: 'Z2', last4: '02', initialBalance: 0 });

    const snapshot = utils.calculateNetWorth(0, 500, 1500);
    assert.strictEqual(snapshot.netWorthNgn, 750000);
    assert.strictEqual(snapshot.netWorthUsdt, 500);
  });

  // =========================================================================
  // 5. NEGATIVE BANK ACCOUNTS (OVERDRAFTS & LIABILITIES)
  // =========================================================================

  it('M5-BND.25: Bank account initialized with negative balance (overdraft) calculates current ledger properly', () => {
    const overdraftBank = store.addBankAccount({ name: 'Overdraft Facility', last4: '9988', initialBalance: -500000 });
    const balances = store.getComputedBankBalances();
    const record = balances.get(overdraftBank.id);

    assert.strictEqual(record.initialBalance, -500000);
    assert.strictEqual(record.currentBalance, -500000);

    // SELL into overdraft brings it closer to 0
    store.addTrade({
      id: 'trade_repay_overdraft',
      type: 'SELL',
      bankAccountId: overdraftBank.id,
      ngnAmount: 200000,
      totalFees: 0,
      netAmount: 200000,
      usdtAmount: 125,
      rate: 1600,
      date: '2026-08-21T09:00:00Z'
    });

    const updatedBalances = store.getComputedBankBalances();
    assert.strictEqual(updatedBalances.get(overdraftBank.id).currentBalance, -300000);
  });

  it('M5-BND.26: Net worth calculation where liabilities exceed crypto assets produces negative net worth', () => {
    // Total bank liabilities: -₦5,000,000
    // USDT assets: 2,000 USDT @ 1500 NGN/USDT = ₦3,000,000
    // Net worth NGN = -5,000,000 + 3,000,000 = -₦2,000,000
    // Net worth USDT = 2,000 + (-5,000,000 / 1500) = 2,000 - 3333.33 = -1333.33 USDT
    const netWorth = utils.calculateNetWorth(-5000000, 2000, 1500);

    assert.strictEqual(netWorth.netWorthNgn, -2000000);
    assert.strictEqual(netWorth.netWorthUsdt, -1333.33);
    assert.strictEqual(utils.formatNGN(netWorth.netWorthNgn), '-₦2,000,000.00');
  });

  it('M5-BND.27: Snapshot delta transitioning from negative net worth (debt) to positive net worth (surplus)', () => {
    const prevDebt = { netWorthNgn: -1000000, netWorthUsdt: -666.67 };
    const currSurplus = { netWorthNgn: 500000, netWorthUsdt: 333.33 };

    const delta = utils.calculateSnapshotDelta(currSurplus, prevDebt);
    // Delta NGN = 500,000 - (-1,000,000) = +1,500,000
    // Percentage = (+1,500,000 / |-1,000,000|) * 100 = +150.00%
    assert.strictEqual(delta.deltaNgn, 1500000);
    assert.strictEqual(delta.pctDeltaNgn, 150.00);
    assert.strictEqual(delta.deltaUsdt, 1000.00);
    assert.strictEqual(delta.pctDeltaUsdt, 150.00);

    const badgeText = utils.formatDeltaBadgeText(delta.deltaNgn, delta.pctDeltaNgn);
    assert.ok(badgeText.includes('+₦1,500,000.00 (+150.00%)'));
  });

  // =========================================================================
  // 6. NON-ASCII NOTES, UNICODE, MULTILINE ESCAPING & CSV SECURITY
  // =========================================================================

  it('M5-BND.28: Nigerian Naira symbols, Yoruba/Igbo tone marks & characters survive JSON export/restore without Mojibake', () => {
    const nigerianNotes = '₦1,500,000 payout for Ọba & Ẹmékà Adebayo — Òkè Òdò (Ṣàngó)';
    
    const snap = store.saveSnapshot({
      id: 'snp_ngn_char',
      timestamp: '2026-08-22T10:00:00Z',
      bankCash: 1500000,
      usdtBalance: 1000,
      referenceRate: 1500,
      notes: nigerianNotes
    });

    assert.strictEqual(snap.notes, nigerianNotes);

    const exported = store.exportAllData();
    store.clearAllData();
    store.importAllData(exported, true);

    const restored = store.getSnapshotById('snp_ngn_char');
    assert.ok(restored);
    assert.strictEqual(restored.notes, nigerianNotes);
  });

  it('M5-BND.29: Multilingual Unicode notes (Chinese, Arabic, Russian, Emojis) persist verbatim across store and backups', () => {
    const multilingualNotes = '🚀 场外交易 (OTC Buy) 💰 | معاملة تجارية | Покупка USDT | 暗号資産 ✨ (₦/$)';

    store.addTrade({
      id: 'trade_unicode_1',
      type: 'BUY',
      bankAccountId: 'bank_opay_default',
      ngnAmount: 750000,
      usdtAmount: 500,
      rate: 1500,
      notes: multilingualNotes,
      date: '2026-08-22T11:00:00Z'
    });

    const trade = store.getTradeById('trade_unicode_1');
    assert.strictEqual(trade.notes, multilingualNotes);

    const backup = store.exportAllData();
    store.clearAllData();
    store.importAllData(backup, true);

    const restoredTrade = store.getTradeById('trade_unicode_1');
    assert.strictEqual(restoredTrade.notes, multilingualNotes);
  });

  it('M5-BND.30: Multiline notes with double quotes, commas, newlines, and XSS script tags escape properly for CSV export', () => {
    const hostileNotes = 'Line 1, "Quoted Note"\r\nLine 2: <script>alert("XSS")</script>\nLine 3; special chars: ₦, $, %, &';

    store.addTrade({
      id: 'trade_csv_escape',
      type: 'BUY',
      bankAccountId: 'bank_opay_default',
      ngnAmount: 150000,
      usdtAmount: 100,
      rate: 1500,
      notes: hostileNotes,
      counterparty: 'Merchant "Pro" Trader, Ltd.',
      date: '2026-08-22T12:00:00Z'
    });

    let downloadedFilename = null;

    // Mock triggerFileDownload to capture CSV Blob
    global.URL = {
      createObjectURL: () => 'blob:mock-url',
      revokeObjectURL: () => {}
    };

    // Mock DOM element creation for triggerFileDownload
    const originalCreateElement = document.createElement.bind(document);
    document.createElement = (tag) => {
      const el = originalCreateElement(tag);
      if (tag.toLowerCase() === 'a') {
        return {
          ...el,
          set href(val) {},
          set download(name) { downloadedFilename = name; },
          click: () => {}
        };
      }
      return el;
    };

    exportModule.exportTradesToCSV();

    assert.ok(downloadedFilename);
    assert.ok(downloadedFilename.startsWith('bybit_p2p_trades_'));
    assert.ok(downloadedFilename.endsWith('.csv'));
  });

  it('M5-BND.31: Snapshot notes containing HTML/script tags are safely preserved as text without executing', () => {
    const xssNote = '<img src=x onerror=alert("hacked")><script>window.pwned=true;</script>';
    
    const snap = store.saveSnapshot({
      id: 'snp_xss_test',
      timestamp: '2026-08-22T13:00:00Z',
      bankCash: 500000,
      usdtBalance: 300,
      referenceRate: 1500,
      notes: xssNote
    });

    assert.strictEqual(snap.notes, xssNote);
    assert.strictEqual(window.pwned, undefined, 'Script must not execute during snapshot saving');
  });

  it('M5-BND.32: Snapshot validation schema enforces positive reference rate and finite numerical constraints', () => {
    // 1. Negative rate
    const v1 = utils.validateSnapshot({ referenceRate: -1500 });
    assert.strictEqual(v1.isValid, false);
    assert.ok(v1.errors[0].includes('Reference exchange rate must be a positive number'));

    // 2. Zero rate
    const v2 = utils.validateSnapshot({ referenceRate: 0 });
    assert.strictEqual(v2.isValid, false);

    // 3. NaN rate
    const v3 = utils.validateSnapshot({ referenceRate: 'invalid_rate' });
    assert.strictEqual(v3.isValid, false);

    // 4. Negative USDT balance
    const v4 = utils.validateSnapshot({ referenceRate: 1500, usdtBalance: -50 });
    assert.strictEqual(v4.isValid, false);
    assert.ok(v4.errors[0].includes('USDT balance must be a non-negative finite number'));

    // 5. Invalid timestamp
    const v5 = utils.validateSnapshot({ referenceRate: 1500, timestamp: 'invalid-iso-date' });
    assert.strictEqual(v5.isValid, false);
    assert.ok(v5.errors[0].includes('Snapshot timestamp must be a valid ISO date string'));

    // 6. Valid snapshot
    const v6 = utils.validateSnapshot({
      id: 'snp_valid',
      timestamp: '2026-08-22T14:00:00Z',
      bankCash: 1000000,
      usdtBalance: 500,
      referenceRate: 1520.50,
      notes: 'Valid snapshot test'
    });
    assert.strictEqual(v6.isValid, true);
    assert.strictEqual(v6.errors.length, 0);
    assert.strictEqual(v6.sanitized.netWorthNgn, 1000000 + (500 * 1520.50));
  });

}, { tier: 5, category: 'Milestone 5 Challenger 2 Final Boundaries & Recovery' });
