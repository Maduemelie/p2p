# E2E Test Infrastructure & Test Suite Documentation — Net Worth & Capital Cycle System

## Overview
This document specifies the comprehensive, multi-tiered, opaque-box End-to-End (E2E) Test Infrastructure and Coverage Matrix for the **Net Worth & Capital Cycle System** in the Bybit NGN P2P Trade Tracker application, as defined in `ORIGINAL_REQUEST.md` and `PROJECT.md`.

---

## 1. Test Architecture & Harness (`test/harness/`)

The test harness is zero-dependency, isolated, and runs natively on Node.js.

### Core Modules
1. **`assertions.js`**: Zero-dependency assertion library providing `strictEqual`, `notStrictEqual`, `deepStrictEqual`, `ok`, `match`, `doesNotMatch`, `includes`, `closeTo`, `isAbove`, `isBelow`, `throws`, and async `rejects`.
2. **`test-runner.js`**: Asynchronous test execution coordinator supporting suite hierarchy, hooks (`beforeEach`, `afterEach`, `beforeAll`, `afterAll`), timing metrics, tier filtering (`--tier=1..4`), suite regex filtering (`--suite=...`), colorized terminal reporting, and exit code handling (`0` on pass, `1` on failure).
3. **`dom-mock.js`**: Headless browser runtime mock simulating `window`, `document`, `localStorage`, `CustomEvent`, `navigator.clipboard`, and DOM element event handling (`click`, `reset`, `querySelector`, `querySelectorAll`, `classList`, `dispatchEvent`).
4. **`http-mock.js`**: HTTP request and response harness for testing Vercel serverless functions (`api/*.js`) and Express route middleware (`server.js`).

---

## 2. Test Suite Directory Structure

```
test/
├── harness/
│   ├── assertions.js
│   ├── test-runner.js
│   ├── dom-mock.js
│   └── http-mock.js
├── tier1-feature-coverage/
│   ├── net-worth-features.test.js           # Features 1-15: Primary feature acceptance (90 tests)
│   ├── r1-api-security.test.js              # R1: Token authorization & 401 unauthorized
│   ├── r2-fifo-accounting.test.js           # R2: FIFO consistency & inventory protection
│   ├── r3-multi-bank-reconciliation.test.js # R3: Multi-bank assignment & ledger computation
│   ├── r4-search-navigation.test.js         # R4: RefID indexing & interactive order book
│   └── r5-offline-pwa.test.js               # R5: Complete Service Worker pre-caching
├── tier2-boundary-corner-cases/
│   ├── net-worth-boundary.test.js           # Features 1-15: Boundary & corner cases (90 tests)
│   ├── r1-boundary.test.js                  # Auth token formats, OPTIONS, special chars
│   ├── r2-boundary.test.js                  # 0 fees, empty inventory, micro-quantities, overselling
│   ├── r3-boundary.test.js                  # Empty batches, deduplication, 0 balances, multi-bank split
│   ├── r4-boundary.test.js                  # Regex search characters, form validation boundaries
│   └── r5-boundary.test.js                  # Non-GET bypass, cache migration, offline shell fallback
├── tier3-cross-feature/
│   ├── net-worth-cross-feature.test.js      # Cross-feature combinations (8 tests)
│   ├── cross-feature-combinations.test.js   # Pairwise integration flows across R1, R2, R3, R4
│   └── integration-flows.test.js            # Multi-day trading, transfer balancing, SW sync
├── tier4-real-world-scenarios/
│   ├── net-worth-merchant-lifecycle.test.js # Multi-day merchant trading & snapshot scenarios (5 tests)
│   ├── full-merchant-lifecycle.test.js      # Complete merchant daily operations journey
│   ├── arbitrage-reconciliation.test.js     # High-volume P2P arbitrage roundtrip
│   └── disaster-recovery-offline.test.js    # JSON backup/restore & offline readiness
├── challenger-*.test.js                     # Challenger stress & forensic integrity suites
└── run-tests.js                             # CLI test runner entry point
```

---

## 3. 4-Tier Feature Coverage Matrix (Features 1–15)

