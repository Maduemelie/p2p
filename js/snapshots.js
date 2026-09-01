/**
 * Bybit NGN P2P Trade Tracker — Net Worth & Snapshot Controller Module
 * Handles End-of-Day snapshot captures, live dual-currency valuation,
 * Chart.js net worth trend analytics, and historical snapshot ledger.
 */

import { store } from './store.js';
import {
  formatNGN,
  formatUSDT,
  formatRate,
  formatDateTime,
  getLocalIsoDateTime,
  calculateFIFOInventoryAndPnL,
  calculateTotalBankCash,
  resolveReferenceRate,
  calculateNetWorth,
  calculateSnapshotDelta,
  formatDeltaBadgeText,
  formatDeltaUsdtText,
  escapeHtml
} from './utils.js';

// Chart.js instance and filter state for Net Worth Trend
let netWorthChartInstance = null;
let currentNetWorthChartCurrency = 'both';
let isSnapshotLogExpanded = true;

// Shared reference state updated from live ad & balance queries
let latestActiveAd = null;
let latestLiveUsdt = null;

// Module-level cache for modal calculation state
let currentModalBankCash = 0;
let currentModalUsdt = 0;

/**
 * Set the latest active sell ad reference
 * @param {Object|null} ad
 */
export function setActiveAd(ad) {
  latestActiveAd = ad;
}

/**
 * Get the latest active sell ad reference
 * @returns {Object|null}
 */
export function getActiveAd() {
  return latestActiveAd;
}

/**
 * Set the latest live USDT balance reference
 * @param {number|null} usdt
 */
export function setLiveUsdt(usdt) {
  latestLiveUsdt = usdt;
}

/**
 * Get the latest live USDT balance reference
 * @returns {number|null}
 */
export function getLiveUsdt() {
  return latestLiveUsdt;
}

/**
 * Render Live Net Worth Dashboard Widget (#card-net-worth)
 * Computes dual-currency valuation (NGN & USDT) from reactive bank cash ledger,
 * live Bybit funding USDT balance (or FIFO fallback), and priority reference rate.
 * Renders live delta badge vs latest historical snapshot.
 */
export function renderNetWorthWidget() {
  const elNetWorthNgn = document.getElementById('stat-net-worth-ngn');
  const elNetWorthUsdt = document.getElementById('stat-net-worth-usdt');
  const elNwBankCash = document.getElementById('metric-nw-bank-cash');
  const elNwBybitUsdt = document.getElementById('metric-nw-bybit-usdt');
  const elNwRefRate = document.getElementById('metric-nw-ref-rate');
  const elBadgeDelta = document.getElementById('badge-net-worth-delta');

  // If hero card elements are not present, exit cleanly
  if (!elNetWorthNgn && !elNetWorthUsdt && !elNwBankCash && !elBadgeDelta) return;

  const trades = store.getTrades();
  const openingInventory = store.getOpeningInventory();
  const fifoResult = calculateFIFOInventoryAndPnL(trades, openingInventory);

  // 1. Total Bank Cash
  const computedBankBalances = store.getComputedBankBalances ? store.getComputedBankBalances() : new Map();
  const totalBankCash = calculateTotalBankCash(computedBankBalances);

  // 2. Total USDT (Live Bybit balance fallback to FIFO inventory)
  const isLiveUsdt = latestLiveUsdt !== null && latestLiveUsdt !== undefined && !isNaN(latestLiveUsdt);
  const totalUsdt = isLiveUsdt ? latestLiveUsdt : (fifoResult.remainingInventoryUSDT || 0);

  // 3. Reference Exchange Rate Resolution (5-tier priority hierarchy)
  const referenceRate = resolveReferenceRate({
    activeSellAd: latestActiveAd,
    latestTrade: trades,
    fifoAvgBuyCost: fifoResult.avgHoldingCostPerUSDT,
    openingDefaultRate: openingInventory?.defaultCostBasis,
    openingInventory: openingInventory,
    fallbackRate: 1500.00
  });

  // 4. Dual-Currency Net Worth Calculation
  const { netWorthNgn, netWorthUsdt } = calculateNetWorth(totalBankCash, totalUsdt, referenceRate);

  // 5. Update Primary Valuation
  if (elNetWorthNgn) {
    elNetWorthNgn.textContent = formatNGN(netWorthNgn);
    elNetWorthNgn.className = `net-worth-hero-value font-mono ${netWorthNgn >= 0 ? 'text-success' : 'text-danger'}`;
  }

  if (elNetWorthUsdt) {
    elNetWorthUsdt.textContent = formatUSDT(netWorthUsdt);
  }

  // 6. Update Breakdown Sub-metrics
  if (elNwBankCash) {
    elNwBankCash.textContent = formatNGN(totalBankCash);
  }

  if (elNwBybitUsdt) {
    elNwBybitUsdt.textContent = formatUSDT(totalUsdt);
  }

  if (elNwRefRate) {
    elNwRefRate.textContent = formatRate(referenceRate);
  }

  // 7. Update Live Delta Comparison Badge
  if (elBadgeDelta) {
    const snapshots = store.getSnapshots ? store.getSnapshots() : [];
    if (snapshots && snapshots.length > 0) {
      const latestSnapshot = snapshots[snapshots.length - 1];
      const delta = calculateSnapshotDelta({ netWorthNgn, netWorthUsdt }, latestSnapshot);

      const isPositive = delta.deltaNgn > 0.005;
      const isNegative = delta.deltaNgn < -0.005;

      const badgeClass = isPositive ? 'badge-success' : (isNegative ? 'badge-danger' : 'badge-neutral');
      const icon = isPositive ? 'trending-up' : (isNegative ? 'trending-down' : 'minus');
      const badgeText = formatDeltaBadgeText(delta.deltaNgn, delta.pctDeltaNgn);
      const usdtText = formatDeltaUsdtText(delta.deltaUsdt);
      const snapshotDateStr = latestSnapshot.timestamp ? formatDateTime(latestSnapshot.timestamp) : 'latest snapshot';

      elBadgeDelta.className = `badge ${badgeClass}`;
      elBadgeDelta.innerHTML = `
        <i data-lucide="${icon}"></i>
        <span>${badgeText}</span>
      `;
      elBadgeDelta.title = `${usdtText} vs ${snapshotDateStr}`;
    } else {
      elBadgeDelta.className = 'badge badge-neutral';
      elBadgeDelta.innerHTML = `
        <i data-lucide="info"></i>
        <span>Baseline on next snapshot</span>
      `;
      elBadgeDelta.title = 'Save an End-of-Day snapshot to establish a baseline for daily delta tracking.';
    }
  }

  if (window.lucide) window.lucide.createIcons();
}

