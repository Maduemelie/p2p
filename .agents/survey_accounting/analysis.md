# Accounting, Inventory & Ledger Calculations — Comprehensive Survey Report

**Author**: Survey Explorer (Accounting, Inventory & Ledger Calculations)  
**Date**: 2026-08-24  
**Target Project**: Bybit NGN P2P Trade Tracker (`c:\dev\p2p`)  
**Scope**: Requirements R2 (FIFO Accounting Consistency & Inventory Protection) and R3 (Multi-Bank Order Reconciliation & Ledger Updates)

---

## Executive Summary

This investigation performed a comprehensive audit across all accounting, inventory valuation, fee modeling, FIFO queues, and multi-bank ledger synchronization modules in the codebase. 

### Key Findings
1. **FIFO Inconsistency (R2)**: `js/dashboard.js` contains a logic branch in `renderDashboardMetrics()` that recalculates inventory and average buy cost strictly for buybacks timestamped *after* the active Bybit Sell Ad's creation date. This overrides the authoritative FIFO engine results from `js/utils.js`, causing the Dashboard Portfolio Overview card (`#stat-inventory-holding`, `#stat-inventory-cost`) to diverge completely from the Pricing Assistant (`#pricing-cost-basis` in `js/pricing.js`) and Trade History.
2. **Opening Inventory Overwrites (R2)**: The user-configured `bybit_p2p_opening_inventory` in localStorage is destructively overwritten in two automated locations:
   - `js/dashboard.js` (lines 88–114): Auto-syncs and overwrites opening inventory whenever a new active ad ID is detected.
   - `js/settings.js` (lines 156–187): Overwrites opening inventory whenever the user clicks "Sync Holdings".
   Both bypass explicit user configuration in the Data tab.
3. **Active Sell Ad Fee Deduction Bug (R2)**: `js/dashboard.js` line 122 arbitrarily subtracts ₦50 stamp duty from the active sell ad's projected profit (`Math.max(0, projectedGross - 50)`), violating Nigerian banking mechanics and the project requirement that receiving Naira incurs a ₦0 fee deduction.
4. **Multi-Bank Batch Import Limitation (R3)**: `js/settings.js` lines 320–420 and `js/views/modals.view.js` only present bank account selection for BUY orders. SELL orders are either skipped (if only SELLs exist) or excluded from the modal selection list and silently assigned to the default/primary bank account (`banks[0].id`). Consequently, cash inflows from sales across different bank accounts cannot be reconciled to specific user bank ledgers.

---

## Part 1: R2 — FIFO Accounting Consistency & Inventory Protection

### 1.1 Codebase Audit of FIFO Calculations

| File Path | Function / Method | Role & Current Calculation |
|---|---|---|
| `js/utils.js:132-294` | `calculateFIFOInventoryAndPnL(trades, openingInventory)` | **Authoritative FIFO Core Engine**.<br>• Seeds `OPENING_BALANCE` lot from `openingInventory.startingUsdtBalance` @ `openingInventory.defaultCostBasis`.<br>• BUY trades append lots `{ originalQty, remainingQty, effectiveCostPerUnit: (ngn + fees) / usdt }`.<br>• SELL trades match against oldest available buy lots, computing `matchedCostBasis`, `realizedPnL = netSellRevenue - matchedCostBasis`, and `roiPercent`.<br>• Remaining inventory: `remainingInventoryUSDT = sum(remainingQty)`, `inventoryCostBasisNGN = sum(remainingQty * effectiveCostPerUnit)`, `avgHoldingCostPerUSDT = inventoryCostBasisNGN / remainingInventoryUSDT`. |
| `js/pricing.js:175-185` | `calculateMargins()` | Calls `calculateFIFOInventoryAndPnL(trades, openingInventory)`.<br>Uses `fifoResult.avgHoldingCostPerUSDT \|\| openingInventory.defaultCostBasis \|\| 0` as the authoritative cost basis for pricing spreads and break-even calculations. |
| `js/dashboard.js:78-80` | `syncAndRenderActiveAd()` | Queries FIFO engine to get `avgBuyCost` for active ad spread comparisons. |
| `js/dashboard.js:248-251` | `syncBybitLiveInventory()` | Queries FIFO engine for `remainingInventoryUSDT` to compare against Bybit wallet funding balance. |
| `js/dashboard.js:278-374` | `renderDashboardMetrics()` | **Divergence Source**: Runs FIFO engine, but conditionally overrides `displayInventoryUSDT`, `displayInventoryCostNGN`, and `displayAvgCostPerUSDT` with buybacks filtered after `latestActiveAd.createDate`. |
| `js/history.js:131-133` | `renderTradeHistory()` | Uses `calculateFIFOInventoryAndPnL` to annotate every trade with its FIFO cost basis, realized P&L, and matched buy lots. |
| `js/store.js:288-301` | `getOpeningInventory()`, `setOpeningInventory()` | Manages localStorage persistence under key `bybit_p2p_opening_inventory`. |

