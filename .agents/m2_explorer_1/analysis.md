# Milestone 2 (M2) UI Markup, Layout & Styling Analysis

**Explorer Agent**: `m2_explorer_1` (Role: M2 UI Markup & Layout Explorer)  
**Date**: 2026-08-25  
**Target View**: `js/views/dashboard.view.js`  
**Target Stylesheet**: `css/styles.css`  
**Associated Logic Controller**: `js/dashboard.js`  

---

## 1. Executive Summary & Design Goals

Milestone 2 (M2) introduces the **Live Net Worth Dashboard Widget UI** (`#card-net-worth`), which serves as the flagship Hero element on the main Dashboard cockpit.

### Primary Objectives:
1. **Prominent Hero Display**: Present user's live consolidated Net Worth simultaneously in Nigerian Naira (`#stat-net-worth-ngn`) and USDT (`#stat-net-worth-usdt`).
2. **Sub-metric Breakdown**: Display the three constituent pillars:
   - **Bank Cash NGN** (`#metric-nw-bank-cash`) — Reactive sum across linked bank accounts.
   - **Bybit USDT Holdings** (`#metric-nw-bybit-usdt`) — Total funding balance + active ad stock.
   - **Reference Exchange Rate** (`#metric-nw-ref-rate`) — Authoritative market rate from active sell ads or fallback hierarchy.
3. **Historical Delta Comparison**: Display an adaptive badge (`#badge-net-worth-delta`) showing absolute and percentage growth compared to the latest saved daily snapshot.
4. **Primary Action Hook**: Feature the "End Day / Save Snapshot" button (`#btn-open-snapshot-modal`) prominently in the card header.
5. **Design System Harmony**: Seamlessly blend with existing glassmorphism styling, design tokens, color palette, dark/light theme toggle, and mobile responsive grid.

---

## 2. Component Hierarchy & DOM Structure

The widget is placed at the top of `renderDashboardView()` in `js/views/dashboard.view.js`, immediately preceding the Portfolio Overview and Active Ad cards.

### DOM Tree Overview
```
section#view-dashboard.app-view.active
  ├── div.view-header (Dashboard title, greeting, New Trade button)
  │
  └── div#card-net-worth.card.mb-4.net-worth-card (Hero Card)
        ├── div.card-header-flex.mb-3 (Header)
        │     ├── div (Title & status badge)
        │     │     ├── span#net-worth-live-badge.live-badge (Live Pulse Badge)
        │     │     ├── h3.card-title (Live Net Worth)
        │     │     └── p.card-subtitle (Consolidated bank cash + Bybit valuation)
        │     └── div.net-worth-header-actions
        │           └── button#btn-open-snapshot-modal.btn.btn-sm.btn-primary ("End Day / Snapshot")
        │
        ├── div.net-worth-hero-section.mb-4 (Hero Valuation)
        │     ├── div.net-worth-hero-main
        │     │     ├── span.net-worth-hero-label ("Total Net Worth (NGN)")
        │     │     └── div#stat-net-worth-ngn.net-worth-hero-value.font-mono.text-success ("₦0.00")
        │     └── div.net-worth-hero-secondary
        │           ├── div.net-worth-usdt-pill
        │           │     ├── span.text-muted.small ("USDT Equivalent:")
        │           │     └── span#stat-net-worth-usdt.font-mono.font-bold.text-accent ("0.00 USDT")
        │           └── div#badge-net-worth-delta.net-worth-delta-wrapper (Delta Badge Container)
        │                 └── span#badge-nw-delta-pill.badge.badge-neutral (Pill with icon & delta)
        │
        └── div.net-worth-breakdown-grid (3-Column Sub-metrics)
              ├── div#cell-nw-bank-cash.net-worth-breakdown-cell (Bank Cash)
              │     ├── div.nw-cell-header
              │     │     ├── span.nw-cell-label ("Liquid Bank Cash")
              │     │     └── div.metric-icon-box.success-tint.nw-icon-sm (<i data-lucide="landmark">)
              │     ├── div#metric-nw-bank-cash.nw-cell-value.font-mono.text-success ("₦0.00")
              │     └── div.nw-cell-sub.text-muted ("Reactive bank ledger")
              │
              ├── div#cell-nw-bybit-usdt.net-worth-breakdown-cell (Bybit USDT)
              │     ├── div.nw-cell-header
              │     │     ├── span.nw-cell-label ("Bybit USDT Assets")
              │     │     └── div.metric-icon-box.primary-tint.nw-icon-sm (<i data-lucide="wallet">)
              │     ├── div#metric-nw-bybit-usdt.nw-cell-value.font-mono.text-accent ("0.00 USDT")
              │     └── div#metric-nw-bybit-sub.nw-cell-sub.text-muted ("Ad stock + Free balance")
              │
              └── div#cell-nw-ref-rate.net-worth-breakdown-cell (Reference Rate)
                    ├── div.nw-cell-header
                    │     ├── span.nw-cell-label ("Reference Rate")
                    │     └── div.metric-icon-box.warning-tint.nw-icon-sm (<i data-lucide="trending-up">)
                    ├── div#metric-nw-ref-rate.nw-cell-value.font-mono ("₦1,500.00 / USDT")
                    └── div#metric-nw-rate-source.nw-cell-sub.text-muted ("Active Sell Ad rate")
```

