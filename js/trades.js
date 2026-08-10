/**
 * Bybit NGN P2P Trade Tracker — Trade Entry & Form Controller
 * Manages Buy/Sell toggle, reactive rate math, validation, and submission
 */

import { store } from './store.js';
import { formatNGN, formatRate, getLocalIsoDateTime, calculateTradeBreakdown } from './utils.js';
import { initFees, getFeeItems, getTotalFees, updateFeeSummaryDisplay, resetFees, setFeeItems } from './fees.js';

let isEditing = false;
let currentEditId = null;

export function initTrades() {
  const formTrade = document.getElementById('form-trade');
  const btnBuy = document.getElementById('btn-type-buy');
  const btnSell = document.getElementById('btn-type-sell');
  const rateInput = document.getElementById('trade-rate');
  const ngnInput = document.getElementById('trade-ngn-amount');
  const usdtInput = document.getElementById('trade-usdt-amount');
  const btnCancelEdit = document.getElementById('btn-cancel-edit');

  // Initialize dynamic fees with recalculation callback
  initFees(recalculateTradeSummary);

  // Set default date
  const dateInput = document.getElementById('trade-date');
  if (dateInput && !dateInput.value) {
    dateInput.value = getLocalIsoDateTime();
  }

  // Direction Switchers
  btnBuy?.addEventListener('click', () => setTradeDirection('BUY'));
  btnSell?.addEventListener('click', () => setTradeDirection('SELL'));

  // Reactive Math Inputs
  rateInput?.addEventListener('input', () => {
    const rate = parseFloat(rateInput.value) || 0;
    const ngn = parseFloat(ngnInput?.value) || 0;
    if (rate > 0 && ngn > 0 && usdtInput) {
      usdtInput.value = (ngn / rate).toFixed(4);
    }
    recalculateTradeSummary();
  });

  ngnInput?.addEventListener('input', () => {
    const rate = parseFloat(rateInput?.value) || 0;
    const ngn = parseFloat(ngnInput.value) || 0;
    if (rate > 0 && usdtInput) {
      usdtInput.value = (ngn / rate).toFixed(4);
    }
    recalculateTradeSummary();
  });

  usdtInput?.addEventListener('input', () => {
    const rate = parseFloat(rateInput?.value) || 0;
    const usdt = parseFloat(usdtInput.value) || 0;
    if (rate > 0 && ngnInput) {
      ngnInput.value = (usdt * rate).toFixed(2);
    }
    recalculateTradeSummary();
  });

  // Cancel Edit
  btnCancelEdit?.addEventListener('click', resetTradeForm);

  // Form Submit Handler
  formTrade?.addEventListener('submit', handleTradeSubmit);

  // Expose startEditTrade globally
  window.startEditTrade = startEditTrade;

  // Run initial calculation check
  recalculateTradeSummary();
}

/**
 * Toggle between BUY and SELL mode
 * @param {'BUY'|'SELL'} direction
 */
export function setTradeDirection(direction) {
  const tradeDirection = document.getElementById('trade-direction');
  const btnBuy = document.getElementById('btn-type-buy');
  const btnSell = document.getElementById('btn-type-sell');
  const labelNgnAmount = document.getElementById('label-ngn-amount');
  const labelUsdtAmount = document.getElementById('label-usdt-amount');
  const summaryNetLabel = document.getElementById('summary-net-label');
  const btnSaveText = document.getElementById('btn-save-trade-text');

  if (tradeDirection) tradeDirection.value = direction;

  if (direction === 'BUY') {
    btnBuy?.classList.add('active');
    btnSell?.classList.remove('active');
    if (labelNgnAmount) labelNgnAmount.innerHTML = '<i data-lucide="banknote"></i> NGN Amount Paid';
    if (labelUsdtAmount) labelUsdtAmount.innerHTML = '<i data-lucide="coins"></i> USDT Expected';
    if (summaryNetLabel) summaryNetLabel.textContent = 'Net Total Cost (NGN):';
    if (btnSaveText) btnSaveText.textContent = isEditing ? 'Update Buy Trade' : 'Record Buy Trade';
  } else {
    btnSell?.classList.add('active');
    btnBuy?.classList.remove('active');
    if (labelNgnAmount) labelNgnAmount.innerHTML = '<i data-lucide="banknote"></i> NGN Amount Received';
    if (labelUsdtAmount) labelUsdtAmount.innerHTML = '<i data-lucide="coins"></i> USDT Sold';
    if (summaryNetLabel) summaryNetLabel.textContent = 'Net Total Received (NGN):';
    if (btnSaveText) btnSaveText.textContent = isEditing ? 'Update Sell Trade' : 'Record Sell Trade';
  }

  if (window.lucide) window.lucide.createIcons();
  recalculateTradeSummary();
}

/**
 * Recalculate summary card (effective rate, net cost / net received)
 */
export function recalculateTradeSummary() {
  const direction = (document.getElementById('trade-direction')?.value || 'BUY');
  const rate = parseFloat(document.getElementById('trade-rate')?.value) || 0;
  const ngn = parseFloat(document.getElementById('trade-ngn-amount')?.value) || 0;
  const usdt = parseFloat(document.getElementById('trade-usdt-amount')?.value) || 0;

  const totalFees = updateFeeSummaryDisplay();
  const { netAmount, effectiveRate } = calculateTradeBreakdown(direction, ngn, usdt, totalFees);

  const summaryEffectiveRate = document.getElementById('summary-effective-rate');
  const summaryNetAmount = document.getElementById('summary-net-amount');

  if (summaryNetAmount) {
    summaryNetAmount.textContent = formatNGN(netAmount);
  }

  if (summaryEffectiveRate) {
    summaryEffectiveRate.textContent = effectiveRate > 0 ? formatRate(effectiveRate) : (rate > 0 ? formatRate(rate) : '₦0.00 / USDT');
  }
}

