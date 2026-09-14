/**
 * Adversarial Multi-Tenant & Serverless Verification Suite
 * Stress-tests edge cases in multi-tenant Bybit credentials,
 * header casing, isolation, sanitization, and serverless proxy routing.
 */

const assert = require('assert');
const { MockRequest, MockResponse } = require('./harness/http-mock');
const { getCredentials, getHeader, sanitizeKey, executeWithFailover, verifyAuth } = require('../api/_bybit');
const proxyHandler = require('../api/proxy');

async function run() {
  console.log('--- Running Multi-Tenant Adversarial Verification ---');

  // Test 1: Cross-tenant isolation with partially supplied credentials
  {
    const prevKey = process.env.BYBIT_API_KEY;
    const prevSec = process.env.BYBIT_API_SECRET;
    try {
      process.env.BYBIT_API_KEY = 'global_server_key_A';
      process.env.BYBIT_API_SECRET = 'global_server_secret_B';

      // Tenant 1 supplies key only
      const reqKeyOnly = new MockRequest({
        headers: { 'x-bybit-api-key': 'tenant1_key' }
      });
      const creds1 = getCredentials(reqKeyOnly);
      assert.strictEqual(creds1.apiKey, 'tenant1_key');
      assert.strictEqual(creds1.apiSecret, '', 'Must not fall back to server secret!');
      assert.strictEqual(creds1.isClientProvided, true);

      // Tenant 2 supplies secret only
      const reqSecOnly = new MockRequest({
        headers: { 'x-bybit-api-secret': 'tenant2_secret' }
      });
      const creds2 = getCredentials(reqSecOnly);
      assert.strictEqual(creds2.apiKey, '', 'Must not fall back to server key!');
      assert.strictEqual(creds2.apiSecret, 'tenant2_secret');
      assert.strictEqual(creds2.isClientProvided, true);

      // Tenant 3 supplies no credentials -> falls back to single-tenant server env
      const reqNoCreds = new MockRequest({ headers: {} });
      const creds3 = getCredentials(reqNoCreds);
      assert.strictEqual(creds3.apiKey, 'global_server_key_A');
      assert.strictEqual(creds3.apiSecret, 'global_server_secret_B');
      assert.strictEqual(creds3.isClientProvided, false);
    } finally {
      process.env.BYBIT_API_KEY = prevKey;
      process.env.BYBIT_API_SECRET = prevSec;
    }
    console.log('✔ Test 1 passed: Cross-tenant isolation with partial credentials');
  }

  // Test 2: Header casing variations across different runtime formats
  {
    const casings = [
      { 'x-bybit-api-key': 'k1', 'x-bybit-api-secret': 's1' },
      { 'X-Bybit-Api-Key': 'k1', 'X-Bybit-Api-Secret': 's1' },
      { 'X-BYBIT-API-KEY': 'k1', 'X-BYBIT-API-SECRET': 's1' },
      { 'x-ByBit-aPi-kEy': 'k1', 'x-bYbIt-ApI-sEcReT': 's1' }
    ];

    for (const headers of casings) {
      const req = new MockRequest({ headers });
      const creds = getCredentials(req);
      assert.strictEqual(creds.apiKey, 'k1', `Failed on casing: ${JSON.stringify(headers)}`);
      assert.strictEqual(creds.apiSecret, 's1', `Failed on casing: ${JSON.stringify(headers)}`);
    }
    console.log('✔ Test 2 passed: Header casing variations (4 formats verified)');
  }

  // Test 3: Zero-width & invisible character sanitization (Ledger Item 2)
  {
    const dirtyInputs = [
      { raw: '\u200B\u200Ckey123\u200D\uFEFF', expected: 'key123' },
      { raw: '  secret\u00A0  ', expected: 'secret' },
      { raw: '\uFEFF\u200B', expected: '' }
    ];

    for (const item of dirtyInputs) {
      assert.strictEqual(sanitizeKey(item.raw), item.expected);
    }
    console.log('✔ Test 3 passed: Zero-width and non-breaking space sanitization');
  }

  // Test 4: Missing credentials in executeWithFailover throws immediately
  {
    let threw = false;
    try {
      await executeWithFailover('GET', '/v5/test', '', null, { apiKey: '', apiSecret: '' });
    } catch (e) {
      threw = true;
      assert(e.message.includes('credentials incomplete'), 'Expected clear error message on empty credentials');
    }
    assert(threw, 'Should throw immediately when credentials are empty');
    console.log('✔ Test 4 passed: executeWithFailover rejects empty credentials safely');
  }

  // Test 5: Generic proxy healthcheck and status routing
  {
    const reqHealth = new MockRequest({
      method: 'GET',
      url: '/api/proxy',
      headers: {}
    });
    const resHealth = new MockResponse();
    await proxyHandler(reqHealth, resHealth);
    assert.strictEqual(resHealth.statusCode, 200);
    assert.strictEqual(resHealth.body.status, 'online');
    console.log('✔ Test 5 passed: Proxy healthcheck returns 200 without auth');
  }

  // Test 6: Verify auth rejects partial client credentials when no proxy token is configured
  {
    const prevToken = process.env.PROXY_AUTH_TOKEN;
    try {
      delete process.env.PROXY_AUTH_TOKEN;
      const reqPartial = new MockRequest({
        headers: { 'x-bybit-api-key': 'key_only' }
      });
      const resPartial = new MockResponse();
      const authResult = verifyAuth(reqPartial, resPartial);
      assert.strictEqual(authResult, false);
      assert.strictEqual(resPartial.statusCode, 401);
    } finally {
      process.env.PROXY_AUTH_TOKEN = prevToken;
    }
    console.log('✔ Test 6 passed: Partial credentials rejected with 401 without proxy token');
  }

  console.log('\nALL 6 ADVERSARIAL MULTI-TENANT VERIFICATION TESTS PASSED!');
}

run().catch(e => {
  console.error('Test failure:', e);
  process.exit(1);
});
