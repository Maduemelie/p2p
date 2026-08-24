# E2E Test Infrastructure & Test Suite Plan

## Objective
Design and implement an opaque-box, multi-tier End-to-End (E2E) Test Suite for Requirements R1 through R5 for the Bybit NGN P2P Trade Tracker.

---

## 1. Requirements Matrix & Test Scope

| Requirement | Scope | Key Validation Invariants |
|---|---|---|
| **R1: API Proxy Security & Token Authorization** | `/api/balance`, `/api/orders`, `/api/ads`, `/api/market-depth`, Express & Vercel | Direct unauthenticated requests return `401 Unauthorized`. Valid auth token grants access. Frontend bybitService attaches authorization headers. |
| **R2: FIFO Accounting Consistency & Inventory Protection** | `calculateFIFOInventoryAndPnL`, Dashboard, Pricing Assistant, Ads Monitor | FIFO cost basis alignment across all views. Opening inventory localStorage is protected from automatic overwrite during sync. Projected profit on sell ads calculates with ₦0 fee. |
| **R3: Comprehensive Multi-Bank Order Reconciliation** | Order Import Modal, Bank Accounts CRUD, Ledger computation | Bank assignment available for BOTH BUY and SELL orders during import. Cash inflows and outflows credited/debited to selected bank accounts. |
| **R4: Search, Navigation & Interactive Order Book UX** | Trade History search, Pricing Assistant order book, Record Trade form | Search indexes Bybit Order ID (`refId`) with immediate matching. Clicking order book row navigates to trade form pre-filled with rate & volume. Cancel/Back button available on trade form. |
| **R5: Complete Offline PWA Pre-caching** | Service Worker `sw.js`, cache manifest, offline fallback | Cache manifest pre-caches all `js/*.js` controller files and `js/views/*.js` view templates. App shell loads and navigates offline. |

---

## 2. Test Architecture & Tier Structure

### Test Harness Components (`test/harness/`)
- `assertions.js`: Lightweight, zero-dependency assertion library with comprehensive equality, error, and pattern matching.
- `test-runner.js`: Test runner engine supporting synchronous and asynchronous test cases, tier grouping, timing, CLI filtering (`--tier=N`, `--suite=name`), colorized reporting, and exit code handling.
- `dom-mock.js`: Headless browser/DOM runtime providing localStorage, CustomEvents, DOM query helpers, and UI event simulation for client controllers.
- `http-mock.js`: Node.js HTTP client and mock server harness for testing Express and Vercel serverless endpoints.

### Tier Breakdown
1. **Tier 1: Feature Coverage (>=5 tests per requirement R1-R5, >=25 tests)**
   - Verification of primary acceptance criteria and specifications for each feature.
2. **Tier 2: Boundary & Corner Cases (>=5 tests per requirement R1-R5, >=25 tests)**
   - Edge inputs, 0 fees, token format variations, unmatched inventories, duplicate refIds, special regex search strings, cache upgrades.
3. **Tier 3: Cross-Feature Combinations (Pairwise integration)**
   - Multi-module workflows combining API security, batch import, FIFO engine, search by refId, pricing assistant, and offline shell.
4. **Tier 4: Real-World Application Scenarios (Full E2E user journeys)**
   - Full merchant daily operations, arbitrage cycles, high-frequency trade reconciliations, disaster recovery backup/restore.

---

## 3. Implementation Steps

1. Build `test/harness/assertions.js`, `test/harness/test-runner.js`, `test/harness/dom-mock.js`, and `test/harness/http-mock.js`.
2. Implement Tier 1 test suites in `test/tier1-feature-coverage/`:
   - `r1-api-security.test.js`
   - `r2-fifo-accounting.test.js`
   - `r3-multi-bank-reconciliation.test.js`
   - `r4-search-navigation.test.js`
   - `r5-offline-pwa.test.js`
3. Implement Tier 2 test suites in `test/tier2-boundary-corner-cases/`:
   - `r1-boundary.test.js`
   - `r2-boundary.test.js`
   - `r3-boundary.test.js`
   - `r4-boundary.test.js`
   - `r5-boundary.test.js`
4. Implement Tier 3 test suites in `test/tier3-cross-feature/`:
   - `cross-feature-combinations.test.js`
   - `integration-flows.test.js`
5. Implement Tier 4 test suites in `test/tier4-real-world-scenarios/`:
   - `full-merchant-lifecycle.test.js`
   - `arbitrage-reconciliation.test.js`
   - `disaster-recovery-offline.test.js`
6. Implement root test runner `test/run-tests.js` and wire `"test": "node test/run-tests.js"` in `package.json`.
7. Generate `TEST_INFRA.md` and `TEST_READY.md` at project root.
8. Execute full test suite, verify execution and report findings.
