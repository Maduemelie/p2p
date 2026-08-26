/**
 * Adversarial Modal Validation & Rate Recalculation Stress Test Suite for Milestone 3 (M3)
 * (M3: End Day / Save Snapshot Modal, Rate Validation, Live Recalculation & Persistence)
 * Executed by m3_challenger_1 (Milestone 3 Modal Validation Challenger)
 */

const { describe, it, beforeEach } = require('./harness/test-runner');
const { assert } = require('./harness/assertions');
const { setupDomEnvironment } = require('./harness/dom-mock');

let utils;
let store;
let modalsView;
let dashboardView;
let dashboardModule;
let bybitServiceModule;
let dom;

let toastLogs = [];

async function setupTestEnvironment(options = {}) {
  dom = setupDomEnvironment();
  utils = await import('../js/utils.js');
  const storeMod = await import('../js/store.js');
  store = storeMod.store;
  modalsView = await import('../js/views/modals.view.js');
  dashboardView = await import('../js/views/dashboard.view.js');
  dashboardModule = await import('../js/dashboard.js');
  bybitServiceModule = await import('../js/bybitService.js');

  store.clearAllData();
  toastLogs = [];

  // Mock global toast
  window.showToast = (msg, type) => {
    toastLogs.push({ msg, type });
  };

  // Mock Bybit service
  bybitServiceModule.bybitService.fetchFundingBalance = async () => {
    if (options.fundingBalance !== undefined) return options.fundingBalance;
    throw new Error('Offline default');
  };
  bybitServiceModule.bybitService.fetchActiveAds = async () => {
    if (options.activeAds !== undefined) return options.activeAds;
    throw new Error('Offline default');
  };

  // Render DOM container with both dashboard view and modals view
  const container = document.getElementById('view-container') || document.body;
  container.innerHTML = `
    <div id="main-content">
      ${dashboardView.renderDashboardView()}
    </div>
    <div id="modals-container">
      ${modalsView.renderModalsView()}
    </div>
    <div id="toast-container"></div>
  `;

  const canvas = document.getElementById('pnlChart');
  if (canvas) {
    canvas.getContext = () => ({
      createLinearGradient: () => ({ addColorStop: () => {} }),
      clearRect: () => {},
      fillRect: () => {}
    });
  }

  return { utils, store, modalsView, dashboardView, dashboardModule, bybitServiceModule };
}

