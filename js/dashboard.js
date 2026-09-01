/**
 * Bybit NGN P2P Trade Tracker — Dashboard Module
 * Calculates FIFO cost-basis performance metrics and manages Chart.js analytics.
 * Delegates Net Worth Snapshot and Historical Analytics to the extracted snapshots module.
 */

import { store } from './store.js';
import {
  formatNGN,
  formatUSDT,
  formatDateTime,
  calculateFIFOInventoryAndPnL,
  calculateTotalBankCash,
  escapeHtml
} from './utils.js';
import { bybitService } from './bybitService.js';
import {
  renderNetWorthWidget,
  setupSnapshotModalEvents,
  openSnapshotModal,
  closeSnapshotModal,
  handleSnapshotRateInput,
  handleSnapshotFormSubmit,
  executeDeleteSnapshot,
  renderNetWorthTrendChart,
  renderSnapshotHistoryTable,
  renderSnapshotHistoryRow,
  setupNetWorthChartFilters,
  setActiveAd,
  setLiveUsdt,
  getActiveAd,
  getLiveUsdt
} from './snapshots.js';

let chartInstance = null;
let currentChartPeriod = 'all';

export function initDashboard() {
  // Set dynamic welcome greeting
  const greetingEl = document.getElementById('dashboard-greeting');
  if (greetingEl) {
    const hrs = new Date().getHours();
    let greet = 'Good day 👋';
    if (hrs < 12) greet = 'Good morning 🌅';
    else if (hrs < 17) greet = 'Good afternoon ☀️';
    else greet = 'Good evening 🌙';
    greetingEl.textContent = greet;
  }

  renderDashboardMetrics();
  renderRecentTradesList();
  initDashboardChart();
  setupPeriodFilters();
  syncAndRenderActiveAd();
  syncBybitLiveInventory();
  setupSnapshotModalEvents();

  // Initialize Net Worth Trend Chart, Snapshot History, and Currency Filters
  renderNetWorthTrendChart('both');
  renderSnapshotHistoryTable();
  setupNetWorthChartFilters();

  const btnSyncAd = document.getElementById('btn-sync-active-ad');
  let isSyncingActiveAd = false;
  btnSyncAd?.addEventListener('click', async () => {
    if (isSyncingActiveAd) return;
    try {
      isSyncingActiveAd = true;
      if (btnSyncAd) btnSyncAd.disabled = true;
      await Promise.all([
        syncAndRenderActiveAd(true),
        syncBybitLiveInventory()
      ]);
    } finally {
      isSyncingActiveAd = false;
      if (btnSyncAd) btnSyncAd.disabled = false;
    }
  });

  // Listen for store updates across all collections
  window.addEventListener('store:updated', (e) => {
    const type = e.detail?.type;
    const handledTypes = ['trades', 'banks', 'transfers', 'settings', 'snapshots', 'SNAPSHOTS_UPDATED', 'all'];
    if (!type || handledTypes.includes(type)) {
      renderDashboardMetrics();
      renderRecentTradesList();
      updateDashboardChart();
      syncAndRenderActiveAd();
      syncBybitLiveInventory();

      // Reactively refresh Net Worth Trend Chart and Snapshot History Table
      renderNetWorthTrendChart();
      renderSnapshotHistoryTable();
    }
  });
}

let lastAdSyncId = 0;

/**
 * Fetch and render Active Bybit Sell Ad & Live Spread Monitor
 * @param {boolean} [showToast=false]
 */
