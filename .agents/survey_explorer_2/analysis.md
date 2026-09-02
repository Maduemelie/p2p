# Technical Investigation & Architectural Blueprint: UI Controls, Settings & Pricing Assistant Fee Integration

**Date**: 2026-09-02  
**Explorer**: `survey_explorer_2` (UI & Settings Explorer)  
**Target Root**: `c:\dev\p2p`  
**Focus Scope**: `js/views/pricing.view.js`, `js/views/settings.view.js`, `js/pricing.js`, `js/settings.js`, `js/store.js`, `js/fees.js`, `index.html`, `css/styles.css`

---

## 1. Executive Summary & Problem Framing

The Bybit NGN P2P Trade Tracker currently calculates arbitrage recommendations and FIFO inventory P&L. However, the existing pricing engine (`js/pricingEngine.js`) and UI components (`js/views/pricing.view.js`) only account for flat fiat transfer fees (`input-inflow-fee` and `input-outflow-fee`, defaulting to ₦50) without factoring in Bybit's **0.30% platform maker transaction fee** (`platformFeePct`). Furthermore, fixed fiat transfer fees exhibit a non-linear, hyper-regressive cost curve that erodes margins on smaller order sizes (e.g. ₦5,000 to ₦15,000), while the current UI lacks:
1. **Platform Maker Fee percentage controls** (default 0.30%) in both Settings and Pricing Assistant.
2. **Transparent Fee Breakdown** in the Buy and Sell pricing assistant cards (distinguishing flat fiat bank fees vs. percentage crypto maker fees).
3. **Net Profit Impact Visualizations** (realized net spread per USDT, total trade profit in NGN, and net ROI %).
4. **Optimal Order Limits Recommendations** (minimum profitable order size in NGN/USDT to prevent fee drag cannibalization).
5. **Centralized Settings Configuration & Persistence** for global default fees and limits.

This document provides the complete UI/UX architectural blueprint, data-binding contracts, mathematical models, and implementation specifications to integrate these requirements into the Bybit P2P Tracker.

---

## 2. Bybit P2P Fee Model & Mathematical Engine Integration

### 2.1 The Two-Tier Fee Structure
When an arbitrage merchant operates on Bybit NGN P2P as a **Maker** (posting advertisements):
1. **Platform Maker Fee ($p_{maker} = 0.30\% = 0.003$)**:
   - Bybit charges a percentage maker transaction fee upon order fulfillment.
   - On Buy Ads: The merchant pays fiat to acquire USDT. Bybit deducts 0.3% from the crypto received (or effectively inflates the acquisition cost per net USDT).
   - On Sell Ads: The merchant delivers USDT and receives fiat. Bybit deducts 0.3% maker fee from the sold volume (or effectively reduces the net fiat yield per USDT).
2. **Local Fiat Transfer Fees & Statutory Levies ($F_{fiat} = \text{₦}50.00$)**:
   - **Inflow Transfer Fee ($F_{in}$)**: Fixed fintech/bank transfer fee paid by merchant when sending Naira to a seller on a Buy trade (typically ₦10 to ₦50 depending on inter-bank / same-bank routing and EMTL stamp duty).
   - **Outflow Fee / Stamp Duty ($F_{out}$)**: Bank charge or electronic money transfer levy (EMTL) incurred when receiving or sweeping funds from buyers on Sell trades (typically ₦50 for transactions $\ge \text{₦}10,000$).
   - Per-unit fiat fee impact: $f_{unit} = \frac{F_{fiat}}{V}$, where $V$ is trade volume in USDT.

### 2.2 Mathematical Formulas for Net Profit & Rate Recommendations

#### A. Buy Ad Assistant (Capital Inflow / Buying USDT)
Let $P_{exit}$ be the top market sell competitor price (exit price in NGN), $S_{target}$ be the target spread (NGN/USDT), $V$ be target volume in USDT, $F_{in}$ be inflow fiat fee (₦), and $p_{maker} = \text{platformFeePct} / 100$:

$$\text{Inflow Fee per Unit} = f_{in} = \frac{F_{in}}{V}$$

$$\text{Effective Buy Cost per Net USDT} = P_{buy} \times (1 + p_{maker}) + f_{in}$$

To guarantee that the net cost basis never breaches $P_{exit} - S_{target}$:

$$P_{buy} \times (1 + p_{maker}) + f_{in} \le P_{exit} - S_{target}$$

$$\implies \mathbf{MaxBuyPrice} = \frac{P_{exit} - S_{target} - f_{in}}{1 + p_{maker}}$$

- **Suggested Buy Price**:
  $$P_{sug\_buy} = \min(P_{ref\_buy} + 0.10, \mathbf{MaxBuyPrice})$$
- **Fee Breakdown**:
  - Platform Maker Fee Amount: $P_{sug\_buy} \times p_{maker}$ (₦ / USDT)
  - Fiat Transfer Fee Amount: $f_{in} = \frac{F_{in}}{V}$ (₦ / USDT)
  - Total Fee per USDT: $(P_{sug\_buy} \times p_{maker}) + f_{in}$
- **Net Margin & Profit Impact**:
  - Total Effective Buy Cost Basis: $P_{sug\_buy} + (P_{sug\_buy} \times p_{maker}) + f_{in}$
  - Net Spread per USDT: $P_{exit} - \text{Total Effective Buy Cost Basis}$
  - Projected Net Trade Profit: $\text{Net Spread} \times V$

#### B. Sell Ad Assistant (Capital Outflow / Selling USDT)
Let $C_{fifo}$ be the FIFO inventory cost basis per USDT, $S_{target}$ be target spread, $V$ be target volume, $F_{out}$ be outflow fiat fee, and $p_{maker} = \text{platformFeePct} / 100$:

$$\text{Outflow Fee per Unit} = f_{out} = \frac{F_{out}}{V}$$