/**
 * Setup event listeners for the End Day / Save Net Worth Snapshot modal
 */
export function setupSnapshotModalEvents() {
  const btnOpenSnapshot = document.getElementById('btn-open-snapshot-modal');
  const modalBackdrop = document.getElementById('modal-snapshot-backdrop');
  const btnClose = document.getElementById('btn-close-snapshot-modal');
  const btnCancel = document.getElementById('btn-cancel-snapshot-modal') || document.getElementById('btn-cancel-snapshot');
  const inputRate = document.getElementById('input-snapshot-ref-rate') || document.getElementById('snapshot-reference-rate');
  const form = document.getElementById('form-save-snapshot');
  const notesInput = document.getElementById('input-snapshot-notes') || document.getElementById('snapshot-notes');
  const notesCounter = document.getElementById('snapshot-notes-counter');

  btnOpenSnapshot?.addEventListener('click', () => {
    if (typeof window.openSaveSnapshotModal === 'function') {
      window.openSaveSnapshotModal();
      window.dispatchEvent(new CustomEvent('modal:open-snapshot'));
    } else {
      window.dispatchEvent(new CustomEvent('modal:open-snapshot'));
      openSnapshotModal();
    }
  });
  btnClose?.addEventListener('click', closeSnapshotModal);
  btnCancel?.addEventListener('click', closeSnapshotModal);

  // Close on backdrop click
  modalBackdrop?.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) {
      closeSnapshotModal();
    }
  });

  // Dynamic preview recalculation on reference rate input
  if (inputRate) {
    inputRate.addEventListener('input', handleSnapshotRateInput);
    inputRate.addEventListener('change', handleSnapshotRateInput);
  }

  // Notes character counter
  notesInput?.addEventListener('input', () => {
    if (notesCounter && notesInput) {
      notesCounter.textContent = `${notesInput.value.length} / 500`;
    }
  });

  // Form submit direct binding
  form?.addEventListener('submit', handleSnapshotFormSubmit);

  // Delegated event listener for dynamically mounted modals
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('input', (e) => {
      if (e.target && (e.target.id === 'input-snapshot-ref-rate' || e.target.id === 'snapshot-reference-rate')) {
        handleSnapshotRateInput();
      }
      if (e.target && (e.target.id === 'input-snapshot-notes' || e.target.id === 'snapshot-notes')) {
        const counter = document.getElementById('snapshot-notes-counter');
        if (counter) counter.textContent = `${e.target.value.length} / 500`;
      }
    });
    document.addEventListener('change', (e) => {
      if (e.target && (e.target.id === 'input-snapshot-ref-rate' || e.target.id === 'snapshot-reference-rate')) {
        handleSnapshotRateInput();
      }
    });
    document.addEventListener('submit', (e) => {
      if (e.target && e.target.id === 'form-save-snapshot') {
        if (e.defaultPrevented) return;
        handleSnapshotFormSubmit(e);
      }
    });
  }

  // Listen to custom open event and register global helpers
  window.addEventListener('modal:open-snapshot', () => {
    openSnapshotModal();
  });
  if (!window.openSaveSnapshotModal) {
    window.openSaveSnapshotModal = openSnapshotModal;
  }
  if (!window.closeSaveSnapshotModal) {
    window.closeSaveSnapshotModal = closeSnapshotModal;
  }
}

/**
 * Handle form submission for saving snapshot
 * @param {Event} [e]
 */
export function handleSnapshotFormSubmit(e) {
  if (e && typeof e.preventDefault === 'function') {
    e.preventDefault();
  }

  const currentRateInput = document.getElementById('input-snapshot-ref-rate') || document.getElementById('snapshot-reference-rate');
  const rawRate = currentRateInput ? currentRateInput.value.trim() : '';
  const referenceRate = parseFloat(rawRate);

  // Validate reference rate (> 0)
  if (isNaN(referenceRate) || !isFinite(referenceRate) || referenceRate <= 0) {
    if (window.showToast) {
      window.showToast('Please enter a valid exchange rate greater than 0', 'error');
    }
    if (currentRateInput) {
      currentRateInput.classList.add('input-error', 'is-invalid', 'border-danger');
      currentRateInput?.focus?.();
    }
    const rateWarning = document.getElementById('snapshot-rate-warning');
    if (rateWarning) {
      rateWarning.classList.remove('hidden');
      rateWarning.textContent = 'Please enter a valid exchange rate greater than 0.';
    }
    return;
  }

  // Extract bankCash and usdtBalance
  let bankCash = currentModalBankCash;
  const elBankCash = document.getElementById('snapshot-bank-cash') || document.getElementById('input-snapshot-bank-cash');
  if (elBankCash) {
    const rawAttr = elBankCash.getAttribute('data-raw-value') || elBankCash.dataset?.val || elBankCash.value;
    if (rawAttr !== null && rawAttr !== undefined && !isNaN(Number(rawAttr)) && rawAttr !== '') {
      bankCash = Number(rawAttr);
    }
  }

  let usdtBalance = currentModalUsdt;
  const elUsdt = document.getElementById('snapshot-usdt-balance') || document.getElementById('input-snapshot-usdt-balance');
  if (elUsdt) {
    const rawAttr = elUsdt.getAttribute('data-raw-value') || elUsdt.dataset?.val || elUsdt.value;
    if (rawAttr !== null && rawAttr !== undefined && !isNaN(Number(rawAttr)) && rawAttr !== '') {
      usdtBalance = Number(rawAttr);
    }
  }

  // Extract timestamp
  const dateInput = document.getElementById('snapshot-date') || document.getElementById('input-snapshot-date');
  let timestamp = new Date().toISOString();
  if (dateInput && dateInput.value) {
    const parsedDate = new Date(dateInput.value);
    if (!isNaN(parsedDate.getTime())) {
      timestamp = parsedDate.toISOString();
    }
  }

  // Extract notes
  const notesInput = document.getElementById('input-snapshot-notes') || document.getElementById('snapshot-notes');
  const notes = notesInput && typeof notesInput.value === 'string' ? notesInput.value.trim() : '';

  // Construct snapshot payload
  const snapshotPayload = {
    timestamp,
    bankCash,
    usdtBalance,
    referenceRate,
    notes
  };

  try {
    // Persist snapshot to store
    const saved = store.saveSnapshot(snapshotPayload);

    // Close modal
    closeSnapshotModal();

    // Show success toast
    if (window.showToast) {
      window.showToast('Net worth snapshot saved successfully', 'success');
    }

    // Refresh UI widgets
    renderNetWorthWidget();
    renderNetWorthTrendChart();
    renderSnapshotHistoryTable();

    return saved;
  } catch (err) {
    console.error('[Snapshots] Error saving snapshot:', err);
    if (window.showToast) {
      window.showToast(err.message || 'Failed to save snapshot', 'error');
    }
  }
}

