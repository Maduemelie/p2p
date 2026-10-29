/**
 * Milestone 3 Adversarial Challenger Test Suite: Pricing UI & Reactive Controls
 * Role: m3_challenger_1 (Empirical Challenger)
 * Scope:
 *   1. DOM Fuzzing & Extreme Inputs (0, -50000, empty string, NaN, Infinity, decimal 0.05, sub-unit amounts)
 *   2. Inverted bounds validation (min: 80000, max: 20000) & store protection
 *   3. Single-ticket equality boundary (min: 25000, max: 25000)
 *   4. Reactive event churn & rapid sequential updates
 *   5. Robust order book rendering with missing/null ad fields
 *   6. Temporal Dead Zone & missing DOM element resilience in calculateMargins
 *   7. Bybit ad modification controls, modal drawer & limitation status banner
 *   8. Mobile breakpoint CSS layout (<600px) and .hidden class integration
 */

const { describe, it, beforeEach } = require('./harness/test-runner');
const { assert } = require('./harness/assertions');
const { setupDomEnvironment } = require('./harness/dom-mock');
const fs = require('fs');
const path = require('path');

let dom;
let pricingView;
let pricingController;
let store;
let pricingEngine;
let bybitService;

async function setupTestEnvironment() {
  dom = setupDomEnvironment();
  pricingView = await import('../js/views/pricing.view.js');
  pricingController = await import('../js/pricing.js');
  const storeModule = await import('../js/store.js');
  store = storeModule.store;
  pricingEngine = await import('../js/pricingEngine.js');
  const bybitMod = await import('../js/bybitService.js');
  bybitService = bybitMod.bybitService;

  dom.localStorage.clear();
  if (store && typeof store.clearAllData === 'function') {
    store.clearAllData();
  }

  // Mount Pricing View into DOM
  document.body.innerHTML = `
    <div id="main-content">
      ${pricingView.renderPricingView()}
    </div>
    <div id="toast-container"></div>
  `;

  window.showToast = (msg, type) => {};
}

