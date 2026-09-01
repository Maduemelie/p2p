# Task Assignment: Worker 2 — Pricing Engine Test Suite Remediation

## Role & Mission
You are `worker_2`. Your working directory is `c:\dev\p2p\.agents\worker_2`.
You are tasked with applying the test suite flattening remediation to `test/tier1-feature-coverage/pricing-engine.test.js` and verifying test execution.

## Mandatory Reading
- `c:\dev\p2p\.agents\ORIGINAL_REQUEST.md`
- `c:\dev\p2p\PROJECT.md`
- `c:\dev\p2p\TEST_INFRA.md`
- `c:\dev\p2p\.agents\auditor_1\audit_report.md`
- `c:\dev\p2p\.agents\auditor_1\handoff.md`
- `c:\dev\p2p\.agents\explorer_it2_1\remediation_report.md`
- `c:\dev\p2p\.agents\explorer_it2_2\remediation_report.md`
- `c:\dev\p2p\.agents\explorer_it2_3\remediation_report.md`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Tasks & Files Owned Exclusively
1. `test/tier1-feature-coverage/pricing-engine.test.js`:
   - Refactor the file to use a single top-level `describe('Tier 1 — Pricing & Arbitrage Engine Unit Tests', ...)` block without nested `describe()` blocks, following the project convention (e.g. `r1-m1-calculation-engine.test.js`).
   - Ensure the `beforeEach` hook imports `../../js/pricingEngine.js` into the suite-level `pricingEngine` variable.
   - Include all 23-25 comprehensive unit test cases covering:
     - `filterCompetitorAds` (dust filtering `< max(2.0, avgVol * 0.05)`, trade limits filtering against tradeAmount, limit bypass).
     - `calculateReferencePrice` (top-1 competitor, SMA-N, VWAP-N, empty list fallback, zero volume fallback, invalid mode fallback).
     - `calculateBuyPricing` (+₦0.10 outbid, `maxBuyPrice = exitPrice - targetSpread - feePerUnit` ceiling, `isSafe` flag, excess spread calculation, offline/empty depth fallback).
     - `calculateSellPricing` (-₦0.10 undercut, `breakEven = costBasis + feePerUnit`, `targetSellPrice = costBasis + targetSpread + feePerUnit` floor, `isSafe` flag, missing cost basis guard, missing competitors fallback).
     - Boundary & extreme conditions (zero volume, negative spreads, extreme fees, invalid inputs).
2. Execute the test suite:
   - Run `node test/run-tests.js --tier=1` and ensure all tests in `pricing-engine.test.js` pass with 0 errors.
   - Run `node test/run-tests.js`.
3. Document your changes, commands run, and outputs in `c:\dev\p2p\.agents\worker_2\changes.md` and `handoff.md`.
4. Send a message to parent when done.
