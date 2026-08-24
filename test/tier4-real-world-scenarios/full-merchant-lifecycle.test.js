/**
 * Tier 4: Real-World Application Scenario — Full Merchant Lifecycle Workflow
 */

const { describe, it, beforeEach } = require('../harness/test-runner');
const { assert } = require('../harness/assertions');
const { setupDomEnvironment } = require('../harness/dom-mock');

describe('Tier 4 — Scenario 1: Full Merchant Daily Lifecycle Workflow', () => {
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

  it('T4.1: End-to-end multi-bank batch trade import -> FIFO ledger -> search audit -> profit projection', () => {
    // 1. Initial State: Setup 3 Merchant Bank Accounts
    const opay = store.addBankAccount({ name: 'OPay Merchant', last4: '8821', initialBalance: 2000000 });
    const kuda = store.addBankAccount({ name: 'Kuda Trading', last4: '3390', initialBalance: 1500000 });
    const palm = store.addBankAccount({ name: 'PalmPay Instant', last4: '4412', initialBalance: 500000 });

    store.setOpeningInventory({
      startingUsdtBalance: 500.0,
      defaultCostBasis: 1580.0 // 500 USDT @ 1580 = 790,000 NGN
    });

    // 2. Merchant executes 6 morning BUY orders (accumulating USDT)
    const morningBuys = [
      { refId: 'BB_BUY_101', type: 'BUY', bankAccountId: opay.id, rate: 1590, usdtAmount: 200, ngnAmount: 318000, totalFees: 20, netAmount: 318020, date: '2026-08-20T08:15:00Z', counterparty: 'SellerOne' },
      { refId: 'BB_BUY_102', type: 'BUY', bankAccountId: opay.id, rate: 1592, usdtAmount: 300, ngnAmount: 477600, totalFees: 20, netAmount: 477620, date: '2026-08-20T08:45:00Z', counterparty: 'SellerTwo' },
      { refId: 'BB_BUY_103', type: 'BUY', bankAccountId: kuda.id, rate: 1595, usdtAmount: 500, ngnAmount: 797500, totalFees: 30, netAmount: 797530, date: '2026-08-20T09:20:00Z', counterparty: 'SellerThree' }
    ];

    morningBuys.forEach(b => store.addTrade(b));

    // Inventory check: 500 (opening) + 200 + 300 + 500 = 1500 USDT in stock
    let fifo = utils.calculateFIFOInventoryAndPnL(store.getTrades(), store.getOpeningInventory());
    assert.strictEqual(fifo.remainingInventoryUSDT, 1500);

    // 3. Merchant posts active sell ad and sells 800 USDT in 2 batches
    // (Consumes: 500 opening @ 1580 + 200 @ 1590.10 + 100 from BB_BUY_102 @ 1592.0667)
    const afternoonSells = [
      { refId: 'BB_SELL_201', type: 'SELL', bankAccountId: palm.id, rate: 1640, usdtAmount: 400, ngnAmount: 656000, totalFees: 0, netAmount: 656000, date: '2026-08-20T14:00:00Z', counterparty: 'BuyerAlpha' },
      { refId: 'BB_SELL_202', type: 'SELL', bankAccountId: palm.id, rate: 1645, usdtAmount: 400, ngnAmount: 658000, totalFees: 0, netAmount: 658000, date: '2026-08-20T15:30:00Z', counterparty: 'BuyerBeta' }
    ];

    afternoonSells.forEach(s => store.addTrade(s));

    // 4. Verify Final FIFO State
    fifo = utils.calculateFIFOInventoryAndPnL(store.getTrades(), store.getOpeningInventory());
    // Remaining USDT: 1500 - 800 = 700 USDT
    assert.strictEqual(fifo.remainingInventoryUSDT, 700);

    // Total Realized Profit:
    // Sell 1 (400 @ 1640): Matched from opening (400 @ 1580) => 400 * (1640 - 1580) = 24,000 NGN
    // Sell 2 (400 @ 1645): Matched from:
    //   - 100 opening @ 1580 => 100 * (1645 - 1580) = 6,500 NGN
    //   - 200 BB_BUY_101 @ 1590.10 => 200 * (1645 - 1590.10) = 10,980 NGN
    //   - 100 BB_BUY_102 @ 1592.0667 => 100 * (1645 - 1592.0667) = 5,293.33 NGN
    // Total Expected Realized PnL: 24,000 + 6,500 + 10,980 + 5,293.33 = 46,773.33 NGN
    assert.closeTo(fifo.totalRealizedPnL, 46773.33, 0.5);

    // 5. Verify All 3 Bank Accounts
    const balances = store.getComputedBankBalances();
    // OPay: 2,000,000 - 318,020 - 477,620 = 1,204,360
    assert.strictEqual(balances.get(opay.id).currentBalance, 1204360);
    // Kuda: 1,500,000 - 797,530 = 702,470
    assert.strictEqual(balances.get(kuda.id).currentBalance, 702470);
    // PalmPay: 500,000 + 656,000 + 658,000 = 1,814,000
    assert.strictEqual(balances.get(palm.id).currentBalance, 1814000);

    // 6. Search & Auditability: Merchant queries specific trade by RefId
    const trades = store.getTrades();
    const queryRef = 'BB_SELL_202';
    const found = trades.filter(t => t.refId === queryRef);
    assert.strictEqual(found.length, 1);
    assert.strictEqual(found[0].counterparty, 'BuyerBeta');
    assert.strictEqual(found[0].bankAccountId, palm.id);

    // 7. Projected Sell Ad Profit with ₦0 fee:
    const activeAdPrice = 1650;
    const currentHoldingCost = fifo.avgHoldingCostPerUSDT;
    const remainingQty = fifo.remainingInventoryUSDT; // 700
    const spread = activeAdPrice - currentHoldingCost;
    const projectedProfit = spread * remainingQty - 0; // 0 fee deduction
    assert.isAbove(projectedProfit, 0);
  });
}, { tier: 4, category: 'Tier 4: Scenarios' });