/**
 * Open End Day / Save Net Worth Snapshot modal and pre-fill live calculated metrics
 */
export function openSnapshotModal() {
  const modalBackdrop = document.getElementById('modal-snapshot-backdrop');
  const elBankCash = document.getElementById('snapshot-bank-cash') || document.getElementById('input-snapshot-bank-cash');
  const elBankCashRaw = document.getElementById('snapshot-bank-cash-raw');
  const elUsdtBalance = document.getElementById('snapshot-usdt-balance') || document.getElementById('input-snapshot-usdt-balance');
  const elUsdtBalanceRaw = document.getElementById('snapshot-usdt-balance-raw');
  const elDate = document.getElementById('snapshot-date') || document.getElementById('input-snapshot-date');
  const inputRate = document.getElementById('input-snapshot-ref-rate') || document.getElementById('snapshot-reference-rate');
  const inputNotes = document.getElementById('input-snapshot-notes') || document.getElementById('snapshot-notes');
  const notesCounter = document.getElementById('snapshot-notes-counter');
  const previewNgn = document.getElementById('snapshot-preview-networth-ngn') || document.getElementById('snapshot-preview-ngn');
  const previewUsdt = document.getElementById('snapshot-preview-networth-usdt') || document.getElementById('snapshot-preview-usdt');
  const elRawNgn = document.getElementById('snapshot-calculated-ngn-raw');
  const elRawUsdt = document.getElementById('snapshot-calculated-usdt-raw');
  const rateWarning = document.getElementById('snapshot-rate-warning');
  const rateBadge = document.getElementById('snapshot-rate-source-badge');
  const btnSubmit = document.getElementById('btn-save-snapshot-submit') || document.getElementById('btn-save-snapshot');

  const trades = store.getTrades();
  const openingInventory = store.getOpeningInventory();
  const fifoResult = calculateFIFOInventoryAndPnL(trades, openingInventory);

  // 1. Calculate live bank cash
  const computedBankBalances = store.getComputedBankBalances ? store.getComputedBankBalances() : new Map();
  const totalBankCash = calculateTotalBankCash(computedBankBalances);

  // 2. Calculate live Bybit USDT balance (funding wallet + active ads, or FIFO inventory fallback)
  const isLiveUsdt = latestLiveUsdt !== null && latestLiveUsdt !== undefined && !isNaN(latestLiveUsdt);
  const totalUsdt = isLiveUsdt ? latestLiveUsdt : (fifoResult.remainingInventoryUSDT || 0);

  currentModalBankCash = totalBankCash;
  currentModalUsdt = totalUsdt;

  // 3. Resolve default reference rate
  const referenceRate = resolveReferenceRate({
    activeSellAd: latestActiveAd,
    latestTrade: trades,
    fifoAvgBuyCost: fifoResult.avgHoldingCostPerUSDT,
    openingDefaultRate: openingInventory?.defaultCostBasis,
    openingInventory: openingInventory,
    fallbackRate: 1500.00
  });

  // 4. Calculate initial Net Worth preview
  const initialNw = calculateNetWorth(totalBankCash, totalUsdt, referenceRate);

  // 5. Pre-fill modal fields
  if (elDate) {
    try {
      elDate.value = getLocalIsoDateTime(new Date());
    } catch (e) {
      elDate.value = new Date().toISOString().slice(0, 16);
    }
  }

  if (elBankCash) {
    if (elBankCash.tagName === 'INPUT') {
      elBankCash.value = totalBankCash.toString();
    } else {
      elBankCash.textContent = formatNGN(totalBankCash);
    }
    elBankCash.setAttribute('data-raw-value', totalBankCash.toString());
    elBankCash.setAttribute('data-val', totalBankCash.toString());
    if (elBankCash.dataset) elBankCash.dataset.val = totalBankCash.toString();
  }
  if (elBankCashRaw) elBankCashRaw.value = totalBankCash.toString();

  if (elUsdtBalance) {
    if (elUsdtBalance.tagName === 'INPUT') {
      elUsdtBalance.value = totalUsdt.toString();
    } else {
      elUsdtBalance.textContent = formatUSDT(totalUsdt);
    }
    elUsdtBalance.setAttribute('data-raw-value', totalUsdt.toString());
    elUsdtBalance.setAttribute('data-val', totalUsdt.toString());
    if (elUsdtBalance.dataset) elUsdtBalance.dataset.val = totalUsdt.toString();
  }
  if (elUsdtBalanceRaw) elUsdtBalanceRaw.value = totalUsdt.toString();

  if (inputRate) {
    inputRate.value = referenceRate > 0 ? (Math.round(referenceRate * 100) / 100).toString() : '1500';
    inputRate.classList.remove('input-error', 'is-invalid', 'border-danger');
  }

  if (rateBadge) {
    if (latestActiveAd) {
      rateBadge.textContent = 'Active Ad Rate';
      rateBadge.className = 'badge badge-primary tiny';
    } else if (trades && trades.length > 0) {
      rateBadge.textContent = 'Latest Trade';
      rateBadge.className = 'badge badge-neutral tiny';
    } else if (fifoResult.avgHoldingCostPerUSDT > 0) {
      rateBadge.textContent = 'FIFO Cost';
      rateBadge.className = 'badge badge-neutral tiny';
    } else {
      rateBadge.textContent = 'Default Rate';
      rateBadge.className = 'badge badge-neutral tiny';
    }
  }

  if (inputNotes) {
    inputNotes.value = '';
  }
  if (notesCounter) {
    notesCounter.textContent = '0 / 500';
  }

  if (previewNgn) {
    previewNgn.textContent = formatNGN(initialNw.netWorthNgn);
    previewNgn.className = `preview-metric-value font-mono ${initialNw.netWorthNgn >= 0 ? 'text-success' : 'text-danger'}`;
  }
  if (elRawNgn) elRawNgn.value = initialNw.netWorthNgn.toString();

  if (previewUsdt) {
    previewUsdt.textContent = formatUSDT(initialNw.netWorthUsdt);
  }
  if (elRawUsdt) elRawUsdt.value = initialNw.netWorthUsdt.toString();

  if (rateWarning) {
    rateWarning.classList.add('hidden');
    rateWarning.textContent = '';
  }

  if (btnSubmit) {
    btnSubmit.disabled = false;
  }

  // 6. Show modal
  if (modalBackdrop) {
    modalBackdrop.classList.remove('hidden');
  }

  // Focus and select rate input
  inputRate?.focus?.();
  inputRate?.select?.();

  if (window.lucide) window.lucide.createIcons();
}

