/**
 * Adversarial Mathematical Stress Test Suite for Milestone 1
 * (M1: Mathematical Calculation Engine, Rate Resolution, Net Worth Formulas & Snapshot Validation)
 * Executed by m1_challenger_1
 */

const { describe, it, beforeEach, beforeAll } = require('./harness/test-runner');
const { assert } = require('./harness/assertions');
const { setupDomEnvironment } = require('./harness/dom-mock');

let utils;
let storeModule;
let store;
let dom;

async function ensureModules() {
  if (!utils) {
    dom = setupDomEnvironment();
    utils = await import('../js/utils.js');
    storeModule = await import('../js/store.js');
    store = storeModule.store;
  }
  dom = setupDomEnvironment();
  store.clearAllData();
  return { utils, store, dom };
}

// =========================================================================
// SECTION 1: calculateTotalBankCash — Adversarial Boundaries & Fuzzing
// =========================================================================
describe('Challenger M1 Math — 1. calculateTotalBankCash Boundaries & Fuzzing', () => {
  beforeEach(async () => {
    await ensureModules();
  });

  it('1.1: Handles non-object, null, undefined, and primitive inputs cleanly without throwing', async () => {
    const { utils } = await ensureModules();
    assert.strictEqual(utils.calculateTotalBankCash(null), 0);
    assert.strictEqual(utils.calculateTotalBankCash(undefined), 0);
    assert.strictEqual(utils.calculateTotalBankCash(0), 0);
    assert.strictEqual(utils.calculateTotalBankCash(12345), 0);
    assert.strictEqual(utils.calculateTotalBankCash('string_input'), 0);
    assert.strictEqual(utils.calculateTotalBankCash(true), 0);
    assert.strictEqual(utils.calculateTotalBankCash(false), 0);
    assert.strictEqual(utils.calculateTotalBankCash(Symbol('sym')), 0);
    assert.strictEqual(utils.calculateTotalBankCash(() => {}), 0);
  });

  it('1.2: Commutativity invariant: Sum of accounts is identical across Map, Array, and Object topologies', async () => {
    const { utils } = await ensureModules();
    const records = [
      { id: 'b1', currentBalance: 1250000.75 },
      { id: 'b2', currentBalance: -350000.25 }, // Overdraft
      { id: 'b3', currentBalance: 0 },
      { id: 'b4', currentBalance: 5000000.50 },
      { id: 'b5', currentBalance: -1500.00 }
    ];
    const expectedTotal = 1250000.75 - 350000.25 + 0 + 5000000.50 - 1500.00; // 5898501.00

    // Map
    const map = new Map(records.map(r => [r.id, r]));
    const totalMap = utils.calculateTotalBankCash(map);

    // Array
    const totalArray = utils.calculateTotalBankCash(records);

    // Object
    const obj = Object.fromEntries(records.map(r => [r.id, r]));
    const totalObj = utils.calculateTotalBankCash(obj);

    // Raw number array
    const rawNums = records.map(r => r.currentBalance);
    const totalRawNums = utils.calculateTotalBankCash(rawNums);

    assert.closeTo(totalMap, expectedTotal, 0.001, 'Map total mismatch');
    assert.closeTo(totalArray, expectedTotal, 0.001, 'Array total mismatch');
    assert.closeTo(totalObj, expectedTotal, 0.001, 'Object total mismatch');
    assert.closeTo(totalRawNums, expectedTotal, 0.001, 'Raw numbers total mismatch');
  });

  it('1.3: Handles corrupted records with NaN, Infinity, -Infinity, strings, and missing fields without pollution', async () => {
    const { utils } = await ensureModules();
    const corruptedRecords = [
      { currentBalance: 500000 },
      { currentBalance: NaN },
      { currentBalance: Infinity },
      { currentBalance: -Infinity },
      { currentBalance: 'invalid_number' },
      { currentBalance: '250000' }, // String numeric
      { balance: 100000 },          // Fallback to .balance
      { balance: '50000' },         // String fallback
      null,
      undefined,
      {},
      { otherField: 999999 }
    ];

    // Expected sum: 500,000 + 250,000 + 100,000 + 50,000 = 900,000
    const total = utils.calculateTotalBankCash(corruptedRecords);
    assert.strictEqual(total, 900000, 'Corrupted fields must not pollute sum or introduce NaN');
  });

  it('1.4: Property-based fuzzing: 5,000 random bank accounts with extreme values and overdrafts', async () => {
    const { utils } = await ensureModules();
    let expectedSum = 0;
    const accounts = [];

    for (let i = 0; i < 5000; i++) {
      // Range: -10,000,000 to +50,000,000 with 2 decimal fractions
      const sign = Math.random() < 0.2 ? -1 : 1; // 20% overdraft accounts
      const val = sign * Math.round(Math.random() * 50000000 * 100) / 100;
      expectedSum += val;
      accounts.push({ id: `acc_${i}`, currentBalance: val });
    }

    const startTime = Date.now();
    const actualSum = utils.calculateTotalBankCash(accounts);
    const duration = Date.now() - startTime;

    assert.closeTo(actualSum, expectedSum, 0.01, 'Sum across 5000 fuzzed accounts must match exactly');
    assert.isBelow(duration, 50, 'Summing 5000 accounts must complete in < 50ms');
  });
}, { tier: 1, category: 'Milestone 1 Mathematical Adversarial Testing' });

