# Original User Request

## 2026-08-24T17:04:50Z

Implement and verify the full stabilization, security hardening, accounting alignment, and UX improvements identified in the application audit for the Bybit NGN P2P Trade Tracker.

Working directory: c:\dev\p2p
Integrity mode: development

## Requirements

### R1. API Proxy Security & Token Authorization
Secure the Bybit API proxy endpoints (`/api/balance`, `/api/orders`, `/api/ads`, `/api/market-depth`) by requiring a shared secret or authorization token between the frontend client and the backend server (both Express and Vercel serverless routes), preventing unauthorized access while maintaining seamless frontend integration.

### R2. FIFO Accounting Consistency & Inventory Protection
Unify inventory cost basis and quantity calculations across the application so that the Dashboard Portfolio Overview, Active Sell Ad Monitor, and Pricing Assistant always reflect the authoritative FIFO holding cost. Ensure live Bybit ad syncing does not overwrite user-defined historical opening inventory configurations.

### R3. Comprehensive Multi-Bank Order Reconciliation
Enable bank account assignment for all imported Bybit P2P orders (both BUY and SELL) during trade batch imports, ensuring that cash inflows and outflows are credited/debited to the user's correct bank accounts without defaulting all sales to a single account.

### R4. Search, Navigation & Interactive Order Book UX
Enhance trade history search to index Bybit Order IDs (`refId`), connect live market depth order book rows to automatically populate and navigate to the trade entry form, and add clear cancel/back navigation controls on mobile sub-views.

### R5. Complete Offline PWA Pre-caching
Update the Service Worker caching manifest to pre-cache all local JavaScript modules, view templates, styles, and assets so that the application functions reliably offline without missing script dependencies.

## Acceptance Criteria

### Security & Access Control
- [ ] Direct unauthenticated HTTP requests to `/api/balance`, `/api/orders`, and `/api/ads` return `401 Unauthorized`.
- [ ] Validated frontend requests with the configured token successfully retrieve Bybit data.

### Accounting & Calculation Integrity
- [ ] Dashboard Portfolio Overview and Pricing Assistant display identical average cost basis per USDT for the same trade dataset.
- [ ] Running balance sync or detecting new active ads does not modify the `bybit_p2p_opening_inventory` localStorage key without explicit user action on the Data tab.
- [ ] Projected profit on active Sell ads calculates with a ₦0 fee deduction when receiving Naira.

### Order Import & Bank Ledgers
- [ ] The order import modal allows assigning specific bank accounts for both BUY and SELL orders.
- [ ] Ledger balances update accurately for the chosen bank accounts upon completing an import.

### Search & Navigation
- [ ] Pasting a Bybit Order ID (`refId`) into the Trade History search bar immediately displays the matching trade.
- [ ] Tapping an order book row in the Pricing Assistant navigates to the trade form with pre-filled rate and volume.
- [ ] "Record Trade" form includes an accessible "Cancel / Back" button that returns to the previous screen.

### PWA Offline Resilience
- [ ] All local JS controller files (`js/*.js`) and view templates (`js/views/*.js`) are included in the Service Worker pre-cache list.
- [ ] The application successfully loads the shell and navigates between views when offline.
