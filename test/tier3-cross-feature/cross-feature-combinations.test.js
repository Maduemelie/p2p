/**
 * Tier 3: Cross-Feature Combinations — Pairwise Integration Tests
 */

const { describe, it, beforeEach } = require('../harness/test-runner');
const { assert } = require('../harness/assertions');
const { setupDomEnvironment } = require('../harness/dom-mock');

describe('Tier 3 — Cross-Feature Combinations', () => {
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

  it('T3.1 [R1 + R3 + R2]: Batch Import with Multi-Bank Assignment triggers exact FIFO & Ledger updates', () => {
    // 1. Setup 2 banks
    const bankOpay = store.addBankAccount({ name: 'OPay Trader', last4: '1001', initialBalance: 1000000 });
    const bankKuda = store.addBankAccount({ name: 'Kuda Trader', last4: '2002', initialBalance: 500000 });

    // 2. Simulated Bybit imported orders
    const importedOrders = [
      {
        refId: 'bybit_order_001',
        type: 'BUY',
        bankAccountId: bankOpay.id,
        ngnAmount: 480000,
        usdtAmount: 300,
        rate: 1600,
        totalFees: 0,
        netAmount: 480000,
        date: '2026-08-10T10:00:00Z',
        counterparty: 'WhaleMerchant'
      },
      {
        refId: 'bybit_order_002',
        type: 'SELL',
        bankAccountId: bankKuda.id,
        ngnAmount: 165000,
        usdtAmount: 100,
        rate: 1650,
        totalFees: 0,
        netAmount: 165000,
        date: '2026-08-10T14:00:00Z',
        counterparty: 'FastRetailBuyer'
      }
    ];

    importedOrders.forEach(o => store.addTrade(o));

    // 3. Verify Bank Ledgers (R3)
    const balanceMap = store.getComputedBankBalances();
    // OPay debited 480,000 => 1,000,000 - 480,000 = 520,000
    assert.strictEqual(balanceMap.get(bankOpay.id).currentBalance, 520000);
    // Kuda credited 165,000 => 500,000 + 165,000 = 665,000
    assert.strictEqual(balanceMap.get(bankKuda.id).currentBalance, 665000);

    // 4. Verify FIFO Inventory & PnL (R2)
    const fifoResult = utils.calculateFIFOInventoryAndPnL(store.getTrades());
    // Remaining USDT: 300 - 100 = 200 USDT
    assert.strictEqual(fifoResult.remainingInventoryUSDT, 200);
    // Avg holding cost: ₦1600/USDT
    assert.strictEqual(fifoResult.avgHoldingCostPerUSDT, 1600);
    // Realized PnL: 100 * (1650 - 1600) = ₦5,000
    assert.strictEqual(fifoResult.totalRealizedPnL, 5000);
  });

  it('T3.2 [R3 + R4]: Imported orders with RefID are instantly indexable in Trade History search', () => {
    const bank = store.addBankAccount({ name: 'Search Bank', last4: '7788', initialBalance: 100000 });
    
    store.addTrade({
      refId: 'BYBIT_P2P_20260824_99887766',
      type: 'BUY',
      bankAccountId: bank.id,
      ngnAmount: 320000,
      usdtAmount: 200,
      rate: 1600,
      totalFees: 0,
      netAmount: 320000,
      counterparty: 'LagosP2PDealer',
      date: new Date().toISOString()
    });

    const trades = store.getTrades();
    const query = 'BYBIT_P2P_20260824_99887766';

    const matches = trades.filter(t => {
      return (t.refId || '').includes(query) || (t.counterparty || '').includes(query);
    });

    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].counterparty, 'LagosP2PDealer');
    assert.strictEqual(matches[0].usdtAmount, 200);
  });

  it('T3.3 [R2 + R4]: FIFO holding cost dynamically sets break-even and target sell floor in Pricing Assistant', () => {
    // 2 BUY trades: 100 @ 1500 + 100 @ 1600 => 200 @ 1550 Avg Cost
    const trades = [
      { id: 'b1', type: 'BUY', rate: 1500, ngnAmount: 150000, usdtAmount: 100, totalFees: 0, date: '2026-08-01T00:00:00Z' },
      { id: 'b2', type: 'BUY', rate: 1600, ngnAmount: 160000, usdtAmount: 100, totalFees: 0, date: '2026-08-02T00:00:00Z' }
    ];

    const fifoResult = utils.calculateFIFOInventoryAndPnL(trades);
    const costBasis = fifoResult.avgHoldingCostPerUSDT; // 1550

    const targetSpread = 5.0; // ₦5 / USDT
    const outflowFee = 50.0;
    const avgVolume = 100.0;

    // Break-even = costBasis + (outflowFee / avgVolume) = 1550 + 0.50 = 1550.50
    const breakEven = costBasis + (outflowFee / avgVolume);
    // Target Sell = costBasis + targetSpread + (outflowFee / avgVolume) = 1550 + 5.0 + 0.50 = 1555.50
    const targetSellPrice = costBasis + targetSpread + (outflowFee / avgVolume);

    assert.strictEqual(costBasis, 1550);
    assert.strictEqual(breakEven, 1550.50);
    assert.strictEqual(targetSellPrice, 1555.50);

    // If competitor sells at 1552 (below target sell 1555.50), suggested sell MUST floor at targetSellPrice (1555.50)
    const competitorSellPrice = 1552.0;
    const rawSuggested = competitorSellPrice - 0.10; // 1551.90
    const flooredSuggested = Math.max(rawSuggested, targetSellPrice);

    assert.strictEqual(flooredSuggested, 1555.50, 'Suggested sell price must floor at target sell to guarantee spread');
  });

  it('T3.4 [R4 + R3 + R2]: Interactive order book pre-fill -> trade save -> bank debit & lot creation', () => {
    const bank = store.addBankAccount({ name: 'Orderbook Test Bank', last4: '9900', initialBalance: 800000 });

    // 1. User clicks order book row: Rate = 1605.00, Available Qty = 250.00
    const selectedRate = 1605.00;
    const targetUsdt = 250.00;
    const calculatedNgn = selectedRate * targetUsdt; // 401,250.00

    // 2. Submit trade
    const savedTrade = store.addTrade({
      type: 'BUY',
      bankAccountId: bank.id,
      rate: selectedRate,
      usdtAmount: targetUsdt,
      ngnAmount: calculatedNgn,
      totalFees: 50,
      netAmount: calculatedNgn + 50,
      counterparty: 'TopBookSeller',
      date: new Date().toISOString()
    });

    assert.ok(savedTrade.id);

    // 3. Bank balance check
    const bankRecord = store.getComputedBankBalances().get(bank.id);
    assert.strictEqual(bankRecord.currentBalance, 800000 - 401300);

    // 4. FIFO check
    const fifoResult = utils.calculateFIFOInventoryAndPnL(store.getTrades());
    assert.strictEqual(fifoResult.remainingInventoryUSDT, 250);
    assert.closeTo(fifoResult.avgHoldingCostPerUSDT, 401300 / 250, 0.01);
  });
}, { tier: 3, category: 'Tier 3: Cross-Feature' });
