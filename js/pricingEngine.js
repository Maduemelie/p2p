/**
 * Bybit NGN P2P Trade Tracker — Pricing & Arbitrage Engine
 * Pure mathematical functions for P2P orderbook analysis, reference rates,
 * competitor filtering, Bybit maker fee (0.3%), fiat transfer fees, and limit optimization.
 */

/**
 * Filter competitor advertisements by minimum dust threshold and transaction limit bounds
 * @param {Array<Object>} ads - Raw advertisement items
 * @param {number} avgVolume - Target trade volume in USDT
 * @param {boolean} filterLimits - Whether to enforce minimum/maximum transaction limits
 * @returns {Array<Object>} Filtered advertisement list
 */
export function filterCompetitorAds(ads = [], avgVolume = 100, filterLimits = true) {
  if (!Array.isArray(ads)) return [];

  const safeAvgVol = (!avgVolume || isNaN(avgVolume) || avgVolume <= 0) ? 100 : avgVolume;

  return ads.filter(ad => {
    if (!ad || typeof ad !== 'object') return false;
    const price = parseFloat(ad.price) || 0;
    const qty = parseFloat(ad.lastQuantity) || 0;
    const minLmt = parseFloat(ad.minAmount || ad.minSingleTransAmount) || 0;
    const maxLmt = parseFloat(ad.maxAmount || ad.maxSingleTransAmount) || 0;

    // Dust filter: ignore ads with less than 2 USDT or 5% of target volume
    const minQty = Math.max(2, safeAvgVol * 0.05);
    if (qty < minQty) return false;

    // Limit filter
    if (filterLimits) {
      const tradeAmount = safeAvgVol * price;
      if (minLmt > 0 && tradeAmount < minLmt) return false;
      if (maxLmt > 0 && tradeAmount > maxLmt) return false;
    }

    return true;
  });
}

/**
 * Calculate benchmark reference price from competitor advertisements based on pricing strategy
 * @param {Array<Object>} ads - Sorted advertisement items
 * @param {string} pricingMode - Strategy ('competitor', 'avg-5', 'avg-10', 'avg-20', 'vwap-5', 'vwap-10', 'vwap-20')
 * @returns {number} Computed reference price in NGN
 */
export function calculateReferencePrice(ads = [], pricingMode = 'avg-10') {
  if (!Array.isArray(ads) || ads.length === 0) {
    return 0;
  }

  const validAds = ads.filter(ad => ad && typeof ad === 'object');
  if (validAds.length === 0) return 0;

  if (pricingMode === 'competitor') {
    return parseFloat(validAds[0].price) || 0;
  }

  const parts = (pricingMode || '').split('-');
  const type = parts[0];
  const n = parseInt(parts[1], 10) || 10;
  const subset = validAds.slice(0, n);

  if (subset.length === 0) return 0;

  if (type === 'avg') {
    const sum = subset.reduce((acc, ad) => acc + (parseFloat(ad.price) || 0), 0);
    return sum / subset.length;
  } else if (type === 'vwap') {
    let totalVal = 0;
    let totalQty = 0;
    subset.forEach(ad => {
      const p = parseFloat(ad.price) || 0;
      const q = parseFloat(ad.lastQuantity) || 0;
      totalVal += p * q;
      totalQty += q;
    });
    return totalQty > 0 ? (totalVal / totalQty) : (parseFloat(subset[0].price) || 0);
  }

  return parseFloat(validAds[0].price) || 0;
}

/**
 * Helper to normalize platform fee percentage into a fraction rate (e.g. 0.3% -> 0.003)
 * @param {number} platformFeePct
 * @returns {number}
 */
function normalizeFeeRate(platformFeePct) {
  if (platformFeePct === undefined || platformFeePct === null || isNaN(platformFeePct)) {
    return 0;
  }
  const raw = Number(platformFeePct);
  if (raw <= 0) return 0;
  // If passed as 0.3 (meaning 0.3%), divide by 100 to get 0.003
  // If passed as 0.003 (already fraction), keep as 0.003
  if (raw >= 1) return raw / 100;
  if (raw > 0.05) return raw / 100;
  return raw;
}

