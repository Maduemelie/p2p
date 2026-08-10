/**
 * Bybit NGN P2P Trade Tracker — Utility Functions
 * Pure helper functions for formatting, FIFO inventory calculations, and validation
 */

/**
 * Format number to Nigerian Naira string (e.g. ₦1,250,000.00)
 * @param {number} amount
 * @param {number} decimals
 * @returns {string}
 */
export function formatNGN(amount, decimals = 2) {
  const num = Number(amount) || 0;
  const isNegative = num < -0.00001;
  const absFormatted = Math.abs(num).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
  return isNegative ? `-₦${absFormatted}` : `₦${absFormatted}`;
}

/**
 * Format number to USDT string (e.g. 500.00 USDT)
 * @param {number} amount
 * @param {number} decimals
 * @returns {string}
 */
export function formatUSDT(amount, decimals = 2) {
  const num = Number(amount) || 0;
  return `${num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })} USDT`;
}

/**
 * Format rate (e.g. ₦1,450.50 / USDT)
 * @param {number} rate
 * @returns {string}
 */
export function formatRate(rate) {
  const num = Number(rate) || 0;
  return `₦${num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} / USDT`;
}

/**
 * Format ISO date-time to readable string
 * @param {string|Date} dateInput
 * @returns {string}
 */
export function formatDateTime(dateInput) {
  if (!dateInput) return '—';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(date);
}

/**
 * Format date for input[type="datetime-local"]
 * @param {Date} [date]
 * @returns {string}
 */
export function getLocalIsoDateTime(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

/**
 * Generate a unique ID with optional prefix
 * @param {string} prefix
 * @returns {string}
 */
export function generateId(prefix = 'id') {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 9);
  return `${prefix}_${timestamp}_${randomPart}`;
}

/**
 * Calculate net trade cost/revenue and effective rate
 * @param {'BUY'|'SELL'} type
 * @param {number} ngnAmount
 * @param {number} usdtAmount
 * @param {number} totalFees
 * @returns {{ netAmount: number, effectiveRate: number }}
 */
export function calculateTradeBreakdown(type, ngnAmount, usdtAmount, totalFees = 0) {
  const ngn = Number(ngnAmount) || 0;
  const usdt = Number(usdtAmount) || 0;
  const fees = Number(totalFees) || 0;

  if (type === 'BUY') {
    const netAmount = ngn + fees;
    const effectiveRate = usdt > 0 ? netAmount / usdt : 0;
    return { netAmount, effectiveRate };
  } else {
    const netAmount = Math.max(0, ngn - fees);
    const effectiveRate = usdt > 0 ? netAmount / usdt : 0;
    return { netAmount, effectiveRate };
  }
}

/**
 * FIFO (First-In, First-Out) Cost-Basis Inventory & Realized P&L Engine
 * Correctly matches BUY lots against SELL orders regardless of quantity discrepancies.
 * 
 * @param {Array} trades - Array of trade objects
 * @param {{ startingUsdtBalance: number, defaultCostBasis: number }} [openingInventory]
 * @returns {{
 *   enrichedTrades: Array,
 *   totalRealizedPnL: number,
 *   totalRealizedCostBasis: number,
 *   totalRealizedRevenue: number,
 *   overallROI: number,
 *   remainingInventoryUSDT: number,
 *   inventoryCostBasisNGN: number,
 *   avgHoldingCostPerUSDT: number,
 *   totalUnmatchedSoldUSDT: number
 * }}
 */
