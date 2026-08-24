## 2026-08-24T17:58:05Z
You are the Milestone 4 Worker specializing in Search, Navigation & Interactive Order Book UX.
Your Working Directory: c:\dev\p2p\.agents\worker_m4\

Read:
- ORIGINAL_REQUEST.md at c:\dev\p2p\ORIGINAL_REQUEST.md
- PROJECT.md at c:\dev\p2p\PROJECT.md
- Survey UI Analysis at c:\dev\p2p\.agents\survey_ui\analysis.md
- TEST_READY.md at c:\dev\p2p\TEST_READY.md

Exclusive Write Ownership:
- js/history.js
- js/views/history.view.js
- js/pricing.js
- js/trades.js
- js/views/addTrade.view.js
- js/app.js

Mandatory Integrity Warning:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Mission & Implementation Requirements:
1. Trade History refId Search (js/history.js & js/views/history.view.js):
   - In js/history.js renderTradeHistory() filter: index trade.refId (Bybit Order ID) and trade.id in search matching so that searching or pasting a refId instantly filters to the matching trade.
   - In js/history.js card details drawer, render Bybit Order ID badge when refId exists.
   - In js/views/history.view.js, update search input placeholder to indicate Order ID (refId) search.
2. Interactive Order Book Row Click Navigation (js/pricing.js, js/trades.js, js/views/pricing.view.js):
   - In js/pricing.js renderOrderBooks(), add data attributes (data-direction, data-rate, data-volume, data-counterparty) to Buy and Sell order book rows.
   - Buy order book rows (bids) -> direction = 'SELL'.
   - Sell order book rows (asks) -> direction = 'BUY'.
   - Clicking an order book row calls window.prefillTradeForm({ direction, rate, usdtAmount, counterparty }).
   - In js/trades.js, implement prefillTradeForm() (and attach to window.prefillTradeForm): sets rate, volume, ngn, counterparty, direction toggle, recalculates trade summary, and calls window.switchView('add-trade').
3. Record Trade Form Cancel/Back Navigation (js/views/addTrade.view.js, js/trades.js, js/app.js):
   - In js/views/addTrade.view.js, add #btn-cancel-trade (Back button) in the view header and #btn-form-cancel in the form actions.
   - In js/app.js, track previousView during tab transitions.
   - Wire click handlers for cancel/back buttons to reset form and navigate back to previousView (defaulting to 'dashboard').
4. Verification:
   - Run: node test/run-tests.js --suite=search
   - Run: node test/run-tests.js
   - Verify that all search, navigation, and order book tests pass.

Write your report to c:\dev\p2p\.agents\worker_m4\handoff.md and send a handoff message when done.