/**
 * Calculate Buy Ad pricing recommendation and safety status
 * Incorporates Bybit Maker platform fee (default 0.3%) and fiat inflow/outflow transfer fees.
 * 
 * @param {Object} params
 * @param {Array<Object>} params.activeBuyAds - Active buy competitor ads
 * @param {Array<Object>} params.sortedSellAds - Sorted sell competitor ads (cheapest first)
 * @param {number} [params.targetSpread=5.0] - Target spread in NGN per USDT
 * @param {number} [params.inflowFee=50.0] - Fiat inflow transfer fee in NGN
 * @param {number} [params.outflowFee=0] - Fiat outflow transfer fee in NGN
 * @param {number} [params.platformFeePct=0] - Platform maker fee percentage (e.g. 0.3 for 0.3%)
 * @param {number} [params.avgVolume=100.0] - Target trade volume in USDT
 * @param {string} [params.pricingMode='avg-10'] - Pricing calculation mode
 * @returns {Object} Buy pricing analysis result
 */
export function calculateBuyPricing({
  activeBuyAds = [],
  sortedSellAds = [],
  targetSpread = 5.0,
  inflowFee = 50.0,
  outflowFee = 0,
  platformFeePct = 0,
  avgVolume = 100.0,
  pricingMode = 'avg-10'
} = {}) {
  const validSellAds = Array.isArray(sortedSellAds) ? sortedSellAds.filter(ad => ad && typeof ad === 'object') : [];
  const topSellCompetitor = validSellAds[0];
  const exitPrice = topSellCompetitor ? (parseFloat(topSellCompetitor.price) || 0) : 0;
  const referenceBuyPrice = calculateReferencePrice(activeBuyAds, pricingMode);
  const safeAvgVol = (!avgVolume || isNaN(avgVolume) || avgVolume <= 0) ? 100 : avgVolume;
  const safeInflowFee = (inflowFee !== undefined && !isNaN(Number(inflowFee))) ? Number(inflowFee) : 50.0;
  const safeOutflowFee = (outflowFee !== undefined && !isNaN(Number(outflowFee))) ? Number(outflowFee) : 0;
  const safeTargetSpread = (targetSpread !== undefined && !isNaN(Number(targetSpread))) ? Number(targetSpread) : 5.0;
  const phi = normalizeFeeRate(platformFeePct);
  const divisor = Math.max(0.0001, 1 - phi);

  if (exitPrice <= 0) {
    return {
      exitPrice: 0,
      referenceBuyPrice,
      targetSpread: safeTargetSpread,
      effectiveSpread: 0,
      excessSpread: 0,
      maxBuyPrice: 0,
      rawSuggestedBuy: 0,
      suggestedBuy: 0,
      isSafe: false,
      isCompetitorUndercut: false,
      status: 'OFFLINE',
      feePerUnit: 0,
      feeBreakdown: {
        platformFeePerUnit: 0,
        fiatFeePerUnit: 0,
        inflowFeePerUnit: 0,
        outflowFeePerUnit: 0,
        totalFeePerUnit: 0,
        effectiveCostBasis: 0
      },
      isOffline: true
    };
  }

  // Net Exit Revenue received after sell maker fee and outflow fiat fee
  const netExitRevenue = (exitPrice * (1 - phi)) - (safeOutflowFee / safeAvgVol);

  // Maximum Buy Price to guarantee targetSpread net profit:
  // netExitRevenue - [ maxBuyPrice / (1 - phi) + (inflowFee / safeAvgVol) ] = targetSpread
  // maxBuyPrice = (1 - phi) * [ netExitRevenue - targetSpread - (inflowFee / safeAvgVol) ]
  const maxBuyPrice = (1 - phi) * (netExitRevenue - safeTargetSpread - (safeInflowFee / safeAvgVol));

  // Suggested Buy Price: outbid the reference price by +0.10 NGN
  const rawSuggestedBuy = referenceBuyPrice > 0 ? (referenceBuyPrice + 0.10) : maxBuyPrice;

  // Cap at maxBuyPrice to protect target spread
  const suggestedBuy = Math.min(rawSuggestedBuy, maxBuyPrice);
  const isSafe = rawSuggestedBuy <= maxBuyPrice;

  // Effective buy cost basis and realized net excess spread per USDT
  const effectiveCostBasis = (suggestedBuy / divisor) + (safeInflowFee / safeAvgVol);
  const effectiveSpread = netExitRevenue - effectiveCostBasis;
  const excessSpread = effectiveSpread;

  // Fee Breakdown per unit volume
  const platformFeePerUnit = suggestedBuy * phi;
  const fiatFeePerUnit = (safeInflowFee + safeOutflowFee) / safeAvgVol;
  const totalFeePerUnit = platformFeePerUnit + (safeInflowFee / safeAvgVol);

  return {
    exitPrice,
    referenceBuyPrice,
    targetSpread: safeTargetSpread,
    effectiveSpread,
    excessSpread,
    maxBuyPrice,
    rawSuggestedBuy,
    suggestedBuy,
    isSafe,
    isCompetitorUndercut: !isSafe,
    status: isSafe ? 'SAFE' : 'COMPRESSED',
    feePerUnit: totalFeePerUnit,
    feeBreakdown: {
      platformFeePerUnit,
      fiatFeePerUnit,
      inflowFeePerUnit: safeInflowFee / safeAvgVol,
      outflowFeePerUnit: safeOutflowFee / safeAvgVol,
      totalFeePerUnit,
      roundTripFeePerUnit: platformFeePerUnit + (exitPrice * phi) + fiatFeePerUnit,
      effectiveCostBasis
    },
    isOffline: false
  };
}