$$\text{Net Sell Revenue per USDT} = P_{sell} \times (1 - p_{maker}) - f_{out}$$

- **Break-Even Sell Price** (Net Revenue = $C_{fifo}$):
  $$\mathbf{BreakEven} = \frac{C_{fifo} + f_{out}}{1 - p_{maker}}$$
- **Target Sell Price** (Net Revenue = $C_{fifo} + S_{target}$):
  $$\mathbf{TargetSellPrice} = \frac{C_{fifo} + S_{target} + f_{out}}{1 - p_{maker}}$$
- **Suggested Sell Price**:
  $$P_{sug\_sell} = \max(P_{ref\_sell} - 0.10, \mathbf{TargetSellPrice})$$
- **Fee Breakdown**:
  - Platform Maker Fee Amount: $P_{sug\_sell} \times p_{maker}$ (₦ / USDT)
  - Fiat Transfer Fee Amount: $f_{out} = \frac{F_{out}}{V}$ (₦ / USDT)
  - Total Deductions per USDT: $(P_{sug\_sell} \times p_{maker}) + f_{out}$
- **Net Margin & Profit Impact**:
  - Net Realized Sell Revenue: $P_{sug\_sell} - (P_{sug\_sell} \times p_{maker}) - f_{out}$
  - Net Spread per USDT: $\text{Net Realized Revenue} - C_{fifo}$
  - Projected Net Trade Profit: $\text{Net Spread} \times V$

---

### 2.3 Optimal Order Limits & Fee Drag Analysis

Fixed fiat transfer fees (₦50) exhibit an inverse relationship with trade volume. The table below illustrates the fee drag across realistic P2P order tiers at a benchmark rate of ₦1,500/USDT with ₦5.00 target spread:

| Order Size (NGN) | USDT Volume ($V$) | Flat Fee (₦50) Drag ($f_{unit}$) | Platform Fee (0.3%) | Total Fees / USDT | Gross Spread | Net Spread / USDT | Net Profit on Order | Margin Status |
|---|---|---|---|---|---|---|---|---|
| **₦5,000** | 3.33 USDT | **₦15.00 / USDT** | ₦4.50 / USDT | **₦19.50** | ₦5.00 | **-₦14.50** | **-₦48.33 (LOSS)** | 🔴 Critical Loss (390% fee drag) |
| **₦10,000** | 6.67 USDT | **₦7.50 / USDT** | ₦4.50 / USDT | **₦12.00** | ₦5.00 | **-₦7.00** | **-₦46.67 (LOSS)** | 🔴 Critical Loss (240% fee drag) |
| **₦20,000** | 13.33 USDT | **₦3.75 / USDT** | ₦4.50 / USDT | **₦8.25** | ₦5.00 | **-₦3.25** | **-₦43.33 (LOSS)** | 🔴 Negative Net Yield |
| **₦30,000** | 20.00 USDT | **₦2.50 / USDT** | ₦4.50 / USDT | **₦7.00** | ₦10.00 | **+₦3.00** | **+₦60.00** | 🟡 Marginal (50% fee drag on ₦5 spread) |
| **₦50,000** | 33.33 USDT | **₦1.50 / USDT** | ₦4.50 / USDT | **₦6.00** | ₦10.00 | **+₦4.00** | **+₦133.33** | 🟢 Viable (30% fee drag) |
| **₦100,000** | 66.67 USDT | **₦0.75 / USDT** | ₦4.50 / USDT | **₦5.25** | ₦10.00 | **+₦4.75** | **+₦316.67** | 🟢 Optimal (15% fee drag) |
| **₦500,000** | 333.33 USDT | **₦0.15 / USDT** | ₦4.50 / USDT | **₦4.65** | ₦10.00 | **+₦5.35** | **+₦1,783.33** | 🟢 High Efficiency (3% fee drag) |

#### Optimal Order Limits Recommendation Engine:
1. **Break-Even Minimum Volume ($V_{min\_be}$)**:
   $$V_{min\_be} = \frac{F_{fiat}}{S_{target}}$$
   For $F_{fiat} = \text{₦}50$ and $S_{target} = \text{₦}5.00 \implies V_{min\_be} = 10 \text{ USDT}$ ($\approx \text{₦}15,000$).
2. **Recommended Minimum Limit for 20% Max Fee Drag ($V_{rec}$)**:
   $$V_{rec} = \frac{F_{fiat}}{0.20 \times S_{target}} = \frac{50}{1.0} = 50 \text{ USDT} \quad (\approx \text{₦}75,000 \text{ NGN})$$
   - Conservative threshold: $\ge \text{₦}30,000$ (capped at 50% fee drag).
   - High-efficiency threshold: $\ge \text{₦}50,000$ to $\text{₦}100,000$ (fee drag $< 20\%$).

---

## 3. Detailed UI Component Inspection & Gap Analysis

### 3.1 `js/views/pricing.view.js` Inspection
- **Current State**:
  - Lines 22–101: `Arbitrage Settings` card houses 7 input controls (`input-target-spread`, `input-avg-volume`, `input-inflow-fee`, `input-outflow-fee`, `input-pricing-mode`, `input-depth-limit`, `input-filter-limits`).
  - Lines 107–146: `Buy Ad Assistant` card displays Exit Price, Max Buy Limit, Top Competitor Buy, Suggested Buy, and Status badge.
  - Lines 149–192: `Sell Ad Assistant` card displays Cost Basis, Break-Even, Target Sell Price, Top Competitor Sell, Suggested Sell, and Status badge.
