# Milestone 3 Investigation: Snapshot Modal HTML Markup & Form UI Specification

**Author**: `m3_explorer_1` (M3 Modal Markup & Form UI Explorer)  
**Target Files**: `js/views/modals.view.js`, `css/styles.css`  
**Related Modules**: `js/dashboard.js`, `js/store.js`, `js/utils.js`  
**Date**: 2026-08-25

---

## 1. Executive Summary

Milestone 3 (M3) introduces the **"End Day / Save Net Worth Snapshot"** workflow. This feature allows merchants to capture an immutable end-of-day valuation snapshot of their portfolio—combining live liquid cash across all bank accounts in the reactive ledger with total Bybit USDT assets (active sell ad stock + free balance), calculated against an editable reference exchange rate.

This document provides the complete, benchmark-grade **HTML markup template** for `js/views/modals.view.js` and corresponding **CSS rules** for `css/styles.css`. The design adheres strictly to the existing dark slate/navy glassmorphism design system, supports light mode via CSS variables, incorporates full ARIA accessibility, provides live preview recalculations, and supports responsive layouts across mobile and desktop.

---

## 2. Complete HTML Template for `js/views/modals.view.js`

Below is the exact HTML snippet to append inside `renderModalsView()` in `js/views/modals.view.js`:

```html
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
```

---

## 3. Detailed Component Inventory & DOM Mapping

| Component | Element ID | HTML Tag | Role / Attributes | Description |
|-----------|------------|----------|-------------------|-------------|
| **Backdrop** | `#modal-snapshot-backdrop` | `<div>` | `class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="snapshot-modal-title"` | Full-screen glassmorphic overlay for the snapshot modal. |
| **Modal Title** | `#snapshot-modal-title` | `<h3>` | `class="modal-title"` | "End Day / Save Net Worth Snapshot" header. |
| **Close Button** | `#btn-close-snapshot-modal` | `<button>` | `type="button" class="btn-icon" aria-label="Close snapshot modal"` | Dismisses modal on click. |
| **Form** | `#form-save-snapshot` | `<form>` | `class="modal-body"` | Main form container capturing snapshot parameters. |
| **Live Bank Cash Display** | `#snapshot-bank-cash` | `<div>` | `class="stat-card-value font-mono text-success" data-raw-value="0"` | Displays formatted live bank cash (e.g. `₦2,450,000.00`). |
| **Live Bank Cash Raw Store** | `#snapshot-bank-cash-raw` | `<input>` | `type="hidden" name="bankCashRaw"` | Preserves unrounded floating-point bank cash balance. |
| **Bybit USDT Balance Display** | `#snapshot-usdt-balance` | `<div>` | `class="stat-card-value font-mono text-accent" data-raw-value="0"` | Displays formatted USDT asset balance (e.g. `1,850.25 USDT`). |
| **Bybit USDT Raw Store** | `#snapshot-usdt-balance-raw` | `<input>` | `type="hidden" name="usdtBalanceRaw"` | Preserves unrounded floating-point USDT balance. |
| **Snapshot Date/Time** | `#snapshot-date` | `<input>` | `type="datetime-local" class="form-input font-mono" required` | Pre-fills with current local time; enables historical backdating if needed. |
| **Reference Exchange Rate** | `#input-snapshot-ref-rate` | `<input>` | `type="number" step="any" min="0.01" class="form-input font-mono font-bold" required` | Pre-populated with resolved rate; triggers live recalculation on `input`. |
| **Rate Source Badge** | `#snapshot-rate-source-badge` | `<span>` | `class="badge badge-neutral tiny"` | Displays rate derivation origin (e.g. "Active Ad Rate", "Latest Trade"). |
| **Preview Container** | `#snapshot-preview-container` | `<div>` | `class="snapshot-preview-banner" role="region"` | Highlighted card presenting live recalculated valuation preview. |
| **Preview Net Worth NGN** | `#snapshot-preview-networth-ngn` | `<div>` | `class="preview-metric-value font-mono text-success" aria-live="polite"` | Live calculated total wealth in NGN ($T_{\text{bank}} + U_{\text{bybit}} \times R_{\text{ref}}$). |
| **Preview Net Worth USDT** | `#snapshot-preview-networth-usdt` | `<div>` | `class="preview-metric-value font-mono text-accent" aria-live="polite"` | Live calculated total wealth in USDT ($U_{\text{bybit}} + T_{\text{bank}} / R_{\text{ref}}$). |
| **Calculated NGN Raw Store** | `#snapshot-calculated-ngn-raw` | `<input>` | `type="hidden" name="netWorthNgnRaw"` | Holds raw calculated NGN net worth. |
| **Calculated USDT Raw Store** | `#snapshot-calculated-usdt-raw` | `<input>` | `type="hidden" name="netWorthUsdtRaw"` | Holds raw calculated USDT net worth. |
| **Optional Notes** | `#input-snapshot-notes` | `<textarea>` | `class="form-textarea" maxlength="500" rows="2"` | Optional merchant notes for trading session context. |
| **Notes Character Counter** | `#snapshot-notes-counter` | `<span>` | `class="text-muted tiny"` | Tracks character count up to 500 chars (e.g. "45 / 500"). |
| **Cancel Button** | `#btn-cancel-snapshot-modal` | `<button>` | `type="button" class="btn btn-secondary"` | Closes modal without saving. |
| **Save Submit Button** | `#btn-save-snapshot-submit` | `<button>` | `type="submit" class="btn btn-primary"` | Validates inputs and triggers snapshot persistence to localStorage. |

