/**
 * View: Settings Component — Redesigned v2.0
 * Tab-based layout: Accounts, Bybit Sync, Data
 */
export function renderSettingsView() {
  return `
    <section class="app-view" id="view-settings" data-view="settings">
      <div class="view-header">
        <div>
          <h2 class="view-title">Settings</h2>
          <p class="view-subtitle">Accounts, sync, and data management</p>
        </div>
      </div>

      <!-- Settings Sub-Tabs -->
      <div class="settings-tabs" id="settings-tabs">
        <button class="settings-tab-btn active" data-settings-tab="accounts">Accounts</button>
        <button class="settings-tab-btn" data-settings-tab="bybit-sync">Bybit Sync</button>
        <button class="settings-tab-btn" data-settings-tab="data">Data</button>
      </div>

      <!-- Tab: Accounts -->
      <div class="settings-tab-panel active" data-settings-panel="accounts">
        <!-- Bank Accounts -->
        <div class="card mb-4">
          <div class="card-header-flex mb-3">
            <div>
              <h3 class="card-title">Bank Accounts</h3>
              <p class="card-subtitle">Manage accounts for P2P transactions</p>
            </div>
            <button class="btn btn-sm btn-primary" id="btn-open-add-bank-modal">
              <i data-lucide="plus"></i>
              <span>Add</span>
            </button>
          </div>
          <div id="bank-accounts-list">
            <div class="empty-state-sm">
              <p class="text-muted small">No bank accounts configured.</p>
            </div>
          </div>
        </div>

         <!-- Transfers Log -->
         <div class="card mb-4">
           <div class="card-header-flex mb-3">
             <div>
               <h3 class="card-title">Transfers Log</h3>
               <p class="card-subtitle">Track movements of USDT (Wallets) or Naira (Banks)</p>
             </div>
             <div class="d-flex gap-2">
               <button class="btn btn-sm btn-outline" id="btn-open-transfer-modal">
                 <i data-lucide="repeat"></i>
                 <span>Log USDT</span>
               </button>
               <button class="btn btn-sm btn-primary" id="btn-open-bank-transfer-modal">
                 <i data-lucide="landmark"></i>
                 <span>Log Naira</span>
               </button>
             </div>
           </div>
           <div id="transfers-summary-list">
             <p class="text-muted small">No transfers logged yet.</p>
           </div>
         </div>
      </div>

      <!-- Tab: Bybit Sync -->
      <div class="settings-tab-panel" data-settings-panel="bybit-sync">
        <div class="card mb-4">
          <div class="card-header-flex mb-3">
            <div>
              <h3 class="card-title">Bybit P2P Live Sync</h3>
              <p class="card-subtitle">Connect via local Node.js proxy</p>
            </div>
            <span class="proxy-status-chip proxy-offline" id="proxy-status-badge">
              ● <span id="proxy-status-text">Proxy Offline</span>
            </span>
          </div>

          <p class="text-muted small mb-3">Read-only view of your Bybit wallet and active ads.</p>

          <div class="balance-grid mb-3">
            <div class="balance-cell">
              <span class="balance-cell-label">P2P Balance</span>
              <span class="balance-cell-value text-accent" id="settings-total-usdt">— USDT</span>
            </div>
            <div class="balance-cell">
              <span class="balance-cell-label">In Active Ad</span>
              <span class="balance-cell-value text-success" id="settings-locked-usdt">— USDT</span>
            </div>
            <div class="balance-cell">
              <span class="balance-cell-label">Free for Buyback</span>
              <span class="balance-cell-value" id="settings-free-usdt">— USDT</span>
            </div>
          </div>

          <div class="d-flex flex-wrap gap-2">
            <button class="btn btn-sm btn-outline" id="btn-sync-balance" disabled>
              <i data-lucide="refresh-cw"></i>
              <span>Sync Holdings</span>
            </button>
            <button class="btn btn-sm btn-primary" id="btn-import-bybit-trades" disabled>
              <i data-lucide="download-cloud"></i>
              <span>Import Trades</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Tab: Data -->
      <div class="settings-tab-panel" data-settings-panel="data">
        <!-- Opening Inventory -->
        <div class="card mb-4">
          <div class="card-header-flex mb-3">
            <div>
              <h3 class="card-title">Opening USDT Inventory</h3>
              <p class="card-subtitle">Pre-existing tokens for FIFO calculation</p>
            </div>
            <div class="metric-icon-box primary-tint">
              <i data-lucide="package"></i>
            </div>
          </div>

          <p class="text-muted small mb-3">
            If you held USDT before using this tracker, set your initial balance and rate.
            The FIFO engine will use these lots first when calculating P&L.
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
                <i data-lucide="percent"></i> Acquisition Rate
              </label>
              <div class="input-affix-wrapper">
                <span class="input-prefix">₦</span>
                <input type="number" step="0.01" min="0" id="input-opening-cost-basis" class="form-input font-mono" placeholder="0.00">
                <span class="input-suffix">/ USDT</span>
              </div>
            </div>
            <div class="col-12 text-end mt-2">
              <button type="submit" class="btn btn-sm btn-primary" id="btn-save-opening-inventory">
                <i data-lucide="check"></i> Save
              </button>
            </div>
          </form>
        </div>

        <!-- Export & Backup -->
        <div class="card mb-4">
          <h3 class="card-title mb-1">Data Backup & Restore</h3>
          <p class="card-subtitle mb-4">All data stored locally. Export regular backups.</p>

          <div class="data-actions-grid">
            <div class="data-action-card">
              <div class="d-flex align-items-center gap-3">
                <div class="action-icon-box primary-tint">
                  <i data-lucide="file-spreadsheet"></i>
                </div>
                <div>
                  <h4 class="action-title">Export CSV</h4>
                  <p class="action-desc">Trades with fees & P&L</p>
                </div>
              </div>
              <button class="btn btn-outline btn-block mt-3" id="btn-export-csv">
                <i data-lucide="download"></i> Download
              </button>
            </div>

            <div class="data-action-card">
              <div class="d-flex align-items-center gap-3">
                <div class="action-icon-box info-tint">
                  <i data-lucide="file-code"></i>
                </div>
                <div>
                  <h4 class="action-title">JSON Backup</h4>
                  <p class="action-desc">Full database export</p>
                </div>
              </div>
              <button class="btn btn-outline btn-block mt-3" id="btn-export-json">
                <i data-lucide="download"></i> Backup
              </button>
            </div>

            <div class="data-action-card">
              <div class="d-flex align-items-center gap-3">
                <div class="action-icon-box success-tint">
                  <i data-lucide="upload-cloud"></i>
                </div>
                <div>
                  <h4 class="action-title">Restore</h4>
                  <p class="action-desc">Import JSON backup</p>
                </div>
              </div>
              <label class="btn btn-outline btn-block mt-3 cursor-pointer" for="input-import-json">
                <i data-lucide="upload"></i> Select File
              </label>
              <input type="file" id="input-import-json" accept=".json" class="hidden">
            </div>

            <div class="data-action-card border-danger-subtle">
              <div class="d-flex align-items-center gap-3">
                <div class="action-icon-box danger-tint">
                  <i data-lucide="alert-triangle"></i>
                </div>
                <div>
                  <h4 class="action-title text-danger">Reset All Data</h4>
                  <p class="action-desc">Permanently wipe everything</p>
                </div>
              </div>
              <button class="btn btn-danger btn-block mt-3" id="btn-clear-all-data">
                <i data-lucide="trash-2"></i> Wipe Data
              </button>
            </div>
          </div>
        </div>

        <!-- App Info -->
        <div class="card app-info-card">
          <div class="brand-badge mx-auto mb-2">
            <i data-lucide="arrow-left-right" class="brand-icon"></i>
          </div>
          <h4 class="fw-bold">Bybit NGN P2P Tracker</h4>
          <p class="text-muted small">v2.0 • FIFO Engine • PWA</p>
          <div class="mt-3" id="pwa-install-container">
            <button class="btn btn-sm btn-primary" id="btn-install-pwa">
              <i data-lucide="smartphone"></i> Install App
            </button>
          </div>
        </div>
      </div>
    </section>
  `;
}
