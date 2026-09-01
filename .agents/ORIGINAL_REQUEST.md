# Original User Request

## Initial Request — 2026-08-26T08:20:42+01:00

<USER_REQUEST>
You are the SWE Light Orchestrator for the Bybit NGN P2P Trade Tracker project.
Your working directory is: c:\dev\p2p\.agents\swe_1 (ensure you initialize/update your BRIEFING.md, plan.md, and progress.md here).
Project root: c:\dev\p2p
Original request file: c:\dev\p2p\.agents\ORIGINAL_REQUEST.md

Mission:
Analyze the Bybit NGN P2P Trade Tracker application to identify and remove unused code (dead code), refactor reusable components into separate cleanly imported ES modules, and generate a comprehensive refactor_report.md while maintaining all test suite passes and application integrity in benchmark integrity mode.

Key Requirements:
1. R1. Dead Code Removal:
   - Identify and safely remove unused functions, variables, files, and unreachable code paths across the codebase.
2. R2. Component Extraction:
   - Identify components or utility functions that have high reuse potential but are currently tightly coupled, and extract them into separate, cleanly imported ES modules.
3. R3. Refactoring Report:
   - Generate a detailed report named `refactor_report.md` in the working directory (c:\dev\p2p\refactor_report.md) that lists exactly what dead code was removed and which components were extracted.

Acceptance Criteria:
- All existing automated tests must pass after the removals and refactoring are complete.
- `refactor_report.md` is present in the working directory (c:\dev\p2p\refactor_report.md) and documents the changes.
- No application functionality is broken (verified via test suite).

Please execute the SWE Light loop: dispatch the implementer, run reviewer rounds with test execution, verify against acceptance criteria, and notify the Sentinel via send_message upon completion.
</USER_REQUEST>

## 2026-09-01T11:17:13Z

This is a single self-contained fix; keep it small and focused.
Research Bybit P2P API endpoints (specifically `/v5/p2p/item/personal/list` and related active ad list APIs), review the Bybit P2P Tracker codebase (`server.js`, `js/bybitService.js`, `js/dashboard.js`), diagnose why active Buy Ads on Bybit are not returning or displaying in the app, and fix the code to correctly fetch and display both Buy and Sell active ads.

Working directory: c:\dev\p2p

## Requirements

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

## Acceptance Criteria

### Functionality
- [ ] Active Buy ads created on Bybit are successfully fetched by the proxy server and rendered on the Dashboard.
- [ ] Active Sell ads continue to work without regression.
- [ ] No syntax errors, uncaught promise rejections, or broken UI elements on the Dashboard.
