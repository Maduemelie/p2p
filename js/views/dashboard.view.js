/**
 * View: Dashboard Component — Redesigned v2.0
 * Hero P&L, stat chips, conditional Bybit ad, chart, recent activity
 */
export function renderDashboardView() {
  return `
    <section class="app-view active" id="view-dashboard" data-view="dashboard">
      <div class="view-header">
        <div>
          <h2 class="view-title">Dashboard</h2>
          <p class="view-subtitle">FIFO cost-basis performance & inventory</p>
        </div>
        <button class="btn btn-sm btn-primary" id="btn-dash-quick-add">
          <i data-lucide="plus-circle"></i>
          <span>New Trade</span>
        </button>
      </div>

      <!-- Hero P&L Card -->
      <div class="card mb-4" id="card-hero-pnl">
        <div class="hero-stat">
          <div class="hero-stat-label">Net Realized P&L</div>
          <div class="hero-stat-value font-mono text-success" id="stat-net-pnl">₦0.00</div>
          <div class="hero-stat-footer" id="stat-pnl-rate">
            <span class="badge badge-success" id="pnl-roi-badge">
              <i data-lucide="trending-up" id="pnl-icon"></i>
              <span>0.0% ROI</span>
            </span>
          </div>
        </div>
      </div>

      <!-- Quick Stat Chips -->
      <div class="stat-chips mb-4">
        <div class="stat-chip">
          <div class="stat-chip-label">USDT Inventory</div>
          <div class="stat-chip-value text-accent" id="stat-inventory-holding">0.00 USDT</div>
          <div class="stat-chip-sub" id="stat-inventory-cost">Avg: ₦0.00 / USDT</div>
        </div>
        <div class="stat-chip">
          <div class="stat-chip-label">Total Buys</div>
          <div class="stat-chip-value" id="stat-total-invested">₦0.00</div>
          <div class="stat-chip-sub" id="stat-buy-volume">0.00 USDT bought</div>
        </div>
        <div class="stat-chip">
          <div class="stat-chip-label">Total Sells</div>
          <div class="stat-chip-value" id="stat-total-realized">₦0.00</div>
          <div class="stat-chip-sub" id="stat-sell-volume">0.00 USDT sold</div>
        </div>
        <div class="stat-chip">
          <div class="stat-chip-label">Bank Cash</div>
          <div class="stat-chip-value text-success" id="stat-total-bank-cash">₦0.00</div>
          <div class="stat-chip-sub" id="stat-bank-cash-subtext">Across linked accounts</div>
        </div>
      </div>

      <!-- Live Bybit Sell Ad & Spread Monitor -->
      <div class="live-ad-card" id="card-active-ad-spread">
        <div class="live-ad-header">
          <div class="d-flex align-items-center gap-2">
            <span class="live-badge" id="active-ad-badge">
              <span class="live-badge-dot"></span>
              Active Sell Ad
            </span>
            <span class="card-title" id="active-ad-title">Bybit P2P Sell Ad</span>
          </div>
          <button class="btn btn-sm btn-outline" id="btn-sync-active-ad" title="Refresh Live Bybit Ad">
            <i data-lucide="refresh-cw"></i>
            <span>Refresh</span>
          </button>
        </div>

        <div class="ad-metrics-row" id="active-ad-content">
          <div class="ad-metric-cell">
            <span class="ad-metric-label">Your Live Ad Price</span>
            <span class="ad-metric-value font-mono text-success" id="metric-ad-sell-price">₦0.00</span>
            <span class="ad-metric-sub" id="metric-ad-qty-stock">0.00 USDT in ad</span>
          </div>
          <div class="ad-metric-cell">
            <span class="ad-metric-label">Weighted Buy Cost</span>
            <span class="ad-metric-value font-mono text-accent" id="metric-ad-avg-buy-cost">₦0.00</span>
            <span class="ad-metric-sub" id="metric-ad-total-bought">From your buy orders</span>
          </div>
          <div class="ad-metric-cell">
            <span class="ad-metric-label">Live Ad Spread</span>
            <span class="ad-metric-value font-mono text-success" id="metric-ad-spread-usdt">+₦0.00</span>
            <span class="ad-metric-sub text-success" id="metric-ad-margin-pct">+0.00% margin</span>
          </div>
          <div class="ad-metric-cell">
            <span class="ad-metric-label">Projected Net Profit</span>
            <span class="ad-metric-value font-mono text-success" id="metric-ad-projected-pnl">+₦0.00</span>
            <span class="ad-metric-sub" id="metric-ad-emtl-deduction">On current ad batch</span>
          </div>
        </div>

        <!-- Bybit Live Inventory -->
        <div class="balance-grid mt-3">
          <div class="balance-cell">
            <span class="balance-cell-label">P2P Balance</span>
            <span class="balance-cell-value text-accent" id="stat-bybit-live-total">— USDT</span>
          </div>
          <div class="balance-cell">
            <span class="balance-cell-label">In Active Ad</span>
            <span class="balance-cell-value" id="stat-bybit-locked">—</span>
          </div>
          <div class="balance-cell">
            <span class="balance-cell-label">Free for Buyback</span>
            <span class="balance-cell-value" id="stat-bybit-free">—</span>
          </div>
        </div>
        <div id="stat-inventory-diff" class="small mt-2 text-center hidden"></div>
      </div>

      <!-- P&L Chart -->
      <div class="card chart-card">
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

      <!-- Recent Activity -->
      <div class="card">
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
    </section>
  `;
}
