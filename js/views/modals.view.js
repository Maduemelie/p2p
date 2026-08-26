/**
 * View: Modals Component — Redesigned v2.0
 */
export function renderModalsView() {
  return `
    <!-- Modal: Add Bank Account -->
    <div class="modal-backdrop hidden" id="modal-bank-backdrop">
      <div class="modal-card">
        <div class="modal-header">
          <h3 class="modal-title">Add Bank Account</h3>
          <button class="btn-icon" id="btn-close-bank-modal" aria-label="Close">
            <i data-lucide="x"></i>
          </button>
        </div>
        <form id="form-add-bank" class="modal-body">
          <div class="form-group mb-3">
            <label for="bank-name-input" class="form-label">Bank Name</label>
            <input type="text" id="bank-name-input" class="form-input" placeholder="e.g. OPay, GTBank, Kuda" required>
          </div>
          <div class="form-group mb-3">
            <label for="bank-account-last4" class="form-label">Account Number (Last 4 Digits)</label>
            <input type="text" id="bank-account-last4" class="form-input font-mono" placeholder="e.g. 5678" maxlength="10" required>
          </div>
          <div class="form-group mb-3">
            <label for="bank-alias-input" class="form-label">Label / Alias (Optional)</label>
            <input type="text" id="bank-alias-input" class="form-input" placeholder="e.g. Main Trading Account">
          </div>
          <div class="form-group mb-3">
            <label for="bank-balance-input" class="form-label">Starting Cash Balance (₦)</label>
            <div class="input-affix-wrapper">
              <span class="input-prefix">₦</span>
              <input type="number" step="0.01" min="0" id="bank-balance-input" class="form-input font-mono" placeholder="0.00">
            </div>
            <p class="form-helper">Balance auto-updates with P2P buys, sells, and fees.</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="btn-cancel-bank-modal">Cancel</button>
            <button type="submit" class="btn btn-primary">Save Account</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Modal: Log Wallet Transfer -->
    <div class="modal-backdrop hidden" id="modal-transfer-backdrop">
      <div class="modal-card">
        <div class="modal-header">
          <h3 class="modal-title">Log Wallet Transfer</h3>
          <button class="btn-icon" id="btn-close-transfer-modal" aria-label="Close">
            <i data-lucide="x"></i>
          </button>
        </div>
        <form id="form-log-transfer" class="modal-body">
          <div class="form-group mb-3">
            <label for="transfer-date" class="form-label">
              <i data-lucide="calendar"></i> Date & Time
            </label>
            <input type="datetime-local" id="transfer-date" class="form-input" required>
          </div>

          <div class="form-grid mb-3">
            <div class="form-group col-12 col-md-6">
              <label for="transfer-from" class="form-label">
                <i data-lucide="arrow-up-right"></i> From Wallet
              </label>
              <select id="transfer-from" class="form-select" required>
                <option value="Bybit Funding" selected>Bybit Funding</option>
                <option value="Bybit Unified Trading">Bybit Unified Trading</option>
                <option value="Bybit Spot">Bybit Spot</option>
                <option value="External / On-chain">External Wallet</option>
              </select>
            </div>
            <div class="form-group col-12 col-md-6">
              <label for="transfer-to" class="form-label">
                <i data-lucide="arrow-down-left"></i> To Wallet
              </label>
              <select id="transfer-to" class="form-select" required>
                <option value="Bybit Unified Trading" selected>Bybit Unified Trading</option>
                <option value="Bybit Funding">Bybit Funding</option>
                <option value="Bybit Spot">Bybit Spot</option>
                <option value="External / On-chain">External Wallet</option>
              </select>
            </div>
          </div>

          <div class="form-grid mb-3">
            <div class="form-group col-12 col-md-6">
              <label for="transfer-amount" class="form-label">
                <i data-lucide="coins"></i> USDT Amount
              </label>
              <div class="input-affix-wrapper">
                <span class="input-prefix">$</span>
                <input type="number" step="0.0001" min="0.0001" id="transfer-amount" class="form-input font-mono" placeholder="100.00" required>
                <span class="input-suffix">USDT</span>
              </div>
            </div>
            <div class="form-group col-12 col-md-6">
              <label for="transfer-fee" class="form-label">
                <i data-lucide="receipt"></i> Gas Fee (USDT)
              </label>
              <div class="input-affix-wrapper">
                <span class="input-prefix">$</span>
                <input type="number" step="0.0001" min="0" id="transfer-fee" class="form-input font-mono" placeholder="0.00" value="0.00">
                <span class="input-suffix">USDT</span>
              </div>
            </div>
          </div>

          <div class="form-group mb-3">
            <label for="transfer-notes" class="form-label">
              <i data-lucide="file-text"></i> Notes (Optional)
            </label>
            <input type="text" id="transfer-notes" class="form-input" placeholder="e.g. TRC20 transfer">
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="btn-cancel-transfer-modal">Cancel</button>
            <button type="submit" class="btn btn-primary">Save Transfer</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Modal: Assign Banks for Imported Orders -->
    <div class="modal-backdrop hidden" id="modal-assign-banks-backdrop">
      <div class="modal-card">
        <div class="modal-header">
          <div>
            <h3 class="modal-title">Assign Bank Accounts for Imported Orders</h3>
            <p class="modal-subtitle">Select bank accounts for cash outflows (BUY) and cash inflows (SELL)</p>
          </div>
          <button class="btn-icon" id="btn-close-assign-banks-modal" aria-label="Close">
            <i data-lucide="x"></i>
          </button>
        </div>
        <form id="form-assign-banks" class="modal-body">
          <div id="assign-banks-items-list" class="d-flex flex-column gap-3 mb-3 overflow-hidden" style="max-height: 380px; overflow-y: auto;"></div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="btn-cancel-assign-banks">Cancel</button>
            <button type="submit" class="btn btn-primary" id="btn-confirm-assign-banks">
              <i data-lucide="check"></i> Confirm & Save
            </button>
          </div>
        </form>
      </div>
    </div>
    <!-- Modal: Log Bank Transfer -->
    <div class="modal-backdrop hidden" id="modal-bank-transfer-backdrop">
      <div class="modal-card">
        <div class="modal-header">
          <h3 class="modal-title">Log Bank Transfer</h3>
          <button class="btn-icon" id="btn-close-bank-transfer-modal" aria-label="Close">
            <i data-lucide="x"></i>
          </button>
        </div>
        <form id="form-log-bank-transfer" class="modal-body">
          <div class="form-group mb-3">
            <label for="bank-transfer-date" class="form-label">
              <i data-lucide="calendar"></i> Date & Time
            </label>
            <input type="datetime-local" id="bank-transfer-date" class="form-input" required>
          </div>

          <div class="form-grid mb-3">
            <div class="form-group col-12 col-md-6">
              <label for="bank-transfer-from" class="form-label">
                <i data-lucide="arrow-up-right"></i> From Account
              </label>
              <select id="bank-transfer-from" class="form-select" required>
                <option value="" disabled selected>Select Source Bank</option>
              </select>
            </div>
            <div class="form-group col-12 col-md-6">
              <label for="bank-transfer-to" class="form-label">
                <i data-lucide="arrow-down-left"></i> To Account
              </label>
              <select id="bank-transfer-to" class="form-select" required>
                <option value="" disabled selected>Select Destination Bank</option>
              </select>
            </div>
          </div>

          <div class="form-grid mb-3">
            <div class="form-group col-12 col-md-6">
              <label for="bank-transfer-amount" class="form-label">
                <i data-lucide="banknote"></i> Naira Amount
              </label>
              <div class="input-affix-wrapper">
                <span class="input-prefix">₦</span>
                <input type="number" step="0.01" min="0.01" id="bank-transfer-amount" class="form-input font-mono" placeholder="50,000.00" required>
              </div>
            </div>
            <div class="form-group col-12 col-md-6">
              <label for="bank-transfer-fee" class="form-label">
                <i data-lucide="receipt"></i> Transfer Fee
              </label>
              <div class="input-affix-wrapper">
                <span class="input-prefix">₦</span>
                <input type="number" step="0.01" min="0" id="bank-transfer-fee" class="form-input font-mono" placeholder="10.00" value="10.00">
              </div>
            </div>
          </div>

          <div class="form-group mb-3">
            <label for="bank-transfer-notes" class="form-label">
              <i data-lucide="file-text"></i> Notes (Optional)
            </label>
            <input type="text" id="bank-transfer-notes" class="form-input" placeholder="e.g. Funding new trading account">
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="btn-cancel-bank-transfer-modal">Cancel</button>
            <button type="submit" class="btn btn-primary">Save Transfer</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Modal: End Day / Save Net Worth Snapshot (Milestone 3) -->
    <div class="modal-backdrop hidden" id="modal-snapshot-backdrop" role="dialog" aria-modal="true" aria-labelledby="snapshot-modal-title">
      <div class="modal-card modal-card-lg">
        
        <!-- Modal Header -->
        <div class="modal-header">
          <div class="modal-header-content">
            <div class="d-flex align-items-center gap-2">
              <div class="modal-icon-badge primary-tint">
                <i data-lucide="camera"></i>
              </div>
              <h3 class="modal-title" id="snapshot-modal-title">End Day / Save Net Worth Snapshot</h3>
            </div>
            <p class="modal-subtitle">Capture end-of-day portfolio balance and valuation for historical tracking</p>
          </div>
          <button type="button" class="btn-icon" id="btn-close-snapshot-modal" aria-label="Close snapshot modal">
            <i data-lucide="x"></i>
          </button>
        </div>

        <!-- Snapshot Form -->
        <form id="form-save-snapshot" class="modal-body">
          
          <!-- Hidden inputs for raw numeric precision and calculation tracking -->
          <input type="hidden" id="snapshot-bank-cash-raw" name="bankCashRaw" value="0">
          <input type="hidden" id="snapshot-usdt-balance-raw" name="usdtBalanceRaw" value="0">
          <input type="hidden" id="snapshot-calculated-ngn-raw" name="netWorthNgnRaw" value="0">
          <input type="hidden" id="snapshot-calculated-usdt-raw" name="netWorthUsdtRaw" value="0">

          <!-- Section 1: Live Balances Summary Stat Cards -->
          <div class="form-section pb-3 mb-3">
            <div class="form-section-title">
              <i data-lucide="pie-chart"></i>
              <span>Live Balances to Capture</span>
            </div>
            
            <div class="snapshot-stats-grid">
              <!-- Stat Card 1: Bank Cash -->
              <div class="snapshot-stat-card bank-stat-card" id="card-snapshot-bank-cash">
                <div class="stat-card-header">
                  <span class="stat-card-label">Live Bank Cash</span>
                  <div class="stat-icon-wrapper success-tint">
                    <i data-lucide="landmark"></i>
                  </div>
                </div>
                <div class="stat-card-value font-mono text-success" id="snapshot-bank-cash" data-raw-value="0">₦0.00</div>
                <div class="stat-card-meta text-muted">Sum of reactive bank accounts</div>
              </div>

              <!-- Stat Card 2: Bybit USDT Balance -->
              <div class="snapshot-stat-card usdt-stat-card" id="card-snapshot-usdt-balance">
                <div class="stat-card-header">
                  <span class="stat-card-label">Bybit USDT Balance</span>
                  <div class="stat-icon-wrapper primary-tint">
                    <i data-lucide="wallet"></i>
                  </div>
                </div>
                <div class="stat-card-value font-mono text-accent" id="snapshot-usdt-balance" data-raw-value="0">0.00 USDT</div>
                <div class="stat-card-meta text-muted">Active ads + Free funding balance</div>
              </div>
            </div>
          </div>

          <!-- Section 2: Valuation Parameters & Reference Exchange Rate -->
          <div class="form-section pb-3 mb-3">
            <div class="form-section-title">
              <i data-lucide="sliders"></i>
              <span>Snapshot Valuation Parameters</span>
            </div>

            <!-- Snapshot Date & Time (Editable / Pre-filled) -->
            <div class="form-group mb-3">
              <label for="snapshot-date" class="form-label">
                <i data-lucide="calendar"></i>
                <span>Snapshot Date & Time</span>
              </label>
              <input 
                type="datetime-local" 
                id="snapshot-date" 
                name="snapshotDate" 
                class="form-input font-mono" 
                required
                aria-describedby="snapshot-date-helper"
              >
              <span class="form-helper" id="snapshot-date-helper">Timestamp recorded for chronological performance charting</span>
            </div>

            <!-- Reference Exchange Rate Input -->
            <div class="form-group mb-3">
              <div class="d-flex justify-content-between align-items-center mb-1">
                <label for="input-snapshot-ref-rate" class="form-label mb-0">
                  <i data-lucide="trending-up"></i>
                  <span>Reference Exchange Rate</span>
                </label>
                <span class="badge badge-neutral tiny" id="snapshot-rate-source-badge">Active Ad Rate</span>
              </div>
              <div class="input-affix-wrapper">
                <span class="input-prefix">₦</span>
                <input 
                  type="number" 
                  step="any" 
                  min="0.01" 
                  id="input-snapshot-ref-rate" 
                  name="referenceRate" 
                  class="form-input font-mono font-bold" 
                  placeholder="1500.00" 
                  required 
                  autocomplete="off"
                  aria-describedby="snapshot-rate-helper"
                >
                <span class="input-suffix">/ USDT</span>
              </div>
              <p class="form-helper" id="snapshot-rate-helper">
                Exchange rate applied to convert USDT assets into NGN valuation and vice versa.
              </p>
              <div id="snapshot-rate-warning" class="text-danger small mt-1 hidden"></div>
            </div>
          </div>

          <!-- Section 3: Live Recalculated Net Worth Preview Banner -->
          <div class="snapshot-preview-banner mb-3" id="snapshot-preview-container" role="region" aria-label="Recalculated Net Worth Preview">
            <div class="preview-banner-header">
              <div class="d-flex align-items-center gap-2">
                <div class="preview-badge-icon">
                  <i data-lucide="calculator"></i>
                </div>
                <span class="preview-banner-title">Calculated Net Worth Preview</span>
              </div>
              <span class="badge badge-primary tiny">Live Recalculation</span>
            </div>

            <div class="preview-banner-body">
              <div class="preview-metric-row">
                <!-- NGN Preview -->
                <div class="preview-metric-item">
                  <span class="preview-metric-label">Total Naira Valuation (NGN)</span>
                  <div class="preview-metric-value font-mono text-success" id="snapshot-preview-networth-ngn" aria-live="polite">₦0.00</div>
                  <span class="preview-formula-hint text-muted tiny">Bank Cash + (USDT × Rate)</span>
                </div>
                <div class="preview-metric-divider"></div>
                <!-- USDT Preview -->
                <div class="preview-metric-item">
                  <span class="preview-metric-label">USDT Equivalent</span>
                  <div class="preview-metric-value font-mono text-accent" id="snapshot-preview-networth-usdt" aria-live="polite">0.00 USDT</div>
                  <span class="preview-formula-hint text-muted tiny">USDT + (Bank Cash / Rate)</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Section 4: Optional Notes Field -->
          <div class="form-group mb-4">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <label for="input-snapshot-notes" class="form-label mb-0">
                <i data-lucide="file-text"></i>
                <span>Snapshot Notes (Optional)</span>
              </label>
              <span class="text-muted tiny" id="snapshot-notes-counter">0 / 500</span>
            </div>
            <textarea 
              id="input-snapshot-notes" 
              name="notes" 
              class="form-textarea" 
              maxlength="500" 
              rows="2" 
              placeholder="e.g. End of daily trading session. Completed all P2P buy orders."
              aria-label="Snapshot notes"
            ></textarea>
            <p class="form-helper">Record operational notes, daily trading milestones, or market conditions.</p>
          </div>

          <!-- Modal Footer / Action Buttons -->
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="btn-cancel-snapshot-modal">
              <i data-lucide="x"></i>
              <span>Cancel</span>
            </button>
            <button type="submit" class="btn btn-primary" id="btn-save-snapshot-submit">
              <i data-lucide="check"></i>
              <span>Save Snapshot</span>
            </button>
          </div>

        </form>
      </div>
    </div>
  `;
}
