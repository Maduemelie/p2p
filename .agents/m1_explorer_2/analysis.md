# M1 Store Persistence Analysis & Specification (`js/store.js`)

**Author**: `m1_explorer_2` (Role: M1 Store Persistence Explorer)  
**Milestone**: Milestone 1 (M1: Core Calculations & Snapshot Store Engine)  
**Target File**: `c:\dev\p2p\js\store.js`  
**Date**: 2026-08-25  

---

## 1. Executive Summary

Milestone 1 introduces the Net Worth snapshot persistence layer into `js/store.js`. This module is responsible for persisting periodic financial checkpoints (total bank cash, Bybit USDT holdings, reference exchange rate, calculated Net Worth in NGN and USDT, and optional notes) under the dedicated LocalStorage key `bybit_p2p_net_worth_snapshots`.

This analysis provides the exact implementation specifications, schema contracts, CRUD methods (`getSnapshots`, `getSnapshotById`, `saveSnapshot`, `deleteSnapshot`, `clearSnapshots`), deterministic chronological sorting, unique ID generation, backup/restore integration, and reactive event notifications (`store:updated` / `snapshots`).

---

## 2. Storage Key Architecture

In `js/store.js`, the `STORAGE_KEYS` constant must be extended to include `NET_WORTH_SNAPSHOTS`:

```javascript
export const STORAGE_KEYS = {
  VERSION: 'bybit_p2p_version',
  TRADES: 'bybit_p2p_trades',
  BANKS: 'bybit_p2p_banks',
  TRANSFERS: 'bybit_p2p_transfers',
  SETTINGS: 'bybit_p2p_settings',
  OPENING_INVENTORY: 'bybit_p2p_opening_inventory',
  NET_WORTH_SNAPSHOTS: 'bybit_p2p_net_worth_snapshots'
};
```

Exporting `STORAGE_KEYS` enables direct referencing across test harnesses and backup/restore utilities without hardcoding magic strings.

---

## 3. Snapshot Data Schema Specification

Every snapshot object conforms to the following strict contract:

```typescript
interface Snapshot {
  id: string;            // Unique identifier: snp_<timestamp>_<random5>
  timestamp: string;     // ISO 8601 UTC timestamp: "2026-08-25T13:00:00.000Z"
  bankCash: number;      // Total reactive bank ledger cash (NGN)
  usdtBalance: number;   // Total Bybit USDT (Ad allocation + Free balance)
  referenceRate: number; // Conversion rate in NGN per USDT (must be > 0)
  netWorthNgn: number;   // Total wealth in NGN: bankCash + (usdtBalance * referenceRate)
  netWorthUsdt: number;  // Total wealth in USDT: usdtBalance + (bankCash / referenceRate)
  notes: string;         // User annotations or reason for snapshot (trimmed)
  createdAt: number;     // Milliseconds epoch timestamp for sorting/tie-breaking
}
```

### Example Record:
```json
{
  "id": "snp_1724590800000_abc12",
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

---

## 4. Exact Method Implementations for `Store` Class

### 4.1. `getSnapshots()`
Retrieves the snapshot collection, defends against corrupted LocalStorage data, and guarantees **chronological ascending order** (oldest first $\to$ newest last).

```javascript
  /**
   * Retrieve all recorded Net Worth snapshots sorted chronologically ascending (oldest first).
   * @returns {Array<Object>} Cloned and sorted snapshot array
   */
  getSnapshots() {
    const raw = this.getItem(STORAGE_KEYS.NET_WORTH_SNAPSHOTS, []);
    if (!Array.isArray(raw)) return [];

    return [...raw]
      .filter(item => item && typeof item === 'object')
      .sort((a, b) => {
        const timeA = new Date(a.timestamp || a.createdAt || 0).getTime();
        const timeB = new Date(b.timestamp || b.createdAt || 0).getTime();
        if (timeA !== timeB) return timeA - timeB;
        return String(a.id || '').localeCompare(String(b.id || ''));
      });
  }
