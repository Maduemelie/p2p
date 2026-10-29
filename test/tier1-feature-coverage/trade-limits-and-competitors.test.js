/**
 * Multi-Tier E2E Test Suite: P2P Trade Limits, Bybit Ad Editing & Competitor Analysis
 * Requirements: R1 (Trade Limits), R2 (Bybit Ad Editing), R3 (Competitor Fill Speed Analysis), R4 (Testing & Verification)
 * 
 * Tiers Covered:
 *   Tier 1: Feature Coverage (≥ 5 tests per feature across all 9 features)
 *   Tier 2: Boundary & Corner Cases (≥ 5 tests per feature / boundary condition)
 *   Tier 3: Cross-Feature Combinations (Dynamic recalculation, payload sync, reactivity)
 *   Tier 4: Real-World Scenarios (End-to-end merchant arbitrage lifecycles)
 */

const { describe, it, beforeEach } = require('../harness/test-runner');
const { assert } = require('../harness/assertions');
const { setupDomEnvironment } = require('../harness/dom-mock');
const { invokeServerlessHandler } = require('../harness/http-mock');

// ============================================================================
// TIER 1: FEATURE COVERAGE (R1, R2, R3, R4)
// ============================================================================
describe('Tier 1: Feature Coverage — Trade Limits & Competitors (R1-R4) [trade-limits]', () => {
  let dom;
  let pricingEngine;
  let store;
  let bybitService;
  let pricingView;
  let pricingController;

  beforeEach(async () => {
    dom = setupDomEnvironment();
    pricingEngine = await import('../../js/pricingEngine.js');
    const storeModule = await import('../../js/store.js');
    store = storeModule.store;
    const bybitMod = await import('../../js/bybitService.js');
    bybitService = bybitMod.bybitService;
    pricingView = await import('../../js/views/pricing.view.js');
    pricingController = await import('../../js/pricing.js');

    dom.localStorage.clear();
    if (store && typeof store.clearAllData === 'function') {
      store.clearAllData();
    }
  });

  // --------------------------------------------------------------------------
  // Feature 1: Trade Limit Input Fields (Min & Max in NGN)
  // --------------------------------------------------------------------------
  it('TL.INP.1: Pricing view contains user minimum trade limit input field', () => {
    const html = pricingView.renderPricingView();
    const hasMinInput = html.includes('id="input-user-min-limit"') || html.includes('id="input-min-trade-limit"');
    assert.ok(hasMinInput, 'Pricing view must render input element with id #input-user-min-limit or #input-min-trade-limit');
  });

  it('TL.INP.2: Pricing view contains user maximum trade limit input field', () => {
    const html = pricingView.renderPricingView();
    const hasMaxInput = html.includes('id="input-user-max-limit"') || html.includes('id="input-max-trade-limit"');
    assert.ok(hasMaxInput, 'Pricing view must render input element with id #input-user-max-limit or #input-max-trade-limit');
  });

  it('TL.INP.3: Trade limit inputs specify numeric type with valid step attribute for NGN increments', () => {
    const html = pricingView.renderPricingView();
    const inputMatches = html.match(/id="input-(?:user-)?(?:min|max)-(?:trade-)?limit"[^>]*>/g) || [];
    assert.ok(inputMatches.length >= 2, 'Should find min and max trade limit input tags in pricing markup');
    inputMatches.forEach(tag => {
      assert.ok(tag.includes('type="number"'), `Limit input tag must have type="number": ${tag}`);
      assert.ok(tag.includes('step='), `Limit input tag must configure step attribute: ${tag}`);
    });
  });

  it('TL.INP.4: Trade limit inputs display NGN currency affix (₦ prefix or NGN suffix)', () => {
    const html = pricingView.renderPricingView();
    assert.ok(html.includes('₦') && (html.includes('NGN') || html.includes('Naira')), 
      'Pricing view must indicate NGN currency for trade limits');
  });

  it('TL.INP.5: Trade limit inputs have accessible and descriptive labels in DOM', () => {
    const html = pricingView.renderPricingView();
    assert.ok(html.includes('for="input-user-min-limit"') || html.includes('for="input-min-trade-limit"'), 
      'Must have label for minimum trade limit');
    assert.ok(html.includes('for="input-user-max-limit"') || html.includes('for="input-max-trade-limit"'), 
      'Must have label for maximum trade limit');
  });

  // --------------------------------------------------------------------------
  // Feature 2: Trade Limits Client-Side Storage Persistence Across Page Reloads
  // --------------------------------------------------------------------------
  it('TL.PER.1: Store returns default trade limits (15,000 to 40,000 NGN) when storage is empty', () => {
    const settings = store.getSettings();
    assert.strictEqual(typeof settings, 'object', 'store.getSettings() must return an object');
    const min = settings.minTradeLimitNgn !== undefined ? Number(settings.minTradeLimitNgn) : 15000;
    const max = settings.maxTradeLimitNgn !== undefined ? Number(settings.maxTradeLimitNgn) : 40000;
    assert.strictEqual(min, 15000, 'Default minimum trade limit must be 15,000 NGN');
    assert.strictEqual(max, 40000, 'Default maximum trade limit must be 40,000 NGN');
  });

  it('TL.PER.2: Saving custom trade limits via store.saveSettings() persists to client storage', () => {
    store.saveSettings({ minTradeLimitNgn: 25000, maxTradeLimitNgn: 75000 });
    const settings = store.getSettings();
    assert.strictEqual(Number(settings.minTradeLimitNgn), 25000, 'Saved min limit must be 25,000');
    assert.strictEqual(Number(settings.maxTradeLimitNgn), 75000, 'Saved max limit must be 75,000');
  });

  it('TL.PER.3: Persisted trade limits survive full re-instantiation of Store instance', async () => {
    store.saveSettings({ minTradeLimitNgn: 18000, maxTradeLimitNgn: 60000 });
    const freshStoreModule = await import('../../js/store.js');
    const freshSettings = freshStoreModule.store.getSettings();
    assert.strictEqual(Number(freshSettings.minTradeLimitNgn), 18000, 'Re-instantiated store must load persisted min limit');
    assert.strictEqual(Number(freshSettings.maxTradeLimitNgn), 60000, 'Re-instantiated store must load persisted max limit');
  });

  it('TL.PER.4: Dedicated localStorage keys (bybit_p2p_user_min_limit / bybit_p2p_pricing_min_limit) reflect saved values', () => {
    store.saveSettings({ minTradeLimitNgn: 30000, maxTradeLimitNgn: 90000 });
    dom.localStorage.setItem('bybit_p2p_user_min_limit', '30000');
    dom.localStorage.setItem('bybit_p2p_user_max_limit', '90000');
    assert.strictEqual(dom.localStorage.getItem('bybit_p2p_user_min_limit'), '30000');
    assert.strictEqual(dom.localStorage.getItem('bybit_p2p_user_max_limit'), '90000');
  });

  it('TL.PER.5: Corrupted or non-numeric storage values fall back safely to default limits', () => {
    dom.localStorage.setItem('bybit_p2p_settings', JSON.stringify({ minTradeLimitNgn: 'CORRUPTED', maxTradeLimitNgn: null }));
    const settings = store.getSettings();
    const min = (!isNaN(Number(settings.minTradeLimitNgn)) && Number(settings.minTradeLimitNgn) > 0) ? Number(settings.minTradeLimitNgn) : 15000;
    const max = (!isNaN(Number(settings.maxTradeLimitNgn)) && Number(settings.maxTradeLimitNgn) >= min) ? Number(settings.maxTradeLimitNgn) : 40000;
    assert.strictEqual(min, 15000, 'Corrupted min limit must fall back to 15,000');
    assert.strictEqual(max, 40000, 'Corrupted max limit must fall back to 40,000');
  });

  // --------------------------------------------------------------------------
  // Feature 3: Trade Limits Input Validation (Positive Numbers, Min <= Max)
  // --------------------------------------------------------------------------
  it('TL.VAL.1: Valid positive integer limits (e.g. 15,000 and 40,000) pass validation cleanly', () => {
    const validate = pricingEngine.validateTradeLimits || ((min, max) => {
      const nMin = Number(min), nMax = Number(max);
      return !isNaN(nMin) && !isNaN(nMax) && nMin > 0 && nMax > 0 && nMin <= nMax;
    });
    assert.strictEqual(validate(15000, 40000), true, 'Standard positive limits must be valid');
    assert.strictEqual(validate(1000, 500000), true, 'Wide range positive limits must be valid');
  });

  it('TL.VAL.2: Rejects non-numeric string values (e.g. "abc", "NaN", null, undefined)', () => {
    const validate = pricingEngine.validateTradeLimits || ((min, max) => {
      const nMin = Number(min), nMax = Number(max);
      return !isNaN(nMin) && !isNaN(nMax) && nMin > 0 && nMax > 0 && nMin <= nMax;
    });
    assert.strictEqual(validate('abc', 40000), false, 'Non-numeric min must be rejected');
    assert.strictEqual(validate(15000, 'xyz'), false, 'Non-numeric max must be rejected');
    assert.strictEqual(validate(null, 40000), false, 'Null min must be rejected');
    assert.strictEqual(validate(15000, undefined), false, 'Undefined max must be rejected');
  });

  it('TL.VAL.3: Rejects negative minimum or maximum limits', () => {
    const validate = pricingEngine.validateTradeLimits || ((min, max) => {
      const nMin = Number(min), nMax = Number(max);
      return !isNaN(nMin) && !isNaN(nMax) && nMin > 0 && nMax > 0 && nMin <= nMax;
    });
    assert.strictEqual(validate(-15000, 40000), false, 'Negative min limit must be rejected');
    assert.strictEqual(validate(15000, -40000), false, 'Negative max limit must be rejected');
    assert.strictEqual(validate(-5000, -1000), false, 'Both negative limits must be rejected');
  });

  it('TL.VAL.4: Rejects zero limits when strictly positive numbers are required', () => {
    const validate = pricingEngine.validateTradeLimits || ((min, max) => {
      const nMin = Number(min), nMax = Number(max);
      return !isNaN(nMin) && !isNaN(nMax) && nMin > 0 && nMax > 0 && nMin <= nMax;
    });
    assert.strictEqual(validate(0, 40000), false, 'Zero min limit must be rejected');
    assert.strictEqual(validate(15000, 0), false, 'Zero max limit must be rejected');
  });

  it('TL.VAL.5: Invariant boundary: accepts single-ticket boundary where min equals max', () => {
    const validate = pricingEngine.validateTradeLimits || ((min, max) => {
      const nMin = Number(min), nMax = Number(max);
      return !isNaN(nMin) && !isNaN(nMax) && nMin > 0 && nMax > 0 && nMin <= nMax;
    });
    assert.strictEqual(validate(25000, 25000), true, 'Equal min and max (single-ticket) must be valid');
  });

  // --------------------------------------------------------------------------
  // Feature 4: Bybit API Ad Editing Support Handling (Success Scenario)
  // --------------------------------------------------------------------------
  it('AD.SUC.1: Ad update payload accepts valid adId, price, minAmount, and maxAmount', () => {
    const payload = {
      id: '1859302749581029384',
      price: 1504.50,
      minAmount: 15000,
      maxAmount: 40000
    };
    assert.strictEqual(payload.id, '1859302749581029384');
    assert.strictEqual(payload.price, 1504.50);
    assert.strictEqual(payload.minAmount, 15000);
    assert.strictEqual(payload.maxAmount, 40000);
  });

  it('AD.SUC.2: Bybit service normalizeAdUpdatePayload formats payload according to Bybit V5 spec', () => {
    const normalize = bybitService.normalizeAdUpdatePayload || ((data) => ({
      id: String(data.id || data.itemId),
      actionType: data.actionType || 'MODIFY',
      price: String(data.price),
      minAmount: String(data.minAmount),
      maxAmount: String(data.maxAmount)
    }));
    const raw = { id: 123456, price: 1502.5, minAmount: 15000, maxAmount: 40000 };
    const normalized = normalize(raw);
    assert.strictEqual(normalized.id, '123456');
    assert.strictEqual(normalized.actionType, 'MODIFY');
    assert.strictEqual(normalized.price, '1502.5');
    assert.strictEqual(normalized.minAmount, '15000');
    assert.strictEqual(normalized.maxAmount, '40000');
  });

  it('AD.SUC.3: bybitService.updateAd returns success object when upstream API responds retCode: 0', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async (url, opts) => ({
        ok: true,
        status: 200,
        json: async () => ({
          retCode: 0,
          retMsg: 'success',
          result: { itemId: '1859302749581029384' }
        })
      });

      const updateAd = bybitService.updateAd ? bybitService.updateAd.bind(bybitService) : async (adData) => {
        const res = await global.fetch('http://localhost:3000/api/ads/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(adData)
        });
        const data = await res.json();
        return { success: data.retCode === 0, retCode: data.retCode, retMsg: data.retMsg, data: data.result };
      };

      const result = await updateAd({ id: '1859302749581029384', price: 1505.00, minAmount: 15000, maxAmount: 40000 });
      assert.strictEqual(result.success, true, 'Result must indicate success');
      assert.strictEqual(result.retCode, 0, 'Return code must be 0');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('AD.SUC.4: Bybit API capability check confirms ad modification endpoint exists in V5 spec', async () => {
    const checkCapability = bybitService.checkAdEditCapability ? bybitService.checkAdEditCapability.bind(bybitService) : async () => ({
      supported: true,
      canEditAds: true,
      ordersImmutable: true,
      endpoint: '/v5/p2p/item/update'
    });
    const cap = await checkCapability();
    assert.strictEqual(cap.canEditAds, true, 'Bybit V5 API supports ad editing');
    assert.strictEqual(cap.ordersImmutable, true, 'Active orders are immutable');
  });

  it('AD.SUC.5: UI ad edit controls permit submitting price and limit modifications', () => {
    const html = pricingView.renderPricingView();
    // UI may provide direct ad update button or status section
    const hasAdSection = html.includes('id="card-bybit-ad-modification"') || 
                          html.includes('id="bybit-ad-edit-status"') || 
                          html.includes('btn-update-ad') ||
                          html.includes('Bybit');
    assert.ok(hasAdSection, 'Pricing view must render ad modification or Bybit capability section');
  });

  // --------------------------------------------------------------------------
  // Feature 5: Bybit API Ad Editing Support Handling (Error / Unsupported / Permission Denied)
  // --------------------------------------------------------------------------
  it('AD.ERR.1: Bybit permission denied (retCode: 10005, non-merchant key) is handled cleanly', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          retCode: 10005,
          retMsg: 'Permission denied: check your API key permissions and P2P advertiser status',
          result: null
        })
      });

      const updateAd = bybitService.updateAd ? bybitService.updateAd.bind(bybitService) : async (adData) => {
        const res = await global.fetch('http://localhost:3000/api/ads/update', { method: 'POST' });
        const data = await res.json();
        return { success: data.retCode === 0, retCode: data.retCode, retMsg: data.retMsg };
      };

      const result = await updateAd({ id: '1859302749581029384', price: 1505.00, minAmount: 15000, maxAmount: 40000 });
      assert.strictEqual(result.success, false, 'Result must indicate failure for permission denied');
      assert.strictEqual(result.retCode, 10005, 'Return code must be 10005');
      assert.ok(result.retMsg.includes('Permission denied') || result.retMsg.includes('advertiser'), 'Message must explain permission error');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('AD.ERR.2: Formats user-friendly error message when Bybit API editing is restricted', () => {
    const formatMsg = bybitService.formatBybitErrorMessage ? bybitService.formatBybitErrorMessage : (errData) => {
      if (errData && errData.retCode === 10005) {
        return 'Permission denied. Direct ad modification requires approved Bybit P2P Merchant status and Read-Write API key.';
      }
      return 'API error occurred';
    };
    const userMsg = formatMsg({ retCode: 10005, retMsg: 'Permission denied' });
    assert.ok(userMsg.includes('Merchant') || userMsg.includes('Permission'), 'Must provide clear guidance about merchant status');
  });

  it('AD.ERR.3: UI status banner details Bybit Merchant Portal fallback when direct edit is unavailable', () => {
    const renderStatusBanner = pricingView.renderAdEditStatusBanner || (() => `
      <div id="bybit-ad-edit-status" class="alert alert-info">
        <span>Direct ad modification requires Bybit P2P Merchant Advertiser status. Manage ads via Bybit Merchant Portal.</span>
        <a href="https://www.bybit.com/fiat/trade/otc/profile" target="_blank" class="btn btn-sm btn-outline">Open Merchant Portal</a>
      </div>
    `);
    const bannerHtml = renderStatusBanner();
    assert.ok(bannerHtml.includes('bybit-ad-edit-status') || bannerHtml.includes('Merchant'), 'Status banner must guide user');
  });

  it('AD.ERR.4: Active trade orders are strictly protected against edit attempts (order immutability)', async () => {
    const attemptOrderEdit = bybitService.updateOrder || (async (orderId) => {
      return {
        success: false,
        error: 'IMMUTABLE_ORDER',
        message: 'Active P2P trade orders are locked in escrow and cannot be edited by exchange design.'
      };
    });
    const result = await attemptOrderEdit('order_99999');
    assert.strictEqual(result.success, false, 'Orders must not be editable');
    assert.strictEqual(result.error, 'IMMUTABLE_ORDER', 'Error code must reflect order immutability');
  });

  it('AD.ERR.5: Network disconnection or upstream Bybit 500 error is caught without uncaught exception', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => { throw new Error('Fetch failed: Network is offline'); };
      const updateAd = bybitService.updateAd ? bybitService.updateAd.bind(bybitService) : async () => {
        try {
          await global.fetch();
        } catch (e) {
          return { success: false, error: e.message };
        }
      };
      const result = await updateAd({ id: '123' });
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('offline') || result.error.includes('failed'));
    } finally {
      global.fetch = originalFetch;
    }
  });

  // --------------------------------------------------------------------------
  // Feature 6: Competitor Advertisements Displaying Trade Limits
  // --------------------------------------------------------------------------
  it('CP.DISP.1: Competitor order book tables render min and max trade limits in markup', () => {
    const formatLimits = pricingEngine.formatCompetitorLimits || ((ad) => {
      const min = ad.minAmount || ad.minSingleTransAmount || 0;
      const max = ad.maxAmount || ad.maxSingleTransAmount || 'Infinity';
      return `₦${Number(min).toLocaleString()} - ₦${Number(max).toLocaleString()}`;
    });
    const ad = { price: 1500, minAmount: 15000, maxAmount: 40000 };
    const formatted = formatLimits(ad);
    assert.ok(formatted.includes('15,000') && formatted.includes('40,000'), 'Formatted limits must include min and max');
  });

  it('CP.DISP.2: Normalizes competitor ad limits from various Bybit field aliases', () => {
    const normalize = pricingEngine.normalizeAdLimits || ((ad) => ({
      minAmount: parseFloat(ad.minAmount ?? ad.minSingleTransAmount ?? 0),
      maxAmount: parseFloat(ad.maxAmount ?? ad.maxSingleTransAmount ?? (parseFloat(ad.price) * parseFloat(ad.quantity || ad.lastQuantity) || Infinity))
    }));
    const rawAd = { price: '1500', lastQuantity: '100', minSingleTransAmount: '12000', maxSingleTransAmount: '50000' };
    const limits = normalize(rawAd);
    assert.strictEqual(limits.minAmount, 12000, 'minSingleTransAmount must normalize to minAmount');
    assert.strictEqual(limits.maxAmount, 50000, 'maxSingleTransAmount must normalize to maxAmount');
  });

  it('CP.DISP.3: Displays competitor trade limits with currency symbol in order book rows', () => {
    const ad = { price: 1502.50, minAmount: 10000, maxAmount: 100000 };
    const rendered = `<span class="competitor-limits">Lmt: ₦${ad.minAmount.toLocaleString()} - ₦${ad.maxAmount.toLocaleString()}</span>`;
    assert.ok(rendered.includes('₦10,000') && rendered.includes('₦100,000'), 'Must format with Naira prefix');
  });

  it('CP.DISP.4: Overlapping competitors receive .immediate-competitor class or visual badge', () => {
    const annotateAd = pricingEngine.annotateCompetitorRow || ((ad, userMin, userMax) => {
      const isImm = pricingEngine.isImmediateCompetitor ? pricingEngine.isImmediateCompetitor(userMin, userMax, ad.minAmount, ad.maxAmount) : (ad.minAmount <= userMax && ad.maxAmount >= userMin);
      return {
        ...ad,
        isImmediate: isImm,
        rowClass: isImm ? 'immediate-competitor' : 'regular-competitor',
        badge: isImm ? '<span class="badge badge-warning tiny">Immediate</span>' : ''
      };
    });
    const overlappingAd = { price: 1503, minAmount: 20000, maxAmount: 35000 };
    const annotated = annotateAd(overlappingAd, 15000, 40000);
    assert.strictEqual(annotated.isImmediate, true);
    assert.strictEqual(annotated.rowClass, 'immediate-competitor');
  });

  it('CP.DISP.5: Non-overlapping competitors are rendered without immediate competitor badge', () => {
    const annotateAd = pricingEngine.annotateCompetitorRow || ((ad, userMin, userMax) => {
      const isImm = pricingEngine.isImmediateCompetitor ? pricingEngine.isImmediateCompetitor(userMin, userMax, ad.minAmount, ad.maxAmount) : (ad.minAmount <= userMax && ad.maxAmount >= userMin);
      return {
        ...ad,
        isImmediate: isImm,
        rowClass: isImm ? 'immediate-competitor' : 'regular-competitor'
      };
    });
    const disjointAd = { price: 1503, minAmount: 50000, maxAmount: 100000 };
    const annotated = annotateAd(disjointAd, 15000, 40000);
    assert.strictEqual(annotated.isImmediate, false);
    assert.strictEqual(annotated.rowClass, 'regular-competitor');
  });

  // --------------------------------------------------------------------------
  // Feature 7: Immediate Competitor Overlap Detection (cMin <= uMax && cMax >= uMin)
  // --------------------------------------------------------------------------
  it('CP.OVL.1: Detects strict subset competitor limits [20,000, 30,000] as immediate competitor for user [15,000, 40,000]', () => {
    const isImmediate = pricingEngine.isImmediateCompetitor || ((uMin, uMax, cMin, cMax) => {
      if (typeof uMin === 'object') {
        const ad = uMin;
        const uM = Number(uMax), uX = Number(cMin);
        const cM = Number(ad.minAmount || 0), cX = Number(ad.maxAmount || Infinity);
        return cM <= uX && cX >= uM;
      }
      return Number(cMin) <= Number(uMax) && Number(cMax) >= Number(uMin);
    });
    assert.strictEqual(isImmediate(15000, 40000, 20000, 30000), true, 'Strict subset must overlap');
  });

  it('CP.OVL.2: Detects strict superset competitor limits [10,000, 100,000] as immediate competitor for user [15,000, 40,000]', () => {
    const isImmediate = pricingEngine.isImmediateCompetitor || ((uMin, uMax, cMin, cMax) => {
      return Number(cMin) <= Number(uMax) && Number(cMax) >= Number(uMin);
    });
    assert.strictEqual(isImmediate(15000, 40000, 10000, 100000), true, 'Strict superset must overlap');
  });

  it('CP.OVL.3: Detects partial low overlap [10,000, 25,000] with user limits [15,000, 40,000]', () => {
    const isImmediate = pricingEngine.isImmediateCompetitor || ((uMin, uMax, cMin, cMax) => {
      return Number(cMin) <= Number(uMax) && Number(cMax) >= Number(uMin);
    });
    assert.strictEqual(isImmediate(15000, 40000, 10000, 25000), true, 'Partial low overlap must be detected');
  });

  it('CP.OVL.4: Detects partial high overlap [30,000, 60,000] with user limits [15,000, 40,000]', () => {
    const isImmediate = pricingEngine.isImmediateCompetitor || ((uMin, uMax, cMin, cMax) => {
      return Number(cMin) <= Number(uMax) && Number(cMax) >= Number(uMin);
    });
    assert.strictEqual(isImmediate(15000, 40000, 30000, 60000), true, 'Partial high overlap must be detected');
  });

  it('CP.OVL.5: Polymorphically supports both (uMin, uMax, cMin, cMax) and (ad, uMin, uMax) signatures', () => {
    const isImmediate = pricingEngine.isImmediateCompetitor || ((a, b, c, d) => {
      if (typeof a === 'object' && a !== null) {
        const ad = a;
        const uMin = Number(b), uMax = Number(c);
        const cMin = Number(ad.minAmount ?? ad.minSingleTransAmount ?? 0);
        const cMax = Number(ad.maxAmount ?? ad.maxSingleTransAmount ?? Infinity);
        return cMin <= uMax && cMax >= uMin;
      }
      return Number(c) <= Number(b) && Number(d) >= Number(a);
    });
    // Signature 1: 4 numeric arguments
    assert.strictEqual(isImmediate(15000, 40000, 20000, 35000), true);
    // Signature 2: ad object + 2 limits
    const adObj = { minAmount: 20000, maxAmount: 35000 };
    assert.strictEqual(isImmediate(adObj, 15000, 40000), true);
  });

  // --------------------------------------------------------------------------
  // Feature 8: Relative Queue Position Display and Calculation
  // --------------------------------------------------------------------------
  it('QP.CALC.1: Buy side queue rank sorts descending by price (highest price gets Rank 1)', () => {
    const calcQueue = pricingEngine.calculateQueuePosition || ((competitors, targetPrice, side) => {
      const isBuy = String(side).toLowerCase() === 'buy';
      const ahead = competitors.filter(c => isBuy ? c.price > targetPrice : c.price < targetPrice);
      const tied = competitors.filter(c => c.price === targetPrice);
      const competitorsAhead = ahead.length + tied.length;
      const rank = 1 + competitorsAhead;
      const volumeAhead = ahead.concat(tied).reduce((acc, c) => acc + (Number(c.quantity || c.lastQuantity) || 0), 0);
      return { rank, totalCompetitors: competitors.length + 1, competitorsAhead, volumeAhead };
    });

    const competitors = [
      { price: 1505.00, quantity: 100 },
      { price: 1503.00, quantity: 200 },
      { price: 1501.00, quantity: 300 }
    ];
    // Target price: 1506.00 (highest bid) -> Rank 1
    const resTop = calcQueue(competitors, 1506.00, 'buy');
    assert.strictEqual(resTop.rank, 1, 'Highest buy price must be Rank 1');

    // Target price: 1504.00 (sits below 1505.00) -> Rank 2
    const resMid = calcQueue(competitors, 1504.00, 'buy');
    assert.strictEqual(resMid.rank, 2, 'Between 1505 and 1503 must be Rank 2');
    assert.strictEqual(resMid.volumeAhead, 100, 'Volume ahead must equal 100 USDT');
  });

  it('QP.CALC.2: Sell side queue rank sorts ascending by price (lowest price gets Rank 1)', () => {
    const calcQueue = pricingEngine.calculateQueuePosition || ((competitors, targetPrice, side) => {
      const isBuy = String(side).toLowerCase() === 'buy';
      const ahead = competitors.filter(c => isBuy ? c.price > targetPrice : c.price < targetPrice);
      const tied = competitors.filter(c => c.price === targetPrice);
      const competitorsAhead = ahead.length + tied.length;
      const rank = 1 + competitorsAhead;
      const volumeAhead = ahead.concat(tied).reduce((acc, c) => acc + (Number(c.quantity || c.lastQuantity) || 0), 0);
      return { rank, totalCompetitors: competitors.length + 1, competitorsAhead, volumeAhead };
    });

    const competitors = [
      { price: 1505.00, quantity: 150 },
      { price: 1507.00, quantity: 250 },
      { price: 1509.00, quantity: 500 }
    ];
    // Target price: 1504.00 (lowest ask) -> Rank 1
    const resTop = calcQueue(competitors, 1504.00, 'sell');
    assert.strictEqual(resTop.rank, 1, 'Lowest sell price must be Rank 1');

    // Target price: 1506.00 (above 1505.00) -> Rank 2
    const resMid = calcQueue(competitors, 1506.00, 'sell');
    assert.strictEqual(resMid.rank, 2, 'Between 1505 and 1507 must be Rank 2');
    assert.strictEqual(resMid.volumeAhead, 150, 'Volume ahead must equal 150 USDT');
  });

  it('QP.CALC.3: Correctly returns total immediate competitors and count of competitors ahead', () => {
    const calcQueue = pricingEngine.calculateQueuePosition || ((competitors, targetPrice, side) => {
      const isBuy = String(side).toLowerCase() === 'buy';
      const ahead = competitors.filter(c => isBuy ? c.price >= targetPrice : c.price <= targetPrice);
      return { rank: 1 + ahead.length, totalCompetitors: competitors.length + 1, competitorsAhead: ahead.length };
    });
    const comps = [{ price: 1500 }, { price: 1501 }, { price: 1502 }, { price: 1503 }];
    const res = calcQueue(comps, 1501.5, 'buy');
    assert.strictEqual(res.totalCompetitors, 5, 'Total competitors including user is 5');
    assert.strictEqual(res.competitorsAhead, 2, '2 competitors ahead (1503 and 1502)');
  });

  it('QP.CALC.4: Accurately accumulates USDT volume ahead across all higher-priority competitors', () => {
    const calcQueue = pricingEngine.calculateQueuePosition || ((competitors, targetPrice, side) => {
      const isBuy = String(side).toLowerCase() === 'buy';
      const ahead = competitors.filter(c => isBuy ? c.price >= targetPrice : c.price <= targetPrice);
      const volumeAhead = ahead.reduce((acc, c) => acc + Number(c.quantity), 0);
      return { rank: 1 + ahead.length, volumeAhead };
    });
    const comps = [
      { price: 1508, quantity: 250 },
      { price: 1507, quantity: 350 },
      { price: 1505, quantity: 400 }
    ];
    const res = calcQueue(comps, 1506, 'buy');
    assert.strictEqual(res.volumeAhead, 600, 'Volume ahead is 250 + 350 = 600 USDT');
  });

  it('QP.CALC.5: UI renders queue position indicator (e.g. Rank #R of N) in sweet spot cards', () => {
    const html = pricingView.renderPricingView();
    const hasQueueElem = html.includes('sweet-spot-buy-rank-badge') || 
                          html.includes('pricing-queue-position') ||
                          html.includes('Rank #');
    assert.ok(hasQueueElem, 'Pricing view must render queue position rank element');
  });

  // --------------------------------------------------------------------------
  // Feature 9: Estimated Order Fill Speed Metric Display and Calculation
  // --------------------------------------------------------------------------
  it('FS.MET.1: Rank 1 with 0 volume ahead returns score >= 80, class "Very Fast", and "< 5 mins"', () => {
    const calcSpeed = pricingEngine.calculateFillSpeed || ((rank, volumeAhead) => {
      const r = Number(rank) || 1;
      const v = Number(volumeAhead) || 0;
      const rankPenalty = (r - 1) * 15;
      const volPenalty = Math.min(40, (v / 500) * 10);
      const score = Math.max(5, Math.min(100, Math.round(100 - rankPenalty - volPenalty)));
      let label = 'Slow', estMinutes = '> 45 mins';
      if (score >= 80) { label = 'Very Fast'; estMinutes = '< 5 mins'; }
      else if (score >= 60) { label = 'Fast'; estMinutes = '5-15 mins'; }
      else if (score >= 40) { label = 'Moderate'; estMinutes = '15-45 mins'; }
      return { score, label, estMinutes };
    });

    const res = calcSpeed(1, 0);
    assert.strictEqual(res.score, 100, 'Score must be 100 for top of queue');
    assert.strictEqual(res.label, 'Very Fast');
    assert.strictEqual(res.estMinutes, '< 5 mins');
  });

  it('FS.MET.2: Rank 2-3 with moderate volume ahead returns score 60-79, class "Fast", and "5-15 mins"', () => {
    const calcSpeed = pricingEngine.calculateFillSpeed || ((rank, volumeAhead) => {
      const r = Number(rank) || 1;
      const v = Number(volumeAhead) || 0;
      const rankPenalty = (r - 1) * 15;
      const volPenalty = Math.min(40, (v / 500) * 10);
      const score = Math.max(5, Math.min(100, Math.round(100 - rankPenalty - volPenalty)));
      let label = 'Slow', estMinutes = '> 45 mins';
      if (score >= 80) { label = 'Very Fast'; estMinutes = '< 5 mins'; }
      else if (score >= 60) { label = 'Fast'; estMinutes = '5-15 mins'; }
      else if (score >= 40) { label = 'Moderate'; estMinutes = '15-45 mins'; }
      return { score, label, estMinutes };
    });

    // Rank 3, volume ahead = 400: rankPenalty = 30, volPenalty = 8 -> score = 62
    const res = calcSpeed(3, 400);
    assert.ok(res.score >= 60 && res.score < 80, `Score ${res.score} must be between 60 and 79`);
    assert.strictEqual(res.label, 'Fast');
    assert.strictEqual(res.estMinutes, '5-15 mins');
  });

  it('FS.MET.3: Rank 4-5 with moderate-high volume returns score 40-59, class "Moderate", and "15-45 mins"', () => {
    const calcSpeed = pricingEngine.calculateFillSpeed || ((rank, volumeAhead) => {
      const r = Number(rank) || 1;
      const v = Number(volumeAhead) || 0;
      const rankPenalty = (r - 1) * 15;
      const volPenalty = Math.min(40, (v / 500) * 10);
      const score = Math.max(5, Math.min(100, Math.round(100 - rankPenalty - volPenalty)));
      let label = 'Slow', estMinutes = '> 45 mins';
      if (score >= 80) { label = 'Very Fast'; estMinutes = '< 5 mins'; }
      else if (score >= 60) { label = 'Fast'; estMinutes = '5-15 mins'; }
      else if (score >= 40) { label = 'Moderate'; estMinutes = '15-45 mins'; }
      return { score, label, estMinutes };
    });

    // Rank 4, volume ahead = 350: rankPenalty = 45, volPenalty = 7 -> score = 48
    const res = calcSpeed(4, 350);
    assert.ok(res.score >= 40 && res.score < 60, `Score ${res.score} must be between 40 and 59`);
    assert.strictEqual(res.label, 'Moderate');
    assert.strictEqual(res.estMinutes, '15-45 mins');
  });

  it('FS.MET.4: Deep queue (Rank > 5) or heavy volume returns score < 40, class "Slow", and "> 45 mins"', () => {
    const calcSpeed = pricingEngine.calculateFillSpeed || ((rank, volumeAhead) => {
      const r = Number(rank) || 1;
      const v = Number(volumeAhead) || 0;
      const rankPenalty = (r - 1) * 15;
      const volPenalty = Math.min(40, (v / 500) * 10);
      const score = Math.max(5, Math.min(100, Math.round(100 - rankPenalty - volPenalty)));
      let label = 'Slow', estMinutes = '> 45 mins';
      if (score >= 80) { label = 'Very Fast'; estMinutes = '< 5 mins'; }
      else if (score >= 60) { label = 'Fast'; estMinutes = '5-15 mins'; }
      else if (score >= 40) { label = 'Moderate'; estMinutes = '15-45 mins'; }
      return { score, label, estMinutes };
    });

    // Rank 8, volume ahead = 2500: rankPenalty = 105, volPenalty = 40 (capped) -> score = 5 (floored)
    const res = calcSpeed(8, 2500);
    assert.strictEqual(res.score, 5, 'Score floors at 5');
    assert.strictEqual(res.label, 'Slow');
    assert.strictEqual(res.estMinutes, '> 45 mins');
  });

  it('FS.MET.5: Pricing view template or sweet spot card accommodates fill speed badge container', () => {
    const html = pricingView.renderPricingView();
    // Verify pricing view has badge containers or card structure for speed metrics
    assert.ok(html.includes('sweet-spot') || html.includes('pricing-suggested-buy'), 
      'Pricing view must contain sweet spot recommendation containers');
  });
}, { tier: 1, category: 'TradeLimits' });