// =========================================================================
// SECTION 1: Non-Positive, Non-Numeric, and Malformed Rates Validation
// =========================================================================
describe('Challenger M3 Modal — 1. Non-Positive, Non-Numeric & Malformed Rate Validation', () => {
  beforeEach(async () => {
    await setupTestEnvironment();
  });

  it('1.1: Rate = 0 rejects submission, displays error toast, adds error classes, and preserves modal state', async () => {
    const bank = store.addBankAccount({ name: 'GTB', initialBalance: 1500000 });
    store.setOpeningInventory({ startingUsdtBalance: 1000, defaultCostBasis: 1500 });

    dashboardModule.initDashboard();
    dashboardModule.openSnapshotModal();

    const inputRate = document.getElementById('input-snapshot-ref-rate');
    const form = document.getElementById('form-save-snapshot');
    const warning = document.getElementById('snapshot-rate-warning');
    const backdrop = document.getElementById('modal-snapshot-backdrop');

    // Enter rate 0
    inputRate.value = '0';
    dashboardModule.handleSnapshotRateInput();

    // Check live preview error warning
    assert.strictEqual(warning.classList.contains('hidden'), false, 'Warning message must be visible on rate 0');
    assert.strictEqual(warning.textContent, 'Please enter a valid exchange rate greater than 0.');

    // Submit form
    form.dispatchEvent(new CustomEvent('submit', { cancelable: true }));

    // Verify rejection
    const snapshots = store.getSnapshots();
    assert.strictEqual(snapshots.length, 0, 'No snapshot should be created on rate 0');
    assert.strictEqual(backdrop.classList.contains('hidden'), false, 'Modal must remain open after failed submit');
    assert.ok(toastLogs.some(t => t.type === 'error' && t.msg.includes('greater than 0')), 'Error toast must be displayed');
    assert.ok(inputRate.classList.contains('input-error') || inputRate.classList.contains('is-invalid') || inputRate.classList.contains('border-danger'), 'Error classes must be present');
  });

  it('1.2: Negative rates (-1500, -0.01, -1e8) strictly fail validation and prevent snapshot creation', async () => {
    store.addBankAccount({ name: 'Zenith', initialBalance: 2000000 });
    store.setOpeningInventory({ startingUsdtBalance: 500, defaultCostBasis: 1500 });

    dashboardModule.initDashboard();
    dashboardModule.openSnapshotModal();

    const inputRate = document.getElementById('input-snapshot-ref-rate');
    const form = document.getElementById('form-save-snapshot');
    const warning = document.getElementById('snapshot-rate-warning');

    const negativeValues = ['-1500', '-0.01', '-100000000', '-0.0000001', '-999999'];

    for (const negVal of negativeValues) {
      toastLogs = [];
      inputRate.value = negVal;
      dashboardModule.handleSnapshotRateInput();

      assert.strictEqual(warning.classList.contains('hidden'), false, `Warning must show for negative rate: ${negVal}`);

      form.dispatchEvent(new CustomEvent('submit', { cancelable: true }));

      assert.strictEqual(store.getSnapshots().length, 0, `Store must have 0 snapshots after negative rate ${negVal}`);
      assert.ok(toastLogs.some(t => t.type === 'error'), `Error toast required for ${negVal}`);
    }
  });

  it('1.3: Empty strings and whitespace-only inputs trigger fallback preview and block submission', async () => {
    store.addBankAccount({ name: 'Access', initialBalance: 1000000 });
    dashboardModule.initDashboard();
    dashboardModule.openSnapshotModal();

    const inputRate = document.getElementById('input-snapshot-ref-rate');
    const previewNgn = document.getElementById('snapshot-preview-networth-ngn');
    const previewUsdt = document.getElementById('snapshot-preview-networth-usdt');
    const form = document.getElementById('form-save-snapshot');

    const emptyInputs = ['', '   ', '\t', '  \n  '];

    for (const emptyVal of emptyInputs) {
      toastLogs = [];
      inputRate.value = emptyVal;
      dashboardModule.handleSnapshotRateInput();

      // Empty input should display '—' or neutral fallback in preview
      assert.strictEqual(previewNgn.textContent, '—', `Empty input '${emptyVal}' should display '—' in NGN preview`);
      assert.strictEqual(previewUsdt.textContent, '—', `Empty input '${emptyVal}' should display '—' in USDT preview`);

      form.dispatchEvent(new CustomEvent('submit', { cancelable: true }));
      assert.strictEqual(store.getSnapshots().length, 0, 'Empty input must not create snapshot');
      assert.ok(toastLogs.some(t => t.type === 'error'), 'Empty input submit must trigger error toast');
    }
  });

  it('1.4: Non-numeric and NaN string inputs are blocked by parseFloat and isNaN guards', async () => {
    store.addBankAccount({ name: 'Kuda', initialBalance: 500000 });
    dashboardModule.initDashboard();
    dashboardModule.openSnapshotModal();

    const inputRate = document.getElementById('input-snapshot-ref-rate');
    const form = document.getElementById('form-save-snapshot');

    const invalidStrings = ['abc', 'NaN', '$1500', 'undefined', 'null', 'true', 'false', '0x00'];

    for (const str of invalidStrings) {
      toastLogs = [];
      inputRate.value = str;
      dashboardModule.handleSnapshotRateInput();

      // Submit attempt
      form.dispatchEvent(new CustomEvent('submit', { cancelable: true }));

      // If str is '0x00' (hex 0), parseFloat('0x00') is 0 in standard JS, so <= 0 rejects it
      assert.strictEqual(store.getSnapshots().length, 0, `Invalid rate '${str}' must not persist snapshot`);
      assert.ok(toastLogs.some(t => t.type === 'error'), `Invalid rate '${str}' must trigger error toast`);
    }
  });

  it('1.5: Infinity and -Infinity inputs are blocked by isFinite guard', async () => {
    store.addBankAccount({ name: 'Stanbic', initialBalance: 800000 });
    dashboardModule.initDashboard();
    dashboardModule.openSnapshotModal();

    const inputRate = document.getElementById('input-snapshot-ref-rate');
    const form = document.getElementById('form-save-snapshot');

    const infinityValues = ['Infinity', '+Infinity', '-Infinity', '1e309'];

    for (const inf of infinityValues) {
      toastLogs = [];
      inputRate.value = inf;
      dashboardModule.handleSnapshotRateInput();

      form.dispatchEvent(new CustomEvent('submit', { cancelable: true }));

      assert.strictEqual(store.getSnapshots().length, 0, `Infinity value '${inf}' must not persist`);
      assert.ok(toastLogs.some(t => t.type === 'error'), `Infinity value '${inf}' must trigger error toast`);
    }
  });

  it('1.6: Special characters, SQL injection, and XSS strings in rate input are rejected safely', async () => {
    store.addBankAccount({ name: 'FirstBank', initialBalance: 1200000 });
    dashboardModule.initDashboard();
    dashboardModule.openSnapshotModal();

    const inputRate = document.getElementById('input-snapshot-ref-rate');
    const form = document.getElementById('form-save-snapshot');

    const attackStrings = [
      '<script>alert("xss")</script>',
      "DROP TABLE snapshots;--",
      '${7*7}',
      '!@#$%^&*()',
      '../../etc/passwd',
      '{\"rate\": 1500}'
    ];

    for (const attack of attackStrings) {
      toastLogs = [];
      inputRate.value = attack;
      dashboardModule.handleSnapshotRateInput();

      form.dispatchEvent(new CustomEvent('submit', { cancelable: true }));

      assert.strictEqual(store.getSnapshots().length, 0, `Attack string '${attack}' must not persist snapshot`);
      assert.ok(toastLogs.some(t => t.type === 'error'), `Attack string '${attack}' must trigger error toast`);
    }
  });
});

