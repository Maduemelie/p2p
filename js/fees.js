/**
 * Bybit NGN P2P Trade Tracker — Dynamic Fees Module
 * Manages adding/removing fee rows and computing trade fee totals
 */

import { formatNGN, escapeHtml } from './utils.js';

let feeRowCounter = 1;

/**
 * Initialize dynamic fee manager
 * @param {Function} onChangeCallback - Called whenever any fee amount changes
 */
export function initFees(onChangeCallback = () => {}) {
  const btnAddFee = document.getElementById('btn-add-fee-row');
  const feesContainer = document.getElementById('fees-container');

  if (btnAddFee && feesContainer) {
    btnAddFee.addEventListener('click', () => {
      addFeeRow(feesContainer, { type: 'Bank Transfer Fee', amount: 0, label: '' }, onChangeCallback);
      onChangeCallback();
    });

    // Attach events to existing default fee row
    document.querySelectorAll('.fee-row').forEach(row => {
      attachFeeRowEvents(row, onChangeCallback);
    });
  }
}

/**
 * Append a new fee row to the container
 */
export function addFeeRow(container, feeData = { type: 'Bank Transfer Fee', amount: 0, label: '' }, onChangeCallback = () => {}) {
  const rowId = `fee_row_${feeRowCounter++}`;
  const row = document.createElement('div');
  row.className = 'fee-row';
  row.id = rowId;

  const isCustom = feeData.type === 'Custom';

  row.innerHTML = `
    <div class="fee-type-col">
      <select class="form-select fee-type-select">
        <option value="Bank Transfer Fee" ${feeData.type === 'Bank Transfer Fee' ? 'selected' : ''}>Bank Transfer Fee</option>
        <option value="Bybit P2P Fee" ${feeData.type === 'Bybit P2P Fee' ? 'selected' : ''}>Bybit P2P Fee</option>
        <option value="Network / Gas Fee" ${feeData.type === 'Network / Gas Fee' ? 'selected' : ''}>Network / Gas Fee</option>
        <option value="SMS / Alert Fee" ${feeData.type === 'SMS / Alert Fee' ? 'selected' : ''}>SMS / Alert Fee</option>
        <option value="Custom" ${isCustom ? 'selected' : ''}>Custom Label...</option>
      </select>
      <input type="text" class="form-input fee-custom-label mt-1 ${isCustom ? '' : 'hidden'}" placeholder="e.g. Stamp Duty" value="${escapeHtml(feeData.label || '')}">
    </div>
    <div class="fee-amount-col">
      <div class="input-affix-wrapper">
        <span class="input-prefix">₦</span>
        <input type="number" step="0.01" min="0" class="form-input font-mono fee-amount-input" placeholder="0.00" value="${feeData.amount > 0 ? feeData.amount : '0.00'}">
      </div>
    </div>
    <button type="button" class="btn-icon btn-remove-fee" title="Remove Fee" aria-label="Remove Fee">
      <i data-lucide="trash-2"></i>
    </button>
  `;

  container.appendChild(row);
  if (window.lucide) window.lucide.createIcons();
  attachFeeRowEvents(row, onChangeCallback);
  return row;
}

/**
 * Attach interaction events to a single fee row
 */
function attachFeeRowEvents(row, onChangeCallback) {
  const typeSelect = row.querySelector('.fee-type-select');
  const customInput = row.querySelector('.fee-custom-label');
  const amountInput = row.querySelector('.fee-amount-input');
  const btnRemove = row.querySelector('.btn-remove-fee');

  typeSelect?.addEventListener('change', () => {
    if (typeSelect.value === 'Custom') {
      customInput?.classList.remove('hidden');
      customInput?.focus();
    } else {
      customInput?.classList.add('hidden');
    }
    onChangeCallback();
  });

  customInput?.addEventListener('input', onChangeCallback);
  amountInput?.addEventListener('input', onChangeCallback);

  btnRemove?.addEventListener('click', () => {
    const allRows = document.querySelectorAll('.fee-row');
    if (allRows.length <= 1) {
      // Clear amount rather than remove last row
      if (amountInput) amountInput.value = '0.00';
      if (customInput) customInput.value = '';
    } else {
      row.remove();
    }
    onChangeCallback();
  });
}

