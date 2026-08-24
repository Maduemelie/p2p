# UI/UX & Search Architecture Survey Report

**Author**: Survey Explorer (UI/UX & Search)  
**Target Milestone**: R4 (Search, Navigation & Interactive Order Book UX) + Cross-Cutting R1–R5 Integrations  
**Date**: 2026-08-24  
**Working Directory**: `c:\dev\p2p\.agents\survey_ui\`  

---

## 1. Executive Summary

This survey provides a complete architectural analysis of the frontend UI/UX, DOM element interactions, event listeners, view navigation transitions, search indexing, and order book interactions for the **Bybit NGN P2P Trade Tracker**.

### Key Investigation Outcomes:
1. **Trade History Search (`js/history.js`)**: Search currently indexes bank names, counterparties, notes, payment methods, and amount strings, but **omits Bybit Order ID (`refId`) and transaction `id`**. Pasting a 16-to-19 digit Bybit Order ID currently fails to return the trade unless it happened to be duplicated in the notes string.
2. **Pricing Assistant Order Book Interaction (`js/views/pricing.view.js` & `js/pricing.js`)**: Market depth rows in the Buy & Sell order books currently only attach a clipboard copy listener (`navigator.clipboard.writeText(rate)`). They do not populate rate/volume or navigate to the trade entry form.
3. **Record Trade Form Mobile Navigation (`js/views/addTrade.view.js` & `js/trades.js`)**: The Record Trade view has a `#btn-cancel-edit` button that is hidden during standard entry (`isEditing === false`). When navigating from the Dashboard or Pricing Assistant on mobile or desktop, there is no visible Cancel/Back control to return to the calling screen.
4. **Cross-Cutting UI Integrations (R1–R5)**:
   - **R1**: Proxy authentication state and 401 handling across `bybitService.js` and `settings.js`.
   - **R2**: Authoritative FIFO cost basis consistency across Dashboard Portfolio (`#stat-inventory-cost`), Active Sell Ad Monitor (`#metric-ad-avg-buy-cost`), and Pricing Assistant (`#pricing-cost-basis`), plus protection of `bybit_p2p_opening_inventory`.
   - **R3**: Order import modal (`modal-assign-banks-backdrop`) currently assigns banks only for BUY orders and auto-assigns SELL orders to default; must support multi-bank assignment for both BUY and SELL orders.
   - **R5**: Service Worker pre-cache manifest in `sw.js` currently omits 14 internal module dependencies and 5 view templates.

---

## 2. Deep Dive: R4 Search & Navigation

### 2.1 Trade History Search Implementation (`js/history.js`, `js/views/history.view.js`)

#### Observed File & DOM Elements:
- **Search Input**: `<input type="text" id="history-search" class="form-input search-input" placeholder="Search by counterparty, notes, bank...">` (`js/views/history.view.js:28`)
- **Clear Button**: `<button class="btn-clear-search hidden" id="btn-clear-search">` (`js/views/history.view.js:29`)
- **Container**: `<div id="trades-history-container">` (`js/views/history.view.js:67`)
- **Count Indicator**: `<span id="history-trade-count">` (`js/views/history.view.js:63`)

#### Current Filtering Logic (`js/history.js:135–161`):
```javascript
let filtered = enrichedTrades.filter(trade => {
  if (activeTypeFilter !== 'ALL' && trade.type !== activeTypeFilter) return false;
  if (activeBankFilter !== 'ALL' && trade.bankAccountId !== activeBankFilter) return false;

  // Search query matching
  if (activeSearchQuery) {
    const bank = bankMap.get(trade.bankAccountId);
    const bankName = bank ? `${bank.name} ${bank.alias || ''} ${bank.last4}`.toLowerCase() : '';
    const counterparty = (trade.counterparty || '').toLowerCase();
    const notes = (trade.notes || '').toLowerCase();
    const paymentMethod = (trade.paymentMethod || '').toLowerCase();
    const ngnStr = trade.ngnAmount.toString();
    const usdtStr = trade.usdtAmount.toString();
    const rateStr = trade.rate.toString();

    const matches = bankName.includes(activeSearchQuery) ||
                    counterparty.includes(activeSearchQuery) ||
                    notes.includes(activeSearchQuery) ||
                    paymentMethod.includes(activeSearchQuery) ||
                    ngnStr.includes(activeSearchQuery) ||
                    usdtStr.includes(activeSearchQuery) ||
                    rateStr.includes(activeSearchQuery);
    if (!matches) return false;
  }
  return true;
});
```

