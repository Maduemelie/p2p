/**
 * Challenger Suite: Milestone 2 UI Event & Input Fuzzing Stress Test
 * Role: m2_challenger_1 (UI Event & Input Fuzzing Challenger)
 * 
 * Objectives:
 * 1. Boundary and extreme value fuzzing (fee = 0%, 10%, 50%, 100%, negative, extreme spreads, zero/negative volume, zero fiat fees)
 * 2. Settings form submission validation and persistence behavior
 * 3. Clear data reset & storage synchronization
 * 4. Cross-tab & reactive store:updated event simulation
 * 5. UI DOM structure, badge formatting, and limit recommendation rendering
 */

const { describe, it, beforeEach } = require('./harness/test-runner');
const { assert } = require('./harness/assertions');
const { setupDomEnvironment } = require('./harness/dom-mock');

let pricingEngine;
let pricingView;
let settingsView;
let pricingController;
let settingsController;
let bybitMod;
let storeModule;
let store;
let dom;

async function ensureModules() {
  dom = setupDomEnvironment();
  pricingEngine = await import('../js/pricingEngine.js');
  pricingView = await import('../js/views/pricing.view.js');
  settingsView = await import('../js/views/settings.view.js');
  storeModule = await import('../js/store.js');
  store = storeModule.store;
  store.clearAllData();
  pricingController = await import('../js/pricing.js');
  settingsController = await import('../js/settings.js');
  bybitMod = await import('../js/bybitService.js');

  return {
    pricingEngine,
    pricingView,
    settingsView,
    pricingController,
    settingsController,
    bybitMod,
    store,
    dom
  };
}

