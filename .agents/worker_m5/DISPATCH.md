## 2026-08-24T19:48:28Z
You are the Milestone 5 Worker specializing in Complete Offline PWA Pre-caching.
Your Working Directory: c:\dev\p2p\.agents\worker_m5\

Read:
- ORIGINAL_REQUEST.md at c:\dev\p2p\ORIGINAL_REQUEST.md
- PROJECT.md at c:\dev\p2p\PROJECT.md
- Survey Backend Analysis at c:\dev\p2p\.agents\survey_backend\analysis.md
- TEST_READY.md at c:\dev\p2p\TEST_READY.md

Exclusive Write Ownership:
- sw.js

Mandatory Integrity Warning:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Mission & Implementation Requirements:
1. Complete Pre-Cache Manifest (sw.js):
   - Bump CACHE_NAME to 'bybit-p2p-v9'.
   - Update STATIC_ASSETS array to include all 24 local files:
     - Root & config: './', './index.html', './manifest.json', './css/styles.css', './css/styles.css?v=2.5', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png'
     - Core & utility modules: './js/app.js', './js/store.js', './js/utils.js', './js/fees.js', './js/export.js', './js/bybitService.js'
     - Controller modules: './js/dashboard.js', './js/trades.js', './js/history.js', './js/pricing.js', './js/banks.js', './js/transfers.js', './js/settings.js'
     - View templates: './js/views/dashboard.view.js', './js/views/addTrade.view.js', './js/views/pricing.view.js', './js/views/history.view.js', './js/views/settings.view.js', './js/views/modals.view.js'
2. Fetch Handler & Offline Resilience (sw.js):
   - Support cache matching with { ignoreSearch: true } fallback for local assets.
   - For HTML navigation requests when offline, ensure fallback returns cached './index.html'.
   - Preserve Cache-First / Stale-While-Revalidate caching for external CDNs (lucide, chart.js, google fonts).
3. Verification:
   - Run: node test/run-tests.js --suite=pwa
   - Run: node test/run-tests.js
   - Verify that 100% of all tests pass.

Write your report to c:\dev\p2p\.agents\worker_m5\handoff.md and send a handoff message when done.
