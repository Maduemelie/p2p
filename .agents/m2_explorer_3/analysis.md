# Milestone 2: Delta Comparison & Badge Explorer Analysis

**Agent**: `m2_explorer_3` (Role: M2 Delta Comparison & Badge Explorer)  
**Date**: 2026-08-25  
**Mission**: Forensic investigation, mathematical specification, DOM rendering architecture, and test suite definitions for Live Net Worth Delta Comparison against historical snapshots and dynamic Delta Badge rendering on the Dashboard Widget.

---

## 1. Executive Summary

Milestone 2 (M2) requires the Dashboard's Hero Net Worth Widget to calculate and display the live difference (delta) between the current real-time Net Worth (NGN & USDT) and the user's latest recorded historical snapshot from `store.getSnapshots()`.

This analysis provides:
1. **Latest Snapshot Determination**: Chronological sorting, edge-case sanitization, and extraction from `store.getSnapshots()`.
2. **Mathematical Delta Engine**: Exhaustive behavior analysis of `calculateSnapshotDelta(current, previous)` across standard gains/losses, zero baselines, negative baselines (overdrafts), and micro-deltas.
3. **Four Visual Badge States**: Exact DOM markup, CSS classes (`.badge-success`, `.badge-danger`, `.badge-neutral`), Lucide icons (`trending-up`, `trending-down`, `minus`, `info`), and dual-currency formatting.
4. **Complete Implementation Blueprint**: Pure helper functions (`formatDeltaBadgeText`, `formatDeltaUsdtText`) and the reactive DOM updater (`updateNetWorthDeltaBadge`) ready for seamless integration into `js/dashboard.js` and `js/utils.js`.
5. **Comprehensive Test Suite Specifications**: 16 dedicated unit and integration test cases covering calculations, formatting, DOM mutations, and reactive store lifecycles.

---

## 2. Baseline Snapshot Retrieval & Sanitization

### 2.1 Store API Contract
Snapshots are retrieved via `store.getSnapshots()` (`js/store.js:310–325`), which returns an array sorted chronologically ascending (oldest first):
```javascript
const snapshots = store.getSnapshots ? store.getSnapshots() : [];
const latestSnapshot = Array.isArray(snapshots) && snapshots.length > 0 
  ? snapshots[snapshots.length - 1] 
  : null;
```

### 2.2 Defensive Sanitization for Corrupted Records
In real-world usage or third-party backup imports, snapshot data might contain corrupt entries. To ensure UI stability:
```javascript
/**
 * Safely extract the latest valid historical snapshot record.
 * @param {Array<Object>} snapshots - Chronological array from store.getSnapshots()
 * @returns {Object|null} Most recent valid snapshot or null
 */
export function getLatestValidSnapshot(snapshots) {
  if (!Array.isArray(snapshots) || snapshots.length === 0) return null;
  for (let i = snapshots.length - 1; i >= 0; i--) {
    const snap = snapshots[i];
    if (snap && typeof snap === 'object') {
      const ngn = Number(snap.netWorthNgn !== undefined ? snap.netWorthNgn : snap.bankCash);
      if (!isNaN(ngn) && isFinite(ngn)) {
        return snap;
      }
    }
  }
  return null;
}
```

---

## 3. Mathematical Delta Calculation Engine

### 3.1 Contract: `calculateSnapshotDelta(current, previous)`
Defined in `js/utils.js:510–542`:
$$\Delta_{\text{NGN}} = \text{NW}_{\text{current, NGN}} - \text{NW}_{\text{prev, NGN}}$$
$$\%\Delta_{\text{NGN}} = \begin{cases} \left(\frac{\Delta_{\text{NGN}}}{|\text{NW}_{\text{prev, NGN}}|}\right) \times 100 & \text{if } |\text{NW}_{\text{prev, NGN}}| > 10^{-6} \\ 0 & \text{otherwise} \end{cases}$$

$$\Delta_{\text{USDT}} = \text{NW}_{\text{current, USDT}} - \text{NW}_{\text{prev, USDT}}$$
$$\%\Delta_{\text{USDT}} = \begin{cases} \left(\frac{\Delta_{\text{USDT}}}{|\text{NW}_{\text{prev, USDT}}|}\right) \times 100 & \text{if } |\text{NW}_{\text{prev, USDT}}| > 10^{-6} \\ 0 & \text{otherwise} \end{cases}$$

### 3.2 Edge Cases & Forensic Verification Matrix

