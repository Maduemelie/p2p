/**
 * View: P2P Arbitrage & Pricing Assistant Component
 * Redesigned v2.1 — Dual-side Buy and Sell simulators, targets, and market depth tables
 */
export function renderPricingView() {
  return `
    <section class="app-view" id="view-pricing" data-view="pricing">
      
      <!-- Top View Header -->
      <div class="view-header">
        <div>
          <h2 class="view-title">Arbitrage & Pricing</h2>
          <p class="view-subtitle">Real-time competitor tracking and profit optimization</p>
        </div>
        <button class="btn btn-sm btn-outline" id="btn-refresh-market-depth">
          <i data-lucide="refresh-cw"></i>
          <span>Refresh Market</span>
        </button>
      </div>

      <!-- Settings & Targets Card (Hidden to streamline pricing UI) -->
      <div class="card mb-4" style="display: none;">
        <h3 class="card-title mb-2">Arbitrage Settings</h3>
        <p class="card-subtitle mb-4">Adjust your target parameters to recalculate recommended ad rates</p>
        
        <div class="form-grid">
          <div class="form-group col-12 col-md-4">
            <label for="input-platform-fee-pct" class="form-label">
              <i data-lucide="percent"></i> Platform Maker Fee (%)
            </label>
            <div class="input-affix-wrapper">
              <input type="number" step="0.01" min="0" max="10" id="input-platform-fee-pct" class="form-input font-mono" value="0.30">
              <span class="input-suffix">%</span>
            </div>
            <p class="form-helper">Bybit P2P standard maker fee (0.30% default)</p>
          </div>
          <div class="form-group col-12 col-md-4">
            <label for="input-target-spread" class="form-label">
              <i data-lucide="percent"></i> Target Spread per USDT (NGN)
            </label>
            <div class="input-affix-wrapper">
              <span class="input-prefix">₦</span>
              <input type="number" step="0.1" min="0.1" id="input-target-spread" class="form-input font-mono" value="5.0">
              <span class="input-suffix">/ USDT</span>
            </div>
          </div>
          <div class="form-group col-12 col-md-4">
            <label for="input-avg-volume" class="form-label">
              <i data-lucide="coins"></i> Target Transaction Volume
            </label>
            <div class="input-affix-wrapper">
              <span class="input-prefix">$</span>
              <input type="number" step="1" min="1" id="input-avg-volume" class="form-input font-mono" value="100">
              <span class="input-suffix">USDT</span>
            </div>
          </div>
          <div class="form-group col-12 col-md-4">
            <label for="input-max-fee-drag-pct" class="form-label">
              <i data-lucide="shield-alert"></i> Fee Drag Cap
            </label>
            <div class="input-affix-wrapper">
              <input type="number" step="1" min="1" max="100" id="input-max-fee-drag-pct" class="form-input font-mono" value="20">
              <span class="input-suffix">%</span>
            </div>
            <p class="form-helper">Max % of profit spread consumed by fixed fees</p>
          </div>
          <div class="form-group col-12 col-md-6">
            <label for="input-inflow-fee" class="form-label">
              <i data-lucide="arrow-down-left"></i> Buy Payment Inflow Fee (Stamp Duty)
            </label>
            <div class="input-affix-wrapper">
              <span class="input-prefix">₦</span>
              <input type="number" step="1" min="0" id="input-inflow-fee" class="form-input font-mono" value="50">
              <span class="input-suffix">NGN</span>
            </div>
            <p class="form-helper">₦50 stamp duty on buy transfers > ₦10,000 (₦0 for ≤ ₦10,000)</p>
          </div>
          <div class="form-group col-12 col-md-6">
            <label for="input-outflow-fee" class="form-label">
              <i data-lucide="arrow-up-right"></i> Sell Payment Outflow Fee
            </label>
            <div class="input-affix-wrapper">
              <span class="input-prefix">₦</span>
              <input type="number" step="1" min="0" id="input-outflow-fee" class="form-input font-mono" value="0">
              <span class="input-suffix">NGN</span>
            </div>
            <p class="form-helper">₦0 fee when receiving Naira into bank account on Sell trades</p>
          </div>
          <div class="form-group col-12 col-md-6">
            <label for="input-pricing-mode" class="form-label">
              <i data-lucide="calculator"></i> Pricing Calculation Mode
            </label>
            <select id="input-pricing-mode" class="form-select">
              <option value="competitor">Outbid/Undercut Top Competitor</option>
              <option value="avg-5">Simple Average (Top 5 Ads)</option>
              <option value="avg-10" selected>Simple Average (Top 10 Ads)</option>
              <option value="avg-20">Simple Average (Top 20 Ads)</option>
              <option value="vwap-5">Weighted Average (Top 5 Ads)</option>
              <option value="vwap-10">Weighted Average (Top 10 Ads)</option>
              <option value="vwap-20">Weighted Average (Top 20 Ads)</option>
            </select>
          </div>
          <div class="form-group col-12 col-md-6">
            <label for="input-depth-limit" class="form-label">
              <i data-lucide="layers"></i> Market Depth Sync Size
            </label>
            <select id="input-depth-limit" class="form-select">
              <option value="10">10 Ads</option>
              <option value="20">20 Ads</option>
              <option value="50" selected>50 Ads</option>
              <option value="100">100 Ads</option>
            </select>
          </div>
          <div class="form-group col-12 col-md-12 d-flex flex-row align-items-center gap-2" style="cursor: pointer; padding-top: 10px;">
            <input type="checkbox" id="input-filter-limits" style="width: 18px; height: 18px; cursor: pointer;" checked>
            <label for="input-filter-limits" class="form-label mb-0" style="cursor: pointer; user-select: none;">
              <i data-lucide="filter"></i> Filter ads by target volume & limits
            </label>
          </div>
        </div>
      </div>

      <!-- Buyback Target & Dual-Mode Profit Calculator Card -->
      <div class="card mb-4" id="card-buyback-calculator">
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
          <div class="d-flex align-items-center gap-2">
            <div class="action-icon-box bg-purple-glow">
              <i data-lucide="target"></i>
            </div>
            <div>
              <h3 class="card-title">Buyback Target & Range Calculator</h3>
              <p class="card-subtitle">Volume-weighted orderbook buyback solver linked to profit targets</p>
            </div>
          </div>
          <div class="d-flex align-items-center gap-2">
            <button class="btn btn-sm btn-outline" id="btn-reset-buyback-session" title="Reset tracking for a new buyback goal">
              <i data-lucide="rotate-ccw"></i>
              <span>New Buyback Session</span>
            </button>
            <span class="badge badge-primary tiny" id="buyback-mode-badge">Target-Driven</span>
          </div>
        </div>

        <!-- Target Reached Celebratory Banner -->
        <div id="buyback-target-banner" class="mb-3 p-3 text-center" style="display: none; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 8px;">
          <div class="d-flex align-items-center justify-content-center gap-2 text-success fw-bold">
            <i data-lucide="check-circle-2"></i>
            <span id="buyback-target-banner-text" style="font-size: 1.05rem;">🎯 Buyback Goal Completed!</span>
          </div>
          <p class="text-secondary tiny mb-0 mt-1">You have fully acquired your target USDT volume at or below your target rate.</p>
        </div>

        <div class="form-grid mb-3">
          <div class="form-group col-12 col-md-4">
            <label for="input-buyback-mode" class="form-label">
              <i data-lucide="git-compare"></i> Trigger Mode
            </label>
            <select id="input-buyback-mode" class="form-select">
              <option value="target-driven" selected>Target-Driven (Inside-Out)</option>
              <option value="market-driven">Market-Driven (Outside-In)</option>
            </select>
          </div>
          <div class="form-group col-12 col-md-4">
            <label for="input-buyback-total-vol" class="form-label">
              <i data-lucide="coins"></i> Total Volume Goal (USDT)
            </label>
            <div class="input-affix-wrapper">
              <span class="input-prefix">$</span>
              <input type="number" step="1000" min="100" id="input-buyback-total-vol" class="form-input font-mono" value="100000">
              <span class="input-suffix">USDT</span>
            </div>
          </div>
          <div class="form-group col-12 col-md-4">
            <label for="input-buyback-profit-spread" class="form-label">
              <i data-lucide="trending-up"></i> Profit Difference (Δ)
            </label>
            <div class="input-affix-wrapper">
              <span class="input-prefix">₦</span>
              <input type="number" step="0.5" min="0.1" id="input-buyback-profit-spread" class="form-input font-mono" value="7.0">
              <span class="input-suffix">/ USDT</span>
            </div>
          </div>
          <div class="form-group col-12 col-md-6" id="group-buyback-target-price">
            <label for="input-buyback-target-price" class="form-label">
              <i data-lucide="arrow-down-circle"></i> Desired Avg Buy Price
            </label>
            <div class="input-affix-wrapper">
              <span class="input-prefix">₦</span>
              <input type="number" step="0.5" min="1" id="input-buyback-target-price" class="form-input font-mono" value="1495">
              <span class="input-suffix">NGN</span>
            </div>
          </div>
          <div class="form-group col-12 col-md-6" id="group-buyback-market-sell" style="display: none;">
            <label for="input-buyback-market-sell" class="form-label">
              <i data-lucide="arrow-up-circle"></i> Live Market Sell Price
            </label>
            <div class="input-affix-wrapper">
              <span class="input-prefix">₦</span>
              <input type="number" step="0.5" min="1" id="input-buyback-market-sell" class="form-input font-mono" value="1502">
              <span class="input-suffix">NGN</span>
            </div>
          </div>
        </div>

        <!-- Live Trade Execution Progress Bar -->
        <div class="mb-3 p-3" style="background: rgba(15, 23, 42, 0.7); border-radius: 8px; border: 1px solid rgba(59, 130, 246, 0.2);">
          <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
            <span class="small font-mono fw-bold text-secondary">
              <i data-lucide="activity"></i> CURRENT BUYBACK SESSION PROGRESS
            </span>
            <span class="badge badge-primary tiny font-mono" id="buyback-progress-text">0.0% Complete</span>
          </div>
          <div class="progress mb-1" style="height: 10px; background: rgba(255, 255, 255, 0.1); border-radius: 5px; overflow: hidden;">
            <div id="buyback-progress-bar" class="progress-bar bg-primary" role="progressbar" style="width: 0%; height: 100%; transition: width 0.3s ease;"></div>
          </div>
          <div class="d-flex justify-content-between text-muted tiny font-mono mt-1">
            <span id="buyback-session-started-label">Session: Active</span>
            <span id="buyback-session-summary-label">$0.00 / $100,000 USDT</span>
          </div>
        </div>

        <!-- Buyback Summary & Brackets Results -->
        <div class="p-3" style="background: rgba(10, 16, 28, 0.6); border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.08);">
          <div class="form-grid mb-3">
            <div class="card p-2 text-center" style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255, 255, 255, 0.06); min-width: 0;">
              <span class="text-secondary tiny uppercase d-block mb-1">Bought So Far</span>
              <div class="font-mono fw-bold text-accent" id="buyback-res-bought-so-far" style="font-size: 1.05rem; word-break: break-all;">$0.00 USDT</div>
              <div class="text-muted tiny mt-1" id="buyback-res-bought-avg">Avg: —</div>
            </div>
            <div class="card p-2 text-center" style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255, 255, 255, 0.06); min-width: 0;">
              <span class="text-secondary tiny uppercase d-block mb-1">Remaining Needed</span>
              <div class="font-mono fw-bold text-warning" id="buyback-res-remaining-needed" style="font-size: 1.05rem; word-break: break-all;">$100,000 USDT</div>
              <div class="text-muted tiny mt-1" id="buyback-res-remaining-budget">Budget: —</div>
            </div>
            <div class="card p-2 text-center" style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(59, 130, 246, 0.3); min-width: 0;">
              <span class="text-primary tiny uppercase d-block mb-1 fw-bold">Required Rate Remaining</span>
              <div class="font-mono fw-bold text-primary" id="buyback-res-needed-remaining-rate" style="font-size: 1.1rem; word-break: break-all;">₦1,495.00</div>
              <div class="text-muted tiny mt-1">To achieve target avg</div>
            </div>
            <div class="card p-2 text-center" style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255, 255, 255, 0.06); min-width: 0;">
              <span class="text-secondary tiny uppercase d-block mb-1">Target Avg Buy</span>
              <div class="font-mono fw-bold text-success" id="buyback-res-avg-buy" style="font-size: 1.05rem; word-break: break-all;">₦1,495.00</div>
              <div class="text-muted tiny mt-1">Goal benchmark</div>
            </div>
            <div class="card p-2 text-center" style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255, 255, 255, 0.06); min-width: 0;">
              <span class="text-secondary tiny uppercase d-block mb-1">Target Sell Rate</span>
              <div class="font-mono fw-bold text-primary" id="buyback-res-sell-rate" style="font-size: 1.05rem; word-break: break-all;">₦1,502.00</div>
              <div class="text-muted tiny mt-1" id="buyback-res-gross-spread">Δ: ₦7.00/USDT</div>
            </div>
            <div class="card p-2 text-center" style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255, 255, 255, 0.06); min-width: 0;">
              <span class="text-secondary tiny uppercase d-block mb-1">Net Profit (after fees)</span>
              <div class="font-mono fw-bold text-success" id="buyback-res-net-profit" style="font-size: 1.05rem; word-break: break-all;">₦2.50/USDT</div>
              <div class="text-muted tiny mt-1">Maker fee + stamp duty</div>
            </div>
          </div>

          <div class="table-responsive" style="overflow-x: auto;">
            <table class="market-depth-table" id="table-buyback-brackets">
              <thead>
                <tr>
                  <th class="text-nowrap">Tier Bracket</th>
                  <th class="text-nowrap">Volume (USDT)</th>
                  <th class="text-nowrap">Target Buy Rate</th>
                  <th class="text-end text-nowrap">Total Allocation (NGN)</th>
                </tr>
              </thead>
              <tbody id="tbody-buyback-brackets">
                <!-- Populated dynamically by js/pricing.js -->
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Split Buy / Sell Pricing Calculators (Hidden for streamlined view) -->
      <div class="form-grid mb-4" style="display: none;">
        
        <!-- Buy Ad Assistant (Capital Inflow) -->
        <div class="col-12 col-md-6 card">
          <div class="d-flex align-items-center justify-content-between mb-3">
            <div class="d-flex align-items-center gap-2">
              <div class="action-icon-box bg-blue-glow">
                <i data-lucide="arrow-down-left"></i>
              </div>
              <h3 class="card-title">Buy Ad Assistant <span class="badge badge-primary">Inflow</span></h3>
            </div>
            <span class="badge badge-neutral tiny" id="pricing-buy-maker-badge">0.30% Maker Fee</span>
          </div>
          <p class="text-secondary small mb-3" style="line-height: 1.4;">
            Prices competitor ads for your <strong>Buy Ad</strong> (which appears under Bybit P2P <strong>"Sell"</strong> tab for takers).
          </p>
          
          <div class="d-flex flex-column gap-3">
            <div class="d-flex justify-content-between align-items-center">
              <span class="text-secondary small">Exit Price (Market Sell):</span>
              <span class="font-mono fw-bold" id="pricing-exit-price">₦0.00</span>
            </div>
            <div class="d-flex justify-content-between align-items-center">
              <span class="text-secondary small">Max Buy Price Limit:</span>
              <span class="font-mono fw-bold" id="pricing-max-buy">₦0.00</span>
            </div>
            <div class="d-flex justify-content-between align-items-center">
              <span class="text-secondary small">Top Competitor Buy:</span>
              <span class="font-mono fw-bold" id="pricing-top-buy-competitor">₦0.00</span>
            </div>
            
            <!-- Fee Breakdown Sub-card -->
            <div class="pricing-fee-breakdown p-2" id="pricing-buy-fee-breakdown" style="background: rgba(10, 16, 28, 0.5); border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.06);">
              <div class="fee-breakdown-pills">
                <span class="badge badge-neutral tiny" id="pricing-buy-platform-fee">Maker Fee: ₦0.00/USDT</span>
                <span class="badge badge-neutral tiny" id="pricing-buy-inflow-fee-unit">Fiat Inflow: ₦0.00/USDT</span>
                <span class="badge badge-primary tiny" id="pricing-buy-effective-cost">Net Cost Basis: ₦0.00/USDT</span>
              </div>
            </div>

            <div class="divider my-1"></div>
            
            <div class="text-center py-2">
              <div class="text-muted small">RECOMMENDED BUY RATE</div>
              <div class="font-mono text-success fw-bold my-1" id="pricing-suggested-buy" style="font-size: 1.8rem;">₦0.00</div>
              <div id="pricing-buy-status" class="mt-2">
                <span class="badge badge-neutral">Offline</span>
              </div>
            </div>

            <!-- Optimal Minimum Order Limit Advisor -->
            <div class="pricing-limit-advisor p-2" id="pricing-recommended-buy-limit" style="background: rgba(59, 130, 246, 0.08); border-radius: 6px; border: 1px solid rgba(59, 130, 246, 0.2);">
              <div id="pricing-buy-limit-rec" class="text-center">
                <span class="small text-muted font-mono"><i data-lucide="shield-alert"></i> Recommended Limit: ≥ ₦50,000 (Fee drag ≤ 20%)</span>
              </div>
            </div>
            
            <button class="btn btn-sm btn-outline btn-block" id="btn-copy-buy-price">
              <i data-lucide="copy"></i>
              <span>Copy Buy Rate</span>
            </button>
          </div>
        </div>

        <!-- Sell Ad Assistant (Capital Outflow) -->
        <div class="col-12 col-md-6 card">
          <div class="d-flex align-items-center justify-content-between mb-3">
            <div class="d-flex align-items-center gap-2">
              <div class="action-icon-box bg-emerald-glow">
                <i data-lucide="arrow-up-right"></i>
              </div>
              <h3 class="card-title">Sell Ad Assistant <span class="badge badge-primary">Outflow</span></h3>
            </div>
            <span class="badge badge-neutral tiny" id="pricing-sell-maker-badge">0.30% Maker Fee</span>
          </div>
          <p class="text-secondary small mb-3" style="line-height: 1.4;">
            Prices competitor ads for your <strong>Sell Ad</strong> (which appears under Bybit P2P <strong>"Buy"</strong> tab for takers).
          </p>
          
          <div class="d-flex flex-column gap-3">
            <div class="d-flex justify-content-between align-items-center">
              <span class="text-secondary small">FIFO Holding Cost Basis:</span>
              <span class="font-mono fw-bold text-accent" id="pricing-cost-basis">₦0.00</span>
            </div>
            <div class="d-flex justify-content-between align-items-center">
              <span class="text-secondary small">Break-Even Sell Price:</span>
              <span class="font-mono fw-bold" id="pricing-break-even">₦0.00</span>
            </div>
            <div class="d-flex justify-content-between align-items-center">
              <span class="text-secondary small">Target Sell Price:</span>
              <span class="font-mono fw-bold text-warning" id="pricing-target-sell-price">₦0.00</span>
            </div>
            <div class="d-flex justify-content-between align-items-center">
              <span class="text-secondary small">Top Competitor Sell:</span>
              <span class="font-mono fw-bold" id="pricing-top-sell-competitor">₦0.00</span>
            </div>
            
            <!-- Fee Breakdown Sub-card -->
            <div class="pricing-fee-breakdown p-2" id="pricing-sell-fee-breakdown" style="background: rgba(10, 16, 28, 0.5); border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.06);">
              <div class="fee-breakdown-pills">
                <span class="badge badge-neutral tiny" id="pricing-sell-platform-fee">Maker Fee: ₦0.00/USDT</span>
                <span class="badge badge-neutral tiny" id="pricing-sell-outflow-fee-unit">Fiat Outflow: ₦0.00/USDT</span>
                <span class="badge badge-success tiny" id="pricing-sell-net-revenue">Net Revenue: ₦0.00/USDT</span>
              </div>
            </div>

            <div class="divider my-1"></div>

            <div class="text-center py-2">
              <div class="text-muted small">RECOMMENDED SELL RATE</div>
              <div class="font-mono text-success fw-bold my-1" id="pricing-suggested-sell" style="font-size: 1.8rem;">₦0.00</div>
              <div id="pricing-sell-status" class="mt-2">
                <span class="badge badge-neutral">Offline</span>
              </div>
            </div>

            <!-- Optimal Minimum Order Limit Advisor -->
            <div class="pricing-limit-advisor p-2" id="pricing-recommended-sell-limit" style="background: rgba(16, 185, 129, 0.08); border-radius: 6px; border: 1px solid rgba(16, 185, 129, 0.2);">
              <div id="pricing-sell-limit-rec" class="text-center">
                <span class="small text-muted font-mono"><i data-lucide="shield-alert"></i> Recommended Limit: ≥ ₦50,000 (Fee drag ≤ 20%)</span>
              </div>
            </div>

            <button class="btn btn-sm btn-outline btn-block" id="btn-copy-sell-price">
              <i data-lucide="copy"></i>
              <span>Copy Sell Rate</span>
            </button>
          </div>
        </div>

      </div>

      <!-- Live Order Books (P2P Market Depth) -->
      <div class="form-grid">
        
        <!-- Buy Depth (Other Advertisers Buying - Takers Selling) -->
        <div class="col-12 col-md-6 card">
          <h3 class="card-title mb-1">Buy Order Book (Market Bids)</h3>
          <p class="card-subtitle mb-3">Other merchants buying USDT (matches Bybit P2P <strong>"Sell"</strong> tab for takers). Top bid wins.</p>
          <div class="table-responsive">
            <table class="market-depth-table" id="pricing-buy-orderbook">
              <thead>
                <tr>
                  <th>Advertiser</th>
                  <th>Price</th>
                  <th class="text-end">Limits</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colspan="3" class="text-center text-muted py-4">Sync proxy to load market depth</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Sell Depth (Other Advertisers Selling - Takers Buying) -->
        <div class="col-12 col-md-6 card">
          <h3 class="card-title mb-1">Sell Order Book (Market Asks)</h3>
          <p class="card-subtitle mb-3">Other merchants selling USDT (matches Bybit P2P <strong>"Buy"</strong> tab for takers). Cheapest ask wins.</p>
          <div class="table-responsive">
            <table class="market-depth-table" id="pricing-sell-orderbook">
              <thead>
                <tr>
                  <th>Advertiser</th>
                  <th>Price</th>
                  <th class="text-end">Limits</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colspan="3" class="text-center text-muted py-4">Sync proxy to load market depth</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>

      <div class="bottom-nav-spacer"></div>
    </section>
  `;
}