// =========================================================================
// SECTION 2: resolveReferenceRate — Priority Hierarchy & Boundary Inversion
// =========================================================================
describe('Challenger M1 Math — 2. resolveReferenceRate Priority & Inversion', () => {
  beforeEach(async () => {
    await ensureModules();
  });

  it('2.1: Strict 5-tier priority hierarchy verification across all permutations', async () => {
    const { utils } = await ensureModules();
    const tier1Ad = { side: 1, status: 10, price: '1650.00' };
    const tier2Trade = { rate: 1620.00 };
    const tier3Fifo = 1580.00;
    const tier4Opening = 1550.00;
    const tier5Fallback = 1520.00;

    // Tier 1 active -> 1650.00
    assert.strictEqual(utils.resolveReferenceRate({
      activeSellAd: tier1Ad,
      latestTrade: tier2Trade,
      fifoAvgBuyCost: tier3Fifo,
      openingDefaultRate: tier4Opening,
      fallbackRate: tier5Fallback
    }), 1650.00, 'Tier 1 must dominate');

    // Disable Tier 1 -> Tier 2 dominates (1620.00)
    assert.strictEqual(utils.resolveReferenceRate({
      activeSellAd: null,
      latestTrade: tier2Trade,
      fifoAvgBuyCost: tier3Fifo,
      openingDefaultRate: tier4Opening,
      fallbackRate: tier5Fallback
    }), 1620.00, 'Tier 2 must dominate when Tier 1 missing');

    // Disable Tier 1 & 2 -> Tier 3 dominates (1580.00)
    assert.strictEqual(utils.resolveReferenceRate({
      activeSellAd: null,
      latestTrade: null,
      fifoAvgBuyCost: tier3Fifo,
      openingDefaultRate: tier4Opening,
      fallbackRate: tier5Fallback
    }), 1580.00, 'Tier 3 must dominate when Tier 1 & 2 missing');

    // Disable Tier 1, 2, 3 -> Tier 4 dominates (1550.00)
    assert.strictEqual(utils.resolveReferenceRate({
      activeSellAd: null,
      latestTrade: null,
      fifoAvgBuyCost: 0,
      openingDefaultRate: tier4Opening,
      fallbackRate: tier5Fallback
    }), 1550.00, 'Tier 4 must dominate when Tier 1, 2, 3 missing');

    // Disable Tier 1, 2, 3, 4 -> Tier 5 custom fallback dominates (1520.00)
    assert.strictEqual(utils.resolveReferenceRate({
      activeSellAd: null,
      latestTrade: null,
      fifoAvgBuyCost: 0,
      openingDefaultRate: 0,
      fallbackRate: tier5Fallback
    }), 1520.00, 'Tier 5 custom fallback must dominate');

    // All disabled -> default 1500.00
    assert.strictEqual(utils.resolveReferenceRate({}), 1500.00, 'Default fallback must be 1500.00');
  });

  it('2.2: Adversarial activeSellAd edge cases (BUY ad, offline statuses, non-numeric prices)', async () => {
    const { utils } = await ensureModules();
    // BUY side (side: 0) should be IGNORED
    assert.strictEqual(utils.resolveReferenceRate({
      activeSellAd: { side: 0, status: 10, price: '1700.00' },
      fallbackRate: 1510.00
    }), 1510.00);

    // Offline status (status: 30 / CANCELLED) should be IGNORED
    assert.strictEqual(utils.resolveReferenceRate({
      activeSellAd: { side: 1, status: 30, price: '1700.00' },
      fallbackRate: 1510.00
    }), 1510.00);

    // Negative or zero ad price should be IGNORED
    assert.strictEqual(utils.resolveReferenceRate({
      activeSellAd: { side: 1, status: 10, price: '0.00' },
      fallbackRate: 1510.00
    }), 1510.00);
    assert.strictEqual(utils.resolveReferenceRate({
      activeSellAd: { side: 1, status: 10, price: '-1600.00' },
      fallbackRate: 1510.00
    }), 1510.00);

    // String side '1' and string status '10' should be ACCEPTED
    assert.strictEqual(utils.resolveReferenceRate({
      activeSellAd: { side: '1', status: '10', price: '1680.50' }
    }), 1680.50);

    // Status 2 (ACTIVE) and status 20 (ACTIVE) should be ACCEPTED
    assert.strictEqual(utils.resolveReferenceRate({
      activeSellAd: { side: 1, status: 2, price: '1690.00' }
    }), 1690.00);
    assert.strictEqual(utils.resolveReferenceRate({
      activeSellAd: { side: 1, status: 20, price: '1695.00' }
    }), 1695.00);
  });

  it('2.3: Adversarial latestTrade edge cases (out-of-order array, string rates, price fallback)', async () => {
    const { utils } = await ensureModules();
    // Out of order trade array with dates: should pick newest date
    const trades = [
      { id: 'old', date: '2026-08-01T10:00:00Z', rate: 1500.00 },
      { id: 'newest', date: '2026-08-25T15:00:00Z', rate: 1645.50 },
      { id: 'middle', date: '2026-08-15T12:00:00Z', rate: 1580.00 }
    ];
    assert.strictEqual(utils.resolveReferenceRate({ latestTrade: trades }), 1645.50);

    // Trade with price instead of rate property
    assert.strictEqual(utils.resolveReferenceRate({ latestTrade: { price: '1633.33' } }), 1633.33);

    // Empty trade array -> falls back to next tier
    assert.strictEqual(utils.resolveReferenceRate({ latestTrade: [], fallbackRate: 1512.00 }), 1512.00);
  });

  it('2.4: Fuzzing resolveReferenceRate with 1,000 randomized options objects', async () => {
    const { utils } = await ensureModules();
    for (let i = 0; i < 1000; i++) {
      const randomOptions = {
        activeSellAd: Math.random() < 0.3 ? { side: Math.floor(Math.random() * 3), status: [2, 10, 20, 30][Math.floor(Math.random() * 4)], price: (Math.random() * 3000 - 500).toFixed(2) } : null,
        latestTrade: Math.random() < 0.3 ? { rate: (Math.random() * 3000 - 500).toFixed(2) } : null,
        fifoAvgBuyCost: Math.random() < 0.3 ? (Math.random() * 3000 - 500) : null,
        openingDefaultRate: Math.random() < 0.3 ? (Math.random() * 3000 - 500) : null,
        fallbackRate: Math.random() < 0.3 ? (Math.random() * 3000 - 500) : null
      };

      const rate = utils.resolveReferenceRate(randomOptions);
      assert.ok(!isNaN(rate), `Fuzzed rate must not be NaN (iteration ${i})`);
      assert.ok(isFinite(rate), `Fuzzed rate must be finite (iteration ${i})`);
      assert.isAbove(rate, 0, `Fuzzed rate must be strictly positive (iteration ${i})`);
    }
  });
}, { tier: 1, category: 'Milestone 1 Mathematical Adversarial Testing' });