- **Identified Gaps**:
  1. No input control for `input-platform-fee-pct` (Platform Maker Fee %).
  2. No granular fee breakdown display showing the platform fee amount vs fiat transfer fee amount.
  3. No display of the True Net Cost Basis (Buy side) or True Net Realized Revenue (Sell side).
  4. No projected Net Trade Profit (in NGN) or Net Spread per USDT after deducting all fees.
  5. No Recommended Minimum Order Limits box to guide the merchant when configuring their Bybit advertisement limits.

### 3.2 `js/views/settings.view.js` Inspection
- **Current State**:
  - Lines 16–20: 3 sub-tabs (`accounts`, `bybit-sync`, `data`).
  - Lines 23–65: `accounts` panel (Bank Accounts list, Transfers log).
  - Lines 68–139: `bybit-sync` panel (Proxy URL, Proxy Token, Sync holdings, Import trades).
  - Lines 142–272: `data` panel (Opening USDT Inventory form, Backup/Restore actions, App info).
- **Identified Gaps**:
  1. No centralized Fee Defaults management interface. If a merchant's Bybit VIP level changes (e.g. VIP maker fee discounts from 0.3% to 0.25% or 0.15%), or if bank transfer fees alter, they must manually re-type values in the Pricing view each time.
  2. No persistent configuration for Default Platform Maker Fee %, Default Inflow Fee, Default Outflow Fee, and Default Target Order Limit Thresholds in the settings store.

### 3.3 `js/pricing.js` & `js/settings.js` Controller Inspection
- **`js/pricing.js`**:
  - `loadSavedSettings()` reads `bybit_p2p_pricing_spread`, `bybit_p2p_pricing_volume`, `bybit_p2p_pricing_inflow`, `bybit_p2p_pricing_outflow`, etc.
  - Missing `bybit_p2p_pricing_platform_fee` (default `'0.30'`).
  - `calculateMargins()` delegates to `pricingEngine.calculateBuyPricing()` and `calculateSellPricing()`, but does not pass `platformFeePct`.
- **`js/settings.js`**:
  - Contains handlers for `#form-opening-inventory` and Bybit sync.
  - Needs a dedicated form handler `#form-fee-defaults` to save default fees and dispatch `store:updated` notifications.

### 3.4 `js/store.js` Persistence Inspection
- `STORAGE_KEYS.SETTINGS = 'bybit_p2p_settings'` is already defined in `store.js` line 13.
- Currently, `store.js` has no `getSettings()` or `saveSettings()` methods, leaving settings management ad-hoc across direct `localStorage` calls.
- Adding `store.getSettings()` and `store.saveSettings()` encapsulates global trading fee defaults, supports JSON backups in `exportAllData()`, and provides unified schema migration.

---

## 4. UI/UX Architecture & Control Placement Design

### 4.1 Settings View: "Trading Fee Defaults & Arbitrage Parameters" Card

#### Placement:
Add a new dedicated section in `js/views/settings.view.js`. It can be placed inside the `data` tab (or in a dedicated `fees` sub-tab). Placing a "Trading Fee Defaults" card inside the `data` tab (or as a 4th tab `Fees & Pricing`) allows merchants to configure defaults permanently.

```html
<!-- Trading Fees & Defaults Card in settings.view.js -->
<div class="card mb-4">
  <div class="card-header-flex mb-3">
    <div>
      <h3 class="card-title">Trading Fees & Arbitrage Defaults</h3>
      <p class="card-subtitle">Global fee defaults applied across Pricing Assistant & Trade forms</p>
    </div>
    <div class="metric-icon-box warning-tint">
      <i data-lucide="percent"></i>
    </div>
  </div>

  <p class="text-muted small mb-3">
    Configure your Bybit P2P platform maker fee percentage and standard local fiat transfer fees.
    These defaults populate the Pricing Assistant and automated fee estimators.
  </p>

  <form id="form-fee-defaults" class="form-grid">
    <div class="form-group col-12 col-md-6">
      <label for="input-setting-platform-fee" class="form-label">
        <i data-lucide="shield-alert"></i> Platform Maker Fee (%)
      </label>
      <div class="input-affix-wrapper">
        <input type="number" step="0.01" min="0" max="5" id="input-setting-platform-fee" class="form-input font-mono" value="0.30" required>
        <span class="input-suffix">%</span>
      </div>
      <p class="form-helper">Bybit P2P standard maker fee is 0.30% (or lower for VIP tiers).</p>
    </div>

    <div class="form-group col-12 col-md-6">
      <label for="input-setting-inflow-fee" class="form-label">
        <i data-lucide="arrow-down-left"></i> Default Buy Inflow Fee (NGN)
      </label>
      <div class="input-affix-wrapper">
        <span class="input-prefix">₦</span>
        <input type="number" step="1" min="0" id="input-setting-inflow-fee" class="form-input font-mono" value="50" required>
        <span class="input-suffix">NGN</span>
      </div>
      <p class="form-helper">Bank transfer fee when paying sellers (e.g. ₦10 or ₦50 stamp duty).</p>
    </div>

    <div class="form-group col-12 col-md-6">
      <label for="input-setting-outflow-fee" class="form-label">
        <i data-lucide="arrow-up-right"></i> Default Sell Outflow Fee (NGN)
      </label>
      <div class="input-affix-wrapper">
        <span class="input-prefix">₦</span>
        <input type="number" step="1" min="0" id="input-setting-outflow-fee" class="form-input font-mono" value="50" required>
        <span class="input-suffix">NGN</span>
      </div>
      <p class="form-helper">Levy or transfer sweep fee when receiving Naira from buyers.</p>
    </div>

    <div class="form-group col-12 col-md-6">
      <label for="input-setting-target-spread" class="form-label">
        <i data-lucide="target"></i> Default Target Spread (NGN)
      </label>
      <div class="input-affix-wrapper">
        <span class="input-prefix">₦</span>
        <input type="number" step="0.1" min="0.1" id="input-setting-target-spread" class="form-input font-mono" value="5.0" required>
        <span class="input-suffix">/ USDT</span>
      </div>
      <p class="form-helper">Baseline net profit target per USDT transacted.</p>
    </div>

    <div class="col-12 text-end mt-2">
      <button type="submit" class="btn btn-sm btn-primary" id="btn-save-fee-defaults">
        <i data-lucide="check"></i> Save Fee Defaults
      </button>
    </div>
  </form>
</div>
```

