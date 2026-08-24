# Backend & Offline Infrastructure Survey Report (R1 & R5)

**Date**: 2026-08-24  
**Author**: Survey Explorer (Backend & Offline Infrastructure)  
**Target Codebase**: `c:\dev\p2p`  
**Scope**: 
1. **R1: API Proxy Security & Token Authorization** (`server.js`, `api/*.js`, `js/bybitService.js`, `js/settings.js`, `js/views/settings.view.js`)
2. **R5: Complete Offline PWA Pre-caching** (`sw.js`, `manifest.json`, `index.html`, `js/*.js`, `js/views/*.js`, `css/styles.css`)

---

## 1. Executive Summary

This investigation analyzed the backend proxy infrastructure (Node.js/Express and Vercel Serverless) and the Progressive Web App (PWA) offline caching layer for the Bybit NGN P2P Trade Tracker.

### Key Discoveries:
1. **R1 (Critical Security Exposure)**: All proxy endpoints (`/api/balance`, `/api/orders`, `/api/ads`, `/api/market-depth`) are currently unauthenticated. Any client on the network or internet can trigger signed Bybit requests using the server's private `BYBIT_API_KEY` and `BYBIT_API_SECRET`. Furthermore, `api/balance.js` in Vercel lacks feature parity with `server.js` (omits active ad locked balance calculation), and CORS headers on Vercel endpoints do not allow authorization headers.
2. **R5 (Offline Failure Guarantee)**: The Service Worker cache manifest (`sw.js`) currently only caches `js/app.js`, `js/pricing.js`, and `js/views/pricing.view.js`. **11 core JS modules** and **5 view templates** are completely omitted from `STATIC_ASSETS`. As an ES module application where `js/app.js` imports all views and controllers at boot, a user loading the app offline without having pre-fetched every single module in standard browser cache will experience a fatal `TypeError: Failed to fetch dynamically imported module`.

---

## 2. Deep Dive: R1 API Proxy Security & Token Authorization

### 2.1 Current Architecture & Endpoints Survey

The application supports two deployment targets for Bybit API proxying:
1. **Express Server** (`server.js`): Running locally or on a Node.js server (port 3000).
2. **Vercel Serverless Functions** (`api/*.js`): Running in region `fra1` configured in `vercel.json`.

#### Inventory of API Routes:

| Route Path | Express Handler (`server.js`) | Vercel Handler (`api/*.js`) | Auth Status | Current Purpose |
|---|---|---|---|---|
| `/api/status` | Lines 93–101 (`GET`) | `api/status.js` (`GET`, `OPTIONS`) | Public (Unauthenticated) | Health check, checks if API keys are configured. |
| `/api/balance` | Lines 107–190 (`ALL`: GET/POST) | `api/balance.js` (`GET`, `POST`, `OPTIONS`) | **MISSING AUTH** (Open) | Fetches Funding Wallet USDT balance & active ad locked balance. |
| `/api/orders` | Lines 196–234 (`POST`) | `api/orders.js` (`POST`, `OPTIONS`) | **MISSING AUTH** (Open) | Fetches completed P2P order history (`/v5/p2p/order/simplifyList`). |
| `/api/ads` | Lines 240–266 (`ALL`: GET/POST) | `api/ads.js` (`GET`, `POST`, `OPTIONS`) | **MISSING AUTH** (Open) | Fetches merchant's active P2P sell advertisements. |
| `/api/market-depth` | Lines 272–324 (`GET`) | `api/market-depth.js` (`GET`, `POST`, `OPTIONS`) | **MISSING AUTH** (Open) | Queries live order book bids/asks concurrently (`/v5/p2p/item/online`). |

---

### 2.2 Existing Vulnerability & Discrepancies

1. **Unprotected Endpoint Exposure**:
   - In `server.js` (lines 107, 196, 240, 272), endpoints execute HMAC-SHA256 signatures with `API_SECRET` and Bybit API calls with `API_KEY` for any incoming HTTP request.
   - In `api/*.js`, the functions check only `if (!API_KEY || !API_SECRET)` before querying Bybit.
2. **CORS Header Restrictions in Vercel**:
   - `api/ads.js`, `api/orders.js`, `api/balance.js`, and `api/market-depth.js` specify:
     ```js
     res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
     ```
     When the frontend sends `Authorization` or `x-proxy-token`, the browser preflight (`OPTIONS`) request will be blocked by CORS unless `Authorization, x-proxy-token, x-api-token, Content-Type` are explicitly allowed.
