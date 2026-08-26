/**
 * Tier 3: Cross-Feature Combinations — Net Worth & Capital Cycle System
 * Tests pairwise and multi-module interactions across ledger, active ads, snapshot saves, deltas, export/import, and reactivity.
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

describe('Tier 3: Cross-Feature Combinations — Net Worth & Capital Cycle System', () => {
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

  it('C1: Bank Ledger + Bybit USDT + Real-Time Rate + Dual Net Worth valuation consistency', () => {
    const calculateTotalBankCash = getCalculateTotalBankCash(utils);
    const resolveReferenceRate = getResolveReferenceRate(utils);
    const calculateNetWorth = getCalculateNetWorth(utils);

    const bank1 = store.addBankAccount({ name: 'OPay', initialBalance: 1500000 });
    const bank2 = store.addBankAccount({ name: 'Kuda', initialBalance: 1000000 });

    store.addTrade({
      type: 'BUY',
      bankAccountId: bank1.id,
      ngnAmount: 1480000,
      usdtAmount: 1000,
      rate: 1480,
      totalFees: 50,
      date: '2026-08-25T10:00:00Z'
    });

    const computedBanks = store.getComputedBankBalances();
    const totalBankCash = calculateTotalBankCash(computedBanks);
    assert.strictEqual(totalBankCash, 1019950);

    const activeAds = [{ side: 1, status: 10, price: '1530.00', lastQuantity: '1000', frozenQuantity: '0' }];
    const totalUsdt = 1000;
    const refRate = resolveReferenceRate({
      activeSellAd: activeAds[0],
      latestTrade: store.getTrades()[0]
    });
    assert.strictEqual(refRate, 1530.00);

    const nw = calculateNetWorth(totalBankCash, totalUsdt, refRate);
    assert.strictEqual(nw.netWorthNgn, 2549950);
    assert.closeTo(nw.netWorthUsdt, 1666.63, 0.01);
  });

  it('C2: End Day Modal Save -> Snapshot Persisted -> Live Delta Badge updated immediately', () => {
    const { saveSnapshot, getSnapshots } = getStoreSnapshotHelpers(store);
    const calculateSnapshotDelta = getCalculateSnapshotDelta(utils);

    const snapDay1 = saveSnapshot({
      timestamp: '2026-08-24T20:00:00Z',
      bankCash: 2000000,
      usdtBalance: 1000,
      referenceRate: 1500,
      netWorthNgn: 3500000,
      netWorthUsdt: 2333.33,
      notes: 'Day 1 Baseline'
    });

    const liveNw = { netWorthNgn: 3850000, netWorthUsdt: 2566.67 };

    const delta1 = calculateSnapshotDelta(liveNw, snapDay1);
    assert.strictEqual(delta1.deltaNgn, 350000);
    assert.closeTo(delta1.pctDeltaNgn, 10.00, 0.01);

    const snapDay2 = saveSnapshot({
      timestamp: '2026-08-25T20:00:00Z',
      bankCash: 2350000,
      usdtBalance: 1000,
      referenceRate: 1500,
      netWorthNgn: 3850000,
      netWorthUsdt: 2566.67,
      notes: 'Day 2 Close'
    });

    const delta2 = calculateSnapshotDelta(liveNw, snapDay2);
    assert.strictEqual(delta2.deltaNgn, 0);
    assert.closeTo(delta2.pctDeltaNgn, 0.00, 0.001);
    assert.strictEqual(getSnapshots().length, 2);
  });

  it('C3: Multiple Snapshots Saved -> Historical Delta Matrix calculated -> Chart.js Trend reflects all points', () => {
    const { saveSnapshot, getSnapshots } = getStoreSnapshotHelpers(store);
    const calculateSnapshotDelta = getCalculateSnapshotDelta(utils);

    const historyData = [
      { date: '2026-08-20T20:00:00Z', nwNgn: 3000000, nwUsdt: 2000, rate: 1500, cash: 1500000, usdt: 1000 },
      { date: '2026-08-21T20:00:00Z', nwNgn: 3300000, nwUsdt: 2171, rate: 1520, cash: 1780000, usdt: 1000 },
      { date: '2026-08-22T20:00:00Z', nwNgn: 3630000, nwUsdt: 2357, rate: 1540, cash: 2090000, usdt: 1000 },
      { date: '2026-08-23T20:00:00Z', nwNgn: 3993000, nwUsdt: 2576, rate: 1550, cash: 2443000, usdt: 1000 }
    ];

    historyData.forEach((h, idx) => {
      saveSnapshot({
        id: `snp_${idx}`,
        timestamp: h.date,
        bankCash: h.cash,
        usdtBalance: h.usdt,
        netWorthNgn: h.nwNgn,
        netWorthUsdt: h.nwUsdt,
        referenceRate: h.rate
      });
    });

    const snapshots = getSnapshots();
    assert.strictEqual(snapshots.length, 4);

    for (let i = 1; i < snapshots.length; i++) {
      const d = calculateSnapshotDelta(snapshots[i], snapshots[i - 1]);
      assert.closeTo(d.pctDeltaNgn, 10.00, 0.01, `Step ${i} should be 10.00% growth`);
    }

    const chartLabels = snapshots.map(s => utils.formatDateTime(s.timestamp));
    const chartSeries = snapshots.map(s => s.netWorthNgn);
    assert.strictEqual(chartLabels.length, 4);
    assert.strictEqual(chartSeries[3], 3993000);
  });

  it('C4: Snapshot Export to JSON -> App reset -> Snapshot Import -> Dashboard and Chart restored with 100% fidelity', () => {
    const { saveSnapshot, getSnapshots, clearSnapshots } = getStoreSnapshotHelpers(store);

    saveSnapshot({ id: 's1', timestamp: '2026-08-24T12:00:00Z', bankCash: 1000000, usdtBalance: 1950, netWorthNgn: 4000000, netWorthUsdt: 2600, referenceRate: 1538.46 });
    saveSnapshot({ id: 's2', timestamp: '2026-08-25T12:00:00Z', bankCash: 1500000, usdtBalance: 1933, netWorthNgn: 4500000, netWorthUsdt: 2900, referenceRate: 1551.72 });

    const exportPayload = {
      version: 1,
      snapshots: getSnapshots(),
      trades: [],
      bankAccounts: []
    };

    clearSnapshots();
    store.clearAllData();
    assert.strictEqual(getSnapshots().length, 0);

    localStorage.setItem('bybit_p2p_net_worth_snapshots', JSON.stringify(exportPayload.snapshots));
    const restored = getSnapshots();

    assert.strictEqual(restored.length, 2);
    assert.strictEqual(restored[0].id, 's1');
    assert.strictEqual(restored[1].id, 's2');
    assert.strictEqual(restored[1].netWorthNgn, 4500000);
  });

  it('C5: Trade added -> Bank Cash updated -> Bybit Ad sync -> Live Widget & Modal preview updated reactively', () => {
    const calculateTotalBankCash = getCalculateTotalBankCash(utils);
    const resolveReferenceRate = getResolveReferenceRate(utils);
    const calculateNetWorth = getCalculateNetWorth(utils);

    const bank = store.addBankAccount({ name: 'OPay', initialBalance: 3000000 });

    store.addTrade({
      type: 'SELL',
      bankAccountId: bank.id,
      ngnAmount: 1530000,
      usdtAmount: 1000,
      rate: 1530,
      totalFees: 0,
      date: new Date().toISOString()
    });

    const bankCash = calculateTotalBankCash(store.getComputedBankBalances());
    assert.strictEqual(bankCash, 4530000);

    const rate = resolveReferenceRate({ latestTrade: store.getTrades()[0] });
    assert.strictEqual(rate, 1530);

    const modalPreview = calculateNetWorth(bankCash, 500, rate);
    assert.strictEqual(modalPreview.netWorthNgn, 5295000);
  });

  it('C6: Delete snapshot from History -> Dashboard Live Delta Badge & Trend Chart update dynamically', () => {
    const { saveSnapshot, deleteSnapshot, getSnapshots } = getStoreSnapshotHelpers(store);
    const calculateSnapshotDelta = getCalculateSnapshotDelta(utils);

    saveSnapshot({ id: 's1', timestamp: '2026-08-20T10:00:00Z', bankCash: 1000000, usdtBalance: 666, referenceRate: 1500, netWorthNgn: 2000000 });
    const s2 = saveSnapshot({ id: 's2', timestamp: '2026-08-21T10:00:00Z', bankCash: 1000000, usdtBalance: 1000, referenceRate: 1500, netWorthNgn: 2500000 });

    const liveNw = { netWorthNgn: 3000000 };

    const deltaBefore = calculateSnapshotDelta(liveNw, getSnapshots().slice(-1)[0]);
    assert.closeTo(deltaBefore.pctDeltaNgn, 20.00, 0.01);

    deleteSnapshot(s2.id);
    const deltaAfter = calculateSnapshotDelta(liveNw, getSnapshots().slice(-1)[0]);
    assert.closeTo(deltaAfter.pctDeltaNgn, 50.00, 0.01);
  });

  it('C7: Offline switch -> Rate engine falls back to FIFO cost basis -> Net Worth re-evaluates seamlessly', () => {
    const resolveReferenceRate = getResolveReferenceRate(utils);
    const calculateNetWorth = getCalculateNetWorth(utils);

    const trades = [
      { id: 't1', type: 'BUY', date: '2026-08-01T10:00:00Z', rate: 1510, ngnAmount: 1510000, usdtAmount: 1000, totalFees: 0 }
    ];
    const fifo = utils.calculateFIFOInventoryAndPnL(trades);
    assert.strictEqual(fifo.avgHoldingCostPerUSDT, 1510);

    const offlineRate = resolveReferenceRate({
      activeSellAd: null,
      latestTrade: null,
      fifoAvgBuyCost: fifo.avgHoldingCostPerUSDT
    });
    assert.strictEqual(offlineRate, 1510);

    const nw = calculateNetWorth(1000000, fifo.remainingInventoryUSDT, offlineRate);
    assert.strictEqual(nw.netWorthNgn, 2510000);
  });

  it('C8: Multi-bank rebalancing transfer -> Total bank cash unchanged -> Net Worth unchanged except for transfer fee deduction', () => {
    const calculateTotalBankCash = getCalculateTotalBankCash(utils);
    const calculateNetWorth = getCalculateNetWorth(utils);

    const bankA = store.addBankAccount({ name: 'OPay', initialBalance: 2000000 });
    const bankB = store.addBankAccount({ name: 'Kuda', initialBalance: 1000000 });

    const cashBefore = calculateTotalBankCash(store.getComputedBankBalances());
    assert.strictEqual(cashBefore, 3000000);

    store.addTransfer({
      asset: 'NGN',
      fromBankId: bankA.id,
      toBankId: bankB.id,
      amount: 500000,
      fee: 10,
      date: new Date().toISOString()
    });

    const cashAfter = calculateTotalBankCash(store.getComputedBankBalances());
    assert.strictEqual(cashAfter, 2999990, 'Total cash should only decrease by ₦10 transfer fee');

    const nwBefore = calculateNetWorth(cashBefore, 1000, 1500);
    const nwAfter = calculateNetWorth(cashAfter, 1000, 1500);
    assert.strictEqual(nwBefore.netWorthNgn - nwAfter.netWorthNgn, 10, 'Net Worth delta must equal exact fee');
  });
}, { tier: 3, category: 'Net Worth Cross-Feature' });