---

## 3. Exact HTML Template String for `dashboard.view.js`

Here is the exact template string block ready for inclusion in `js/views/dashboard.view.js`:

```html
      <!-- ⓪ Live Net Worth Hero Widget (Milestone 2) -->
      <div class="card mb-4 net-worth-card" id="card-net-worth" role="region" aria-label="Live Net Worth Valuation">
        <div class="card-header-flex mb-3">
          <div>
            <div class="net-worth-badge-group">
              <span class="live-badge" id="net-worth-live-badge">
                <span class="live-badge-dot"></span>
                Live Valuation
              </span>
            </div>
            <h3 class="card-title mt-1">Live Net Worth</h3>
            <p class="card-subtitle">Real-time consolidated bank ledger & Bybit portfolio valuation</p>
          </div>
          <div class="net-worth-header-actions">
            <button class="btn btn-sm btn-primary" id="btn-open-snapshot-modal" title="Record daily closing snapshot" aria-label="End Day and Save Net Worth Snapshot">
              <i data-lucide="camera"></i>
              <span>End Day / Snapshot</span>
            </button>
          </div>
        </div>

        <!-- Primary Hero Net Worth Display -->
        <div class="net-worth-hero-section mb-4">
          <div class="net-worth-hero-main">
            <span class="net-worth-hero-label">Total Capital Valuation (NGN)</span>
            <div class="net-worth-hero-value font-mono text-success" id="stat-net-worth-ngn" aria-live="polite">₦0.00</div>
          </div>
          <div class="net-worth-hero-secondary">
            <div class="net-worth-usdt-pill">
              <span class="text-muted small">USDT Equiv:</span>
              <span class="font-mono font-bold text-accent" id="stat-net-worth-usdt" aria-live="polite">0.00 USDT</span>
            </div>
            <div class="net-worth-delta-wrapper" id="badge-net-worth-delta" aria-live="polite">
              <span class="badge badge-neutral" id="badge-nw-delta-pill">
                <i data-lucide="minus"></i>
                <span>No baseline snapshot</span>
              </span>
            </div>
          </div>
        </div>

        <!-- Breakdown Sub-metrics Grid (3-Column) -->
        <div class="net-worth-breakdown-grid">
          
          <!-- Pillar 1: Bank Cash -->
          <div class="net-worth-breakdown-cell" id="cell-nw-bank-cash">
            <div class="nw-cell-header">
              <span class="nw-cell-label">Liquid Bank Cash</span>
              <div class="metric-icon-box success-tint nw-icon-sm">
                <i data-lucide="landmark"></i>
              </div>
            </div>
            <div class="nw-cell-value font-mono text-success" id="metric-nw-bank-cash">₦0.00</div>
            <div class="nw-cell-sub text-muted" id="metric-nw-bank-sub">Reactive bank ledger</div>
          </div>

          <!-- Pillar 2: Bybit USDT -->
          <div class="net-worth-breakdown-cell" id="cell-nw-bybit-usdt">
            <div class="nw-cell-header">
              <span class="nw-cell-label">Bybit USDT Assets</span>
              <div class="metric-icon-box primary-tint nw-icon-sm">
                <i data-lucide="wallet"></i>
              </div>
            </div>
            <div class="nw-cell-value font-mono text-accent" id="metric-nw-bybit-usdt">0.00 USDT</div>
            <div class="nw-cell-sub text-muted" id="metric-nw-bybit-sub">Ad stock + Free balance</div>
          </div>

          <!-- Pillar 3: Reference Rate -->
          <div class="net-worth-breakdown-cell" id="cell-nw-ref-rate">
            <div class="nw-cell-header">
              <span class="nw-cell-label">Reference Rate</span>
              <div class="metric-icon-box warning-tint nw-icon-sm">
                <i data-lucide="trending-up"></i>
              </div>
            </div>
            <div class="nw-cell-value font-mono" id="metric-nw-ref-rate">₦1,500.00 / USDT</div>
            <div class="nw-cell-sub text-muted" id="metric-nw-rate-source">Active Sell Ad rate</div>
          </div>

        </div>
      </div>
```

