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
  calculateSweetSpotPricing,
  getCompetitorLimits,
  isImmediateCompetitor,
  filterImmediateCompetitors,
  calculateQueuePosition,
  calculateFillSpeed
} from './pricingEngine.js';

// Cache for market depth to allow local calculation runs without API spam
let cachedMarketDepth = null;
export let userActiveBuyAd = null;
export let userActiveSellAd = null;
export let userAllActiveAds = [];
export let buyOrderbookDirectOnly = true;
export let sellOrderbookDirectOnly = true;

export function initPricing() {
  loadSavedSettings();
  setupListeners();
  initAdModificationControls();
  checkBybitCapability();
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
 * Validate trade limit input fields, apply .is-invalid styling, and update error container
 * @returns {{ isValid: boolean, min: number, max: number, error: string|null }}
 */
export function validateAndDisplayTradeLimits() {
  const elMin = document.getElementById('input-user-min-limit') || document.getElementById('input-min-trade-limit');
  const elMax = document.getElementById('input-user-max-limit') || document.getElementById('input-max-trade-limit');
  const elErr = document.getElementById('trade-limits-error');
  const elErrText = document.getElementById('trade-limits-error-text');

  if (!elMin || !elMax) {
    return { isValid: true, min: 15000, max: 40000, error: null };
  }

  const rawMin = elMin.value !== undefined ? String(elMin.value).replace(/[,\s]/g, '').trim() : '';
  const rawMax = elMax.value !== undefined ? String(elMax.value).replace(/[,\s]/g, '').trim() : '';
  const min = Number(rawMin);
  const max = Number(rawMax);

  let error = null;
  let minInvalid = false;
  let maxInvalid = false;

  if (rawMin === '' || isNaN(min) || !Number.isFinite(min) || min <= 0) {
    error = 'Minimum trade limit must be a positive number greater than 0';
    minInvalid = true;
  } else if (rawMax === '' || isNaN(max) || !Number.isFinite(max) || max <= 0) {
    error = 'Maximum trade limit must be a positive number greater than 0';
    maxInvalid = true;
  } else if (min > max) {
    error = 'Minimum trade limit cannot exceed maximum limit';
    minInvalid = true;
    maxInvalid = true;
  }

  if (minInvalid) {
    elMin.classList.add('is-invalid');
  } else {
    elMin.classList.remove('is-invalid');
  }

  if (maxInvalid) {
    elMax.classList.add('is-invalid');
  } else {
    elMax.classList.remove('is-invalid');
  }

  if (error) {
    if (elErr) {
      elErr.style.display = 'block';
      if (elErrText) {
        elErrText.textContent = error;
      } else {
        elErr.textContent = error;
      }
    }
    return { isValid: false, min, max, error };
  } else {
    if (elErr) {
      elErr.style.display = 'none';
      if (elErrText) elErrText.textContent = '';
      else elErr.textContent = '';
    }
    return { isValid: true, min, max, error: null };
  }
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

  // Retrieve trade limit settings from store or localStorage
  const defaultMin = (storeSettings.minTradeLimitNgn !== undefined && !isNaN(Number(storeSettings.minTradeLimitNgn)) && Number(storeSettings.minTradeLimitNgn) > 0)
    ? String(storeSettings.minTradeLimitNgn)
    : '15000';
  const defaultMax = (storeSettings.maxTradeLimitNgn !== undefined && !isNaN(Number(storeSettings.maxTradeLimitNgn)) && Number(storeSettings.maxTradeLimitNgn) >= Number(defaultMin))
    ? String(storeSettings.maxTradeLimitNgn)
    : '40000';

  const userMin = localStorage.getItem('bybit_p2p_user_min_limit')
    || localStorage.getItem('bybit_p2p_pricing_min_limit')
    || defaultMin;
  const userMax = localStorage.getItem('bybit_p2p_user_max_limit')
    || localStorage.getItem('bybit_p2p_pricing_max_limit')
    || defaultMax;

  const elMinLimit = document.getElementById('input-user-min-limit') || document.getElementById('input-min-trade-limit');
  const elMaxLimit = document.getElementById('input-user-max-limit') || document.getElementById('input-max-trade-limit');

  if (elMinLimit && document.activeElement !== elMinLimit) elMinLimit.value = userMin;
  if (elMaxLimit && document.activeElement !== elMaxLimit) elMaxLimit.value = userMax;

  validateAndDisplayTradeLimits();

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

  // Validate and persist trade limits
  const limitCheck = validateAndDisplayTradeLimits();
  if (limitCheck.isValid) {
    const minStr = String(limitCheck.min);
    const maxStr = String(limitCheck.max);
    localStorage.setItem('bybit_p2p_user_min_limit', minStr);
    localStorage.setItem('bybit_p2p_user_max_limit', maxStr);
    localStorage.setItem('bybit_p2p_pricing_min_limit', minStr);
    localStorage.setItem('bybit_p2p_pricing_max_limit', maxStr);
  }

  const maxFeeDragRaw = elMaxFeeDrag ? elMaxFeeDrag.value.trim() : '';
  const parsedFeeDrag = parseInt(maxFeeDragRaw, 10);
  const currentSettings = store.getSettings ? store.getSettings() : {};
  const maxFeeDragVal = !isNaN(parsedFeeDrag) ? parsedFeeDrag : (currentSettings.maxFeeDragPct || 20);

  if (store.saveSettings) {
    try {
      const payload = {
        platformFeePct: parseFloat(platformFeeVal) || 0.3,
        targetSpread: elSpread && elSpread.value !== '' ? parseFloat(elSpread.value) || 5.0 : 5.0,
        avgVolume: elVol && elVol.value !== '' ? parseFloat(elVol.value) || 100.0 : 100.0,
        inflowFee: elInflow && elInflow.value !== '' ? parseFloat(elInflow.value) || 50.0 : 50.0,
        outflowFee: elOutflow && elOutflow.value !== '' ? (parseFloat(elOutflow.value) || 0) : 0,
        pricingMode: elMode ? elMode.value : 'avg-10',
        depthLimit: elDepthLimit && elDepthLimit.value !== '' ? parseInt(elDepthLimit.value, 10) || 50 : 50,
        filterLimits: elFilterLimits ? elFilterLimits.checked : true,
        maxFeeDragPct: maxFeeDragVal
      };
      if (limitCheck.isValid) {
        payload.minTradeLimitNgn = limitCheck.min;
        payload.maxTradeLimitNgn = limitCheck.max;
      }
      store.saveSettings(payload);
    } catch (e) {
      console.warn('[Pricing] store.saveSettings validation warning:', e.message);
    }
  }
}

/**
 * Attach interaction events to input fields and copy triggers
 */
function setupListeners() {
  const inputs = [
    'input-profit-target',
    'input-user-min-limit',
    'input-user-max-limit',
    'input-min-trade-limit',
    'input-max-trade-limit',
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
 * Initialize Direct Competitor filter toggles on order books
 */
export function initOrderbookFilterToggles() {
  const btnBuyToggle = document.getElementById('btn-toggle-buy-direct-competitors');
  const btnSellToggle = document.getElementById('btn-toggle-sell-direct-competitors');

  btnBuyToggle?.addEventListener('click', () => {
    buyOrderbookDirectOnly = !buyOrderbookDirectOnly;
    btnBuyToggle.classList.toggle('active', buyOrderbookDirectOnly);
    const label = document.getElementById('buy-filter-toggle-label');
    if (label) {
      label.textContent = buyOrderbookDirectOnly ? 'Direct Competitors (₦15k - ₦40k)' : 'All Market Depth';
    }
    if (cachedMarketDepth) renderOrderBooks(cachedMarketDepth);
  });

  btnSellToggle?.addEventListener('click', () => {
    sellOrderbookDirectOnly = !sellOrderbookDirectOnly;
    btnSellToggle.classList.toggle('active', sellOrderbookDirectOnly);
    const label = document.getElementById('sell-filter-toggle-label');
    if (label) {
      label.textContent = sellOrderbookDirectOnly ? 'Direct Competitors (₦15k - ₦40k)' : 'All Market Depth';
    }
    if (cachedMarketDepth) renderOrderBooks(cachedMarketDepth);
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

    // Fetch both live order book depth and user's own active Bybit ads in parallel
    const [depthResult, adsResult] = await Promise.allSettled([
      bybitService.fetchMarketDepth('USDT', 'NGN', depthLimit),
      bybitService.fetchActiveAds('', 'USDT')
    ]);

    // Process user's own live running ads
    if (adsResult.status === 'fulfilled' && Array.isArray(adsResult.value)) {
      userAllActiveAds = adsResult.value;

      const isBuySide = (a) => {
        if (!a) return false;
        const raw = (a.side !== undefined && a.side !== null) ? a.side : (a.tradeType ?? a.sideName ?? a.type ?? a.action ?? '');
        const s = String(raw).trim().toUpperCase();
        return s === '0' || s === 'BUY';
      };
      const isSellSide = (a) => {
        if (!a) return false;
        const raw = (a.side !== undefined && a.side !== null) ? a.side : (a.tradeType ?? a.sideName ?? a.type ?? a.action ?? '');
        const s = String(raw).trim().toUpperCase();
        return s === '1' || s === 'SELL';
      };
      const isOnlineStatus = (s) => {
        if (s === undefined || s === null || s === '') return true;
        const str = String(s).trim().toUpperCase();
        return str === '10' || str === '1' || str === 'ONLINE' || str === 'ACTIVE';
      };
      const isNotDeletedStatus = (s) => {
        if (s === undefined || s === null || s === '') return true;
        const str = String(s).trim().toUpperCase();
        return str !== '30' && str !== 'CANCELLED' && str !== 'CANCELED' && str !== 'DELETED';
      };

      userActiveBuyAd = userAllActiveAds.find(a => isBuySide(a) && isOnlineStatus(a.status))
                     || userAllActiveAds.find(a => isBuySide(a) && isNotDeletedStatus(a.status))
                     || null;

      userActiveSellAd = userAllActiveAds.find(a => isSellSide(a) && isOnlineStatus(a.status))
                      || userAllActiveAds.find(a => isSellSide(a) && isNotDeletedStatus(a.status))
                      || null;
    } else {
      userActiveBuyAd = null;
      userActiveSellAd = null;
      userAllActiveAds = [];
    }

    if (depthResult.status === 'fulfilled' && depthResult.value) {
      cachedMarketDepth = depthResult.value;
      renderOrderBooks(cachedMarketDepth);
      calculateMargins();
      renderLiveAdBanners();
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
/**
 * Render Live Running Bybit Ad Banners inside Sweet Spot cards
 */
export function renderLiveAdBanners() {
  const buyContainer = document.getElementById('pricing-buy-live-ad-container');
  const sellContainer = document.getElementById('pricing-sell-live-ad-container');

  const storeSettings = store.getSettings ? store.getSettings() : {};
  const elMinLimit = document.getElementById('input-user-min-limit') || document.getElementById('input-min-trade-limit');
  const elMaxLimit = document.getElementById('input-user-max-limit') || document.getElementById('input-max-trade-limit');
  const userMin = elMinLimit && !isNaN(Number(elMinLimit.value)) && Number(elMinLimit.value) > 0
    ? Number(elMinLimit.value)
    : (Number(storeSettings.minTradeLimitNgn) || 15000);
  const userMax = elMaxLimit && !isNaN(Number(elMaxLimit.value)) && Number(elMaxLimit.value) >= userMin
    ? Number(elMaxLimit.value)
    : (Number(storeSettings.maxTradeLimitNgn) || 40000);

  const rateBuyText = document.getElementById('pricing-suggested-buy')?.textContent || '';
  const suggestedBuy = parseFloat(rateBuyText.replace(/[^\d.]/g, '').trim()) || 0;

  const rateSellText = document.getElementById('pricing-suggested-sell')?.textContent || '';
  const suggestedSell = parseFloat(rateSellText.replace(/[^\d.]/g, '').trim()) || 0;

  // --- RENDER LIVE BUY AD BANNER ---
  if (buyContainer) {
    if (userActiveBuyAd) {
      const price = parseFloat(userActiveBuyAd.price) || 0;
      const minLmt = parseFloat(userActiveBuyAd.minAmount || userActiveBuyAd.minSingleTransAmount) || userMin;
      const maxLmt = parseFloat(userActiveBuyAd.maxAmount || userActiveBuyAd.maxSingleTransAmount) || userMax;
      const qty = parseFloat(userActiveBuyAd.lastQuantity || userActiveBuyAd.quantity) || 0;
      const adId = userActiveBuyAd.id || userActiveBuyAd.itemId || userActiveBuyAd.advNo || '';
      const diff = suggestedBuy > 0 && price > 0 ? (suggestedBuy - price) : 0;
      const diffStr = diff === 0
        ? '<span class="text-success fw-bold">✓ At Exact Sweet Spot</span>'
        : diff > 0
          ? `<span class="text-warning fw-semibold">+₦${diff.toFixed(2)} to Sweet Spot</span>`
          : `<span class="text-primary fw-semibold">-₦${Math.abs(diff).toFixed(2)} vs Sweet Spot</span>`;

      buyContainer.innerHTML = `
        <div class="p-2 rounded mb-2" style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25);">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="badge badge-success tiny font-mono live-ad-card-badge"><i data-lucide="radio"></i> LIVE BUY AD RUNNING</span>
            <span class="text-muted tiny font-mono">ID: #${escapeHtml(String(adId))}</span>
          </div>
          <div class="d-flex justify-content-between font-mono small">
            <span>Live Rate: <strong class="text-white">₦${price.toLocaleString('en-NG', { minimumFractionDigits: 2 })}</strong></span>
            <span>Limits: <span class="text-secondary">₦${Math.round(minLmt).toLocaleString('en-NG')} - ₦${Math.round(maxLmt).toLocaleString('en-NG')}</span></span>
          </div>
          <div class="text-muted tiny font-mono mt-1 d-flex justify-content-between">
            <span>Available: ${qty.toFixed(1)} USDT</span>
            <div>${diffStr}</div>
          </div>
        </div>
      `;
    } else {
      buyContainer.innerHTML = `
        <div class="p-2 rounded mb-2 text-center" style="background: rgba(255, 255, 255, 0.03); border: 1px dashed rgba(255, 255, 255, 0.12);">
          <div class="text-muted small"><i data-lucide="circle-slash"></i> No active Buy ad running on Bybit</div>
          <div class="tiny text-secondary mt-1">Recommended target rate: <strong class="text-success">₦${suggestedBuy > 0 ? suggestedBuy.toLocaleString('en-NG', { minimumFractionDigits: 2 }) : '—'}</strong></div>
        </div>
      `;
    }
  }

  // --- RENDER LIVE SELL AD BANNER ---
  if (sellContainer) {
    if (userActiveSellAd) {
      const price = parseFloat(userActiveSellAd.price) || 0;
      const minLmt = parseFloat(userActiveSellAd.minAmount || userActiveSellAd.minSingleTransAmount) || userMin;
      const maxLmt = parseFloat(userActiveSellAd.maxAmount || userActiveSellAd.maxSingleTransAmount) || userMax;
      const qty = parseFloat(userActiveSellAd.lastQuantity || userActiveSellAd.quantity) || 0;
      const adId = userActiveSellAd.id || userActiveSellAd.itemId || userActiveSellAd.advNo || '';
      const diff = suggestedSell > 0 && price > 0 ? (price - suggestedSell) : 0;
      const diffStr = diff === 0
        ? '<span class="text-success fw-bold">✓ At Exact Sweet Spot</span>'
        : diff < 0
          ? `<span class="text-warning fw-semibold">-₦${Math.abs(diff).toFixed(2)} under Sweet Spot</span>`
          : `<span class="text-primary fw-semibold">+₦${diff.toFixed(2)} above Sweet Spot</span>`;

      sellContainer.innerHTML = `
        <div class="p-2 rounded mb-2" style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25);">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="badge badge-success tiny font-mono live-ad-card-badge"><i data-lucide="radio"></i> LIVE SELL AD RUNNING</span>
            <span class="text-muted tiny font-mono">ID: #${escapeHtml(String(adId))}</span>
          </div>
          <div class="d-flex justify-content-between font-mono small">
            <span>Live Rate: <strong class="text-white">₦${price.toLocaleString('en-NG', { minimumFractionDigits: 2 })}</strong></span>
            <span>Limits: <span class="text-secondary">₦${Math.round(minLmt).toLocaleString('en-NG')} - ₦${Math.round(maxLmt).toLocaleString('en-NG')}</span></span>
          </div>
          <div class="text-muted tiny font-mono mt-1 d-flex justify-content-between">
            <span>Available: ${qty.toFixed(1)} USDT</span>
            <div>${diffStr}</div>
          </div>
        </div>
      `;
    } else {
      sellContainer.innerHTML = `
        <div class="p-2 rounded mb-2 text-center" style="background: rgba(255, 255, 255, 0.03); border: 1px dashed rgba(255, 255, 255, 0.12);">
          <div class="text-muted small"><i data-lucide="circle-slash"></i> No active Sell ad running on Bybit</div>
          <div class="tiny text-secondary mt-1">Recommended target rate: <strong class="text-success">₦${suggestedSell > 0 ? suggestedSell.toLocaleString('en-NG', { minimumFractionDigits: 2 }) : '—'}</strong></div>
        </div>
      `;
    }
  }

  if (window.lucide) window.lucide.createIcons();
}



export function calculateMargins() {
  const storeSettings = store.getSettings ? store.getSettings() : {};

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
      const sellPriceToDisplay = sweetSpotResult.sellSweetSpot > 0 ? sweetSpotResult.sellSweetSpot : sellAnalysis.suggestedSell;
      elSweetSellRate.textContent = sellPriceToDisplay > 0 ? formatNGN(sellPriceToDisplay) : '—';
      elSweetSellRate.className = 'font-mono text-success fw-bold sweet-spot-rate';
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
      if (sweetSpotResult.sellSweetSpot > 0) {
        elSweetSellStatus.innerHTML = `<span class="badge badge-success">🟢 Rank ${sweetSpotResult.markers?.sellTargetRank || '#'} Sweet Spot</span>`;
      } else if (sellAnalysis.hasCostBasis && sellAnalysis.hasCompetitors) {
        if (sellAnalysis.isSafe) {
          elSweetSellStatus.innerHTML = `<span class="badge badge-success">🟢 Safe to Undercut • Spread: +₦${sellAnalysis.sellSpread.toFixed(2)}</span>`;
        } else {
          elSweetSellStatus.innerHTML = `<span class="badge badge-danger">🔴 Below Target Spread (Floored for Spread)</span>`;
        }
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

  // -------------------------------------------------------------
  // G. IMMEDIATE COMPETITOR, QUEUE POSITION & FILL SPEED ANALYSIS
  // -------------------------------------------------------------
  const elMinLimit = document.getElementById('input-user-min-limit') || document.getElementById('input-min-trade-limit');
  const elMaxLimit = document.getElementById('input-user-max-limit') || document.getElementById('input-max-trade-limit');
  const userMin = elMinLimit && !isNaN(Number(elMinLimit.value)) && Number(elMinLimit.value) > 0
    ? Number(elMinLimit.value)
    : (Number(storeSettings.minTradeLimitNgn) || 15000);
  const userMax = elMaxLimit && !isNaN(Number(elMaxLimit.value)) && Number(elMaxLimit.value) >= userMin
    ? Number(elMaxLimit.value)
    : (Number(storeSettings.maxTradeLimitNgn) || 40000);

  const immediateBuyCompetitors = filterImmediateCompetitors(sortedBuyAds, userMin, userMax);
  const immediateSellCompetitors = filterImmediateCompetitors(sortedSellAds, userMin, userMax);

  const targetBuyPrice = sweetSpotResult.buySweetSpot > 0 ? sweetSpotResult.buySweetSpot : buyAnalysis.suggestedBuy;
  const targetSellPrice = sweetSpotResult.sellSweetSpot > 0 ? sweetSpotResult.sellSweetSpot : sellAnalysis.suggestedSell;

  const buyQueue = calculateQueuePosition(immediateBuyCompetitors, targetBuyPrice, 'buy');
  const sellQueue = calculateQueuePosition(immediateSellCompetitors, targetSellPrice, 'sell');

  const buyFillSpeed = calculateFillSpeed(buyQueue.rank, buyQueue.volumeAhead, buyQueue.totalCompetitors);
  const sellFillSpeed = calculateFillSpeed(sellQueue.rank, sellQueue.volumeAhead, sellQueue.totalCompetitors);

  // Update Sweet Spot Card Queue Rank Badges (Clear text to avoid 505 confusion)
  if (elSweetBuyRankBadge) {
    elSweetBuyRankBadge.textContent = buyQueue.totalCompetitors === 1 ? 'Monopoly' : `Queue: #${buyQueue.rank} of ${buyQueue.totalCompetitors}`;
    elSweetBuyRankBadge.className = buyQueue.rank === 1 ? 'badge badge-success tiny' : 'badge badge-primary tiny';
  }
  if (elSweetSellRankBadge) {
    elSweetSellRankBadge.textContent = sellQueue.totalCompetitors === 1 ? 'Monopoly' : `Queue: #${sellQueue.rank} of ${sellQueue.totalCompetitors}`;
    elSweetSellRankBadge.className = sellQueue.rank === 1 ? 'badge badge-success tiny' : 'badge badge-primary tiny';
  }

  // Update Dedicated Queue Position Elements in Sweet Spot Cards
  const elBuyQueueRank = document.getElementById('pricing-buy-queue-rank');
  const elBuyVolAhead = document.getElementById('pricing-buy-volume-ahead');
  const elBuyImmCount = document.getElementById('pricing-buy-imm-count');
  if (elBuyQueueRank) elBuyQueueRank.textContent = buyQueue.totalCompetitors === 1 ? 'Position: #1 (Monopoly)' : `Position: #${buyQueue.rank} of ${buyQueue.totalCompetitors} in Queue`;
  if (elBuyVolAhead) elBuyVolAhead.textContent = `Ahead: ${buyQueue.volumeAhead.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} USDT`;
  if (elBuyImmCount) elBuyImmCount.textContent = `${immediateBuyCompetitors.length} Immediate Competitor${immediateBuyCompetitors.length === 1 ? '' : 's'}`;

  const elSellQueueRank = document.getElementById('pricing-sell-queue-rank');
  const elSellVolAhead = document.getElementById('pricing-sell-volume-ahead');
  const elSellImmCount = document.getElementById('pricing-sell-imm-count');
  if (elSellQueueRank) elSellQueueRank.textContent = sellQueue.totalCompetitors === 1 ? 'Position: #1 (Monopoly)' : `Position: #${sellQueue.rank} of ${sellQueue.totalCompetitors} in Queue`;
  if (elSellVolAhead) elSellVolAhead.textContent = `Ahead: ${sellQueue.volumeAhead.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} USDT`;
  if (elSellImmCount) elSellImmCount.textContent = `${immediateSellCompetitors.length} Immediate Competitor${immediateSellCompetitors.length === 1 ? '' : 's'}`;

  // Update Fill Speed Card (#card-fill-speed-analysis)
  const updateFillSpeedUI = (side, speed, queue) => {
    const elLabel = document.getElementById(`fill-speed-${side}-label`);
    const elMinutes = document.getElementById(`fill-speed-${side}-minutes`);
    const elEstTime = document.getElementById(`fill-speed-${side}-est-time`);
    const elScore = document.getElementById(`fill-speed-${side}-score-text`);
    const elProgress = document.getElementById(`fill-speed-${side}-progress`);
    const elProgressBar = document.getElementById(`fill-speed-${side}-progress-bar`);
    const elDesc = document.getElementById(`fill-speed-${side}-description`);
    const elQueueSummary = document.getElementById(`fill-speed-${side}-queue-summary`);
    const elVolumeSummary = document.getElementById(`fill-speed-${side}-volume-summary`);

    const badgeClass = speed.label === 'Very Fast' ? 'badge badge-success'
      : speed.label === 'Fast' ? 'badge badge-primary'
      : speed.label === 'Moderate' ? 'badge badge-warning'
      : 'badge badge-danger';
    const barClass = speed.score >= 80 ? 'progress-bar bg-success'
      : speed.score >= 60 ? 'progress-bar bg-primary'
      : speed.score >= 40 ? 'progress-bar bg-warning'
      : 'progress-bar bg-danger';

    if (elLabel) {
      elLabel.textContent = speed.label;
      elLabel.className = `${badgeClass} font-mono`;
    }
    if (elMinutes) {
      if (elEstTime) {
        elEstTime.textContent = speed.estMinutes;
      } else {
        elMinutes.textContent = speed.estMinutes;
      }
    }
    if (elEstTime) elEstTime.textContent = speed.estMinutes;
    if (elScore) elScore.textContent = `Score: ${speed.score}/100`;
    if (elProgress) {
      elProgress.style.width = `${speed.score}%`;
      elProgress.className = barClass;
    }
    if (elProgressBar) {
      elProgressBar.style.width = `${speed.score}%`;
      elProgressBar.className = barClass;
    }
    if (elDesc) elDesc.textContent = speed.description;
    if (elQueueSummary) elQueueSummary.textContent = `Queue Rank: #${queue.rank} of ${queue.totalCompetitors}`;
    if (elVolumeSummary) elVolumeSummary.textContent = `${queue.volumeAhead.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} USDT ahead`;
  };

  updateFillSpeedUI('buy', buyFillSpeed, buyQueue);
  updateFillSpeedUI('sell', sellFillSpeed, sellQueue);

  // Re-render order books reactively with updated user limits
  if (cachedMarketDepth) {
    renderOrderBooks(cachedMarketDepth, userMin, userMax);
  }

  if (window.lucide) window.lucide.createIcons();

  return {
    buyAnalysis,
    sellAnalysis,
    buyLimits,
    sellLimits,
    buybackAnalysis,
    sweetSpotResult,
    userLimits: { minTradeLimitNgn: userMin, maxTradeLimitNgn: userMax },
    buyQueue,
    sellQueue,
    buyFillSpeed,
    sellFillSpeed
  };
}

// Alias for calculateMargins as calculatePricing
export const calculatePricing = calculateMargins;

/**
 * Render P2P market depth items in tabular forms
 * @param {Object} depth
 * @param {number} [uMinParam]
 * @param {number} [uMaxParam]
 */
export function renderOrderBooks(depth, uMinParam, uMaxParam) {
  const buyTbody = document.querySelector('#pricing-buy-orderbook tbody');
  const sellTbody = document.querySelector('#pricing-sell-orderbook tbody');

  const storeSettings = store.getSettings ? store.getSettings() : {};
  const userMin = uMinParam !== undefined ? Number(uMinParam) : (Number(storeSettings.minTradeLimitNgn) || 15000);
  const userMax = uMaxParam !== undefined ? Number(uMaxParam) : (Number(storeSettings.maxTradeLimitNgn) || 40000);

  const buyItems = depth?.buyDepth || [];
  const sellItems = depth?.sellDepth || [];

  // Sort copy: Buy descending (highest first), Sell ascending (lowest first)
  const sortedBuyItems = [...buyItems].sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
  const sortedSellItems = [...sellItems].sort((a, b) => parseFloat(a.price) - parseFloat(b.price));

  // Filter by direct competitors when toggle is active
  const filteredDirectBuy = sortedBuyItems.filter(ad => isImmediateCompetitor(ad, userMin, userMax));
  const filteredDirectSell = sortedSellItems.filter(ad => isImmediateCompetitor(ad, userMin, userMax));

  const displayBuyItems = (buyOrderbookDirectOnly && filteredDirectBuy.length > 0)
    ? filteredDirectBuy.slice(0, 15)
    : sortedBuyItems.slice(0, 15);

  const displaySellItems = (sellOrderbookDirectOnly && filteredDirectSell.length > 0)
    ? filteredDirectSell.slice(0, 15)
    : sortedSellItems.slice(0, 15);

  // Update subtitles to show direct competitor count
  const elBuySubtitle = document.getElementById('buy-orderbook-subtitle');
  if (elBuySubtitle) {
    elBuySubtitle.innerHTML = buyOrderbookDirectOnly
      ? `Showing <strong>${filteredDirectBuy.length} Direct Competitors</strong> in your ₦${Math.round(userMin).toLocaleString('en-NG')} – ₦${Math.round(userMax).toLocaleString('en-NG')} limit range.`
      : `Showing top ${displayBuyItems.length} Bybit Buy ads across all limits.`;
  }
  const elSellSubtitle = document.getElementById('sell-orderbook-subtitle');
  if (elSellSubtitle) {
    elSellSubtitle.innerHTML = sellOrderbookDirectOnly
      ? `Showing <strong>${filteredDirectSell.length} Direct Competitors</strong> in your ₦${Math.round(userMin).toLocaleString('en-NG')} – ₦${Math.round(userMax).toLocaleString('en-NG')} limit range.`
      : `Showing top ${displaySellItems.length} Bybit Sell ads across all limits.`;
  }

  if (buyTbody) {
    if (displayBuyItems.length === 0) {
      buyTbody.innerHTML = `<tr><td colspan="3" class="text-center py-3 text-muted">No Buy ads online</td></tr>`;
    } else {
      buyTbody.innerHTML = displayBuyItems.map((ad, idx) => {
        const price = parseFloat(ad.price) || 0;
        const available = parseFloat(ad.lastQuantity) || 0;
        const { min: minLmt, max: maxLmt } = getCompetitorLimits(ad);
        const advName = ad.nickName || ad.memberName || ad.userId || 'Advertiser';

        const isImm = isImmediateCompetitor(ad, userMin, userMax);
        const isSweetSpot = idx >= 2 && idx <= 4;
        const isUserLiveAd = userActiveBuyAd && (ad.id === userActiveBuyAd.id || ad.itemId === userActiveBuyAd.itemId || (userActiveBuyAd.advNo && ad.advNo === userActiveBuyAd.advNo));
        const sweetClass = isSweetSpot ? 'orderbook-row-sweetspot' : '';
        const immClass = isImm ? 'immediate-competitor' : 'regular-competitor';
        const userClass = isUserLiveAd ? 'user-live-ad' : '';
        const rowClass = `orderbook-row cursor-pointer ${sweetClass} ${immClass} ${userClass}`.trim();

        const userBadge = isUserLiveAd ? ` <span class="badge badge-user-live-ad tiny font-mono"><i data-lucide="radio"></i> YOUR LIVE AD</span>` : '';
        const sweetBadge = isSweetSpot && !isUserLiveAd ? ` <span class="badge badge-primary tiny">Rank #${idx + 1}</span>` : '';
        const immBadge = isImm && !isUserLiveAd ? ` <span class="badge badge-warning tiny badge-immediate-competitor" title="Immediate Competitor">Immediate</span>` : '';

        let limitStr = 'Lmt: No Limit';
        if (minLmt > 0 || Number.isFinite(maxLmt)) {
          const minFormatted = `₦${Math.round(minLmt).toLocaleString('en-NG')}`;
          const maxFormatted = Number.isFinite(maxLmt) ? `₦${Math.round(maxLmt).toLocaleString('en-NG')}` : '∞';
          limitStr = `Lmt: ${minFormatted} - ${maxFormatted}`;
        }

        return `
          <tr class="${rowClass}" data-direction="SELL" data-rate="${price}" data-volume="${available}" data-counterparty="${escapeHtml(advName)}" title="Tap to record Sell trade at ₦${price}">
            <td>
              <div class="fw-semibold truncate" style="max-width: 140px;" title="${escapeHtml(advName)}">
                <span>${idx + 1}. ${escapeHtml(advName)}</span>${userBadge}${sweetBadge}${immBadge}
              </div>
              <div class="text-muted tiny competitor-limits">${limitStr}</div>
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
        const { min: minLmt, max: maxLmt } = getCompetitorLimits(ad);
        const advName = ad.nickName || ad.memberName || ad.userId || 'Advertiser';

        const isImm = isImmediateCompetitor(ad, userMin, userMax);
        const isSweetSpot = idx >= 2 && idx <= 4;
        const isUserLiveAd = userActiveSellAd && (ad.id === userActiveSellAd.id || ad.itemId === userActiveSellAd.itemId || (userActiveSellAd.advNo && ad.advNo === userActiveSellAd.advNo));
        const sweetClass = isSweetSpot ? 'orderbook-row-sweetspot-sell' : '';
        const immClass = isImm ? 'immediate-competitor' : 'regular-competitor';
        const userClass = isUserLiveAd ? 'user-live-ad' : '';
        const rowClass = `orderbook-row cursor-pointer ${sweetClass} ${immClass} ${userClass}`.trim();

        const userBadge = isUserLiveAd ? ` <span class="badge badge-user-live-ad tiny font-mono"><i data-lucide="radio"></i> YOUR LIVE AD</span>` : '';
        const sweetBadge = isSweetSpot && !isUserLiveAd ? ` <span class="badge badge-success tiny">Rank #${idx + 1}</span>` : '';
        const immBadge = isImm && !isUserLiveAd ? ` <span class="badge badge-warning tiny badge-immediate-competitor" title="Immediate Competitor">Immediate</span>` : '';

        let limitStr = 'Lmt: No Limit';
        if (minLmt > 0 || Number.isFinite(maxLmt)) {
          const minFormatted = `₦${Math.round(minLmt).toLocaleString('en-NG')}`;
          const maxFormatted = Number.isFinite(maxLmt) ? `₦${Math.round(maxLmt).toLocaleString('en-NG')}` : '∞';
          limitStr = `Lmt: ${minFormatted} - ${maxFormatted}`;
        }

        return `
          <tr class="${rowClass}" data-direction="BUY" data-rate="${price}" data-volume="${available}" data-counterparty="${escapeHtml(advName)}" title="Tap to record Buy trade at ₦${price}">
            <td>
              <div class="fw-semibold truncate" style="max-width: 140px;" title="${escapeHtml(advName)}">
                <span>${idx + 1}. ${escapeHtml(advName)}</span>${userBadge}${sweetBadge}${immBadge}
              </div>
              <div class="text-muted tiny competitor-limits">${limitStr}</div>
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

/**
 * Check Bybit capability and display banner if restricted
 */
export async function checkBybitCapability() {
  try {
    if (bybitService && typeof bybitService.checkAdEditCapability === 'function') {
      const cap = await bybitService.checkAdEditCapability();
      const statusBanner = document.getElementById('bybit-ad-edit-status');
      if (!cap.canEditAds && statusBanner) {
        statusBanner.style.display = 'block';
        statusBanner.classList.remove('hidden');
        const msgEl = document.getElementById('bybit-ad-edit-status-message');
        if (msgEl) {
          msgEl.textContent = cap.reason || 'Direct ad modification requires Bybit P2P Merchant Advertiser status. Manage ads via Bybit Merchant Portal.';
        }
      }
    }
  } catch (e) {
    console.warn('[Pricing] Ad edit capability check warning:', e.message);
  }
}

/**
 * Initialize ad modification interactive controls
 */
export function initAdModificationControls() {
  document.getElementById('btn-update-buy-ad')?.addEventListener('click', () => {
    openAdUpdateModal('buy');
  });

  document.getElementById('btn-update-sell-ad')?.addEventListener('click', () => {
    openAdUpdateModal('sell');
  });

  document.getElementById('btn-close-update-ad-modal')?.addEventListener('click', closeAdUpdateModal);
  document.getElementById('btn-cancel-update-ad')?.addEventListener('click', closeAdUpdateModal);

  document.getElementById('form-update-ad')?.addEventListener('submit', handleAdUpdateSubmit);

  document.getElementById('btn-copy-ad-fallback')?.addEventListener('click', handleCopyAdFallback);
  document.getElementById('btn-modal-copy-ad-params')?.addEventListener('click', handleCopyAdModalParams);
}

/**
 * Open ad update modal pre-filled with sweet spot price and user limits
 * @param {'buy'|'sell'} [side='buy']
 */
export function openAdUpdateModal(side = 'buy') {
  const isBuy = side === 'buy';
  const targetAd = isBuy ? userActiveBuyAd : userActiveSellAd;
  const modalBackdrop = document.getElementById('modal-update-ad-backdrop');
  if (!modalBackdrop) return;

  // 1. Determine recommended price from sweet spot rate
  const rateElemId = isBuy ? 'pricing-suggested-buy' : 'pricing-suggested-sell';
  const rateText = document.getElementById(rateElemId)?.textContent || '';
  const recommendedPrice = parseFloat(rateText.replace(/[^\d.]/g, '').trim()) || 0;

  // 2. Read user trade limits from store settings or inputs
  const elMinLimit = document.getElementById('input-user-min-limit') || document.getElementById('input-min-trade-limit');
  const elMaxLimit = document.getElementById('input-user-max-limit') || document.getElementById('input-max-trade-limit');
  const settings = store.getSettings ? store.getSettings() : {};
  const userMin = elMinLimit && !isNaN(Number(elMinLimit.value)) && Number(elMinLimit.value) > 0
    ? Number(elMinLimit.value)
    : (Number(settings.minTradeLimitNgn) || 15000);
  const userMax = elMaxLimit && !isNaN(Number(elMaxLimit.value)) && Number(elMaxLimit.value) >= userMin
    ? Number(elMaxLimit.value)
    : (Number(settings.maxTradeLimitNgn) || 40000);

  // 3. Populate form fields
  const elAdId = document.getElementById('input-ad-id');
  const elPrice = document.getElementById('input-ad-price');
  const elMin = document.getElementById('input-ad-min-limit');
  const elMax = document.getElementById('input-ad-max-limit');
  const elQuantity = document.getElementById('input-ad-quantity');
  const elTargetRate = document.getElementById('modal-target-sweet-spot-rate');
  const elCurrentRate = document.getElementById('modal-current-ad-rate');
  const elCurrentLimits = document.getElementById('modal-current-ad-limits');
  const elBadge = document.getElementById('modal-ad-side-badge');
  const elTitle = document.getElementById('modal-update-ad-title');
  const elAlert = document.getElementById('modal-ad-edit-alert');
  const elDetectedCard = document.getElementById('modal-live-ad-detected-card');
  const elDetectedBadge = document.getElementById('modal-live-ad-status-badge');
  const elDetectedIdDisplay = document.getElementById('modal-live-ad-id-display');
  const elAdIdHint = document.getElementById('ad-id-source-hint');
  const elAdIdHelper = document.getElementById('ad-id-helper-text');

  if (targetAd) {
    const adId = targetAd.id || targetAd.itemId || targetAd.advNo || '';
    const currentPrice = parseFloat(targetAd.price) || 0;
    const currentMin = parseFloat(targetAd.minAmount || targetAd.minSingleTransAmount) || userMin;
    const currentMax = parseFloat(targetAd.maxAmount || targetAd.maxSingleTransAmount) || userMax;
    const currentQty = parseFloat(targetAd.lastQuantity || targetAd.quantity) || 0;

    if (elAdId) {
      elAdId.value = adId;
    }
    if (elCurrentRate) {
      elCurrentRate.textContent = currentPrice > 0 ? `₦${currentPrice.toLocaleString('en-NG', { minimumFractionDigits: 2 })}` : '—';
    }
    if (elCurrentLimits) {
      elCurrentLimits.textContent = `₦${Math.round(currentMin).toLocaleString('en-NG')} – ₦${Math.round(currentMax).toLocaleString('en-NG')}`;
    }
    if (elMin) elMin.value = currentMin;
    if (elMax) elMax.value = currentMax;
    if (elQuantity && currentQty > 0) elQuantity.placeholder = `Current: ${currentQty.toFixed(1)} USDT`;
    if (elDetectedBadge) {
      elDetectedBadge.innerHTML = '<i data-lucide="radio"></i> LIVE BYBIT AD AUTO-LINKED';
      elDetectedBadge.className = 'badge badge-success tiny font-mono';
    }
    if (elDetectedIdDisplay) elDetectedIdDisplay.textContent = `ID: #${adId}`;
    if (elAdIdHint) {
      elAdIdHint.textContent = 'Auto-linked from your running Bybit ad';
      elAdIdHint.className = 'text-success tiny font-mono';
    }
    if (elAdIdHelper) {
      elAdIdHelper.textContent = 'Auto-populated with your live Bybit ad ID. You can submit directly.';
    }
    if (elDetectedCard) {
      elDetectedCard.style.display = 'block';
      elDetectedCard.style.borderColor = 'rgba(16, 185, 129, 0.35)';
      elDetectedCard.style.background = 'rgba(16, 185, 129, 0.08)';
    }
  } else {
    // No live ad running on this side
    if (elAdId) elAdId.value = '';
    if (elCurrentRate) elCurrentRate.textContent = 'No Live Ad Running';
    if (elCurrentLimits) elCurrentLimits.textContent = `Default: ₦${Math.round(userMin).toLocaleString('en-NG')} – ₦${Math.round(userMax).toLocaleString('en-NG')}`;
    if (elMin) elMin.value = userMin;
    if (elMax) elMax.value = userMax;
    if (elDetectedBadge) {
      elDetectedBadge.innerHTML = '<i data-lucide="circle-slash"></i> NO LIVE AD RUNNING';
      elDetectedBadge.className = 'badge badge-neutral tiny font-mono';
    }
    if (elDetectedIdDisplay) elDetectedIdDisplay.textContent = 'Manual Entry';
    if (elAdIdHint) {
      elAdIdHint.textContent = 'Manual Item ID required';
      elAdIdHint.className = 'text-warning tiny font-mono';
    }
    if (elAdIdHelper) {
      elAdIdHelper.textContent = 'No running ad detected on Bybit. Enter Item ID manually if you have an unlisted ad.';
    }
    if (elDetectedCard) {
      elDetectedCard.style.display = 'block';
      elDetectedCard.style.borderColor = 'rgba(255, 255, 255, 0.12)';
      elDetectedCard.style.background = 'rgba(15, 23, 42, 0.6)';
    }
  }

  if (elPrice) elPrice.value = recommendedPrice > 0 ? recommendedPrice.toFixed(2) : '';
  if (elTargetRate) elTargetRate.textContent = recommendedPrice > 0 ? `₦${recommendedPrice.toFixed(2)}` : '—';
  if (elBadge) {
    elBadge.textContent = isBuy ? 'BUY AD' : 'SELL AD';
    elBadge.className = isBuy ? 'badge badge-primary tiny font-mono' : 'badge badge-success tiny font-mono';
  }
  if (elTitle) {
    elTitle.textContent = `Update Bybit Active ${isBuy ? 'Buy' : 'Sell'} Ad`;
  }
  if (elAlert) {
    elAlert.classList.add('hidden');
    elAlert.style.display = 'none';
    elAlert.innerHTML = '';
  }

  modalBackdrop.style.display = 'flex';
  modalBackdrop.classList.remove('hidden');
  if (window.lucide) window.lucide.createIcons();
}

/**
 * Close ad update modal
 */
export function closeAdUpdateModal() {
  const modalBackdrop = document.getElementById('modal-update-ad-backdrop');
  if (modalBackdrop) {
    modalBackdrop.style.display = 'none';
    modalBackdrop.classList.add('hidden');
  }
}

/**
 * Handle submission of Bybit advertisement modification form
 * @param {Event} e
 */
export async function handleAdUpdateSubmit(e) {
  if (e && typeof e.preventDefault === 'function') {
    e.preventDefault();
  }

  const adId = document.getElementById('input-ad-id')?.value.trim();
  const price = parseFloat(document.getElementById('input-ad-price')?.value);
  const minAmount = parseFloat(document.getElementById('input-ad-min-limit')?.value);
  const maxAmount = parseFloat(document.getElementById('input-ad-max-limit')?.value);
  const quantityVal = document.getElementById('input-ad-quantity')?.value.trim();
  const quantity = quantityVal ? parseFloat(quantityVal) : undefined;

  // Validation
  if (!adId) {
    if (window.showToast) window.showToast('Please enter an Advertisement ID', 'error');
    return;
  }
  if (isNaN(price) || price <= 0) {
    if (window.showToast) window.showToast('Advertisement price must be a positive number', 'error');
    return;
  }
  if (isNaN(minAmount) || isNaN(maxAmount) || minAmount <= 0 || maxAmount <= 0) {
    if (window.showToast) window.showToast('Trade limits must be positive numbers', 'error');
    return;
  }
  if (minAmount > maxAmount) {
    if (window.showToast) window.showToast('Minimum trade limit cannot exceed maximum trade limit', 'error');
    return;
  }

  const btnSubmit = document.getElementById('btn-submit-update-ad');
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<i data-lucide="loader-2"></i> <span>Updating Bybit...</span>';
  }

  try {
    const payload = {
      id: adId,
      price,
      minAmount,
      maxAmount,
      actionType: 'MODIFY'
    };
    if (quantity !== undefined && !isNaN(quantity) && quantity > 0) {
      payload.quantity = quantity;
    }

    const result = await bybitService.updateAd(payload);

    if (result && (result.success || result.retCode === 0)) {
      if (window.showToast) {
        window.showToast('Advertisement updated successfully on Bybit!', 'success');
      }
      closeAdUpdateModal();
      refreshPricingData(false);
    } else if (result && (result.isPermissionDenied || result.retCode === 10005)) {
      const guidance = result.guidanceMessage || 'Permission denied: Direct ad modification requires Bybit P2P Merchant status.';
      if (window.showToast) window.showToast(guidance, 'warning');

      const statusBanner = document.getElementById('bybit-ad-edit-status');
      if (statusBanner) {
        statusBanner.style.display = 'block';
        statusBanner.classList.remove('hidden');
        const msgEl = document.getElementById('bybit-ad-edit-status-message');
        if (msgEl) msgEl.textContent = guidance;
      }

      const elAlert = document.getElementById('modal-ad-edit-alert');
      if (elAlert) {
        elAlert.style.display = 'block';
        elAlert.classList.remove('hidden');
        elAlert.innerHTML = `
          <div class="d-flex align-items-start gap-2">
            <i data-lucide="shield-alert" class="flex-shrink-0 text-warning mt-1"></i>
            <div>
              <strong>Merchant Permission Required (Code 10005)</strong>
              <p class="small mb-2">${escapeHtml(guidance)}</p>
              <a href="https://www.bybit.com/fiat/trade/otc/profile" target="_blank" rel="noopener noreferrer" class="btn btn-xs btn-outline">
                <i data-lucide="external-link"></i> Bybit Merchant Portal
              </a>
            </div>
          </div>
        `;
        if (window.lucide) window.lucide.createIcons();
      }
    } else {
      const errMsg = (result && (result.error || result.retMsg)) || 'Failed to update advertisement';
      if (window.showToast) window.showToast(errMsg, 'error');
      const elAlert = document.getElementById('modal-ad-edit-alert');
      if (elAlert) {
        elAlert.style.display = 'block';
        elAlert.classList.remove('hidden');
        elAlert.innerHTML = `<span class="text-danger small"><i data-lucide="alert-circle"></i> ${escapeHtml(errMsg)}</span>`;
        if (window.lucide) window.lucide.createIcons();
      }
    }
  } catch (err) {
    if (window.showToast) window.showToast(err.message || 'Network error occurred', 'error');
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = '<i data-lucide="send"></i> <span>Submit to Bybit</span>';
      if (window.lucide) window.lucide.createIcons();
    }
  }
}

/**
 * Copy suggested ad parameters to clipboard from limitation banner
 */
export function handleCopyAdFallback() {
  const price = document.getElementById('pricing-suggested-buy')?.textContent.replace(/[₦,]/g, '').trim() || '0';
  const settings = store.getSettings ? store.getSettings() : {};
  const minLmt = settings.minTradeLimitNgn || 15000;
  const maxLmt = settings.maxTradeLimitNgn || 40000;

  const textToCopy = `Price: ₦${price} | Min: ₦${Number(minLmt).toLocaleString()} | Max: ₦${Number(maxLmt).toLocaleString()}`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(textToCopy).catch(() => {});
  }
  if (window.showToast) window.showToast(`Copied Ad Parameters: ${textToCopy}`, 'info');
}

/**
 * Copy ad parameters from modal to clipboard
 */
export function handleCopyAdModalParams() {
  const price = document.getElementById('input-ad-price')?.value || '0';
  const minLmt = document.getElementById('input-ad-min-limit')?.value || '0';
  const maxLmt = document.getElementById('input-ad-max-limit')?.value || '0';

  const textToCopy = `Price: ₦${price} | Min: ₦${Number(minLmt).toLocaleString()} | Max: ₦${Number(maxLmt).toLocaleString()}`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(textToCopy).catch(() => {});
  }
  if (window.showToast) window.showToast('Copied parameters to clipboard for manual Bybit entry', 'info');
}

/**
 * Helper to annotate competitor advertisement with immediate competitor class and badge
 * @param {Object} ad
 * @param {number} userMin
 * @param {number} userMax
 * @returns {Object}
 */
export function annotateCompetitorRow(ad, userMin, userMax) {
  const isImm = isImmediateCompetitor(ad, userMin, userMax);
  return {
    ...ad,
    isImmediate: isImm,
    rowClass: isImm ? 'immediate-competitor' : 'regular-competitor',
    badge: isImm ? '<span class="badge badge-warning tiny badge-immediate-competitor">Immediate</span>' : ''
  };
}
