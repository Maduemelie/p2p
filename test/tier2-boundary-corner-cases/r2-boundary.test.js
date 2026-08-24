/**
 * Tier 2: Boundary & Corner Cases — R2: FIFO Accounting Consistency & Inventory Protection
 */

const { describe, it, beforeEach } = require('../harness/test-runner');
const { assert } = require('../harness/assertions');
const { setupDomEnvironment } = require('../harness/dom-mock');

describe('Tier 2 — R2: Boundary & Corner Cases (FIFO Accounting)', () => {
  let utils;

  beforeEach(async () => {
    setupDomEnvironment();
    utils = await import('../../js/utils.js');
  });

  it('R2-B.1: 0 fee trades on BUY and SELL sides maintain exact gross/net parity', () => {
    const buyBreakdown = utils.calculateTradeBreakdown('BUY', 500000, 312.5, 0);
    assert.strictEqual(buyBreakdown.netAmount, 500000, 'Buy netAmount with 0 fee must equal gross NGN');
    assert.strictEqual(buyBreakdown.effectiveRate, 1600, 'Buy effectiveRate must equal nominal rate');

    const sellBreakdown = utils.calculateTradeBreakdown('SELL', 500000, 312.5, 0);
    assert.strictEqual(sellBreakdown.netAmount, 500000, 'Sell netAmount with 0 fee must equal gross NGN');
    assert.strictEqual(sellBreakdown.effectiveRate, 1600, 'Sell effectiveRate must equal nominal rate');
  });

  it('R2-B.2: Empty trade list and zero inventory returns clean 0 metrics without NaN', () => {
    const result = utils.calculateFIFOInventoryAndPnL([], { startingUsdtBalance: 0, defaultCostBasis: 0 });

    assert.strictEqual(result.totalRealizedPnL, 0);
    assert.strictEqual(result.remainingInventoryUSDT, 0);
    assert.strictEqual(result.inventoryCostBasisNGN, 0);
    assert.strictEqual(result.avgHoldingCostPerUSDT, 0);
    assert.strictEqual(result.overallROI, 0);
    assert.strictEqual(Number.isNaN(result.avgHoldingCostPerUSDT), false, 'Must not return NaN');
    assert.strictEqual(Number.isNaN(result.overallROI), false, 'Must not return NaN');
  });

  it('R2-B.3: High-precision fractional USDT amounts (0.0001 USDT) calculate without losing precision', () => {
    const trades = [
      { id: 'b_micro', type: 'BUY', date: '2026-08-01T00:00:00Z', rate: 1600, ngnAmount: 0.16, usdtAmount: 0.0001, totalFees: 0 },
      { id: 's_micro', type: 'SELL', date: '2026-08-02T00:00:00Z', rate: 1700, ngnAmount: 0.17, usdtAmount: 0.0001, totalFees: 0 }
    ];

    const result = utils.calculateFIFOInventoryAndPnL(trades);
    assert.closeTo(result.remainingInventoryUSDT, 0, 0.00001);
    assert.closeTo(result.totalRealizedPnL, 0.01, 0.001, 'Realized PnL on micro-trade should be ₦0.01');
  });

  it('R2-B.4: Overselling (selling more than inventory) records unmatched lots with 0 artificial profit', () => {
    // 100 USDT in opening inventory @ ₦1500
    // SELL 250 USDT @ ₦1600 (100 from opening, 150 unmatched)
    const trades = [
      { id: 's_over', type: 'SELL', date: '2026-08-01T12:00:00Z', rate: 1600, ngnAmount: 400000, usdtAmount: 250, totalFees: 0 }
    ];
    const opening = { startingUsdtBalance: 100, defaultCostBasis: 1500 };

    const result = utils.calculateFIFOInventoryAndPnL(trades, opening);

    assert.strictEqual(result.remainingInventoryUSDT, 0);
    assert.strictEqual(result.totalUnmatchedSoldUSDT, 150);
    // Realized PnL should ONLY be for the 100 matched USDT: 100 * (1600 - 1500) = 10,000 NGN
    assert.closeTo(result.totalRealizedPnL, 10000, 0.01);
  });

  it('R2-B.5: Opening inventory with invalid or negative numbers falls back safely', () => {
    const invalidOpening = { startingUsdtBalance: -50, defaultCostBasis: -1000 };
    const result = utils.calculateFIFOInventoryAndPnL([], invalidOpening);

    assert.strictEqual(result.remainingInventoryUSDT, 0);
    assert.strictEqual(result.avgHoldingCostPerUSDT, 0);
  });

  it('R2-B.6: Large scale volume (₦1,000,000,000) calculates without floating overflow', () => {
    const trades = [
      { id: 'b_large', type: 'BUY', date: '2026-08-01T00:00:00Z', rate: 1600, ngnAmount: 1000000000, usdtAmount: 625000, totalFees: 5000 },
      { id: 's_large', type: 'SELL', date: '2026-08-02T00:00:00Z', rate: 1620, ngnAmount: 1012500000, usdtAmount: 625000, totalFees: 0 }
    ];

    const result = utils.calculateFIFOInventoryAndPnL(trades);
    // Cost: 1,000,005,000. Revenue: 1,012,500,000. Profit: 12,495,000
    assert.closeTo(result.totalRealizedPnL, 12495000, 1.0);
    assert.strictEqual(result.remainingInventoryUSDT, 0);
  });
}, { tier: 2, category: 'R2: Boundary Cases' });
