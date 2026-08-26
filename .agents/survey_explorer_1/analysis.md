# Codebase Architecture Survey: Bybit NGN P2P Trade Tracker

**Date**: 2026-08-25  
**Explorer**: `survey_explorer_1` (Codebase Architecture Explorer)  
**Target Root**: `c:\dev\p2p`  
**Purpose**: Comprehensive survey of the existing codebase to inform the implementation of the Net Worth and Capital Cycle tracking system (Requirements R1, R2, R3).

---

## 1. Project Structure, Dependencies, Build & Test Setup

### 1.1 High-Level Architecture
The Bybit NGN P2P Trade Tracker is a Progressive Web App (PWA) with a dual-backend deployment architecture:
1. **Frontend Client**: Vanilla ES Module Single-Page Application (SPA) structured into:
   - Root application controller and routing: `js/app.js`
   - Data persistence and reactive store: `js/store.js`
   - Pure math, formatting, and FIFO cost-basis engine: `js/utils.js`
   - Nigerian fintech fee calculation engine: `js/fees.js`
   - Frontend Bybit API client: `js/bybitService.js`
   - Domain controllers: `js/dashboard.js`, `js/trades.js`, `js/pricing.js`, `js/history.js`, `js/banks.js`, `js/transfers.js`, `js/settings.js`, `js/export.js`
   - View templates: `js/views/dashboard.view.js`, `js/views/addTrade.view.js`, `js/views/pricing.view.js`, `js/views/history.view.js`, `js/views/settings.view.js`, `js/views/modals.view.js`
2. **Local/Node Backend**: Express server (`server.js`) serving static assets and signing/proxying requests to Bybit OpenAPI endpoints (`/api/balance`, `/api/orders`, `/api/ads`, `/api/market-depth`, `/api/status`).
3. **Serverless Cloud Backend**: Vercel Serverless Functions (`api/*.js`, `api/_bybit.js`) configured for region `fra1`.
4. **Offline Resilience**: Service Worker (`sw.js`) maintaining pre-cached asset manifest for offline operation (Cache: `bybit-p2p-v9`).

### 1.2 Directory Tree
```
c:\dev\p2p\
├── api\                      # Vercel serverless proxy functions
│   ├── _bybit.js             # Shared HMAC-SHA256 signature generator & failover client
│   ├── ads.js                # Bybit personal ads endpoint handler
│   ├── balance.js            # Bybit funding balance endpoint handler
│   ├── market-depth.js       # Bybit P2P order book depth handler
│   ├── orders.js             # Bybit P2P simplifyList order history handler
│   └── status.js             # Proxy health & auth check handler
├── css\
│   └── styles.css            # Unified stylesheet (1779 lines, dark/light theme, glassmorphism)
├── icons\
│   ├── icon-192.png
│   ├── icon-512.png
│   └── icon.svg
├── js\
│   ├── app.js                # App entry point, tab router, toast, confirm modal, PWA setup
│   ├── banks.js              # Bank accounts controller & dropdown population
│   ├── bybitService.js       # Frontend HTTP client with proxy auth headers
│   ├── dashboard.js          # Dashboard controller, FIFO portfolio metrics, Chart.js PnL
│   ├── export.js             # CSV export & JSON backup/restore
│   ├── fees.js               # Dynamic fee rows & fintech fee rule engine
│   ├── history.js            # Trade history search, filter, sort, pagination
│   ├── pricing.js            # Arbitrage assistant, margin simulator, live order book
│   ├── settings.js           # Settings controller, opening inventory, Bybit sync, backup
│   ├── store.js              # Reactive data store, bank ledger calculations, localStorage
│   ├── trades.js             # Trade recording & edit form controller
│   ├── transfers.js          # Bank & wallet transfers controller
│   ├── utils.js              # FIFO engine, currency/date formatters, escapeHtml
│   └── views\
│       ├── addTrade.view.js  # Add/Edit trade form template
│       ├── dashboard.view.js # Dashboard view template (Portfolio, Ad, Allocation, Chart, Recent)
│       ├── history.view.js   # History view template with search toolbar & table
│       ├── modals.view.js    # Modal dialog templates (Bank, Wallet Transfer, Bank Transfer, Assign)
│       ├── pricing.view.js   # Pricing assistant view template
│       └── settings.view.js  # Settings view template (Accounts, Bybit Sync, Data tabs)
├── test\
│   ├── harness\
│   │   ├── assertions.js     # Assertion library (strictEqual, deepStrictEqual, ok, closeTo, etc.)
│   │   ├── dom-mock.js       # Headless DOM & localStorage mock environment
│   │   ├── http-mock.js      # Mock req/res for testing Express/Vercel endpoints
│   │   └── test-runner.js    # Multi-tier async test coordinator & reporter
│   ├── tier1-feature-coverage\ (5 suites)
│   ├── tier2-boundary-corner-cases\ (5 suites)
│   ├── tier3-cross-feature\ (2 suites)
│   ├── tier4-real-world-scenarios\ (3 suites)
│   ├── challenger-*.test.js  # Adversarial stress & simulation suites
│   └── run-tests.js          # Main test runner CLI
├── index.html                # Single-page HTML entry point
├── manifest.json             # Web App Manifest
├── package.json              # Express / Node dependencies
├── server.js                 # Express server & API proxy
├── sw.js                     # Service worker (bybit-p2p-v9)
└── vercel.json               # Vercel deployment configuration
```

