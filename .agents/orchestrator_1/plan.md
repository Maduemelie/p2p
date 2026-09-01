# Plan — Pricing & Arbitrage Assistant Refactoring

## Objectives
1. Perform comprehensive survey of the codebase (`server.js`, `js/pricing.js`, `js/pricingEngine.js`, `js/views/pricing.view.js`, tests, api endpoints).
2. Establish `PROJECT.md` with Feature Inventory, Architecture, Milestone Decomposition, and Interface Contracts.
3. Establish `TEST_INFRA.md` and E2E / Unit testing strategy.
4. Execute milestones:
   - M1: Server Bybit P2P market depth side mapping (`server.js` `/api/market-depth`).
   - M2: Pricing engine mathematical models (`calculateBuyPricing`, `calculateSellPricing`, spread protection, undercutting/outbidding rules).
   - M3: UI / View rendering consistency (`pricing.view.js`, `pricing.js` DOM elements, badges, maker/taker labels, orderbook display).
   - Final: 100% test pass verification and adversarial hardening.
5. Synthesize results and report.