// =========================================================================
// SECTION 3: calculateNetWorth — Exactness, Rounding & Invariant Conservation
// =========================================================================
describe('Challenger M1 Math — 3. calculateNetWorth Exactness & Rounding', () => {
  beforeEach(async () => {
    await ensureModules();
  });

  it('3.1: Dual-currency conservation invariant: NW_NGN and NW_USDT consistency', async () => {
    const { utils } = await ensureModules();
    const testCases = [
      { bankCash: 1250000.50, usdt: 1500.25, rate: 1535.00 },
      { bankCash: 100000000.00, usdt: 50000.00, rate: 1600.00 },
      { bankCash: 50.25, usdt: 10.50, rate: 1500.12 },
      { bankCash: 0, usdt: 1000.00, rate: 1550.00 },
      { bankCash: 1550000.00, usdt: 0, rate: 1550.00 }
    ];

    testCases.forEach(({ bankCash, usdt, rate }) => {
      const result = utils.calculateNetWorth(bankCash, usdt, rate);

      const expectedNgn = Math.round((bankCash + (usdt * rate)) * 100) / 100;
      const expectedUsdt = Math.round((usdt + (bankCash / rate)) * 100) / 100;

      assert.strictEqual(result.netWorthNgn, expectedNgn, 'NW_NGN exactness failure');
      assert.strictEqual(result.netWorthUsdt, expectedUsdt, 'NW_USDT exactness failure');

      const crossNgn = result.netWorthUsdt * rate;
      const maxRoundingDelta = Math.max(1.0, 0.01 * rate);
      assert.closeTo(crossNgn, result.netWorthNgn, maxRoundingDelta, 'Dual-currency cross consistency failure');
    });
  });

  it('3.2: Handles bank overdrafts (negative bank cash) with positive USDT accurately', async () => {
    const { utils } = await ensureModules();
    // Overdraft: -₦500,000 cash, +1,000 USDT @ ₦1,500
    // NW_NGN = -500,000 + (1000 * 1500) = +₦1,000,000
    // NW_USDT = 1000 + (-500,000 / 1500) = 1000 - 333.33 = +666.67 USDT
    const nw = utils.calculateNetWorth(-500000, 1000, 1500);
    assert.strictEqual(nw.netWorthNgn, 1000000);
    assert.strictEqual(nw.netWorthUsdt, 666.67);

    // Deep Overdraft: -₦2,000,000 cash, +1,000 USDT @ ₦1,500
    // NW_NGN = -2,000,000 + 1,500,000 = -₦500,000
    // NW_USDT = 1000 + (-2,000,000 / 1500) = 1000 - 1333.33 = -333.33 USDT
    const deepOverdraft = utils.calculateNetWorth(-2000000, 1000, 1500);
    assert.strictEqual(deepOverdraft.netWorthNgn, -500000);
    assert.strictEqual(deepOverdraft.netWorthUsdt, -333.33);
  });

  it('3.3: Division-by-zero & invalid rate protection (rate = 0, negative, NaN, Infinity)', async () => {
    const { utils } = await ensureModules();
    // Rate = 0
    const resZero = utils.calculateNetWorth(1000000, 500, 0);
    assert.strictEqual(resZero.netWorthNgn, 1000000);
    assert.strictEqual(resZero.netWorthUsdt, 500);
    assert.ok(isFinite(resZero.netWorthUsdt), 'Must not return Infinity for rate = 0');

    // Rate = -1500
    const resNeg = utils.calculateNetWorth(1000000, 500, -1500);
    assert.strictEqual(resNeg.netWorthNgn, 1000000);
    assert.strictEqual(resNeg.netWorthUsdt, 500);

    // Rate = NaN
    const resNan = utils.calculateNetWorth(1000000, 500, NaN);
    assert.strictEqual(resNan.netWorthNgn, 1000000);
    assert.strictEqual(resNan.netWorthUsdt, 500);

    // Rate = Infinity
    const resInf = utils.calculateNetWorth(1000000, 500, Infinity);
    assert.strictEqual(resInf.netWorthNgn, 1000000);
    assert.strictEqual(resInf.netWorthUsdt, 500);
  });

  it('3.4: Property-based fuzzing: 5,000 random (bankCash, usdt, rate) tuples', async () => {
    const { utils } = await ensureModules();
    for (let i = 0; i < 5000; i++) {
      const cash = (Math.random() * 200000000 - 50000000); // -50M to +150M
      const usdt = (Math.random() * 100000);                // 0 to 100K USDT
      const rate = (Math.random() * 3000 + 1);             // 1 to 3001

      const res = utils.calculateNetWorth(cash, usdt, rate);

      assert.ok(!isNaN(res.netWorthNgn), `netWorthNgn is NaN at iteration ${i}`);
      assert.ok(!isNaN(res.netWorthUsdt), `netWorthUsdt is NaN at iteration ${i}`);
      assert.ok(isFinite(res.netWorthNgn), `netWorthNgn not finite at iteration ${i}`);
      assert.ok(isFinite(res.netWorthUsdt), `netWorthUsdt not finite at iteration ${i}`);

      const ngnDecimals = (res.netWorthNgn.toString().split('.')[1] || '').length;
      const usdtDecimals = (res.netWorthUsdt.toString().split('.')[1] || '').length;
      assert.isBelow(ngnDecimals, 3, `NGN decimals exceeded 2: ${res.netWorthNgn}`);
      assert.isBelow(usdtDecimals, 3, `USDT decimals exceeded 2: ${res.netWorthUsdt}`);
    }
  });
}, { tier: 1, category: 'Milestone 1 Mathematical Adversarial Testing' });

