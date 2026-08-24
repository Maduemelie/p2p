# Project Orchestration Plan: Bybit NGN P2P Trade Tracker Stabilization & Hardening

## Overview
Stabilize, secure, align accounting calculations, improve UX, and ensure offline resilience for the Bybit NGN P2P Trade Tracker application based on ORIGINAL_REQUEST.md.

## Requirements Breakdown
- **R1: API Proxy Security & Token Authorization**
  - Proxy endpoints: `/api/balance`, `/api/orders`, `/api/ads`, `/api/market-depth`
  - Enforce shared secret / auth token in Express (`server.js`) & Vercel (`api/*.js`)
  - Seamless frontend integration (`js/bybit.js`, settings, or env)
  - 401 Unauthorized for missing/invalid auth
- **R2: FIFO Accounting Consistency & Inventory Protection**
  - Unify inventory cost basis & quantity calculations across Dashboard Portfolio Overview (`js/views/dashboard.js`), Active Sell Ad Monitor (`js/views/ads.js`), and Pricing Assistant (`js/views/pricing.js`)
  - Ensure authoritative FIFO holding cost consistency
  - Live ad syncing & balance sync MUST NOT overwrite `bybit_p2p_opening_inventory` without explicit user action in Data tab
  - Projected profit on active Sell ads calculates with ₦0 fee deduction when receiving NGN
- **R3: Comprehensive Multi-Bank Order Reconciliation**
  - Enable bank account assignment for both BUY and SELL orders in import modal (`js/views/data.js` or related components)
  - Ensure cash inflows and outflows credit/debit the selected bank accounts without defaulting sales to a single account
  - Update ledger balances accurately upon import completion
- **R4: Search, Navigation & Interactive Order Book UX**
  - Enhance trade history search (`js/views/trades.js`) to index Bybit Order IDs (`refId`)
  - Connect live market depth order book rows in Pricing Assistant (`js/views/pricing.js`) to prefill rate & volume and navigate to trade entry form (`js/views/record.js` or similar)
  - Add accessible Cancel/Back button on mobile sub-views ("Record Trade" form)
- **R5: Complete Offline PWA Pre-caching**
  - Update Service Worker cache manifest in `sw.js` to include all local JS controllers (`js/*.js`) and view templates (`js/views/*.js`), styles, and assets
  - Ensure shell loading & offline view navigation without missing script dependencies

## Orchestration Strategy
1. **Phase 0: Survey & Specification Mining**
   - Dispatch 3 parallel Explorers / Spec Miners to analyze codebase structure, existing logic, tests, API server, storage models, and current defects.
   - Aggregate findings and produce `PROJECT.md` with full Feature Inventory, Architecture, Code Layout, and Interface Contracts.
2. **Phase 1: Dual-Track E2E Test Suite Creation**
   - Dispatch Test Writers to construct independent E2E test runner & comprehensive test suites (Tiers 1-4).
   - Publish `TEST_INFRA.md` and `TEST_READY.md`.
3. **Phase 2: Milestone Execution Loop (M1 to M5)**
   - For each milestone: Explorer analysis -> Worker implementation -> Reviewer verification -> Challenger stress test -> Forensic Auditor integrity check -> Gate evaluation.
4. **Phase 3: Final Verification & Adversarial Hardening (Tier 5)**
   - Run 100% E2E test suite.
   - Adversarial coverage audit & hardening with Challengers.
5. **Phase 4: Synthesis & Sentinel Delivery**
   - Final audit check and comprehensive victory completion report.
