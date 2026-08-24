/**
 * Bybit NGN P2P Trade Tracker — Wallet Transfers Module
 * Controls wallet transfer modal, validation, and history rendering
 */

import { store } from './store.js';
import { formatNGN, formatUSDT, formatDateTime, getLocalIsoDateTime, escapeHtml } from './utils.js';

export function initTransfers() {
  setupTransferModal();
  setupBankTransferModal();
  renderTransfersList();

  // Listen for store updates
  window.addEventListener('store:updated', (e) => {
    if (e.detail?.type === 'transfers' || e.detail?.type === 'all' || e.detail?.type === 'banks') {
      renderTransfersList();
    }
  });
}

function setupTransferModal() {
  const modal = document.getElementById('modal-transfer-backdrop');
  const btnOpen = document.getElementById('btn-open-transfer-modal');
  const btnClose = document.getElementById('btn-close-transfer-modal');
  const btnCancel = document.getElementById('btn-cancel-transfer-modal');
  const form = document.getElementById('form-log-transfer');
  const dateInput = document.getElementById('transfer-date');

  function openModal() {
    if (form) form.reset();
    if (dateInput) dateInput.value = getLocalIsoDateTime();
    if (modal) modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  }

  function closeModal() {
    if (modal) modal.classList.add('hidden');
  }

  btnOpen?.addEventListener('click', openModal);
  btnClose?.addEventListener('click', closeModal);
  btnCancel?.addEventListener('click', closeModal);

  form?.addEventListener('submit', (e) => {
    e.preventDefault();

    const date = dateInput?.value || new Date().toISOString();
    const from = document.getElementById('transfer-from')?.value;
    const to = document.getElementById('transfer-to')?.value;
    const amount = parseFloat(document.getElementById('transfer-amount')?.value) || 0;
    const fee = parseFloat(document.getElementById('transfer-fee')?.value) || 0;
    const notes = document.getElementById('transfer-notes')?.value?.trim() || '';

    if (amount <= 0) {
      if (window.showToast) window.showToast('Please enter a valid USDT amount.', 'error');
      return;
    }

    if (from === to) {
      if (window.showToast) window.showToast('Origin and destination wallets cannot be the same.', 'error');
      return;
    }

    store.addTransfer({
      date,
      from,
      to,
      amount,
      fee,
      notes,
      asset: 'USDT'
    });

    closeModal();
    if (window.showToast) window.showToast(`Transfer of ${formatUSDT(amount)} logged!`, 'success');
  });
}