// =========================================================================
// SECTION 2: Extreme Rates & High-Precision Floating Point Math
// =========================================================================
describe('Challenger M3 Modal — 2. Extreme Rates & Math Precision Stress', () => {
  beforeEach(async () => {
    await setupTestEnvironment();
  });

  it('2.1: Micro-rate (0.0001 NGN/USDT) calculates massive USDT equivalent accurately without crash', async () => {
    store.addBankAccount({ name: 'OPay', initialBalance: 1000000 }); // 1,000,000 NGN
    store.setOpeningInventory({ startingUsdtBalance: 100, defaultCostBasis: 1500 }); // 100 USDT

    dashboardModule.initDashboard();
    dashboardModule.openSnapshotModal();

    const inputRate = document.getElementById('input-snapshot-ref-rate');
    const previewNgn = document.getElementById('snapshot-preview-networth-ngn');
    const previewUsdt = document.getElementById('snapshot-preview-networth-usdt');
    const form = document.getElementById('form-save-snapshot');

    // Set micro rate 0.0001
    inputRate.value = '0.0001';
    dashboardModule.handleSnapshotRateInput();

    // Net Worth NGN = 1,000,000 + (100 * 0.0001 = 0.01) = ₦1,000,000.01
    // Net Worth USDT = 100 + (1,000,000 / 0.0001 = 10,000,000,000) = 10,000,000,100.00 USDT
    assert.strictEqual(previewNgn.textContent, '₦1,000,000.01');
    assert.strictEqual(previewUsdt.textContent, '10,000,000,100.00 USDT');

    // Submit and persist
    form.dispatchEvent(new CustomEvent('submit', { cancelable: true }));

    const snapshots = store.getSnapshots();
    assert.strictEqual(snapshots.length, 1);
    assert.strictEqual(snapshots[0].referenceRate, 0.0001);
    assert.strictEqual(snapshots[0].netWorthNgn, 1000000.01);
    assert.strictEqual(snapshots[0].netWorthUsdt, 10000000100);
  });

  it('2.2: Extreme hyper-rate (100,000,000 NGN/USDT) calculates massive NGN valuation without arithmetic overflow', async () => {
    store.addBankAccount({ name: 'Providus', initialBalance: 5000000 }); // 5,000,000 NGN
    store.setOpeningInventory({ startingUsdtBalance: 1000, defaultCostBasis: 1500 }); // 1,000 USDT

    dashboardModule.initDashboard();
    dashboardModule.openSnapshotModal();

    const inputRate = document.getElementById('input-snapshot-ref-rate');
    const previewNgn = document.getElementById('snapshot-preview-networth-ngn');
    const previewUsdt = document.getElementById('snapshot-preview-networth-usdt');
    const form = document.getElementById('form-save-snapshot');

    // Set huge rate 100,000,000
    inputRate.value = '100000000';
    dashboardModule.handleSnapshotRateInput();

    // Net Worth NGN = 5,000,000 + (1,000 * 100,000,000 = 100,000,000,000) = ₦100,005,000,000.00
    // Net Worth USDT = 1,000 + (5,000,000 / 100,000,000 = 0.05) = 1,000.05 USDT
    assert.strictEqual(previewNgn.textContent, '₦100,005,000,000.00');
    assert.strictEqual(previewUsdt.textContent, '1,000.05 USDT');

    form.dispatchEvent(new CustomEvent('submit', { cancelable: true }));

    const snapshots = store.getSnapshots();
    assert.strictEqual(snapshots.length, 1);
    assert.strictEqual(snapshots[0].referenceRate, 100000000);
    assert.strictEqual(snapshots[0].netWorthNgn, 100005000000);
    assert.strictEqual(snapshots[0].netWorthUsdt, 1000.05);
  });

  it('2.3: Sub-cent fractional rate (1540.33333333) maintains mathematical precision across preview and storage', async () => {
    store.addBankAccount({ name: 'Sterling', initialBalance: 3000000 });
    store.setOpeningInventory({ startingUsdtBalance: 2000, defaultCostBasis: 1500 });

    dashboardModule.initDashboard();
    dashboardModule.openSnapshotModal();

    const inputRate = document.getElementById('input-snapshot-ref-rate');
    const form = document.getElementById('form-save-snapshot');

    const highPrecisionRate = '1540.33333333';
    inputRate.value = highPrecisionRate;
    dashboardModule.handleSnapshotRateInput();

    form.dispatchEvent(new CustomEvent('submit', { cancelable: true }));

    const snapshots = store.getSnapshots();
    assert.strictEqual(snapshots.length, 1);
    const snap = snapshots[0];
    assert.strictEqual(snap.referenceRate, 1540.33333333);

    // 3,000,000 + (2000 * 1540.33333333) = 3,000,000 + 3,080,666.66666 = 6,080,666.67
    assert.strictEqual(snap.netWorthNgn, 6080666.67);
    // 2000 + (3,000,000 / 1540.33333333) = 2000 + 1947.6307233 = 3947.63
    assert.strictEqual(snap.netWorthUsdt, 3947.63);
  });

  it('2.4: Rate with leading and trailing whitespace is sanitized and parsed cleanly', async () => {
    store.addBankAccount({ name: 'GTB', initialBalance: 1000000 });
    store.setOpeningInventory({ startingUsdtBalance: 500, defaultCostBasis: 1500 });

    dashboardModule.initDashboard();
    dashboardModule.openSnapshotModal();

    const inputRate = document.getElementById('input-snapshot-ref-rate');
    const form = document.getElementById('form-save-snapshot');

    inputRate.value = '   1575.50   ';
    dashboardModule.handleSnapshotRateInput();

    form.dispatchEvent(new CustomEvent('submit', { cancelable: true }));

    const snapshots = store.getSnapshots();
    assert.strictEqual(snapshots.length, 1);
    assert.strictEqual(snapshots[0].referenceRate, 1575.50);
  });
});