// =========================================================================
// SECTION 1: UI INPUT BOUNDARY & EXTREME VALUE FUZZING
// =========================================================================
describe('Challenger M2-1 — 1. UI Input Boundary & Extreme Value Fuzzing', () => {

  it('1.1: Fee = 0% (VIP / Promo Zero Maker Fee) computes exact cost basis and zero platform fee drag', async () => {
    const { pricingEngine } = await ensureModules();

    const buyRes = pricingEngine.calculateBuyPricing({
      activeBuyAds: [{ price: '1490.00', lastQuantity: '100' }],
      sortedSellAds: [{ price: '1500.00', lastQuantity: '100' }],
      targetSpread: 5.0,
      inflowFee: 50.0,
      outflowFee: 50.0,
      platformFeePct: 0.0,
      avgVolume: 100.0
    });

    // Exit price = 1500, phi = 0
    // netExitRevenue = 1500 - (50/100) = 1499.50
    // maxBuyPrice = 1499.50 - 5.0 - 0.50 = 1494.00
    // rawSuggestedBuy = 1490.00 + 0.10 = 1490.10
    // suggestedBuy = min(1490.10, 1494.00) = 1490.10
    assert.strictEqual(buyRes.exitPrice, 1500);
    assert.strictEqual(buyRes.maxBuyPrice, 1494.00);
    assert.strictEqual(buyRes.suggestedBuy, 1490.10);
    assert.strictEqual(buyRes.isSafe, true);
    assert.strictEqual(buyRes.feeBreakdown.platformFeePerUnit, 0);
    assert.strictEqual(buyRes.feeBreakdown.inflowFeePerUnit, 0.50);
    assert.strictEqual(buyRes.feeBreakdown.effectiveCostBasis, 1490.10 + 0.50);

    const sellRes = pricingEngine.calculateSellPricing({
      activeSellAds: [{ price: '1505.00', lastQuantity: '100' }],
      costBasis: 1490.00,
      targetSpread: 5.0,
      outflowFee: 50.0,
      platformFeePct: 0.0,
      avgVolume: 100.0
    });

    // breakEven = 1490.00 + (50/100) = 1490.50
    // targetSellPrice = 1490.00 + 5.0 + 0.50 = 1495.50
    // rawSuggestedSell = 1505.00 - 0.10 = 1504.90
    // suggestedSell = max(1504.90, 1495.50) = 1504.90
    assert.strictEqual(sellRes.breakEven, 1490.50);
    assert.strictEqual(sellRes.targetSellPrice, 1495.50);
    assert.strictEqual(sellRes.suggestedSell, 1504.90);
    assert.strictEqual(sellRes.isSafe, true);
    assert.strictEqual(sellRes.feeBreakdown.platformFeePerUnit, 0);
    assert.strictEqual(sellRes.feeBreakdown.fiatFeePerUnit, 0.50);
  });

  it('1.2: Fee = 10.0% (UI Maximum Constraint) executes without NaN and preserves spread protection', async () => {
    const { pricingEngine } = await ensureModules();

    const buyRes = pricingEngine.calculateBuyPricing({
      activeBuyAds: [{ price: '1300.00', lastQuantity: '100' }],
      sortedSellAds: [{ price: '1500.00', lastQuantity: '100' }],
      targetSpread: 10.0,
      inflowFee: 50.0,
      outflowFee: 50.0,
      platformFeePct: 10.0, // 10% -> phi = 0.10
      avgVolume: 100.0
    });

    // phi = 0.10, 1 - phi = 0.90
    // netExitRevenue = (1500 * 0.90) - 0.50 = 1350 - 0.50 = 1349.50
    // maxBuyPrice = 0.90 * (1349.50 - 10.0 - 0.50) = 0.90 * 1339.00 = 1205.10
    assert.closeTo(buyRes.maxBuyPrice, 1205.10, 0.01);
    assert.strictEqual(isNaN(buyRes.maxBuyPrice), false);
    assert.strictEqual(isFinite(buyRes.maxBuyPrice), true);

    const sellRes = pricingEngine.calculateSellPricing({
      activeSellAds: [{ price: '1800.00', lastQuantity: '100' }],
      costBasis: 1400.00,
      targetSpread: 10.0,
      outflowFee: 50.0,
      platformFeePct: 10.0,
      avgVolume: 100.0
    });

    // targetSellPrice = (1400 + 10 + 0.50) / 0.90 = 1410.50 / 0.90 = 1567.222...
    assert.closeTo(sellRes.targetSellPrice, 1567.22, 0.05);
    assert.strictEqual(isNaN(sellRes.targetSellPrice), false);
    assert.strictEqual(isFinite(sellRes.targetSellPrice), true);
  });

  it('1.3: Extreme high fee (50% and 99%) guards against division by zero and preserves mathematical invariants', async () => {
    const { pricingEngine } = await ensureModules();

    const buyRes99 = pricingEngine.calculateBuyPricing({
      activeBuyAds: [{ price: '10.00', lastQuantity: '100' }],
      sortedSellAds: [{ price: '1500.00', lastQuantity: '100' }],
      targetSpread: 5.0,
      platformFeePct: 99.0, // 99% -> phi = 0.99, 1 - phi = 0.01
      avgVolume: 100.0
    });

    assert.strictEqual(isNaN(buyRes99.maxBuyPrice), false);
    assert.strictEqual(isFinite(buyRes99.maxBuyPrice), true);

    const sellRes99 = pricingEngine.calculateSellPricing({
      activeSellAds: [{ price: '200000.00', lastQuantity: '100' }],
      costBasis: 1000.00,
      targetSpread: 5.0,
      platformFeePct: 99.0,
      avgVolume: 100.0
    });

    assert.strictEqual(isNaN(sellRes99.targetSellPrice), false);
    assert.strictEqual(isFinite(sellRes99.targetSellPrice), true);
    assert.ok(sellRes99.targetSellPrice > 100000);
  });

  it('1.4: Fee = 100% boundary edge does not divide by zero due to divisor floor (0.0001)', async () => {
    const { pricingEngine } = await ensureModules();

    const sellRes100 = pricingEngine.calculateSellPricing({
      activeSellAds: [{ price: '1500.00', lastQuantity: '100' }],
      costBasis: 1000.00,
      targetSpread: 5.0,
      platformFeePct: 100.0, // 100% -> phi = 1.0, 1 - phi = 0 -> clamped to 0.0001
      avgVolume: 100.0
    });

    assert.strictEqual(isNaN(sellRes100.targetSellPrice), false);
    assert.strictEqual(isFinite(sellRes100.targetSellPrice), true);
  });

  it('1.5: Negative fees and NaN/corrupted fee inputs safely normalize to 0% fee rate', async () => {
    const { pricingEngine } = await ensureModules();

    const invalidFees = [-5, -0.3, NaN, null, undefined, 'garbage', {}];

    invalidFees.forEach(fee => {
      const res = pricingEngine.calculateBuyPricing({
        activeBuyAds: [{ price: '1490.00', lastQuantity: '100' }],
        sortedSellAds: [{ price: '1500.00', lastQuantity: '100' }],
        targetSpread: 5.0,
        inflowFee: 50.0,
        outflowFee: 50.0,
        platformFeePct: fee,
        avgVolume: 100.0
      });

      assert.strictEqual(isNaN(res.maxBuyPrice), false, `Fee ${fee} produced NaN`);
      assert.strictEqual(isFinite(res.maxBuyPrice), true, `Fee ${fee} produced non-finite`);
      // When fee normalized to 0, maxBuyPrice is 1494.00
      assert.strictEqual(res.maxBuyPrice, 1494.00);
    });
  });

  it('1.6: Extreme spreads (0.01 NGN, 10,000 NGN, 0 NGN, negative) produce deterministic capped/floored pricing', async () => {
    const { pricingEngine } = await ensureModules();

    // Very tight spread (0.01 NGN)
    const tightBuy = pricingEngine.calculateBuyPricing({
      activeBuyAds: [{ price: '1490.00', lastQuantity: '100' }],
      sortedSellAds: [{ price: '1500.00', lastQuantity: '100' }],
      targetSpread: 0.01,
      platformFeePct: 0.3,
      avgVolume: 100.0
    });
    assert.strictEqual(isNaN(tightBuy.maxBuyPrice), false);

    // Huge spread (1,000 NGN)
    const hugeBuy = pricingEngine.calculateBuyPricing({
      activeBuyAds: [{ price: '1490.00', lastQuantity: '100' }],
      sortedSellAds: [{ price: '1500.00', lastQuantity: '100' }],
      targetSpread: 1000.0,
      platformFeePct: 0.3,
      avgVolume: 100.0
    });
    assert.strictEqual(isNaN(hugeBuy.maxBuyPrice), false);
    // Because reference price (1490.10) exceeds maxBuyPrice, it is capped and marked compressed
    assert.strictEqual(hugeBuy.isSafe, false);
    assert.strictEqual(hugeBuy.suggestedBuy, hugeBuy.maxBuyPrice);
    assert.strictEqual(hugeBuy.status, 'COMPRESSED');
  });

  it('1.7: Zero and negative transaction volumes default to 100 USDT safe volume to prevent division by zero', async () => {
    const { pricingEngine } = await ensureModules();

    const zeroVols = [0, -50, -0.0001, NaN, null, undefined];

    zeroVols.forEach(vol => {
      const buyRes = pricingEngine.calculateBuyPricing({
        activeBuyAds: [{ price: '1490.00', lastQuantity: '100' }],
        sortedSellAds: [{ price: '1500.00', lastQuantity: '100' }],
        inflowFee: 50.0,
        outflowFee: 50.0,
        platformFeePct: 0.3,
        avgVolume: vol
      });

      assert.strictEqual(isNaN(buyRes.maxBuyPrice), false, `Vol ${vol} produced NaN`);
      assert.strictEqual(isFinite(buyRes.maxBuyPrice), true, `Vol ${vol} produced Infinity`);
      // Inflow fee per unit should be 50 / 100 = 0.50
      assert.strictEqual(buyRes.feeBreakdown.inflowFeePerUnit, 0.50);
    });
  });

  it('1.8: Zero fiat transfer fees (inflowFee = 0, outflowFee = 0) compute zero fiat drag and positive limits', async () => {
    const { pricingEngine } = await ensureModules();

    const buyRes = pricingEngine.calculateBuyPricing({
      activeBuyAds: [{ price: '1490.00', lastQuantity: '100' }],
      sortedSellAds: [{ price: '1500.00', lastQuantity: '100' }],
      targetSpread: 5.0,
      inflowFee: 0,
      outflowFee: 0,
      platformFeePct: 0.3,
      avgVolume: 100.0
    });

    assert.strictEqual(buyRes.feeBreakdown.inflowFeePerUnit, 0);
    assert.strictEqual(buyRes.feeBreakdown.outflowFeePerUnit, 0);
    assert.strictEqual(buyRes.feeBreakdown.fiatFeePerUnit, 0);

    const limits = pricingEngine.calculateRecommendedLimits(1500.0, 5.0, 0);
    assert.strictEqual(limits.minUsdtLimit, 2.0, 'Enforces dust limit floor of 2.0 USDT');
    assert.strictEqual(limits.minFiatLimit, 3000);
  });
});

