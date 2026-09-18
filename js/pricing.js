/**
 * Controller: P2P Arbitrage & Pricing Assistant
 * Performs spreads arithmetic, fetches competitor ad books, and calculates optimal pricing.
 * Delegates mathematical formulas to the extracted pricingEngine module.
 */

import { bybitService } from './bybitService.js';
import { store } from './store.js';
import { formatNGN, calculateFIFOInventoryAndPnL, escapeHtml } from './utils.js';
import {
  filterCompetitorAds,
  calculateBuyPricing,
  calculateSellPricing,
  calculateRecommendedLimits,
  calculateBuybackTiers,
  calculateSweetSpotPricing
} from './pricingEngine.js';

// Cache for market depth to allow local calculation runs without API spam
let cachedMarketDepth = null;

export function initPricing() {
  loadSavedSettings();
  setupListeners();
  refreshPricingData();

  // Listen for store modifications to update cost-basis dynamically
  window.addEventListener('store:updated', (e) => {
    if (e.detail?.type === 'trades' || e.detail?.type === 'all' || e.detail?.type === 'settings') {
      if (e.detail?.type === 'settings' || e.detail?.type === 'all') {
        loadSavedSettings();
      }
      calculateMargins();
    }
  });
}

/**
 * Load input preferences from localStorage or fall back to store/defaults
 */
function loadSavedSettings() {
  const storeSettings = store.getSettings ? store.getSettings() : {};
  const platformFee = localStorage.getItem('bybit_p2p_pricing_platform_fee_pct') 
    || localStorage.getItem('bybit_p2p_pricing_platform_fee')
    || (storeSettings.platformFeePct !== undefined ? String(storeSettings.platformFeePct) : '0.3');
  const spread = localStorage.getItem('bybit_p2p_pricing_spread') || (storeSettings.targetSpread !== undefined ? String(storeSettings.targetSpread) : '5.0');
  const vol = localStorage.getItem('bybit_p2p_pricing_volume') || (storeSettings.avgVolume !== undefined ? String(storeSettings.avgVolume) : '100');
  const inflow = localStorage.getItem('bybit_p2p_pricing_inflow') || (storeSettings.inflowFee !== undefined ? String(storeSettings.inflowFee) : '50');
  const outflow = localStorage.getItem('bybit_p2p_pricing_outflow') || (storeSettings.outflowFee !== undefined ? String(storeSettings.outflowFee) : '0');
  const mode = localStorage.getItem('bybit_p2p_pricing_mode') || (storeSettings.pricingMode || 'avg-10');
  const depthLimit = localStorage.getItem('bybit_p2p_pricing_depth_limit') || (storeSettings.depthLimit !== undefined ? String(storeSettings.depthLimit) : '50');
  const filterLimits = localStorage.getItem('bybit_p2p_pricing_filter_limits') !== null
    ? localStorage.getItem('bybit_p2p_pricing_filter_limits') !== 'false'
    : (storeSettings.filterLimits !== undefined ? storeSettings.filterLimits : true);
  const maxFeeDragPct = localStorage.getItem('bybit_p2p_pricing_max_fee_drag_pct') || (storeSettings.maxFeeDragPct !== undefined ? String(storeSettings.maxFeeDragPct) : '20');

  // Buyback calculator settings
  const bbMode = localStorage.getItem('bybit_p2p_buyback_mode') || 'target-driven';
  const bbVol = localStorage.getItem('bybit_p2p_buyback_total_vol') || '100000';
  const bbProfitSpread = localStorage.getItem('bybit_p2p_buyback_profit_spread') || '7.0';
  const bbTargetPrice = localStorage.getItem('bybit_p2p_buyback_target_price') || '1495';
  const bbMarketSell = localStorage.getItem('bybit_p2p_buyback_market_sell') || '1502';

  // Sweet Spot Profit Target (primary input)
  const profitTarget = localStorage.getItem('bybit_p2p_profit_target') || bbProfitSpread || '7.0';

  const elPlatformFee = document.getElementById('input-platform-fee-pct') || document.getElementById('input-platform-fee');
  const elSpread = document.getElementById('input-target-spread');
  const elVol = document.getElementById('input-avg-volume');
  const elInflow = document.getElementById('input-inflow-fee');
  const elOutflow = document.getElementById('input-outflow-fee');
  const elMode = document.getElementById('input-pricing-mode');
  const elDepthLimit = document.getElementById('input-depth-limit');
  const elFilterLimits = document.getElementById('input-filter-limits');
  const elMaxFeeDrag = document.getElementById('input-max-fee-drag-pct');

  const elBbMode = document.getElementById('input-buyback-mode');
  const elBbVol = document.getElementById('input-buyback-total-vol');
  const elBbProfitSpread = document.getElementById('input-buyback-profit-spread');
  const elBbTargetPrice = document.getElementById('input-buyback-target-price');
  const elBbMarketSell = document.getElementById('input-buyback-market-sell');
  const elProfitTarget = document.getElementById('input-profit-target');

  if (elPlatformFee && document.activeElement !== elPlatformFee) elPlatformFee.value = platformFee;
  if (elSpread && document.activeElement !== elSpread) elSpread.value = spread;
  if (elVol && document.activeElement !== elVol) elVol.value = vol;
  if (elInflow && document.activeElement !== elInflow) elInflow.value = inflow;
  if (elOutflow && document.activeElement !== elOutflow) elOutflow.value = outflow;
  if (elMode && document.activeElement !== elMode) elMode.value = mode;
  if (elDepthLimit && document.activeElement !== elDepthLimit) elDepthLimit.value = depthLimit;
  if (elFilterLimits && document.activeElement !== elFilterLimits) elFilterLimits.checked = filterLimits;
  if (elMaxFeeDrag && document.activeElement !== elMaxFeeDrag) elMaxFeeDrag.value = maxFeeDragPct;

  if (elBbMode && document.activeElement !== elBbMode) elBbMode.value = bbMode;
  if (elBbVol && document.activeElement !== elBbVol) elBbVol.value = bbVol;
  if (elBbProfitSpread && document.activeElement !== elBbProfitSpread) elBbProfitSpread.value = bbProfitSpread;
  if (elBbTargetPrice && document.activeElement !== elBbTargetPrice) elBbTargetPrice.value = bbTargetPrice;
  if (elBbMarketSell && document.activeElement !== elBbMarketSell) elBbMarketSell.value = bbMarketSell;
  if (elProfitTarget && document.activeElement !== elProfitTarget) elProfitTarget.value = profitTarget;

  updateBuybackModeVisibility(bbMode);
}