### 1.3 Dependencies & CDN Links
- **`package.json`**:
  - `axios`: `^1.6.8` (Bybit HTTP API client in `server.js`)
  - `cors`: `^2.8.5` (CORS middleware)
  - `dotenv`: `^16.4.5` (Environment variable management)
  - `express`: `^4.19.2` (Local proxy web server)
- **External CDN Links (`index.html`)**:
  - `<script src="https://unpkg.com/lucide@latest"></script>`: Lucide icons rendering via `lucide.createIcons()`.
  - `<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>`: Chart.js library for line/trend visualization.
  - Fonts: Google Fonts `Plus Jakarta Sans` (body font) & `JetBrains Mono` (numbers & rates).

### 1.4 Test Infrastructure
- **Zero-Dependency Native Node.js Harness**: Located in `test/harness/`.
- **Mocking System**:
  - `dom-mock.js` provides `setupDomEnvironment()` creating mock `window`, `document`, `localStorage`, `CustomEvent`, `navigator.clipboard`, event dispatchers, and basic HTML selector parsing (`#id`, `.class`, `[attr]`, `tag`).
- **Test Runner Command**:
  ```bash
  node test/run-tests.js
  # Or with flags:
  node test/run-tests.js --tier=1
  node test/run-tests.js --suite=fifo
  ```
- **Current Status**: 133 tests across all tiers + challengers, **100% PASSING** (execution time ~14s).

---

## 2. Existing State Management, Data Models & Reactive Bank Ledger

### 2.1 State Management Architecture (`js/store.js`)
- `store` is an instantiated singleton class (`Store`).
- Data is stored in `window.localStorage` as JSON-serialized strings.
- **Event Bus**:
  - `store.notify(eventType, payload)` dispatches `window.dispatchEvent(new CustomEvent('store:updated', { detail: { type, payload, timestamp } }))`.
  - Event types used: `'trades'`, `'banks'`, `'transfers'`, `'settings'`, `'all'`.
  - Domain controllers subscribe to `store:updated` and re-render their respective UI components automatically.

### 2.2 Data Models & Schemas

#### Trade Model (`bybit_p2p_trades` in localStorage)
```typescript
interface Trade {
  id: string;               // e.g. "trade_m0x89ab_..." (generated via generateId('trade'))
  refId?: string;           // Bybit P2P Order ID (e.g. "1882947192837482910")
  type: 'BUY' | 'SELL';
  date: string;             // ISO 8601 string
  bankAccountId: string;    // References BankAccount.id
  rate: number;             // NGN per USDT (e.g. 1650.00)
  ngnAmount: number;        // Gross NGN transaction value
  usdtAmount: number;       // USDT volume (e.g. 100.00)
  fees: Array<{
    type: string;           // 'Bank Transfer Fee' | 'Bybit P2P Fee' | 'Custom' | etc.
    amount: number;
    label: string;
  }>;
  totalFees: number;        // Sum of all fee items
  netAmount: number;        // BUY: ngnAmount + totalFees; SELL: max(0, ngnAmount - totalFees)
  effectiveRate: number;    // netAmount / usdtAmount
  counterparty: string;     // Trader nickname/name
  paymentMethod: string;    // 'Bybit P2P' | 'Bank Transfer' | etc.
  notes: string;
  createdAt: string;
  updatedAt: string;
}
```