---

### 4.2 Pricing View: Arbitrage Settings Form Enhancements

In `js/views/pricing.view.js`, add the **Platform Maker Fee (%)** input control directly inside the `Arbitrage Settings` card grid alongside the existing spread and fiat fee controls:

```html
<!-- In Arbitrage Settings form-grid in pricing.view.js -->
<div class="form-group col-12 col-md-4">
  <label for="input-platform-fee-pct" class="form-label">
    <i data-lucide="shield-alert"></i> Platform Maker Fee (%)
  </label>
  <div class="input-affix-wrapper">
    <input type="number" step="0.01" min="0" max="5" id="input-platform-fee-pct" class="form-input font-mono" value="0.30">
    <span class="input-suffix">%</span>
  </div>
  <p class="form-helper">Bybit P2P maker fee (0.30% default)</p>
</div>

<div class="form-group col-12 col-md-4">
  <label for="input-inflow-fee" class="form-label">
    <i data-lucide="arrow-down-left"></i> Buy Payment Inflow Fee
  </label>
  <div class="input-affix-wrapper">
    <span class="input-prefix">₦</span>
    <input type="number" step="1" min="0" id="input-inflow-fee" class="form-input font-mono" value="50">
    <span class="input-suffix">NGN</span>
  </div>
  <p class="form-helper">Transfer fee paid when sending Naira</p>
</div>

<div class="form-group col-12 col-md-4">
  <label for="input-outflow-fee" class="form-label">
    <i data-lucide="arrow-up-right"></i> Sell Payment Outflow Fee
  </label>
  <div class="input-affix-wrapper">
    <span class="input-prefix">₦</span>
    <input type="number" step="1" min="0" id="input-outflow-fee" class="form-input font-mono" value="50">
    <span class="input-suffix">NGN</span>
  </div>
  <p class="form-helper">Stamp duty / fee when receiving Naira</p>
</div>
```

---

### 4.3 Buy Ad Assistant: Fee Breakdown, Net Profit & Optimal Limits UI

Inside the `Buy Ad Assistant` card in `pricing.view.js`, structure the display into three clear tiers:
1. **Market Benchmarks & Outbidding Targets**
2. **Comprehensive Fee Breakdown & True Cost Basis**
3. **Net Profit Impact & Optimal Order Limits Recommendation**

```html
<!-- Buy Ad Assistant Card Enhanced Layout -->
<div class="col-12 col-md-6 card">
  <div class="d-flex align-items-center justify-content-between mb-3">
    <div class="d-flex align-items-center gap-2">
      <div class="action-icon-box bg-blue-glow">
        <i data-lucide="arrow-down-left"></i>
      </div>
      <h3 class="card-title">Buy Ad Assistant <span class="badge badge-primary">Inflow</span></h3>
    </div>
    <span class="badge badge-neutral tiny" id="pricing-buy-maker-badge">0.30% Maker Fee</span>
  </div>
  
  <p class="text-secondary small mb-3" style="line-height: 1.4;">
    Prices competitor ads for your <strong>Buy Ad</strong> (where takers sell USDT to you for Naira).
  </p>
  
  <div class="d-flex flex-column gap-3">
    <!-- Row 1: Exit Price -->
    <div class="d-flex justify-content-between align-items-center">
      <span class="text-secondary small">Exit Price (Market Sell Ask):</span>
      <span class="font-mono fw-bold" id="pricing-exit-price">₦0.00</span>
    </div>

    <!-- Row 2: Top Competitor Buy -->
    <div class="d-flex justify-content-between align-items-center">
      <span class="text-secondary small">Top Competitor Buy:</span>
      <span class="font-mono fw-bold" id="pricing-top-buy-competitor">₦0.00</span>
    </div>

    <!-- Row 3: Max Buy Price Limit (Spread-Protected) -->
    <div class="d-flex justify-content-between align-items-center">
      <span class="text-secondary small">Max Buy Price Limit:</span>
      <span class="font-mono fw-bold text-warning" id="pricing-max-buy">₦0.00</span>
    </div>

    <!-- Fee Breakdown Sub-card / Accordion -->
    <div class="pricing-fee-breakdown-box p-2" style="background: rgba(10, 16, 28, 0.5); border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.06);">
      <div class="d-flex justify-content-between text-muted tiny mb-1">
        <span>Platform Fee (0.30%):</span>
        <span class="font-mono text-danger" id="pricing-buy-platform-fee">+₦0.00 / USDT</span>
      </div>
      <div class="d-flex justify-content-between text-muted tiny mb-1">
        <span>Inflow Transfer Fee (<span id="pricing-buy-vol-label">100</span> USDT):</span>
        <span class="font-mono text-danger" id="pricing-buy-inflow-fee-unit">+₦0.00 / USDT</span>
      </div>
      <div class="d-flex justify-content-between text-muted tiny fw-bold pt-1 border-top" style="border-color: rgba(255, 255, 255, 0.08) !important;">
        <span>Effective Buy Cost Basis:</span>
        <span class="font-mono text-accent" id="pricing-buy-effective-cost">₦0.00 / USDT</span>
      </div>
    </div>

    <!-- Recommended Rate Hero Display -->
    <div class="text-center py-2">
      <div class="text-muted small">RECOMMENDED BUY RATE</div>
      <div class="font-mono text-success fw-bold my-1" id="pricing-suggested-buy" style="font-size: 1.8rem;">₦0.00</div>
      <div id="pricing-buy-status" class="mt-2">
        <span class="badge badge-neutral">Offline</span>
      </div>
    </div>

    <!-- Net Profit & Optimal Limit Metrics Banner -->
    <div class="pricing-profit-summary p-2" style="background: rgba(16, 185, 129, 0.08); border-radius: 6px; border: 1px solid rgba(16, 185, 129, 0.2);">
      <div class="d-flex justify-content-between align-items-center mb-1">
        <span class="small text-secondary">Net Trade Profit (<span id="pricing-buy-profit-vol">100</span> USDT):</span>
        <span class="font-mono fw-bold text-success" id="pricing-buy-projected-profit">+₦0.00</span>
      </div>
      <div class="d-flex justify-content-between align-items-center">
        <span class="small text-secondary">Optimal Min Order Limit:</span>
        <span class="font-mono fw-semibold text-warning" id="pricing-buy-recommended-limit">≥ ₦30,000</span>
      </div>
      <div class="text-muted tiny mt-1" id="pricing-buy-fee-drag-hint">
        Fee drag: <span id="pricing-buy-fee-drag-pct">10.0%</span> of gross margin
      </div>
    </div>

    <button class="btn btn-sm btn-outline btn-block" id="btn-copy-buy-price">
      <i data-lucide="copy"></i>
      <span>Copy Buy Rate</span>
    </button>
  </div>
</div>
```