```

### 4.2. `getSnapshotById(id)`
Finds a single snapshot by its ID.

```javascript
  /**
   * Retrieve a single snapshot by ID.
   * @param {string} id - Snapshot ID
   * @returns {Object|null}
   */
  getSnapshotById(id) {
    if (!id) return null;
    const snapshots = this.getSnapshots();
    return snapshots.find(s => s.id === id) || null;
  }
```

### 4.3. `saveSnapshot(snapshotData)`
Validates input values, auto-generates ID and ISO timestamp, computes/normalizes Net Worth values, performs chronological sorting, persists to LocalStorage, and notifies reactive listeners.

```javascript
  /**
   * Save or update a Net Worth snapshot in localStorage.
   * Auto-generates unique ID and timestamp if omitted.
   * Validates positive reference rate and numerical fields.
   * Sorts chronologically and notifies reactive listeners.
   * 
   * @param {Object} snapshotData
   * @returns {Object} Saved snapshot record
   */
  saveSnapshot(snapshotData) {
    if (!snapshotData || typeof snapshotData !== 'object') {
      throw new Error('Invalid snapshot data: object expected.');
    }

    const rate = Number(snapshotData.referenceRate);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error('Invalid snapshot data: referenceRate must be a positive number greater than 0.');
    }

    const bankCash = Number(snapshotData.bankCash) || 0;
    const usdtBalance = Number(snapshotData.usdtBalance) || 0;

    // ISO timestamp and createdAt normalization
    let isoTimestamp;
    if (snapshotData.timestamp) {
      const parsed = new Date(snapshotData.timestamp);
      isoTimestamp = isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
    } else {
      isoTimestamp = new Date().toISOString();
    }

    const createdAt = Number(snapshotData.createdAt) || new Date(isoTimestamp).getTime() || Date.now();

    // Auto-generate unique ID if not present
    const id = snapshotData.id || `snp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // Calculated net worth values with fallback formulas
    const netWorthNgn = snapshotData.netWorthNgn !== undefined && !isNaN(Number(snapshotData.netWorthNgn))
      ? Number(snapshotData.netWorthNgn)
      : bankCash + (usdtBalance * rate);

    const netWorthUsdt = snapshotData.netWorthUsdt !== undefined && !isNaN(Number(snapshotData.netWorthUsdt))
      ? Number(snapshotData.netWorthUsdt)
      : usdtBalance + (rate > 0 ? bankCash / rate : 0);

    const newSnapshot = {
      id,
      timestamp: isoTimestamp,
      bankCash,
      usdtBalance,
      referenceRate: rate,
      netWorthNgn,
      netWorthUsdt,
      notes: typeof snapshotData.notes === 'string' ? snapshotData.notes.trim() : '',
      createdAt
    };

    const snapshots = this.getItem(STORAGE_KEYS.NET_WORTH_SNAPSHOTS, []);
    const existingIndex = Array.isArray(snapshots) ? snapshots.findIndex(s => s.id === id) : -1;

    let updatedList;
    if (existingIndex >= 0) {
      updatedList = [...snapshots];
      updatedList[existingIndex] = newSnapshot;
    } else {
      updatedList = Array.isArray(snapshots) ? [...snapshots, newSnapshot] : [newSnapshot];
    }

    // Ensure chronological sorting
    updatedList.sort((a, b) => {
      const timeA = new Date(a.timestamp || a.createdAt || 0).getTime();
      const timeB = new Date(b.timestamp || b.createdAt || 0).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });

    this.saveItem(STORAGE_KEYS.NET_WORTH_SNAPSHOTS, updatedList);
    this.notify('snapshots', newSnapshot);
    this.notify('SNAPSHOTS_UPDATED', newSnapshot);

    return newSnapshot;
  }
```

### 4.4. `deleteSnapshot(id)`
Deletes a snapshot record by ID and dispatches reactive notification.

```javascript
  /**
   * Delete a snapshot by ID from localStorage.
   * @param {string} id - Snapshot ID to remove
   * @returns {boolean} True if deleted, false if not found
   */
  deleteSnapshot(id) {
    if (!id) return false;
    const snapshots = this.getItem(STORAGE_KEYS.NET_WORTH_SNAPSHOTS, []);
    if (!Array.isArray(snapshots)) return false;

    const exists = snapshots.some(s => s.id === id);
    if (!exists) return false;

    const filtered = snapshots.filter(s => s.id !== id);
    this.saveItem(STORAGE_KEYS.NET_WORTH_SNAPSHOTS, filtered);
    this.notify('snapshots', { deletedId: id });
    return true;
  }
```