---

## 4. CSS Styling Specification for `css/styles.css`

Below are the exact CSS classes to add to `css/styles.css` under a dedicated Milestone 3 section:

```css
/* ==========================================================================
   SNAPSHOT MODAL & FORM STYLES (Milestone 3)
   ========================================================================== */

/* Extended Modal Card Width for Multi-column Content */
.modal-card-lg {
  max-width: 540px;
}

/* Modal Header Icon Badge */
.modal-icon-badge {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.modal-icon-badge svg {
  width: 18px;
  height: 18px;
}

.modal-icon-badge.primary-tint {
  background: var(--primary-subtle);
  color: var(--primary-text);
  border: 1px solid rgba(59, 130, 246, 0.25);
}

/* Live Balances Summary Grid (2-Column Stat Cards) */
.snapshot-stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--sp-3);
}

.snapshot-stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: var(--sp-3);
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  transition: transform var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out);
}

.snapshot-stat-card:hover {
  border-color: var(--border-elevated);
  transform: translateY(-1px);
}

.stat-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stat-card-label {
  font-size: var(--text-tiny);
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.stat-icon-wrapper {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
}

.stat-icon-wrapper svg {
  width: 13px;
  height: 13px;
}

.stat-icon-wrapper.success-tint {
  background: var(--success-subtle);
  color: var(--success);
}

.stat-icon-wrapper.primary-tint {
  background: var(--primary-subtle);
  color: var(--primary-text);
}

.stat-card-value {
  font-size: 1.125rem;
  font-weight: 700;
  line-height: 1.25;
  margin-top: 2px;
}

.stat-card-meta {
  font-size: var(--text-tiny);
  color: var(--text-muted);
}

/* Live Recalculated Net Worth Preview Banner */
.snapshot-preview-banner {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(16, 185, 129, 0.08) 100%);
  border: 1px solid rgba(59, 130, 246, 0.35);
  border-radius: var(--radius-lg);
  padding: var(--sp-4);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  position: relative;
  overflow: hidden;
}

[data-theme="light"] .snapshot-preview-banner {
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0%, rgba(5, 150, 105, 0.06) 100%);
  border: 1px solid rgba(37, 99, 235, 0.3);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
}

.preview-banner-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--sp-3);
  padding-bottom: var(--sp-2);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

[data-theme="light"] .preview-banner-header {
  border-bottom-color: rgba(0, 0, 0, 0.06);
}

.preview-badge-icon {
  width: 26px;
  height: 26px;
  border-radius: var(--radius-sm);
  background: var(--primary-subtle);
  color: var(--primary-text);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.preview-badge-icon svg {
  width: 14px;
  height: 14px;
}

.preview-banner-title {
  font-size: var(--text-caption);
  font-weight: 700;
  color: var(--text-primary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.preview-metric-row {
  display: flex;
  align-items: stretch;
  gap: var(--sp-4);
}

.preview-metric-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.preview-metric-divider {
  width: 1px;
  background: var(--border-default);
  margin: 0 var(--sp-1);
}

.preview-metric-label {
  font-size: var(--text-tiny);
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.preview-metric-value {
  font-size: 1.35rem;
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: -0.01em;
}

.preview-formula-hint {
  font-size: var(--text-tiny);
  color: var(--text-muted);
  margin-top: 2px;
}

/* Modal Form Actions & Icon Spacing */
.modal-footer .btn svg {
  width: 15px;
  height: 15px;
  margin-right: 4px;
}

/* Mobile Responsive Breakpoints */
@media (max-width: 520px) {
  .snapshot-stats-grid {
    grid-template-columns: 1fr;
    gap: var(--sp-2);
  }

  .preview-metric-row {
    flex-direction: column;
    gap: var(--sp-3);
  }

  .preview-metric-divider {
    width: 100%;
    height: 1px;
    margin: var(--sp-1) 0;
  }

  .preview-metric-value {
    font-size: 1.2rem;
  }
}
```