/**
 * Toggle Buyback calculator visibility based on mode selection
 */
function updateBuybackModeVisibility(mode) {
  const groupTarget = document.getElementById('group-buyback-target-price');
  const groupMarket = document.getElementById('group-buyback-market-sell');
  const badge = document.getElementById('buyback-mode-badge');

  if (mode === 'market-driven') {
    if (groupTarget) groupTarget.style.display = 'none';
    if (groupMarket) groupMarket.style.display = 'block';
    if (badge) {
      badge.textContent = 'Market-Driven';
      badge.className = 'badge badge-warning tiny';
    }
  } else {
    if (groupTarget) groupTarget.style.display = 'block';
    if (groupMarket) groupMarket.style.display = 'none';
    if (badge) {
      badge.textContent = 'Target-Driven';
      badge.className = 'badge badge-primary tiny';
    }
  }
}

/**
 * Persist pricing inputs to localStorage and store
 */
function saveSettings() {
  const elPlatformFee = document.getElementById('input-platform-fee-pct') || document.getElementById('input-platform-fee');
  const elSpread = document.getElementById('input-target-spread');
  const elVol = document.getElementById('input-avg-volume');
  const elInflow = document.getElementById('input-inflow-fee');
  const elOutflow = document.getElementById('input-outflow-fee');
  const elMode = document.getElementById('input-pricing-mode');
  const elDepthLimit = document.getElementById('input-depth-limit');
  const elFilterLimits = document.getElementById('input-filter-limits');
  const elMaxFeeDrag = document.getElementById('input-max-fee-drag-pct');

  const elBbMode = document.getElementById('input-buyback-mode');
  const elBbVol = document.getElementById('input-buyback-total-vol');
  const elBbProfitSpread = document.getElementById('input-buyback-profit-spread');
  const elBbTargetPrice = document.getElementById('input-buyback-target-price');
  const elBbMarketSell = document.getElementById('input-buyback-market-sell');

  const platformFeeVal = elPlatformFee ? elPlatformFee.value : '0.3';
  if (elPlatformFee) {
    localStorage.setItem('bybit_p2p_pricing_platform_fee_pct', platformFeeVal);
    localStorage.setItem('bybit_p2p_pricing_platform_fee', platformFeeVal);
  }
  if (elSpread && elSpread.value !== '') localStorage.setItem('bybit_p2p_pricing_spread', elSpread.value);
  if (elVol && elVol.value !== '') localStorage.setItem('bybit_p2p_pricing_volume', elVol.value);
  if (elInflow && elInflow.value !== '') localStorage.setItem('bybit_p2p_pricing_inflow', elInflow.value);
  if (elOutflow && elOutflow.value !== '') localStorage.setItem('bybit_p2p_pricing_outflow', elOutflow.value);
  if (elMode) localStorage.setItem('bybit_p2p_pricing_mode', elMode.value);
  if (elDepthLimit && elDepthLimit.value !== '') localStorage.setItem('bybit_p2p_pricing_depth_limit', elDepthLimit.value);
  if (elFilterLimits) localStorage.setItem('bybit_p2p_pricing_filter_limits', elFilterLimits.checked.toString());
  if (elMaxFeeDrag && elMaxFeeDrag.value !== '') localStorage.setItem('bybit_p2p_pricing_max_fee_drag_pct', elMaxFeeDrag.value);

  if (elBbMode) {
    localStorage.setItem('bybit_p2p_buyback_mode', elBbMode.value);
    updateBuybackModeVisibility(elBbMode.value);
  }
  if (elBbVol && elBbVol.value !== '') localStorage.setItem('bybit_p2p_buyback_total_vol', elBbVol.value);
  if (elBbProfitSpread && elBbProfitSpread.value !== '') localStorage.setItem('bybit_p2p_buyback_profit_spread', elBbProfitSpread.value);
  if (elBbTargetPrice && elBbTargetPrice.value !== '') localStorage.setItem('bybit_p2p_buyback_target_price', elBbTargetPrice.value);
  if (elBbMarketSell && elBbMarketSell.value !== '') localStorage.setItem('bybit_p2p_buyback_market_sell', elBbMarketSell.value);

  // Sync profit target: save to dedicated key AND to buyback profit spread for backward compat
  const elProfitTarget = document.getElementById('input-profit-target');
  if (elProfitTarget && elProfitTarget.value !== '') {
    localStorage.setItem('bybit_p2p_profit_target', elProfitTarget.value);
    localStorage.setItem('bybit_p2p_buyback_profit_spread', elProfitTarget.value);
    // Also sync the hidden buyback profit spread input if it exists
    const elBbPS = document.getElementById('input-buyback-profit-spread');
    if (elBbPS && document.activeElement !== elBbPS) elBbPS.value = elProfitTarget.value;
  }

  const maxFeeDragRaw = elMaxFeeDrag ? elMaxFeeDrag.value.trim() : '';
  const parsedFeeDrag = parseInt(maxFeeDragRaw, 10);
  const currentSettings = store.getSettings ? store.getSettings() : {};
  const maxFeeDragVal = !isNaN(parsedFeeDrag) ? parsedFeeDrag : (currentSettings.maxFeeDragPct || 20);

  if (store.saveSettings) {
    store.saveSettings({
      platformFeePct: parseFloat(platformFeeVal) || 0.3,
      targetSpread: elSpread && elSpread.value !== '' ? parseFloat(elSpread.value) || 5.0 : 5.0,
      avgVolume: elVol && elVol.value !== '' ? parseFloat(elVol.value) || 100.0 : 100.0,
      inflowFee: elInflow && elInflow.value !== '' ? parseFloat(elInflow.value) || 50.0 : 50.0,
      outflowFee: elOutflow && elOutflow.value !== '' ? (parseFloat(elOutflow.value) || 0) : 0,
      pricingMode: elMode ? elMode.value : 'avg-10',
      depthLimit: elDepthLimit && elDepthLimit.value !== '' ? parseInt(elDepthLimit.value, 10) || 50 : 50,
      filterLimits: elFilterLimits ? elFilterLimits.checked : true,
      maxFeeDragPct: maxFeeDragVal
    });
  }
}

/**
 * Attach interaction events to input fields and copy triggers
 */
