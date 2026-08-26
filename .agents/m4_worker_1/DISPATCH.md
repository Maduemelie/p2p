## 2026-08-25T20:07:42Z

You are m4_worker_1 (Role: Milestone 4 Implementation Worker).
Your working directory is: c:\dev\p2p\.agents\m4_worker_1
Your parent is the Project Orchestrator (Conversation ID: a90fce10-da57-446a-b348-94b9b5b8c1a6).

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MISSION & OBJECTIVE:
Implement Milestone 4 (M4: Historical Comparison, Trend Chart & Import/Export Integration) based on the Explorer blueprints:
1. `js/views/dashboard.view.js`:
   - Add `#card-net-worth-trend` card to Dashboard view.
   - Include:
     - Card header: title "Net Worth Growth Trend" and currency filter buttons (`#filter-chart-both`, `#filter-chart-ngn`, `#filter-chart-usdt`).
     - Chart canvas container with `<canvas id="netWorthTrendChart"></canvas>` and empty state banner (`#chart-networth-empty-state`).
     - Snapshot History table / list container `#table-snapshot-history` with columns: Date/Time, Bank Cash (NGN), Bybit Balance (USDT), Reference Rate, Net Worth (NGN & USDT), Growth Delta ($\Delta$), Notes, and Actions (Delete button).
2. `js/dashboard.js`:
   - Implement `renderNetWorthTrendChart(currencyFilter = 'both')`:
     - Retrieve snapshots via `store.getSnapshots()`.
     - If < 2 snapshots, display empty state banner and hide/clear canvas gracefully.
     - If >= 2 snapshots:
       - Destroy previous chart instance: `if (netWorthChartInstance) { netWorthChartInstance.destroy(); netWorthChartInstance = null; }`.
       - Render Chart.js line chart with X-axis formatted timestamps.
       - If filter is `'both'`: Dual Y-axes (left: `y-ngn` formatted in NGN, right: `y-usdt` formatted in USDT).
       - If filter is `'ngn'`: Single dataset and axis for NGN.
       - If filter is `'usdt'`: Single dataset and axis for USDT.
       - Use gradient fills and dark theme tooltips with currency formatting.
   - Implement `renderSnapshotHistoryTable()`:
     - Retrieve snapshots via `store.getSnapshots()`.
     - Compute sequential deltas for each snapshot $S_k$ against $S_{k-1}$ via `calculateSnapshotDelta(S_k, S_{k-1})`.
     - Render in reverse chronological order (newest first).
     - Render delta badges with `.badge-success` for positive, `.badge-danger` for negative, `.badge-neutral` for flat/first snapshot.
     - Wire delete button (`.btn-delete-snapshot` / `#btn-delete-snapshot-${id}`) with confirm prompt: call `store.deleteSnapshot(id)`, show success toast, and re-render dashboard, widget, chart, and history table.
   - Implement `setupNetWorthChartFilters()`:
     - Hook filter buttons to change active button styling and re-render chart with selected currency.
   - Hook `renderNetWorthTrendChart()` and `renderSnapshotHistoryTable()` into `renderDashboardMetrics()`, `initDashboard()`, and `store:updated` event listener.
3. `css/styles.css`:
   - Add styles for `.chart-container`, `.filter-btn-group`, `.snapshot-history-table`, `.badge`, responsive table scroll, and theme overrides.
4. Testing:
   - Run `node test/run-tests.js`. Ensure 100% tests pass.

WRITE OWNERSHIP:
- You exclusively own `js/views/dashboard.view.js`, `js/dashboard.js`, `css/styles.css`, and test files in `test/`.

INPUTS:
- `c:\dev\p2p\.agents\ORIGINAL_REQUEST.md`
- `c:\dev\p2p\PROJECT.md`
- `c:\dev\p2p\.agents\m4_explorer_1\analysis.md`
- `c:\dev\p2p\.agents\m4_explorer_2\analysis.md`
- `c:\dev\p2p\.agents\m4_explorer_3\analysis.md`

OUTPUTS:
- Write `c:\dev\p2p\.agents\m4_worker_1\handoff.md`
- Send completion message to parent with build/test results and modified file list.
