/**
 * Tier 4: Real-World Application Scenario — P2P Arbitrage Flow & Balance Reconciliation
 */

const { describe, it, beforeEach } = require('../harness/test-runner');
const { assert } = require('../harness/assertions');
const { setupDomEnvironment } = require('../harness/dom-mock');

describe('Tier 4 — Scenario 2: P2P Arbitrage Flow & Balance Reconciliation', () => {
  let store;
  let utils;

  beforeEach(async () => {
    setupDomEnvironment();
    const storeModule = await import('../../js/store.js');
    store = storeModule.store;
    store.clearAllData();
    utils = await import('../../js/utils.js');
  });

  it('T4.2: High-volume arbitrage roundtrip with itemized fees reconciles perfectly', () => {
    // 1. Setup Banks
    const bankOut = store.addBankAccount({ name: 'Outflow Bank (OPay)', last4: '5511', initialBalance: 5000000 });
    const bankIn = store.addBankAccount({ name: 'Inflow Bank (GTB)', last4: '9922', initialBalance: 1000000 });

    // 2. Buy 2,000 USDT in 2 lots via Bank Outflow
    // Lot 1: 1,000 USDT @ 1550 = 1,550,000 + 50 fee = 1,550,050
    // Lot 2: 1,000 USDT @ 1555 = 1,555,000 + 50 fee = 1,555,050
    store.addTrade({
      type: 'BUY',
      bankAccountId: bankOut.id,
      rate: 1550,
      usdtAmount: 1000,
      ngnAmount: 1550000,
      fees: [{ label: 'Transfer Fee', amount: 50 }],
      totalFees: 50,
      netAmount: 1550050,
      date: '2026-08-21T09:00:00Z'
    });

    store.addTrade({
      type: 'BUY',
      bankAccountId: bankOut.id,
      rate: 1555,
      usdtAmount: 1000,
      ngnAmount: 1555000,
      fees: [{ label: 'Transfer Fee', amount: 50 }],
      totalFees: 50,
      netAmount: 1555050,
      date: '2026-08-21T10:00:00Z'
    });

    // 3. Sell 2,000 USDT in 4 chunks of 500 USDT @ 1610 via Bank Inflow
    for (let i = 0; i < 4; i++) {
      store.addTrade({
        type: 'SELL',
        bankAccountId: bankIn.id,
        rate: 1610,
        usdtAmount: 500,
        ngnAmount: 805000,
        totalFees: 0,
        netAmount: 805000,
        date: `2026-08-21T1${i}:00:00Z`
      });
    }

    // 4. Verification
    const fifo = utils.calculateFIFOInventoryAndPnL(store.getTrades());
    assert.strictEqual(fifo.remainingInventoryUSDT, 0, 'All 2,000 USDT should be sold');

    // Total Cost = 1,550,050 + 1,555,050 = 3,105,100
    // Total Revenue = 4 * 805,000 = 3,220,000
    // Net Profit = 3,220,000 - 3,105,100 = ₦114,900
    assert.strictEqual(fifo.totalRealizedCostBasis, 3105100);
    assert.strictEqual(fifo.totalRealizedRevenue, 3220000);
    assert.strictEqual(fifo.totalRealizedPnL, 114900);
    assert.closeTo(fifo.overallROI, (114900 / 3105100) * 100, 0.01);

    // Bank Out: 5,000,000 - 3,105,100 = 1,894,900
    const balances = store.getComputedBankBalances();
    assert.strictEqual(balances.get(bankOut.id).currentBalance, 1894900);

    // Bank In: 1,000,000 + 3,220,000 = 4,220,000
    assert.strictEqual(balances.get(bankIn.id).currentBalance, 4220000);

    // Combined Cash: 1,894,900 + 4,220,000 = 6,114,900 (Initial 6,000,000 + 114,900 profit)
    assert.strictEqual(balances.get(bankOut.id).currentBalance + balances.get(bankIn.id).currentBalance, 6114900);
  });
}, { tier: 4, category: 'Tier 4: Scenarios' });