/**
 * Close End Day / Save Net Worth Snapshot modal and reset form
 */
export function closeSnapshotModal() {
  const modalBackdrop = document.getElementById('modal-snapshot-backdrop');
  if (modalBackdrop) {
    modalBackdrop.classList.add('hidden');
  }
  const formSnapshot = document.getElementById('form-save-snapshot');
  if (formSnapshot) {
    formSnapshot.reset();
  }
  const rateInput = document.getElementById('input-snapshot-ref-rate') || document.getElementById('snapshot-reference-rate');
  if (rateInput) {
    rateInput.classList.remove('input-error', 'is-invalid', 'border-danger');
  }
  const rateWarning = document.getElementById('snapshot-rate-warning');
  if (rateWarning) {
    rateWarning.classList.add('hidden');
    rateWarning.textContent = '';
  }
}

/**
 * Real-time dynamic recalculation on reference rate input change
 */
export function handleSnapshotRateInput() {
  const inputRate = document.getElementById('input-snapshot-ref-rate') || document.getElementById('snapshot-reference-rate');
  const previewNgn = document.getElementById('snapshot-preview-networth-ngn') || document.getElementById('snapshot-preview-ngn');
  const previewUsdt = document.getElementById('snapshot-preview-networth-usdt') || document.getElementById('snapshot-preview-usdt');
  const elRawNgn = document.getElementById('snapshot-calculated-ngn-raw');
  const elRawUsdt = document.getElementById('snapshot-calculated-usdt-raw');
  const rateWarning = document.getElementById('snapshot-rate-warning');
  const btnSubmit = document.getElementById('btn-save-snapshot-submit') || document.getElementById('btn-save-snapshot');

  if (!inputRate) return;

  const rawVal = inputRate.value.trim();
  const rate = parseFloat(rawVal);

  // Retrieve current modal bank cash and usdt balances
  const elBankCash = document.getElementById('snapshot-bank-cash') || document.getElementById('input-snapshot-bank-cash');
  const elUsdtBalance = document.getElementById('snapshot-usdt-balance') || document.getElementById('input-snapshot-usdt-balance');

  let bankCash = currentModalBankCash;
  if (elBankCash) {
    const rawAttr = elBankCash.getAttribute('data-raw-value') || elBankCash.dataset?.val || elBankCash.value;
    if (rawAttr !== null && rawAttr !== undefined && !isNaN(Number(rawAttr)) && rawAttr !== '') {
      bankCash = Number(rawAttr);
    }
  }

  let usdtBalance = currentModalUsdt;
  if (elUsdtBalance) {
    const rawAttr = elUsdtBalance.getAttribute('data-raw-value') || elUsdtBalance.dataset?.val || elUsdtBalance.value;
    if (rawAttr !== null && rawAttr !== undefined && !isNaN(Number(rawAttr)) && rawAttr !== '') {
      usdtBalance = Number(rawAttr);
    }
  }

  const isValidRate = !isNaN(rate) && isFinite(rate) && rate > 0;

  if (isValidRate) {
    const preview = calculateNetWorth(bankCash, usdtBalance, rate);

    if (previewNgn) {
      previewNgn.textContent = formatNGN(preview.netWorthNgn);
      previewNgn.className = `preview-metric-value font-mono ${preview.netWorthNgn >= 0 ? 'text-success' : 'text-danger'}`;
    }
    if (elRawNgn) elRawNgn.value = preview.netWorthNgn.toString();

    if (previewUsdt) {
      previewUsdt.textContent = formatUSDT(preview.netWorthUsdt);
    }
    if (elRawUsdt) elRawUsdt.value = preview.netWorthUsdt.toString();

    if (rateWarning) {
      rateWarning.classList.add('hidden');
      rateWarning.textContent = '';
    }
    inputRate.classList.remove('input-error', 'is-invalid', 'border-danger');
    if (btnSubmit) btnSubmit.disabled = false;
  } else {
    // Rate <= 0, NaN, or empty
    const fallbackPreview = calculateNetWorth(bankCash, usdtBalance, 0);

    if (previewNgn) {
      previewNgn.textContent = rawVal === '' ? '—' : formatNGN(fallbackPreview.netWorthNgn);
    }
    if (elRawNgn) elRawNgn.value = fallbackPreview.netWorthNgn.toString();

    if (previewUsdt) {
      previewUsdt.textContent = rawVal === '' ? '—' : formatUSDT(fallbackPreview.netWorthUsdt);
    }
    if (elRawUsdt) elRawUsdt.value = fallbackPreview.netWorthUsdt.toString();

    if (rateWarning) {
      rateWarning.classList.remove('hidden');
      rateWarning.textContent = 'Please enter a valid exchange rate greater than 0.';
    }
    if (rawVal !== '') {
      inputRate.classList.add('input-error', 'is-invalid', 'border-danger');
    }
  }
}

/**
 * Render Historical Net Worth Trend Line Chart (Milestone 4 — Feature 14)
 * Visualizes asset valuation growth across historical snapshots.
 * Supports dual-axis (NGN & USDT) and single-currency filtered views.
 * Handles lifecycle destruction, gradient creation, and clean empty state transitions (< 2 snapshots).
 * 
 * @param {'both'|'ngn'|'usdt'} [currencyFilter=currentNetWorthChartCurrency]
 * @returns {Object|null} Chart.js instance or null
 */
