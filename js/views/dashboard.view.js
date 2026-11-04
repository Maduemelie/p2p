/**
 * View: Dashboard Component — Redesigned v2.2
 * Clean Information Architecture, Hero Metrics, Sub-Tabs, Side-by-Side Analytics
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

      <!-- Dashboard Navigation Sub-Tabs -->
      <div class="dashboard-tabs mb-4" id="dashboard-tabs" role="tablist" aria-label="Dashboard Views">
        <button type="button" class="dashboard-tab-btn active" data-dashboard-tab="overview" role="tab" aria-selected="true" id="tab-btn-dash-overview">
          <i data-lucide="layout-dashboard"></i>
          <span>Overview</span>
        </button>
        <button type="button" class="dashboard-tab-btn" data-dashboard-tab="trends" role="tab" aria-selected="false" id="tab-btn-dash-trends">
          <i data-lucide="line-chart"></i>
          <span>Trends & Analytics</span>
        </button>
      </div>

      <!-- ===================================================================
           TAB PANEL 1: OVERVIEW (Combined Net Worth & Portfolio Overview, Ads)
           =================================================================== -->
      <div class="dashboard-tab-panel active" data-dashboard-panel="overview" id="panel-dash-overview" role="tabpanel">

        <!-- ⓪ Combined Portfolio Overview & Live Net Worth Card -->
        <div class="card mb-4 net-worth-card" id="card-net-worth" role="region" aria-label="Portfolio Overview and Live Net Worth Valuation">
          <div class="card-header-flex mb-3">
            <div>
              <div class="net-worth-badge-group">
                <span class="live-badge" id="net-worth-live-badge">
                  <span class="live-badge-dot"></span>
                  Live Valuation
                </span>
              </div>
              <h3 class="card-title mt-1">Portfolio Overview & Net Worth</h3>
              <p class="card-subtitle">Real-time consolidated bank ledger, Bybit portfolio valuation & FIFO performance</p>
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

          <!-- Breakdown Sub-metrics Grid (Combined Portfolio Overview & Valuation Pillars) -->
          <div class="net-worth-breakdown-grid combined-portfolio-grid">
            
            <!-- Pillar 1: Bank Cash -->
            <div class="net-worth-breakdown-cell" id="cell-nw-bank-cash">
              <div class="nw-cell-header">
                <span class="nw-cell-label">Liquid Bank Cash</span>
                <div class="metric-icon-box success-tint nw-icon-sm">
                  <i data-lucide="landmark"></i>
                </div>
              </div>
              <div class="nw-cell-value font-mono text-success" id="metric-nw-bank-cash">₦0.00</div>
              <div class="nw-cell-sub text-muted" id="stat-bank-cash-subtext">Across linked accounts</div>
              <span id="stat-total-bank-cash" style="display: none !important;">₦0.00</span>
              <span id="metric-nw-bank-sub" style="display: none !important;">Reactive bank ledger</span>
            </div>

            <!-- Pillar 2: USDT Inventory & Bybit Assets -->
            <div class="net-worth-breakdown-cell" id="cell-nw-bybit-usdt">
              <div class="nw-cell-header">
                <span class="nw-cell-label">USDT Inventory & Assets</span>
                <div class="metric-icon-box primary-tint nw-icon-sm">
                  <i data-lucide="wallet"></i>
                </div>
              </div>
              <div class="nw-cell-value font-mono text-accent" id="metric-nw-bybit-usdt">0.00 USDT</div>
              <div class="nw-cell-sub font-mono text-muted" id="stat-inventory-cost">Avg: ₦0.00 / USDT</div>
              <span id="stat-inventory-holding" style="display: none !important;">0.00 USDT</span>
              <span id="metric-nw-bybit-sub" style="display: none !important;">Ad stock + Free balance</span>
            </div>

            <!-- Pillar 3: Realized P&L -->
            <div class="net-worth-breakdown-cell" id="cell-portfolio-pnl">
              <div class="nw-cell-header">
                <span class="nw-cell-label">Realized P&L</span>
                <div class="metric-icon-box warning-tint nw-icon-sm">
                  <i data-lucide="trending-up"></i>
                </div>
              </div>
              <div class="nw-cell-value font-mono" id="stat-net-pnl">₦0.00</div>
              <div class="nw-cell-sub" id="stat-pnl-rate">
                <span class="badge" id="pnl-roi-badge">0.0% ROI</span>
              </div>
            </div>

            <!-- Pillar 4: Reference Rate -->
            <div class="net-worth-breakdown-cell" id="cell-nw-ref-rate">
              <div class="nw-cell-header">
                <span class="nw-cell-label">Reference Rate</span>
                <div class="metric-icon-box warning-tint nw-icon-sm">
                  <i data-lucide="scale"></i>
                </div>
              </div>
              <div class="nw-cell-value font-mono" id="metric-nw-ref-rate">₦1,500.00 / USDT</div>
              <div class="nw-cell-sub text-muted" id="metric-nw-rate-source">Active Sell Ad rate</div>
            </div>

          </div>
        </div>

        <!-- ① Current Position Card (Active Sell Ad) -->
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

        <!-- ①b Current Position Card (Active Buy Ad) -->
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

        <!-- ② Capital Allocation Card -->
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

      </div> <!-- End Tab Panel 1: Overview -->

      <!-- ===================================================================
           TAB PANEL 2: TRENDS & ANALYTICS (Net Worth Growth & P&L Trends)
           =================================================================== -->
      <div class="dashboard-tab-panel" data-dashboard-panel="trends" id="panel-dash-trends" role="tabpanel">

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

          <!-- SIDE-BY-SIDE GRID: Graph on Left, Snapshot Details on Right -->
          <div class="trend-side-by-side-grid" id="trend-side-by-side-grid">
            
            <!-- Column 1: Net Worth Growth Graph -->
            <div class="trend-grid-chart-col">
              <div class="chart-container net-worth-chart-container mb-0" id="net-worth-chart-container">
                <canvas id="netWorthTrendChart" aria-label="Net Worth Growth Trend Line Chart" role="img"></canvas>
                
                <!-- Empty State Banner (Visible when < 2 snapshots exist) -->
                <div class="chart-empty-state" id="chart-networth-empty-state">
                  <div class="empty-icon-box mb-2">
                    <i data-lucide="trending-up"></i>
                  </div>
                  <p class="empty-title">No snapshot history yet</p>
                  <p class="empty-subtitle">Click <strong>"End Day / Snapshot"</strong> to record your first closing baseline.</p>
                </div>
              </div>
            </div>

            <!-- Column 2: Historical Snapshot Log Details -->
            <div class="trend-grid-details-col">
              <div class="snapshot-history-section pt-0" id="snapshot-history-section">
                
                <div class="snapshot-section-header mb-2">
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

          </div>

        </div>

        <!-- Realized P&L Trend Performance Chart Card -->
        <div class="card mb-4" id="card-pnl-trend">
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
          <div class="chart-container" id="pnl-chart-container">
            <canvas id="pnlChart"></canvas>
            <div class="chart-empty-state" id="chart-empty-state">
              <i data-lucide="bar-chart-2"></i>
              <p>Record trades to see P&L analytics</p>
            </div>
          </div>
        </div>

      </div> <!-- End Tab Panel 2: Trends & Analytics -->

      <!-- Padding to prevent Bottom Nav overlap -->
      <div class="bottom-nav-spacer"></div>
    </section>
  `;
}
