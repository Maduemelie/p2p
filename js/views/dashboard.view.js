/**
 * View: Dashboard Component
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

      <!-- Metric Summary Cards Grid -->
      <div class="metrics-grid">
        <!-- 1. Realized P&L -->
        <div class="card metric-card">
          <div class="metric-header">
            <span class="metric-label">Net Realized P&L</span>
            <div class="metric-icon-box profit-glow" id="pnl-icon-box">
              <i data-lucide="trending-up" id="pnl-icon"></i>
            </div>
          </div>
          <div class="metric-value font-mono" id="stat-net-pnl">₦0.00</div>
          <div class="metric-footer text-profit" id="stat-pnl-rate">
            <i data-lucide="sparkles"></i> 0.0% ROI on closed trades
          </div>
        </div>

        <!-- 2. Current USDT Inventory Holding -->
        <div class="card metric-card">
          <div class="metric-header">
            <span class="metric-label">USDT Inventory</span>
            <div class="metric-icon-box bg-blue-glow">
              <i data-lucide="wallet"></i>
            </div>
          </div>
          <div class="metric-value font-mono text-accent" id="stat-inventory-holding">0.00 USDT</div>
          <div class="metric-footer text-muted" id="stat-inventory-cost">
            Holding cost: ₦0.00
          </div>
        </div>

        <!-- 3. Total Invested (Buys) -->
        <div class="card metric-card">
          <div class="metric-header">
            <span class="metric-label">Total Buys (Cost)</span>
            <div class="metric-icon-box">
              <i data-lucide="arrow-down-left"></i>
            </div>
          </div>
          <div class="metric-value font-mono" id="stat-total-invested">₦0.00</div>
          <div class="metric-footer text-muted" id="stat-buy-volume">
            0.00 USDT bought
          </div>
        </div>

        <!-- 4. Total Realized (Sells) -->
        <div class="card metric-card">
          <div class="metric-header">
            <span class="metric-label">Total Sells (Revenue)</span>
            <div class="metric-icon-box">
              <i data-lucide="arrow-up-right"></i>
            </div>
          </div>
          <div class="metric-value font-mono" id="stat-total-realized">₦0.00</div>
          <div class="metric-footer text-muted" id="stat-sell-volume">
            0.00 USDT sold
          </div>
        </div>
      </div>

      <!-- Chart Section -->
      <div class="card chart-card">
        <div class="chart-header">
          <div>
            <h3 class="card-title">Realized Profit / Loss Trend</h3>
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
            <p>Record trades to see P&L analytics chart</p>
          </div>
        </div>
      </div>

      <!-- Quick Activity Section -->
      <div class="card activity-card">
        <div class="card-header-flex">
          <h3 class="card-title">Recent Activity</h3>
          <button class="btn-link" id="btn-view-all-history">View All</button>
        </div>
        <div class="recent-trades-list" id="dashboard-recent-list">
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
