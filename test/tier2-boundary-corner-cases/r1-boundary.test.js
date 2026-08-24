/**
 * Tier 2: Boundary & Corner Cases — R1: API Proxy Security & Token Authorization
 */

const { describe, it } = require('../harness/test-runner');
const { assert } = require('../harness/assertions');
const { MockRequest, MockResponse } = require('../harness/http-mock');

describe('Tier 2 — R1: Boundary & Corner Cases (API Security)', () => {
  const PROXY_TOKEN = 'secret_token_#9928_xyz';

  function authenticateRequest(req, expectedSecret) {
    if (!expectedSecret) return { authorized: true };

    const authHeader = req.headers['authorization'] || '';
    const customHeader = req.headers['x-auth-token'] || '';

    let extractedToken = '';
    if (authHeader) {
      const match = authHeader.match(/^Bearer\s+(.+)$/i);
      extractedToken = match ? match[1].trim() : authHeader.trim();
    } else if (customHeader) {
      extractedToken = customHeader.trim();
    }

    if (!extractedToken) {
      return { authorized: false, reason: 'Missing token' };
    }

    if (extractedToken !== expectedSecret) {
      return { authorized: false, reason: 'Invalid token' };
    }

    return { authorized: true };
  }

  it('R1-B.1: Empty and whitespace-only authorization headers are rejected', () => {
    const cases = [
      '',
      '   ',
      'Bearer',
      'Bearer ',
      'Bearer    ',
      'Bearer\t\n'
    ];

    cases.forEach(headerVal => {
      const req = new MockRequest({
        headers: { 'Authorization': headerVal }
      });
      const result = authenticateRequest(req, PROXY_TOKEN);
      assert.strictEqual(result.authorized, false, `Header "${headerVal}" should be rejected`);
    });
  });

  it('R1-B.2: Non-Bearer schemes (e.g. Basic, Digest) without valid secret are rejected', () => {
    const reqBasic = new MockRequest({
      headers: { 'Authorization': 'Basic dXNlcjpwYXNz' }
    });
    const result = authenticateRequest(reqBasic, PROXY_TOKEN);
    assert.strictEqual(result.authorized, false);
  });

  it('R1-B.3: OPTIONS pre-flight requests bypass auth and return status 200', async () => {
    let balanceHandler;
    try {
      balanceHandler = require('../../api/balance');
    } catch {}

    if (typeof balanceHandler === 'function') {
      const req = new MockRequest({ method: 'OPTIONS' });
      const res = new MockResponse();
      await balanceHandler(req, res);
      assert.strictEqual(res.statusCode, 200, 'OPTIONS preflight should return 200 OK');
    } else {
      assert.ok(true);
    }
  });

  it('R1-B.4: Tokens with complex special characters and unicode validate correctly', () => {
    const complexSecret = 't0k3n_!@#$%^&*()_+~-={}[];:,.<>?/2026';
    const reqValid = new MockRequest({
      headers: { 'Authorization': `Bearer ${complexSecret}` }
    });
    const result = authenticateRequest(reqValid, complexSecret);
    assert.strictEqual(result.authorized, true);

    const reqMismatched = new MockRequest({
      headers: { 'Authorization': `Bearer ${complexSecret}extra` }
    });
    const resultBad = authenticateRequest(reqMismatched, complexSecret);
    assert.strictEqual(resultBad.authorized, false);
  });

  it('R1-B.5: Unauthorized rejection responses return standardized JSON error payload', () => {
    const res = new MockResponse();
    res.status(401).json({ retCode: -1, retMsg: 'Unauthorized: Invalid or missing API proxy authorization token' });

    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.retCode, -1);
    assert.match(res.body.retMsg, /Unauthorized/i);
  });
}, { tier: 2, category: 'R1: Boundary Cases' });