#### Bank Account Model (`bybit_p2p_banks` in localStorage)
```typescript
interface BankAccount {
  id: string;               // e.g. 'bank_opay_default' or generateId('bank')
  name: string;             // e.g. 'OPay', 'Kuda Bank', 'GTBank'
  last4: string;            // e.g. '1234'
  alias?: string;           // e.g. 'OPay Main Trading'
  initialBalance: number;   // Starting cash in NGN (default 0)
  createdAt: string;
  updatedAt?: string;
}
```

#### Transfer Model (`bybit_p2p_transfers` in localStorage)
```typescript
interface Transfer {
  id: string;               // generateId('transfer')
  date: string;
  from: string;             // Display label e.g. "OPay (•••• 1234)" or "Bybit Funding"
  to: string;               // Display label e.g. "Kuda (•••• 5678)" or "Bybit Spot"
  fromBankId?: string;      // ID of source bank (if NGN transfer)
  toBankId?: string;        // ID of target bank (if NGN transfer)
  amount: number;           // Principal amount transferred
  fee: number;              // Gas/transfer fee
  notes: string;
  asset: 'NGN' | 'USDT';
  createdAt: string;
}
```

#### Opening Inventory (`bybit_p2p_opening_inventory` in localStorage)
```typescript
interface OpeningInventory {
  startingUsdtBalance: number; // Pre-existing USDT in portfolio
  defaultCostBasis: number;    // Acquisition rate in NGN / USDT
}
```

### 2.3 Reactive Bank Ledger Implementation (`store.getComputedBankBalances()`)
The authoritative bank balance calculation lives in `js/store.js` lines 188–257:

```javascript
getComputedBankBalances() {
  const banks = this.getBankAccounts();
  const trades = this.getTrades();
  const transfers = this.getTransfers();
  const balanceMap = new Map();

  // 1. Initialize map with initial balances
  banks.forEach(bank => {
    const initBal = Number(bank.initialBalance) || 0;
    balanceMap.set(bank.id, {
      bank,
      initialBalance: initBal,
      currentBalance: initBal,
      totalInflow: 0,
      totalOutflow: 0,
      totalFees: 0
    });
  });

  // 2. Process Trades
  trades.forEach(trade => {
    const bankId = trade.bankAccountId;
    if (!balanceMap.has(bankId)) return;
    const record = balanceMap.get(bankId);
    const ngn = Number(trade.ngnAmount) || 0;
    const totalFees = Number(trade.totalFees) || 0;
    const netAmount = Number(trade.netAmount) || (trade.type === 'BUY' ? ngn + totalFees : Math.max(0, ngn - totalFees));

    if (trade.type === 'BUY') {
      record.currentBalance -= netAmount;
      record.totalOutflow += netAmount;
      record.totalFees += totalFees;
    } else if (trade.type === 'SELL') {
      record.currentBalance += netAmount;
      record.totalInflow += netAmount;
      record.totalFees += totalFees;
    }
  });

  // 3. Process NGN Transfers
  transfers.forEach(transfer => {
    const fromId = transfer.fromBankId;
    const toId = transfer.toBankId;
    const amount = Number(transfer.amount) || 0;
    const fee = Number(transfer.fee) || 0;

    if (transfer.asset === 'NGN') {
      if (fromId && balanceMap.has(fromId)) {
        balanceMap.get(fromId).currentBalance -= (amount + fee);
        balanceMap.get(fromId).totalOutflow += (amount + fee);
        balanceMap.get(fromId).totalFees += fee;
      }
      if (toId && balanceMap.has(toId)) {
        balanceMap.get(toId).currentBalance += amount;
        balanceMap.get(toId).totalInflow += amount;
      }
    }
  });

  return balanceMap;
}
```