export function renderNetWorthTrendChart(currencyFilter = currentNetWorthChartCurrency) {
  const canvas = document.getElementById('netWorthTrendChart') || document.getElementById('netWorthChart');
  const emptyState = document.getElementById('chart-networth-empty-state') || document.getElementById('chart-networth-empty');

  if (!canvas) return null;

  const snapshots = store.getSnapshots ? store.getSnapshots() : [];
  currentNetWorthChartCurrency = (currencyFilter || 'both').toLowerCase();

  // Guard: Minimum 2 snapshots required to draw a trend line
  if (!snapshots || snapshots.length < 2) {
    if (emptyState) {
      emptyState.classList.remove('hidden');
      const subtitle = emptyState.querySelector('.empty-subtitle') || emptyState.querySelector('p');
      if (subtitle) {
        subtitle.textContent = (snapshots && snapshots.length === 1)
          ? 'Record at least 2 daily snapshots to visualize growth trend'
          : 'Save snapshots via "End Day / Snapshot" to track historical net worth trend';
      }
    }
    if (canvas) {
      canvas.classList.add('hidden');
    }
    if (netWorthChartInstance) {
      netWorthChartInstance.destroy();
      netWorthChartInstance = null;
    }
    return null;
  }

  // Active state: Hide empty state, reveal canvas
  if (emptyState) {
    emptyState.classList.add('hidden');
  }
  if (canvas) {
    canvas.classList.remove('hidden');
  }

  // Lifecycle management: Destroy existing chart instance before re-creating
  if (netWorthChartInstance) {
    netWorthChartInstance.destroy();
    netWorthChartInstance = null;
  }

  // Generate chronological X-axis labels
  const labels = snapshots.map((s, idx) => {
    if (!s.timestamp) return `#${idx + 1}`;
    const d = new Date(s.timestamp);
    if (isNaN(d.getTime())) return `#${idx + 1}`;
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  });

  const ctx = canvas.getContext ? canvas.getContext('2d') : null;

  // Safe linear gradients with fallback for headless/mock environments
  let ngnGradient = 'rgba(16, 185, 129, 0.2)';
  let usdtGradient = 'rgba(6, 182, 212, 0.2)';
  try {
    if (ctx && typeof ctx.createLinearGradient === 'function') {
      const grad1 = ctx.createLinearGradient(0, 0, 0, canvas.height || 260);
      grad1.addColorStop(0, 'rgba(16, 185, 129, 0.35)');
      grad1.addColorStop(1, 'rgba(16, 185, 129, 0.00)');
      ngnGradient = grad1;

      const grad2 = ctx.createLinearGradient(0, 0, 0, canvas.height || 260);
      grad2.addColorStop(0, 'rgba(6, 182, 212, 0.35)');
      grad2.addColorStop(1, 'rgba(6, 182, 212, 0.00)');
      usdtGradient = grad2;
    }
  } catch (e) {
    console.warn('[Snapshots] Could not construct canvas gradients:', e);
  }

  const pointRadius = snapshots.length > 25 ? 2 : 4;
  const pointHoverRadius = snapshots.length > 25 ? 4 : 6;

  // Base Dataset Configurations
  const ngnDataset = {
    label: 'Net Worth (₦ NGN)',
    data: snapshots.map(s => Number(s.netWorthNgn) || 0),
    borderColor: '#10b981',
    backgroundColor: ngnGradient,
    borderWidth: 2.5,
    fill: true,
    tension: 0.35,
    yAxisID: currentNetWorthChartCurrency === 'both' ? 'y-ngn' : 'y',
    pointBackgroundColor: '#10b981',
    pointBorderColor: '#0E1626',
    pointBorderWidth: 2,
    pointRadius: pointRadius,
    pointHoverRadius: pointHoverRadius
  };

  const usdtDataset = {
    label: 'Net Worth ($ USDT)',
    data: snapshots.map(s => Number(s.netWorthUsdt) || 0),
    borderColor: '#06b6d4',
    backgroundColor: usdtGradient,
    borderWidth: 2.5,
    fill: true,
    tension: 0.35,
    yAxisID: currentNetWorthChartCurrency === 'both' ? 'y-usdt' : 'y',
    pointBackgroundColor: '#06b6d4',
    pointBorderColor: '#0E1626',
    pointBorderWidth: 2,
    pointRadius: pointRadius,
    pointHoverRadius: pointHoverRadius
  };

  let datasets = [];
  let scales = {};

  if (currentNetWorthChartCurrency === 'ngn') {
    datasets = [ngnDataset];
    scales = {
      x: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#64748B', font: { size: 11 } }
      },
      y: {
        type: 'linear',
        position: 'left',
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: {
          color: '#10b981',
          font: { size: 11 },
          callback: (val) => formatNGN(val, 0)
        }
      }
    };
  } else if (currentNetWorthChartCurrency === 'usdt') {
    datasets = [usdtDataset];
    scales = {
      x: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#64748B', font: { size: 11 } }
      },
      y: {
        type: 'linear',
        position: 'left',
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: {
          color: '#06b6d4',
          font: { size: 11 },
          callback: (val) => formatUSDT(val, 0)
        }
      }
    };
  } else {
    // 'both' (Dual dataset with dual Y-axes)
    datasets = [ngnDataset, usdtDataset];
    scales = {
      x: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#64748B', font: { size: 11 } }
      },
      'y-ngn': {
        type: 'linear',
        position: 'left',
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: {
          color: '#10b981',
          font: { size: 11 },
          callback: (val) => formatNGN(val, 0)
        },
        title: {
          display: true,
          text: 'Naira (NGN)',
          color: '#10b981',
          font: { size: 11, weight: '600' }
        }
      },
      'y-usdt': {
        type: 'linear',
        position: 'right',
        grid: { drawOnChartArea: false }, // Prevent overlapping grid lines on canvas
        ticks: {
          color: '#06b6d4',
          font: { size: 11 },
          callback: (val) => formatUSDT(val, 0)
        },
        title: {
          display: true,
          text: 'USDT Equiv',
          color: '#06b6d4',
          font: { size: 11, weight: '600' }
        }
      }
    };
  }

  // Construct Chart.js instance if Chart constructor is available
  if (typeof Chart === 'function' && ctx) {
    netWorthChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index'
        },
        plugins: {
          legend: {
            display: currentNetWorthChartCurrency === 'both',
            position: 'top',
            labels: {
              color: '#94A3B8',
              font: { size: 12, family: 'Plus Jakarta Sans, sans-serif' },
              boxWidth: 12,
              usePointStyle: true,
              pointStyle: 'circle'
            }
          },
          tooltip: {
            backgroundColor: 'rgba(14, 22, 38, 0.95)',
            titleColor: '#F8FAFC',
            bodyColor: '#94A3B8',
            borderColor: 'rgba(255, 255, 255, 0.15)',
            borderWidth: 1,
            padding: 12,
            boxPadding: 4,
            usePointStyle: true,
            callbacks: {
              title: (items) => {
                if (!items || !items.length) return '';
                const idx = items[0].dataIndex;
                const snp = snapshots[idx];
                return snp?.timestamp ? formatDateTime(snp.timestamp) : (items[0].label || '');
              },
              label: (context) => {
                const isNgn = context.dataset.label?.includes('NGN') || context.dataset.yAxisID === 'y-ngn';
                const val = context.parsed.y;
                return isNgn
                  ? ` Net Worth (NGN): ${formatNGN(val)}`
                  : ` Net Worth (USDT): ${formatUSDT(val)}`;
              },
              afterBody: (items) => {
                if (!items || !items.length) return [];
                const idx = items[0].dataIndex;
                const snp = snapshots[idx];
                if (!snp) return [];
                const lines = [];
                if (snp.referenceRate) {
                  lines.push(`Rate: ${formatRate(snp.referenceRate)}`);
                }
                if (snp.bankCash !== undefined && snp.usdtBalance !== undefined) {
                  lines.push(`Bank: ${formatNGN(snp.bankCash)} | USDT: ${formatUSDT(snp.usdtBalance)}`);
                }
                if (snp.notes) {
                  const truncatedNotes = snp.notes.length > 40 ? `${snp.notes.slice(0, 37)}...` : snp.notes;
                  lines.push(`Note: "${truncatedNotes}"`);
                }
                return lines;
              }
            }
          }
        },
        scales
      }
    });
  }

  return netWorthChartInstance;
}