---

## 4. CSS Rules & Styling System (`css/styles.css`)

To maintain fidelity with the dark slate glassmorphism design system (and data-theme light support), the following CSS rules will be added to `css/styles.css`:

```css
/* ==========================================================================
   LIVE NET WORTH HERO WIDGET (M2)
   ========================================================================== */

.net-worth-card {
  position: relative;
  background: linear-gradient(135deg, rgba(18, 28, 47, 0.85) 0%, rgba(14, 22, 38, 0.92) 100%);
  border: 1px solid rgba(59, 130, 246, 0.25);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

[data-theme="light"] .net-worth-card {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(241, 245, 249, 0.9) 100%);
  border: 1px solid rgba(59, 130, 246, 0.3);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
}

.net-worth-badge-group {
  margin-bottom: var(--sp-1);
}

.net-worth-header-actions {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}

/* Primary Hero Display Section */
.net-worth-hero-section {
  padding: var(--sp-4) 0;
  border-bottom: 1px solid var(--border-default);
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.net-worth-hero-label {
  font-size: var(--text-tiny);
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.net-worth-hero-value {
  font-size: clamp(1.85rem, 4.5vw, 2.5rem);
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: -0.02em;
  margin: 2px 0 var(--sp-2) 0;
}

.net-worth-hero-secondary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sp-3);
}

.net-worth-usdt-pill {
  background: var(--bg-surface-elevated);
  border: 1px solid var(--border-elevated);
  padding: 4px 12px;
  border-radius: var(--radius-full);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-supporting);
}

.net-worth-delta-wrapper {
  display: inline-flex;
  align-items: center;
}

/* Sub-metric Breakdown Grid */
.net-worth-breakdown-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--sp-3);
}

.net-worth-breakdown-cell {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: var(--sp-3) var(--sp-4);
  display: flex;
  flex-direction: column;
  gap: 3px;
  transition: transform var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out);
}

.net-worth-breakdown-cell:hover {
  border-color: var(--border-elevated);
  transform: translateY(-1px);
}

.nw-cell-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--sp-1);
}

.nw-cell-label {
  font-size: var(--text-tiny);
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.nw-cell-value {
  font-size: var(--text-subheading);
  font-weight: 700;
  line-height: 1.2;
}

.nw-cell-sub {
  font-size: var(--text-tiny);
}

.nw-icon-sm {
  width: 26px;
  height: 26px;
  border-radius: var(--radius-sm);
}

.nw-icon-sm svg {
  width: 14px;
  height: 14px;
}

/* Responsive Breakpoints */
@media (max-width: 768px) {
  .net-worth-breakdown-grid {
    grid-template-columns: 1fr;
    gap: var(--sp-2);
  }

  .net-worth-breakdown-cell {
    padding: var(--sp-3);
  }
}

@media (max-width: 480px) {
  .net-worth-hero-section {
    padding: var(--sp-3) 0;
  }

  .card-header-flex {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-3);
  }

  .net-worth-header-actions {
    width: 100%;
  }

  .net-worth-header-actions button {
    width: 100%;
    justify-content: center;
  }
}
```

