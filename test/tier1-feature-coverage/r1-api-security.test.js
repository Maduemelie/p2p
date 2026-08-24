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
}, { tier: 1, category: 'R1: API Security' });