---

### 1.2 Discrepancy Analysis: Dashboard Portfolio Overview vs. Pricing Assistant

#### Observed Code in `js/dashboard.js` (Lines 292–316):
```javascript
// Current js/dashboard.js: Lines 292-316
// Run FIFO engine
const fifoResult = calculateFIFOInventoryAndPnL(trades, openingInventory);
const {
  totalRealizedPnL,
  overallROI,
  remainingInventoryUSDT,
  inventoryCostBasisNGN,
  avgHoldingCostPerUSDT
} = fifoResult;

// Dynamically determine inventory display values based on active Sell Ad campaign state
let displayInventoryUSDT = remainingInventoryUSDT;
let displayInventoryCostNGN = inventoryCostBasisNGN;
let displayAvgCostPerUSDT = avgHoldingCostPerUSDT;

if (latestActiveAd) {
  const adCreateTime = Number(latestActiveAd.createDate) || 0;
  let buybackUSDT = 0;
  let buybackNGN = 0;

  trades.forEach(t => {
    if (t.type === 'BUY') {
      const tradeTime = new Date(t.date).getTime();
      // Sum only buybacks that occurred after the active ad was created
      if (tradeTime >= adCreateTime) {
        buybackUSDT += Number(t.usdtAmount) || 0;
        buybackNGN += Number(t.ngnAmount) || 0;
      }
    }
  });

  displayInventoryUSDT = buybackUSDT;
  displayInventoryCostNGN = buybackNGN;
  displayAvgCostPerUSDT = buybackUSDT > 0 ? (buybackNGN / buybackUSDT) : (openingInventory.defaultCostBasis || 0);
}
```

#### Discrepancy Impact:
1. **Inconsistent Cost Basis**:
   - In `js/pricing.js`, the cost basis displayed is `fifoResult.avgHoldingCostPerUSDT` (e.g. ₦1,450.00 / USDT).
   - In `js/dashboard.js`, if an active sell ad is online, the Portfolio Overview card displays `displayAvgCostPerUSDT` (calculated solely from BUY orders placed after `adCreateTime`). If no buys occurred after ad creation, it falls back to `defaultCostBasis` or ₦0.00.
2. **Inconsistent Inventory Quantity**:
   - `statInventoryHolding` shows only post-ad buy volume (`buybackUSDT`), ignoring existing FIFO stock and opening inventory.
   - If `buybackUSDT === 0`, it displays `No active buybacks` instead of actual portfolio inventory!

#### Proposed Fix:
Remove the ad-hoc buyback override from `renderDashboardMetrics()` in `js/dashboard.js`. The Dashboard Portfolio Overview must always reflect the authoritative FIFO values:
```javascript
// Fixed js/dashboard.js in renderDashboardMetrics():
const fifoResult = calculateFIFOInventoryAndPnL(trades, openingInventory);
const {
  totalRealizedPnL,
  overallROI,
  remainingInventoryUSDT,
  inventoryCostBasisNGN,
  avgHoldingCostPerUSDT
} = fifoResult;

const displayInventoryUSDT = remainingInventoryUSDT;
const displayInventoryCostNGN = inventoryCostBasisNGN;
const displayAvgCostPerUSDT = avgHoldingCostPerUSDT || openingInventory.defaultCostBasis || 0;
```

---

### 1.3 Opening Inventory Protection & Unwanted Overwrites

#### Overwrite Vector 1: `js/dashboard.js` (Lines 88–114)
When `syncAndRenderActiveAd()` runs (on dashboard mount and every `store:updated` event):
```javascript
// js/dashboard.js lines 88-114
const savedAdId = localStorage.getItem('bybit_last_synced_ad_id');
if (activeSellAd.id && savedAdId !== activeSellAd.id) {
  let totalP2P = 0;
  // ... fetches wallet balance ...
  const adOriginalQty = parseFloat(activeSellAd.quantity) || totalP2P;
  if (adOriginalQty > 0) {
    store.setOpeningInventory({
      startingUsdtBalance: adOriginalQty,
      defaultCostBasis: avgBuyCost
    });
    localStorage.setItem('bybit_last_synced_ad_id', activeSellAd.id);
    // ...
  }
}
```