/**
 * Calculate Sell Ad pricing recommendation and safety status
 * Incorporates Bybit Maker platform fee (default 0.3%) and fiat outflow transfer fee.
 * 
 * @param {Object} params
 * @param {Array<Object>} params.activeSellAds - Active sell competitor ads (cheapest first)
 * @param {number} params.costBasis - FIFO holding cost basis in NGN per USDT
 * @param {number} [params.targetSpread=5.0] - Target spread in NGN per USDT
 * @param {number} [params.outflowFee=50.0] - Fiat outflow transfer fee in NGN
 * @param {number} [params.platformFeePct=0] - Platform maker fee percentage (e.g. 0.3 for 0.3%)
 * @param {number} [params.avgVolume=100.0] - Target trade volume in USDT
 * @param {string} [params.pricingMode='avg-10'] - Pricing calculation mode
 * @returns {Object} Sell pricing analysis result
 */
export function calculateSellPricing({
  activeSellAds = [],
  costBasis = 0,
  targetSpread = 5.0,
  outflowFee = 50.0,
  platformFeePct = 0,
  avgVolume = 100.0,
  pricingMode = 'avg-10'
} = {}) {
  const referenceSellPrice = calculateReferencePrice(activeSellAds, pricingMode);
  const safeAvgVol = (!avgVolume || isNaN(avgVolume) || avgVolume <= 0) ? 100 : avgVolume;
  const safeOutflowFee = (outflowFee !== undefined && !isNaN(Number(outflowFee))) ? Number(outflowFee) : 50.0;
  const safeTargetSpread = (targetSpread !== undefined && !isNaN(Number(targetSpread))) ? Number(targetSpread) : 5.0;
  const phi = normalizeFeeRate(platformFeePct);
  const divisor = Math.max(0.0001, 1 - phi);

  if (costBasis <= 0) {
    return {
      referenceSellPrice,
      costBasis: 0,
      targetSpread: safeTargetSpread,
      breakEven: 0,
      targetSellPrice: 0,
      rawSuggestedSell: 0,
      suggestedSell: 0,
      isSafe: false,
      isCompetitorUndercut: false,
      status: 'NO_COST_BASIS',
      sellSpread: 0,
      feePerUnit: 0,
      feeBreakdown: {
        platformFeePerUnit: 0,
        fiatFeePerUnit: 0,
        totalFeePerUnit: 0,
        netRealizedRevenue: 0
      },
      hasCostBasis: false,
      hasCompetitors: referenceSellPrice > 0
    };
  }

  // Break-even sell price = (costBasis + outflowFee / vol) / (1 - phi)
  const breakEven = (costBasis + (safeOutflowFee / safeAvgVol)) / divisor;

  // Target Sell price = (costBasis + targetSpread + outflowFee / vol) / (1 - phi)
  const targetSellPrice = (costBasis + safeTargetSpread + (safeOutflowFee / safeAvgVol)) / divisor;

  if (referenceSellPrice <= 0) {
    return {
      referenceSellPrice: 0,
      costBasis,
      targetSpread: safeTargetSpread,
      breakEven,
      targetSellPrice,
      rawSuggestedSell: 0,
      suggestedSell: 0,
      isSafe: false,
      isCompetitorUndercut: false,
      status: 'NO_COMPETITORS',
      sellSpread: 0,
      feePerUnit: 0,
      feeBreakdown: {
        platformFeePerUnit: 0,
        fiatFeePerUnit: safeOutflowFee / safeAvgVol,
        totalFeePerUnit: safeOutflowFee / safeAvgVol,
        netRealizedRevenue: 0
      },
      hasCostBasis: true,
      hasCompetitors: false
    };
  }

  // Suggested Sell price: undercut the reference price by -0.10 NGN
  const rawSuggestedSell = referenceSellPrice - 0.10;

  // Floor at targetSellPrice to guarantee target spread is met
  const suggestedSell = Math.max(rawSuggestedSell, targetSellPrice);
  const isSafe = rawSuggestedSell >= targetSellPrice;

  // Realized net revenue and spread at suggestedSell
  const netRealizedRevenue = (suggestedSell * (1 - phi)) - (safeOutflowFee / safeAvgVol);
  const sellSpread = netRealizedRevenue - costBasis;

  // Fee Breakdown
  const platformFeePerUnit = suggestedSell * phi;
  const fiatFeePerUnit = safeOutflowFee / safeAvgVol;
  const totalFeePerUnit = platformFeePerUnit + fiatFeePerUnit;

  return {
    referenceSellPrice,
    costBasis,
    targetSpread: safeTargetSpread,
    breakEven,
    targetSellPrice,
    rawSuggestedSell,
    suggestedSell,
    isSafe,
    isCompetitorUndercut: !isSafe,
    status: isSafe ? 'SAFE' : 'COMPRESSED',
    sellSpread,
    feePerUnit: totalFeePerUnit,
    feeBreakdown: {
      platformFeePerUnit,
      fiatFeePerUnit,
      totalFeePerUnit,
      netRealizedRevenue
    },
    hasCostBasis: true,
    hasCompetitors: true
  };
}

