/**
 * Bybit NGN P2P Trade Tracker — Settings View Controller
 * Wires opening inventory, data backup, CSV export, JSON import, data wipe,
 * and Bybit P2P Live Sync actions.
 */

import { store } from './store.js';
import { exportTradesToCSV, exportFullBackupJSON, importBackupJSON } from './export.js';
import { bybitService } from './bybitService.js';
import { calculateTradeBreakdown } from './utils.js';
import { calculateFintechTradeFees } from './fees.js';

export function initSettings() {
  const btnExportCsv = document.getElementById('btn-export-csv');
  const btnExportJson = document.getElementById('btn-export-json');
  const inputImportJson = document.getElementById('input-import-json');
  const btnClearAllData = document.getElementById('btn-clear-all-data');

  // Opening Inventory Form
  const formOpening = document.getElementById('form-opening-inventory');
  const inputOpeningUsdt = document.getElementById('input-opening-usdt');
  const inputOpeningCost = document.getElementById('input-opening-cost-basis');

  // Bybit P2P Sync Elements
  const proxyBadge = document.getElementById('proxy-status-badge');
  const proxyText = document.getElementById('proxy-status-text');
  const btnSyncBalance = document.getElementById('btn-sync-balance');
  const btnImportTrades = document.getElementById('btn-import-bybit-trades');

  function populateOpeningInventory() {
    const saved = store.getOpeningInventory();
    if (inputOpeningUsdt && saved.startingUsdtBalance > 0) {
      inputOpeningUsdt.value = saved.startingUsdtBalance;
    }
    if (inputOpeningCost && saved.defaultCostBasis > 0) {
      inputOpeningCost.value = saved.defaultCostBasis;
    }
  }

  populateOpeningInventory();

  formOpening?.addEventListener('submit', (e) => {
    e.preventDefault();
    const startingUsdtBalance = parseFloat(inputOpeningUsdt?.value) || 0;
    const defaultCostBasis = parseFloat(inputOpeningCost?.value) || 0;

    store.setOpeningInventory({ startingUsdtBalance, defaultCostBasis });
    if (window.showToast) {
      window.showToast(`Opening inventory saved (${startingUsdtBalance} USDT @ ₦${defaultCostBasis.toFixed(2)})!`, 'success');
    }
  });

  // Listen for external restore/sync to refresh opening form
  window.addEventListener('store:updated', (e) => {
    if (e.detail?.type === 'all' || e.detail?.type === 'settings') {
      populateOpeningInventory();
    }
  });

  // ==========================================
  // Bybit P2P Live Sync Controller
  // ==========================================
  async function checkProxyConnection() {
    if (!proxyBadge || !proxyText) return;
    try {
      const res = await bybitService.checkStatus();
      if (res.status === 'online') {
        proxyBadge.style.background = 'rgba(16, 185, 129, 0.15)';
        proxyBadge.style.color = 'var(--profit)';
        proxyText.textContent = res.apiKeyConfigured ? 'Proxy Online & Ready' : 'Proxy Online (No Keys)';
        if (btnSyncBalance) btnSyncBalance.disabled = !res.apiKeyConfigured;
        if (btnImportTrades) btnImportTrades.disabled = !res.apiKeyConfigured;
      } else {
        proxyBadge.style.background = 'rgba(244, 63, 94, 0.15)';
        proxyBadge.style.color = 'var(--loss)';
        proxyText.textContent = 'Proxy Offline';
        if (btnSyncBalance) btnSyncBalance.disabled = true;
        if (btnImportTrades) btnImportTrades.disabled = true;
      }
    } catch (e) {
      proxyBadge.style.background = 'rgba(244, 63, 94, 0.15)';
      proxyBadge.style.color = 'var(--loss)';
      proxyText.textContent = 'Proxy Unreachable';
      if (btnSyncBalance) btnSyncBalance.disabled = true;
      if (btnImportTrades) btnImportTrades.disabled = true;
    }
  }

  // Initial check on load and periodically
  checkProxyConnection();

  // 1. Sync Live Bybit Funding Balance
  btnSyncBalance?.addEventListener('click', async () => {
    try {
      btnSyncBalance.disabled = true;
      if (window.showToast) window.showToast('Fetching Funding balance from Bybit...', 'info');

      const result = await bybitService.fetchFundingBalance('USDT');
      const usdtItem = result.balance?.find(b => b.coin === 'USDT') || result.balance?.[0];
      
      const balance = parseFloat(usdtItem?.transferBalance ?? usdtItem?.walletBalance ?? 0);
      
      const currentOpening = store.getOpeningInventory();
      store.setOpeningInventory({
        startingUsdtBalance: balance,
        defaultCostBasis: currentOpening.defaultCostBasis || 0
      });

      if (inputOpeningUsdt) inputOpeningUsdt.value = balance;
      const liveFundingText = document.getElementById('live-funding-balance-text');
      if (liveFundingText) liveFundingText.textContent = `${balance.toFixed(4)} USDT`;

      if (window.showToast) {
        window.showToast(`Funding Balance synced: ${balance.toFixed(4)} USDT!`, 'success');
      }
    } catch (err) {
      console.error('[Bybit Sync] Balance error:', err);
      if (window.showToast) {
        window.showToast(`Failed to sync balance: ${err.message}`, 'error');
      }
    } finally {
      btnSyncBalance.disabled = false;
    }
  });

  // 2. Import Completed Bybit P2P Orders
  const modalAssign = document.getElementById('modal-assign-banks-backdrop');
  const btnCloseAssign = document.getElementById('btn-close-assign-banks-modal');
  const btnCancelAssign = document.getElementById('btn-cancel-assign-banks');
  const formAssign = document.getElementById('form-assign-banks');
  const assignList = document.getElementById('assign-banks-items-list');

  let pendingImportOrders = [];

  function closeAssignModal() {
    if (modalAssign) modalAssign.classList.add('hidden');
    pendingImportOrders = [];
  }

  btnCloseAssign?.addEventListener('click', closeAssignModal);
  btnCancelAssign?.addEventListener('click', closeAssignModal);

  formAssign?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!pendingImportOrders || pendingImportOrders.length === 0) {
      closeAssignModal();
      return;
    }

    const selectElements = assignList?.querySelectorAll('.assign-bank-select') || [];
    const selectedBankMap = new Map();
    selectElements.forEach(sel => {
      selectedBankMap.set(sel.getAttribute('data-order-id'), sel.value);
    });

    const banks = store.getBankAccounts();
    const defaultBankId = banks[0]?.id || 'bank_opay_default';
    let importedCount = 0;

    pendingImportOrders.forEach(order => {
      const orderId = String(order.id);
      const direction = Number(order.side) === 0 ? 'BUY' : 'SELL';
      const rate = parseFloat(order.price) || 0;
      const ngnAmount = parseFloat(order.amount) || 0;
      const usdtAmount = parseFloat(order.notifyTokenQuantity || order.quantity || (rate > 0 ? (ngnAmount / rate).toFixed(4) : 0)) || 0;
      
      const counterparty = order.targetNickName || order.buyerRealName || order.sellerRealName || '';
      const rawDate = order.createDate ? Number(order.createDate) : Date.now();
      const date = new Date(rawDate).toISOString();

      // Get assigned bank for this trade
      const assignedBankId = selectedBankMap.get(orderId) || defaultBankId;

      // Calculate automated Fintech fees (₦50 EMTL + ₦10 transfer fee)
      const fees = calculateFintechTradeFees(direction, ngnAmount, false);
      const totalFees = fees.reduce((sum, f) => sum + f.amount, 0);
      const { netAmount, effectiveRate } = calculateTradeBreakdown(direction, ngnAmount, usdtAmount, totalFees);

      store.addTrade({
        refId: orderId,
        type: direction,
        date,
        bankAccountId: assignedBankId,
        rate,
        ngnAmount,
        usdtAmount,
        fees,
        totalFees,
        netAmount,
        effectiveRate,
        counterparty,
        paymentMethod: 'Bybit P2P',
        notes: `Auto-imported Bybit P2P Order #${orderId}`
      });

      importedCount++;
    });

    closeAssignModal();
    if (window.showToast) {
      window.showToast(`Successfully imported & assigned ${importedCount} trades!`, 'success');
    }
  });

  btnImportTrades?.addEventListener('click', async () => {
    try {
      btnImportTrades.disabled = true;
      if (window.showToast) window.showToast('Fetching completed P2P orders from Bybit...', 'info');

      // Fetch up to 30 recent orders
      const orderData = await bybitService.fetchP2POrders(1, 30);
      const items = orderData.items || [];

      if (!items || items.length === 0) {
        if (window.showToast) window.showToast('No P2P orders found on your Bybit account.', 'info');
        return;
      }

      const banks = store.getBankAccounts();
      const defaultBankId = banks[0]?.id || 'bank_opay_default';
      const balanceMap = store.getComputedBankBalances ? store.getComputedBankBalances() : new Map();

      const existingTrades = store.getTrades();
      const existingRefIds = new Set(existingTrades.map(t => t.refId).filter(Boolean));

      // Filter for new completed orders
      const newOrders = items.filter(order => Number(order.status) === 50 && !existingRefIds.has(String(order.id)));

      if (newOrders.length === 0) {
        if (window.showToast) {
          window.showToast('All finished Bybit P2P orders are already in your journal.', 'info');
        }
        return;
      }

      const buyOrders = newOrders.filter(o => Number(o.side) === 0);
      const sellOrders = newOrders.filter(o => Number(o.side) === 1);

      // If there are BUY orders, open the Assign Banks modal so user can pick the source bank
      if (buyOrders.length > 0 && assignList && modalAssign) {
        pendingImportOrders = newOrders;

        const bankOptionsHtml = banks.map(bank => {
          const bal = balanceMap.get(bank.id)?.currentBalance ?? 0;
          return `<option value="${escapeHtml(bank.id)}">${escapeHtml(bank.name)} (•••• ${escapeHtml(bank.last4)}) — ₦${bal.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</option>`;
        }).join('');

        assignList.innerHTML = buyOrders.map(order => {
          const ngnAmount = parseFloat(order.amount) || 0;
          const usdtAmount = parseFloat(order.notifyTokenQuantity || order.quantity || 0);
          const rate = parseFloat(order.price) || 0;
          const counterparty = order.targetNickName || order.sellerRealName || 'Seller';
          const orderDateStr = order.createDate ? new Date(Number(order.createDate)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

          return `
            <div class="card p-3" style="background: rgba(10, 16, 28, 0.6); border: 1px solid rgba(255, 255, 255, 0.08);">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <div>
                  <span class="brand-tag" style="background: rgba(59, 130, 246, 0.15); color: var(--primary-light);">BUY USDT</span>
                  <strong class="ms-2 font-mono">₦${ngnAmount.toLocaleString('en-NG', { minimumFractionDigits: 2 })}</strong>
                  <span class="text-muted small">(${usdtAmount.toFixed(2)} USDT @ ₦${rate.toFixed(2)})</span>
                </div>
                <span class="text-muted small">${orderDateStr}</span>
              </div>
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-muted small">To: <strong>${escapeHtml(counterparty)}</strong></span>
              </div>
              <div class="form-group">
                <label class="form-label small text-muted mb-1">Paid From Bank Account:</label>
                <select class="form-select form-select-sm assign-bank-select" data-order-id="${escapeHtml(String(order.id))}">
                  ${bankOptionsHtml}
                </select>
              </div>
            </div>
          `;
        }).join('');

        if (sellOrders.length > 0) {
          assignList.innerHTML += `
            <p class="text-muted small mt-2">
              <i data-lucide="info"></i> Plus ${sellOrders.length} SELL order(s) will be automatically credited to your primary account.
            </p>
          `;
        }

        modalAssign.classList.remove('hidden');
        if (window.lucide) window.lucide.createIcons();
      } else {
        // Only SELL orders exist, import directly
        let importedCount = 0;
        newOrders.forEach(order => {
          const orderId = String(order.id);
          const direction = 'SELL';
          const rate = parseFloat(order.price) || 0;
          const ngnAmount = parseFloat(order.amount) || 0;
          const usdtAmount = parseFloat(order.notifyTokenQuantity || order.quantity || (rate > 0 ? (ngnAmount / rate).toFixed(4) : 0)) || 0;
          const counterparty = order.targetNickName || order.buyerRealName || '';
          const rawDate = order.createDate ? Number(order.createDate) : Date.now();
          const date = new Date(rawDate).toISOString();

          const fees = calculateFintechTradeFees(direction, ngnAmount, false);
          const totalFees = fees.reduce((sum, f) => sum + f.amount, 0);
          const { netAmount, effectiveRate } = calculateTradeBreakdown(direction, ngnAmount, usdtAmount, totalFees);

          store.addTrade({
            refId: orderId,
            type: direction,
            date,
            bankAccountId: defaultBankId,
            rate,
            ngnAmount,
            usdtAmount,
            fees,
            totalFees,
            netAmount,
            effectiveRate,
            counterparty,
            paymentMethod: 'Bybit P2P',
            notes: `Auto-imported Bybit P2P Order #${orderId}`
          });
          importedCount++;
        });

        if (window.showToast) {
          window.showToast(`Successfully imported ${importedCount} completed Bybit P2P trades!`, 'success');
        }
      }
    } catch (err) {
      console.error('[Bybit Sync] Import error:', err);
      if (window.showToast) {
        window.showToast(`Failed to import trades: ${err.message}`, 'error');
      }
    } finally {
      btnImportTrades.disabled = false;
    }
  });

  // ==========================================
  // Standard Export & Backup Actions
  // ==========================================

  // 1. Export CSV
  btnExportCsv?.addEventListener('click', () => {
    exportTradesToCSV();
  });

  // 2. Export JSON
  btnExportJson?.addEventListener('click', () => {
    exportFullBackupJSON();
  });

  // 3. Import JSON
  inputImportJson?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) {
      importBackupJSON(file);
      inputImportJson.value = '';
    }
  });

  // 4. Wipe All Data
  btnClearAllData?.addEventListener('click', () => {
    const tradesCount = store.getTrades().length;
    const confirm1 = confirm(
      `⚠️ WARNING: Are you sure you want to permanently erase ALL data (${tradesCount} trades, transfers, and bank accounts)?\n\nThis cannot be undone unless you have a JSON backup!`
    );

    if (confirm1) {
      const confirm2 = confirm('Final confirmation: Click OK to completely wipe your journal from this browser.');
      if (confirm2) {
        store.clearAllData();
        if (inputOpeningUsdt) inputOpeningUsdt.value = '';
        if (inputOpeningCost) inputOpeningCost.value = '';
        if (window.showToast) window.showToast('All journal data has been cleared.', 'info');
      }
    }
  });
}