---

### 4.4 Sell Ad Assistant: Fee Breakdown, Net Profit & Optimal Limits UI

```html
<!-- Sell Ad Assistant Card Enhanced Layout -->
<div class="col-12 col-md-6 card">
  <div class="d-flex align-items-center justify-content-between mb-3">
    <div class="d-flex align-items-center gap-2">
      <div class="action-icon-box bg-emerald-glow">
        <i data-lucide="arrow-up-right"></i>
      </div>
      <h3 class="card-title">Sell Ad Assistant <span class="badge badge-primary">Outflow</span></h3>
    </div>
    <span class="badge badge-neutral tiny" id="pricing-sell-maker-badge">0.30% Maker Fee</span>
  </div>

  <p class="text-secondary small mb-3" style="line-height: 1.4;">
    Prices competitor ads for your <strong>Sell Ad</strong> (where takers buy USDT from you with Naira).
  </p>
  
  <div class="d-flex flex-column gap-3">
    <!-- Row 1: FIFO Holding Cost Basis -->
    <div class="d-flex justify-content-between align-items-center">
      <span class="text-secondary small">FIFO Holding Cost Basis:</span>
      <span class="font-mono fw-bold text-accent" id="pricing-cost-basis">₦0.00</span>
    </div>

    <!-- Row 2: Break-Even Sell Price -->
    <div class="d-flex justify-content-between align-items-center">
      <span class="text-secondary small">Break-Even Sell Price:</span>
      <span class="font-mono fw-bold" id="pricing-break-even">₦0.00</span>
    </div>

    <!-- Row 3: Target Sell Price -->
    <div class="d-flex justify-content-between align-items-center">
      <span class="text-secondary small">Target Sell Price:</span>
      <span class="font-mono fw-bold text-warning" id="pricing-target-sell-price">₦0.00</span>
    </div>

    <!-- Row 4: Top Competitor Sell -->
    <div class="d-flex justify-content-between align-items-center">
      <span class="text-secondary small">Top Competitor Sell:</span>
      <span class="font-mono fw-bold" id="pricing-top-sell-competitor">₦0.00</span>
    </div>

    <!-- Fee Breakdown Sub-card -->
    <div class="pricing-fee-breakdown-box p-2" style="background: rgba(10, 16, 28, 0.5); border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.06);">
      <div class="d-flex justify-content-between text-muted tiny mb-1">
        <span>Platform Fee (0.30%):</span>
        <span class="font-mono text-danger" id="pricing-sell-platform-fee">-₦0.00 / USDT</span>
      </div>
      <div class="d-flex justify-content-between text-muted tiny mb-1">
        <span>Outflow Transfer Fee (<span id="pricing-sell-vol-label">100</span> USDT):</span>
        <span class="font-mono text-danger" id="pricing-sell-outflow-fee-unit">-₦0.00 / USDT</span>
      </div>
      <div class="d-flex justify-content-between text-muted tiny fw-bold pt-1 border-top" style="border-color: rgba(255, 255, 255, 0.08) !important;">
        <span>Net Realized Sell Revenue:</span>
        <span class="font-mono text-accent" id="pricing-sell-net-revenue">₦0.00 / USDT</span>
      </div>
    </div>

    <!-- Recommended Rate Hero Display -->
    <div class="text-center py-2">
      <div class="text-muted small">RECOMMENDED SELL RATE</div>
      <div class="font-mono text-success fw-bold my-1" id="pricing-suggested-sell" style="font-size: 1.8rem;">₦0.00</div>
      <div id="pricing-sell-status" class="mt-2">
        <span class="badge badge-neutral">Offline</span>
      </div>
    </div>

    <!-- Net Profit & Optimal Limit Metrics Banner -->
    <div class="pricing-profit-summary p-2" style="background: rgba(16, 185, 129, 0.08); border-radius: 6px; border: 1px solid rgba(16, 185, 129, 0.2);">
      <div class="d-flex justify-content-between align-items-center mb-1">
        <span class="small text-secondary">Net Trade Profit (<span id="pricing-sell-profit-vol">100</span> USDT):</span>
        <span class="font-mono fw-bold text-success" id="pricing-sell-projected-profit">+₦0.00</span>
      </div>
      <div class="d-flex justify-content-between align-items-center">
        <span class="small text-secondary">Optimal Min Order Limit:</span>
        <span class="font-mono fw-semibold text-warning" id="pricing-sell-recommended-limit">≥ ₦30,000</span>
      </div>
      <div class="text-muted tiny mt-1" id="pricing-sell-fee-drag-hint">
        Fee drag: <span id="pricing-sell-fee-drag-pct">10.0%</span> of gross margin
      </div>
    </div>

    <button class="btn btn-sm btn-outline btn-block" id="btn-copy-sell-price">
      <i data-lucide="copy"></i>
      <span>Copy Sell Rate</span>
    </button>
  </div>
</div>
```

