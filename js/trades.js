/**
 * Bybit NGN P2P Trade Tracker — Trade Entry & Form Controller
 * v2.0 — Redesigned with inline validation and sticky summaries
 */

import { store } from './store.js';
import { formatNGN, formatUSDT, formatRate, getLocalIsoDateTime, calculateTradeBreakdown } from './utils.js';
import { initFees, getFeeItems, getTotalFees, updateFeeSummaryDisplay, resetFees, setFeeItems } from './fees.js';

let isEditing = false;
let currentEditId = null;
let currentDirection = 'BUY'; // Tracks current toggle state: BUY or SELL

export function initTrades() {
  const formTrade = document.getElementById('form-add-trade');
  const typeToggle = document.getElementById('trade-type-toggle');
  const rateInput = document.getElementById('trade-rate');
  const ngnInput = document.getElementById('trade-ngn');
  const usdtInput = document.getElementById('trade-usdt');
  const btnCancelEdit = document.getElementById('btn-cancel-edit');
  const btnCancelTrade = document.getElementById('btn-cancel-trade');
  const btnFormCancel = document.getElementById('btn-form-cancel');

  // Initialize dynamic fees with recalculation callback
  initFees(recalculateTradeSummary);

  // Set default date
  const dateInput = document.getElementById('trade-date');
  if (dateInput && !dateInput.value) {
    dateInput.value = getLocalIsoDateTime();
  }

  // Direction Switchers via Segmented Control delegation
  typeToggle?.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    const direction = btn.getAttribute('data-direction');
    if (direction) {
      setTradeDirection(direction);
    }
  });

  // Reactive Math Inputs (Rate + NGN auto-calculates USDT, Rate + USDT auto-calculates NGN)
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

  // Cancel / Back Navigation Handlers
  const handleCancelNavigation = () => {
    resetTradeForm();
    const prev = (window.getPreviousView ? window.getPreviousView() : 'dashboard') || 'dashboard';
    if (window.switchView) {
      window.switchView(prev);
    }
  };

  btnCancelEdit?.addEventListener('click', handleCancelNavigation);
  btnCancelTrade?.addEventListener('click', handleCancelNavigation);
  btnFormCancel?.addEventListener('click', handleCancelNavigation);

  // Form Submit Handler
  formTrade?.addEventListener('submit', handleTradeSubmit);

  // Expose global actions
  window.startEditTrade = startEditTrade;
  window.prefillTradeForm = prefillTradeForm;

  // Run initial calculation check
  recalculateTradeSummary();
}

/**
 * Toggle between BUY and SELL mode
 * @param {'BUY'|'SELL'} direction
 */
export function setTradeDirection(direction) {
  currentDirection = direction;
  const toggleContainer = document.getElementById('trade-type-toggle');
  const btnBuy = toggleContainer?.querySelector('.trade-buy-btn');
  const btnSell = toggleContainer?.querySelector('.trade-sell-btn');

  const summaryDirectionLabel = document.getElementById('summary-direction-label');
  const summaryEffectiveLabel = document.getElementById('summary-effective-label');
  const summaryNetLabel = document.getElementById('summary-net-label');
  const btnSubmitLabel = document.getElementById('btn-submit-label');

  if (direction === 'BUY') {
    btnBuy?.classList.add('active');
    btnSell?.classList.remove('active');
    
    if (summaryDirectionLabel) summaryDirectionLabel.textContent = 'Paid';
    if (summaryEffectiveLabel) summaryEffectiveLabel.textContent = 'Cost';
    if (summaryNetLabel) summaryNetLabel.textContent = 'Total';
    if (btnSubmitLabel) btnSubmitLabel.textContent = isEditing ? 'Update Buy Trade' : 'Save Buy Trade';

    // Default fee row to Bybit P2P Fee on BUY trade if fee row is unset
    const firstFeeSelect = document.querySelector('.fee-type-select');
    if (firstFeeSelect && firstFeeSelect.value === 'Bank Transfer Fee') {
      const firstFeeInput = document.querySelector('.fee-amount-input');
      if (firstFeeInput && (parseFloat(firstFeeInput.value) === 0 || !firstFeeInput.value)) {
        firstFeeSelect.value = 'Bybit P2P Fee';
      }
    }
  } else {
    btnSell?.classList.add('active');
    btnBuy?.classList.remove('active');
    
    if (summaryDirectionLabel) summaryDirectionLabel.textContent = 'Received';
    if (summaryEffectiveLabel) summaryEffectiveLabel.textContent = 'Yield';
    if (summaryNetLabel) summaryNetLabel.textContent = 'Received';
    if (btnSubmitLabel) btnSubmitLabel.textContent = isEditing ? 'Update Sell Trade' : 'Save Sell Trade';
  }

  recalculateTradeSummary();
}

