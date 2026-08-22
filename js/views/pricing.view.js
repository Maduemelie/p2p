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

      <!-- Settings & Targets Card -->
      <div class="card mb-4">
        <h3 class="card-title mb-2">Arbitrage Settings</h3>
        <p class="card-subtitle mb-4">Adjust your target parameters to recalculate recommended ad rates</p>
        
        <div class="form-grid">
          <div class="form-group col-12 col-md-6">
            <label for="input-target-spread" class="form-label">
              <i data-lucide="percent"></i> Target Spread per USDT (NGN)
            </label>
            <div class="input-affix-wrapper">
              <span class="input-prefix">₦</span>
              <input type="number" step="0.1" min="0.1" id="input-target-spread" class="form-input font-mono" value="5.0">
              <span class="input-suffix">/ USDT</span>
            </div>
          </div>
          <div class="form-group col-12 col-md-6">
            <label for="input-avg-volume" class="form-label">
              <i data-lucide="coins"></i> Target Transaction Volume
            </label>
            <div class="input-affix-wrapper">
              <span class="input-prefix">$</span>
              <input type="number" step="1" min="1" id="input-avg-volume" class="form-input font-mono" value="100">
              <span class="input-suffix">USDT</span>
            </div>
          </div>
          <div class="form-group col-12 col-md-6">
            <label for="input-inflow-fee" class="form-label">
              <i data-lucide="arrow-down-left"></i> Buy Payment Inflow Fee
            </label>
            <div class="input-affix-wrapper">
              <span class="input-prefix">₦</span>
              <input type="number" step="1" min="0" id="input-inflow-fee" class="form-input font-mono" value="50">
              <span class="input-suffix">NGN</span>
            </div>
            <p class="form-helper">Fintech transfer fee paid when sending Naira to buy crypto</p>
          </div>
          <div class="form-group col-12 col-md-6">
            <label for="input-outflow-fee" class="form-label">
              <i data-lucide="arrow-up-right"></i> Sell Payment Outflow Fee
            </label>
            <div class="input-affix-wrapper">
              <span class="input-prefix">₦</span>
              <input type="number" step="1" min="0" id="input-outflow-fee" class="form-input font-mono" value="50">
              <span class="input-suffix">NGN</span>
            </div>
            <p class="form-helper">Stamp duty or fee charged when receiving Naira from a buyer</p>
          </div>
        </div>
      </div>

      <!-- Split Buy / Sell Pricing Calculators -->
      <div class="form-grid mb-4">
        
        <!-- Buy Ad Assistant (Capital Inflow) -->
        <div class="col-12 col-md-6 card">
          <div class="d-flex align-items-center gap-2 mb-3">
            <div class="action-icon-box bg-blue-glow">
              <i data-lucide="arrow-down-left"></i>
            </div>
            <h3 class="card-title">Buy Ad Assistant <span class="badge badge-primary">Inflow</span></h3>
          </div>
          
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
            <div class="divider my-1"></div>
            
            <div class="text-center py-2">
              <div class="text-muted small">RECOMMENDED BUY RATE</div>
              <div class="font-mono text-success fw-bold my-1" id="pricing-suggested-buy" style="font-size: 1.8rem;">₦0.00</div>
              <div id="pricing-buy-status" class="mt-2">
                <span class="badge badge-neutral">Offline</span>
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
          <div class="d-flex align-items-center gap-2 mb-3">
            <div class="action-icon-box bg-emerald-glow">
              <i data-lucide="arrow-up-right"></i>
            </div>
            <h3 class="card-title">Sell Ad Assistant <span class="badge badge-buy">Outflow</span></h3>
          </div>

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
              <span class="text-secondary small">Top Competitor Sell:</span>
              <span class="font-mono fw-bold" id="pricing-top-sell-competitor">₦0.00</span>
            </div>
            <div class="divider my-1"></div>

            <div class="text-center py-2">
              <div class="text-muted small">RECOMMENDED SELL RATE</div>
              <div class="font-mono text-success fw-bold my-1" id="pricing-suggested-sell" style="font-size: 1.8rem;">₦0.00</div>
              <div id="pricing-sell-status" class="mt-2">
                <span class="badge badge-neutral">Offline</span>
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
          <p class="card-subtitle mb-3">Other advertisers buying USDT. Top bid wins.</p>
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
          <p class="card-subtitle mb-3">Other advertisers selling USDT. Cheapest ask wins.</p>
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