/**
 * Render Historical Net Worth Snapshot Table & List (Milestone 4 — Feature 15)
 * Computes sequential deltas (S_k vs S_{k-1}) and renders in reverse chronological order.
 * Handles responsive desktop table and mobile card layout, tooltips for notes, and deletion.
 */
export function renderSnapshotHistoryTable() {
  const tbody = document.getElementById('snapshot-history-tbody');
  const listContainer = document.getElementById('snapshot-history-list');
  const emptyState = document.getElementById('snapshot-history-empty') || document.getElementById('empty-state-snapshots');
  const tableWrapper = document.getElementById('snapshot-table-wrapper') || document.getElementById('snapshot-history-table-container');
  const countEl = document.getElementById('snapshot-history-count');
  const countBadge = document.getElementById('snapshot-history-count-badge');

  // If containers are not present on DOM, exit cleanly
  if (!tbody && !listContainer && !emptyState) return;

  const snapshots = store.getSnapshots ? store.getSnapshots() : [];
  const totalCount = snapshots.length;

  if (countEl) {
    countEl.textContent = `${totalCount} ${totalCount === 1 ? 'snapshot' : 'snapshots'} recorded`;
  }
  if (countBadge) {
    countBadge.textContent = totalCount.toString();
  }

  // Handle Empty State (< 1 snapshot)
  if (totalCount === 0) {
    if (emptyState) emptyState.classList.remove('hidden');
    if (tableWrapper) tableWrapper.classList.add('hidden');
    if (tbody) tbody.innerHTML = '';
    if (listContainer) {
      listContainer.innerHTML = `
        <div class="empty-state py-4">
          <div class="empty-icon-box">
            <i data-lucide="camera-off"></i>
          </div>
          <p class="empty-title">No snapshots saved yet</p>
          <p class="empty-subtitle">End-of-day snapshots will appear here with sequential growth calculations.</p>
        </div>
      `;
    }
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  // Active state: Show table, hide empty placeholder
  if (emptyState) emptyState.classList.add('hidden');
  if (tableWrapper) tableWrapper.classList.remove('hidden');

  // 1. Compute sequential deltas in chronological order (forward in time)
  const enrichedSnapshots = snapshots.map((snapshot, idx) => {
    const isBaseline = idx === 0;
    const previousSnapshot = isBaseline ? null : snapshots[idx - 1];
    const delta = isBaseline ? null : calculateSnapshotDelta(snapshot, previousSnapshot);
    return {
      ...snapshot,
      delta,
      isBaseline,
      chronologicalIndex: idx + 1
    };
  });

  // 2. Reverse for UI display (newest snapshot on row 1)
  let displaySnapshots = [...enrichedSnapshots].reverse();
  
  const MAX_DISPLAY = window._snapshotDisplayLimit || 5;
  const isTruncated = displaySnapshots.length > MAX_DISPLAY;
  if (isTruncated) {
    displaySnapshots = displaySnapshots.slice(0, MAX_DISPLAY);
  }

  // 3. Render Desktop Table Rows
  if (tbody) {
    let html = displaySnapshots.map((item, idx) => {
      return renderSnapshotHistoryRow(item, item.isBaseline ? null : item, idx);
    }).join('');
    
    if (isTruncated) {
      html += `<tr><td colspan="9" class="text-center py-3">
        <button type="button" class="btn btn-outline btn-sm" id="btn-view-all-snapshots-desktop">View All ${totalCount} Snapshots</button>
      </td></tr>`;
    }
    tbody.innerHTML = html;
  }

  // 4. Render Mobile Card List (if present)
  if (listContainer) {
    listContainer.innerHTML = displaySnapshots.map((item) => {
      const dateFormatted = item.timestamp ? formatDateTime(item.timestamp) : '—';
      const bankCashFormatted = formatNGN(item.bankCash || 0);
      const usdtFormatted = formatUSDT(item.usdtBalance || 0);
      const rateFormatted = formatRate(item.referenceRate || 1500);
      const netWorthNgnFormatted = formatNGN(item.netWorthNgn || 0);
      const netWorthUsdtFormatted = formatUSDT(item.netWorthUsdt || 0);
      const safeId = escapeHtml(item.id);

      let deltaBadgeHtml = '';
      if (item.isBaseline) {
        deltaBadgeHtml = `<span class="badge badge-neutral tiny"><i data-lucide="anchor"></i> Baseline</span>`;
      } else if (item.delta) {
        const isPos = item.delta.deltaNgn > 0.005;
        const isNeg = item.delta.deltaNgn < -0.005;
        const badgeClass = isPos ? 'badge-success' : (isNeg ? 'badge-danger' : 'badge-neutral');
        const iconName = isPos ? 'trending-up' : (isNeg ? 'trending-down' : 'minus');
        const badgeText = formatDeltaBadgeText(item.delta.deltaNgn, item.delta.pctDeltaNgn);
        deltaBadgeHtml = `<span class="badge ${badgeClass} tiny"><i data-lucide="${iconName}"></i> ${badgeText}</span>`;
      }

      const notesRaw = typeof item.notes === 'string' ? item.notes.trim() : '';
      const notesBlock = notesRaw ? `
        <div class="snapshot-card-notes mt-2 p-2 rounded small text-muted">
          <i data-lucide="file-text" class="me-1"></i>
          <span>${escapeHtml(notesRaw)}</span>
        </div>
      ` : '';

      return `
        <div class="snapshot-card-item card p-3 mb-2" data-snapshot-id="${safeId}">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <div class="d-flex align-items-center gap-2">
              <span class="font-mono text-muted small">${dateFormatted}</span>
              ${deltaBadgeHtml}
            </div>
            <button 
              type="button" 
              class="btn-icon btn-xs text-danger btn-delete-snapshot" 
              data-snapshot-id="${safeId}" 
              data-id="${safeId}"
              data-date="${escapeHtml(dateFormatted)}"
              title="Delete Snapshot"
            >
              <i data-lucide="trash-2"></i>
            </button>
          </div>
          <div class="d-flex justify-content-between align-items-baseline mb-1">
            <span class="text-muted small">Net Worth:</span>
            <div class="text-end">
              <div class="font-mono font-bold ${item.netWorthNgn >= 0 ? 'text-success' : 'text-danger'}">${netWorthNgnFormatted}</div>
              <div class="font-mono small text-accent">${netWorthUsdtFormatted}</div>
            </div>
          </div>
          <div class="d-flex justify-content-between text-muted small mt-2 pt-2 border-top">
            <span>Bank: <strong class="font-mono text-success">${bankCashFormatted}</strong></span>
            <span>USDT: <strong class="font-mono text-accent">${usdtFormatted}</strong></span>
            <span>Rate: <strong class="font-mono">${rateFormatted}</strong></span>
          </div>
          ${notesBlock}
        </div>
      `;
    }).join('');
    
    if (isTruncated) {
      listContainer.innerHTML += `
        <div class="text-center mt-3 mb-2">
          <button type="button" class="btn btn-outline btn-sm w-100" id="btn-view-all-snapshots-mobile">View All ${totalCount} Snapshots</button>
        </div>
      `;
    }
  }

  // 5. Bind Actions (Delete buttons & View Note handlers)
  bindSnapshotHistoryActions();

  if (window.lucide) window.lucide.createIcons();
}

/**
 * Render HTML string for a single snapshot table row in #table-snapshot-history
 * 
 * @param {Object} snapshot - Current snapshot record (enriched with .delta / .isBaseline)
 * @param {Object|null} previousSnapshot - Preceding snapshot reference
 * @param {number} index - Render row index
 * @returns {string} HTML table row string
 */
export function renderSnapshotHistoryRow(snapshot, previousSnapshot, index) {
  const isBaseline = snapshot.isBaseline !== undefined ? snapshot.isBaseline : !previousSnapshot;
  const delta = snapshot.delta || (previousSnapshot ? calculateSnapshotDelta(snapshot, previousSnapshot) : null);

  // Delta badge styling
  let deltaBadgeHtml = '';
  if (isBaseline || !delta) {
    deltaBadgeHtml = `
      <span class="badge badge-neutral tiny" title="First recorded snapshot established as baseline">
        <i data-lucide="anchor"></i>
        <span>Baseline</span>
      </span>
    `;
  } else {
    const isPositive = delta.deltaNgn > 0.005;
    const isNegative = delta.deltaNgn < -0.005;
    const badgeClass = isPositive ? 'badge-success' : (isNegative ? 'badge-danger' : 'badge-neutral');
    const icon = isPositive ? 'trending-up' : (isNegative ? 'trending-down' : 'minus');
    const ngnText = formatDeltaBadgeText(delta.deltaNgn, delta.pctDeltaNgn);
    const usdtText = formatDeltaUsdtText(delta.deltaUsdt);

    deltaBadgeHtml = `
      <div class="snapshot-delta-stack">
        <span class="badge ${badgeClass} tiny" title="${usdtText} vs previous snapshot">
          <i data-lucide="${icon}"></i>
          <span>${ngnText}</span>
        </span>
        <span class="snapshot-delta-sub font-mono tiny text-muted" title="Delta USDT: ${usdtText}">
          ${usdtText}
        </span>
      </div>
    `;
  }

  // Formatting values safely
  const formattedDate = snapshot.timestamp ? formatDateTime(snapshot.timestamp) : '—';
  const formattedBankCash = formatNGN(snapshot.bankCash || 0);
  const formattedUsdt = formatUSDT(snapshot.usdtBalance || 0);
  const formattedRate = formatRate(snapshot.referenceRate || 1500);
  const formattedNwNgn = formatNGN(snapshot.netWorthNgn || 0);
  const formattedNwUsdt = formatUSDT(snapshot.netWorthUsdt || 0);
  const rawNotes = typeof snapshot.notes === 'string' ? snapshot.notes.trim() : '';
  const safeNotes = escapeHtml(rawNotes);
  const safeId = escapeHtml(snapshot.id || '');

  // Notes formatting with popover preview if long
  let notesHtml = '<span class="text-disabled">—</span>';
  if (rawNotes) {
    if (rawNotes.length > 35) {
      notesHtml = `
        <span class="snapshot-notes-text" title="${safeNotes}">
          ${safeNotes.slice(0, 32)}...
        </span>
        <button type="button" class="btn-link tiny btn-view-note" data-note="${safeNotes}" data-date="${escapeHtml(formattedDate)}" title="Read full note">
          <i data-lucide="file-text"></i>
        </button>
      `;
    } else {
      notesHtml = `<span class="snapshot-notes-text" title="${safeNotes}">${safeNotes}</span>`;
    }
  }

  return `
    <tr class="snapshot-row" data-snapshot-id="${safeId}" id="row-${safeId}">
      <td class="td-date font-mono text-supporting">
        <div class="td-date-wrapper">
          <i data-lucide="calendar" class="td-icon-muted"></i>
          <span>${formattedDate}</span>
        </div>
      </td>
      <td class="td-bank font-mono text-right text-success">${formattedBankCash}</td>
      <td class="td-usdt font-mono text-right text-accent">${formattedUsdt}</td>
      <td class="td-rate font-mono text-right text-muted">${formattedRate}</td>
      <td class="td-networth font-mono text-right font-bold ${snapshot.netWorthNgn >= 0 ? 'text-success' : 'text-danger'}">${formattedNwNgn}</td>
      <td class="td-networth-usdt font-mono text-right font-bold text-accent">${formattedNwUsdt}</td>
      <td class="td-delta text-center">${deltaBadgeHtml}</td>
      <td class="td-notes text-muted small">${notesHtml}</td>
      <td class="td-actions text-center">
        <button 
          type="button" 
          class="btn-icon btn-xs text-danger btn-delete-snapshot" 
          data-snapshot-id="${safeId}" 
          data-id="${safeId}" 
          data-date="${escapeHtml(formattedDate)}"
          title="Delete Snapshot (${formattedDate})" 
          aria-label="Delete Snapshot ${safeId}"
        >
          <i data-lucide="trash-2"></i>
        </button>
      </td>
    </tr>
  `;
}

/**
 * Attach Event Listeners to Snapshot History Table Actions
 */
export function bindSnapshotHistoryActions() {
  const deleteButtons = document.querySelectorAll('.btn-delete-snapshot');
  deleteButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const snapshotId = btn.getAttribute('data-snapshot-id') || btn.getAttribute('data-id');
      const dateStr = btn.getAttribute('data-date') || 'this snapshot';
      if (!snapshotId) return;

      const confirmMsg = `Are you sure you want to delete this historical snapshot (${dateStr})?\n\nThis will remove it from historical charts and recalculate subsequent deltas.`;

      if (window.showConfirmModal) {
        window.showConfirmModal(
          'Delete Snapshot Record?',
          confirmMsg,
          () => executeDeleteSnapshot(snapshotId),
          'danger'
        );
      } else if (confirm(confirmMsg)) {
        executeDeleteSnapshot(snapshotId);
      }
    });
  });

  const viewNoteButtons = document.querySelectorAll('.btn-view-note');
  viewNoteButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const note = btn.getAttribute('data-note');
      const date = btn.getAttribute('data-date');
      if (window.showConfirmModal) {
        window.showConfirmModal(
          `Snapshot Note (${date})`,
          note,
          () => {},
          'warning'
        );
      } else {
        alert(`Snapshot Note (${date}):\n\n${note}`);
      }
    });
  });
  
  const btnViewAllDesktop = document.getElementById('btn-view-all-snapshots-desktop');
  if (btnViewAllDesktop) {
    btnViewAllDesktop.addEventListener('click', (e) => {
      e.preventDefault();
      window._snapshotDisplayLimit = 9999;
      renderSnapshotHistoryTable();
    });
  }
  
  const btnViewAllMobile = document.getElementById('btn-view-all-snapshots-mobile');
  if (btnViewAllMobile) {
    btnViewAllMobile.addEventListener('click', (e) => {
      e.preventDefault();
      window._snapshotDisplayLimit = 9999;
      renderSnapshotHistoryTable();
    });
  }
}

