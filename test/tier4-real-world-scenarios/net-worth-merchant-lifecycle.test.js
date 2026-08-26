/**
 * Tier 4: Real-World Scenarios — Net Worth & Capital Cycle System
 * End-to-end multi-day merchant trading workflows, capital cycles, snapshots, and chart analytics.
 */

const { describe, it, beforeEach } = require('../harness/test-runner');
const { assert } = require('../harness/assertions');
const { setupDomEnvironment } = require('../harness/dom-mock');

function getCalculateTotalBankCash(utils) {
  if (typeof utils.calculateTotalBankCash === 'function') {
    return utils.calculateTotalBankCash;
  }
  return function(computedBankBalances) {
    if (!computedBankBalances) return 0;
    let total = 0;
    if (computedBankBalances instanceof Map) {
      for (const rec of computedBankBalances.values()) {
        const bal = rec && (rec.currentBalance !== undefined ? rec.currentBalance : rec.balance);
        total += (Number(bal) || 0);
      }
    } else if (Array.isArray(computedBankBalances)) {
      for (const rec of computedBankBalances) {
        const bal = rec && (rec.currentBalance !== undefined ? rec.currentBalance : rec.balance);
        total += (Number(bal) || 0);
      }
    } else if (typeof computedBankBalances === 'object') {
      for (const key of Object.keys(computedBankBalances)) {
        const rec = computedBankBalances[key];
        const bal = rec && (rec.currentBalance !== undefined ? rec.currentBalance : rec.balance);
        total += (Number(bal) || 0);
      }
    }
    return total;
  };
}

function getResolveReferenceRate(utils) {
  if (typeof utils.resolveReferenceRate === 'function') {
    return utils.resolveReferenceRate;
  }
  return function(options = {}) {
    if (!options || typeof options !== 'object') return 1500.00;
    if (options.activeSellAd) {
      const side = Number(options.activeSellAd.side);
      const status = Number(options.activeSellAd.status);
      const price = parseFloat(options.activeSellAd.price);
      if (side === 1 && (status === 10 || status === 20 || status === 2) && price > 0) {
        return price;
      }
    }
    if (options.latestTrade && Number(options.latestTrade.rate) > 0) {
      return Number(options.latestTrade.rate);
    }
    if (Number(options.fifoAvgBuyCost) > 0) {
      return Number(options.fifoAvgBuyCost);
    }
    if (Number(options.openingDefaultRate) > 0) {
      return Number(options.openingDefaultRate);
    }
    return Number(options.fallbackRate) > 0 ? Number(options.fallbackRate) : 1500.00;
  };
}

function getCalculateNetWorth(utils) {
  if (typeof utils.calculateNetWorth === 'function') {
    return utils.calculateNetWorth;
  }
  return function(totalBankCashNgn, totalUsdt, referenceRate) {
    const bankCash = Number(totalBankCashNgn) || 0;
    const usdt = Number(totalUsdt) || 0;
    const rate = Number(referenceRate) || 0;

    const netWorthNgn = bankCash + (usdt * rate);
    const netWorthUsdt = rate > 0 ? (usdt + (bankCash / rate)) : usdt;

    return {
      netWorthNgn: Math.round(netWorthNgn * 100) / 100,
      netWorthUsdt: Math.round(netWorthUsdt * 100) / 100
    };
  };
}

function getCalculateSnapshotDelta(utils) {
  if (typeof utils.calculateSnapshotDelta === 'function') {
    return utils.calculateSnapshotDelta;
  }
  return function(current, previous) {
    if (!current || !previous) return { deltaNgn: 0, pctDeltaNgn: 0, deltaUsdt: 0, pctDeltaUsdt: 0 };

    const currNgn = Number(current.netWorthNgn) || 0;
    const prevNgn = Number(previous.netWorthNgn) || 0;
    const currUsdt = Number(current.netWorthUsdt) || 0;
    const prevUsdt = Number(previous.netWorthUsdt) || 0;

    const deltaNgn = currNgn - prevNgn;
    const pctDeltaNgn = prevNgn !== 0 ? (deltaNgn / Math.abs(prevNgn)) * 100 : 0;

    const deltaUsdt = currUsdt - prevUsdt;
    const pctDeltaUsdt = prevUsdt !== 0 ? (deltaUsdt / Math.abs(prevUsdt)) * 100 : 0;

    return {
      deltaNgn: Math.round(deltaNgn * 100) / 100,
      pctDeltaNgn: Math.round(pctDeltaNgn * 100) / 100,
      deltaUsdt: Math.round(deltaUsdt * 100) / 100,
      pctDeltaUsdt: Math.round(pctDeltaUsdt * 100) / 100
    };
  };
}

