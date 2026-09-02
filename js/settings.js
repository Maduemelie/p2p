/**
 * Bybit NGN P2P Trade Tracker — Settings View Controller
 * Wires opening inventory, data backup, CSV export, JSON import, data wipe,
 * and Bybit P2P Live Sync actions.
 */

import { store } from './store.js';
import { exportTradesToCSV, exportFullBackupJSON, importBackupJSON } from './export.js';
import { bybitService } from './bybitService.js';
import { calculateTradeBreakdown, escapeHtml } from './utils.js';
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
    const saved = store.getOpeningInventory ? store.getOpeningInventory() : {};
    if (inputOpeningUsdt && saved.startingUsdtBalance > 0) {
      inputOpeningUsdt.value = saved.startingUsdtBalance;
    }
    if (inputOpeningCost && saved.defaultCostBasis > 0) {
      inputOpeningCost.value = saved.defaultCostBasis;
    }
  }

  // Fee Defaults Form
  const formFeeDefaults = document.getElementById('form-fee-defaults');
  const inputSettingPlatformFee = document.getElementById('input-setting-platform-fee') || document.getElementById('input-setting-platform-fee-pct');
  const inputSettingInflowFee = document.getElementById('input-setting-inflow-fee');
  const inputSettingOutflowFee = document.getElementById('input-setting-outflow-fee');
  const inputSettingTargetSpread = document.getElementById('input-setting-target-spread');
  const inputSettingTargetVolume = document.getElementById('input-setting-target-volume') || document.getElementById('input-setting-avg-volume');
  const inputSettingMaxFeeDrag = document.getElementById('input-setting-max-fee-drag-pct');

  function populateFeeDefaults() {
    const settings = store.getSettings ? store.getSettings() : {};
    if (inputSettingPlatformFee && settings.platformFeePct !== undefined) {
      inputSettingPlatformFee.value = settings.platformFeePct;
    }
    if (inputSettingInflowFee && settings.inflowFee !== undefined) {
      inputSettingInflowFee.value = settings.inflowFee;
    }
    if (inputSettingOutflowFee && settings.outflowFee !== undefined) {
      inputSettingOutflowFee.value = settings.outflowFee;
    }
    if (inputSettingTargetSpread && settings.targetSpread !== undefined) {
      inputSettingTargetSpread.value = settings.targetSpread;
    }
    if (inputSettingTargetVolume && settings.avgVolume !== undefined) {
      inputSettingTargetVolume.value = settings.avgVolume;
    }
    if (inputSettingMaxFeeDrag && settings.maxFeeDragPct !== undefined) {
      inputSettingMaxFeeDrag.value = settings.maxFeeDragPct;
    }
  }

  populateOpeningInventory();
  populateFeeDefaults();

  formFeeDefaults?.addEventListener('submit', (e) => {
    e.preventDefault();
    const platformFeePct = parseFloat(inputSettingPlatformFee?.value) || 0.3;
    const inflowFee = parseFloat(inputSettingInflowFee?.value) || 50;
    const outflowFee = parseFloat(inputSettingOutflowFee?.value) || 50;
    const targetSpread = parseFloat(inputSettingTargetSpread?.value) || 5.0;
    const avgVolume = parseFloat(inputSettingTargetVolume?.value) || 100;
    const maxFeeDragPct = parseInt(inputSettingMaxFeeDrag?.value, 10) || 20;

    if (store.saveSettings) {
      store.saveSettings({
        platformFeePct,
        inflowFee,
        outflowFee,
        targetSpread,
        avgVolume,
        maxFeeDragPct
      });
    }

    localStorage.setItem('bybit_p2p_pricing_platform_fee_pct', String(platformFeePct));
    localStorage.setItem('bybit_p2p_pricing_platform_fee', String(platformFeePct));
    localStorage.setItem('bybit_p2p_pricing_inflow', String(inflowFee));
    localStorage.setItem('bybit_p2p_pricing_outflow', String(outflowFee));
    localStorage.setItem('bybit_p2p_pricing_spread', String(targetSpread));
    localStorage.setItem('bybit_p2p_pricing_volume', String(avgVolume));
    localStorage.setItem('bybit_p2p_pricing_max_fee_drag_pct', String(maxFeeDragPct));

    if (window.showToast) {
      window.showToast('Trading fee defaults and arbitrage parameters saved!', 'success');
    }
  });

  formOpening?.addEventListener('submit', (e) => {
    e.preventDefault();
    const startingUsdtBalance = parseFloat(inputOpeningUsdt?.value) || 0;
    const defaultCostBasis = parseFloat(inputOpeningCost?.value) || 0;

    store.setOpeningInventory({ startingUsdtBalance, defaultCostBasis });
    if (window.showToast) {
      window.showToast(`Opening inventory saved (${startingUsdtBalance} USDT @ ₦${defaultCostBasis.toFixed(2)})!`, 'success');
    }
  });

  // Listen for external restore/sync to refresh opening form and fee defaults
  window.addEventListener('store:updated', (e) => {
    if (e.detail?.type === 'all' || e.detail?.type === 'settings') {
      populateOpeningInventory();
      populateFeeDefaults();
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



  let lastSettingsSyncId = 0;

  // 1. Sync Live Bybit Holdings (Manual sync also updates Starting USDT inputs)
  //
  // ACCOUNTING MODEL:
  //   walletBalance = Total P2P balance (e.g. 103.01 USDT, includes ad coins)
  //   transferBalance = Free P2P balance for buyback (e.g. 71.31 USDT, excludes ad coins)
  //   Active ad allocation = walletBalance − transferBalance (e.g. 31.70 USDT)
  //
  async function syncSettingsLiveHoldings(showToast = false) {
    const currentSyncId = ++lastSettingsSyncId;

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
        const isSell = (a) => {
          if (!a) return false;
          const raw = (a.side !== undefined && a.side !== null) ? a.side : (a.tradeType ?? a.sideName ?? a.type ?? a.action ?? '');
          const s = String(raw).trim().toUpperCase();
          return s === '1' || s === 'SELL';
        };
        const isOnlineOrActive = (s) => {
          if (s === undefined || s === null || s === '') return true;
          const str = String(s).trim().toUpperCase();
          return str === '10' || str === '1' || str === 'ONLINE' || str === 'ACTIVE';
        };
        const sellAds = ads.filter(a => isSell(a) && isOnlineOrActive(a.status));
        if (sellAds.length > 0) {
          adAllocation = sellAds.reduce((sum, a) => {
            const lq = parseFloat(String(a.lastQuantity ?? a.quantity ?? 0).replace(/,/g, '')) || 0;
            const fq = parseFloat(String(a.frozenQuantity ?? 0).replace(/,/g, '')) || 0;
            return sum + lq + fq;
          }, 0);
        }
      } catch (e) {
        console.warn('[Settings] Could not fetch active ads:', e.message);
      }

      if (currentSyncId !== lastSettingsSyncId) {
        // Discard stale out-of-order response
        return;
      }

      const freeForBuyback = Math.max(0, totalP2P - adAllocation);

      if (elTotal) elTotal.textContent = `${totalP2P.toFixed(2)} USDT`;
      if (elLocked) elLocked.textContent = `${adAllocation.toFixed(2)} USDT`;
      if (elFree) elFree.textContent = `${freeForBuyback.toFixed(2)} USDT`;

      if (showToast && window.showToast) {
        window.showToast(`P2P Balance Synced: ${totalP2P.toFixed(2)} USDT Total (${freeForBuyback.toFixed(2)} USDT Free, ${adAllocation.toFixed(2)} USDT Locked)`, 'success');
      }
    } catch (err) {
      console.error('[Settings] Bybit holdings sync error:', err);
      if (showToast && window.showToast) {
        window.showToast(`Failed to sync: ${err.message}`, 'error');
      }
    }
  }

  let isSyncingBalance = false;
  btnSyncBalance?.addEventListener('click', async () => {
    if (isSyncingBalance) return;
    try {
      isSyncingBalance = true;
      btnSyncBalance.disabled = true;
      if (window.showToast) window.showToast('Fetching live Bybit holdings...', 'info');
      await syncSettingsLiveHoldings(true);
    } finally {
      isSyncingBalance = false;
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
      const isBuy = direction === 'BUY';
      const rate = parseFloat(order.price) || 0;
      const ngnAmount = parseFloat(order.amount) || 0;
      const usdtAmount = parseFloat(order.notifyTokenQuantity || order.quantity || (rate > 0 ? (ngnAmount / rate).toFixed(4) : 0)) || 0;
      
      const counterparty = order.targetNickName || (isBuy ? order.sellerRealName : order.buyerRealName) || '';
      const rawDate = order.createDate ? Number(order.createDate) : Date.now();
      const date = new Date(rawDate).toISOString();

      // Get assigned bank for this trade
      const assignedBankId = selectedBankMap.get(orderId) || defaultBankId;
      const isSameBank = isBuy ? (formAssign.querySelector(`.assign-same-bank-check[data-order-id="${orderId}"]`)?.checked ?? false) : false;

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

      // Open the Assign Banks modal for all imported orders (BUY and/or SELL)
      if (assignList && modalAssign) {
        pendingImportOrders = newOrders;

        const bankOptionsHtml = banks.map(bank => {
          const bal = balanceMap.get(bank.id)?.currentBalance ?? 0;
          return `<option value="${escapeHtml(bank.id)}">${escapeHtml(bank.name)} (•••• ${escapeHtml(bank.last4)}) — ₦${bal.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</option>`;
        }).join('');

        assignList.innerHTML = newOrders.map(order => {
          const isBuy = Number(order.side) === 0;
          const direction = isBuy ? 'BUY' : 'SELL';
          const ngnAmount = parseFloat(order.amount) || 0;
          const usdtAmount = parseFloat(order.notifyTokenQuantity || order.quantity || 0);
          const rate = parseFloat(order.price) || 0;
          const counterparty = order.targetNickName || (isBuy ? order.sellerRealName : order.buyerRealName) || (isBuy ? 'Seller' : 'Buyer');
          const orderDateStr = order.createDate ? new Date(Number(order.createDate)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
          const badgeStyle = isBuy
            ? 'background: rgba(59, 130, 246, 0.15); color: var(--primary-light);'
            : 'background: rgba(16, 185, 129, 0.15); color: var(--profit);';
          const labelText = isBuy ? 'Paid From Bank Account:' : 'Received Into Bank Account:';

          return `
            <div class="card p-3" style="background: rgba(10, 16, 28, 0.6); border: 1px solid rgba(255, 255, 255, 0.08);">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <div>
                  <span class="brand-tag" style="${badgeStyle}">${direction} USDT</span>
                  <strong class="ms-2 font-mono">₦${ngnAmount.toLocaleString('en-NG', { minimumFractionDigits: 2 })}</strong>
                  <span class="text-muted small">(${usdtAmount.toFixed(2)} USDT @ ₦${rate.toFixed(2)})</span>
                </div>
                <span class="text-muted small">${orderDateStr}</span>
              </div>
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-muted small">${isBuy ? 'To' : 'From'}: <strong>${escapeHtml(counterparty)}</strong></span>
              </div>
              <div class="form-group mb-2">
                <label class="form-label small text-muted mb-1">${labelText}</label>
                <select class="form-select form-select-sm assign-bank-select" data-order-id="${escapeHtml(String(order.id))}">
                  ${bankOptionsHtml}
                </select>
              </div>
              ${isBuy ? `
              <div class="d-flex align-items-center gap-2">
                <input type="checkbox" class="form-check-input assign-same-bank-check" id="same-bank-${escapeHtml(String(order.id))}" data-order-id="${escapeHtml(String(order.id))}" checked>
                <label for="same-bank-${escapeHtml(String(order.id))}" class="small text-muted mb-0" style="cursor: pointer;">
                  Same-Bank Transfer (OPay, PalmPay, Moniepoint, Kuda — Free under ₦10k)
                </label>
              </div>` : ''}
            </div>
          `;
        }).join('');

        modalAssign.classList.remove('hidden');
        if (window.lucide) window.lucide.createIcons();
      } else {
        // Fallback: If modal DOM element is unavailable, import with default bank
        let importedCount = 0;
        newOrders.forEach(order => {
          const orderId = String(order.id);
          const direction = Number(order.side) === 0 ? 'BUY' : 'SELL';
          const isBuy = direction === 'BUY';
          const rate = parseFloat(order.price) || 0;
          const ngnAmount = parseFloat(order.amount) || 0;
          const usdtAmount = parseFloat(order.notifyTokenQuantity || order.quantity || (rate > 0 ? (ngnAmount / rate).toFixed(4) : 0)) || 0;
          const counterparty = order.targetNickName || (isBuy ? order.sellerRealName : order.buyerRealName) || '';
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
          if (inputSettingPlatformFee) inputSettingPlatformFee.value = '0.30';
          if (inputSettingInflowFee) inputSettingInflowFee.value = '50';
          if (inputSettingOutflowFee) inputSettingOutflowFee.value = '50';
          if (inputSettingTargetSpread) inputSettingTargetSpread.value = '5.0';
          if (inputSettingTargetVolume) inputSettingTargetVolume.value = '100';
          if (window.showToast) window.showToast('All journal data has been cleared.', 'info');
        },
        'danger'
      );
    }
  });
}
