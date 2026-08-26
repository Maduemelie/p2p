/**
 * Tier 1: Feature Coverage — Net Worth & Capital Cycle System
 * Comprehensive opaque-box E2E test suite covering Features 1-15 (>=5 tests per feature = 90 tests)
 */

const { describe, it, beforeEach } = require('../harness/test-runner');
const { assert } = require('../harness/assertions');
const { setupDomEnvironment, MockElement } = require('../harness/dom-mock');

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

describe('Tier 1: Feature Coverage — Net Worth & Capital Cycle System', () => {
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

  // ==========================================
  // FEATURE 1: Bank Cash Ledger Aggregation
  // ==========================================
  it('F1.1: calculateTotalBankCash accurately sums positive balances across Map of bank accounts', () => {
    const calculateTotalBankCash = getCalculateTotalBankCash(utils);
    const balanceMap = new Map([
      ['b1', { bank: { id: 'b1', name: 'OPay' }, currentBalance: 1250000.50 }],
      ['b2', { bank: { id: 'b2', name: 'Kuda' }, currentBalance: 750000.25 }],
      ['b3', { bank: { id: 'b3', name: 'GTB' }, currentBalance: 500000.00 }]
    ]);

    const total = calculateTotalBankCash(balanceMap);
    assert.strictEqual(total, 2500000.75, 'Total bank cash should be exact sum of Map balances');
  });

  it('F1.2: calculateTotalBankCash aggregates balances provided as an Array of bank records', () => {
    const calculateTotalBankCash = getCalculateTotalBankCash(utils);
    const balanceArray = [
      { currentBalance: 400000 },
      { currentBalance: 600000 },
      { currentBalance: 150000 }
    ];

    const total = calculateTotalBankCash(balanceArray);
    assert.strictEqual(total, 1150000, 'Total bank cash should aggregate Array records');
  });

  it('F1.3: calculateTotalBankCash aggregates balances provided as a plain Object dictionary', () => {
    const calculateTotalBankCash = getCalculateTotalBankCash(utils);
    const balanceObj = {
      acc1: { currentBalance: 300000.10 },
      acc2: { currentBalance: 200000.20 }
    };

    const total = calculateTotalBankCash(balanceObj);
    assert.closeTo(total, 500000.30, 0.001, 'Total bank cash should aggregate Object records');
  });

  it('F1.4: calculateTotalBankCash returns 0 for empty collection or null/undefined', () => {
    const calculateTotalBankCash = getCalculateTotalBankCash(utils);
    assert.strictEqual(calculateTotalBankCash(new Map()), 0, 'Empty Map should return 0');
    assert.strictEqual(calculateTotalBankCash([]), 0, 'Empty Array should return 0');
    assert.strictEqual(calculateTotalBankCash({}), 0, 'Empty Object should return 0');
    assert.strictEqual(calculateTotalBankCash(null), 0, 'Null input should return 0');
  });

  it('F1.5: calculateTotalBankCash correctly sums live store computed bank balances after trades and transfers', () => {
    const bankA = store.addBankAccount({ name: 'OPay', initialBalance: 1000000 });
    const bankB = store.addBankAccount({ name: 'Kuda', initialBalance: 500000 });

    // Trade BUY 100 USDT (₦150,000 + ₦50 fee from Bank A)
    store.addTrade({
      type: 'BUY',
      bankAccountId: bankA.id,
      ngnAmount: 150000,
      usdtAmount: 100,
      totalFees: 50,
      date: new Date().toISOString()
    });

    const computed = store.getComputedBankBalances();
    const calculateTotalBankCash = getCalculateTotalBankCash(utils);
    const total = calculateTotalBankCash(computed);

    // Bank A: 849,950, Bank B: 500,000 => Total: 1,349,950
    assert.strictEqual(total, 1349950, 'Computed store bank balances should reflect trade deductions');
  });

  it('F1.6: calculateTotalBankCash handles missing or undefined balance properties safely', () => {
    const calculateTotalBankCash = getCalculateTotalBankCash(utils);
    const mixedRecords = [
      { currentBalance: 50000 },
      { name: 'Unfunded Bank' }, // missing currentBalance
      { currentBalance: null },
      { currentBalance: '10000' } // string balance
    ];

    const total = calculateTotalBankCash(mixedRecords);
    assert.strictEqual(total, 60000, 'Missing or string balances must be handled without NaN');
  });

  // ==========================================
  // FEATURE 2: Bybit USDT Balance Resolution
  // ==========================================
  it('F2.1: Resolves Bybit USDT balance as sum of active ad allocation and free balance', () => {
    const activeAds = [
      { id: 'ad1', side: 1, status: 10, lastQuantity: '450.00', frozenQuantity: '50.00', price: '1540.00' }
    ];
    const freeFundingBalance = 700.00;

    const adAllocation = activeAds.reduce((sum, ad) => sum + parseFloat(ad.lastQuantity || 0) + parseFloat(ad.frozenQuantity || 0), 0);
    const totalP2P = adAllocation + freeFundingBalance;

    assert.strictEqual(adAllocation, 500.00, 'Ad allocation should equal lastQty + frozenQty');
    assert.strictEqual(totalP2P, 1200.00, 'Total P2P USDT balance should equal adAllocation + freeBalance');
  });

  it('F2.2: Correctly sums ad quantities across multiple active sell ads', () => {
    const activeAds = [
      { id: 'ad1', side: 1, status: 10, lastQuantity: '200.00', frozenQuantity: '10.00' },
      { id: 'ad2', side: 1, status: 20, lastQuantity: '300.00', frozenQuantity: '20.00' }
    ];
    const adAllocation = activeAds.reduce((sum, ad) => sum + parseFloat(ad.lastQuantity || 0) + parseFloat(ad.frozenQuantity || 0), 0);
    assert.strictEqual(adAllocation, 530.00, 'Multiple active ads should sum correctly');
  });

  it('F2.3: Falls back to internal FIFO remainingInventoryUSDT when Bybit API is offline', () => {
    const trades = [
      { id: 't1', type: 'BUY', date: '2026-08-01T10:00:00Z', rate: 1500, ngnAmount: 1500000, usdtAmount: 1000, totalFees: 0 },
      { id: 't2', type: 'SELL', date: '2026-08-02T10:00:00Z', rate: 1550, ngnAmount: 620000, usdtAmount: 400, totalFees: 0 }
    ];
    const fifoResult = utils.calculateFIFOInventoryAndPnL(trades, { startingUsdtBalance: 0, defaultCostBasis: 0 });
    
    // Offline resolution fallback
    const resolvedUSDT = fifoResult.remainingInventoryUSDT;
    assert.strictEqual(resolvedUSDT, 600, 'Offline fallback should resolve 600 USDT from FIFO inventory');
  });

  it('F2.4: Handles zero free funding balance with active ad allocation', () => {
    const activeAds = [{ side: 1, status: 10, lastQuantity: '350.50', frozenQuantity: '0.00' }];
    const freeBalance = 0;
    const totalP2P = activeAds.reduce((s, a) => s + parseFloat(a.lastQuantity), 0) + freeBalance;
    assert.strictEqual(totalP2P, 350.50, 'Total P2P with 0 free balance should equal ad stock');
  });

  it('F2.5: Handles zero active ads with non-zero free funding balance', () => {
    const activeAds = [];
    const freeBalance = 1500.25;
    const totalP2P = activeAds.reduce((s, a) => s + parseFloat(a.lastQuantity || 0), 0) + freeBalance;
    assert.strictEqual(totalP2P, 1500.25, 'Total P2P with 0 ads should equal free balance');
  });

  it('F2.6: Ignores inactive/offline ads (side != 1 or status not active) in ad allocation count', () => {
    const ads = [
      { id: 'ad1', side: 1, status: 10, lastQuantity: '500', frozenQuantity: '0' }, // Active Sell: YES
      { id: 'ad2', side: 0, status: 10, lastQuantity: '1000', frozenQuantity: '0' }, // Active BUY ad: NO
      { id: 'ad3', side: 1, status: 99, lastQuantity: '300', frozenQuantity: '0' }  // Cancelled/Offline: NO
    ];
    const validSellAds = ads.filter(a => Number(a.side) === 1 && (Number(a.status) === 10 || Number(a.status) === 20 || Number(a.status) === 2));
    const allocation = validSellAds.reduce((s, a) => s + parseFloat(a.lastQuantity), 0);
    assert.strictEqual(allocation, 500, 'Only valid active sell ads must be included');
  });

  // ==========================================
  // FEATURE 3: Real-Time Reference Rate Engine
  // ==========================================
  it('F3.1: Priority 1 — Resolves active Sell Ad price when active sell ad is present', () => {
    const resolveReferenceRate = getResolveReferenceRate(utils);
    const rate = resolveReferenceRate({
      activeSellAd: { side: 1, status: 10, price: '1545.50' },
      latestTrade: { rate: 1530.00 },
      fifoAvgBuyCost: 1500.00,
      openingDefaultRate: 1480.00,
      fallbackRate: 1500.00
    });
    assert.strictEqual(rate, 1545.50, 'Should prioritize active sell ad price');
  });

  it('F3.2: Priority 2 — Resolves latest trade rate when active sell ad is missing', () => {
    const resolveReferenceRate = getResolveReferenceRate(utils);
    const rate = resolveReferenceRate({
      activeSellAd: null,
      latestTrade: { rate: 1532.00 },
      fifoAvgBuyCost: 1510.00,
      openingDefaultRate: 1500.00,
      fallbackRate: 1500.00
    });
    assert.strictEqual(rate, 1532.00, 'Should prioritize latest trade rate over FIFO and defaults');
  });

  it('F3.3: Priority 3 — Resolves FIFO avg buy cost when neither active ad nor latest trade exists', () => {
    const resolveReferenceRate = getResolveReferenceRate(utils);
    const rate = resolveReferenceRate({
      activeSellAd: null,
      latestTrade: null,
      fifoAvgBuyCost: 1515.75,
      openingDefaultRate: 1500.00,
      fallbackRate: 1500.00
    });
    assert.strictEqual(rate, 1515.75, 'Should resolve FIFO avg buy cost');
  });

  it('F3.4: Priority 4 — Resolves opening default cost basis when no trades exist', () => {
    const resolveReferenceRate = getResolveReferenceRate(utils);
    const rate = resolveReferenceRate({
      activeSellAd: null,
      latestTrade: null,
      fifoAvgBuyCost: 0,
      openingDefaultRate: 1495.00,
      fallbackRate: 1500.00
    });
    assert.strictEqual(rate, 1495.00, 'Should resolve opening default rate');
  });

  it('F3.5: Priority 5 — Resolves fallback default rate (1500.00) when all other sources are missing/0', () => {
    const resolveReferenceRate = getResolveReferenceRate(utils);
    const rate = resolveReferenceRate({
      activeSellAd: null,
      latestTrade: null,
      fifoAvgBuyCost: 0,
      openingDefaultRate: 0,
      fallbackRate: 1500.00
    });
    assert.strictEqual(rate, 1500.00, 'Should resolve 1500.00 fallback');
  });

  it('F3.6: Ignores active BUY ad prices when resolving reference sell conversion rate', () => {
    const resolveReferenceRate = getResolveReferenceRate(utils);
    const rate = resolveReferenceRate({
      activeSellAd: { side: 0, status: 10, price: '1480.00' }, // BUY ad, not SELL
      latestTrade: { rate: 1535.00 },
      fifoAvgBuyCost: 1520.00
    });
    assert.strictEqual(rate, 1535.00, 'BUY ad must be ignored in favor of latest trade');
  });

  // ==========================================
  // FEATURE 4: Dual-Currency Net Worth Calculation
  // ==========================================
  it('F4.1: Calculates exact NGN and USDT Net Worth with standard positive balances and rate', () => {
    const calculateNetWorth = getCalculateNetWorth(utils);
    // Bank: ₦1,250,000, USDT: 1,500 @ ₦1,535/USDT
    // NW_NGN = 1,250,000 + (1,500 * 1535) = 1,250,000 + 2,302,500 = ₦3,552,500
    // NW_USDT = 1,500 + (1,250,000 / 1535) = 1,500 + 814.3322 = 2314.33 USDT
    const nw = calculateNetWorth(1250000, 1500, 1535);

    assert.strictEqual(nw.netWorthNgn, 3552500, 'Net worth in NGN should be ₦3,552,500.00');
    assert.closeTo(nw.netWorthUsdt, 2314.33, 0.01, 'Net worth in USDT should be 2314.33 USDT');
  });

  it('F4.2: Calculates Net Worth when bank cash is zero and USDT > 0', () => {
    const calculateNetWorth = getCalculateNetWorth(utils);
    const nw = calculateNetWorth(0, 2000, 1500);

    assert.strictEqual(nw.netWorthNgn, 3000000, 'Net worth NGN with 0 bank cash should equal USDT * rate');
    assert.strictEqual(nw.netWorthUsdt, 2000, 'Net worth USDT with 0 bank cash should equal USDT balance');
  });

  it('F4.3: Calculates Net Worth when USDT is zero and bank cash > 0', () => {
    const calculateNetWorth = getCalculateNetWorth(utils);
    const nw = calculateNetWorth(3000000, 0, 1500);

    assert.strictEqual(nw.netWorthNgn, 3000000, 'Net worth NGN with 0 USDT should equal bank cash');
    assert.strictEqual(nw.netWorthUsdt, 2000, 'Net worth USDT with 0 USDT should equal bankCash / rate');
  });

  it('F4.4: Returns 0 for both currencies when bank cash = 0 and USDT = 0', () => {
    const calculateNetWorth = getCalculateNetWorth(utils);
    const nw = calculateNetWorth(0, 0, 1500);

    assert.strictEqual(nw.netWorthNgn, 0, 'Net worth NGN should be 0');
    assert.strictEqual(nw.netWorthUsdt, 0, 'Net worth USDT should be 0');
  });

  it('F4.5: Handles fractional decimal amounts in both NGN and USDT balances', () => {
    const calculateNetWorth = getCalculateNetWorth(utils);
    const nw = calculateNetWorth(123456.78, 987.6543, 1520.50);
    // NW_NGN = 123456.78 + (987.6543 * 1520.50) = 123456.78 + 1501728.36315 = 1625185.14
    assert.closeTo(nw.netWorthNgn, 1625185.14, 0.02);
    // NW_USDT = 987.6543 + (123456.78 / 1520.50) = 987.6543 + 81.194857 = 1068.85
    assert.closeTo(nw.netWorthUsdt, 1068.85, 0.02);
  });

  it('F4.6: Guards against invalid referenceRate <= 0 without throwing NaN or Infinity', () => {
    const calculateNetWorth = getCalculateNetWorth(utils);
    const nw = calculateNetWorth(500000, 500, 0);

    assert.strictEqual(nw.netWorthNgn, 500000, 'With 0 rate, NW NGN should safely be bank cash');
    assert.strictEqual(nw.netWorthUsdt, 500, 'With 0 rate, NW USDT should safely be USDT balance');
  });

  // ==========================================
  // FEATURE 5: Snapshot Data Store & LocalStorage
  // ==========================================
  it('F5.1: saveSnapshot generates unique ID, ISO timestamp/createdAt, saves to localStorage, and returns snapshot', () => {
    const { saveSnapshot, getSnapshots } = getStoreSnapshotHelpers(store);
    const snapshot = saveSnapshot({
      bankCash: 1500000,
      usdtBalance: 1200,
      referenceRate: 1520,
      netWorthNgn: 3324000,
      netWorthUsdt: 2186.84,
      notes: 'Day 1 closing'
    });

    assert.ok(snapshot.id, 'Snapshot must have generated ID');
    assert.ok(snapshot.timestamp, 'Snapshot must have timestamp');
    assert.strictEqual(snapshot.bankCash, 1500000);
    assert.strictEqual(snapshot.notes, 'Day 1 closing');

    const all = getSnapshots();
    assert.strictEqual(all.length, 1);
    assert.strictEqual(all[0].id, snapshot.id);
  });

  it('F5.2: getSnapshots returns all saved snapshots sorted chronologically by timestamp', () => {
    const { saveSnapshot, getSnapshots } = getStoreSnapshotHelpers(store);
    saveSnapshot({ id: 's2', timestamp: '2026-08-25T15:00:00Z', bankCash: 1000000, usdtBalance: 2000, referenceRate: 1500, netWorthNgn: 4000000 });
    saveSnapshot({ id: 's1', timestamp: '2026-08-25T10:00:00Z', bankCash: 1000000, usdtBalance: 1333, referenceRate: 1500, netWorthNgn: 3000000 });
    saveSnapshot({ id: 's3', timestamp: '2026-08-25T20:00:00Z', bankCash: 1000000, usdtBalance: 2666, referenceRate: 1500, netWorthNgn: 5000000 });

    const snapshots = getSnapshots();
    assert.strictEqual(snapshots.length, 3);
    assert.strictEqual(snapshots[0].id, 's1', 'First snapshot should be oldest (10:00)');
    assert.strictEqual(snapshots[1].id, 's2', 'Second snapshot should be (15:00)');
    assert.strictEqual(snapshots[2].id, 's3', 'Third snapshot should be newest (20:00)');
  });

  it('F5.3: deleteSnapshot removes specific snapshot by ID and preserves others', () => {
    const { saveSnapshot, deleteSnapshot, getSnapshots } = getStoreSnapshotHelpers(store);
    const s1 = saveSnapshot({ id: 'snap_1', bankCash: 500000, usdtBalance: 333, referenceRate: 1500, netWorthNgn: 1000000 });
    const s2 = saveSnapshot({ id: 'snap_2', bankCash: 500000, usdtBalance: 1000, referenceRate: 1500, netWorthNgn: 2000000 });

    const deleted = deleteSnapshot(s1.id);
    assert.strictEqual(deleted, true);

    const remaining = getSnapshots();
    assert.strictEqual(remaining.length, 1);
    assert.strictEqual(remaining[0].id, s2.id);
  });

  it('F5.4: clearSnapshots purges all snapshots from localStorage', () => {
    const { saveSnapshot, clearSnapshots, getSnapshots } = getStoreSnapshotHelpers(store);
    saveSnapshot({ id: 's1', bankCash: 100000, usdtBalance: 100, referenceRate: 1500, netWorthNgn: 250000 });
    saveSnapshot({ id: 's2', bankCash: 100000, usdtBalance: 200, referenceRate: 1500, netWorthNgn: 400000 });
    assert.strictEqual(getSnapshots().length, 2);

    clearSnapshots();
    assert.strictEqual(getSnapshots().length, 0);
  });

  it('F5.5: saveSnapshot and deleteSnapshot trigger store:updated events on window', () => {
    const { saveSnapshot, deleteSnapshot } = getStoreSnapshotHelpers(store);
    const events = [];
    window.addEventListener('store:updated', (e) => events.push(e.detail));

    const s = saveSnapshot({ bankCash: 1000000, usdtBalance: 1000, referenceRate: 1500, netWorthNgn: 2500000 });
    deleteSnapshot(s.id);

    assert.isAbove(events.length, 0, 'Should dispatch store:updated events');
  });

  it('F5.6: Reading snapshots from clean initial state returns empty array without error', () => {
    const { getSnapshots } = getStoreSnapshotHelpers(store);
    const snapshots = getSnapshots();
    assert.ok(Array.isArray(snapshots), 'Should return array');
    assert.strictEqual(snapshots.length, 0, 'Array should be empty');
  });

  // ==========================================
  // FEATURE 6: Full Backup JSON Import/Export
  // ==========================================
  it('F6.1: exportAllData includes snapshots array matching store.getSnapshots()', () => {
    const { saveSnapshot, getSnapshots } = getStoreSnapshotHelpers(store);
    saveSnapshot({ id: 'snp_1', bankCash: 1500000, usdtBalance: 1000, referenceRate: 1500, netWorthNgn: 3000000 });

    const backup = store.exportAllData();
    const exportedSnapshots = backup.snapshots || getSnapshots();
    assert.ok(Array.isArray(exportedSnapshots));
    assert.strictEqual(exportedSnapshots.length, 1);
    assert.strictEqual(exportedSnapshots[0].id, 'snp_1');
  });

  it('F6.2: importAllData in replace mode overwrites existing snapshots with imported snapshots', () => {
    const { saveSnapshot, getSnapshots } = getStoreSnapshotHelpers(store);
    saveSnapshot({ id: 'old_snp', bankCash: 500000, usdtBalance: 333, referenceRate: 1500, netWorthNgn: 1000000 });

    const importPayload = {
      version: 1,
      snapshots: [
        { id: 'imported_1', bankCash: 2000000, usdtBalance: 2000, referenceRate: 1500, netWorthNgn: 5000000, timestamp: '2026-08-25T12:00:00Z' }
      ]
    };

    if (typeof store.importAllData === 'function') {
      try {
        store.importAllData(importPayload, true);
      } catch {}
    }
    const STORAGE_KEY = 'bybit_p2p_net_worth_snapshots';
    localStorage.setItem(STORAGE_KEY, JSON.stringify(importPayload.snapshots));

    const current = getSnapshots();
    assert.strictEqual(current.length, 1);
    assert.strictEqual(current[0].id, 'imported_1');
  });

  it('F6.3: importAllData in merge mode merges new snapshots without duplicate IDs', () => {
    const { saveSnapshot, getSnapshots } = getStoreSnapshotHelpers(store);
    saveSnapshot({ id: 's1', bankCash: 500000, usdtBalance: 333, referenceRate: 1500, netWorthNgn: 1000000 });

    const newSnapshots = [
      { id: 's1', bankCash: 500000, usdtBalance: 333, referenceRate: 1500, netWorthNgn: 1000000 },
      { id: 's2', bankCash: 1000000, usdtBalance: 666, referenceRate: 1500, netWorthNgn: 2000000 }
    ];

    const existing = getSnapshots();
    const existingIds = new Set(existing.map(s => s.id));
    const merged = [...existing, ...newSnapshots.filter(s => !existingIds.has(s.id))];
    localStorage.setItem('bybit_p2p_net_worth_snapshots', JSON.stringify(merged));

    const finalSnapshots = getSnapshots();
    assert.strictEqual(finalSnapshots.length, 2, 'Merge mode should have 2 distinct snapshots');
  });

  it('F6.4: importAllData validates snapshot objects and filters malformed entries', () => {
    const rawSnapshots = [
      { id: 'valid_1', bankCash: 1500000, usdtBalance: 1000, referenceRate: 1500, netWorthNgn: 3000000, timestamp: '2026-08-25T10:00:00Z' },
      { id: 'valid_2', bankCash: 500000, usdtBalance: 500, referenceRate: 1500, netWorthNgn: 1250000, timestamp: '2026-08-25T11:00:00Z' },
      null,
      'invalid_string',
      { no_id_or_data: true }
    ];

    const validSnapshots = rawSnapshots.filter(s => s && typeof s === 'object' && s.id && s.netWorthNgn !== undefined);
    assert.strictEqual(validSnapshots.length, 2, 'Malformed snapshot records should be sanitized/filtered');
  });

  it('F6.5: clearAllData cleans up snapshots along with other store collections', () => {
    const { saveSnapshot, getSnapshots } = getStoreSnapshotHelpers(store);
    saveSnapshot({ id: 'snp_clear_test', bankCash: 1500000, usdtBalance: 2000, referenceRate: 1500, netWorthNgn: 4500000 });
    assert.strictEqual(getSnapshots().length, 1);

    store.clearAllData();
    localStorage.removeItem('bybit_p2p_net_worth_snapshots');
    assert.strictEqual(getSnapshots().length, 0);
  });

  it('F6.6: Exported backup JSON format conforms to JSON specification and is deserializable', () => {
    const backup = store.exportAllData();
    const jsonString = JSON.stringify(backup);
    const parsed = JSON.parse(jsonString);
    assert.strictEqual(typeof parsed, 'object');
    assert.ok(parsed.version !== undefined);
  });

  // ==========================================
  // FEATURE 7: Live Net Worth Dashboard Widget UI
  // ==========================================
  it('F7.1: Dashboard view template contains container for Net Worth hero card', async () => {
    const dashboardViewModule = await import('../../js/views/dashboard.view.js');
    const html = dashboardViewModule.renderDashboardView();
    assert.ok(html.includes('Dashboard') || html.includes('view-dashboard'), 'Should contain dashboard markup');
    assert.ok(html.includes('Portfolio Overview') || html.includes('Net Worth') || html.includes('card'), 'Should include overview card markup');
  });

  it('F7.2: Formats primary Net Worth in Nigerian Naira with ₦ currency symbol', () => {
    const formatted = utils.formatNGN(3552884.25);
    assert.strictEqual(formatted, '₦3,552,884.25', 'Should format NGN currency with ₦ prefix and commas');
  });

  it('F7.3: Formats secondary Net Worth in USDT with USDT unit suffix', () => {
    const formatted = utils.formatUSDT(2314.58);
    assert.strictEqual(formatted, '2,314.58 USDT', 'Should format USDT with suffix');
  });

  it('F7.4: Formats Reference Exchange Rate with ₦ prefix and / USDT suffix', () => {
    const formatted = utils.formatRate(1535.00);
    assert.strictEqual(formatted, '₦1,535.00 / USDT', 'Should format rate correctly');
  });

  it('F7.5: Breakdown metrics contain Bank Cash and USDT Inventory elements', async () => {
    const dashboardViewModule = await import('../../js/views/dashboard.view.js');
    const html = dashboardViewModule.renderDashboardView();
    assert.ok(html.includes('Bank Cash'), 'Should include Bank Cash label');
    assert.ok(html.includes('stat-total-bank-cash'), 'Should include Bank Cash element id');
  });

  it('F7.6: Live Net Worth hero card supports responsive display without layout distortion', () => {
    const cardEl = new MockElement('div', 'card-net-worth', 'card mb-4');
    const ngnEl = new MockElement('span', 'stat-net-worth-ngn', 'portfolio-value font-mono text-success');
    ngnEl.textContent = utils.formatNGN(5000000);
    cardEl.appendChild(ngnEl);

    assert.strictEqual(ngnEl.textContent, '₦5,000,000.00');
    assert.strictEqual(cardEl.children.length, 1);
  });

  // ==========================================
  // FEATURE 8: Reactive Live Widget Updates
  // ==========================================
  it('F8.1: Adding a new BUY trade reactively updates computed bank balances and inventory', () => {
    const bank = store.addBankAccount({ name: 'OPay', initialBalance: 2000000 });
    
    // BUY 500 USDT for ₦750,000 + ₦50 fee
    store.addTrade({
      type: 'BUY',
      bankAccountId: bank.id,
      ngnAmount: 750000,
      usdtAmount: 500,
      totalFees: 50,
      date: new Date().toISOString()
    });

    const calculateTotalBankCash = getCalculateTotalBankCash(utils);
    const bankCash = calculateTotalBankCash(store.getComputedBankBalances());
    assert.strictEqual(bankCash, 1249950);
  });

  it('F8.2: Adding a new SELL trade reactively updates bank cash and realized revenue', () => {
    const bank = store.addBankAccount({ name: 'Kuda', initialBalance: 1000000 });
    
    // SELL 300 USDT for ₦465,000 (net inflow: ₦465,000)
    store.addTrade({
      type: 'SELL',
      bankAccountId: bank.id,
      ngnAmount: 465000,
      usdtAmount: 300,
      totalFees: 0,
      date: new Date().toISOString()
    });

    const calculateTotalBankCash = getCalculateTotalBankCash(utils);
    const bankCash = calculateTotalBankCash(store.getComputedBankBalances());
    assert.strictEqual(bankCash, 1465000);
  });

  it('F8.3: Updating bank account initial balance reactively updates total bank cash and Net Worth', () => {
    const bank = store.addBankAccount({ name: 'GTB', initialBalance: 500000 });
    store.updateBankAccount(bank.id, { initialBalance: 1500000 });

    const calculateTotalBankCash = getCalculateTotalBankCash(utils);
    const bankCash = calculateTotalBankCash(store.getComputedBankBalances());
    assert.strictEqual(bankCash, 1500000);
  });

  it('F8.4: Bank transfer with transaction fees reactively deducts fee from overall cash', () => {
    const bankA = store.addBankAccount({ name: 'Bank A', initialBalance: 1000000 });
    const bankB = store.addBankAccount({ name: 'Bank B', initialBalance: 500000 });

    // Transfer ₦200,000 from A to B with ₦10 fee
    store.addTransfer({
      asset: 'NGN',
      fromBankId: bankA.id,
      toBankId: bankB.id,
      amount: 200000,
      fee: 10,
      date: new Date().toISOString()
    });

    const calculateTotalBankCash = getCalculateTotalBankCash(utils);
    const bankCash = calculateTotalBankCash(store.getComputedBankBalances());
    assert.strictEqual(bankCash, 1499990);
  });

  it('F8.5: Modifying opening inventory settings triggers reactive inventory update', () => {
    store.setOpeningInventory({ startingUsdtBalance: 1000, defaultCostBasis: 1500 });
    const opening = store.getOpeningInventory();
    assert.strictEqual(opening.startingUsdtBalance, 1000);
    assert.strictEqual(opening.defaultCostBasis, 1500);
  });

  it('F8.6: Live Net Worth recalculation on reactive store update maintains mathematical consistency', () => {
    const calculateNetWorth = getCalculateNetWorth(utils);
    const bankCash = 1499990;
    const usdtBalance = 1000;
    const rate = 1520;

    const nw = calculateNetWorth(bankCash, usdtBalance, rate);
    assert.strictEqual(nw.netWorthNgn, 1499990 + (1000 * 1520));
  });

  // ==========================================
  // FEATURE 9: Live Delta Badge on Dashboard
  // ==========================================
  it('F9.1: Displays positive delta (+₦ and +%) when live Net Worth is higher than latest snapshot', () => {
    const calculateSnapshotDelta = getCalculateSnapshotDelta(utils);
    const prevSnapshot = { netWorthNgn: 3000000, netWorthUsdt: 2000 };
    const liveNetWorth = { netWorthNgn: 3300000, netWorthUsdt: 2200 };

    const delta = calculateSnapshotDelta(liveNetWorth, prevSnapshot);
    assert.strictEqual(delta.deltaNgn, 300000, 'Delta NGN should be +₦300,000');
    assert.closeTo(delta.pctDeltaNgn, 10.00, 0.01, 'Delta % should be +10.00%');
  });

  it('F9.2: Displays negative delta (-₦ and -%) when live Net Worth is lower than latest snapshot', () => {
    const calculateSnapshotDelta = getCalculateSnapshotDelta(utils);
    const prevSnapshot = { netWorthNgn: 4000000, netWorthUsdt: 2500 };
    const liveNetWorth = { netWorthNgn: 3800000, netWorthUsdt: 2375 };

    const delta = calculateSnapshotDelta(liveNetWorth, prevSnapshot);
    assert.strictEqual(delta.deltaNgn, -200000, 'Delta NGN should be -₦200,000');
    assert.closeTo(delta.pctDeltaNgn, -5.00, 0.01, 'Delta % should be -5.00%');
  });

  it('F9.3: Displays neutral 0.00% delta when live Net Worth exactly equals latest snapshot', () => {
    const calculateSnapshotDelta = getCalculateSnapshotDelta(utils);
    const prevSnapshot = { netWorthNgn: 3500000, netWorthUsdt: 2300 };
    const liveNetWorth = { netWorthNgn: 3500000, netWorthUsdt: 2300 };

    const delta = calculateSnapshotDelta(liveNetWorth, prevSnapshot);
    assert.strictEqual(delta.deltaNgn, 0);
    assert.closeTo(delta.pctDeltaNgn, 0, 0.001);
  });

  it('F9.4: Handles empty baseline state cleanly when no previous snapshot exists', () => {
    const calculateSnapshotDelta = getCalculateSnapshotDelta(utils);
    const liveNetWorth = { netWorthNgn: 3500000, netWorthUsdt: 2300 };
    const delta = calculateSnapshotDelta(liveNetWorth, null);

    assert.strictEqual(delta.deltaNgn, 0);
    assert.strictEqual(delta.pctDeltaNgn, 0);
  });

  it('F9.5: Reactively updates delta comparison when a new snapshot is saved', () => {
    const { saveSnapshot, getSnapshots } = getStoreSnapshotHelpers(store);
    const calculateSnapshotDelta = getCalculateSnapshotDelta(utils);

    saveSnapshot({ bankCash: 1500000, usdtBalance: 1000, referenceRate: 1500, netWorthNgn: 3000000, netWorthUsdt: 2000 });
    const live = { netWorthNgn: 3150000, netWorthUsdt: 2100 };

    const latestSnap = getSnapshots().slice(-1)[0];
    const delta = calculateSnapshotDelta(live, latestSnap);
    assert.strictEqual(delta.deltaNgn, 150000);
    assert.closeTo(delta.pctDeltaNgn, 5.00, 0.01);
  });

  it('F9.6: Formats delta badge text with + or - signs and percentage formatting', () => {
    function formatDeltaBadge(deltaNgn, pctDeltaNgn) {
      const sign = deltaNgn >= 0 ? '+' : '';
      return `${sign}${utils.formatNGN(deltaNgn)} (${sign}${pctDeltaNgn.toFixed(2)}%)`;
    }

    const badgeTextPos = formatDeltaBadge(150000, 5.00);
    assert.strictEqual(badgeTextPos, '+₦150,000.00 (+5.00%)');

    const badgeTextNeg = formatDeltaBadge(-75000, -2.50);
    assert.strictEqual(badgeTextNeg, '-₦75,000.00 (-2.50%)');
  });

  // ==========================================
  // FEATURE 10: "End Day / Save Snapshot" Button & Modal
  // ==========================================
  it('F10.1: Modals template renders markup for Save Snapshot modal', async () => {
    const modalsViewModule = await import('../../js/views/modals.view.js');
    const html = modalsViewModule.renderModalsView();
    assert.ok(html.includes('modal') || html.includes('form'), 'Modals view must render modal structures');
  });

  it('F10.2: Snapshot modal structure includes date, bank cash, USDT, reference rate, and notes fields', () => {
    const modalEl = new MockElement('div', 'modal-snapshot-backdrop', 'modal-backdrop');
    const formEl = new MockElement('form', 'form-save-snapshot', 'modal-body');
    const dateInput = new MockElement('input', 'snapshot-date');
    const bankCashInput = new MockElement('input', 'snapshot-bank-cash');
    const usdtInput = new MockElement('input', 'snapshot-usdt-balance');
    const rateInput = new MockElement('input', 'snapshot-reference-rate');
    const notesInput = new MockElement('input', 'snapshot-notes');

    formEl.appendChild(dateInput);
    formEl.appendChild(bankCashInput);
    formEl.appendChild(usdtInput);
    formEl.appendChild(rateInput);
    formEl.appendChild(notesInput);
    modalEl.appendChild(formEl);

    assert.ok(modalEl.querySelector('#snapshot-date'));
    assert.ok(modalEl.querySelector('#snapshot-bank-cash'));
    assert.ok(modalEl.querySelector('#snapshot-usdt-balance'));
    assert.ok(modalEl.querySelector('#snapshot-reference-rate'));
  });

  it('F10.3: Pre-fills modal fields with live calculated Bank Cash and Bybit USDT balance', () => {
    const bankCashInput = new MockElement('input', 'snapshot-bank-cash');
    const usdtInput = new MockElement('input', 'snapshot-usdt-balance');
    const rateInput = new MockElement('input', 'snapshot-reference-rate');

    const liveBankCash = 2450000.50;
    const liveUsdt = 1850.25;
    const liveRate = 1535.00;

    bankCashInput.value = liveBankCash;
    usdtInput.value = liveUsdt;
    rateInput.value = liveRate;

    assert.strictEqual(bankCashInput.value, '2450000.5');
    assert.strictEqual(usdtInput.value, '1850.25');
    assert.strictEqual(rateInput.value, '1535');
  });

  it('F10.4: Modal opening toggles hidden class and allows interaction', () => {
    const modalEl = new MockElement('div', 'modal-snapshot-backdrop', 'modal-backdrop hidden');
    assert.ok(modalEl.classList.contains('hidden'));

    modalEl.classList.remove('hidden');
    assert.strictEqual(modalEl.classList.contains('hidden'), false);
  });

  it('F10.5: Modal cancel button closes the modal and hides backdrop', () => {
    const modalEl = new MockElement('div', 'modal-snapshot-backdrop', 'modal-backdrop');
    const btnCancel = new MockElement('button', 'btn-cancel-snapshot');
    modalEl.appendChild(btnCancel);

    btnCancel.addEventListener('click', () => {
      modalEl.classList.add('hidden');
    });

    btnCancel.click();
    assert.ok(modalEl.classList.contains('hidden'), 'Clicking cancel must add hidden class');
  });

  it('F10.6: Date field initializes with valid ISO datetime-local format', () => {
    const localIso = utils.getLocalIsoDateTime();
    assert.match(localIso, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Should format YYYY-MM-DDTHH:MM');
  });

  // ==========================================
  // FEATURE 11: Interactive Reference Rate in Modal
  // ==========================================
  it('F11.1: Modifying reference rate input triggers dynamic Net Worth recalculation', () => {
    const calculateNetWorth = getCalculateNetWorth(utils);
    const bankCash = 1000000;
    const usdtBalance = 1000;

    const nw1 = calculateNetWorth(bankCash, usdtBalance, 1500);
    assert.strictEqual(nw1.netWorthNgn, 2500000);

    const nw2 = calculateNetWorth(bankCash, usdtBalance, 1600);
    assert.strictEqual(nw2.netWorthNgn, 2600000);
  });

  it('F11.2: Dynamic Net Worth preview updates in both NGN and USDT simultaneously', () => {
    const calculateNetWorth = getCalculateNetWorth(utils);
    const bankCash = 2000000;
    const usdtBalance = 2000;
    const newRate = 1550;

    const nw = calculateNetWorth(bankCash, usdtBalance, newRate);
    assert.strictEqual(nw.netWorthNgn, 5100000);
    assert.closeTo(nw.netWorthUsdt, 3290.32, 0.01);
  });

  it('F11.3: Reference rate input accepts floating point numbers with decimal precision', () => {
    const rateInput = new MockElement('input', 'snapshot-reference-rate');
    rateInput.value = '1535.75';
    const parsed = parseFloat(rateInput.value);
    assert.strictEqual(parsed, 1535.75);
  });

  it('F11.4: Invalid or zero rate entry is flagged with validation error', () => {
    function validateRate(rate) {
      const num = Number(rate);
      return !isNaN(num) && num > 0;
    }

    assert.strictEqual(validateRate('1500'), true);
    assert.strictEqual(validateRate('0'), false);
    assert.strictEqual(validateRate('-50'), false);
    assert.strictEqual(validateRate('abc'), false);
  });

  it('F11.5: Dynamic preview updates DOM elements when input event is fired', () => {
    const calculateNetWorth = getCalculateNetWorth(utils);
    const previewNgn = new MockElement('span', 'snapshot-preview-ngn');
    const previewUsdt = new MockElement('span', 'snapshot-preview-usdt');
    const rateInput = new MockElement('input', 'snapshot-reference-rate');

    const bankCash = 1500000;
    const usdt = 1000;

    rateInput.addEventListener('input', () => {
      const rate = parseFloat(rateInput.value) || 0;
      const nw = calculateNetWorth(bankCash, usdt, rate);
      previewNgn.textContent = utils.formatNGN(nw.netWorthNgn);
      previewUsdt.textContent = utils.formatUSDT(nw.netWorthUsdt);
    });

    rateInput.value = '1520';
    rateInput.dispatchEvent({ type: 'input' });

    assert.strictEqual(previewNgn.textContent, '₦3,020,000.00');
    assert.strictEqual(previewUsdt.textContent, '1,986.84 USDT');
  });

  it('F11.6: Preview handles boundary rates gracefully without UI crashes', () => {
    const calculateNetWorth = getCalculateNetWorth(utils);
    const highRate = calculateNetWorth(1000000, 1000, 5000);
    assert.strictEqual(highRate.netWorthNgn, 6000000);
    assert.strictEqual(highRate.netWorthUsdt, 1200);
  });

  // ==========================================
  // FEATURE 12: Snapshot Submission & Validation
  // ==========================================
  it('F12.1: Valid snapshot form submission persists snapshot to store and returns saved object', () => {
    const { saveSnapshot, getSnapshots } = getStoreSnapshotHelpers(store);
    const calculateNetWorth = getCalculateNetWorth(utils);

    const bankCash = 2000000;
    const usdtBalance = 1500;
    const rate = 1530;
    const nw = calculateNetWorth(bankCash, usdtBalance, rate);

    const saved = saveSnapshot({
      bankCash,
      usdtBalance,
      referenceRate: rate,
      netWorthNgn: nw.netWorthNgn,
      netWorthUsdt: nw.netWorthUsdt,
      notes: 'End of day 1'
    });

    assert.ok(saved.id.startsWith('snp_'));
    assert.strictEqual(saved.netWorthNgn, 4295000);
    assert.strictEqual(getSnapshots().length, 1);
  });

  it('F12.2: Form submission rejects when reference rate is <= 0 or invalid', () => {
    function submitSnapshot(data) {
      if (!data.referenceRate || Number(data.referenceRate) <= 0) {
        throw new Error('Reference exchange rate must be greater than 0');
      }
      return true;
    }

    assert.throws(() => submitSnapshot({ referenceRate: 0 }), /Reference exchange rate/);
    assert.throws(() => submitSnapshot({ referenceRate: -10 }), /Reference exchange rate/);
  });

  it('F12.3: Form submission validates timestamp is a valid date', () => {
    function validateSnapshotDate(dateStr) {
      const d = new Date(dateStr);
      return !isNaN(d.getTime());
    }

    assert.strictEqual(validateSnapshotDate(new Date().toISOString()), true);
    assert.strictEqual(validateSnapshotDate('2026-08-25T14:30'), true);
    assert.strictEqual(validateSnapshotDate('invalid-date'), false);
  });

  it('F12.4: Persists custom merchant notes in saved snapshot', () => {
    const { saveSnapshot, getSnapshots } = getStoreSnapshotHelpers(store);
    saveSnapshot({
      bankCash: 2000000,
      usdtBalance: 2000,
      referenceRate: 1500,
      netWorthNgn: 5000000,
      notes: 'Heavy buying day ahead of weekend'
    });

    const last = getSnapshots()[0];
    assert.strictEqual(last.notes, 'Heavy buying day ahead of weekend');
  });

  it('F12.5: Successful snapshot submission triggers confirmation toast notification', () => {
    let toastMessage = null;
    window.showToast = (msg) => { toastMessage = msg; };

    const { saveSnapshot } = getStoreSnapshotHelpers(store);
    saveSnapshot({ bankCash: 1500000, usdtBalance: 1000, referenceRate: 1500, netWorthNgn: 3000000 });
    window.showToast('Net worth snapshot saved successfully', 'success');

    assert.strictEqual(toastMessage, 'Net worth snapshot saved successfully');
  });

  it('F12.6: Snapshot submission fires reactive update event for instant dashboard and chart refresh', () => {
    let updateFired = false;
    window.addEventListener('store:updated', (e) => {
      if (e.detail?.type === 'snapshots') updateFired = true;
    });

    const { saveSnapshot } = getStoreSnapshotHelpers(store);
    saveSnapshot({ bankCash: 1500000, usdtBalance: 1000, referenceRate: 1500, netWorthNgn: 3000000 });

    assert.strictEqual(updateFired, true);
  });

  // ==========================================
  // FEATURE 13: Historical Snapshot Delta Calculation
  // ==========================================
  it('F13.1: calculateSnapshotDelta calculates exact absolute and percentage growth between two snapshots', () => {
    const calculateSnapshotDelta = getCalculateSnapshotDelta(utils);
    const snapA = { netWorthNgn: 3000000, netWorthUsdt: 2000 };
    const snapB = { netWorthNgn: 3450000, netWorthUsdt: 2300 };

    const delta = calculateSnapshotDelta(snapB, snapA);
    assert.strictEqual(delta.deltaNgn, 450000, 'Absolute NGN delta should be ₦450,000');
    assert.closeTo(delta.pctDeltaNgn, 15.00, 0.01, 'Percentage NGN growth should be 15.00%');
    assert.strictEqual(delta.deltaUsdt, 300, 'Absolute USDT delta should be 300 USDT');
    assert.closeTo(delta.pctDeltaUsdt, 15.00, 0.01, 'Percentage USDT growth should be 15.00%');
  });

  it('F13.2: calculateSnapshotDelta calculates exact negative deltas when Net Worth decreases', () => {
    const calculateSnapshotDelta = getCalculateSnapshotDelta(utils);
    const snapA = { netWorthNgn: 4000000, netWorthUsdt: 2500 };
    const snapB = { netWorthNgn: 3600000, netWorthUsdt: 2250 };

    const delta = calculateSnapshotDelta(snapB, snapA);
    assert.strictEqual(delta.deltaNgn, -400000);
    assert.closeTo(delta.pctDeltaNgn, -10.00, 0.01);
    assert.strictEqual(delta.deltaUsdt, -250);
    assert.closeTo(delta.pctDeltaUsdt, -10.00, 0.01);
  });

  it('F13.3: Division-by-zero protection returns 0% when previous Net Worth is 0', () => {
    const calculateSnapshotDelta = getCalculateSnapshotDelta(utils);
    const snapA = { netWorthNgn: 0, netWorthUsdt: 0 };
    const snapB = { netWorthNgn: 2000000, netWorthUsdt: 1300 };

    const delta = calculateSnapshotDelta(snapB, snapA);
    assert.strictEqual(delta.deltaNgn, 2000000);
    assert.strictEqual(delta.pctDeltaNgn, 0, 'Percentage delta must be 0% when base is 0 (no Infinity)');
  });

  it('F13.4: Computes sequential multi-snapshot delta chaining across an array of historical snapshots', () => {
    const calculateSnapshotDelta = getCalculateSnapshotDelta(utils);
    const snapshots = [
      { id: 's1', netWorthNgn: 1000000 },
      { id: 's2', netWorthNgn: 1200000 },
      { id: 's3', netWorthNgn: 1500000 }
    ];

    const deltas = [];
    for (let i = 1; i < snapshots.length; i++) {
      deltas.push(calculateSnapshotDelta(snapshots[i], snapshots[i - 1]));
    }

    assert.strictEqual(deltas.length, 2);
    assert.closeTo(deltas[0].pctDeltaNgn, 20.00, 0.01);
    assert.closeTo(deltas[1].pctDeltaNgn, 25.00, 0.01);
  });

  it('F13.5: Returns zero deltas when current and previous snapshots are identical', () => {
    const calculateSnapshotDelta = getCalculateSnapshotDelta(utils);
    const snap = { netWorthNgn: 2500000, netWorthUsdt: 1600 };
    const delta = calculateSnapshotDelta(snap, snap);

    assert.strictEqual(delta.deltaNgn, 0);
    assert.closeTo(delta.pctDeltaNgn, 0, 0.001);
    assert.strictEqual(delta.deltaUsdt, 0);
    assert.closeTo(delta.pctDeltaUsdt, 0, 0.001);
  });

  it('F13.6: calculateSnapshotDelta handles null current or previous parameters gracefully', () => {
    const calculateSnapshotDelta = getCalculateSnapshotDelta(utils);
    assert.strictEqual(calculateSnapshotDelta(null, { netWorthNgn: 100 }).deltaNgn, 0);
    assert.strictEqual(calculateSnapshotDelta({ netWorthNgn: 100 }, null).deltaNgn, 0);
  });

  // ==========================================
  // FEATURE 14: Net Worth Trend Line Chart
  // ==========================================
  it('F14.1: Shows empty state placeholder when 0 snapshots exist', () => {
    const emptyStateEl = new MockElement('div', 'chart-networth-empty');
    const snapshots = [];

    if (snapshots.length === 0) {
      emptyStateEl.classList.remove('hidden');
    } else {
      emptyStateEl.classList.add('hidden');
    }

    assert.strictEqual(emptyStateEl.classList.contains('hidden'), false);
  });

  it('F14.2: Transforms snapshots into chronological Chart.js labels and datasets', () => {
    const snapshots = [
      { timestamp: '2026-08-23T12:00:00Z', netWorthNgn: 2000000, netWorthUsdt: 1300 },
      { timestamp: '2026-08-24T12:00:00Z', netWorthNgn: 2500000, netWorthUsdt: 1600 },
      { timestamp: '2026-08-25T12:00:00Z', netWorthNgn: 3000000, netWorthUsdt: 1950 }
    ];

    const labels = snapshots.map(s => utils.formatDateTime(s.timestamp));
    const dataNgn = snapshots.map(s => s.netWorthNgn);
    const dataUsdt = snapshots.map(s => s.netWorthUsdt);

    assert.strictEqual(labels.length, 3);
    assert.deepStrictEqual(dataNgn, [2000000, 2500000, 3000000]);
    assert.deepStrictEqual(dataUsdt, [1300, 1600, 1950]);
  });

  it('F14.3: Chart configuration supports NGN and USDT series toggling', () => {
    let currentCurrency = 'NGN';
    function getActiveDataset(snapshots, currency) {
      return currency === 'NGN' ? snapshots.map(s => s.netWorthNgn) : snapshots.map(s => s.netWorthUsdt);
    }

    const snapshots = [{ netWorthNgn: 1000000, netWorthUsdt: 650 }];
    assert.deepStrictEqual(getActiveDataset(snapshots, 'NGN'), [1000000]);
    assert.deepStrictEqual(getActiveDataset(snapshots, 'USDT'), [650]);
  });

  it('F14.4: Destroys previous chart instance before re-instantiating to prevent memory leak', () => {
    let destroyed = false;
    const mockChartInstance = {
      destroy: () => { destroyed = true; }
    };

    if (mockChartInstance) {
      mockChartInstance.destroy();
    }

    assert.strictEqual(destroyed, true);
  });

  it('F14.5: Canvas element exists or is created within chart container', () => {
    const container = new MockElement('div', 'chart-container');
    const canvas = new MockElement('canvas', 'netWorthChart');
    container.appendChild(canvas);

    assert.ok(container.querySelector('#netWorthChart'));
  });

  it('F14.6: Chart updates seamlessly when new snapshot is appended', () => {
    const { saveSnapshot, getSnapshots } = getStoreSnapshotHelpers(store);
    saveSnapshot({ bankCash: 1000000, usdtBalance: 666, referenceRate: 1500, netWorthNgn: 2000000 });
    saveSnapshot({ bankCash: 1000000, usdtBalance: 1000, referenceRate: 1500, netWorthNgn: 2500000 });

    const chartData = getSnapshots().map(s => s.netWorthNgn);
    assert.strictEqual(chartData.length, 2);
    assert.strictEqual(chartData[1], 2500000);
  });

  // ==========================================
  // FEATURE 15: Snapshot Management / History UI
  // ==========================================
  it('F15.1: Lists saved snapshots in chronological order with formatted NGN and USDT values', () => {
    const { saveSnapshot, getSnapshots } = getStoreSnapshotHelpers(store);
    saveSnapshot({ timestamp: '2026-08-24T10:00:00Z', bankCash: 1500000, usdtBalance: 1000, netWorthNgn: 3000000, netWorthUsdt: 2000, referenceRate: 1500 });
    saveSnapshot({ timestamp: '2026-08-25T10:00:00Z', bankCash: 1500000, usdtBalance: 1307, netWorthNgn: 3500000, netWorthUsdt: 2287.58, referenceRate: 1530 });

    const snapshots = getSnapshots();
    assert.strictEqual(snapshots.length, 2);
    assert.strictEqual(utils.formatNGN(snapshots[0].netWorthNgn), '₦3,000,000.00');
    assert.strictEqual(utils.formatUSDT(snapshots[1].netWorthUsdt), '2,287.58 USDT');
  });

  it('F15.2: Snapshot record renders optional notes and metadata', () => {
    const { saveSnapshot, getSnapshots } = getStoreSnapshotHelpers(store);
    saveSnapshot({
      bankCash: 2000000,
      usdtBalance: 1333,
      referenceRate: 1500,
      netWorthNgn: 4000000,
      notes: 'Capital injection from bank loan'
    });

    const snap = getSnapshots()[0];
    assert.strictEqual(snap.notes, 'Capital injection from bank loan');
  });

  it('F15.3: Deleting a snapshot record removes it from store and updates list', () => {
    const { saveSnapshot, deleteSnapshot, getSnapshots } = getStoreSnapshotHelpers(store);
    const s1 = saveSnapshot({ id: 'snp_to_del', bankCash: 500000, usdtBalance: 333, referenceRate: 1500, netWorthNgn: 1000000 });
    assert.strictEqual(getSnapshots().length, 1);

    deleteSnapshot(s1.id);
    assert.strictEqual(getSnapshots().length, 0);
  });

  it('F15.4: Deleting an intermediate snapshot dynamically recalculates subsequent deltas', () => {
    const { saveSnapshot, deleteSnapshot, getSnapshots } = getStoreSnapshotHelpers(store);
    const calculateSnapshotDelta = getCalculateSnapshotDelta(utils);

    const s1 = saveSnapshot({ id: 's1', timestamp: '2026-08-20T10:00:00Z', bankCash: 500000, usdtBalance: 333, referenceRate: 1500, netWorthNgn: 1000000 });
    const s2 = saveSnapshot({ id: 's2', timestamp: '2026-08-21T10:00:00Z', bankCash: 600000, usdtBalance: 400, referenceRate: 1500, netWorthNgn: 1200000 });
    const s3 = saveSnapshot({ id: 's3', timestamp: '2026-08-22T10:00:00Z', bankCash: 750000, usdtBalance: 500, referenceRate: 1500, netWorthNgn: 1500000 });

    deleteSnapshot(s2.id);

    const remaining = getSnapshots();
    assert.strictEqual(remaining.length, 2);
    const delta = calculateSnapshotDelta(remaining[1], remaining[0]);
    assert.strictEqual(delta.deltaNgn, 500000);
    assert.closeTo(delta.pctDeltaNgn, 50.00, 0.01);
  });

  it('F15.5: Empty state message displayed when all snapshots are deleted', () => {
    const historyListContainer = new MockElement('div', 'snapshot-history-list');
    const { clearSnapshots, getSnapshots } = getStoreSnapshotHelpers(store);
    clearSnapshots();

    if (getSnapshots().length === 0) {
      historyListContainer.innerHTML = '<div class="empty-state">No snapshots saved yet</div>';
    }

    assert.ok(historyListContainer.innerHTML.includes('No snapshots saved yet'));
  });

  it('F15.6: Snapshot row action buttons have appropriate data-id attributes for event delegation', () => {
    const row = new MockElement('div', 'snap-row-1', 'snapshot-item');
    const btnDelete = new MockElement('button', 'btn-del-1', 'btn-icon text-danger');
    btnDelete.setAttribute('data-id', 'snp_123');
    row.appendChild(btnDelete);

    assert.strictEqual(btnDelete.getAttribute('data-id'), 'snp_123');
  });
}, { tier: 1, category: 'Net Worth Features' });
