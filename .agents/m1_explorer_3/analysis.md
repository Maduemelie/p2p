# M1 Technical Analysis: JSON Backup, Restore, and Reset Integration

**Agent**: `m1_explorer_3` (Role: M1 Backup/Restore Explorer)  
**Date**: 2026-08-25  
**Milestone**: M1: Core Calculations & Snapshot Store Engine  
**Working Directory**: `c:\dev\p2p\.agents\m1_explorer_3`  

---

## 1. Executive Summary & Problem Boundary

Milestone 1 (M1) introduces Net Worth and Capital Cycle tracking to the Bybit NGN P2P Trade Tracker. Net Worth snapshots capture point-in-time financial state ($\text{Bank Cash}$, $\text{Bybit USDT Balance}$, $\text{Reference Exchange Rate}$, $\text{Net Worth}_{\text{NGN}}$, $\text{Net Worth}_{\text{USDT}}$, and optional $\text{Notes}$).

For full data portability, disaster recovery, and operational integrity, snapshots must be seamlessly integrated into the application's export, import, and reset pipelines:
1. **`store.exportAllData()`**: Must serialize the complete snapshots collection alongside trades, bank accounts, transfers, and opening inventory.
2. **`store.importAllData(data, replace)`**: Must validate, sanitize, deduplicate (in merge mode), and persist snapshots into LocalStorage.
3. **`store.clearAllData()`**: Must purge all snapshot records from LocalStorage during a full database reset.
4. **`js/export.js`**: Must support downloading and restoring backups containing snapshots, updating UI confirmation messages and schema guards.
5. **Backwards Compatibility**: Must cleanly import legacy Schema v1 JSON backups that do not contain a `snapshots` field without data loss or exceptions.

---

## 2. Snapshot Schema & Serialization Specification

### 2.1 Complete JSON Schema for Snapshots
Each snapshot record inside the JSON backup `snapshots` array adheres to the following contract:

```json
{
  "id": "snp_1724590800000_abc123",
  "timestamp": "2026-08-25T13:00:00.000Z",
  "bankCash": 1250000.50,
  "usdtBalance": 1500.25,
  "referenceRate": 1535.00,
  "netWorthNgn": 3552884.25,
  "netWorthUsdt": 2314.58,
  "notes": "End of trading day snapshot",
  "createdAt": 1724590800000
}
```

### 2.2 Field Invariants & Rules
| Field | Type | Mandatory | Default / Fallback | Validation & Mathematical Invariant |
|---|---|---|---|---|
| `id` | `string` | Yes | `snp_${Date.now()}_${rand}` | Unique non-empty string identifier. |
| `timestamp` | `string` (ISO 8601) | Yes | `new Date().toISOString()` | Must parse to valid timestamp via `new Date(ts).getTime()`. |
| `bankCash` | `number` | Yes | `0` | Finite number, can be negative if bank ledger is in overdraft. |
| `usdtBalance` | `number` | Yes | `0` | Finite number, non-negative in standard operations. |
| `referenceRate` | `number` | Yes | `1500.00` | Strictly positive (`> 0`). Fallback to `1500.00` if $\le 0$. |
| `netWorthNgn` | `number` | Yes | Recomputed | Invariant: $\text{NW}_{\text{NGN}} = \text{bankCash} + (\text{usdtBalance} \times \text{referenceRate})$. |
| `netWorthUsdt` | `number` | Yes | Recomputed | Invariant: $\text{NW}_{\text{USDT}} = \text{usdtBalance} + (\text{referenceRate} > 0 ? \text{bankCash} / \text{referenceRate} : 0)$. |
| `notes` | `string` | No | `""` | Trimmed string, sanitized of nulls/undefined. |
| `createdAt` | `number` | Yes | `Date.now()` | Unix millisecond epoch timestamp. |

### 2.3 Full JSON Backup Schema (`bybit_p2p_backup_YYYY-MM-DD.json`)
```json
{
  "version": 1,
  "exportedAt": "2026-08-25T13:15:00.000Z",
  "trades": [ ... ],
  "bankAccounts": [ ... ],
  "transfers": [ ... ],
  "openingInventory": {
    "startingUsdtBalance": 100,
    "defaultCostBasis": 1500
  },
  "snapshots": [
    {
      "id": "snp_1724590800000_k9x2m1",
      "timestamp": "2026-08-25T13:00:00.000Z",
      "bankCash": 1250000.5,
      "usdtBalance": 1500.25,
      "referenceRate": 1535.0,
      "netWorthNgn": 3552884.25,
      "netWorthUsdt": 2314.58,
      "notes": "Session close",
      "createdAt": 1724590800000
    }
  ]
}
```

