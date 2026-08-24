/**
 * Tier 4: Real-World Application Scenario — Disaster Recovery, Data Portability & Offline Verification
 */

const { describe, it, beforeEach } = require('../harness/test-runner');
const { assert } = require('../harness/assertions');
const { setupDomEnvironment } = require('../harness/dom-mock');
const fs = require('fs');
const path = require('path');

describe('Tier 4 — Scenario 3: Disaster Recovery, Data Portability & Offline Verification', () => {
  let dom;
  let store;
  let utils;

  beforeEach(async () => {
    dom = setupDomEnvironment();
    const storeModule = await import('../../js/store.js');
    store = storeModule.store;
    store.clearAllData();
    utils = await import('../../js/utils.js');
  });

  it('T4.3: Full Backup Export -> Data Wipe -> Restore achieves 100% Ledger and FIFO parity', () => {
    // 1. Create populated state
    const bank = store.addBankAccount({ name: 'Backup Test Bank', last4: '9999', initialBalance: 1200000 });
    store.setOpeningInventory({ startingUsdtBalance: 100, defaultCostBasis: 1500 });

    store.addTrade({
      id: 'trade_backup_1',
      refId: 'BYBIT_REC_001',
      type: 'BUY',
      bankAccountId: bank.id,
      ngnAmount: 300000,
      usdtAmount: 200,
      rate: 1500,
      totalFees: 0,
      netAmount: 300000,
      date: '2026-08-15T12:00:00Z'
    });

    store.addTrade({
      id: 'trade_backup_2',
      refId: 'BYBIT_REC_002',
      type: 'SELL',
      bankAccountId: bank.id,
      ngnAmount: 160000,
      usdtAmount: 100,
      rate: 1600,
      totalFees: 0,
      netAmount: 160000,
      date: '2026-08-16T12:00:00Z'
    });

    store.addTransfer({
      asset: 'NGN',
      fromBankId: bank.id,
      toBankId: 'external_bank',
      amount: 50000,
      fee: 0,
      date: '2026-08-17T12:00:00Z'
    });

    // Capture initial computed metrics
    const initialFifo = utils.calculateFIFOInventoryAndPnL(store.getTrades(), store.getOpeningInventory());
    const initialBalances = store.getComputedBankBalances();
    const initialBankBal = initialBalances.get(bank.id).currentBalance;

    // 2. Export Backup
    const backupJson = store.exportAllData();
    assert.ok(backupJson.trades.length === 2);
    assert.ok(backupJson.openingInventory.startingUsdtBalance === 100);

    // 3. Disaster / Wipe
    store.clearAllData();
    assert.strictEqual(store.getTrades().length, 0);
    assert.strictEqual(store.getOpeningInventory().startingUsdtBalance, 0);

    // 4. Restore
    store.importAllData(backupJson, true);

    // 5. Parity Check
    assert.strictEqual(store.getTrades().length, 2);
    assert.strictEqual(store.getOpeningInventory().startingUsdtBalance, 100);
    assert.strictEqual(store.getOpeningInventory().defaultCostBasis, 1500);

    const restoredFifo = utils.calculateFIFOInventoryAndPnL(store.getTrades(), store.getOpeningInventory());
    assert.strictEqual(restoredFifo.remainingInventoryUSDT, initialFifo.remainingInventoryUSDT);
    assert.strictEqual(restoredFifo.totalRealizedPnL, initialFifo.totalRealizedPnL);
    assert.strictEqual(restoredFifo.avgHoldingCostPerUSDT, initialFifo.avgHoldingCostPerUSDT);

    const restoredBalances = store.getComputedBankBalances();
    assert.strictEqual(restoredBalances.get(bank.id).currentBalance, initialBankBal);
  });

  it('T4.4: Service worker pre-cache completeness guarantees full offline availability without missing scripts', () => {
    const swContent = fs.readFileSync(path.resolve(__dirname, '../../sw.js'), 'utf-8');
    
    // Core critical files required for complete offline app boot and view rendering
    const criticalModules = [
      './js/app.js',
      './js/store.js',
      './js/utils.js',
      './js/fees.js',
      './js/trades.js',
      './js/history.js',
      './js/dashboard.js',
      './js/pricing.js',
      './js/banks.js',
      './js/settings.js',
      './js/bybitService.js',
      './js/transfers.js',
      './js/export.js',
      './js/views/dashboard.view.js',
      './js/views/addTrade.view.js',
      './js/views/history.view.js',
      './js/views/pricing.view.js',
      './js/views/settings.view.js',
      './js/views/modals.view.js'
    ];

    criticalModules.forEach(mod => {
      const normalized = mod.replace(/^\.\//, '');
      assert.ok(swContent.includes(mod) || swContent.includes(normalized), `Offline PWA must pre-cache critical module: ${mod}`);
    });
  });
}, { tier: 4, category: 'Tier 4: Scenarios' });
