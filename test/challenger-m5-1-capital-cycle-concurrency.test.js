/**
 * Milestone 5 Challenger 1 — Tier 5 Adversarial Stress Test Suite
 * 
 * Focus:
 * 1. 7-Day Merchant Capital Cycles (BUY cash consumption -> FIFO buildup -> Ad lock -> Partial fills -> Compounding -> Snapshots)
 * 2. Concurrency Stress (Snapshot saves/deletes during event bursts, Chart rendering during filter toggles, Bank ledger mutations)
 * 3. Extreme Mathematical & Security Boundary Conditions (Overdrafts, XSS in notes, Sub-satoshi volume, Zero-divisor protection)
 */

const { describe, it, beforeEach } = require('./harness/test-runner');
const { assert } = require('./harness/assertions');
const { setupDomEnvironment } = require('./harness/dom-mock');

describe('Challenger 1 — M5: 7-Day Merchant Capital Cycles & Concurrency Suite', () => {
  let dom;
  let store;
  let utils;

  beforeEach(async () => {
    dom = setupDomEnvironment();
    const storeModule = await import('../js/store.js');
    store = storeModule.store;
    store.clearAllData();
    utils = await import('../js/utils.js');
  });

  // =========================================================================
  // TASK 1: 7-DAY REALISTIC MERCHANT CAPITAL LIFECYCLE SIMULATION
  // =========================================================================
  it('M5-CH1.1: 7-Day Merchant Trading Cycle with Compounding, Ad Lock, and Daily Snapshots', async () => {
    const { calculateTotalBankCash, resolveReferenceRate, calculateNetWorth, calculateSnapshotDelta, calculateFIFOInventoryAndPnL } = utils;

    // =========================================================================
    // DAY 1: INITIAL SETUP & BASELINE CAPITAL ALLOCATION
    // =========================================================================
    // Setup 4 merchant bank accounts with ₦10M initial capital
    const opay = store.addBankAccount({ name: 'OPay Merchant', last4: '1001', initialBalance: 4000000 });
    const kuda = store.addBankAccount({ name: 'Kuda Trading', last4: '2002', initialBalance: 3000000 });
    const monie = store.addBankAccount({ name: 'Moniepoint POS', last4: '3003', initialBalance: 2000000 });
    const palm = store.addBankAccount({ name: 'PalmPay Fast', last4: '4004', initialBalance: 1000000 });

    // Opening inventory: 1,000 USDT @ ₦1,500.00 = ₦1,500,000 cost basis
    store.setOpeningInventory({ startingUsdtBalance: 1000, defaultCostBasis: 1500 });

    const day1Cash = calculateTotalBankCash(store.getComputedBankBalances());
    assert.strictEqual(day1Cash, 10000000, 'Day 1 Bank Cash must be ₦10,000,000');

    const day1Rate = resolveReferenceRate({ openingDefaultRate: 1500 });
    assert.strictEqual(day1Rate, 1500, 'Day 1 Rate is default opening cost basis');

    const day1Nw = calculateNetWorth(day1Cash, 1000, day1Rate);
    assert.strictEqual(day1Nw.netWorthNgn, 11500000, 'Day 1 NW NGN: 10M cash + (1000 * 1500) = 11,500,000');
    assert.strictEqual(day1Nw.netWorthUsdt, 7666.67, 'Day 1 NW USDT: 1000 + (10M / 1500) = 7,666.67');

    const snapDay1 = store.saveSnapshot({
      timestamp: '2026-08-19T21:00:00.000Z',
      bankCash: day1Cash,
      usdtBalance: 1000,
      referenceRate: day1Rate,
      netWorthNgn: day1Nw.netWorthNgn,
      netWorthUsdt: day1Nw.netWorthUsdt,
      notes: 'Day 1: Starting capital baseline (₦10M cash + 1000 USDT)'
    });
    assert.ok(snapDay1.id, 'Day 1 Snapshot saved with ID');


    // =========================================================================
    // DAY 2: MASSIVE BUY CYCLE & INVENTORY BUILDUP (Cash Outflow)
    // =========================================================================
    // Merchant buys 4,000 USDT across 3 banks:
    // - OPay: Buy 2,000 USDT @ 1490 = ₦2,980,000 + ₦50 fee = ₦2,980,050 net
    // - Kuda: Buy 1,000 USDT @ 1492 = ₦1,492,000 + ₦50 fee = ₦1,492,050 net
    // - Moniepoint: Buy 1,000 USDT @ 1495 = ₦1,495,000 + ₦50 fee = ₦1,495,050 net
    store.addTrade({
      type: 'BUY',
      bankAccountId: opay.id,
      ngnAmount: 2980000,
      usdtAmount: 2000,
      rate: 1490,
      totalFees: 50,
      netAmount: 2980050,
      date: '2026-08-20T09:00:00.000Z',
      counterparty: 'Seller1_OPay'
    });

    store.addTrade({
      type: 'BUY',
      bankAccountId: kuda.id,
      ngnAmount: 1492000,
      usdtAmount: 1000,
      rate: 1492,
      totalFees: 50,
      netAmount: 1492050,
      date: '2026-08-20T11:00:00.000Z',
      counterparty: 'Seller2_Kuda'
    });

    store.addTrade({
      type: 'BUY',
      bankAccountId: monie.id,
      ngnAmount: 1495000,
      usdtAmount: 1000,
      rate: 1495,
      totalFees: 50,
      netAmount: 1495050,
      date: '2026-08-20T14:00:00.000Z',
      counterparty: 'Seller3_Monie'
    });

    const day2Cash = calculateTotalBankCash(store.getComputedBankBalances());
    // 10,000,000 - 2,980,050 - 1,492,050 - 1,495,050 = 4,032,850
    assert.strictEqual(day2Cash, 4032850, 'Day 2 Cash must reflect exact trade outflows + fees');

    const day2Fifo = calculateFIFOInventoryAndPnL(store.getTrades(), store.getOpeningInventory());
    assert.strictEqual(day2Fifo.remainingInventoryUSDT, 5000, 'Day 2 total USDT inventory is 5,000');
    assert.closeTo(day2Fifo.inventoryCostBasisNGN, 7467150, 0.01);
    assert.closeTo(day2Fifo.avgHoldingCostPerUSDT, 1493.43, 0.01);

    // Active Sell Ad posted on Bybit: 3,500 USDT listed @ 1530.00
    const activeAdDay2 = { id: 'AD_001', side: 1, status: 10, price: '1530.00', lastQuantity: '3500' };
    const day2Rate = resolveReferenceRate({
      activeSellAd: activeAdDay2,
      latestTrade: store.getTrades(),
      fifoAvgBuyCost: day2Fifo.avgHoldingCostPerUSDT
    });
    assert.strictEqual(day2Rate, 1530.00, 'Day 2 rate resolves to active sell ad price (₦1,530.00)');

    const day2Nw = calculateNetWorth(day2Cash, 5000, day2Rate);
    assert.strictEqual(day2Nw.netWorthNgn, 11682850);
    assert.closeTo(day2Nw.netWorthUsdt, 7635.85, 0.01);

    const snapDay2 = store.saveSnapshot({
      timestamp: '2026-08-20T21:00:00.000Z',
      bankCash: day2Cash,
      usdtBalance: 5000,
      referenceRate: day2Rate,
      netWorthNgn: day2Nw.netWorthNgn,
      netWorthUsdt: day2Nw.netWorthUsdt,
      notes: 'Day 2: Full buy cycle (5000 USDT inventory, Active Ad @ 1530)'
    });

    const deltaDay2 = calculateSnapshotDelta(snapDay2, snapDay1);
    assert.strictEqual(deltaDay2.deltaNgn, 182850, 'Day 2 delta NGN is +₦182,850.00');
    assert.closeTo(deltaDay2.pctDeltaNgn, 1.59, 0.01, 'Day 2 pct delta is +1.59%');


    // =========================================================================
    // DAY 3: PARTIAL TRADE FILLS & PROFIT REALIZATION (Cash Inflow)
    // =========================================================================
    store.addTrade({
      type: 'SELL',
      bankAccountId: monie.id,
      ngnAmount: 2302500,
      usdtAmount: 1500,
      rate: 1535,
      totalFees: 0,
      netAmount: 2302500,
      date: '2026-08-21T10:00:00.000Z',
      counterparty: 'BuyerA'
    });

    store.addTrade({
      type: 'SELL',
      bankAccountId: opay.id,
      ngnAmount: 1535000,
      usdtAmount: 1000,
      rate: 1535,
      totalFees: 0,
      netAmount: 1535000,
      date: '2026-08-21T13:00:00.000Z',
      counterparty: 'BuyerB'
    });

    store.addTrade({
      type: 'SELL',
      bankAccountId: kuda.id,
      ngnAmount: 767500,
      usdtAmount: 500,
      rate: 1535,
      totalFees: 0,
      netAmount: 767500,
      date: '2026-08-21T16:00:00.000Z',
      counterparty: 'BuyerC'
    });

    const day3Cash = calculateTotalBankCash(store.getComputedBankBalances());
    assert.strictEqual(day3Cash, 8637850, 'Day 3 Bank cash replenished to ₦8,637,850');

    const day3Fifo = calculateFIFOInventoryAndPnL(store.getTrades(), store.getOpeningInventory());
    assert.strictEqual(day3Fifo.remainingInventoryUSDT, 2000);
    assert.closeTo(day3Fifo.totalRealizedPnL, 124950, 1.0);

    const day3Rate = 1535.00;
    const day3Nw = calculateNetWorth(day3Cash, 2000, day3Rate);
    assert.strictEqual(day3Nw.netWorthNgn, 11707850);
    assert.closeTo(day3Nw.netWorthUsdt, 7627.26, 0.01);

    const snapDay3 = store.saveSnapshot({
      timestamp: '2026-08-21T21:00:00.000Z',
      bankCash: day3Cash,
      usdtBalance: 2000,
      referenceRate: day3Rate,
      netWorthNgn: day3Nw.netWorthNgn,
      netWorthUsdt: day3Nw.netWorthUsdt,
      notes: 'Day 3: Partial fills realized ₦124,950 profit'
    });

    const deltaDay3 = calculateSnapshotDelta(snapDay3, snapDay2);
    assert.strictEqual(deltaDay3.deltaNgn, 25000, 'Day 3 delta NGN is +₦25,000.00');


    // =========================================================================
    // DAY 4: INTERBANK REBALANCING & SETTLEMENT FLOWS
    // =========================================================================
    store.addTransfer({
      asset: 'NGN',
      fromBankId: monie.id,
      toBankId: palm.id,
      amount: 2000000,
      fee: 25,
      date: '2026-08-22T08:00:00.000Z',
      notes: 'Replenish PalmPay for buy orders'
    });

    store.addTransfer({
      asset: 'NGN',
      fromBankId: opay.id,
      toBankId: kuda.id,
      amount: 1500000,
      fee: 10,
      date: '2026-08-22T08:30:00.000Z',
      notes: 'Rebalance OPay to Kuda'
    });

    const day4Cash = calculateTotalBankCash(store.getComputedBankBalances());
    assert.strictEqual(day4Cash, 8637815, 'Day 4 Cash reduced by exact interbank transfer fees (₦35)');

    store.addTrade({
      type: 'BUY',
      bankAccountId: palm.id,
      ngnAmount: 2250000,
      usdtAmount: 1500,
      rate: 1500,
      totalFees: 50,
      netAmount: 2250050,
      date: '2026-08-22T12:00:00.000Z',
      counterparty: 'Seller4_Palm'
    });

    const day4PostBuyCash = calculateTotalBankCash(store.getComputedBankBalances());
    assert.strictEqual(day4PostBuyCash, 6387765);

    const day4Fifo = calculateFIFOInventoryAndPnL(store.getTrades(), store.getOpeningInventory());
    assert.strictEqual(day4Fifo.remainingInventoryUSDT, 3500);

    const day4Rate = 1530.00;
    const day4Nw = calculateNetWorth(day4PostBuyCash, 3500, day4Rate);
    assert.strictEqual(day4Nw.netWorthNgn, 11742765);

    const snapDay4 = store.saveSnapshot({
      timestamp: '2026-08-22T21:00:00.000Z',
      bankCash: day4PostBuyCash,
      usdtBalance: 3500,
      referenceRate: day4Rate,
      netWorthNgn: day4Nw.netWorthNgn,
      netWorthUsdt: day4Nw.netWorthUsdt,
      notes: 'Day 4: Interbank rebalancing + PalmPay buy expansion'
    });

    const deltaDay4 = calculateSnapshotDelta(snapDay4, snapDay3);
    assert.strictEqual(deltaDay4.deltaNgn, 34915, 'Day 4 delta NGN is +₦34,915.00');


    // =========================================================================
    // DAY 5: MARKET DOWNTURN & INVERSE DUAL-VALUATION VOLATILITY
    // =========================================================================
    const day5Rate = 1460.00;
    const day5Nw = calculateNetWorth(day4PostBuyCash, 3500, day5Rate);
    assert.strictEqual(day5Nw.netWorthNgn, 11497765);
    assert.strictEqual(day5Nw.netWorthUsdt, 7875.18);

    const snapDay5 = store.saveSnapshot({
      timestamp: '2026-08-23T21:00:00.000Z',
      bankCash: day4PostBuyCash,
      usdtBalance: 3500,
      referenceRate: day5Rate,
      netWorthNgn: day5Nw.netWorthNgn,
      netWorthUsdt: day5Nw.netWorthUsdt,
      notes: 'Day 5: Market correction to 1460 (NGN NW drops, USDT NW increases)'
    });

    const deltaDay5 = calculateSnapshotDelta(snapDay5, snapDay4);
    assert.strictEqual(deltaDay5.deltaNgn, -245000, 'Day 5 delta NGN reflects market loss -₦245,000');
    assert.closeTo(deltaDay5.pctDeltaNgn, -2.09, 0.01);
    assert.isAbove(deltaDay5.deltaUsdt, 0, 'USDT Net Worth gained purchasing power due to cheaper USDT');


    // =========================================================================
    // DAY 6: HIGH-FREQUENCY INTRADAY ARBITRAGE SCALPING (10 Rapid Turns)
    // =========================================================================
    for (let i = 1; i <= 10; i++) {
      store.addTrade({
        type: 'BUY',
        bankAccountId: kuda.id,
        ngnAmount: 294000,
        usdtAmount: 200,
        rate: 1470,
        totalFees: 10,
        netAmount: 294010,
        date: `2026-08-24T${String(8 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 === 0 ? '30' : '00'}:00.000Z`,
        counterparty: `ScalpSeller_${i}`
      });

      store.addTrade({
        type: 'SELL',
        bankAccountId: opay.id,
        ngnAmount: 302000,
        usdtAmount: 200,
        rate: 1510,
        totalFees: 0,
        netAmount: 302000,
        date: `2026-08-24T${String(8 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 === 0 ? '45' : '15'}:00.000Z`,
        counterparty: `ScalpBuyer_${i}`
      });
    }

    const day6Cash = calculateTotalBankCash(store.getComputedBankBalances());
    assert.strictEqual(day6Cash, 6467665, 'Day 6 Cash compounded by 10 scalp trades (+₦79,900)');

    const day6Rate = 1510.00;
    const day6Nw = calculateNetWorth(day6Cash, 3500, day6Rate);
    assert.strictEqual(day6Nw.netWorthNgn, 11752665);

    const snapDay6 = store.saveSnapshot({
      timestamp: '2026-08-24T21:00:00.000Z',
      bankCash: day6Cash,
      usdtBalance: 3500,
      referenceRate: day6Rate,
      netWorthNgn: day6Nw.netWorthNgn,
      netWorthUsdt: day6Nw.netWorthUsdt,
      notes: 'Day 6: 10 Scalp iterations compounding +₦79,900 net cash'
    });

    const deltaDay6 = calculateSnapshotDelta(snapDay6, snapDay5);
    assert.strictEqual(deltaDay6.deltaNgn, 254900, 'Day 6 delta NGN is +₦254,900.00');


    // =========================================================================
    // DAY 7: COMPLETE LIQUIDATION & WEEKLY CAPITAL CYCLE RECONCILIATION
    // =========================================================================
    store.addTrade({
      type: 'SELL',
      bankAccountId: monie.id,
      ngnAmount: 5390000,
      usdtAmount: 3500,
      rate: 1540,
      totalFees: 0,
      netAmount: 5390000,
      date: '2026-08-25T14:00:00.000Z',
      counterparty: 'FinalLiquidationBuyer'
    });

    const day7Cash = calculateTotalBankCash(store.getComputedBankBalances());
    assert.strictEqual(day7Cash, 11857665, 'Final Day 7 Cash is ₦11,857,665');

    const day7Fifo = calculateFIFOInventoryAndPnL(store.getTrades(), store.getOpeningInventory());
    assert.strictEqual(day7Fifo.remainingInventoryUSDT, 0, 'Inventory is fully liquidated to 0.00 USDT');
    assert.strictEqual(day7Fifo.totalUnmatchedSoldUSDT, 0, 'No unmatched external sales');
    assert.closeTo(day7Fifo.totalRealizedPnL, 357700, 50, 'Total FIFO realized profit matches capital expansion');

    const day7Rate = 1540.00;
    const day7Nw = calculateNetWorth(day7Cash, 0, day7Rate);
    assert.strictEqual(day7Nw.netWorthNgn, 11857665);
    assert.strictEqual(day7Nw.netWorthUsdt, 7699.78); // 11,857,665 / 1540 = 7,699.78 USDT

    const snapDay7 = store.saveSnapshot({
      timestamp: '2026-08-25T21:00:00.000Z',
      bankCash: day7Cash,
      usdtBalance: 0,
      referenceRate: day7Rate,
      netWorthNgn: day7Nw.netWorthNgn,
      netWorthUsdt: day7Nw.netWorthUsdt,
      notes: 'Day 7: Full weekly cycle completed (100% cash, +₦357,665 gain)'
    });

    const allSnapshots = store.getSnapshots();
    assert.strictEqual(allSnapshots.length, 7, 'All 7 daily snapshots logged');

    for (let i = 1; i < allSnapshots.length; i++) {
      const prev = new Date(allSnapshots[i - 1].timestamp).getTime();
      const curr = new Date(allSnapshots[i].timestamp).getTime();
      assert.ok(curr > prev, `Snapshot ${i} is strictly after snapshot ${i - 1}`);
    }

    const totalCycleDelta = calculateSnapshotDelta(allSnapshots[6], allSnapshots[0]);
    assert.strictEqual(totalCycleDelta.deltaNgn, 357665, 'Total 7-day NGN growth is exact +₦357,665.00');
    assert.closeTo(totalCycleDelta.pctDeltaNgn, 3.11, 0.01, 'Total 7-day ROI is +3.11%');
    assert.strictEqual(totalCycleDelta.deltaUsdt, 33.11, 'Total 7-day USDT growth is +33.11 USDT');
  });

  // =========================================================================
  // TASK 2: HIGH-CONCURRENCY & RACE CONDITION STRESS TESTING
  // =========================================================================
  it('M5-CH1.2: Rapid Concurrent Snapshot CRUD Operations & Event Burst Synchronization', async () => {
    let eventNotificationCount = 0;
    const listener = (e) => {
      if (e.detail?.type === 'snapshots' || e.detail?.type === 'SNAPSHOTS_UPDATED') {
        eventNotificationCount++;
      }
    };
    dom.window.addEventListener('store:updated', listener);

    const promises = [];
    for (let i = 0; i < 50; i++) {
      const dayOffset = Math.floor(Math.random() * 30);
      const randHour = Math.floor(Math.random() * 24);
      const iso = new Date(Date.UTC(2026, 7, 1 + dayOffset, randHour, 0, 0)).toISOString();

      promises.push(
        Promise.resolve().then(() => {
          return store.saveSnapshot({
            id: `snp_conc_${i}`,
            timestamp: iso,
            bankCash: 1000000 + (i * 10000),
            usdtBalance: 500 + i,
            referenceRate: 1500 + (i % 20),
            notes: `Concurrent snapshot #${i}`
          });
        })
      );
    }

    const savedSnapshots = await Promise.all(promises);
    assert.strictEqual(savedSnapshots.length, 50, 'All 50 concurrent saves resolved');

    const retrieved = store.getSnapshots();
    assert.strictEqual(retrieved.length, 50, 'Store contains 50 records');

    for (let i = 1; i < retrieved.length; i++) {
      const t1 = new Date(retrieved[i - 1].timestamp).getTime();
      const t2 = new Date(retrieved[i].timestamp).getTime();
      assert.ok(t2 >= t1, `Snapshots must be strictly ordered by timestamp: ${t2} >= ${t1}`);
    }

    const deletePromises = [];
    for (let i = 0; i < 20; i++) {
      const idToDelete = `snp_conc_${i * 2}`;
      deletePromises.push(
        Promise.resolve().then(() => store.deleteSnapshot(idToDelete))
      );
    }

    await Promise.all(deletePromises);
    const remaining = store.getSnapshots();
    assert.strictEqual(remaining.length, 30, 'Store has exactly 30 records remaining after deletions');

    assert.ok(eventNotificationCount >= 70, `Event bus received >= 70 notifications, got ${eventNotificationCount}`);
    dom.window.removeEventListener('store:updated', listener);
  });

  it('M5-CH1.3: Simultaneous Multi-Bank Balance Ledger Mutations with Atomicity Verification', async () => {
    const b1 = store.addBankAccount({ name: 'Bank Alpha', initialBalance: 5000000 });
    const b2 = store.addBankAccount({ name: 'Bank Beta', initialBalance: 5000000 });

    const mutationPromises = [];
    for (let i = 0; i < 50; i++) {
      mutationPromises.push(Promise.resolve().then(() => {
        store.addTrade({
          type: 'BUY',
          bankAccountId: b1.id,
          ngnAmount: 50000,
          usdtAmount: 33.33,
          rate: 1500,
          totalFees: 10,
          netAmount: 50010,
          date: new Date().toISOString()
        });
      }));
    }

    for (let i = 0; i < 30; i++) {
      mutationPromises.push(Promise.resolve().then(() => {
        store.addTrade({
          type: 'SELL',
          bankAccountId: b2.id,
          ngnAmount: 80000,
          usdtAmount: 52.0,
          rate: 1538,
          totalFees: 0,
          netAmount: 80000,
          date: new Date().toISOString()
        });
      }));
    }

    for (let i = 0; i < 20; i++) {
      mutationPromises.push(Promise.resolve().then(() => {
        store.addTransfer({
          asset: 'NGN',
          fromBankId: b2.id,
          toBankId: b1.id,
          amount: 25000,
          fee: 5,
          date: new Date().toISOString()
        });
      }));
    }

    await Promise.all(mutationPromises);

    const balances = store.getComputedBankBalances();
    assert.strictEqual(balances.get(b1.id).currentBalance, 2999500, 'Bank Alpha ledger must match exact balance');
    assert.strictEqual(balances.get(b2.id).currentBalance, 6899900, 'Bank Beta ledger must match exact balance');

    const totalCash = utils.calculateTotalBankCash(balances);
    assert.strictEqual(totalCash, 9899400, 'Total Bank Cash ledger maintains 100% zero-drift atomicity');
  });

  it('M5-CH1.4: Chart.js Rapid Currency Filter Toggling & View Switching Under Snapshot Mutations', async () => {
    const { renderDashboardView } = await import('../js/views/dashboard.view.js');
    const { renderModalsView } = await import('../js/views/modals.view.js');

    dom.document.root.innerHTML = `
      <div id="main-content">${renderDashboardView()}</div>
      <div id="modals-container">${renderModalsView()}</div>
    `;

    const { initDashboard, renderNetWorthTrendChart } = await import('../js/dashboard.js');
    initDashboard();

    for (let i = 1; i <= 5; i++) {
      store.saveSnapshot({
        timestamp: `2026-08-2${i}T12:00:00.000Z`,
        bankCash: 5000000 + (i * 200000),
        usdtBalance: 1000 + (i * 100),
        referenceRate: 1500,
        netWorthNgn: 6500000 + (i * 350000),
        netWorthUsdt: 4333 + (i * 233),
        notes: `Snapshot ${i}`
      });
    }

    const modes = ['both', 'ngn', 'usdt'];
    for (let i = 0; i < 50; i++) {
      const mode = modes[i % 3];
      const chart = renderNetWorthTrendChart(mode);
      assert.ok(chart, `Chart rendered successfully in mode: ${mode}`);
    }

    store.deleteSnapshot(store.getSnapshots()[0].id);
    const chartAfterDelete = renderNetWorthTrendChart('both');
    assert.ok(chartAfterDelete, 'Chart re-renders safely after snapshot deletion');
  });

  // =========================================================================
  // TASK 3: ADVERSARIAL MATHEMATICAL BOUNDARIES & SECURITY HARDENING
  // =========================================================================
  it('M5-CH1.5: Overdraft Bank Balance Combined with Positive USDT Holdings', () => {
    const { calculateNetWorth } = utils;

    const overdraftCash = -5000000;
    const usdtHoldings = 4000;
    const rate = 1500;

    const nw = calculateNetWorth(overdraftCash, usdtHoldings, rate);
    assert.strictEqual(nw.netWorthNgn, 1000000);
    assert.strictEqual(nw.netWorthUsdt, 666.67);

    const deepInsolventNw = calculateNetWorth(-10000000, usdtHoldings, rate);
    assert.strictEqual(deepInsolventNw.netWorthNgn, -4000000);
    assert.strictEqual(deepInsolventNw.netWorthUsdt, -2666.67);
  });

  it('M5-CH1.6: 0-Divisor & Boundary Safeguards in calculateSnapshotDelta', () => {
    const { calculateSnapshotDelta } = utils;

    const deltaNull = calculateSnapshotDelta(null, null);
    assert.strictEqual(deltaNull.deltaNgn, 0);
    assert.strictEqual(deltaNull.pctDeltaNgn, 0);

    const current = { netWorthNgn: 1500000, netWorthUsdt: 1000 };
    const zeroPrev = { netWorthNgn: 0, netWorthUsdt: 0 };
    const deltaZeroPrev = calculateSnapshotDelta(current, zeroPrev);
    assert.strictEqual(deltaZeroPrev.deltaNgn, 1500000);
    assert.strictEqual(deltaZeroPrev.pctDeltaNgn, 0, 'Percentage delta must be 0 when previous is 0 (no NaN/Infinity)');

    const negPrev = { netWorthNgn: -500000, netWorthUsdt: -333.33 };
    const deltaFromNeg = calculateSnapshotDelta(current, negPrev);
    assert.strictEqual(deltaFromNeg.deltaNgn, 2000000);
    assert.strictEqual(deltaFromNeg.pctDeltaNgn, 400);
  });

  it('M5-CH1.7: XSS & HTML Injection Sanitization in Snapshot Notes and Modals', () => {
    const { escapeHtml, validateSnapshot } = utils;

    const maliciousNote = '<script>alert("xss")</script><img src=x onerror="stealKeys()"/> & "quotes"';
    const escaped = escapeHtml(maliciousNote);
    assert.ok(!escaped.includes('<script>'), 'Script tags stripped or escaped');
    assert.ok(escaped.includes('&lt;script&gt;'), 'HTML entities properly escaped');

    const validation = validateSnapshot({
      bankCash: 1000000,
      usdtBalance: 500,
      referenceRate: 1500,
      notes: maliciousNote
    });

    assert.strictEqual(validation.isValid, true, 'Snapshot is valid');
    assert.strictEqual(validation.sanitized.notes, maliciousNote.trim(), 'Notes retained verbatim in model');
  });

  it('M5-CH1.8: Sub-Satoshi Precision & Extreme Exchange Rate Bounds', () => {
    const { calculateNetWorth, resolveReferenceRate } = utils;

    const tinyNw = calculateNetWorth(1000, 0.00000001, 1500);
    assert.strictEqual(tinyNw.netWorthNgn, 1000);

    const megaRateNw = calculateNetWorth(5000000, 100, 10000000);
    assert.strictEqual(megaRateNw.netWorthNgn, 1005000000);
    assert.strictEqual(megaRateNw.netWorthUsdt, 100.5);

    assert.strictEqual(resolveReferenceRate({ activeSellAd: { price: '-50' }, fallbackRate: 1500 }), 1500);
    assert.strictEqual(resolveReferenceRate({ activeSellAd: { price: '0' }, fallbackRate: 1500 }), 1500);
    assert.strictEqual(resolveReferenceRate({ activeSellAd: { price: 'NaN' }, fallbackRate: 1500 }), 1500);
  });

}, { tier: 5, category: 'Tier 5: Capital Cycles & Concurrency' });