// =========================================================================
// SECTION 2: SETTINGS FORM SUBMISSION & VALIDATION STRESS
// =========================================================================
describe('Challenger M2-1 — 2. Settings Form Submission & Validation Stress', () => {

  it('2.1: Submitting #form-fee-defaults with standard parameters updates store, localStorage, and triggers toast', async () => {
    const { dom, settingsView, settingsController, store } = await ensureModules();

    // Render Settings View DOM
    dom.document.body.innerHTML = settingsView.renderSettingsView();
    settingsController.initSettings();

    const inputFee = dom.document.getElementById('input-setting-platform-fee');
    const inputInflow = dom.document.getElementById('input-setting-inflow-fee');
    const inputOutflow = dom.document.getElementById('input-setting-outflow-fee');
    const inputSpread = dom.document.getElementById('input-setting-target-spread');
    const inputVol = dom.document.getElementById('input-setting-target-volume');
    const form = dom.document.getElementById('form-fee-defaults');

    assert.ok(form, '#form-fee-defaults must exist in settings view');
    assert.ok(inputFee, '#input-setting-platform-fee must exist');

    // Modify inputs
    inputFee.value = '0.45';
    inputInflow.value = '75';
    inputOutflow.value = '25';
    inputSpread.value = '8.5';
    inputVol.value = '250';

    let toastMessage = null;
    dom.window.showToast = (msg, type) => {
      toastMessage = { msg, type };
    };

    // Dispatch submit event
    form.dispatchEvent({ type: 'submit', preventDefault: () => {} });

    // Verify store settings updated
    const saved = store.getSettings();
    assert.strictEqual(saved.platformFeePct, 0.45);
    assert.strictEqual(saved.inflowFee, 75);
    assert.strictEqual(saved.outflowFee, 25);
    assert.strictEqual(saved.targetSpread, 8.5);
    assert.strictEqual(saved.avgVolume, 250);

    // Verify localStorage updated
    assert.strictEqual(dom.window.localStorage.getItem('bybit_p2p_pricing_platform_fee_pct'), '0.45');
    assert.strictEqual(dom.window.localStorage.getItem('bybit_p2p_pricing_inflow'), '75');
    assert.strictEqual(dom.window.localStorage.getItem('bybit_p2p_pricing_outflow'), '25');
    assert.strictEqual(dom.window.localStorage.getItem('bybit_p2p_pricing_spread'), '8.5');
    assert.strictEqual(dom.window.localStorage.getItem('bybit_p2p_pricing_volume'), '250');

    // Verify toast
    assert.ok(toastMessage);
    assert.strictEqual(toastMessage.type, 'success');
  });

  it('2.2: Submitting #form-fee-defaults with boundary values (fee = 0.01%, 10.0%, volume = 10,000)', async () => {
    const { dom, settingsView, settingsController, store } = await ensureModules();

    dom.document.body.innerHTML = settingsView.renderSettingsView();
    settingsController.initSettings();

    const inputFee = dom.document.getElementById('input-setting-platform-fee');
    const inputInflow = dom.document.getElementById('input-setting-inflow-fee');
    const inputOutflow = dom.document.getElementById('input-setting-outflow-fee');
    const inputSpread = dom.document.getElementById('input-setting-target-spread');
    const inputVol = dom.document.getElementById('input-setting-target-volume');
    const form = dom.document.getElementById('form-fee-defaults');

    inputFee.value = '10.00';
    inputInflow.value = '500';
    inputOutflow.value = '500';
    inputSpread.value = '50.0';
    inputVol.value = '10000';

    form.dispatchEvent({ type: 'submit', preventDefault: () => {} });

    const saved = store.getSettings();
    assert.strictEqual(saved.platformFeePct, 10.0);
    assert.strictEqual(saved.inflowFee, 500);
    assert.strictEqual(saved.outflowFee, 500);
    assert.strictEqual(saved.targetSpread, 50.0);
    assert.strictEqual(saved.avgVolume, 10000);
  });

  it('2.3: Submitting #form-opening-inventory persists starting USDT and cost basis', async () => {
    const { dom, settingsView, settingsController, store } = await ensureModules();

    dom.document.body.innerHTML = settingsView.renderSettingsView();
    settingsController.initSettings();

    const inputUsdt = dom.document.getElementById('input-opening-usdt');
    const inputCost = dom.document.getElementById('input-opening-cost-basis');
    const form = dom.document.getElementById('form-opening-inventory');

    assert.ok(form, '#form-opening-inventory must exist');

    inputUsdt.value = '500.25';
    inputCost.value = '1485.50';

    let toastCalled = false;
    dom.window.showToast = () => { toastCalled = true; };

    form.dispatchEvent({ type: 'submit', preventDefault: () => {} });

    const inv = store.getOpeningInventory();
    assert.strictEqual(inv.startingUsdtBalance, 500.25);
    assert.strictEqual(inv.defaultCostBasis, 1485.50);
    assert.strictEqual(toastCalled, true);
  });
});