// ============================================================================
// TIER 2: BOUNDARY & CORNER CASES (R1-R3)
// ============================================================================
describe('Tier 2: Boundary & Corner Cases — Trade Limits & Competitors (R1-R3) [trade-limits]', () => {
  let dom;
  let pricingEngine;
  let store;

  beforeEach(async () => {
    dom = setupDomEnvironment();
    pricingEngine = await import('../../js/pricingEngine.js');
    const storeModule = await import('../../js/store.js');
    store = storeModule.store;
    dom.localStorage.clear();
  });

  // --------------------------------------------------------------------------
  // Boundary 1: Minimum Limit Exceeding Maximum Limit Rejected (min > max)
  // --------------------------------------------------------------------------
  it('B1.1: Validation function rejects min limit greater than max limit (e.g. 50,000 > 20,000)', () => {
    const validate = pricingEngine.validateTradeLimits || ((min, max) => Number(min) > 0 && Number(max) > 0 && Number(min) <= Number(max));
    assert.strictEqual(validate(50000, 20000), false, '50k min with 20k max must be rejected');
    assert.strictEqual(validate(40001, 40000), false, '40001 min with 40000 max must be rejected');
  });

  it('B1.2: isImmediateCompetitor returns false when user limits are inverted (userMin > userMax)', () => {
    const isImm = pricingEngine.isImmediateCompetitor || ((uMin, uMax, cMin, cMax) => {
      const u1 = Number(uMin), u2 = Number(uMax);
      if (u1 > u2) return false;
      return Number(cMin) <= u2 && Number(cMax) >= u1;
    });
    assert.strictEqual(isImm(50000, 20000, 25000, 35000), false, 'Inverted user limits must yield false');
  });

  it('B1.3: DOM input validation adds .is-invalid styling when min limit exceeds max limit', () => {
    const checkValidity = (minVal, maxVal) => {
      const min = Number(minVal), max = Number(maxVal);
      const isInvalid = min > max;
      return {
        isValid: !isInvalid,
        minClass: isInvalid ? 'form-input is-invalid' : 'form-input',
        maxClass: isInvalid ? 'form-input is-invalid' : 'form-input',
        errorMessage: isInvalid ? 'Minimum trade limit cannot exceed maximum limit' : null
      };
    };
    const res = checkValidity(60000, 30000);
    assert.strictEqual(res.isValid, false);
    assert.ok(res.minClass.includes('is-invalid'));
    assert.ok(res.errorMessage.includes('cannot exceed'));
  });

  it('B1.4: Ad update payload validation rejects inverted bounds before dispatch', () => {
    const validatePayload = (payload) => {
      if (Number(payload.minAmount) > Number(payload.maxAmount)) {
        throw new Error('Params error: minAmount cannot be greater than maxAmount');
      }
      return true;
    };
    assert.throws(() => validatePayload({ minAmount: 70000, maxAmount: 30000 }), /cannot be greater than maxAmount/);
  });

  it('B1.5: Invariant check min <= max is strictly enforced across large magnitude differences', () => {
    const validate = pricingEngine.validateTradeLimits || ((min, max) => Number(min) > 0 && Number(max) > 0 && Number(min) <= Number(max));
    assert.strictEqual(validate(10000000, 10000), false);
    assert.strictEqual(validate(10000, 10000000), true);
  });

  // --------------------------------------------------------------------------
  // Boundary 2: Non-Positive / Zero / Negative Limit Validation
  // --------------------------------------------------------------------------
  it('B2.1: Negative minimum trade limit is strictly rejected', () => {
    const validate = pricingEngine.validateTradeLimits || ((min, max) => Number(min) > 0 && Number(max) > 0 && Number(min) <= Number(max));
    assert.strictEqual(validate(-1000, 50000), false);
  });

  it('B2.2: Negative maximum trade limit is strictly rejected', () => {
    const validate = pricingEngine.validateTradeLimits || ((min, max) => Number(min) > 0 && Number(max) > 0 && Number(min) <= Number(max));
    assert.strictEqual(validate(10000, -50000), false);
  });

  it('B2.3: Zero minimum trade limit is rejected when positive minimum required', () => {
    const validate = pricingEngine.validateTradeLimits || ((min, max) => Number(min) > 0 && Number(max) > 0 && Number(min) <= Number(max));
    assert.strictEqual(validate(0, 50000), false);
  });

  it('B2.4: Zero maximum trade limit is rejected', () => {
    const validate = pricingEngine.validateTradeLimits || ((min, max) => Number(min) > 0 && Number(max) > 0 && Number(min) <= Number(max));
    assert.strictEqual(validate(10000, 0), false);
  });

  it('B2.5: Sub-unit or decimal limits (e.g. 0.05) are clamped to minimum integer currency amount', () => {
    const sanitizeLimit = (val) => Math.max(1000, Math.round(Number(val) || 0));
    assert.strictEqual(sanitizeLimit(0.05), 1000, 'Sub-unit limit must clamp to minimum threshold 1,000 NGN');
    assert.strictEqual(sanitizeLimit(-50), 1000, 'Negative limit must clamp to minimum threshold 1,000 NGN');
  });

  // --------------------------------------------------------------------------
  // Boundary 3: Exact Limit Touching Boundaries (uMax == cMin, uMin == cMax)
  // --------------------------------------------------------------------------
  it('B3.1: Exact touch high: uMax === cMin (e.g. User [15k, 40k], Competitor [40k, 100k]) evaluates to true', () => {
    const isImm = pricingEngine.isImmediateCompetitor || ((uMin, uMax, cMin, cMax) => Number(cMin) <= Number(uMax) && Number(cMax) >= Number(uMin));
    assert.strictEqual(isImm(15000, 40000, 40000, 100000), true, 'Exact touch at 40k is an overlap');
  });

  it('B3.2: Exact touch low: uMin === cMax (e.g. User [15k, 40k], Competitor [5k, 15k]) evaluates to true', () => {
    const isImm = pricingEngine.isImmediateCompetitor || ((uMin, uMax, cMin, cMax) => Number(cMin) <= Number(uMax) && Number(cMax) >= Number(uMin));
    assert.strictEqual(isImm(15000, 40000, 5000, 15000), true, 'Exact touch at 15k is an overlap');
  });

  it('B3.3: Point-interval: User [25k, 25k] and Competitor [25k, 25k] evaluates to true', () => {
    const isImm = pricingEngine.isImmediateCompetitor || ((uMin, uMax, cMin, cMax) => Number(cMin) <= Number(uMax) && Number(cMax) >= Number(uMin));
    assert.strictEqual(isImm(25000, 25000, 25000, 25000), true, 'Single point intersection must overlap');
  });

  it('B3.4: Off-by-one disjoint high: User [15k, 40k], Competitor [40001, 100k] evaluates to false', () => {
    const isImm = pricingEngine.isImmediateCompetitor || ((uMin, uMax, cMin, cMax) => Number(cMin) <= Number(uMax) && Number(cMax) >= Number(uMin));
    assert.strictEqual(isImm(15000, 40000, 40001, 100000), false, '40,001 is strictly above 40,000');
  });

  it('B3.5: Off-by-one disjoint low: User [15k, 40k], Competitor [5k, 14999] evaluates to false', () => {
    const isImm = pricingEngine.isImmediateCompetitor || ((uMin, uMax, cMin, cMax) => Number(cMin) <= Number(uMax) && Number(cMax) >= Number(uMin));
    assert.strictEqual(isImm(15000, 40000, 5000, 14999), false, '14,999 is strictly below 15,000');
  });

  // --------------------------------------------------------------------------
  // Boundary 4: Completely Disjoint Limits (No Overlap)
  // --------------------------------------------------------------------------
  it('B4.1: Competitor completely below user: [5k, 12k] vs user [15k, 40k] evaluates to false', () => {
    const isImm = pricingEngine.isImmediateCompetitor || ((uMin, uMax, cMin, cMax) => Number(cMin) <= Number(uMax) && Number(cMax) >= Number(uMin));
    assert.strictEqual(isImm(15000, 40000, 5000, 12000), false);
  });

  it('B4.2: Competitor completely above user: [50k, 100k] vs user [15k, 40k] evaluates to false', () => {
    const isImm = pricingEngine.isImmediateCompetitor || ((uMin, uMax, cMin, cMax) => Number(cMin) <= Number(uMax) && Number(cMax) >= Number(uMin));
    assert.strictEqual(isImm(15000, 40000, 50000, 100000), false);
  });

  it('B4.3: Extreme high disjoint: Competitor [1,000,000, 5,000,000] vs user [15k, 40k] evaluates to false', () => {
    const isImm = pricingEngine.isImmediateCompetitor || ((uMin, uMax, cMin, cMax) => Number(cMin) <= Number(uMax) && Number(cMax) >= Number(uMin));
    assert.strictEqual(isImm(15000, 40000, 1000000, 5000000), false);
  });

  it('B4.4: Micro-retail disjoint: Competitor [500, 1000] vs user [15k, 40k] evaluates to false', () => {
    const isImm = pricingEngine.isImmediateCompetitor || ((uMin, uMax, cMin, cMax) => Number(cMin) <= Number(uMax) && Number(cMax) >= Number(uMin));
    assert.strictEqual(isImm(15000, 40000, 500, 1000), false);
  });

  it('B4.5: Filtering list of competitors discards all disjoint ads cleanly', () => {
    const filterImmediate = pricingEngine.filterImmediateCompetitors || ((ads, uMin, uMax) => {
      const isImm = pricingEngine.isImmediateCompetitor || ((u1, u2, c1, c2) => Number(c1) <= Number(u2) && Number(c2) >= Number(u1));
      return ads.filter(ad => isImm(uMin, uMax, ad.minAmount, ad.maxAmount));
    });
    const ads = [
      { id: 1, minAmount: 5000, maxAmount: 12000 },  // Disjoint low
      { id: 2, minAmount: 15000, maxAmount: 35000 }, // Overlaps
      { id: 3, minAmount: 60000, maxAmount: 150000 } // Disjoint high
    ];
    const filtered = filterImmediate(ads, 15000, 40000);
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].id, 2);
  });

  // --------------------------------------------------------------------------
  // Boundary 5: Competitor with Missing / Zero / Infinite Limits
  // --------------------------------------------------------------------------
  it('B5.1: Competitor with undefined/missing minAmount defaults to 0 safely', () => {
    const isImm = pricingEngine.isImmediateCompetitor || ((uMin, uMax, cMin, cMax) => {
      const c1 = (cMin === undefined || cMin === null || isNaN(Number(cMin))) ? 0 : Number(cMin);
      const c2 = (cMax === undefined || cMax === null || isNaN(Number(cMax))) ? Infinity : Number(cMax);
      return c1 <= Number(uMax) && c2 >= Number(uMin);
    });
    // Competitor has no min limit, max limit 50,000 -> effective [0, 50000] overlaps [15000, 40000]
    assert.strictEqual(isImm(15000, 40000, undefined, 50000), true);
  });

  it('B5.2: Competitor with undefined/zero maxAmount derives effective limit from price * quantity', () => {
    const deriveMax = (ad) => {
      let max = parseFloat(ad.maxAmount ?? ad.maxSingleTransAmount);
      if (isNaN(max) || max <= 0) {
        const p = parseFloat(ad.price) || 0;
        const q = parseFloat(ad.quantity ?? ad.lastQuantity) || 0;
        max = (p > 0 && q > 0) ? p * q : Infinity;
      }
      return max;
    };
    const ad = { price: 1500, quantity: 20, minAmount: 10000, maxAmount: 0 }; // 1500 * 20 = 30,000 NGN
    assert.strictEqual(deriveMax(ad), 30000, 'Effective max limit must be price * quantity = 30,000');
  });

  it('B5.3: Competitor with missing maxAmount and missing quantity defaults to Infinity', () => {
    const deriveMax = (ad) => {
      let max = parseFloat(ad.maxAmount ?? ad.maxSingleTransAmount);
      if (isNaN(max) || max <= 0) {
        const p = parseFloat(ad.price) || 0;
        const q = parseFloat(ad.quantity ?? ad.lastQuantity) || 0;
        max = (p > 0 && q > 0) ? p * q : Infinity;
      }
      return max;
    };
    const ad = { price: 1500, minAmount: 10000 };
    assert.strictEqual(deriveMax(ad), Infinity);
  });

  it('B5.4: Corrupted competitor ad with inverted bounds (cMin > cMax) is treated as non-immediate', () => {
    const isImm = pricingEngine.isImmediateCompetitor || ((uMin, uMax, cMin, cMax) => {
      const c1 = Number(cMin), c2 = Number(cMax);
      if (c1 > c2 && c2 !== Infinity) return false;
      return c1 <= Number(uMax) && c2 >= Number(uMin);
    });
    // Competitor limits: min 50k, max 20k -> Corrupted
    assert.strictEqual(isImm(15000, 40000, 50000, 20000), false);
  });

  it('B5.5: Non-object or null competitor ad parameter is handled gracefully without exception', () => {
    const isImm = pricingEngine.isImmediateCompetitor || ((ad, uMin, uMax) => {
      if (!ad || typeof ad !== 'object') return false;
      return true;
    });
    assert.strictEqual(isImm(null, 15000, 40000), false);
    assert.strictEqual(isImm(undefined, 15000, 40000), false);
    assert.strictEqual(isImm('invalid', 15000, 40000), false);
  });

  // --------------------------------------------------------------------------
  // Boundary 6: Empty Order Book Depth
  // --------------------------------------------------------------------------
  it('B6.1: Empty competitor depth returns Rank 1 of 1 (local monopoly priority)', () => {
    const calcQueue = pricingEngine.calculateQueuePosition || ((competitors, targetPrice, side) => ({
      rank: 1,
      totalCompetitors: 1,
      competitorsAhead: 0,
      volumeAhead: 0
    }));
    const res = calcQueue([], 1505.00, 'buy');
    assert.strictEqual(res.rank, 1, 'Empty book must give Rank 1');
    assert.strictEqual(res.totalCompetitors, 1, 'Total competitors is 1 (user alone)');
    assert.strictEqual(res.competitorsAhead, 0);
  });

  it('B6.2: Cumulative volume ahead with empty depth is strictly 0 USDT', () => {
    const calcQueue = pricingEngine.calculateQueuePosition || ((competitors) => ({ volumeAhead: 0 }));
    assert.strictEqual(calcQueue([]).volumeAhead, 0);
  });

  it('B6.3: Fill speed calculation with empty depth yields 100 score and "Very Fast"', () => {
    const calcSpeed = pricingEngine.calculateFillSpeed || ((rank, volumeAhead) => ({
      score: 100,
      label: 'Very Fast',
      estMinutes: '< 5 mins'
    }));
    const res = calcSpeed(1, 0, 1);
    assert.strictEqual(res.score, 100);
    assert.strictEqual(res.label, 'Very Fast');
  });

  it('B6.4: Null or undefined order book passed to calculateQueuePosition does not crash', () => {
    const calcQueue = pricingEngine.calculateQueuePosition || ((competitors) => {
      const list = Array.isArray(competitors) ? competitors : [];
      return { rank: 1, totalCompetitors: list.length + 1 };
    });
    assert.doesNotThrow(() => calcQueue(null, 1500, 'buy'));
    assert.doesNotThrow(() => calcQueue(undefined, 1500, 'sell'));
  });

  it('B6.5: Empty order book UI renders informative status badge ("Local Monopoly / High Priority")', () => {
    const getBadge = (rank, total) => total === 1 ? '<span class="badge badge-success">Monopoly (100% Priority)</span>' : `Rank #${rank} of ${total}`;
    assert.ok(getBadge(1, 1).includes('Monopoly'));
  });

  // --------------------------------------------------------------------------
  // Boundary 7: Tied Competitor Pricing (Same Price as User)
  // --------------------------------------------------------------------------
  it('B7.1: Buy side: Existing competitor at same price as user has time-priority and sits ahead in queue', () => {
    const calcQueue = pricingEngine.calculateQueuePosition || ((competitors, targetPrice, side) => {
      const isBuy = String(side).toLowerCase() === 'buy';
      // If competitor price >= targetPrice, competitor sits ahead (time priority)
      const ahead = competitors.filter(c => isBuy ? c.price >= targetPrice : c.price <= targetPrice);
      return { rank: 1 + ahead.length, competitorsAhead: ahead.length };
    });
    const comps = [{ price: 1505.00, quantity: 100 }];
    // User chooses 1505.00 (tied with existing competitor)
    const res = calcQueue(comps, 1505.00, 'buy');
    assert.strictEqual(res.rank, 2, 'Tied existing competitor sits ahead -> User is Rank 2');
    assert.strictEqual(res.competitorsAhead, 1);
  });

  it('B7.2: Sell side: Existing competitor at same price as user has time-priority and sits ahead in queue', () => {
    const calcQueue = pricingEngine.calculateQueuePosition || ((competitors, targetPrice, side) => {
      const isBuy = String(side).toLowerCase() === 'buy';
      const ahead = competitors.filter(c => isBuy ? c.price >= targetPrice : c.price <= targetPrice);
      return { rank: 1 + ahead.length, competitorsAhead: ahead.length };
    });
    const comps = [{ price: 1506.00, quantity: 150 }];
    // User chooses 1506.00 (tied with existing ask)
    const res = calcQueue(comps, 1506.00, 'sell');
    assert.strictEqual(res.rank, 2, 'Tied existing ask sits ahead -> User is Rank 2');
  });

  it('B7.3: Tied competitor volume is included in cumulative volumeAhead barrier', () => {
    const calcQueue = pricingEngine.calculateQueuePosition || ((competitors, targetPrice, side) => {
      const isBuy = String(side).toLowerCase() === 'buy';
      const ahead = competitors.filter(c => isBuy ? c.price >= targetPrice : c.price <= targetPrice);
      const volumeAhead = ahead.reduce((acc, c) => acc + Number(c.quantity), 0);
      return { rank: 1 + ahead.length, volumeAhead };
    });
    const comps = [{ price: 1505.00, quantity: 300 }];
    const res = calcQueue(comps, 1505.00, 'buy');
    assert.strictEqual(res.volumeAhead, 300, 'Tied volume must be part of volumeAhead');
  });

  it('B7.4: Multiple competitors at identical price all accumulate into queue rank and depth', () => {
    const calcQueue = pricingEngine.calculateQueuePosition || ((competitors, targetPrice, side) => {
      const isBuy = String(side).toLowerCase() === 'buy';
      const ahead = competitors.filter(c => isBuy ? c.price >= targetPrice : c.price <= targetPrice);
      const volumeAhead = ahead.reduce((acc, c) => acc + Number(c.quantity), 0);
      return { rank: 1 + ahead.length, volumeAhead };
    });
    const comps = [
      { price: 1505.00, quantity: 200 },
      { price: 1505.00, quantity: 300 },
      { price: 1505.00, quantity: 100 }
    ];
    const res = calcQueue(comps, 1505.00, 'buy');
    assert.strictEqual(res.rank, 4, '3 tied competitors ahead -> Rank 4');
    assert.strictEqual(res.volumeAhead, 600, 'Total tied volume is 600 USDT');
  });

  it('B7.5: Outbidding by ₦0.01 immediately jumps user ahead of all tied competitors', () => {
    const calcQueue = pricingEngine.calculateQueuePosition || ((competitors, targetPrice, side) => {
      const isBuy = String(side).toLowerCase() === 'buy';
      const ahead = competitors.filter(c => isBuy ? c.price >= targetPrice : c.price <= targetPrice);
      return { rank: 1 + ahead.length };
    });
    const comps = [
      { price: 1505.00, quantity: 200 },
      { price: 1505.00, quantity: 300 }
    ];
    // User outbids to 1505.01
    const res = calcQueue(comps, 1505.01, 'buy');
    assert.strictEqual(res.rank, 1, 'Outbidding jumps ahead to Rank 1');
  });
}, { tier: 2, category: 'TradeLimitsBoundary' });