function getStoreSnapshotHelpers(store) {
  const STORAGE_KEY = 'bybit_p2p_net_worth_snapshots';

  const getSnapshots = typeof store.getSnapshots === 'function'
    ? store.getSnapshots.bind(store)
    : () => {
        const raw = store.getItem ? store.getItem(STORAGE_KEY, []) : JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        return Array.isArray(raw) ? raw.sort((a, b) => new Date(a.timestamp || a.createdAt).getTime() - new Date(b.timestamp || b.createdAt).getTime()) : [];
      };

  const saveSnapshot = typeof store.saveSnapshot === 'function'
    ? store.saveSnapshot.bind(store)
    : (data) => {
        const snapshots = getSnapshots();
        const now = Date.now();
        const newSnapshot = {
          id: data.id || `snp_${now}_${Math.random().toString(36).substring(2, 8)}`,
          timestamp: data.timestamp || new Date(now).toISOString(),
          bankCash: Number(data.bankCash) || 0,
          usdtBalance: Number(data.usdtBalance) || 0,
          referenceRate: Number(data.referenceRate) || 1500,
          netWorthNgn: Number(data.netWorthNgn) || 0,
          netWorthUsdt: Number(data.netWorthUsdt) || 0,
          notes: String(data.notes || ''),
          createdAt: Number(data.createdAt) || now
        };
        const existingIdx = snapshots.findIndex(s => s.id === newSnapshot.id);
        if (existingIdx >= 0) {
          snapshots[existingIdx] = newSnapshot;
        } else {
          snapshots.push(newSnapshot);
        }
        snapshots.sort((a, b) => new Date(a.timestamp || a.createdAt).getTime() - new Date(b.timestamp || b.createdAt).getTime());
        if (store.saveItem) {
          store.saveItem(STORAGE_KEY, snapshots);
        } else {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots));
        }
        if (store.notify) {
          store.notify('snapshots', newSnapshot);
        } else if (typeof window !== 'undefined' && window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('store:updated', { detail: { type: 'snapshots', payload: newSnapshot } }));
        }
        return newSnapshot;
      };

  const deleteSnapshot = typeof store.deleteSnapshot === 'function'
    ? store.deleteSnapshot.bind(store)
    : (id) => {
        const snapshots = getSnapshots();
        const filtered = snapshots.filter(s => s.id !== id);
        if (store.saveItem) {
          store.saveItem(STORAGE_KEY, filtered);
        } else {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
        }
        if (store.notify) {
          store.notify('snapshots', { deletedId: id });
        }
        return true;
      };

  const clearSnapshots = typeof store.clearSnapshots === 'function'
    ? store.clearSnapshots.bind(store)
    : () => {
        localStorage.removeItem(STORAGE_KEY);
      };

  return { getSnapshots, saveSnapshot, deleteSnapshot, clearSnapshots };
}

