/**
 * Bybit NGN P2P Trade Tracker — Pricing & Arbitrage Engine
 * Pure mathematical functions for P2P orderbook analysis, reference rates,
 * competitor filtering, and spread optimization.
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
 * Calculate Buy Ad pricing recommendation and safety status
 * @param {Object} params
 * @param {Array<Object>} params.activeBuyAds - Active buy competitor ads
 * @param {Array<Object>} params.sortedSellAds - Sorted sell competitor ads (cheapest first)
 * @param {number} params.targetSpread - Target spread in NGN per USDT
 * @param {number} params.inflowFee - Fintech inflow fee in NGN
 * @param {number} params.avgVolume - Target trade volume in USDT
 * @param {string} params.pricingMode - Pricing calculation mode
 * @returns {Object} Buy pricing analysis result
 */
export function calculateBuyPricing({
  activeBuyAds = [],
  sortedSellAds = [],
  targetSpread = 5.0,
  inflowFee = 50.0,
  avgVolume = 100.0,
  pricingMode = 'avg-10'
} = {}) {
  const validSellAds = Array.isArray(sortedSellAds) ? sortedSellAds.filter(ad => ad && typeof ad === 'object') : [];
  const topSellCompetitor = validSellAds[0];
  const exitPrice = topSellCompetitor ? (parseFloat(topSellCompetitor.price) || 0) : 0;
  const referenceBuyPrice = calculateReferencePrice(activeBuyAds, pricingMode);
  const safeAvgVol = (!avgVolume || isNaN(avgVolume) || avgVolume <= 0) ? 100 : avgVolume;

  if (exitPrice <= 0) {
    return {
      exitPrice: 0,
      referenceBuyPrice,
      maxBuyPrice: 0,
      rawSuggestedBuy: 0,
      suggestedBuy: 0,
      isSafe: false,
      excessSpread: 0,
      isOffline: true
    };
  }

  // Max Buy limit to protect target spread: Exit Price - targetSpread - (Inflow Fee / Vol)
  const maxBuyPrice = exitPrice - targetSpread - (inflowFee / safeAvgVol);

  // Suggested Buy Price: outbid the reference price by +0.10 NGN
  const rawSuggestedBuy = referenceBuyPrice > 0 ? (referenceBuyPrice + 0.10) : maxBuyPrice;

  // Cap at maxBuyPrice to protect target spread
  const suggestedBuy = Math.min(rawSuggestedBuy, maxBuyPrice);
  const isSafe = rawSuggestedBuy <= maxBuyPrice;
  const excessSpread = exitPrice - suggestedBuy - (inflowFee / safeAvgVol);

  return {
    exitPrice,
    referenceBuyPrice,
    maxBuyPrice,
    rawSuggestedBuy,
    suggestedBuy,
    isSafe,
    excessSpread,
    isOffline: false
  };
}

/**
 * Calculate Sell Ad pricing recommendation and safety status
 * @param {Object} params
 * @param {Array<Object>} params.activeSellAds - Active sell competitor ads (cheapest first)
 * @param {number} params.costBasis - FIFO holding cost basis in NGN per USDT
 * @param {number} params.targetSpread - Target spread in NGN per USDT
 * @param {number} params.outflowFee - Fintech outflow fee in NGN
 * @param {number} params.avgVolume - Target trade volume in USDT
 * @param {string} params.pricingMode - Pricing calculation mode
 * @returns {Object} Sell pricing analysis result
 */
export function calculateSellPricing({
  activeSellAds = [],
  costBasis = 0,
  targetSpread = 5.0,
  outflowFee = 50.0,
  avgVolume = 100.0,
  pricingMode = 'avg-10'
} = {}) {
  const referenceSellPrice = calculateReferencePrice(activeSellAds, pricingMode);
  const safeAvgVol = (!avgVolume || isNaN(avgVolume) || avgVolume <= 0) ? 100 : avgVolume;

  if (costBasis <= 0) {
    return {
      referenceSellPrice,
      breakEven: 0,
      targetSellPrice: 0,
      rawSuggestedSell: 0,
      suggestedSell: 0,
      isSafe: false,
      sellSpread: 0,
      hasCostBasis: false,
      hasCompetitors: referenceSellPrice > 0
    };
  }

  // Break-even sell price = average cost + (outflow fee / vol)
  const breakEven = costBasis + (outflowFee / safeAvgVol);

  // Target Sell price = cost + targetSpread + (outflow fee / vol)
  const targetSellPrice = costBasis + targetSpread + (outflowFee / safeAvgVol);

  if (referenceSellPrice <= 0) {
    return {
      referenceSellPrice: 0,
      breakEven,
      targetSellPrice,
      rawSuggestedSell: 0,
      suggestedSell: 0,
      isSafe: false,
      sellSpread: 0,
      hasCostBasis: true,
      hasCompetitors: false
    };
  }

  // Suggested Sell price: undercut the reference price by -0.10 NGN
  const rawSuggestedSell = referenceSellPrice - 0.10;

  // Floor at targetSellPrice to guarantee target spread is met
  const suggestedSell = Math.max(rawSuggestedSell, targetSellPrice);
  const isSafe = rawSuggestedSell >= targetSellPrice;
  const sellSpread = suggestedSell - costBasis - (outflowFee / safeAvgVol);

  return {
    referenceSellPrice,
    breakEven,
    targetSellPrice,
    rawSuggestedSell,
    suggestedSell,
    isSafe,
    sellSpread,
    hasCostBasis: true,
    hasCompetitors: true
  };
}
