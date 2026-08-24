/**
 * Tier 3: Cross-Feature Integration Flows
 */

const { describe, it, beforeEach } = require('../harness/test-runner');
const { assert } = require('../harness/assertions');
const { setupDomEnvironment } = require('../harness/dom-mock');
const fs = require('fs');
const path = require('path');

describe('Tier 3 — Cross-Feature Integration Flows', () => {
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

  it('T3.5: Multi-day trading cycle with 3 banks, transfers, and complete FIFO liquidation', () => {
    const bankA = store.addBankAccount({ name: 'Bank A', last4: '1111', initialBalance: 1000000 });
    const bankB = store.addBankAccount({ name: 'Bank B', last4: '2222', initialBalance: 500000 });
    const bankC = store.addBankAccount({ name: 'Bank C', last4: '3333', initialBalance: 200000 });

    // Day 1: Buy 500 USDT from Bank A (1500 rate = 750,000 NGN)
    store.addTrade({
      type: 'BUY',
      bankAccountId: bankA.id,
      ngnAmount: 750000,
      usdtAmount: 500,
      rate: 1500,
      totalFees: 0,
      netAmount: 750000,
      date: '2026-08-01T10:00:00Z'
    });

    // Day 2: Buy 500 USDT from Bank B (1550 rate = 775,000 NGN, Bank B goes -275,000)
    store.addTrade({
      type: 'BUY',
      bankAccountId: bankB.id,
      ngnAmount: 775000,
      usdtAmount: 500,
      rate: 1550,
      totalFees: 0,
      netAmount: 775000,
      date: '2026-08-02T10:00:00Z'
    });

    // Transfer ₦300,000 from Bank A to Bank B (fee ₦10)
    store.addTransfer({
      asset: 'NGN',
      fromBankId: bankA.id,
      toBankId: bankB.id,
      amount: 300000,
      fee: 10,
      date: '2026-08-02T12:00:00Z'
    });

    // Day 3: Sell 1000 USDT to Bank C (1600 rate = 1,600,000 NGN)
    store.addTrade({
      type: 'SELL',
      bankAccountId: bankC.id,
      ngnAmount: 1600000,
      usdtAmount: 1000,
      rate: 1600,
      totalFees: 0,
      netAmount: 1600000,
      date: '2026-08-03T15:00:00Z'
    });

    // Verify FIFO: Total cost = 750k + 775k = 1,525,000. Total revenue = 1,600,000. Profit = ₦75,000
    const fifoResult = utils.calculateFIFOInventoryAndPnL(store.getTrades());
    assert.strictEqual(fifoResult.remainingInventoryUSDT, 0, 'Inventory should be 0');
    assert.strictEqual(fifoResult.totalRealizedPnL, 75000, 'Realized PnL should be ₦75,000');
    assert.closeTo(fifoResult.overallROI, (75000 / 1525000) * 100, 0.01);

    // Verify All 3 Bank Balances:
    // Bank A: 1,000,000 - 750,000 (buy) - 300,010 (transfer) = ₦-50,010 => wait: 1,000,000 - 1,050,010 = -50,010
    // Bank B: 500,000 - 775,000 (buy) + 300,000 (transfer in) = ₦25,000
    // Bank C: 200,000 + 1,600,000 (sell) = ₦1,800,000
    // Total Cash across banks: -50,010 + 25,000 + 1,800,000 = 1,774,990 (Initial total 1,700,000 + 75,000 profit - 10 transfer fee = 1,774,990)
    const balances = store.getComputedBankBalances();
    assert.strictEqual(balances.get(bankA.id).currentBalance, -50010);
    assert.strictEqual(balances.get(bankB.id).currentBalance, 25000);
    assert.strictEqual(balances.get(bankC.id).currentBalance, 1800000);

    const totalCash = balances.get(bankA.id).currentBalance + balances.get(bankB.id).currentBalance + balances.get(bankC.id).currentBalance;
    assert.strictEqual(totalCash, 1774990, 'Total cash in all banks must balance initial capital + net profit - fees');
  });

  it('T3.6: PWA service worker manifest is 100% synchronized with actual codebase files', () => {
    const swContent = fs.readFileSync(path.resolve(__dirname, '../../sw.js'), 'utf-8');
    const jsDir = path.resolve(__dirname, '../../js');
    const jsFiles = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));

    jsFiles.forEach(file => {
      assert.ok(swContent.includes(file), `sw.js must contain entry for js/${file}`);
    });
  });
}, { tier: 3, category: 'Tier 3: Cross-Feature' });