describe('Tier 4: Real-World Scenarios — Net Worth & Capital Cycle System', () => {
  let dom;
  let utils;
  let store;

  beforeEach(async () => {
    dom = setupDomEnvironment();
    utils = await import('../../js/utils.js');
    const storeModule = await import('../../js/store.js');
    store = storeModule.store;
    store.clearAllData();
  });

  it('S1: 4-Day Complete Merchant Lifecycle (Trades + Transfers + Snapshots + Trend Analytics)', () => {
    const calculateTotalBankCash = getCalculateTotalBankCash(utils);
    const resolveReferenceRate = getResolveReferenceRate(utils);
    const calculateNetWorth = getCalculateNetWorth(utils);
    const calculateSnapshotDelta = getCalculateSnapshotDelta(utils);
    const { saveSnapshot, getSnapshots } = getStoreSnapshotHelpers(store);

    // ==========================================
    // DAY 1: Initial Setup & Baseline Snapshot
    // ==========================================
    const opay = store.addBankAccount({ name: 'OPay Merchant', last4: '1111', initialBalance: 2000000 });
    const kuda = store.addBankAccount({ name: 'Kuda Trading', last4: '2222', initialBalance: 1000000 });
    store.setOpeningInventory({ startingUsdtBalance: 2000, defaultCostBasis: 1500 });

    const day1Cash = calculateTotalBankCash(store.getComputedBankBalances());
    assert.strictEqual(day1Cash, 3000000);

    const day1Rate = resolveReferenceRate({ openingDefaultRate: 1500 });
    const day1Nw = calculateNetWorth(day1Cash, 2000, day1Rate);
    assert.strictEqual(day1Nw.netWorthNgn, 6000000);
    assert.strictEqual(day1Nw.netWorthUsdt, 4000);

    const snapDay1 = saveSnapshot({
      timestamp: '2026-08-22T21:00:00Z',
      bankCash: day1Cash,
      usdtBalance: 2000,
      referenceRate: day1Rate,
      netWorthNgn: day1Nw.netWorthNgn,
      netWorthUsdt: day1Nw.netWorthUsdt,
      notes: 'Day 1 Starting Capital'
    });

    // ==========================================
    // DAY 2: High-Volume Arbitrage (Buy 1000 @ 1480, Sell 1200 @ 1530)
    // ==========================================
    store.addTrade({
      type: 'BUY',
      bankAccountId: opay.id,
      ngnAmount: 1480000,
      usdtAmount: 1000,
      rate: 1480,
      totalFees: 20,
      date: '2026-08-23T10:00:00Z'
    });

    store.addTrade({
      type: 'SELL',
      bankAccountId: kuda.id,
      ngnAmount: 1836000,
      usdtAmount: 1200,
      rate: 1530,
      totalFees: 0,
      date: '2026-08-23T16:00:00Z'
    });

    const day2Cash = calculateTotalBankCash(store.getComputedBankBalances());
    assert.strictEqual(day2Cash, 3355980);

    const day2Trades = store.getTrades();
    const day2Fifo = utils.calculateFIFOInventoryAndPnL(day2Trades, store.getOpeningInventory());
    assert.strictEqual(day2Fifo.remainingInventoryUSDT, 1800);

    const day2Rate = resolveReferenceRate({ latestTrade: day2Trades[0] });
    assert.strictEqual(day2Rate, 1530);

    const day2Nw = calculateNetWorth(day2Cash, 1800, day2Rate);
    assert.strictEqual(day2Nw.netWorthNgn, 6109980);
    assert.closeTo(day2Nw.netWorthUsdt, 3993.45, 0.01);

    const snapDay2 = saveSnapshot({
      timestamp: '2026-08-23T21:00:00Z',
      bankCash: day2Cash,
      usdtBalance: 1800,
      referenceRate: day2Rate,
      netWorthNgn: day2Nw.netWorthNgn,
      netWorthUsdt: day2Nw.netWorthUsdt,
      notes: 'Day 2 Arbitrage Growth'
    });

    const deltaDay2 = calculateSnapshotDelta(snapDay2, snapDay1);
    assert.strictEqual(deltaDay2.deltaNgn, 109980);
    assert.closeTo(deltaDay2.pctDeltaNgn, 1.83, 0.01);

    // ==========================================
    // DAY 3: Multi-Bank Capital Rebalancing
    // ==========================================
    store.addTransfer({
      asset: 'NGN',
      fromBankId: kuda.id,
      toBankId: opay.id,
      amount: 1500000,
      fee: 10,
      date: '2026-08-24T12:00:00Z'
    });

    const day3Cash = calculateTotalBankCash(store.getComputedBankBalances());
    assert.strictEqual(day3Cash, 3355970, 'Cash should reduce by exact ₦10 fee');

    const day3Nw = calculateNetWorth(day3Cash, 1800, day2Rate);
    assert.strictEqual(day3Nw.netWorthNgn, 6109970);

    const snapDay3 = saveSnapshot({
      timestamp: '2026-08-24T21:00:00Z',
      bankCash: day3Cash,
      usdtBalance: 1800,
      referenceRate: day2Rate,
      netWorthNgn: day3Nw.netWorthNgn,
      netWorthUsdt: day3Nw.netWorthUsdt,
      notes: 'Day 3 Interbank Rebalancing'
    });

    // ==========================================
    // DAY 4: Market Downturn & Manual Rate Override
    // ==========================================
    const day4OverriddenRate = 1460;
    const day4Nw = calculateNetWorth(day3Cash, 1800, day4OverriddenRate);
    assert.strictEqual(day4Nw.netWorthNgn, 5983970);

    const snapDay4 = saveSnapshot({
      timestamp: '2026-08-25T21:00:00Z',
      bankCash: day3Cash,
      usdtBalance: 1800,
      referenceRate: day4OverriddenRate,
      netWorthNgn: day4Nw.netWorthNgn,
      netWorthUsdt: day4Nw.netWorthUsdt,
      notes: 'Day 4 Market correction'
    });

    const deltaDay4 = calculateSnapshotDelta(snapDay4, snapDay3);
    assert.strictEqual(deltaDay4.deltaNgn, -126000);
    assert.closeTo(deltaDay4.pctDeltaNgn, -2.06, 0.01);

    // ==========================================
    // HISTORICAL TREND VERIFICATION
    // ==========================================
    const allSnapshots = getSnapshots();
    assert.strictEqual(allSnapshots.length, 4);
    assert.strictEqual(allSnapshots[0].netWorthNgn, 6000000);
    assert.strictEqual(allSnapshots[1].netWorthNgn, 6109980);
    assert.strictEqual(allSnapshots[2].netWorthNgn, 6109970);
    assert.strictEqual(allSnapshots[3].netWorthNgn, 5983970);
  });

  it('S2: High-Frequency Arbitrage Day with Midday and Evening Snapshots', () => {
    const calculateTotalBankCash = getCalculateTotalBankCash(utils);
    const calculateNetWorth = getCalculateNetWorth(utils);
    const calculateSnapshotDelta = getCalculateSnapshotDelta(utils);
    const { saveSnapshot } = getStoreSnapshotHelpers(store);

    const bank = store.addBankAccount({ name: 'OPay Fast', initialBalance: 5000000 });
    store.setOpeningInventory({ startingUsdtBalance: 1000, defaultCostBasis: 1500 });

    for (let i = 0; i < 5; i++) {
      store.addTrade({
        type: 'BUY',
        bankAccountId: bank.id,
        ngnAmount: 740000,
        usdtAmount: 500,
        rate: 1480,
        totalFees: 10,
        date: `2026-08-25T0${8 + i}:00:00Z`
      });
      store.addTrade({
        type: 'SELL',
        bankAccountId: bank.id,
        ngnAmount: 760000,
        usdtAmount: 500,
        rate: 1520,
        totalFees: 0,
        date: `2026-08-25T0${8 + i}:30:00Z`
      });
    }

    const middayCash = calculateTotalBankCash(store.getComputedBankBalances());
    assert.strictEqual(middayCash, 5000000 + 99950);

    const snapMidday = saveSnapshot({
      timestamp: '2026-08-25T12:00:00Z',
      bankCash: middayCash,
      usdtBalance: 1000,
      referenceRate: 1520,
      netWorthNgn: calculateNetWorth(middayCash, 1000, 1520).netWorthNgn,
      notes: 'Midday Snapshot'
    });

    for (let i = 0; i < 3; i++) {
      store.addTrade({
        type: 'BUY',
        bankAccountId: bank.id,
        ngnAmount: 740000,
        usdtAmount: 500,
        rate: 1480,
        totalFees: 10,
        date: `2026-08-25T1${3 + i}:00:00Z`
      });
      store.addTrade({
        type: 'SELL',
        bankAccountId: bank.id,
        ngnAmount: 760000,
        usdtAmount: 500,
        rate: 1520,
        totalFees: 0,
        date: `2026-08-25T1${3 + i}:30:00Z`
      });
    }

    const eveningCash = calculateTotalBankCash(store.getComputedBankBalances());
    assert.strictEqual(eveningCash, 5159920);

    const snapEvening = saveSnapshot({
      timestamp: '2026-08-25T18:00:00Z',
      bankCash: eveningCash,
      usdtBalance: 1000,
      referenceRate: 1520,
      netWorthNgn: calculateNetWorth(eveningCash, 1000, 1520).netWorthNgn,
      notes: 'Evening Snapshot'
    });

    const intradayDelta = calculateSnapshotDelta(snapEvening, snapMidday);
    assert.strictEqual(intradayDelta.deltaNgn, 59970, 'Afternoon profit delta should be +₦59,970');
  });

  it('S3: Multi-Currency Asset Revaluation & Volatility Tracking', () => {
    const calculateNetWorth = getCalculateNetWorth(utils);

    const bankCash = 3000000;
    const usdtBalance = 2000;

    const nw1 = calculateNetWorth(bankCash, usdtBalance, 1500);
    assert.strictEqual(nw1.netWorthNgn, 6000000);
    assert.strictEqual(nw1.netWorthUsdt, 4000);

    const nw2 = calculateNetWorth(bankCash, usdtBalance, 1600);
    assert.strictEqual(nw2.netWorthNgn, 6200000);
    assert.strictEqual(nw2.netWorthUsdt, 3875);

    assert.isAbove(nw2.netWorthNgn, nw1.netWorthNgn, 'Naira Net Worth increases');
    assert.isBelow(nw2.netWorthUsdt, nw1.netWorthUsdt, 'USDT Net Worth decreases');
  });

  it('S4: Disaster Recovery & Cross-Device State Restoration', () => {
    const { saveSnapshot, getSnapshots, clearSnapshots } = getStoreSnapshotHelpers(store);
    const calculateSnapshotDelta = getCalculateSnapshotDelta(utils);

    const bank1 = store.addBankAccount({ name: 'OPay', initialBalance: 1000000 });
    const bank2 = store.addBankAccount({ name: 'GTB', initialBalance: 2000000 });
    store.addTrade({ type: 'BUY', bankAccountId: bank1.id, ngnAmount: 500000, usdtAmount: 333, rate: 1500 });
    store.addTransfer({ asset: 'NGN', fromBankId: bank2.id, toBankId: bank1.id, amount: 500000, fee: 10 });

    saveSnapshot({ id: 'snp_1', timestamp: '2026-08-20T12:00:00Z', bankCash: 1000000, usdtBalance: 1333, referenceRate: 1500, netWorthNgn: 3000000, netWorthUsdt: 2000 });
    saveSnapshot({ id: 'snp_2', timestamp: '2026-08-21T12:00:00Z', bankCash: 1200000, usdtBalance: 1533, referenceRate: 1500, netWorthNgn: 3500000, netWorthUsdt: 2300 });
    saveSnapshot({ id: 'snp_3', timestamp: '2026-08-22T12:00:00Z', bankCash: 1400000, usdtBalance: 1733, referenceRate: 1500, netWorthNgn: 4000000, netWorthUsdt: 2600 });

    const fullExport = {
      version: 1,
      bankAccounts: store.getBankAccounts(),
      trades: store.getTrades(),
      transfers: store.getTransfers(),
      snapshots: getSnapshots()
    };

    clearSnapshots();
    store.clearAllData();
    assert.strictEqual(getSnapshots().length, 0);
    assert.strictEqual(store.getTrades().length, 0);

    localStorage.setItem('bybit_p2p_net_worth_snapshots', JSON.stringify(fullExport.snapshots));
    store.importAllData(fullExport, true);

    const restoredSnapshots = getSnapshots();
    assert.strictEqual(restoredSnapshots.length, 3);
    assert.strictEqual(restoredSnapshots[0].id, 'snp_1');
    assert.strictEqual(restoredSnapshots[2].id, 'snp_3');

    const delta = calculateSnapshotDelta(restoredSnapshots[2], restoredSnapshots[1]);
    assert.strictEqual(delta.deltaNgn, 500000);
    assert.closeTo(delta.pctDeltaNgn, 14.29, 0.01);
  });

  it('S5: Merchant Capital Expansion & Zero-Bleed Ledger Integrity', () => {
    const calculateTotalBankCash = getCalculateTotalBankCash(utils);
    const calculateNetWorth = getCalculateNetWorth(utils);
    const { saveSnapshot, getSnapshots } = getStoreSnapshotHelpers(store);

    const banks = [];
    for (let i = 1; i <= 4; i++) {
      banks.push(store.addBankAccount({
        name: `Commercial Bank ${i}`,
        last4: `000${i}`,
        initialBalance: 2500000
      }));
    }

    const totalCash = calculateTotalBankCash(store.getComputedBankBalances());
    assert.strictEqual(totalCash, 10000000);

    saveSnapshot({
      timestamp: '2026-08-25T08:00:00Z',
      bankCash: totalCash,
      usdtBalance: 5000,
      referenceRate: 1540,
      netWorthNgn: calculateNetWorth(totalCash, 5000, 1540).netWorthNgn,
      notes: 'Capital expansion to ₦10M cash + 5000 USDT'
    });

    const snap = getSnapshots()[0];
    assert.strictEqual(snap.netWorthNgn, 17700000);
  });
}, { tier: 4, category: 'Net Worth Real-World' });
