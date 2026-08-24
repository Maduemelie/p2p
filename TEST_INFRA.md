# E2E Test Infrastructure & Test Suite Documentation

## Overview
The Bybit NGN P2P Trade Tracker test suite provides comprehensive, multi-tiered, opaque-box end-to-end (E2E) verification for Requirements R1 through R5 as specified in `ORIGINAL_REQUEST.md`.

---

## 1. Test Architecture & Harness (`test/harness/`)

The test infrastructure is zero-dependency, self-contained, and runs natively on Node.js.

### Components
1. **`assertions.js`**: Core assertion library providing `strictEqual`, `notStrictEqual`, `deepStrictEqual`, `ok`, `match`, `doesNotMatch`, `includes`, `closeTo`, `isAbove`, `isBelow`, `throws`, and `rejects`.
2. **`test-runner.js`**: Test suite execution coordinator supporting synchronous and asynchronous test cases, hooks (`beforeEach`, `afterEach`, `beforeAll`, `afterAll`), execution timing, colorized reporting, and exit code handling (`0` for success, `1` for failures).
3. **`dom-mock.js`**: Headless browser runtime mock simulating `window`, `document`, `localStorage`, `CustomEvent`, `navigator.clipboard`, and DOM element event delegation (`click`, `reset`, `querySelector`, `querySelectorAll`, `classList`, `dispatchEvent`).
4. **`http-mock.js`**: HTTP request and response harness for testing Vercel serverless functions (`api/*.js`) and Express route middleware (`server.js`) with custom headers and status codes.

---

## 2. Test Tier Structure

The test suite is structured into 4 distinct tiers:

```
test/
├── harness/
│   ├── assertions.js
│   ├── test-runner.js
│   ├── dom-mock.js
│   └── http-mock.js
├── tier1-feature-coverage/
│   ├── r1-api-security.test.js              # R1: Token authorization & 401 unauthorized
│   ├── r2-fifo-accounting.test.js           # R2: FIFO consistency & inventory protection
│   ├── r3-multi-bank-reconciliation.test.js # R3: Multi-bank assignment & ledger computation
│   ├── r4-search-navigation.test.js         # R4: RefID indexing & interactive order book
│   └── r5-offline-pwa.test.js               # R5: Complete Service Worker pre-caching
├── tier2-boundary-corner-cases/
│   ├── r1-boundary.test.js                  # Auth token formats, OPTIONS, special chars
│   ├── r2-boundary.test.js                  # 0 fees, empty inventory, micro-quantities, overselling
│   ├── r3-boundary.test.js                  # Empty batches, deduplication, 0 balances, multi-bank split
│   ├── r4-boundary.test.js                  # Regex search characters, form validation boundaries
│   └── r5-boundary.test.js                  # Non-GET bypass, cache migration, offline shell fallback
├── tier3-cross-feature/
│   ├── cross-feature-combinations.test.js   # Pairwise integration flows across R1, R2, R3, R4
│   └── integration-flows.test.js            # Multi-day trading, transfer balancing, SW sync
├── tier4-real-world-scenarios/
│   ├── full-merchant-lifecycle.test.js      # Complete merchant daily operations journey
│   ├── arbitrage-reconciliation.test.js     # High-volume P2P arbitrage roundtrip
│   └── disaster-recovery-offline.test.js    # JSON backup/restore & offline readiness
└── run-tests.js                             # CLI test runner entry point
```

---

## 3. Test Execution Commands

### Run Full Test Suite
```bash
node test/run-tests.js
# OR
npm test
```

### Run by Specific Tier
```bash
node test/run-tests.js --tier=1   # Run Tier 1 Feature Coverage tests
node test/run-tests.js --tier=2   # Run Tier 2 Boundary & Corner Cases
node test/run-tests.js --tier=3   # Run Tier 3 Cross-Feature Combinations
node test/run-tests.js --tier=4   # Run Tier 4 Real-World Scenarios
```

### Run by Test Suite Filter
```bash
node test/run-tests.js --suite=security
node test/run-tests.js --suite=fifo
node test/run-tests.js --suite=bank
node test/run-tests.js --suite=search
node test/run-tests.js --suite=pwa
```

---

## 4. Test Suite Coverage Metrics

| Tier | Focus Area | Suites | Tests | Invariant Targets |
|---|---|---|---|---|
| **Tier 1** | Feature Coverage | 5 | 27 | Primary acceptance criteria for R1, R2, R3, R4, R5 |
| **Tier 2** | Boundary & Corner Cases | 5 | 26 | Empty inputs, auth header variations, 0 fees, micro USDT, deduplication, regex search |
| **Tier 3** | Cross-Feature Combinations | 2 | 6 | Multi-bank batch import -> FIFO -> RefID Search -> Pricing Assistant |
| **Tier 4** | Real-World Scenarios | 3 | 4 | Merchant full day lifecycle, arbitrage reconciliation, backup/restore parity |
| **Total** | **All Tiers** | **15** | **63** | **100% Opaque-Box Coverage across R1-R5** |