/**
 * Execute snapshot deletion and trigger reactive UI refresh
 * @param {string} snapshotId
 */
export function executeDeleteSnapshot(snapshotId) {
  try {
    const deleted = store.deleteSnapshot(snapshotId);
    if (deleted) {
      if (window.showToast) {
        window.showToast('Snapshot deleted', 'info');
      }
      renderNetWorthWidget();
      renderNetWorthTrendChart();
      renderSnapshotHistoryTable();
    } else {
      if (window.showToast) {
        window.showToast('Snapshot record not found.', 'error');
      }
    }
  } catch (err) {
    console.error('[Snapshots] Error deleting snapshot:', err);
    if (window.showToast) {
      window.showToast('Failed to delete snapshot.', 'error');
    }
  }
}

/**
 * Setup currency filter toggles for Net Worth Trend Chart ('both', 'ngn', 'usdt')
 */
export function setupNetWorthChartFilters() {
  const filterContainer = document.getElementById('chart-currency-filter') || document.getElementById('chart-networth-currency-filter');
  const btnBoth = document.getElementById('filter-chart-both');
  const btnNgn = document.getElementById('filter-chart-ngn');
  const btnUsdt = document.getElementById('filter-chart-usdt');
  const btnToggleLog = document.getElementById('btn-toggle-snapshot-log');
  const historySection = document.getElementById('snapshot-history-section');

  const updateActiveButtons = (activeCurrency) => {
    [btnBoth, btnNgn, btnUsdt].forEach(btn => {
      if (!btn) return;
      const targetCurr = btn.getAttribute('data-currency') || btn.id.replace('filter-chart-', '');
      if (targetCurr === activeCurrency) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    if (filterContainer) {
      filterContainer.querySelectorAll('.seg-btn, .btn-filter').forEach(btn => {
        const curr = btn.getAttribute('data-currency') || (btn.id ? btn.id.replace('filter-chart-', '') : '');
        if (curr === activeCurrency) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }
  };

  btnBoth?.addEventListener('click', () => {
    updateActiveButtons('both');
    renderNetWorthTrendChart('both');
  });

  btnNgn?.addEventListener('click', () => {
    updateActiveButtons('ngn');
    renderNetWorthTrendChart('ngn');
  });

  btnUsdt?.addEventListener('click', () => {
    updateActiveButtons('usdt');
    renderNetWorthTrendChart('usdt');
  });

  // Delegated handler for dynamically mounted buttons
  if (filterContainer) {
    filterContainer.querySelectorAll('[data-currency]').forEach(btn => {
      btn.addEventListener('click', () => {
        const curr = btn.getAttribute('data-currency') || 'both';
        updateActiveButtons(curr);
        renderNetWorthTrendChart(curr);
      });
    });
  }

  // Toggle History Drawer / Section
  btnToggleLog?.addEventListener('click', () => {
    isSnapshotLogExpanded = !isSnapshotLogExpanded;
    if (historySection) {
      if (isSnapshotLogExpanded) {
        historySection.classList.remove('hidden');
        btnToggleLog.setAttribute('aria-expanded', 'true');
      } else {
        historySection.classList.add('hidden');
        btnToggleLog.setAttribute('aria-expanded', 'false');
      }
    }
  });
}

// Global exposure for external and test runner access
if (typeof window !== 'undefined') {
  window.openSaveSnapshotModal = openSnapshotModal;
  window.closeSaveSnapshotModal = closeSnapshotModal;
  window.renderNetWorthTrendChart = renderNetWorthTrendChart;
  window.updateNetWorthTrendChart = renderNetWorthTrendChart;
  window.renderSnapshotHistoryTable = renderSnapshotHistoryTable;
  window.setupNetWorthChartFilters = setupNetWorthChartFilters;
}
