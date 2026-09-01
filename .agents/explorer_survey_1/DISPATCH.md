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
