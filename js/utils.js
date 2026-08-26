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

/**
 * Aggregate total cash balance across all bank accounts from computed bank balances.
 * Supports Map (from store.getComputedBankBalances()), Array, or Object/Record.
 * Correctly handles negative overdraft balances, null/undefined entries, and strings.
 * 
 * @param {Map<string, Object>|Array<Object>|Object|null|undefined} computedBankBalances
 * @returns {number} Total bank cash in NGN
 */
export function calculateTotalBankCash(computedBankBalances) {
  if (!computedBankBalances) return 0;

  let total = 0;

  if (computedBankBalances instanceof Map) {
    for (const record of computedBankBalances.values()) {
      if (record && typeof record === 'object') {
        const rawBal = record.currentBalance !== undefined ? record.currentBalance : record.balance;
        const bal = Number(rawBal);
        if (!isNaN(bal) && isFinite(bal)) {
          total += bal;
        }
      } else if (typeof record === 'number' && !isNaN(record) && isFinite(record)) {
        total += record;
      }
    }
  } else if (Array.isArray(computedBankBalances)) {
    for (const item of computedBankBalances) {
      if (item && typeof item === 'object') {
        const rawBal = item.currentBalance !== undefined ? item.currentBalance : item.balance;
        const bal = Number(rawBal);
        if (!isNaN(bal) && isFinite(bal)) {
          total += bal;
        }
      } else if (typeof item === 'number' && !isNaN(item) && isFinite(item)) {
        total += item;
      }
    }
  } else if (typeof computedBankBalances === 'object') {
    for (const record of Object.values(computedBankBalances)) {
      if (record && typeof record === 'object') {
        const rawBal = record.currentBalance !== undefined ? record.currentBalance : record.balance;
        const bal = Number(rawBal);
        if (!isNaN(bal) && isFinite(bal)) {
          total += bal;
        }
      } else if (typeof record === 'number' && !isNaN(record) && isFinite(record)) {
        total += record;
      }
    }
  }

  return total;
}

/**
 * Resolve authoritative reference exchange rate (NGN/USDT) by priority hierarchy.
 * Priority:
 *   1. Active Sell Ad price (status 10/20/2, side 1 / sell)
 *   2. Latest Trade rate (chronologically latest trade with rate > 0)
 *   3. FIFO avg buy cost (> 0)
 *   4. Opening default cost basis (> 0)
 *   5. Fallback rate (> 0, defaults to 1500.00)
 * 
 * @param {Object} [options={}]
 * @param {Object|number|null} [options.activeSellAd] - Active Sell Ad object or numeric price
 * @param {Object|Array|number|null} [options.latestTrade] - Latest trade object, trades array, or numeric rate
 * @param {number|null} [options.fifoAvgBuyCost] - FIFO holding cost per USDT
 * @param {number|null} [options.openingDefaultRate] - Opening inventory default cost basis
 * @param {Object|null} [options.openingInventory] - Opening inventory object with defaultCostBasis
 * @param {number} [options.fallbackRate=1500.00] - Fallback rate
 * @returns {number} Resolved exchange rate in NGN per USDT
 */