#### Defect Analysis:
1. **Missing `refId` Indexing**: `trade.refId` (stored during Bybit P2P order imports in `js/settings.js:264, 396`) is not matched against `activeSearchQuery`.
2. **Missing `id` Indexing**: Internal UUIDs (`trade.id`) are also not matched.
3. **UI Feedback**: The search input placeholder in `js/views/history.view.js:28` does not indicate that Order ID (`refId`) can be searched.
4. **Metadata Visibility**: The expanded card drawer in `js/history.js:294–317` does not show a dedicated `Bybit Order ID` badge/row if `trade.refId` exists (only displays `trade.notes`).

#### Proposed Code Changes:
1. In `js/history.js`, expand `matches` to include `refId` and `id`:
```javascript
const refIdStr = (trade.refId || '').toString().toLowerCase();
const tradeIdStr = (trade.id || '').toString().toLowerCase();

const matches = bankName.includes(activeSearchQuery) ||
                counterparty.includes(activeSearchQuery) ||
                notes.includes(activeSearchQuery) ||
                paymentMethod.includes(activeSearchQuery) ||
                refIdStr.includes(activeSearchQuery) ||
                tradeIdStr.includes(activeSearchQuery) ||
                ngnStr.includes(activeSearchQuery) ||
                usdtStr.includes(activeSearchQuery) ||
                rateStr.includes(activeSearchQuery);
```
2. In `js/views/history.view.js:28`:
```html
<input type="text" id="history-search" class="form-input search-input" placeholder="Search by Order ID (refId), counterparty, notes, bank...">
```
3. In `js/history.js:294–317`, add `refId` to `trade-meta-grid`:
```html
${trade.refId ? `
  <div class="trade-meta-item">
    <span class="trade-meta-label">Bybit Order ID:</span>
    <span class="trade-meta-value font-mono">${escapeHtml(trade.refId)}</span>
  </div>
` : ''}
```

---

### 2.2 Pricing Assistant Order Book Row Click Interaction (`js/views/pricing.view.js`, `js/pricing.js`, `js/trades.js`)

#### Observed File & DOM Elements:
- **Buy Order Book (Market Bids)**: `<table class="market-depth-table" id="pricing-buy-orderbook"><tbody>...</tbody></table>` (`js/views/pricing.view.js:204`)
- **Sell Order Book (Market Asks)**: `<table class="market-depth-table" id="pricing-sell-orderbook"><tbody>...</tbody></table>` (`js/views/pricing.view.js:226`)
- **Order Book Row Element**: `<tr class="orderbook-row" data-rate="${price}">...</tr>` (`js/pricing.js:439, 474`)

#### Current Behavior (`js/pricing.js:493–500`):
```javascript
// Click on any orderbook row to quickly copy its price to settings
document.querySelectorAll('.orderbook-row').forEach(row => {
  row.addEventListener('click', () => {
    const rate = row.getAttribute('data-rate');
    navigator.clipboard.writeText(rate);
    if (window.showToast) window.showToast(`Rate copied to clipboard: ₦${rate}`, 'info');
  });
});
```

#### Requirement:
> "Tapping an order book row in the Pricing Assistant navigates to the trade form with pre-filled rate and volume."

#### Interaction Design:
1. **Buy Order Book (Bids)**: Merchants buying USDT (taker sells). Tapping a bid row initiates a **`SELL`** trade entry at `rate = ad.price`, `volume = ad.lastQuantity` (available USDT), `ngnAmount = rate * volume`, and optional counterparty = advertiser nickname.
2. **Sell Order Book (Asks)**: Merchants selling USDT (taker buys). Tapping an ask row initiates a **`BUY`** trade entry at `rate = ad.price`, `volume = ad.lastQuantity` (available USDT), `ngnAmount = rate * volume`, and optional counterparty = advertiser nickname.
3. **Action Flow**:
   - Tapping row triggers `window.prefillTradeForm({ direction, rate, usdtAmount, counterparty })`.
   - Form fields (`#trade-rate`, `#trade-usdt`, `#trade-ngn`, `#trade-counterparty`, `#trade-date`) are populated.
   - Trade direction segmented control (`#trade-type-toggle`) is toggled to `BUY` or `SELL`.
   - `recalculateTradeSummary()` runs to refresh fees, gross, effective rate, and net totals.
   - `window.switchView('add-trade')` navigates immediately to the Record Trade view.
   - Toast notification alerts: `"Populated [BUY/SELL] trade from [Advertiser] order book"`.

