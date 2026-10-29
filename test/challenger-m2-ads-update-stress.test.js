/**
 * Milestone 2 Adversarial Challenger Suite: Backend Proxy Route Stress Harness
 * Role: m2_challenger_1 (Empirical Challenger)
 * 
 * Adversarial stress testing of POST /api/ads/update:
 * 1. HTTP Method Fuzzing & Route Dispatching (GET, DELETE, OPTIONS, PUT, POST)
 * 2. Parameter Fuzzing & Boundary Invariants (missing id, inverted limits, negative, NaN, etc.)
 * 3. Order ID Injection & Escrow Immutability Invariants (order_*, orderId, 0 network egress)
 * 4. Upstream Bybit Error Code Simulations (10005, 10001, 10006, 10010, 500, 502, network failover)
 * 5. Authentication, Security & Multi-Tenant Credential Isolation
 * 6. Live Express Server E2E Integration (Real HTTP Socket)
 */

const { describe, it, beforeEach, afterEach, beforeAll, afterAll } = require('./harness/test-runner');
const { assert } = require('./harness/assertions');
const { MockRequest, MockResponse } = require('./harness/http-mock');
const { spawn } = require('child_process');
const http = require('http');

// Modules under test
const _bybit = require('../api/_bybit');
const adsHandler = require('../api/ads');
const proxyHandler = require('../api/proxy');

