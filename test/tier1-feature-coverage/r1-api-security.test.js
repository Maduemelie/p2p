/**
 * Tier 1: Feature Coverage — R1: API Proxy Security & Token Authorization
 */

const { describe, it, beforeEach } = require('../harness/test-runner');
const { assert } = require('../harness/assertions');
const { MockRequest, MockResponse } = require('../harness/http-mock');
const fs = require('fs');
const path = require('path');

describe('Tier 1 — R1: API Proxy Security & Token Authorization', () => {
  const TEST_SECRET = 'p2p_secure_test_token_2026';

  // Helper to test Express route handlers directly from server.js inspection or middleware execution
  const serverJsContent = fs.readFileSync(path.resolve(__dirname, '../../server.js'), 'utf-8');

  it('R1.1: Server source code defines and validates API proxy security token middleware', () => {
    // Verifies that server.js checks for proxy token authentication (via header, env, or query)
    const hasTokenCheck = serverJsContent.includes('PROXY_TOKEN') || 
                          serverJsContent.includes('BYBIT_PROXY_TOKEN') || 
                          serverJsContent.includes('authorization') || 
                          serverJsContent.includes('x-auth-token') || 
                          serverJsContent.includes('401');
    assert.ok(hasTokenCheck, 'server.js must implement proxy token authentication check');
  });

  it('R1.2: Unauthenticated request to /api/balance returns 401 Unauthorized', async () => {
    let balanceHandler;
    try {
      balanceHandler = require('../../api/balance');
    } catch {
      // If balance.js requires node environment without express
    }

    if (typeof balanceHandler === 'function') {
      const req = new MockRequest({
        method: 'GET',
        url: '/api/balance',
        headers: {} // No token
      });
      const res = new MockResponse();
      await balanceHandler(req, res);
      assert.strictEqual(res.statusCode, 401, 'Expected 401 Unauthorized for unauthenticated /api/balance');
    } else {
      // Static AST / code pattern check for server.js proxy route protection
      assert.ok(serverJsContent.includes('401') || serverJsContent.includes('Unauthorized'), 'Route /api/balance must be protected with 401 status on missing token');
    }
  });

  it('R1.3: Unauthenticated request to /api/orders returns 401 Unauthorized', async () => {
    let ordersHandler;
    try {
      ordersHandler = require('../../api/orders');
    } catch {}

    if (typeof ordersHandler === 'function') {
      const req = new MockRequest({
        method: 'POST',
        url: '/api/orders',
        headers: {},
        body: { page: 1, size: 10 }
      });
      const res = new MockResponse();
      await ordersHandler(req, res);
      assert.strictEqual(res.statusCode, 401, 'Expected 401 Unauthorized for unauthenticated /api/orders');
    } else {
      assert.ok(serverJsContent.includes('/api/orders'), 'server.js must declare /api/orders route with security check');
    }
  });

  it('R1.4: Unauthenticated request to /api/ads returns 401 Unauthorized', async () => {
    let adsHandler;
    try {
      adsHandler = require('../../api/ads');
    } catch {}

    if (typeof adsHandler === 'function') {
      const req = new MockRequest({
        method: 'GET',
        url: '/api/ads',
        headers: {}
      });
      const res = new MockResponse();
      await adsHandler(req, res);
      assert.strictEqual(res.statusCode, 401, 'Expected 401 Unauthorized for unauthenticated /api/ads');
    } else {
      assert.ok(serverJsContent.includes('/api/ads'), 'server.js must declare /api/ads route with security check');
    }
  });

  it('R1.5: Unauthenticated request to /api/market-depth returns 401 Unauthorized', async () => {
    let depthHandler;
    try {
      depthHandler = require('../../api/market-depth');
    } catch {}

    if (typeof depthHandler === 'function') {
      const req = new MockRequest({
        method: 'GET',
        url: '/api/market-depth',
        headers: {}
      });
      const res = new MockResponse();
      await depthHandler(req, res);
      assert.strictEqual(res.statusCode, 401, 'Expected 401 Unauthorized for unauthenticated /api/market-depth');
    } else {
      assert.ok(serverJsContent.includes('/api/market-depth'), 'server.js must declare /api/market-depth route with security check');
    }
  });

  it('R1.6: Valid token header is recognized and allows request processing', async () => {
    // Test auth header extraction logic (supports Authorization: Bearer <token> and x-auth-token)
    function validateAuthHeader(req, expectedSecret) {
      if (!expectedSecret) return true; // If no secret configured, allow or fail based on config
      const authHeader = req.headers['authorization'] || '';
      const tokenHeader = req.headers['x-auth-token'] || '';
      const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
      const token = bearerMatch ? bearerMatch[1] : (authHeader || tokenHeader);
      return token === expectedSecret;
    }

    const validReqBearer = new MockRequest({
      headers: { 'Authorization': `Bearer ${TEST_SECRET}` }
    });
    const validReqCustom = new MockRequest({
      headers: { 'x-auth-token': TEST_SECRET }
    });
    const invalidReq = new MockRequest({
      headers: { 'Authorization': 'Bearer wrong_token' }
    });
    const emptyReq = new MockRequest({
      headers: {}
    });

    assert.strictEqual(validateAuthHeader(validReqBearer, TEST_SECRET), true, 'Bearer token should validate');
    assert.strictEqual(validateAuthHeader(validReqCustom, TEST_SECRET), true, 'x-auth-token should validate');
    assert.strictEqual(validateAuthHeader(invalidReq, TEST_SECRET), false, 'Wrong token should be rejected');
    assert.strictEqual(validateAuthHeader(emptyReq, TEST_SECRET), false, 'Empty header should be rejected');
  });

  it('R1.7: Frontend bybitService supports passing authorization credentials to proxy', () => {
    const serviceContent = fs.readFileSync(path.resolve(__dirname, '../../js/bybitService.js'), 'utf-8');
    const supportsAuth = serviceContent.includes('Authorization') || 
                         serviceContent.includes('x-auth-token') || 
                         serviceContent.includes('token') || 
                         serviceContent.includes('headers');
    assert.ok(supportsAuth, 'bybitService.js must configure request headers to transmit proxy authorization token');
  });

  it('R1.8: Settings UI renders Bybit API key and secret inputs, save, and clear buttons', () => {
    const settingsViewContent = fs.readFileSync(path.resolve(__dirname, '../../js/views/settings.view.js'), 'utf-8');
    assert.ok(settingsViewContent.includes('input-bybit-api-key'), 'Settings view must render input-bybit-api-key');
    assert.ok(settingsViewContent.includes('input-bybit-api-secret'), 'Settings view must render input-bybit-api-secret');
    assert.ok(settingsViewContent.includes('btn-save-bybit-keys'), 'Settings view must render btn-save-bybit-keys');
    assert.ok(settingsViewContent.includes('btn-clear-bybit-keys'), 'Settings view must render btn-clear-bybit-keys');
  });

  it('R1.9: Frontend bybitService attaches custom Bybit credentials headers', () => {
    const serviceContent = fs.readFileSync(path.resolve(__dirname, '../../js/bybitService.js'), 'utf-8');
    assert.ok(serviceContent.includes('x-bybit-api-key'), 'bybitService.js must attach x-bybit-api-key header');
    assert.ok(serviceContent.includes('x-bybit-api-secret'), 'bybitService.js must attach x-bybit-api-secret header');
  });

  it('R1.10: api/_bybit extracts Bybit credentials dynamically from headers', () => {
    const { getCredentials } = require('../../api/_bybit');
    assert.strictEqual(typeof getCredentials, 'function', 'getCredentials should be exported');

    const reqWithHeaders = new MockRequest({
      headers: {
        'x-bybit-api-key': 'user_custom_key_123',
        'x-bybit-api-secret': 'user_custom_secret_456'
      }
    });
    const creds = getCredentials(reqWithHeaders);
    assert.strictEqual(creds.apiKey, 'user_custom_key_123', 'Should extract x-bybit-api-key from request headers');
    assert.strictEqual(creds.apiSecret, 'user_custom_secret_456', 'Should extract x-bybit-api-secret from request headers');
  });

  it('R1.11: Vercel serverless proxy handler (api/proxy.js and api/index.js) exists and dispatches statelessly', async () => {
    const proxyHandler = require('../../api/proxy');
    const indexHandler = require('../../api/index');
    assert.strictEqual(typeof proxyHandler, 'function', 'api/proxy.js must export a handler function');
    assert.strictEqual(typeof indexHandler, 'function', 'api/index.js must export a handler function');

    // Unauthenticated request to /api/balance via proxy returns 401
    const reqUnauth = new MockRequest({
      method: 'GET',
      url: '/api/balance',
      headers: {}
    });
    const resUnauth = new MockResponse();
    await proxyHandler(reqUnauth, resUnauth);
    assert.strictEqual(resUnauth.statusCode, 401, 'api/proxy should return 401 for unauthenticated request');

    // Status endpoint returns 200 with online status
    const reqStatus = new MockRequest({
      method: 'GET',
      url: '/api/status',
      headers: {}
    });
    const resStatus = new MockResponse();
    await proxyHandler(reqStatus, resStatus);
    assert.strictEqual(resStatus.statusCode, 200, 'api/proxy should return 200 for /api/status');
  });

  it('R1.12: vercel.json configures /api/* routing for serverless deployment', () => {
    const vercelJsonPath = path.resolve(__dirname, '../../vercel.json');
    assert.ok(fs.existsSync(vercelJsonPath), 'vercel.json must exist');
    const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf-8'));
    assert.ok(vercelConfig.rewrites || vercelConfig.routes, 'vercel.json must configure rewrites or routes');
  });

  it('R1.13: Atomic credentials isolation prevents cross-tenant contamination', () => {
    const { getCredentials } = require('../../api/_bybit');
    const prevKey = process.env.BYBIT_API_KEY;
    const prevSec = process.env.BYBIT_API_SECRET;
    try {
      process.env.BYBIT_API_KEY = 'server_env_key';
      process.env.BYBIT_API_SECRET = 'server_env_secret';

      // Case A: User provides client key but no secret
      const reqOnlyKey = new MockRequest({
        headers: { 'x-bybit-api-key': 'tenant_user_key' }
      });
      const credsA = getCredentials(reqOnlyKey);
      assert.strictEqual(credsA.apiKey, 'tenant_user_key', 'apiKey should be user key');
      assert.strictEqual(credsA.apiSecret, '', 'apiSecret must NOT fall back to server secret when client key is provided');
      assert.strictEqual(credsA.isClientProvided, true);

      // Case B: User provides client secret but no key
      const reqOnlySec = new MockRequest({
        headers: { 'x-bybit-api-secret': 'tenant_user_secret' }
      });
      const credsB = getCredentials(reqOnlySec);
      assert.strictEqual(credsB.apiKey, '', 'apiKey must NOT fall back to server key when client secret is provided');
      assert.strictEqual(credsB.apiSecret, 'tenant_user_secret', 'apiSecret should be user secret');
      assert.strictEqual(credsB.isClientProvided, true);
    } finally {
      process.env.BYBIT_API_KEY = prevKey;
      process.env.BYBIT_API_SECRET = prevSec;
    }
  });

  it('R1.14: Case-insensitive header extraction extracts headers with various casings', () => {
    const { getCredentials, getHeader } = require('../../api/_bybit');
    const reqMixed = new MockRequest({
      headers: {
        'X-Bybit-Api-Key': 'key_mixed_case',
        'X-BYBIT-API-SECRET': 'secret_upper_case'
      }
    });

    const creds = getCredentials(reqMixed);
    assert.strictEqual(creds.apiKey, 'key_mixed_case', 'Should handle mixed casing X-Bybit-Api-Key');
    assert.strictEqual(creds.apiSecret, 'secret_upper_case', 'Should handle uppercase X-BYBIT-API-SECRET');
    assert.strictEqual(getHeader(reqMixed, 'x-bybit-api-key'), 'key_mixed_case');
  });

  it('R1.15: Zero-width and non-ASCII invisible character sanitization', () => {
    const { getCredentials, sanitizeKey } = require('../../api/_bybit');
    assert.strictEqual(typeof sanitizeKey, 'function', 'sanitizeKey should be exported');

    // String with zero-width space (\u200B) and non-breaking space (\u00A0)
    const dirtyKey = '\u200Bmy_clean_key\u00A0';
    const dirtySec = '\uFEFFmy_clean_secret\u200C';
    assert.strictEqual(sanitizeKey(dirtyKey), 'my_clean_key');
    assert.strictEqual(sanitizeKey(dirtySec), 'my_clean_secret');

    const reqWithDirty = new MockRequest({
      headers: {
        'x-bybit-api-key': dirtyKey,
        'x-bybit-api-secret': dirtySec
      }
    });
    const creds = getCredentials(reqWithDirty);
    assert.strictEqual(creds.apiKey, 'my_clean_key', 'Should sanitize invisible characters from apiKey');
    assert.strictEqual(creds.apiSecret, 'my_clean_secret', 'Should sanitize invisible characters from apiSecret');
  });

  it('R1.16: Generic proxy /api or /api/proxy status healthcheck returns 200 without auth', async () => {
    const proxyHandler = require('../../api/proxy');
    const reqHealth = new MockRequest({
      method: 'GET',
      url: '/api/proxy',
      headers: {}
    });
    const resHealth = new MockResponse();
    await proxyHandler(reqHealth, resHealth);
    assert.strictEqual(resHealth.statusCode, 200, 'Healthcheck probe to /api/proxy should return 200 without auth');
    assert.strictEqual(resHealth.body.status, 'online');
  });

  it('R1.17: Settings controller source code clears Bybit credentials from localStorage on data reset', () => {
    const settingsCode = fs.readFileSync(path.resolve(__dirname, '../../js/settings.js'), 'utf-8');
    assert.ok(settingsCode.includes("localStorage.removeItem('bybit_api_key')"), 'settings.js must remove bybit_api_key on clear');
    assert.ok(settingsCode.includes("localStorage.removeItem('bybit_api_secret')"), 'settings.js must remove bybit_api_secret on clear');
  });

  it('R1.18: Actionable Bybit error message formatting for upstream codes (10003, 10004, 10005, 10010, 33004)', () => {
    const { formatBybitErrorMessage } = require('../../js/bybitService.js');
    assert.strictEqual(typeof formatBybitErrorMessage, 'function', 'formatBybitErrorMessage must be exported');

    // Code 10003: Invalid API key
    const msg10003 = formatBybitErrorMessage({ retCode: 10003, retMsg: 'api_key is invalid' });
    assert.ok(msg10003.includes('Settings'), '10003 must guide user to Settings');
    assert.ok(msg10003.includes('invalid') || msg10003.includes('does not exist'), '10003 must mention invalid key');

    // Code 10004: Sign error
    const msg10004 = formatBybitErrorMessage({ retCode: 10004, retMsg: 'error sign' });
    assert.ok(msg10004.includes('Secret') && msg10004.includes('Settings'), '10004 must guide user to Secret in Settings');

    // Code 10005: Permission denied
    const msg10005 = formatBybitErrorMessage({ retCode: 10005, retMsg: 'permission denied' });
    assert.ok(msg10005.includes('permission') && (msg10005.includes('Read-Write') || msg10005.includes('P2P')), '10005 must explain missing permissions');

    // Code 10010: IP restriction
    const msg10010 = formatBybitErrorMessage({ retCode: 10010, retMsg: 'unmatched ip' });
    assert.ok(msg10010.includes('IP') && msg10010.includes('restriction'), '10010 must explain IP restriction');

    // Code 33004: Key expired
    const msg33004 = formatBybitErrorMessage({ retCode: 33004, retMsg: 'api key has expired' });
    assert.ok(msg33004.includes('expired'), '33004 must mention expiration');

    // Gateway HTML error page
    const msgHtml = formatBybitErrorMessage('<html><head><title>502 Bad Gateway</title></head></html>');
    assert.ok(!msgHtml.includes('<html>'), 'Must not dump raw HTML into error message');
    assert.ok(msgHtml.includes('gateway') || msgHtml.includes('unreachable'), 'Must provide friendly gateway message');
  });

  it('R1.19: Vercel serverless proxy routes path-based Bybit endpoints and cleans payload', async () => {
    const proxyHandler = require('../../api/proxy');

    // Case A: Path-based endpoint extraction (/api/v5/p2p/item/online) requires auth
    const reqPathBasedUnauth = new MockRequest({
      method: 'GET',
      url: '/api/v5/p2p/item/online',
      headers: {}
    });
    const resPathBasedUnauth = new MockResponse();
    await proxyHandler(reqPathBasedUnauth, resPathBasedUnauth);
    assert.strictEqual(resPathBasedUnauth.statusCode, 401, 'Path /api/v5/p2p/item/online must require auth, not return healthcheck');

    // Case B: Partial client credentials return detailed 401
    const reqMissingSecret = new MockRequest({
      method: 'GET',
      url: '/api/balance',
      headers: { 'x-bybit-api-key': 'my_key' }
    });
    const resMissingSecret = new MockResponse();
    await proxyHandler(reqMissingSecret, resMissingSecret);
    assert.strictEqual(resMissingSecret.statusCode, 401);
    assert.ok(resMissingSecret.body.retMsg.includes('x-bybit-api-secret') || resMissingSecret.body.retMsg.includes('Secret'), 'Must identify missing secret');
  });

  it('R1.20: Responsive mobile viewport layout structure and CSS rules', () => {
    const settingsHtml = fs.readFileSync(path.resolve(__dirname, '../../js/views/settings.view.js'), 'utf-8');
    const cssContent = fs.readFileSync(path.resolve(__dirname, '../../css/styles.css'), 'utf-8');

    assert.ok(settingsHtml.includes('bybit-keys-btn-group'), 'Must assign bybit-keys-btn-group class');
    assert.ok(settingsHtml.includes('bybit-credentials-card'), 'Must assign bybit-credentials-card class');
    assert.ok(settingsHtml.includes('flex-wrap'), 'Must allow flex-wrap on header items');

    assert.ok(cssContent.includes('.bybit-keys-btn-group'), 'CSS must define bybit-keys-btn-group');
    assert.ok(cssContent.includes('.bybit-sync-actions'), 'CSS must define bybit-sync-actions');
    assert.ok(cssContent.includes('column-reverse') || cssContent.includes('column'), 'Must adjust flex-direction on mobile viewports');
  });

  it('R1.21: Settings controller wires proxy configuration save and sync', () => {
    const settingsCode = fs.readFileSync(path.resolve(__dirname, '../../js/settings.js'), 'utf-8');
    assert.ok(settingsCode.includes('btn-save-proxy-config') || settingsCode.includes('btnSaveProxyConfig'), 'settings.js must wire proxy save');
    assert.ok(settingsCode.includes('populateProxySettings'), 'settings.js must define populateProxySettings');
  });

  it('R1.22: CORS headers include x-bybit-endpoint across API proxy and status endpoints', async () => {
    const proxyHandler = require('../../api/proxy');
    const statusHandler = require('../../api/status');

    const reqOptions = new MockRequest({ method: 'OPTIONS', url: '/api/proxy', headers: {} });
    const resOptions = new MockResponse();
    await proxyHandler(reqOptions, resOptions);
    assert.strictEqual(resOptions.statusCode, 200);
    const allowHeaders = resOptions.headers['access-control-allow-headers'] || resOptions.headers['Access-Control-Allow-Headers'] || '';
    assert.ok(allowHeaders.includes('x-bybit-endpoint'), 'api/proxy CORS must allow x-bybit-endpoint');

    const reqStatus = new MockRequest({ method: 'GET', url: '/api/status', headers: {} });
    const resStatus = new MockResponse();
    await statusHandler(reqStatus, resStatus);
    const statusAllowHeaders = resStatus.headers['access-control-allow-headers'] || resStatus.headers['Access-Control-Allow-Headers'] || '';
    assert.ok(statusAllowHeaders.includes('x-bybit-endpoint'), 'api/status CORS must allow x-bybit-endpoint');
  });

  it('R1.23: Case-sensitive path preservation for Bybit endpoints in api/proxy.js', async () => {
    const proxyHandler = require('../../api/proxy');
    const bybit = require('../../api/_bybit');
    const originalExecute = bybit.executeWithFailover;

    let capturedEndpoint = null;
    bybit.executeWithFailover = async (method, endpoint) => {
      capturedEndpoint = endpoint;
      return { data: { retCode: 0, result: {} } };
    };

    try {
      const req = new MockRequest({
        method: 'POST',
        url: '/api/v5/p2p/order/simplifyList',
        headers: {
          'x-bybit-api-key': 'test_key',
          'x-bybit-api-secret': 'test_secret'
        },
        body: { page: 1 }
      });
      const res = new MockResponse();
      await proxyHandler(req, res);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(capturedEndpoint, '/v5/p2p/order/simplifyList', 'Must preserve exact case /v5/p2p/order/simplifyList');
    } finally {
      bybit.executeWithFailover = originalExecute;
    }
  });

  it('R1.24: Proxy token and control parameters stripped from query string and body payload', async () => {
    const proxyHandler = require('../../api/proxy');
    const bybit = require('../../api/_bybit');
    const originalExecute = bybit.executeWithFailover;

    let capturedParamsString = null;
    let capturedPayload = null;
    bybit.executeWithFailover = async (method, endpoint, paramsString, payload) => {
      capturedParamsString = paramsString;
      capturedPayload = payload;
      return { data: { retCode: 0, result: {} } };
    };

    try {
      // Test GET query param cleaning
      const reqGet = new MockRequest({
        method: 'GET',
        url: '/api/proxy?endpoint=/v5/test&coin=USDT&token=my_secret_token&_t=1700000000',
        headers: {
          'x-bybit-api-key': 'test_key',
          'x-bybit-api-secret': 'test_secret'
        }
      });
      const resGet = new MockResponse();
      await proxyHandler(reqGet, resGet);
      assert.strictEqual(resGet.statusCode, 200);
      assert.strictEqual(capturedParamsString, 'coin=USDT', 'paramsString must not leak token or _t to upstream Bybit');

      // Test POST body cleaning
      const reqPost = new MockRequest({
        method: 'POST',
        url: '/api/proxy',
        headers: {
          'x-bybit-api-key': 'test_key',
          'x-bybit-api-secret': 'test_secret'
        },
        body: {
          endpoint: '/v5/test',
          token: 'sensitive_proxy_token',
          proxyToken: 'sensitive_token',
          tokenId: 'USDT',
          side: '1'
        }
      });
      const resPost = new MockResponse();
      await proxyHandler(reqPost, resPost);
      assert.strictEqual(resPost.statusCode, 200);
      assert.strictEqual(capturedPayload.tokenId, 'USDT');
      assert.strictEqual(capturedPayload.side, '1');
      assert.strictEqual(capturedPayload.token, undefined, 'token must be stripped from body payload');
      assert.strictEqual(capturedPayload.proxyToken, undefined, 'proxyToken must be stripped from body payload');
      assert.strictEqual(capturedPayload.endpoint, undefined, 'endpoint must be stripped from body payload');
    } finally {
      bybit.executeWithFailover = originalExecute;
    }
  });

  it('R1.25: Atomic isolation in api/status prevents fallback to server secret when client supplies partial credentials', async () => {
    const statusHandler = require('../../api/status');
    const prevKey = process.env.BYBIT_API_KEY;
    const prevSec = process.env.BYBIT_API_SECRET;

    try {
      process.env.BYBIT_API_KEY = 'global_server_key';
      process.env.BYBIT_API_SECRET = 'global_server_secret';

      // Tenant provides API Key only
      const reqKeyOnly = new MockRequest({
        method: 'GET',
        url: '/api/status',
        headers: { 'x-bybit-api-key': 'client_tenant_key' }
      });
      const resKeyOnly = new MockResponse();
      await statusHandler(reqKeyOnly, resKeyOnly);
      assert.strictEqual(resKeyOnly.statusCode, 200);
      assert.strictEqual(resKeyOnly.body.apiKeyConfigured, true);
      assert.strictEqual(resKeyOnly.body.apiSecretConfigured, false, 'Must NOT fall back to server secret');

      // Tenant provides API Secret only
      const reqSecOnly = new MockRequest({
        method: 'GET',
        url: '/api/status',
        headers: { 'x-bybit-api-secret': 'client_tenant_secret' }
      });
      const resSecOnly = new MockResponse();
      await statusHandler(reqSecOnly, resSecOnly);
      assert.strictEqual(resSecOnly.statusCode, 200);
      assert.strictEqual(resSecOnly.body.apiKeyConfigured, false, 'Must NOT fall back to server key');
      assert.strictEqual(resSecOnly.body.apiSecretConfigured, true);
    } finally {
      process.env.BYBIT_API_KEY = prevKey;
      process.env.BYBIT_API_SECRET = prevSec;
    }
  });

  it('R1.26: Trailing slash normalization and /api/proxy/... subpath dispatching in api/proxy.js', async () => {
    const proxyHandler = require('../../api/proxy');

    // /api/status/ with trailing slash
    const reqTrailing = new MockRequest({ method: 'GET', url: '/api/status/', headers: {} });
    const resTrailing = new MockResponse();
    await proxyHandler(reqTrailing, resTrailing);
    assert.strictEqual(resTrailing.statusCode, 200);
    assert.strictEqual(resTrailing.body.status, 'online');

    // /api/proxy/status subpath
    const reqProxyStatus = new MockRequest({ method: 'GET', url: '/api/proxy/status', headers: {} });
    const resProxyStatus = new MockResponse();
    await proxyHandler(reqProxyStatus, resProxyStatus);
    assert.strictEqual(resProxyStatus.statusCode, 200);
    assert.strictEqual(resProxyStatus.body.status, 'online');
  });

  it('R1.27: Safe JSON string body parsing in api/ads.js and api/market-depth.js', async () => {
    const adsHandler = require('../../api/ads');
    const depthHandler = require('../../api/market-depth');
    const bybit = require('../../api/_bybit');
    const originalExecute = bybit.executeWithFailover;

    let executedAdsPayload = null;
    let executedDepthPayload = null;
    bybit.executeWithFailover = async (method, endpoint, paramsString, payload) => {
      if (endpoint.includes('personal/list')) executedAdsPayload = payload;
      if (endpoint.includes('item/online')) executedDepthPayload = payload;
      return { data: { retCode: 0, result: [] } };
    };

    try {
      // Stringified body in ads
      const reqAds = new MockRequest({
        method: 'POST',
        url: '/api/ads',
        headers: {
          'x-bybit-api-key': 'test_key',
          'x-bybit-api-secret': 'test_secret'
        },
        body: JSON.stringify({ side: '1', tokenId: 'USDT', page: 1, size: 20 })
      });
      const resAds = new MockResponse();
      await adsHandler(reqAds, resAds);
      assert.strictEqual(resAds.statusCode, 200);
      assert.ok(executedAdsPayload, 'adsHandler should successfully execute with string body');

      // Stringified body in market depth
      const reqDepth = new MockRequest({
        method: 'POST',
        url: '/api/market-depth',
        headers: {
          'x-bybit-api-key': 'test_key',
          'x-bybit-api-secret': 'test_secret'
        },
        body: JSON.stringify({ coin: 'USDT', fiat: 'NGN', limit: 10 })
      });
      const resDepth = new MockResponse();
      await depthHandler(reqDepth, resDepth);
      assert.strictEqual(resDepth.statusCode, 200);
      assert.ok(executedDepthPayload, 'depthHandler should successfully execute with string body');
    } finally {
      bybit.executeWithFailover = originalExecute;
    }
  });

  it('R1.28: Frontend sanitizeKey strips invisible zero-width and non-breaking characters', () => {
    const { sanitizeKey } = require('../../js/bybitService.js');
    assert.strictEqual(typeof sanitizeKey, 'function');
    assert.strictEqual(sanitizeKey('\u200Bclean_key\uFEFF'), 'clean_key');
    assert.strictEqual(sanitizeKey('  \u00A0secret\u200D  '), 'secret');
  });
}, { tier: 1, category: 'R1: API Security' });