---

## 3. Investigation & Component Breakdown

### 3.1 `store.exportAllData()` in `js/store.js`
#### Current Code:
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

#### Analysis:
1. `snapshots` must be added as `snapshots: this.getSnapshots()`.
2. `this.getSnapshots()` retrieves the stored array from `STORAGE_KEYS.NET_WORTH_SNAPSHOTS` (or `STORAGE_KEYS.SNAPSHOTS`).
3. Snapshots should be sorted chronologically ascending by timestamp (`t0 < t1 < t2`) to ensure that downstream consumers (chart renderers, historical delta calculators) receive pre-sorted data.

#### Proposed Code:
```javascript
  exportAllData() {
    return {
      version: CURRENT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      trades: this.getTrades(),
      bankAccounts: this.getBankAccounts(),
      transfers: this.getTransfers(),
      openingInventory: this.getOpeningInventory(),
      snapshots: this.getSnapshots()
    };
  }
```

---

### 3.2 `store.importAllData(data, replace)` in `js/store.js`

#### Current Code:
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
      if (Array.isArray(data.trades)) {
        const existing = this.getTrades();
        const existingIds = new Set(existing.map(t => t.id));
        const newTrades = data.trades.filter(t => !existingIds.has(t.id));
        this.saveItem(STORAGE_KEYS.TRADES, [...newTrades, ...existing]);
      }
      if (Array.isArray(data.bankAccounts)) {
        const existing = this.getBankAccounts();
        const existingIds = new Set(existing.map(b => b.id));
        const newBanks = data.bankAccounts.filter(b => !existingIds.has(b.id));
        this.saveItem(STORAGE_KEYS.BANKS, [...existing, ...newBanks]);
      }
    }

    this.notify('all');
    return true;
  }
```

#### Sanitization Routine (`sanitizeSnapshot`):
To protect against corrupted or malformed imported records, a robust snapshot sanitization helper ensures type safety and invariant consistency:

```javascript
/**
 * Validate and sanitize a snapshot record for storage
 * @param {object} raw
 * @returns {object|null} Sanitized snapshot object or null if completely unrecoverable
 */
