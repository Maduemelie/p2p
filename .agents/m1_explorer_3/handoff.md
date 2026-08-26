# M1 Handoff Report: JSON Backup, Restore, and Reset Integration

**Agent**: `m1_explorer_3` (Role: M1 Backup/Restore Explorer)  
**Parent**: Project Orchestrator (`a90fce10-da57-446a-b348-94b9b5b8c1a6`)  
**Working Directory**: `c:\dev\p2p\.agents\m1_explorer_3`  
**Milestone**: M1: Core Calculations & Snapshot Store Engine  
**Type**: Hard Handoff (Investigation Complete)  

---

## 1. Observation

Direct observations from codebase inspection:

1. **`js/store.js:8–15` (Storage Keys Definition)**:
   ```javascript
   const STORAGE_KEYS = {
     VERSION: 'bybit_p2p_version',
     TRADES: 'bybit_p2p_trades',
     BANKS: 'bybit_p2p_banks',
     TRANSFERS: 'bybit_p2p_transfers',
     SETTINGS: 'bybit_p2p_settings',
     OPENING_INVENTORY: 'bybit_p2p_opening_inventory'
   };
   ```
   `STORAGE_KEYS.NET_WORTH_SNAPSHOTS` is currently missing from `STORAGE_KEYS`.

2. **`js/store.js:305–314` (`exportAllData` Implementation)**:
   ```javascript
   exportAllData() {
     return {
       version: CURRENT_SCHEMA_VERSION,
       exportedAt: new Date().toISOString(),
       trades: this.getTrades(),
       bankAccounts: this.getBankAccounts(),
       transfers: this.getTransfers(),
       openingInventory: this.getOpeningInventory()
     };
   }
   ```
   `exportAllData()` does not include `snapshots: this.getSnapshots()`.

3. **`js/store.js:316–344` (`importAllData` Implementation)**:
   ```javascript
   importAllData(data, replace = true) {
     if (!data || typeof data !== 'object') {
       throw new Error('Invalid JSON backup data format.');
     }

     if (replace) {
       if (Array.isArray(data.trades)) this.saveItem(STORAGE_KEYS.TRADES, data.trades);
       if (Array.isArray(data.bankAccounts)) this.saveItem(STORAGE_KEYS.BANKS, data.bankAccounts);
       if (Array.isArray(data.transfers)) this.saveItem(STORAGE_KEYS.TRANSFERS, data.transfers);
       if (data.openingInventory) this.saveItem(STORAGE_KEYS.OPENING_INVENTORY, data.openingInventory);
     } else {
       // Merge
       ...
     }
     this.notify('all');
     return true;
   }
   ```
   `importAllData()` has no handler for `data.snapshots` under either `replace` or `merge` mode.

4. **`js/store.js:346–353` (`clearAllData` Implementation)**:
   ```javascript
   clearAllData() {
     localStorage.removeItem(STORAGE_KEYS.TRADES);
     localStorage.removeItem(STORAGE_KEYS.BANKS);
     localStorage.removeItem(STORAGE_KEYS.TRANSFERS);
     localStorage.removeItem(STORAGE_KEYS.OPENING_INVENTORY);
     this.init();
     this.notify('all');
   }
   ```
   `clearAllData()` purges trades, banks, transfers, and opening inventory, but does not remove `bybit_p2p_net_worth_snapshots`.

5. **`js/export.js:128–139` (`importBackupJSON` Schema Check & Confirmation)**:
   ```javascript
   if (!data || typeof data !== 'object' || (!data.trades && !data.bankAccounts)) {
     throw new Error('Invalid or unrecognised JSON backup schema.');
   }
   const tradeCount = Array.isArray(data.trades) ? data.trades.length : 0;
   const bankCount = Array.isArray(data.bankAccounts) ? data.bankAccounts.length : 0;
   const confirmMsg = `Restore backup containing ${tradeCount} trades and ${bankCount} bank accounts?\n\nThis will restore your data to this device.`;
   ```
   `importBackupJSON` guards against non-conforming schemas by checking `(!data.trades && !data.bankAccounts)`, ignoring `data.snapshots`. The confirmation prompt also omits snapshot counts.

6. **`test/tier4-real-world-scenarios/disaster-recovery-offline.test.js:69–94`**:
   The disaster recovery test validates full export $\to$ wipe $\to$ restore parity for trades, banks, transfers, and FIFO inventory, but does not yet assert snapshot persistence across the recovery cycle.

---

## 2. Logic Chain

