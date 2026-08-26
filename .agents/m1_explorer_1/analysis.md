# Milestone 1: Mathematical Calculation Engine Specification & Analysis

**Agent**: `m1_explorer_1` (Role: M1 Calculation Engine Explorer)  
**Target Module**: `js/utils.js` (and downstream consumers `js/dashboard.js`, `js/store.js`, `js/pricing.js`, `js/views/modals.view.js`)  
**Date**: 2026-08-25  

---

## Executive Summary

This document provides the complete mathematical and software architecture specification for the **Milestone 1 Calculation Engine** of the Bybit NGN P2P Trade Tracker. The engine comprises five pure helper functions designed for resilience, numeric precision, division-by-zero protection, and seamless integration with reactive bank ledgers and FIFO inventory queues:

1. **`calculateTotalBankCash(computedBankBalances)`**: Robust ledger aggregation across Map, Array, or Object collections.
2. **`resolveReferenceRate(options)`**: 5-tier fallback priority hierarchy resolving the authoritative NGN/USDT conversion rate.
3. **`calculateNetWorth(totalBankCashNgn, totalUsdt, referenceRate)`**: Closed-form dual-currency portfolio valuation with zero/negative guards.
4. **`calculateSnapshotDelta(current, previous)`**: Sequential and point-in-time delta and percentage metrics with sign-preserving negative baseline handling.
5. **`validateSnapshot(snapshotData)`**: Schema enforcement, sanitization, and auto-derivation of snapshot records before persistence.

---

## 1. Mathematical Formulas & Specification

### 1.1 Bank Cash Ledger Aggregation (`calculateTotalBankCash`)

#### Purpose
Sums the reactive liquid cash balances across all user-linked bank accounts.

#### Mathematical Definition
Given a set of $N$ linked bank accounts $B = \{b_1, b_2, \dots, b_N\}$, where each account $b_i$ has dynamic balance $C_i$:
$$T_{\text{bank}} = \sum_{i=1}^{N} C_i$$

Where for each account $b_i$:
$$C_i = \text{initialBalance}_i + \sum \text{SELL}_{\text{net}, i} - \sum \text{BUY}_{\text{net}, i} + \sum \text{TransferIn}_i - \sum \text{TransferOut}_i$$

#### Input Contract & Polymorphic Support
- `computedBankBalances`: `Map<string, Object>`, `Array<Object>`, `Record<string, Object>`, or raw numeric arrays.
- Handles records with `.currentBalance` or `.balance`.
- Coerces strings and primitives safely using `Number(val) || 0`.
- Missing or malformed accounts are sanitized to `0` without throwing runtime exceptions.

---

### 1.2 Reference Exchange Rate Resolution Hierarchy (`resolveReferenceRate`)

#### Purpose
Determines the current market valuation rate $R_{\text{ref}}$ (in $\text{NGN} / \text{USDT}$) used to convert between crypto and fiat assets.

#### Priority Hierarchy Matrix
| Priority Tier | Source Candidate | Validation Rule | Fallback Trigger |
|---|---|---|---|
| **Tier 1 (Highest)** | Active Bybit Sell Ad Price (`options.activeSellAd`) | Must be Sell ad (`side == 1` or `'1'`), Active (`status` $\in \{10, 20, 2\}$), and numeric price $> 0$. | No active ad listed, offline status (e.g. 30), or price $\le 0$. |
| **Tier 2** | Latest Trade Rate (`options.latestTrade`) | Most recent chronological trade with numeric rate $> 0$. | No recorded trades, or trade rate $\le 0$. |
| **Tier 3** | FIFO Average Buy Cost (`options.fifoAvgBuyCost`) | Weighted average holding cost from FIFO inventory $> 0$. | Zero inventory in queue or holding cost $\le 0$. |
| **Tier 4** | Opening Inventory Default Rate (`options.openingDefaultRate`) | User-configured default cost basis $> 0$. | Opening balance unconfigured or rate $\le 0$. |
| **Tier 5 (Base Fallback)** | Static Fallback Rate (`options.fallbackRate` $\parallel 1500.00$) | Must be numeric $> 0$; defaults strictly to `1500.00`. | Never fails (hardcoded positive constant `1500.00`). |