function setupListeners() {
  const inputs = [
    'input-profit-target',
    'input-platform-fee-pct',
    'input-platform-fee',
    'input-target-spread',
    'input-avg-volume',
    'input-inflow-fee',
    'input-outflow-fee',
    'input-pricing-mode',
    'input-depth-limit',
    'input-filter-limits',
    'input-max-fee-drag-pct',
    'input-buyback-mode',
    'input-buyback-total-vol',
    'input-buyback-profit-spread',
    'input-buyback-target-price',
    'input-buyback-market-sell'
  ];

  inputs.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    const eventName = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(eventName, () => {
      saveSettings();
      calculateMargins();
    });
  });

  document.getElementById('btn-refresh-market-depth')?.addEventListener('click', () => {
    refreshPricingData(true);
  });

  document.getElementById('btn-reset-buyback-session')?.addEventListener('click', () => {
    resetBuybackSession();
  });

  // Copy Suggested rates triggers
  document.getElementById('btn-copy-buy-price')?.addEventListener('click', () => {
    const el = document.getElementById('pricing-suggested-buy');
    if (el && el.textContent !== '₦0.00' && el.textContent !== '—') {
      const numericText = el.textContent.replace(/[₦,]/g, '').trim();
      navigator.clipboard.writeText(numericText);
      if (window.showToast) window.showToast(`Copied Buy Price: ₦${numericText}`, 'success');
    }
  });

  document.getElementById('btn-copy-sell-price')?.addEventListener('click', () => {
    const el = document.getElementById('pricing-suggested-sell');
    if (el && el.textContent !== '₦0.00' && el.textContent !== '—') {
      const numericText = el.textContent.replace(/[₦,]/g, '').trim();
      navigator.clipboard.writeText(numericText);
      if (window.showToast) window.showToast(`Copied Sell Price: ₦${numericText}`, 'success');
    }
  });
}

/**
 * Query proxy server to fetch live order depth and trigger margin calculations
 */
export async function refreshPricingData(showToast = false) {
  const btnRefresh = document.getElementById('btn-refresh-market-depth');
  if (btnRefresh) {
    btnRefresh.disabled = true;
    btnRefresh.querySelector('span').textContent = 'Syncing...';
  }

  try {
    const depthLimit = parseInt(localStorage.getItem('bybit_p2p_pricing_depth_limit'), 10) || 50;
    const depth = await bybitService.fetchMarketDepth('USDT', 'NGN', depthLimit);
    if (depth) {
      cachedMarketDepth = depth;
      renderOrderBooks(depth);
      calculateMargins();
      if (showToast && window.showToast) {
        window.showToast('P2P order book sync completed.', 'success');
      }
    }
  } catch (e) {
    console.warn('[Pricing] Proxy market depth query failed:', e.message);
    if (showToast && window.showToast) {
      window.showToast('Could not fetch market data. Ensure proxy is online.', 'error');
    }
  } finally {
    if (btnRefresh) {
      btnRefresh.disabled = false;
      btnRefresh.querySelector('span').textContent = 'Refresh Market';
    }
    if (window.lucide) window.lucide.createIcons();
  }
}

/**
 * Get active buyback session start timestamp from storage
 */
export function getBuybackSessionStartTime() {
  const stored = localStorage.getItem('bybit_p2p_buyback_session_start');
  if (stored && !isNaN(Number(stored)) && Number(stored) > 0) {
    return Number(stored);
  }
  const now = Date.now();
  localStorage.setItem('bybit_p2p_buyback_session_start', String(now));
  return now;
}

/**
 * Reset buyback session timestamp to now to start a clean buyback goal
 */
export function resetBuybackSession() {
  const now = Date.now();
  localStorage.setItem('bybit_p2p_buyback_session_start', String(now));
  calculateMargins();
  if (window.showToast) {
    window.showToast('Buyback session reset. Tracking new buy orders from now.', 'success');
  }
}

/**
 * Build dynamic pricing suggestions combining local FIFO state & public ad depth
 */
