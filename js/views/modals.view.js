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
            <h3 class="modal-title">Assign Bank for Buy Orders</h3>
            <p class="modal-subtitle">Select which bank sent Naira for each trade</p>
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
  `;
}
