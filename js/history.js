/**
 * Bybit NGN P2P Trade Tracker — Trade History Module
 * Search, multi-factor filtering, sorting, FIFO cost-basis card annotations, edit, delete, and pagination.
 * Redesigned v2.1 with compact expandable rows and dynamic pagination controls.
 */

import { store } from './store.js';
import { formatNGN, formatUSDT, formatRate, formatDateTime, calculateFIFOInventoryAndPnL, escapeHtml } from './utils.js';

let activeSearchQuery = '';
let activeTypeFilter = 'ALL';
let activeBankFilter = 'ALL';
let activeSortOrder = 'date-desc';

// Pagination state
let currentPage = 1;
const pageSize = 20;

export function initHistory() {
  setupFilterControls();
  renderTradeHistory();

  // Listen for store updates
  window.addEventListener('store:updated', (e) => {
    if (e.detail?.type === 'trades' || e.detail?.type === 'all' || e.detail?.type === 'banks' || e.detail?.type === 'settings') {
      renderTradeHistory();
    }
  });

  // Quick export button hooks
  const btnExportCsvInline = document.getElementById('btn-export-csv-inline');
  btnExportCsvInline?.addEventListener('click', () => {
    import('./export.js').then(mod => mod.exportTradesToCSV());
  });

  const btnExportQuick = document.getElementById('btn-export-quick');
  btnExportQuick?.addEventListener('click', () => {
    import('./export.js').then(mod => mod.exportFullBackupJSON());
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

  const onFilterChange = () => {
    currentPage = 1; // Reset to first page on filter change
    renderTradeHistory();
  };

  searchInput?.addEventListener('input', () => {
    activeSearchQuery = searchInput.value.trim().toLowerCase();
    if (btnClearSearch) {
      btnClearSearch.classList.toggle('hidden', activeSearchQuery.length === 0);
    }
    onFilterChange();
  });

  btnClearSearch?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    activeSearchQuery = '';
    btnClearSearch.classList.add('hidden');
    onFilterChange();
  });

  filterType?.addEventListener('change', () => {
    activeTypeFilter = filterType.value;
    onFilterChange();
  });

  filterBank?.addEventListener('change', () => {
    activeBankFilter = filterBank.value;
    onFilterChange();
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
    onFilterChange();
  });
}

/**
 * Filter, sort, and render trade cards with FIFO annotations
 */