#### Overwrite Vector 2: `js/settings.js` (Lines 156–187)
When `syncSettingsLiveHoldings(showToast)` runs upon clicking `#btn-sync-balance`:
```javascript
// js/settings.js lines 176-179
store.setOpeningInventory({
  startingUsdtBalance: adOriginalQty,
  defaultCostBasis: avgBuyCost
});
```

#### Why This Breaks Accounting:
`bybit_p2p_opening_inventory` represents historical inventory held prior to using the trade tracker. Overwriting it whenever a new ad is posted on Bybit or whenever the user syncs their live Bybit balance clobbers user-defined historical acquisition costs, falsifying FIFO P&L calculations.

#### Proposed Fix:
1. **In `js/dashboard.js`**: Delete lines 88–114. Detecting a new ad should only update the active ad card UI (`latestActiveAd`, price, margin, spread) without altering `store.setOpeningInventory`.
2. **In `js/settings.js`**: Delete lines 156–187 from `syncSettingsLiveHoldings()`. Clicking "Sync Holdings" should strictly refresh the balance display cells (`#settings-total-usdt`, `#settings-locked-usdt`, `#settings-free-usdt`).
3. **Preserve User Autonomy**: `store.setOpeningInventory` must *only* be called when the user explicitly submits `#form-opening-inventory` on the Data tab (`js/settings.js:57-66`).

---

### 1.4 Fee Calculation on Active Sell Ads (₦0 Fee Deduction)

#### Current Calculation in `js/dashboard.js` (Lines 120–123):
```javascript
// Projected profit = ONLY this ad's quantity × spread − estimated fees
const projectedGross = spreadPerUsdt * totalInAd;
const projectedNet = Math.max(0, projectedGross - 50); // 50 NGN estimated stamp duty
```

#### Root Cause:
The hardcoded `- 50` NGN deduction was mistakenly added as an estimated stamp duty. However:
1. Under Nigerian banking regulations (and as reflected in `js/fees.js:212-215`), merchants *receiving* Naira payments for P2P Sell orders do not pay stamp duty or transfer fees.
2. In `js/fees.js`, `calculateFintechTradeFees('SELL', ...)` explicitly returns `[]` (₦0 fees).
3. The acceptance criteria explicitly mandates: *"Projected profit on active Sell ads calculates with a ₦0 fee deduction when receiving Naira."*

#### Proposed Fix:
In `js/dashboard.js`:
```javascript
// Projected profit = ad's total quantity × spread (₦0 fee deduction when receiving Naira)
const projectedGross = spreadPerUsdt * totalInAd;
const projectedNet = Math.max(0, projectedGross);
```

---

## Part 2: R3 — Comprehensive Multi-Bank Order Reconciliation & Ledger Updates

### 2.1 Bybit Order Import Architecture & Current Flow

#### Modal View Inspection (`js/views/modals.view.js:124-146`):
```html
<!-- Modal: Assign Banks for Imported Orders -->
<div class="modal-backdrop hidden" id="modal-assign-banks-backdrop">
  <div class="modal-card">
    <div class="modal-header">
      <div>
        <h3 class="modal-title">Assign Bank for Buy Orders</h3>
        <p class="modal-subtitle">Select which bank sent Naira for each trade</p>
      </div>
      <!-- ... -->
    </div>
    <form id="form-assign-banks" class="modal-body">
      <div id="assign-banks-items-list" class="d-flex flex-column gap-3 mb-3 overflow-hidden" style="max-height: 380px; overflow-y: auto;"></div>
      <!-- ... -->
    </form>
  </div>
</div>
```

#### Controller Flow in `js/settings.js` (Lines 289–420):
1. User clicks `#btn-import-bybit-trades`.
2. `bybitService.fetchP2POrders(1, 30)` fetches recent orders.
3. Filters for completed orders (`status === 50`) not yet in store (`!existingRefIds.has(String(order.id))`).
4. Splits orders into `buyOrders` (side === 0) and `sellOrders` (side === 1).
5. **Defect**:
   - `if (buyOrders.length > 0 && assignList && modalAssign)`: Opens modal ONLY if BUY orders exist.
   - `assignList.innerHTML` ONLY renders HTML cards for `buyOrders`. For `sellOrders`, it appends a text note: `"Plus ${sellOrders.length} SELL order(s) will be automatically credited to your primary account."`
   - If there are NO BUY orders (only SELL orders exist), the `else` branch (lines 379–415) executes immediately without opening the modal, assigning all SELL orders to `defaultBankId` (`banks[0].id`).
   - When the form is submitted (lines 226–287), `selectedBankMap.get(orderId)` is checked. Since SELL orders had no dropdown in the modal, they all evaluate to `defaultBankId`.