// =========================================================================
// SECTION 4: calculateSnapshotDelta — Sign-Preserving Baselines & Edge Guards
// =========================================================================
describe('Challenger M1 Math — 4. calculateSnapshotDelta Sign & Zero Guards', () => {
  beforeEach(async () => {
    await ensureModules();
  });

  it('4.1: Positive baseline growth, loss, and flat delta calculations', async () => {
    const { utils } = await ensureModules();
    const prev = { netWorthNgn: 1000000, netWorthUsdt: 1000 };

    // Growth (+25%)
    const currGrowth = { netWorthNgn: 1250000, netWorthUsdt: 1250 };
    const dGrowth = utils.calculateSnapshotDelta(currGrowth, prev);
    assert.strictEqual(dGrowth.deltaNgn, 250000);
    assert.strictEqual(dGrowth.pctDeltaNgn, 25.00);
    assert.strictEqual(dGrowth.deltaUsdt, 250);
    assert.strictEqual(dGrowth.pctDeltaUsdt, 25.00);

    // Drop (-15%)
    const currDrop = { netWorthNgn: 850000, netWorthUsdt: 850 };
    const dDrop = utils.calculateSnapshotDelta(currDrop, prev);
    assert.strictEqual(dDrop.deltaNgn, -150000);
    assert.strictEqual(dDrop.pctDeltaNgn, -15.00);
    assert.strictEqual(dDrop.deltaUsdt, -150);
    assert.strictEqual(dDrop.pctDeltaUsdt, -15.00);

    // Flat (0%)
    const dFlat = utils.calculateSnapshotDelta(prev, prev);
    assert.strictEqual(dFlat.deltaNgn, 0);
    assert.strictEqual(dFlat.pctDeltaNgn, 0.00);
  });

  it('4.2: Zero baseline guards: Prevents Infinity% and -Infinity% when previous Net Worth is 0', async () => {
    const { utils } = await ensureModules();
    const prevZero = { netWorthNgn: 0, netWorthUsdt: 0 };
    const currPos = { netWorthNgn: 500000, netWorthUsdt: 350 };
    const currNeg = { netWorthNgn: -200000, netWorthUsdt: -150 };

    const dPos = utils.calculateSnapshotDelta(currPos, prevZero);
    assert.strictEqual(dPos.deltaNgn, 500000);
    assert.strictEqual(dPos.pctDeltaNgn, 0, 'Zero baseline % must clamp to 0% rather than Infinity%');
    assert.strictEqual(dPos.deltaUsdt, 350);
    assert.strictEqual(dPos.pctDeltaUsdt, 0);

    const dNeg = utils.calculateSnapshotDelta(currNeg, prevZero);
    assert.strictEqual(dNeg.deltaNgn, -200000);
    assert.strictEqual(dNeg.pctDeltaNgn, 0, 'Zero baseline % must clamp to 0% rather than -Infinity%');
  });

  it('4.3: Sign-preserving negative baseline behavior (Overdraft / Debt state)', async () => {
    const { utils } = await ensureModules();
    // Case A: Loss reduction (Loss decreases from -200k to -100k -> +100k improvement = +50%)
    const prevLoss = { netWorthNgn: -200000, netWorthUsdt: -200 };
    const currImproved = { netWorthNgn: -100000, netWorthUsdt: -100 };
    const dImproved = utils.calculateSnapshotDelta(currImproved, prevLoss);
    assert.strictEqual(dImproved.deltaNgn, 100000);
    assert.strictEqual(dImproved.pctDeltaNgn, 50.00, 'Loss reduction must be positive percentage');

    // Case B: Crossing zero into positive (From -200k to +100k -> +300k improvement = +150%)
    const currProfitable = { netWorthNgn: 100000, netWorthUsdt: 100 };
    const dProfitable = utils.calculateSnapshotDelta(currProfitable, prevLoss);
    assert.strictEqual(dProfitable.deltaNgn, 300000);
    assert.strictEqual(dProfitable.pctDeltaNgn, 150.00);

    // Case C: Deepening loss (From -200k to -300k -> -100k decline = -50%)
    const currDeeperLoss = { netWorthNgn: -300000, netWorthUsdt: -300 };
    const dDeeper = utils.calculateSnapshotDelta(currDeeperLoss, prevLoss);
    assert.strictEqual(dDeeper.deltaNgn, -100000);
    assert.strictEqual(dDeeper.pctDeltaNgn, -50.00, 'Deepening loss must be negative percentage');
  });

  it('4.4: Polymorphism: Raw numeric inputs, missing/undefined properties, and null arguments', async () => {
    const { utils } = await ensureModules();
    assert.deepStrictEqual(utils.calculateSnapshotDelta(null, null), { deltaNgn: 0, pctDeltaNgn: 0, deltaUsdt: 0, pctDeltaUsdt: 0 });
    assert.deepStrictEqual(utils.calculateSnapshotDelta(undefined, { netWorthNgn: 1000 }), { deltaNgn: 0, pctDeltaNgn: 0, deltaUsdt: 0, pctDeltaUsdt: 0 });
    assert.deepStrictEqual(utils.calculateSnapshotDelta({ netWorthNgn: 1000 }, null), { deltaNgn: 0, pctDeltaNgn: 0, deltaUsdt: 0, pctDeltaUsdt: 0 });

    // Raw numbers
    const dNums = utils.calculateSnapshotDelta(1500000, 1000000);
    assert.strictEqual(dNums.deltaNgn, 500000);
    assert.strictEqual(dNums.pctDeltaNgn, 50.00);
  });

  it('4.5: Fuzzing calculateSnapshotDelta with 5,000 randomized snapshot pairs', async () => {
    const { utils } = await ensureModules();
    for (let i = 0; i < 5000; i++) {
      const curr = {
        netWorthNgn: Math.random() * 20000000 - 10000000,
        netWorthUsdt: Math.random() * 20000 - 10000
      };
      const prev = {
        netWorthNgn: Math.random() * 20000000 - 10000000,
        netWorthUsdt: Math.random() * 20000 - 10000
      };

      const res = utils.calculateSnapshotDelta(curr, prev);
      assert.ok(!isNaN(res.deltaNgn), `deltaNgn is NaN (iteration ${i})`);
      assert.ok(!isNaN(res.pctDeltaNgn), `pctDeltaNgn is NaN (iteration ${i})`);
      assert.ok(!isNaN(res.deltaUsdt), `deltaUsdt is NaN (iteration ${i})`);
      assert.ok(!isNaN(res.pctDeltaUsdt), `pctDeltaUsdt is NaN (iteration ${i})`);
      assert.ok(isFinite(res.deltaNgn));
      assert.ok(isFinite(res.pctDeltaNgn));
    }
  });
}, { tier: 1, category: 'Milestone 1 Mathematical Adversarial Testing' });

