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
            <span>Refresh Ad</span>
          </button>
        </div>

        <div class="ad-hero-section mb-3">
          <div class="ad-hero-label">Live Ad Price</div>
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
