# Implementer Briefing: Bybit NGN P2P Active Buy & Sell Ads Fix

## Context & Objectives
Diagnose and fix the Bybit Active Buy Ads issue in the Bybit NGN P2P Trade Tracker project.
Specifically:
1. Research and diagnose Bybit P2P personal ads endpoint (`POST /v5/p2p/item/personal/list` or related active ad endpoints).
2. Determine exact payload structures and parameters for querying active personal ads (Buy vs Sell, status, side, pagination, etc.).
3. Update server proxy handlers (`server.js`, `api/ads.js`, `api/balance.js`) and client services (`js/bybitService.js`, `js/dashboard.js`, `js/views/dashboard.view.js`).
4. Ensure both Active Buy and Active Sell ads are correctly retrieved, processed, and rendered in the Dashboard UI.
5. Ensure coin balance locking logic correctly considers sell ads (and handles buy ads appropriately).
6. Verify with test suites and add automated tests covering ad handling.

## Key Files to Investigate & Modify
- `server.js` (Proxy endpoints for `/api/ads`, `/api/balance`)
- `api/ads.js` / `api/balance.js` (Vercel serverless / API handlers if applicable)
- `js/bybitService.js` (`fetchActiveAds`, payload construction, response parsing)
- `js/dashboard.js` (`renderActiveAds`, calculations for locked balance, live metrics)
- `js/views/dashboard.view.js` (UI template for active ads cards)
- `test/` (Suite test files)