1. **Storage Key Alignment**: Based on Observation 1 and `PROJECT.md:56`, adding `NET_WORTH_SNAPSHOTS: 'bybit_p2p_net_worth_snapshots'` establishes the standardized storage location for all snapshot records.
2. **Export Completeness**: Based on Observation 2, adding `snapshots: this.getSnapshots()` to `exportAllData()` guarantees that snapshots are included in every generated `.json` backup file. Chronological sorting in `getSnapshots()` ensures exported arrays are ordered chronologically ascending.
3. **Robust Ingestion & Sanitization**: Based on Observation 3, `importAllData(data, replace)` must:
   - Check `Array.isArray(data.snapshots)`.
   - Pass each element through a dedicated `sanitizeSnapshot()` routine that enforces numeric types for `bankCash`, `usdtBalance`, and `referenceRate`, recalculates missing/corrupted `netWorthNgn`/`netWorthUsdt`, ensures valid timestamps and IDs, and escapes strings for `notes`.
   - In **Replace Mode (`replace = true`)**: save the sanitized array to `STORAGE_KEYS.NET_WORTH_SNAPSHOTS`. If `data.snapshots` is `undefined` (legacy backup), leave existing snapshots intact.
   - In **Merge Mode (`replace = false`)**: deduplicate by `id` against `this.getSnapshots()`, combine arrays, and sort chronologically ascending before saving.
4. **Complete Purge on Wipe**: Based on Observation 4, adding `localStorage.removeItem(STORAGE_KEYS.NET_WORTH_SNAPSHOTS)` to `clearAllData()` and providing `store.clearSnapshots()` ensures no orphaned snapshots remain after user-initiated data resets.
5. **UI & Schema Contract Parity**: Based on Observation 5, updating `export.js` schema validation to `(!data.trades && !data.bankAccounts && !data.snapshots && !data.transfers)` allows valid backups to be accepted, and formatting the confirmation message to include `${snapshotCount} net worth snapshots` provides clear feedback to the merchant.
6. **Backward & Forward Compatibility**: If an older Schema v1 backup (no `snapshots` field) is restored, `Array.isArray(data.snapshots)` evaluates to `false`, preventing errors and preserving backward compatibility.

---

## 3. Caveats

1. **Storage Quota Limits**: LocalStorage has a browser quota limit (typically ~5MB). Since individual snapshot objects are ~150 bytes, even 1,000 snapshots consume under 150KB (<3% of total quota). No compression is required at this stage.
2. **Merge Collision Strategy**: If an imported snapshot shares an identical `id` with an existing snapshot in merge mode, the existing snapshot is preserved.
3. **No Direct Code Modification**: As an explorer agent in read-only mode, no production source files were directly modified during this investigation.

---

## 4. Conclusion

The integration of Net Worth Snapshots into the application's backup, restore, and reset lifecycle is fully specified, safe, and backwards-compatible.

### Specific Changes to Implement in `js/store.js`:
- Add `NET_WORTH_SNAPSHOTS: 'bybit_p2p_net_worth_snapshots'` to `STORAGE_KEYS`.
- Add `clearSnapshots()`, `getSnapshots()`, `saveSnapshot()`, `deleteSnapshot()`.
- Add `snapshots: this.getSnapshots()` in `exportAllData()`.
- Add snapshot validation, sanitization, replace, and merge handling in `importAllData()`.
- Add `localStorage.removeItem(STORAGE_KEYS.NET_WORTH_SNAPSHOTS)` in `clearAllData()`.

### Specific Changes to Implement in `js/export.js`:
- Update `importBackupJSON()` schema guard to permit snapshot-only and full backups.
- Update confirmation prompt to summarize trade, bank, and snapshot counts.

---

## 5. Verification Method

To independently verify these specifications once implemented by `worker_m1`:

1. **Test Execution Command**:
   ```powershell
   node test/run-tests.js
   ```
2. **Automated Parity Test**:
   Execute a Node.js verification script that performs:
   - Snapshot creation: `store.saveSnapshot(...)` $\times 3$.
   - Full export: `const backup = store.exportAllData()`. Assert `backup.snapshots.length === 3`.
   - Data wipe: `store.clearAllData()`. Assert `store.getSnapshots().length === 0`.
   - Restore: `store.importAllData(backup, true)`. Assert `store.getSnapshots().length === 3` with exact field parity.
   - Legacy import: `store.importAllData({ version: 1, trades: [] }, true)`. Assert zero unhandled exceptions.
3. **Files to Inspect**:
   - `c:\dev\p2p\js\store.js`
   - `c:\dev\p2p\js\export.js`
   - `c:\dev\p2p\.agents\m1_explorer_3\analysis.md`
