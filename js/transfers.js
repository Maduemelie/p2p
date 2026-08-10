/**
 * Bybit NGN P2P Trade Tracker — Wallet Transfers Module
 * Controls wallet transfer modal, validation, and history rendering
 */

import { store } from './store.js';
import { formatUSDT, formatDateTime, getLocalIsoDateTime, escapeHtml } from './utils.js';

export function initTransfers() {
  setupTransferModal();
  renderTransfersList();

  // Listen for store updates
  window.addEventListener('store:updated', (e) => {
    if (e.detail?.type === 'transfers' || e.detail?.type === 'all') {
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

/**
 * Render recent wallet transfers list in Settings view
 */
export function renderTransfersList() {
  const container = document.getElementById('transfers-summary-list');
  if (!container) return;

  const transfers = store.getTransfers();

  if (transfers.length === 0) {
    container.innerHTML = `
      <p class="text-muted small">No wallet transfers logged yet. Use "Log Transfer" to record movements between Funding, Spot, and external wallets.</p>
    `;
    return;
  }

  container.innerHTML = transfers.slice(0, 5).map(tr => `
    <div class="card mb-2 p-3 d-flex align-items-center justify-content-between" style="background: rgba(10, 16, 28, 0.6);">
      <div class="d-flex align-items-center gap-3">
        <div class="metric-icon-box" style="background: rgba(139, 92, 246, 0.15); color: var(--purple);">
          <i data-lucide="repeat"></i>
        </div>
        <div>
          <div class="fw-bold font-mono text-accent">${formatUSDT(tr.amount)}</div>
          <p class="text-muted small">
            ${escapeHtml(tr.from)} → ${escapeHtml(tr.to)} • ${formatDateTime(tr.date)}
          </p>
          ${tr.notes ? `<p class="text-secondary small mt-1">Note: ${escapeHtml(tr.notes)}</p>` : ''}
        </div>
      </div>
      <button class="btn-icon btn-remove-transfer" data-transfer-id="${escapeHtml(tr.id)}" title="Delete Transfer" aria-label="Delete Transfer">
        <i data-lucide="trash-2"></i>
      </button>
    </div>
  `).join('');

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
