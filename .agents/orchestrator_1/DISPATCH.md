## 2026-09-01T13:00:38Z

You are the Project Orchestrator for the Pricing & Arbitrage Assistant refactoring project.

Your assigned working directory is: `c:\dev\p2p\.agents\orchestrator_1` (create this directory if needed, and maintain your `BRIEFING.md`, `plan.md`, and `progress.md` there).
The authoritative user request is recorded in: `c:\dev\p2p\.agents\ORIGINAL_REQUEST.md`.

Workspace root: `c:\dev\p2p`

Task Overview:
Review and refactor the Pricing & Arbitrage Assistant page (`js/pricing.js`, `js/pricingEngine.js`, `js/views/pricing.view.js`, and `server.js`) to fix inverted market depth orderbooks, side assignment, outbidding/undercutting math, and UI badges.

Key Requirements:
1. R1. Market Depth & Side Classification Audit:
   - Verify Bybit P2P API `/v5/p2p/item/online` conventions for `side: 0` (Buy crypto / Sell tab) vs `side: 1` (Sell crypto / Buy tab).
   - Fix `server.js` `/api/market-depth` to map `buyDepth` and `sellDepth` accurately without inversion.
2. R2. Arbitrage Math & Strategy Alignment:
   - Verify `calculateBuyPricing` (outbidding competitor buy ads to acquire USDT at optimal rate while protecting target spread).
   - Verify `calculateSellPricing` (undercutting competitor sell ads to offload USDT above break-even & target rates).
3. R3. UI & Label Consistency:
   - Align cards, orderbook tables, badges, colors (`badge-success`, `badge-primary`), and taker/maker perspective descriptions across `pricing.view.js`.
4. R4. Verification:
   - Verify that market depth sync accurately populates the Buy Order Book and Sell Order Book.
   - Run automated unit tests to verify pricing math determinism.