#### Data Attributes on Order Book Rows (`js/pricing.js`):
```html
<!-- Buy Depth Row (Market Bid -> Taker Sells) -->
<tr class="orderbook-row cursor-pointer" data-direction="SELL" data-rate="${price}" data-volume="${available}" data-counterparty="${escapeHtml(advName)}" title="Tap to record Sell trade at ₦${price}">

<!-- Sell Depth Row (Market Ask -> Taker Buys) -->
<tr class="orderbook-row cursor-pointer" data-direction="BUY" data-rate="${price}" data-volume="${available}" data-counterparty="${escapeHtml(advName)}" title="Tap to record Buy trade at ₦${price}">
```

#### Prefill Controller Function (`js/trades.js`):
```javascript
export function prefillTradeForm({ direction = 'BUY', rate = 0, usdtAmount = 0, counterparty = '', notes = '' }) {
  resetTradeForm();

  const rateInput = document.getElementById('trade-rate');
  const usdtInput = document.getElementById('trade-usdt');
  const ngnInput = document.getElementById('trade-ngn');
  const counterpartyInput = document.getElementById('trade-counterparty');
  const notesInput = document.getElementById('trade-notes');

  const numRate = parseFloat(rate) || 0;
  const numUsdt = parseFloat(usdtAmount) || 0;
  const numNgn = (numRate > 0 && numUsdt > 0) ? (numRate * numUsdt) : 0;

  if (rateInput && numRate > 0) rateInput.value = numRate;
  if (usdtInput && numUsdt > 0) usdtInput.value = numUsdt;
  if (ngnInput && numNgn > 0) ngnInput.value = numNgn.toFixed(2);
  if (counterpartyInput && counterparty) counterpartyInput.value = counterparty;
  if (notesInput && notes) notesInput.value = notes;

  setTradeDirection(direction);
  recalculateTradeSummary();

  if (window.switchView) {
    window.switchView('add-trade');
  }

  if (window.showToast) {
    window.showToast(`Populated ${direction} trade from order book (${formatUSDT(numUsdt)} @ ₦${numRate})`, 'info');
  }
}
```

---

### 2.3 Record Trade Form Cancel/Back Navigation (`js/views/addTrade.view.js`, `js/trades.js`, `js/app.js`)

#### Observed File & DOM Elements:
- **View Container**: `<section class="app-view" id="view-add-trade" data-view="add-trade">` (`js/views/addTrade.view.js:7`)
- **View Header**:
  ```html
  <div class="view-header">
    <div>
      <h2 class="view-title" id="trade-form-title">Record Trade</h2>
      <p class="view-subtitle" id="trade-form-subtitle">Log a new BUY or SELL order</p>
    </div>
    <button class="btn btn-sm btn-ghost hidden" id="btn-cancel-edit">
      <i data-lucide="x"></i>
      <span>Cancel Edit</span>
    </button>
  </div>
  ```
- **Form Actions**:
  ```html
  <div class="form-actions">
    <button type="submit" class="btn btn-primary btn-block" id="btn-submit-trade">
      <i data-lucide="check-circle"></i>
      <span id="btn-submit-label">Save Trade</span>
    </button>
  </div>
  ```

#### Navigation Defect:
1. `#btn-cancel-edit` is only displayed when `isEditing === true`.
2. When creating a new trade (navigated via Dashboard `#btn-dash-quick-add` or Pricing Assistant order book row or `#tab-dashboard`), there is **no Cancel or Back button**.
3. On mobile viewports (where bottom navigation may be hidden or thumb-reach to bottom tabs is awkward), users have no dedicated back control to return to their prior context.

#### Proposed UI Navigation Architecture:
1. **Header Navigation Control (`js/views/addTrade.view.js:9–18`)**:
   Add an accessible `<button class="btn btn-sm btn-ghost" id="btn-cancel-trade" type="button"><i data-lucide="arrow-left"></i><span>Back</span></button>`.