export async function syncAndRenderActiveAd(showToast = false) {
  const currentSyncId = ++lastAdSyncId;

  const adBadge = document.getElementById('active-ad-badge');
  const adTitle = document.getElementById('active-ad-title');
  const metricAdPrice = document.getElementById('metric-ad-sell-price');
  const metricAdQty = document.getElementById('metric-ad-qty-stock');
  const metricAvgBuy = document.getElementById('metric-ad-avg-buy-cost');
  const metricTotalBought = document.getElementById('metric-ad-total-bought');
  const metricSpread = document.getElementById('metric-ad-spread-usdt');
  const metricMarginPct = document.getElementById('metric-ad-margin-pct');
  const metricProjectedPnl = document.getElementById('metric-ad-projected-pnl');

  const metricBuyPrice = document.getElementById('metric-ad-buy-price');
  const metricBuyQty = document.getElementById('metric-ad-qty-buy');
  const metricBuyFiat = document.getElementById('metric-ad-buy-fiat');
  const metricBuyStatus = document.getElementById('metric-ad-buy-status');
  const buyBadge = document.getElementById('active-buy-ad-badge');
  const buyTitle = document.getElementById('active-buy-ad-title');

  try {
    // Fetch all ads
    const ads = await bybitService.fetchActiveAds('', 'USDT');
    if (currentSyncId !== lastAdSyncId) {
      // Discard stale out-of-order response
      return;
    }
    console.log('[Dashboard] Fetched P2P ads:', ads);
    
    const isBuySide = (ad) => {
      if (!ad) return false;
      const raw = (ad.side !== undefined && ad.side !== null) ? ad.side : (ad.tradeType ?? ad.sideName ?? ad.type ?? ad.action ?? '');
      const s = String(raw).trim().toUpperCase();
      return s === '0' || s === 'BUY';
    };

    const isSellSide = (ad) => {
      if (!ad) return false;
      const raw = (ad.side !== undefined && ad.side !== null) ? ad.side : (ad.tradeType ?? ad.sideName ?? '');
      const s = String(raw).trim().toUpperCase();
      return s === '1' || s === 'SELL';
    };

    const isOnlineStatus = (status) => {
      if (status === undefined || status === null) return false;
      const s = String(status).trim().toUpperCase();
      // Status 10 or 1 or 'ONLINE' or 'ACTIVE' = Live on orderbook.
      // Status 20, 30, 2 = Offline / Paused / Removed / Inactive.
      return s === '10' || s === '1' || s === 'ONLINE' || s === 'ACTIVE';
    };

    // Extract Sell Ad (Strictly active online ads only)
    const activeSellAd = ads.find(a => isSellSide(a) && isOnlineStatus(a.status)) || null;
      
    // Extract Buy Ad (Strictly active online ads only)
    const activeBuyAd = ads.find(a => isBuySide(a) && isOnlineStatus(a.status)) || null;

    setActiveAd(activeSellAd);

    const trades = store.getTrades();
    const openingInventory = store.getOpeningInventory();
    const fifoResult = calculateFIFOInventoryAndPnL(trades, openingInventory);
    const avgBuyCost = fifoResult.avgHoldingCostPerUSDT || openingInventory.defaultCostBasis || 0;

    // --- Render Sell Ad ---
    if (metricAdPrice) {
      if (activeSellAd) {
        const adPrice = parseFloat(String(activeSellAd.price).replace(/,/g, '')) || 0;
        const lastQty = parseFloat(String(activeSellAd.lastQuantity ?? activeSellAd.quantity ?? 0).replace(/,/g, '')) || 0;
        const frozenQty = parseFloat(String(activeSellAd.frozenQuantity ?? 0).replace(/,/g, '')) || 0;
        const totalInAd = lastQty + frozenQty;

        // Spread and margin based on THIS ad's price vs actual buy cost
        const spreadPerUsdt = avgBuyCost > 0 ? (adPrice - avgBuyCost) : 0;
        const marginPct = avgBuyCost > 0 ? (spreadPerUsdt / avgBuyCost) * 100 : 0;

        // Projected profit = ONLY this ad's quantity × spread (₦0 fee deduction when receiving Naira)
        const projectedGross = spreadPerUsdt * totalInAd;
        const projectedNet = Math.max(0, projectedGross);

        const sellAdId = activeSellAd.id || activeSellAd.itemId || activeSellAd.adId || activeSellAd.advId || activeSellAd.idStr || '';
        if (adBadge) {
          adBadge.className = 'live-badge';
          adBadge.innerHTML = '<span class="live-badge-dot"></span>Active Sell Ad';
        }
        if (adTitle) adTitle.textContent = sellAdId ? `Bybit Sell Ad #${sellAdId}` : 'Bybit Sell Ad';
        if (metricAdPrice) metricAdPrice.textContent = `₦${adPrice.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
        if (metricAdQty) metricAdQty.textContent = `${totalInAd.toFixed(2)} USDT listed`;

        if (metricAvgBuy) metricAvgBuy.textContent = `₦${avgBuyCost.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
        if (metricTotalBought) metricTotalBought.textContent = `${fifoResult.remainingInventoryUSDT.toFixed(2)} USDT in stock`;

        if (metricSpread) {
          metricSpread.textContent = `${spreadPerUsdt >= 0 ? '+' : ''}₦${spreadPerUsdt.toFixed(2)} / USDT`;
          metricSpread.className = `ad-submetric-value font-mono ${spreadPerUsdt >= 0 ? 'text-success' : 'text-danger'}`;
        }
        if (metricMarginPct) {
          metricMarginPct.textContent = `${marginPct >= 0 ? '+' : ''}${marginPct.toFixed(2)}% margin`;
          metricMarginPct.className = `ad-submetric-sub ${marginPct >= 0 ? 'text-success' : 'text-danger'}`;
        }
        if (metricProjectedPnl) {
          metricProjectedPnl.textContent = `${projectedNet >= 0 ? '+' : ''}₦${projectedNet.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
          metricProjectedPnl.className = `ad-submetric-value font-mono ${projectedNet >= 0 ? 'text-success' : 'text-danger'}`;
        }
      } else {
        if (adBadge) {
          adBadge.className = 'badge badge-neutral';
          adBadge.innerHTML = 'No Active Ad';
        }
        if (adTitle) adTitle.textContent = 'No Live Sell Ad on Bybit';
        if (metricAdPrice) metricAdPrice.textContent = '—';
        if (metricAdQty) metricAdQty.textContent = 'Post a Sell Ad on Bybit';
        if (metricAvgBuy) metricAvgBuy.textContent = `₦${avgBuyCost.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
        if (metricTotalBought) metricTotalBought.textContent = `${fifoResult.remainingInventoryUSDT.toFixed(2)} USDT in stock`;
        if (metricSpread) {
          metricSpread.textContent = '—';
          metricSpread.className = 'ad-submetric-value font-mono text-accent';
        }
        if (metricMarginPct) {
          metricMarginPct.textContent = 'Waiting for active ad';
          metricMarginPct.className = 'ad-submetric-sub';
        }
        if (metricProjectedPnl) {
          metricProjectedPnl.textContent = '₦0.00';
          metricProjectedPnl.className = 'ad-submetric-value font-mono';
        }
      }
    }

    // --- Render Buy Ad ---
    if (metricBuyPrice) {
      if (activeBuyAd) {
        const buyPrice = parseFloat(String(activeBuyAd.price).replace(/,/g, '')) || 0;
        const lastQty = parseFloat(String(activeBuyAd.lastQuantity ?? activeBuyAd.quantity ?? activeBuyAd.targetQuantity ?? 0).replace(/,/g, '')) || 0;
        const frozenQty = parseFloat(String(activeBuyAd.frozenQuantity ?? 0).replace(/,/g, '')) || 0;
        const totalTargetUsdt = lastQty + frozenQty;
        const fiatAllocated = totalTargetUsdt * buyPrice;

        const isOnline = String(activeBuyAd.status) === '10' || String(activeBuyAd.status) === '1' || String(activeBuyAd.status) === '2' || String(activeBuyAd.status).toUpperCase() === 'ONLINE' || String(activeBuyAd.status).toUpperCase() === 'ACTIVE';
        const isPaused = String(activeBuyAd.status) === '20' || String(activeBuyAd.status).toUpperCase() === 'OFFLINE' || String(activeBuyAd.status).toUpperCase() === 'PAUSED';

        const buyAdId = activeBuyAd.id || activeBuyAd.itemId || activeBuyAd.adId || activeBuyAd.advId || activeBuyAd.idStr || '';
        if (buyBadge) {
          buyBadge.className = 'live-badge';
          buyBadge.innerHTML = '<span class="live-badge-dot" style="background-color: var(--danger, #F43F5E);"></span>Active Buy Ad';
        }
        if (buyTitle) buyTitle.textContent = buyAdId ? `Bybit Buy Ad #${buyAdId}` : 'Bybit Buy Ad';
        
        metricBuyPrice.textContent = `₦${buyPrice.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
        if (metricBuyQty) metricBuyQty.textContent = `${totalTargetUsdt.toFixed(2)} USDT targeted`;
        
        if (metricBuyFiat) metricBuyFiat.textContent = `₦${fiatAllocated.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
        if (metricBuyStatus) {
          if (isOnline) {
            metricBuyStatus.textContent = 'Online / Active';
            metricBuyStatus.className = 'ad-submetric-value font-mono text-success';
          } else if (isPaused) {
            metricBuyStatus.textContent = 'Paused / Offline';
            metricBuyStatus.className = 'ad-submetric-value font-mono text-warning';
          } else {
            metricBuyStatus.textContent = (activeBuyAd.status !== undefined && activeBuyAd.status !== null) ? `Status: ${activeBuyAd.status}` : 'Active';
            metricBuyStatus.className = 'ad-submetric-value font-mono text-accent';
          }
        }
      } else {
        if (buyBadge) {
          buyBadge.className = 'badge badge-neutral';
          buyBadge.innerHTML = 'No Active Ad';
        }
        if (buyTitle) buyTitle.textContent = 'No Live Buy Ad on Bybit';
        
        metricBuyPrice.textContent = '—';
        if (metricBuyQty) metricBuyQty.textContent = 'Post a Buy Ad on Bybit';
        if (metricBuyFiat) metricBuyFiat.textContent = '₦0.00';
        if (metricBuyStatus) {
          metricBuyStatus.textContent = 'Offline';
          metricBuyStatus.className = 'ad-submetric-value font-mono text-muted';
        }
      }
    }

    if (showToast && window.showToast) {
      if (activeSellAd && activeBuyAd) {
        window.showToast('Synced Live Bybit Ads (Buy & Sell) successfully!', 'success');
      } else if (activeSellAd) {
        window.showToast('Synced Live Bybit Sell Ad successfully!', 'success');
      } else if (activeBuyAd) {
        window.showToast('Synced Live Bybit Buy Ad successfully!', 'success');
      } else {
        window.showToast('No active Bybit advertisements found.', 'info');
      }
    }

    // Reactively update Net Worth with fresh active ad rate
    renderNetWorthWidget();
  } catch (e) {
    console.warn('[Dashboard] Could not sync active ad:', e.message);
    setActiveAd(null);

    // Reset Sell Ad UI
    if (adBadge) {
      adBadge.className = 'badge badge-neutral';
      adBadge.innerHTML = 'No Active Ad';
    }
    if (adTitle) adTitle.textContent = 'No Live Sell Ad on Bybit';
    if (metricAdPrice) metricAdPrice.textContent = '—';
    if (metricAdQty) metricAdQty.textContent = 'Post a Sell Ad on Bybit';
    if (metricSpread) {
      metricSpread.textContent = '—';
      metricSpread.className = 'ad-submetric-value font-mono text-accent';
    }
    if (metricMarginPct) {
      metricMarginPct.textContent = 'Waiting for active ad';
      metricMarginPct.className = 'ad-submetric-sub';
    }
    if (metricProjectedPnl) {
      metricProjectedPnl.textContent = '₦0.00';
      metricProjectedPnl.className = 'ad-submetric-value font-mono';
    }

    // Reset Buy Ad UI
    if (buyBadge) {
      buyBadge.className = 'badge badge-neutral';
      buyBadge.innerHTML = 'No Active Ad';
    }
    if (buyTitle) buyTitle.textContent = 'No Live Buy Ad on Bybit';
    if (metricBuyPrice) metricBuyPrice.textContent = '—';
    if (metricBuyQty) metricBuyQty.textContent = 'Post a Buy Ad on Bybit';
    if (metricBuyFiat) metricBuyFiat.textContent = '₦0.00';
    if (metricBuyStatus) {
      metricBuyStatus.textContent = 'Offline';
      metricBuyStatus.className = 'ad-submetric-value font-mono text-muted';
    }

    renderNetWorthWidget();
  }
}

let lastInventorySyncId = 0;

/**
 * Fetch live Bybit wallet balance and compare against FIFO inventory.
 */
export async function syncBybitLiveInventory() {
  const currentSyncId = ++lastInventorySyncId;

  const elTotal = document.getElementById('stat-bybit-live-total');
  const elFree = document.getElementById('stat-bybit-free');
  const elLocked = document.getElementById('stat-bybit-locked');
  const elDiff = document.getElementById('stat-inventory-diff');
  const barActive = document.getElementById('bar-segment-active');
  const barFree = document.getElementById('bar-segment-free');

  try {
    let totalP2P = 0;
    let fetchedWallet = false;

    try {
      const balResult = await bybitService.fetchFundingBalance('USDT');
      const usdtItem = balResult?.balance?.find(b => b.coin === 'USDT') || balResult?.balance?.[0];
      if (usdtItem) {
        totalP2P = parseFloat(usdtItem.transferBalance) || 0;
        fetchedWallet = true;
      }
    } catch (e) {
      console.warn('[Dashboard] Could not fetch wallet balance:', e.message);
    }

    // Query active ads directly to determine ad allocation
    let adAllocation = 0;
    try {
      const ads = await bybitService.fetchActiveAds('1', 'USDT');
      const isSell = (a) => {
        if (!a) return false;
        const raw = (a.side !== undefined && a.side !== null) ? a.side : (a.tradeType ?? a.sideName ?? a.type ?? a.action ?? '');
        const s = String(raw).trim().toUpperCase();
        return s === '1' || s === 'SELL';
      };
      const isOnlineOrActive = (s) => {
        if (s === undefined || s === null) return false;
        const str = String(s).trim().toUpperCase();
        return str === '10' || str === '1' || str === 'ONLINE' || str === 'ACTIVE';
      };
      const activeSellAds = ads.filter(a => isSell(a) && isOnlineOrActive(a.status));
      const activeAd = activeSellAds[0] || null;
      if (activeSellAds.length > 0) {
        adAllocation = activeSellAds.reduce((sum, a) => {
          const lq = parseFloat(String(a.lastQuantity ?? a.quantity ?? 0).replace(/,/g, '')) || 0;
          const fq = parseFloat(String(a.frozenQuantity ?? 0).replace(/,/g, '')) || 0;
          return sum + lq + fq;
        }, 0);
      }
      if (activeAd) {
        setActiveAd(activeAd);
      }
    } catch (e) {
      console.warn('[Dashboard] Could not fetch active ads for live inventory:', e.message);
    }

    if (currentSyncId !== lastInventorySyncId) {
      // Discard stale out-of-order response
      return;
    }

    // Free for Buyback = Total P2P - Ad Allocation
    const freeForBuyback = Math.max(0, totalP2P - adAllocation);

    if (fetchedWallet || adAllocation > 0) {
      setLiveUsdt(totalP2P);
    } else {
      setLiveUsdt(null);
    }

    console.log('[Bybit Inventory Debug]', { totalP2P, adAllocation, freeForBuyback, latestLiveUsdt: getLiveUsdt() });

    // Populate Bybit live numbers if present
    if (elTotal) elTotal.textContent = `${totalP2P.toFixed(2)} USDT`;
    if (elLocked) elLocked.textContent = `${adAllocation.toFixed(2)} USDT`;
    if (elFree) elFree.textContent = `${freeForBuyback.toFixed(2)} USDT`;

    // Update Progress Bar segments visually
    if (barActive && barFree) {
      if (totalP2P > 0) {
        const activePct = (adAllocation / totalP2P) * 100;
        const freePct = (freeForBuyback / totalP2P) * 100;
        barActive.style.width = `${activePct}%`;
        barFree.style.width = `${freePct}%`;
      } else {
        barActive.style.width = '0%';
        barFree.style.width = '0%';
      }
    }

    // Compare FIFO tracked inventory against actual Bybit total
    const trades = store.getTrades();
    const openingInventory = store.getOpeningInventory();
    const fifoResult = calculateFIFOInventoryAndPnL(trades, openingInventory);
    const fifoInventory = fifoResult.remainingInventoryUSDT;
    const diff = fifoInventory - totalP2P;

    if (elDiff) {
      if (Math.abs(diff) > 0.5) {
        elDiff.style.display = 'block';
        elDiff.classList.remove('hidden');
        const sign = diff > 0 ? '+' : '';
        elDiff.innerHTML = `<span class="text-warning">⚠ Sync Diff: ${sign}${diff.toFixed(2)} USDT (App ledger vs Bybit balance)</span>`;
      } else {
        elDiff.style.display = 'block';
        elDiff.classList.remove('hidden');
        elDiff.innerHTML = `<span class="text-success">✓ Ledger & Bybit inventory matched</span>`;
      }
    }

    // Reactively update Net Worth with fresh Bybit live USDT balance
    renderNetWorthWidget();
  } catch (e) {
    console.warn('[Dashboard] Bybit live inventory sync failed:', e.message);
    setLiveUsdt(null);
    if (elTotal) elTotal.textContent = 'Offline';
    if (barActive && barFree) {
      barActive.style.width = '0%';
      barFree.style.width = '0%';
    }
    renderNetWorthWidget();
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

  // Inventory display values strictly from authoritative FIFO engine output
  const displayInventoryUSDT = remainingInventoryUSDT;
  const displayInventoryCostNGN = inventoryCostBasisNGN;
  const displayAvgCostPerUSDT = avgHoldingCostPerUSDT || openingInventory.defaultCostBasis || 0;

  // DOM Elements
  const statNetPnl = document.getElementById('stat-net-pnl');
  const statPnlRate = document.getElementById('stat-pnl-rate');
  const statInventoryHolding = document.getElementById('stat-inventory-holding');
  const statInventoryCost = document.getElementById('stat-inventory-cost');

  // 1. Realized P&L
  if (statNetPnl) {
    statNetPnl.textContent = `${totalRealizedPnL >= 0 ? '+' : ''}${formatNGN(totalRealizedPnL)}`;
    statNetPnl.className = `portfolio-value font-mono ${totalRealizedPnL >= 0 ? 'text-success' : 'text-danger'}`;
  }

  if (statPnlRate) {
    const roiStr = Math.abs(overallROI).toFixed(2);
    const isProfitable = totalRealizedPnL >= 0;
    statPnlRate.innerHTML = `
      <span class="badge ${isProfitable ? 'badge-success' : 'badge-danger'}" id="pnl-roi-badge">
        <i data-lucide="${isProfitable ? 'trending-up' : 'trending-down'}" id="pnl-icon"></i>
        <span>${isProfitable ? '+' : '-'}${roiStr}% ROI</span>
      </span>
    `;
  }

  // 2. USDT Inventory
  if (statInventoryHolding) {
    statInventoryHolding.textContent = formatUSDT(displayInventoryUSDT);
  }
  if (statInventoryCost) {
    if (displayInventoryUSDT > 0) {
      statInventoryCost.textContent = `Cost: ${formatNGN(displayInventoryCostNGN)} • Avg: ₦${displayAvgCostPerUSDT.toFixed(2)}`;
    } else {
      statInventoryCost.textContent = 'No inventory';
    }
  }

  // 3. Total Bank Cash Balance
  const computedBankBalances = store.getComputedBankBalances ? store.getComputedBankBalances() : new Map();
  const totalBankCash = calculateTotalBankCash(computedBankBalances);
  let activeBanksCount = 0;
  if (computedBankBalances instanceof Map) {
    activeBanksCount = computedBankBalances.size;
  } else if (Array.isArray(computedBankBalances)) {
    activeBanksCount = computedBankBalances.length;
  } else if (computedBankBalances && typeof computedBankBalances === 'object') {
    activeBanksCount = Object.keys(computedBankBalances).length;
  }

  const statTotalBankCash = document.getElementById('stat-total-bank-cash');
  const statBankCashSubtext = document.getElementById('stat-bank-cash-subtext');

  if (statTotalBankCash) {
    statTotalBankCash.textContent = formatNGN(totalBankCash);
    statTotalBankCash.className = `portfolio-value font-mono ${totalBankCash >= 0 ? 'text-success' : 'text-danger'}`;
  }
  if (statBankCashSubtext) {
    statBankCashSubtext.textContent = `Across ${activeBanksCount} linked ${activeBanksCount === 1 ? 'account' : 'accounts'}`;
  }

  // 4. Live Net Worth Hero Widget
  renderNetWorthWidget();

  // 5. Net Worth Trend Chart & Snapshot History Table
  renderNetWorthTrendChart();
  renderSnapshotHistoryTable();

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
        <span class="badge ${isProfitable ? 'badge-success' : 'badge-danger'}">
          P&L: ${formatNGN(trade.realizedPnL)}
        </span>
      `;
    }

    return `
      <div class="trade-list-item cursor-pointer trade-preview-item" data-trade-id="${escapeHtml(trade.id)}">
        <div class="trade-list-left">
          <div class="trade-type-indicator ${isBuy ? 'buy-indicator' : 'sell-indicator'}">
            <i data-lucide="${isBuy ? 'arrow-down-left' : 'arrow-up-right'}"></i>
          </div>
          <div class="trade-list-info">
            <div class="d-flex align-items-center gap-2">
              <span class="trade-list-primary">${formatNGN(trade.ngnAmount)}</span>
              <span class="badge ${isBuy ? 'badge-buy' : 'badge-sell'}">
                ${trade.type}
              </span>
              ${pnlBadge}
            </div>
            <p class="trade-list-secondary">
              ${formatUSDT(trade.usdtAmount)} @ ₦${Number(trade.rate).toLocaleString('en-US', { minimumFractionDigits: 2 })} • ${escapeHtml(bankLabel)}
            </p>
          </div>
        </div>
        <div class="trade-list-right">
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

// Re-export Net Worth and Snapshot APIs for full backwards compatibility
export {
  renderNetWorthWidget,
  setupSnapshotModalEvents,
  openSnapshotModal,
  closeSnapshotModal,
  handleSnapshotRateInput,
  handleSnapshotFormSubmit,
  executeDeleteSnapshot,
  renderNetWorthTrendChart,
  renderSnapshotHistoryTable,
  renderSnapshotHistoryRow,
  setupNetWorthChartFilters
};