---

## 5. State Management, Persistence & Event Synchronization

### 5.1 LocalStorage Key Mapping & Data Contracts

| Configuration Key | Data Type | Default Value | Description |
|---|---|---|---|
| `bybit_p2p_pricing_platform_fee` | `string` | `'0.30'` | Platform Maker Fee % in Pricing Assistant |
| `bybit_p2p_pricing_inflow` | `string` | `'50'` | Buy fiat transfer fee in NGN |
| `bybit_p2p_pricing_outflow` | `string` | `'50'` | Sell fiat transfer fee in NGN |
| `bybit_p2p_pricing_spread` | `string` | `'5.0'` | Target spread per USDT in NGN |
| `bybit_p2p_pricing_volume` | `string` | `'100'` | Target trade volume in USDT |
| `bybit_p2p_pricing_mode` | `string` | `'avg-10'` | Competitor depth pricing mode |
| `bybit_p2p_pricing_depth_limit` | `string` | `'50'` | Orderbook sync depth |
| `bybit_p2p_pricing_filter_limits` | `string` | `'true'` | Filter ads by volume bounds |
| `bybit_p2p_settings` | `object` | JSON Object | Global Settings object (Maker fee, default fees, limits) |

### 5.2 Store Extension in `js/store.js`

```javascript
// Add to js/store.js
getSettings() {
  return this.getItem(STORAGE_KEYS.SETTINGS, {
    platformMakerFeePct: 0.30,
    defaultInflowFee: 50,
    defaultOutflowFee: 50,
    defaultTargetSpread: 5.0,
    defaultTargetVolume: 100,
    defaultMinOrderLimitNgn: 30000
  });
}

saveSettings(settings) {
  const current = this.getSettings();
  const updated = {
    ...current,
    ...settings,
    platformMakerFeePct: Number(settings.platformMakerFeePct !== undefined ? settings.platformMakerFeePct : current.platformMakerFeePct) || 0.30,
    defaultInflowFee: Number(settings.defaultInflowFee !== undefined ? settings.defaultInflowFee : current.defaultInflowFee) || 50,
    defaultOutflowFee: Number(settings.defaultOutflowFee !== undefined ? settings.defaultOutflowFee : current.defaultOutflowFee) || 50,
    defaultTargetSpread: Number(settings.defaultTargetSpread !== undefined ? settings.defaultTargetSpread : current.defaultTargetSpread) || 5.0,
    defaultTargetVolume: Number(settings.defaultTargetVolume !== undefined ? settings.defaultTargetVolume : current.defaultTargetVolume) || 100,
    defaultMinOrderLimitNgn: Number(settings.defaultMinOrderLimitNgn !== undefined ? settings.defaultMinOrderLimitNgn : current.defaultMinOrderLimitNgn) || 30000,
    updatedAt: new Date().toISOString()
  };

  this.saveItem(STORAGE_KEYS.SETTINGS, updated);

  // Sync to pricing individual keys for immediate backward-compatibility
  localStorage.setItem('bybit_p2p_pricing_platform_fee', updated.platformMakerFeePct.toString());
  localStorage.setItem('bybit_p2p_pricing_inflow', updated.defaultInflowFee.toString());
  localStorage.setItem('bybit_p2p_pricing_outflow', updated.defaultOutflowFee.toString());
  localStorage.setItem('bybit_p2p_pricing_spread', updated.defaultTargetSpread.toString());
  localStorage.setItem('bybit_p2p_pricing_volume', updated.defaultTargetVolume.toString());

  this.notify('settings', updated);
  return updated;
}
```

### 5.3 Event Synchronization Flowchart

```
+-------------------------------------------------------------------------------+
| User edits Fee Defaults in Settings View (#form-fee-defaults)                 |
+-------------------------------------------------------------------------------+
                                      │
                                      ▼
+-------------------------------------------------------------------------------+
| store.saveSettings({ platformMakerFeePct, defaultInflowFee, ... })            |
| - Updates STORAGE_KEYS.SETTINGS in localStorage                               |
| - Syncs individual bybit_p2p_pricing_* keys                                   |
| - Dispatches CustomEvent('store:updated', { detail: { type: 'settings' } })   |
+-------------------------------------------------------------------------------+
                                      │
         ┌────────────────────────────┴────────────────────────────┐
         ▼                                                         ▼
+------------------------------------+  +-------------------------------------+
| Settings Controller (js/settings.js)|  | Pricing Controller (js/pricing.js)  |
| - Shows success toast notification |  | - Receives store:updated('settings')|
| - Refreshes settings inputs        |  | - Reloads inputs via loadSavedSettings()
|                                    |  | - Calls calculateMargins() to update|
+------------------------------------+  |   fee breakdown, rates & limits     |
                                        +-------------------------------------+
```

---

## 6. Controller Implementation Specifications (`js/pricing.js`)

### 6.1 Loading & Saving Platform Fee in `pricing.js`

