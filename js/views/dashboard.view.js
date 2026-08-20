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

      <!-- Active Bybit Sell Ad & Live Spread Monitor -->
      <div class="card mb-4" id="card-active-ad-spread" style="background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.85)); border: 1px solid rgba(59, 130, 246, 0.25);">
        <div class="card-header-flex mb-3">
          <div class="d-flex align-items-center gap-2">
            <span class="brand-tag" id="active-ad-badge" style="background: rgba(16, 185, 129, 0.15); color: var(--profit); border-color: transparent;">
              ● Active Sell Ad
            </span>
            <h3 class="card-title mb-0" id="active-ad-title">Bybit P2P Sell Ad</h3>
          </div>
          <button class="btn btn-sm btn-outline py-1 px-2" id="btn-sync-active-ad" title="Refresh Live Bybit Ad">
            <i data-lucide="refresh-cw" style="width: 14px; height: 14px;"></i>
            <span>Refresh Ad</span>
          </button>
        </div>

        <div class="row g-3" id="active-ad-content">
          <div class="col-12 col-md-3">
            <div class="p-3" style="background: rgba(10, 16, 28, 0.6); border-radius: var(--radius-md); border: 1px solid rgba(255, 255, 255, 0.06);">
              <span class="text-muted small d-block mb-1">Your Live Ad Price</span>
              <span class="font-mono fw-bold fs-5 text-profit" id="metric-ad-sell-price">₦0.00</span>
              <span class="text-muted small d-block mt-1" id="metric-ad-qty-stock">0.00 USDT in ad</span>
            </div>
          </div>
          <div class="col-12 col-md-3">
            <div class="p-3" style="background: rgba(10, 16, 28, 0.6); border-radius: var(--radius-md); border: 1px solid rgba(255, 255, 255, 0.06);">
              <span class="text-muted small d-block mb-1">Weighted Buy Cost</span>
              <span class="font-mono fw-bold fs-5 text-accent" id="metric-ad-avg-buy-cost">₦0.00</span>
              <span class="text-muted small d-block mt-1" id="metric-ad-total-bought">From your buy orders</span>
            </div>
          </div>
          <div class="col-12 col-md-3">
            <div class="p-3" style="background: rgba(10, 16, 28, 0.6); border-radius: var(--radius-md); border: 1px solid rgba(255, 255, 255, 0.06);">
              <span class="text-muted small d-block mb-1">Live Ad Spread</span>
              <span class="font-mono fw-bold fs-5 text-profit" id="metric-ad-spread-usdt">+₦0.00</span>
              <span class="text-profit small d-block mt-1" id="metric-ad-margin-pct">+0.00% margin</span>
            </div>
          </div>
          <div class="col-12 col-md-3">
            <div class="p-3" style="background: rgba(10, 16, 28, 0.6); border-radius: var(--radius-md); border: 1px solid rgba(255, 255, 255, 0.06);">
              <span class="text-muted small d-block mb-1">Projected Net Profit</span>
              <span class="font-mono fw-bold fs-5 text-profit" id="metric-ad-projected-pnl">+₦0.00</span>
              <span class="text-muted small d-block mt-1" id="metric-ad-emtl-deduction">On current ad batch</span>
            </div>
          </div>
        </div>
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

        <!-- 2. Current USDT Inventory Holding (Dual View) -->
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
          <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.06);">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <span class="text-muted small">Bybit P2P Balance:</span>
              <span class="font-mono small fw-bold" id="stat-bybit-live-total" style="color: var(--primary-light);">— USDT</span>
            </div>
            <div class="d-flex justify-content-between align-items-center mb-1" style="font-size: 0.72rem;">
              <span class="text-muted">In Active Ad:</span>
              <span class="font-mono text-muted" id="stat-bybit-locked">—</span>
            </div>
            <div class="d-flex justify-content-between align-items-center" style="font-size: 0.72rem;">
              <span class="text-muted">Free for Buyback:</span>
              <span class="font-mono text-muted" id="stat-bybit-free">—</span>
            </div>
            <div id="stat-inventory-diff" class="small mt-1" style="display: none;"></div>
          </div>
        </div>

        <!-- 3. Total Bank Cash Balance -->
        <div class="card metric-card">
          <div class="metric-header">
            <span class="metric-label">Bank Cash Balance</span>
            <div class="metric-icon-box" style="background: rgba(16, 185, 129, 0.12); color: var(--profit);">
              <i data-lucide="landmark"></i>
            </div>
          </div>
          <div class="metric-value font-mono text-profit" id="stat-total-bank-cash">₦0.00</div>
          <div class="metric-footer text-muted" id="stat-bank-cash-subtext">
            Across linked accounts
          </div>
        </div>

        <!-- 4. Total Buys (Cost) -->
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

        <!-- 5. Total Realized (Sells) -->
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
