/**
 * Tier 1: Feature Coverage — R3: Comprehensive Multi-Bank Order Reconciliation
 */

const { describe, it, beforeEach } = require('../harness/test-runner');
const { assert } = require('../harness/assertions');
const { setupDomEnvironment } = require('../harness/dom-mock');
const fs = require('fs');
const path = require('path');

describe('Tier 1 — R3: Comprehensive Multi-Bank Order Reconciliation', () => {
  let dom;
  let store;

  beforeEach(async () => {
    dom = setupDomEnvironment();
    // Fresh store import
    const storeModule = await import('../../js/store.js');
    store = storeModule.store;
    store.clearAllData();
  });

  it('R3.1: Bank ledger balances compute accurately for BUY (debit) and SELL (credit) trades', () => {
    // Add two distinct bank accounts
    const bankA = store.addBankAccount({ name: 'OPay Main', last4: '1111', initialBalance: 500000 });
    const bankB = store.addBankAccount({ name: 'Kuda Trading', last4: '2222', initialBalance: 200000 });

    // Trade 1: BUY 100 USDT for ₦150,000 using Bank A (Outflow: ₦150,000)
    store.addTrade({
      type: 'BUY',
      bankAccountId: bankA.id,
      ngnAmount: 150000,
      usdtAmount: 100,
      rate: 1500,
      totalFees: 50,
      netAmount: 150050,
      date: new Date().toISOString()
    });

    // Trade 2: SELL 100 USDT for ₦160,000 received into Bank B (Inflow: ₦160,000)
    store.addTrade({
      type: 'SELL',
      bankAccountId: bankB.id,
      ngnAmount: 160000,
      usdtAmount: 100,
      rate: 1600,
      totalFees: 0,
      netAmount: 160000,
      date: new Date().toISOString()
    });

    const balanceMap = store.getComputedBankBalances();
    const bankARecord = balanceMap.get(bankA.id);
    const bankBRecord = balanceMap.get(bankB.id);

    // Bank A: 500,000 - 150,050 = 349,950
    assert.strictEqual(bankARecord.currentBalance, 349950, 'Bank A balance should reflect debit of ₦150,050');
    assert.strictEqual(bankARecord.totalOutflow, 150050, 'Bank A total outflow should be ₦150,050');

    // Bank B: 200,000 + 160,000 = 360,000
    assert.strictEqual(bankBRecord.currentBalance, 360000, 'Bank B balance should reflect credit of ₦160,000');
    assert.strictEqual(bankBRecord.totalInflow, 160000, 'Bank B total inflow should be ₦160,000');
  });

  it('R3.2: Order import UI supports bank account assignment for both BUY and SELL orders', () => {
    const modalsViewJs = fs.readFileSync(path.resolve(__dirname, '../../js/views/modals.view.js'), 'utf-8');
    const settingsJs = fs.readFileSync(path.resolve(__dirname, '../../js/settings.js'), 'utf-8');

    // Requirement: "The order import modal allows assigning specific bank accounts for both BUY and SELL orders."
    const hasAssignModal = modalsViewJs.includes('modal-assign-banks-backdrop') || settingsJs.includes('modal-assign-banks-backdrop');
    assert.ok(hasAssignModal, 'Assign banks modal must exist');

    // Check that code allows bank assignment for orders
    assert.ok(settingsJs.includes('assign-bank-select') || settingsJs.includes('selectedBankMap'), 'Import handler must capture per-order bank account assignments');
  });

  it('R3.3: Batch trade import assigns designated bank accounts to each order', () => {
    const bank1 = store.addBankAccount({ name: 'GTBank', last4: '3333', initialBalance: 1000000 });
    const bank2 = store.addBankAccount({ name: 'Access Bank', last4: '4444', initialBalance: 500000 });

    const batch = [
      {
        refId: 'bybit_order_101',
        type: 'BUY',
        bankAccountId: bank1.id,
        ngnAmount: 300000,
        usdtAmount: 200,
        rate: 1500,
        totalFees: 0,
        netAmount: 300000,
        date: new Date().toISOString()
      },
      {
        refId: 'bybit_order_102',
        type: 'SELL',
        bankAccountId: bank2.id,
        ngnAmount: 320000,
        usdtAmount: 200,
        rate: 1600,
        totalFees: 0,
        netAmount: 320000,
        date: new Date().toISOString()
      }
    ];

    batch.forEach(t => store.addTrade(t));

    const balanceMap = store.getComputedBankBalances();
    // Bank 1: 1,000,000 - 300,000 = 700,000
    assert.strictEqual(balanceMap.get(bank1.id).currentBalance, 700000);
    // Bank 2: 500,000 + 320,000 = 820,000
    assert.strictEqual(balanceMap.get(bank2.id).currentBalance, 820000);
  });

  it('R3.4: Inter-bank transfer adjusts source and destination bank balances correctly', () => {
    const bankSource = store.addBankAccount({ name: 'Source Bank', last4: '5555', initialBalance: 400000 });
    const bankDest = store.addBankAccount({ name: 'Dest Bank', last4: '6666', initialBalance: 100000 });

    // Transfer ₦150,000 from Source to Dest with ₦10 fee
    store.addTransfer({
      asset: 'NGN',
      fromBankId: bankSource.id,
      toBankId: bankDest.id,
      amount: 150000,
      fee: 10,
      date: new Date().toISOString()
    });

    const balanceMap = store.getComputedBankBalances();
    // Source: 400,000 - (150,000 + 10) = 249,990
    assert.strictEqual(balanceMap.get(bankSource.id).currentBalance, 249990);
    // Dest: 100,000 + 150,000 = 250,000
    assert.strictEqual(balanceMap.get(bankDest.id).currentBalance, 250000);
  });

  it('R3.5: Ledger dynamic computation handles multiple trades and transfers without drift', () => {
    const bank = store.addBankAccount({ name: 'Ops Bank', last4: '7777', initialBalance: 100000 });

    // 10 BUYs of ₦10,000 each (Total out: 100,000)
    for (let i = 0; i < 10; i++) {
      store.addTrade({
        type: 'BUY',
        bankAccountId: bank.id,
        ngnAmount: 10000,
        usdtAmount: 6.25,
        rate: 1600,
        totalFees: 0,
        netAmount: 10000,
        date: new Date().toISOString()
      });
    }

    // 5 SELLs of ₦25,000 each (Total in: 125,000)
    for (let i = 0; i < 5; i++) {
      store.addTrade({
        type: 'SELL',
        bankAccountId: bank.id,
        ngnAmount: 25000,
        usdtAmount: 15,
        rate: 1666.67,
        totalFees: 0,
        netAmount: 25000,
        date: new Date().toISOString()
      });
    }

    const balanceMap = store.getComputedBankBalances();
    // 100,000 - 100,000 + 125,000 = 125,000
    assert.strictEqual(balanceMap.get(bank.id).currentBalance, 125000);
    assert.strictEqual(balanceMap.get(bank.id).totalOutflow, 100000);
    assert.strictEqual(balanceMap.get(bank.id).totalInflow, 125000);
  });
}, { tier: 1, category: 'R3: Multi-Bank Reconciliation' });
