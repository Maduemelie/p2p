/**
 * Tier 1: Feature Coverage — Milestone 3: End Day / Save Snapshot Modal & Persistence
 * Verifies modal markup, controller lifecycle, dynamic preview engine, validation, and storage.
 */

const { describe, it, beforeEach } = require('../harness/test-runner');
const { assert } = require('../harness/assertions');
const { setupDomEnvironment, MockElement } = require('../harness/dom-mock');

describe('Tier 1 — M3: End Day / Save Snapshot Modal & Persistence', () => {
  let dom;
  let store;
  let utils;
  let modalsView;
  let dashboardView;
  let dashboardModule;

  beforeEach(async () => {
    dom = setupDomEnvironment();
    const storeModule = await import('../../js/store.js');
    store = storeModule.store;
    store.clearAllData();

    utils = await import('../../js/utils.js');
    modalsView = await import('../../js/views/modals.view.js');
    dashboardView = await import('../../js/views/dashboard.view.js');
    dashboardModule = await import('../../js/dashboard.js');

    // Mount DOM templates
    document.body.innerHTML = `
      <div id="main-content">
        ${dashboardView.renderDashboardView()}
      </div>
      <div id="modals-container">
        ${modalsView.renderModalsView()}
      </div>
      <div id="toast-container"></div>
    `;
  });

  // ========================================================
  // 1. Modal Markup & Element Structure
  // ========================================================
  it('M3.1: Modals template renders complete Save Snapshot modal with all required IDs', () => {
    const backdrop = document.getElementById('modal-snapshot-backdrop');
    assert.ok(backdrop, '#modal-snapshot-backdrop must exist');
    assert.ok(backdrop.classList.contains('hidden'), 'Backdrop should be hidden initially');

    const form = document.getElementById('form-save-snapshot');
    assert.ok(form, '#form-save-snapshot must exist');

    const btnClose = document.getElementById('btn-close-snapshot-modal');
    assert.ok(btnClose, '#btn-close-snapshot-modal must exist');

    const elBankCash = document.getElementById('snapshot-bank-cash');
    assert.ok(elBankCash, '#snapshot-bank-cash must exist');

    const elUsdtBal = document.getElementById('snapshot-usdt-balance');
    assert.ok(elUsdtBal, '#snapshot-usdt-balance must exist');

    const inputRate = document.getElementById('input-snapshot-ref-rate');
    assert.ok(inputRate, '#input-snapshot-ref-rate must exist');
    assert.strictEqual(inputRate.getAttribute('type'), 'number');

    const previewNgn = document.getElementById('snapshot-preview-networth-ngn');
    assert.ok(previewNgn, '#snapshot-preview-networth-ngn must exist');

    const previewUsdt = document.getElementById('snapshot-preview-networth-usdt');
    assert.ok(previewUsdt, '#snapshot-preview-networth-usdt must exist');

    const inputNotes = document.getElementById('input-snapshot-notes');
    assert.ok(inputNotes, '#input-snapshot-notes must exist');

    const btnCancel = document.getElementById('btn-cancel-snapshot-modal');
    assert.ok(btnCancel, '#btn-cancel-snapshot-modal must exist');

    const btnSubmit = document.getElementById('btn-save-snapshot-submit');
    assert.ok(btnSubmit, '#btn-save-snapshot-submit must exist');
  });

  // ========================================================
  // 2. Controller openSnapshotModal & Dynamic Pre-fill
  // ========================================================
  it('M3.2: openSnapshotModal() calculates live bank cash and USDT balance, resolves rate, and reveals modal', () => {
    // Setup bank cash
    const bank = store.addBankAccount({ name: 'OPay', initialBalance: 1500000 });
    // Setup trade inventory
    store.addTrade({
      type: 'BUY',
      bankAccountId: bank.id,
      ngnAmount: 750000,
      usdtAmount: 500,
      rate: 1500,
      totalFees: 0,
      date: new Date().toISOString()
    });

    dashboardModule.initDashboard();
    dashboardModule.openSnapshotModal();

    const backdrop = document.getElementById('modal-snapshot-backdrop');
    assert.strictEqual(backdrop.classList.contains('hidden'), false, 'Modal backdrop must not have hidden class');

    const elBankCash = document.getElementById('snapshot-bank-cash');
    assert.strictEqual(elBankCash.textContent, '₦750,000.00');

    const elUsdtBal = document.getElementById('snapshot-usdt-balance');
    assert.strictEqual(elUsdtBal.textContent, '500.00 USDT');

    const inputRate = document.getElementById('input-snapshot-ref-rate');
    assert.strictEqual(inputRate.value, '1500');

    const previewNgn = document.getElementById('snapshot-preview-networth-ngn');
    assert.strictEqual(previewNgn.textContent, '₦1,500,000.00');

    const previewUsdt = document.getElementById('snapshot-preview-networth-usdt');
    assert.strictEqual(previewUsdt.textContent, '1,000.00 USDT');
  });

  // ========================================================
  // 3. Dynamic Keystroke Recalculation
  // ========================================================
  it('M3.3: Typing new reference rate recalculates Net Worth preview in both NGN and USDT dynamically', () => {
    store.addBankAccount({ name: 'GTB', initialBalance: 2000000 });
    store.setOpeningInventory({ startingUsdtBalance: 1000, defaultCostBasis: 1500 });

    dashboardModule.initDashboard();
    dashboardModule.openSnapshotModal();

    const inputRate = document.getElementById('input-snapshot-ref-rate');
    const previewNgn = document.getElementById('snapshot-preview-networth-ngn');
    const previewUsdt = document.getElementById('snapshot-preview-networth-usdt');

    // Change rate to 1600
    inputRate.value = '1600';
    dashboardModule.handleSnapshotRateInput();

    // Bank Cash: 2,000,000 + (1,000 * 1600) = 3,600,000 NGN
    // USDT: 1,000 + (2,000,000 / 1600) = 2,250 USDT
    assert.strictEqual(previewNgn.textContent, '₦3,600,000.00');
    assert.strictEqual(previewUsdt.textContent, '2,250.00 USDT');
  });

  // ========================================================
  // 4. Rate Validation & Error Handling
  // ========================================================
  it('M3.4: Rejects submission when rate is <= 0 or invalid, shows error toast, and keeps modal open', () => {
    let toastMessage = null;
    let toastType = null;
    window.showToast = (msg, type) => {
      toastMessage = msg;
      toastType = type;
    };

    store.addBankAccount({ name: 'Kuda', initialBalance: 1000000 });
    dashboardModule.initDashboard();
    dashboardModule.openSnapshotModal();

    const inputRate = document.getElementById('input-snapshot-ref-rate');
    inputRate.value = '0';

    const form = document.getElementById('form-save-snapshot');
    form.dispatchEvent(new CustomEvent('submit', { cancelable: true }));

    const snapshots = store.getSnapshots();
    assert.strictEqual(snapshots.length, 0, 'No snapshot should be saved');
    assert.strictEqual(toastMessage, 'Please enter a valid exchange rate greater than 0');
    assert.strictEqual(toastType, 'error');

    const backdrop = document.getElementById('modal-snapshot-backdrop');
    assert.strictEqual(backdrop.classList.contains('hidden'), false, 'Modal must remain open');
  });

  // ========================================================
  // 5. Successful Form Submission & Persistence
  // ========================================================
  it('M3.5: Successful snapshot form submission saves to store, closes modal, shows success toast, and refreshes UI', () => {
    let toastMessage = null;
    let toastType = null;
    window.showToast = (msg, type) => {
      toastMessage = msg;
      toastType = type;
    };

    const bank = store.addBankAccount({ name: 'Access', initialBalance: 3000000 });
    store.setOpeningInventory({ startingUsdtBalance: 2000, defaultCostBasis: 1520 });

    dashboardModule.initDashboard();
    dashboardModule.openSnapshotModal();

    const inputRate = document.getElementById('input-snapshot-ref-rate');
    inputRate.value = '1540.50';

    const inputNotes = document.getElementById('input-snapshot-notes');
    inputNotes.value = 'End of Day 1 - High volume session';

    const form = document.getElementById('form-save-snapshot');
    form.dispatchEvent(new CustomEvent('submit', { cancelable: true }));

    // Verify storage persistence
    const snapshots = store.getSnapshots();
    assert.strictEqual(snapshots.length, 1);
    const snap = snapshots[0];
    assert.strictEqual(snap.bankCash, 3000000);
    assert.strictEqual(snap.usdtBalance, 2000);
    assert.strictEqual(snap.referenceRate, 1540.50);
    assert.strictEqual(snap.notes, 'End of Day 1 - High volume session');
    assert.strictEqual(snap.netWorthNgn, 3000000 + (2000 * 1540.50));

    // Verify feedback and modal closure
    assert.strictEqual(toastMessage, 'Net worth snapshot saved successfully');
    assert.strictEqual(toastType, 'success');

    const backdrop = document.getElementById('modal-snapshot-backdrop');
    assert.strictEqual(backdrop.classList.contains('hidden'), true, 'Modal must be closed');

    // Verify live delta badge updated against the new snapshot
    const badgeDelta = document.getElementById('badge-net-worth-delta');
    assert.ok(badgeDelta, 'Delta badge must exist');
    assert.ok(badgeDelta.textContent.includes('%') && badgeDelta.textContent.includes('₦'), 'Delta badge should compare against new baseline');
  });

  // ========================================================
  // 6. Close and Cancel Triggers
  // ========================================================
  it('M3.6: Cancel button and close button close the modal cleanly', () => {
    dashboardModule.initDashboard();
    dashboardModule.openSnapshotModal();

    const backdrop = document.getElementById('modal-snapshot-backdrop');
    assert.strictEqual(backdrop.classList.contains('hidden'), false);

    const btnCancel = document.getElementById('btn-cancel-snapshot-modal');
    btnCancel.click();
    assert.strictEqual(backdrop.classList.contains('hidden'), true, 'Cancel button must hide modal');

    dashboardModule.openSnapshotModal();
    assert.strictEqual(backdrop.classList.contains('hidden'), false);

    const btnClose = document.getElementById('btn-close-snapshot-modal');
    btnClose.click();
    assert.strictEqual(backdrop.classList.contains('hidden'), true, 'Close button must hide modal');
  });
}, { tier: 1, category: 'Milestone 3 Snapshot Modal' });