// =========================================================================
// SECTION 3: CLEAR DATA RESET & STORAGE SYNCHRONIZATION
// =========================================================================
describe('Challenger M2-1 — 3. Clear Data Reset & Storage Synchronization', () => {

  it('3.1: #btn-clear-all-data wipes journal data and resets Settings inputs to default values', async () => {
    const { dom, settingsView, settingsController, store } = await ensureModules();

    dom.document.body.innerHTML = settingsView.renderSettingsView();
    settingsController.initSettings();

    // Populate initial dirty state
    store.saveSettings({
      platformFeePct: 0.75,
      inflowFee: 150,
      outflowFee: 150,
      targetSpread: 12.0,
      avgVolume: 500
    });
    store.setOpeningInventory({
      startingUsdtBalance: 1000,
      defaultCostBasis: 1450
    });

    const inputFee = dom.document.getElementById('input-setting-platform-fee');
    const inputInflow = dom.document.getElementById('input-setting-inflow-fee');
    const inputOutflow = dom.document.getElementById('input-setting-outflow-fee');
    const inputSpread = dom.document.getElementById('input-setting-target-spread');
    const inputVol = dom.document.getElementById('input-setting-target-volume');
    const inputUsdt = dom.document.getElementById('input-opening-usdt');
    const inputCost = dom.document.getElementById('input-opening-cost-basis');
    const btnClear = dom.document.getElementById('btn-clear-all-data');

    assert.ok(btnClear, '#btn-clear-all-data must exist');

    // Mock confirm modal to immediately accept
    dom.window.showConfirmModal = (title, message, onConfirm) => {
      onConfirm();
    };

    btnClear.dispatchEvent({ type: 'click' });

    // Check that store is cleared
    assert.strictEqual(store.getTrades().length, 0);

    // Check that input values in DOM were reset to default strings
    assert.strictEqual(inputFee.value, '0.30');
    assert.strictEqual(inputInflow.value, '50');
    assert.strictEqual(inputOutflow.value, '50');
    assert.strictEqual(inputSpread.value, '5.0');
    assert.strictEqual(inputVol.value, '100');
    assert.strictEqual(inputUsdt.value, '');
    assert.strictEqual(inputCost.value, '');
  });

  it('3.2: External store:updated event triggers reactive refresh of Settings form fields', async () => {
    const { dom, settingsView, settingsController, store } = await ensureModules();

    dom.document.body.innerHTML = settingsView.renderSettingsView();
    settingsController.initSettings();

    const inputFee = dom.document.getElementById('input-setting-platform-fee');
    const inputInflow = dom.document.getElementById('input-setting-inflow-fee');

    // Simulate store update from another component or import
    store.saveSettings({
      platformFeePct: 0.25,
      inflowFee: 30
    });

    // Verify fields updated after store:updated was notified
    assert.strictEqual(inputFee.value, '0.25');
    assert.strictEqual(inputInflow.value, '30');
  });
});

