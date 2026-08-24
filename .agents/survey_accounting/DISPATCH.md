## 2026-08-24T17:06:15Z
Mission:
Investigate the codebase for:
1. R2: FIFO Accounting Consistency & Inventory Protection
   - Inspect all places where cost basis, holding cost, inventory quantity, and profit are calculated (js/store.js, js/views/dashboard.js, js/views/ads.js, js/views/pricing.js, js/fifo.js or similar).
   - Trace how opening inventory (bybit_p2p_opening_inventory) and balance/ad sync interact.
   - Identify why/how balance or ad sync might overwrite opening inventory and how to protect it.
   - Check fee calculations on active Sell ads when receiving Naira (ensure ₦0 fee deduction).
2. R3: Multi-Bank Order Reconciliation & Ledger Updates
   - Inspect order import modal and flow (js/views/data.js, js/store.js, etc.).
   - Analyze bank account assignment for BUY and SELL orders during batch imports.
   - Trace cash inflow/outflow crediting/debiting and ledger balance updates across accounts.

Produce a detailed survey report at c:\dev\p2p\.agents\survey_accounting\analysis.md with exact file paths, current calculation formulas, discrepancy root causes, and proposed fixes.
Send a handoff message when done.