### 4.5. `clearSnapshots()`
Purges all snapshots from storage.

```javascript
  /**
   * Remove all Net Worth snapshots from localStorage.
   */
  clearSnapshots() {
    this.saveItem(STORAGE_KEYS.NET_WORTH_SNAPSHOTS, []);
    this.notify('snapshots', { cleared: true });
  }
```

---

## 5. Event Bus Integration (`store:updated`)

The application's reactive event bus relies on `store.notify(eventType, payload)`.

```javascript
notify(eventType, payload = null) {
  window.dispatchEvent(new CustomEvent('store:updated', {
    detail: { type: eventType, payload, timestamp: Date.now() }
  }));
}
```

When snapshot operations occur:
- `saveSnapshot`: Dispatches `type: 'snapshots'` and `type: 'SNAPSHOTS_UPDATED'` with the saved snapshot as payload.
- `deleteSnapshot`: Dispatches `type: 'snapshots'` with `{ deletedId: id }`.
- `clearSnapshots`: Dispatches `type: 'snapshots'` with `{ cleared: true }`.

Domain listeners (e.g. `js/dashboard.js`) should subscribe to `store:updated` and react to `e.detail?.type === 'snapshots' || e.detail?.type === 'SNAPSHOTS_UPDATED' || e.detail?.type === 'all'`.

---

## 6. Full Backup JSON Export / Import Integration

In `js/store.js`:

### 6.1. `exportAllData()`:
Include `snapshots: this.getSnapshots()`.
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

### 6.2. `importAllData(data, replace = true)`:
Handle replacing and merging `snapshots`.
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
      if (Array.isArray(data.snapshots)) this.saveItem(STORAGE_KEYS.NET_WORTH_SNAPSHOTS, data.snapshots);
    } else {
      // Merge mode
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
        const existing = this.getSnapshots();
        const existingIds = new Set(existing.map(s => s.id));
        const newSnapshots = data.snapshots.filter(s => !existingIds.has(s.id));
        const merged = [...existing, ...newSnapshots].sort(
          (a, b) => new Date(a.timestamp || a.createdAt || 0).getTime() - new Date(b.timestamp || b.createdAt || 0).getTime()
        );
        this.saveItem(STORAGE_KEYS.NET_WORTH_SNAPSHOTS, merged);
      }
    }

    this.notify('all');
    return true;
  }
```

### 6.3. `clearAllData()`:
Purge snapshots during master reset:
```javascript
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

## 7. Edge Cases & Resilience Matrix

| Scenario | Risk | Mitigation |
|---|---|---|
| **Corrupted LocalStorage** | `JSON.parse` fails or key contains a non-array primitive | `getItem` returns fallback `[]`; `getSnapshots()` verifies `Array.isArray()` and filters valid objects. |
| **Invalid Reference Rate** | Negative rate (`-1500`), zero (`0`), or non-numeric (`"abc"`) | Throws informative validation error before updating state; prevents corrupt valuation states. |
| **Out-of-Order Logging** | User saves snapshots retroactively or with manual past dates | `saveSnapshot()` and `getSnapshots()` strictly sort ascending by parsed timestamp before persistence and on read. |
| **Duplicate IDs / In-Place Update** | User updates existing snapshot with same `id` | `saveSnapshot()` detects existing `id`, updates record in place, avoiding duplicates. |
| **Rapid Concurrency Saves** | Multiple saves in same millisecond | ID format `snp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` provides $< 10^{-7}$ collision chance. Tie-breaker sorting uses `id.localeCompare()`. |
| **Storage Quota Exceeded** | `localStorage.setItem` throws `QuotaExceededError` | `saveItem()` catches error, logs diagnostic message, and returns `false`. |
| **External Array Mutation** | Consumer mutates array returned by `getSnapshots()` | `getSnapshots()` returns a fresh cloned array `[...raw]`. |