// =========================================================================
// SECTION 5: validateSnapshot — Adversarial Schema Validation & Sanitization
// =========================================================================
describe('Challenger M1 Math — 5. validateSnapshot Schema & Sanitization', () => {
  beforeEach(async () => {
    await ensureModules();
  });

  it('5.1: Strict validation rejects invalid types, empty payloads, and prototype attacks', async () => {
    const { utils } = await ensureModules();
    assert.strictEqual(utils.validateSnapshot(null).isValid, false);
    assert.strictEqual(utils.validateSnapshot(undefined).isValid, false);
    assert.strictEqual(utils.validateSnapshot('string').isValid, false);
    assert.strictEqual(utils.validateSnapshot(12345).isValid, false);
    assert.strictEqual(utils.validateSnapshot([]).isValid, false);
  });

  it('5.2: Rejects invalid reference rates (rate <= 0, NaN, Infinity, -100)', async () => {
    const { utils } = await ensureModules();
    const invalidRates = [0, -1, -1500, NaN, Infinity, -Infinity, 'invalid_rate'];
    invalidRates.forEach(rate => {
      const res = utils.validateSnapshot({
        bankCash: 100000,
        usdtBalance: 100,
        referenceRate: rate
      });
      assert.strictEqual(res.isValid, false, `Should reject rate: ${rate}`);
      assert.ok(res.errors.some(e => e.includes('positive number')), `Missing positive rate error for: ${rate}`);
    });
  });

  it('5.3: Rejects invalid USDT balances (negative, NaN, Infinity)', async () => {
    const { utils } = await ensureModules();
    const invalidUsdt = [-1, -0.01, NaN, Infinity, -Infinity];
    invalidUsdt.forEach(u => {
      const res = utils.validateSnapshot({
        bankCash: 100000,
        usdtBalance: u,
        referenceRate: 1500
      });
      assert.strictEqual(res.isValid, false, `Should reject USDT: ${u}`);
      assert.ok(res.errors.some(e => e.includes('non-negative')), `Missing non-negative error for: ${u}`);
    });
  });

  it('5.4: Rejects malformed timestamp strings', async () => {
    const { utils } = await ensureModules();
    const invalidDates = ['invalid_date', '2026-99-99', 'not_a_time'];
    invalidDates.forEach(d => {
      const res = utils.validateSnapshot({
        timestamp: d,
        bankCash: 100000,
        usdtBalance: 100,
        referenceRate: 1500
      });
      assert.strictEqual(res.isValid, false, `Should reject date: ${d}`);
      assert.ok(res.errors.some(e => e.includes('ISO date string')), `Missing date error for: ${d}`);
    });
  });

  it('5.5: Sanitizes and auto-derives missing Net Worth, IDs, and createdAt timestamps', async () => {
    const { utils } = await ensureModules();
    const minimalValid = {
      bankCash: 500000,
      usdtBalance: 200,
      referenceRate: 1500
    };

    const res = utils.validateSnapshot(minimalValid);
    assert.strictEqual(res.isValid, true);
    assert.ok(res.sanitized.id.startsWith('snp_'), 'Should auto-generate ID prefix snp_');
    assert.ok(res.sanitized.timestamp, 'Should auto-assign ISO timestamp');
    assert.strictEqual(res.sanitized.netWorthNgn, 800000); // 500,000 + (200 * 1500)
    assert.strictEqual(res.sanitized.netWorthUsdt, 533.33); // 200 + (500,000 / 1500)
    assert.strictEqual(res.sanitized.notes, '');
    assert.ok(typeof res.sanitized.createdAt === 'number');
  });
}, { tier: 1, category: 'Milestone 1 Mathematical Adversarial Testing' });