function sanitizeSnapshot(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const now = Date.now();
  const id = (typeof raw.id === 'string' && raw.id.trim()) 
    ? raw.id.trim() 
    : `snp_${now}_${Math.random().toString(36).substring(2, 8)}`;
  
  let timestamp = raw.timestamp;
  if (!timestamp || isNaN(new Date(timestamp).getTime())) {
    timestamp = new Date(Number(raw.createdAt) || now).toISOString();
  } else {
    timestamp = new Date(timestamp).toISOString();
  }

  const createdAt = Number(raw.createdAt) || new Date(timestamp).getTime() || now;
  const bankCash = Number(raw.bankCash) || 0;
  const usdtBalance = Number(raw.usdtBalance) || 0;
  const referenceRate = Number(raw.referenceRate) > 0 ? Number(raw.referenceRate) : 1500.00;
  
  const netWorthNgn = (raw.netWorthNgn !== undefined && !isNaN(Number(raw.netWorthNgn)))
    ? Number(raw.netWorthNgn)
    : (bankCash + (usdtBalance * referenceRate));

  const netWorthUsdt = (raw.netWorthUsdt !== undefined && !isNaN(Number(raw.netWorthUsdt)))
    ? Number(raw.netWorthUsdt)
    : (usdtBalance + (referenceRate > 0 ? bankCash / referenceRate : 0));

  const notes = typeof raw.notes === 'string' ? raw.notes.trim() : '';

  return {
    id,
    timestamp,
    bankCash,
    usdtBalance,
    referenceRate,
    netWorthNgn,
    netWorthUsdt,
    notes,
    createdAt
  };
}
```

#### Replace Mode Logic (`replace === true`):
- If `Array.isArray(data.snapshots)`:
  - Sanitize all elements: `const cleanSnapshots = data.snapshots.map(sanitizeSnapshot).filter(Boolean);`
  - Sort chronologically ascending: `cleanSnapshots.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());`
  - Save to store: `this.saveItem(STORAGE_KEYS.NET_WORTH_SNAPSHOTS, cleanSnapshots);`
- If `data.snapshots` is undefined (Legacy v1 backup file):
  - Do nothing with snapshots (or leave existing unchanged if partial restore). This prevents wiping existing snapshots when importing an older v1 trades-only backup file.

#### Merge Mode Logic (`replace === false`):
- If `Array.isArray(data.snapshots)`:
  - Sanitize all imported elements.
  - Retrieve existing snapshots: `const existing = this.getSnapshots();`
  - Deduplicate by ID:
    ```javascript
    const existingIds = new Set(existing.map(s => s.id));
    const newSnapshots = cleanSnapshots.filter(s => !existingIds.has(s.id));
    const combined = [...existing, ...newSnapshots].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    this.saveItem(STORAGE_KEYS.NET_WORTH_SNAPSHOTS, combined);
    ```

---

### 3.3 `store.clearAllData()` in `js/store.js`

#### Current Code:
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

#### Analysis:
During a full wipe ("Wipe All Data" in Settings view), all snapshots must be removed from `localStorage` under `STORAGE_KEYS.NET_WORTH_SNAPSHOTS`.
In addition, `store.clearSnapshots()` should exist as a standalone collection reset method.

#### Proposed Code:
```javascript
  clearSnapshots() {
    this.saveItem(STORAGE_KEYS.NET_WORTH_SNAPSHOTS, []);
    this.notify('snapshots', { action: 'clear' });
  }

  clearAllData() {
    localStorage.removeItem(STORAGE_KEYS.TRADES);
    localStorage.removeItem(STORAGE_KEYS.BANKS);
    localStorage.removeItem(STORAGE_KEYS.TRANSFERS);
    localStorage.removeItem(STORAGE_KEYS.OPENING_INVENTORY);
    localStorage.removeItem(STORAGE_KEYS.NET_WORTH_SNAPSHOTS);
    this.init();
    this.notify('all');
  }