// =========================================================================
// SECTION 3: Dynamic Keystroke Streaming & Rapid Input Sequences
// =========================================================================
describe('Challenger M3 Modal — 3. Rapid Keystroke Streaming & Input Sequences', () => {
  beforeEach(async () => {
    await setupTestEnvironment();
  });

  it('3.1: 50 rapid sequential keystroke updates smoothly transition preview between valid, invalid, and empty states', async () => {
    store.addBankAccount({ name: 'Wema', initialBalance: 1500000 });
    store.setOpeningInventory({ startingUsdtBalance: 1000, defaultCostBasis: 1500 });

    dashboardModule.initDashboard();
    dashboardModule.openSnapshotModal();

    const inputRate = document.getElementById('input-snapshot-ref-rate');
    const previewNgn = document.getElementById('snapshot-preview-networth-ngn');
    const previewUsdt = document.getElementById('snapshot-preview-networth-usdt');
    const warning = document.getElementById('snapshot-rate-warning');

    // Simulate sequence of user typing and backspacing:
    // "1" -> "15" -> "150" -> "1500" -> "1500." -> "1500.5" -> "" -> "-1" -> "1600"
    const keystrokeSequence = [
      { input: '1', valid: true, ngn: '₦1,501,000.00', usdt: '1,501,000.00 USDT' },
      { input: '15', valid: true, ngn: '₦1,515,000.00', usdt: '101,000.00 USDT' },
      { input: '150', valid: true, ngn: '₦1,650,000.00', usdt: '11,000.00 USDT' },
      { input: '1500', valid: true, ngn: '₦3,000,000.00', usdt: '2,000.00 USDT' },
      { input: '1500.', valid: true, ngn: '₦3,000,000.00', usdt: '2,000.00 USDT' },
      { input: '1500.50', valid: true, ngn: '₦3,000,500.00', usdt: '1,999.67 USDT' },
      { input: '', valid: false, ngn: '—', usdt: '—' },
      { input: '-50', valid: false, ngn: '₦1,500,000.00', usdt: '1,000.00 USDT' },
      { input: '0', valid: false, ngn: '₦1,500,000.00', usdt: '1,000.00 USDT' },
      { input: '1600', valid: true, ngn: '₦3,100,000.00', usdt: '1,937.50 USDT' }
    ];

    for (let i = 0; i < 5; i++) {
      for (const step of keystrokeSequence) {
        inputRate.value = step.input;
        dashboardModule.handleSnapshotRateInput();

        if (step.valid) {
          assert.strictEqual(warning.classList.contains('hidden'), true, `Warning must be hidden for valid rate '${step.input}'`);
          assert.strictEqual(previewNgn.textContent, step.ngn, `NGN preview mismatch for '${step.input}'`);
          assert.strictEqual(previewUsdt.textContent, step.usdt, `USDT preview mismatch for '${step.input}'`);
        } else {
          assert.strictEqual(warning.classList.contains('hidden'), false, `Warning must be visible for invalid rate '${step.input}'`);
          if (step.input === '') {
            assert.strictEqual(previewNgn.textContent, '—');
            assert.strictEqual(previewUsdt.textContent, '—');
          }
        }
      }
    }
  });

  it('3.2: Overdraft bank balance with live rate changes applies text-danger/text-success styling dynamically', async () => {
    // Bank is heavily in debt: -₦5,000,000
    // USDT holdings: 3,000 USDT
    store.addBankAccount({ name: 'Overdraft Acct', initialBalance: -5000000 });
    store.setOpeningInventory({ startingUsdtBalance: 3000, defaultCostBasis: 1500 });

    dashboardModule.initDashboard();
    dashboardModule.openSnapshotModal();

    const inputRate = document.getElementById('input-snapshot-ref-rate');
    const previewNgn = document.getElementById('snapshot-preview-networth-ngn');

    // Rate = 1500 -> 3000 * 1500 = 4,500,000. Net Worth = -5,000,000 + 4,500,000 = -₦500,000.00 (Danger)
    inputRate.value = '1500';
    dashboardModule.handleSnapshotRateInput();
    assert.strictEqual(previewNgn.textContent, '-₦500,000.00');
    assert.ok(previewNgn.classList.contains('text-danger'), 'Negative net worth must have text-danger');

    // Rate = 2000 -> 3000 * 2000 = 6,000,000. Net Worth = -5,000,000 + 6,000,000 = +₦1,000,000.00 (Success)
    inputRate.value = '2000';
    dashboardModule.handleSnapshotRateInput();
    assert.strictEqual(previewNgn.textContent, '₦1,000,000.00');
    assert.ok(previewNgn.classList.contains('text-success'), 'Positive net worth must have text-success');
  });
});