**Total Bank Cash in Portfolio**:
In `js/dashboard.js` (`renderDashboardMetrics()`):
```javascript
const computedBankBalances = store.getComputedBankBalances();
let totalBankCash = 0;
computedBankBalances.forEach(rec => {
  totalBankCash += rec.currentBalance;
});
```

---

## 3. Bybit USDT Funding Balance Integration & Ad Listings State

### 3.1 Bybit API Endpoints (`server.js` & `api/*.js`)
- **`/api/balance`**:
  - Calls Bybit OpenAPI `GET /v5/asset/transfer/query-account-coins-balance?accountType=FUND&coin=USDT` and `POST /v5/p2p/item/personal/list`.
  - Express proxy response structure:
    ```json
    {
      "retCode": 0,
      "retMsg": "SUCCESS",
      "result": {
        "coin": "USDT",
        "freeBalance": 741.0,
        "lockedInAds": 458.0,
        "totalBalance": 1199.0,
        "activeAds": [
          {
            "id": "1892837482",
            "price": "1650.00",
            "lastQuantity": 400.0,
            "frozenQuantity": 58.0,
            "totalInAd": 458.0,
            "status": 10
          }
        ]
      }
    }
    ```
- **`/api/ads`**:
  - Calls Bybit OpenAPI `POST /v5/p2p/item/personal/list`.
  - Returns array of user's personal active P2P ads (`side: '1'` for SELL, `tokenId: 'USDT'`).
- **`/api/status`**:
  - Returns `{ status: 'online', apiKeyConfigured: boolean, authRequired: boolean }`.

### 3.2 Frontend Live Sync Architecture (`js/bybitService.js`, `js/dashboard.js`)
- **`bybitService.fetchFundingBalance('USDT')`**:
  - Automatically attaches auth headers (`Authorization: Bearer <token>`, `x-proxy-token: <token>`) from `localStorage.getItem('bybit_p2p_proxy_token')`.
  - Returns Bybit wallet balance data.
- **`bybitService.fetchActiveAds('1', 'USDT')`**:
  - Fetches active ads.
- **Dashboard Synchronization (`js/dashboard.js`)**:
  - `syncBybitLiveInventory()`:
    1. Fetches `totalP2P` funding balance from Bybit API.
    2. Fetches active sell ads (`side === 1 && status !== 30`) to compute `adAllocation = sum(lastQuantity + frozenQuantity)`.
    3. Calculates `freeForBuyback = Math.max(0, totalP2P - adAllocation)`.
    4. Renders allocation numbers into `#stat-bybit-live-total`, `#stat-bybit-locked`, `#stat-bybit-free` and updates the visual allocation progress bar (`#bar-segment-active`, `#bar-segment-free`).
  - `syncAndRenderActiveAd()`:
    1. Detects live active sell ad (`status === 10` [online] or `20`/`2` [active]).
    2. Extracts `adPrice = parseFloat(activeSellAd.price)`.
    3. Computes spread per USDT (`adPrice - avgBuyCost`), margin %, and projected profit.
    4. Stores reference to `latestActiveAd`.

### 3.3 Exchange Rate Conversion Strategy for Net Worth
For live Net Worth conversion between NGN and USDT:
- **Primary Live Reference Rate**: Active Bybit Sell Ad Price (`latestActiveAd?.price`).
- **Secondary Fallback 1**: Average holding cost basis from FIFO engine (`fifoResult.avgHoldingCostPerUSDT`).
- **Secondary Fallback 2**: Default cost basis from opening inventory (`openingInventory.defaultCostBasis`).
- **Secondary Fallback 3**: Latest recorded trade rate or default benchmark rate (e.g. ₦1,500.00 / USDT).

---

## 4. Storage Mechanisms, LocalStorage Keys & Event Synchronization

