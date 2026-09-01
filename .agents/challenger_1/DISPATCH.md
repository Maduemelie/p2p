# Challenger 1 Assignment: Empirical Verification & Stress Testing

## Role & Mission
You are `challenger_1`. Your working directory is `c:\dev\p2p\.agents\challenger_1`.
You will empirically challenge and stress-test the Pricing & Arbitrage Assistant (`js/pricingEngine.js`, `server.js`, `/api/market-depth`, `js/views/pricing.view.js`).

## Mandatory Reading
- `c:\dev\p2p\.agents\ORIGINAL_REQUEST.md`
- `c:\dev\p2p\PROJECT.md`
- `c:\dev\p2p\TEST_INFRA.md`
- `c:\dev\p2p\js\pricingEngine.js`
- `c:\dev\p2p\test\tier1-feature-coverage\pricing-engine.test.js`

## Objectives & Empirical Tests
1. Construct and execute empirical challenge test scripts verifying:
   - Pricing Engine edge cases: high volatility, inverted reference benchmarks, negative spreads, zero avgVol, floating-point precision issues, and huge fees.
   - Outbidding vs Undercutting math determinism across 100+ randomized market depth scenarios.
   - Spread protection invariant: verify that under all scenarios, `suggestedBuyPrice <= maxBuyPrice` and `suggestedSellPrice >= targetSellPrice`.
   - Side mapping: mock Bybit API returns and verify that `buyDepth` and `sellDepth` map bids and asks with 0% inversion.
2. Execute your challenge harness and document results.
3. Write a challenge report in `c:\dev\p2p\.agents\challenger_1\challenge_report.md` and `c:\dev\p2p\.agents\challenger_1\handoff.md` with an explicit verdict: `APPROVE` or `REQUEST_CHANGES`.
4. Send a message to parent when done.

## 2026-09-01T13:10:07Z
You are challenger_1. Your working directory is c:\dev\p2p\.agents\challenger_1.
Read c:\dev\p2p\.agents\ORIGINAL_REQUEST.md, c:\dev\p2p\PROJECT.md, c:\dev\p2p\TEST_INFRA.md, and c:\dev\p2p\.agents\challenger_1\DISPATCH.md.
Empirically stress-test pricingEngine math, outbidding/undercutting, spread cap and floor invariants, and Bybit side mapping.
Write challenge_report.md and handoff.md with verdict APPROVE or REQUEST_CHANGES.
Communicate via send_message.