#### Hierarchy Resolution Function
$$R_{\text{ref}} = \begin{cases}
P_{\text{ad}} & \text{if } \text{isValid}(P_{\text{ad}}) \\
R_{\text{latest}} & \text{else if } \text{isValid}(R_{\text{latest}}) \\
C_{\text{fifo}} & \text{else if } \text{isValid}(C_{\text{fifo}}) \\
R_{\text{opening}} & \text{else if } \text{isValid}(R_{\text{opening}}) \\
R_{\text{custom\_fallback}} & \text{else if } \text{isValid}(R_{\text{custom\_fallback}}) \\
1500.00 & \text{otherwise}
\end{cases}$$

---

### 1.3 Dual-Currency Net Worth Valuation (`calculateNetWorth`)

#### Purpose
Computes the merchant's aggregated wealth denominated in both Nigerian Naira (NGN) and Tether (USDT).

#### Mathematical Formulas
Let:
- $T_{\text{bank}} \in \mathbb{R}$ = Total liquid bank cash in NGN.
- $U_{\text{bybit}} \in \mathbb{R}_{\ge 0}$ = Total USDT balance (Bybit funding + active ads).
- $R_{\text{ref}} \in \mathbb{R}_{> 0}$ = Reference exchange rate in NGN/USDT.

1. **Naira-Base Valuation ($\text{NW}_{\text{NGN}}$)**:
   $$\text{NW}_{\text{NGN}} = T_{\text{bank}} + \left(U_{\text{bybit}} \times R_{\text{ref}}\right)$$

2. **USDT-Base Valuation ($\text{NW}_{\text{USDT}}$)**:
   $$\text{NW}_{\text{USDT}} = U_{\text{bybit}} + \left(\frac{T_{\text{bank}}}{R_{\text{ref}}}\right)$$

#### Division-by-Zero & Singularity Guards
If $R_{\text{ref}} \le 0$ or $R_{\text{ref}}$ is non-finite:
$$\text{NW}_{\text{NGN}} = T_{\text{bank}}, \quad \text{NW}_{\text{USDT}} = U_{\text{bybit}}$$
This guarantees that invalid or uninitialized rates never produce `Infinity` or `NaN`.

---

### 1.4 Snapshot Delta Computation (`calculateSnapshotDelta`)

#### Purpose
Computes absolute growth and percentage change between two snapshot points (or live net worth vs. the last saved snapshot).

#### Mathematical Formulas
Let $S_{\text{curr}} = (\text{NW}_{\text{NGN, c}}, \text{NW}_{\text{USDT, c}})$ and $S_{\text{prev}} = (\text{NW}_{\text{NGN, p}}, \text{NW}_{\text{USDT, p}})$.

1. **Absolute Deltas**:
   $$\Delta_{\text{NGN}} = \text{NW}_{\text{NGN, c}} - \text{NW}_{\text{NGN, p}}$$
   $$\Delta_{\text{USDT}} = \text{NW}_{\text{USDT, c}} - \text{NW}_{\text{USDT, p}}$$

2. **Percentage Deltas**:
   $$\%\Delta_{\text{NGN}} = \begin{cases} 0\% & \text{if } |\text{NW}_{\text{NGN, p}}| < 10^{-6} \\ \left(\frac{\Delta_{\text{NGN}}}{|\text{NW}_{\text{NGN, p}}|}\right) \times 100 & \text{otherwise} \end{cases}$$
   $$\%\Delta_{\text{USDT}} = \begin{cases} 0\% & \text{if } |\text{NW}_{\text{USDT, p}}| < 10^{-6} \\ \left(\frac{\Delta_{\text{USDT}}}{|\text{NW}_{\text{USDT, p}}|}\right) \times 100 & \text{otherwise} \end{cases}$$

#### Negative Baseline Handling
By utilizing $|\text{NW}_{\text{prev}}|$ in the denominator, recovering from a negative net worth (e.g. from $-\text{₦}100,000$ to $+\text{₦}50,000$) produces a correct positive delta of $+150\%$, preserving the natural economic interpretation of growth.

---

### 1.5 Snapshot Validation & Normalization (`validateSnapshot`)