// =========================================================================
// SECTION 4: CROSS-TAB & REACTIVE PRICING CONTROLLER SYNCHRONIZATION
// =========================================================================
describe('Challenger M2-1 — 4. Cross-Tab & Reactive Pricing Controller Synchronization', () => {

  it('4.1: Updating settings in store triggers Pricing Assistant loadSavedSettings and calculateMargins', async () => {
    const { dom, pricingView, pricingController, store } = await ensureModules();

    dom.document.body.innerHTML = pricingView.renderPricingView();
    pricingController.initPricing();

    const elFee = dom.document.getElementById('input-platform-fee-pct');
    const elSpread = dom.document.getElementById('input-target-spread');
    const elVol = dom.document.getElementById('input-avg-volume');
    const elInflow = dom.document.getElementById('input-inflow-fee');
    const elOutflow = dom.document.getElementById('input-outflow-fee');

    assert.ok(elFee, '#input-platform-fee-pct must exist');
    assert.ok(elSpread, '#input-target-spread must exist');

    // Trigger saveSettings in store
    store.saveSettings({
      platformFeePct: 0.50,
      targetSpread: 7.5,
      avgVolume: 200,
      inflowFee: 60,
      outflowFee: 40
    });

    // Pricing view inputs should be reloaded via loadSavedSettings()
    assert.strictEqual(elFee.value, '0.5');
    assert.strictEqual(elSpread.value, '7.5');
    assert.strictEqual(elVol.value, '200');
    assert.strictEqual(elInflow.value, '60');
    assert.strictEqual(elOutflow.value, '40');
  });

  it('4.2: Input event on Pricing Assistant controls dynamically updates localStorage and store', async () => {
    const { dom, pricingView, pricingController, store } = await ensureModules();

    dom.document.body.innerHTML = pricingView.renderPricingView();
    pricingController.initPricing();

    const elFee = dom.document.getElementById('input-platform-fee-pct');
    elFee.value = '0.35';
    elFee.dispatchEvent({ type: 'input' });

    assert.strictEqual(dom.window.localStorage.getItem('bybit_p2p_pricing_platform_fee_pct'), '0.35');
    const saved = store.getSettings();
    assert.strictEqual(saved.platformFeePct, 0.35);
  });
});