export function resolveReferenceRate(options = {}) {
  if (!options || typeof options !== 'object') {
    return 1500.00;
  }

  // 1. Active Sell Ad price
  if (options.activeSellAd) {
    let adPrice = null;
    if (typeof options.activeSellAd === 'object') {
      const side = options.activeSellAd.side;
      const status = options.activeSellAd.status;
      // side: 1 or '1' is SELL in Bybit P2P; status: 10 (ONLINE), 20, 2 (ACTIVE)
      const isSellSide = side === undefined || side === null || Number(side) === 1;
      const isActiveStatus = status === undefined || status === null || [10, 20, 2].includes(Number(status));

      if (isSellSide && isActiveStatus && options.activeSellAd.price !== undefined) {
        adPrice = parseFloat(options.activeSellAd.price);
      }
    } else if (typeof options.activeSellAd === 'number' || typeof options.activeSellAd === 'string') {
      adPrice = parseFloat(options.activeSellAd);
    }

    if (adPrice !== null && !isNaN(adPrice) && isFinite(adPrice) && adPrice > 0) {
      return adPrice;
    }
  }

  // 2. Latest Trade rate
  if (options.latestTrade) {
    let tradeRate = null;
    if (Array.isArray(options.latestTrade)) {
      if (options.latestTrade.length > 0) {
        const sorted = [...options.latestTrade].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
        const latest = sorted[0];
        const raw = latest?.rate !== undefined ? latest.rate : latest?.price;
        tradeRate = parseFloat(raw);
      }
    } else if (typeof options.latestTrade === 'object') {
      const raw = options.latestTrade.rate !== undefined ? options.latestTrade.rate : options.latestTrade.price;
      tradeRate = parseFloat(raw);
    } else if (typeof options.latestTrade === 'number' || typeof options.latestTrade === 'string') {
      tradeRate = parseFloat(options.latestTrade);
    }

    if (tradeRate !== null && !isNaN(tradeRate) && isFinite(tradeRate) && tradeRate > 0) {
      return tradeRate;
    }
  }

  // 3. FIFO Average Buy Cost
  if (options.fifoAvgBuyCost !== undefined && options.fifoAvgBuyCost !== null) {
    const fifoCost = parseFloat(options.fifoAvgBuyCost);
    if (!isNaN(fifoCost) && isFinite(fifoCost) && fifoCost > 0) {
      return fifoCost;
    }
  }

  // 4. Opening Inventory Default Cost Basis
  let openingRate = options.openingDefaultRate;
  if (openingRate === undefined && options.openingInventory) {
    openingRate = options.openingInventory.defaultCostBasis;
  }
  if (openingRate !== undefined && openingRate !== null) {
    const openCost = parseFloat(openingRate);
    if (!isNaN(openCost) && isFinite(openCost) && openCost > 0) {
      return openCost;
    }
  }

  // 5. Fallback rate
  if (options.fallbackRate !== undefined && options.fallbackRate !== null) {
    const fb = parseFloat(options.fallbackRate);
    if (!isNaN(fb) && isFinite(fb) && fb > 0) {
      return fb;
    }
  }

  return 1500.00;
}

/**
 * Calculate Net Worth in both NGN and USDT base valuations.
 * Formulas:
 *   NW_NGN = Total Bank Cash NGN + (Total USDT * Reference Rate)
 *   NW_USDT = Total USDT + (Total Bank Cash NGN / Reference Rate)
 * 
 * @param {number} totalBankCashNgn - Liquid cash across bank accounts
 * @param {number} totalUsdt - Total USDT balance (funding + active ads)
 * @param {number} referenceRate - Reference exchange rate in NGN per USDT
 * @returns {{ netWorthNgn: number, netWorthUsdt: number, bankCashNgn: number, totalUsdt: number, referenceRate: number }}
 */
export function calculateNetWorth(totalBankCashNgn, totalUsdt, referenceRate) {
  const bankCash = Number(totalBankCashNgn) || 0;
  const usdt = Number(totalUsdt) || 0;
  const rate = Number(referenceRate) || 0;

  if (rate <= 0 || !isFinite(rate)) {
    return {
      netWorthNgn: Math.round(bankCash * 100) / 100,
      netWorthUsdt: Math.round(usdt * 100) / 100,
      bankCashNgn: bankCash,
      totalUsdt: usdt,
      referenceRate: rate
    };
  }

  const netWorthNgn = Math.round((bankCash + (usdt * rate)) * 100) / 100;
  const netWorthUsdt = Math.round((usdt + (bankCash / rate)) * 100) / 100;

  return {
    netWorthNgn,
    netWorthUsdt,
    bankCashNgn: bankCash,
    totalUsdt: usdt,
    referenceRate: rate
  };
}

/**
 * Calculate absolute and percentage deltas between current and previous Net Worth.
 * Handles division by zero, null baselines, and negative baselines safely.
 * Returns values rounded to 2 decimal places.
 * 
 * @param {Object|number|null|undefined} current - Current Net Worth object or number
 * @param {Object|number|null|undefined} previous - Previous Net Worth object or number
 * @returns {{ deltaNgn: number, pctDeltaNgn: number, deltaUsdt: number, pctDeltaUsdt: number }}
 */