```

---

### 3.4 `js/export.js` Module Verification

#### Current Code:
```javascript
export function exportFullBackupJSON() {
  const backupData = store.exportAllData();
  const jsonStr = JSON.stringify(backupData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
  const dateStr = new Date().toISOString().slice(0, 10);
  triggerFileDownload(blob, `bybit_p2p_backup_${dateStr}.json`);

  if (window.showToast) window.showToast('Full JSON backup downloaded!', 'success');
}

export function importBackupJSON(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target.result);

      if (!data || typeof data !== 'object' || (!data.trades && !data.bankAccounts)) {
        throw new Error('Invalid or unrecognised JSON backup schema.');
      }

      const tradeCount = Array.isArray(data.trades) ? data.trades.length : 0;
      const bankCount = Array.isArray(data.bankAccounts) ? data.bankAccounts.length : 0;

      const confirmMsg = `Restore backup containing ${tradeCount} trades and ${bankCount} bank accounts?\n\nThis will restore your data to this device.`;
      if (confirm(confirmMsg)) {
        store.importAllData(data, true);
        if (window.showToast) window.showToast('Backup restored successfully!', 'success');
      }
    } catch (err) {
      console.error('[Import Error]', err);
      if (window.showToast) window.showToast(`Import failed: ${err.message || 'Invalid JSON file'}`, 'error');
    }
  };

  reader.onerror = () => {
    if (window.showToast) window.showToast('Could not read the selected file.', 'error');
  };

  reader.readAsText(file);
}
```

#### Required Enhancements in `js/export.js`:
1. **Schema Check Expansion**:
   Change `(!data.trades && !data.bankAccounts)` to `(!data.trades && !data.bankAccounts && !data.snapshots && !data.transfers)`.
   This allows restoring valid snapshot backups even if a merchant has 0 trades recorded yet.
2. **Confirmation Summary**:
   Include snapshot count in the confirmation dialog:
   ```javascript
   const snapshotCount = Array.isArray(data.snapshots) ? data.snapshots.length : 0;
   const counts = [];
   if (tradeCount > 0 || (!bankCount && !snapshotCount)) counts.push(`${tradeCount} trades`);
   if (bankCount > 0) counts.push(`${bankCount} bank accounts`);
   if (snapshotCount > 0) counts.push(`${snapshotCount} net worth snapshots`);
   const summary = counts.join(', ');
   const confirmMsg = `Restore backup containing ${summary}?\n\nThis will restore your data to this device.`;
   ```

---

## 4. Migration & Compatibility Analysis

### 4.1 Backward Compatibility (Schema v1 $\to$ v1+Snapshots)
- **Scenario**: A user imports a JSON backup exported before this feature existed.
- **Behavior**:
  - `data.snapshots` is `undefined`.
  - `Array.isArray(data.snapshots)` evaluates to `false`.
  - `store.importAllData(data, replace)` executes cleanly without attempting to iterate or parse `undefined`.
  - No runtime errors or corrupted state.
  - Existing snapshots remain intact if partial merge, or initialized to `[]` if full wipe before import.

### 4.2 Forward Compatibility & Extensibility
- **Scenario**: Future milestones add optional fields (e.g. `breakdown: { bybitFree, bybitAdAllocation }`, `currency: 'NGN'`).
- **Behavior**:
  - The sanitizer preserves extra valid attributes or safely defaults missing ones.
  - Exported JSON version remains `1` (or incremented cleanly to `2` if breaking).

### 4.3 Resilience to Fuzzed / Dirty Data
- **Scenario**: Imported JSON has corrupted snapshot fields (e.g. strings for numbers, invalid timestamps, missing IDs).
- **Sanitizer Defense**:
  - `Number(bankCash) || 0` coerces `"1200000"` to `1200000` and `"corrupted"` to `0`.
  - `referenceRate <= 0` or NaN defaults to `1500.00`.
  - `netWorthNgn` / `netWorthUsdt` are recomputed using the canonical formula if corrupted or null.
  - Invalid date strings fallback to `createdAt` or current ISO time.

---

## 5. Exact Proposed Implementation Details

### 5.1 Proposed Changes in `js/store.js`

```javascript
// Add key to STORAGE_KEYS
const STORAGE_KEYS = {
  VERSION: 'bybit_p2p_version',
  TRADES: 'bybit_p2p_trades',
  BANKS: 'bybit_p2p_banks',
  TRANSFERS: 'bybit_p2p_transfers',
  SETTINGS: 'bybit_p2p_settings',
  OPENING_INVENTORY: 'bybit_p2p_opening_inventory',
  NET_WORTH_SNAPSHOTS: 'bybit_p2p_net_worth_snapshots'
};