// =========================================================================
// SECTION 5: DOM TEMPLATE INTEGRITY & PRICING UI BINDINGS
// =========================================================================
describe('Challenger M2-1 — 5. DOM Template Integrity & Pricing UI Bindings', () => {

  it('5.1: renderPricingView() contains all mandatory Milestone 2 elements and attributes', async () => {
    const { pricingView, dom } = await ensureModules();

    dom.document.body.innerHTML = pricingView.renderPricingView();

    const requiredIds = [
      'input-platform-fee-pct',
      'pricing-buy-maker-badge',
      'pricing-buy-fee-breakdown',
      'pricing-buy-platform-fee',
      'pricing-buy-inflow-fee-unit',
      'pricing-buy-effective-cost',
      'pricing-recommended-buy-limit',
      'pricing-buy-limit-rec',
      'pricing-sell-maker-badge',
      'pricing-sell-fee-breakdown',
      'pricing-sell-platform-fee',
      'pricing-sell-outflow-fee-unit',
      'pricing-sell-net-revenue',
      'pricing-recommended-sell-limit',
      'pricing-sell-limit-rec'
    ];

    requiredIds.forEach(id => {
      const el = dom.document.getElementById(id);
      assert.ok(el, `Element with ID #${id} must be present in renderPricingView()`);
    });

    const feeInput = dom.document.getElementById('input-platform-fee-pct');
    assert.strictEqual(feeInput.getAttribute('type'), 'number');
    assert.strictEqual(feeInput.getAttribute('step'), '0.01');
    assert.strictEqual(feeInput.getAttribute('min'), '0');
    assert.strictEqual(feeInput.getAttribute('max'), '10');
  });

  it('5.2: renderSettingsView() contains #form-fee-defaults and all required input fields', async () => {
    const { settingsView, dom } = await ensureModules();

    dom.document.body.innerHTML = settingsView.renderSettingsView();

    const requiredIds = [
      'form-fee-defaults',
      'input-setting-platform-fee',
      'input-setting-inflow-fee',
      'input-setting-outflow-fee',
      'input-setting-target-spread',
      'input-setting-target-volume',
      'btn-save-fee-defaults'
    ];

    requiredIds.forEach(id => {
      const el = dom.document.getElementById(id);
      assert.ok(el, `Element with ID #${id} must be present in renderSettingsView()`);
    });

    const feeInput = dom.document.getElementById('input-setting-platform-fee');
    assert.strictEqual(feeInput.getAttribute('type'), 'number');
    assert.strictEqual(feeInput.getAttribute('step'), '0.01');
    assert.strictEqual(feeInput.getAttribute('min'), '0');
    assert.strictEqual(feeInput.getAttribute('max'), '10');
  });

  it('5.3: Pricing calculateMargins updates Buy & Sell Maker Badges, Fee Breakdown pills, and Limit Advisors', async () => {
    const { dom, pricingView, pricingController, bybitMod, store } = await ensureModules();

    dom.document.body.innerHTML = pricingView.renderPricingView();
    pricingController.initPricing();

    // Set up mock competitor data and inventory
    store.setOpeningInventory({
      startingUsdtBalance: 100,
      defaultCostBasis: 1490.00
    });

    // Set input values
    const elFee = dom.document.getElementById('input-platform-fee-pct');
    elFee.value = '0.30';

    // Mock cached market depth by refreshing with dummy ads
    const depth = {
      buyDepth: [
        { price: '1495.00', lastQuantity: '100', minAmount: '1000', maxAmount: '500000', nickName: 'MerchantA' }
      ],
      sellDepth: [
        { price: '1500.00', lastQuantity: '100', minAmount: '1000', maxAmount: '500000', nickName: 'MerchantB' }
      ]
    };
    bybitMod.bybitService.fetchMarketDepth = async () => depth;
    await pricingController.refreshPricingData();

    const badgeBuy = dom.document.getElementById('pricing-buy-maker-badge');
    const badgeSell = dom.document.getElementById('pricing-sell-maker-badge');

    assert.strictEqual(badgeBuy.textContent, '0.30% Maker Fee');
    assert.strictEqual(badgeSell.textContent, '0.00% Maker Fee');

    const buyBreakdown = dom.document.getElementById('pricing-buy-fee-breakdown');
    assert.ok(buyBreakdown.innerHTML.includes('Maker Fee: ₦'));
    assert.ok(buyBreakdown.innerHTML.includes('Fiat Inflow: ₦'));
    assert.ok(buyBreakdown.innerHTML.includes('Net Cost Basis: ₦'));
  });
}, { tier: 5, category: 'M2 UI Event & Input Fuzzing Stress' });