function setupBankTransferModal() {
  const modal = document.getElementById('modal-bank-transfer-backdrop');
  const btnOpen = document.getElementById('btn-open-bank-transfer-modal');
  const btnClose = document.getElementById('btn-close-bank-transfer-modal');
  const btnCancel = document.getElementById('btn-cancel-bank-transfer-modal');
  const form = document.getElementById('form-log-bank-transfer');
  const dateInput = document.getElementById('bank-transfer-date');

  function openModal() {
    if (form) form.reset();
    if (dateInput) dateInput.value = getLocalIsoDateTime();

    // Populate dropdowns dynamically
    const banks = store.getBankAccounts();
    const fromSelect = document.getElementById('bank-transfer-from');
    const toSelect = document.getElementById('bank-transfer-to');
    
    if (fromSelect && toSelect) {
      const optionsHtml = '<option value="" disabled selected>Select Bank Account</option>' +
        banks.map(b => `<option value="${b.id}">${escapeHtml(b.name)} (${escapeHtml(b.alias || '')} •••• ${escapeHtml(b.last4)})</option>`).join('');
      fromSelect.innerHTML = optionsHtml;
      toSelect.innerHTML = optionsHtml;
    }

    if (modal) modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  }

  function closeModal() {
    if (modal) modal.classList.add('hidden');
  }

  btnOpen?.addEventListener('click', openModal);
  btnClose?.addEventListener('click', closeModal);
  btnCancel?.addEventListener('click', closeModal);

  form?.addEventListener('submit', (e) => {
    e.preventDefault();

    const date = dateInput?.value || new Date().toISOString();
    const fromBankId = document.getElementById('bank-transfer-from')?.value;
    const toBankId = document.getElementById('bank-transfer-to')?.value;
    const amount = parseFloat(document.getElementById('bank-transfer-amount')?.value) || 0;
    const fee = parseFloat(document.getElementById('bank-transfer-fee')?.value) || 0;
    const notes = document.getElementById('bank-transfer-notes')?.value?.trim() || '';

    if (amount <= 0) {
      if (window.showToast) window.showToast('Please enter a valid amount.', 'error');
      return;
    }

    if (!fromBankId || !toBankId) {
      if (window.showToast) window.showToast('Please select both source and destination accounts.', 'error');
      return;
    }

    if (fromBankId === toBankId) {
      if (window.showToast) window.showToast('Source and destination accounts cannot be the same.', 'error');
      return;
    }

    const fromBank = store.getBankAccountById(fromBankId);
    const toBank = store.getBankAccountById(toBankId);

    if (!fromBank || !toBank) {
      if (window.showToast) window.showToast('Invalid bank account selected.', 'error');
      return;
    }

    store.addTransfer({
      date,
      from: `${fromBank.name} (•••• ${fromBank.last4})`,
      to: `${toBank.name} (•••• ${toBank.last4})`,
      fromBankId,
      toBankId,
      amount,
      fee,
      notes,
      asset: 'NGN'
    });

    closeModal();
    if (window.showToast) window.showToast(`Transfer of ${formatNGN(amount)} logged successfully!`, 'success');
  });
}

/**
 * Render recent wallet transfers list in Settings view
 */
export function renderTransfersList() {
  const container = document.getElementById('transfers-summary-list');
  if (!container) return;

  const transfers = store.getTransfers();

  if (transfers.length === 0) {
    container.innerHTML = `
      <p class="text-muted small">No transfers logged yet. Use "Log USDT" or "Log Naira" to record capital movements.</p>
    `;
    return;
  }

  container.innerHTML = transfers.slice(0, 5).map(tr => {
    const isNgn = tr.asset === 'NGN';
    const formattedAmount = isNgn ? formatNGN(tr.amount) : formatUSDT(tr.amount);
    const iconColor = isNgn ? 'rgba(16, 185, 129, 0.15)' : 'rgba(139, 92, 246, 0.15)';
    const textColor = isNgn ? 'var(--success)' : 'var(--purple)';
    const badgeClass = isNgn ? 'text-success' : 'text-accent';
    const feeText = tr.fee > 0 ? ` • Fee: ${isNgn ? formatNGN(tr.fee) : formatUSDT(tr.fee)}` : '';

    return `
      <div class="card mb-2 p-3 d-flex align-items-center justify-content-between" style="background: rgba(10, 16, 28, 0.6);">
        <div class="d-flex align-items-center gap-3">
          <div class="metric-icon-box" style="background: ${iconColor}; color: ${textColor};">
            <i data-lucide="${isNgn ? 'landmark' : 'repeat'}"></i>
          </div>
          <div>
            <div class="fw-bold font-mono ${badgeClass}">${formattedAmount}</div>
            <p class="text-muted small">
              ${escapeHtml(tr.from)} → ${escapeHtml(tr.to)}${feeText} • ${formatDateTime(tr.date)}
            </p>
            ${tr.notes ? `<p class="text-secondary small mt-1">Note: ${escapeHtml(tr.notes)}</p>` : ''}
          </div>
        </div>
        <button class="btn-icon btn-remove-transfer" data-transfer-id="${escapeHtml(tr.id)}" title="Delete Transfer" aria-label="Delete Transfer">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();

  // Attach delete listeners
  container.querySelectorAll('.btn-remove-transfer').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-transfer-id');
      if (confirm('Delete this transfer entry?')) {
        store.deleteTransfer(id);
        if (window.showToast) window.showToast('Transfer deleted', 'info');
      }
    });
  });
}