// =========================================================================
// SECTION 4: Asynchronous State Changes & Concurrency During Modal Lifecycle
// =========================================================================
describe('Challenger M3 Modal — 4. Asynchronous State Changes & Modal Concurrency', () => {
  beforeEach(async () => {
    await setupTestEnvironment();
  });

  it('4.1: Background store mutation while modal is open does not corrupt pre-filled modal stat cards', async () => {
    const bank = store.addBankAccount({ name: 'Main Bank', initialBalance: 1000000 });
    store.setOpeningInventory({ startingUsdtBalance: 500, defaultCostBasis: 1500 });

    dashboardModule.initDashboard();
    dashboardModule.openSnapshotModal();

    const elBankCash = document.getElementById('snapshot-bank-cash');
    const elUsdt = document.getElementById('snapshot-usdt-balance');
    assert.strictEqual(elBankCash.textContent, '₦1,000,000.00');
    assert.strictEqual(elUsdt.textContent, '500.00 USDT');

    // Simulate background store event (e.g. new trade recorded in background)
    store.addBankAccount({ name: 'Second Bank', initialBalance: 5000000 });
    window.dispatchEvent(new CustomEvent('store:updated', { detail: { type: 'banks' } }));

    // Modal was opened with initial 1,000,000 cash; data-raw-value must remain 1,000,000 for this snapshot session
    const inputRate = document.getElementById('input-snapshot-ref-rate');
    inputRate.value = '1500';
    dashboardModule.handleSnapshotRateInput();

    const form = document.getElementById('form-save-snapshot');
    form.dispatchEvent(new CustomEvent('submit', { cancelable: true }));

    const snapshots = store.getSnapshots();
    assert.strictEqual(snapshots.length, 1);
    assert.strictEqual(snapshots[0].bankCash, 1000000, 'Snapshot must save the bank cash captured when modal opened');
  });

  it('4.2: Double-click submit triggers single snapshot save and clean modal closure', async () => {
    store.addBankAccount({ name: 'GTB', initialBalance: 2000000 });
    store.setOpeningInventory({ startingUsdtBalance: 1000, defaultCostBasis: 1500 });

    dashboardModule.initDashboard();
    dashboardModule.openSnapshotModal();

    const inputRate = document.getElementById('input-snapshot-ref-rate');
    inputRate.value = '1550';

    const form = document.getElementById('form-save-snapshot');

    // Rapid double submit
    form.dispatchEvent(new CustomEvent('submit', { cancelable: true }));
    form.dispatchEvent(new CustomEvent('submit', { cancelable: true }));

    const snapshots = store.getSnapshots();
    assert.strictEqual(snapshots.length, 1, 'Should process submits cleanly');
    const backdrop = document.getElementById('modal-snapshot-backdrop');
    assert.strictEqual(backdrop.classList.contains('hidden'), true, 'Modal should be closed');
  });

  it('4.3: Re-opening modal after close/submit updates to new live balances dynamically', async () => {
    const bank = store.addBankAccount({ name: 'Bank 1', initialBalance: 1000000 });
    store.setOpeningInventory({ startingUsdtBalance: 500, defaultCostBasis: 1500 });

    dashboardModule.initDashboard();

    // Session 1
    dashboardModule.openSnapshotModal();
    let elBankCash = document.getElementById('snapshot-bank-cash');
    assert.strictEqual(elBankCash.textContent, '₦1,000,000.00');
    dashboardModule.closeSnapshotModal();

    // Add more funds
    store.addTrade({
      type: 'BUY',
      bankAccountId: bank.id,
      ngnAmount: 500000,
      usdtAmount: 300,
      rate: 1666.67,
      totalFees: 0,
      date: new Date().toISOString()
    });

    // Session 2: Re-open modal
    dashboardModule.openSnapshotModal();
    elBankCash = document.getElementById('snapshot-bank-cash');
    const elUsdt = document.getElementById('snapshot-usdt-balance');

    // Bank cash = 1,000,000 - 500,000 = 500,000 NGN
    // USDT = 500 + 300 = 800 USDT
    assert.strictEqual(elBankCash.textContent, '₦500,000.00');
    assert.strictEqual(elUsdt.textContent, '800.00 USDT');
  });
});