```javascript
function loadSavedSettings() {
  const platformFee = localStorage.getItem('bybit_p2p_pricing_platform_fee') || '0.30';
  const spread = localStorage.getItem('bybit_p2p_pricing_spread') || '5.0';
  const vol = localStorage.getItem('bybit_p2p_pricing_volume') || '100';
  const inflow = localStorage.getItem('bybit_p2p_pricing_inflow') || '50';
  const outflow = localStorage.getItem('bybit_p2p_pricing_outflow') || '50';
  const mode = localStorage.getItem('bybit_p2p_pricing_mode') || 'avg-10';
  const depthLimit = localStorage.getItem('bybit_p2p_pricing_depth_limit') || '50';
  const filterLimits = localStorage.getItem('bybit_p2p_pricing_filter_limits') !== 'false';

  const elPlatformFee = document.getElementById('input-platform-fee-pct');
  const elSpread = document.getElementById('input-target-spread');
  const elVol = document.getElementById('input-avg-volume');
  const elInflow = document.getElementById('input-inflow-fee');
  const elOutflow = document.getElementById('input-outflow-fee');
  const elMode = document.getElementById('input-pricing-mode');
  const elDepthLimit = document.getElementById('input-depth-limit');
  const elFilterLimits = document.getElementById('input-filter-limits');

  if (elPlatformFee) elPlatformFee.value = platformFee;
  if (elSpread) elSpread.value = spread;
  if (elVol) elVol.value = vol;
  if (elInflow) elInflow.value = inflow;
  if (elOutflow) elOutflow.value = outflow;
  if (elMode) elMode.value = mode;
  if (elDepthLimit) elDepthLimit.value = depthLimit;
  if (elFilterLimits) elFilterLimits.checked = filterLimits;
}

function saveSettings() {
  const elPlatformFee = document.getElementById('input-platform-fee-pct');
  const elSpread = document.getElementById('input-target-spread');
  const elVol = document.getElementById('input-avg-volume');
  const elInflow = document.getElementById('input-inflow-fee');
  const elOutflow = document.getElementById('input-outflow-fee');
  const elMode = document.getElementById('input-pricing-mode');
  const elDepthLimit = document.getElementById('input-depth-limit');
  const elFilterLimits = document.getElementById('input-filter-limits');

  if (elPlatformFee) localStorage.setItem('bybit_p2p_pricing_platform_fee', elPlatformFee.value);
  if (elSpread) localStorage.setItem('bybit_p2p_pricing_spread', elSpread.value);
  if (elVol) localStorage.setItem('bybit_p2p_pricing_volume', elVol.value);
  if (elInflow) localStorage.setItem('bybit_p2p_pricing_inflow', elInflow.value);
  if (elOutflow) localStorage.setItem('bybit_p2p_pricing_outflow', elOutflow.value);
  if (elMode) localStorage.setItem('bybit_p2p_pricing_mode', elMode.value);
  if (elDepthLimit) localStorage.setItem('bybit_p2p_pricing_depth_limit', elDepthLimit.value);
  if (elFilterLimits) localStorage.setItem('bybit_p2p_pricing_filter_limits', elFilterLimits.checked.toString());
}
```

### 6.2 Binding Calculation Results in `calculateMargins()`

```javascript
// Inside calculateMargins() in js/pricing.js:
const platformFeePct = parseFloat(document.getElementById('input-platform-fee-pct')?.value) || 0.30;
const targetSpread = parseFloat(document.getElementById('input-target-spread')?.value) || 5.0;
const avgVolume = parseFloat(document.getElementById('input-avg-volume')?.value) || 100.0;
const inflowFee = parseFloat(document.getElementById('input-inflow-fee')?.value) || 50.0;
const outflowFee = parseFloat(document.getElementById('input-outflow-fee')?.value) || 50.0;
const pricingMode = document.getElementById('input-pricing-mode')?.value || 'avg-10';

// A. BUY SIDE
const buyAnalysis = calculateBuyPricing({
  activeBuyAds,
  sortedSellAds,
  targetSpread,
  inflowFee,
  platformFeePct,
  avgVolume,
  pricingMode
});

// Update Buy Side UI Elements:
const elBuyPlatformFee = document.getElementById('pricing-buy-platform-fee');
const elBuyInflowUnit = document.getElementById('pricing-buy-inflow-fee-unit');
const elBuyEffectiveCost = document.getElementById('pricing-buy-effective-cost');
const elBuyProjectedProfit = document.getElementById('pricing-buy-projected-profit');
const elBuyRecLimit = document.getElementById('pricing-buy-recommended-limit');
const elBuyFeeDragHint = document.getElementById('pricing-buy-fee-drag-hint');
const elBuyMakerBadge = document.getElementById('pricing-buy-maker-badge');

if (elBuyMakerBadge) elBuyMakerBadge.textContent = `${platformFeePct.toFixed(2)}% Maker Fee`;
if (elBuyPlatformFee) elBuyPlatformFee.textContent = `+${formatNGN(buyAnalysis.platformFeeAmount || 0)} / USDT`;
if (elBuyInflowUnit) elBuyInflowUnit.textContent = `+${formatNGN(buyAnalysis.inflowFeePerUnit || 0)} / USDT`;
if (elBuyEffectiveCost) elBuyEffectiveCost.textContent = formatNGN(buyAnalysis.effectiveCostBasis || 0);
if (elBuyProjectedProfit) {
  const p = buyAnalysis.projectedNetProfit || 0;
  elBuyProjectedProfit.textContent = `${p >= 0 ? '+' : ''}${formatNGN(p)}`;
  elBuyProjectedProfit.className = `font-mono fw-bold ${p >= 0 ? 'text-success' : 'text-danger'}`;
}
if (elBuyRecLimit) {
  elBuyRecLimit.textContent = `≥ ${formatNGN(buyAnalysis.recommendedMinLimitNgn || 30000, 0)}`;
}
if (elBuyFeeDragHint) {
  const dragPct = buyAnalysis.feeDragPct || 0;
  elBuyFeeDragHint.innerHTML = `Fee drag: <span class="${dragPct > 25 ? 'text-warning' : 'text-muted'}">${dragPct.toFixed(1)}%</span> of gross margin`;
}

// B. SELL SIDE
const sellAnalysis = calculateSellPricing({
  activeSellAds,
  costBasis,
  targetSpread,
  outflowFee,
  platformFeePct,
  avgVolume,
  pricingMode
});

// Update Sell Side UI Elements:
const elSellPlatformFee = document.getElementById('pricing-sell-platform-fee');
const elSellOutflowUnit = document.getElementById('pricing-sell-outflow-fee-unit');
const elSellNetRevenue = document.getElementById('pricing-sell-net-revenue');
const elSellProjectedProfit = document.getElementById('pricing-sell-projected-profit');
const elSellRecLimit = document.getElementById('pricing-sell-recommended-limit');
const elSellFeeDragHint = document.getElementById('pricing-sell-fee-drag-hint');
const elSellMakerBadge = document.getElementById('pricing-sell-maker-badge');

if (elSellMakerBadge) elSellMakerBadge.textContent = `${platformFeePct.toFixed(2)}% Maker Fee`;
if (elSellPlatformFee) elSellPlatformFee.textContent = `-${formatNGN(sellAnalysis.platformFeeAmount || 0)} / USDT`;
if (elSellOutflowUnit) elSellOutflowUnit.textContent = `-${formatNGN(sellAnalysis.outflowFeePerUnit || 0)} / USDT`;
if (elSellNetRevenue) elSellNetRevenue.textContent = formatNGN(sellAnalysis.netRealizedRevenue || 0);
if (elSellProjectedProfit) {
  const p = sellAnalysis.projectedNetProfit || 0;
  elSellProjectedProfit.textContent = `${p >= 0 ? '+' : ''}${formatNGN(p)}`;
  elSellProjectedProfit.className = `font-mono fw-bold ${p >= 0 ? 'text-success' : 'text-danger'}`;
}
if (elSellRecLimit) {
  elSellRecLimit.textContent = `≥ ${formatNGN(sellAnalysis.recommendedMinLimitNgn || 30000, 0)}`;
}
if (elSellFeeDragHint) {
  const dragPct = sellAnalysis.feeDragPct || 0;
  elSellFeeDragHint.innerHTML = `Fee drag: <span class="${dragPct > 25 ? 'text-warning' : 'text-muted'}">${dragPct.toFixed(1)}%</span> of gross margin`;
}
```

