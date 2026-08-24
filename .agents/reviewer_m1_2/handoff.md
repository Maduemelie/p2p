# Milestone 1 Review & Adversarial Challenge Report — API Proxy Security & Token Authorization

**Reviewer**: Reviewer 2 (Critic / Reviewer)  
**Milestone**: Milestone 1 (R1: API Proxy Security & Token Authorization)  
**Verdict**: **APPROVE**  
**Overall Risk Assessment**: LOW  

---

## 1. Observation

### 1.1 Source Code Verification
- **`server.js` (Lines 25–103, 178–195)**:
  - `verifyToken` uses `crypto.timingSafeEqual` after verifying `bufA.length === bufB.length` to guard against length errors and timing side channels.
  - `extractToken` inspects `Authorization` (`Bearer <token>` and raw token), `x-proxy-token`, `x-api-token`, `x-auth-token`, query parameter `?token=`, and JSON body `body.token`.
  - Middleware `validateAuth` protects `/api/balance`, `/api/orders`, `/api/ads`, and `/api/market-depth`. Unauthenticated or invalid requests return HTTP 401 with body `{ retCode: 401, retMsg: 'Unauthorized: Invalid or missing proxy authorization token' }`.
  - Unprotected endpoint `/api/status` returns `{ status: 'online', ..., authRequired: !!currentProxyToken }`.
  - CORS middleware is configured to allow `Authorization`, `x-proxy-token`, `x-api-token`, and `x-auth-token` headers.

- **`api/_bybit.js` (Lines 67–155) & `api/*.js`**:
  - `api/_bybit.js` implements identical `verifyToken`, `extractToken`, and `verifyAuth` logic for Vercel serverless functions.
  - CORS headers (`Access-Control-Allow-Origin: *`, `Access-Control-Allow-Headers: Content-Type, Authorization, x-proxy-token, x-api-token, x-auth-token`) are set on every request.
  - `OPTIONS` preflight requests immediately return 200 OK without requiring authentication.
  - Gating checks `if (!verifyAuth(req, res)) return;` are present at the entry of `api/balance.js` (line 4), `api/orders.js` (line 4), `api/ads.js` (line 4), and `api/market-depth.js` (line 4).

- **`js/bybitService.js` (Lines 33–50, 79–85, 117–123, 147–153, 175–181)**:
  - `getAuthHeaders()` reads `localStorage.getItem('bybit_p2p_proxy_token')` and injects `Authorization: Bearer <token>`, `x-proxy-token`, `x-api-token`, and `x-auth-token`.
  - All proxy API calls (`fetchFundingBalance`, `fetchP2POrders`, `fetchActiveAds`, `fetchMarketDepth`) supply `headers: getAuthHeaders()`.
  - HTTP 401 responses are explicitly intercepted and throw informative, user-friendly errors instructing the user to configure their Proxy Auth Token in Settings.

- **`js/views/settings.view.js` (Lines 83–111)**:
  - Settings UI provides configuration inputs for `Proxy URL` (`#input-proxy-url`) and `Proxy Auth Token` (`#input-proxy-token`), password visibility toggle (`#btn-toggle-proxy-token`), and persistence button (`#btn-save-proxy-config`) storing to `bybit_p2p_proxy_token` and `bybit_p2p_proxy_url`.

### 1.2 Test Execution Output
Command: `node test/run-tests.js --suite=security`
```
======================================================
  Bybit NGN P2P Trade Tracker — E2E Test Suite Runner
======================================================
Filtering Suite: security

▶ [Tier 1] Tier 1 — R1: API Proxy Security & Token Authorization
  ✔ R1.1: Server source code defines and validates API proxy security token middleware (1ms)
  ✔ R1.2: Unauthenticated request to /api/balance returns 401 Unauthorized (236ms)
  ✔ R1.3: Unauthenticated request to /api/orders returns 401 Unauthorized (3ms)
  ✔ R1.4: Unauthenticated request to /api/ads returns 401 Unauthorized (3ms)
  ✔ R1.5: Unauthenticated request to /api/market-depth returns 401 Unauthorized (2ms)
  ✔ R1.6: Valid token header is recognized and allows request processing (1ms)
  ✔ R1.7: Frontend bybitService supports passing authorization credentials to proxy (3ms)

▶ [Tier 2] Tier 2 — R1: Boundary & Corner Cases (API Security)
  ✔ R1-B.1: Empty and whitespace-only authorization headers are rejected (0ms)
  ✔ R1-B.2: Non-Bearer schemes (e.g. Basic, Digest) without valid secret are rejected (0ms)
  ✔ R1-B.3: OPTIONS pre-flight requests bypass auth and return status 200 (1ms)
  ✔ R1-B.4: Tokens with complex special characters and unicode validate correctly (0ms)
  ✔ R1-B.5: Unauthorized rejection responses return standardized JSON error payload (0ms)

------------------------------------------------------
Test Execution Summary:
Total Tests : 12
Passed      : 12
Failed      : 0
Duration    : 257ms

Tier Breakdown:
  Tier 1  : 7/7 passed (100.0%)
  Tier 2  : 5/5 passed (100.0%)
======================================================
```