#### Purpose
Enforces schema correctness, data sanitization, and mathematical consistency before writing to `localStorage` or importing from backup JSON files.

#### Validation Invariants
1. **Root Type**: Must be a non-null object.
2. **Reference Rate ($R_{\text{ref}}$)**: Must be a positive finite number ($> 0$).
3. **Timestamp**: Must be a valid date string or timestamp parseable by `new Date()`.
4. **USDT Balance**: Must be a finite number $\ge 0$.
5. **Bank Cash**: Must be a finite number (can be negative in case of overdrafts).
6. **Derived Net Worth**: If `netWorthNgn` or `netWorthUsdt` are missing or uncalibrated, automatically derive them via `calculateNetWorth`.
7. **Metadata**: Assign standard `id` (`snp_<timestamp>_<random>`), `createdAt`, and trimmed `notes`.

---

## 2. Proposed Code Implementation for `js/utils.js`

```javascript
/**
 * Aggregate total cash balance across all bank accounts from computed bank balances.
 * Supports Map (from store.getComputedBankBalances()), Array, or Record/Object.
 * 
 * @param {Map<string, Object>|Array<Object>|Object|null|undefined} computedBankBalances
 * @returns {number} Total bank cash in NGN
 */
export function calculateTotalBankCash(computedBankBalances) {
  if (!computedBankBalances) return 0;

  let total = 0;

  if (computedBankBalances instanceof Map) {
    for (const record of computedBankBalances.values()) {
      if (record && typeof record === 'object') {
        const bal = Number(record.currentBalance !== undefined ? record.currentBalance : record.balance);
        if (!isNaN(bal) && isFinite(bal)) {
          total += bal;
        }
      } else if (typeof record === 'number' && !isNaN(record) && isFinite(record)) {
        total += record;
      }
    }
  } else if (Array.isArray(computedBankBalances)) {
    for (const item of computedBankBalances) {
      if (item && typeof item === 'object') {
        const bal = Number(item.currentBalance !== undefined ? item.currentBalance : item.balance);
        if (!isNaN(bal) && isFinite(bal)) {
          total += bal;
        }
      } else if (typeof item === 'number' && !isNaN(item) && isFinite(item)) {
        total += item;
      }
    }
  } else if (typeof computedBankBalances === 'object') {
    for (const record of Object.values(computedBankBalances)) {
      if (record && typeof record === 'object') {
        const bal = Number(record.currentBalance !== undefined ? record.currentBalance : record.balance);
        if (!isNaN(bal) && isFinite(bal)) {
          total += bal;
        }
      } else if (typeof record === 'number' && !isNaN(record) && isFinite(record)) {
        total += record;
      }
    }
  }

  return total;
}

/**
 * Resolve authoritative reference exchange rate (NGN/USDT) by priority hierarchy.
 * Priority: Active Sell Ad price > Latest Trade rate > FIFO avg buy cost > Opening default cost basis > Fallback rate (1500.00)
 * 
 * @param {Object} [options={}]
 * @param {Object|number|null} [options.activeSellAd] - Active Sell Ad object or numeric price
 * @param {Object|Array|number|null} [options.latestTrade] - Latest trade object, trades array, or numeric rate
 * @param {number|null} [options.fifoAvgBuyCost] - FIFO holding cost per USDT
 * @param {number|null} [options.openingDefaultRate] - Opening inventory default cost basis
 * @param {Object|null} [options.openingInventory] - Opening inventory object with defaultCostBasis
 * @param {number} [options.fallbackRate=1500.00] - Hard fallback rate
 * @returns {number} Resolved exchange rate in NGN per USDT
 */
export function resolveReferenceRate(options = {}) {
  if (!options || typeof options !== 'object') {
    return 1500.00;
  }

  // 1. Active Sell Ad rate
  if (options.activeSellAd) {
    let adPrice = null;
    if (typeof options.activeSellAd === 'object') {
      const side = options.activeSellAd.side;
      const status = options.activeSellAd.status;
      const isSellSide = side === undefined || side === null || Number(side) === 1;
      const isActiveStatus = status === undefined || status === null || [10, 20, 2].includes(Number(status));

      if (isSellSide && isActiveStatus && options.activeSellAd.price !== undefined) {
        adPrice = parseFloat(options.activeSellAd.price);
      } else if (options.activeSellAd.price !== undefined && (side === undefined && status === undefined)) {
        adPrice = parseFloat(options.activeSellAd.price);
      }
    } else if (typeof options.activeSellAd === 'number' || typeof options.activeSellAd === 'string') {
      adPrice = parseFloat(options.activeSellAd);
    }

    if (adPrice !== null && !isNaN(adPrice) && isFinite(adPrice) && adPrice > 0) {
      return adPrice;
    }
  }

  // 2. Latest Trade rate
  if (options.latestTrade) {
    let tradeRate = null;
    if (Array.isArray(options.latestTrade)) {
      if (options.latestTrade.length > 0) {
        const sorted = [...options.latestTrade].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
        const latest = sorted[0];
        tradeRate = parseFloat(latest?.rate !== undefined ? latest.rate : latest?.price);
      }
    } else if (typeof options.latestTrade === 'object') {
      tradeRate = parseFloat(options.latestTrade.rate !== undefined ? options.latestTrade.rate : options.latestTrade.price);
    } else if (typeof options.latestTrade === 'number' || typeof options.latestTrade === 'string') {
      tradeRate = parseFloat(options.latestTrade);
    }

    if (tradeRate !== null && !isNaN(tradeRate) && isFinite(tradeRate) && tradeRate > 0) {
      return tradeRate;
    }
  }

  // 3. FIFO Average Buy Cost
  if (options.fifoAvgBuyCost !== undefined && options.fifoAvgBuyCost !== null) {
    const fifoCost = parseFloat(options.fifoAvgBuyCost);
    if (!isNaN(fifoCost) && isFinite(fifoCost) && fifoCost > 0) {
      return fifoCost;
    }
  }

  // 4. Opening Inventory Default Cost Basis
  let openingRate = options.openingDefaultRate;
  if (openingRate === undefined && options.openingInventory) {
    openingRate = options.openingInventory.defaultCostBasis;
  }
  if (openingRate !== undefined && openingRate !== null) {
    const openCost = parseFloat(openingRate);
    if (!isNaN(openCost) && isFinite(openCost) && openCost > 0) {
      return openCost;
    }
  }

  // 5. Fallback rate
  if (options.fallbackRate !== undefined && options.fallbackRate !== null) {
    const fb = parseFloat(options.fallbackRate);
    if (!isNaN(fb) && isFinite(fb) && fb > 0) {
      return fb;
    }
  }

  return 1500.00;
}

/**
 * Calculate Net Worth in both NGN and USDT base valuations.
 * Formulas:
 *   NW_NGN = Total Bank Cash NGN + (Total USDT * Reference Rate)
 *   NW_USDT = Total USDT + (Total Bank Cash NGN / Reference Rate)
 * 
 * @param {number} totalBankCashNgn - Liquid cash across bank accounts
 * @param {number} totalUsdt - Total USDT balance (funding + active ads)
 * @param {number} referenceRate - Reference exchange rate in NGN per USDT
 * @returns {{ netWorthNgn: number, netWorthUsdt: number, bankCashNgn: number, totalUsdt: number, referenceRate: number }}
 */
export function calculateNetWorth(totalBankCashNgn, totalUsdt, referenceRate) {
  const bankCash = Number(totalBankCashNgn) || 0;
  const usdt = Number(totalUsdt) || 0;
  const rate = Number(referenceRate) || 0;

  if (rate <= 0 || !isFinite(rate)) {
    return {
      netWorthNgn: bankCash,
      netWorthUsdt: usdt,
      bankCashNgn: bankCash,
      totalUsdt: usdt,
      referenceRate: rate
    };
  }

  const netWorthNgn = bankCash + (usdt * rate);
  const netWorthUsdt = usdt + (bankCash / rate);

  return {
    netWorthNgn,
    netWorthUsdt,
    bankCashNgn: bankCash,
    totalUsdt: usdt,
    referenceRate: rate
  };
}

/**
 * Calculate absolute and percentage deltas between current and previous Net Worth.
 * Handles division by zero, null baselines, and negative baselines safely.
 * 
 * @param {Object|number} current - Current Net Worth object or number
 * @param {Object|number|null|undefined} previous - Previous Net Worth object or number
 * @returns {{ deltaNgn: number, pctDeltaNgn: number, deltaUsdt: number, pctDeltaUsdt: number }}
 */
export function calculateSnapshotDelta(current, previous) {
  const currentNgn = Number(current?.netWorthNgn !== undefined ? current.netWorthNgn : (typeof current === 'number' ? current : 0)) || 0;
  const currentUsdt = Number(current?.netWorthUsdt !== undefined ? current.netWorthUsdt : 0) || 0;

  if (!previous) {
    return {
      deltaNgn: 0,
      pctDeltaNgn: 0,
      deltaUsdt: 0,
      pctDeltaUsdt: 0
    };
  }

  const prevNgn = Number(previous?.netWorthNgn !== undefined ? previous.netWorthNgn : (typeof previous === 'number' ? previous : 0)) || 0;
  const prevUsdt = Number(previous?.netWorthUsdt !== undefined ? previous.netWorthUsdt : 0) || 0;

  const deltaNgn = currentNgn - prevNgn;
  const deltaUsdt = currentUsdt - prevUsdt;

  const pctDeltaNgn = Math.abs(prevNgn) > 0.000001
    ? (deltaNgn / Math.abs(prevNgn)) * 100
    : 0;

  const pctDeltaUsdt = Math.abs(prevUsdt) > 0.000001
    ? (deltaUsdt / Math.abs(prevUsdt)) * 100
    : 0;

  return {
    deltaNgn,
    pctDeltaNgn,
    deltaUsdt,
    pctDeltaUsdt
  };
}

/**
 * Validate and sanitize a snapshot record prior to storage or import.
 * 
 * @param {Object} snapshotData
 * @returns {{ isValid: boolean, errors: string[], sanitized: Object|null }}
 */
export function validateSnapshot(snapshotData) {
  const errors = [];

  if (!snapshotData || typeof snapshotData !== 'object' || Array.isArray(snapshotData)) {
    return {
      isValid: false,
      errors: ['Snapshot data must be a valid object.'],
      sanitized: null
    };
  }

  // 1. Reference Rate validation
  const rawRate = snapshotData.referenceRate;
  const rate = Number(rawRate);
  if (rawRate === undefined || rawRate === null || isNaN(rate) || !isFinite(rate) || rate <= 0) {
    errors.push('Reference exchange rate must be a positive number greater than 0.');
  }

  // 2. Timestamp validation
  let timestampIso = snapshotData.timestamp;
  if (!timestampIso) {
    timestampIso = new Date().toISOString();
  } else {
    const d = new Date(timestampIso);
    if (isNaN(d.getTime())) {
      errors.push('Snapshot timestamp must be a valid ISO date string or timestamp.');
    } else {
      timestampIso = d.toISOString();
    }
  }

  // 3. Bank Cash validation
  const rawBankCash = snapshotData.bankCash !== undefined ? snapshotData.bankCash : snapshotData.bankCashNGN;
  const bankCash = Number(rawBankCash);
  if (rawBankCash === undefined || rawBankCash === null || isNaN(bankCash) || !isFinite(bankCash)) {
    errors.push('Bank cash balance must be a valid finite number.');
  }

  // 4. USDT Balance validation
  const rawUsdt = snapshotData.usdtBalance !== undefined ? snapshotData.usdtBalance : snapshotData.totalUsdt;
  const usdtBalance = Number(rawUsdt);
  if (rawUsdt === undefined || rawUsdt === null || isNaN(usdtBalance) || !isFinite(usdtBalance) || usdtBalance < 0) {
    errors.push('USDT balance must be a non-negative finite number.');
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      errors,
      sanitized: null
    };
  }

  // Calculate or verify net worth values
  const { netWorthNgn, netWorthUsdt } = calculateNetWorth(bankCash, usdtBalance, rate);

  const sanitized = {
    id: snapshotData.id || generateId('snp'),
    timestamp: timestampIso,
    bankCash: bankCash,
    usdtBalance: usdtBalance,
    referenceRate: rate,
    netWorthNgn: snapshotData.netWorthNgn !== undefined && !isNaN(Number(snapshotData.netWorthNgn)) ? Number(snapshotData.netWorthNgn) : netWorthNgn,
    netWorthUsdt: snapshotData.netWorthUsdt !== undefined && !isNaN(Number(snapshotData.netWorthUsdt)) ? Number(snapshotData.netWorthUsdt) : netWorthUsdt,
    notes: typeof snapshotData.notes === 'string' ? snapshotData.notes.trim() : '',
    createdAt: typeof snapshotData.createdAt === 'number' && !isNaN(snapshotData.createdAt) ? snapshotData.createdAt : Date.now()
  };

  return {
    isValid: true,
    errors: [],
    sanitized
  };
}
```