---

### 2.2 Bank Ledger Accounting & Inflow/Outflow Balance Mechanics

#### Trace of `store.getComputedBankBalances()` (`js/store.js:188-257`):
```javascript
getComputedBankBalances() {
  const banks = this.getBankAccounts();
  const trades = this.getTrades();
  const transfers = this.getTransfers();

  const balanceMap = new Map();

  banks.forEach(bank => {
    const initBal = Number(bank.initialBalance) || 0;
    balanceMap.set(bank.id, {
      bank,
      initialBalance: initBal,
      currentBalance: initBal,
      totalInflow: 0,
      totalOutflow: 0,
      totalFees: 0
    });
  });

  // 1. Process Trades
  trades.forEach(trade => {
    const bankId = trade.bankAccountId;
    if (!balanceMap.has(bankId)) return;

    const record = balanceMap.get(bankId);
    const ngn = Number(trade.ngnAmount) || 0;
    const totalFees = Number(trade.totalFees) || 0;
    const netAmount = Number(trade.netAmount) || (trade.type === 'BUY' ? ngn + totalFees : Math.max(0, ngn - totalFees));

    if (trade.type === 'BUY') {
      record.currentBalance -= netAmount;
      record.totalOutflow += netAmount;
      record.totalFees += totalFees;
    } else if (trade.type === 'SELL') {
      record.currentBalance += netAmount;
      record.totalInflow += netAmount;
      record.totalFees += totalFees;
    }
  });

  // 2. Process Transfers
  // ...
  return balanceMap;
}
```

#### Why Multi-Bank Assignment is Critical:
- When a trade has a valid `bankAccountId`, `store.getComputedBankBalances()` correctly debits BUY trades (`record.currentBalance -= netAmount`) and credits SELL trades (`record.currentBalance += netAmount`).
- When all SELL orders default to `banks[0].id`, that single account's ledger is erroneously inflated by all P2P sales proceeds, while other bank accounts that actually received the buyer's funds remain unchanged.

---

### 2.3 Proposed Solution for Multi-Bank Reconciliation

#### 1. Update Modal Template (`js/views/modals.view.js`):
Update header title and subtitle:
```html
<h3 class="modal-title">Assign Bank Accounts</h3>
<p class="modal-subtitle">Select bank accounts for cash outflows (BUY) and cash inflows (SELL)</p>
```

#### 2. Update Import Trigger & Render Logic (`js/settings.js`):
Open the modal whenever `newOrders.length > 0`:
```javascript
// Render cards for ALL newOrders (both BUY and SELL)
assignList.innerHTML = newOrders.map(order => {
  const isBuy = Number(order.side) === 0;
  const direction = isBuy ? 'BUY' : 'SELL';
  const ngnAmount = parseFloat(order.amount) || 0;
  const usdtAmount = parseFloat(order.notifyTokenQuantity || order.quantity || 0);
  const rate = parseFloat(order.price) || 0;
  const counterparty = order.targetNickName || (isBuy ? order.sellerRealName : order.buyerRealName) || (isBuy ? 'Seller' : 'Buyer');
  const orderDateStr = order.createDate ? new Date(Number(order.createDate)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  const badgeStyle = isBuy 
    ? 'background: rgba(59, 130, 246, 0.15); color: var(--primary-light);' 
    : 'background: rgba(16, 185, 129, 0.15); color: var(--profit);';
  const labelText = isBuy ? 'Paid From Bank Account:' : 'Received Into Bank Account:';

  return `
    <div class="card p-3" style="background: rgba(10, 16, 28, 0.6); border: 1px solid rgba(255, 255, 255, 0.08);">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <div>
          <span class="brand-tag" style="${badgeStyle}">${direction} USDT</span>
          <strong class="ms-2 font-mono">₦${ngnAmount.toLocaleString('en-NG', { minimumFractionDigits: 2 })}</strong>
          <span class="text-muted small">(${usdtAmount.toFixed(2)} USDT @ ₦${rate.toFixed(2)})</span>
        </div>
        <span class="text-muted small">${orderDateStr}</span>
      </div>
      <div class="d-flex justify-content-between align-items-center mb-2">
        <span class="text-muted small">${isBuy ? 'To' : 'From'}: <strong>${escapeHtml(counterparty)}</strong></span>
      </div>
      <div class="form-group mb-2">
        <label class="form-label small text-muted mb-1">${labelText}</label>
        <select class="form-select form-select-sm assign-bank-select" data-order-id="${escapeHtml(String(order.id))}">
          ${bankOptionsHtml}
        </select>
      </div>
      ${isBuy ? `
      <div class="d-flex align-items-center gap-2">
        <input type="checkbox" class="form-check-input assign-same-bank-check" id="same-bank-${escapeHtml(String(order.id))}" data-order-id="${escapeHtml(String(order.id))}" checked>
        <label for="same-bank-${escapeHtml(String(order.id))}" class="small text-muted mb-0" style="cursor: pointer;">
          Same-Bank Transfer (OPay, PalmPay, Moniepoint, Kuda — Free under ₦10k)
        </label>
      </div>` : ''}
    </div>
  `;
}).join('');
```