---

## 7. Verification & Automated Testing Plan

### 7.1 Mathematical Precision Test Suite (`test/tier1-feature-coverage/pricing-engine.test.js`)
The unit tests must verify:
1. **Platform Fee Integration**:
   - `calculateBuyPricing` with `platformFeePct = 0.30%`, `inflowFee = 50`, `avgVolume = 100`, `exitPrice = 1520`, `targetSpread = 5.0`.
   - `maxBuyPrice = (1520 - 5.0 - 0.50) / (1 + 0.003) = 1514.50 / 1.003 = 1509.97 NGN`.
   - `calculateSellPricing` with `costBasis = 1500`, `platformFeePct = 0.30%`, `outflowFee = 50`, `avgVolume = 100`, `targetSpread = 5.0`.
   - `breakEven = (1500 + 0.50) / (1 - 0.003) = 1500.50 / 0.997 = 1505.015 NGN`.
   - `targetSellPrice = (1500 + 5.0 + 0.50) / 0.997 = 1505.50 / 0.997 = 1510.03 NGN`.
2. **Varying Trade Sizes Matrix (₦5k, ₦10k, ₦30k, ₦100k)**:
   - Verify that small order sizes (e.g. ₦5,000 / 3.33 USDT) correctly calculate the heavy fee drag ($50 / 3.33 = 15.00 \text{ NGN/USDT}$) and flag unsafe or compressed margins.
   - Verify that recommended order limits output sensible thresholds ($\ge \text{₦}30,000$).
3. **Boundary Resilience**:
   - `platformFeePct = 0` (backward-compatible fallback).
   - `avgVolume = 0` / `NaN` (safe fallback to 100).
   - `inflowFee = 0`, `outflowFee = 0`.

### 7.2 UI Data-Binding Verification
- Check that changing `#input-platform-fee-pct` dynamically recalculates all displayed sub-metrics without page reload.
- Check that submitting `#form-fee-defaults` in Settings saves to `localStorage`, updates the store, and synchronizes the Pricing view via `store:updated`.

---

## 8. Summary of Proposed File Modifications

| File Path | Proposed Changes |
|---|---|
| `js/views/pricing.view.js` | Add `input-platform-fee-pct` to Arbitrage Settings grid; add fee breakdown cards, net profit banners, and recommended order limits to Buy and Sell Assistant cards. |
| `js/pricing.js` | Bind `input-platform-fee-pct` on load/save; pass `platformFeePct` to pricing engine; render fee breakdown, net revenue/cost basis, net profit, and optimal limits. |
| `js/views/settings.view.js` | Add "Trading Fees & Arbitrage Defaults" card (`#form-fee-defaults`) with inputs for platform maker fee, default inflow/outflow fees, target spread, and limits. |
| `js/settings.js` | Add submit handler for `#form-fee-defaults`; populate saved defaults; trigger `store:updated` event. |
| `js/store.js` | Implement `getSettings()` and `saveSettings()` methods using `STORAGE_KEYS.SETTINGS`; mirror settings to `localStorage` pricing keys. |
| `js/pricingEngine.js` | Incorporate `platformFeePct` into Buy & Sell math formulas; return fee breakdown, effective cost/revenue, projected net profit, fee drag %, and recommended order limits. |
| `test/tier1-feature-coverage/pricing-engine.test.js` | Add unit test assertions covering simultaneous percentage platform fee and fixed fiat fee calculations across ₦5k, ₦10k, ₦30k, ₦100k trade tiers. |