/**
 * Recalculate summary card (effective rate, net cost / net received)
 */
export function recalculateTradeSummary() {
  const direction = currentDirection;
  const rate = parseFloat(document.getElementById('trade-rate')?.value) || 0;
  const ngn = parseFloat(document.getElementById('trade-ngn')?.value) || 0;
  const usdt = parseFloat(document.getElementById('trade-usdt')?.value) || 0;

  // Auto-calculate 0.30% Bybit P2P Fee on BUY trade when trade amount is entered
  if (direction === 'BUY' && ngn > 0) {
    document.querySelectorAll('.fee-row').forEach(row => {
      const typeSelect = row.querySelector('.fee-type-select');
      const amountInput = row.querySelector('.fee-amount-input');
      if (typeSelect && typeSelect.value === 'Bybit P2P Fee' && amountInput) {
        if (!amountInput.dataset.userModified) {
          const autoFee = (ngn * 0.003).toFixed(2);
          amountInput.value = autoFee;
        }
      }
    });
  }

  const totalFees = updateFeeSummaryDisplay();
  const { netAmount, effectiveRate } = calculateTradeBreakdown(direction, ngn, usdt, totalFees);

  const summaryGrossNgn = document.getElementById('summary-gross-ngn');
  const summaryTotalFees = document.getElementById('summary-total-fees');
  const summaryEffectiveRate = document.getElementById('summary-effective-rate');
  const summaryNetNgn = document.getElementById('summary-net-ngn');

  if (summaryGrossNgn) {
    summaryGrossNgn.textContent = formatNGN(ngn);
  }

  if (summaryTotalFees) {
    summaryTotalFees.textContent = formatNGN(totalFees);
  }

  if (summaryNetNgn) {
    summaryNetNgn.textContent = formatNGN(netAmount);
  }

  if (summaryEffectiveRate) {
    summaryEffectiveRate.textContent = effectiveRate > 0 ? `${formatRate(effectiveRate)} / USDT` : (rate > 0 ? `${formatRate(rate)} / USDT` : '₦0.00 / USDT');
  }
}

/**
 * Handle form submit for Add or Edit
 */
