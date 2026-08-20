/**
 * View: Settings Component
 */
export function renderSettingsView() {
  return `
    <section class="app-view" id="view-settings" data-view="settings">
      <div class="view-header">
        <div>
          <h2 class="view-title">Settings & Data</h2>
          <p class="view-subtitle">Bank accounts, opening inventory, backup, and restore</p>
        </div>
      </div>

      <!-- Opening Inventory Configuration -->
      <div class="card mb-4">
        <div class="card-header-flex">
          <div>
            <h3 class="card-title">Opening USDT Inventory & Cost Basis</h3>
            <p class="card-subtitle">Account for tokens acquired before using this tracker</p>
          </div>
          <div class="metric-icon-box bg-blue-glow">
            <i data-lucide="package"></i>
          </div>
        </div>

        <p class="text-muted small mb-3">
          If you held USDT in your wallet prior to logging trades, set your initial balance and acquisition rate below. The FIFO engine will consume these lots first when calculating Realized P&L on your sell orders.
        </p>

        <form id="form-opening-inventory" class="form-grid">
          <div class="form-group col-12 col-md-6">
            <label for="input-opening-usdt" class="form-label">
              <i data-lucide="coins"></i> Starting USDT Balance
            </label>
            <div class="input-affix-wrapper">
              <span class="input-prefix">$</span>
              <input type="number" step="0.0001" min="0" id="input-opening-usdt" class="form-input font-mono" placeholder="0.00">
              <span class="input-suffix">USDT</span>
            </div>
          </div>

          <div class="form-group col-12 col-md-6">
            <label for="input-opening-cost-basis" class="form-label">
              <i data-lucide="percent"></i> Starting Acquisition Rate
            </label>
            <div class="input-affix-wrapper">
              <span class="input-prefix">₦</span>
              <input type="number" step="0.01" min="0" id="input-opening-cost-basis" class="form-input font-mono" placeholder="0.00">
              <span class="input-suffix">/ USDT</span>
            </div>
          </div>

          <div class="col-12 text-end mt-2">
            <button type="submit" class="btn btn-sm btn-primary" id="btn-save-opening-inventory">
              <i data-lucide="check"></i> Save Opening Balance
            </button>
          </div>
        </form>
      </div>

      <!-- Bank Account Management -->
      <div class="card mb-4">
        <div class="card-header-flex">
          <div>
            <h3 class="card-title">Saved Bank Accounts</h3>
            <p class="card-subtitle">Manage accounts used for Bybit P2P transactions</p>
          </div>
          <button class="btn btn-sm btn-primary" id="btn-open-add-bank-modal">
            <i data-lucide="plus"></i>
            <span>Add Account</span>
          </button>
        </div>

        <div class="bank-accounts-list mt-3" id="bank-accounts-list">
          <div class="empty-state-sm">
            <p class="text-muted">No custom bank accounts configured yet.</p>
          </div>
        </div>
      </div>

      <!-- Wallet Transfers Feature -->
      <div class="card mb-4">
        <div class="card-header-flex">
          <div>
            <h3 class="card-title">Internal Wallet Transfers</h3>
            <p class="card-subtitle">Track transfers between Funding, Spot, and external wallets</p>
          </div>
          <button class="btn btn-sm btn-outline" id="btn-open-transfer-modal">
            <i data-lucide="repeat"></i>
            <span>Log Transfer</span>
          </button>
        </div>
        <div class="transfers-list mt-3" id="transfers-summary-list">
          <p class="text-muted small">Keep track of USDT movements between Bybit Funding, Unified Trading, and external wallets.</p>
        </div>
      </div>

      <!-- Bybit P2P API Integration Card -->
      <div class="card mb-4">
        <div class="card-header-flex">
          <div>
            <h3 class="card-title">Bybit P2P Live Sync</h3>
            <p class="card-subtitle">Connect to Bybit via your local Node.js proxy server</p>
          </div>
          <div class="d-flex align-items-center gap-2">
            <span class="brand-tag" id="proxy-status-badge" style="background: rgba(244, 63, 94, 0.15); color: var(--loss); border-color: transparent;">
              ● <span id="proxy-status-text">Proxy Offline</span>
            </span>
          </div>
        </div>

        <p class="text-muted small mb-3">
          Synchronize your live Bybit Funding Wallet balance directly into your inventory, and import your completed Bybit P2P orders automatically.
        </p>

        <div class="d-flex align-items-center justify-content-between p-3 mb-3" style="background: rgba(10, 16, 28, 0.6); border-radius: var(--radius-md); border: 1px solid rgba(255, 255, 255, 0.06);">
          <div class="d-flex align-items-center gap-2">
            <i data-lucide="wallet" style="color: var(--primary-light);"></i>
            <span class="text-muted small">Live Funding Balance:</span>
          </div>
          <span class="font-mono fw-bold" id="live-funding-balance-text" style="color: var(--text-main);">0.00 USDT</span>
        </div>

        <div class="d-flex flex-wrap gap-2">
          <button class="btn btn-sm btn-outline" id="btn-sync-balance" disabled>
            <i data-lucide="refresh-cw"></i>
            <span>Sync Funding Balance</span>
          </button>
          <button class="btn btn-sm btn-primary" id="btn-import-bybit-trades" disabled>
            <i data-lucide="download-cloud"></i>
            <span>Import Completed Trades</span>
          </button>
        </div>
      </div>

      <!-- Backup & Data Portability -->
      <div class="card mb-4">
        <h3 class="card-title">Data Backup & Restore</h3>
        <p class="card-subtitle mb-3">All your data is stored locally in your browser storage. Export regular backups to prevent data loss.</p>

        <div class="data-actions-grid">
          <div class="data-action-card">
            <div class="d-flex align-items-center gap-3">
              <div class="action-icon-box bg-blue-glow">
                <i data-lucide="file-spreadsheet"></i>
              </div>
              <div>
                <h4 class="action-title">Export Trades to CSV</h4>
                <p class="action-desc">Download tabular report with all fees & P&L for Excel / Sheets</p>
              </div>
            </div>
            <button class="btn btn-outline btn-block mt-3" id="btn-export-csv">
              <i data-lucide="download"></i> Download CSV
            </button>
          </div>

          <div class="data-action-card">
            <div class="d-flex align-items-center gap-3">
              <div class="action-icon-box bg-purple-glow">
                <i data-lucide="file-code"></i>
              </div>
              <div>
                <h4 class="action-title">Full JSON Backup</h4>
                <p class="action-desc">Export entire database (trades, bank accounts, opening inventory)</p>
              </div>
            </div>
            <button class="btn btn-outline btn-block mt-3" id="btn-export-json">
              <i data-lucide="download"></i> Backup JSON
            </button>
          </div>

          <div class="data-action-card">
            <div class="d-flex align-items-center gap-3">
              <div class="action-icon-box bg-emerald-glow">
                <i data-lucide="upload-cloud"></i>
              </div>
              <div>
                <h4 class="action-title">Restore from Backup</h4>
                <p class="action-desc">Import a previous JSON backup file to restore your journal</p>
              </div>
            </div>
            <label class="btn btn-outline btn-block mt-3 cursor-pointer" for="input-import-json">
              <i data-lucide="upload"></i> Select Backup File
            </label>
            <input type="file" id="input-import-json" accept=".json" class="hidden">
          </div>

          <div class="data-action-card border-danger-subtle">
            <div class="d-flex align-items-center gap-3">
              <div class="action-icon-box bg-rose-glow">
                <i data-lucide="alert-triangle" class="text-loss"></i>
              </div>
              <div>
                <h4 class="action-title text-loss">Reset / Clear All Data</h4>
                <p class="action-desc">Permanently wipe all trades, transfers, and accounts from this device</p>
              </div>
            </div>
            <button class="btn btn-danger btn-block mt-3" id="btn-clear-all-data">
              <i data-lucide="trash-2"></i> Wipe All Data
            </button>
          </div>
        </div>
      </div>

      <!-- App Information -->
      <div class="card app-info-card text-center">
        <div class="brand-badge mx-auto mb-2">
          <i data-lucide="arrow-left-right" class="brand-icon"></i>
        </div>
        <h4 class="fw-bold">Bybit NGN P2P Tracker PWA</h4>
        <p class="text-muted small">Version 1.1.0 • FIFO Cost-Basis Engine • Offline Ready</p>
        <div class="pwa-install-container mt-3" id="pwa-install-container">
          <button class="btn btn-sm btn-primary" id="btn-install-pwa">
            <i data-lucide="smartphone"></i> Install as Mobile App
          </button>
        </div>
      </div>
    </section>
  `;
}
