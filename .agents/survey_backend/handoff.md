# Handoff Report: Backend Proxy Security & PWA Offline Infrastructure

**Agent**: Survey Explorer (Backend & Offline Infrastructure)  
**Working Directory**: `c:\dev\p2p\.agents\survey_backend\`  
**Timestamp**: 2026-08-24T17:09:00Z  
**Type**: Hard Handoff (Task Complete)

---

## 1. Observation

1. **Unauthenticated Proxy Routes in `server.js`**:
   - `server.js:107`: `app.all('/api/balance', async (req, res) => { ... })`
   - `server.js:196`: `app.post('/api/orders', async (req, res) => { ... })`
   - `server.js:240`: `app.all('/api/ads', async (req, res) => { ... })`
   - `server.js:272`: `app.get('/api/market-depth', async (req, res) => { ... })`
   - None of these endpoints inspect headers (`Authorization`, `x-proxy-token`, etc.) or request tokens. They execute HMAC-SHA256 signing and proxy directly to Bybit.

2. **Unauthenticated Vercel Serverless Routes in `api/*.js`**:
   - `api/balance.js:3`: `module.exports = async function handler(req, res) { ... }`
   - `api/orders.js:3`: `module.exports = async function handler(req, res) { ... }`
   - `api/ads.js:3`: `module.exports = async function handler(req, res) { ... }`
   - `api/market-depth.js:3`: `module.exports = async function handler(req, res) { ... }`
   - All check only `if (!API_KEY || !API_SECRET)` and return 500 if missing, but have zero token authorization checks.
   - In `api/ads.js:6`, `api/orders.js:6`: `res.setHeader('Access-Control-Allow-Headers', 'Content-Type');` blocks standard `Authorization` / `x-proxy-token` headers during CORS preflight (`OPTIONS`).

3. **Frontend API Caller in `js/bybitService.js`**:
   - `js/bybitService.js:55–58`:
     ```javascript
     const response = await fetch(`${baseUrl}/api/balance?coin=${coin}&accountType=FUND&_t=${Date.now()}`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' }
     });
     ```
   - No token is retrieved from `localStorage` or forwarded in headers.
   - `js/views/settings.view.js` and `js/settings.js` currently lack UI inputs to set/save a proxy authorization token or shared secret.

4. **Service Worker Incomplete Pre-Cache Manifest in `sw.js`**:
   - `sw.js:6–18`:
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
   - Missing from `STATIC_ASSETS`:
     - 11 JS modules: `js/banks.js`, `js/bybitService.js`, `js/dashboard.js`, `js/export.js`, `js/fees.js`, `js/history.js`, `js/settings.js`, `js/store.js`, `js/trades.js`, `js/transfers.js`, `js/utils.js`
     - 5 View templates: `js/views/addTrade.view.js`, `js/views/dashboard.view.js`, `js/views/history.view.js`, `js/views/modals.view.js`, `js/views/settings.view.js`
     - Base CSS asset: `./css/styles.css` (only `./css/styles.css?v=2.5` is listed)

5. **Static ES Module Imports in `js/app.js`**:
   - `js/app.js:6–19`: `import { renderDashboardView } from './views/dashboard.view.js'; ... import { initBanks } from './banks.js'; ...`
   - The browser module loader attempts to fetch all imported sub-modules immediately upon bootstrapping. When offline, uncached modules fail to resolve, completely halting application startup.

---

## 2. Logic Chain

1. **Security Vulnerability Logic (R1)**:
   - Observation 1 & 2 show that any HTTP request sent to `/api/balance`, `/api/orders`, `/api/ads`, or `/api/market-depth` is immediately proxied to Bybit's API with valid HMAC credentials stored on the server.
   - Therefore, malicious actors or unauthorized LAN clients can access the user's Bybit balances and trading records without authentication.
   - Introducing `PROXY_AUTH_TOKEN` validation on both Express (`server.js`) and Vercel (`api/*.js`), returning `401 Unauthorized` for invalid or missing tokens, and updating `js/bybitService.js` to pass `Authorization: Bearer <token>` / `x-proxy-token: <token>` will close this vulnerability while satisfying R1.
   - Adding token inputs in `js/views/settings.view.js` and `js/settings.js` enables seamless user configuration.

2. **Offline Resilience Logic (R5)**:
   - Observation 4 & 5 establish that `index.html` loads `js/app.js` as an ES module, which unconditionally imports 13 local JS files and 6 view templates.
   - Because `sw.js` only caches 3 JS files, opening the app in an offline state causes browser fetch failures on all remaining 16 modules.
   - Expanding `STATIC_ASSETS` in `sw.js` to include all 24 local files and bumping the cache name to `bybit-p2p-v9` guarantees 100% offline shell availability.

---

## 3. Caveats

1. **External CDN Resources**: Lucide Icons (`unpkg.com/lucide@latest`) and Chart.js (`cdn.jsdelivr.net/npm/chart.js`) are dynamically cached in `sw.js` on first load via the runtime Cache-First handler. If a user installs/opens the PWA while strictly offline on their very first session without prior online connection, CDN scripts won't be in cache.
2. **Environment Variable Configuration**: When deploying to Vercel, `PROXY_AUTH_TOKEN` must be added in the Vercel project environment settings. Locally, it should be set in `.env`.

---

## 4. Conclusion

1. **R1**: Implement `PROXY_AUTH_TOKEN` authentication in `server.js` and `api/_bybit.js`, return `401 Unauthorized` on missing/invalid tokens, update Vercel CORS headers, and update `js/bybitService.js` & Settings UI to manage and transmit the token.
2. **R5**: Update `sw.js` `STATIC_ASSETS` to include all 24 local assets (all `js/*.js`, `js/views/*.js`, `css/styles.css`, `manifest.json`, and icons) and bump cache version to `bybit-p2p-v9`.

---

## 5. Verification Method

1. **Verify Unauthenticated Rejection (R1)**:
   - Run server: `node server.js`
   - Execute: `curl -i http://localhost:3000/api/balance`
   - Invalidation condition: Server returns 200/500 instead of `401 Unauthorized`.
2. **Verify Authenticated Success (R1)**:
   - Execute: `curl -i -H "Authorization: Bearer <valid_token>" http://localhost:3000/api/balance`
   - Invalidation condition: Server returns 401.
3. **Verify Offline Pre-cache (R5)**:
   - Check `sw.js` contents: Verify that all 13 `js/*.js` and 6 `js/views/*.js` files are listed in `STATIC_ASSETS`.
   - In browser: Open DevTools > Application > Service Workers, toggle Offline, and reload. The app shell, dashboard, pricing assistant, trade history, and settings tabs must load and navigate without script fetch errors.
