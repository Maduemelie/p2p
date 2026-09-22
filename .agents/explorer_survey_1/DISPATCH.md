# Task Assignment: Survey Explorer 1 - Server & Bybit P2P API Depth Mapping

## Role & Mission
You are `explorer_survey_1`. Your working directory is `c:\dev\p2p\.agents\explorer_survey_1`.
You are conducting a survey of `server.js` and the Bybit P2P API integration.

## Reference Files to Read
- `c:\dev\p2p\.agents\ORIGINAL_REQUEST.md`
- `c:\dev\p2p\server.js`
- Any related API routes, helpers, or config in `c:\dev\p2p`

## Objectives
1. Read `ORIGINAL_REQUEST.md` completely.
2. Investigate `server.js` and specifically `/api/market-depth` and any Bybit P2P `/v5/p2p/item/online` API calls.
3. Investigate Bybit P2P API conventions:
   - What does `side: "0"` vs `side: "1"` (or `side: 0` vs `side: 1`) mean in Bybit P2P API `/v5/p2p/item/online`?
   - In Bybit P2P: Is `side: 0` Buy or Sell from the merchant/ad perspective vs taker perspective? (e.g. Bybit P2P: side 0 = Buy ad / user sells to merchant, side 1 = Sell ad / user buys from merchant).
   - How does `server.js` currently fetch, map, label, and return `buyDepth` and `sellDepth`?
   - Identify whether `buyDepth` and `sellDepth` are currently inverted in `server.js`.
# Task Assignment: Survey Explorer 1 - Server & Bybit P2P API Depth Mapping

## Role & Mission
You are `explorer_survey_1`. Your working directory is `c:\dev\p2p\.agents\explorer_survey_1`.
You are conducting a survey of `server.js` and the Bybit P2P API integration.

## Reference Files to Read
- `c:\dev\p2p\.agents\ORIGINAL_REQUEST.md`
- `c:\dev\p2p\server.js`
- Any related API routes, helpers, or config in `c:\dev\p2p`

## Objectives
1. Read `ORIGINAL_REQUEST.md` completely.
2. Investigate `server.js` and specifically `/api/market-depth` and any Bybit P2P `/v5/p2p/item/online` API calls.
3. Investigate Bybit P2P API conventions:
   - What does `side: "0"` vs `side: "1"` (or `side: 0` vs `side: 1`) mean in Bybit P2P API `/v5/p2p/item/online`?
   - In Bybit P2P: Is `side: 0` Buy or Sell from the merchant/ad perspective vs taker perspective? (e.g. Bybit P2P: side 0 = Buy ad / user sells to merchant, side 1 = Sell ad / user buys from merchant).
   - How does `server.js` currently fetch, map, label, and return `buyDepth` and `sellDepth`?
   - Identify whether `buyDepth` and `sellDepth` are currently inverted in `server.js`.
4. Check if there are any other endpoints or server logic related to pricing or market depth.
5. Check existing tests in the repo (e.g., in `tests/` or package.json test scripts) and how they test `server.js`.
6. Write a comprehensive survey report to `c:\dev\p2p\.agents\explorer_survey_1\survey_report.md` and a self-contained `handoff.md`. Include concrete file paths, line numbers, and findings.
7. Send a message to your parent when done.

## 2026-09-18T08:17:07Z
You are Explorer 1 (Engine Survey Explorer).
Your Working Directory: c:\dev\p2p\.agents\explorer_survey_1
Original Request Path: c:\dev\p2p\.agents\ORIGINAL_REQUEST.md

Objective:
Investigate the mathematical modeling, fee structures, and existing pricing engine logic for the P2P Sweet Spot Pricing Redesign (focusing on Requirement R1 and engine math).

Scope & Instructions:
1. First, read c:\dev\p2p\.agents\ORIGINAL_REQUEST.md (especially header ## 2026-09-18T08:06:58Z).
2. Examine c:\dev\p2p\js\pricingEngine.js and related modules in c:\dev\p2p\js\ to understand existing pricing calculations, fee constants (0.3% maker fee on buy side, fiat inflow/outflow fees, stamp duty), VWAP, and tier solvers.
3. Examine existing unit tests in c:\dev\p2p\test\ (e.g. test/tier1-feature-coverage/pricing-engine.test.js, test/invariants/, etc.) to see how pricing engine is tested and what invariants must be maintained.
4. Formulate the precise mathematical formulas for R1:
   - Sell Sweet Spot: targeting Rank 3-5 median/cluster in Sell Order Book (Maker sell / Taker buy).
   - Buy Sweet Spot & Maximum Safe Buy Rate: Sell Sweet Spot - Profit Target - Platform Maker Fees (0.3% default on buy side) - Fiat Transfer Fees.
   - Average Buy Guidance: average buy rate target to guarantee locked profit target over cycle.
   - Spread compression handling: capping at maxBuyPrice and alert signaling when market buy sweet spot > safe ceiling.
   - Effective revenue vs. effective cost: ensuring (Effective Sell Revenue - Effective Buy Cost) >= Target Profit.
5. Identify any edge cases (e.g., small order book depth < 5 orders, zero or negative spread, volume brackets).
6. Write a comprehensive analysis report to c:\dev\p2p\.agents\explorer_survey_1\analysis.md and your completion handoff to c:\dev\p2p\.agents\explorer_survey_1\handoff.md.
7. Send a completion message back to the orchestrator.
Do NOT modify any source code files. You are an exploratory read-only investigator.

## 2026-09-18T08:29:26Z
[CRITICAL SPECIFICATION UPDATE from parent 286d5d9d-ca4a-46cf-9d10-84380adc4108]
The user explicitly instructed to PRESERVE and seamlessly integrate existing UI & calculation components into the new sweet-spot driven design:
1. Buyback Session Progress Bar (Progress %, Volume acquired vs goal, session start time).
2. The 6-Card Metrics Grid: Bought So Far ($USDT + Avg rate), Remaining Needed ($USDT + Naira Budget), Required Rate (Needed for target average), Target Avg Buy (Sweet spot buy benchmark), Target Sell Rate (Sweet spot sell benchmark + Gross spread Δ), Net Profit (After Fees) (Realized net profit per USDT after 0.3% maker fee & fiat fee).
3. Market Guidance Diagnostics Banner: Real-time comparison between target rates and live order book top bids/asks.
4. The 3-Tier Limit Ladder Cards: Tier 1: Target / Fast Fill (40%), Tier 2: Mid-Discount (40%), Tier 3: Deep-Discount (20%).
5. Live Order Book Depth Tables with visual indicators.

Engine integration:
- Primary inputs: Profit Target (₦/USDT) and Total Volume Goal (USDT).
- Engine anchors on live Order Book Sell Sweet Spot (Rank 3–5 median/cluster in Sell book):
  * Sell Target = Sell Sweet Spot
  * Target Avg Buy = Sell Target - Profit Target - Fees
  * Live trade progress calculates exact Required Rate for remaining USDT
  * Tiers 1, 2, 3 anchor to this required rate.
See ORIGINAL_REQUEST.md under ## 2026-09-18T08:26:31Z.
Action: Ensure your mathematical analysis and formulas integrate this anchor logic and tier ladder calculations.


