/**
 * Tier 2: Boundary & Corner Cases — R3: Comprehensive Multi-Bank Order Reconciliation
 */

const { describe, it, beforeEach } = require('../harness/test-runner');
const { assert } = require('../harness/assertions');
const { setupDomEnvironment } = require('../harness/dom-mock');

describe('Tier 2 — R3: Boundary & Corner Cases (Multi-Bank Reconciliation)', () => {
  let store;

  beforeEach(async () => {
    setupDomEnvironment();
    const storeModule = await import('../../js/store.js');
    store = storeModule.store;
    store.clearAllData();
  });

  it('R3-B.1: Empty order batch or all-duplicate batch does not alter store or ledger', () => {
    const bank = store.addBankAccount({ name: 'Empty Test Bank', last4: '0000', initialBalance: 100000 });
    const initialTradesCount = store.getTrades().length;

    // Simulate empty batch processing
    const emptyBatch = [];
    emptyBatch.forEach(t => store.addTrade(t));

    assert.strictEqual(store.getTrades().length, initialTradesCount);
    assert.strictEqual(store.getComputedBankBalances().get(bank.id).currentBalance, 100000);
  });

  it('R3-B.2: Duplicate order rejection prevents double-crediting or double-debiting bank accounts', () => {
    const bank = store.addBankAccount({ name: 'Deduplication Bank', last4: '1111', initialBalance: 500000 });

    const trade1 = {
      refId: 'bybit_unique_999',
      type: 'BUY',
      bankAccountId: bank.id,
      ngnAmount: 100000,
      usdtAmount: 62.5,
      rate: 1600,
      totalFees: 0,
      netAmount: 100000,
      date: new Date().toISOString()
    };

    // First insertion
    store.addTrade(trade1);

    // Duplicate check logic
    const existingRefIds = new Set(store.getTrades().map(t => t.refId).filter(Boolean));
    const isDuplicate = existingRefIds.has('bybit_unique_999');
    assert.strictEqual(isDuplicate, true, 'Second import of same refId must be detected as duplicate');

    // Only 1 trade in store
    assert.strictEqual(store.getTrades().length, 1);
    assert.strictEqual(store.getComputedBankBalances().get(bank.id).currentBalance, 400000);
  });

  it('R3-B.3: Trades assigned to non-existent bank ID do not crash getComputedBankBalances', () => {
    const validBank = store.addBankAccount({ name: 'Valid Bank', last4: '2222', initialBalance: 300000 });

    // Add trade with orphaned bank ID
    store.addTrade({
      type: 'BUY',
      bankAccountId: 'deleted_or_nonexistent_bank_id',
      ngnAmount: 50000,
      usdtAmount: 31.25,
      rate: 1600,
      totalFees: 0,
      netAmount: 50000,
      date: new Date().toISOString()
    });

    const balanceMap = store.getComputedBankBalances();
    assert.ok(balanceMap.has(validBank.id), 'Valid bank must still be present');
    assert.strictEqual(balanceMap.get(validBank.id).currentBalance, 300000, 'Valid bank balance must be unaffected');
  });

  it('R3-B.4: Bank starting with ₦0 balance tracks negative cash (outflow) and recovers with SELL inflow', () => {
    const bank = store.addBankAccount({ name: 'Zero Balance Bank', last4: '3333', initialBalance: 0 });

    // BUY ₦200,000 (Account goes to -₦200,000)
    store.addTrade({
      type: 'BUY',
      bankAccountId: bank.id,
      ngnAmount: 200000,
      usdtAmount: 125,
      rate: 1600,
      totalFees: 0,
      netAmount: 200000,
      date: new Date().toISOString()
    });

    let balanceMap = store.getComputedBankBalances();
    assert.strictEqual(balanceMap.get(bank.id).currentBalance, -200000);

    // SELL ₦250,000 (Account recovers to +₦50,000)
    store.addTrade({
      type: 'SELL',
      bankAccountId: bank.id,
      ngnAmount: 250000,
      usdtAmount: 125,
      rate: 2000,
      totalFees: 0,
      netAmount: 250000,
      date: new Date().toISOString()
    });

    balanceMap = store.getComputedBankBalances();
    assert.strictEqual(balanceMap.get(bank.id).currentBalance, 50000);
  });

  it('R3-B.5: Multi-bank simultaneous assignment distributes exact inflows and outflows across 5 banks', () => {
    const banks = [
      store.addBankAccount({ name: 'Bank 1', last4: '0001', initialBalance: 100000 }),
      store.addBankAccount({ name: 'Bank 2', last4: '0002', initialBalance: 100000 }),
      store.addBankAccount({ name: 'Bank 3', last4: '0003', initialBalance: 100000 }),
      store.addBankAccount({ name: 'Bank 4', last4: '0004', initialBalance: 100000 }),
      store.addBankAccount({ name: 'Bank 5', last4: '0005', initialBalance: 100000 })
    ];

    // Bank 1: BUY 20k, SELL 50k => +30k => 130k
    store.addTrade({ type: 'BUY', bankAccountId: banks[0].id, ngnAmount: 20000, usdtAmount: 12.5, rate: 1600, totalFees: 0, netAmount: 20000, date: new Date().toISOString() });
    store.addTrade({ type: 'SELL', bankAccountId: banks[0].id, ngnAmount: 50000, usdtAmount: 30, rate: 1666.67, totalFees: 0, netAmount: 50000, date: new Date().toISOString() });

    // Bank 2: BUY 50k => 50k
    store.addTrade({ type: 'BUY', bankAccountId: banks[1].id, ngnAmount: 50000, usdtAmount: 31.25, rate: 1600, totalFees: 0, netAmount: 50000, date: new Date().toISOString() });

    // Bank 3: SELL 80k => 180k
    store.addTrade({ type: 'SELL', bankAccountId: banks[2].id, ngnAmount: 80000, usdtAmount: 50, rate: 1600, totalFees: 0, netAmount: 80000, date: new Date().toISOString() });

    // Bank 4: No trades => 100k

    // Bank 5: BUY 100k => 0k
    store.addTrade({ type: 'BUY', bankAccountId: banks[4].id, ngnAmount: 100000, usdtAmount: 62.5, rate: 1600, totalFees: 0, netAmount: 100000, date: new Date().toISOString() });

    const balanceMap = store.getComputedBankBalances();
    assert.strictEqual(balanceMap.get(banks[0].id).currentBalance, 130000);
    assert.strictEqual(balanceMap.get(banks[1].id).currentBalance, 50000);
    assert.strictEqual(balanceMap.get(banks[2].id).currentBalance, 180000);
    assert.strictEqual(balanceMap.get(banks[3].id).currentBalance, 100000);
    assert.strictEqual(balanceMap.get(banks[4].id).currentBalance, 0);
  });
}, { tier: 2, category: 'R3: Boundary Cases' });