// =========================================================================
// SECTION 5: Notes Field, Date Manipulation & XSS Boundaries
// =========================================================================
describe('Challenger M3 Modal — 5. Notes Field, Date Manipulation & XSS Boundaries', () => {
  beforeEach(async () => {
    await setupTestEnvironment();
  });

  it('5.1: Notes character counter updates live on input event up to 500 characters', async () => {
    dashboardModule.initDashboard();
    dashboardModule.openSnapshotModal();

    const notesInput = document.getElementById('input-snapshot-notes');
    const notesCounter = document.getElementById('snapshot-notes-counter');

    assert.strictEqual(notesCounter.textContent, '0 / 500');

    notesInput.value = 'Hello world';
    notesInput.dispatchEvent(new CustomEvent('input', { bubbles: true }));
    assert.strictEqual(notesCounter.textContent, '11 / 500');

    // 500-char string
    const maxNotes = 'A'.repeat(500);
    notesInput.value = maxNotes;
    notesInput.dispatchEvent(new CustomEvent('input', { bubbles: true }));
    assert.strictEqual(notesCounter.textContent, '500 / 500');
  });

  it('5.2: 500-character notes and empty notes save cleanly in snapshot object', async () => {
    store.addBankAccount({ name: 'Access', initialBalance: 1000000 });
    dashboardModule.initDashboard();

    // Test 1: 500 chars
    dashboardModule.openSnapshotModal();
    const inputRate = document.getElementById('input-snapshot-ref-rate');
    const notesInput = document.getElementById('input-snapshot-notes');
    const form = document.getElementById('form-save-snapshot');

    inputRate.value = '1500';
    const longNotes = 'B'.repeat(500);
    notesInput.value = longNotes;

    form.dispatchEvent(new CustomEvent('submit', { cancelable: true }));

    let snapshots = store.getSnapshots();
    assert.strictEqual(snapshots.length, 1);
    assert.strictEqual(snapshots[0].notes, longNotes);

    // Test 2: empty notes
    dashboardModule.openSnapshotModal();
    inputRate.value = '1500';
    notesInput.value = '';
    form.dispatchEvent(new CustomEvent('submit', { cancelable: true }));

    snapshots = store.getSnapshots();
    assert.strictEqual(snapshots.length, 2);
    assert.strictEqual(snapshots[1].notes, '');
  });

  it('5.3: XSS payload in snapshot notes is safely preserved and not executed', async () => {
    store.addBankAccount({ name: 'Zenith', initialBalance: 1000000 });
    dashboardModule.initDashboard();
    dashboardModule.openSnapshotModal();

    const inputRate = document.getElementById('input-snapshot-ref-rate');
    const notesInput = document.getElementById('input-snapshot-notes');
    const form = document.getElementById('form-save-snapshot');

    const xssPayload = '<img src=x onerror=alert(1)>';
    inputRate.value = '1500';
    notesInput.value = xssPayload;

    form.dispatchEvent(new CustomEvent('submit', { cancelable: true }));

    const snapshots = store.getSnapshots();
    assert.strictEqual(snapshots.length, 1);
    assert.strictEqual(snapshots[0].notes, xssPayload);
  });

  it('5.4: Custom valid and fallback datetime-local parsing', async () => {
    store.addBankAccount({ name: 'GTB', initialBalance: 1000000 });
    dashboardModule.initDashboard();
    dashboardModule.openSnapshotModal();

    const dateInput = document.getElementById('snapshot-date');
    const inputRate = document.getElementById('input-snapshot-ref-rate');
    const form = document.getElementById('form-save-snapshot');

    // Valid specific date
    dateInput.value = '2026-08-25T10:30';
    inputRate.value = '1500';
    form.dispatchEvent(new CustomEvent('submit', { cancelable: true }));

    let snapshots = store.getSnapshots();
    assert.strictEqual(snapshots.length, 1);
    assert.ok(snapshots[0].timestamp.includes('2026-08-25'));
  });
});