3. **Behavioral Inconsistency in `/api/balance`**:
   - `server.js` computes both wallet balance and locked coins in active ads, returning a structured object:
     `{ retCode: 0, retMsg: 'SUCCESS', result: { coin, freeBalance, lockedInAds, totalBalance, activeAds, rawBalance } }`.
   - `api/balance.js` currently returns the raw Bybit wallet response `res.status(200).json(response.data)`.
   - Standardizing the response format across Express and Vercel will prevent unexpected client behavior.

---

### 2.3 Frontend API Caller Survey (`js/bybitService.js`)

In `js/bybitService.js`:
- `getProxyUrl()` (lines 7–31) checks `localStorage.getItem('bybit_p2p_proxy_url')`, defaults to `http://${hostname}:3000` for local dev or `window.location.origin`.
- Calls:
  - `checkStatus()` (line 40): `fetch(`${baseUrl}/api/status`)`
  - `fetchFundingBalance(coin)` (line 55): `fetch(`${baseUrl}/api/balance?...`, { method: 'POST', headers: { 'Content-Type': 'application/json' } })`
  - `fetchP2POrders(...)` (line 88): `fetch(`${baseUrl}/api/orders`, { method: 'POST', ... })`
  - `fetchActiveAds(...)` (line 119): `fetch(`${baseUrl}/api/ads?...`, { method: 'POST', ... })`
  - `fetchMarketDepth(...)` (line 144): `fetch(`${baseUrl}/api/market-depth?...`)`
- **Current Token Handling**: There is no token retrieval or header transmission whatsoever.

---

### 2.4 Proposed Security Architecture & Authentication Protocol

#### 1. Environment Variable Specification
- Primary Token Env Var: `PROXY_AUTH_TOKEN`
- Fallback Aliases: `BYBIT_PROXY_TOKEN`, `AUTH_TOKEN`
- If `PROXY_AUTH_TOKEN` is defined in environment variables (`.env` or Vercel Environment Variables):
  - Every request to `/api/balance`, `/api/orders`, `/api/ads`, and `/api/market-depth` **MUST** provide a valid matching token.
  - If the token is missing or does not match: Respond with HTTP `401 Unauthorized` and JSON:
    ```json
    {
      "retCode": 401,
      "retMsg": "Unauthorized: Invalid or missing proxy authorization token"
    }
    ```
- `/api/status` remains accessible publicly to check server liveness, and includes `authRequired: !!PROXY_AUTH_TOKEN` in its response payload so the client can detect whether authorization is required.

#### 2. Accepted Token Formats from Frontend
The proxy should accept token extraction from:
1. `Authorization` header: `Authorization: Bearer <token>`
2. Custom Header: `x-proxy-token: <token>` or `X-Proxy-Token: <token>` or `x-api-token: <token>`
3. Query parameter: `?token=<token>`
4. JSON body: `req.body.token`

#### 3. Timing-Safe Comparison
To prevent timing attacks when verifying tokens:
```js
function verifyToken(providedToken, expectedToken) {
  if (!providedToken || !expectedToken) return false;
  const bufA = Buffer.from(String(providedToken));
  const bufB = Buffer.from(String(expectedToken));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
```

#### 4. Shared Auth Module / Middleware Implementation Blueprint

##### A. Express Middleware (`server.js`)
```javascript
const PROXY_AUTH_TOKEN = process.env.PROXY_AUTH_TOKEN || process.env.BYBIT_PROXY_TOKEN || process.env.AUTH_TOKEN;

function validateAuth(req, res, next) {
  if (!PROXY_AUTH_TOKEN) {
    return next();
  }

  const authHeader = req.headers['authorization'] || req.headers['x-proxy-token'] || req.headers['x-api-token'];
  let token = null;

  if (authHeader) {
    token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
  } else if (req.query?.token) {
    token = String(req.query.token).trim();
  } else if (req.body?.token) {
    token = String(req.body.token).trim();
  }

  if (!token || !verifyToken(token, PROXY_AUTH_TOKEN)) {
    return res.status(401).json({
      retCode: 401,
      retMsg: 'Unauthorized: Invalid or missing proxy authorization token'
    });
  }

  next();
}

// Apply middleware to protected routes:
app.use('/api/balance', validateAuth);
app.use('/api/orders', validateAuth);
app.use('/api/ads', validateAuth);
app.use('/api/market-depth', validateAuth);
```

