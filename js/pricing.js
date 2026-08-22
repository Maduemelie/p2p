/**
 * Controller: P2P Arbitrage & Pricing Assistant
 * Performs spreads arithmetic, fetches competitor ad books, and calculates optimal pricing.
 */

import { bybitService } from './bybitService.js';
import { store } from './store.js';
import { formatNGN, formatUSDT, formatRate, calculateFIFOInventoryAndPnL } from './utils.js';

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

  const elSpread = document.getElementById('input-target-spread');
  const elVol = document.getElementById('input-avg-volume');
  const elInflow = document.getElementById('input-inflow-fee');
  const elOutflow = document.getElementById('input-outflow-fee');

  if (elSpread) elSpread.value = spread;
  if (elVol) elVol.value = vol;
  if (elInflow) elInflow.value = inflow;
  if (elOutflow) elOutflow.value = outflow;
}

/**
 * Persist pricing inputs to localStorage
 */
function saveSettings() {
  const elSpread = document.getElementById('input-target-spread');
  const elVol = document.getElementById('input-avg-volume');
  const elInflow = document.getElementById('input-inflow-fee');
  const elOutflow = document.getElementById('input-outflow-fee');

  if (elSpread) localStorage.setItem('bybit_p2p_pricing_spread', elSpread.value);
  if (elVol) localStorage.setItem('bybit_p2p_pricing_volume', elVol.value);
  if (elInflow) localStorage.setItem('bybit_p2p_pricing_inflow', elInflow.value);
  if (elOutflow) localStorage.setItem('bybit_p2p_pricing_outflow', elOutflow.value);
}

/**
 * Attach interaction events to input fields and copy triggers
 */