// Snapshot CRUD methods in class Store
  getSnapshots() {
    const list = this.getItem(STORAGE_KEYS.NET_WORTH_SNAPSHOTS, []);
    return Array.isArray(list) ? list.sort((a, b) => new Date(a.timestamp || a.createdAt).getTime() - new Date(b.timestamp || b.createdAt).getTime()) : [];
  }

  saveSnapshot(snapshotData) {
    const snapshots = this.getSnapshots();
    const now = Date.now();
    const newSnapshot = {
      id: snapshotData.id || `snp_${now}_${Math.random().toString(36).substring(2, 8)}`,
      timestamp: snapshotData.timestamp || new Date().toISOString(),
      bankCash: Number(snapshotData.bankCash) || 0,
      usdtBalance: Number(snapshotData.usdtBalance) || 0,
      referenceRate: Number(snapshotData.referenceRate) > 0 ? Number(snapshotData.referenceRate) : 1500,
      netWorthNgn: Number(snapshotData.netWorthNgn) || 0,
      netWorthUsdt: Number(snapshotData.netWorthUsdt) || 0,
      notes: typeof snapshotData.notes === 'string' ? snapshotData.notes.trim() : '',
      createdAt: Number(snapshotData.createdAt) || now
    };
    snapshots.push(newSnapshot);
    snapshots.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    this.saveItem(STORAGE_KEYS.NET_WORTH_SNAPSHOTS, snapshots);
    this.notify('snapshots', newSnapshot);
    return newSnapshot;
  }

  deleteSnapshot(id) {
    const snapshots = this.getSnapshots();
    const filtered = snapshots.filter(s => s.id !== id);
    this.saveItem(STORAGE_KEYS.NET_WORTH_SNAPSHOTS, filtered);
    this.notify('snapshots', { deletedId: id });
    return true;
  }

  clearSnapshots() {
    this.saveItem(STORAGE_KEYS.NET_WORTH_SNAPSHOTS, []);
    this.notify('snapshots', { action: 'clear' });
  }

  // Updated exportAllData
  exportAllData() {
    return {
      version: CURRENT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      trades: this.getTrades(),
      bankAccounts: this.getBankAccounts(),
      transfers: this.getTransfers(),
      openingInventory: this.getOpeningInventory(),
      snapshots: this.getSnapshots()
    };
  }

  // Updated importAllData
  importAllData(data, replace = true) {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid JSON backup data format.');
    }

    const sanitizeSnapshot = (raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const now = Date.now();
      const id = (typeof raw.id === 'string' && raw.id.trim()) ? raw.id.trim() : `snp_${now}_${Math.random().toString(36).substring(2, 8)}`;
      let timestamp = raw.timestamp;
      if (!timestamp || isNaN(new Date(timestamp).getTime())) {
        timestamp = new Date(Number(raw.createdAt) || now).toISOString();
      } else {
        timestamp = new Date(timestamp).toISOString();
      }
      const createdAt = Number(raw.createdAt) || new Date(timestamp).getTime() || now;
      const bankCash = Number(raw.bankCash) || 0;
      const usdtBalance = Number(raw.usdtBalance) || 0;
      const referenceRate = Number(raw.referenceRate) > 0 ? Number(raw.referenceRate) : 1500.00;
      const netWorthNgn = (raw.netWorthNgn !== undefined && !isNaN(Number(raw.netWorthNgn)))
        ? Number(raw.netWorthNgn)
        : (bankCash + (usdtBalance * referenceRate));
      const netWorthUsdt = (raw.netWorthUsdt !== undefined && !isNaN(Number(raw.netWorthUsdt)))
        ? Number(raw.netWorthUsdt)
        : (usdtBalance + (referenceRate > 0 ? bankCash / referenceRate : 0));
      const notes = typeof raw.notes === 'string' ? raw.notes.trim() : '';
      return { id, timestamp, bankCash, usdtBalance, referenceRate, netWorthNgn, netWorthUsdt, notes, createdAt };
    };

    if (replace) {
      if (Array.isArray(data.trades)) this.saveItem(STORAGE_KEYS.TRADES, data.trades);
      if (Array.isArray(data.bankAccounts)) this.saveItem(STORAGE_KEYS.BANKS, data.bankAccounts);
      if (Array.isArray(data.transfers)) this.saveItem(STORAGE_KEYS.TRANSFERS, data.transfers);
      if (data.openingInventory) this.saveItem(STORAGE_KEYS.OPENING_INVENTORY, data.openingInventory);
      if (Array.isArray(data.snapshots)) {
        const cleanSnapshots = data.snapshots.map(sanitizeSnapshot).filter(Boolean);
        cleanSnapshots.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        this.saveItem(STORAGE_KEYS.NET_WORTH_SNAPSHOTS, cleanSnapshots);
      }
    } else {
      // Merge
      if (Array.isArray(data.trades)) {
        const existing = this.getTrades();
        const existingIds = new Set(existing.map(t => t.id));
        const newTrades = data.trades.filter(t => !existingIds.has(t.id));
        this.saveItem(STORAGE_KEYS.TRADES, [...newTrades, ...existing]);
      }
      if (Array.isArray(data.bankAccounts)) {
        const existing = this.getBankAccounts();
        const existingIds = new Set(existing.map(b => b.id));
        const newBanks = data.bankAccounts.filter(b => !existingIds.has(b.id));
        this.saveItem(STORAGE_KEYS.BANKS, [...existing, ...newBanks]);
      }
      if (Array.isArray(data.snapshots)) {
        const cleanSnapshots = data.snapshots.map(sanitizeSnapshot).filter(Boolean);
        const existing = this.getSnapshots();
        const existingIds = new Set(existing.map(s => s.id));
        const newSnapshots = cleanSnapshots.filter(s => !existingIds.has(s.id));
        const combined = [...existing, ...newSnapshots].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        this.saveItem(STORAGE_KEYS.NET_WORTH_SNAPSHOTS, combined);
      }
    }

    this.notify('all');
    return true;
  }

  // Updated clearAllData
  clearAllData() {
    localStorage.removeItem(STORAGE_KEYS.TRADES);
    localStorage.removeItem(STORAGE_KEYS.BANKS);
    localStorage.removeItem(STORAGE_KEYS.TRANSFERS);
    localStorage.removeItem(STORAGE_KEYS.OPENING_INVENTORY);
    localStorage.removeItem(STORAGE_KEYS.NET_WORTH_SNAPSHOTS);
    this.init();
    this.notify('all');
  }