2. **Form Actions Control (`js/views/addTrade.view.js:209–215`)**:
   Provide a two-button action cluster:
   ```html
   <div class="form-actions d-flex gap-2">
     <button type="button" class="btn btn-secondary flex-1" id="btn-form-cancel">
       <i data-lucide="x"></i>
       <span>Cancel</span>
     </button>
     <button type="submit" class="btn btn-primary flex-2" id="btn-submit-trade">
       <i data-lucide="check-circle"></i>
       <span id="btn-submit-label">Save Trade</span>
     </button>
   </div>
   ```
3. **Previous View Tracking in `js/app.js`**:
   Maintain `let previousView = 'dashboard';` in `initNavigation()`.
   When `#btn-cancel-trade`, `#btn-cancel-edit`, or `#btn-form-cancel` is clicked:
   - Call `resetTradeForm()`.
   - Switch view back to `previousView || 'dashboard'`.

---

## 3. Cross-Cutting UX & UI Integration Analysis (R1–R5)

### 3.1 R1: API Proxy Security & Token Authorization UX
- **Proxy Status Chip (`js/views/settings.view.js:75–77`)**:
  `<span class="proxy-status-chip proxy-offline" id="proxy-status-badge">● <span id="proxy-status-text">Proxy Offline</span></span>`
- **Controller Handling (`js/bybitService.js`, `js/settings.js`)**:
  - When requests to `/api/balance`, `/api/orders`, `/api/ads`, `/api/market-depth` return `401 Unauthorized`:
  - `bybitService.js` should catch 401 and throw structured auth error: `Unauthorized (Invalid or missing proxy token)`.
  - UI updates `#proxy-status-badge` to `proxy-unauthorized` with message `"Token Required / Unauthorized"`.
  - Toasts display informative guidance rather than generic fetch failure.

### 3.2 R2: FIFO Accounting Consistency & Inventory Protection UX
- **Tri-View Cost Basis Alignment**:
  | View Component | DOM Element ID | File Location | Display Format |
  |---|---|---|---|
  | Dashboard Portfolio Overview | `#stat-inventory-cost` | `js/dashboard.js:347` | `Cost: ₦... • Avg: ₦X.XX` |
  | Dashboard Active Sell Ad | `#metric-ad-avg-buy-cost` | `js/dashboard.js:159` | `₦X.XX` |
  | Pricing Assistant Sell Ad | `#pricing-cost-basis` | `js/pricing.js:183` | `₦X.XX` |
- **Opening Inventory Key Protection (`js/dashboard.js:88–114`)**:
  - `syncAndRenderActiveAd()` currently contains code that overwrites `store.setOpeningInventory()` whenever a new ad ID is detected (`js/dashboard.js:104–107`).
  - **Correction**: Live ad sync must NOT mutate `bybit_p2p_opening_inventory` in localStorage. Opening inventory configurations should be strictly user-governed via the Settings > Data tab (`#form-opening-inventory`).
- **Active Ad Projected Profit Fee Calculation (`js/dashboard.js:120–123`)**:
  - Receiving Naira during a Sell ad has ₦0 fee deduction or adheres strictly to configured outflow fees without erroneous arbitrary subtractions.

### 3.3 R3: Comprehensive Multi-Bank Order Reconciliation UX
- **Import Modal View (`js/views/modals.view.js:125–146`)**:
  - Currently titled *"Assign Bank for Buy Orders"* (`#modal-assign-banks-backdrop`).
  - Update title to: *"Assign Bank Accounts for Imported Orders"* and subtitle to *"Assign source bank (BUY) or destination bank (SELL) for each transaction"*.
- **Import Modal Controller (`js/settings.js:323–378`)**:
  - Currently only lists `buyOrders` in `#assign-banks-items-list` and displays a footer notice: *"Plus X SELL order(s) will be automatically credited to your primary account"*.
  - **Correction**: Render both BUY and SELL orders in `#assign-banks-items-list`.
    - **BUY order card**: Badge `BUY USDT` (blue), label *"Paid From Bank Account:"*, dropdown of linked banks with current balance.
    - **SELL order card**: Badge `SELL USDT` (emerald), label *"Received Into Bank Account:"*, dropdown of linked banks with current balance.
  - Upon submission (`#form-assign-banks`), credit/debit the respective bank account IDs in `store.addTrade()`.
  - `store.getComputedBankBalances()` updates reactive ledger balances across all linked accounts.