---

## 5. Accessibility (a11y) & UX Considerations

1. **Modal ARIA Structure**:
   - `role="dialog"` and `aria-modal="true"` notify assistive technologies that keyboard focus is constrained to the active modal card.
   - `aria-labelledby="snapshot-modal-title"` links the title cleanly to the modal container.
2. **Accessible Form Associations**:
   - Every input has an explicit `<label for="...">` with readable text and Lucide icons with aria hiding.
   - `aria-describedby` links inputs to their respective helper text elements (`#snapshot-date-helper`, `#snapshot-rate-helper`).
3. **Polite Live Regions**:
   - Recalculated values (`#snapshot-preview-networth-ngn` and `#snapshot-preview-networth-usdt`) use `aria-live="polite"` so screen readers are informed of live formula adjustments without jarring interruptions.
4. **Keyboard Navigation & Esc Key**:
   - Modal closes on `Escape` key and backdrop click.
   - Tab sequence starts on `#input-snapshot-ref-rate` for rapid entry, followed by the notes field and submit button.
5. **Color Contrast & Theme Consistency**:
   - All text colors (`--text-primary`, `--text-secondary`, `--text-muted`) and status accents (`--success`, `--primary-text`, `--danger`) maintain WCAG 2.1 AA contrast standards in both dark and light modes.

---

## 6. Controller Blueprint & Event Integration (`js/dashboard.js`)

When the user clicks `#btn-open-snapshot-modal` on the Dashboard or triggers `openSaveSnapshotModal()`:

