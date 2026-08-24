/**
 * View: Record Trade Form — Redesigned v2.0
 * Sectioned form with prominent Buy/Sell indicator, collapsible fees,
 * and calculation summary. Uses CSS classes only, no inline styles.
 */
export function renderAddTradeView() {
  return `
    <section class="app-view" id="view-add-trade" data-view="add-trade">
      <div class="view-header">
        <div class="d-flex align-items-center gap-2">
          <button type="button" class="btn btn-sm btn-ghost" id="btn-cancel-trade" title="Go Back">
            <i data-lucide="arrow-left"></i>
            <span>Back</span>
          </button>
          <div>
            <h2 class="view-title" id="trade-form-title">Record Trade</h2>
            <p class="view-subtitle" id="trade-form-subtitle">Log a new BUY or SELL order</p>
          </div>
        </div>
        <button class="btn btn-sm btn-ghost hidden" id="btn-cancel-edit">
          <i data-lucide="x"></i>
          <span>Cancel Edit</span>
        </button>
      </div>

      <!-- Trade Direction Toggle -->
      <div class="segmented-control trade-type-selector mb-4" id="trade-type-toggle">
        <button type="button" class="seg-btn trade-buy-btn active" data-direction="BUY">
          <i data-lucide="arrow-down-left"></i>
          <span>BUY USDT</span>
        </button>
        <button type="button" class="seg-btn trade-sell-btn" data-direction="SELL">
          <i data-lucide="arrow-up-right"></i>
          <span>SELL USDT</span>
        </button>
      </div>

      <!-- Edit Mode Alert -->
      <div class="alert alert-info mb-4 hidden" id="edit-mode-alert">
        <i data-lucide="edit-3"></i>
        <span>You are editing an existing trade. Save or cancel to return.</span>
      </div>

      <!-- Trade Entry Form -->
      <form id="form-add-trade" novalidate>

        <!-- Section 1: Order Details -->
        <div class="form-section">
          <div class="form-section-title">
            <i data-lucide="clipboard-list"></i>
            Order Details
          </div>
          <div class="form-grid">
            <div class="form-group col-12 col-md-6">
              <label for="trade-date" class="form-label">
                <i data-lucide="calendar"></i> Date & Time
              </label>
              <input type="datetime-local" id="trade-date" class="form-input" required>
            </div>
            <div class="form-group col-12 col-md-6">
              <label for="trade-bank-account" class="form-label">
                <i data-lucide="landmark"></i> Bank Account
              </label>
              <div class="select-with-add">
                <select id="trade-bank-account" class="form-select" required>
                  <option value="" disabled>Select Bank Account</option>
                </select>
                <button type="button" class="btn btn-icon btn-outline" id="btn-quick-add-bank" title="Quick Add Bank">
                  <i data-lucide="plus"></i>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Section 2: Price & Amount -->
        <div class="form-section">
          <div class="form-section-title">
            <i data-lucide="calculator"></i>
            Price & Amount
          </div>
          <div class="form-grid">
            <div class="form-group col-12 col-md-4">
              <label for="trade-rate" class="form-label">
                <i data-lucide="trending-up"></i> Rate (NGN / USDT)
              </label>
              <div class="input-affix-wrapper">
                <span class="input-prefix">₦</span>
                <input type="number" step="0.01" min="0" id="trade-rate" class="form-input font-mono" placeholder="1,600.00" required>
              </div>
            </div>
            <div class="form-group col-12 col-md-4">
              <label for="trade-ngn" class="form-label">
                <i data-lucide="banknote"></i> NGN Amount
              </label>
              <div class="input-affix-wrapper">
                <span class="input-prefix">₦</span>
                <input type="number" step="0.01" min="0" id="trade-ngn" class="form-input font-mono" placeholder="500,000.00" required>
              </div>
            </div>
            <div class="form-group col-12 col-md-4">
              <label for="trade-usdt" class="form-label">
                <i data-lucide="coins"></i> USDT Amount
              </label>
              <div class="input-affix-wrapper">
                <span class="input-prefix">$</span>
                <input type="number" step="0.0001" min="0" id="trade-usdt" class="form-input font-mono" placeholder="312.50">
                <span class="input-suffix">USDT</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Section 3: Trade Info -->
        <div class="form-section">
          <div class="form-section-title">
            <i data-lucide="users"></i>
            Trade Info
          </div>
          <div class="form-grid">
            <div class="form-group col-12 col-md-6">
              <label for="trade-counterparty" class="form-label">
                <i data-lucide="user"></i> Counterparty (Optional)
              </label>
              <input type="text" id="trade-counterparty" class="form-input" placeholder="Bybit username or real name">
            </div>
            <div class="form-group col-12 col-md-6">
              <label for="trade-payment-method" class="form-label">
                <i data-lucide="credit-card"></i> Payment Method
              </label>
              <select id="trade-payment-method" class="form-select">
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Bybit P2P">Bybit P2P</option>
                <option value="USSD">USSD</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Section 4: Fees (Collapsible) -->
        <div class="form-section">
          <div class="fees-section">
            <div class="fees-header">
              <span class="fees-title">Trading Fees</span>
              <button type="button" class="btn btn-xs btn-outline" id="btn-add-fee-row">
                <i data-lucide="plus"></i> Add Fee
              </button>
            </div>

            <div id="fees-container">
              <div class="fee-row" id="fee_row_0">
                <div class="fee-type-col">
                  <select class="form-select select-sm fee-type-select">
                    <option value="Bank Transfer Fee" selected>Bank Transfer Fee</option>
                    <option value="Bybit P2P Fee">Bybit P2P Fee</option>
                    <option value="Network / Gas Fee">Network / Gas Fee</option>
                    <option value="SMS / Alert Fee">SMS / Alert Fee</option>
                    <option value="Custom">Custom Label...</option>
                  </select>
                  <input type="text" class="form-input select-sm fee-custom-label mt-1 hidden" placeholder="e.g. Stamp Duty">
                </div>
                <div class="fee-amount-col">
                  <div class="input-affix-wrapper">
                    <span class="input-prefix">₦</span>
                    <input type="number" step="0.01" min="0" class="form-input font-mono fee-amount-input" placeholder="0.00" value="0.00">
                  </div>
                </div>
                <button type="button" class="btn-remove-fee" title="Remove Fee" aria-label="Remove Fee">
                  <i data-lucide="trash-2"></i>
                </button>
              </div>
            </div>

            <div class="fee-summary-bar">
              <span class="text-muted fw-semibold">Total Fees:</span>
              <span class="font-mono fw-bold text-warning" id="calculated-total-fees">₦0.00</span>
            </div>
          </div>
        </div>

        <!-- Calculation Summary -->
        <div class="form-section">
          <div class="calculation-summary-card">
            <div class="summary-row">
              <span>Gross <span id="summary-direction-label">Paid</span>:</span>
              <span class="font-mono fw-bold" id="summary-gross-ngn">₦0.00</span>
            </div>
            <div class="summary-row">
              <span>Total Fees:</span>
              <span class="font-mono fw-semibold text-warning" id="summary-total-fees">₦0.00</span>
            </div>
            <div class="summary-row summary-row-total">
              <span class="fw-bold">Effective <span id="summary-effective-label">Cost</span>:</span>
              <span class="font-mono fw-bold text-accent" id="summary-effective-rate">₦0.00 / USDT</span>
            </div>
            <div class="summary-row summary-row-total">
              <span class="fw-bold">Net <span id="summary-net-label">Total</span>:</span>
              <span class="font-mono fw-bold text-accent" id="summary-net-ngn">₦0.00</span>
            </div>
          </div>
        </div>

        <!-- Notes -->
        <div class="form-section">
          <div class="form-group">
            <label for="trade-notes" class="form-label">
              <i data-lucide="file-text"></i> Notes (Optional)
            </label>
            <textarea id="trade-notes" class="form-textarea" rows="2" placeholder="e.g. Quick buy for arbitrage, seller very fast..."></textarea>
          </div>
        </div>

        <!-- Submit & Cancel -->
        <div class="form-actions d-flex gap-2">
          <button type="button" class="btn btn-secondary flex-1" id="btn-form-cancel">
            <i data-lucide="x"></i>
            <span>Cancel</span>
          </button>
          <button type="submit" class="btn btn-primary flex-2" id="btn-submit-trade">
            <i data-lucide="check-circle"></i>
            <span id="btn-submit-label">Save Trade</span>
          </button>
        </div>
      </form>
    </section>
  `;
}