---

## 3. Comprehensive Edge-Case & Boundary Matrix

| Function | Scenario / Input | Expected Result / Behavior | Rationale |
|---|---|---|---|
| `calculateTotalBankCash` | `new Map([['b1', { currentBalance: 500000 }], ['b2', { currentBalance: -50000 }]])` | `450000` | Supports negative overdraft balances accurately. |
| `calculateTotalBankCash` | `null`, `undefined`, or `{}` | `0` | Graceful zero fallback for empty/uninitialized ledgers. |
| `calculateTotalBankCash` | `[{ currentBalance: '1000' }, { balance: 2000 }]` | `3000` | Flexible property matching and numeric coercion. |
| `resolveReferenceRate` | Active ad (status 10, price 1650), trade (1600), FIFO (1580) | `1650.00` | Tier 1 active Sell ad takes top precedence. |
| `resolveReferenceRate` | Inactive ad (status 30, price 1700), trade (1620) | `1620.00` | Skips inactive ad (status $\ne 10/20/2$) to Tier 2 trade rate. |
| `resolveReferenceRate` | No ads, no trades, FIFO cost = `1590.25` | `1590.25` | Tier 3 FIFO inventory holding cost selected. |
| `resolveReferenceRate` | Empty options `{}` | `1500.00` | Tier 5 fallback default constant applied. |
| `resolveReferenceRate` | Custom fallback `{ fallbackRate: 1575.50 }` | `1575.50` | Tier 5 custom fallback rate honored. |
| `calculateNetWorth` | Bank = `₦1,250,000`, USDT = `1,500`, Rate = `1535` | NGN: `3552500`, USDT: `2314.33` | Exact mathematical closed-form evaluation. |
| `calculateNetWorth` | Bank = `-₦50,000`, USDT = `100`, Rate = `1500` | NGN: `100000`, USDT: `66.67` | Correct valuation under bank overdraft / negative cash. |
| `calculateNetWorth` | Rate = `0` or `-100` | NGN: `bankCash`, USDT: `usdt` | Zero-divisor protection avoids `Infinity` or `NaN`. |
| `calculateSnapshotDelta` | Curr NGN: `1100000`, Prev NGN: `1000000` | Delta: `+100000`, Pct: `+10.0%` | Standard positive growth. |
| `calculateSnapshotDelta` | Curr NGN: `950000`, Prev NGN: `1000000` | Delta: `-50000`, Pct: `-5.0%` | Standard negative contraction. |
| `calculateSnapshotDelta` | Previous is `null` or `undefined` | Delta: `0`, Pct: `0%` | Baseline initialization without crash. |
| `calculateSnapshotDelta` | Prev NGN = `0`, Curr NGN = `500000` | Delta: `500000`, Pct: `0%` | Division-by-zero protection. |
| `calculateSnapshotDelta` | Prev NGN = `-100000`, Curr NGN = `50000` | Delta: `+150000`, Pct: `+150%` | Denominator absolute value preserves improvement sign. |
| `validateSnapshot` | Missing or $\le 0$ `referenceRate` | `isValid: false`, error returned | Enforces rate positivity invariant. |
| `validateSnapshot` | Negative `usdtBalance: -10` | `isValid: false`, error returned | Enforces non-negative crypto balance. |
| `validateSnapshot` | Valid payload with omitted `netWorthNgn` | `isValid: true`, auto-computed | Auto-derives consistent net worth valuations. |