/**
 * Handle form submit for Add or Edit
 */
function handleTradeSubmit(e) {
  e.preventDefault();

  const direction = (document.getElementById('trade-direction')?.value || 'BUY');
  const date = document.getElementById('trade-date')?.value;
  const bankAccountId = document.getElementById('trade-bank-account')?.value;
  const rate = parseFloat(document.getElementById('trade-rate')?.value) || 0;
  const ngnAmount = parseFloat(document.getElementById('trade-ngn-amount')?.value) || 0;
  const usdtAmount = parseFloat(document.getElementById('trade-usdt-amount')?.value) || 0;
  const counterparty = document.getElementById('trade-counterparty')?.value?.trim() || '';
  const paymentMethod = document.getElementById('trade-payment-method')?.value || 'Bank Transfer';
  const notes = document.getElementById('trade-notes')?.value?.trim() || '';

  // Validation
  if (!date) {
    if (window.showToast) window.showToast('Please select trade date & time.', 'error');
    return;
  }
  if (!bankAccountId) {
    if (window.showToast) window.showToast('Please select the bank account used.', 'error');
    return;
  }
  if (rate <= 0) {
    if (window.showToast) window.showToast('Please enter a valid rate (₦/USDT).', 'error');
    return;
  }
  if (ngnAmount <= 0 || usdtAmount <= 0) {
    if (window.showToast) window.showToast('Please enter valid NGN and USDT amounts.', 'error');
    return;
  }

  const feeItems = getFeeItems();
  const totalFees = getTotalFees();
  const { netAmount, effectiveRate } = calculateTradeBreakdown(direction, ngnAmount, usdtAmount, totalFees);

  const tradePayload = {
    type: direction,
    date,
    bankAccountId,
    rate,
    ngnAmount,
    usdtAmount,
    fees: feeItems,
    totalFees,
    netAmount,
    effectiveRate,
    counterparty,
    paymentMethod,
    notes
  };

  if (isEditing && currentEditId) {
    store.updateTrade(currentEditId, tradePayload);
    if (window.showToast) window.showToast('Trade updated successfully!', 'success');
  } else {
    store.addTrade(tradePayload);
    if (window.showToast) window.showToast(`${direction === 'BUY' ? 'Buy' : 'Sell'} trade of ${formatNGN(ngnAmount)} recorded!`, 'success');
  }

  resetTradeForm();

  // Switch to history view if editing, or dashboard
  if (window.switchView) {
    window.switchView(isEditing ? 'history' : 'dashboard');
  }
}

/**
 * Pre-populate form to edit an existing trade
 * @param {string} tradeId
 */
export function startEditTrade(tradeId) {
  const trade = store.getTradeById(tradeId);
  if (!trade) {
    if (window.showToast) window.showToast('Trade not found', 'error');
    return;
  }

  isEditing = true;
  currentEditId = tradeId;

  // Switch view to Add Trade
  if (window.switchView) {
    window.switchView('add-trade');
  }

  // Update titles & buttons
  const formTitle = document.getElementById('trade-form-title');
  const btnCancelEdit = document.getElementById('btn-cancel-edit');
  const btnSaveText = document.getElementById('btn-save-trade-text');

  if (formTitle) formTitle.textContent = 'Edit Trade';
  if (btnCancelEdit) btnCancelEdit.classList.remove('hidden');
  if (btnSaveText) btnSaveText.textContent = `Update ${trade.type} Trade`;

  // Populate fields
  const dateInput = document.getElementById('trade-date');
  const bankSelect = document.getElementById('trade-bank-account');
  const rateInput = document.getElementById('trade-rate');
  const ngnInput = document.getElementById('trade-ngn-amount');
  const usdtInput = document.getElementById('trade-usdt-amount');
  const counterpartyInput = document.getElementById('trade-counterparty');
  const paymentSelect = document.getElementById('trade-payment-method');
  const notesInput = document.getElementById('trade-notes');

  if (dateInput) dateInput.value = trade.date ? trade.date.slice(0, 16) : getLocalIsoDateTime();
  if (bankSelect && trade.bankAccountId) bankSelect.value = trade.bankAccountId;
  if (rateInput) rateInput.value = trade.rate;
  if (ngnInput) ngnInput.value = trade.ngnAmount;
  if (usdtInput) usdtInput.value = trade.usdtAmount;
  if (counterpartyInput) counterpartyInput.value = trade.counterparty || '';
  if (paymentSelect && trade.paymentMethod) paymentSelect.value = trade.paymentMethod;
  if (notesInput) notesInput.value = trade.notes || '';

  // Set direction & fees
  setTradeDirection(trade.type);
  setFeeItems(trade.fees || [], recalculateTradeSummary);
  recalculateTradeSummary();
}

/**
 * Reset form back to fresh state
 */
export function resetTradeForm() {
  isEditing = false;
  currentEditId = null;

  const form = document.getElementById('form-trade');
  const formTitle = document.getElementById('trade-form-title');
  const btnCancelEdit = document.getElementById('btn-cancel-edit');
  const dateInput = document.getElementById('trade-date');

  form?.reset();
  if (dateInput) dateInput.value = getLocalIsoDateTime();
  if (formTitle) formTitle.textContent = 'Record Trade';
  if (btnCancelEdit) btnCancelEdit.classList.add('hidden');

  setTradeDirection('BUY');
  resetFees(recalculateTradeSummary);
  recalculateTradeSummary();
}