export function calculateMargins() {
  // Retrieve user settings values
  const elPlatformFee = document.getElementById('input-platform-fee-pct') || document.getElementById('input-platform-fee');
  let platformFeePct = 0;
  if (elPlatformFee) {
    platformFeePct = parseFloat(elPlatformFee.value);
    if (isNaN(platformFeePct)) platformFeePct = 0.3;
  } else {
    const savedFee = localStorage.getItem('bybit_p2p_pricing_platform_fee_pct') || localStorage.getItem('bybit_p2p_pricing_platform_fee');
    if (savedFee !== null && savedFee !== undefined && savedFee !== '') {
      platformFeePct = parseFloat(savedFee);
      if (isNaN(platformFeePct)) platformFeePct = 0;
    } else {
      platformFeePct = 0;
    }
  }

  const targetSpread = parseFloat(document.getElementById('input-target-spread')?.value) || 5.0;
  const avgVolume = parseFloat(document.getElementById('input-avg-volume')?.value) || 100.0;
  const inflowFee = parseFloat(document.getElementById('input-inflow-fee')?.value) || 50.0;
  const elOutflow = document.getElementById('input-outflow-fee');
  const outflowFee = elOutflow ? (parseFloat(elOutflow.value) || 0) : (storeSettings.outflowFee !== undefined ? storeSettings.outflowFee : 50.0);
  const pricingMode = document.getElementById('input-pricing-mode')?.value || 'avg-10';
  const filterLimits = document.getElementById('input-filter-limits')?.checked ?? true;
  const maxFeeDragPct = parseInt(document.getElementById('input-max-fee-drag-pct')?.value, 10) || 20;
  const maxFeeDragRatio = Math.min(Math.max(maxFeeDragPct / 100, 0.01), 1.0);

  // Fetch costs from FIFO ledger
  const trades = store.getTrades();
  const openingInventory = store.getOpeningInventory();
  const fifoResult = calculateFIFOInventoryAndPnL(trades, openingInventory);
  const costBasis = fifoResult.avgHoldingCostPerUSDT || openingInventory.defaultCostBasis || 0;

  // Render Cost Basis (FIFO)
  const elCostBasis = document.getElementById('pricing-cost-basis');
  if (elCostBasis) {
    elCostBasis.textContent = formatNGN(costBasis);
  }

  // Competitor Lists
  const buyAds = cachedMarketDepth ? (cachedMarketDepth.buyDepth || []) : []; // Competitor buy ads (side 1)
  const sellAds = cachedMarketDepth ? (cachedMarketDepth.sellDepth || []) : []; // Competitor sell ads (side 0)

  // Sort: Buy ads descending (highest price first), Sell ads ascending (cheapest price first)
  const sortedBuyAds = [...buyAds].sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
  const sortedSellAds = [...sellAds].sort((a, b) => parseFloat(a.price) - parseFloat(b.price));

  // Filter ads by volume and limits via extracted pricing engine
  const filteredBuyAds = filterCompetitorAds(sortedBuyAds, avgVolume, filterLimits);
  const filteredSellAds = filterCompetitorAds(sortedSellAds, avgVolume, filterLimits);

  // Fallback to sorted list if filtered list is empty to prevent blank screen
  const activeBuyAds = filteredBuyAds.length > 0 ? filteredBuyAds : sortedBuyAds;
  const activeSellAds = filteredSellAds.length > 0 ? filteredSellAds : sortedSellAds;

  // -------------------------------------------------------------
  // A. BUY SIDE: prices you should buy at (0.3% Maker fee + Stamp duty)
  // -------------------------------------------------------------
  const buyAnalysis = calculateBuyPricing({
    activeBuyAds,
    sortedSellAds,
    targetSpread,
    inflowFee,
    outflowFee,
    platformFeePct: platformFeePct || 0.3,
    avgVolume,
    pricingMode
  });

  const elExitPrice = document.getElementById('pricing-exit-price');
  if (elExitPrice) {
    elExitPrice.textContent = buyAnalysis.exitPrice > 0 ? formatNGN(buyAnalysis.exitPrice) : '—';
  }

  const elTopBuyComp = document.getElementById('pricing-top-buy-competitor');
  if (elTopBuyComp) {
    elTopBuyComp.textContent = buyAnalysis.referenceBuyPrice > 0 ? formatNGN(buyAnalysis.referenceBuyPrice) : '—';
    const label = elTopBuyComp.previousElementSibling;
    if (label) {
      if (pricingMode === 'competitor') {
        label.textContent = 'Top Competitor Buy:';
      } else if (pricingMode.startsWith('vwap')) {
        label.textContent = `VWAP Buy (Top ${pricingMode.split('-')[1]}):`;
      } else {
        label.textContent = `Avg Competitor Buy (Top ${pricingMode.split('-')[1]}):`;
      }
    }
  }

  const elMaxBuy = document.getElementById('pricing-max-buy');
  const elSuggestedBuy = document.getElementById('pricing-suggested-buy');
  const elBuyStatus = document.getElementById('pricing-buy-status');

  if (!buyAnalysis.isOffline) {
    if (elMaxBuy) elMaxBuy.textContent = formatNGN(buyAnalysis.maxBuyPrice);
    if (elSuggestedBuy) elSuggestedBuy.textContent = formatNGN(buyAnalysis.suggestedBuy);

    if (buyAnalysis.isSafe) {
      if (elBuyStatus) {
        elBuyStatus.innerHTML = `<span class="badge badge-success">🟢 Safe to Outbid • Spread: +₦${buyAnalysis.excessSpread.toFixed(2)}</span>`;
      }
      if (elSuggestedBuy) elSuggestedBuy.className = 'font-mono text-success fw-bold my-1';
    } else {
      if (elBuyStatus) {
        elBuyStatus.innerHTML = `<span class="badge badge-danger">🔴 Spread Compressed (Capped for Spread)</span>`;
      }
      if (elSuggestedBuy) elSuggestedBuy.className = 'font-mono text-warning fw-bold my-1';
    }
  } else {
    if (elMaxBuy) elMaxBuy.textContent = '—';
    if (elSuggestedBuy) elSuggestedBuy.textContent = '—';
    if (elBuyStatus) elBuyStatus.innerHTML = '<span class="badge badge-neutral">Offline</span>';
  }

  // Update Buy Maker Badge
  const elBuyMakerBadge = document.getElementById('pricing-buy-maker-badge');
  if (elBuyMakerBadge) elBuyMakerBadge.textContent = `${platformFeePct.toFixed(2)}% Maker Fee`;

  // Render Buy Fee Breakdown & Limits Recommendation (if UI elements exist)
  const elBuyFeeBreakdown = document.getElementById('pricing-buy-fee-breakdown');
  if (elBuyFeeBreakdown && buyAnalysis.feeBreakdown) {
    elBuyFeeBreakdown.innerHTML = `
      <div class="fee-breakdown-pills">
        <span class="badge badge-neutral tiny">Maker Fee: ₦${buyAnalysis.feeBreakdown.platformFeePerUnit.toFixed(2)}/USDT</span>
        <span class="badge badge-neutral tiny">Fiat Inflow: ₦${buyAnalysis.feeBreakdown.inflowFeePerUnit.toFixed(2)}/USDT</span>
        <span class="badge badge-primary tiny">Net Cost Basis: ₦${buyAnalysis.feeBreakdown.effectiveCostBasis.toFixed(2)}/USDT</span>
      </div>
    `;
  }

  const buyLimits = calculateRecommendedLimits(
    buyAnalysis.suggestedBuy || buyAnalysis.exitPrice || 1500,
    targetSpread,
    inflowFee,
    { platformFeePct: platformFeePct || 0.3, maxFeeDragRatio }
  );

  const elBuyLimitRec = document.getElementById('pricing-buy-limit-rec') || document.getElementById('pricing-recommended-buy-limit');
  if (elBuyLimitRec) {
    elBuyLimitRec.innerHTML = `<span class="small text-muted font-mono"><i data-lucide="shield-alert"></i> ${buyLimits.recommendedText}</span>`;
  }

  // -------------------------------------------------------------
  // B. SELL SIDE: prices you should sell at (0 fees on Sell side)
  // -------------------------------------------------------------
  const sellAnalysis = calculateSellPricing({
    activeSellAds,
    costBasis,
    targetSpread,
    outflowFee: 0,
    platformFeePct: 0,
    avgVolume,
    pricingMode
  });

  const elTopSellComp = document.getElementById('pricing-top-sell-competitor');
  if (elTopSellComp) {
    elTopSellComp.textContent = sellAnalysis.referenceSellPrice > 0 ? formatNGN(sellAnalysis.referenceSellPrice) : '—';
    const label = elTopSellComp.previousElementSibling;
    if (label) {
      if (pricingMode === 'competitor') {
        label.textContent = 'Top Competitor Sell:';
      } else if (pricingMode.startsWith('vwap')) {
        label.textContent = `VWAP Sell (Top ${pricingMode.split('-')[1]}):`;
      } else {
        label.textContent = `Avg Competitor Sell (Top ${pricingMode.split('-')[1]}):`;
      }
    }
  }

  const elBreakEven = document.getElementById('pricing-break-even');
  const elTargetSell = document.getElementById('pricing-target-sell-price');
  const elSuggestedSell = document.getElementById('pricing-suggested-sell');
  const elSellStatus = document.getElementById('pricing-sell-status');

  if (sellAnalysis.hasCostBasis) {
    if (elBreakEven) elBreakEven.textContent = formatNGN(sellAnalysis.breakEven);
    if (elTargetSell) elTargetSell.textContent = formatNGN(sellAnalysis.targetSellPrice);

    if (sellAnalysis.hasCompetitors) {
      if (elSuggestedSell) elSuggestedSell.textContent = formatNGN(sellAnalysis.suggestedSell);

      if (sellAnalysis.isSafe) {
        if (elSellStatus) {
          elSellStatus.innerHTML = `<span class="badge badge-success">🟢 Safe to Undercut • Spread: +₦${sellAnalysis.sellSpread.toFixed(2)}</span>`;
        }
        if (elSuggestedSell) elSuggestedSell.className = 'font-mono text-success fw-bold my-1';
      } else {
        if (elSellStatus) {
          elSellStatus.innerHTML = `<span class="badge badge-danger">🔴 Below Target Spread (Floored for Spread)</span>`;
        }
        if (elSuggestedSell) elSuggestedSell.className = 'font-mono text-warning fw-bold my-1';
      }
    } else {
      if (elSuggestedSell) elSuggestedSell.textContent = '—';
      if (elSellStatus) elSellStatus.innerHTML = '<span class="badge badge-neutral">No active competitors</span>';
    }
  } else {
    if (elBreakEven) elBreakEven.textContent = '—';
    if (elTargetSell) elTargetSell.textContent = '—';
    if (elSuggestedSell) elSuggestedSell.textContent = '—';
    if (elSellStatus) elSellStatus.innerHTML = '<span class="badge badge-neutral">No inventory costs found</span>';
  }

  // Update Sell Maker Badge
  const elSellMakerBadge = document.getElementById('pricing-sell-maker-badge');
  if (elSellMakerBadge) elSellMakerBadge.textContent = '0.00% Maker Fee';

  // Render Sell Fee Breakdown & Limits Recommendation (if UI elements exist)
  const elSellFeeBreakdown = document.getElementById('pricing-sell-fee-breakdown');
  if (elSellFeeBreakdown && sellAnalysis.feeBreakdown) {
    elSellFeeBreakdown.innerHTML = `
      <div class="fee-breakdown-pills">
        <span class="badge badge-neutral tiny">Maker Fee: ₦0.00/USDT</span>
        <span class="badge badge-neutral tiny">Fiat Outflow: ₦0.00/USDT</span>
        <span class="badge badge-success tiny">Net Revenue: ₦${sellAnalysis.feeBreakdown.netRealizedRevenue.toFixed(2)}/USDT</span>
      </div>
    `;
  }

  const sellLimits = calculateRecommendedLimits(
    sellAnalysis.suggestedSell || costBasis || 1500,
    targetSpread,
    outflowFee,
    { platformFeePct, maxFeeDragRatio }
  );

  const elSellLimitRec = document.getElementById('pricing-sell-limit-rec') || document.getElementById('pricing-recommended-sell-limit');
  if (elSellLimitRec) {
    elSellLimitRec.innerHTML = `<span class="small text-muted font-mono"><i data-lucide="shield-alert"></i> ${sellLimits.recommendedText}</span>`;
  }

  // -------------------------------------------------------------
  // C. SWEET SPOT PRICING ENGINE & BUYBACK CALCULATOR
  // -------------------------------------------------------------
  // Primary input: Profit Target (₦/USDT) from the new input-profit-target field
  const primaryProfitTarget = parseFloat(document.getElementById('input-profit-target')?.value) || 7.0;

  const bbMode = document.getElementById('input-buyback-mode')?.value || 'target-driven';
  const bbTotalVol = parseFloat(document.getElementById('input-buyback-total-vol')?.value) || 100000;
  const bbProfitSpread = primaryProfitTarget; // Sync: profit target drives the buyback spread
  const bbTargetPrice = parseFloat(document.getElementById('input-buyback-target-price')?.value) || 1495;
  const elBbMarketSell = document.getElementById('input-buyback-market-sell');
  let bbMarketSell = elBbMarketSell ? parseFloat(elBbMarketSell.value) : 1502;

  if (bbMode === 'market-driven' && sellAnalysis.referenceSellPrice > 0 && (!elBbMarketSell || document.activeElement !== elBbMarketSell)) {
    bbMarketSell = sellAnalysis.referenceSellPrice;
    if (elBbMarketSell) elBbMarketSell.value = bbMarketSell.toFixed(2);
  }

  // Calculate executed buy trades inventory stats scoped to active session
  const sessionStartTime = getBuybackSessionStartTime();
  const buyTrades = trades.filter(t => {
    if (!t || (t.direction !== 'BUY' && t.type !== 'BUY')) return false;
    if (sessionStartTime > 0) {
      const tradeTime = new Date(t.timestamp || t.createdAt || t.orderTime || t.date || 0).getTime();
      return tradeTime >= sessionStartTime;
    }
    return true;
  });

  let boughtVolume = 0;
  let totalSpentNgn = 0;
  buyTrades.forEach(t => {
    const vol = parseFloat(t.usdtAmount || t.amount || t.quantity) || 0;
    const rate = parseFloat(t.rate || t.price) || 0;
    boughtVolume += vol;
    totalSpentNgn += (vol * rate);
  });
  const boughtAvgPrice = boughtVolume > 0 ? (totalSpentNgn / boughtVolume) : 0;

  // D. SWEET SPOT CALCULATION (anchored to profit target + live order book)
  const sweetSpotResult = calculateSweetSpotPricing({
    sellDepth: sortedSellAds,
    buyDepth: sortedBuyAds,
    profitTarget: primaryProfitTarget,
    cycleVolume: bbTotalVol,
    tradeVolume: avgVolume,
    platformFeePct: platformFeePct || 0.3,
    platformFeePctSell: 0.0,
    inflowFee,
    outflowFee,
    boughtVolume,
    boughtAvgPrice,
    filterLimits
  });

  // Use sweet spot result to drive the buyback tiers (backward compat with buybackAnalysis)
  const buybackAnalysis = calculateBuybackTiers({
    mode: bbMode,
    totalVolume: bbTotalVol,
    targetAvgPrice: sweetSpotResult.maxBuyPrice > 0 ? sweetSpotResult.maxBuyPrice : bbTargetPrice,
    marketSellPrice: sweetSpotResult.sellSweetSpot > 0 ? sweetSpotResult.sellSweetSpot : bbMarketSell,
    profitSpread: bbProfitSpread,
    platformFeePct: platformFeePct || 0.3,
    inflowFee,
    sortedBuyAds,
    sortedSellAds,
    boughtVolume,
    boughtAvgPrice
  });

  // E. UPDATE SWEET SPOT RECOMMENDATION CARDS
  const elSweetBuyRate = document.getElementById('pricing-suggested-buy');
  const elSweetSellRate = document.getElementById('pricing-suggested-sell');
  const elSweetBuyStatus = document.getElementById('pricing-buy-status');
  const elSweetSellStatus = document.getElementById('pricing-sell-status');
  const elSweetBuyRankBadge = document.getElementById('sweet-spot-buy-rank-badge');
  const elSweetSellRankBadge = document.getElementById('sweet-spot-sell-rank-badge');
  const elSweetMaxBuy = document.getElementById('pricing-max-buy');

  if (sweetSpotResult.isOffline) {
    if (elSweetBuyRate) elSweetBuyRate.textContent = '—';
    if (elSweetSellRate) elSweetSellRate.textContent = '—';
    if (elSweetBuyStatus) elSweetBuyStatus.innerHTML = '<span class="badge badge-neutral">Order Book Offline</span>';
    if (elSweetSellStatus) elSweetSellStatus.innerHTML = '<span class="badge badge-neutral">Order Book Offline</span>';
    if (elSweetMaxBuy) elSweetMaxBuy.textContent = '—';
  } else {
    if (elSweetBuyRate) {
      elSweetBuyRate.textContent = sweetSpotResult.buySweetSpot > 0 ? formatNGN(sweetSpotResult.buySweetSpot) : formatNGN(buyAnalysis.suggestedBuy);
      elSweetBuyRate.className = sweetSpotResult.isSafe ? 'font-mono text-success fw-bold sweet-spot-rate' : 'font-mono text-warning fw-bold sweet-spot-rate';
    }
    if (elSweetSellRate) {
      const sellPriceToDisplay = sellAnalysis.suggestedSell > 0 ? sellAnalysis.suggestedSell : sweetSpotResult.sellSweetSpot;
      elSweetSellRate.textContent = sellPriceToDisplay > 0 ? formatNGN(sellPriceToDisplay) : '—';
      elSweetSellRate.className = (sellAnalysis.hasCostBasis ? sellAnalysis.isSafe : true) ? 'font-mono text-success fw-bold sweet-spot-rate' : 'font-mono text-warning fw-bold sweet-spot-rate';
    }
    if (elSweetMaxBuy) elSweetMaxBuy.textContent = sweetSpotResult.maxBuyPrice > 0 ? formatNGN(sweetSpotResult.maxBuyPrice) : formatNGN(buyAnalysis.maxBuyPrice);

    if (sweetSpotResult.isSafe) {
      if (elSweetBuyStatus) elSweetBuyStatus.innerHTML = `<span class="badge badge-success">🟢 Safe • Net Profit: +₦${sweetSpotResult.realizedSpread.toFixed(2)}/USDT</span>`;
    } else if (sweetSpotResult.status === 'COMPRESSED') {
      if (elSweetBuyStatus) elSweetBuyStatus.innerHTML = `<span class="badge badge-danger">🔴 Compressed — Capped at Safe Ceiling</span>`;
    } else if (sweetSpotResult.status === 'INVALID_TARGET') {
      if (elSweetBuyStatus) elSweetBuyStatus.innerHTML = `<span class="badge badge-danger">🔴 Target exceeds market spread</span>`;
    }

    if (elSweetSellStatus) {
      if (sellAnalysis.hasCostBasis && sellAnalysis.hasCompetitors) {
        if (sellAnalysis.isSafe) {
          elSweetSellStatus.innerHTML = `<span class="badge badge-success">🟢 Safe to Undercut • Spread: +₦${sellAnalysis.sellSpread.toFixed(2)}</span>`;
        } else {
          elSweetSellStatus.innerHTML = `<span class="badge badge-danger">🔴 Below Target Spread (Floored for Spread)</span>`;
        }
      } else if (sweetSpotResult.sellSweetSpot > 0) {
        elSweetSellStatus.innerHTML = `<span class="badge badge-success">🟢 Rank ${sweetSpotResult.markers.sellTargetRank} Sweet Spot</span>`;
      } else {
        elSweetSellStatus.innerHTML = '<span class="badge badge-neutral">No sell depth</span>';
      }
    }
  }

  // Update rank badges
  if (elSweetBuyRankBadge) {
    elSweetBuyRankBadge.textContent = sweetSpotResult.markers.buyTargetRank > 0 ? `Rank #${sweetSpotResult.markers.buyTargetRank}` : 'Rank #—';
  }
  if (elSweetSellRankBadge) {
    elSweetSellRankBadge.textContent = sweetSpotResult.markers.sellTargetRank > 0 ? `Rank #${sweetSpotResult.markers.sellTargetRank}` : 'Rank #—';
  }

  // F. UPDATE 6-CARD METRICS using sweet spot result (overriding buyback values with sweet spot anchors)
  const elBbAvgBuy = document.getElementById('buyback-res-avg-buy');
  const elBbSellRate = document.getElementById('buyback-res-sell-rate');
  const elBbGrossSpread = document.getElementById('buyback-res-gross-spread');
  const elBbNetProfit = document.getElementById('buyback-res-net-profit');
  const elBbBoughtSoFar = document.getElementById('buyback-res-bought-so-far');
  const elBbBoughtAvg = document.getElementById('buyback-res-bought-avg');
  const elBbRemainingNeeded = document.getElementById('buyback-res-remaining-needed');
  const elBbRemainingBudget = document.getElementById('buyback-res-remaining-budget');
  const elBbNeededRateRemaining = document.getElementById('buyback-res-needed-remaining-rate');
  const elProgressBar = document.getElementById('buyback-progress-bar');
  const elProgressText = document.getElementById('buyback-progress-text');
  const elTargetBanner = document.getElementById('buyback-target-banner');
  const elTargetBannerText = document.getElementById('buyback-target-banner-text');
  const elSessionStartedLabel = document.getElementById('buyback-session-started-label');
  const elSessionSummaryLabel = document.getElementById('buyback-session-summary-label');
  const elMarketGuidance = document.getElementById('buyback-market-guidance');
  const elMarketGuidanceText = document.getElementById('buyback-market-guidance-text');
  const elTierLadder = document.getElementById('buyback-tier-ladder');
  const tbodyBrackets = document.getElementById('tbody-buyback-brackets');

  // Use sweet spot values when available, fallback to buyback analysis
  const displayAvgBuy = sweetSpotResult.maxBuyPrice > 0 ? sweetSpotResult.maxBuyPrice : buybackAnalysis.targetAvgPrice;
  const displaySellRate = sweetSpotResult.sellSweetSpot > 0 ? sweetSpotResult.sellSweetSpot : buybackAnalysis.targetSellPrice;
  const displayGrossSpread = sweetSpotResult.sellSweetSpot > 0 ? sweetSpotResult.grossSpread : buybackAnalysis.grossSpread;
  const displayNetProfit = sweetSpotResult.realizedSpread > 0 ? sweetSpotResult.realizedSpread : buybackAnalysis.netRealizedProfit;

  if (elBbAvgBuy) elBbAvgBuy.textContent = formatNGN(displayAvgBuy);
  if (elBbSellRate) elBbSellRate.textContent = formatNGN(displaySellRate);
  if (elBbGrossSpread) elBbGrossSpread.textContent = `Δ: ₦${displayGrossSpread.toFixed(2)}/USDT`;
  if (elBbNetProfit) {
    const isProfitable = displayNetProfit > 0;
    elBbNetProfit.textContent = `₦${displayNetProfit.toFixed(2)}/USDT`;
    elBbNetProfit.className = isProfitable ? 'font-mono fw-bold text-success' : 'font-mono fw-bold text-danger';
  }

  if (elBbBoughtSoFar) {
    elBbBoughtSoFar.textContent = `$${buybackAnalysis.progress.boughtVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
  }
  if (elBbBoughtAvg) {
    elBbBoughtAvg.textContent = buybackAnalysis.progress.boughtAvgPrice > 0 ? `Avg: ₦${buybackAnalysis.progress.boughtAvgPrice.toFixed(2)}` : 'Avg: —';
  }

  if (elBbRemainingNeeded) {
    elBbRemainingNeeded.textContent = `$${buybackAnalysis.progress.remainingVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
  }
  if (elBbRemainingBudget) {
    const remBudget = buybackAnalysis.progress.remainingVolume * buybackAnalysis.progress.neededRemainingRate;
    elBbRemainingBudget.textContent = `Budget: ₦${remBudget.toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
  }

  if (elBbNeededRateRemaining) {
    elBbNeededRateRemaining.textContent = formatNGN(buybackAnalysis.progress.neededRemainingRate);
  }

  if (elProgressBar) {
    elProgressBar.style.width = `${buybackAnalysis.progress.progressPercent}%`;
    elProgressBar.className = buybackAnalysis.progress.isTargetAchieved ? 'progress-bar bg-success' : 'progress-bar bg-primary';
  }

  if (elProgressText) {
    elProgressText.textContent = `${buybackAnalysis.progress.progressPercent.toFixed(1)}% Complete ($${buybackAnalysis.progress.boughtVolume.toLocaleString()} / $${buybackAnalysis.totalVolume.toLocaleString()})`;
  }

  if (elSessionStartedLabel) {
    if (sessionStartTime > 0) {
      const d = new Date(sessionStartTime);
      elSessionStartedLabel.textContent = `Session started: ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      elSessionStartedLabel.textContent = 'Session: Active';
    }
  }

  if (elSessionSummaryLabel) {
    elSessionSummaryLabel.textContent = `$${buybackAnalysis.progress.boughtVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / $${buybackAnalysis.totalVolume.toLocaleString()} USDT`;
  }

  if (elTargetBanner) {
    if (buybackAnalysis.progress.isTargetAchieved) {
      elTargetBanner.style.display = 'block';
      if (elTargetBannerText) {
        elTargetBannerText.textContent = `🎯 Target Reached! ($${buybackAnalysis.progress.boughtVolume.toFixed(2)} / $${buybackAnalysis.totalVolume.toFixed(2)} USDT acquired @ ₦${buybackAnalysis.progress.boughtAvgPrice.toFixed(2)})`;
      }
    } else {
      elTargetBanner.style.display = 'none';
    }
  }

  // Render Market Guidance Diagnostics
  if (elMarketGuidance && elMarketGuidanceText && buybackAnalysis.marketDiagnostics) {
    const { buyMarketMessage, sellMarketMessage } = buybackAnalysis.marketDiagnostics;
    const messages = [buyMarketMessage, sellMarketMessage].filter(Boolean);
    if (messages.length > 0) {
      elMarketGuidanceText.innerHTML = messages.map(m => `<div>${escapeHtml(m)}</div>`).join('');
      elMarketGuidance.style.display = 'block';
    } else {
      elMarketGuidance.style.display = 'none';
    }
  }

  // Render Modern Mobile-Optimized Tier Ladder Cards
  if (elTierLadder && Array.isArray(buybackAnalysis.brackets)) {
    elTierLadder.innerHTML = buybackAnalysis.brackets.map(b => {
      const tierBadgeClass = b.tier === 1 ? 'badge-primary' : (b.tier === 2 ? 'badge-warning' : 'badge-neutral');
      return `
        <div class="buyback-tier-card">
          <div class="buyback-tier-header">
            <div class="d-flex align-items-center gap-2">
              <span class="badge ${tierBadgeClass} tiny">${escapeHtml(b.name.split(':')[0])}</span>
              <span class="fw-bold text-white small">${escapeHtml(b.name.split(':')[1] || b.name)}</span>
            </div>
            <div class="font-mono fw-bold text-success buyback-tier-rate">
              ₦${b.targetPrice.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div class="buyback-tier-body">
            <div class="buyback-tier-col">
              <span class="text-muted tiny">ALLOCATION</span>
              <span class="font-mono text-info fw-bold small">${b.volumeUsdt.toLocaleString()} USDT <span class="text-muted tiny font-sans">(${b.volumePct}%)</span></span>
            </div>
            <div class="buyback-tier-col text-end">
              <span class="text-muted tiny">TOTAL NAIRA</span>
              <span class="font-mono text-secondary fw-bold small">₦${b.totalNgn.toLocaleString('en-NG', { maximumFractionDigits: 0 })}</span>
            </div>
          </div>
          <div class="buyback-tier-footer">
            <span class="text-muted tiny">${escapeHtml(b.description)}</span>
            <span class="text-success tiny font-mono fw-bold">+₦${b.spreadCapture.toFixed(2)}/USDT spread</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // Maintain hidden/fallback table for compatibility
  if (tbodyBrackets && Array.isArray(buybackAnalysis.brackets)) {
    tbodyBrackets.innerHTML = buybackAnalysis.brackets.map(b => {
      return `
        <tr>
          <td>
            <div class="fw-bold text-white text-nowrap">${escapeHtml(b.name)}</div>
            <div class="text-muted tiny">${escapeHtml(b.description)}</div>
          </td>
          <td class="font-mono fw-bold text-info text-nowrap">
            ${b.volumeUsdt.toLocaleString()} <span class="tiny text-muted">USDT (${b.volumePct}%)</span>
          </td>
          <td class="font-mono fw-bold text-success text-nowrap">
            ₦${b.targetPrice.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </td>
          <td class="text-end font-mono fw-bold text-secondary text-nowrap">
            ₦${b.totalNgn.toLocaleString('en-NG', { maximumFractionDigits: 0 })}
          </td>
        </tr>
      `;
    }).join('');
  }

  if (window.lucide) window.lucide.createIcons();

  return {
    buyAnalysis,
    sellAnalysis,
    buyLimits,
    sellLimits,
    buybackAnalysis,
    sweetSpotResult
  };
}

// Alias for calculateMargins as calculatePricing
export const calculatePricing = calculateMargins;

/**
 * Render P2P market depth items in tabular forms
 */
function renderOrderBooks(depth) {
  const buyTbody = document.querySelector('#pricing-buy-orderbook tbody');
  const sellTbody = document.querySelector('#pricing-sell-orderbook tbody');

  const buyItems = depth.buyDepth || [];
  const sellItems = depth.sellDepth || [];

  // Sort copy: Buy descending (highest first), Sell ascending (lowest first)
  const sortedBuyItems = [...buyItems].sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
  const sortedSellItems = [...sellItems].sort((a, b) => parseFloat(a.price) - parseFloat(b.price));

  // Render top 10 rows to avoid extremely long tables
  const displayBuyItems = sortedBuyItems.slice(0, 10);
  const displaySellItems = sortedSellItems.slice(0, 10);

  if (buyTbody) {
    if (displayBuyItems.length === 0) {
      buyTbody.innerHTML = `<tr><td colspan="3" class="text-center py-3 text-muted">No Buy ads online</td></tr>`;
    } else {
      buyTbody.innerHTML = displayBuyItems.map((ad, idx) => {
        const price = parseFloat(ad.price) || 0;
        const available = parseFloat(ad.lastQuantity) || 0;
        const minLmt = parseFloat(ad.minAmount || ad.minSingleTransAmount) || 0;
        const maxLmt = parseFloat(ad.maxAmount || ad.maxSingleTransAmount) || 0;
        const advName = ad.nickName || ad.memberName || ad.userId || 'Advertiser';

        const isSweetSpot = idx >= 2 && idx <= 4;
        const rowClass = isSweetSpot
          ? 'orderbook-row orderbook-row-sweetspot cursor-pointer'
          : 'orderbook-row cursor-pointer';
        const sweetBadge = isSweetSpot ? ` <span class="badge badge-primary tiny">Rank #${idx + 1}</span>` : '';

        const limitStr = (minLmt > 0 || maxLmt > 0)
          ? `Lmt: ₦${minLmt.toLocaleString(undefined, { maximumFractionDigits: 0 })} - ₦${maxLmt.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
          : 'Lmt: No Limit';

        return `
          <tr class="${rowClass}" data-direction="SELL" data-rate="${price}" data-volume="${available}" data-counterparty="${escapeHtml(advName)}" title="Tap to record Sell trade at ₦${price}">
            <td>
              <div class="fw-semibold truncate" style="max-width: 120px;" title="${escapeHtml(advName)}">
                ${idx + 1}. ${escapeHtml(advName)}${sweetBadge}
              </div>
              <div class="text-muted tiny">${limitStr}</div>
            </td>
            <td class="font-mono fw-bold text-success">
              ₦${price.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
            </td>
            <td class="text-end font-mono text-secondary small">
              ${available.toFixed(1)} <span class="tiny text-muted">USDT</span>
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  if (sellTbody) {
    if (displaySellItems.length === 0) {
      sellTbody.innerHTML = `<tr><td colspan="3" class="text-center py-3 text-muted">No Sell ads online</td></tr>`;
    } else {
      sellTbody.innerHTML = displaySellItems.map((ad, idx) => {
        const price = parseFloat(ad.price) || 0;
        const available = parseFloat(ad.lastQuantity) || 0;
        const minLmt = parseFloat(ad.minAmount || ad.minSingleTransAmount) || 0;
        const maxLmt = parseFloat(ad.maxAmount || ad.maxSingleTransAmount) || 0;
        const advName = ad.nickName || ad.memberName || ad.userId || 'Advertiser';

        const limitStr = (minLmt > 0 || maxLmt > 0)
          ? `Lmt: ₦${minLmt.toLocaleString(undefined, { maximumFractionDigits: 0 })} - ₦${maxLmt.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
          : 'Lmt: No Limit';

        const isSweetSpot = idx >= 2 && idx <= 4;
        const rowClass = isSweetSpot
          ? 'orderbook-row orderbook-row-sweetspot-sell cursor-pointer'
          : 'orderbook-row cursor-pointer';
        const sweetBadge = isSweetSpot ? ` <span class="badge badge-success tiny">Rank #${idx + 1}</span>` : '';

        return `
          <tr class="${rowClass}" data-direction="BUY" data-rate="${price}" data-volume="${available}" data-counterparty="${escapeHtml(advName)}" title="Tap to record Buy trade at ₦${price}">
            <td>
              <div class="fw-semibold truncate" style="max-width: 120px;" title="${escapeHtml(advName)}">
                ${idx + 1}. ${escapeHtml(advName)}${sweetBadge}
              </div>
              <div class="text-muted tiny">${limitStr}</div>
            </td>
            <td class="font-mono fw-bold text-danger">
              ₦${price.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
            </td>
            <td class="text-end font-mono text-secondary small">
              ${available.toFixed(1)} <span class="tiny text-muted">USDT</span>
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  // Click on any orderbook row to prefill trade form and navigate
  document.querySelectorAll('.orderbook-row').forEach(row => {
    row.addEventListener('click', () => {
      const direction = row.getAttribute('data-direction') || 'BUY';
      const rate = parseFloat(row.getAttribute('data-rate')) || 0;
      const usdtAmount = parseFloat(row.getAttribute('data-volume')) || 0;
      const counterparty = row.getAttribute('data-counterparty') || '';

      if (window.prefillTradeForm) {
        window.prefillTradeForm({ direction, rate, usdtAmount, counterparty });
      } else {
        navigator.clipboard?.writeText(String(rate));
        if (window.showToast) window.showToast(`Rate copied to clipboard: ₦${rate}`, 'info');
      }
    });
  });
}
