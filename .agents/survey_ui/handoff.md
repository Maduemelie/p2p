# Handoff Report: UI/UX & Search Survey (R4 & Cross-Cutting R1–R5)

**Agent**: survey_ui (Explorer)  
**Parent Agent**: orchestrator (`ebbe6953-1f81-4843-b1eb-b5368ea999d3`)  
**Date**: 2026-08-24  
**Working Directory**: `c:\dev\p2p\.agents\survey_ui\`  

---

## 1. Observation

1. **Trade History Search Field Indexing**:
   - In `js/history.js:140–158`:
     ```javascript
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
     ```
   - In `js/settings.js:264, 396`, imported Bybit trades store `refId: orderId`.
   - `trade.refId` and `trade.id` are completely missing from `matches` in `js/history.js`.
   - In `js/views/history.view.js:28`, the search placeholder is `placeholder="Search by counterparty, notes, bank..."`, which does not inform the user that Order ID (`refId`) can be searched.

2. **Pricing Assistant Order Book Interaction**:
   - In `js/views/pricing.view.js:204–240`, two market depth tables exist: `#pricing-buy-orderbook` and `#pricing-sell-orderbook`.
   - In `js/pricing.js:439, 474`, rows are rendered as `<tr class="orderbook-row" data-rate="${price}">`.
   - In `js/pricing.js:493–500`, clicking an order book row only performs:
     ```javascript
     document.querySelectorAll('.orderbook-row').forEach(row => {
       row.addEventListener('click', () => {
         const rate = row.getAttribute('data-rate');
         navigator.clipboard.writeText(rate);
         if (window.showToast) window.showToast(`Rate copied to clipboard: ₦${rate}`, 'info');
       });
     });
     ```
   - No pre-population of trade rate or volume and no navigation to the trade entry form occurs.

3. **Record Trade Form Mobile Navigation & Cancel/Back Controls**:
   - In `js/views/addTrade.view.js:14–17`, the only cancel button is `#btn-cancel-edit`, with class `hidden` unless editing an existing trade (`js/trades.js:272, 318`).
   - Standard trade creation has no Back or Cancel button in the view header or form actions.
   - In `js/app.js:110–184`, navigation does not track `previousView` to allow seamless return.

4. **Cross-Cutting Order Import Multi-Bank Assignment**:
   - In `js/views/modals.view.js:129`, the modal title is `Assign Bank for Buy Orders`.
   - In `js/settings.js:324, 368–374`, the modal only populates `buyOrders` for bank selection, while SELL orders are hardcoded to `defaultBankId` (`js/settings.js:399`).

5. **Service Worker Pre-cache Manifest**:
   - In `sw.js:7–18`, `STATIC_ASSETS` contains only 10 entries. It is missing `js/banks.js`, `js/bybitService.js`, `js/dashboard.js`, `js/export.js`, `js/fees.js`, `js/history.js`, `js/settings.js`, `js/store.js`, `js/trades.js`, `js/transfers.js`, `js/utils.js`, `js/views/addTrade.view.js`, `js/views/dashboard.view.js`, `js/views/history.view.js`, `js/views/modals.view.js`, and `js/views/settings.view.js`.

---

## 2. Logic Chain

1. **Trade Search Failure on `refId`**:
   - Observation: When Bybit orders are imported, their Bybit Order ID is saved as `trade.refId` (e.g. `2193849182391039`).
   - Observation: `js/history.js:150–158` does not evaluate `trade.refId`.
   - Logic: Pasting a Bybit Order ID into `#history-search` filters out the trade because `matches` evaluates to `false`.
   - Solution: Add `(trade.refId || '').toString().toLowerCase().includes(activeSearchQuery)` to `matches`.

2. **Order Book Row Click Gap**:
   - Observation: Requirement R4 states "Tapping an order book row in the Pricing Assistant navigates to the trade form with pre-filled rate and volume."
   - Observation: Current code in `js/pricing.js:495–500` only writes rate to the clipboard.
   - Logic: Adding `data-direction`, `data-rate`, `data-volume`, and `data-counterparty` to row HTML, combined with calling `window.prefillTradeForm(...)` and `window.switchView('add-trade')`, fulfills R4.

3. **Missing Cancel/Back Navigation**:
   - Observation: `addTrade.view.js` only exposes `#btn-cancel-edit` (which is hidden during fresh trade logging).
   - Logic: Users navigating from Dashboard ("New Trade") or Pricing Assistant (Order book row click) cannot cancel or go back without submitting or clicking another tab.
   - Solution: Add `#btn-cancel-trade` in view header and `#btn-form-cancel` in form actions, hooked to `window.switchView(previousView)`.

---

## 3. Caveats

- **Network Mode**: The investigation was conducted in read-only local workspace mode.
- **Direction Assumption for Order Book Rows**: When clicking an Ask (Sell Order Book row), the taker buys USDT (`direction = 'BUY'`). When clicking a Bid (Buy Order Book row), the taker sells USDT (`direction = 'SELL'`). This matches standard P2P exchange convention.
- **No Other Caveats**: All relevant files, DOM structures, and controller functions were inspected directly.

---

## 4. Conclusion

The UI and UX requirements for R4 (and cross-cutting R1–R5 touchpoints) are fully identified and localized:
1. `js/history.js` & `js/views/history.view.js`: Index `refId` and `id`, update placeholder, show `refId` in drawer.
2. `js/pricing.js` & `js/trades.js`: Expose `prefillTradeForm()`, attach interactive click handlers to order book rows for instantaneous form prefill and navigation.
3. `js/views/addTrade.view.js` & `js/app.js`: Add header Back button and form Cancel button with `previousView` stack tracking.
4. `js/views/modals.view.js` & `js/settings.js`: Expand order import modal to support bank selection for both BUY and SELL orders.
5. `sw.js`: Add all local JS modules and views to `STATIC_ASSETS`.

Detailed survey and proposed code structures have been recorded in `c:\dev\p2p\.agents\survey_ui\analysis.md`.

---

## 5. Verification Method

1. **Search Indexing**:
   - Store a test trade with `refId: "1234567890123456"` in `bybit_p2p_trades`.
   - Dispatch input event on `#history-search` with value `"1234567890123456"`.
   - Verify that `#trades-history-container` contains the matched card and `#history-trade-count` is `1 match found`.
2. **Order Book Row Click**:
   - Trigger `renderOrderBooks()` with sample depth.
   - Dispatch click on `.orderbook-row`.
   - Verify `window.location.hash` changes to `#add-trade`, `#trade-rate` has row price, `#trade-usdt` has row quantity, and `#trade-ngn` has `price * quantity`.
3. **Cancel / Back Controls**:
   - Navigate to `#pricing`, tap order book row -> enters `#add-trade`.
   - Click `#btn-cancel-trade` or `#btn-form-cancel`.
   - Verify app returns to `#pricing`.
4. **Service Worker Offline Cache**:
   - Verify all 26 files exist in `STATIC_ASSETS` in `sw.js`.
