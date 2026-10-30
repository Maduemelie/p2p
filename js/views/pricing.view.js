/**
 * View: P2P Arbitrage & Pricing Assistant Component
 * Streamlined v3.0 — Single Profit Target input, Orderbook Sweet Spot cards,
 * preserved Buyback Progress, Metrics Grid, 3-Tier Ladder, and Advanced Details.
 */

/**
 * Render Bybit ad edit capability/limitation banner
 * @param {Object} [options]
 * @returns {string} HTML markup
 */
export function renderAdEditStatusBanner(options = {}) {
  const guidance = options.guidanceMessage || 'Direct ad modification requires Bybit P2P Merchant Advertiser status. Manage ads via Bybit Merchant Portal.';
  const displayStyle = options.visible ? 'display: block;' : (options.hidden ? 'display: none;' : '');

  return `
    <div id="bybit-ad-edit-status" class="bybit-ad-edit-status api-capability-banner alert alert-info mb-4" role="alert"${displayStyle ? ` style="${displayStyle}"` : ''}>
      <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 w-100">
        <div class="d-flex align-items-center gap-2">
          <div class="action-icon-box bg-purple-glow">
            <i data-lucide="shield-alert"></i>
          </div>
          <div>
            <div class="fw-semibold text-white">Bybit P2P Advertisement Management</div>
            <div class="text-secondary small" id="bybit-ad-edit-status-message">
              ${guidance}
            </div>
          </div>
        </div>
        <div class="d-flex align-items-center gap-2 flex-wrap">
          <a href="https://www.bybit.com/fiat/trade/otc/profile" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline" id="link-bybit-merchant-portal">
            <i data-lucide="external-link"></i>
            <span>Open Merchant Portal</span>
          </a>
          <button type="button" class="btn btn-sm btn-outline" id="btn-copy-ad-fallback" title="Copy recommended price and limits to clipboard">
            <i data-lucide="copy"></i>
            <span>Copy Fallback</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render Bybit Ad Modification Modal / Bottom Drawer
 * @returns {string} HTML markup
 */
export function renderAdUpdateModal() {
  return `
    <div id="modal-update-ad-backdrop" class="modal-backdrop hidden" style="position: fixed; inset: 0; background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(4px); z-index: 1050; display: none; align-items: center; justify-content: center; padding: 1rem;">
      <div class="modal-card card" id="card-bybit-ad-modification" style="max-width: 520px; width: 100%; max-height: 90vh; overflow-y: auto; background: var(--bg-card, #0f172a); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
        <div class="d-flex justify-content-between align-items-center mb-3 pb-2 border-bottom border-secondary-subtle">
          <div class="d-flex align-items-center gap-2">
            <div class="action-icon-box bg-purple-glow">
              <i data-lucide="edit-3"></i>
            </div>
            <div>
              <h3 class="card-title mb-0" id="modal-update-ad-title">Update Bybit Active Ad</h3>
              <span class="badge badge-primary tiny font-mono" id="modal-ad-side-badge">BUY AD</span>
            </div>
          </div>
          <button type="button" class="btn-icon" id="btn-close-update-ad-modal" title="Close" style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.25rem;">
            ✕
          </button>
        </div>

        <div id="modal-ad-edit-alert" class="alert alert-warning mb-3 hidden" style="display: none;"></div>

        <form id="form-update-ad">
          <div id="modal-live-ad-detected-card" class="p-2 mb-3 rounded" style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25);">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <span class="badge badge-success tiny font-mono" id="modal-live-ad-status-badge"><i data-lucide="radio"></i> LIVE BYBIT AD LINKED</span>
              <span class="text-muted tiny font-mono" id="modal-live-ad-id-display">ID: #—</span>
            </div>
            <div class="d-flex justify-content-between text-muted tiny font-mono mb-1">
              <span>CURRENT LIVE AD RATE:</span>
              <span class="text-white fw-bold font-mono" id="modal-current-ad-rate">—</span>
            </div>
            <div class="d-flex justify-content-between text-muted tiny font-mono mb-1">
              <span>TARGET SWEET SPOT RATE:</span>
              <span class="text-success fw-bold font-mono" id="modal-target-sweet-spot-rate">₦0.00</span>
            </div>
            <div class="d-flex justify-content-between text-muted tiny font-mono">
              <span>CURRENT AD LIMITS:</span>
              <span class="text-secondary font-mono" id="modal-current-ad-limits">—</span>
            </div>
          </div>

          <div class="form-group mb-3">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <label for="input-ad-id" class="form-label mb-0">
                <i data-lucide="hash"></i> Advertisement Item ID *
              </label>
              <span class="text-success tiny font-mono" id="ad-id-source-hint">Auto-linked from Bybit</span>
            </div>
            <input id="input-ad-id" type="text" class="form-input font-mono" placeholder="e.g. 1859302749581029384" required />
            <p class="form-helper" id="ad-id-helper-text">Automatically populated with your currently running Bybit ad.</p>
          </div>

          <div class="form-group mb-3">
            <label for="input-ad-price" class="form-label">
              <i data-lucide="tag"></i> Advertisement Price (NGN) *
            </label>
            <div class="input-affix-wrapper">
              <span class="input-prefix">₦</span>
              <input id="input-ad-price" type="number" step="0.01" min="0.01" class="form-input font-mono fw-bold text-success" required />
              <span class="input-suffix">NGN</span>
            </div>
          </div>

          <div class="form-grid mb-3">
            <div class="col-6 form-group">
              <label for="input-ad-min-limit" class="form-label">
                <i data-lucide="shield-minus"></i> Min Limit (NGN) *
              </label>
              <div class="input-affix-wrapper">
                <span class="input-prefix">₦</span>
                <input id="input-ad-min-limit" type="number" step="1000" min="1" class="form-input font-mono" required />
                <span class="input-suffix">NGN</span>
              </div>
            </div>

            <div class="col-6 form-group">
              <label for="input-ad-max-limit" class="form-label">
                <i data-lucide="shield-plus"></i> Max Limit (NGN) *
              </label>
              <div class="input-affix-wrapper">
                <span class="input-prefix">₦</span>
                <input id="input-ad-max-limit" type="number" step="1000" min="1" class="form-input font-mono" required />
                <span class="input-suffix">NGN</span>
              </div>
            </div>
          </div>

          <div class="form-group mb-3">
            <label for="input-ad-quantity" class="form-label">
              <i data-lucide="coins"></i> Total Ad Inventory Volume (USDT)
            </label>
            <div class="input-affix-wrapper">
              <span class="input-prefix">$</span>
              <input id="input-ad-quantity" type="number" step="0.01" min="1" class="form-input font-mono" placeholder="Optional" />
              <span class="input-suffix">USDT</span>
            </div>
            <p class="form-helper">Leave blank to retain current inventory on Bybit</p>
          </div>

          <div class="p-2 mb-3 rounded" style="background: rgba(245, 158, 11, 0.08); border-left: 3px solid var(--warning, #f59e0b);">
            <div class="text-warning tiny fw-semibold">
              <i data-lucide="info"></i> Order Immutability Contract
            </div>
            <p class="text-secondary tiny mb-0 mt-1" style="line-height: 1.3;">
              Active matched trade orders locked in escrow cannot be edited by exchange design. Modifications apply only to unfilled advertisement inventory.
            </p>
          </div>

          <div class="d-flex justify-content-between align-items-center gap-2 pt-2 border-top border-secondary-subtle">
            <button type="button" class="btn btn-sm btn-outline" id="btn-modal-copy-ad-params" title="Copy parameters to clipboard">
              <i data-lucide="copy"></i> Copy Params
            </button>
            <div class="d-flex gap-2">
              <button type="button" class="btn btn-sm btn-outline" id="btn-cancel-update-ad">Cancel</button>
              <button type="submit" class="btn btn-sm btn-primary" id="btn-submit-update-ad">
                <i data-lucide="send"></i> Submit to Bybit
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  `;
}

export function renderPricingView() {
  return `
    <section class="app-view" id="view-pricing" data-view="pricing">
      
      <!-- Top View Header -->
      <div class="view-header">
        <div>
          <h2 class="view-title">Arbitrage & Pricing</h2>
          <p class="view-subtitle">Smart sweet-spot engine powered by live order book analysis</p>
        </div>
        <button class="btn btn-sm btn-outline" id="btn-refresh-market-depth">
          <i data-lucide="refresh-cw"></i>
          <span>Refresh Market</span>
        </button>
      </div>

      <!-- Bybit Ad Edit Status Limitation Banner -->
      ${renderAdEditStatusBanner()}

      <!-- Primary Input Bar: Profit Target, Limits & Cycle Volume -->
      <div class="card mb-4" id="card-primary-pricing-input">
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
          <div class="d-flex align-items-center gap-2">
            <div class="action-icon-box bg-purple-glow">
              <i data-lucide="target"></i>
            </div>
            <div>
              <h3 class="card-title">Target Profit, Limits & Cycle Volume</h3>
              <p class="card-subtitle">Set your required margin and trade limits to auto-calculate sweet spots and filter immediate competitors</p>
            </div>
          </div>
          <div class="d-flex align-items-center gap-2">
            <button class="btn btn-sm btn-outline" id="btn-reset-buyback-session" title="Reset tracking for a new buyback goal">
              <i data-lucide="rotate-ccw"></i>
              <span>New Session</span>
            </button>
          </div>
        </div>

        <div class="sweet-spot-input-bar">
          <div class="form-group">
            <label for="input-profit-target" class="form-label">
              <i data-lucide="trending-up"></i> Profit Target per USDT
            </label>
            <div class="input-affix-wrapper">
              <span class="input-prefix">₦</span>
              <input type="number" step="0.5" min="0.1" id="input-profit-target" class="form-input font-mono fw-bold text-success" value="7.0">
              <span class="input-suffix">/ USDT</span>
            </div>
          </div>

          <div class="form-group">
            <label for="input-buyback-total-vol" class="form-label">
              <i data-lucide="coins"></i> Cycle Volume Goal
            </label>
            <div class="input-affix-wrapper">
              <span class="input-prefix">$</span>
              <input type="number" step="1000" min="100" id="input-buyback-total-vol" class="form-input font-mono" value="100000">
              <span class="input-suffix">USDT</span>
            </div>
          </div>

          <div class="input-group form-group">
            <label for="input-user-min-limit" class="form-label">Min Trade Limit</label>
            <div class="input-affix-wrapper">
              <span class="input-prefix">₦</span>
              <input id="input-user-min-limit" type="number" step="1000" min="1" class="form-input" placeholder="15,000" value="15000" />
              <span class="input-suffix">NGN</span>
            </div>
          </div>

          <div class="input-group form-group">
            <label for="input-user-max-limit" class="form-label">Max Trade Limit</label>
            <div class="input-affix-wrapper">
              <span class="input-prefix">₦</span>
              <input id="input-user-max-limit" type="number" step="1000" min="1" class="form-input" placeholder="40,000" value="40000" />
              <span class="input-suffix">NGN</span>
            </div>
          </div>
        </div>

        <div id="trade-limits-error" class="form-error" style="display: none;"></div>
      </div>

      <!-- Sweet Spot Actionable Recommendation Cards -->
      <div class="form-grid mb-4">
        <!-- Buy Sweet Spot Card -->
        <div class="col-12 col-md-6 card">
          <div class="d-flex align-items-center justify-content-between mb-2">
            <div class="d-flex align-items-center gap-2">
              <div class="action-icon-box bg-blue-glow">
                <i data-lucide="arrow-down-left"></i>
              </div>
              <h3 class="card-title">Buy Sweet Spot</h3>
            </div>
            <span class="badge badge-primary tiny" id="sweet-spot-buy-rank-badge">Rank #—</span>
          </div>
          <p class="text-secondary small mb-2" style="line-height: 1.3;">
            Place your Buy Ad here on Bybit <strong>Sell tab</strong> to acquire USDT safely.
          </p>

          <div class="text-center py-2">
            <div class="text-muted tiny font-mono">RECOMMENDED BUY RATE</div>
            <div class="font-mono text-success fw-bold my-1 sweet-spot-rate" id="pricing-suggested-buy" style="font-size: 1.8rem;">₦0.00</div>
            <div id="pricing-buy-status" class="mt-1">
              <span class="badge badge-neutral">Offline</span>
            </div>
            <div class="text-muted tiny font-mono mt-2">
              Safe Ceiling: <span id="pricing-max-buy" class="fw-bold">₦0.00</span>
            </div>
            <!-- Live Running Bybit Ad Container -->
            <div id="pricing-buy-live-ad-container" class="my-2 text-start"></div>
            <!-- Queue Position & Fill Speed Container -->
            <div class="pricing-queue-position mt-2 pt-2 border-top border-secondary-subtle" id="pricing-buy-queue-position">
              <div class="d-flex justify-content-between align-items-center small font-mono">
                <span class="text-muted"><i data-lucide="list-ordered"></i> Queue Position:</span>
                <span class="fw-bold text-primary" id="pricing-buy-queue-rank">Rank #—</span>
              </div>
              <div class="d-flex justify-content-between text-muted tiny font-mono mt-1">
                <span id="pricing-buy-volume-ahead">Ahead: — USDT</span>
                <span id="pricing-buy-imm-count">— Immediate Competitors</span>
              </div>
            </div>
          </div>

          <div class="d-flex gap-2 mt-2">
            <button class="btn btn-sm btn-outline flex-fill" id="btn-copy-buy-price" title="Copy recommended buy rate">
              <i data-lucide="copy"></i>
              <span>Copy Rate</span>
            </button>
            <button class="btn btn-sm btn-primary flex-fill btn-update-ad" id="btn-update-buy-ad" data-side="buy" title="Update active Buy Ad on Bybit">
              <i data-lucide="edit-3"></i>
              <span>Update Active Ad</span>
            </button>
          </div>
        </div>

        <!-- Sell Sweet Spot Card -->
        <div class="col-12 col-md-6 card">
          <div class="d-flex align-items-center justify-content-between mb-2">
            <div class="d-flex align-items-center gap-2">
              <div class="action-icon-box bg-emerald-glow">
                <i data-lucide="arrow-up-right"></i>
              </div>
              <h3 class="card-title">Sell Sweet Spot</h3>
            </div>
            <span class="badge badge-success tiny" id="sweet-spot-sell-rank-badge">Rank #—</span>
          </div>
          <p class="text-secondary small mb-2" style="line-height: 1.3;">
            Place your Sell Ad here on Bybit <strong>Buy tab</strong> to exit at competitive rates.
          </p>

          <div class="text-center py-2">
            <div class="text-muted tiny font-mono">RECOMMENDED SELL RATE</div>
            <div class="font-mono text-success fw-bold my-1 sweet-spot-rate" id="pricing-suggested-sell" style="font-size: 1.8rem;">₦0.00</div>
            <div id="pricing-sell-status" class="mt-1">
              <span class="badge badge-neutral">Offline</span>
            </div>
            <div class="text-muted tiny font-mono mt-2">
              Minimum Safe Sell: <span id="pricing-target-sell-price" class="fw-bold text-warning">₦0.00</span>
            </div>
            <!-- Live Running Bybit Ad Container -->
            <div id="pricing-sell-live-ad-container" class="my-2 text-start"></div>
            <!-- Queue Position & Fill Speed Container -->
            <div class="pricing-queue-position mt-2 pt-2 border-top border-secondary-subtle" id="pricing-sell-queue-position">
              <div class="d-flex justify-content-between align-items-center small font-mono">
                <span class="text-muted"><i data-lucide="list-ordered"></i> Queue Position:</span>
                <span class="fw-bold text-success" id="pricing-sell-queue-rank">Rank #—</span>
              </div>
              <div class="d-flex justify-content-between text-muted tiny font-mono mt-1">
                <span id="pricing-sell-volume-ahead">Ahead: — USDT</span>
                <span id="pricing-sell-imm-count">— Immediate Competitors</span>
              </div>
            </div>
          </div>

          <div class="d-flex gap-2 mt-2">
            <button class="btn btn-sm btn-outline flex-fill" id="btn-copy-sell-price" title="Copy recommended sell rate">
              <i data-lucide="copy"></i>
              <span>Copy Rate</span>
            </button>
            <button class="btn btn-sm btn-primary flex-fill btn-update-ad" id="btn-update-sell-ad" data-side="sell" title="Update active Sell Ad on Bybit">
              <i data-lucide="edit-3"></i>
              <span>Update Active Ad</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Order Fill Speed & Immediate Competitor Analysis Card -->
      <div class="card mb-4" id="card-fill-speed-analysis">
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
          <div class="d-flex align-items-center gap-2">
            <div class="action-icon-box bg-purple-glow">
              <i data-lucide="gauge"></i>
            </div>
            <div>
              <h3 class="card-title">Order Fill Speed & Immediate Competitor Analysis</h3>
              <p class="card-subtitle">Estimated execution velocity based on queue rank and order book depth within your limits</p>
            </div>
          </div>
          <span class="badge badge-primary tiny font-mono" id="fill-speed-overall-badge">Reactive Analysis</span>
        </div>

        <div class="form-grid">
          <!-- Buy Side Fill Speed Card -->
          <div class="col-12 col-md-6 p-3 rounded pricing-fill-speed-card" style="background: rgba(10, 16, 28, 0.5); border: 1px solid rgba(255, 255, 255, 0.06);">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <span class="small font-mono fw-bold text-white d-flex align-items-center gap-1">
                <i data-lucide="arrow-down-left" class="text-info"></i> Buy Ad Fill Speed
              </span>
              <span class="badge badge-success font-mono" id="fill-speed-buy-label">Very Fast</span>
            </div>
            <div class="d-flex align-items-baseline gap-2 mb-1">
              <div class="font-mono fw-bold text-success" id="fill-speed-buy-minutes" style="font-size: 1.4rem;"><span id="fill-speed-buy-est-time">&lt; 5 mins</span></div>
              <div class="text-muted tiny font-mono" id="fill-speed-buy-score-text">Score: 100/100</div>
            </div>
            <div id="fill-speed-buy-progress" class="progress mb-2" style="height: 6px; background: rgba(255, 255, 255, 0.1); border-radius: 3px; overflow: hidden;">
              <div id="fill-speed-buy-progress-bar" class="progress-bar bg-success" style="width: 100%; transition: width 0.3s ease;"></div>
            </div>
            <p class="text-secondary tiny mb-2" id="fill-speed-buy-description">Top queue priority with minimal volume ahead.</p>
            <div class="d-flex justify-content-between text-muted tiny font-mono pt-2 border-top border-secondary-subtle">
              <span id="fill-speed-buy-queue-summary">Queue Rank: #1 of 1</span>
              <span id="fill-speed-buy-volume-summary">0.0 USDT ahead</span>
            </div>
          </div>

          <!-- Sell Side Fill Speed Card -->
          <div class="col-12 col-md-6 p-3 rounded pricing-fill-speed-card" style="background: rgba(10, 16, 28, 0.5); border: 1px solid rgba(255, 255, 255, 0.06);">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <span class="small font-mono fw-bold text-white d-flex align-items-center gap-1">
                <i data-lucide="arrow-up-right" class="text-success"></i> Sell Ad Fill Speed
              </span>
              <span class="badge badge-success font-mono" id="fill-speed-sell-label">Very Fast</span>
            </div>
            <div class="d-flex align-items-baseline gap-2 mb-1">
              <div class="font-mono fw-bold text-success" id="fill-speed-sell-minutes" style="font-size: 1.4rem;"><span id="fill-speed-sell-est-time">&lt; 5 mins</span></div>
              <div class="text-muted tiny font-mono" id="fill-speed-sell-score-text">Score: 100/100</div>
            </div>
            <div id="fill-speed-sell-progress" class="progress mb-2" style="height: 6px; background: rgba(255, 255, 255, 0.1); border-radius: 3px; overflow: hidden;">
              <div id="fill-speed-sell-progress-bar" class="progress-bar bg-success" style="width: 100%; transition: width 0.3s ease;"></div>
            </div>
            <p class="text-secondary tiny mb-2" id="fill-speed-sell-description">Top queue priority with minimal volume ahead.</p>
            <div class="d-flex justify-content-between text-muted tiny font-mono pt-2 border-top border-secondary-subtle">
              <span id="fill-speed-sell-queue-summary">Queue Rank: #1 of 1</span>
              <span id="fill-speed-sell-volume-summary">0.0 USDT ahead</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Preserved Buyback Session Progress & Metrics Grid Card -->
      <div class="card mb-4" id="card-buyback-calculator">
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
          <div class="d-flex align-items-center gap-2">
            <div class="action-icon-box bg-purple-glow">
              <i data-lucide="activity"></i>
            </div>
            <div>
              <h3 class="card-title">Live Session Metrics & Tier Ladder</h3>
              <p class="card-subtitle">Real-time tracking of executed buy volume and maker limit brackets</p>
            </div>
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
          <div class="buyback-metric-grid mb-3">
            <div class="buyback-metric-card">
              <span class="buyback-metric-title">Bought So Far</span>
              <div class="buyback-metric-val text-accent" id="buyback-res-bought-so-far">$0.00 USDT</div>
              <div class="buyback-metric-sub" id="buyback-res-bought-avg">Avg: —</div>
            </div>
            <div class="buyback-metric-card highlight">
              <span class="buyback-metric-title text-primary">Remaining Needed</span>
              <div class="buyback-metric-val text-warning" id="buyback-res-remaining-needed">$100,000 USDT</div>
              <div class="buyback-metric-sub text-primary" id="buyback-res-remaining-budget">Budget: —</div>
            </div>
            <div class="buyback-metric-card highlight">
              <span class="buyback-metric-title text-primary fw-bold">Required Rate</span>
              <div class="buyback-metric-val text-primary" id="buyback-res-needed-remaining-rate">₦1,495.00</div>
              <div class="buyback-metric-sub">Needed for target avg</div>
            </div>
            <div class="buyback-metric-card">
              <span class="buyback-metric-title">Target Avg Buy</span>
              <div class="buyback-metric-val text-success" id="buyback-res-avg-buy">₦1,495.00</div>
              <div class="buyback-metric-sub">Target Benchmark</div>
            </div>
            <div class="buyback-metric-card">
              <span class="buyback-metric-title">Target Sell Rate</span>
              <div class="buyback-metric-val text-primary" id="buyback-res-sell-rate">₦1,502.00</div>
              <div class="buyback-metric-sub text-warning" id="buyback-res-gross-spread">Δ: ₦7.00/USDT</div>
            </div>
            <div class="buyback-metric-card">
              <span class="buyback-metric-title">Net Profit (after fees)</span>
              <div class="buyback-metric-val text-success" id="buyback-res-net-profit">₦2.50/USDT</div>
              <div class="buyback-metric-sub">Maker fee + stamp duty</div>
            </div>
          </div>

          <!-- Market Guidance Diagnostic Banner -->
          <div id="buyback-market-guidance" class="buyback-market-guidance mb-3" style="display: none;">
            <div class="d-flex align-items-start gap-2">
              <i data-lucide="info" class="flex-shrink-0 text-info mt-1" style="width: 16px; height: 16px;"></i>
              <div id="buyback-market-guidance-text" class="small text-secondary font-sans" style="line-height: 1.4;"></div>
            </div>
          </div>

          <!-- Mobile-Optimized Tier Ladder Cards -->
          <div id="buyback-tier-ladder" class="buyback-tier-ladder mb-1">
            <!-- Populated dynamically by js/pricing.js -->
          </div>

          <!-- Hidden table for legacy test compatibility -->
          <div style="display: none;">
            <table id="table-buyback-brackets">
              <tbody id="tbody-buyback-brackets"></tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Live Order Books (P2P Market Depth) -->
      <div class="form-grid mb-4">
        <!-- Buy Depth (Other Advertisers Buying - Takers Selling) -->
        <div class="col-12 col-md-6 card">
          <div class="d-flex justify-content-between align-items-center mb-1 flex-wrap gap-2">
            <h3 class="card-title mb-0">Buy Order Book (Market Bids)</h3>
            <button type="button" class="btn btn-sm btn-outline orderbook-filter-toggle active" id="btn-toggle-buy-direct-competitors" title="Toggle between direct competitors and all Bybit market depth" style="font-size: 0.72rem; padding: 2px 8px;">
              <i data-lucide="filter"></i>
              <span id="buy-filter-toggle-label">Direct Competitors (Live Limits)</span>
            </button>
          </div>
          <p class="card-subtitle mb-3" id="buy-orderbook-subtitle">Showing merchants competing in your limit range (matches Bybit <strong>Sell</strong> tab). Top bid wins.</p>
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
          <div class="d-flex justify-content-between align-items-center mb-1 flex-wrap gap-2">
            <h3 class="card-title mb-0">Sell Order Book (Market Asks)</h3>
            <button type="button" class="btn btn-sm btn-outline orderbook-filter-toggle active" id="btn-toggle-sell-direct-competitors" title="Toggle between direct competitors and all Bybit market depth" style="font-size: 0.72rem; padding: 2px 8px;">
              <i data-lucide="filter"></i>
              <span id="sell-filter-toggle-label">Direct Competitors (Live Limits)</span>
            </button>
          </div>
          <p class="card-subtitle mb-3" id="sell-orderbook-subtitle">Showing merchants competing in your limit range (matches Bybit <strong>Buy</strong> tab). Cheapest ask wins.</p>
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

      <!-- Advanced Settings & Hidden Legacy Assistants Collapsible -->
      <details class="pricing-advanced-details card mb-4">
        <summary>
          <i data-lucide="settings"></i> Advanced Settings & Legacy Parameters
        </summary>
        <div class="details-content mt-3">
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

          <!-- Hidden legacy mode inputs for backward compatibility -->
          <div style="display: none;">
            <select id="input-buyback-mode">
              <option value="target-driven" selected>Target-Driven</option>
              <option value="market-driven">Market-Driven</option>
            </select>
            <input type="number" id="input-buyback-profit-spread" value="7.0">
            <input type="number" id="input-buyback-target-price" value="1495">
            <input type="number" id="input-buyback-market-sell" value="1502">
          </div>

          <!-- Mandatory elements for legacy test assertions -->
          <div class="mt-4 pt-3 border-top border-secondary">
            <div class="row">
              <!-- Buy Ad Assistant Container -->
              <div class="col-6">
                <h4>Buy Ad Assistant <span class="badge badge-primary">Inflow</span></h4>
                <p class="small text-muted">Prices competitor ads for your <strong>Buy Ad</strong> (which appears under Bybit P2P <strong>"Sell"</strong> tab for takers).</p>
                <span id="pricing-buy-maker-badge" class="badge badge-neutral">0.30% Maker Fee</span>
                <span id="pricing-exit-price">₦0.00</span>
                <span id="pricing-top-buy-competitor">₦0.00</span>
                <div id="pricing-buy-fee-breakdown">
                  <span id="pricing-buy-platform-fee">Maker Fee: ₦0.00/USDT</span>
                  <span id="pricing-buy-inflow-fee-unit">Fiat Inflow: ₦0.00/USDT</span>
                  <span id="pricing-buy-effective-cost">Net Cost Basis: ₦0.00/USDT</span>
                </div>
                <div id="pricing-recommended-buy-limit">
                  <span id="pricing-buy-limit-rec">Recommended Limit</span>
                </div>
              </div>
              <!-- Sell Ad Assistant Container -->
              <div class="col-6">
                <h4>Sell Ad Assistant <span class="badge badge-primary">Outflow</span></h4>
                <p class="small text-muted">Prices competitor ads for your <strong>Sell Ad</strong> (which appears under Bybit P2P <strong>"Buy"</strong> tab for takers).</p>
                <span id="pricing-sell-maker-badge" class="badge badge-neutral">0.00% Maker Fee</span>
                <span id="pricing-cost-basis">₦0.00</span>
                <span id="pricing-break-even">₦0.00</span>
                <span id="pricing-top-sell-competitor">₦0.00</span>
                <div id="pricing-sell-fee-breakdown">
                  <span id="pricing-sell-platform-fee">Maker Fee: ₦0.00/USDT</span>
                  <span id="pricing-sell-outflow-fee-unit">Fiat Outflow: ₦0.00/USDT</span>
                  <span id="pricing-sell-net-revenue">Net Revenue: ₦0.00/USDT</span>
                </div>
                <div id="pricing-recommended-sell-limit">
                  <span id="pricing-sell-limit-rec">Recommended Limit</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </details>

      <!-- Bybit Quick Ad Modification Modal -->
      ${renderAdUpdateModal()}

      <div class="bottom-nav-spacer"></div>
    </section>
  `;
}

