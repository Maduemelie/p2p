/**
 * View: Dashboard Component — Redesigned v2.1
 * Clean Information Architecture, Hero Metrics, and Visual Progress Bars
 */
export function renderDashboardView() {
  return `
    <section class="app-view active" id="view-dashboard" data-view="dashboard">
      
      <!-- Top View Header -->
      <div class="view-header">
        <div>
          <h2 class="view-title">Dashboard</h2>
          <p class="view-subtitle" id="dashboard-greeting">Good day 👋</p>
        </div>
        <button class="btn btn-sm btn-primary" id="btn-dash-quick-add">
          <i data-lucide="plus-circle"></i>
          <span>New Trade</span>
        </button>
      </div>

      <!-- ⓪ Live Net Worth Hero Widget (Milestone 2) -->
      <div class="card mb-4 net-worth-card" id="card-net-worth" role="region" aria-label="Live Net Worth Valuation">
        <div class="card-header-flex mb-3">
          <div>
            <div class="net-worth-badge-group">
              <span class="live-badge" id="net-worth-live-badge">
                <span class="live-badge-dot"></span>
                Live Valuation
              </span>
            </div>
            <h3 class="card-title mt-1">Live Net Worth</h3>
            <p class="card-subtitle">Real-time consolidated bank ledger & Bybit portfolio valuation</p>
          </div>
          <div class="net-worth-header-actions">
            <button class="btn btn-sm btn-primary" id="btn-open-snapshot-modal" title="Record daily closing snapshot" aria-label="End Day and Save Net Worth Snapshot">
              <i data-lucide="camera"></i>
              <span>End Day / Snapshot</span>
            </button>
          </div>
        </div>

        <!-- Primary Hero Net Worth Display -->
        <div class="net-worth-hero-section mb-4">
          <div class="net-worth-hero-main">
            <span class="net-worth-hero-label">Total Capital Valuation (NGN)</span>
            <div class="net-worth-hero-value font-mono text-success" id="stat-net-worth-ngn" aria-live="polite">₦0.00</div>
          </div>
          <div class="net-worth-hero-secondary">
            <div class="net-worth-usdt-pill">
              <span class="text-muted small">USDT Equiv:</span>
              <span class="font-mono font-bold text-accent" id="stat-net-worth-usdt" aria-live="polite">0.00 USDT</span>
            </div>
            <div class="net-worth-delta-wrapper">
              <span class="badge badge-neutral" id="badge-net-worth-delta" aria-live="polite">
                <i data-lucide="info"></i>
                <span>No Baseline Snapshot</span>
              </span>
            </div>
          </div>
        </div>

        <!-- Breakdown Sub-metrics Grid (3-Column) -->
        <div class="net-worth-breakdown-grid">
          
          <!-- Pillar 1: Bank Cash -->
          <div class="net-worth-breakdown-cell" id="cell-nw-bank-cash">
            <div class="nw-cell-header">
              <span class="nw-cell-label">Liquid Bank Cash</span>
              <div class="metric-icon-box success-tint nw-icon-sm">
                <i data-lucide="landmark"></i>
              </div>
            </div>
            <div class="nw-cell-value font-mono text-success" id="metric-nw-bank-cash">₦0.00</div>
            <div class="nw-cell-sub text-muted" id="metric-nw-bank-sub">Reactive bank ledger</div>
          </div>

          <!-- Pillar 2: Bybit USDT -->
          <div class="net-worth-breakdown-cell" id="cell-nw-bybit-usdt">
            <div class="nw-cell-header">
              <span class="nw-cell-label">Bybit USDT Assets</span>
              <div class="metric-icon-box primary-tint nw-icon-sm">
                <i data-lucide="wallet"></i>
              </div>
            </div>
            <div class="nw-cell-value font-mono text-accent" id="metric-nw-bybit-usdt">0.00 USDT</div>
            <div class="nw-cell-sub text-muted" id="metric-nw-bybit-sub">Ad stock + Free balance</div>
          </div>

          <!-- Pillar 3: Reference Rate -->
          <div class="net-worth-breakdown-cell" id="cell-nw-ref-rate">
            <div class="nw-cell-header">
              <span class="nw-cell-label">Reference Rate</span>
              <div class="metric-icon-box warning-tint nw-icon-sm">
                <i data-lucide="trending-up"></i>
              </div>
            </div>
            <div class="nw-cell-value font-mono" id="metric-nw-ref-rate">₦1,500.00 / USDT</div>
            <div class="nw-cell-sub text-muted" id="metric-nw-rate-source">Active Sell Ad rate</div>
          </div>

        </div>
      </div>

      <!-- ⓪.5 Net Worth Growth Trend & Snapshot History Card (Milestone 4) -->
      <div class="card mb-4 net-worth-trend-card" id="card-net-worth-trend" role="region" aria-label="Net Worth Growth Trend and History">
        
        <!-- Card Header: Title & Currency Toggle Controls -->
        <div class="card-header-flex mb-3">
          <div>
            <div class="trend-card-badge-group">
              <span class="badge badge-primary tiny">Historical Analytics</span>
            </div>
            <h3 class="card-title mt-1">Net Worth Growth Trend</h3>
            <p class="card-subtitle">Historical wealth trajectory & asset growth across saved snapshots</p>
          </div>

          <div class="trend-header-controls">
            <!-- 3-Way Currency Filter Toggle -->
            <div class="segmented-control segmented-sm" id="chart-currency-filter" role="group" aria-label="Chart Currency Filter">
              <button type="button" class="seg-btn active" id="filter-chart-both" data-currency="both" title="Show both NGN and USDT curves">
                <span>Both</span>
              </button>
              <button type="button" class="seg-btn" id="filter-chart-ngn" data-currency="ngn" title="Show Naira valuation only">
                <span>₦ NGN</span>
              </button>
              <button type="button" class="seg-btn" id="filter-chart-usdt" data-currency="usdt" title="Show USDT valuation only">
                <span>$ USDT</span>
              </button>
            </div>

            <!-- Toggle History View Action Button -->
            <button type="button" class="btn btn-xs btn-outline" id="btn-toggle-snapshot-log" title="Expand or collapse snapshot history table" aria-expanded="true">
              <i data-lucide="list"></i>
              <span id="btn-toggle-snapshot-log-text">Snapshot Log</span>
              <span class="badge badge-neutral tiny ml-1" id="snapshot-history-count-badge">0</span>
            </button>
          </div>
        </div>

        <!-- Chart Canvas Container -->
        <div class="chart-container net-worth-chart-container mb-4" id="net-worth-chart-container">
          <canvas id="netWorthTrendChart" aria-label="Net Worth Growth Trend Line Chart" role="img"></canvas>
          
          <!-- Empty State Banner (Visible when < 2 snapshots exist) -->
          <div class="chart-empty-state" id="chart-networth-empty-state">
            <div class="empty-icon-box mb-2">
              <i data-lucide="trending-up"></i>
            </div>
            <p class="empty-title">No snapshot history yet</p>
            <p class="empty-subtitle">Click <strong>"End Day / Snapshot"</strong> above to record your first closing baseline.</p>
          </div>
        </div>

        <!-- Historical Snapshot Log Section -->
        <div class="snapshot-history-section border-top pt-3" id="snapshot-history-section">
          
          <div class="snapshot-section-header mb-3">
            <div class="d-flex align-items-center gap-2">
              <div class="metric-icon-box primary-tint nw-icon-sm">
                <i data-lucide="history"></i>
              </div>
              <h4 class="card-title text-supporting">Recorded Snapshot Ledger</h4>
            </div>
            <div class="d-flex align-items-center gap-2">
              <span class="text-muted small" id="snapshot-history-count">0 snapshots recorded</span>
            </div>
          </div>

          <!-- Empty State Placeholder for Table -->
          <div class="snapshot-history-empty hidden" id="snapshot-history-empty">
            <div class="empty-state py-4" id="empty-state-snapshots">
              <div class="empty-icon-box">
                <i data-lucide="camera-off"></i>
              </div>
              <p class="empty-title">No snapshots saved yet</p>
              <p class="empty-subtitle">End-of-day snapshots will appear here with sequential growth calculations.</p>
            </div>
          </div>

          <!-- Responsive Table Container -->
          <div class="table-responsive snapshot-table-wrapper" id="snapshot-table-wrapper">
            <table class="table snapshot-history-table" id="table-snapshot-history" aria-label="Historical Net Worth Snapshots">
              <thead>
                <tr>
                  <th scope="col" class="th-date">Date & Time</th>
                  <th scope="col" class="th-bank text-right">Bank Cash (₦)</th>
                  <th scope="col" class="th-usdt text-right">Bybit USDT</th>
                  <th scope="col" class="th-rate text-right">Ref Rate</th>
                  <th scope="col" class="th-networth text-right">Net Worth (NGN)</th>
                  <th scope="col" class="th-networth-usdt text-right">Net Worth (USDT)</th>
                  <th scope="col" class="th-delta text-center">Sequential Δ</th>
                  <th scope="col" class="th-notes">Notes</th>
                  <th scope="col" class="th-actions text-center">Action</th>
                </tr>
              </thead>
              <tbody id="snapshot-history-tbody">
                <!-- Dynamically injected via renderSnapshotHistoryTable() -->
              </tbody>
            </table>
          </div>

          <!-- Mobile Card List View Container -->
          <div class="d-md-none hidden" id="snapshot-history-list"></div>
        </div>

      </div>

      <!-- ① Portfolio Overview Card -->
      <div class="card mb-4">
        <h3 class="card-title mb-3">Portfolio Overview</h3>
        <div class="portfolio-grid">
          <div class="portfolio-item">
            <span class="portfolio-label">Bank Cash</span>
            <span class="portfolio-value font-mono text-success" id="stat-total-bank-cash">₦0.00</span>
            <span class="portfolio-sub" id="stat-bank-cash-subtext">Across linked accounts</span>
          </div>
          <div class="portfolio-item">
            <span class="portfolio-label">USDT Inventory</span>
            <span class="portfolio-value font-mono text-accent" id="stat-inventory-holding">0.00 USDT</span>
            <span class="portfolio-sub font-mono" id="stat-inventory-cost">Avg: ₦0.00 / USDT</span>
          </div>
          <div class="portfolio-item">
            <span class="portfolio-label">Realized P&L</span>
            <span class="portfolio-value font-mono" id="stat-net-pnl">₦0.00</span>
            <div id="stat-pnl-rate" class="mt-1">
              <span class="badge" id="pnl-roi-badge">0.0% ROI</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ② Current Position Card (Active Sell Ad) -->
      <div class="card mb-4" id="card-active-ad-spread">
        <div class="card-header-flex mb-3">
          <div>
            <span class="live-badge" id="active-ad-badge">
              <span class="live-badge-dot"></span>
              Active Sell Ad
            </span>
            <h3 class="card-title mt-1" id="active-ad-title">Bybit Sell Ad</h3>
          </div>
          <button class="btn btn-xs btn-outline" id="btn-sync-active-ad" title="Refresh Live Bybit Ad">
            <i data-lucide="refresh-cw"></i>
            <span>Refresh Ads</span>
          </button>
        </div>

        <div class="ad-hero-section mb-3">
          <div class="ad-hero-label">Live Sell Price</div>
          <div class="ad-hero-value font-mono text-success" id="metric-ad-sell-price">₦0.00</div>
          <div class="ad-hero-sub text-muted" id="metric-ad-qty-stock">0.00 USDT listed</div>
        </div>

        <div class="ad-submetrics-grid">
          <div class="ad-submetric-cell">
            <span class="ad-submetric-label">Cost Basis</span>
            <span class="ad-submetric-value font-mono" id="metric-ad-avg-buy-cost">₦0.00</span>
          </div>
          <div class="ad-submetric-cell">
            <span class="ad-submetric-label">Spread</span>
            <span class="ad-submetric-value font-mono text-success" id="metric-ad-spread-usdt">+₦0.00</span>
            <span class="ad-submetric-sub text-success" id="metric-ad-margin-pct">+0.00%</span>
          </div>
          <div class="ad-submetric-cell">
            <span class="ad-submetric-label">Projected Profit</span>
            <span class="ad-submetric-value font-mono text-success" id="metric-ad-projected-pnl">+₦0.00</span>
          </div>
        </div>
      </div>

      <!-- ②b Current Position Card (Active Buy Ad) -->
      <div class="card mb-4" id="card-active-buy-ad">
        <div class="card-header-flex mb-3">
          <div>
            <span class="live-badge" id="active-buy-ad-badge">
              <span class="live-badge-dot" style="background-color: var(--danger, #F43F5E);"></span>
              Active Buy Ad
            </span>
            <h3 class="card-title mt-1" id="active-buy-ad-title">Bybit Buy Ad</h3>
          </div>
        </div>

        <div class="ad-hero-section mb-3">
          <div class="ad-hero-label">Live Buy Price</div>
          <div class="ad-hero-value font-mono text-danger" id="metric-ad-buy-price">₦0.00</div>
          <div class="ad-hero-sub text-muted" id="metric-ad-qty-buy">0.00 USDT targeted</div>
        </div>

        <div class="ad-submetrics-grid">
          <div class="ad-submetric-cell">
            <span class="ad-submetric-label">Fiat Allocation</span>
            <span class="ad-submetric-value font-mono" id="metric-ad-buy-fiat">₦0.00</span>
          </div>
          <div class="ad-submetric-cell" style="grid-column: span 2;">
            <span class="ad-submetric-label">Status</span>
            <span class="ad-submetric-value font-mono text-muted" id="metric-ad-buy-status">Waiting for ad...</span>
          </div>
        </div>
      </div>

      <!-- ③ Capital Allocation Card -->
      <div class="card mb-4" id="card-capital-allocation">
        <h3 class="card-title mb-1">Capital Allocation</h3>
        <p class="card-subtitle mb-3">Bybit funding balance distribution</p>

        <div class="capital-total-display mb-3">
          <span class="capital-total-label">Total P2P Balance</span>
          <span class="capital-total-value font-mono text-accent" id="stat-bybit-live-total">— USDT</span>
        </div>

        <!-- Allocation Progress Bar -->
        <div class="allocation-bar-container mb-3">
          <div class="allocation-bar" id="allocation-progress-bar">
            <div class="bar-segment segment-active" id="bar-segment-active" style="width: 0%;"></div>
            <div class="bar-segment segment-free" id="bar-segment-free" style="width: 0%;"></div>
          </div>
        </div>

        <!-- Allocation Legend / Details -->
        <div class="allocation-legend">
          <div class="legend-item">
            <span class="legend-dot dot-active"></span>
            <div class="legend-text-group">
              <span class="legend-label">Active Ad</span>
              <span class="legend-value font-mono" id="stat-bybit-locked">—</span>
            </div>
          </div>
          <div class="legend-item">
            <span class="legend-dot dot-free"></span>
            <div class="legend-text-group">
              <span class="legend-label">Free / Available</span>
              <span class="legend-value font-mono" id="stat-bybit-free">—</span>
            </div>
          </div>
        </div>
        
        <div id="stat-inventory-diff" class="small mt-3 text-center hidden"></div>
      </div>

      <!-- ④ Performance Chart Card -->
      <div class="card mb-4">
        <div class="chart-header">
          <div>
            <h3 class="card-title">Realized P&L Trend</h3>
            <p class="card-subtitle">Cumulative FIFO closed gains & losses</p>
          </div>
          <div class="segmented-control segmented-sm" id="chart-time-filter">
            <button class="seg-btn active" data-period="all">All</button>
            <button class="seg-btn" data-period="30d">30D</button>
            <button class="seg-btn" data-period="7d">7D</button>
          </div>
        </div>
        <div class="chart-container">
          <canvas id="pnlChart"></canvas>
          <div class="chart-empty-state" id="chart-empty-state">
            <i data-lucide="bar-chart-2"></i>
            <p>Record trades to see P&L analytics</p>
          </div>
        </div>
      </div>

      <!-- ⑤ Recent Activity Card -->
      <div class="card mb-4" id="recent-activity-dashboard-card">
        <div class="card-header-flex mb-3">
          <h3 class="card-title">Recent Activity</h3>
          <button class="btn-link" id="btn-view-all-history">View All →</button>
        </div>
        <div id="dashboard-recent-list">
          <div class="empty-state">
            <div class="empty-icon-box">
              <i data-lucide="inbox"></i>
            </div>
            <p class="empty-title">No trades logged yet</p>
            <p class="empty-subtitle">Click "New Trade" to record your first Bybit P2P order.</p>
          </div>
        </div>
      </div>

      <!-- Padding to prevent Bottom Nav overlap -->
      <div class="bottom-nav-spacer"></div>
    </section>
  `;
}