// =========================================================================
// SECTION 6: Modal Lifecycle & UI Trigger Matrix
// =========================================================================
describe('Challenger M3 Modal — 6. Lifecycle Triggers & UI Synchronization', () => {
  beforeEach(async () => {
    await setupTestEnvironment();
  });

  it('6.1: Backdrop click, Escape key, and Cancel button dismiss modal and clear error states', async () => {
    dashboardModule.initDashboard();
    dashboardModule.openSnapshotModal();

    const backdrop = document.getElementById('modal-snapshot-backdrop');
    const inputRate = document.getElementById('input-snapshot-ref-rate');
    const warning = document.getElementById('snapshot-rate-warning');

    // Trigger error state
    inputRate.value = '-100';
    dashboardModule.handleSnapshotRateInput();
    assert.strictEqual(warning.classList.contains('hidden'), false);

    // Cancel modal
    const btnCancel = document.getElementById('btn-cancel-snapshot-modal');
    btnCancel.click();

    assert.strictEqual(backdrop.classList.contains('hidden'), true);
    assert.strictEqual(warning.classList.contains('hidden'), true);
    assert.strictEqual(inputRate.classList.contains('input-error'), false);
  });

  it('6.2: Successful snapshot save immediately updates live Net Worth Hero card delta badge', async () => {
    const bank = store.addBankAccount({ name: 'Access', initialBalance: 2000000 });
    store.setOpeningInventory({ startingUsdtBalance: 1000, defaultCostBasis: 1500 });

    dashboardModule.initDashboard();

    // Baseline live Net Worth: 2,000,000 + (1000 * 1500) = ₦3,500,000.00
    // Open snapshot modal and save snapshot with rate 1500
    dashboardModule.openSnapshotModal();
    const inputRate = document.getElementById('input-snapshot-ref-rate');
    inputRate.value = '1500';

    const form = document.getElementById('form-save-snapshot');
    form.dispatchEvent(new CustomEvent('submit', { cancelable: true }));

    // Now delta badge must compare against the new snapshot
    const deltaBadge = document.getElementById('badge-net-worth-delta');
    assert.ok(deltaBadge, 'Delta badge must exist on hero widget');
    assert.strictEqual(deltaBadge.textContent.includes('₦0.00 (0.00%)'), true, 'Delta should be flat 0% immediately after matching snapshot');
  });

  it('6.3: Rate source badge updates appropriately based on rate hierarchy', async () => {
    store.addBankAccount({ name: 'GTB', initialBalance: 1000000 });
    store.setOpeningInventory({ startingUsdtBalance: 500, defaultCostBasis: 1500 });

    dashboardModule.initDashboard();
    dashboardModule.openSnapshotModal();

    const rateBadge = document.getElementById('snapshot-rate-source-badge');
    assert.ok(rateBadge, 'Rate badge should exist');
    assert.strictEqual(rateBadge.textContent, 'FIFO Cost');
  });
});