##### B. Vercel Serverless Helper (`api/_bybit.js`)
```javascript
const PROXY_AUTH_TOKEN = process.env.PROXY_AUTH_TOKEN || process.env.BYBIT_PROXY_TOKEN || process.env.AUTH_TOKEN;

function verifyAuth(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-proxy-token, x-api-token');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return false; // Preflight handled
  }

  if (PROXY_AUTH_TOKEN) {
    const authHeader = req.headers['authorization'] || req.headers['x-proxy-token'] || req.headers['x-api-token'];
    let token = null;

    if (authHeader) {
      token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
    } else if (req.query?.token) {
      token = String(req.query.token).trim();
    } else if (req.body?.token) {
      token = String(req.body.token).trim();
    }

    if (!token || !verifyToken(token, PROXY_AUTH_TOKEN)) {
      res.status(401).json({
        retCode: 401,
        retMsg: 'Unauthorized: Invalid or missing proxy authorization token'
      });
      return false;
    }
  }

  return true;
}
```

##### C. Frontend Client (`js/bybitService.js`)
```javascript
function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('bybit_p2p_proxy_token');
  if (token && token.trim()) {
    headers['Authorization'] = `Bearer ${token.trim()}`;
    headers['x-proxy-token'] = token.trim();
  }
  return headers;
}
```
Inject `headers: getAuthHeaders()` into `fetchFundingBalance`, `fetchP2POrders`, `fetchActiveAds`, and `fetchMarketDepth`.

##### D. Frontend UI Configuration (`js/views/settings.view.js` & `js/settings.js`)
In the Settings Bybit Sync panel (`js/views/settings.view.js`), add configuration fields:
1. **Proxy URL** (`input-proxy-url`, `bybit_p2p_proxy_url`)
2. **Proxy Auth Token / Secret** (`input-proxy-token`, `bybit_p2p_proxy_token`) with password visibility toggle.
3. Wire change listeners in `js/settings.js` to save to `localStorage` and trigger `checkProxyConnection()`.

---

## 3. Deep Dive: R5 Complete Offline PWA Pre-caching

### 3.1 Current Service Worker Implementation (`sw.js`)

In `sw.js` (lines 6–18):
```javascript
const CACHE_NAME = 'bybit-p2p-v8';
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/styles.css?v=2.5',
  './js/app.js',
  './js/views/pricing.view.js',
  './js/pricing.js',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];
```

### 3.2 Full Codebase Asset Audit vs Cache Manifest

The table below catalogs every static resource, script, and view in `c:\dev\p2p`:

| File Path | Type | Loaded By | Cached in `sw.js`? | Status / Risk |
|---|---|---|:---:|---|
| `./` | Root Entry | Browser navigation | ✅ Yes | Cached |
| `./index.html` | App Shell | Browser navigation | ✅ Yes | Cached |
| `./manifest.json` | PWA Manifest | `<link rel="manifest">` | ✅ Yes | Cached |
| `./css/styles.css?v=2.5` | Stylesheet | `<link rel="stylesheet">` | ✅ Yes | Cached (with query) |
| `./css/styles.css` | Stylesheet | Direct fetch / fallback | ❌ No | **MISSING** (normalize in cache) |
| `./icons/icon.svg` | App Icon | `index.html`, manifest | ✅ Yes | Cached |
| `./icons/icon-192.png` | App Icon | `index.html`, manifest | ✅ Yes | Cached |
| `./icons/icon-512.png` | App Icon | `index.html`, manifest | ✅ Yes | Cached |
| `./js/app.js` | Main Bootstrapper | `<script type="module">` | ✅ Yes | Cached |
| `./js/banks.js` | Controller | `js/app.js` | ❌ No | **CRITICAL MISSING** |
| `./js/bybitService.js` | Service | `dashboard.js`, `pricing.js`, `settings.js` | ❌ No | **CRITICAL MISSING** |
| `./js/dashboard.js` | Controller | `js/app.js` | ❌ No | **CRITICAL MISSING** |
| `./js/export.js` | Service | `js/settings.js` | ❌ No | **CRITICAL MISSING** |
| `./js/fees.js` | Logic | `js/trades.js`, `js/settings.js` | ❌ No | **CRITICAL MISSING** |
| `./js/history.js` | Controller | `js/app.js` | ❌ No | **CRITICAL MISSING** |
| `./js/pricing.js` | Controller | `js/app.js` | ✅ Yes | Cached |
| `./js/settings.js` | Controller | `js/app.js` | ❌ No | **CRITICAL MISSING** |
| `./js/store.js` | Data Store | All controllers | ❌ No | **CRITICAL MISSING** |
| `./js/trades.js` | Controller | `js/app.js` | ❌ No | **CRITICAL MISSING** |
| `./js/transfers.js` | Controller | `js/app.js` | ❌ No | **CRITICAL MISSING** |
| `./js/utils.js` | Math & FIFO Engine | All controllers & store | ❌ No | **CRITICAL MISSING** |
| `./js/views/addTrade.view.js` | View Template | `js/app.js` | ❌ No | **CRITICAL MISSING** |
| `./js/views/dashboard.view.js` | View Template | `js/app.js` | ❌ No | **CRITICAL MISSING** |
| `./js/views/history.view.js` | View Template | `js/app.js` | ❌ No | **CRITICAL MISSING** |
| `./js/views/modals.view.js` | View Template | `js/app.js` | ❌ No | **CRITICAL MISSING** |
| `./js/views/pricing.view.js` | View Template | `js/app.js` | ✅ Yes | Cached |
| `./js/views/settings.view.js` | View Template | `js/app.js` | ❌ No | **CRITICAL MISSING** |

---

### 3.3 Root Cause of Offline Breakage

1. **Native ES Module Tree Breakdown**:
   When `index.html` loads `<script type="module" src="js/app.js"></script>`, the browser statically resolves all top-level `import` statements at parse time:
   ```javascript
   import { renderDashboardView } from './views/dashboard.view.js';
   import { renderAddTradeView } from './views/addTrade.view.js';
   import { renderPricingView } from './views/pricing.view.js';
   import { renderHistoryView } from './views/history.view.js';
   import { renderSettingsView } from './views/settings.view.js';
   import { renderModalsView } from './views/modals.view.js';
   import { initBanks } from './banks.js';
   import { initTransfers } from './transfers.js';
   import { initTrades } from './trades.js';
   import { initDashboard } from './dashboard.js';
   import { initHistory } from './history.js';
   import { initSettings } from './settings.js';
   import { initPricing } from './pricing.js';
   ```
   If the user opens the PWA while offline (or after a cache refresh), the Service Worker `fetch` handler catches requests for `./js/views/dashboard.view.js`, `./js/banks.js`, etc. Because they are NOT in the cache and there is no network connection, the fetch fails. The browser aborts script evaluation, rendering a blank white screen.

2. **Query String Mismatch for CSS**:
   `index.html` references `css/styles.css?v=2.5`. In `sw.js`, `STATIC_ASSETS` contains `./css/styles.css?v=2.5`. If another view or navigation references `./css/styles.css` without query parameter, cache lookup will miss unless `ignoreSearch: true` or both variations are cached.

---

### 3.4 Complete Updated Pre-Cache Manifest (`STATIC_ASSETS`)

```javascript
const CACHE_NAME = 'bybit-p2p-v9';

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './css/styles.css?v=2.5',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',

  // Core Application & Infrastructure
  './js/app.js',
  './js/store.js',
  './js/utils.js',
  './js/fees.js',
  './js/export.js',
  './js/bybitService.js',

  // Controllers
  './js/dashboard.js',
  './js/trades.js',
  './js/history.js',
  './js/pricing.js',
  './js/banks.js',
  './js/transfers.js',
  './js/settings.js',

  // View Templates
  './js/views/dashboard.view.js',
  './js/views/addTrade.view.js',
  './js/views/pricing.view.js',
  './js/views/history.view.js',
  './js/views/settings.view.js',
  './js/views/modals.view.js'
];
```