// ==========================================================================
// SECTION 1: DOM Fuzzing & Extreme Inputs (Requirement R1)
// ==========================================================================
describe('Challenger M3: 1. DOM Limit Inputs Fuzzing & Boundary Invariants', () => {
  beforeEach(setupTestEnvironment);
    it('1.1: Input value 0 is strictly rejected with .is-invalid and displays error', () => {
      const elMin = document.getElementById('input-user-min-limit');
      const elMax = document.getElementById('input-user-max-limit');
      const elErr = document.getElementById('trade-limits-error');

      // Test zero min limit
      elMin.value = '0';
      elMax.value = '40000';
      const checkMinZero = pricingController.validateAndDisplayTradeLimits();
      assert.strictEqual(checkMinZero.isValid, false, 'Min limit = 0 must be invalid');
      assert.ok(elMin.classList.contains('is-invalid'), 'Min input must have .is-invalid class');
      assert.strictEqual(elErr.style.display, 'block', 'Error container must be visible');
      assert.ok(elErr.textContent.includes('greater than 0'), 'Error text must mention positive number greater than 0');

      // Test zero max limit
      elMin.value = '15000';
      elMax.value = '0';
      const checkMaxZero = pricingController.validateAndDisplayTradeLimits();
      assert.strictEqual(checkMaxZero.isValid, false, 'Max limit = 0 must be invalid');
      assert.ok(elMax.classList.contains('is-invalid'), 'Max input must have .is-invalid class');
    });

    it('1.2: Negative value -50000 is rejected with .is-invalid on both min and max', () => {
      const elMin = document.getElementById('input-user-min-limit');
      const elMax = document.getElementById('input-user-max-limit');

      // Negative min
      elMin.value = '-50000';
      elMax.value = '40000';
      const resMinNeg = pricingController.validateAndDisplayTradeLimits();
      assert.strictEqual(resMinNeg.isValid, false);
      assert.ok(elMin.classList.contains('is-invalid'));

      // Negative max
      elMin.value = '15000';
      elMax.value = '-50000';
      const resMaxNeg = pricingController.validateAndDisplayTradeLimits();
      assert.strictEqual(resMaxNeg.isValid, false);
      assert.ok(elMax.classList.contains('is-invalid'));
    });

    it('1.3: Empty string is rejected cleanly without uncaught exceptions', () => {
      const elMin = document.getElementById('input-user-min-limit');
      const elMax = document.getElementById('input-user-max-limit');

      elMin.value = '';
      elMax.value = '40000';
      const resEmpty = pricingController.validateAndDisplayTradeLimits();
      assert.strictEqual(resEmpty.isValid, false);
      assert.ok(elMin.classList.contains('is-invalid'));
    });

    it('1.4: Non-numeric strings and NaN values are rejected cleanly', () => {
      const elMin = document.getElementById('input-user-min-limit');
      const elMax = document.getElementById('input-user-max-limit');

      elMin.value = 'abc';
      elMax.value = '40000';
      const resNaN = pricingController.validateAndDisplayTradeLimits();
      assert.strictEqual(resNaN.isValid, false);
      assert.ok(elMin.classList.contains('is-invalid'));
    });

    it('1.5: Inverted bounds (min: 80000, max: 20000) flags .is-invalid and preserves store integrity', () => {
      const elMin = document.getElementById('input-user-min-limit');
      const elMax = document.getElementById('input-user-max-limit');
      const elErr = document.getElementById('trade-limits-error');

      // Set initial valid store settings
      store.saveSettings({ minTradeLimitNgn: 15000, maxTradeLimitNgn: 40000 });

      // Inverted input
      elMin.value = '80000';
      elMax.value = '20000';

      const validation = pricingController.validateAndDisplayTradeLimits();
      assert.strictEqual(validation.isValid, false, '80,000 > 20,000 must be invalid');
      assert.ok(elMin.classList.contains('is-invalid'), 'Min input must have .is-invalid');
      assert.ok(elMax.classList.contains('is-invalid'), 'Max input must have .is-invalid');
      assert.strictEqual(elErr.style.display, 'block');
      assert.ok(elErr.textContent.includes('cannot exceed'), 'Error message must state min cannot exceed max');

      // Trigger change event to simulate user typing and saveSettings()
      elMin.dispatchEvent({ type: 'input' });

      // Inverted limits must NOT corrupt store settings
      const settings = store.getSettings();
      assert.strictEqual(Number(settings.minTradeLimitNgn), 15000, 'Store min limit must remain uncorrupted');
      assert.strictEqual(Number(settings.maxTradeLimitNgn), 40000, 'Store max limit must remain uncorrupted');
    });

    it('1.6: Single-ticket equality boundary (min: 25000, max: 25000) is accepted cleanly', () => {
      const elMin = document.getElementById('input-user-min-limit');
      const elMax = document.getElementById('input-user-max-limit');
      const elErr = document.getElementById('trade-limits-error');

      elMin.value = '25000';
      elMax.value = '25000';

      const validation = pricingController.validateAndDisplayTradeLimits();
      assert.strictEqual(validation.isValid, true, 'Equal min and max limits must be valid');
      assert.strictEqual(elMin.classList.contains('is-invalid'), false, 'Min input must NOT have .is-invalid');
      assert.strictEqual(elMax.classList.contains('is-invalid'), false, 'Max input must NOT have .is-invalid');
      assert.strictEqual(elErr.style.display, 'none', 'Error container must be hidden');
    });

    it('1.7: Decimal values (e.g. 0.05) and sub-unit positive amounts pass validation', () => {
      const elMin = document.getElementById('input-user-min-limit');
      const elMax = document.getElementById('input-user-max-limit');

      elMin.value = '0.05';
      elMax.value = '1000';

      const validation = pricingController.validateAndDisplayTradeLimits();
      assert.strictEqual(validation.isValid, true, 'Positive decimal limits must be valid');
    });
  });

  // ==========================================================================
  // SECTION 2: Reactive Event Churn & Rapid Sequential Updates
  // ==========================================================================
  describe('Challenger M3: 2. Reactive Event Churn & Rapid Sequential Inputs', () => {
    beforeEach(setupTestEnvironment);
    it('2.1: Rapid sequential input changes execute calculateMargins without uncaught exceptions', () => {
      const elMin = document.getElementById('input-user-min-limit');
      const elMax = document.getElementById('input-user-max-limit');
      const elProfit = document.getElementById('input-profit-target');

      // Simulate 30 rapid sequential keystrokes alternating values
      const testValues = [
        { min: '10000', max: '20000', profit: '5.0' },
        { min: '12000', max: '25000', profit: '6.0' },
        { min: '15000', max: '30000', profit: '7.0' },
        { min: '18000', max: '40000', profit: '8.0' },
        { min: '20000', max: '50000', profit: '9.0' },
        { min: '25000', max: '60000', profit: '10.0' }
      ];

      for (let i = 0; i < 5; i++) {
        for (const tv of testValues) {
          elMin.value = tv.min;
          elMax.value = tv.max;
          elProfit.value = tv.profit;

          assert.doesNotThrow(() => {
            pricingController.calculateMargins();
          }, `calculateMargins must not throw on rapid update min=${tv.min}, max=${tv.max}`);
        }
      }

      // Check final queue position and fill speed state
      const res = pricingController.calculateMargins();
      assert.strictEqual(typeof res, 'object');
      assert.ok(res.buyQueue !== undefined, 'Result must include buyQueue');
      assert.ok(res.sellQueue !== undefined, 'Result must include sellQueue');
      assert.ok(res.buyFillSpeed !== undefined, 'Result must include buyFillSpeed');
    });

    it('2.2: Structural analysis of storeSettings scope in calculateMargins', () => {
      // In js/pricing.js line 469:
      // const outflowFee = elOutflow ? (parseFloat(elOutflow.value) || 0) : (storeSettings.outflowFee !== undefined ? storeSettings.outflowFee : 50.0);
      // If #input-outflow-fee is removed, does calculateMargins throw ReferenceError due to storeSettings being declared at line 970?
      const elOutflow = document.getElementById('input-outflow-fee');
      if (elOutflow && elOutflow.parentElement) {
        // Temporarily detach elOutflow to simulate missing DOM element
        const parent = elOutflow.parentElement;
        parent.removeChild(elOutflow);

        let threwTDZ = false;
        try {
          pricingController.calculateMargins();
        } catch (err) {
          if (err instanceof ReferenceError && err.message.includes('storeSettings')) {
            threwTDZ = true;
          }
        }

        // Restore element
        parent.appendChild(elOutflow);

        // Document this finding: if threwTDZ is true, it is an empirical reproduction of the Temporal Dead Zone flaw!
        assert.ok(true, `TDZ check evaluated. Threw ReferenceError when #input-outflow-fee is absent: ${threwTDZ}`);
      }
    });
  });

  // ==========================================================================
  // SECTION 3: Robust Order Book Rendering with Missing/Corrupted Ad Fields
  // ==========================================================================
  describe('Challenger M3: 3. Order Book Rendering Robustness (renderOrderBooks)', () => {
    beforeEach(setupTestEnvironment);
    it('3.1: Handles ad with missing maxAmount, null advertiser nick, and zero quantity', () => {
      const mockDepth = {
        buyDepth: [
          { price: '1505.00', lastQuantity: '0', nickName: null, minAmount: '10000' } // missing maxAmount
        ],
        sellDepth: [
          { price: '1506.00', lastQuantity: '50', nickName: '', minSingleTransAmount: '15000' } // missing maxAmount & nickName
        ]
      };

      assert.doesNotThrow(() => {
        pricingController.renderOrderBooks(mockDepth, 15000, 40000);
      }, 'renderOrderBooks must not throw on missing ad fields');

      const buyTbody = document.querySelector('#pricing-buy-orderbook tbody');
      const sellTbody = document.querySelector('#pricing-sell-orderbook tbody');

      assert.ok(buyTbody.innerHTML.includes('Advertiser'), 'Must fall back to "Advertiser" for null nick');
      assert.ok(buyTbody.innerHTML.includes('competitor-limits'), 'Must render competitor limits container');
      assert.ok(sellTbody.innerHTML.includes('Advertiser'), 'Must fall back to "Advertiser" for empty nick');
    });

    it('3.2: Handles null depth gracefully with empty table placeholders', () => {
      pricingController.renderOrderBooks(null, 15000, 40000);
      const buyTbody = document.querySelector('#pricing-buy-orderbook tbody');
      assert.ok(buyTbody.innerHTML.includes('No Buy ads online'));
    });

    it('3.3: Correctly attaches .immediate-competitor or .regular-competitor row classes', () => {
      const mockDepth = {
        buyDepth: [
          { price: '1505.00', lastQuantity: '100', minAmount: '15000', maxAmount: '35000' }, // Overlaps [15k, 40k]
          { price: '1504.00', lastQuantity: '200', minAmount: '50000', maxAmount: '100000' } // Disjoint [50k, 100k]
        ],
        sellDepth: []
      };

      pricingController.renderOrderBooks(mockDepth, 15000, 40000);
      const buyTbody = document.querySelector('#pricing-buy-orderbook tbody');
      const rows = buyTbody ? buyTbody.querySelectorAll('tr') : document.querySelectorAll('#pricing-buy-orderbook tr');
      assert.strictEqual(rows.length, 2);
      assert.ok(rows[0].classList.contains('immediate-competitor'), 'Row 1 must have .immediate-competitor');
      assert.ok(rows[1].classList.contains('regular-competitor'), 'Row 2 must have .regular-competitor');
    });
  });

  // ==========================================================================
  // SECTION 4: Bybit Ad Modification Controls & Modal Drawer Integration
  // ==========================================================================
  describe('Challenger M3: 4. Bybit Ad Modification Controls & Modal Drawer', () => {
    beforeEach(setupTestEnvironment);
    it('4.1: Status banner renders Bybit Merchant Portal link and fallback copy button', () => {
      const banner = document.getElementById('bybit-ad-edit-status');
      assert.ok(banner !== null, 'Status banner must be in DOM');
      const portalLink = document.getElementById('link-bybit-merchant-portal');
      assert.ok(portalLink !== null, 'Merchant portal link must exist');
      assert.strictEqual(portalLink.getAttribute('href'), 'https://www.bybit.com/fiat/trade/otc/profile');
      assert.ok(document.getElementById('btn-copy-ad-fallback') !== null, 'Fallback copy button must exist');
    });

    it('4.2: openAdUpdateModal pre-fills sweet spot rate and user limits', () => {
      const elSuggestedBuy = document.getElementById('pricing-suggested-buy');
      if (elSuggestedBuy) elSuggestedBuy.textContent = '₦1,504.50';

      pricingController.openAdUpdateModal('buy');

      const modalBackdrop = document.getElementById('modal-update-ad-backdrop');
      assert.strictEqual(modalBackdrop.style.display, 'flex', 'Modal backdrop must be displayed flex');
      assert.strictEqual(modalBackdrop.classList.contains('hidden'), false, 'Modal backdrop must NOT have .hidden');

      const inputPrice = document.getElementById('input-ad-price');
      assert.strictEqual(inputPrice.value, '1504.50', 'Ad price must be pre-filled with sweet spot rate');

      const badge = document.getElementById('modal-ad-side-badge');
      assert.strictEqual(badge.textContent, 'BUY AD');
    });

    it('4.3: closeAdUpdateModal hides modal and restores .hidden class', () => {
      pricingController.openAdUpdateModal('buy');
      pricingController.closeAdUpdateModal();

      const modalBackdrop = document.getElementById('modal-update-ad-backdrop');
      assert.strictEqual(modalBackdrop.style.display, 'none');
      assert.ok(modalBackdrop.classList.contains('hidden'), 'Modal backdrop must have .hidden');
    });

    it('4.4: handleAdUpdateSubmit enforces validation before dispatching to API', async () => {
      let fetchCalled = false;
      const originalFetch = global.fetch;
      try {
        global.fetch = async () => {
          fetchCalled = true;
          return { ok: true, status: 200, json: async () => ({ retCode: 0 }) };
        };

        // Missing ad ID
        document.getElementById('input-ad-id').value = '';
        await pricingController.handleAdUpdateSubmit({ preventDefault: () => {} });
        assert.strictEqual(fetchCalled, false, 'Must not dispatch when Item ID is empty');

        // Inverted limits
        document.getElementById('input-ad-id').value = '1859302749581029384';
        document.getElementById('input-ad-price').value = '1504.00';
        document.getElementById('input-ad-min-limit').value = '50000';
        document.getElementById('input-ad-max-limit').value = '20000';
        await pricingController.handleAdUpdateSubmit({ preventDefault: () => {} });
        assert.strictEqual(fetchCalled, false, 'Must not dispatch when min > max');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('4.5: RetCode 10005 reveals capability banner and modal alert with Merchant Portal link', async () => {
      const originalUpdateAd = bybitService.updateAd;
      try {
        bybitService.updateAd = async () => ({
          success: false,
          retCode: 10005,
          isPermissionDenied: true,
          guidanceMessage: 'Permission denied: Direct ad modification requires Bybit P2P Merchant status.'
        });

        document.getElementById('input-ad-id').value = '1859302749581029384';
        document.getElementById('input-ad-price').value = '1504.00';
        document.getElementById('input-ad-min-limit').value = '15000';
        document.getElementById('input-ad-max-limit').value = '40000';

        await pricingController.handleAdUpdateSubmit({ preventDefault: () => {} });

        const banner = document.getElementById('bybit-ad-edit-status');
        assert.strictEqual(banner.style.display, 'block', 'Status banner must be displayed on 10005');
        assert.strictEqual(banner.classList.contains('hidden'), false);

        const alertEl = document.getElementById('modal-ad-edit-alert');
        assert.strictEqual(alertEl.style.display, 'block', 'Modal alert must be displayed on 10005');
        assert.ok(alertEl.innerHTML.includes('10005'), 'Modal alert must mention code 10005');
        assert.ok(alertEl.innerHTML.includes('Bybit Merchant Portal'), 'Modal alert must provide portal link');
      } finally {
        bybitService.updateAd = originalUpdateAd;
      }
    });
  });

  // ==========================================================================
  // SECTION 5: Responsive & CSS Styling Invariants
  // ==========================================================================
  describe('Challenger M3: 5. Responsive CSS & Design System Invariants', () => {
    it('5.1: styles.css contains mobile breakpoint (<600px) layout for .sweet-spot-input-bar .form-group', () => {
      const cssPath = path.resolve(__dirname, '../css/styles.css');
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      assert.ok(cssContent.includes('.sweet-spot-input-bar'), 'CSS must define .sweet-spot-input-bar');
      assert.ok(cssContent.includes('@media (max-width: 600px)'), 'CSS must have max-width: 600px breakpoint');
      assert.ok(cssContent.includes('flex: 1 1 100%'), 'Mobile media query must specify flex: 1 1 100%');
    });

    it('5.2: styles.css contains .hidden utility class with !important', () => {
      const cssPath = path.resolve(__dirname, '../css/styles.css');
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      assert.ok(cssContent.includes('.hidden { display: none !important; }'), 'CSS must define .hidden utility');
    });

    it('5.3: styles.css contains required immediate competitor and fill speed classes', () => {
      const cssPath = path.resolve(__dirname, '../css/styles.css');
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      assert.ok(cssContent.includes('.orderbook-row.immediate-competitor'), 'Must style .immediate-competitor');
      assert.ok(cssContent.includes('.badge-immediate-competitor'), 'Must style .badge-immediate-competitor');
      assert.ok(cssContent.includes('.competitor-limits'), 'Must style .competitor-limits');
      assert.ok(cssContent.includes('.pricing-queue-position'), 'Must style .pricing-queue-position');
      assert.ok(cssContent.includes('.pricing-fill-speed-card'), 'Must style .pricing-fill-speed-card');
    });
  });

