/**
 * View: Add & Edit Trade Component
 */
export function renderAddTradeView() {
  return `
    <section class="app-view" id="view-add-trade" data-view="add-trade">
      <div class="view-header">
        <div>
          <h2 class="view-title" id="trade-form-title">Record Trade</h2>
          <p class="view-subtitle">Enter your Bybit USDT/NGN P2P order details</p>
        </div>
      </div>

      <!-- Trade Mode Toggle (Buy vs Sell) -->
      <div class="segmented-control trade-type-selector mb-4" id="trade-type-segmented">
        <button type="button" class="seg-btn active trade-buy-btn" data-type="BUY" id="btn-type-buy">
          <i data-lucide="arrow-down-left"></i>
          <span>Buy USDT (Pay NGN)</span>
        </button>
        <button type="button" class="seg-btn trade-sell-btn" data-type="SELL" id="btn-type-sell">
          <i data-lucide="arrow-up-right"></i>
          <span>Sell USDT (Receive NGN)</span>
        </button>
      </div>

      <!-- Trade Entry Form -->
      <form class="trade-form card" id="form-trade" novalidate>
        <input type="hidden" id="trade-id" value="">
        <input type="hidden" id="trade-direction" value="BUY">

        <div class="form-grid">
          <!-- Date & Time -->
          <div class="form-group col-12 col-md-6">
            <label for="trade-date" class="form-label">
              <i data-lucide="calendar"></i> Date & Time
            </label>
            <input type="datetime-local" id="trade-date" class="form-input" required>
          </div>

          <!-- Bank Account Selection -->
          <div class="form-group col-12 col-md-6">
            <label for="trade-bank-account" class="form-label">
              <i data-lucide="landmark"></i> Bank Account Used
            </label>
            <div class="select-with-add">
              <select id="trade-bank-account" class="form-select" required>
                <option value="" disabled selected>Select Bank Account</option>
                <option value="default_opay">OPay (•••• 1234)</option>
                <option value="default_kuda">Kuda Bank (•••• 5678)</option>
                <option value="default_gtb">GTBank (•••• 9012)</option>
              </select>
              <button type="button" class="btn btn-secondary btn-icon-only" id="btn-quick-add-bank" title="Add New Bank Account">
                <i data-lucide="plus"></i>
              </button>
            </div>
          </div>

          <!-- Rate (₦/USDT) -->
          <div class="form-group col-12 col-md-4">
            <label for="trade-rate" class="form-label">
              <i data-lucide="percent"></i> Rate (₦ / 1 USDT)
            </label>
            <div class="input-affix-wrapper">
              <span class="input-prefix">₦</span>
              <input type="number" step="0.01" min="0.01" id="trade-rate" class="form-input font-mono" placeholder="1450.00" required>
            </div>
          </div>

          <!-- Amount NGN -->
          <div class="form-group col-12 col-md-4">
            <label for="trade-ngn-amount" class="form-label" id="label-ngn-amount">
              <i data-lucide="banknote"></i> NGN Amount Paid
            </label>
            <div class="input-affix-wrapper">
              <span class="input-prefix">₦</span>
              <input type="number" step="0.01" min="0.01" id="trade-ngn-amount" class="form-input font-mono" placeholder="100,000.00" required>
            </div>
          </div>

          <!-- Amount USDT (Auto Calculated or manual) -->
          <div class="form-group col-12 col-md-4">
            <label for="trade-usdt-amount" class="form-label" id="label-usdt-amount">
              <i data-lucide="coins"></i> USDT Expected
            </label>
            <div class="input-affix-wrapper">
              <span class="input-prefix">$</span>
              <input type="number" step="0.0001" min="0.0001" id="trade-usdt-amount" class="form-input font-mono highlight-input" placeholder="68.96" required>
              <span class="input-suffix">USDT</span>
            </div>
          </div>

          <!-- Counterparty Name / Bybit Nickname -->
          <div class="form-group col-12 col-md-6">
            <label for="trade-counterparty" class="form-label">
              <i data-lucide="user"></i> Counterparty / Merchant Nickname
            </label>
            <input type="text" id="trade-counterparty" class="form-input" placeholder="e.g. BybitProTrader99">
          </div>

          <!-- Payment Method -->
          <div class="form-group col-12 col-md-6">
            <label for="trade-payment-method" class="form-label">
              <i data-lucide="credit-card"></i> Payment Method
            </label>
            <select id="trade-payment-method" class="form-select">
              <option value="Bank Transfer" selected>Bank Transfer</option>
              <option value="OPay">OPay</option>
              <option value="Palmpay">Palmpay</option>
              <option value="Kuda">Kuda Bank</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        <!-- Dynamic Fees Section -->
        <div class="fees-section mt-4">
          <div class="fees-header">
            <div class="d-flex align-items-center gap-2">
              <i data-lucide="receipt" class="text-warning"></i>
              <h4 class="fees-title">Fees Breakdown</h4>
            </div>
            <button type="button" class="btn btn-xs btn-outline" id="btn-add-fee-row">
              <i data-lucide="plus"></i> Add Fee Row
            </button>
          </div>

          <div class="fees-list" id="fees-container">
            <!-- Default fee row: Bank Transfer fee -->
            <div class="fee-row" data-fee-index="0">
              <div class="fee-type-col">
                <select class="form-select fee-type-select">
                  <option value="Bank Transfer Fee" selected>Bank Transfer Fee</option>
                  <option value="Bybit P2P Fee">Bybit P2P Fee</option>
                  <option value="Network / Gas Fee">Network / Gas Fee</option>
                  <option value="SMS / Alert Fee">SMS / Alert Fee</option>
                  <option value="Custom">Custom Label...</option>
                </select>
                <input type="text" class="form-input fee-custom-label mt-1 hidden" placeholder="Fee description">
              </div>
              <div class="fee-amount-col">
                <div class="input-affix-wrapper">
                  <span class="input-prefix">₦</span>
                  <input type="number" step="0.01" min="0" class="form-input font-mono fee-amount-input" placeholder="0.00" value="0.00">
                </div>
              </div>
              <button type="button" class="btn-icon btn-remove-fee" title="Remove Fee" aria-label="Remove Fee">
                <i data-lucide="trash-2"></i>
              </button>
            </div>
          </div>

          <div class="fee-summary-bar">
            <span class="text-muted">Total Trade Fees:</span>
            <span class="font-mono text-warning fw-bold" id="calculated-total-fees">₦0.00</span>
          </div>
        </div>

        <!-- Trade Calculation Breakdown Box -->
        <div class="calculation-summary-card mt-4">
          <div class="summary-row">
            <span class="summary-label">Effective Rate (including fees):</span>
            <span class="summary-value font-mono" id="summary-effective-rate">₦0.00 / USDT</span>
          </div>
          <div class="summary-row summary-row-total">
            <span class="summary-label" id="summary-net-label">Net Total Cost:</span>
            <span class="summary-value font-mono fw-bold text-accent" id="summary-net-amount">₦0.00</span>
          </div>
        </div>

        <!-- Notes -->
        <div class="form-group mt-3">
          <label for="trade-notes" class="form-label">
            <i data-lucide="file-text"></i> Trade Notes & Reference (Optional)
          </label>
          <textarea id="trade-notes" class="form-textarea" rows="2" placeholder="Order ID, reference number, or special trade notes..."></textarea>
        </div>

        <!-- Form Actions -->
        <div class="form-actions mt-4">
          <button type="button" class="btn btn-secondary hidden" id="btn-cancel-edit">Cancel Edit</button>
          <button type="submit" class="btn btn-primary btn-block" id="btn-save-trade">
            <i data-lucide="check-circle-2"></i>
            <span id="btn-save-trade-text">Record Trade</span>
          </button>
        </div>
      </form>
    </section>
  `;
}