---

## 4. Test Suite Specification (Automated Test File)

Below is the concrete automated test suite designed for execution in the project's test harness (`test/tier1-feature-coverage/r1-m1-calculation-engine.test.js`):

```javascript
/**
 * Tier 1: Feature Coverage — M1: Mathematical Calculation Engine
 */

const { describe, it, beforeEach } = require('../harness/test-runner');
const { assert } = require('../harness/assertions');

describe('Tier 1 — M1: Core Calculations & Snapshot Validation Engine', () => {
  let utils;

  beforeEach(async () => {
    utils = await import('../../js/utils.js');
  });

  // 1. calculateTotalBankCash
  describe('1. calculateTotalBankCash', () => {
    it('M1.1: Aggregates cash across Map from store.getComputedBankBalances()', () => {
      const bankMap = new Map([
        ['b1', { initialBalance: 100000, currentBalance: 500000 }],
        ['b2', { initialBalance: 200000, currentBalance: 750000 }],
        ['b3', { initialBalance: 50000, currentBalance: 250000 }]
      ]);
      const total = utils.calculateTotalBankCash(bankMap);
      assert.strictEqual(total, 1500000, 'Sum should equal ₦1,500,000');
    });

    it('M1.2: Accurately handles negative overdraft balances and zero values', () => {
      const bankMap = new Map([
        ['b1', { currentBalance: 600000 }],
        ['b2', { currentBalance: -100000 }],
        ['b3', { currentBalance: 0 }]
      ]);
      const total = utils.calculateTotalBankCash(bankMap);
      assert.strictEqual(total, 500000, 'Sum should deduct overdraft balance to ₦500,000');
    });

    it('M1.3: Polymorphically supports Arrays, Objects, and handles null/undefined safely', () => {
      assert.strictEqual(utils.calculateTotalBankCash(null), 0);
      assert.strictEqual(utils.calculateTotalBankCash(undefined), 0);
      assert.strictEqual(utils.calculateTotalBankCash([]), 0);
      assert.strictEqual(utils.calculateTotalBankCash(new Map()), 0);
      assert.strictEqual(utils.calculateTotalBankCash([{ currentBalance: 1200 }, { currentBalance: 800 }]), 2000);
      assert.strictEqual(utils.calculateTotalBankCash({ a: { currentBalance: 300 }, b: { currentBalance: 700 } }), 1000);
    });
  });

  // 2. resolveReferenceRate
  describe('2. resolveReferenceRate', () => {
    it('M1.4: Tier 1 - Active Sell Ad rate takes highest precedence', () => {
      const rate = utils.resolveReferenceRate({
        activeSellAd: { price: '1650.50', side: 1, status: 10 },
        latestTrade: { rate: 1600.00 },
        fifoAvgBuyCost: 1580.00,
        openingDefaultRate: 1550.00,
        fallbackRate: 1500.00
      });
      assert.strictEqual(rate, 1650.50);
    });

    it('M1.5: Tier 2 - Uses Latest Trade rate when active ad is offline or missing', () => {
      const rate = utils.resolveReferenceRate({
        activeSellAd: { price: '1700.00', side: 1, status: 30 }, // offline
        latestTrade: { rate: 1625.00 },
        fifoAvgBuyCost: 1580.00
      });
      assert.strictEqual(rate, 1625.00);
    });

    it('M1.6: Tier 3 & 4 - Falls back to FIFO avg cost, opening default, or 1500.00', () => {
      const rateFifo = utils.resolveReferenceRate({ fifoAvgBuyCost: 1585.50 });
      assert.strictEqual(rateFifo, 1585.50);

      const rateOpening = utils.resolveReferenceRate({ openingDefaultRate: 1560.00 });
      assert.strictEqual(rateOpening, 1560.00);

      const rateFallback = utils.resolveReferenceRate({});
      assert.strictEqual(rateFallback, 1500.00);
    });
  });

  // 3. calculateNetWorth
  describe('3. calculateNetWorth', () => {
    it('M1.7: Evaluates dual-currency Net Worth with mathematical exactness', () => {
      const bankCash = 1250000;
      const totalUsdt = 1500;
      const rate = 1535;

      const result = utils.calculateNetWorth(bankCash, totalUsdt, rate);
      // NW_NGN = 1250000 + (1500 * 1535) = 1250000 + 2302500 = 3552500
      // NW_USDT = 1500 + (1250000 / 1535) = 1500 + 814.3322... = 2314.3322...
      assert.strictEqual(result.netWorthNgn, 3552500);
      assert.closeTo(result.netWorthUsdt, 2314.332, 0.001);
    });

    it('M1.8: Handles zero/negative rates safely without division by zero', () => {
      const resultZeroRate = utils.calculateNetWorth(500000, 200, 0);
      assert.strictEqual(resultZeroRate.netWorthNgn, 500000);
      assert.strictEqual(resultZeroRate.netWorthUsdt, 200);

      const resultNegativeCash = utils.calculateNetWorth(-50000, 100, 1500);
      assert.strictEqual(resultNegativeCash.netWorthNgn, 100000);
      assert.closeTo(resultNegativeCash.netWorthUsdt, 66.666, 0.01);
    });
  });

  // 4. calculateSnapshotDelta
  describe('4. calculateSnapshotDelta', () => {
    it('M1.9: Computes positive, negative, and zero percentage deltas', () => {
      const prev = { netWorthNgn: 1000000, netWorthUsdt: 1000 };
      const currGrowth = { netWorthNgn: 1100000, netWorthUsdt: 1100 };
      const delta1 = utils.calculateSnapshotDelta(currGrowth, prev);

      assert.strictEqual(delta1.deltaNgn, 100000);
      assert.strictEqual(delta1.pctDeltaNgn, 10.0);
      assert.strictEqual(delta1.deltaUsdt, 100);
      assert.strictEqual(delta1.pctDeltaUsdt, 10.0);

      const currDrop = { netWorthNgn: 950000, netWorthUsdt: 950 };
      const delta2 = utils.calculateSnapshotDelta(currDrop, prev);
      assert.strictEqual(delta2.deltaNgn, -50000);
      assert.strictEqual(delta2.pctDeltaNgn, -5.0);
    });

    it('M1.10: Handles null previous snapshot and zero divisor baselines cleanly', () => {
      const deltaNull = utils.calculateSnapshotDelta({ netWorthNgn: 500000, netWorthUsdt: 500 }, null);
      assert.strictEqual(deltaNull.deltaNgn, 0);
      assert.strictEqual(deltaNull.pctDeltaNgn, 0);

      const deltaZeroPrev = utils.calculateSnapshotDelta({ netWorthNgn: 500000, netWorthUsdt: 500 }, { netWorthNgn: 0, netWorthUsdt: 0 });
      assert.strictEqual(deltaZeroPrev.deltaNgn, 500000);
      assert.strictEqual(deltaZeroPrev.pctDeltaNgn, 0);
    });
  });

  // 5. validateSnapshot
  describe('5. validateSnapshot', () => {
    it('M1.11: Validates and sanitizes valid snapshot record', () => {
      const raw = {
        bankCash: 1000000,
        usdtBalance: 500,
        referenceRate: 1550,
        notes: 'End of day trading snapshot'
      };
      const result = utils.validateSnapshot(raw);
      assert.strictEqual(result.isValid, true);
      assert.strictEqual(result.sanitized.bankCash, 1000000);
      assert.strictEqual(result.sanitized.usdtBalance, 500);
      assert.strictEqual(result.sanitized.referenceRate, 1550);
      assert.strictEqual(result.sanitized.netWorthNgn, 1775000); // 1000000 + 500*1550
      assert.ok(result.sanitized.id.startsWith('snp_'));
    });

    it('M1.12: Rejects snapshots with invalid or negative reference rates / USDT balances', () => {
      const invalidRate = utils.validateSnapshot({ bankCash: 100, usdtBalance: 50, referenceRate: -10 });
      assert.strictEqual(invalidRate.isValid, false);
      assert.ok(invalidRate.errors.some(e => e.includes('positive number')));

      const invalidUsdt = utils.validateSnapshot({ bankCash: 100, usdtBalance: -5, referenceRate: 1500 });
      assert.strictEqual(invalidUsdt.isValid, false);
      assert.ok(invalidUsdt.errors.some(e => e.includes('non-negative')));
    });
  });
}, { tier: 1, category: 'M1: Mathematical Calculation Engine' });
```
