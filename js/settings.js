/**
 * Bybit NGN P2P Trade Tracker — Settings View Controller
 * Wires opening inventory, data backup, CSV export, JSON import, and data wipe actions
 */

import { store } from './store.js';
import { exportTradesToCSV, exportFullBackupJSON, importBackupJSON } from './export.js';

export function initSettings() {
  const btnExportCsv = document.getElementById('btn-export-csv');
  const btnExportJson = document.getElementById('btn-export-json');
  const inputImportJson = document.getElementById('input-import-json');
  const btnClearAllData = document.getElementById('btn-clear-all-data');

  // Opening Inventory Form
  const formOpening = document.getElementById('form-opening-inventory');
  const inputOpeningUsdt = document.getElementById('input-opening-usdt');
  const inputOpeningCost = document.getElementById('input-opening-cost-basis');

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
