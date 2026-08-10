/**
 * Bybit NGN P2P Trade Tracker — Bank Account Management Module
 * Controls bank selection dropdowns, modals, and list rendering
 */

import { store } from './store.js';
import { escapeHtml } from './utils.js';

export function initBanks() {
  renderBankDropdowns();
  renderBankAccountsSettingsList();
  setupBankModalEvents();

  // Listen for store updates to keep UI in sync
  window.addEventListener('store:updated', (e) => {
    if (e.detail?.type === 'banks' || e.detail?.type === 'all') {
      renderBankDropdowns();
      renderBankAccountsSettingsList();
    }
  });
}

/**
 * Populate bank account select dropdowns (Trade form and History filter)
 */
export function renderBankDropdowns() {
  const banks = store.getBankAccounts();

  // 1. Trade Form Bank Select
  const tradeBankSelect = document.getElementById('trade-bank-account');
  if (tradeBankSelect) {
    const selectedVal = tradeBankSelect.value;
    tradeBankSelect.innerHTML = '<option value="" disabled>Select Bank Account</option>' +
      banks.map(bank => {
        const label = bank.alias ? `${bank.name} (${bank.alias}) •••• ${bank.last4}` : `${bank.name} •••• ${bank.last4}`;
        return `<option value="${escapeHtml(bank.id)}">${escapeHtml(label)}</option>`;
      }).join('');

    if (selectedVal && banks.some(b => b.id === selectedVal)) {
      tradeBankSelect.value = selectedVal;
    } else if (banks.length > 0) {
      tradeBankSelect.value = banks[0].id;
    }
  }

  // 2. History Filter Bank Select
  const filterBankSelect = document.getElementById('filter-bank');
  if (filterBankSelect) {
    const currentVal = filterBankSelect.value;
    filterBankSelect.innerHTML = '<option value="ALL">All Accounts</option>' +
      banks.map(bank => {
        const label = bank.alias ? `${bank.name} (${bank.alias})` : `${bank.name} (•••• ${bank.last4})`;
        return `<option value="${escapeHtml(bank.id)}">${escapeHtml(label)}</option>`;
      }).join('');

    if (currentVal && (currentVal === 'ALL' || banks.some(b => b.id === currentVal))) {
      filterBankSelect.value = currentVal;
    }
  }
}

/**
 * Render bank accounts list in Settings view
 */
export function renderBankAccountsSettingsList() {
  const container = document.getElementById('bank-accounts-list');
  if (!container) return;

  const banks = store.getBankAccounts();

  if (banks.length === 0) {
    container.innerHTML = `
      <div class="empty-state-sm">
        <p class="text-muted">No custom bank accounts configured yet.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = banks.map(bank => `
    <div class="card mb-2 d-flex align-items-center justify-content-between p-3" style="background: rgba(10, 16, 28, 0.6);">
      <div class="d-flex align-items-center gap-3">
        <div class="metric-icon-box" style="background: rgba(59, 130, 246, 0.12); color: var(--primary-light);">
          <i data-lucide="landmark"></i>
        </div>
        <div>
          <div class="fw-bold d-flex align-items-center gap-2">
            <span>${escapeHtml(bank.name)}</span>
            <span class="font-mono text-muted small">•••• ${escapeHtml(bank.last4)}</span>
          </div>
          ${bank.alias ? `<p class="text-muted small">${escapeHtml(bank.alias)}</p>` : ''}
        </div>
      </div>
      <button class="btn-icon btn-remove-bank" data-bank-id="${escapeHtml(bank.id)}" title="Delete Account" aria-label="Delete Account">
        <i data-lucide="trash-2"></i>
      </button>
    </div>
  `).join('');

  if (window.lucide) window.lucide.createIcons();

  // Attach delete events
  container.querySelectorAll('.btn-remove-bank').forEach(btn => {
    btn.addEventListener('click', () => {
      const bankId = btn.getAttribute('data-bank-id');
      const bank = store.getBankAccountById(bankId);
      if (confirm(`Remove bank account "${bank?.name || 'this account'}"?`)) {
        store.deleteBankAccount(bankId);
        if (window.showToast) window.showToast('Bank account removed', 'info');
      }
    });
  });
}

/**
 * Handle Add Bank modal open/close and submission
 */
function setupBankModalEvents() {
  const modal = document.getElementById('modal-bank-backdrop');
  const btnOpen = document.getElementById('btn-open-add-bank-modal');
  const btnQuick = document.getElementById('btn-quick-add-bank');
  const btnClose = document.getElementById('btn-close-bank-modal');
  const btnCancel = document.getElementById('btn-cancel-bank-modal');
  const formBank = document.getElementById('form-add-bank');

  const bankNameInput = document.getElementById('bank-name-input');
  const bankLast4Input = document.getElementById('bank-account-last4');
  const bankAliasInput = document.getElementById('bank-alias-input');

  function openModal() {
    if (formBank) formBank.reset();
    if (modal) modal.classList.remove('hidden');
    bankNameInput?.focus();
    if (window.lucide) window.lucide.createIcons();
  }

  function closeModal() {
    if (modal) modal.classList.add('hidden');
  }

  btnOpen?.addEventListener('click', openModal);
  btnQuick?.addEventListener('click', openModal);
  btnClose?.addEventListener('click', closeModal);
  btnCancel?.addEventListener('click', closeModal);

  formBank?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = bankNameInput?.value?.trim();
    const last4Raw = bankLast4Input?.value?.trim() || '';
    const last4 = last4Raw.slice(-4);
    const alias = bankAliasInput?.value?.trim() || '';

    if (!name || !last4) {
      if (window.showToast) window.showToast('Please enter bank name and account digits.', 'error');
      return;
    }

    const created = store.addBankAccount({ name, last4, alias });
    closeModal();
    if (window.showToast) window.showToast(`Added ${name} account!`, 'success');

    // Auto-select the newly added bank in trade form if open
    const tradeBankSelect = document.getElementById('trade-bank-account');
    if (tradeBankSelect && created) {
      tradeBankSelect.value = created.id;
    }
  });
}
