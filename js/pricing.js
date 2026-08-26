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
  calculateSellPricing
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
      calculateMargins();
    }
  });
}

/**
 * Load input preferences from localStorage or fall back to defaults
 */
function loadSavedSettings() {
  const spread = localStorage.getItem('bybit_p2p_pricing_spread') || '5.0';
  const vol = localStorage.getItem('bybit_p2p_pricing_volume') || '100';
  const inflow = localStorage.getItem('bybit_p2p_pricing_inflow') || '50';
  const outflow = localStorage.getItem('bybit_p2p_pricing_outflow') || '50';
  const mode = localStorage.getItem('bybit_p2p_pricing_mode') || 'avg-10';
  const depthLimit = localStorage.getItem('bybit_p2p_pricing_depth_limit') || '50';
  const filterLimits = localStorage.getItem('bybit_p2p_pricing_filter_limits') !== 'false';

  const elSpread = document.getElementById('input-target-spread');
  const elVol = document.getElementById('input-avg-volume');
  const elInflow = document.getElementById('input-inflow-fee');
  const elOutflow = document.getElementById('input-outflow-fee');
  const elMode = document.getElementById('input-pricing-mode');
  const elDepthLimit = document.getElementById('input-depth-limit');
  const elFilterLimits = document.getElementById('input-filter-limits');

  if (elSpread) elSpread.value = spread;
  if (elVol) elVol.value = vol;
  if (elInflow) elInflow.value = inflow;
  if (elOutflow) elOutflow.value = outflow;
  if (elMode) elMode.value = mode;
  if (elDepthLimit) elDepthLimit.value = depthLimit;
  if (elFilterLimits) elFilterLimits.checked = filterLimits;
}

/**
 * Persist pricing inputs to localStorage
 */
function saveSettings() {
  const elSpread = document.getElementById('input-target-spread');
  const elVol = document.getElementById('input-avg-volume');
  const elInflow = document.getElementById('input-inflow-fee');
  const elOutflow = document.getElementById('input-outflow-fee');
  const elMode = document.getElementById('input-pricing-mode');
  const elDepthLimit = document.getElementById('input-depth-limit');
  const elFilterLimits = document.getElementById('input-filter-limits');

  if (elSpread) localStorage.setItem('bybit_p2p_pricing_spread', elSpread.value);
  if (elVol) localStorage.setItem('bybit_p2p_pricing_volume', elVol.value);
  if (elInflow) localStorage.setItem('bybit_p2p_pricing_inflow', elInflow.value);
  if (elOutflow) localStorage.setItem('bybit_p2p_pricing_outflow', elOutflow.value);
  if (elMode) localStorage.setItem('bybit_p2p_pricing_mode', elMode.value);
  if (elDepthLimit) localStorage.setItem('bybit_p2p_pricing_depth_limit', elDepthLimit.value);
  if (elFilterLimits) localStorage.setItem('bybit_p2p_pricing_filter_limits', elFilterLimits.checked.toString());
}

/**
 * Attach interaction events to input fields and copy triggers
 */
function setupListeners() {
  const inputs = [
    'input-target-spread',
    'input-avg-volume',
    'input-inflow-fee',
    'input-outflow-fee',
    'input-pricing-mode',
    'input-depth-limit',
    'input-filter-limits'
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
 * Build dynamic pricing suggestions combining local FIFO state & public ad depth
 */
function calculateMargins() {
  if (!cachedMarketDepth) return;

  // Retrieve user settings values
  const targetSpread = parseFloat(document.getElementById('input-target-spread')?.value) || 5.0;
  const avgVolume = parseFloat(document.getElementById('input-avg-volume')?.value) || 100.0;
  const inflowFee = parseFloat(document.getElementById('input-inflow-fee')?.value) || 50.0;
  const outflowFee = parseFloat(document.getElementById('input-outflow-fee')?.value) || 50.0;
  const pricingMode = document.getElementById('input-pricing-mode')?.value || 'avg-10';
  const filterLimits = document.getElementById('input-filter-limits')?.checked ?? true;

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
  const buyAds = cachedMarketDepth.buyDepth || []; // Competitor buy ads (side 1)
  const sellAds = cachedMarketDepth.sellDepth || []; // Competitor sell ads (side 0)

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
  // A. BUY SIDE: prices you should buy at
  // -------------------------------------------------------------
  const buyAnalysis = calculateBuyPricing({
    activeBuyAds,
    sortedSellAds,
    targetSpread,
    inflowFee,
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

  // -------------------------------------------------------------
  // B. SELL SIDE: prices you should sell at
  // -------------------------------------------------------------
  const sellAnalysis = calculateSellPricing({
    activeSellAds,
    costBasis,
    targetSpread,
    outflowFee,
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
}

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

        const limitStr = (minLmt > 0 || maxLmt > 0)
          ? `Lmt: ₦${minLmt.toLocaleString(undefined, { maximumFractionDigits: 0 })} - ₦${maxLmt.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
          : 'Lmt: No Limit';

        return `
          <tr class="orderbook-row cursor-pointer" data-direction="SELL" data-rate="${price}" data-volume="${available}" data-counterparty="${escapeHtml(advName)}" title="Tap to record Sell trade at ₦${price}">
            <td>
              <div class="fw-semibold truncate" style="max-width: 120px;" title="${escapeHtml(advName)}">
                ${idx + 1}. ${escapeHtml(advName)}
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

        return `
          <tr class="orderbook-row cursor-pointer" data-direction="BUY" data-rate="${price}" data-volume="${available}" data-counterparty="${escapeHtml(advName)}" title="Tap to record Buy trade at ₦${price}">
            <td>
              <div class="fw-semibold truncate" style="max-width: 120px;" title="${escapeHtml(advName)}">
                ${idx + 1}. ${escapeHtml(advName)}
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