/**
 * Extract all fee rows into a structured array
 * @returns {Array<{ type: string, amount: number, label: string }>}
 */
export function getFeeItems() {
  const items = [];
  document.querySelectorAll('.fee-row').forEach(row => {
    const typeSelect = row.querySelector('.fee-type-select');
    const customInput = row.querySelector('.fee-custom-label');
    const amountInput = row.querySelector('.fee-amount-input');

    const type = typeSelect?.value || 'Bank Transfer Fee';
    const amount = parseFloat(amountInput?.value) || 0;
    const label = type === 'Custom' ? (customInput?.value?.trim() || 'Custom Fee') : type;

    if (amount > 0) {
      items.push({ type, amount, label });
    }
  });
  return items;
}

/**
 * Compute the sum of all fee amounts on the form
 * @returns {number}
 */
export function getTotalFees() {
  let total = 0;
  document.querySelectorAll('.fee-amount-input').forEach(input => {
    total += parseFloat(input.value) || 0;
  });
  return total;
}

/**
 * Update the visual fee summary label
 */
export function updateFeeSummaryDisplay() {
  const total = getTotalFees();
  const summaryEl = document.getElementById('calculated-total-fees');
  if (summaryEl) {
    summaryEl.textContent = formatNGN(total);
  }
  return total;
}

/**
 * Populate fee rows from saved trade data (for editing)
 */
export function setFeeItems(fees = [], onChangeCallback = () => {}) {
  const container = document.getElementById('fees-container');
  if (!container) return;

  container.innerHTML = '';
  if (!fees || fees.length === 0) {
    addFeeRow(container, { type: 'Bank Transfer Fee', amount: 0, label: '' }, onChangeCallback);
  } else {
    fees.forEach(fee => addFeeRow(container, fee, onChangeCallback));
  }
  updateFeeSummaryDisplay();
}

/**
 * Reset fees to initial state
 */
export function resetFees(onChangeCallback = () => {}) {
  const container = document.getElementById('fees-container');
  if (!container) return;

  container.innerHTML = '';
  addFeeRow(container, { type: 'Bank Transfer Fee', amount: 0, label: '' }, onChangeCallback);
  updateFeeSummaryDisplay();
}

/**
 * Calculate automated Nigerian Fintech banking fees (OPay, PalmPay, Moniepoint)
 * @param {'BUY'|'SELL'} direction 
 * @param {number} ngnAmount 
 * @param {boolean} [isSameBank=false] - true if sender & recipient are same bank (e.g. OPay to OPay)
 * @returns {Array<{ type: string, amount: number, label: string }>}
 */
export function calculateFintechTradeFees(direction, ngnAmount, isSameBank = false) {
  const amount = Number(ngnAmount) || 0;
  const fees = [];

  if (direction === 'BUY') {
    // 1. Transfer Fee
    if (!isSameBank) {
      if (amount >= 5000) {
        // Inter-bank transfer fee: ₦10 flat for fintechs
        fees.push({
          type: 'Bank Transfer Fee',
          amount: 10,
          label: 'Inter-Bank Transfer Fee'
        });
      }
      // Below ₦5,000 is free (₦0)
    }

    // 2. Stamp Duty / EMTL Levy (₦50 for any transaction >= ₦10,000)
    if (amount >= 10000) {
      fees.push({
        type: 'Custom',
        amount: 50,
        label: 'Stamp Duty / EMTL Levy'
      });
    }
  } else if (direction === 'SELL') {
    // When we are paid Naira (SELL): No automated charges are incurred by the merchant
  }

  return fees;
}