export function renderTradeHistory() {
  const container = document.getElementById('trades-history-container');
  const paginationContainer = document.getElementById('history-pagination');
  const tradeCountEl = document.getElementById('history-trade-count');
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
    if (paginationContainer) paginationContainer.classList.add('hidden');
    if (tradeCountEl) tradeCountEl.textContent = '0 trades';
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

  // Populate dynamic header filter options for Banks if empty
  const filterBankSelect = document.getElementById('filter-bank');
  if (filterBankSelect && filterBankSelect.options.length <= 1) {
    banks.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = `${b.name} (•••• ${b.last4})`;
      filterBankSelect.appendChild(opt);
    });
    // Restore selected value
    filterBankSelect.value = activeBankFilter;
  }

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

  // Update Trade Count text
  if (tradeCountEl) {
    tradeCountEl.textContent = `${filtered.length} match${filtered.length === 1 ? '' : 'es'} found`;
  }

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
    if (paginationContainer) paginationContainer.classList.add('hidden');
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  // 3. Paginate Results
  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  // Boundary check
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedTrades = filtered.slice(startIndex, endIndex);

  // 4. Render Trade Rows (Compact + Expandable Details)
  container.innerHTML = paginatedTrades.map(trade => {
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
        <span class="badge ${isProfitable ? 'badge-success' : 'badge-danger'}">
          P&L: ${formatNGN(trade.realizedPnL)} (${isProfitable ? '+' : '-'}${roiStr}%)
        </span>
      `;
    }

    // Unmatched Quantity Warning Badge
    let unmatchedBadge = '';
    if (trade.unmatchedQty > 0) {
      unmatchedBadge = `
        <div class="alert alert-warning mt-2 mb-2">
          <i data-lucide="alert-triangle"></i>
          <span><b>${formatUSDT(trade.unmatchedQty)}</b> sold from unrecorded inventory (0% P&L assumed).</span>
        </div>
      `;
    }

    const itemStatusClass = isBuy ? 'trade-buy' : (trade.realizedPnL !== null && trade.realizedPnL < 0 ? 'trade-sell-loss' : 'trade-sell-profit');

    return `
      <div class="card mb-3 trade-history-card ${itemStatusClass}" id="trade-card-${trade.id}">
        
        <!-- COMPACT ROW PREVIEW CONTAINER -->
        <div class="trade-list-item cursor-pointer js-row-toggle" data-target-drawer="details_${trade.id}">
          <div class="trade-list-left">
            <div class="trade-type-indicator ${isBuy ? 'buy-indicator' : 'sell-indicator'}">
              <i data-lucide="${isBuy ? 'arrow-down-left' : 'arrow-up-right'}"></i>
            </div>
            <div class="trade-list-info">
              <div class="d-flex align-items-center gap-2 flex-wrap">
                <span class="trade-list-primary">${formatNGN(trade.ngnAmount)}</span>
                <span class="badge ${isBuy ? 'badge-buy' : 'badge-sell'}">${trade.type}</span>
                ${pnlBadge}
              </div>
              <p class="trade-list-secondary">
                ${formatUSDT(trade.usdtAmount)} @ ₦${Number(trade.rate).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
          <div class="trade-list-right d-flex align-items-center gap-2">
            <div class="text-end">
              <div class="text-muted small">${formatDateTime(trade.date).split(' ')[0]}</div>
              <div class="text-muted tiny">${formatDateTime(trade.date).split(' ')[1] || ''}</div>
            </div>
            <i data-lucide="chevron-down" class="row-chevron transition-normal"></i>
          </div>
        </div>

        <!-- EXPANDABLE DETAIL DRAWER -->
        <div class="trade-detail-panel hidden" id="details_${trade.id}">
          <div class="divider my-2"></div>
          
          <!-- Detailed Metadata Grid -->
          <div class="trade-meta-grid card-flat p-3 mb-3">
            <div class="trade-meta-item">
              <span class="trade-meta-label">Order Rate:</span>
              <span class="trade-meta-value">${formatRate(trade.rate)}</span>
            </div>
            <div class="trade-meta-item">
              <span class="trade-meta-label">Effective Rate:</span>
              <span class="trade-meta-value">${formatRate(trade.effectiveRate || trade.rate)}</span>
            </div>
            <div class="trade-meta-item">
              <span class="trade-meta-label">Bank Account:</span>
              <span class="trade-meta-value">${escapeHtml(bankName)}</span>
            </div>
            <div class="trade-meta-item">
              <span class="trade-meta-label">Payment Method:</span>
              <span class="trade-meta-value">${escapeHtml(trade.paymentMethod || 'Bank Transfer')}</span>
            </div>
            ${trade.counterparty ? `
              <div class="trade-meta-item col-12">
                <span class="trade-meta-label">Counterparty:</span>
                <span class="trade-meta-value font-mono">${escapeHtml(trade.counterparty)}</span>
              </div>
            ` : ''}
          </div>

          <!-- Unmatched Alert if applicable -->
          ${unmatchedBadge}

          <!-- Notes -->
          ${trade.notes ? `
            <div class="card-flat p-3 mb-3 text-secondary small">
              <div class="fw-semibold mb-1 d-flex align-items-center gap-1">
                <i data-lucide="file-text"></i>
                <span>Notes & Reference</span>
              </div>
              <p class="font-mono text-primary-color">${escapeHtml(trade.notes)}</p>
            </div>
          ` : ''}

          <!-- Fees & Lot Breakdown Drawer Button -->
          <div class="d-flex align-items-center justify-content-between mb-3">
            <div>
              ${hasDrawerContent ? `
                <button class="btn btn-xs btn-outline btn-toggle-fees" data-drawer-id="drawer_${trade.id}">
                  <i data-lucide="layers"></i>
                  <span>${isBuy ? `Fees: ${formatNGN(trade.totalFees)}` : `FIFO Cost Basis & Fees`}</span>
                  <i data-lucide="chevron-down"></i>
                </button>
              ` : `
                <span class="text-muted small">No fees recorded</span>
              `}
            </div>
            <div class="text-end">
              <span class="text-secondary small">${isBuy ? 'Net Total Cost:' : 'Net Received:'}</span>
              <span class="font-mono fw-bold text-accent ms-1">${formatNGN(trade.netAmount || trade.ngnAmount)}</span>
            </div>
          </div>

          <!-- Inner Collapsible FIFO lots -->
          ${hasDrawerContent ? `
            <div class="fee-drawer hidden p-3 mb-3" id="drawer_${trade.id}">
              ${hasMatchedLots ? `
                <div class="fw-bold mb-2 text-accent d-flex align-items-center gap-1">
                  <i data-lucide="package-check"></i>
                  <span>FIFO Matched Buy Lots</span>
                </div>
                <div class="mb-3 font-mono text-supporting">
                  ${trade.matchedLots.map(lot => {
                    const isRealTrade = lot.lotId && lot.lotId.startsWith('trade');
                    const sourceHtml = isRealTrade
                      ? `<span class="matched-lot-link text-primary-color cursor-pointer hover-underline d-inline-flex align-items-center gap-1" data-target-id="${lot.lotId}" title="Click to jump to this Buy trade">
                           ${escapeHtml(lot.source)} <i data-lucide="external-link" style="width: 10px; height: 10px; display: inline-block;"></i>
                         </span>`
                      : `<span>${escapeHtml(lot.source)}</span>`;
                    return `
                      <div class="d-flex align-items-center justify-content-between py-1 border-bottom-subtle">
                        <span class="text-secondary">${sourceHtml}: <b>${formatUSDT(lot.qty)}</b> @ ${formatRate(lot.buyRate)}</span>
                        <span class="text-primary-color">${formatNGN(lot.lotCost)}</span>
                      </div>
                    `;
                  }).join('')}
                  <div class="d-flex align-items-center justify-content-between pt-2 fw-bold text-primary-color">
                    <span>Total Cost Basis:</span>
                    <span class="text-warning">${formatNGN(trade.costBasis)}</span>
                  </div>
                </div>
              ` : ''}

              ${hasFees ? `
                <div class="fw-bold mb-2 text-warning d-flex align-items-center gap-1">
                  <i data-lucide="receipt"></i>
                  <span>Itemized Trade Fees</span>
                </div>
                <div class="font-mono text-supporting">
                  ${trade.fees.map(f => `
                    <div class="d-flex align-items-center justify-content-between py-1">
                      <span class="text-secondary">${escapeHtml(f.label || f.type)}</span>
                      <span class="text-warning">${formatNGN(f.amount)}</span>
                    </div>
                  `).join('')}
                </div>
              ` : ''}
            </div>
          ` : ''}

          <!-- Expandable Row Actions -->
          <div class="d-flex justify-content-end gap-2 mt-2">
            <button class="btn btn-xs btn-outline btn-edit-trade" data-trade-id="${escapeHtml(trade.id)}">
              <i data-lucide="edit-3"></i>
              <span>Edit</span>
            </button>
            <button class="btn btn-xs btn-danger btn-delete-trade" data-trade-id="${escapeHtml(trade.id)}">
              <i data-lucide="trash-2"></i>
              <span>Delete</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();

  // Attach Row Expand / Collapse Toggles
  container.querySelectorAll('.js-row-toggle').forEach(row => {
    row.addEventListener('click', (e) => {
      // Prevent click triggers when clicking buttons inside the row
      if (e.target.closest('.btn-icon') || e.target.closest('button')) return;

      const targetId = row.getAttribute('data-target-drawer');
      const drawer = document.getElementById(targetId);
      const chevron = row.querySelector('.row-chevron');
      if (drawer) {
        const isCollapsed = drawer.classList.contains('hidden');
        drawer.classList.toggle('hidden');
        if (chevron) {
          chevron.style.transform = isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)';
        }
      }
    });
  });

  // Attach Fee Drawers Toggle inside panels
  container.querySelectorAll('.btn-toggle-fees').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const drawerId = btn.getAttribute('data-drawer-id');
      const drawer = document.getElementById(drawerId);
      const icon = btn.querySelector('.lucide-chevron-down, .lucide-chevron-up');
      if (drawer) {
        drawer.classList.toggle('hidden');
      }
    });
  });

  // Attach Edit Listeners inside drawers
  container.querySelectorAll('.btn-edit-trade').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tradeId = btn.getAttribute('data-trade-id');
      if (window.startEditTrade) {
        window.startEditTrade(tradeId);
      }
    });
  });

  // Attach Delete Listeners inside drawers
  container.querySelectorAll('.btn-delete-trade').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tradeId = btn.getAttribute('data-trade-id');
      const trade = store.getTradeById(tradeId);
      if (window.showConfirmModal) {
        window.showConfirmModal(
          'Delete Trade?',
          `Are you sure you want to delete this ${trade?.type || ''} trade (${formatNGN(trade?.ngnAmount || 0)})?`,
          () => {
            store.deleteTrade(tradeId);
            if (window.showToast) window.showToast('Trade deleted', 'info');
          },
          'danger'
        );
      }
    });
  });

  // Handle click on matched lot link to jump to the corresponding Buy trade
  container.querySelectorAll('.matched-lot-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetTradeId = link.getAttribute('data-target-id');
      if (!targetTradeId) return;

      // 1. Reset all filters and search fields to ensure target is visible
      const searchInput = document.getElementById('history-search');
      if (searchInput) searchInput.value = '';
      activeSearchQuery = '';
      const btnClearSearch = document.getElementById('btn-clear-search');
      if (btnClearSearch) btnClearSearch.classList.add('hidden');

      const filterType = document.getElementById('filter-type');
      if (filterType) filterType.value = 'ALL';
      activeTypeFilter = 'ALL';

      const filterBank = document.getElementById('filter-bank');
      if (filterBank) filterBank.value = 'ALL';
      activeBankFilter = 'ALL';

      const filterSort = document.getElementById('filter-sort');
      if (filterSort) filterSort.value = 'date-desc';
      activeSortOrder = 'date-desc';

      // 2. Find target position in the full chronological sorted list
      const rawTrades = store.getTrades();
      const { enrichedTrades } = calculateFIFOInventoryAndPnL(rawTrades, store.getOpeningInventory());
      
      // Sort using current 'date-desc'
      enrichedTrades.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      const index = enrichedTrades.findIndex(t => t.id === targetTradeId);
      if (index !== -1) {
        // Calculate page index
        const targetPage = Math.floor(index / pageSize) + 1;
        currentPage = targetPage;

        // Re-render
        renderTradeHistory();

        // 3. Scroll to target card and flash highlight
        setTimeout(() => {
          const card = document.getElementById(`trade-card-${targetTradeId}`);
          if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.classList.add('highlight-pulse');
            
            // Auto-expand target detail drawer
            const targetDrawer = document.getElementById(`details_${targetTradeId}`);
            if (targetDrawer && targetDrawer.classList.contains('hidden')) {
              targetDrawer.classList.remove('hidden');
              const chevron = card.querySelector('.row-chevron');
              if (chevron) {
                chevron.style.transform = 'rotate(180deg)';
              }
            }

            setTimeout(() => {
              card.classList.remove('highlight-pulse');
            }, 2500);
          }
        }, 150);
      }
    });
  });

  // 5. Render Pagination Controls
  renderPaginationControls(totalPages, totalItems, startIndex, endIndex);
}

