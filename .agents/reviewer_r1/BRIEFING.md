# Reviewer Briefing — Round 1 (2026-09-01)

## Mission
Adversarial review and verification of Bybit P2P active Buy and Sell ads fix.
Project Root: c:\dev\p2p
Working Dir: c:\dev\p2p\.agents\reviewer_r1

## Requirements
1. **R1. Bybit P2P API Research & Endpoint Diagnosis**:
   - Verify `/v5/p2p/item/personal/list` request payload, handling `side` ('0' for BUY, '1' for SELL, or empty/both), token parameters (`tokenId`), and response parsing.
2. **R2. Codebase Audit & Fix**:
   - Audit `server.js`, `api/ads.js`, `js/bybitService.js`, `js/dashboard.js`, and HTML templates (`index.html`, `js/views/dashboard.js`).
   - Ensure both active Buy ads and active Sell ads are reliably fetched and rendered with complete metric accuracy.
3. **R3. Verification**:
   - Verify `fetchActiveAds` returns active Buy and Sell ads.
   - Verify Dashboard UI displays Active Sell Ad and Active Buy Ad cards with full accurate metrics (live buy price, targeted USDT, fiat allocation).
   - Ensure no regressions in test suite or existing features.