### 3.5 Fetch Handler Robustness Improvements
In `sw.js`:
1. Use `caches.match(event.request, { ignoreSearch: true })` as a secondary fallback when matching local assets.
2. For HTML navigation requests when offline, ensure fallback returns `./index.html`.
3. Preserve Cache-First caching for external CDNs:
   - `unpkg.com/lucide@latest`
   - `cdn.jsdelivr.net/npm/chart.js`
   - `fonts.googleapis.com` / `fonts.gstatic.com`

---

## 4. Architectural Interface Contracts & Proposed Changes

### 4.1 Interface Contract: Backend Token Authorization

#### Request Signature
```http
POST /api/balance HTTP/1.1
Host: localhost:3000
Content-Type: application/json
Authorization: Bearer my_secret_token_123
x-proxy-token: my_secret_token_123

{
  "coin": "USDT"
}
```

#### Unauthorized Response (HTTP 401)
```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "retCode": 401,
  "retMsg": "Unauthorized: Invalid or missing proxy authorization token"
}
```

#### Authorized Response (HTTP 200)
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "retCode": 0,
  "retMsg": "SUCCESS",
  "result": { ... }
}
```

---

### 4.2 Code Locations for Implementation

| Target File | Lines / Location | Required Modification |
|---|---|---|
| `server.js` | Lines 10–14, 107–324 | Add `PROXY_AUTH_TOKEN` parsing, `validateAuth` middleware, apply to `/api/balance`, `/api/orders`, `/api/ads`, `/api/market-depth`. Update `/api/status` to expose `authRequired`. |
| `api/_bybit.js` | Lines 1–74 | Export `PROXY_AUTH_TOKEN` and `verifyAuth(req, res)` helper. Ensure CORS preflight includes `Authorization, x-proxy-token, x-api-token`. |
| `api/balance.js` | Lines 1–31 | Call `if (!verifyAuth(req, res)) return;` at entry. Align payload format with `server.js`. |
| `api/orders.js` | Lines 1–58 | Call `if (!verifyAuth(req, res)) return;` at entry. |
| `api/ads.js` | Lines 1–38 | Call `if (!verifyAuth(req, res)) return;` at entry. |
| `api/market-depth.js` | Lines 1–64 | Call `if (!verifyAuth(req, res)) return;` at entry. |
| `api/status.js` | Lines 1–19 | Return `authRequired: !!PROXY_AUTH_TOKEN`. |
| `js/bybitService.js` | Lines 33–158 | Add `getAuthHeaders()` injecting `Authorization: Bearer <token>` and `x-proxy-token: <token>` from `localStorage.getItem('bybit_p2p_proxy_token')`. |
| `js/views/settings.view.js` | Lines 68–109 | Add UI inputs for Proxy Auth Token and Proxy URL. |
| `js/settings.js` | Lines 75–106 | Read/write `bybit_p2p_proxy_token` in `localStorage`, reflect connection status and auth status. |
| `sw.js` | Lines 6–18, 48–107 | Bump `CACHE_NAME` to `bybit-p2p-v9`, add all 24 local JS, CSS, view, and icon assets to `STATIC_ASSETS`. Add `ignoreSearch: true` fallback. |

---

## 5. Acceptance Criteria Verification Plan

| Requirement | Test Scenario | Expected Outcome | Verification Tool / Command |
|---|---|---|---|
| **R1** | `curl -i http://localhost:3000/api/balance` (without token) | Returns `HTTP/1.1 401 Unauthorized` | Terminal curl / node test script |
| **R1** | `curl -i -H "Authorization: Bearer correct_token" http://localhost:3000/api/balance` | Returns `HTTP/1.1 200 OK` (or 500 if Bybit keys missing, not 401) | Terminal curl |
| **R1** | `curl -i -H "x-proxy-token: correct_token" http://localhost:3000/api/orders -d "{}"` | Returns `HTTP/1.1 200 OK` | Terminal curl |
| **R1** | Frontend Settings tab with token configured | Bybit balance & active ads sync successfully | Browser inspection / console log |
| **R5** | Inspect `sw.js` `STATIC_ASSETS` array | Contains all 13 `js/*.js` and 6 `js/views/*.js` files | `view_file` on `sw.js` |
| **R5** | Browser offline mode (Network: Offline) & full reload | Shell loads, all 5 tabs (`Dashboard`, `Add Trade`, `Pricing`, `History`, `Settings`) render without network errors | Manual / Chrome DevTools Offline test |

---