### 3.4 R5: Complete Offline PWA Pre-caching
- **Service Worker Cache Manifest (`sw.js:7–18`)**:
  - Current `STATIC_ASSETS` contains only 10 items.
  - **Missing Assets**:
    - `js/banks.js`
    - `js/bybitService.js`
    - `js/dashboard.js`
    - `js/export.js`
    - `js/fees.js`
    - `js/history.js`
    - `js/settings.js`
    - `js/store.js`
    - `js/trades.js`
    - `js/transfers.js`
    - `js/utils.js`
    - `js/views/addTrade.view.js`
    - `js/views/dashboard.view.js`
    - `js/views/history.view.js`
    - `js/views/modals.view.js`
    - `js/views/settings.view.js`
  - When all 26 assets are included in `STATIC_ASSETS`, offline view switching and app loading function seamlessly.

---

## 4. Complete File Modification Plan

| File | Target Lines / Functions | Summary of Proposed Changes |
|---|---|---|
| `js/history.js` | `renderTradeHistory()` (lines 140–160, 294–317) | Index `trade.refId` and `trade.id` in search matching. Display Bybit Order ID badge in expanded row drawer. |
| `js/views/history.view.js` | Line 28 | Update search input placeholder to mention `refId` / Bybit Order ID. |
| `js/pricing.js` | `renderOrderBooks()` (lines 427–500) | Add data attributes (`data-direction`, `data-rate`, `data-volume`, `data-counterparty`) to order book rows. Replace clipboard copy handler with click-to-prefill `window.prefillTradeForm()`. |
| `js/trades.js` | Form lifecycle & exports | Implement and export `prefillTradeForm()`, attach to `window.prefillTradeForm`. Wire cancel/back buttons. |
| `js/views/addTrade.view.js` | Header & Actions (lines 9–18, 209–215) | Add `#btn-cancel-trade` in view header and `#btn-form-cancel` in form actions. |
| `js/app.js` | `initNavigation()` | Track `previousView` on tab switches. Wire global cancel/back handlers. |
| `js/views/modals.view.js` | `modal-assign-banks-backdrop` (lines 125–146) | Update modal header/text to reflect multi-bank assignment for both BUY and SELL orders. |
| `js/settings.js` | `btnImportTrades` handler & assign modal | Render both BUY and SELL orders with bank selection dropdowns. Credit/debit chosen accounts. |
| `sw.js` | `STATIC_ASSETS` (lines 7–18) | Add all 14 controller modules and 6 view templates to pre-cache list. Bump cache version. |

---

## 5. Verification & Test Plan

1. **Trade History Search Verification**:
   - Create a trade with `refId = "2193849182391039"`.
   - Type `"2193849182391039"` into `#history-search`.
   - Verify that `#history-trade-count` shows `1 match found` and the card is displayed.
2. **Pricing Assistant Order Book Click Verification**:
   - Navigate to Pricing Assistant (`#tab-pricing`).
   - Click a row in the Buy Order Book (e.g. `1605.00 NGN`, `500 USDT`).
   - Verify app switches to `add-trade` view with direction `SELL`, rate `1605.00`, USDT `500.00`, and NGN `802,500.00`.
   - Click a row in the Sell Order Book (e.g. `1610.00 NGN`, `250 USDT`).
   - Verify app switches to `add-trade` view with direction `BUY`, rate `1610.00`, USDT `250.00`, and NGN `402,500.00`.
3. **Cancel / Back Navigation Verification**:
   - From Dashboard (`#tab-dashboard`), click "New Trade".
   - Click "Back" (`#btn-cancel-trade`).
   - Verify app returns to Dashboard.
   - From Pricing (`#tab-pricing`), click an order book row.
   - Click "Cancel" (`#btn-form-cancel`).
   - Verify app returns to Pricing Assistant.
4. **PWA Offline Resilience Verification**:
   - Inspect `sw.js` cache manifest and run Service Worker registration in headless/browser environment with simulated offline network.
   - Verify all view transitions work without network requests.