Full Test Suite (`node test/run-tests.js`):
- Total Tests: 63 | Passed: 58 | Failed: 5
- The only 5 failing tests belong strictly to unstarted future milestones (M4: R4.1 RefID search in `history.js`; M5: R5.1, R5.2, T3.6, T4.4 Service Worker manifest in `sw.js`).
- 0 regressions were introduced in existing features or accounting logic.

---

## 2. Logic Chain

1. **Contract Compliance**: The specifications in `ORIGINAL_REQUEST.md § R1` and `PROJECT.md § Interface Contracts (1)` require:
   - Direct unauthenticated requests to `/api/balance`, `/api/orders`, `/api/ads`, `/api/market-depth` must return `401 Unauthorized`.
   - `/api/status` remains accessible and returns `authRequired: boolean`.
   - Support for `Authorization: Bearer <token>`, `x-proxy-token`, `x-api-token`, `?token=`, and body token.
   - Frontend persistence via `localStorage.getItem('bybit_p2p_proxy_token')`.
   Observations 1.1 confirm that both `server.js` and `api/*.js` conform exactly to this contract.

2. **Integrity & Authenticity Check**:
   - Source inspection proves that `verifyToken` performs real byte-by-byte timing-safe comparisons via `crypto.timingSafeEqual`.
   - No mock return shortcuts, bypass flags, or hardcoded dummy values were introduced.
   - The test assertions execute real requests against the route handlers and mock HTTP objects, verifying actual status code and payload outputs.

3. **Adversarial Stress Testing & Attack Vectors**:
   - *Attack 1: Timing Side-Channel*: Tested length mismatch and character-by-character discrepancies. `crypto.timingSafeEqual` prevents response time variance leaks.
   - *Attack 2: Header Spoofing / Malformed Schemes*: `Authorization: Basic ...`, `Authorization: Digest ...`, and empty `Bearer ` tokens are properly rejected.
   - *Attack 3: CORS / Browser Preflight Block*: `OPTIONS` preflight requests are caught early and return HTTP 200 with all required access headers before auth evaluation, avoiding browser CORS blocks.
   - *Attack 4: Unicode / Complex Passwords*: Tokens with UTF-8 characters and symbols are handled without Buffer encoding errors.

4. **Integration & Error Handling**:
   - `js/bybitService.js` transmits authorization headers across all endpoints.
   - 401 Unauthorized responses trigger clear and actionable error messages directing users to the Settings tab.
   - `js/views/settings.view.js` provides user-friendly password input fields with toggle visibility and persistence.

---

## 3. Caveats

- The 5 failures in the full test runner (`node test/run-tests.js`) are expected pre-existing gaps in unstarted milestones M4 (RefID search in history) and M5 (PWA pre-cache manifest in `sw.js`).
- Live Bybit API requests still require valid Bybit API credentials in the environment (`BYBIT_API_KEY`, `BYBIT_API_SECRET`). If proxy credentials are valid but Bybit credentials are missing, the proxy responds with 500 configuration errors as expected.
- No other caveats.

---

## 4. Conclusion

- **Verdict**: **APPROVE**
- Milestone 1 (R1: API Proxy Security & Token Authorization) satisfies all functional requirements, security constraints, and acceptance criteria with 0 regressions and high implementation quality.

---

## 5. Verification Method

To independently verify this evaluation:
1. Run the security suite:
   ```bash
   node test/run-tests.js --suite=security
   ```
   *Expected Result*: 12/12 passing tests across Tier 1 and Tier 2.

2. Run the full test suite to check for regressions:
   ```bash
   node test/run-tests.js
   ```
   *Expected Result*: 58/63 tests passing (with 5 failures exclusively in M4 and M5).

3. Inspect files:
   - `server.js` (lines 25–103, 190–195)
   - `api/_bybit.js` (lines 67–155)
   - `api/balance.js`, `api/orders.js`, `api/ads.js`, `api/market-depth.js`, `api/status.js`
   - `js/bybitService.js` (lines 33–50, 79–85, 117–123, 147–153, 175–181)
   - `js/views/settings.view.js` (lines 83–111)

4. Invalidation Condition: Any unauthenticated request to `/api/balance`, `/api/orders`, `/api/ads`, or `/api/market-depth` returning 200 OK without a valid token.