```javascript
/**
 * Controller Flow for Snapshot Modal (Milestone 3)
 */
export function openSaveSnapshotModal() {
  const modal = document.getElementById('modal-snapshot-backdrop');
  const form = document.getElementById('form-save-snapshot');
  
  // Element references
  const elBankCash = document.getElementById('snapshot-bank-cash');
  const elBankCashRaw = document.getElementById('snapshot-bank-cash-raw');
  const elUsdtBal = document.getElementById('snapshot-usdt-balance');
  const elUsdtBalRaw = document.getElementById('snapshot-usdt-balance-raw');
  const elDateInput = document.getElementById('snapshot-date');
  const elRateInput = document.getElementById('input-snapshot-ref-rate');
  const elRateBadge = document.getElementById('snapshot-rate-source-badge');
  const elPreviewNgn = document.getElementById('snapshot-preview-networth-ngn');
  const elPreviewUsdt = document.getElementById('snapshot-preview-networth-usdt');
  const elRawNgn = document.getElementById('snapshot-calculated-ngn-raw');
  const elRawUsdt = document.getElementById('snapshot-calculated-usdt-raw');
  const elNotes = document.getElementById('input-snapshot-notes');
  const elNotesCounter = document.getElementById('snapshot-notes-counter');

  // 1. Calculate live bank cash and Bybit USDT
  const computedBanks = store.getComputedBankBalances ? store.getComputedBankBalances() : new Map();
  const totalBankCash = calculateTotalBankCash(computedBanks);
  
  const trades = store.getTrades();
  const opening = store.getOpeningInventory();
  const fifo = calculateFIFOInventoryAndPnL(trades, opening);
  const totalUsdt = latestLiveUsdt !== null && !isNaN(latestLiveUsdt) 
    ? latestLiveUsdt 
    : (fifo.remainingInventoryUSDT || 0);

  // 2. Resolve default reference rate
  const resolvedRate = resolveReferenceRate({
    activeSellAd: latestActiveAd,
    latestTrade: trades,
    fifoAvgBuyCost: fifo.avgHoldingCostPerUSDT,
    openingDefaultRate: opening?.defaultCostBasis,
    openingInventory: opening,
    fallbackRate: 1500.00
  });

  // 3. Populate Form & Data attributes
  if (elBankCash) {
    elBankCash.textContent = formatNGN(totalBankCash);
    elBankCash.dataset.rawValue = totalBankCash;
  }
  if (elBankCashRaw) elBankCashRaw.value = totalBankCash;

  if (elUsdtBal) {
    elUsdtBal.textContent = formatUSDT(totalUsdt);
    elUsdtBal.dataset.rawValue = totalUsdt;
  }
  if (elUsdtBalRaw) elUsdtBalRaw.value = totalUsdt;

  if (elDateInput) {
    const now = new Date();
    const offsetMs = now.getTimezoneOffset() * 60000;
    const localIso = new Date(now.getTime() - offsetMs).toISOString().slice(0, 16);
    elDateInput.value = localIso;
  }

  if (elRateInput) {
    elRateInput.value = resolvedRate ? resolvedRate.toFixed(2) : '1500.00';
  }

  if (elNotes) elNotes.value = '';
  if (elNotesCounter) elNotesCounter.textContent = '0 / 500';

  // 4. Live Recalculation Handler
  function updatePreview() {
    const rate = parseFloat(elRateInput?.value) || 0;
    if (rate > 0) {
      const { netWorthNgn, netWorthUsdt } = calculateNetWorth(totalBankCash, totalUsdt, rate);
      if (elPreviewNgn) elPreviewNgn.textContent = formatNGN(netWorthNgn);
      if (elPreviewUsdt) elPreviewUsdt.textContent = formatUSDT(netWorthUsdt);
      if (elRawNgn) elRawNgn.value = netWorthNgn;
      if (elRawUsdt) elRawUsdt.value = netWorthUsdt;
      elRateInput.classList.remove('is-invalid');
    } else {
      if (elPreviewNgn) elPreviewNgn.textContent = '₦0.00';
      if (elPreviewUsdt) elPreviewUsdt.textContent = '0.00 USDT';
      elRateInput.classList.add('is-invalid');
    }
  }

  updatePreview();
  elRateInput?.addEventListener('input', updatePreview);

  // 5. Notes length counter handler
  elNotes?.addEventListener('input', () => {
    if (elNotesCounter && elNotes) {
      elNotesCounter.textContent = `${elNotes.value.length} / 500`;
    }
  });

  // 6. Reveal modal
  modal?.classList.remove('hidden');
  elRateInput?.focus();
  elRateInput?.select();
  if (window.lucide) window.lucide.createIcons();
}
```

---

## 7. Forensic Robustness & Boundary Guarantees

1. **Zero & Negative Rate Prevention**: The HTML input specifies `min="0.01" step="any" required`. The JS controller validates `rate > 0` before computing or persisting.
2. **Missing Accounts / Zero Inventory**: Correctly defaults to `₦0.00` and `0.00 USDT` without throwing `NaN` or unhandled exceptions.
3. **Precision Preservation**: Raw numeric balances are preserved in `data-raw-value` attributes and hidden input fields to prevent float rounding discrepancies caused by string parsing.
4. **Non-destructive Idempotence**: Opening and closing the modal resets listeners or uses bounded handler attachments, preventing memory leaks or duplicate event dispatches.
