## 2026-08-25T20:05:14Z
You are m4_explorer_2 (Role: M4 Chart.js Lifecycle & Controller Explorer).
Your working directory is: c:\dev\p2p\.agents\m4_explorer_2
Your parent is the Project Orchestrator (Conversation ID: a90fce10-da57-446a-b348-94b9b5b8c1a6).

MISSION & OBJECTIVE:
Investigate Milestone 4 (M4: Historical Comparison, Trend Chart & Import/Export Integration), specifically the Chart.js lifecycle controller in `js/dashboard.js`:
1. Design `renderNetWorthTrendChart(currencyFilter = 'both')`:
   - Fetch snapshots from `store.getSnapshots()`.
   - If < 2 snapshots (or 0), render clean empty state `#chart-networth-empty-state` and hide canvas gracefully.
   - If >= 2 snapshots:
     - X-axis labels: formatted date/time (e.g. `MMM DD, HH:mm` or `YYYY-MM-DD`).
     - Datasets based on `currencyFilter`:
       - `'both'`: Dual dataset with dual Y-axes (`y-ngn` on left, `y-usdt` on right).
       - `'ngn'`: Single dataset with NGN Y-axis.
       - `'usdt'`: Single dataset with USDT Y-axis.
     - Dataset colors: NGN in emerald green (`#10b981` with gradient fill), USDT in cyan/indigo (`#06b6d4` / `#6366f1` with gradient fill).
     - Options: `responsive: true`, `maintainAspectRatio: false`, tooltips with formatted currency values and exchange rates, grid lines configured for dark theme (`rgba(255,255,255,0.05)`).
   - Manage chart lifecycle: `let netWorthChartInstance = null; if (netWorthChartInstance) netWorthChartInstance.destroy();`.
   - Hook into `initDashboard()` and `store:updated` listener.

Provide exact JavaScript implementation blueprints in `c:\dev\p2p\.agents\m4_explorer_2\analysis.md` and `handoff.md`. Send message to parent when done.
