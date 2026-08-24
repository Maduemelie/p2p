const assert = require('assert');
const crypto = require('crypto');
const { verifyToken, extractToken, verifyAuth } = require('../../api/_bybit');

console.log('Testing verifyToken...');

// Test 1: exact match
assert.strictEqual(verifyToken('mysecret123', 'mysecret123'), true);

// Test 2: length mismatch
assert.strictEqual(verifyToken('short', 'muchlongertoken'), false);
assert.strictEqual(verifyToken('muchlongertoken', 'short'), false);

// Test 3: empty / null / undefined
assert.strictEqual(verifyToken('', 'mysecret123'), false);
assert.strictEqual(verifyToken(null, 'mysecret123'), false);
assert.strictEqual(verifyToken(undefined, 'mysecret123'), false);
assert.strictEqual(verifyToken('mysecret123', ''), false);
assert.strictEqual(verifyToken('mysecret123', null), false);
assert.strictEqual(verifyToken('mysecret123', undefined), false);

// Test 4: special chars & utf8
const utf8Token = '🔐 secret-p2p-token-₦-2026!@#$%^&*()';
assert.strictEqual(verifyToken(utf8Token, utf8Token), true);
assert.strictEqual(verifyToken(utf8Token, utf8Token + ' '), false);

console.log('Testing extractToken...');

// Header extraction: Bearer
assert.strictEqual(extractToken({ headers: { authorization: 'Bearer abc123xyz' } }), 'abc123xyz');
assert.strictEqual(extractToken({ headers: { authorization: 'bearer abc123xyz' } }), 'abc123xyz');
assert.strictEqual(extractToken({ headers: { authorization: 'BEARER   abc123xyz  ' } }), 'abc123xyz');

// Header extraction: raw authorization token
assert.strictEqual(extractToken({ headers: { authorization: 'rawsecrettoken' } }), 'rawsecrettoken');

// Header extraction: other schemes should return null (unless custom headers present)
assert.strictEqual(extractToken({ headers: { authorization: 'Basic dXNlcjpwYXNz' } }), null);
assert.strictEqual(extractToken({ headers: { authorization: 'Digest username="MIME"' } }), null);
assert.strictEqual(extractToken({ headers: { authorization: 'Bearer' } }), null);
assert.strictEqual(extractToken({ headers: { authorization: 'Bearer   ' } }), null);

// Custom headers
assert.strictEqual(extractToken({ headers: { 'x-proxy-token': 'custom_proxy_token' } }), 'custom_proxy_token');
assert.strictEqual(extractToken({ headers: { 'x-api-token': 'custom_api_token' } }), 'custom_api_token');
assert.strictEqual(extractToken({ headers: { 'x-auth-token': 'custom_auth_token' } }), 'custom_auth_token');

// Query param
assert.strictEqual(extractToken({ headers: {}, query: { token: 'query_token' } }), 'query_token');

// Body
assert.strictEqual(extractToken({ headers: {}, body: { token: 'body_token' } }), 'body_token');
assert.strictEqual(extractToken({ headers: {}, body: JSON.stringify({ token: 'json_string_token' }) }), 'json_string_token');

// verifyAuth mock test
function mockRes() {
  const headers = {};
  let statusCode = 200;
  let responseData = null;
  return {
    headers,
    setHeader(k, v) { headers[k] = v; },
    status(code) { statusCode = code; return this; },
    json(data) { responseData = data; return this; },
    end() { return this; },
    getStatusCode: () => statusCode,
    getData: () => responseData
  };
}

// OPTIONS method
const resOpt = mockRes();
const optResult = verifyAuth({ method: 'OPTIONS', headers: {} }, resOpt);
assert.strictEqual(optResult, false);
assert.strictEqual(resOpt.getStatusCode(), 200);

// Missing token
const resMissing = mockRes();
const missingResult = verifyAuth({ method: 'GET', headers: {} }, resMissing);
assert.strictEqual(missingResult, false);
assert.strictEqual(resMissing.getStatusCode(), 401);
assert.strictEqual(resMissing.getData().retCode, 401);

console.log('All adversarial stress tests passed!');