/**
 * Calculate recommended minimum order transaction limits to prevent fixed fiat fee margin drag.
 * 
 * @param {number|Object} priceOrOptions - Price in NGN/USDT or options object
 * @param {number} [targetSpread=5.0] - Target spread in NGN per USDT
 * @param {number} [fiatFee=50.0] - Fixed fiat transfer fee in NGN
 * @param {Object} [options={}] - Additional options { maxFeeDragRatio, platformFeePct }
 * @returns {{
 *   minFiatLimit: number,
 *   minUsdtLimit: number,
 *   minVolumeUsdt: number,
 *   minLimitNgn: number,
 *   breakEvenFiatLimit: number,
 *   breakEvenUsdtLimit: number,
 *   feeDragRatio: number,
 *   feeDragPercent: number,
 *   feeDragPerUnit: number,
 *   recommendedText: string
 * }}
 */
export function calculateRecommendedLimits(priceOrOptions = 1500.0, targetSpread = 5.0, fiatFee = 50.0, options = {}) {
  let price = 1500.0;
  let spread = 5.0;
  let fee = 50.0;
  let maxFeeDragRatio = 0.20; // Default 20% max drag
  let platformFeePct = 0.3;

  if (typeof priceOrOptions === 'object' && priceOrOptions !== null) {
    price = (priceOrOptions.price !== undefined && !isNaN(Number(priceOrOptions.price))) ? Number(priceOrOptions.price) : 1500.0;
    spread = (priceOrOptions.targetSpread !== undefined && !isNaN(Number(priceOrOptions.targetSpread))) ? Number(priceOrOptions.targetSpread) : 5.0;
    
    const rawFee = priceOrOptions.fiatFee !== undefined 
      ? priceOrOptions.fiatFee 
      : (priceOrOptions.inflowFee !== undefined ? priceOrOptions.inflowFee : priceOrOptions.outflowFee);
    fee = (rawFee !== undefined && !isNaN(Number(rawFee))) ? Number(rawFee) : 50.0;
    
    maxFeeDragRatio = (priceOrOptions.maxFeeDragRatio !== undefined && !isNaN(Number(priceOrOptions.maxFeeDragRatio))) ? Number(priceOrOptions.maxFeeDragRatio) : 0.20;
    platformFeePct = priceOrOptions.platformFeePct !== undefined ? priceOrOptions.platformFeePct : 0.3;
  } else {
    price = (priceOrOptions !== undefined && !isNaN(Number(priceOrOptions))) ? Number(priceOrOptions) : 1500.0;
    spread = (targetSpread !== undefined && !isNaN(Number(targetSpread))) ? Number(targetSpread) : 5.0;
    fee = (fiatFee !== undefined && !isNaN(Number(fiatFee))) ? Number(fiatFee) : 50.0;
    if (options && typeof options === 'object') {
      if (options.maxFeeDragRatio !== undefined && !isNaN(Number(options.maxFeeDragRatio))) {
        maxFeeDragRatio = Number(options.maxFeeDragRatio);
      }
      if (options.platformFeePct !== undefined) platformFeePct = options.platformFeePct;
    }
  }

  const safePrice = price > 0 ? price : 1500.0;
  const safeSpread = spread > 0 ? spread : 5.0;
  const safeFee = fee >= 0 ? fee : 50.0;
  const safeDragRatio = (maxFeeDragRatio > 0 && maxFeeDragRatio <= 1) ? maxFeeDragRatio : 0.20;

  // Maximum allowable fixed fee drag per USDT unit
  const maxFeePerUnit = safeSpread * safeDragRatio;

  // Minimum volume to ensure fee / minVol <= maxFeePerUnit
  const minVol = (maxFeePerUnit > 0 && safeFee > 0) ? (safeFee / maxFeePerUnit) : 0;
  const minUsdtLimit = Math.max(2.0, Math.round(minVol * 100) / 100);
  const minFiatLimit = Math.round(minUsdtLimit * safePrice);

  // Break-even volume where fee consumes 100% of target spread
  const breakEvenVol = (safeSpread > 0 && safeFee > 0) ? (safeFee / safeSpread) : 0;
  const breakEvenUsdtLimit = Math.max(2.0, Math.round(breakEvenVol * 100) / 100);
  const breakEvenFiatLimit = Math.round(breakEvenUsdtLimit * safePrice);

  const feeDragPerUnit = minUsdtLimit > 0 ? (safeFee / minUsdtLimit) : 0;
  const feeDragRatio = safeSpread > 0 ? (feeDragPerUnit / safeSpread) : safeDragRatio;
  const feeDragPercent = Math.round(feeDragRatio * 10000) / 100;

  const recommendedText = `Recommended Min Limit: ₦${minFiatLimit.toLocaleString('en-NG')} (${minUsdtLimit.toFixed(2)} USDT) to cap fee drag at ${feeDragPercent.toFixed(0)}%`;

  return {
    minFiatLimit,
    minUsdtLimit,
    minVolumeUsdt: minUsdtLimit,
    minLimitNgn: minFiatLimit,
    breakEvenFiatLimit,
    breakEvenUsdtLimit,
    feeDragRatio,
    feeDragPercent,
    feeDragPerUnit,
    recommendedText
  };
}
