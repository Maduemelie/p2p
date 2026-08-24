# Milestone 1 Review & Adversarial Critic Handoff Report

## 1. Observation

- **Reviewed Code Files**:
  - `server.js` (lines 10-14, 25-103, 178-195):
    - Added CORS configuration allowing `['Content-Type', 'Authorization', 'x-proxy-token', 'x-api-token', 'x-auth-token']`.
    - Implemented `verifyToken(providedToken, expectedToken)` with `Buffer.from(String(providedToken))` and `crypto.timingSafeEqual(bufA, bufB)`.
    - Implemented `extractToken(req)` supporting `Authorization: Bearer <token>`, raw authorization tokens (ignoring non-Bearer auth schemes like `Basic`), `x-proxy-token`, `x-api-token`, `x-auth-token`, query parameter `?token=`, and JSON body `{ token: ... }`.
    - Implemented `validateAuth` middleware and mounted on `/api/balance`, `/api/orders`, `/api/ads`, `/api/market-depth`.
    - Updated `/api/status` to return `{ status: 'online', testnet, candidates, apiKeyConfigured, apiSecretConfigured, authRequired }`.
  - `api/_bybit.js` (lines 67-166):
    - Exported `verifyToken`, `extractToken`, `verifyAuth` mirroring `server.js` security semantics for Vercel serverless functions.
    - Configured CORS headers: `Access-Control-Allow-Headers: Content-Type, Authorization, x-proxy-token, x-api-token, x-auth-token`.
    - Implemented `verifyAuth(req, res)` returning HTTP `401` and payload `{ retCode: 401, retMsg: "Unauthorized: Invalid or missing proxy authorization token" }` when unauthenticated.
  - `api/balance.js` (line 4), `api/orders.js` (line 4), `api/ads.js` (line 4), `api/market-depth.js` (line 4):
    - All routes enforce `if (!verifyAuth(req, res)) return;` at entry before performing Bybit OpenAPI requests.
  - `api/status.js` (lines 4-21):
    - Unprotected status probe with CORS headers exposing `authRequired: !!currentProxyToken`.
  - `js/bybitService.js` (lines 33-49, 51-192):
    - Added `getAuthHeaders(customHeaders)` reading `localStorage.getItem('bybit_p2p_proxy_token')` and setting `Authorization: Bearer <token>`, `x-proxy-token`, `x-api-token`, `x-auth-token`.
    - Added `getAuthHeaders()` to `checkStatus()`, `fetchFundingBalance()`, `fetchP2POrders()`, `fetchActiveAds()`, and `fetchMarketDepth()`.
    - Standardized 401 response handling throwing informative error: `"Unauthorized: Invalid or missing proxy authorization token. Please configure your Proxy Auth Token in Settings."`.
  - `js/views/settings.view.js` (lines 83-111):
    - Added Proxy URL (`#input-proxy-url`) and Proxy Auth Token (`#input-proxy-token`) fields with show/hide password visibility toggle (`#btn-toggle-proxy-token`) and `localStorage` persistence.
- **Integrity Inspection**:
  - Searched for hardcoded test secrets (`p2p_secure_test_token_2026`, `secret_token_#9928_xyz`) in production code; 0 instances found in `server.js` or `api/`.
  - Verified no dummy/facade implementations exist; actual cryptographic verification and Bybit proxying are executed.
- **Test Suite Execution**:
  - `node test/run-tests.js --suite=security`: 12/12 passed (100% pass rate, 603ms duration).
    - Tier 1 (R1.1 to R1.7): 7/7 passed.
    - Tier 2 (R1-B.1 to R1-B.5): 5/5 passed.
  - `node test/run-tests.js`: 58/63 passed. The 5 non-passing tests are strictly isolated to unstarted future milestones (M4: R4.1 RefId search in `js/history.js`; M5: R5.1, R5.2, T3.6, T4.4 Service Worker manifest pre-caching in `sw.js`). Zero regressions in any security or core accounting logic.

## 2. Logic Chain

1. **Requirement Mapping**: `ORIGINAL_REQUEST.md` §R1 and `PROJECT.md` §1 specify that `/api/balance`, `/api/orders`, `/api/ads`, and `/api/market-depth` must require token authorization and return HTTP 401 when unauthenticated, while `/api/status` remains accessible.
2. **Timing Attack Protection**: As observed in `server.js:25-31` and `api/_bybit.js:69-75`, `verifyToken` uses `crypto.timingSafeEqual` over buffers constructed from input strings. Length difference check prevents buffer length mismatch errors while token content comparison runs in constant time.
3. **CORS Alignment**: Both `server.js` (lines 10-14) and `api/_bybit.js` (lines 125-127) explicitly declare `Authorization`, `x-proxy-token`, `x-api-token`, `x-auth-token` in `Access-Control-Allow-Headers` and respond to `OPTIONS` preflight requests with 200 OK before token validation.
4. **Token Extraction Robustness**: `extractToken` handles multiple channels (Bearer header, raw token, custom headers, query param, request body) while rejecting empty whitespace and non-Bearer auth schemes (such as `Basic`).
5. **Frontend Client Integration**: `bybitService.js` injects all authorization headers automatically from `localStorage` (`bybit_p2p_proxy_token`) and maps 401 HTTP statuses into helpful UI feedback. The Settings view provides direct credential management.
6. **Integrity & Verification**: All tests in the security suite pass without hardcoded shortcuts.

