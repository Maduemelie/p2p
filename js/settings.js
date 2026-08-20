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

      const existingTrades = store.getTrades();
      const existingRefIds = new Set(existingTrades.map(t => t.refId).filter(Boolean));

      let importedCount = 0;

      items.forEach(order => {
        // Status 50 = Order Finished / Completed in Bybit P2P
        const isFinished = Number(order.status) === 50;
        const orderId = String(order.id);

        if (isFinished && !existingRefIds.has(orderId)) {
          // side: 0 is Buy, 1 is Sell
          const direction = Number(order.side) === 0 ? 'BUY' : 'SELL';
          const rate = parseFloat(order.price) || 0;
          const ngnAmount = parseFloat(order.amount) || 0;
          const usdtAmount = parseFloat(order.notifyTokenQuantity || order.quantity || (rate > 0 ? (ngnAmount / rate).toFixed(4) : 0)) || 0;
          
          const counterparty = order.targetNickName || order.buyerRealName || order.sellerRealName || '';
          const rawDate = order.createDate ? Number(order.createDate) : Date.now();
          const date = new Date(rawDate).toISOString();

          // Calculate automated Fintech fees (₦50 EMTL + ₦10 transfer fee)
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

          existingRefIds.add(orderId);
          importedCount++;
        }
      });

      if (importedCount > 0) {
        if (window.showToast) {
          window.showToast(`Successfully imported ${importedCount} completed Bybit P2P trades!`, 'success');
        }
      } else {
        if (window.showToast) {
          window.showToast('All finished Bybit P2P orders are already in your journal.', 'info');
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