describe('Challenger M2: Backend Proxy Route (/api/ads/update) Adversarial Stress Suite', () => {
  const TEST_KEY = 'bybit_test_api_key_valid_12345';
  const TEST_SECRET = 'bybit_test_api_secret_valid_67890';
  let originalExecuteWithFailover;

  beforeAll(() => {
    originalExecuteWithFailover = _bybit.executeWithFailover;
  });

  afterAll(() => {
    _bybit.executeWithFailover = originalExecuteWithFailover;
  });

  beforeEach(() => {
    // Reset mock before each test
    _bybit.executeWithFailover = originalExecuteWithFailover;
  });

  afterEach(() => {
    _bybit.executeWithFailover = originalExecuteWithFailover;
  });

  // Helper to create authenticated MockRequest
  function createAuthRequest(options = {}) {
    return new MockRequest({
      method: options.method || 'POST',
      url: options.url || '/api/ads/update',
      query: options.query || {},
      body: options.body || {},
      headers: {
        'x-bybit-api-key': TEST_KEY,
        'x-bybit-api-secret': TEST_SECRET,
        'content-type': 'application/json',
        ...(options.headers || {})
      }
    });
  }

  // =========================================================================
  // 1. HTTP Method Fuzzing & Route Dispatching
  // =========================================================================
  describe('1. HTTP Method Fuzzing & Route Dispatching', () => {
    it('1.1: OPTIONS preflight on /api/ads/update returns 200 with CORS headers without requiring credentials', async () => {
      const req = new MockRequest({
        method: 'OPTIONS',
        url: '/api/ads/update',
        headers: {
          'Origin': 'http://localhost:3000',
          'Access-Control-Request-Method': 'POST'
        }
      });
      const res = new MockResponse();

      await adsHandler(req, res);

      assert.strictEqual(res.statusCode, 200, 'OPTIONS preflight must return 200');
      assert.strictEqual(res.getHeader('access-control-allow-origin'), '*');
      assert.ok(res.getHeader('access-control-allow-methods').includes('POST'));
    });

    it('1.2: GET request to /api/ads/update falls through safely to ad listing and does NOT trigger ad update logic', async () => {
      let updateExecuted = false;
      _bybit.executeWithFailover = async (method, path) => {
        if (path === '/v5/p2p/item/update') {
          updateExecuted = true;
        }
        return { data: { retCode: 0, result: { items: [] } } };
      };

      const req = createAuthRequest({
        method: 'GET',
        url: '/api/ads/update',
        body: { id: 'ad_123', price: 1500, minAmount: 10000, maxAmount: 50000 }
      });
      const res = new MockResponse();

      await adsHandler(req, res);

      assert.strictEqual(updateExecuted, false, 'GET must never execute /v5/p2p/item/update');
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.retCode, 0);
    });

    it('1.3: DELETE request to /api/ads/update does NOT trigger ad update logic', async () => {
      let updateExecuted = false;
      _bybit.executeWithFailover = async (method, path) => {
        if (path === '/v5/p2p/item/update') {
          updateExecuted = true;
        }
        return { data: { retCode: 0, result: { items: [] } } };
      };

      const req = createAuthRequest({
        method: 'DELETE',
        url: '/api/ads/update',
        body: { id: 'ad_123', price: 1500, minAmount: 10000, maxAmount: 50000 }
      });
      const res = new MockResponse();

      await adsHandler(req, res);

      assert.strictEqual(updateExecuted, false, 'DELETE must never execute /v5/p2p/item/update');
    });

    it('1.4: POST request to /api/ads/update with valid params executes update upstream and returns 200', async () => {
      let capturedPath = '';
      let capturedMethod = '';
      let capturedPayload = null;

      _bybit.executeWithFailover = async (method, path, bodyStr, payload) => {
        capturedMethod = method;
        capturedPath = path;
        capturedPayload = payload;
        return {
          data: {
            retCode: 0,
            retMsg: 'success',
            result: { itemId: '1859302749581029384' }
          }
        };
      };

      const req = createAuthRequest({
        method: 'POST',
        url: '/api/ads/update',
        body: { id: '1859302749581029384', price: 1505.50, minAmount: 15000, maxAmount: 40000 }
      });
      const res = new MockResponse();

      await adsHandler(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.retCode, 0);
      assert.strictEqual(capturedMethod, 'POST');
      assert.strictEqual(capturedPath, '/v5/p2p/item/update');
      assert.strictEqual(capturedPayload.id, '1859302749581029384');
      assert.strictEqual(capturedPayload.price, '1505.5');
      assert.strictEqual(capturedPayload.minAmount, '15000');
      assert.strictEqual(capturedPayload.maxAmount, '40000');
    });

    it('1.5: PUT request to /api/ads/update with valid params also executes update upstream', async () => {
      let capturedPath = '';
      _bybit.executeWithFailover = async (method, path, bodyStr, payload) => {
        capturedPath = path;
        return { data: { retCode: 0, retMsg: 'success', result: { itemId: 'ad_put_test' } } };
      };

      const req = createAuthRequest({
        method: 'PUT',
        url: '/api/ads/update',
        body: { id: 'ad_put_test', price: 1510, minAmount: 20000, maxAmount: 60000 }
      });
      const res = new MockResponse();

      await adsHandler(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(capturedPath, '/v5/p2p/item/update');
    });

    it('1.6: /api/ads/edit route alias dispatches cleanly to ad update handler', async () => {
      let capturedPath = '';
      _bybit.executeWithFailover = async (method, path) => {
        capturedPath = path;
        return { data: { retCode: 0, retMsg: 'success', result: { itemId: 'ad_edit_alias' } } };
      };

      const req = createAuthRequest({
        method: 'POST',
        url: '/api/ads/edit',
        body: { id: 'ad_edit_alias', price: 1500, minAmount: 15000, maxAmount: 40000 }
      });
      const res = new MockResponse();

      await adsHandler(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(capturedPath, '/v5/p2p/item/update');
    });

    it('1.7: api/proxy.js dispatches /api/ads/update to adsHandler', async () => {
      let capturedPath = '';
      _bybit.executeWithFailover = async (method, path) => {
        capturedPath = path;
        return { data: { retCode: 0, retMsg: 'success', result: { itemId: 'proxy_ad_update' } } };
      };

      const req = createAuthRequest({
        method: 'POST',
        url: '/api/ads/update',
        body: { id: 'proxy_ad_update', price: 1500, minAmount: 15000, maxAmount: 40000 }
      });
      const res = new MockResponse();

      await proxyHandler(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(capturedPath, '/v5/p2p/item/update');
    });
  });

  // =========================================================================
  // 2. Parameter Fuzzing & Boundary Stress
  // =========================================================================
  describe('2. Parameter Fuzzing & Boundary Stress', () => {
    it('2.1: Missing id and itemId in payload returns HTTP 400 with retCode 10001', async () => {
      const req = createAuthRequest({
        body: { price: 1500, minAmount: 15000, maxAmount: 40000 }
      });
      const res = new MockResponse();

      await adsHandler(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.retCode, 10001);
      assert.ok(res.body.retMsg.includes('id (or itemId) is required'));
    });

    it('2.2: Empty string id and whitespace-only id are rejected with HTTP 400', async () => {
      for (const emptyId of ['', '   ', '\t', '\n']) {
        const req = createAuthRequest({
          body: { id: emptyId, price: 1500, minAmount: 15000, maxAmount: 40000 }
        });
        const res = new MockResponse();

        await adsHandler(req, res);

        assert.strictEqual(res.statusCode, 400, `Should reject whitespace/empty id: "${emptyId}"`);
        assert.strictEqual(res.body.retCode, 10001);
      }
    });

    it('2.3: Inverted limits (minAmount > maxAmount) return HTTP 400 with retCode 10001', async () => {
      const req = createAuthRequest({
        body: { id: 'ad_123', price: 1500, minAmount: 60000, maxAmount: 20000 }
      });
      const res = new MockResponse();

      await adsHandler(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.retCode, 10001);
      assert.ok(res.body.retMsg.includes('minAmount cannot exceed maxAmount'));
    });

    it('2.4: Inverted boundary limits off-by-one (min 40001 > max 40000) are rejected with HTTP 400', async () => {
      const req = createAuthRequest({
        body: { id: 'ad_123', price: 1500, minAmount: 40001, maxAmount: 40000 }
      });
      const res = new MockResponse();

      await adsHandler(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.retCode, 10001);
    });

    it('2.5: Identical limits boundary (min 25000 === max 25000) is accepted as valid single-ticket limit', async () => {
      let executed = false;
      _bybit.executeWithFailover = async () => {
        executed = true;
        return { data: { retCode: 0, retMsg: 'success', result: { itemId: 'ad_123' } } };
      };

      const req = createAuthRequest({
        body: { id: 'ad_123', price: 1500, minAmount: 25000, maxAmount: 25000 }
      });
      const res = new MockResponse();

      await adsHandler(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(executed, true);
    });

    it('2.6: Negative price and zero price return HTTP 400', async () => {
      for (const badPrice of [-1500, -0.01, 0, '0', '-100']) {
        const req = createAuthRequest({
          body: { id: 'ad_123', price: badPrice, minAmount: 15000, maxAmount: 40000 }
        });
        const res = new MockResponse();

        await adsHandler(req, res);

        assert.strictEqual(res.statusCode, 400, `Price ${badPrice} must be rejected`);
        assert.strictEqual(res.body.retCode, 10001);
      }
    });

    it('2.7: Non-numeric price strings ("abc", "$1500", "1,500.50", "NaN") return HTTP 400', async () => {
      const invalidPrices = ['abc', '$1500', '1,500.50', 'NaN', 'undefined', 'null', '{}', '[]'];
      for (const price of invalidPrices) {
        const req = createAuthRequest({
          body: { id: 'ad_123', price, minAmount: 15000, maxAmount: 40000 }
        });
        const res = new MockResponse();

        await adsHandler(req, res);

        assert.strictEqual(res.statusCode, 400, `Price string "${price}" must be rejected`);
        assert.strictEqual(res.body.retCode, 10001);
      }
    });

    it('2.8: Negative or zero minAmount returns HTTP 400', async () => {
      for (const badMin of [-15000, 0, '-500']) {
        const req = createAuthRequest({
          body: { id: 'ad_123', price: 1500, minAmount: badMin, maxAmount: 40000 }
        });
        const res = new MockResponse();

        await adsHandler(req, res);

        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.body.retCode, 10001);
      }
    });

    it('2.9: Negative or zero maxAmount returns HTTP 400', async () => {
      for (const badMax of [-40000, 0, '-1000']) {
        const req = createAuthRequest({
          body: { id: 'ad_123', price: 1500, minAmount: 15000, maxAmount: badMax }
        });
        const res = new MockResponse();

        await adsHandler(req, res);

        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.body.retCode, 10001);
      }
    });

    it('2.10: Non-numeric limit values (strings, arrays, objects) return HTTP 400', async () => {
      const badLimits = ['not_a_number', '15k', {}, [], true, false];
      for (const val of badLimits) {
        const req = createAuthRequest({
          body: { id: 'ad_123', price: 1500, minAmount: val, maxAmount: 40000 }
        });
        const res = new MockResponse();

        await adsHandler(req, res);

        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.body.retCode, 10001);
      }
    });

    it('2.11: Negative or non-numeric optional quantity returns HTTP 400 with retMsg describing quantity', async () => {
      const invalidQuantities = [-10, 0, '0', '-5', 'abc', 'NaN'];
      for (const qty of invalidQuantities) {
        const req = createAuthRequest({
          body: { id: 'ad_123', price: 1500, minAmount: 15000, maxAmount: 40000, quantity: qty }
        });
        const res = new MockResponse();

        await adsHandler(req, res);

        assert.strictEqual(res.statusCode, 400, `Quantity ${qty} must be rejected`);
        assert.strictEqual(res.body.retCode, 10001);
        assert.ok(res.body.retMsg.includes('quantity must be a positive number'));
      }
    });

    it('2.12: Valid positive quantity (number or string number) is included in normalized upstream payload', async () => {
      let capturedPayload = null;
      _bybit.executeWithFailover = async (m, p, s, payload) => {
        capturedPayload = payload;
        return { data: { retCode: 0, retMsg: 'success', result: { itemId: 'ad_qty_ok' } } };
      };

      const req = createAuthRequest({
        body: { id: 'ad_qty_ok', price: 1500, minAmount: 15000, maxAmount: 40000, quantity: 250.75 }
      });
      const res = new MockResponse();

      await adsHandler(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(capturedPayload.quantity, '250.75');
    });

    it('2.13: Empty payload `{}` returns HTTP 400 with retCode 10001', async () => {
      const req = createAuthRequest({ body: {} });
      const res = new MockResponse();

      await adsHandler(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.retCode, 10001);
    });

    it('2.14: Stringified empty JSON `"{}"` returns HTTP 400 without crashing', async () => {
      const req = createAuthRequest({ body: '{}' });
      const res = new MockResponse();

      await adsHandler(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.retCode, 10001);
    });

    it('2.15: Malformed JSON string (`"{invalid:json@@"`) recovers safely to empty object and returns 400', async () => {
      const req = createAuthRequest({ body: '{invalid:json@@' });
      const res = new MockResponse();

      await adsHandler(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.retCode, 10001);
    });

    it('2.16: Non-object payload primitives (`null`, `12345`, `"string"`, `true`) are handled safely without crash', async () => {
      const primitives = [null, 12345, 'some_random_string', true, false];
      for (const prim of primitives) {
        const req = createAuthRequest({ body: prim });
        const res = new MockResponse();

        await adsHandler(req, res);

        assert.strictEqual(res.statusCode, 400, `Primitive ${prim} must be safely rejected`);
        assert.strictEqual(res.body.retCode, 10001);
      }
    });

    it('2.17: Extreme numeric values (1e12, Number.MAX_SAFE_INTEGER) and floats (15000.5, 40000.75) are preserved', async () => {
      let capturedPayload = null;
      _bybit.executeWithFailover = async (m, p, s, payload) => {
        capturedPayload = payload;
        return { data: { retCode: 0, retMsg: 'success', result: { itemId: 'ad_extreme' } } };
      };

      const req = createAuthRequest({
        body: { id: 'ad_extreme', price: 1500.55, minAmount: 15000.5, maxAmount: 1e12 }
      });
      const res = new MockResponse();

      await adsHandler(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(capturedPayload.price, '1500.55');
      assert.strictEqual(capturedPayload.minAmount, '15000.5');
      assert.strictEqual(capturedPayload.maxAmount, '1000000000000');
    });

    it('2.18: ActionType defaults to "MODIFY" and priceType defaults to 1 when omitted', async () => {
      let capturedPayload = null;
      _bybit.executeWithFailover = async (m, p, s, payload) => {
        capturedPayload = payload;
        return { data: { retCode: 0, retMsg: 'success', result: { itemId: 'ad_defaults' } } };
      };

      const req = createAuthRequest({
        body: { id: 'ad_defaults', price: 1500, minAmount: 15000, maxAmount: 40000 }
      });
      const res = new MockResponse();

      await adsHandler(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(capturedPayload.actionType, 'MODIFY');
      assert.strictEqual(capturedPayload.priceType, 1);
    });

    it('2.19: Explicit ActionType ("ACTIVE") and custom remark / paymentIds are passed cleanly to Bybit V5 payload', async () => {
      let capturedPayload = null;
      _bybit.executeWithFailover = async (m, p, s, payload) => {
        capturedPayload = payload;
        return { data: { retCode: 0, retMsg: 'success', result: { itemId: 'ad_opts' } } };
      };

      const req = createAuthRequest({
        body: {
          id: 'ad_opts',
          actionType: 'ACTIVE',
          price: 1500,
          minAmount: 15000,
          maxAmount: 40000,
          paymentPeriod: 15,
          paymentIds: [101, 102],
          remark: 'Quick transfer please'
        }
      });
      const res = new MockResponse();

      await adsHandler(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(capturedPayload.actionType, 'ACTIVE');
      assert.strictEqual(capturedPayload.paymentPeriod, '15');
      assert.deepStrictEqual(capturedPayload.paymentIds, ['101', '102']);
      assert.strictEqual(capturedPayload.remark, 'Quick transfer please');
    });
  });

  // =========================================================================
  // 3. Order ID Injection & Escrow Immutability Invariants
  // =========================================================================
  describe('3. Order ID Injection & Escrow Immutability Invariants', () => {
    it('3.1: Order ID in `id` field (order_12345) triggers immediate HTTP 400 IMMUTABLE_ORDER rejection', async () => {
      let networkCallAttempted = false;
      _bybit.executeWithFailover = async () => {
        networkCallAttempted = true;
        return { data: {} };
      };

      const req = createAuthRequest({
        body: { id: 'order_12345', price: 1500, minAmount: 15000, maxAmount: 40000 }
      });
      const res = new MockResponse();

      await adsHandler(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.retCode, -1);
      assert.strictEqual(res.body.error, 'IMMUTABLE_ORDER');
      assert.ok(res.body.retMsg.includes('escrow'));
      assert.strictEqual(networkCallAttempted, false, 'Network call must never be made for trade orders');
    });

    it('3.2: Case variations (ORDER_99999, Order_Abc) trigger immediate immutability rejection', async () => {
      const orderIds = ['ORDER_99999', 'Order_Abc', 'order_xyz_123', 'OrDeR_555'];
      for (const oid of orderIds) {
        let callAttempted = false;
        _bybit.executeWithFailover = async () => { callAttempted = true; return {}; };

        const req = createAuthRequest({
          body: { id: oid, price: 1500, minAmount: 15000, maxAmount: 40000 }
        });
        const res = new MockResponse();

        await adsHandler(req, res);

        assert.strictEqual(res.statusCode, 400, `Order ID ${oid} must be rejected`);
        assert.strictEqual(res.body.error, 'IMMUTABLE_ORDER');
        assert.strictEqual(callAttempted, false);
      }
    });

    it('3.3: Order ID in `itemId` field triggers immediate immutability rejection', async () => {
      let callAttempted = false;
      _bybit.executeWithFailover = async () => { callAttempted = true; return {}; };

      const req = createAuthRequest({
        body: { itemId: 'order_itemId_test', price: 1500, minAmount: 15000, maxAmount: 40000 }
      });
      const res = new MockResponse();

      await adsHandler(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.error, 'IMMUTABLE_ORDER');
      assert.strictEqual(callAttempted, false);
    });

    it('3.4: Order ID in dedicated `orderId` property triggers immutability rejection even with numeric ID', async () => {
      let callAttempted = false;
      _bybit.executeWithFailover = async () => { callAttempted = true; return {}; };

      const req = createAuthRequest({
        body: { orderId: '1859302749581029384', price: 1500, minAmount: 15000, maxAmount: 40000 }
      });
      const res = new MockResponse();

      await adsHandler(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.error, 'IMMUTABLE_ORDER');
      assert.strictEqual(callAttempted, false);
    });

    it('3.5: Mixed injection attack: valid ad `id` paired with `orderId` property is strictly rejected', async () => {
      let callAttempted = false;
      _bybit.executeWithFailover = async () => { callAttempted = true; return {}; };

      const req = createAuthRequest({
        body: {
          id: 'valid_advertisement_id_123',
          orderId: 'injected_trade_order_999',
          price: 1500,
          minAmount: 15000,
          maxAmount: 40000
        }
      });
      const res = new MockResponse();

      await adsHandler(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.error, 'IMMUTABLE_ORDER');
      assert.strictEqual(callAttempted, false, 'Zero network calls allowed on mixed injection payload');
    });

    it('3.6: Standalone `order_` prefix with no suffix is rejected as an order ID', async () => {
      const req = createAuthRequest({
        body: { id: 'order_', price: 1500, minAmount: 15000, maxAmount: 40000 }
      });
      const res = new MockResponse();

      await adsHandler(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.error, 'IMMUTABLE_ORDER');
    });

    it('3.7: Legitimate ad ID containing "order" as a substring (e.g. "my_orderbook_ad_123") is NOT blocked by immutability guard', async () => {
      let callAttempted = false;
      _bybit.executeWithFailover = async () => {
        callAttempted = true;
        return { data: { retCode: 0, retMsg: 'success', result: { itemId: 'my_orderbook_ad_123' } } };
      };

      const req = createAuthRequest({
        body: { id: 'my_orderbook_ad_123', price: 1500, minAmount: 15000, maxAmount: 40000 }
      });
      const res = new MockResponse();

      await adsHandler(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(callAttempted, true, 'Non-order prefix should pass to Bybit');
    });
  });

  // =========================================================================
  // 4. Upstream Bybit Error Simulation & Failure Resilience
  // =========================================================================
  describe('4. Upstream Bybit Error Code Simulation & Failure Resilience', () => {
    it('4.1: Upstream retCode: 10005 (Permission denied / Non-merchant advertiser) is cleanly forwarded', async () => {
      _bybit.executeWithFailover = async () => {
        return {
          data: {
            retCode: 10005,
            retMsg: 'Permission denied: non-merchant general advertiser status required',
            result: null
          }
        };
      };

      const req = createAuthRequest({
        body: { id: 'ad_123', price: 1500, minAmount: 15000, maxAmount: 40000 }
      });
      const res = new MockResponse();

      await adsHandler(req, res);

      assert.strictEqual(res.statusCode, 200, 'Bybit API returns 200 with embedded business retCode');
      assert.strictEqual(res.body.retCode, 10005);
      assert.ok(res.body.retMsg.includes('Permission denied'));
    });

    it('4.2: Upstream retCode: 10001 (Parameter error from Bybit, e.g. ad expired or not found) is preserved', async () => {
      _bybit.executeWithFailover = async () => {
        return {
          data: {
            retCode: 10001,
            retMsg: 'Item id not found or item has expired',
            result: null
          }
        };
      };

      const req = createAuthRequest({
        body: { id: 'ad_expired', price: 1500, minAmount: 15000, maxAmount: 40000 }
      });
      const res = new MockResponse();

      await adsHandler(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.retCode, 10001);
      assert.ok(res.body.retMsg.includes('Item id not found'));
    });

    it('4.3: Upstream retCode: 10006 (Too many visits / rate limit exceeded) is preserved', async () => {
      _bybit.executeWithFailover = async () => {
        return {
          data: {
            retCode: 10006,
            retMsg: 'Too many visits. Exceeded rate limit for P2P ad modifications.',
            result: null
          }
        };
      };

      const req = createAuthRequest({
        body: { id: 'ad_123', price: 1500, minAmount: 15000, maxAmount: 40000 }
      });
      const res = new MockResponse();

      await adsHandler(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.retCode, 10006);
      assert.ok(res.body.retMsg.includes('Too many visits'));
    });

    it('4.4: Upstream retCode: 10010 (IP binding mismatch / IP not in whitelist) is preserved', async () => {
      _bybit.executeWithFailover = async () => {
        return {
          data: {
            retCode: 10010,
            retMsg: 'Unmatched IP, please check your API key IP binding settings',
            result: null
          }
        };
      };

      const req = createAuthRequest({
        body: { id: 'ad_123', price: 1500, minAmount: 15000, maxAmount: 40000 }
      });
      const res = new MockResponse();

      await adsHandler(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.retCode, 10010);
      assert.ok(res.body.retMsg.includes('Unmatched IP'));
    });

    it('4.5: Upstream HTTP 500 error from Bybit is caught and returned with HTTP 500 status and error JSON', async () => {
      _bybit.executeWithFailover = async () => {
        const error = new Error('Request failed with status code 500');
        error.response = {
          status: 500,
          statusText: 'Internal Server Error',
          data: { retCode: 10002, retMsg: 'Bybit upstream database error' }
        };
        throw error;
      };

      const req = createAuthRequest({
        body: { id: 'ad_123', price: 1500, minAmount: 15000, maxAmount: 40000 }
      });
      const res = new MockResponse();

      await adsHandler(req, res);

      assert.strictEqual(res.statusCode, 500);
      assert.strictEqual(res.body.retCode, 10002);
      assert.ok(res.body.retMsg.includes('upstream database error'));
    });

    it('4.6: Upstream HTTP 502 Bad Gateway with HTML string response is safely handled and formatted as JSON', async () => {
      _bybit.executeWithFailover = async () => {
        const error = new Error('Request failed with status code 502');
        error.response = {
          status: 502,
          statusText: 'Bad Gateway',
          data: '<html><head><title>502 Bad Gateway</title></head><body>Cloudflare Error</body></html>'
        };
        throw error;
      };

      const req = createAuthRequest({
        body: { id: 'ad_123', price: 1500, minAmount: 15000, maxAmount: 40000 }
      });
      const res = new MockResponse();

      await adsHandler(req, res);

      assert.strictEqual(res.statusCode, 502);
      assert.strictEqual(typeof res.body, 'object');
      assert.strictEqual(res.body.retCode, 502);
      assert.strictEqual(res.body.retMsg, 'Bad Gateway');
    });

    it('4.7: Complete network failure (ENOTFOUND / all domains unreachable) returns HTTP 500 without crashing', async () => {
      _bybit.executeWithFailover = async () => {
        const error = new Error('getaddrinfo ENOTFOUND api.bybit.com');
        error.code = 'ENOTFOUND';
        throw error;
      };

      const req = createAuthRequest({
        body: { id: 'ad_123', price: 1500, minAmount: 15000, maxAmount: 40000 }
      });
      const res = new MockResponse();

      await adsHandler(req, res);

      assert.strictEqual(res.statusCode, 500);
      assert.strictEqual(res.body.retCode, 500);
      assert.ok(res.body.retMsg.includes('ENOTFOUND'));
    });
  });

  // =========================================================================
  // 5. Authentication, Security & Multi-Tenant Credential Isolation
  // =========================================================================
  describe('5. Authentication, Security & Multi-Tenant Credential Isolation', () => {
    it('5.1: Missing credentials when no environment variables are set returns HTTP 401 Unauthorized', async () => {
      const prevKey = process.env.BYBIT_API_KEY;
      const prevSecret = process.env.BYBIT_API_SECRET;
      delete process.env.BYBIT_API_KEY;
      delete process.env.BYBIT_API_SECRET;

      try {
        const req = new MockRequest({
          method: 'POST',
          url: '/api/ads/update',
          body: { id: 'ad_123', price: 1500, minAmount: 15000, maxAmount: 40000 }
        });
        const res = new MockResponse();

        await adsHandler(req, res);

        assert.strictEqual(res.statusCode, 401);
        assert.strictEqual(res.body.retCode, 401);
        assert.ok(res.body.retMsg.includes('Unauthorized'));
      } finally {
        if (prevKey) process.env.BYBIT_API_KEY = prevKey;
        if (prevSecret) process.env.BYBIT_API_SECRET = prevSecret;
      }
    });

    it('5.2: Missing Bybit API Secret (only API key in headers) returns HTTP 401', async () => {
      const req = new MockRequest({
        method: 'POST',
        url: '/api/ads/update',
        headers: {
          'x-bybit-api-key': 'valid_api_key_only'
        },
        body: { id: 'ad_123', price: 1500, minAmount: 15000, maxAmount: 40000 }
      });
      const res = new MockResponse();

      await adsHandler(req, res);

      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.retCode, 401);
      assert.ok(res.body.retMsg.includes('Missing Bybit API Secret'));
    });

    it('5.3: Missing Bybit API Key (only secret in headers) returns HTTP 401', async () => {
      const req = new MockRequest({
        method: 'POST',
        url: '/api/ads/update',
        headers: {
          'x-bybit-api-secret': 'valid_secret_only'
        },
        body: { id: 'ad_123', price: 1500, minAmount: 15000, maxAmount: 40000 }
      });
      const res = new MockResponse();

      await adsHandler(req, res);

      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.retCode, 401);
      assert.ok(res.body.retMsg.includes('Missing Bybit API Key'));
    });

    it('5.4: Client-provided headers are passed atomically to executeWithFailover credentials', async () => {
      let passedCreds = null;
      _bybit.executeWithFailover = async (m, p, s, pl, creds) => {
        passedCreds = creds;
        return { data: { retCode: 0, retMsg: 'success', result: { itemId: 'ad_123' } } };
      };

      const req = new MockRequest({
        method: 'POST',
        url: '/api/ads/update',
        headers: {
          'x-bybit-api-key': 'custom_client_key_999',
          'x-bybit-api-secret': 'custom_client_secret_888'
        },
        body: { id: 'ad_123', price: 1500, minAmount: 15000, maxAmount: 40000 }
      });
      const res = new MockResponse();

      await adsHandler(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(passedCreds.apiKey, 'custom_client_key_999');
      assert.strictEqual(passedCreds.apiSecret, 'custom_client_secret_888');
      assert.strictEqual(passedCreds.isClientProvided, true);
    });

    it('5.5: Zero-width spaces and unicode artifacts in headers are sanitized before execution', async () => {
      let passedCreds = null;
      _bybit.executeWithFailover = async (m, p, s, pl, creds) => {
        passedCreds = creds;
        return { data: { retCode: 0, retMsg: 'success', result: { itemId: 'ad_123' } } };
      };

      const dirtyKey = '\u200Bclean_key\uFEFF';
      const dirtySecret = '  \u200Cclean_secret\u00A0 ';

      const req = new MockRequest({
        method: 'POST',
        url: '/api/ads/update',
        headers: {
          'x-bybit-api-key': dirtyKey,
          'x-bybit-api-secret': dirtySecret
        },
        body: { id: 'ad_123', price: 1500, minAmount: 15000, maxAmount: 40000 }
      });
      const res = new MockResponse();

      await adsHandler(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(passedCreds.apiKey, 'clean_key');
      assert.strictEqual(passedCreds.apiSecret, 'clean_secret');
    });
  });

  // =========================================================================
  // 6. Live Express Server E2E Integration (Real HTTP Socket)
  // =========================================================================
  describe('6. Live Express Server E2E Integration (Real HTTP Socket)', () => {
    let serverProcess = null;
    const TEST_PORT = 3199;

    function makeSocketRequest(path, options = {}) {
      return new Promise((resolve, reject) => {
        const bodyStr = options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : null;
        const headers = {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        };
        if (bodyStr) {
          headers['Content-Length'] = Buffer.byteLength(bodyStr);
        }

        const req = http.request({
          hostname: '127.0.0.1',
          port: TEST_PORT,
          path,
          method: options.method || 'GET',
          headers
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            let parsed = data;
            try { parsed = JSON.parse(data); } catch {}
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: parsed
            });
          });
        });

        req.on('error', reject);
        if (bodyStr) req.write(bodyStr);
        req.end();
      });
    }

    beforeAll(async () => {
      // Spawn Express server on test port 3199 with blank env credentials
      serverProcess = spawn('node', ['server.js'], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PORT: String(TEST_PORT),
          BYBIT_API_KEY: '',
          BYBIT_API_SECRET: ''
        }
      });

      // Wait for server to listen
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('Timed out waiting for test Express server to start'));
        }, 8000);

        serverProcess.stdout.on('data', (d) => {
          if (d.toString().includes('Running on http://localhost:')) {
            clearTimeout(timer);
            resolve();
          }
        });
        serverProcess.stderr.on('data', (d) => {
          // Log errors for debugging if needed
        });
        serverProcess.on('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });
    });

    afterAll(() => {
      if (serverProcess) {
        serverProcess.kill('SIGTERM');
      }
    });

    it('6.1: Live Express server rejects unauthenticated POST /api/ads/update with HTTP 401', async () => {
      const res = await makeSocketRequest('/api/ads/update', {
        method: 'POST',
        body: { id: 'ad_123', price: 1500, minAmount: 15000, maxAmount: 40000 }
      });

      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.retCode, 401);
      assert.ok(res.body.retMsg.includes('Unauthorized'));
    });

    it('6.2: Live Express server rejects order ID injection with HTTP 400 IMMUTABLE_ORDER', async () => {
      const res = await makeSocketRequest('/api/ads/update', {
        method: 'POST',
        headers: {
          'x-bybit-api-key': TEST_KEY,
          'x-bybit-api-secret': TEST_SECRET
        },
        body: { id: 'order_12345', price: 1500, minAmount: 15000, maxAmount: 40000 }
      });

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.retCode, -1);
      assert.strictEqual(res.body.error, 'IMMUTABLE_ORDER');
      assert.ok(res.body.retMsg.includes('escrow'));
    });

    it('6.3: Live Express server rejects missing parameters with HTTP 400 and retCode 10001', async () => {
      const res = await makeSocketRequest('/api/ads/update', {
        method: 'POST',
        headers: {
          'x-bybit-api-key': TEST_KEY,
          'x-bybit-api-secret': TEST_SECRET
        },
        body: { minAmount: 50000, maxAmount: 20000 } // missing id, inverted limits
      });

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.retCode, 10001);
    });

    it('6.4: Live Express server CORS preflight (OPTIONS) on /api/ads/update returns HTTP 204 or 200', async () => {
      const res = await makeSocketRequest('/api/ads/update', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://localhost:3000',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type, x-bybit-api-key, x-bybit-api-secret'
        }
      });

      assert.ok(res.statusCode === 204 || res.statusCode === 200, 'CORS preflight must return 204 or 200');
    });

    it('6.5: Live Express server with empty body on GET /api/ads/update returns HTTP 400 (id required)', async () => {
      const res = await makeSocketRequest('/api/ads/update', {
        method: 'GET',
        headers: {
          'x-bybit-api-key': TEST_KEY,
          'x-bybit-api-secret': TEST_SECRET
        }
      });

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.retCode, 10001);
    });
  });
});