```

### 5.2 Proposed Changes in `js/export.js`

```javascript
/**
 * Export full JSON backup (Trades, Bank Accounts, Transfers, Net Worth Snapshots, Opening Inventory)
 */
export function exportFullBackupJSON() {
  const backupData = store.exportAllData();
  const jsonStr = JSON.stringify(backupData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
  const dateStr = new Date().toISOString().slice(0, 10);
  triggerFileDownload(blob, `bybit_p2p_backup_${dateStr}.json`);

  if (window.showToast) window.showToast('Full JSON backup downloaded!', 'success');
}

/**
 * Read and restore database from uploaded JSON file
 * @param {File} file
 */
export function importBackupJSON(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target.result);

      if (!data || typeof data !== 'object' || (!data.trades && !data.bankAccounts && !data.snapshots && !data.transfers)) {
        throw new Error('Invalid or unrecognised JSON backup schema.');
      }

      const tradeCount = Array.isArray(data.trades) ? data.trades.length : 0;
      const bankCount = Array.isArray(data.bankAccounts) ? data.bankAccounts.length : 0;
      const snapshotCount = Array.isArray(data.snapshots) ? data.snapshots.length : 0;

      const details = [];
      if (tradeCount > 0 || (!bankCount && !snapshotCount)) details.push(`${tradeCount} trades`);
      if (bankCount > 0) details.push(`${bankCount} bank accounts`);
      if (snapshotCount > 0) details.push(`${snapshotCount} net worth snapshots`);

      const summaryStr = details.join(', ');
      const confirmMsg = `Restore backup containing ${summaryStr}?\n\nThis will restore your data to this device.`;
      if (confirm(confirmMsg)) {
        store.importAllData(data, true);
        if (window.showToast) window.showToast('Backup restored successfully!', 'success');
      }
    } catch (err) {
      console.error('[Import Error]', err);
      if (window.showToast) window.showToast(`Import failed: ${err.message || 'Invalid JSON file'}`, 'error');
    }
  };

  reader.onerror = () => {
    if (window.showToast) window.showToast('Could not read the selected file.', 'error');
  };

  reader.readAsText(file);
}
```

---

## 6. Verification Plan & Test Suite Specification

The implementation should be verified through comprehensive automated unit and integration tests:

1. **Test 1: Full Roundtrip Serialization & Parity**
   - Save 5 snapshots with varied bank cash, USDT, reference rates, and notes.
   - Run `const backup = store.exportAllData()`.
   - Verify `backup.snapshots.length === 5`.
   - Call `store.clearAllData()`.
   - Verify `store.getSnapshots().length === 0` and `localStorage.getItem('bybit_p2p_net_worth_snapshots') === null`.
   - Run `store.importAllData(backup, true)`.
   - Verify `store.getSnapshots().length === 5` with exact value parity and ascending chronological ordering.

2. **Test 2: Legacy Backup Ingestion (Zero Snapshots Field)**
   - Create mock JSON without `snapshots` property (`{ version: 1, trades: [...], bankAccounts: [...] }`).
   - Call `store.importAllData(legacyBackup, true)`.
   - Verify execution completes without error, trades/banks are restored, and `store.getSnapshots()` returns `[]`.

3. **Test 3: Merge Mode Deduplication**
   - Pre-populate store with Snapshot A and Snapshot B.
   - Import JSON containing Snapshot B and Snapshot C (`replace = false`).
   - Verify store contains Snapshot A, B, and C (3 total, no duplicates), sorted chronologically.

4. **Test 4: Dirty Data Sanitization**
   - Import JSON containing malformed snapshot items (strings for numbers, missing id, invalid date, missing netWorth).
   - Verify `store.importAllData` sanitizes and repairs all items cleanly.

5. **Test 5: Standalone Collection Reset**
   - Save 3 snapshots.
   - Call `store.clearSnapshots()`.
   - Verify `store.getSnapshots().length === 0`, while trades and bank accounts remain intact.
