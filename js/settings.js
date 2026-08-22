/**
 * Bybit NGN P2P Trade Tracker — Settings View Controller
 * Wires opening inventory, data backup, CSV export, JSON import, data wipe,
 * and Bybit P2P Live Sync actions.
 */

import { store } from './store.js';
import { exportTradesToCSV, exportFullBackupJSON, importBackupJSON } from './export.js';
import { bybitService } from './bybitService.js';
import { calculateTradeBreakdown, calculateFIFOInventoryAndPnL, escapeHtml, formatNGN, formatUSDT } from './utils.js';
import { calculateFintechTradeFees } from './fees.js';

export function initSettings() {
  const btnExportCsv = document.getElementById('btn-export-csv');
  const btnExportJson = document.getElementById('btn-export-json');
  const inputImportJson = document.getElementById('input-import-json');
  const btnClearAllData = document.getElementById('btn-clear-all-data');

  // Settings sub-tab switching
  const settingsTabBtns = document.querySelectorAll('.settings-tab-btn');
  const settingsTabPanels = document.querySelectorAll('.settings-tab-panel');
  
  settingsTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-settings-tab');
      settingsTabBtns.forEach(b => b.classList.toggle('active', b === btn));
      settingsTabPanels.forEach(p => {
        p.classList.toggle('active', p.getAttribute('data-settings-panel') === target);
      });
      if (window.lucide) window.lucide.createIcons();
    });
  });

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
        // Auto-populate holdings grid when proxy is ready
        if (res.apiKeyConfigured) {
          syncSettingsLiveHoldings();
        }
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



  // 1. Sync Live Bybit Holdings (Manual sync also updates Starting USDT inputs)
  //
  // ACCOUNTING MODEL:
  //   walletBalance = Total P2P balance (e.g. 103.01 USDT, includes ad coins)
  //   transferBalance = Free P2P balance for buyback (e.g. 71.31 USDT, excludes ad coins)
  //   Active ad allocation = walletBalance − transferBalance (e.g. 31.70 USDT)
  //
  async function syncSettingsLiveHoldings(showToast = false) {
    const elFree = document.getElementById('settings-free-usdt');
    const elLocked = document.getElementById('settings-locked-usdt');
    const elTotal = document.getElementById('settings-total-usdt');

    try {
      let totalP2P = 0;

      try {
        const balResult = await bybitService.fetchFundingBalance('USDT');
        const usdtItem = balResult?.balance?.find(b => b.coin === 'USDT') || balResult?.balance?.[0];
        if (usdtItem) {
          totalP2P = parseFloat(usdtItem.transferBalance) || 0;
        }
      } catch (e) {
        console.warn('[Settings] Could not fetch wallet balance:', e.message);
      }

      // Query active ads directly to determine ad allocation
      let adAllocation = 0;
      try {
        const ads = await bybitService.fetchActiveAds('1', 'USDT');
        const activeAd = ads.find(a => Number(a.side) === 1 && Number(a.status) === 10)
          || ads.find(a => Number(a.side) === 1 && (Number(a.status) === 20 || Number(a.status) === 2))
          || null;
        if (activeAd) {
          adAllocation = (parseFloat(activeAd.lastQuantity) || 0) + (parseFloat(activeAd.frozenQuantity) || 0);
        }
      } catch (e) {
        console.warn('[Settings] Could not fetch active ads:', e.message);
      }

      const freeForBuyback = Math.max(0, totalP2P - adAllocation);

      if (elTotal) elTotal.textContent = `${totalP2P.toFixed(2)} USDT`;
      if (elLocked) elLocked.textContent = `${adAllocation.toFixed(2)} USDT`;
      if (elFree) elFree.textContent = `${freeForBuyback.toFixed(2)} USDT`;

      if (showToast) {
        // Find active ad's original quantity to set as Starting Inventory
        let adOriginalQty = totalP2P;
        try {
          const ads = await bybitService.fetchActiveAds('1', 'USDT');
          const activeAd = ads.find(a => Number(a.side) === 1 && Number(a.status) === 10)
            || ads.find(a => Number(a.side) === 1 && (Number(a.status) === 20 || Number(a.status) === 2))
            || null;
          if (activeAd) {
            adOriginalQty = parseFloat(activeAd.quantity) || totalP2P;
          }
        } catch (adErr) {
          console.warn('[Settings Sync] Could not fetch active ads:', adErr.message);
        }

        // Calculate current FIFO average buy cost
        const trades = store.getTrades();
        const currentOpening = store.getOpeningInventory();
        const fifoResult = calculateFIFOInventoryAndPnL(trades, currentOpening);
        const avgBuyCost = fifoResult.avgHoldingCostPerUSDT || currentOpening.defaultCostBasis || 0;

        store.setOpeningInventory({
          startingUsdtBalance: adOriginalQty,
          defaultCostBasis: avgBuyCost
        });

        if (inputOpeningUsdt) inputOpeningUsdt.value = adOriginalQty;
        if (inputOpeningCost) inputOpeningCost.value = avgBuyCost;

        if (window.showToast) {
          window.showToast(`P2P Balance Synced: ${adOriginalQty.toFixed(2)} USDT saved as Starting USDT @ ₦${avgBuyCost.toFixed(2)}!`, 'success');
        }
      }
    } catch (err) {
      console.error('[Settings] Bybit holdings sync error:', err);
      if (showToast && window.showToast) {
        window.showToast(`Failed to sync: ${err.message}`, 'error');
      }
    }
  }

  btnSyncBalance?.addEventListener('click', async () => {
    try {
      btnSyncBalance.disabled = true;
      if (window.showToast) window.showToast('Fetching live Bybit holdings...', 'info');
      await syncSettingsLiveHoldings(true);
    } finally {
      btnSyncBalance.disabled = false;
    }
  });

  // Check proxy and populate settings grid on load
  checkProxyConnection();

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
      const isSameBank = formAssign.querySelector(`.assign-same-bank-check[data-order-id="${orderId}"]`)?.checked ?? false;

      // Calculate automated Fintech fees (OPay-to-OPay is free under ₦10k)
      const fees = calculateFintechTradeFees(direction, ngnAmount, isSameBank);
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
              <div class="form-group mb-2">
                <label class="form-label small text-muted mb-1">Paid From Bank Account:</label>
                <select class="form-select form-select-sm assign-bank-select" data-order-id="${escapeHtml(String(order.id))}">
                  ${bankOptionsHtml}
                </select>
              </div>
              <div class="d-flex align-items-center gap-2">
                <input type="checkbox" class="form-check-input assign-same-bank-check" id="same-bank-${escapeHtml(String(order.id))}" data-order-id="${escapeHtml(String(order.id))}" checked>
                <label for="same-bank-${escapeHtml(String(order.id))}" class="small text-muted mb-0" style="cursor: pointer;">
                  Same-Bank Transfer (OPay, PalmPay, Moniepoint, Kuda — Free under ₦10k)
                </label>
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
    if (window.showConfirmModal) {
      window.showConfirmModal(
        'Delete All Data?',
        `This will permanently erase ${tradesCount} trades, all transfers, and bank accounts. This cannot be undone without a JSON backup.`,
        () => {
          store.clearAllData();
          if (inputOpeningUsdt) inputOpeningUsdt.value = '';
          if (inputOpeningCost) inputOpeningCost.value = '';
          if (window.showToast) window.showToast('All journal data has been cleared.', 'info');
        },
        'danger'
      );
    }
  });
}
