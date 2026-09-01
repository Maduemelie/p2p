# Task Assignment: Worker 1 — Pricing & Arbitrage Assistant Implementation & Testing

## Role & Mission
You are `worker_1`. Your working directory is `c:\dev\p2p\.agents\worker_1`.
You will implement the necessary improvements across `server.js`, `api/market-depth.js`, `js/views/pricing.view.js`, and create the comprehensive pricing engine unit test suite in `test/tier1-feature-coverage/pricing-engine.test.js`.

## Mandatory Reading
- `c:\dev\p2p\.agents\ORIGINAL_REQUEST.md`
- `c:\dev\p2p\PROJECT.md`
- `c:\dev\p2p\TEST_INFRA.md`
- `c:\dev\p2p\.agents\explorer_survey_1\survey_report.md`
- `c:\dev\p2p\.agents\explorer_survey_2\survey_report.md`
- `c:\dev\p2p\.agents\spec_miner_survey_1\spec_report.md`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Tasks & Files Owned Exclusively
1. `server.js` & `api/market-depth.js`:
   - Verify and ensure Bybit P2P API `/v5/p2p/item/online` conventions (`side: '1'` for `buyDepth` bids, `side: '0'` for `sellDepth` asks).
   - Add resilient response parsing (`extractItems` helper checking `items`, `list`, `rows`, `data`).
   - Add clear comments explaining Bybit taker vs maker perspective so future maintainers understand the mapping.
2. `js/views/pricing.view.js`:
   - Fix badge class in line 154: Change `<span class="badge badge-buy">Outflow</span>` to `<span class="badge badge-sell">Outflow</span>` (or `badge-primary` / theme badge aligned with Inflow `badge-primary` on line 112).
   - Ensure all orderbook tables, badges, colors, and maker/taker descriptions are clean and consistent.
3. `test/tier1-feature-coverage/pricing-engine.test.js`:
   - Write comprehensive unit tests for `js/pricingEngine.js` using the project's test framework (`test/harness/test-runner.js`).
   - Test `filterCompetitorAds` (dust filtering `< max(2.0, avgVol * 0.05)`, limit filtering against trade amount).
   - Test `calculateReferencePrice` with `competitor` (top 1), `avg-N` (SMA), `vwap-N` (VWAP), and empty array handling.
   - Test `calculateBuyPricing`:
     - Outbids reference by +0.10.
     - Enforces `maxBuyPrice = exitPrice - targetSpread - feePerUnit`.
     - Sets `isSafe` flag accurately (true if raw <= maxBuyPrice, false otherwise).
     - Calculates expected profit and unit fee correctly.
   - Test `calculateSellPricing`:
     - Undercuts reference by -0.10.
     - Enforces `breakEvenPrice = costBasis + feePerUnit` and `targetSellPrice = costBasis + targetSpread + feePerUnit`.
     - Sets `isSafe` flag accurately (true if raw >= targetSellPrice, false otherwise).
     - Calculates expected profit and unit fee correctly.
   - Test boundary and corner cases (zero volume, negative spreads, extreme fees, outbid exceeding max buy, undercut below break-even).
4. Run the test suite:
   - Execute `node test/run-tests.js` to ensure 100% tests pass (including existing security and accounting tests).
5. Document all changes, commands run, and test outputs in `c:\dev\p2p\.agents\worker_1\changes.md` and write a complete `handoff.md`.
6. Send a message to your parent when done.
