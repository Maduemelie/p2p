/**
 * Adversarial Stress & Chaos Test Suite for Bybit Service Layer (Milestone 2)
 * Role: m2_challenger_2 (Empirical Challenger)
 * 
 * Targeted Components in js/bybitService.js:
 * 1. updateAd:
 *    - Network drops, connection resets, low-level socket disconnects
 *    - AbortSignal and timeout exceptions
 *    - Non-JSON responses (HTML 502 Bad Gateway, HTML 200 captive portals, plain text 500)
 *    - Malformed and truncated JSON bodies
 *    - HTTP 403 Forbidden with Bybit retCode 10005 vs generic 403
 *    - HTTP 502 Upstream Gateway Error
 *    - Bybit retCode 10005 (General advertiser merchant requirement)
 *    - Client-side pre-flight parameter validation (min > max, non-positive price, missing id, non-object)
 *    - Outgoing payload numeric limit preservation (minAmount === 20000)
 *    - Zero-width space auth key sanitization in outgoing headers
 * 2. updateOrder:
 *    - Exhaustive parameter combination rejection with { success: false, error: 'IMMUTABLE_ORDER' }
 *    - 100-iteration random fuzzing invariant check
 *    - Zero network invocation invariant
 * 3. checkAdEditCapability:
 *    - Invariant property assertions: canEditAds === true, ordersImmutable === true, supported === true
 *    - High-concurrency invariant retention
 * 4. Helper & Mapping Stress:
 *    - normalizeAdUpdatePayload V5 schema conformance
 *    - formatBybitErrorMessage fuzzing and security code coverage
 */

const { describe, it, beforeEach, afterEach } = require('./harness/test-runner');
const { assert } = require('./harness/assertions');
const { setupDomEnvironment } = require('./harness/dom-mock');