| Case # | Scenario | Live Net Worth | Latest Snapshot | $\Delta_{\text{NGN}}$ | $\%\Delta_{\text{NGN}}$ | Handling Rationale |
|---|---|---|---|---|---|---|
| **E1** | **Normal Gain** | ₦3,300,000 (2,200 USDT) | ₦3,000,000 (2,000 USDT) | `+300,000.00` | `+10.00%` | Standard positive growth |
| **E2** | **Normal Loss** | ₦3,800,000 (2,375 USDT) | ₦4,000,000 (2,500 USDT) | `-200,000.00` | `-5.00%` | Standard negative drawdown |
| **E3** | **Zero Delta** | ₦3,500,000 (2,300 USDT) | ₦3,500,000 (2,300 USDT) | `0.00` | `0.00%` | Flat performance |
| **E4** | **First Run / No Snapshots** | ₦3,500,000 (2,300 USDT) | `null` | `0.00` | `0.00%` | Null baseline guard returns zeros |
| **E5** | **Zero Baseline ($\text{NW}_{\text{prev}} = 0$)** | ₦1,000,000 (666.67 USDT) | ₦0.00 (0.00 USDT) | `+1,000,000.00` | `0.00%` | Division-by-zero protection returns `0.00%` instead of `Infinity%` |
| **E6** | **Negative Baseline (Recovery)** | ₦1,000,000 (666.67 USDT) | -₦500,000 (-333.33 USDT) | `+1,500,000.00` | `+300.00%` | Denominator uses $|\text{NW}_{\text{prev}}|$, yielding $+300.00\%$ |
| **E7** | **Negative Baseline (Debt Reduction)** | -₦50,000 (-33.33 USDT) | -₦100,000 (-66.67 USDT) | `+50,000.00` | `+50.00%` | Improvement in negative territory yields positive sign |
| **E8** | **Negative Baseline (Debt Increase)** | -₦150,000 (-100 USDT) | -₦100,000 (-66.67 USDT) | `-50,000.00` | `-50.00%` | Deepening deficit yields negative sign |
| **E9** | **Micro-Deltas** | ₦100,000,001.00 | ₦100,000,000.00 | `+1.00` | `0.00%` | Rounded to 2 decimals cleanly |
| **E10** | **Corrupt / Partial Fields** | `{ netWorthNgn: 2000000 }` | `{ netWorthNgn: 1000000 }` | `+1,000,000.00` | `+100.00%` | Missing USDT defaults to 0 without `NaN` |

---

## 4. Visual Badge States & Design System Specifications

### 4.1 Design System Integration (`css/styles.css`)
Existing badge classes from `css/styles.css:1335–1344`:
- `.badge`: Base pill styling (`display: inline-flex; align-items: center; gap: 4px; border-radius: var(--radius-full); font-weight: 600; font-size: var(--text-tiny); padding: 2px 8px;`).
- `.badge-success`: `background: var(--success-subtle); color: var(--success);` (`#10B981`)
- `.badge-danger`: `background: var(--danger-subtle); color: var(--danger);` (`#F43F5E`)
- `.badge-neutral`: `background: var(--bg-active); color: var(--text-secondary);` (`#94A3B8`)

### 4.2 Four Badge Rendering States

#### State 1: Positive Delta ($\Delta_{\text{NGN}} > +0.005$)
```html
<span class="badge badge-success" id="badge-net-worth-delta" title="+200.00 USDT vs 25 Aug 2026, 12:00 PM">
  <i data-lucide="trending-up"></i>
  <span>+₦300,000.00 (+10.00%)</span>
</span>
```
- **Class**: `.badge.badge-success`
- **Icon**: `trending-up`
- **Text Format**: `+₦{absFormatted} (+{pct}%)`
- **Subtext / Tooltip**: `+{usdtDelta} USDT vs {snapshotTimestamp}`

#### State 2: Negative Delta ($\Delta_{\text{NGN}} < -0.005$)
```html
<span class="badge badge-danger" id="badge-net-worth-delta" title="-125.00 USDT vs 25 Aug 2026, 12:00 PM">
  <i data-lucide="trending-down"></i>
  <span>-₦200,000.00 (-5.00%)</span>
</span>
```
- **Class**: `.badge.badge-danger`
- **Icon**: `trending-down`
- **Text Format**: `-₦{absFormatted} (-{pct}%)`
- **Subtext / Tooltip**: `-{usdtDelta} USDT vs {snapshotTimestamp}`

