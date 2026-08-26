## 2026-08-25T13:49:33Z

You are m3_worker_1 (Role: Milestone 3 Implementation Worker).
Your working directory is: c:\dev\p2p\.agents\m3_worker_1
Your parent is the Project Orchestrator (Conversation ID: a90fce10-da57-446a-b348-94b9b5b8c1a6).

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MISSION & OBJECTIVE:
Implement Milestone 3 (M3: End Day / Save Snapshot Modal & Persistence) based on the Explorer blueprints:
1. `js/views/modals.view.js`:
   - Add `#modal-snapshot-backdrop` with `#form-save-snapshot` to the modals container template.
   - Include:
     - Close button (`#btn-close-snapshot-modal`) and title.
     - Live Bank Cash stat card (`#snapshot-bank-cash`) & Bybit USDT stat card (`#snapshot-usdt-balance`).
     - Editable Reference Rate input (`#input-snapshot-ref-rate` type="number" step="any" min="0.01" required).
     - Live Recalculated Net Worth Preview banner (`#snapshot-preview-networth-ngn`, `#snapshot-preview-networth-usdt`).
     - Optional Notes textarea (`#input-snapshot-notes` maxlength="500").
     - Cancel button (`#btn-cancel-snapshot-modal`) & Submit button (`#btn-save-snapshot-submit` type="submit").
2. `js/dashboard.js`:
   - Implement `openSnapshotModal()`:
     - Calculate live bank cash via `calculateTotalBankCash(store.getComputedBankBalances())`.
     - Calculate live Bybit USDT balance (funding wallet + active ads, falling back to FIFO inventory).
     - Resolve default rate via `resolveReferenceRate(...)`.
     - Pre-fill inputs and calculate initial preview net worth.
     - Display modal (remove `.hidden` from `#modal-snapshot-backdrop`).
   - Implement `setupSnapshotModalEvents()`:
     - Hook open trigger (`#btn-open-snapshot-modal` on `#card-net-worth`).
     - Hook close/cancel triggers (`#btn-close-snapshot-modal`, `#btn-cancel-snapshot-modal`, backdrop click, Escape key).
     - Hook input event on `#input-snapshot-ref-rate`: dynamically recalculate preview Net Worth in NGN and USDT via `calculateNetWorth(...)` on every keystroke.
     - Hook submit event on `#form-save-snapshot`:
       - Validate rate > 0 and valid numbers.
       - Construct snapshot payload: `{ timestamp: new Date().toISOString(), bankCash, usdtBalance, referenceRate, notes }`.
       - Call `store.saveSnapshot(snapshotData)`.
       - Close modal.
       - Call `window.showToast('Net worth snapshot saved successfully', 'success')`.
       - Re-render dashboard metrics, net worth widget, and delta badges.
   - Initialize `setupSnapshotModalEvents()` in `initDashboard()`.
3. `css/styles.css`:
   - Add styles for `.modal-card-lg`, `.snapshot-stats-grid`, `.snapshot-stat-card`, `.snapshot-preview-banner` with responsive and theme tokens.
4. Testing:
   - Run `node test/run-tests.js`. Ensure 100% tests pass.

WRITE OWNERSHIP:
- You exclusively own `js/views/modals.view.js`, `js/dashboard.js`, `css/styles.css`, and test files in `test/`.

INPUTS:
- `c:\dev\p2p\.agents\ORIGINAL_REQUEST.md`
- `c:\dev\p2p\PROJECT.md`
- `c:\dev\p2p\.agents\m3_explorer_1\analysis.md`
- `c:\dev\p2p\.agents\m3_explorer_2\analysis.md`
- `c:\dev\p2p\.agents\m3_explorer_3\analysis.md`

OUTPUTS:
- Write `c:\dev\p2p\.agents\m3_worker_1\handoff.md`
- Send completion message to parent with build/test results and modified file list.
