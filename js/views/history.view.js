/**
 * View: Trade History Component — Redesigned v2.0
 */
export function renderHistoryView() {
  return `
    <section class="app-view" id="view-history" data-view="history">
      <div class="view-header">
        <div>
          <h2 class="view-title">Trade History</h2>
          <p class="view-subtitle">Search, filter, and inspect past trades</p>
        </div>
        <div class="view-actions">
          <button class="btn btn-sm btn-outline" id="btn-export-csv-inline" title="Download CSV">
            <i data-lucide="download"></i>
            <span>CSV</span>
          </button>
          <button class="btn btn-sm btn-outline" id="btn-export-quick" title="More Export Options">
            <i data-lucide="file-code"></i>
            <span>JSON</span>
          </button>
        </div>
      </div>

      <!-- Filter Toolbar -->
      <div class="card filter-card mb-4">
        <div class="search-box">
          <i data-lucide="search" class="search-icon"></i>
          <input type="text" id="history-search" class="form-input search-input" placeholder="Search by Order ID (refId), counterparty, notes, bank...">
          <button class="btn-clear-search hidden" id="btn-clear-search" aria-label="Clear Search">
            <i data-lucide="x"></i>
          </button>
        </div>

        <div class="filters-row mt-3">
          <div class="filter-item">
            <label for="filter-type" class="filter-label">Type</label>
            <select id="filter-type" class="form-select select-sm">
              <option value="ALL">All Types</option>
              <option value="BUY">Buy Only</option>
              <option value="SELL">Sell Only</option>
            </select>
          </div>
          <div class="filter-item">
            <label for="filter-bank" class="filter-label">Bank</label>
            <select id="filter-bank" class="form-select select-sm">
              <option value="ALL">All Accounts</option>
            </select>
          </div>
          <div class="filter-item">
            <label for="filter-sort" class="filter-label">Sort</label>
            <select id="filter-sort" class="form-select select-sm">
              <option value="date-desc">Newest First</option>
              <option value="date-asc">Oldest First</option>
              <option value="amount-desc">Highest NGN</option>
              <option value="amount-asc">Lowest NGN</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Trade Count -->
      <div class="d-flex align-items-center justify-content-between mb-3">
        <span class="text-muted small" id="history-trade-count"></span>
      </div>

      <!-- Trade List -->
      <div id="trades-history-container">
        <div class="empty-state">
          <div class="empty-icon-box">
            <i data-lucide="history"></i>
          </div>
          <p class="empty-title">No trades found</p>
          <p class="empty-subtitle">Your recorded trades will show up here.</p>
        </div>
      </div>

      <!-- Pagination -->
      <div class="pagination hidden" id="history-pagination"></div>
    </section>
  `;
}