/**
 * Render pagination numbers, info, and bind event handlers
 */
function renderPaginationControls(totalPages, totalItems, startIndex, endIndex) {
  const paginationContainer = document.getElementById('history-pagination');
  if (!paginationContainer) return;

  if (totalPages <= 1) {
    paginationContainer.classList.add('hidden');
    paginationContainer.innerHTML = '';
    return;
  }

  paginationContainer.classList.remove('hidden');
  paginationContainer.innerHTML = `
    <button class="pagination-btn" id="btn-history-prev" ${currentPage === 1 ? 'disabled' : ''}>
      <i data-lucide="chevron-left"></i>
      <span>Prev</span>
    </button>
    <span class="pagination-info">
      ${startIndex + 1}-${endIndex} of ${totalItems}
    </span>
    <button class="pagination-btn" id="btn-history-next" ${currentPage === totalPages ? 'disabled' : ''}>
      <span>Next</span>
      <i data-lucide="chevron-right"></i>
    </button>
  `;

  if (window.lucide) window.lucide.createIcons();

  // Attach Pagination Button Handlers
  const btnPrev = document.getElementById('btn-history-prev');
  const btnNext = document.getElementById('btn-history-next');

  btnPrev?.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      renderTradeHistory();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  btnNext?.addEventListener('click', () => {
    if (currentPage < totalPages) {
      currentPage++;
      renderTradeHistory();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
}
