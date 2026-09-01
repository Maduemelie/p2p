## 2026-09-01T11:18:05Z

You are the SWE Light Orchestrator for the Bybit NGN P2P Trade Tracker project.
Your working directory is: c:\dev\p2p\.agents\swe_2 (ensure you initialize your BRIEFING.md, plan.md, and progress.md here).
Project root: c:\dev\p2p
Original request file: c:\dev\p2p\.agents\ORIGINAL_REQUEST.md

Mission:
Research Bybit P2P API endpoints (specifically `/v5/p2p/item/personal/list` and related active ad list APIs), review the Bybit P2P Tracker codebase (`server.js`, `js/bybitService.js`, `js/dashboard.js`), diagnose why active Buy Ads on Bybit are not returning or displaying in the app, and fix the code to correctly fetch and display both Buy and Sell active ads.

Requirements:
### R1. Bybit P2P API Research & Endpoint Diagnosis
Inspect the actual Bybit P2P API request/response structures for personal advertisements (`POST /v5/p2p/item/personal/list` or alternative endpoints).
- Determine exact payload fields required by Bybit to return active Buy ads (`side=0` vs `side=1`, `side="BUY"`, `side="SELL"`, token, etc.).
- Identify why current requests return empty lists for active Buy ads.

### R2. Codebase Audit & Fix
- Audit `server.js` (proxy server endpoints) and `js/bybitService.js` / `js/dashboard.js`.
- Modify the proxy server and client-side sync logic so both active Buy ads and active Sell ads are reliably fetched and rendered.

### R3. Verification
- Verify that `fetchActiveAds` correctly returns active Buy ads.
- Verify that the Dashboard UI displays both Active Sell Ad and Active Buy Ad cards with full accurate metrics (live buy price, targeted USDT, fiat allocation).

Acceptance Criteria:
- [ ] Active Buy ads created on Bybit are successfully fetched by the proxy server and rendered on the Dashboard.
- [ ] Active Sell ads continue to work without regression.
- [ ] No syntax errors, uncaught promise rejections, or broken UI elements on the Dashboard.
- [ ] All test suites pass.

Please execute the SWE Light loop: dispatch the implementer, run reviewer rounds with test execution, verify against acceptance criteria, and notify the Sentinel via send_message upon completion.
