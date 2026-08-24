# Handoff Report — Accounting, Inventory & Ledger Calculations (R2 & R3)

## 1. Observation
- In `js/dashboard.js` (lines 292–316), `renderDashboardMetrics()` overrides the FIFO engine inventory calculation with an ad-hoc buyback loop filtered on `tradeTime >= adCreateTime`. This causes `#stat-inventory-holding` and `#stat-inventory-cost` on the Dashboard Portfolio Overview to deviate from `#pricing-cost-basis` in `js/pricing.js` (which uses `fifoResult.avgHoldingCostPerUSDT`).
- In `js/dashboard.js` (lines 88–114), `syncAndRenderActiveAd()` calls `store.setOpeningInventory({ startingUsdtBalance: adOriginalQty, defaultCostBasis: avgBuyCost })` whenever a new active ad ID is detected.
- In `js/settings.js` (lines 156–187), `syncSettingsLiveHoldings()` calls `store.setOpeningInventory({ startingUsdtBalance: adOriginalQty, defaultCostBasis: avgBuyCost })` whenever the user clicks `#btn-sync-balance`.
- In `js/dashboard.js` (line 122), projected profit on the active sell ad is computed as `const projectedNet = Math.max(0, projectedGross - 50);`, subtracting ₦50 stamp duty even though receiving Naira on Sell ads incurs ₦0 fees under Nigerian banking rules and `js/fees.js:212-215`.
- In `js/settings.js` (lines 320–420) and `js/views/modals.view.js` (lines 124–146), order import only presents bank assignment dropdowns for BUY orders (`buyOrders`). SELL orders (`sellOrders`) are excluded from interactive selection and automatically defaulted to `defaultBankId` (`banks[0].id`), and if a batch only has SELL orders, the modal is bypassed entirely.

## 2. Logic Chain
1. *Observation 1 (FIFO divergence)* → `calculateFIFOInventoryAndPnL` in `js/utils.js` correctly maintains the FIFO queue and yields `avgHoldingCostPerUSDT`. `pricing.js` consumes this directly, but `dashboard.js` overrides it when `latestActiveAd` is present. Removing this override unifies cost basis and holding quantities across Portfolio Overview, Active Ad, and Pricing Assistant.
2. *Observations 2 & 3 (Opening inventory overwrites)* → Opening inventory is stored in `localStorage` under `bybit_p2p_opening_inventory` and represents pre-existing tokens configured by the user. Both ad detection in `dashboard.js` and balance sync in `settings.js` mutate this key without user intent. Removing those mutation calls protects user-configured opening inventory.
3. *Observation 4 (₦50 fee deduction on Sell ads)* → In P2P trading, selling crypto and receiving fiat Naira via bank transfer incurs ₦0 fees on the receiving bank account. Deducting 50 NGN distorts projected profit. Setting `projectedNet = Math.max(0, projectedGross)` aligns with business logic and acceptance criteria.
4. *Observation 5 (Batch import single-bank bias for SELL orders)* → `store.getComputedBankBalances()` in `js/store.js` supports dynamic debits (BUY) and credits (SELL) per bank account ID. Because the UI modal in `settings.js` only exposes bank selection for BUY orders, all SELL inflows default to `banks[0].id`. Rendering bank selection for both BUY and SELL orders in the modal enables comprehensive multi-bank reconciliation across all accounts.

## 3. Caveats
- Investigated static code logic across frontend and proxy handlers. Backend proxy endpoints (`/api/orders`, `/api/balance`, `/api/ads`, `/api/market-depth`) return standard Bybit response schemas (`status === 50`, `side === 0/1`, `amount`, `price`, `quantity`, `notifyTokenQuantity`).
- No live Bybit API keys are modified during read-only survey.

## 4. Conclusion
- R2 and R3 requirements are fully analyzed with exact line-by-line root causes and drop-in code remedies identified.
- Detailed survey report is available at `c:\dev\p2p\.agents\survey_accounting\analysis.md`.

## 5. Verification Method
- **Test 1**: Verify cost basis parity between Dashboard Portfolio Overview and Pricing Assistant.
- **Test 2**: Verify `bybit_p2p_opening_inventory` remains untouched during balance sync and active ad detection.
- **Test 3**: Verify projected profit calculation on active Sell ad with ₦0 fee deduction.
- **Test 4**: Verify order import modal presents bank dropdowns for both BUY and SELL orders and ledger balances update appropriately in `store.getComputedBankBalances()`.
