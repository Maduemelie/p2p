# SWE Light Orchestrator Handoff Report: Bybit Active Buy & Sell Ads

## 1. Summary
The Bybit NGN P2P Trade Tracker has been upgraded to reliably fetch, process, and render both active Buy and Sell ads across backend proxy endpoints, client service layers, and the Dashboard UI.

## 2. Root Cause Analysis
1. **Side-Specific Filtering**: Bybit OpenAPI endpoint `/v5/p2p/item/personal/list` requires explicit side querying (`side: 0`/`'0'` for Buy, `side: 1`/`'1'` for Sell). Previous proxy implementations hardcoded `side: '1'` or defaulted to single-side fetches.
2. **Shape Inconsistencies & Numerical Formatting**: Upstream Bybit responses vary in response wrappers (`result`, `result.items`, `result.list`, `result.rows`, `result.data`, `result.records`), ad ID field names (`id`, `itemId`, `adId`, `advId`, `idStr`), side indicators (`side: 0/1`, `tradeType: "BUY"/"SELL"`, `sideName: "BUY"/"SELL"`), and comma-delimited strings in price/quantities.
3. **UI Missing Buy Ad Card Elements**: Dashboard view previously only rendered an active Sell ad card, lacking the dedicated Active Buy Ad card and associated live metrics.
4. **Race Conditions & Multiple Ad Allocations**: Rapid manual refreshes lacked monotonic sequence tokens to discard out-of-order promise resolution, and merchant accounts with multiple active sell ads only tracked the first ad for inventory allocation.

## 3. Key Changes
- **`server.js` & `api/ads.js`**:
  - Implemented dual concurrent querying for both Buy (`side: 0` / `'0'`) and Sell (`side: 1` / `'1'`) ads.
  - Implemented robust `extractItems` wrapper unwrapping and `addItemsToMap` ID deduplication.
  - Added auto-pagination logic for merchants with >30 active advertisements.
  - Enhanced `/api/balance` to accurately query and compute `lockedInAds` across all active sell ads.
- **`js/bybitService.js`**:
  - Enhanced `fetchActiveAds` to pass query and body parameters and handle all array/object wrapper formats.
- **`js/dashboard.js` & `js/views/dashboard.view.js`**:
  - Added Active Buy Ad card (`#card-active-buy-ad`) with `#active-buy-ad-badge`, `#active-buy-ad-title`, `#metric-ad-buy-price`, `#metric-ad-qty-buy`, `#metric-ad-buy-fiat`, and `#metric-ad-buy-status`.
  - Added monotonic sequence tokens (`lastAdSyncId`, `lastInventorySyncId`) and button debouncing to eliminate race conditions.
  - Updated inventory accounting to sum allocations across all active sell ads.
- **`js/settings.js` & `js/utils.js`**:
  - Hardened reference rate resolution and settings live holding calculations to handle string sides/statuses, comma formatting, and multi-ad summing.
- **`test/tier1-feature-coverage/active-buy-sell-ads.test.js`**:
  - Created 17 automated tests (ADS.1 through ADS.17) covering DOM structure, calculations, concurrency, race conditions, comma formatting, fallbacks, and error recovery.

## 4. Verification Record
- **Full Test Suite Execution**: `node test/run-tests.js`
- **Result**: 614/614 passed (100.0%, 0 failed across Tiers 1-5).
  - Tier 1: 359/359 passed (100.0%)
  - Tier 2: 159/159 passed (100.0%)
  - Tier 3: 14/14 passed (100.0%)
  - Tier 4: 10/10 passed (100.0%)
  - Tier 5: 72/72 passed (100.0%)
- **Victory Auditor Verdict**: `VERDICT: VICTORY CONFIRMED` (zero cheating, genuine implementation, 100% independent pass rate).

## 5. Acceptance Criteria Assessment
- [x] Active Buy ads created on Bybit are successfully fetched by the proxy server and rendered on the Dashboard.
- [x] Active Sell ads continue to work without regression.
- [x] No syntax errors, uncaught promise rejections, or broken UI elements on the Dashboard.
- [x] All test suites pass (614/614).
