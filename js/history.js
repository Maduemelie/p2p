/**
 * Bybit NGN P2P Trade Tracker — Trade History Module
 * Search, multi-factor filtering, sorting, FIFO cost-basis card annotations, edit and delete
 */

import { store } from './store.js';
import { formatNGN, formatUSDT, formatRate, formatDateTime, calculateFIFOInventoryAndPnL, escapeHtml } from './utils.js';

let activeSearchQuery = '';
let activeTypeFilter = 'ALL';
let activeBankFilter = 'ALL';
let activeSortOrder = 'date-desc';

export function initHistory() {
  setupFilterControls();
  renderTradeHistory();

  // Listen for store updates
  window.addEventListener('store:updated', (e) => {
    if (e.detail?.type === 'trades' || e.detail?.type === 'all' || e.detail?.type === 'banks' || e.detail?.type === 'settings') {
      renderTradeHistory();
    }
  });

  // Quick export button hook
  const btnExportQuick = document.getElementById('btn-export-quick');
  btnExportQuick?.addEventListener('click', () => {
    if (window.switchView) {
      window.switchView('settings');
      if (window.showToast) window.showToast('Select CSV or JSON export below', 'info');
    }
  });
}

/**
 * Attach listeners to search and filter toolbar
 */
function setupFilterControls() {
  const searchInput = document.getElementById('history-search');
  const btnClearSearch = document.getElementById('btn-clear-search');
  const filterType = document.getElementById('filter-type');
  const filterBank = document.getElementById('filter-bank');
  const filterSort = document.getElementById('filter-sort');

  searchInput?.addEventListener('input', () => {
    activeSearchQuery = searchInput.value.trim().toLowerCase();
    if (btnClearSearch) {
      btnClearSearch.classList.toggle('hidden', activeSearchQuery.length === 0);
    }
    renderTradeHistory();
  });

  btnClearSearch?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    activeSearchQuery = '';
    btnClearSearch.classList.add('hidden');
    renderTradeHistory();
  });

  filterType?.addEventListener('change', () => {
    activeTypeFilter = filterType.value;
    renderTradeHistory();
  });

  filterBank?.addEventListener('change', () => {
    activeBankFilter = filterBank.value;
    renderTradeHistory();
  });

  // Add P&L sort options to select if not already present
  if (filterSort && !filterSort.querySelector('option[value="pnl-desc"]')) {
    const optProfitHigh = document.createElement('option');
    optProfitHigh.value = 'pnl-desc';
    optProfitHigh.textContent = 'Highest Profit';
    filterSort.appendChild(optProfitHigh);

    const optProfitLow = document.createElement('option');
    optProfitLow.value = 'pnl-asc';
    optProfitLow.textContent = 'Biggest Loss';
    filterSort.appendChild(optProfitLow);
  }

  filterSort?.addEventListener('change', () => {
    activeSortOrder = filterSort.value;
    renderTradeHistory();
  });
}

/**
 * Filter, sort, and render trade cards with FIFO annotations
 */
