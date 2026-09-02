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
              <p class="card-subtitle">Connect via local Node.js proxy or Vercel serverless</p>
            </div>
            <span class="proxy-status-chip proxy-offline" id="proxy-status-badge">
              ● <span id="proxy-status-text">Proxy Offline</span>
            </span>
          </div>

          <p class="text-muted small mb-3">Configure your proxy endpoint and authorization token to securely synchronize Bybit balances and order history.</p>

          <!-- Proxy Settings Form -->
          <div class="form-grid mb-4" style="background: rgba(10, 16, 28, 0.4); padding: 1rem; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.06);">
            <div class="form-group col-12 col-md-6 mb-2">
              <label for="input-proxy-url" class="form-label small">
                <i data-lucide="server"></i> Proxy URL (Optional)
              </label>
              <input type="text" id="input-proxy-url" class="form-input font-mono form-input-sm" placeholder="http://localhost:3000" value="${(typeof localStorage !== 'undefined' && localStorage.getItem('bybit_p2p_proxy_url')) || ''}" onchange="localStorage.setItem('bybit_p2p_proxy_url', this.value.trim())">
              <p class="form-hint small text-muted">Defaults to current host or http://localhost:3000.</p>
            </div>

            <div class="form-group col-12 col-md-6 mb-2">
              <label for="input-proxy-token" class="form-label small">
                <i data-lucide="key"></i> Proxy Auth Token
              </label>
              <div class="input-affix-wrapper">
                <input type="password" id="input-proxy-token" class="form-input font-mono form-input-sm" placeholder="Bearer / Proxy Secret" value="${(typeof localStorage !== 'undefined' && localStorage.getItem('bybit_p2p_proxy_token')) || ''}" onchange="localStorage.setItem('bybit_p2p_proxy_token', this.value.trim())">
                <button type="button" class="btn btn-sm btn-outline" id="btn-toggle-proxy-token" style="padding: 0 0.5rem;" onclick="const inp=document.getElementById('input-proxy-token'); inp.type = inp.type==='password'?'text':'password';">
                  👁️
                </button>
              </div>
              <p class="form-hint small text-muted">Must match PROXY_AUTH_TOKEN configured on server.</p>
            </div>

            <div class="col-12 text-end mt-1">
              <button type="button" class="btn btn-sm btn-primary" id="btn-save-proxy-config" onclick="const u=document.getElementById('input-proxy-url')?.value.trim(); const t=document.getElementById('input-proxy-token')?.value.trim(); if(u!==undefined)localStorage.setItem('bybit_p2p_proxy_url', u); if(t!==undefined)localStorage.setItem('bybit_p2p_proxy_token', t); if(window.showToast) window.showToast('Proxy settings saved successfully!', 'success');">
                <i data-lucide="save"></i>
                <span>Save Proxy Settings</span>
              </button>
            </div>
          </div>

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
        <!-- Trading Fee Defaults & Arbitrage Parameters -->
        <div class="card mb-4">
          <div class="card-header-flex mb-3">
            <div>
              <h3 class="card-title">Trading Fee Defaults & Arbitrage Parameters</h3>
              <p class="card-subtitle">Global defaults applied across Pricing Assistant & calculations</p>
            </div>
            <div class="metric-icon-box warning-tint">
              <i data-lucide="percent"></i>
            </div>
          </div>

          <p class="text-muted small mb-3">
            Configure your standard Bybit P2P platform maker fee percentage and local fiat bank transfer fees.
            These defaults populate the Pricing Assistant and profit estimators.
          </p>

          <form id="form-fee-defaults" class="form-grid">
            <div class="form-group col-12 col-md-4">
              <label for="input-setting-platform-fee" class="form-label">
                <i data-lucide="shield-alert"></i> Platform Maker Fee (%)
              </label>
              <div class="input-affix-wrapper">
                <input type="number" step="0.01" min="0" max="10" id="input-setting-platform-fee" class="form-input font-mono" value="0.30" required>
                <span class="input-suffix">%</span>
              </div>
              <p class="form-helper">Bybit P2P maker fee (0.30% standard)</p>
            </div>

            <div class="form-group col-12 col-md-4">
              <label for="input-setting-inflow-fee" class="form-label">
                <i data-lucide="arrow-down-left"></i> Inflow Stamp Duty (₦)
              </label>
              <div class="input-affix-wrapper">
                <span class="input-prefix">₦</span>
                <input type="number" step="1" min="0" id="input-setting-inflow-fee" class="form-input font-mono" value="50" required>
                <span class="input-suffix">NGN</span>
              </div>
              <p class="form-helper">₦50 stamp duty on buy transfers > ₦10,000</p>
            </div>

            <div class="form-group col-12 col-md-4">
              <label for="input-setting-outflow-fee" class="form-label">
                <i data-lucide="arrow-up-right"></i> Outflow Fiat Fee (₦)
              </label>
              <div class="input-affix-wrapper">
                <span class="input-prefix">₦</span>
                <input type="number" step="1" min="0" id="input-setting-outflow-fee" class="form-input font-mono" value="0" required>
                <span class="input-suffix">NGN</span>
              </div>
              <p class="form-helper">₦0 fee when receiving Naira on sell trades</p>
            </div>

            <div class="form-group col-12 col-md-6">
              <label for="input-setting-target-spread" class="form-label">
                <i data-lucide="target"></i> Target Spread (₦)
              </label>
              <div class="input-affix-wrapper">
                <span class="input-prefix">₦</span>
                <input type="number" step="0.1" min="0.1" id="input-setting-target-spread" class="form-input font-mono" value="5.0" required>
                <span class="input-suffix">/ USDT</span>
              </div>
              <p class="form-helper">Baseline net spread per USDT transacted</p>
            </div>

            <div class="form-group col-12 col-md-6">
              <label for="input-setting-target-volume" class="form-label">
                <i data-lucide="coins"></i> Target Volume (USDT)
              </label>
              <div class="input-affix-wrapper">
                <span class="input-prefix">$</span>
                <input type="number" step="1" min="1" id="input-setting-target-volume" class="form-input font-mono" value="100" required>
                <span class="input-suffix">USDT</span>
              </div>
              <p class="form-helper">Standard order batch size for fee amortization</p>
            </div>

            <div class="col-12 text-end mt-2">
              <button type="submit" class="btn btn-sm btn-primary" id="btn-save-fee-defaults">
                <i data-lucide="check"></i> Save Fee Defaults
              </button>
            </div>
          </form>
        </div>

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