function handleTradeSubmit(e) {
  e.preventDefault();

  const direction = currentDirection;
  const date = document.getElementById('trade-date')?.value;
  const bankAccountId = document.getElementById('trade-bank-account')?.value;
  const rate = parseFloat(document.getElementById('trade-rate')?.value) || 0;
  const ngnAmount = parseFloat(document.getElementById('trade-ngn')?.value) || 0;
  const usdtAmount = parseFloat(document.getElementById('trade-usdt')?.value) || 0;
  const counterparty = document.getElementById('trade-counterparty')?.value?.trim() || '';
  const paymentMethod = document.getElementById('trade-payment-method')?.value || 'Bank Transfer';
  const notes = document.getElementById('trade-notes')?.value?.trim() || '';

  // Inputs for styling validation
  const inputs = {
    date: document.getElementById('trade-date'),
    bank: document.getElementById('trade-bank-account'),
    rate: document.getElementById('trade-rate'),
    ngn: document.getElementById('trade-ngn'),
    usdt: document.getElementById('trade-usdt')
  };

  // Reset errors
  Object.values(inputs).forEach(inp => inp?.classList.remove('is-invalid'));

  // Validation
  let isValid = true;

  if (!date) {
    inputs.date?.classList.add('is-invalid');
    isValid = false;
  }
  if (!bankAccountId) {
    inputs.bank?.classList.add('is-invalid');
    isValid = false;
  }
  if (rate <= 0) {
    inputs.rate?.classList.add('is-invalid');
    isValid = false;
  }
  if (ngnAmount <= 0) {
    inputs.ngn?.classList.add('is-invalid');
    isValid = false;
  }
  if (usdtAmount <= 0) {
    inputs.usdt?.classList.add('is-invalid');
    isValid = false;
  }

  if (!isValid) {
    if (window.showToast) window.showToast('Please correct the highlighted fields.', 'error');
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

  const wasEditing = isEditing;
  resetTradeForm();

  // Switch to history view if editing, or dashboard
  if (window.switchView) {
    window.switchView(wasEditing ? 'history' : 'dashboard');
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
  const formSubtitle = document.getElementById('trade-form-subtitle');
  const btnCancelEdit = document.getElementById('btn-cancel-edit');
  const editModeAlert = document.getElementById('edit-mode-alert');

  if (formTitle) formTitle.textContent = 'Edit Trade';
  if (formSubtitle) formSubtitle.textContent = `Modifying recorded transaction #${tradeId.slice(-6)}`;
  if (btnCancelEdit) btnCancelEdit.classList.remove('hidden');
  if (editModeAlert) editModeAlert.classList.remove('hidden');

  // Populate fields
  const dateInput = document.getElementById('trade-date');
  const bankSelect = document.getElementById('trade-bank-account');
  const rateInput = document.getElementById('trade-rate');
  const ngnInput = document.getElementById('trade-ngn');
  const usdtInput = document.getElementById('trade-usdt');
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

  const form = document.getElementById('form-add-trade');
  const formTitle = document.getElementById('trade-form-title');
  const formSubtitle = document.getElementById('trade-form-subtitle');
  const btnCancelEdit = document.getElementById('btn-cancel-edit');
  const editModeAlert = document.getElementById('edit-mode-alert');
  const dateInput = document.getElementById('trade-date');

  form?.reset();
  if (dateInput) dateInput.value = getLocalIsoDateTime();
  if (formTitle) formTitle.textContent = 'Record Trade';
  if (formSubtitle) formSubtitle.textContent = 'Log a new BUY or SELL order';
  if (btnCancelEdit) btnCancelEdit.classList.add('hidden');
  if (editModeAlert) editModeAlert.classList.add('hidden');

  // Reset validation styles
  const inputs = ['trade-date', 'trade-bank-account', 'trade-rate', 'trade-ngn', 'trade-usdt'];
  inputs.forEach(id => document.getElementById(id)?.classList.remove('is-invalid'));

  setTradeDirection('BUY');
  resetFees(recalculateTradeSummary);
  recalculateTradeSummary();
}

/**
 * Pre-populate trade form with values from external trigger (e.g. order book click) and switch view
 * @param {Object} options
 * @param {'BUY'|'SELL'} [options.direction='BUY']
 * @param {number} [options.rate=0]
 * @param {number} [options.usdtAmount=0]
 * @param {string} [options.counterparty='']
 * @param {string} [options.notes='']
 */
export function prefillTradeForm({ direction = 'BUY', rate = 0, usdtAmount = 0, counterparty = '', notes = '' } = {}) {
  resetTradeForm();

  const rateInput = document.getElementById('trade-rate');
  const usdtInput = document.getElementById('trade-usdt');
  const ngnInput = document.getElementById('trade-ngn');
  const counterpartyInput = document.getElementById('trade-counterparty');
  const notesInput = document.getElementById('trade-notes');

  const numRate = parseFloat(rate) || 0;
  const numUsdt = parseFloat(usdtAmount) || 0;
  const numNgn = (numRate > 0 && numUsdt > 0) ? (numRate * numUsdt) : 0;

  if (rateInput && numRate > 0) rateInput.value = numRate;
  if (usdtInput && numUsdt > 0) usdtInput.value = numUsdt;
  if (ngnInput && numNgn > 0) ngnInput.value = numNgn.toFixed(2);
  if (counterpartyInput && counterparty) counterpartyInput.value = counterparty;
  if (notesInput && notes) notesInput.value = notes;

  setTradeDirection(direction);
  recalculateTradeSummary();

  if (window.switchView) {
    window.switchView('add-trade');
  }

  if (window.showToast) {
    const formattedUsdt = numUsdt > 0 ? `${formatUSDT(numUsdt)} ` : '';
    const formattedRate = numRate > 0 ? `@ ₦${numRate.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '';
    window.showToast(`Populated ${direction} trade from order book (${formattedUsdt}${formattedRate})`.trim(), 'info');
  }
}

