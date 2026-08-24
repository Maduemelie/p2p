/**
 * Adversarial Stress Test Suite for Milestone 1 (R1: API Proxy Security & Token Authorization)
 * Executed by Challenger 1
 */

const { describe, it } = require('./harness/test-runner');
const { assert } = require('./harness/assertions');
const { MockRequest, MockResponse } = require('./harness/http-mock');
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

// Load target modules under test
const vercelHelper = require('../api/_bybit');
const balanceHandler = require('../api/balance');
const ordersHandler = require('../api/orders');
const adsHandler = require('../api/ads');
const depthHandler = require('../api/market-depth');
const statusHandler = require('../api/status');

describe('Challenger 1: Adversarial Stress Testing — R1 Security & Token Auth', () => {
  const TEST_SECRET = 'Super_Secret_Proxy_Token_#2026!@$';

  // Setup test environment
  process.env.PROXY_AUTH_TOKEN = TEST_SECRET;

  // -------------------------------------------------------------
  // 1. UNIT TESTING: verifyToken & extractToken in api/_bybit.js
  // -------------------------------------------------------------
  describe('1. Unit Verification: verifyToken & extractToken (_bybit.js)', () => {
    it('1.1: Exact token match returns true', () => {
      assert.strictEqual(vercelHelper.verifyToken(TEST_SECRET, TEST_SECRET), true);
    });

    it('1.2: Mismatched tokens of same length return false', () => {
      const wrong = 'X'.repeat(TEST_SECRET.length);
      assert.strictEqual(vercelHelper.verifyToken(wrong, TEST_SECRET), false);
    });

    it('1.3: Mismatched tokens of different lengths return false', () => {
      assert.strictEqual(vercelHelper.verifyToken('short', TEST_SECRET), false);
      assert.strictEqual(vercelHelper.verifyToken(TEST_SECRET + '_extra', TEST_SECRET), false);
      assert.strictEqual(vercelHelper.verifyToken('', TEST_SECRET), false);
    });

    it('1.4: Non-string / null / undefined tokens return false gracefully without crash', () => {
      assert.strictEqual(vercelHelper.verifyToken(null, TEST_SECRET), false);
      assert.strictEqual(vercelHelper.verifyToken(undefined, TEST_SECRET), false);
      assert.strictEqual(vercelHelper.verifyToken(12345, TEST_SECRET), false);
      assert.strictEqual(vercelHelper.verifyToken({}, TEST_SECRET), false);
      assert.strictEqual(vercelHelper.verifyToken([], TEST_SECRET), false);
      assert.strictEqual(vercelHelper.verifyToken(TEST_SECRET, null), false);
      assert.strictEqual(vercelHelper.verifyToken(TEST_SECRET, undefined), false);
    });

    it('1.5: Unicode & multibyte characters match accurately', () => {
      const unicodeSecret = '🔑_P2P_Naira_₦_2026_🚀_спасибо_你好';
      assert.strictEqual(vercelHelper.verifyToken(unicodeSecret, unicodeSecret), true);
      assert.strictEqual(vercelHelper.verifyToken(unicodeSecret + 'x', unicodeSecret), false);
    });

    it('1.6: Very long tokens (100,000 chars) are processed safely and in constant time', () => {
      const longSecret = 'A'.repeat(100000);
      assert.strictEqual(vercelHelper.verifyToken(longSecret, longSecret), true);
      assert.strictEqual(vercelHelper.verifyToken(longSecret + 'B', longSecret), false);
    });

    it('1.7: Extract token supports standard Bearer prefix variations', () => {
      const variations = [
        `Bearer ${TEST_SECRET}`,
        `bearer ${TEST_SECRET}`,
        `BEARER ${TEST_SECRET}`,
        `Bearer   ${TEST_SECRET}   `,
        `bearer\t${TEST_SECRET}`
      ];

      variations.forEach(val => {
        const req = new MockRequest({ headers: { 'authorization': val } });
        assert.strictEqual(vercelHelper.extractToken(req), TEST_SECRET, `Failed for variation: ${val}`);
      });
    });

    it('1.8: Extract token supports raw token in Authorization header', () => {
      const req = new MockRequest({ headers: { 'authorization': TEST_SECRET } });
      assert.strictEqual(vercelHelper.extractToken(req), TEST_SECRET);
    });

    it('1.9: Extract token handling of non-Bearer schemes', () => {
      // Basic auth should be rejected / returned null
      const basicReq = new MockRequest({ headers: { 'authorization': 'Basic dXNlcjpwYXNz' } });
      assert.strictEqual(vercelHelper.extractToken(basicReq), null);

      // Digest auth should be rejected / returned null
      const digestReq = new MockRequest({ headers: { 'authorization': 'Digest username="MIME", realm="test"' } });
      assert.strictEqual(vercelHelper.extractToken(digestReq), null);
    });

    it('1.10: Extract token rejects empty / whitespace-only Authorization headers', () => {
      const empties = ['', '   ', 'Bearer ', 'Bearer    ', 'Bearer\t\n'];
      empties.forEach(val => {
        const req = new MockRequest({ headers: { 'authorization': val } });
        assert.strictEqual(vercelHelper.extractToken(req), null, `Should return null for: "${val}"`);
      });
    });

    it('1.11: Extract token supports custom headers (x-proxy-token, x-api-token, x-auth-token) with case insensitivity', () => {
      const headerNames = [
        'x-proxy-token',
        'X-Proxy-Token',
        'X-PROXY-TOKEN',
        'x-api-token',
        'X-Api-Token',
        'x-auth-token',
        'X-Auth-Token'
      ];
      headerNames.forEach(name => {
        const req = new MockRequest({ headers: { [name]: TEST_SECRET } });
        assert.strictEqual(vercelHelper.extractToken(req), TEST_SECRET, `Failed for header: ${name}`);
      });
    });

    it('1.12: Extract token supports query parameter fallback ?token=', () => {
      const req = new MockRequest({ url: `/?token=${TEST_SECRET}`, query: { token: TEST_SECRET } });
      assert.strictEqual(vercelHelper.extractToken(req), TEST_SECRET);

      const reqEmpty = new MockRequest({ url: '/?token=', query: { token: '' } });
      assert.strictEqual(vercelHelper.extractToken(reqEmpty), null);

      const reqSpaces = new MockRequest({ url: '/?token=   ', query: { token: '   ' } });
      assert.strictEqual(vercelHelper.extractToken(reqSpaces), null);
    });

    it('1.13: Extract token supports JSON body token fallback', () => {
      const reqObj = new MockRequest({ body: { token: TEST_SECRET } });
      assert.strictEqual(vercelHelper.extractToken(reqObj), TEST_SECRET);

      const reqStr = new MockRequest({ body: JSON.stringify({ token: TEST_SECRET }) });
      assert.strictEqual(vercelHelper.extractToken(reqStr), TEST_SECRET);

      const reqEmpty = new MockRequest({ body: { token: '   ' } });
      assert.strictEqual(vercelHelper.extractToken(reqEmpty), null);

      const reqInvalidBody = new MockRequest({ body: 'NOT_JSON' });
      assert.strictEqual(vercelHelper.extractToken(reqInvalidBody), null);
    });
  });

  // -------------------------------------------------------------
  // 2. SERVERLESS HANDLER TESTING: 4 Protected Endpoints + Status
  // -------------------------------------------------------------
  describe('2. Serverless Handlers Verification (api/*.js)', () => {
    const protectedEndpoints = [
      { name: '/api/balance', handler: balanceHandler, method: 'GET' },
      { name: '/api/orders', handler: ordersHandler, method: 'POST' },
      { name: '/api/ads', handler: adsHandler, method: 'POST' },
      { name: '/api/market-depth', handler: depthHandler, method: 'GET' }
    ];

    protectedEndpoints.forEach(({ name, handler, method }) => {
      it(`2.1: ${name} strictly returns 401 on missing token`, async () => {
        const req = new MockRequest({ method, url: name, headers: {} });
        const res = new MockResponse();
        await handler(req, res);

        assert.strictEqual(res.statusCode, 401, `${name} must return 401 when no token provided`);
        assert.strictEqual(res.body.retCode, 401);
        assert.ok(res.body.retMsg.includes('Unauthorized'), 'Response message must state Unauthorized');
      });

      it(`2.2: ${name} strictly returns 401 on wrong token`, async () => {
        const req = new MockRequest({
          method,
          url: name,
          headers: { 'Authorization': 'Bearer wrong_token_attempt' }
        });
        const res = new MockResponse();
        await handler(req, res);

        assert.strictEqual(res.statusCode, 401, `${name} must return 401 for wrong token`);
        assert.strictEqual(res.body.retCode, 401);
      });

      it(`2.3: ${name} strictly returns 401 on empty / whitespace token`, async () => {
        const req = new MockRequest({
          method,
          url: name,
          headers: { 'x-proxy-token': '    ' }
        });
        const res = new MockResponse();
        await handler(req, res);

        assert.strictEqual(res.statusCode, 401, `${name} must return 401 for whitespace token`);
        assert.strictEqual(res.body.retCode, 401);
      });

      it(`2.4: ${name} allows OPTIONS preflight with status 200 and CORS headers`, async () => {
        const req = new MockRequest({ method: 'OPTIONS', url: name });
        const res = new MockResponse();
        await handler(req, res);

        assert.strictEqual(res.statusCode, 200, `${name} OPTIONS must return 200 OK`);
        assert.strictEqual(res.getHeader('access-control-allow-origin'), '*');
        assert.ok(res.getHeader('access-control-allow-headers').includes('Authorization'));
        assert.ok(res.getHeader('access-control-allow-headers').includes('x-proxy-token'));
      });
    });

    it('2.5: /api/status does not require authorization and correctly reports authRequired: true', async () => {
      const req = new MockRequest({ method: 'GET', url: '/api/status', headers: {} });
      const res = new MockResponse();
      await statusHandler(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.status, 'online');
      assert.strictEqual(res.body.authRequired, true, 'status endpoint must report authRequired as true');
    });
  });

  // -------------------------------------------------------------
  // 3. LIVE EXPRESS SERVER TESTING (server.js via Child Process)
  // -------------------------------------------------------------
  describe('3. Live Express Server Verification (server.js)', () => {
    let serverProcess = null;
    const testPort = 3999;
    const serverUrl = `http://127.0.0.1:${testPort}`;

    function makeHttpRequest(urlPath, options = {}) {
      return new Promise((resolve, reject) => {
        const url = new URL(urlPath, serverUrl);
        const reqOptions = {
          method: options.method || 'GET',
          headers: options.headers || {}
        };

        const req = http.request(url, reqOptions, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            let json = null;
            try { json = JSON.parse(body); } catch (e) {}
            resolve({ statusCode: res.statusCode, headers: res.headers, body: json || body });
          });
        });

        req.on('error', reject);
        if (options.body) {
          req.write(typeof options.body === 'object' ? JSON.stringify(options.body) : options.body);
        }
        req.end();
      });
    }

    it('3.1: Live server.js enforces 401 across all 4 proxy endpoints and allows valid tokens & CORS preflights', async () => {
      // Spawn server.js on custom testPort
      const serverScript = path.resolve(__dirname, '../server.js');
      serverProcess = spawn(process.execPath, [serverScript], {
        env: {
          ...process.env,
          PORT: String(testPort),
          PROXY_AUTH_TOKEN: TEST_SECRET,
          BYBIT_API_KEY: '',
          BYBIT_API_SECRET: ''
        },
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // Wait for server to start
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Server spawn timed out')), 5000);
        serverProcess.stdout.on('data', (data) => {
          if (data.toString().includes('Running on http://localhost:')) {
            clearTimeout(timeout);
            resolve();
          }
        });
        serverProcess.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      try {
        const routes = [
          { path: '/api/balance', method: 'GET' },
          { path: '/api/orders', method: 'POST', body: {} },
          { path: '/api/ads', method: 'GET' },
          { path: '/api/market-depth', method: 'GET' }
        ];

        for (const { path: route, method, body } of routes) {
          // 1. Missing token -> 401
          const resNoAuth = await makeHttpRequest(route, { method, body });
          assert.strictEqual(resNoAuth.statusCode, 401, `${route} must return 401 without auth`);
          assert.strictEqual(resNoAuth.body.retCode, 401);
          assert.ok(resNoAuth.body.retMsg.includes('Unauthorized'));

          // 2. Invalid token -> 401
          const resBadAuth = await makeHttpRequest(route, {
            method,
            body,
            headers: { 'Authorization': 'Bearer bad_secret_token' }
          });
          assert.strictEqual(resBadAuth.statusCode, 401, `${route} must return 401 with bad auth`);

          // 3. Whitespace token -> 401
          const resSpaceAuth = await makeHttpRequest(route, {
            method,
            body,
            headers: { 'x-proxy-token': '   ' }
          });
          assert.strictEqual(resSpaceAuth.statusCode, 401, `${route} must return 401 with whitespace token`);

          // 4. Valid Bearer Token -> passes auth (reaches Bybit API credentials check, returning 500 because keys are blank)
          const resValidBearer = await makeHttpRequest(route, {
            method,
            body,
            headers: { 'Authorization': `Bearer ${TEST_SECRET}` }
          });
          assert.strictEqual(resValidBearer.statusCode, 500, `${route} must pass auth and reach credentials check`);
          assert.ok(resValidBearer.body.retMsg.includes('credentials not configured'), 'Must reach API credentials check');

          // 5. Valid x-proxy-token header -> passes auth
          const resValidHeader = await makeHttpRequest(route, {
            method,
            body,
            headers: { 'x-proxy-token': TEST_SECRET }
          });
          assert.strictEqual(resValidHeader.statusCode, 500, `${route} must pass auth with x-proxy-token`);

          // 6. Valid query param token -> passes auth
          const resValidQuery = await makeHttpRequest(`${route}?token=${encodeURIComponent(TEST_SECRET)}`, { method, body });
          assert.strictEqual(resValidQuery.statusCode, 500, `${route} must pass auth with ?token=`);

          // 7. CORS OPTIONS preflight -> 204 or 200
          const resOptions = await makeHttpRequest(route, {
            method: 'OPTIONS',
            headers: {
              'Origin': 'http://localhost:3000',
              'Access-Control-Request-Method': method,
              'Access-Control-Request-Headers': 'Authorization, x-proxy-token'
            }
          });
          assert.ok(resOptions.statusCode === 200 || resOptions.statusCode === 204, `${route} CORS preflight must return 200/204`);
        }

        // Test /api/status on live server
        const statusRes = await makeHttpRequest('/api/status');
        assert.strictEqual(statusRes.statusCode, 200);
        assert.strictEqual(statusRes.body.status, 'online');
        assert.strictEqual(statusRes.body.authRequired, true);

      } finally {
        if (serverProcess) {
          serverProcess.kill('SIGTERM');
        }
      }
    });
  });

  // -------------------------------------------------------------
  // 4. ADVERSARIAL ATTACK HARNESS & EDGE CASES
  // -------------------------------------------------------------
  describe('4. Adversarial Attack Vectors & Edge Cases', () => {
    it('4.1: SQL / NoSQL / Command Injection strings in token header return 401 safely', () => {
      const attackPayloads = [
        "' OR '1'='1",
        "admin' --",
        "'; DROP TABLE tokens; --",
        '{"$gt": ""}',
        '$(whoami)',
        '`reboot`',
        '<script>alert(1)</script>'
      ];

      attackPayloads.forEach(attack => {
        const req = new MockRequest({
          method: 'GET',
          url: '/api/balance',
          headers: { 'Authorization': `Bearer ${attack}` }
        });
        const res = new MockResponse();
        const allowed = vercelHelper.verifyAuth(req, res);

        assert.strictEqual(allowed, false, `Attack payload should be rejected: ${attack}`);
        assert.strictEqual(res.statusCode, 401);
      });
    });

    it('4.2: Null Byte Injection & Control Characters in token are safely rejected', () => {
      const nullBytePayloads = [
        `${TEST_SECRET}\0extra`,
        `\0${TEST_SECRET}`,
        `${TEST_SECRET}\r\nInjected-Header: evil`,
        `${TEST_SECRET}\x00`
      ];

      nullBytePayloads.forEach(payload => {
        const req = new MockRequest({
          method: 'POST',
          url: '/api/ads',
          headers: { 'x-proxy-token': payload }
        });
        const res = new MockResponse();
        const allowed = vercelHelper.verifyAuth(req, res);

        assert.strictEqual(allowed, false, `Null byte/control payload should be rejected: ${payload}`);
        assert.strictEqual(res.statusCode, 401);
      });
    });

    it('4.3: Prefix / Suffix token mismatch does not grant unauthorized access', () => {
      const nearMisses = [
        TEST_SECRET.slice(0, -1),       // 1 char short
        TEST_SECRET + '1',              // 1 char extra
        TEST_SECRET.toLowerCase(),      // wrong case
        TEST_SECRET.toUpperCase(),      // wrong case
        ' ' + TEST_SECRET,              // leading space
        TEST_SECRET + ' '               // trailing space
      ];

      nearMisses.forEach(nearMiss => {
        const isValid = vercelHelper.verifyToken(nearMiss, TEST_SECRET);
        assert.strictEqual(isValid, false, `Near miss should be false: ${nearMiss}`);
      });
    });

    it('4.4: Prototype pollution objects in req.body.token do not crash verifyToken', () => {
      const maliciousBodies = [
        { token: { __proto__: { admin: true } } },
        { token: Object.create(null) },
        { token: [TEST_SECRET] },
        { token: true },
        { token: 0 }
      ];

      maliciousBodies.forEach(body => {
        const req = new MockRequest({
          method: 'POST',
          url: '/api/orders',
          body
        });
        const extracted = vercelHelper.extractToken(req);
        assert.strictEqual(extracted, null, `Should extract null from non-string token body`);
      });
    });
  });
}, { tier: 5, category: 'R1 Adversarial Security' });