#### 3. Update Submission Handler (`js/settings.js`):
When `formAssign` is submitted, iterate over `pendingImportOrders` and assign `selectedBankMap.get(orderId) || defaultBankId` for every trade (BUY and SELL alike).

---

## Part 3: Concrete Implementation Blueprint & Patch Plan

### Target Files & Changes Overview

| Target File | Changes |
|---|---|
| `js/dashboard.js` | 1. In `syncAndRenderActiveAd()`: Remove auto-sync of opening inventory on new ad detection (lines 88–114).<br>2. In `syncAndRenderActiveAd()`: Remove ₦50 fee subtraction for projected profit (line 122).<br>3. In `renderDashboardMetrics()`: Remove ad-hoc buyback override (lines 292–316) so portfolio overview consistently uses authoritative FIFO cost basis. |
| `js/settings.js` | 1. In `syncSettingsLiveHoldings()`: Remove `store.setOpeningInventory` call on holdings sync (lines 156–187).<br>2. In Order Import logic: Remove BUY-only conditional filter; render bank select dropdowns for all orders (BUY & SELL); allow assigning specific banks for every imported order. |
| `js/views/modals.view.js` | Update Assign Banks modal title and subtitle from "Assign Bank for Buy Orders" to "Assign Bank Accounts for Imported Orders". |

---

## Part 4: Verification & Test Procedures

### Test Case 1: FIFO Consistency Across Views
1. Record a series of BUY trades (e.g. 500 USDT @ ₦1,450.00, 500 USDT @ ₦1,470.00).
2. Configure or post an active sell ad on Bybit.
3. Compare the Average Cost Basis displayed on:
   - Dashboard Portfolio Overview (`#stat-inventory-cost`)
   - Active Sell Ad Card (`#metric-ad-avg-buy-cost`)
   - Pricing Assistant (`#pricing-cost-basis`)
4. **Pass Criteria**: All three views display the exact same authoritative FIFO cost basis (₦1,460.00 / USDT).

### Test Case 2: Opening Inventory Protection
1. In Settings > Data tab, configure Starting USDT = `250.00` and Acquisition Rate = `1,400.00`. Save.
2. In Settings > Bybit Sync, click "Sync Holdings".
3. Return to Dashboard and trigger active ad sync.
4. Inspect `localStorage.getItem('bybit_p2p_opening_inventory')` and the inputs on the Data tab.
5. **Pass Criteria**: `startingUsdtBalance` remains `250.00` and `defaultCostBasis` remains `1400.00`. No automated overwrite occurs.

### Test Case 3: Active Sell Ad Fee Calculation (₦0 Fee)
1. Post or simulate an active Sell Ad with 100 USDT @ ₦1,500.00 with a cost basis of ₦1,450.00 (Spread = +₦50/USDT).
2. Inspect Projected Profit on Dashboard (`#metric-ad-projected-pnl`).
3. **Pass Criteria**: Projected profit equals `100 * 50 = +₦5,000.00` with ₦0 fee deduction (not ₦4,950.00).

### Test Case 4: Multi-Bank Import Reconciliation
1. Create 3 bank accounts in Settings: OPay (`bank_opay`), Kuda (`bank_kuda`), GTBank (`bank_gtb`).
2. Trigger Bybit order import with a batch containing both BUY and SELL orders (or SELL-only orders).
3. Verify that the Assign Banks modal opens and displays dropdowns for each order.
4. Assign BUY order to OPay and SELL order to Kuda.
5. Confirm import and inspect the Bank Accounts list in Settings and Portfolio Bank Cash on Dashboard.
6. **Pass Criteria**: OPay balance is debited by BUY netAmount, Kuda balance is credited by SELL netAmount, and GTBank remains unchanged.