describe('Challenger M2: Adversarial Bybit Service & Error Mapping Stress Harness', () => {
  let dom;
  let bybitServiceModule;
  let bybitService;
  let normalizeAdUpdatePayload;
  let formatBybitErrorMessage;
  let sanitizeKey;
  let originalFetch;

  beforeEach(async () => {
    dom = setupDomEnvironment();
    dom.localStorage.clear();

    originalFetch = global.fetch;

    // Dynamically import ESM service module
    bybitServiceModule = await import('../js/bybitService.js');
    bybitService = bybitServiceModule.bybitService;
    normalizeAdUpdatePayload = bybitServiceModule.normalizeAdUpdatePayload;
    formatBybitErrorMessage = bybitServiceModule.formatBybitErrorMessage;
    sanitizeKey = bybitServiceModule.sanitizeKey;
  });

  afterEach(() => {
    if (originalFetch) {
      global.fetch = originalFetch;
      if (global.window) {
        global.window.fetch = originalFetch;
      }
    }
    if (dom && typeof dom.restore === 'function') {
      dom.restore();
    }
  });

  // =========================================================================
  // 1. OUTGOING PAYLOAD NUMERIC LIMIT PRESERVATION INVARIANTS
  // =========================================================================
  describe('1. Numeric Limit & Payload Preservation Invariants', () => {
    it('1.1 Preserves exact numeric types for minAmount (20000), maxAmount (60000), and price (1503.25)', async () => {
      let capturedRequest = null;
      global.fetch = async (url, init) => {
        capturedRequest = {
          url,
          init,
          parsedBody: JSON.parse(init.body)
        };
        return {
          ok: true,
          status: 200,
          json: async () => ({
            retCode: 0,
            retMsg: 'success',
            result: { itemId: capturedRequest.parsedBody.id }
          })
        };
      };
      if (global.window) global.window.fetch = global.fetch;

      const input = {
        id: 'ad_numeric_test_101',
        minAmount: 20000,
        maxAmount: 60000,
        price: 1503.25
      };

      const result = await bybitService.updateAd(input);

      assert.strictEqual(result.success, true, 'Update must succeed with valid numeric limits');
      assert.ok(capturedRequest !== null, 'Fetch must be invoked');
      assert.strictEqual(capturedRequest.init.method, 'POST');

      // Assert numeric type preservation in parsed outgoing body
      const body = capturedRequest.parsedBody;
      assert.strictEqual(body.minAmount, 20000, 'minAmount must be strictly 20000 numeric');
      assert.strictEqual(typeof body.minAmount, 'number', 'minAmount type must be number, NOT string');
      assert.strictEqual(body.maxAmount, 60000, 'maxAmount must be strictly 60000 numeric');
      assert.strictEqual(typeof body.maxAmount, 'number', 'maxAmount type must be number, NOT string');
      assert.strictEqual(body.price, 1503.25, 'price must be strictly 1503.25 numeric');
      assert.strictEqual(typeof body.price, 'number', 'price type must be number, NOT string');
      assert.strictEqual(body.id, 'ad_numeric_test_101', 'id must be string representation');
      assert.strictEqual(body.actionType, 'MODIFY', 'actionType default must be MODIFY');
    });

    it('1.2 Preserves fractional float limits and extreme integer values without truncation', async () => {
      let capturedBody = null;
      global.fetch = async (url, init) => {
        capturedBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ retCode: 0, retMsg: 'success', result: { itemId: capturedBody.id } })
        };
      };
      if (global.window) global.window.fetch = global.fetch;

      const extremeInput = {
        id: 'ad_extreme_val',
        minAmount: 1,
        maxAmount: 999999999, // 999M NGN
        price: 0.00001,
        quantity: 50000
      };

      await bybitService.updateAd(extremeInput);

      assert.strictEqual(capturedBody.minAmount, 1);
      assert.strictEqual(typeof capturedBody.minAmount, 'number');
      assert.strictEqual(capturedBody.maxAmount, 999999999);
      assert.strictEqual(typeof capturedBody.maxAmount, 'number');
      assert.strictEqual(capturedBody.price, 0.00001);
      assert.strictEqual(typeof capturedBody.price, 'number');
    });

    it('1.3 Attaches sanitized authentication headers and handles zero-width spaces in API keys', async () => {
      let capturedHeaders = null;
      global.fetch = async (url, init) => {
        capturedHeaders = init.headers;
        return {
          ok: true,
          status: 200,
          json: async () => ({ retCode: 0, retMsg: 'success' })
        };
      };
      if (global.window) global.window.fetch = global.fetch;

      // Set credentials containing zero-width spaces (\u200B, \uFEFF, \u00A0)
      dom.localStorage.setItem('bybit_api_key', '\u200Bclean_api_key\uFEFF');
      dom.localStorage.setItem('bybit_api_secret', '\u00A0clean_api_secret\u200C');

      await bybitService.updateAd({ id: 'ad_auth_check', price: 1500, minAmount: 10000, maxAmount: 30000 });

      assert.ok(capturedHeaders, 'Headers must be captured');
      assert.strictEqual(capturedHeaders['Content-Type'], 'application/json');
      assert.strictEqual(capturedHeaders['x-bybit-api-key'], 'clean_api_key', 'Zero-width spaces must be stripped from api key');
      assert.strictEqual(capturedHeaders['x-bybit-api-secret'], 'clean_api_secret', 'Zero-width spaces must be stripped from api secret');
    });
  });

  // =========================================================================
  // 2. CLIENT-SIDE PRE-FLIGHT VALIDATION STRESS
  // =========================================================================
  describe('2. Client-Side Pre-Flight Parameter Validation Stress', () => {
    it('2.1 Rejects null, undefined, primitive, and empty payloads without invoking network', async () => {
      let networkInvoked = false;
      global.fetch = async () => {
        networkInvoked = true;
        return { ok: true, json: async () => ({}) };
      };
      if (global.window) global.window.fetch = global.fetch;

      const invalidPayloads = [null, undefined, '', 'string-id', 12345, false, true, []];

      for (const payload of invalidPayloads) {
        networkInvoked = false;
        const res = await bybitService.updateAd(payload);
        assert.strictEqual(res.success, false, `Payload ${JSON.stringify(payload)} must be rejected`);
        assert.strictEqual(res.retCode, 10001, 'Invalid payload must return retCode 10001');
        assert.strictEqual(res.data, null);
        assert.ok(res.retMsg.includes('Invalid ad data') || res.retMsg.includes('non-null object'));
        assert.strictEqual(networkInvoked, false, 'Network must NOT be called for invalid payload');
      }
    });

    it('2.2 Rejects missing or empty advertisement ID without invoking network', async () => {
      let networkInvoked = false;
      global.fetch = async () => {
        networkInvoked = true;
        return { ok: true, json: async () => ({}) };
      };
      if (global.window) global.window.fetch = global.fetch;

      const missingIdPayloads = [
        {},
        { price: 1500, minAmount: 10000, maxAmount: 30000 },
        { id: '', price: 1500, minAmount: 10000, maxAmount: 30000 },
        { id: null, itemId: undefined, price: 1500 },
        { id: '   ', itemId: '' } // whitespace
      ];

      for (const payload of missingIdPayloads) {
        networkInvoked = false;
        const res = await bybitService.updateAd(payload);
        assert.strictEqual(res.success, false, `Missing ID payload must fail`);
        assert.strictEqual(res.retCode, 10001);
        assert.ok(res.retMsg.includes('Missing ad ID') || res.retMsg.includes('required'));
        assert.strictEqual(networkInvoked, false, 'Network must NOT be called when ad ID is missing');
      }
    });

    it('2.3 Rejects inverted trade limits (minAmount > maxAmount) without invoking network', async () => {
      let networkInvoked = false;
      global.fetch = async () => {
        networkInvoked = true;
        return { ok: true, json: async () => ({}) };
      };
      if (global.window) global.window.fetch = global.fetch;

      const invertedPairs = [
        { min: 50000, max: 20000 },
        { min: 100000, max: 10000 },
        { min: '75000', max: '25000' }, // string numbers
        { min: 15000.50, max: 15000.49 }
      ];

      for (const pair of invertedPairs) {
        networkInvoked = false;
        const res = await bybitService.updateAd({
          id: 'ad_invert_101',
          price: 1500,
          minAmount: pair.min,
          maxAmount: pair.max
        });
        assert.strictEqual(res.success, false, `min ${pair.min} > max ${pair.max} must be rejected`);
        assert.strictEqual(res.retCode, 10001);
        assert.ok(res.retMsg.includes('minAmount cannot be greater than maxAmount'));
        assert.strictEqual(networkInvoked, false, 'Network must NOT be called for inverted limits');
      }
    });

    it('2.4 Permits equal limits (minAmount === maxAmount) to proceed to network', async () => {
      let networkInvoked = false;
      global.fetch = async () => {
        networkInvoked = true;
        return {
          ok: true,
          status: 200,
          json: async () => ({ retCode: 0, retMsg: 'success', result: { itemId: 'ad_eq' } })
        };
      };
      if (global.window) global.window.fetch = global.fetch;

      const res = await bybitService.updateAd({
        id: 'ad_eq',
        price: 1500,
        minAmount: 30000,
        maxAmount: 30000
      });

      assert.strictEqual(networkInvoked, true, 'Equal limits are valid and must proceed to network');
      assert.strictEqual(res.success, true);
    });

    it('2.5 Rejects non-positive prices (zero, negative, negative string) without invoking network', async () => {
      let networkInvoked = false;
      global.fetch = async () => {
        networkInvoked = true;
        return { ok: true, json: async () => ({}) };
      };
      if (global.window) global.window.fetch = global.fetch;

      const invalidPrices = [0, -1, -500.5, '-100', -0.0001];

      for (const price of invalidPrices) {
        networkInvoked = false;
        const res = await bybitService.updateAd({
          id: 'ad_price_101',
          price,
          minAmount: 10000,
          maxAmount: 30000
        });
        assert.strictEqual(res.success, false, `Price ${price} must be rejected`);
        assert.strictEqual(res.retCode, 10001);
        assert.ok(res.retMsg.includes('price must be positive'));
        assert.strictEqual(networkInvoked, false, 'Network must NOT be called for non-positive price');
      }
    });
  });

  // =========================================================================
  // 3. NETWORK DROPS, TIMEOUTS, & EXCEPTION RECOVERY
  // =========================================================================
  describe('3. Network Drop & Timeout Exception Recovery', () => {
    it('3.1 Recovers gracefully from client-side network disconnect (TypeError: Failed to fetch)', async () => {
      global.fetch = async () => {
        throw new TypeError('Failed to fetch');
      };
      if (global.window) global.window.fetch = global.fetch;

      const res = await bybitService.updateAd({
        id: 'ad_net_drop',
        price: 1500,
        minAmount: 10000,
        maxAmount: 40000
      });

      assert.strictEqual(res.success, false, 'Must indicate failure');
      assert.strictEqual(res.retCode, -1, 'Network exception must yield retCode -1');
      assert.strictEqual(res.error, 'Failed to fetch');
      assert.strictEqual(res.isPermissionDenied, false);
      assert.strictEqual(res.data, null);
    });

    it('3.2 Recovers gracefully from AbortSignal timeouts (AbortError / DOMException)', async () => {
      global.fetch = async () => {
        const abortErr = new Error('The user aborted a request.');
        abortErr.name = 'AbortError';
        throw abortErr;
      };
      if (global.window) global.window.fetch = global.fetch;

      const res = await bybitService.updateAd({
        id: 'ad_abort_test',
        price: 1500,
        minAmount: 10000,
        maxAmount: 40000
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.retCode, -1);
      assert.ok(res.retMsg.includes('aborted') || res.error.includes('aborted'));
      assert.strictEqual(res.data, null);
    });

    it('3.3 Recovers gracefully from low-level socket reset (ECONNRESET, socket hang up)', async () => {
      const socketErrors = [
        new Error('read ECONNRESET'),
        new Error('socket hang up'),
        new Error('connect ECONNREFUSED 127.0.0.1:3000'),
        new Error('ETIMEDOUT')
      ];

      for (const err of socketErrors) {
        global.fetch = async () => {
          throw err;
        };
        if (global.window) global.window.fetch = global.fetch;

        const res = await bybitService.updateAd({
          id: 'ad_socket_err',
          price: 1500,
          minAmount: 10000,
          maxAmount: 40000
        });

        assert.strictEqual(res.success, false);
        assert.strictEqual(res.retCode, -1);
        assert.strictEqual(res.error, err.message);
      }
    });

    it('3.4 Recovers cleanly when fetch rejects with non-Error primitive (string/number throw)', async () => {
      global.fetch = async () => {
        // eslint-disable-next-line no-throw-literal
        throw 'Fatal network socket failure string';
      };
      if (global.window) global.window.fetch = global.fetch;

      const res = await bybitService.updateAd({
        id: 'ad_primitive_throw',
        price: 1500,
        minAmount: 10000,
        maxAmount: 40000
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.retCode, -1);
      assert.ok(res.retMsg.includes('Fatal network') || res.retMsg.includes('unreachable'));
    });
  });

  // =========================================================================
  // 4. NON-JSON & CORRUPTED UPSTREAM RESPONSE RESILIENCE
  // =========================================================================
  describe('4. Non-JSON & Corrupted Upstream Response Resilience', () => {
    it('4.1 Resiliently handles HTTP 502 Bad Gateway with raw HTML error body', async () => {
      global.fetch = async () => ({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0');
        }
      });
      if (global.window) global.window.fetch = global.fetch;

      const res = await bybitService.updateAd({
        id: 'ad_502_test',
        price: 1500,
        minAmount: 10000,
        maxAmount: 40000
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.retCode, 502);
      assert.ok(res.retMsg.includes('502') || res.retMsg.includes('Bad Gateway'));
      assert.strictEqual(res.isPermissionDenied, false);
    });

    it('4.2 Resiliently handles HTTP 200 with non-JSON captive portal / HTML redirect', async () => {
      // Captive portal / proxy intercepts 200 OK and sends HTML login page
      global.fetch = async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0');
        }
      });
      if (global.window) global.window.fetch = global.fetch;

      const res = await bybitService.updateAd({
        id: 'ad_captive_200',
        price: 1500,
        minAmount: 10000,
        maxAmount: 40000
      });

      // Crucial: Must NOT report success when response is HTML even if HTTP status was 200!
      assert.strictEqual(res.success, false, 'HTML response on HTTP 200 must NOT be treated as success');
      assert.strictEqual(res.retCode, 200);
      assert.ok(res.retMsg.includes('200') || res.retMsg.includes('OK'));
    });

    it('4.3 Resiliently handles truncated and malformed JSON bodies without crashing', async () => {
      global.fetch = async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => {
          throw new SyntaxError('Unexpected end of JSON input');
        }
      });
      if (global.window) global.window.fetch = global.fetch;

      const res = await bybitService.updateAd({
        id: 'ad_malformed_json',
        price: 1500,
        minAmount: 10000,
        maxAmount: 40000
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.retCode, 200);
      assert.ok(res.error !== undefined);
    });

    it('4.4 Resiliently handles HTTP 500 Internal Server Error with plain text body', async () => {
      global.fetch = async () => ({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => {
          throw new SyntaxError('Unexpected token S in JSON at position 0');
        }
      });
      if (global.window) global.window.fetch = global.fetch;

      const res = await bybitService.updateAd({
        id: 'ad_500_test',
        price: 1500,
        minAmount: 10000,
        maxAmount: 40000
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.retCode, 500);
      assert.ok(res.retMsg.includes('500') || res.retMsg.includes('Internal Server Error'));
    });
  });

  // =========================================================================
  // 5. BYBIT RETCODE 10005 & HTTP 403 PERMISSION GATING STRESS
  // =========================================================================
  describe('5. Bybit retCode 10005 & HTTP 403 Permission Gating Stress', () => {
    it('5.1 Accurately flags Bybit retCode: 10005 with isPermissionDenied: true and Merchant Portal guidance', async () => {
      global.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          retCode: 10005,
          retMsg: 'permission denied: user does not hold verified P2P Merchant status',
          result: null
        })
      });
      if (global.window) global.window.fetch = global.fetch;

      const res = await bybitService.updateAd({
        id: 'ad_10005_test',
        price: 1500,
        minAmount: 10000,
        maxAmount: 40000
      });

      assert.strictEqual(res.success, false, 'Permission denied must indicate failure');
      assert.strictEqual(res.retCode, 10005, 'retCode must be 10005');
      assert.strictEqual(res.isPermissionDenied, true, 'isPermissionDenied flag must be true');
      assert.ok(res.guidanceMessage.includes('Merchant Portal') || res.guidanceMessage.includes('Bybit P2P Merchants'),
        'guidanceMessage must direct user to Bybit Merchant Portal');
      assert.ok(res.retMsg.includes('Permission denied') || res.retMsg.includes('Code 10005'),
        'retMsg must explain permission error code');
    });

    it('5.2 Accurately handles HTTP 403 Forbidden with retCode: 10005 payload', async () => {
      global.fetch = async () => ({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({
          retCode: 10005,
          retMsg: 'permission denied',
          result: null
        })
      });
      if (global.window) global.window.fetch = global.fetch;

      const res = await bybitService.updateAd({
        id: 'ad_403_10005',
        price: 1500,
        minAmount: 10000,
        maxAmount: 40000
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.retCode, 10005);
      assert.strictEqual(res.isPermissionDenied, true);
      assert.ok(res.guidanceMessage.includes('Merchant'));
    });

    it('5.3 Handles generic HTTP 403 Forbidden without crashing', async () => {
      global.fetch = async () => ({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({
          retCode: 403,
          retMsg: 'Access denied: WAF rule triggered'
        })
      });
      if (global.window) global.window.fetch = global.fetch;

      const res = await bybitService.updateAd({
        id: 'ad_403_waf',
        price: 1500,
        minAmount: 10000,
        maxAmount: 40000
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.retCode, 403);
      assert.ok(res.retMsg.includes('WAF') || res.retMsg.includes('Access denied'));
    });
  });

  // =========================================================================
  // 6. TRADE ORDER IMMUTABILITY CONTRACT STRESS (updateOrder)
  // =========================================================================
  describe('6. Trade Order Immutability Contract Stress (updateOrder)', () => {
    it('6.1 Strictly rejects all parameter combinations with { success: false, error: "IMMUTABLE_ORDER" }', async () => {
      let networkInvoked = false;
      global.fetch = async () => {
        networkInvoked = true;
        return { ok: true, json: async () => ({}) };
      };
      if (global.window) global.window.fetch = global.fetch;

      const parameterMatrices = [
        [],                                                 // updateOrder()
        ['order_12345'],                                    // single id
        ['order_12345', { price: 1550, amount: 1000 }],    // id + valid update
        [null, null],                                       // nulls
        [undefined, undefined],                             // undefineds
        [123456, { status: 'CANCELLED' }],                  // number id + payload
        ['', {}],                                           // empty string
        [{}, {}],                                           // objects
        ['ORDER_ESCROW_99999', { release: true }],          // escrow bypass attempt
        ['order_arbitrary', 'string-payload']               // string payload
      ];

      for (const args of parameterMatrices) {
        networkInvoked = false;
        const result = await bybitService.updateOrder(...args);

        assert.strictEqual(result.success, false, `updateOrder(${args.map(a => JSON.stringify(a)).join(', ')}) must return success: false`);
        assert.strictEqual(result.error, 'IMMUTABLE_ORDER', 'Error identifier must be IMMUTABLE_ORDER');
        assert.strictEqual(result.retCode, 10001, 'retCode must be 10001');
        assert.ok(typeof result.message === 'string', 'Message must be present');
        assert.ok(result.message.includes('escrow') || result.message.includes('cannot be edited'),
          'Message must explain trade order escrow immutability');
        assert.strictEqual(networkInvoked, false, 'Network fetch must NEVER be invoked for order edit attempts');
      }
    });

    it('6.2 Fuzzes 100 rapid concurrent order update invocations asserting 100% rejection invariant', async () => {
      let networkInvoked = false;
      global.fetch = async () => {
        networkInvoked = true;
        return { ok: true, json: async () => ({}) };
      };
      if (global.window) global.window.fetch = global.fetch;

      const fuzzCalls = Array.from({ length: 100 }, (_, i) => {
        const orderId = `order_fuzz_${i}_${Math.random().toString(36).substring(7)}`;
        const payload = {
          price: Math.random() * 2000,
          amount: Math.floor(Math.random() * 100000),
          action: 'CANCEL'
        };
        return bybitService.updateOrder(orderId, payload);
      });

      const results = await Promise.all(fuzzCalls);

      assert.strictEqual(results.length, 100);
      assert.strictEqual(networkInvoked, false, 'Zero network calls permitted during 100 fuzzed order updates');

      for (let i = 0; i < results.length; i++) {
        const res = results[i];
        assert.strictEqual(res.success, false);
        assert.strictEqual(res.error, 'IMMUTABLE_ORDER');
        assert.strictEqual(res.retCode, 10001);
      }
    });
  });

  // =========================================================================
  // 7. AD EDIT CAPABILITY INVARIANT STRESS (checkAdEditCapability)
  // =========================================================================
  describe('7. Ad Edit Capability Check Invariant Stress', () => {
    it('7.1 Asserts core invariant properties of checkAdEditCapability', async () => {
      const cap = await bybitService.checkAdEditCapability();

      assert.ok(cap !== null && typeof cap === 'object', 'Capability must return an object');
      assert.strictEqual(cap.supported, true, 'supported invariant must be true');
      assert.strictEqual(cap.canEditAds, true, 'canEditAds invariant must be true');
      assert.strictEqual(cap.ordersImmutable, true, 'ordersImmutable invariant must be true');
      assert.strictEqual(cap.endpoint, '/v5/p2p/item/update', 'endpoint must match Bybit V5 spec /v5/p2p/item/update');
      assert.ok(typeof cap.reason === 'string' && cap.reason.length > 20, 'reason must provide clear context');
      assert.ok(cap.reason.includes('merchant') || cap.reason.includes('Merchant'), 'reason must reference merchant prerequisites');
    });

    it('7.2 Preserves immutable capability state across 100 concurrent asynchronous calls', async () => {
      const calls = Array.from({ length: 100 }, () => bybitService.checkAdEditCapability());
      const results = await Promise.all(calls);

      assert.strictEqual(results.length, 100);
      for (const res of results) {
        assert.strictEqual(res.supported, true);
        assert.strictEqual(res.canEditAds, true);
        assert.strictEqual(res.ordersImmutable, true);
        assert.strictEqual(res.endpoint, '/v5/p2p/item/update');
      }
    });
  });

  // =========================================================================
  // 8. PAYLOAD NORMALIZATION & ERROR FORMATTING HELPERS
  // =========================================================================
  describe('8. Payload Normalization & Error Mapping Helpers Stress', () => {
    it('8.1 normalizeAdUpdatePayload strictly formats fields to Bybit OpenAPI V5 strings', () => {
      const raw = {
        id: 987654321,
        price: 1510.85,
        minAmount: 25000,
        maxAmount: 80000,
        priceType: '1',
        quantity: 1250.5,
        paymentPeriod: 15,
        paymentIds: [101, 102, 103],
        remark: 'Adversarial Test Ad'
      };

      const normalized = normalizeAdUpdatePayload(raw);

      assert.strictEqual(normalized.id, '987654321', 'id must be string');
      assert.strictEqual(normalized.actionType, 'MODIFY');
      assert.strictEqual(normalized.price, '1510.85', 'price must be string');
      assert.strictEqual(normalized.minAmount, '25000', 'minAmount must be string');
      assert.strictEqual(normalized.maxAmount, '80000', 'maxAmount must be string');
      assert.strictEqual(normalized.priceType, 1, 'priceType must be number');
      assert.strictEqual(normalized.quantity, '1250.5', 'quantity must be string');
      assert.strictEqual(normalized.paymentPeriod, '15', 'paymentPeriod must be string');
      assert.deepStrictEqual(normalized.paymentIds, ['101', '102', '103'], 'paymentIds must be strings');
      assert.strictEqual(normalized.remark, 'Adversarial Test Ad');
    });

    it('8.2 normalizeAdUpdatePayload handles empty and null inputs safely', () => {
      assert.deepStrictEqual(normalizeAdUpdatePayload(null), {});
      assert.deepStrictEqual(normalizeAdUpdatePayload(undefined), {});
      assert.deepStrictEqual(normalizeAdUpdatePayload('string'), {});
      assert.deepStrictEqual(normalizeAdUpdatePayload({}), { id: '', actionType: 'MODIFY' });
    });

    it('8.3 formatBybitErrorMessage maps standard error codes with user-actionable text', () => {
      const testCases = [
        {
          input: { retCode: 10001, retMsg: 'params error: minAmount greater than maxAmount' },
          expectedSubstr: 'Minimum trade limit cannot be greater'
        },
        {
          input: { retCode: 10001, retMsg: 'params error: price must be positive' },
          expectedSubstr: 'price must be a positive number'
        },
        {
          input: { retCode: 10002, retMsg: 'request expired' },
          expectedSubstr: 'system clock'
        },
        {
          input: { retCode: 10003, retMsg: 'api_key is invalid' },
          expectedSubstr: 'API Key is invalid'
        },
        {
          input: { retCode: 10004, retMsg: 'error sign' },
          expectedSubstr: 'API Secret mismatch'
        },
        {
          input: { retCode: 10005, retMsg: 'permission denied' },
          expectedSubstr: 'P2P Merchant status'
        },
        {
          input: { retCode: 10006, retMsg: 'too many visits' },
          expectedSubstr: 'rate limit exceeded'
        },
        {
          input: { retCode: 10010, retMsg: 'unmatched ip' },
          expectedSubstr: 'IP Restriction'
        },
        {
          input: { retCode: 33004, retMsg: 'api key expired' },
          expectedSubstr: 'expired'
        },
        {
          input: { retCode: 401, retMsg: 'unauthorized' },
          expectedSubstr: 'Unauthorized'
        },
        {
          input: '<html><head><title>502</title></head></html>',
          expectedSubstr: 'Upstream gateway error'
        }
      ];

      for (const tc of testCases) {
        const msg = formatBybitErrorMessage(tc.input);
        assert.ok(
          msg.toLowerCase().includes(tc.expectedSubstr.toLowerCase()),
          `Expected formatted message "${msg}" to contain "${tc.expectedSubstr}"`
        );
      }
    });
  });

  // =========================================================================
  // 9. FULL ROUND-TRIP SUCCESS PATH
  // =========================================================================
  describe('9. Full Round-Trip Success Flow', () => {
    it('9.1 Dispatches payload, receives retCode 0, and returns parsed success result', async () => {
      let dispatchedUrl = '';
      global.fetch = async (url, init) => {
        dispatchedUrl = url;
        const parsed = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            retCode: 0,
            retMsg: 'success',
            result: {
              itemId: parsed.id,
              price: parsed.price,
              minAmount: parsed.minAmount,
              maxAmount: parsed.maxAmount
            }
          })
        };
      };
      if (global.window) global.window.fetch = global.fetch;

      const res = await bybitService.updateAd({
        id: 'ad_success_roundtrip_999',
        price: 1515.00,
        minAmount: 18000,
        maxAmount: 50000
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.retCode, 0);
      assert.strictEqual(res.error, undefined);
      assert.strictEqual(res.isPermissionDenied, false);
      assert.ok(dispatchedUrl.endsWith('/api/ads/update'), 'Must dispatch to /api/ads/update');
      assert.ok(res.data !== null && typeof res.data === 'object');
      assert.strictEqual(res.data.itemId, 'ad_success_roundtrip_999');
      assert.strictEqual(res.data.minAmount, 18000);
      assert.strictEqual(res.data.maxAmount, 50000);
    });
  });
});