#### State 3: Zero / No Change ($|\Delta_{\text{NGN}}| \le 0.005$ with existing snapshot)
```html
<span class="badge badge-neutral" id="badge-net-worth-delta" title="0.00 USDT vs 25 Aug 2026, 12:00 PM">
  <i data-lucide="minus"></i>
  <span>₦0.00 (0.00%)</span>
</span>
```
- **Class**: `.badge.badge-neutral`
- **Icon**: `minus`
- **Text Format**: `₦0.00 (0.00%)`
- **Subtext / Tooltip**: `0.00 USDT vs {snapshotTimestamp}`

#### State 4: First-Run ($0$ snapshots recorded in store)
```html
<span class="badge badge-neutral" id="badge-net-worth-delta" title="Save an End-of-Day snapshot to establish a baseline for daily delta tracking.">
  <i data-lucide="info"></i>
  <span>Baseline on next snapshot</span>
</span>
```
- **Class**: `.badge.badge-neutral`
- **Icon**: `info`
- **Text Format**: `Baseline on next snapshot` (or `Baseline established on snapshot save`)
- **Subtext**: `No prior snapshot recorded`

---

## 5. Code Implementation Blueprint

### 5.1 Formatting Utility (`js/utils.js`)
```javascript
/**
 * Format delta badge text with explicit sign (+ or -) and 2-decimal percentage.
 * Matching requirement F9.6.
 * 
 * @param {number} deltaNgn - Difference in NGN
 * @param {number} pctDeltaNgn - Percentage difference
 * @returns {string} e.g. "+₦150,000.00 (+5.00%)" or "-₦75,000.00 (-2.50%)"
 */
export function formatDeltaBadgeText(deltaNgn, pctDeltaNgn) {
  const dNgn = Number(deltaNgn) || 0;
  const pNgn = Number(pctDeltaNgn) || 0;
  
  if (Math.abs(dNgn) <= 0.005) {
    return '₦0.00 (0.00%)';
  }
  
  const sign = dNgn > 0 ? '+' : '';
  const pctSign = pNgn > 0 ? '+' : '';
  return `${sign}${formatNGN(dNgn)} (${pctSign}${pNgn.toFixed(2)}%)`;
}

/**
 * Format delta USDT string.
 * @param {number} deltaUsdt
 * @returns {string} e.g. "+150.00 USDT" or "-50.00 USDT"
 */
export function formatDeltaUsdtText(deltaUsdt) {
  const dUsdt = Number(deltaUsdt) || 0;
  if (Math.abs(dUsdt) <= 0.005) {
    return '0.00 USDT';
  }
  const sign = dUsdt > 0 ? '+' : '-';
  return `${sign}${Math.abs(dUsdt).toFixed(2)} USDT`;
}
```

### 5.2 Dynamic Badge Updater (`js/dashboard.js`)
```javascript
/**
 * Render or update the Live Net Worth Delta Badge.
 * Compares live Net Worth against the latest historical snapshot.
 * 
 * @param {{ netWorthNgn: number, netWorthUsdt: number }} liveNetWorth - Current calculated net worth
 * @param {Object|null} latestSnapshot - Latest snapshot from store.getSnapshots()
 * @param {HTMLElement|null} badgeEl - DOM element (#badge-net-worth-delta)
 * @param {HTMLElement|null} [subtextEl=null] - Optional detail DOM element (#stat-net-worth-delta-subtext)
 */
export function updateNetWorthDeltaBadge(liveNetWorth, latestSnapshot, badgeEl, subtextEl = null) {
  if (!badgeEl) return;

  // 1. First Run: No historical snapshot recorded
  if (!latestSnapshot || typeof latestSnapshot !== 'object') {
    badgeEl.className = 'badge badge-neutral';
    badgeEl.innerHTML = `
      <i data-lucide="info"></i>
      <span>Baseline on next snapshot</span>
    `;
    badgeEl.setAttribute('title', 'Save an End-of-Day snapshot to establish a baseline for daily delta tracking.');
    
    if (subtextEl) {
      subtextEl.textContent = 'No prior snapshot recorded';
      subtextEl.className = 'hero-stat-delta text-muted';
    }
    
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  // 2. Compute delta against latest snapshot
  const delta = calculateSnapshotDelta(liveNetWorth, latestSnapshot);
  const { deltaNgn, pctDeltaNgn, deltaUsdt } = delta;
  const snapshotDateStr = latestSnapshot.timestamp ? formatDateTime(latestSnapshot.timestamp) : 'latest snapshot';

  // 3. Positive Growth (> +0.005 NGN)
  if (deltaNgn > 0.005) {
    const textNgn = `+${formatNGN(deltaNgn)} (+${pctDeltaNgn.toFixed(2)}%)`;
    const textUsdt = formatDeltaUsdtText(deltaUsdt);

    badgeEl.className = 'badge badge-success';
    badgeEl.innerHTML = `
      <i data-lucide="trending-up"></i>
      <span>${textNgn}</span>
    `;
    badgeEl.setAttribute('title', `${textUsdt} vs ${snapshotDateStr}`);

    if (subtextEl) {
      subtextEl.textContent = `${textUsdt} vs ${snapshotDateStr}`;
      subtextEl.className = 'hero-stat-delta text-success';
    }
  }
  // 4. Negative Drop (< -0.005 NGN)
  else if (deltaNgn < -0.005) {
    const textNgn = `${formatNGN(deltaNgn)} (${pctDeltaNgn.toFixed(2)}%)`;
    const textUsdt = formatDeltaUsdtText(deltaUsdt);

    badgeEl.className = 'badge badge-danger';
    badgeEl.innerHTML = `
      <i data-lucide="trending-down"></i>
      <span>${textNgn}</span>
    `;
    badgeEl.setAttribute('title', `${textUsdt} vs ${snapshotDateStr}`);

    if (subtextEl) {
      subtextEl.textContent = `${textUsdt} vs ${snapshotDateStr}`;
      subtextEl.className = 'hero-stat-delta text-danger';
    }
  }
  // 5. Zero / Neutral (within [-0.005, +0.005])
  else {
    const textNgn = '₦0.00 (0.00%)';
    badgeEl.className = 'badge badge-neutral';
    badgeEl.innerHTML = `
      <i data-lucide="minus"></i>
      <span>${textNgn}</span>
    `;
    badgeEl.setAttribute('title', `0.00 USDT vs ${snapshotDateStr}`);

    if (subtextEl) {
      subtextEl.textContent = `0.00 USDT vs ${snapshotDateStr}`;
      subtextEl.className = 'hero-stat-delta text-muted';
    }
  }

  if (window.lucide) window.lucide.createIcons();
}
```

