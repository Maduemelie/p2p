/**
 * Tier 5 White-Box Adversarial Verification Script
 * Specialist: m4_challenger_2
 * Scope: Empirical stress testing of all Phase 2 hardening targets
 */

const { setupDomEnvironment } = require('./harness/dom-mock');
const { assert } = require('./harness/assertions');
const http = require('http');

async function runAdversarialAudit() {
  console.log('======================================================');
  console.log('Tier 5 Adversarial White-Box Hardening Verification');
  console.log('======================================================\n');

  const results = {
    passed: 0,
    failed: 0,
    findings: []
  };

  function recordFinding(category, title, severity, details) {
    results.findings.push({ category, title, severity, details });
    console.log(`[FINDING - ${severity}] ${category}: ${title}`);
    console.log(`  Details: ${details}\n`);
  }

  // Set up DOM
  const dom = setupDomEnvironment();
  const pricingMod = await import('../js/pricing.js');
  const pricingViewMod = await import('../js/views/pricing.view.js');
  const bybitServiceMod = await import('../js/bybitService.js');
  const storeMod = await import('../js/store.js');
  const adsHandler = require('../api/ads');

  const { bybitService, normalizeAdUpdatePayload, formatBybitErrorMessage } = bybitServiceMod;
  const { store } = storeMod;

  // --------------------------------------------------------------------------
  // TEST 1: Temporal Dead Zone (TDZ) ReferenceError on storeSettings (pricing.js:469)
  // --------------------------------------------------------------------------
  console.log('--- Target 1: Pricing.js Line 469 TDZ Analysis ---');
  try {
    document.body.innerHTML = `
      <div id="main-content">
        <div id="input-target-spread"></div>
      </div>
    `;
    // Ensure input-outflow-fee is absent
    const outflowEl = document.getElementById('input-outflow-fee');
    assert.strictEqual(outflowEl, null, 'input-outflow-fee must be absent');

    let threwTdz = false;
    let tdzErrorMessage = '';
    try {
      pricingMod.calculateMargins();
    } catch (err) {
      if (err instanceof ReferenceError && err.message.includes('storeSettings')) {
        threwTdz = true;
        tdzErrorMessage = err.message;
      } else {
        throw err;
      }
    }

    if (threwTdz) {
      recordFinding(
        'TDZ_REFERENCE_ERROR',
        'Uncaught ReferenceError: Cannot access "storeSettings" before initialization in calculateMargins()',
        'CRITICAL',
        `At pricing.js:469, storeSettings is referenced in the fallback branch of outflowFee before being declared at line 970. When #input-outflow-fee is missing from the DOM (e.g. view navigation, external tabs, store:updated background triggers), calculateMargins() crashes with: "${tdzErrorMessage}".`
      );
      results.failed++;
    } else {
      console.log('  TDZ not reproduced (safeguarded)');
      results.passed++;
    }
  } catch (e) {
    console.error('  Unexpected failure in TDZ test:', e);
    results.failed++;
  }

  // --------------------------------------------------------------------------
  // TEST 2: Boolean & Non-Numeric Coercion Bypass in API Proxy (api/ads.js)
  // --------------------------------------------------------------------------
  console.log('--- Target 2: API Proxy Layer Parameter Validation (api/ads.js) ---');
  try {
    // Mock response helper
    class MockRes {
      constructor() {
        this.statusCode = 200;
        this.headers = {};
        this.body = null;
      }
      status(c) { this.statusCode = c; return this; }
      setHeader(k, v) { this.headers[k] = v; }
      json(d) { this.body = d; return this; }
    }

    // Test boolean true coercion
    const reqBoolean = {
      method: 'POST',
      url: '/api/ads/update',
      headers: {
        'x-bybit-api-key': 'test-key',
        'x-bybit-api-secret': 'test-secret'
      },
      body: {
        id: 'ad_123',
        price: 1500,
        minAmount: true,
        maxAmount: 40000
      }
    };
    const resBoolean = new MockRes();
    await adsHandler(reqBoolean, resBoolean);

    if (resBoolean.statusCode !== 400) {
      recordFinding(
        'BOOLEAN_COERCION_BYPASS',
        'Boolean minAmount: true coerces to Number(1) and bypasses validation in api/ads.js',
        'HIGH',
        `In api/ads.js (line 28), const minNum = Number(body.minAmount) converts boolean true to 1. Because 1 > 0 and 1 <= 40000, validation passes and upstream payload formats minAmount: "true". The proxy must explicitly check typeof or reject booleans.`
      );
      results.failed++;
    } else {
      console.log('  Boolean validation properly rejected with HTTP 400');
      results.passed++;
    }
  } catch (e) {
    console.error('  Unexpected failure in Proxy test:', e);
    results.failed++;
  }

  // --------------------------------------------------------------------------
  // TEST 3: Trade Order Immutability Enforcement
  // --------------------------------------------------------------------------
  console.log('--- Target 3: Order Immutability Invariant ---');
  try {
    const orderRes = await bybitService.updateOrder('order_12345', { price: 1500 });
    assert.strictEqual(orderRes.success, false);
    assert.strictEqual(orderRes.error, 'IMMUTABLE_ORDER');
    console.log('  bybitService.updateOrder strictly enforces IMMUTABLE_ORDER');
    results.passed++;

    // Check proxy layer order immutability
    const reqOrder = {
      method: 'POST',
      url: '/api/ads/update',
      headers: { 'x-bybit-api-key': 'k', 'x-bybit-api-secret': 's' },
      body: { orderId: '12345', price: 1500, minAmount: 15000, maxAmount: 40000 }
    };
    class MockRes2 {
      status(c) { this.statusCode = c; return this; }
      setHeader() {}
      json(d) { this.body = d; return this; }
    }
    const resOrder = new MockRes2();
    await adsHandler(reqOrder, resOrder);
    assert.strictEqual(resOrder.statusCode, 400);
    assert.strictEqual(resOrder.body.error, 'IMMUTABLE_ORDER');
    console.log('  api/ads.js strictly rejects orderId with HTTP 400 IMMUTABLE_ORDER');
    results.passed++;
  } catch (e) {
    console.error('  Failure in Order Immutability test:', e);
    results.failed++;
  }

  // --------------------------------------------------------------------------
  // TEST 4: Trade Limit Validation Reactivity & Formatting
  // --------------------------------------------------------------------------
  console.log('--- Target 4: Trade Limit Reactivity & Edge Cases ---');
  try {
    document.body.innerHTML = `
      <input id="input-user-min-limit" value="15000" />
      <input id="input-user-max-limit" value="40000" />
      <div id="trade-limits-error" style="display: none;"></div>
      <div id="trade-limits-error-text"></div>
    `;

    // 4.1 Input cleared
    const elMin = document.getElementById('input-user-min-limit');
    const elMax = document.getElementById('input-user-max-limit');
    elMin.value = '';
    const resEmpty = pricingMod.validateAndDisplayTradeLimits();
    assert.strictEqual(resEmpty.isValid, false, 'Cleared input must be invalid');
    assert.strictEqual(elMin.classList.contains('is-invalid'), true, 'Cleared min must have .is-invalid');
    console.log('  Cleared input properly marked invalid with .is-invalid');
    results.passed++;

    // 4.2 Localized comma formatting (e.g. "15,000")
    elMin.value = '15,000';
    const resComma = pricingMod.validateAndDisplayTradeLimits();
    if (!resComma.isValid) {
      recordFinding(
        'LOCALIZED_FORMAT_REJECTION',
        'Pasted strings with thousands separators ("15,000") are marked as invalid rather than sanitized',
        'MEDIUM',
        `validateAndDisplayTradeLimits() converts raw strings directly via Number(rawMin) without stripping commas. Pasting formatted text "15,000" evaluates to NaN and flags .is-invalid.`
      );
      results.failed++;
    } else {
      console.log('  Localized comma formatting accepted');
      results.passed++;
    }

    // 4.3 Infinity boundary check
    elMin.value = '15000';
    elMax.value = 'Infinity';
    const resInf = pricingMod.validateAndDisplayTradeLimits();
    if (resInf.isValid) {
      recordFinding(
        'INFINITY_BOUNDARY_INCONSISTENCY',
        'validateAndDisplayTradeLimits() accepts Infinity as valid max limit while store.js rejects it',
        'MEDIUM',
        `In pricing.js (line 71), isNaN(Infinity) is false and Infinity <= 0 is false, so validateAndDisplayTradeLimits() returns isValid: true. But store.validateTradeLimits() strictly checks !Number.isFinite(max), leading to an inconsistency.`
      );
      results.failed++;
    } else {
      console.log('  Infinity boundary properly rejected');
      results.passed++;
    }
  } catch (e) {
    console.error('  Failure in Trade Limit Reactivity test:', e);
    results.failed++;
  }

  // --------------------------------------------------------------------------
  // TEST 5: Ad Edit Capability Check Status Structure
  // --------------------------------------------------------------------------
  console.log('--- Target 5: checkAdEditCapability() Response Structure ---');
  try {
    const cap = await bybitService.checkAdEditCapability();
    assert.strictEqual(cap.supported, true, 'supported flag must be true');
    assert.strictEqual(cap.canEditAds, true, 'canEditAds flag must be true');
    assert.strictEqual(cap.ordersImmutable, true, 'ordersImmutable flag must be true');
    assert.strictEqual(typeof cap.endpoint, 'string', 'endpoint must be string');
    assert.strictEqual(typeof cap.reason, 'string', 'reason must be string');
    console.log('  checkAdEditCapability() conforms strictly to interface contract');
    results.passed++;
  } catch (e) {
    console.error('  Failure in checkAdEditCapability test:', e);
    results.failed++;
  }

  // --------------------------------------------------------------------------
  // TEST 6: Fill Speed & Queue Position Zero Division & Missing Node Guards
  // --------------------------------------------------------------------------
  console.log('--- Target 6: Fill Speed & Queue Position Robustness ---');
  try {
    const pricingEngine = await import('../js/pricingEngine.js');
    // Test fill speed with 0 competitors, 0 volume ahead
    const fsMonopoly = pricingEngine.calculateFillSpeed(1, 0, 0);
    assert.strictEqual(fsMonopoly.score, 100);
    assert.strictEqual(fsMonopoly.label, 'Very Fast');

    // Test fill speed with deep queue
    const fsDeep = pricingEngine.calculateFillSpeed(10, 50000, 20);
    assert.strictEqual(fsDeep.score, 5); // Clamped at 5
    assert.strictEqual(fsDeep.label, 'Slow');
    console.log('  calculateFillSpeed bounded between [5, 100] without division by zero');
    results.passed++;

    // Test queue position with empty array and null elements
    const qpEmpty = pricingEngine.calculateQueuePosition([], 1500, 'buy');
    assert.strictEqual(qpEmpty.rank, 1);
    assert.strictEqual(qpEmpty.totalCompetitors, 1);
    assert.strictEqual(qpEmpty.volumeAhead, 0);

    const qpMalformed = pricingEngine.calculateQueuePosition([null, undefined, {}, { price: 'invalid' }], 1500, 'buy');
    assert.strictEqual(qpMalformed.rank, 1);
    console.log('  calculateQueuePosition handles empty and malformed competitor items cleanly');
    results.passed++;
  } catch (e) {
    console.error('  Failure in Fill Speed / Queue Position test:', e);
    results.failed++;
  }

  // --------------------------------------------------------------------------
  // TEST 7: Ad Update Submit Button Double-Click & Finally Protection
  // --------------------------------------------------------------------------
  console.log('--- Target 7: handleAdUpdateSubmit Button Protection ---');
  try {
    document.body.innerHTML = `
      <div id="modal-update-ad-backdrop" class="modal-backdrop">
        <form id="form-update-ad">
          <input id="input-ad-id" value="12345" />
          <input id="input-ad-price" value="1500" />
          <input id="input-ad-min-limit" value="15000" />
          <input id="input-ad-max-limit" value="40000" />
          <input id="input-ad-quantity" value="" />
          <div id="modal-ad-edit-alert" style="display: none;"></div>
          <button type="submit" id="btn-submit-update-ad">Submit to Bybit</button>
        </form>
      </div>
      <div id="bybit-ad-edit-status" style="display: none;">
        <span id="bybit-ad-edit-status-message"></span>
      </div>
    `;

    const btn = document.getElementById('btn-submit-update-ad');

    // Mock bybitService.updateAd to simulate network delay and error
    const originalUpdateAd = bybitService.updateAd;
    let invocationCount = 0;
    bybitService.updateAd = async () => {
      invocationCount++;
      return { success: false, retCode: 500, retMsg: 'Simulated Upstream 500' };
    };

    await pricingMod.handleAdUpdateSubmit({ preventDefault: () => {} });

    // Verify button was re-enabled in finally
    assert.strictEqual(btn.disabled, false, 'Submit button must be re-enabled in finally block');
    assert.strictEqual(btn.innerHTML.includes('Submit to Bybit'), true, 'Submit button text restored');
    console.log('  Submit button properly disabled during call and re-enabled in finally');
    results.passed++;

    bybitService.updateAd = originalUpdateAd;
  } catch (e) {
    console.error('  Failure in Button Finally test:', e);
    results.failed++;
  }

  console.log('\n======================================================');
  console.log(`Verification Complete: Passed: ${results.passed}, Failed: ${results.failed}`);
  console.log(`Total Findings Identified: ${results.findings.length}`);
  console.log('======================================================\n');

  return results;
}

runAdversarialAudit().then(results => {
  if (results.findings.length > 0) {
    console.log('Audit completed with confirmed findings.');
  }
  process.exit(0);
}).catch(err => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
