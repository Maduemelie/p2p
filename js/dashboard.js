/**
 * Bybit NGN P2P Trade Tracker — Dashboard Module
 * Calculates FIFO cost-basis performance metrics and manages Chart.js analytics
 */

import { store } from './store.js';
import { formatNGN, formatUSDT, formatRate, formatDateTime, calculateFIFOInventoryAndPnL, escapeHtml } from './utils.js';
import { bybitService } from './bybitService.js';

let chartInstance = null;
let currentChartPeriod = 'all';
let latestActiveAd = null;

export function initDashboard() {
  renderDashboardMetrics();
  renderRecentTradesList();
  initDashboardChart();
  setupPeriodFilters();
  syncAndRenderActiveAd();
  syncBybitLiveInventory();

  const btnSyncAd = document.getElementById('btn-sync-active-ad');
  btnSyncAd?.addEventListener('click', () => {
    syncAndRenderActiveAd(true);
    syncBybitLiveInventory();
  });

  // Listen for store updates
  window.addEventListener('store:updated', (e) => {
    if (e.detail?.type === 'trades' || e.detail?.type === 'all' || e.detail?.type === 'settings') {
      renderDashboardMetrics();
      renderRecentTradesList();
      updateDashboardChart();
      syncAndRenderActiveAd();
      syncBybitLiveInventory();
    }
  });
}

/**
 * Fetch and render Active Bybit Sell Ad & Live Spread Monitor
 */