---

## 6. Comprehensive Test Specifications

Below are the 16 exact test specifications recommended for inclusion in the test suite:

### Section A: Mathematical Delta Tests (`calculateSnapshotDelta`)
1. **`T-DELTA-1`**: Standard positive growth calculation ($+₦300,000$, $+10.00\%$, $+200.00\text{ USDT}$).
2. **`T-DELTA-2`**: Standard negative drop calculation ($-₦200,000$, $-5.00\%$, $-125.00\text{ USDT}$).
3. **`T-DELTA-3`**: Exact equality / zero change ($0\text{ NGN}$, $0.00\%$).
4. **`T-DELTA-4`**: Division-by-zero guard when previous snapshot was $0\text{ NGN}$ (returns $0.00\%$, not `Infinity` or `NaN`).
5. **`T-DELTA-5`**: Negative baseline recovery ($-500\text{k}$ to $+1.0\text{M}$ yields $+₦1.5\text{M}$, $+300.00\%$).
6. **`T-DELTA-6`**: Negative baseline deficit deepening ($-100\text{k}$ to $-150\text{k}$ yields $-₦50\text{k}$, $-50.00\%$).
7. **`T-DELTA-7`**: Null / undefined inputs return all 0s cleanly.
8. **`T-DELTA-8`**: Micro-delta rounding ($1\text{ NGN}$ difference on $100\text{M}$ rounds to $0.00\%$).

### Section B: Text Formatting Tests (`formatDeltaBadgeText`)
9. **`T-FMT-1`**: Formats positive NGN change with leading `+` and sign in percentage: `+₦150,000.00 (+5.00%)`.
10. **`T-FMT-2`**: Formats negative NGN change with leading `-` and sign in percentage: `-₦75,000.00 (-2.50%)`.
11. **`T-FMT-3`**: Formats zero change neutrally: `₦0.00 (0.00%)`.
12. **`T-FMT-4`**: Handles large numbers with commas: `+₦10,500,250.75 (+12.50%)`.

### Section C: DOM Badge Rendering & Reactivity Tests (`updateNetWorthDeltaBadge`)
13. **`T-DOM-1`**: Renders neutral first-run badge when `latestSnapshot` is `null` (`.badge-neutral`, `"Baseline on next snapshot"`).
14. **`T-DOM-2`**: Renders green `.badge-success` with `trending-up` icon for positive live delta.
15. **`T-DOM-3`**: Renders red `.badge-danger` with `trending-down` icon for negative live delta.
16. **`T-DOM-4`**: Reactively updates badge baseline when a new snapshot is saved, deleted, or cleared.