### 4.1 LocalStorage Keys Inventory
| Key | Type | Description | Primary Mutator |
|---|---|---|---|
| `bybit_p2p_version` | number | Schema migration version (1) | `js/store.js` (`init()`) |
| `bybit_p2p_trades` | Trade[] | Array of recorded P2P trades | `js/store.js` (`addTrade`, `updateTrade`, `deleteTrade`) |
| `bybit_p2p_banks` | BankAccount[] | Array of configured bank accounts | `js/store.js` (`addBankAccount`, `updateBankAccount`, `deleteBankAccount`) |
| `bybit_p2p_transfers` | Transfer[] | Array of NGN/USDT transfers | `js/store.js` (`addTransfer`, `deleteTransfer`) |
| `bybit_p2p_opening_inventory` | OpeningInventory | Starting USDT & cost basis | `js/settings.js` (`#form-opening-inventory` submit only) |
| `bybit_p2p_settings` | object | General settings | `js/store.js` |
| `bybit_p2p_theme` | string | Theme preference (`'dark'` / `'light'`) | `js/app.js` (`initTheme()`) |
| `bybit_p2p_proxy_url` | string | Custom proxy server base URL | `js/settings.js` (`#input-proxy-url`) |
| `bybit_p2p_proxy_token` | string | Proxy auth security token | `js/settings.js` (`#input-proxy-token`) |
| `bybit_p2p_pricing_spread` | string | Target spread per USDT in NGN | `js/pricing.js` |
| `bybit_p2p_pricing_volume` | string | Target transaction volume | `js/pricing.js` |
| `bybit_p2p_pricing_inflow` | string | Inflow bank fee in NGN | `js/pricing.js` |
| `bybit_p2p_pricing_outflow` | string | Outflow bank fee in NGN | `js/pricing.js` |
| `bybit_p2p_pricing_mode` | string | Pricing algorithm mode | `js/pricing.js` |
| `bybit_p2p_pricing_depth_limit` | string | Competitor depth limit | `js/pricing.js` |
| `bybit_p2p_pricing_filter_limits` | string | Filter limits boolean | `js/pricing.js` |

### 4.2 Proposed Key for Requirement R2 (Net Worth Snapshots)
- **Key**: `bybit_p2p_net_worth_snapshots`
- **Schema**:
  ```typescript
  interface NetWorthSnapshot {
    id: string;                 // e.g. generateId('snapshot')
    timestamp: string;          // ISO 8601 string (e.g. "2026-08-25T14:00:00.000Z")
    bankCashNGN: number;        // Sum of all bank cash balances at snapshot time
    bybitUsdtBalance: number;   // Total Bybit USDT funding balance (active ads + free)
    referenceRate: number;      // Exchange rate in NGN/USDT used for valuation
    netWorthNGN: number;        // bankCashNGN + (bybitUsdtBalance * referenceRate)
    netWorthUSDT: number;       // (bankCashNGN / referenceRate) + bybitUsdtBalance
    notes?: string;             // Optional user notes (e.g. "End of Day 1")
    createdAt: string;          // ISO 8601 creation date
  }
  ```

### 4.3 Data Synchronization & Event Dispatch Pipeline
```
+-------------------------------------------------------------------------+
|                              Local Storage                              |
| (bybit_p2p_trades, bybit_p2p_banks, bybit_p2p_net_worth_snapshots, etc.) |
+-------------------------------------------------------------------------+
                                    ^
                                    | Read / Write JSON
                                    v
+-------------------------------------------------------------------------+
|                            js/store.js (Store)                          |
| - getComputedBankBalances() -> Map<bankId, BankBalanceRecord>           |
| - getNetWorthSnapshots(), addNetWorthSnapshot(), deleteSnapshot()        |
| - notify(type, payload)                                                 |
+-------------------------------------------------------------------------+
                                    |
            window.dispatchEvent(new CustomEvent('store:updated'))
                                    |
        +---------------------------+----------------------------+
        |                           |                            |
        v                           v                            v
+------------------+     +--------------------+     +---------------------+
| js/dashboard.js  |     |   js/history.js    |     |   js/pricing.js     |
| - Net Worth Card |     | - Trade Filter &   |     | - Spread & Margin   |
| - Trend Chart    |     |   Search Table     |     |   Calculations      |
| - Portfolio KPIs |     +--------------------+     +---------------------+
+------------------+
```

---

## 5. Architectural Blueprint for Net Worth & Capital Cycle System

