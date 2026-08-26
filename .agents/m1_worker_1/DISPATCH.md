## 2026-08-25T13:14:42Z
You are m1_worker_1 (Role: Milestone 1 Implementation Worker).
Your working directory is: c:\dev\p2p\.agents\m1_worker_1
Your parent is the Project Orchestrator (Conversation ID: a90fce10-da57-446a-b348-94b9b5b8c1a6).

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MISSION & OBJECTIVE:
Implement Milestone 1 (M1: Core Calculations & Snapshot Store Engine) based on the Explorer specifications:
1. `js/utils.js`: Implement and export pure mathematical calculation helpers:
   - `calculateTotalBankCash(computedBankBalances)`: Aggregates balances from Map, Array, or Object, preserving negative overdraft balances and handling nulls/undefined safely.
   - `resolveReferenceRate(options)`: Priority hierarchy (Active Sell Ad price [status 10/20/2] > Latest Trade rate > FIFO avg buy cost > Opening default cost basis > Fallback 1500.00). Must validate positive finite numbers.
   - `calculateNetWorth(totalBankCashNgn, totalUsdt, referenceRate)`: Closed-form valuation ($\text{NW}_{\text{NGN}} = T_{\text{bank}} + (U_{\text{bybit}} \times R_{\text{ref}})$ and $\text{NW}_{\text{USDT}} = U_{\text{bybit}} + (T_{\text{bank}} / R_{\text{ref}})$) with zero/negative divisor guards.
   - `calculateSnapshotDelta(current, previous)`: Absolute and % deltas with zero-division protection and sign-preserving negative baselines.
   - `validateSnapshot(snapshotData)`: Schema validation, sanitization, default ID/timestamp generation, and auto-derivation of net worth.
2. `js/store.js`:
   - Add `STORAGE_KEYS.NET_WORTH_SNAPSHOTS = 'bybit_p2p_net_worth_snapshots'`.
   - Implement snapshot CRUD: `getSnapshots()`, `getSnapshotById(id)`, `saveSnapshot(snapshotData)`, `deleteSnapshot(id)`, `clearSnapshots()`.
   - Ensure snapshots are maintained in chronological order (ascending by timestamp).
   - Ensure `saveSnapshot`, `deleteSnapshot`, and `clearSnapshots` trigger `store.notify('SNAPSHOTS_UPDATED', ...)` / `store:updated`.
   - Integrate into `store.exportAllData()`, `store.importAllData(data, replace)`, and `store.clearAllData()`.
3. `js/export.js`:
   - Ensure backup JSON export and import seamlessly include and validate `snapshots`.
4. Verification:
   - Create unit tests for M1 functions and run `node test/run-tests.js`. Ensure 100% tests pass.

WRITE OWNERSHIP:
- You exclusively own `js/utils.js`, `js/store.js`, `js/export.js`, and new M1 unit tests in `test/`.

INPUTS:
- `c:\dev\p2p\.agents\ORIGINAL_REQUEST.md`
- `c:\dev\p2p\PROJECT.md`
- `c:\dev\p2p\.agents\m1_explorer_1\analysis.md`
- `c:\dev\p2p\.agents\m1_explorer_2\analysis.md`
- `c:\dev\p2p\.agents\m1_explorer_3\analysis.md`

OUTPUTS:
- Write `c:\dev\p2p\.agents\m1_worker_1\handoff.md`
- Send completion message to parent with build/test results and file list.
