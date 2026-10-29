# E2E Test Infra: P2P Trade Limits, Bybit Ad Editing & Competitor Fill Speed Analysis

## Test Philosophy
- **Opaque-Box & Requirement-Driven**: Tests are designed strictly against system specifications and interface contracts defined in `ORIGINAL_REQUEST.md` and `PROJECT.md`, without coupling to internal private state.
- **Zero External Dependencies**: Built entirely upon the project's in-house headless test runner (`test/harness/test-runner.js`), assertion engine (`test/harness/assertions.js`), mock DOM environment (`test/harness/dom-mock.js`), and serverless request/response invoker (`test/harness/http-mock.js`).
- **Progressive Testability & Isolation**: Every test is self-contained, initializes its own clean DOM and store fixtures, cleans up after execution, and has zero execution-order dependencies.
- **Authoritative Expected Output Derivation**: Mathematical proofs (closed-interval intersection), Bybit V5 API documentation standards (`retCode: 0` vs `10005`), and quantitative queue/fill speed formulas serve as the single source of truth for all test assertions.

---

## Feature Inventory & Tier Mapping

| # | Feature | Requirements Source | Tier 1 (Feature Coverage) | Tier 2 (Boundary & Corner Cases) | Tier 3 (Cross-Feature Combinations) | Tier 4 (Real-World Scenarios) |
|---|---------|-------------------|:------------------------:|:-------------------------------:|:----------------------------------:|:----------------------------:|
| 1 | Trade Limit Inputs (Min & Max in NGN) | R1, PROJECT § Feature 1 | ≥ 5 tests | ≥ 5 tests | Included | Included |
| 2 | Trade Limit Client Storage Persistence | R1, PROJECT § Feature 2 | ≥ 5 tests | ≥ 5 tests | Included | Included |
| 3 | Trade Limit Numeric Validation (Positive, Min ≤ Max) | R1, PROJECT § Feature 3 | ≥ 5 tests | ≥ 5 tests | Included | Included |
| 4 | Bybit API Ad Editing Support (Success Scenario) | R2, PROJECT § Feature 5, 6, 8 | ≥ 5 tests | ≥ 5 tests | Included | Included |
| 5 | Bybit API Ad Editing Support (Error / Unsupported / Permission Denied) | R2, PROJECT § Feature 7, 9 | ≥ 5 tests | ≥ 5 tests | Included | Included |
| 6 | Competitor Advertisements Limit Display | R3, PROJECT § Feature 10 | ≥ 5 tests | ≥ 5 tests | Included | Included |
| 7 | Immediate Competitor Overlap Detection (`cMin ≤ uMax && cMax ≥ uMin`) | R3, PROJECT § Feature 11 | ≥ 5 tests | ≥ 5 tests | Included | Included |
| 8 | Relative Queue Position Display & Calculation | R3, PROJECT § Feature 13, 14 | ≥ 5 tests | ≥ 5 tests | Included | Included |
| 9 | Estimated Order Fill Speed Metric Display & Calculation | R3, PROJECT § Feature 15, 16 | ≥ 5 tests | ≥ 5 tests | Included | Included |

---

## Test Architecture

### 1. Harness Modules
- **Test Runner Engine (`test/harness/test-runner.js`)**:
  - Provides hierarchical test definitions: `describe(title, fn, { tier })`, `it(title, fn)`, `test(title, fn)`.
  - Supports lifecycle hooks: `beforeAll`, `afterAll`, `beforeEach`, `afterEach`.
  - CLI execution filtering by tier (`--tier=1`) and by suite name (`--suite=trade-limits`).
- **Assertion Engine (`test/harness/assertions.js`)**:
  - Strict value assertions: `assert.strictEqual`, `assert.notStrictEqual`, `assert.deepStrictEqual`.
  - Predicate & range checks: `assert.ok`, `assert.closeTo`, `assert.isAbove`, `assert.isBelow`, `assert.includes`, `assert.match`.
  - Exception handling: `assert.throws`, `assert.doesNotThrow`, `assert.rejects`.
- **DOM & Browser Emulation (`test/harness/dom-mock.js`)**:
  - Full headless DOM simulation (`MockDocument`, `MockElement`, `MockWindow`, `MockLocalStorage`, `MockCustomEvent`).
  - Seamless DOM lifecycle initialization via `setupDomEnvironment()`.
- **HTTP & Serverless Proxy Mock (`test/harness/http-mock.js`)**:
  - Emulates Express and Vercel serverless request/response lifecycles via `MockRequest`, `MockResponse`, and `invokeServerlessHandler()`.

### 2. Test File Layout
- **Feature & Integration Suite**: `test/tier1-feature-coverage/trade-limits-and-competitors.test.js`
  - Encapsulates comprehensive suites across Tiers 1, 2, 3, and 4.
- **Suite Registration**: Embedded directly in `test/run-tests.js` within the Tier 1 suite list.

---

## Real-World Application Scenarios (Tier 4)

| # | Scenario | Features Exercised | Expected Outcome |
|---|----------|--------------------|------------------|
| 1 | Full User Flow: Configure Limits → Evaluate Depth → Update Ad | F1, F2, F3, F6, F7, F8, F9, F4 | Configured limits (₦15k–₦40k) filter 10 live market ads into immediate competitors, compute queue rank and fill speed, and pre-fill Bybit ad update payload. |
| 2 | Non-Merchant / Read-Only Key Ad Update Graceful Handling | F4, F5, F8 | Attempting ad update with read-only key triggers `retCode: 10005`, presenting user-friendly limitation status and guidance to Bybit Merchant Portal. |
| 3 | Order Book Depth Influx & Dynamic Queue Re-ranking | F1, F6, F7, F8, F9 | Real-time arrival of new competitor ads within user limits dynamically degrades queue rank and recalculates estimated fill speed from "Very Fast" to "Moderate". |
| 4 | Order Immutability Enforcement | F4, F5, F8 | Validates that active matched trade orders are strictly blocked from modification, maintaining protocol immutability contract. |
| 5 | Cross-Session Limit Persistence & View Re-hydration | F1, F2, F3, F7 | Custom user trade limits persist across storage clears/reloads, automatically re-hydrating input fields and filtering competitor depth immediately on load. |

---

## Coverage Thresholds
- **Tier 1 (Feature Coverage)**: ≥ 5 distinct tests per feature (minimum 45 tests across all 9 features).
- **Tier 2 (Boundary & Corner Cases)**: ≥ 5 distinct tests per feature / boundary condition (minimum 35 tests covering inverted bounds, zero/negative, exact touching, empty books, tied pricing, missing/infinite limits).
- **Tier 3 (Cross-Feature Combinations)**: Multi-feature reactive state synchronization (e.g. dynamic limit changes recalculating queue position and updating ad update payloads).
- **Tier 4 (Real-World Scenarios)**: Realistic end-to-end user journeys exercising end-to-end arbitrage workflows.
- **Pass Threshold**: 100% pass rate with 0 regressions on baseline suites.