### Requirement 1: Live Net Worth Dashboard Widget
1. **Data Sources**:
   - `totalBankCash`: Sum of `rec.currentBalance` from `store.getComputedBankBalances()`.
   - `totalBybitUSDT`: From live Bybit balance sync (`syncBybitLiveInventory()`), or fallback to FIFO inventory `fifoResult.remainingInventoryUSDT`.
   - `referenceRate`: Live Bybit Active Sell Ad rate (`latestActiveAd?.price`), or fallback to `avgHoldingCostPerUSDT` / `defaultCostBasis` / default rate.
2. **Calculations**:
   - Total Net Worth in NGN = `totalBankCash + (totalBybitUSDT * referenceRate)`
   - Total Net Worth in USDT = `(totalBankCash / referenceRate) + totalBybitUSDT`
3. **UI Placement**:
   - Integrated as a prominent Live Net Worth Widget / Hero Card on Dashboard (`js/views/dashboard.view.js` and `js/dashboard.js`), displaying:
     - Net Worth in NGN (formatted with `formatNGN`)
     - Net Worth in USDT (formatted with `formatUSDT`)
     - Asset composition breakdown: Bank Cash (₦) vs Bybit Crypto ($)
     - Reference conversion rate badge (with live/fallback indicator)
     - "Save Snapshot / End Day" action button.

### Requirement 2: Net Worth Snapshot Logging
1. **Store Extension (`js/store.js`)**:
   - Add storage key `STORAGE_KEYS.NET_WORTH_SNAPSHOTS = 'bybit_p2p_net_worth_snapshots'`.
   - Add methods:
     - `getNetWorthSnapshots(): NetWorthSnapshot[]`
     - `addNetWorthSnapshot(snapshotData): NetWorthSnapshot`
     - `deleteNetWorthSnapshot(id: string): boolean`
     - `clearNetWorthSnapshots(): void`
   - Include snapshots in `exportAllData()` and `importAllData()` in `js/store.js` and `js/export.js`.
2. **Snapshot Modal (`js/views/modals.view.js`)**:
   - Modal `#modal-net-worth-snapshot-backdrop`:
     - Displays calculated Bank Cash (₦) and Bybit USDT balance ($).
     - Editable Reference Exchange Rate input (`#input-snapshot-rate`), auto-filled with the current reference rate.
     - Dynamic preview of calculated Net Worth in NGN and USDT.
     - Optional notes input (`#input-snapshot-notes`).
     - "Cancel" and "Save Snapshot" buttons.
3. **Trigger & Handler (`js/dashboard.js`)**:
   - Clicking "End Day / Save Snapshot" opens the modal with fresh balances.
   - Submitting the form validates inputs, writes snapshot to store, and dispatches notification.

### Requirement 3: Historical Comparison & Trend Chart
1. **Historical Comparison & Delta Metrics (`js/dashboard.js`)**:
   - Retrieve historical snapshots sorted by timestamp.
   - If snapshots exist:
     - Compare current live Net Worth or latest snapshot with previous snapshot.
     - Calculate absolute delta: `deltaNGN = currentNetWorthNGN - prevSnapshot.netWorthNGN`
     - Calculate percentage delta: `deltaPct = (deltaNGN / prevSnapshot.netWorthNGN) * 100`
     - Display delta badge (green `+₦... (+...%)` or red `-₦... (-...%)`).
2. **Chart.js Trend Visualization (`js/dashboard.js` & `js/views/dashboard.view.js`)**:
   - Add "Net Worth Trend" Chart container (`#netWorthChart`) on Dashboard.
   - Dual-axis or toggleable line chart visualizing historical snapshots:
     - X-axis: Snapshot timestamps/dates.
     - Y-axis: Total Net Worth in NGN (and/or USDT).
     - Visual styling matching dark slate/navy theme with gradient fills.
3. **Backup & Restore Parity (`js/export.js`)**:
   - Ensure `exportFullBackupJSON()` includes `netWorthSnapshots: store.getNetWorthSnapshots()`.
   - Ensure `importBackupJSON()` imports and restores snapshots cleanly.

---

## 6. Service Worker Offline Manifest Verification
When adding new views, scripts, or assets, the Service Worker manifest in `sw.js` (`STATIC_ASSETS`) and cache versioning must maintain complete parity to ensure 100% offline availability across all 5 views and modals.