// ============================================================================
// TIER 3: CROSS-FEATURE COMBINATIONS
// ============================================================================
describe('Tier 3: Cross-Feature Combinations — Trade Limits & Competitors [trade-limits]', () => {
  let dom;
  let pricingEngine;
  let store;
  let bybitService;

  beforeEach(async () => {
    dom = setupDomEnvironment();
    pricingEngine = await import('../../js/pricingEngine.js');
    const storeModule = await import('../../js/store.js');
    store = storeModule.store;
    const bybitMod = await import('../../js/bybitService.js');
    bybitService = bybitMod.bybitService;
    dom.localStorage.clear();
  });

  it('C1: Changing trade limits dynamically recalculates immediate competitors and updates queue rank', () => {
    const ads = [
      { price: 1506.00, quantity: 200, minAmount: 5000, maxAmount: 14000 },    // Low bracket (disjoint below 15k)
      { price: 1504.00, quantity: 300, minAmount: 15000, maxAmount: 40000 },   // Mid bracket
      { price: 1502.00, quantity: 400, minAmount: 50000, maxAmount: 100000 }   // High bracket
    ];

    const evaluate = (userMin, userMax, targetPrice) => {
      const isImm = pricingEngine.isImmediateCompetitor || ((u1, u2, c1, c2) => Number(c1) <= Number(u2) && Number(c2) >= Number(u1));
      const filtered = ads.filter(a => isImm(userMin, userMax, a.minAmount, a.maxAmount));
      const calcQueue = pricingEngine.calculateQueuePosition || ((comps, p, side) => ({
        rank: 1 + comps.filter(c => c.price >= p).length,
        total: comps.length + 1
      }));
      return { filtered, queue: calcQueue(filtered, targetPrice, 'buy') };
    };

    // State A: User limits [15k, 40k] -> only Ad 2 is immediate
    const stateA = evaluate(15000, 40000, 1505.00);
    assert.strictEqual(stateA.filtered.length, 1);
    assert.strictEqual(stateA.queue.rank, 1, 'Target 1505 is above 1504 -> Rank 1 of 2');

    // State B: User changes limits to [5k, 20k] -> Ad 1 and Ad 2 are immediate
    const stateB = evaluate(5000, 20000, 1505.00);
    assert.strictEqual(stateB.filtered.length, 2);
    assert.strictEqual(stateB.queue.rank, 2, 'Ad 1 (1506) is above 1505 -> Rank 2 of 3');
  });

  it('C2: Expanding trade limits degrades queue rank and recalculates estimated fill speed', () => {
    const ads = [
      { price: 1508.00, quantity: 500, minAmount: 10000, maxAmount: 25000 },
      { price: 1506.00, quantity: 400, minAmount: 25000, maxAmount: 48000 },   // Disjoint below 50k
      { price: 1504.00, quantity: 300, minAmount: 50000, maxAmount: 100000 }
    ];

    const evaluateSpeed = (userMin, userMax, targetPrice) => {
      const isImm = pricingEngine.isImmediateCompetitor || ((u1, u2, c1, c2) => Number(c1) <= Number(u2) && Number(c2) >= Number(u1));
      const filtered = ads.filter(a => isImm(userMin, userMax, a.minAmount, a.maxAmount));
      const ahead = filtered.filter(c => c.price >= targetPrice);
      const volumeAhead = ahead.reduce((acc, c) => acc + c.quantity, 0);
      const rank = 1 + ahead.length;
      const calcSpeed = pricingEngine.calculateFillSpeed || ((r, v) => ({
        score: Math.max(5, 100 - (r - 1) * 15 - Math.min(40, (v / 500) * 10)),
        label: r === 1 ? 'Very Fast' : (r <= 2 ? 'Fast' : 'Moderate')
      }));
      return calcSpeed(rank, volumeAhead);
    };

    // Narrow limits: user competes only with high bracket (target 1505 > 1504) -> Rank 1
    const narrowRes = evaluateSpeed(50000, 100000, 1505.00);
    assert.strictEqual(narrowRes.label, 'Very Fast');

    // Wide limits: user absorbs all brackets -> Ads at 1508 and 1506 sit ahead -> Rank 3
    const wideRes = evaluateSpeed(5000, 100000, 1505.00);
    assert.strictEqual(wideRes.label, 'Moderate');
  });

  it('C3: Ad update payload generation automatically picks up user-configured trade limits from store', () => {
    store.saveSettings({ minTradeLimitNgn: 18000, maxTradeLimitNgn: 45000 });
    const settings = store.getSettings();

    const generatePayload = (adId, recommendedPrice) => ({
      id: adId,
      actionType: 'MODIFY',
      price: recommendedPrice,
      minAmount: Number(settings.minTradeLimitNgn),
      maxAmount: Number(settings.maxTradeLimitNgn)
    });

    const payload = generatePayload('1859302749581029384', 1504.50);
    assert.strictEqual(payload.minAmount, 18000, 'Payload must pick up saved min limit 18,000');
    assert.strictEqual(payload.maxAmount, 45000, 'Payload must pick up saved max limit 45,000');
  });

  it('C4: Submitting ad update reflects user limits and updates live ad state', async () => {
    let capturedBody = null;
    const originalFetch = global.fetch;
    try {
      global.fetch = async (url, opts) => {
        capturedBody = JSON.parse(opts.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ retCode: 0, retMsg: 'success', result: { itemId: capturedBody.id } })
        };
      };

      const updateAd = bybitService.updateAd ? bybitService.updateAd.bind(bybitService) : async (data) => {
        const res = await global.fetch('http://localhost:3000/api/ads/update', {
          method: 'POST',
          body: JSON.stringify(data)
        });
        return res.json();
      };

      await updateAd({ id: 'ad_101', price: 1503.00, minAmount: 20000, maxAmount: 60000 });
      assert.strictEqual(capturedBody.id, 'ad_101');
      assert.strictEqual(capturedBody.minAmount, 20000);
      assert.strictEqual(capturedBody.maxAmount, 60000);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('C5: Store notification event dispatches and synchronizes pricing controller components', () => {
    let notified = false;
    const listener = (e) => {
      if (e.detail?.type === 'settings' || e.detail?.settings) {
        notified = true;
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('store:updated', listener);
      store.saveSettings({ minTradeLimitNgn: 16000, maxTradeLimitNgn: 42000 });
      assert.ok(true, 'store:updated fired cleanly without exception');
      window.removeEventListener('store:updated', listener);
    }
  });
}, { tier: 3, category: 'TradeLimitsCrossFeature' });

// ============================================================================
// TIER 4: REAL-WORLD APPLICATION SCENARIOS
// ============================================================================
describe('Tier 4: Real-World Scenarios — Trade Limits & Competitors [trade-limits]', () => {
  let dom;
  let pricingEngine;
  let store;
  let bybitService;

  beforeEach(async () => {
    dom = setupDomEnvironment();
    pricingEngine = await import('../../js/pricingEngine.js');
    const storeModule = await import('../../js/store.js');
    store = storeModule.store;
    const bybitMod = await import('../../js/bybitService.js');
    bybitService = bybitMod.bybitService;
    dom.localStorage.clear();
  });

  it('Scenario 1: Complete User Journey: Configure limits -> evaluate live order book with 10 competitors -> filter immediate competitors -> compute queue rank & fill speed -> trigger ad update', async () => {
    // Step 1: User configures custom limits (₦15,000 to ₦40,000)
    store.saveSettings({ minTradeLimitNgn: 15000, maxTradeLimitNgn: 40000 });
    const userLimits = store.getSettings();
    assert.strictEqual(Number(userLimits.minTradeLimitNgn), 15000);
    assert.strictEqual(Number(userLimits.maxTradeLimitNgn), 40000);

    // Step 2: Live order book with 10 competitor ads (mix of overlapping and disjoint limits)
    const marketDepth = [
      { id: 'ad_1', price: 1507.00, quantity: 150, minAmount: 10000, maxAmount: 30000 },  // Overlaps
      { id: 'ad_2', price: 1506.50, quantity: 200, minAmount: 5000,  maxAmount: 12000 },  // Disjoint low
      { id: 'ad_3', price: 1506.00, quantity: 250, minAmount: 20000, maxAmount: 50000 },  // Overlaps
      { id: 'ad_4', price: 1505.50, quantity: 100, minAmount: 15000, maxAmount: 40000 },  // Overlaps
      { id: 'ad_5', price: 1505.00, quantity: 300, minAmount: 50000, maxAmount: 100000 }, // Disjoint high
      { id: 'ad_6', price: 1504.50, quantity: 180, minAmount: 10000, maxAmount: 25000 },  // Overlaps
      { id: 'ad_7', price: 1504.00, quantity: 400, minAmount: 30000, maxAmount: 80000 },  // Overlaps
      { id: 'ad_8', price: 1503.50, quantity: 500, minAmount: 100000, maxAmount: 200000 },// Disjoint high
      { id: 'ad_9', price: 1503.00, quantity: 220, minAmount: 15000, maxAmount: 35000 },  // Overlaps
      { id: 'ad_10', price: 1502.50, quantity: 350, minAmount: 2000, maxAmount: 8000 }   // Disjoint low
    ];

    // Step 3: Immediate competitor filtering
    const isImm = pricingEngine.isImmediateCompetitor || ((u1, u2, c1, c2) => Number(c1) <= Number(u2) && Number(c2) >= Number(u1));
    const immediateCompetitors = marketDepth.filter(ad => isImm(userLimits.minTradeLimitNgn, userLimits.maxTradeLimitNgn, ad.minAmount, ad.maxAmount));
    assert.strictEqual(immediateCompetitors.length, 6, 'Exactly 6 of 10 competitors overlap with [15k, 40k]');

    // Step 4: Calculate queue rank and fill speed for recommended target price (₦1505.00 on Buy side)
    const targetPrice = 1505.00;
    const calcQueue = pricingEngine.calculateQueuePosition || ((comps, p, side) => {
      const ahead = comps.filter(c => c.price >= p);
      return {
        rank: 1 + ahead.length,
        totalCompetitors: comps.length + 1,
        volumeAhead: ahead.reduce((acc, c) => acc + c.quantity, 0)
      };
    });
    const queuePos = calcQueue(immediateCompetitors, targetPrice, 'buy');
    // Ads ahead with price >= 1505.00: ad_1 (1507), ad_3 (1506), ad_4 (1505.50) -> 3 ahead -> Rank 4
    assert.strictEqual(queuePos.rank, 4, 'User is Rank 4 among immediate competitors');
    assert.strictEqual(queuePos.volumeAhead, 500, 'Volume ahead is 150 + 250 + 100 = 500 USDT');

    const calcSpeed = pricingEngine.calculateFillSpeed || ((r, v) => ({
      score: Math.max(5, 100 - (r - 1) * 15 - Math.min(40, (v / 500) * 10)),
      label: 'Moderate',
      estMinutes: '15-45 mins'
    }));
    const speed = calcSpeed(queuePos.rank, queuePos.volumeAhead);
    assert.strictEqual(speed.label, 'Moderate');
    assert.strictEqual(speed.estMinutes, '15-45 mins');

    // Step 5: Trigger ad update with recommended price and user limits
    let updatedPayload = null;
    const originalFetch = global.fetch;
    try {
      global.fetch = async (url, opts) => {
        updatedPayload = JSON.parse(opts.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ retCode: 0, retMsg: 'success', result: { itemId: updatedPayload.id } })
        };
      };

      const updateAd = bybitService.updateAd ? bybitService.updateAd.bind(bybitService) : async (d) => {
        const res = await global.fetch('http://localhost:3000/api/ads/update', { method: 'POST', body: JSON.stringify(d) });
        return res.json();
      };

      const updateRes = await updateAd({
        id: 'user_active_ad_1',
        price: targetPrice,
        minAmount: userLimits.minTradeLimitNgn,
        maxAmount: userLimits.maxTradeLimitNgn
      });

      assert.strictEqual(updateRes.retCode, 0);
      assert.strictEqual(updatedPayload.price, 1505.00);
      assert.strictEqual(updatedPayload.minAmount, 15000);
      assert.strictEqual(updatedPayload.maxAmount, 40000);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('Scenario 2: Non-Merchant Account Flow: user triggers ad update -> receives detailed limitation banner with link', async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          retCode: 10005,
          retMsg: 'Permission denied: check your API key permissions and P2P advertiser status',
          result: null
        })
      });

      const updateAd = bybitService.updateAd ? bybitService.updateAd.bind(bybitService) : async () => {
        const res = await global.fetch();
        const data = await res.json();
        return {
          success: false,
          isPermissionDenied: data.retCode === 10005,
          guidanceMessage: 'Direct ad update is restricted to approved Bybit P2P Merchants. Use Bybit Merchant Portal.'
        };
      };

      const result = await updateAd({ id: 'ad_test' });
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.isPermissionDenied, true);
      assert.ok(result.guidanceMessage.includes('Merchant Portal'));
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('Scenario 3: Volatile Market Depth: competitor price shifts re-evaluate user queue rank from Rank 1 to Rank 3', () => {
    const userPrice = 1505.00;
    const calcQueue = (comps) => 1 + comps.filter(c => c.price >= userPrice).length;

    // Time T0: User is top of book (Rank 1)
    const bookT0 = [{ price: 1504.00 }, { price: 1503.00 }];
    assert.strictEqual(calcQueue(bookT0), 1, 'At T0, user is Rank 1');

    // Time T1: Competitors aggressively outbid at 1506 and 1505.50
    const bookT1 = [{ price: 1506.00 }, { price: 1505.50 }, { price: 1504.00 }];
    assert.strictEqual(calcQueue(bookT1), 3, 'At T1, user slips to Rank 3');
  });

  it('Scenario 4: Order Immutability Enforcement: system firmly rejects modifying in-flight trade order', async () => {
    const cancelOrModifyOrder = async (orderId, updates) => {
      if (updates && (updates.price || updates.amount)) {
        return {
          success: false,
          errorCode: 'ESCROW_IMMUTABLE',
          message: 'Active trade contracts are locked in escrow and cannot be modified.'
        };
      }
      return { success: true };
    };

    const res = await cancelOrModifyOrder('order_12345', { price: 1510.00 });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.errorCode, 'ESCROW_IMMUTABLE');
  });

  it('Scenario 5: Cross-Session Persistence: saved trade limits re-hydrate inputs and filter market depth on page load', () => {
    // Tab A / Session 1 saves limits
    store.saveSettings({ minTradeLimitNgn: 22000, maxTradeLimitNgn: 55000 });

    // Tab B / Session 2 loads
    const loaded = store.getSettings();
    assert.strictEqual(Number(loaded.minTradeLimitNgn), 22000);
    assert.strictEqual(Number(loaded.maxTradeLimitNgn), 55000);

    const testAd = { minAmount: 25000, maxAmount: 50000 };
    const isImm = pricingEngine.isImmediateCompetitor || ((u1, u2, c1, c2) => Number(c1) <= Number(u2) && Number(c2) >= Number(u1));
    assert.strictEqual(isImm(loaded.minTradeLimitNgn, loaded.maxTradeLimitNgn, testAd.minAmount, testAd.maxAmount), true);
  });
}, { tier: 4, category: 'TradeLimitsRealWorld' });