export function renderTradeHistory() {
  const container = document.getElementById('trades-history-container');
  if (!container) return;

  const rawTrades = store.getTrades();
  const openingInventory = store.getOpeningInventory();
  const banks = store.getBankAccounts();
  const bankMap = new Map(banks.map(b => [b.id, b]));

  if (rawTrades.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon-box">
          <i data-lucide="history"></i>
        </div>
        <p class="empty-title">No trades logged yet</p>
        <p class="empty-subtitle">Your completed and recorded trades will show up here.</p>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  // Run FIFO engine
  const { enrichedTrades } = calculateFIFOInventoryAndPnL(rawTrades, openingInventory);

  // 1. Filter by Type and Bank
  let filtered = enrichedTrades.filter(trade => {
    if (activeTypeFilter !== 'ALL' && trade.type !== activeTypeFilter) return false;
    if (activeBankFilter !== 'ALL' && trade.bankAccountId !== activeBankFilter) return false;

    // Search query matching
    if (activeSearchQuery) {
      const bank = bankMap.get(trade.bankAccountId);
      const bankName = bank ? `${bank.name} ${bank.alias || ''} ${bank.last4}`.toLowerCase() : '';
      const counterparty = (trade.counterparty || '').toLowerCase();
      const notes = (trade.notes || '').toLowerCase();
      const paymentMethod = (trade.paymentMethod || '').toLowerCase();
      const ngnStr = trade.ngnAmount.toString();
      const usdtStr = trade.usdtAmount.toString();
      const rateStr = trade.rate.toString();

      const matches = bankName.includes(activeSearchQuery) ||
                      counterparty.includes(activeSearchQuery) ||
                      notes.includes(activeSearchQuery) ||
                      paymentMethod.includes(activeSearchQuery) ||
                      ngnStr.includes(activeSearchQuery) ||
                      usdtStr.includes(activeSearchQuery) ||
                      rateStr.includes(activeSearchQuery);
      if (!matches) return false;
    }

    return true;
  });

  // 2. Sort Order
  filtered.sort((a, b) => {
    switch (activeSortOrder) {
      case 'date-asc':
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      case 'amount-desc':
        return (Number(b.ngnAmount) || 0) - (Number(a.ngnAmount) || 0);
      case 'amount-asc':
        return (Number(a.ngnAmount) || 0) - (Number(b.ngnAmount) || 0);
      case 'pnl-desc':
        return (Number(b.realizedPnL) || 0) - (Number(a.realizedPnL) || 0);
      case 'pnl-asc':
        return (Number(a.realizedPnL) || 0) - (Number(b.realizedPnL) || 0);
      case 'date-desc':
      default:
        return new Date(b.date).getTime() - new Date(a.date).getTime();
    }
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon-box">
          <i data-lucide="filter-x"></i>
        </div>
        <p class="empty-title">No matching trades</p>
        <p class="empty-subtitle">Try adjusting your search keywords or filter dropdowns.</p>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  // 3. Render Trade Cards
  container.innerHTML = filtered.map(trade => {
    const isBuy = trade.type === 'BUY';
    const bank = bankMap.get(trade.bankAccountId);
    const bankName = bank ? `${bank.name} •••• ${bank.last4}` : 'Unknown Bank';
    const hasFees = trade.fees && Array.isArray(trade.fees) && trade.fees.length > 0;
    const hasMatchedLots = trade.matchedLots && trade.matchedLots.length > 0;
    const hasDrawerContent = hasFees || hasMatchedLots;

    // Realized P&L Pill Badge for SELL trades
    let pnlBadge = '';
    if (!isBuy && trade.realizedPnL !== null) {
      const isProfitable = trade.realizedPnL >= 0;
      const roiStr = Math.abs(trade.roiPercent || 0).toFixed(2);
      pnlBadge = `
        <span class="brand-tag" style="background: ${isProfitable ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)'}; color: ${isProfitable ? 'var(--profit)' : 'var(--loss)'}; border: 1px solid ${isProfitable ? 'rgba(16, 185, 129, 0.4)' : 'rgba(244, 63, 94, 0.4)'}; font-weight: 700;">
          P&L: ${formatNGN(trade.realizedPnL)} (${isProfitable ? '+' : '-'}${roiStr}%)
        </span>
      `;
    }

    // Unmatched Quantity Warning Badge
    let unmatchedBadge = '';
    if (trade.unmatchedQty > 0) {
      unmatchedBadge = `
        <div class="mt-2 p-2 d-flex align-items-center gap-2" style="background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: var(--radius-sm); font-size: 0.78rem; color: var(--warning);">
          <i data-lucide="alert-triangle" style="width: 14px; height: 14px; flex-shrink: 0;"></i>
          <span><b>${formatUSDT(trade.unmatchedQty)}</b> sold from external / unrecorded inventory (0% P&L assumed for this portion).</span>
        </div>
      `;
    }

    return `
      <div class="card mb-3 trade-history-card" style="border-left: 4px solid ${isBuy ? 'var(--profit)' : (trade.realizedPnL !== null && trade.realizedPnL < 0 ? 'var(--loss)' : 'var(--profit)')};">
        <!-- Top Row: Type Badge, Date, PnL & Actions -->
        <div class="d-flex align-items-center justify-content-between mb-3">
          <div class="d-flex align-items-center gap-2 flex-wrap">
            <span class="brand-tag" style="background: ${isBuy ? 'rgba(16, 185, 129, 0.18)' : 'rgba(244, 63, 94, 0.18)'}; color: ${isBuy ? 'var(--profit)' : 'var(--loss)'}; border-color: ${isBuy ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'};">
              <i data-lucide="${isBuy ? 'arrow-down-left' : 'arrow-up-right'}" style="width: 12px; height: 12px; vertical-align: middle;"></i>
              ${trade.type} USDT
            </span>
            ${pnlBadge}
            <span class="text-muted small">${formatDateTime(trade.date)}</span>
          </div>

          <div class="d-flex align-items-center gap-1">
            <button class="btn-icon btn-sm btn-edit-trade" data-trade-id="${escapeHtml(trade.id)}" title="Edit Trade" aria-label="Edit Trade" style="width: 32px; height: 32px;">
              <i data-lucide="edit-3"></i>
            </button>
            <button class="btn-icon btn-sm btn-delete-trade text-loss" data-trade-id="${escapeHtml(trade.id)}" title="Delete Trade" aria-label="Delete Trade" style="width: 32px; height: 32px;">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </div>

        <!-- Main Financial Amounts -->
        <div class="d-flex align-items-baseline justify-content-between mb-3">
          <div>
            <div class="text-muted small">${isBuy ? 'Gross Paid' : 'Gross Received'}</div>
            <div class="font-mono fw-bold" style="font-size: 1.35rem; color: ${isBuy ? 'var(--text-main)' : 'var(--profit)'};">
              ${formatNGN(trade.ngnAmount)}
            </div>
          </div>
          <div class="text-end">
            <div class="text-muted small">Crypto Volume</div>
            <div class="font-mono fw-bold text-accent" style="font-size: 1.15rem;">
              ${formatUSDT(trade.usdtAmount)}
            </div>
          </div>
        </div>

        <!-- Trade Breakdown Metadata Grid -->
        <div class="trade-meta-grid p-3 mb-2" style="background: rgba(10, 16, 28, 0.5); border-radius: var(--radius-md); border: 1px solid var(--border-subtle); display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; font-size: 0.82rem;">
          <div>
            <span class="text-muted">Order Rate:</span>
            <span class="font-mono text-main ms-1">${formatRate(trade.rate)}</span>
          </div>
          <div>
            <span class="text-muted">Effective Rate:</span>
            <span class="font-mono text-main ms-1">${formatRate(trade.effectiveRate || trade.rate)}</span>
          </div>
          <div>
            <span class="text-muted">Bank Account:</span>
            <span class="text-main ms-1">${escapeHtml(bankName)}</span>
          </div>
          <div>
            <span class="text-muted">Payment:</span>
            <span class="text-main ms-1">${escapeHtml(trade.paymentMethod || 'Bank Transfer')}</span>
          </div>
          ${trade.counterparty ? `
            <div style="grid-column: span 2;">
              <span class="text-muted">Counterparty:</span>
              <span class="text-main ms-1 font-mono">${escapeHtml(trade.counterparty)}</span>
            </div>
          ` : ''}
        </div>

        <!-- Unmatched Alert (if any) -->
        ${unmatchedBadge}

        <!-- Fees & Cost Breakdown Row -->
        <div class="d-flex align-items-center justify-content-between pt-2" style="border-top: 1px solid var(--border-subtle); font-size: 0.85rem;">
          <div>
            ${hasDrawerContent ? `
              <button class="btn-link btn-toggle-fees text-accent d-flex align-items-center gap-1" data-drawer-id="drawer_${trade.id}">
                <i data-lucide="layers" style="width: 14px; height: 14px;"></i>
                <span>${isBuy ? `Fees: ${formatNGN(trade.totalFees)}` : `FIFO Cost Basis & Fees`}</span>
                <i data-lucide="chevron-down" style="width: 14px; height: 14px;"></i>
              </button>
            ` : `
              <span class="text-muted small">No fees recorded</span>
            `}
          </div>

          <div class="text-end">
            <span class="text-muted small">${isBuy ? 'Net Total Cost:' : 'Net Received:'}</span>
            <span class="font-mono fw-bold text-accent ms-1">${formatNGN(trade.netAmount || trade.ngnAmount)}</span>
          </div>
        </div>

        <!-- Collapsible FIFO Cost Basis & Fees Breakdown Drawer -->
        ${hasDrawerContent ? `
          <div class="fee-drawer hidden mt-3 p-3" id="drawer_${trade.id}" style="background: rgba(14, 22, 38, 0.7); border-radius: var(--radius-sm); border: 1px dashed var(--border-subtle); font-size: 0.8rem;">
            
            ${hasMatchedLots ? `
              <div class="fw-bold mb-2 text-accent d-flex align-items-center gap-1">
                <i data-lucide="package-check" style="width: 14px; height: 14px;"></i>
                <span>FIFO Matched Buy Lots</span>
              </div>
              <div class="mb-3">
                ${trade.matchedLots.map(lot => `
                  <div class="d-flex align-items-center justify-content-between py-1" style="border-bottom: 1px solid rgba(255,255,255,0.04);">
                    <span class="text-secondary">${escapeHtml(lot.source)}: <b>${formatUSDT(lot.qty)}</b> @ ${formatRate(lot.buyRate)}</span>
                    <span class="font-mono text-main">${formatNGN(lot.lotCost)}</span>
                  </div>
                `).join('')}
                <div class="d-flex align-items-center justify-content-between pt-1 fw-bold">
                  <span class="text-muted">Total Matched Cost Basis:</span>
                  <span class="font-mono text-warning">${formatNGN(trade.costBasis)}</span>
                </div>
              </div>
            ` : ''}

            ${hasFees ? `
              <div class="fw-bold mb-2 text-warning d-flex align-items-center gap-1">
                <i data-lucide="receipt" style="width: 14px; height: 14px;"></i>
                <span>Itemized Trade Fees</span>
              </div>
              ${trade.fees.map(f => `
                <div class="d-flex align-items-center justify-content-between py-1" style="border-bottom: 1px solid rgba(255,255,255,0.04);">
                  <span class="text-secondary">${escapeHtml(f.label || f.type)}</span>
                  <span class="font-mono text-warning">${formatNGN(f.amount)}</span>
                </div>
              `).join('')}
            ` : ''}
          </div>
        ` : ''}

        <!-- Notes -->
        ${trade.notes ? `
          <div class="mt-2 text-muted small" style="font-style: italic;">
            <i data-lucide="file-text" style="width: 12px; height: 12px; vertical-align: middle;"></i>
            ${escapeHtml(trade.notes)}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();

  // Attach Fee Drawers Toggle
  container.querySelectorAll('.btn-toggle-fees').forEach(btn => {
    btn.addEventListener('click', () => {
      const drawerId = btn.getAttribute('data-drawer-id');
      const drawer = document.getElementById(drawerId);
      if (drawer) {
        drawer.classList.toggle('hidden');
      }
    });
  });

  // Attach Edit Listeners
  container.querySelectorAll('.btn-edit-trade').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tradeId = btn.getAttribute('data-trade-id');
      if (window.startEditTrade) {
        window.startEditTrade(tradeId);
      }
    });
  });

  // Attach Delete Listeners
  container.querySelectorAll('.btn-delete-trade').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tradeId = btn.getAttribute('data-trade-id');
      const trade = store.getTradeById(tradeId);
      if (confirm(`Are you sure you want to delete this ${trade?.type || ''} trade (${formatNGN(trade?.ngnAmount || 0)})?`)) {
        store.deleteTrade(tradeId);
        if (window.showToast) window.showToast('Trade deleted successfully', 'info');
      }
    });
  });
}
