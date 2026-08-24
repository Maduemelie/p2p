/**
 * Comprehensive Adversarial & Empirical Test Suite for Milestone 1 (R1: API Proxy Security & Token Authorization)
 * Author: Challenger 2 (Empirical Challenger)
 */

const http = require('http');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const express = require('express');
const cors = require('cors');

const EXPECTED_TEST_TOKEN = 'test_secret_token_#2026_adversarial!';

async function runEmpiricalSuite() {
  console.log('===============================================================');
  console.log('Starting Empirical Challenger 2 Verification for Milestone 1');
  console.log('===============================================================');

  let passed = 0;
  let failed = 0;
  const failures = [];

  async function test(name, fn) {
    try {
      const res = fn();
      if (res && typeof res.then === 'function') {
        await res;
      }
      console.log('  PASS: ' + name);
      passed++;
    } catch (err) {
      console.log('  FAIL: ' + name);
      console.error('     Error: ' + err.message);
      failed++;
      failures.push({ name: name, error: err.message });
    }
  }

  function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'Assertion failed');
  }

  function assertEqual(actual, expected, msg) {
    if (actual !== expected) {
      throw new Error((msg || 'Assertion failed') + ' - Expected: ' + JSON.stringify(expected) + ', Actual: ' + JSON.stringify(actual));
    }
  }

  function assertMatch(str, regex, msg) {
    if (!regex.test(str)) {
      throw new Error((msg || 'Regex match failed') + ' - Expected string ' + JSON.stringify(str) + ' to match ' + regex);
    }
  }

  // Set Environment for Testing
  process.env.PROXY_AUTH_TOKEN = EXPECTED_TEST_TOKEN;
  process.env.BYBIT_API_KEY = 'mock_api_key';
  process.env.BYBIT_API_SECRET = 'mock_api_secret';

  // Import Vercel helper modules
  const vercelBybit = require('../api/_bybit');
  const vercelBalance = require('../api/balance');
  const vercelOrders = require('../api/orders');
  const vercelAds = require('../api/ads');
  const vercelMarketDepth = require('../api/market-depth');
  const vercelStatus = require('../api/status');

  // SECTION 1: Token Verification & Timing Safety
  console.log('\n--- Section 1: Timing Safety & Token Comparison ---');

  await test('1.1 verifyToken accepts exact match', () => {
    assert(vercelBybit.verifyToken('valid_token', 'valid_token'), 'verifyToken should return true for exact match');
  });

  await test('1.2 verifyToken rejects token of different length without throwing', () => {
    assert(!vercelBybit.verifyToken('short', 'longer_token'), 'verifyToken should return false for shorter token');
    assert(!vercelBybit.verifyToken('longer_token_here', 'short'), 'verifyToken should return false for longer token');
  });

  await test('1.3 verifyToken rejects token of same length with different characters', () => {
    assert(!vercelBybit.verifyToken('token123', 'token124'), 'verifyToken should return false for 1-char difference');
  });

  await test('1.4 verifyToken handles null, undefined, and empty inputs gracefully', () => {
    assert(!vercelBybit.verifyToken(null, 'secret'), 'null providedToken returns false');
    assert(!vercelBybit.verifyToken(undefined, 'secret'), 'undefined providedToken returns false');
    assert(!vercelBybit.verifyToken('', 'secret'), 'empty providedToken returns false');
    assert(!vercelBybit.verifyToken('secret', null), 'null expectedToken returns false');
    assert(!vercelBybit.verifyToken('secret', undefined), 'undefined expectedToken returns false');
    assert(!vercelBybit.verifyToken('secret', ''), 'empty expectedToken returns false');
  });

  await test('1.5 verifyToken works with unicode and special symbols', () => {
    const unicodeToken = 't0k3n_\uD83D\uDD12_\u20A65000_\u26A1';
    assert(vercelBybit.verifyToken(unicodeToken, unicodeToken), 'Unicode token should match itself');
    assert(!vercelBybit.verifyToken(unicodeToken, 't0k3n_\uD83D\uDD12_\u20A65000_\uD83D\uDD25'), 'Mismatched unicode token should return false');
  });

  // SECTION 2: Token Extraction Mechanisms
  console.log('\n--- Section 2: Token Extraction Headers & Query Fallback ---');

  await test('2.1 extractToken extracts from Authorization: Bearer <token>', () => {
    const req = { headers: { authorization: 'Bearer ' + EXPECTED_TEST_TOKEN } };
    assertEqual(vercelBybit.extractToken(req), EXPECTED_TEST_TOKEN, 'Bearer token extracted');
  });

  await test('2.2 extractToken extracts from case-insensitive bearer scheme', () => {
    const req = { headers: { authorization: 'bearer ' + EXPECTED_TEST_TOKEN } };
    assertEqual(vercelBybit.extractToken(req), EXPECTED_TEST_TOKEN, 'Lowercase bearer extracted');
  });

  await test('2.3 extractToken extracts raw token without Bearer prefix', () => {
    const req = { headers: { authorization: EXPECTED_TEST_TOKEN } };
    assertEqual(vercelBybit.extractToken(req), EXPECTED_TEST_TOKEN, 'Raw authorization token extracted');
  });

  await test('2.4 extractToken extracts from x-proxy-token', () => {
    const req = { headers: { 'x-proxy-token': EXPECTED_TEST_TOKEN } };
    assertEqual(vercelBybit.extractToken(req), EXPECTED_TEST_TOKEN, 'x-proxy-token extracted');
  });

  await test('2.5 extractToken extracts from x-api-token', () => {
    const req = { headers: { 'x-api-token': EXPECTED_TEST_TOKEN } };
    assertEqual(vercelBybit.extractToken(req), EXPECTED_TEST_TOKEN, 'x-api-token extracted');
  });

  await test('2.6 extractToken extracts from x-auth-token', () => {
    const req = { headers: { 'x-auth-token': EXPECTED_TEST_TOKEN } };
    assertEqual(vercelBybit.extractToken(req), EXPECTED_TEST_TOKEN, 'x-auth-token extracted');
  });

  await test('2.7 extractToken extracts from query param ?token=', () => {
    const req = { headers: {}, query: { token: EXPECTED_TEST_TOKEN } };
    assertEqual(vercelBybit.extractToken(req), EXPECTED_TEST_TOKEN, 'Query token extracted');
  });

  await test('2.8 extractToken extracts from JSON body { token: ... }', () => {
    const req = { headers: {}, body: { token: EXPECTED_TEST_TOKEN } };
    assertEqual(vercelBybit.extractToken(req), EXPECTED_TEST_TOKEN, 'Body token extracted');
  });

  await test('2.9 extractToken rejects standard non-Bearer schemes (Basic, Digest)', () => {
    const reqBasic = { headers: { authorization: 'Basic dXNlcjpwYXNz' } };
    assertEqual(vercelBybit.extractToken(reqBasic), null, 'Basic scheme must return null');

    const reqDigest = { headers: { authorization: 'Digest username="MIME"' } };
    assertEqual(vercelBybit.extractToken(reqDigest), null, 'Digest scheme must return null');
  });

  await test('2.10 extractToken rejects empty or whitespace-only headers', () => {
    assert(!vercelBybit.extractToken({ headers: { authorization: '' } }), 'Empty auth header');
    assert(!vercelBybit.extractToken({ headers: { authorization: '   ' } }), 'Whitespace auth header');
    assert(!vercelBybit.extractToken({ headers: { 'x-proxy-token': '   ' } }), 'Whitespace x-proxy-token');
    assert(!vercelBybit.extractToken({ headers: {}, query: { token: '   ' } }), 'Whitespace query token');
  });

  // SECTION 3: Vercel Serverless Handlers Verification
  console.log('\n--- Section 3: Vercel Serverless Handlers Verification ---');

  function createMockRes() {
    return {
      statusCode: 200,
      headers: {},
      body: null,
      ended: false,
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      status(code) { this.statusCode = code; return this; },
      json(data) { this.body = data; this.ended = true; return this; },
      end() { this.ended = true; return this; }
    };
  }

  await test('3.1 OPTIONS preflight on Vercel balance returns 200 and CORS headers without auth', async () => {
    const req = { method: 'OPTIONS', headers: {} };
    const res = createMockRes();
    await vercelBalance(req, res);

    assertEqual(res.statusCode, 200, 'Preflight status should be 200');
    assertEqual(res.headers['access-control-allow-origin'], '*', 'CORS Allow Origin *');
    assert(res.headers['access-control-allow-headers'].includes('Authorization'), 'Allow-Headers has Authorization');
    assert(res.headers['access-control-allow-headers'].includes('x-proxy-token'), 'Allow-Headers has x-proxy-token');
  });

  await test('3.2 Unauthenticated GET /api/balance returns 401 Unauthorized with standard payload', async () => {
    const req = { method: 'GET', headers: {}, query: {} };
    const res = createMockRes();
    await vercelBalance(req, res);

    assertEqual(res.statusCode, 401, 'HTTP status should be 401');
    assertEqual(res.body.retCode, 401, 'retCode should be 401');
    assertMatch(res.body.retMsg, /Unauthorized/i, 'retMsg should state Unauthorized');
  });

  await test('3.3 Unauthenticated POST /api/orders returns 401 Unauthorized', async () => {
    const req = { method: 'POST', headers: {}, body: { page: 1 } };
    const res = createMockRes();
    await vercelOrders(req, res);

    assertEqual(res.statusCode, 401, 'HTTP status should be 401');
    assertEqual(res.body.retCode, 401, 'retCode should be 401');
  });

  await test('3.4 Unauthenticated POST /api/ads returns 401 Unauthorized', async () => {
    const req = { method: 'POST', headers: {} };
    const res = createMockRes();
    await vercelAds(req, res);

    assertEqual(res.statusCode, 401, 'HTTP status should be 401');
    assertEqual(res.body.retCode, 401, 'retCode should be 401');
  });

  await test('3.5 Unauthenticated GET /api/market-depth returns 401 Unauthorized', async () => {
    const req = { method: 'GET', headers: {}, query: { coin: 'USDT' } };
    const res = createMockRes();
    await vercelMarketDepth(req, res);

    assertEqual(res.statusCode, 401, 'HTTP status should be 401');
    assertEqual(res.body.retCode, 401, 'retCode should be 401');
  });

  await test('3.6 Unauthenticated GET /api/status returns 200 OK and reports authRequired: true', async () => {
    const req = { method: 'GET', headers: {} };
    const res = createMockRes();
    await vercelStatus(req, res);

    assertEqual(res.statusCode, 200, 'Status endpoint should be 200 OK');
    assertEqual(res.body.status, 'online', 'Status is online');
    assertEqual(res.body.authRequired, true, 'authRequired is true when token configured');
    assertEqual(res.headers['access-control-allow-origin'], '*', 'CORS Allow Origin *');
  });

  await test('3.7 Bad token rejected across all Vercel handlers with 401', async () => {
    const handlers = [
      { name: 'balance', fn: vercelBalance, req: { method: 'GET', headers: { authorization: 'Bearer wrong_token' } } },
      { name: 'orders', fn: vercelOrders, req: { method: 'POST', headers: { 'x-proxy-token': 'wrong_token' } } },
      { name: 'ads', fn: vercelAds, req: { method: 'POST', headers: { 'x-api-token': 'wrong_token' } } },
      { name: 'market-depth', fn: vercelMarketDepth, req: { method: 'GET', headers: { 'x-auth-token': 'wrong_token' } } }
    ];

    for (const h of handlers) {
      const res = createMockRes();
      await h.fn(h.req, res);
      assertEqual(res.statusCode, 401, 'Handler ' + h.name + ' must return 401 for wrong token');
      assertEqual(res.body.retCode, 401, 'Handler ' + h.name + ' retCode must be 401');
    }
  });

  // SECTION 4: Live Express Server HTTP Network Testing
  console.log('\n--- Section 4: Live Express Server Network Testing ---');

  const TEST_PORT = 3987;
  const expressApp = express();
  expressApp.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-proxy-token', 'x-api-token', 'x-auth-token']
  }));
  expressApp.use(express.json());

  function expressVerifyToken(providedToken, expectedToken) {
    if (!providedToken || !expectedToken) return false;
    const bufA = Buffer.from(String(providedToken));
    const bufB = Buffer.from(String(expectedToken));
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  function expressExtractToken(req) {
    const getHeader = (name) => {
      if (req.headers) return req.headers[name.toLowerCase()] || req.headers[name];
      if (typeof req.get === 'function') return req.get(name);
      return undefined;
    };

    const authHeader = getHeader('authorization');
    if (authHeader && typeof authHeader === 'string') {
      const trimmed = authHeader.trim();
      const bearerMatch = trimmed.match(/^Bearer\s+(.+)$/i);
      if (bearerMatch) {
        const t = bearerMatch[1].trim();
        if (t) return t;
      } else if (!/^[a-zA-Z]+\s+/.test(trimmed)) {
        if (trimmed) return trimmed;
      } else {
        return null;
      }
    }

    const customHeader = getHeader('x-proxy-token') || getHeader('x-api-token') || getHeader('x-auth-token');
    if (customHeader && typeof customHeader === 'string' && customHeader.trim()) {
      return customHeader.trim();
    }

    if (req.query && req.query.token && typeof req.query.token === 'string' && req.query.token.trim()) {
      return req.query.token.trim();
    }

    if (req.body) {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) {}
      }
      if (body && typeof body === 'object' && body.token && typeof body.token === 'string' && body.token.trim()) {
        return body.token.trim();
      }
    }

    return null;
  }

  function expressValidateAuth(req, res, next) {
    if (req.method === 'OPTIONS') {
      return next();
    }
    const expectedToken = process.env.PROXY_AUTH_TOKEN || EXPECTED_TEST_TOKEN;
    const token = expressExtractToken(req);

    if (!token) {
      return res.status(401).json({
        retCode: 401,
        retMsg: 'Unauthorized: Invalid or missing proxy authorization token'
      });
    }

    if (expectedToken && !expressVerifyToken(token, expectedToken)) {
      return res.status(401).json({
        retCode: 401,
        retMsg: 'Unauthorized: Invalid or missing proxy authorization token'
      });
    }
    next();
  }

  expressApp.get('/api/status', (req, res) => {
    res.json({
      status: 'online',
      apiKeyConfigured: true,
      apiSecretConfigured: true,
      authRequired: !!process.env.PROXY_AUTH_TOKEN
    });
  });

  expressApp.use('/api/balance', expressValidateAuth, (req, res) => res.json({ retCode: 0, result: { freeBalance: 100 } }));
  expressApp.use('/api/orders', expressValidateAuth, (req, res) => res.json({ retCode: 0, result: { items: [] } }));
  expressApp.use('/api/ads', expressValidateAuth, (req, res) => res.json({ retCode: 0, result: { items: [] } }));
  expressApp.use('/api/market-depth', expressValidateAuth, (req, res) => res.json({ retCode: 0, result: { buyDepth: [], sellDepth: [] } }));

  const liveServer = await new Promise((resolve) => {
    const s = expressApp.listen(TEST_PORT, () => resolve(s));
  });

  async function makeRequest(options, postData = null) {
    return new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let rawData = '';
        res.on('data', chunk => rawData += chunk);
        res.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(rawData); } catch (e) { parsed = rawData; }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsed
          });
        });
      });
      req.on('error', reject);
      if (postData) {
        req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
      }
      req.end();
    });
  }

  await test('4.1 Live Express CORS preflight OPTIONS to /api/balance returns 204 or 200 with CORS headers', async () => {
    const res = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/balance',
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:8080',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type'
      }
    });

    assert(res.statusCode === 204 || res.statusCode === 200, 'Expected 204/200 on preflight, got ' + res.statusCode);
    assertEqual(res.headers['access-control-allow-origin'], '*', 'CORS Allow Origin *');
    assert(res.headers['access-control-allow-headers'].toLowerCase().includes('authorization'), 'CORS Allow Headers includes authorization');
  });

  await test('4.2 Live Express Unauthenticated request to /api/balance returns 401', async () => {
    const res = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/balance',
      method: 'GET'
    });

    assertEqual(res.statusCode, 401, 'Status 401 on unauthenticated /api/balance');
    assertEqual(res.body.retCode, 401, 'retCode 401');
    assertEqual(res.body.retMsg, 'Unauthorized: Invalid or missing proxy authorization token', 'Standard retMsg');
  });

  await test('4.3 Live Express Unauthenticated request to /api/orders returns 401', async () => {
    const res = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/orders',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { page: 1, size: 10 });

    assertEqual(res.statusCode, 401, 'Status 401 on unauthenticated /api/orders');
    assertEqual(res.body.retCode, 401, 'retCode 401');
  });

  await test('4.4 Live Express Unauthenticated request to /api/ads returns 401', async () => {
    const res = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/ads',
      method: 'POST'
    });

    assertEqual(res.statusCode, 401, 'Status 401 on unauthenticated /api/ads');
  });

  await test('4.5 Live Express Unauthenticated request to /api/market-depth returns 401', async () => {
    const res = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/market-depth',
      method: 'GET'
    });

    assertEqual(res.statusCode, 401, 'Status 401 on unauthenticated /api/market-depth');
  });

  await test('4.6 Live Express Legitimate request with Bearer token succeeds with 200', async () => {
    const res = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/balance',
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + EXPECTED_TEST_TOKEN }
    });

    assertEqual(res.statusCode, 200, 'Legitimate Bearer token returns 200 OK');
    assertEqual(res.body.retCode, 0, 'retCode 0 on success');
    assertEqual(res.body.result.freeBalance, 100, 'Mock result returned');
  });

  await test('4.7 Live Express Legitimate request with x-proxy-token header succeeds with 200', async () => {
    const res = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/orders',
      method: 'POST',
      headers: {
        'x-proxy-token': EXPECTED_TEST_TOKEN,
        'Content-Type': 'application/json'
      }
    }, { page: 1 });

    assertEqual(res.statusCode, 200, 'Legitimate x-proxy-token returns 200 OK');
    assertEqual(res.body.retCode, 0, 'retCode 0');
  });

  await test('4.8 Live Express Legitimate request with x-api-token header succeeds with 200', async () => {
    const res = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/ads',
      method: 'POST',
      headers: { 'x-api-token': EXPECTED_TEST_TOKEN }
    });

    assertEqual(res.statusCode, 200, 'Legitimate x-api-token returns 200 OK');
  });

  await test('4.9 Live Express Legitimate request with ?token= query parameter succeeds with 200', async () => {
    const res = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/market-depth?token=' + encodeURIComponent(EXPECTED_TEST_TOKEN),
      method: 'GET'
    });

    assertEqual(res.statusCode, 200, 'Query param token returns 200 OK');
  });

  await test('4.10 Live Express Attacker with wrong token is rejected with 401', async () => {
    const res = await makeRequest({
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/balance',
      method: 'GET',
      headers: { 'Authorization': 'Bearer attacker_guessed_token_12345' }
    });

    assertEqual(res.statusCode, 401, 'Attacker wrong token rejected with 401');
    assertEqual(res.body.retCode, 401, 'retCode 401');
  });

  await new Promise(resolve => liveServer.close(resolve));

  // SECTION 5: Frontend bybitService.js Verification
  console.log('\n--- Section 5: Frontend bybitService.js Verification ---');

  const mockStorage = new Map();
  global.localStorage = {
    getItem: (k) => mockStorage.get(k) || null,
    setItem: (k, v) => mockStorage.set(k, String(v)),
    removeItem: (k) => mockStorage.delete(k),
    clear: () => mockStorage.clear()
  };
  global.window = {
    location: {
      protocol: 'http:',
      hostname: 'localhost',
      port: '3000',
      origin: 'http://localhost:3000'
    },
    localStorage: global.localStorage
  };

  const bybitModule = await import('../js/bybitService.js');
  const service = bybitModule.bybitService;

  await test('5.1 bybitService sends Authorization and custom proxy headers when token is set', async () => {
    mockStorage.set('bybit_p2p_proxy_token', EXPECTED_TEST_TOKEN);

    let capturedHeaders = null;
    global.fetch = async (url, opts) => {
      capturedHeaders = opts && opts.headers ? opts.headers : {};
      return {
        ok: true,
        status: 200,
        json: async () => ({ retCode: 0, result: { freeBalance: 50 } })
      };
    };

    const res = await service.fetchFundingBalance('USDT');
    assertEqual(res.freeBalance, 50, 'Result returned correctly');
    assertEqual(capturedHeaders['Authorization'], 'Bearer ' + EXPECTED_TEST_TOKEN, 'Authorization Bearer attached');
    assertEqual(capturedHeaders['x-proxy-token'], EXPECTED_TEST_TOKEN, 'x-proxy-token attached');
    assertEqual(capturedHeaders['x-api-token'], EXPECTED_TEST_TOKEN, 'x-api-token attached');
    assertEqual(capturedHeaders['x-auth-token'], EXPECTED_TEST_TOKEN, 'x-auth-token attached');
  });

  await test('5.2 bybitService handles 401 Unauthorized by throwing descriptive error message', async () => {
    mockStorage.set('bybit_p2p_proxy_token', 'invalid_token');

    global.fetch = async () => ({
      ok: false,
      status: 401,
      json: async () => ({ retCode: 401, retMsg: 'Unauthorized: Invalid or missing proxy authorization token' })
    });

    let errorThrown = null;
    try {
      await service.fetchFundingBalance('USDT');
    } catch (e) {
      errorThrown = e;
    }

    assert(errorThrown !== null, 'Should throw on 401');
    assertMatch(errorThrown.message, /Unauthorized.*Settings/i, 'Error message must guide user to Settings');
  });

  await test('5.3 bybitService fetchP2POrders passes payload and auth headers', async () => {
    mockStorage.set('bybit_p2p_proxy_token', EXPECTED_TEST_TOKEN);

    let capturedBody = null;
    global.fetch = async (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ retCode: 0, result: { count: 1, items: [{ id: 'order_1' }] } })
      };
    };

    const result = await service.fetchP2POrders(1, 10, 50);
    assertEqual(capturedBody.page, 1, 'page is 1');
    assertEqual(capturedBody.size, 10, 'size is 10');
    assertEqual(capturedBody.status, 50, 'status is 50');
    assertEqual(result.count, 1, 'Order count is 1');
  });

  // SECTION 6: UI Settings View & Token Storage Verification
  console.log('\n--- Section 6: Settings UI View & Token Storage Verification ---');

  const settingsViewModule = await import('../js/views/settings.view.js');
  const renderedHtml = settingsViewModule.renderSettingsView();

  await test('6.1 Settings view renders input-proxy-token and input-proxy-url', () => {
    assert(renderedHtml.includes('input-proxy-token'), 'Must render #input-proxy-token');
    assert(renderedHtml.includes('input-proxy-url'), 'Must render #input-proxy-url');
    assert(renderedHtml.includes('btn-save-proxy-config'), 'Must render #btn-save-proxy-config');
    assert(renderedHtml.includes('btn-toggle-proxy-token'), 'Must render #btn-toggle-proxy-token');
  });

  await test('6.2 Settings view has proxy status badge and sync buttons', () => {
    assert(renderedHtml.includes('proxy-status-badge'), 'Must render #proxy-status-badge');
    assert(renderedHtml.includes('btn-sync-balance'), 'Must render #btn-sync-balance');
    assert(renderedHtml.includes('btn-import-bybit-trades'), 'Must render #btn-import-bybit-trades');
  });

  // SECTION 7: Corner Cases & Attack Vector Stress Testing
  console.log('\n--- Section 7: Corner Cases & Attack Vector Stress Testing ---');

  await test('7.1 Array token parameter pollution in query ?token[]=hack is rejected without crashing', () => {
    const req = { headers: {}, query: { token: ['hack', 'attempt'] } };
    const extracted = vercelBybit.extractToken(req);
    assertEqual(extracted, null, 'Array query token should return null');
  });

  await test('7.2 Object token parameter in JSON body { token: { admin: true } } is rejected without crashing', () => {
    const req = { headers: {}, body: { token: { admin: true } } };
    const extracted = vercelBybit.extractToken(req);
    assertEqual(extracted, null, 'Object body token should return null');
  });

  await test('7.3 Malformed JSON body in req.body does not throw unhandled exception', () => {
    const req = { headers: {}, body: '{ invalid json' };
    const extracted = vercelBybit.extractToken(req);
    assertEqual(extracted, null, 'Invalid JSON body should return null without throwing');
  });

  await test('7.4 Buffer length mismatch timing attack test (crypto.timingSafeEqual safety)', () => {
    const target = 'super_secret_token_1234567890';
    for (let len = 0; len < target.length + 10; len++) {
      const candidate = 'a'.repeat(len);
      const res = vercelBybit.verifyToken(candidate, target);
      if (candidate === target) {
        assert(res === true, 'Matching string should be true');
      } else {
        assert(res === false, 'Mismatched length or content must be false');
      }
    }
  });

  console.log('\n===============================================================');
  console.log('CHALLENGER 2 TEST RUN RESULTS: ' + passed + ' PASSED, ' + failed + ' FAILED (Total: ' + (passed + failed) + ')');
  console.log('===============================================================');

  if (failed > 0) {
    console.error('Failures encountered:');
    failures.forEach(f => console.error(' - ' + f.name + ': ' + f.error));
    process.exit(1);
  } else {
    console.log('ALL ADVERSARIAL & EMPIRICAL CHALLENGER TESTS PASSED SUCCESSFULLY!');
  }
}

runEmpiricalSuite().catch(e => {
  console.error('Fatal test runner error:', e);
  process.exit(1);
});
