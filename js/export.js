/**
 * Bybit NGN P2P Trade Tracker — Data Export & Import Module
 * Handles CSV conversion, JSON serialization, backup downloading, and file restoration
 */

import { store } from './store.js';

/**
 * Trigger download of a Blob as a file
 * @param {Blob} blob
 * @param {string} filename
 */
export function triggerFileDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export all recorded trades to CSV
 */
export function exportTradesToCSV() {
  const trades = store.getTrades();
  const banks = store.getBankAccounts();
  const bankMap = new Map(banks.map(b => [b.id, b]));

  if (trades.length === 0) {
    if (window.showToast) window.showToast('No trades to export.', 'info');
    return;
  }

  const headers = [
    'Trade ID',
    'Date & Time',
    'Type',
    'Bank Account',
    'Order Rate (NGN/USDT)',
    'Effective Rate (NGN/USDT)',
    'Gross NGN',
    'USDT Volume',
    'Total Fees (NGN)',
    'Net Total NGN',
    'Fee Breakdown',
    'Counterparty',
    'Payment Method',
    'Notes'
  ];

  const rows = trades.map(t => {
    const bank = bankMap.get(t.bankAccountId);
    const bankName = bank ? `${bank.name} (${bank.alias || ''}) •••• ${bank.last4}`.trim() : 'Unknown';
    const feeDetails = (t.fees && Array.isArray(t.fees)) 
      ? t.fees.map(f => `${f.label || f.type}: ₦${Number(f.amount).toFixed(2)}`).join('; ')
      : '';

    return [
      t.id || '',
      t.date || '',
      t.type || '',
      bankName,
      Number(t.rate || 0).toFixed(2),
      Number(t.effectiveRate || t.rate || 0).toFixed(2),
      Number(t.ngnAmount || 0).toFixed(2),
      Number(t.usdtAmount || 0).toFixed(4),
      Number(t.totalFees || 0).toFixed(2),
      Number(t.netAmount || t.ngnAmount || 0).toFixed(2),
      feeDetails,
      t.counterparty || '',
      t.paymentMethod || '',
      t.notes || ''
    ];
  });

  // Escape and format CSV lines
  const csvContent = [
    headers.map(escapeCSVField).join(','),
    ...rows.map(row => row.map(escapeCSVField).join(','))
  ].join('\r\n');

  const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
  const dateStr = new Date().toISOString().slice(0, 10);
  triggerFileDownload(blob, `bybit_p2p_trades_${dateStr}.csv`);

  if (window.showToast) window.showToast(`Exported ${trades.length} trades to CSV!`, 'success');
}

/**
 * Escape quotes and commas in CSV cells
 */
function escapeCSVField(field) {
  const str = String(field ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Export full JSON backup (Trades, Bank Accounts, Transfers)
 */
export function exportFullBackupJSON() {
  const backupData = store.exportAllData();
  const jsonStr = JSON.stringify(backupData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
  const dateStr = new Date().toISOString().slice(0, 10);
  triggerFileDownload(blob, `bybit_p2p_backup_${dateStr}.json`);

  if (window.showToast) window.showToast('Full JSON backup downloaded!', 'success');
}

/**
 * Read and restore database from uploaded JSON file
 * @param {File} file
 */
export function importBackupJSON(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target.result);

      if (!data || typeof data !== 'object' || (!data.trades && !data.bankAccounts)) {
        throw new Error('Invalid or unrecognised JSON backup schema.');
      }

      const tradeCount = Array.isArray(data.trades) ? data.trades.length : 0;
      const bankCount = Array.isArray(data.bankAccounts) ? data.bankAccounts.length : 0;

      const confirmMsg = `Restore backup containing ${tradeCount} trades and ${bankCount} bank accounts?\n\nThis will restore your data to this device.`;
      if (confirm(confirmMsg)) {
        store.importAllData(data, true);
        if (window.showToast) window.showToast('Backup restored successfully!', 'success');
      }
    } catch (err) {
      console.error('[Import Error]', err);
      if (window.showToast) window.showToast(`Import failed: ${err.message || 'Invalid JSON file'}`, 'error');
    }
  };

  reader.onerror = () => {
    if (window.showToast) window.showToast('Could not read the selected file.', 'error');
  };

  reader.readAsText(file);
}