| # | Feature Name | Tier 1 (Feature Coverage) | Tier 2 (Boundary & Corner Cases) | Tier 3 (Cross-Feature) | Tier 4 (Real-World Scenarios) |
|---|---|---|---|---|---|
| **1** | Bank Cash Ledger Aggregation | F1.1–F1.6 (6 tests): Sum Map, Array, Object; empty collection; trade deductions; missing balances | B1.1–B1.6 (6 tests): Zero balances, overdrafts, ₦100B amounts, micro-cents, 50-bank speed, corrupted data | C1, C5, C8: Ledger + Bybit + rate valuation; reactive bank debit | S1, S2, S5: 4-day merchant capital cycle; multi-bank rebalancing |
| **2** | Bybit USDT Balance Resolution | F2.1–F2.6 (6 tests): Active ad + free balance sum; multiple ads; offline FIFO fallback; zero balances; side filter | B2.1–B2.6 (6 tests): Zero ads/free; offline empty stock; frozen qty = total stock; 10M USDT; malformed Bybit payload | C1, C7: Bybit live stock + FIFO fallback; offline transition | S1, S2: Arbitrage cycle inventory matching; opening stock |
| **3** | Real-Time Reference Rate Engine | F3.1–F3.6 (6 tests): Priority 1 (Active ad), Priority 2 (Trade), Priority 3 (FIFO), Priority 4 (Opening), Priority 5 (Fallback 1500) | B3.1–B3.6 (6 tests): 0/neg ad price; 0/neg trade rate; all sources missing; extreme micro/high rates; decimal precision | C1, C5, C7: Priority resolution across trades, active ads, and offline mode | S1, S3: Volatility revaluation; market dip rate override |
| **4** | Dual-Currency Net Worth Calculation | F4.1–F4.6 (6 tests): Exact formulas for NGN and USDT; 0 cash; 0 USDT; 0 both; decimal precision; rate <= 0 guard | B4.1–B4.6 (6 tests): 0 cash + 0 USDT; rate=0 division guard; negative rate guard; negative cash + USDT; string coercion | C1, C8: Dual currency consistency across trades & transfers | S1, S3: Naira depreciation vs Dollar purchasing power tracking |
| **5** | Snapshot Data Store & LocalStorage | F5.1–F5.6 (6 tests): saveSnapshot CRUD, getSnapshots chronological sorting, deleteSnapshot, clearSnapshots, event dispatch | B5.1–B5.6 (6 tests): Missing notes; duplicate ID replace; out-of-order timestamps; corrupted JSON; 100 snapshots; missing ID | C2, C3, C6: Snapshot lifecycle; dynamic delta updates on deletion | S1, S2, S4: Multi-day snapshot history; disaster recovery restore |
| **6** | Full Backup JSON Import/Export | F6.1–F6.6 (6 tests): exportAllData includes snapshots; replace mode; merge mode; validation; clearAllData; JSON syntax | B6.1–B6.6 (6 tests): Missing snapshots key in merge; malformed array sanitization; future timestamps; 0 snapshots; invalid payload | C4: Full export -> data wipe -> restore parity | S4: Cross-device migration and database reconstruction |
| **7** | Live Net Worth Dashboard Widget UI | F7.1–F7.6 (6 tests): Dashboard container markup; ₦ currency formatting; USDT formatting; rate badge; breakdown pills; responsiveness | B7.1–B7.6 (6 tests): 12-digit number formatting; negative NGN formatting; XSS escaping; zero state; rapid re-render | C1, C5: Live widget reflects store updates & Bybit ad sync | S1, S2: Real-time merchant dashboard monitoring |
| **8** | Reactive Live Widget Updates | F8.1–F8.6 (6 tests): BUY trade update; SELL trade update; bank initial balance update; transfer fee deduction; opening inventory update | B8.1–B8.6 (6 tests): Unknown event types; rapid fire 50 events; null detail; Bybit API failure retention; offline indicator | C5: Trade add -> Bank debit -> Bybit sync -> live UI refresh | S1, S2: Intraday reactive balance propagation |
| **9** | Live Delta Badge on Dashboard | F9.1–F9.6 (6 tests): Positive delta (+₦ and +%); negative delta (-₦ and -%); neutral 0.00%; empty baseline; reactive update; badge formatting | B9.1–B9.6 (6 tests): Baseline=0 division guard; live==snapshot 0%; +10,000% swing; negative-to-positive transition; single snapshot | C2, C6: Live delta badge reacts to snapshot saving and deletion | S1, S2: Real-time profit and performance tracking |
| **10** | "End Day / Save Snapshot" Button & Modal | F10.1–F10.6 (6 tests): Modal markup; form structure; pre-filled bank cash & USDT; open toggle; cancel close; date initialization | B10.1–B10.6 (6 tests): Repeated open idempotency; zero balance pre-fill; backdrop click; keyboard ESC close; form reset | C2, C5: Modal opens with live calculated metrics and saves to store | S1, S2: Daily close-of-business workflow |
| **11** | Interactive Reference Rate in Modal | F11.1–F11.6 (6 tests): Input modification triggers live recalculation; simultaneous NGN & USDT preview; decimal input; validation | B11.1–B11.6 (6 tests): Non-numeric string rejection; rate=0 error; negative rate; 6 decimal places; empty input preview | C2, C5: Interactive modal preview matches Net Worth engine | S1: Custom merchant rate adjustments |
| **12** | Snapshot Submission & Validation | F12.1–F12.6 (6 tests): Valid save persistence; rate > 0 rejection; date validation; custom notes persistence; toast notification; event dispatch | B12.1–B12.6 (6 tests): 1000 char notes; XSS script escaping in notes; past timestamp insertion; double-click protection; offline save | C2, C3: Snapshot saving propagates to delta badge & trend chart | S1, S2: Merchant snapshot persistence with audit notes |
| **13** | Historical Snapshot Delta Calculation | F13.1–F13.6 (6 tests): Absolute & % growth; negative deltas; division-by-zero guard; sequential chaining; identical snapshots; null inputs | B13.1–B13.6 (6 tests): 10-snapshot alternating swings; negative base values; 0s timestamp gap; both=0; missing properties | C3: Historical delta matrix computation across snapshots | S1, S2, S4: Multi-day percentage growth tracking |
| **14** | Net Worth Trend Line Chart | F14.1–F14.6 (6 tests): Empty state placeholder; chronological labels & datasets; NGN/USDT toggle; chart instance destroy; canvas presence; update | B14.1–B14.6 (6 tests): 100 historical points; multi-year dates; window resize; dataset swap; flat line scaling; single point | C3, C4: Snapshot history visual trend line rendering | S1, S4: Visual capital growth curve inspection |
| **15** | Snapshot Management / History UI | F15.1–F15.6 (6 tests): Formatted chronological list; notes & metadata rendering; delete record; intermediate delete delta recalculation; empty state | B15.1–B15.6 (6 tests): Oldest delete baseline shift; newest delete badge update; bulk clear; special chars in notes; 50+ list render | C6: Snapshot deletion dynamically updates history & badges | S4: Snapshot ledger audit and recovery |

---

## 4. Test Execution Commands

### Execute Complete Test Suite
```bash
node test/run-tests.js
```

### Execute by Specific Tier
```bash
node test/run-tests.js --tier=1   # Tier 1: Feature Coverage (188 tests)
node test/run-tests.js --tier=2   # Tier 2: Boundary & Corner Cases (129 tests)
node test/run-tests.js --tier=3   # Tier 3: Cross-Feature Combinations (14 tests)
node test/run-tests.js --tier=4   # Tier 4: Real-World Scenarios (10 tests)
```

### Execute by Suite Filter
```bash
node test/run-tests.js --suite="net worth"
node test/run-tests.js --suite=fifo
node test/run-tests.js --suite=bank
node test/run-tests.js --suite=pwa
```

---

## 5. Invariant & Quality Targets

- **Total Automated Tests**: 341 tests
- **Pass Rate**: 100.0% (341 / 341 passing)
- **Execution Time**: ~2.5 seconds
- **Codebase Integrity**: Zero production modifications under `js/` by test writer; strictly verifying specifications from `PROJECT.md` and `ORIGINAL_REQUEST.md`.
