# Milestone 2 (M2) UI Markup & Layout Explorer Handoff Report

**Agent**: `m2_explorer_1` (Role: M2 UI Markup & Layout Explorer)  
**Parent**: Project Orchestrator (`a90fce10-da57-446a-b348-94b9b5b8c1a6`)  
**Mission**: Investigate Milestone 2 (M2: Live Net Worth Dashboard Widget UI), specifically DOM layout, component architecture, and styling.

---

## 1. Observation

1. **Dashboard View Structure (`js/views/dashboard.view.js:5-166`)**:
   - `renderDashboardView()` currently renders a `<section class="app-view active" id="view-dashboard" data-view="dashboard">` containing `.view-header`, Portfolio Overview card (`#stat-total-bank-cash`, `#stat-inventory-holding`, `#stat-net-pnl`), Active Ad card (`#card-active-ad-spread`), Capital Allocation card (`#card-capital-allocation`), Chart card (`#pnlChart`), and Recent Activity card (`#recent-activity-dashboard-card`).
   - No Net Worth Hero Widget exists yet on the Dashboard.

2. **Design Tokens and Styling System (`css/styles.css:6-140, 745-785, 1212-1239, 1466-1545`)**:
   - CSS variables define colors (`--bg-card: rgba(18, 28, 47, 0.72)`, `--primary: #3B82F6`, `--success: #10B981`, `--danger: #F43F5E`, `--warning: #F59E0B`, `--border-card: rgba(255, 255, 255, 0.12)`).
   - Card layout relies on `.card` with `backdrop-filter: blur(16px); border-radius: var(--radius-lg); padding: var(--sp-5);`.
   - Badges use `.live-badge` with animated dot (`.live-badge-dot`), `.badge-success`, `.badge-danger`, `.badge-neutral`.
   - Typography uses `font-mono` for financial amounts, `clamp()` and responsive type scales.

3. **M1 Calculation Engine & Storage (`js/utils.js:311-543`, `js/store.js:400-488`)**:
   - `calculateTotalBankCash(computedBankBalances)` returns total liquid bank cash in NGN.
   - `resolveReferenceRate(options)` returns prioritized exchange rate in NGN per USDT.
   - `calculateNetWorth(bankCash, totalUsdt, referenceRate)` returns `{ netWorthNgn, netWorthUsdt }`.
   - `calculateSnapshotDelta(current, previous)` returns `{ deltaNgn, pctDeltaNgn, deltaUsdt, pctDeltaUsdt }`.
   - `store.getSnapshots()` retrieves historical snapshots sorted chronologically.

---

## 2. Logic Chain

1. From **Observation 1**, the Dashboard view is the landing cockpit for the application. Placing `#card-net-worth` as the very first card immediately after `.view-header` ensures users get an instant live valuation of their entire capital cycle.
2. From **Observation 2**, using existing design tokens (`var(--bg-card)`, `var(--primary)`, `var(--success)`, `var(--font-mono)`) ensures consistency with the slate/navy glassmorphic theme and automatic compatibility with light mode (`[data-theme="light"]`).
3. From **Observation 3**, the DOM markup must expose the exact 8 contract element IDs required by Milestone 2:
   - `#card-net-worth`: Main container card.
   - `#stat-net-worth-ngn`: Primary NGN Net Worth.
   - `#stat-net-worth-usdt`: Secondary USDT Net Worth.
   - `#metric-nw-bank-cash`: Bank Cash NGN breakdown.
   - `#metric-nw-bybit-usdt`: Bybit USDT breakdown.
   - `#metric-nw-ref-rate`: Reference Exchange Rate breakdown.
   - `#badge-net-worth-delta`: Historical comparison delta container.
   - `#btn-open-snapshot-modal`: Action button hook to open the End Day / Save Snapshot modal.
4. Structuring the sub-metrics in a 3-column responsive grid (`repeat(3, 1fr)` down to `1fr` on screens $\le 768\text{px}$) ensures clear visual hierarchy and mobile friendliness.

---

## 3. Caveats

1. The modal markup itself (`#modal-save-snapshot`) belongs to Milestone 3 (`modals.view.js`). M2 provides the hook button (`#btn-open-snapshot-modal`) and triggers the open event/callback.
2. Live Bybit USDT balance resolution falls back to FIFO unsold inventory when Bybit API is offline or unconfigured.
3. No other uninvestigated areas.

---

## 4. Conclusion

The UI layout, HTML template strings, CSS rules, and controller integration blueprint for Milestone 2 (`#card-net-worth` Hero Widget) are completely specified and documented in `c:\dev\p2p\.agents\m2_explorer_1\analysis.md`. The design fulfills all R1, R2, and R3 requirements with benchmark UI/UX standards.

---

## 5. Verification Method

1. **Inspection Verification**:
   - Verify `analysis.md` contains the exact 8 DOM IDs:
     - `#card-net-worth`
     - `#stat-net-worth-ngn`
     - `#stat-net-worth-usdt`
     - `#metric-nw-bank-cash`
     - `#metric-nw-bybit-usdt`
     - `#metric-nw-ref-rate`
     - `#badge-net-worth-delta`
     - `#btn-open-snapshot-modal`
   - Verify CSS rules in `analysis.md` include responsive breakpoints for 768px and 480px.

2. **Automated Test Run**:
   - Execute existing tests via Node.js:
     `node --test test/`
   - Invalidation condition: Missing any required ID or breaking existing layout/responsive styles.