function setupListeners() {
  const inputs = [
    'input-target-spread',
    'input-avg-volume',
    'input-inflow-fee',
    'input-outflow-fee'
  ];

  inputs.forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
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
    const depth = await bybitService.fetchMarketDepth('USDT', 'NGN', 5);
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
  const buyAds = cachedMarketDepth.buyDepth || []; // Competitor buy ads (side 0)
  const sellAds = cachedMarketDepth.sellDepth || []; // Competitor sell ads (side 1)

  // -------------------------------------------------------------
  // A. BUY SIDE: prices you should buy at
  // -------------------------------------------------------------
  const topSellCompetitor = sellAds[0]; // Cheapest competitor selling crypto (exit rate)
  const topBuyCompetitor = buyAds[0];   // Highest bidder buying crypto (inflow rate)

  const exitPrice = topSellCompetitor ? parseFloat(topSellCompetitor.price) || 0 : 0;
  const topBuyBid = topBuyCompetitor ? parseFloat(topBuyCompetitor.price) || 0 : 0;

  const elExitPrice = document.getElementById('pricing-exit-price');
  if (elExitPrice) elExitPrice.textContent = exitPrice > 0 ? formatNGN(exitPrice) : '—';

  const elTopBuyComp = document.getElementById('pricing-top-buy-competitor');
  if (elTopBuyComp) elTopBuyComp.textContent = topBuyBid > 0 ? formatNGN(topBuyBid) : '—';

  const elMaxBuy = document.getElementById('pricing-max-buy');
  const elSuggestedBuy = document.getElementById('pricing-suggested-buy');
  const elBuyStatus = document.getElementById('pricing-buy-status');

  if (exitPrice > 0) {
    // Max Buy limit to protect target spread: Exit Price - targetSpread - (Inflow Fee / Vol)
    const maxBuyPrice = exitPrice - targetSpread - (inflowFee / avgVolume);
    if (elMaxBuy) elMaxBuy.textContent = formatNGN(maxBuyPrice);

    // Suggested Buy Price: Outbid highest bidder by +0.10 NGN
    const suggestedBuy = topBuyBid > 0 ? (topBuyBid + 0.10) : (exitPrice - targetSpread - 1);
    if (elSuggestedBuy) elSuggestedBuy.textContent = formatNGN(suggestedBuy);

    // Dynamic Safe check
    if (suggestedBuy <= maxBuyPrice) {
      if (elBuyStatus) {
        const excessSpread = exitPrice - suggestedBuy - (inflowFee / avgVolume);
        elBuyStatus.innerHTML = `<span class="badge badge-success">🟢 Safe to Outbid • Spread: +₦${excessSpread.toFixed(2)}</span>`;
      }
      if (elSuggestedBuy) elSuggestedBuy.className = 'font-mono text-success fw-bold my-1';
    } else {
      if (elBuyStatus) {
        elBuyStatus.innerHTML = `<span class="badge badge-danger">🔴 Spread Compressed (${(exitPrice - suggestedBuy).toFixed(2)} NGN)</span>`;
      }
      if (elSuggestedBuy) elSuggestedBuy.className = 'font-mono text-danger fw-bold my-1';
    }
  } else {
    if (elMaxBuy) elMaxBuy.textContent = '—';
    if (elSuggestedBuy) elSuggestedBuy.textContent = '—';
    if (elBuyStatus) elBuyStatus.innerHTML = '<span class="badge badge-neutral">Offline</span>';
  }

  // -------------------------------------------------------------
  // B. SELL SIDE: prices you should sell at
  // -------------------------------------------------------------
  const topSellCompetitorPrice = topSellCompetitor ? parseFloat(topSellCompetitor.price) || 0 : 0;
  const elTopSellComp = document.getElementById('pricing-top-sell-competitor');
  if (elTopSellComp) elTopSellComp.textContent = topSellCompetitorPrice > 0 ? formatNGN(topSellCompetitorPrice) : '—';

  const elBreakEven = document.getElementById('pricing-break-even');
  const elSuggestedSell = document.getElementById('pricing-suggested-sell');
  const elSellStatus = document.getElementById('pricing-sell-status');

  if (costBasis > 0) {
    // Break-even sell price = average cost + (outflow fee / vol)
    const breakEven = costBasis + (outflowFee / avgVolume);
    if (elBreakEven) elBreakEven.textContent = formatNGN(breakEven);

    if (topSellCompetitorPrice > 0) {
      // Suggested Sell price: Undercut cheapest seller by -0.10 NGN
      const suggestedSell = topSellCompetitorPrice - 0.10;
      if (elSuggestedSell) elSuggestedSell.textContent = formatNGN(suggestedSell);

      // Dynamic Safe check
      if (suggestedSell >= breakEven) {
        if (elSellStatus) {
          const sellSpread = suggestedSell - costBasis - (outflowFee / avgVolume);
          elSellStatus.innerHTML = `<span class="badge badge-success">🟢 Safe to Undercut • Spread: +₦${sellSpread.toFixed(2)}</span>`;
        }
        if (elSuggestedSell) elSuggestedSell.className = 'font-mono text-success fw-bold my-1';
      } else {
        if (elSellStatus) {
          elSellStatus.innerHTML = `<span class="badge badge-danger">🔴 Below Break-Even (₦${suggestedSell.toFixed(2)})</span>`;
        }
        if (elSuggestedSell) elSuggestedSell.className = 'font-mono text-danger fw-bold my-1';
      }
    } else {
      if (elSuggestedSell) elSuggestedSell.textContent = '—';
      if (elSellStatus) elSellStatus.innerHTML = '<span class="badge badge-neutral">No active competitors</span>';
    }
  } else {
    if (elBreakEven) elBreakEven.textContent = '—';
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

  if (buyTbody) {
    if (buyItems.length === 0) {
      buyTbody.innerHTML = `<tr><td colspan="3" class="text-center py-3 text-muted">No Buy ads online</td></tr>`;
    } else {
      buyTbody.innerHTML = buyItems.map((ad, idx) => {
        const price = parseFloat(ad.price) || 0;
        const available = parseFloat(ad.lastQuantity) || 0;
        const minLmt = parseFloat(ad.minSingleTransAmount) || 0;
        const maxLmt = parseFloat(ad.maxSingleTransAmount) || 0;
        const advName = ad.memberName || ad.userId || 'Advertiser';

        return `
          <tr class="orderbook-row" data-rate="${price}">
            <td>
              <div class="fw-semibold truncate" style="max-width: 120px;" title="${advName}">
                ${idx + 1}. ${advName}
              </div>
              <div class="text-muted tiny">Lmt: ₦${minLmt.toLocaleString()} - ₦${maxLmt.toLocaleString()}</div>
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
    if (sellItems.length === 0) {
      sellTbody.innerHTML = `<tr><td colspan="3" class="text-center py-3 text-muted">No Sell ads online</td></tr>`;
    } else {
      sellTbody.innerHTML = sellItems.map((ad, idx) => {
        const price = parseFloat(ad.price) || 0;
        const available = parseFloat(ad.lastQuantity) || 0;
        const minLmt = parseFloat(ad.minSingleTransAmount) || 0;
        const maxLmt = parseFloat(ad.maxSingleTransAmount) || 0;
        const advName = ad.memberName || ad.userId || 'Advertiser';

        return `
          <tr class="orderbook-row" data-rate="${price}">
            <td>
              <div class="fw-semibold truncate" style="max-width: 120px;" title="${advName}">
                ${idx + 1}. ${advName}
              </div>
              <div class="text-muted tiny">Lmt: ₦${minLmt.toLocaleString()} - ₦${maxLmt.toLocaleString()}</div>
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

  // Click on any orderbook row to quickly copy its price to settings
  document.querySelectorAll('.orderbook-row').forEach(row => {
    row.addEventListener('click', () => {
      const rate = row.getAttribute('data-rate');
      navigator.clipboard.writeText(rate);
      if (window.showToast) window.showToast(`Rate copied to clipboard: ₦${rate}`, 'info');
    });
  });
}