---

## 5. Controller Integration Blueprint (`js/dashboard.js`)

In Milestone 2 implementation, `js/dashboard.js` will export and execute `renderNetWorthWidget()` during initialization and whenever reactive store events trigger.

### Calculation Logic Flow:
1. **Bank Cash**:
   ```javascript
   const computedBankBalances = store.getComputedBankBalances();
   const totalBankCashNgn = calculateTotalBankCash(computedBankBalances);
   ```
2. **USDT Balances**:
   ```javascript
   // Live Bybit wallet + active ads, or FIFO inventory fallback
   const liveTotalUSDT = latestBybitTotalUsdt !== null ? latestBybitTotalUsdt : fifoResult.remainingInventoryUSDT;
   ```
3. **Reference Rate**:
   ```javascript
   const referenceRate = resolveReferenceRate({
     activeSellAd: latestActiveAd,
     latestTrade: trades[0],
     fifoAvgBuyCost: fifoResult.avgHoldingCostPerUSDT,
     openingDefaultRate: openingInventory.defaultCostBasis,
     fallbackRate: 1500.00
   });
   ```
4. **Consolidated Net Worth**:
   ```javascript
   const { netWorthNgn, netWorthUsdt } = calculateNetWorth(totalBankCashNgn, liveTotalUSDT, referenceRate);
   ```
5. **Delta Calculation vs Latest Snapshot**:
   ```javascript
   const snapshots = store.getSnapshots();
   const latestSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
   const delta = calculateSnapshotDelta({ netWorthNgn, netWorthUsdt }, latestSnapshot);
   ```
6. **DOM Updates**:
   - Update `#stat-net-worth-ngn` with `formatNGN(netWorthNgn)`.
   - Update `#stat-net-worth-usdt` with `formatUSDT(netWorthUsdt)`.
   - Update `#metric-nw-bank-cash` with `formatNGN(totalBankCashNgn)`.
   - Update `#metric-nw-bybit-usdt` with `formatUSDT(liveTotalUSDT)`.
   - Update `#metric-nw-ref-rate` with `formatRate(referenceRate)` or `₦${referenceRate.toFixed(2)} / USDT`.
   - Render delta pill inside `#badge-net-worth-delta`:
     ```javascript
     if (!latestSnapshot) {
       deltaBadgeEl.innerHTML = `
         <span class="badge badge-neutral" id="badge-nw-delta-pill">
           <i data-lucide="minus"></i>
           <span>No baseline snapshot</span>
         </span>
       `;
     } else {
       const isPositive = delta.deltaNgn >= 0;
       const sign = isPositive ? '+' : '';
       const badgeClass = delta.deltaNgn > 0 ? 'badge-success' : (delta.deltaNgn < 0 ? 'badge-danger' : 'badge-neutral');
       const icon = delta.deltaNgn > 0 ? 'trending-up' : (delta.deltaNgn < 0 ? 'trending-down' : 'minus');
       deltaBadgeEl.innerHTML = `
         <span class="badge ${badgeClass}" id="badge-nw-delta-pill">
           <i data-lucide="${icon}"></i>
           <span>${sign}${formatNGN(delta.deltaNgn)} (${sign}${delta.pctDeltaNgn.toFixed(2)}%) vs last snapshot</span>
         </span>
       `;
     }
     if (window.lucide) window.lucide.createIcons();
     ```
7. **Modal Trigger Hook**:
   - Hook `#btn-open-snapshot-modal` to open the End Day / Save Snapshot modal (`window.openSnapshotModal()` or custom modal trigger).

---

## 6. Accessibility & UX Checklist

- [x] Semantic container with `role="region"` and `aria-label="Live Net Worth Valuation"`.
- [x] `aria-live="polite"` on dynamically changing values (`#stat-net-worth-ngn`, `#stat-net-worth-usdt`, `#badge-net-worth-delta`).
- [x] Touch-accessible button target (min 44px height on mobile).
- [x] Clear typographic contrast adhering to WCAG AA standards.
- [x] Numerical data formatted with `font-mono` for zero layout shift during recalculation.
- [x] Lucide icons initialized dynamically on render.
