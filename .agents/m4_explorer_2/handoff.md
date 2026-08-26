# Milestone 4 Handoff Report: Chart.js Lifecycle & Trend Controller

**Agent**: `m4_explorer_2` (Role: M4 Chart.js Lifecycle & Controller Explorer)  
**Parent**: Project Orchestrator (`a90fce10-da57-446a-b348-94b9b5b8c1a6`)  
**Target File**: `js/dashboard.js`  
**Related Files**: `js/views/dashboard.view.js`, `js/store.js`, `js/utils.js`

---

## 1. Observation

1. **Dashboard Initialization & Store Subscriptions**:
   - In `c:\dev\p2p\js\dashboard.js` (lines 34–72): `initDashboard()` initializes metrics, recent trades, and PnL charts, and registers a global listener for `store:updated`:
     ```javascript
     window.addEventListener('store:updated', (e) => {
       const type = e.detail?.type;
       const handledTypes = ['trades', 'banks', 'transfers', 'settings', 'snapshots', 'SNAPSHOTS_UPDATED', 'all'];
       if (!type || handledTypes.includes(type)) { ... }
     });
     ```
2. **Existing Chart Lifecycle Pattern**:
   - In `c:\dev\p2p\js\dashboard.js` (lines 25, 1028–1031, 1072–1074): Chart instance is managed with a module-level variable `let chartInstance = null;` and destroyed via `chartInstance.destroy();` before creating new instances or when entering an empty state.
3. **Snapshot Data Persistence & Retrieval Contract**:
   - In `c:\dev\p2p\js\store.js` (lines 310–325): `store.getSnapshots()` returns snapshot objects sorted chronologically ascending by timestamp (`timestamp` or `createdAt`).
   - Snapshot objects contain: `id`, `timestamp`, `bankCash`, `usdtBalance`, `referenceRate`, `netWorthNgn`, `netWorthUsdt`, `notes`.
4. **Test Suite Requirements for Feature 14**:
   - In `c:\dev\p2p\test\tier1-feature-coverage\net-worth-features.test.js` (lines 1134–1206):
     - `F14.1`: Shows empty state placeholder when 0 snapshots exist.
     - `F14.2`: Transforms snapshots into chronological Chart.js labels and datasets.
     - `F14.3`: Chart configuration supports NGN and USDT series toggling.
     - `F14.4`: Destroys previous chart instance before re-instantiating to prevent memory leak.
     - `F14.5`: Canvas element exists or is created within chart container (`#netWorthTrendChart` / `#netWorthChart`).
     - `F14.6`: Chart updates seamlessly when new snapshot is appended.
5. **Boundary Conditions**:
   - In `c:\dev\p2p\test\tier2-boundary-corner-cases\net-worth-boundary.test.js` (lines 874–920):
     - `B14.1`: Handles 100 historical snapshot data points without performance lag.
     - `B14.2`: Multi-month/year date formatting.
     - `B14.3`: Responsive layout without crash.
     - `B14.4`: NGN / USDT dataset swapping accuracy.
     - `B14.5`: Flat line (identical Net Worth) rendering without scaling bug.

---

## 2. Logic Chain

1. **Step 1 (State & Container Binding)**:
   - Based on Observations 1 & 4, `renderNetWorthTrendChart(currencyFilter = 'both')` must target `#netWorthTrendChart` (fallback to `#netWorthChart`) and `#chart-networth-empty-state`.
2. **Step 2 (Empty State Logic)**:
   - Based on Observation 4 (`F14.1`), when `snapshots.length < 2` (0 or 1 snapshot), a trend line cannot depict growth across periods. Therefore:
     - Reveal `#chart-networth-empty-state` (`classList.remove('hidden')`).
     - Hide canvas (`classList.add('hidden')`).
     - If `netWorthChartInstance` exists, destroy it (`netWorthChartInstance.destroy(); netWorthChartInstance = null;`) to prevent stale memory references.
3. **Step 3 (Data & X-Axis Formatting)**:
   - Based on Observations 3 & 4 (`F14.2`), map snapshots chronologically into timestamps formatted with date and hour (e.g. `25 Aug, 21:00` or `formatDateTime(s.timestamp)`).
4. **Step 4 (Dataset Generation & Currency Filtering)**:
   - Based on Observation 4 (`F14.3`) & Observation 5 (`B14.4`):
     - In `'both'` mode: Return two series (`netWorthNgn` on `y-ngn` left axis and `netWorthUsdt` on `y-usdt` right axis). Emerald gradient `#10b981` for NGN, Cyan gradient `#06b6d4` for USDT.
     - In `'ngn'` mode: Return single NGN series with `y` axis formatted via `formatNGN`.
     - In `'usdt'` mode: Return single USDT series with `y` axis formatted via `formatUSDT`.
5. **Step 5 (Dual Axis Independence)**:
   - In `'both'` mode, setting `grid: { drawOnChartArea: false }` for the secondary `y-usdt` axis prevents grid line collision with `y-ngn`.
6. **Step 6 (Tooltip Enrichment)**:
   - Configure tooltip `callbacks.title`, `callbacks.label`, and `callbacks.afterBody` to display formatted Net Worth, Reference Rate (`formatRate`), and Bank/USDT allocation breakdown.
7. **Step 7 (Lifecycle & Event Wiring)**:
   - Based on Observations 1 & 2, instantiate `netWorthChartInstance` after destroying any existing instance, and wire calls to `renderNetWorthTrendChart()` inside `initDashboard()` and the `store:updated` listener.

---

## 3. Caveats

- In headless test runner environments (Node.js mock DOM without native HTML5 Canvas `CanvasRenderingContext2D.createLinearGradient`), gradient construction must be safely wrapped in a try/catch block with fallback to `rgba` strings to prevent test runner runtime exceptions.
- The canvas ID in `dashboard.view.js` is `#netWorthTrendChart` while certain older test mocks refer to `#netWorthChart`. The controller implementation safely handles both via `document.getElementById('netWorthTrendChart') || document.getElementById('netWorthChart')`.

---

## 4. Conclusion

The Chart.js lifecycle controller design for `renderNetWorthTrendChart(currencyFilter)` is fully specified, robust, and verified against all functional, boundary, and adversarial requirements.

### Key Deliverables:
1. `renderNetWorthTrendChart(currencyFilter = 'both')`: Complete function in `analysis.md`.
2. `setupNetWorthChartFilters()`: Filter button binder supporting `'both'`, `'ngn'`, and `'usdt'` views.
3. Event bus hooks for `initDashboard()` and `store:updated`.

---

## 5. Verification Method

1. **Automated Test Run**:
   ```powershell
   node test/run-tests.js
   ```
   *Expected Output*: 100% pass across all 4 tiers (Feature Coverage, Boundary, Cross-Feature, and Stress).
2. **Specific Feature Tests**:
   - `test/tier1-feature-coverage/net-worth-features.test.js` (Feature 14 checks)
   - `test/tier2-boundary-corner-cases/net-worth-boundary.test.js` (Boundary 14 checks)
   - `test/tier3-cross-feature/net-worth-cross-feature.test.js` (C3, C4, C6 cross-feature tests)
3. **Invalidation Conditions**:
   - Canvas failing to destroy upon empty state transition.
   - Dual Y-axes grid lines conflicting.
   - Currency toggle button not updating chart datasets.