// =========================================================================
// SECTION 6: Formatting Utilities — Precision & Edge Case Handling
// =========================================================================
describe('Challenger M1 Math — 6. Formatting Utilities Precision', () => {
  beforeEach(async () => {
    await ensureModules();
  });

  it('6.1: formatNGN handles standard, negative, fractional, and invalid amounts cleanly', async () => {
    const { utils } = await ensureModules();
    assert.strictEqual(utils.formatNGN(1250000.50), '₦1,250,000.50');
    assert.strictEqual(utils.formatNGN(-2500000.75), '-₦2,500,000.75');
    assert.strictEqual(utils.formatNGN(0), '₦0.00');
    assert.strictEqual(utils.formatNGN(-0.00), '₦0.00');
    assert.strictEqual(utils.formatNGN(null), '₦0.00');
    assert.strictEqual(utils.formatNGN(undefined), '₦0.00');
    assert.strictEqual(utils.formatNGN('1500.5'), '₦1,500.50');
    assert.strictEqual(utils.formatNGN('invalid'), '₦0.00');
  });

  it('6.2: formatUSDT handles formatting and suffix placement', async () => {
    const { utils } = await ensureModules();
    assert.strictEqual(utils.formatUSDT(500.25), '500.25 USDT');
    assert.strictEqual(utils.formatUSDT(0), '0.00 USDT');
    assert.strictEqual(utils.formatUSDT('1234.567', 4), '1,234.5670 USDT');
    assert.strictEqual(utils.formatUSDT(null), '0.00 USDT');
  });

  it('6.3: formatRate formats exchange rates cleanly', async () => {
    const { utils } = await ensureModules();
    assert.strictEqual(utils.formatRate(1535.50), '₦1,535.50 / USDT');
    assert.strictEqual(utils.formatRate(0), '₦0.00 / USDT');
    assert.strictEqual(utils.formatRate('1600'), '₦1,600.00 / USDT');
    assert.strictEqual(utils.formatRate(null), '₦0.00 / USDT');
  });
}, { tier: 1, category: 'Milestone 1 Mathematical Adversarial Testing' });