export async function syncAndRenderActiveAd(showToast = false) {
  const adBadge = document.getElementById('active-ad-badge');
  const adTitle = document.getElementById('active-ad-title');
  const metricAdPrice = document.getElementById('metric-ad-sell-price');
  const metricAdQty = document.getElementById('metric-ad-qty-stock');
  const metricAvgBuy = document.getElementById('metric-ad-avg-buy-cost');
  const metricTotalBought = document.getElementById('metric-ad-total-bought');
  const metricSpread = document.getElementById('metric-ad-spread-usdt');
  const metricMarginPct = document.getElementById('metric-ad-margin-pct');
  const metricProjectedPnl = document.getElementById('metric-ad-projected-pnl');

  if (!metricAdPrice) return;

  try {
    const ads = await bybitService.fetchActiveAds('1', 'USDT');
    // Pick the ONLINE sell ad (status 10), or ACTIVE (20/2), or first available
    const activeSellAd = ads.find(a => Number(a.side) === 1 && Number(a.status) === 10)
      || ads.find(a => Number(a.side) === 1 && (Number(a.status) === 20 || Number(a.status) === 2))
      || null;

    latestActiveAd = activeSellAd;

    const trades = store.getTrades();
    const openingInventory = store.getOpeningInventory();
    const fifoResult = calculateFIFOInventoryAndPnL(trades, openingInventory);
    const avgBuyCost = fifoResult.avgHoldingCostPerUSDT || openingInventory.defaultCostBasis || 0;

    if (activeSellAd) {
      const adPrice = parseFloat(activeSellAd.price) || 0;
      const lastQty = parseFloat(activeSellAd.lastQuantity) || 0;
      const frozenQty = parseFloat(activeSellAd.frozenQuantity) || 0;
      const totalInAd = lastQty + frozenQty;

      // Auto-Sync starting inventory and cost basis when a new ad ID is detected
      const savedAdId = localStorage.getItem('bybit_last_synced_ad_id');
      if (activeSellAd.id && savedAdId !== activeSellAd.id) {
        let totalP2P = 0;
        try {
          const balResult = await bybitService.fetchFundingBalance('USDT');
          const usdtItem = balResult?.balance?.find(b => b.coin === 'USDT') || balResult?.balance?.[0];
          if (usdtItem) {
            totalP2P = parseFloat(usdtItem.transferBalance) || 0;
          }
        } catch (balErr) {
          console.warn('[Ad Auto-Sync] Could not fetch wallet balance:', balErr.message);
        }

        if (totalP2P > 0) {
          store.setOpeningInventory({
            startingUsdtBalance: totalP2P,
            defaultCostBasis: avgBuyCost
          });
          localStorage.setItem('bybit_last_synced_ad_id', activeSellAd.id);

          if (window.showToast) {
            window.showToast(`📢 New Sell Ad #${activeSellAd.id} detected! Auto-updated Starting Inventory to ${totalP2P.toFixed(2)} USDT @ ₦${avgBuyCost.toFixed(2)}.`, 'success');
          }
        }
      }

      // Spread and margin based on THIS ad's price vs actual buy cost
      const spreadPerUsdt = avgBuyCost > 0 ? (adPrice - avgBuyCost) : 0;
      const marginPct = avgBuyCost > 0 ? (spreadPerUsdt / avgBuyCost) * 100 : 0;

      // Projected profit = ONLY this ad's quantity × spread − estimated fees
      // NOT the FIFO inventory, NOT all ads — just THIS ad batch
      const projectedGross = spreadPerUsdt * totalInAd;
      const projectedNet = Math.max(0, projectedGross - 50); // 50 NGN estimated stamp duty

      console.log('[Ad Profit Debug]', { adPrice, avgBuyCost, spreadPerUsdt, totalInAd, projectedGross, projectedNet });

      if (adBadge) {
        adBadge.style.background = 'rgba(16, 185, 129, 0.15)';
        adBadge.style.color = 'var(--profit)';
        adBadge.textContent = '● Active Sell Ad';
      }
      if (adTitle) adTitle.textContent = `Bybit Sell Ad #${activeSellAd.id}`;
      if (metricAdPrice) metricAdPrice.textContent = `₦${adPrice.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
      if (metricAdQty) metricAdQty.textContent = `${totalInAd.toFixed(2)} USDT in ad`;

      if (metricAvgBuy) metricAvgBuy.textContent = `₦${avgBuyCost.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
      if (metricTotalBought) metricTotalBought.textContent = `${fifoResult.remainingInventoryUSDT.toFixed(2)} USDT in stock`;

      if (metricSpread) {
        metricSpread.textContent = `${spreadPerUsdt >= 0 ? '+' : ''}₦${spreadPerUsdt.toFixed(2)} / USDT`;
        metricSpread.className = `font-mono fw-bold fs-5 ${spreadPerUsdt >= 0 ? 'text-profit' : 'text-loss'}`;
      }
      if (metricMarginPct) {
        metricMarginPct.textContent = `${marginPct >= 0 ? '+' : ''}${marginPct.toFixed(2)}% margin`;
        metricMarginPct.className = `small d-block mt-1 ${marginPct >= 0 ? 'text-profit' : 'text-loss'}`;
      }
      if (metricProjectedPnl) {
        metricProjectedPnl.textContent = `${projectedNet >= 0 ? '+' : ''}₦${projectedNet.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
      }

      if (showToast && window.showToast) {
        window.showToast(`Synced Live Bybit Ad @ ₦${adPrice.toFixed(2)} (+₦${spreadPerUsdt.toFixed(2)}/USDT spread)!`, 'success');
      }
    } else {
      if (adBadge) {
        adBadge.style.background = 'rgba(255, 255, 255, 0.08)';
        adBadge.style.color = 'var(--text-muted)';
        adBadge.textContent = '○ No Active Ad';
      }
      if (adTitle) adTitle.textContent = 'No Live Sell Ad on Bybit';
      if (metricAdPrice) metricAdPrice.textContent = '—';
      if (metricAdQty) metricAdQty.textContent = 'Post a Sell Ad on Bybit';
      if (metricAvgBuy) metricAvgBuy.textContent = `₦${avgBuyCost.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
      if (metricTotalBought) metricTotalBought.textContent = `${fifoResult.remainingInventoryUSDT.toFixed(2)} USDT in stock`;
      if (metricSpread) metricSpread.textContent = '—';
      if (metricMarginPct) metricMarginPct.textContent = 'Waiting for active ad';
      if (metricProjectedPnl) metricProjectedPnl.textContent = '₦0.00';

      if (showToast && window.showToast) {
        window.showToast('No active Bybit sell advertisements found.', 'info');
      }
    }
  } catch (e) {
    console.warn('[Dashboard] Could not sync active ad:', e.message);
  }
}

/**
 * Fetch live Bybit wallet balance and compare against FIFO inventory.
 * 
 * CRITICAL ACCOUNTING MODEL:
 *   walletBalance from GET /v5/asset/transfer/query-account-coins-balance
 *   ALREADY INCLUDES coins locked in P2P ads.
 *   The active ad allocation is a SUBSET, not an addition.
 * 
 *   Total P2P USDT = walletBalance (e.g. 103.01)
 *   Active Ad Allocation = ad.lastQuantity + ad.frozenQuantity (e.g. 31.70)  
 *   Free for Buyback = walletBalance − Active Ad (e.g. 71.31)
 *   
 *   103.01 = 31.70 + 71.31  ✓
 */
export async function syncBybitLiveInventory() {
  const elTotal = document.getElementById('stat-bybit-live-total');
  const elFree = document.getElementById('stat-bybit-free');
  const elLocked = document.getElementById('stat-bybit-locked');
  const elDiff = document.getElementById('stat-inventory-diff');

  if (!elTotal) return;

  try {
    // 1. Total P2P USDT = transferBalance from Bybit Funding account (e.g. 103.01 USDT)
    //    We use transferBalance because walletBalance includes locked assets (like Flexible Savings) not used for P2P trading.
    let totalP2P = 0;
    try {
      const balResult = await bybitService.fetchFundingBalance('USDT');
      const usdtItem = balResult?.balance?.find(b => b.coin === 'USDT') || balResult?.balance?.[0];
      if (usdtItem) {
        totalP2P = parseFloat(usdtItem.transferBalance) || 0;
      }
    } catch (e) {
      console.warn('[Dashboard] Could not fetch wallet balance:', e.message);
    }

    // 2. Active Ad Allocation = Fetch live ad directly to avoid race conditions
    let adAllocation = 0;
    try {
      const ads = await bybitService.fetchActiveAds('1', 'USDT');
      const activeAd = ads.find(a => Number(a.side) === 1 && Number(a.status) === 10)
        || ads.find(a => Number(a.side) === 1 && (Number(a.status) === 20 || Number(a.status) === 2))
        || null;
      if (activeAd) {
        adAllocation = (parseFloat(activeAd.lastQuantity) || 0) + (parseFloat(activeAd.frozenQuantity) || 0);
      }
    } catch (e) {
      console.warn('[Dashboard] Could not fetch active ads for live inventory:', e.message);
    }

    // 3. Free for Buyback = Total P2P − Ad Allocation (e.g. 103.01 - 31.70 = 71.31)
    const freeForBuyback = Math.max(0, totalP2P - adAllocation);

    console.log('[Bybit Inventory Debug]', { totalP2P, adAllocation, freeForBuyback });

    // Populate Bybit live numbers
    elTotal.textContent = `${totalP2P.toFixed(2)} USDT`;
    elLocked.textContent = `${adAllocation.toFixed(2)} USDT`;
    elFree.textContent = `${freeForBuyback.toFixed(2)} USDT`;

    // Compare FIFO tracked inventory against actual Bybit total
    const trades = store.getTrades();
    const openingInventory = store.getOpeningInventory();
    const fifoResult = calculateFIFOInventoryAndPnL(trades, openingInventory);
    const fifoInventory = fifoResult.remainingInventoryUSDT;
    const diff = fifoInventory - totalP2P;

    if (Math.abs(diff) > 0.5) {
      elDiff.style.display = 'block';
      const sign = diff > 0 ? '+' : '';
      elDiff.innerHTML = `<span style="color: var(--warning, #f59e0b);">⚠ Diff: ${sign}${diff.toFixed(2)} USDT — App ${diff > 0 ? 'overstates' : 'understates'} by ${Math.abs(diff).toFixed(2)}</span>`;
    } else {
      elDiff.style.display = 'block';
      elDiff.innerHTML = `<span style="color: var(--profit);">✓ App and Bybit match</span>`;
    }
  } catch (e) {
    console.warn('[Dashboard] Bybit live inventory sync failed:', e.message);
    if (elTotal) elTotal.textContent = 'Offline';
  }
}

/**
 * Compute portfolio metrics and update summary cards using FIFO engine
 */
export function renderDashboardMetrics() {
  const trades = store.getTrades();
  const openingInventory = store.getOpeningInventory();

  // Run FIFO engine
  const fifoResult = calculateFIFOInventoryAndPnL(trades, openingInventory);
  const {
    totalRealizedPnL,
    overallROI,
    remainingInventoryUSDT,
    inventoryCostBasisNGN,
    avgHoldingCostPerUSDT
  } = fifoResult;

  // Calculate gross buy/sell totals
  let totalInvestedNGN = 0;
  let totalBoughtUSDT = 0;
  let totalRealizedNGN = 0;
  let totalSoldUSDT = 0;

  trades.forEach(t => {
    const ngn = Number(t.ngnAmount) || 0;
    const usdt = Number(t.usdtAmount) || 0;
    if (t.type === 'BUY') {
      totalInvestedNGN += ngn;
      totalBoughtUSDT += usdt;
    } else {
      totalRealizedNGN += ngn;
      totalSoldUSDT += usdt;
    }
  });

  // DOM Elements
  const statNetPnl = document.getElementById('stat-net-pnl');
  const statPnlRate = document.getElementById('stat-pnl-rate');
  const pnlIconBox = document.getElementById('pnl-icon-box');
  const statInventoryHolding = document.getElementById('stat-inventory-holding');
  const statInventoryCost = document.getElementById('stat-inventory-cost');
  const statTotalInvested = document.getElementById('stat-total-invested');
  const statBuyVolume = document.getElementById('stat-buy-volume');
  const statTotalRealized = document.getElementById('stat-total-realized');
  const statSellVolume = document.getElementById('stat-sell-volume');

  // 1. Realized P&L
  if (statNetPnl) {
    statNetPnl.textContent = formatNGN(totalRealizedPnL);
    statNetPnl.className = `metric-value font-mono ${totalRealizedPnL >= 0 ? 'text-profit' : 'text-loss'}`;
  }

  if (statPnlRate) {
    const roiStr = Math.abs(overallROI).toFixed(2);
    if (totalRealizedPnL >= 0) {
      statPnlRate.innerHTML = `<i data-lucide="sparkles"></i> +${roiStr}% ROI on closed trades`;
      statPnlRate.className = 'metric-footer text-profit';
    } else {
      statPnlRate.innerHTML = `<i data-lucide="alert-triangle"></i> -${roiStr}% loss on closed trades`;
      statPnlRate.className = 'metric-footer text-loss';
    }
  }

  if (pnlIconBox) {
    pnlIconBox.className = `metric-icon-box ${totalRealizedPnL >= 0 ? 'profit-glow' : 'loss-glow'}`;
    pnlIconBox.innerHTML = `<i data-lucide="${totalRealizedPnL >= 0 ? 'trending-up' : 'trending-down'}"></i>`;
  }

  // 2. USDT Inventory
  if (statInventoryHolding) {
    statInventoryHolding.textContent = formatUSDT(remainingInventoryUSDT);
  }
  if (statInventoryCost) {
    if (remainingInventoryUSDT > 0) {
      statInventoryCost.textContent = `Avg: ${formatRate(avgHoldingCostPerUSDT)} • ${formatNGN(inventoryCostBasisNGN)}`;
    } else {
      statInventoryCost.textContent = 'No unsold inventory';
    }
  }

  // 3. Total Bank Cash Balance
  const computedBankBalances = store.getComputedBankBalances ? store.getComputedBankBalances() : new Map();
  let totalBankCash = 0;
  let activeBanksCount = 0;
  computedBankBalances.forEach(rec => {
    totalBankCash += rec.currentBalance;
    activeBanksCount++;
  });

  const statTotalBankCash = document.getElementById('stat-total-bank-cash');
  const statBankCashSubtext = document.getElementById('stat-bank-cash-subtext');

  if (statTotalBankCash) {
    statTotalBankCash.textContent = formatNGN(totalBankCash);
    statTotalBankCash.className = `metric-value font-mono ${totalBankCash >= 0 ? 'text-profit' : 'text-loss'}`;
  }
  if (statBankCashSubtext) {
    statBankCashSubtext.textContent = `Across ${activeBanksCount} linked ${activeBanksCount === 1 ? 'account' : 'accounts'}`;
  }

  // 4. Gross Buys
  if (statTotalInvested) statTotalInvested.textContent = formatNGN(totalInvestedNGN);
  if (statBuyVolume) statBuyVolume.textContent = `${formatUSDT(totalBoughtUSDT)} bought`;

  // 5. Gross Sells
  if (statTotalRealized) statTotalRealized.textContent = formatNGN(totalRealizedNGN);
  if (statSellVolume) statSellVolume.textContent = `${formatUSDT(totalSoldUSDT)} sold`;

  if (window.lucide) window.lucide.createIcons();
}

/**
 * Render recent 5 trades feed on the dashboard with FIFO P&L annotations
 */
export function renderRecentTradesList() {
  const container = document.getElementById('dashboard-recent-list');
  if (!container) return;

  const trades = store.getTrades();
  const openingInventory = store.getOpeningInventory();
  const { enrichedTrades } = calculateFIFOInventoryAndPnL(trades, openingInventory);

  // Take latest 5 trades (newest first)
  const recentTrades = [...enrichedTrades].reverse().slice(0, 5);

  if (recentTrades.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon-box">
          <i data-lucide="inbox"></i>
        </div>
        <p class="empty-title">No trades logged yet</p>
        <p class="empty-subtitle">Click "New Trade" to record your first Bybit P2P order.</p>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  const banks = store.getBankAccounts();
  const bankMap = new Map(banks.map(b => [b.id, b]));

  container.innerHTML = recentTrades.map(trade => {
    const isBuy = trade.type === 'BUY';
    const bank = bankMap.get(trade.bankAccountId);
    const bankLabel = bank ? `${bank.name} •••• ${bank.last4}` : 'Unknown Bank';

    // Show Realized PnL badge for SELL trades
    let pnlBadge = '';
    if (!isBuy && trade.realizedPnL !== null) {
      const isProfitable = trade.realizedPnL >= 0;
      pnlBadge = `
        <span class="small brand-tag" style="background: ${isProfitable ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)'}; color: ${isProfitable ? 'var(--profit)' : 'var(--loss)'}; border: none;">
          P&L: ${formatNGN(trade.realizedPnL)}
        </span>
      `;
    }

    return `
      <div class="card mb-2 p-3 d-flex align-items-center justify-content-between cursor-pointer trade-preview-item" 
           data-trade-id="${escapeHtml(trade.id)}" 
           style="background: rgba(10, 16, 28, 0.6); transition: all 0.2s ease;">
        <div class="d-flex align-items-center gap-3">
          <div class="metric-icon-box ${isBuy ? 'profit-glow' : 'loss-glow'}">
            <i data-lucide="${isBuy ? 'arrow-down-left' : 'arrow-up-right'}"></i>
          </div>
          <div>
            <div class="d-flex align-items-center gap-2">
              <span class="fw-bold font-mono">${formatNGN(trade.ngnAmount)}</span>
              <span class="small brand-tag" style="background: ${isBuy ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)'}; color: ${isBuy ? 'var(--profit)' : 'var(--loss)'}; border-color: transparent;">
                ${trade.type}
              </span>
              ${pnlBadge}
            </div>
            <p class="text-muted small">
              ${formatUSDT(trade.usdtAmount)} @ ₦${Number(trade.rate).toLocaleString('en-US', { minimumFractionDigits: 2 })} • ${escapeHtml(bankLabel)}
            </p>
          </div>
        </div>
        <div class="text-end">
          <div class="text-muted small">${formatDateTime(trade.date)}</div>
          ${trade.unmatchedQty > 0 ? `<div class="text-warning small">⚠️ ${formatUSDT(trade.unmatchedQty)} unmatched</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();

  // Clicking a trade in recent feed switches to edit/history
  container.querySelectorAll('.trade-preview-item').forEach(item => {
    item.addEventListener('click', () => {
      const tradeId = item.getAttribute('data-trade-id');
      if (window.startEditTrade) {
        window.startEditTrade(tradeId);
      }
    });
  });
}

/**
 * Initialize Chart.js graph
 */
function initDashboardChart() {
  const canvas = document.getElementById('pnlChart');
  if (!canvas) return;

  updateDashboardChart();
}

/**
 * Filter time period handler
 */
function setupPeriodFilters() {
  const filterContainer = document.getElementById('chart-time-filter');
  if (!filterContainer) return;

  const buttons = filterContainer.querySelectorAll('.seg-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentChartPeriod = btn.getAttribute('data-period') || 'all';
      updateDashboardChart();
    });
  });
}

/**
 * Re-render Chart.js with cumulative FIFO Realized P&L
 */
export function updateDashboardChart() {
  const canvas = document.getElementById('pnlChart');
  const emptyState = document.getElementById('chart-empty-state');
  if (!canvas) return;

  const trades = store.getTrades();
  const openingInventory = store.getOpeningInventory();

  if (trades.length === 0) {
    if (emptyState) emptyState.classList.remove('hidden');
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    return;
  }

  const { enrichedTrades } = calculateFIFOInventoryAndPnL(trades, openingInventory);

  if (emptyState) emptyState.classList.add('hidden');

  // Filter by period
  const now = new Date().getTime();
  let filteredTrades = enrichedTrades;

  if (currentChartPeriod === '7d') {
    const cutoff = now - (7 * 24 * 60 * 60 * 1000);
    filteredTrades = enrichedTrades.filter(t => new Date(t.date).getTime() >= cutoff);
  } else if (currentChartPeriod === '30d') {
    const cutoff = now - (30 * 24 * 60 * 60 * 1000);
    filteredTrades = enrichedTrades.filter(t => new Date(t.date).getTime() >= cutoff);
  }

  if (filteredTrades.length === 0) {
    filteredTrades = enrichedTrades;
  }

  // Calculate cumulative Realized P&L
  let runningPnL = 0;
  const labels = [];
  const pnlData = [];

  filteredTrades.forEach((trade, idx) => {
    if (trade.type === 'SELL' && trade.realizedPnL !== null) {
      runningPnL += trade.realizedPnL;
    }

    const dateObj = new Date(trade.date);
    const dateLabel = isNaN(dateObj.getTime()) ? `#${idx + 1}` : dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    labels.push(dateLabel);
    pnlData.push(runningPnL);
  });

  const ctx = canvas.getContext('2d');
  if (chartInstance) {
    chartInstance.destroy();
  }

  const isNetPositive = runningPnL >= 0;
  const strokeColor = isNetPositive ? '#10B981' : '#F43F5E';

  // Gradient fill
  const gradient = ctx.createLinearGradient(0, 0, 0, 200);
  gradient.addColorStop(0, isNetPositive ? 'rgba(16, 185, 129, 0.35)' : 'rgba(244, 63, 94, 0.35)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0.0)');

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Realized P&L (₦)',
        data: pnlData,
        borderColor: strokeColor,
        backgroundColor: gradient,
        borderWidth: 2.5,
        fill: true,
        tension: 0.35,
        pointBackgroundColor: strokeColor,
        pointBorderColor: '#0E1626',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index'
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(14, 22, 38, 0.95)',
          titleColor: '#F8FAFC',
          bodyColor: '#94A3B8',
          borderColor: 'rgba(255, 255, 255, 0.15)',
          borderWidth: 1,
          padding: 10,
          displayColors: false,
          callbacks: {
            label: (context) => `Realized P&L: ${formatNGN(context.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748B', font: { size: 11 } }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            color: '#64748B',
            font: { size: 11 },
            callback: (val) => formatNGN(val, 0)
          }
        }
      }
    }
  });
}