## 3. Caveats

- **Network-level length timing**: Constant-time equality is enforced when token lengths match. Buffer length inequality returns `false` without comparison. In an HTTP network environment, packet jitter dominates any sub-microsecond length check differences.
- **Milestone 4 and Milestone 5 tests**: The full test runner (`node test/run-tests.js`) shows 5 failures which belong entirely to Milestone 4 (`history.js` search) and Milestone 5 (`sw.js` precache manifest). These are outside Milestone 1 scope and correctly left for their respective milestones.

## 4. Conclusion

- **Verdict**: **APPROVE**
- The Milestone 1 implementation for API Proxy Security & Token Authorization satisfies all security requirements, architectural contracts, and acceptance criteria.

## 5. Verification Method

- **Security Test Suite**:
  ```powershell
  node test/run-tests.js --suite=security
  ```
  Expected output: 12/12 tests passing across Tier 1 and Tier 2.
- **Full Test Suite (Regression Check)**:
  ```powershell
  node test/run-tests.js
  ```
  Expected output: 58/63 tests passing (only M4 & M5 tests failing).
- **Files to Inspect**:
  - `server.js` (lines 25-103, 190-195)
  - `api/_bybit.js` (lines 67-166)
  - `api/balance.js`, `api/orders.js`, `api/ads.js`, `api/market-depth.js`
  - `js/bybitService.js` (lines 33-49)
  - `js/views/settings.view.js` (lines 83-111)

---

## Review Summary

**Verdict**: APPROVE

### Findings
- **Positive Finding 1 (Security - Timing Attack Resistance)**: `crypto.timingSafeEqual` with byte buffer length validation correctly prevents timing attacks on token comparison.
- **Positive Finding 2 (CORS & Serverless Parity)**: Consistent CORS headers and OPTIONS pre-flight handling across both Express (`server.js`) and Vercel serverless (`api/_bybit.js`).
- **Positive Finding 3 (Multi-channel Token Extraction)**: Supports `Authorization: Bearer`, custom headers (`x-proxy-token`, `x-api-token`, `x-auth-token`), query params, and JSON body.
- **Positive Finding 4 (Error Ergonomics)**: Clean HTTP 401 response with `{ retCode: 401, retMsg: ... }` and frontend exception messages guiding user to Settings tab.

### Verified Claims
- `verifyToken` uses constant-time comparison → verified via `view_file` on `server.js:25` and `api/_bybit.js:69` → PASS
- Direct unauthenticated requests to proxy endpoints return 401 Unauthorized → verified via test runner `R1.2`, `R1.3`, `R1.4`, `R1.5` → PASS
- OPTIONS preflight bypasses auth and returns 200 → verified via `R1-B.3` → PASS
- Empty and whitespace tokens rejected → verified via `R1-B.1` → PASS
- Frontend `bybitService` attaches auth headers → verified via `view_file` on `js/bybitService.js:33` and test `R1.7` → PASS
- Settings view allows entering and persisting proxy credentials → verified via `view_file` on `js/views/settings.view.js:83` → PASS

### Coverage Gaps
- None for Milestone 1 scope.

### Unverified Items
- None.

---

## Adversarial Challenge Report

**Overall risk assessment**: LOW

### Challenges & Stress-Tests
1. **Challenge 1: Non-Bearer Authorization Schemes**:
   - *Attack Scenario*: Attacker sends `Authorization: Basic user:pass` or `Authorization: Digest ...`.
   - *Result*: `extractToken` regex checks `/^[a-zA-Z]+\s+/` and returns `null`, preventing scheme pollution.
2. **Challenge 2: Whitespace Token Injection**:
   - *Attack Scenario*: Attacker sends `Authorization: Bearer     `.
   - *Result*: Regex extraction trims token to `""` which evaluates to falsey and is rejected with 401.
3. **Challenge 3: CORS Preflight Bypass**:
   - *Attack Scenario*: Attacker tries to make preflight OPTIONS request without token to see if it executes proxy logic.
   - *Result*: OPTIONS handler terminates immediately at preflight without triggering Bybit API execution.