export function calculateFIFOInventoryAndPnL(trades = [], openingInventory = { startingUsdtBalance: 0, defaultCostBasis: 0 }) {
  // Sort chronologically (oldest first)
  const sortedTrades = [...trades].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // FIFO Buy Lots Queue: array of { lotId, date, originalQty, remainingQty, effectiveCostPerUnit, source }
  const buyQueue = [];

  // Seed opening inventory if configured
  if (openingInventory && Number(openingInventory.startingUsdtBalance) > 0) {
    const openQty = Number(openingInventory.startingUsdtBalance);
    const openCost = Number(openingInventory.defaultCostBasis) || 0;
    buyQueue.push({
      lotId: 'OPENING_BALANCE',
      date: new Date(0).toISOString(),
      originalQty: openQty,
      remainingQty: openQty,
      effectiveCostPerUnit: openCost,
      source: 'Opening Inventory'
    });
  }

  let totalRealizedPnL = 0;
  let totalRealizedCostBasis = 0;
  let totalRealizedRevenue = 0;
  let totalUnmatchedSoldUSDT = 0;

  const enrichedTrades = sortedTrades.map(trade => {
    const usdt = Number(trade.usdtAmount) || 0;
    const ngn = Number(trade.ngnAmount) || 0;
    const fees = Number(trade.totalFees) || 0;

    if (trade.type === 'BUY') {
      // Net buy cost including all purchase fees
      const totalBuyCost = ngn + fees;
      const effectiveCostPerUnit = usdt > 0 ? (totalBuyCost / usdt) : Number(trade.rate);

      buyQueue.push({
        lotId: trade.id,
        date: trade.date,
        originalQty: usdt,
        remainingQty: usdt,
        effectiveCostPerUnit: effectiveCostPerUnit,
        source: trade.counterparty ? `Buy (${trade.counterparty})` : 'P2P Buy'
      });

      return {
        ...trade,
        costBasis: totalBuyCost,
        realizedPnL: null, // Buys do not realize P&L
        roiPercent: null,
        matchedLots: [],
        unmatchedQty: 0
      };
    } 
    
    else if (trade.type === 'SELL') {
      let qtyToMatch = usdt;
      let matchedCostBasis = 0;
      let matchedLots = [];
      let unmatchedQty = 0;

      // Net sell revenue received after deducting fees
      const netSellRevenue = Math.max(0, ngn - fees);
      const netSellRatePerUnit = usdt > 0 ? (netSellRevenue / usdt) : Number(trade.rate);

      // Consume lots from FIFO queue
      while (qtyToMatch > 0 && buyQueue.length > 0) {
        const oldestLot = buyQueue[0];
        const takeQty = Math.min(qtyToMatch, oldestLot.remainingQty);

        const lotCost = takeQty * oldestLot.effectiveCostPerUnit;
        matchedCostBasis += lotCost;

        matchedLots.push({
          lotId: oldestLot.lotId,
          qty: takeQty,
          buyRate: oldestLot.effectiveCostPerUnit,
          source: oldestLot.source,
          lotCost: lotCost
        });

        oldestLot.remainingQty -= takeQty;
        qtyToMatch -= takeQty;

        if (oldestLot.remainingQty <= 0.000001) {
          buyQueue.shift(); // Lot fully consumed
        }
      }

      // Handle extra/unmatched quantity (sold more than recorded in buy lots)
      if (qtyToMatch > 0.000001) {
        unmatchedQty = qtyToMatch;
        totalUnmatchedSoldUSDT += unmatchedQty;

        // For unmatched quantity, assign cost basis = sell revenue (0 profit)
        // so that unrecorded external inventory does not artificially inflate profit
        const unmatchedCost = unmatchedQty * netSellRatePerUnit;
        matchedCostBasis += unmatchedCost;

        matchedLots.push({
          lotId: 'UNMATCHED_EXTERNAL',
          qty: unmatchedQty,
          buyRate: netSellRatePerUnit,
          source: 'External / Unrecorded Inventory',
          lotCost: unmatchedCost,
          isUnmatched: true
        });
      }

      // Trade Realized P&L = Net Revenue - Matched Cost Basis
      const tradeRealizedPnL = netSellRevenue - matchedCostBasis;
      const matchedOnlyCost = matchedCostBasis - (unmatchedQty * netSellRatePerUnit);
      const matchedRevenue = netSellRevenue - (unmatchedQty * netSellRatePerUnit);
      const roiPercent = matchedOnlyCost > 0 ? ((tradeRealizedPnL / matchedOnlyCost) * 100) : 0;

      totalRealizedPnL += tradeRealizedPnL;
      totalRealizedCostBasis += matchedCostBasis;
      totalRealizedRevenue += netSellRevenue;

      return {
        ...trade,
        costBasis: matchedCostBasis,
        realizedPnL: tradeRealizedPnL,
        roiPercent: roiPercent,
        matchedLots,
        unmatchedQty
      };
    }

    return trade;
  });

  // Calculate remaining unsold inventory in stock
  let remainingInventoryUSDT = 0;
  let inventoryCostBasisNGN = 0;

  buyQueue.forEach(lot => {
    if (lot.remainingQty > 0.000001) {
      remainingInventoryUSDT += lot.remainingQty;
      inventoryCostBasisNGN += (lot.remainingQty * lot.effectiveCostPerUnit);
    }
  });

  const avgHoldingCostPerUSDT = remainingInventoryUSDT > 0 
    ? (inventoryCostBasisNGN / remainingInventoryUSDT) 
    : 0;

  const overallROI = totalRealizedCostBasis > 0 
    ? ((totalRealizedPnL / totalRealizedCostBasis) * 100) 
    : 0;

  return {
    enrichedTrades,
    totalRealizedPnL,
    totalRealizedCostBasis,
    totalRealizedRevenue,
    overallROI,
    remainingInventoryUSDT,
    inventoryCostBasisNGN,
    avgHoldingCostPerUSDT,
    totalUnmatchedSoldUSDT
  };
}

/**
 * Escape HTML to prevent XSS in rendering
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