export function calculateSnapshotDelta(current, previous) {
  if (!current || !previous) {
    return {
      deltaNgn: 0,
      pctDeltaNgn: 0,
      deltaUsdt: 0,
      pctDeltaUsdt: 0
    };
  }

  const currentNgn = Number(current.netWorthNgn !== undefined ? current.netWorthNgn : (typeof current === 'number' ? current : 0)) || 0;
  const currentUsdt = Number(current.netWorthUsdt !== undefined ? current.netWorthUsdt : 0) || 0;
  const prevNgn = Number(previous.netWorthNgn !== undefined ? previous.netWorthNgn : (typeof previous === 'number' ? previous : 0)) || 0;
  const prevUsdt = Number(previous.netWorthUsdt !== undefined ? previous.netWorthUsdt : 0) || 0;

  const deltaNgn = currentNgn - prevNgn;
  const deltaUsdt = currentUsdt - prevUsdt;

  const pctDeltaNgn = Math.abs(prevNgn) > 0.000001
    ? (deltaNgn / Math.abs(prevNgn)) * 100
    : 0;

  const pctDeltaUsdt = Math.abs(prevUsdt) > 0.000001
    ? (deltaUsdt / Math.abs(prevUsdt)) * 100
    : 0;

  return {
    deltaNgn: Math.round(deltaNgn * 100) / 100,
    pctDeltaNgn: Math.round(pctDeltaNgn * 100) / 100,
    deltaUsdt: Math.round(deltaUsdt * 100) / 100,
    pctDeltaUsdt: Math.round(pctDeltaUsdt * 100) / 100
  };
}

/**
 * Validate and sanitize a snapshot record prior to storage or import.
 * 
 * @param {Object} snapshotData
 * @returns {{ isValid: boolean, errors: string[], sanitized: Object|null }}
 */
export function validateSnapshot(snapshotData) {
  const errors = [];

  if (!snapshotData || typeof snapshotData !== 'object' || Array.isArray(snapshotData)) {
    return {
      isValid: false,
      errors: ['Snapshot data must be a valid object.'],
      sanitized: null
    };
  }

  // 1. Reference Rate validation
  let rate = 1500.00;
  if (snapshotData.referenceRate !== undefined && snapshotData.referenceRate !== null) {
    rate = Number(snapshotData.referenceRate);
    if (isNaN(rate) || !isFinite(rate) || rate <= 0) {
      errors.push('Reference exchange rate must be a positive number greater than 0.');
    }
  }

  // 2. Timestamp validation
  let timestampIso = snapshotData.timestamp;
  if (!timestampIso) {
    timestampIso = new Date().toISOString();
  } else {
    const d = new Date(timestampIso);
    if (isNaN(d.getTime())) {
      errors.push('Snapshot timestamp must be a valid ISO date string or timestamp.');
    } else {
      timestampIso = d.toISOString();
    }
  }

  // 3. Bank Cash validation
  const rawBankCash = snapshotData.bankCash !== undefined ? snapshotData.bankCash : snapshotData.bankCashNGN;
  let bankCash = 0;
  if (rawBankCash !== undefined && rawBankCash !== null) {
    bankCash = Number(rawBankCash);
    if (isNaN(bankCash) || !isFinite(bankCash)) {
      errors.push('Bank cash balance must be a valid finite number.');
    }
  }

  // 4. USDT Balance validation
  const rawUsdt = snapshotData.usdtBalance !== undefined ? snapshotData.usdtBalance : snapshotData.totalUsdt;
  let usdtBalance = 0;
  if (rawUsdt !== undefined && rawUsdt !== null) {
    usdtBalance = Number(rawUsdt);
    if (isNaN(usdtBalance) || !isFinite(usdtBalance) || usdtBalance < 0) {
      errors.push('USDT balance must be a non-negative finite number.');
    }
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      errors,
      sanitized: null
    };
  }

  // Calculate or verify net worth values
  const { netWorthNgn, netWorthUsdt } = calculateNetWorth(bankCash, usdtBalance, rate);

  const sanitized = {
    id: snapshotData.id || generateId('snp'),
    timestamp: timestampIso,
    bankCash: bankCash,
    usdtBalance: usdtBalance,
    referenceRate: rate,
    netWorthNgn: snapshotData.netWorthNgn !== undefined && !isNaN(Number(snapshotData.netWorthNgn)) ? Number(snapshotData.netWorthNgn) : netWorthNgn,
    netWorthUsdt: snapshotData.netWorthUsdt !== undefined && !isNaN(Number(snapshotData.netWorthUsdt)) ? Number(snapshotData.netWorthUsdt) : netWorthUsdt,
    notes: typeof snapshotData.notes === 'string' ? snapshotData.notes.trim() : '',
    createdAt: typeof snapshotData.createdAt === 'number' && !isNaN(snapshotData.createdAt) ? snapshotData.createdAt : (new Date(timestampIso).getTime() || Date.now())
  };

  return {
    isValid: true,
    errors: [],
    sanitized
  };
}

/**
 * Format delta badge text with explicit sign (+ or -) and 2-decimal percentage.
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

