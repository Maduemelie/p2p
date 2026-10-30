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
export function normalizeFeeRate(platformFeePct) {
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
 * Outflow fee is ₦0 and platform fee is 0% on Sell side.
 * 
 * @param {Object} params
 * @param {Array<Object>} params.activeSellAds - Active sell competitor ads (cheapest first)
 * @param {number} params.costBasis - FIFO holding cost basis in NGN per USDT
 * @param {number} [params.targetSpread=5.0] - Target spread in NGN per USDT
 * @param {number} [params.outflowFee=0] - Fiat outflow transfer fee in NGN
 * @param {number} [params.platformFeePct=0] - Platform maker fee percentage (e.g. 0 for Sell side)
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

/**
 * Calculate volume-weighted buyback ranges, live trade progress, and profit spread targets.
 * Generates actionable maker limit tiers anchored to target average buy price and sell market rates.
 *
 * @param {Object} params
 * @param {string} [params.mode='target-driven'] - 'target-driven' | 'market-driven'
 * @param {number} [params.totalVolume=100000] - Total USDT target volume
 * @param {number} [params.targetAvgPrice=1495] - Target Average Buy Price (for target-driven mode)
 * @param {number} [params.marketSellPrice=1502] - Market Sell Price (for market-driven mode or reference)
 * @param {number} [params.profitSpread=7.0] - Target Profit Difference (Delta) in NGN/USDT
 * @param {number} [params.platformFeePct=0.3] - Bybit Maker Fee % on Buy side (default 0.3%)
 * @param {number} [params.inflowFee=50] - Fiat inflow stamp duty fee in NGN
 * @param {Array<Object>} [params.sortedBuyAds=[]] - Sorted competitor buy ads (highest bid first)
 * @param {Array<Object>} [params.sortedSellAds=[]] - Sorted competitor sell ads (lowest ask first)
 * @param {number} [params.boughtVolume=0] - Executed buy volume in USDT
 * @param {number} [params.boughtAvgPrice=0] - Realized average price of executed buy trades
 * @returns {Object} Buyback analysis, progress metrics, tier ladder & market guidance
 */
export function calculateBuybackTiers({
  mode = 'target-driven',
  totalVolume = 100000,
  targetAvgPrice = 1495.0,
  marketSellPrice = 1502.0,
  profitSpread = 7.0,
  platformFeePct = 0.3,
  inflowFee = 50.0,
  sortedBuyAds = [],
  sortedSellAds = [],
  boughtVolume = 0,
  boughtAvgPrice = 0
} = {}) {
  const safeVol = (!totalVolume || isNaN(totalVolume) || totalVolume <= 0) ? 100000 : Number(totalVolume);
  const safeSpread = (!profitSpread || isNaN(profitSpread) || profitSpread <= 0) ? 7.0 : Number(profitSpread);
  const safeInflowFee = (inflowFee !== undefined && !isNaN(Number(inflowFee))) ? Number(inflowFee) : 50.0;
  const phi = normalizeFeeRate(platformFeePct);
  const divisor = Math.max(0.0001, 1 - phi);

  let calculatedAvgBuyPrice = 0;
  let calculatedSellPrice = 0;
  let maxAllowableAvgBuyPrice = 0;

  if (mode === 'market-driven') {
    const safeMarketSell = (!marketSellPrice || isNaN(marketSellPrice) || marketSellPrice <= 0) ? 1502.0 : Number(marketSellPrice);
    calculatedSellPrice = safeMarketSell;
    maxAllowableAvgBuyPrice = safeMarketSell - safeSpread;
    calculatedAvgBuyPrice = maxAllowableAvgBuyPrice;
  } else if (mode === 'sweet-spot') {
    const sweet = calculateSweetSpotPricing({
      sellDepth: sortedSellAds,
      buyDepth: sortedBuyAds,
      profitTarget: safeSpread,
      cycleVolume: safeVol,
      platformFeePct,
      inflowFee: safeInflowFee,
      boughtVolume,
      boughtAvgPrice
    });
    calculatedSellPrice = sweet.sellSweetSpot;
    calculatedAvgBuyPrice = sweet.maxBuyPrice;
    maxAllowableAvgBuyPrice = sweet.maxBuyPrice;
  } else {
    const safeTargetAvg = (!targetAvgPrice || isNaN(targetAvgPrice) || targetAvgPrice <= 0) ? 1495.0 : Number(targetAvgPrice);
    calculatedAvgBuyPrice = safeTargetAvg;
    maxAllowableAvgBuyPrice = safeTargetAvg;
    calculatedSellPrice = safeTargetAvg + safeSpread;
  }

  // Fees calculation on Buy Side:
  const platformFeePerUnit = calculatedAvgBuyPrice * phi;
  const inflowFeePerUnit = safeInflowFee / safeVol;
  const totalFeePerUnit = platformFeePerUnit + inflowFeePerUnit;
  const effectiveCostBasis = (calculatedAvgBuyPrice / divisor) + inflowFeePerUnit;

  // On Sell Side: 0% Maker Fee, ₦0 Outflow Fee
  const netRealizedProfit = calculatedSellPrice - effectiveCostBasis;
  const grossSpread = calculatedSellPrice - calculatedAvgBuyPrice;

  // Live Trade Progress Calculation
  const safeBoughtVol = Math.max(0, Number(boughtVolume) || 0);
  const safeBoughtAvg = Math.max(0, Number(boughtAvgPrice) || 0);
  const remainingVolume = Math.max(0, safeVol - safeBoughtVol);
  const progressPercent = Math.min(100, Math.round((safeBoughtVol / safeVol) * 1000) / 10);

  // Rate needed for remaining volume to land exact target average across total volume
  let neededRemainingRate = calculatedAvgBuyPrice;
  if (remainingVolume > 0 && safeBoughtVol > 0 && safeBoughtAvg > 0) {
    const totalBudget = safeVol * calculatedAvgBuyPrice;
    const spentBudget = safeBoughtVol * safeBoughtAvg;
    neededRemainingRate = (totalBudget - spentBudget) / remainingVolume;
  }

  // Determine base anchor price for tier ladder
  const baseRate = Math.round(neededRemainingRate * 100) / 100;
  const stepDiscount = Math.max(1.0, Math.round(safeSpread * 0.4 * 100) / 100);

  // 3 Strategic Maker Buy Limit Tiers:
  // Tier 1: Base Target / Competitive Limit (Base Anchor)
  // Tier 2: Mid-Discount Limit (Base - Step)
  // Tier 3: Deep-Discount Limit (Base - 2.5 * Step)
  const p1 = baseRate;
  const p2 = Math.max(1.0, Math.round((baseRate - stepDiscount) * 100) / 100);
  const p3 = Math.max(1.0, Math.round((baseRate - (stepDiscount * 2.5)) * 100) / 100);

  // Volume distribution across remaining volume: 40% Tier 1, 40% Tier 2, 20% Tier 3
  const volToDistribute = remainingVolume > 0 ? remainingVolume : safeVol;
  const v1 = Math.round(volToDistribute * 0.40);
  const v3 = Math.round(volToDistribute * 0.20);
  const v2 = Math.max(0, volToDistribute - v1 - v3);

  const actualWeightedAvg = volToDistribute > 0 ? ((v1 * p1) + (v2 * p2) + (v3 * p3)) / volToDistribute : baseRate;

  // Market comparison and diagnostics
  const validBuyAds = Array.isArray(sortedBuyAds)
    ? sortedBuyAds.filter(ad => ad && typeof ad === 'object' && !isNaN(parseFloat(ad.price)) && parseFloat(ad.price) > 0)
    : [];
  const validSellAds = Array.isArray(sortedSellAds)
    ? sortedSellAds.filter(ad => ad && typeof ad === 'object' && !isNaN(parseFloat(ad.price)) && parseFloat(ad.price) > 0)
    : [];

  const topBuyPrice = validBuyAds.length > 0 ? parseFloat(validBuyAds[0].price) : 0;
  const cheapestSellPrice = validSellAds.length > 0 ? parseFloat(validSellAds[0].price) : 0;

  let buyMarketStatus = 'NORMAL';
  let buyMarketMessage = '';
  if (topBuyPrice > 0) {
    if (topBuyPrice > calculatedAvgBuyPrice) {
      buyMarketStatus = 'LIMIT_DISCOUNT';
      buyMarketMessage = `Top market bid is ₦${topBuyPrice.toFixed(2)} (₦${(topBuyPrice - calculatedAvgBuyPrice).toFixed(2)} above target). Post maker limit bids at these 3 tiers to protect your spread.`;
    } else {
      buyMarketStatus = 'IN_MARKET';
      buyMarketMessage = `Top market bid is ₦${topBuyPrice.toFixed(2)} (within target rate). Maker limit fills will be fast.`;
    }
  }

  let sellMarketStatus = 'NORMAL';
  let sellMarketMessage = '';
  if (cheapestSellPrice > 0) {
    if (calculatedSellPrice <= cheapestSellPrice) {
      sellMarketStatus = 'COMPETITIVE';
      sellMarketMessage = `Target sell rate (₦${calculatedSellPrice.toFixed(2)}) matches or undercuts lowest market ask (₦${cheapestSellPrice.toFixed(2)}).`;
    } else {
      sellMarketStatus = 'ABOVE_MARKET';
      sellMarketMessage = `Target sell rate (₦${calculatedSellPrice.toFixed(2)}) is above lowest market ask (₦${cheapestSellPrice.toFixed(2)}). Adjust target buy lower for faster sell execution.`;
    }
  }

  const brackets = [
    {
      tier: 1,
      name: 'Tier 1: Target / Fast Fill Limit',
      volumeUsdt: v1,
      volumePct: volToDistribute > 0 ? Math.round((v1 / volToDistribute) * 100) : 40,
      targetPrice: p1,
      totalNgn: v1 * p1,
      spreadCapture: calculatedSellPrice - p1,
      description: 'Upper boundary maker limit ad for initial fills at target rate'
    },
    {
      tier: 2,
      name: 'Tier 2: Mid-Discount Limit',
      volumeUsdt: v2,
      volumePct: volToDistribute > 0 ? Math.round((v2 / volToDistribute) * 100) : 40,
      targetPrice: p2,
      totalNgn: v2 * p2,
      spreadCapture: calculatedSellPrice - p2,
      description: 'Discounted maker limit ad (+₦' + stepDiscount.toFixed(2) + ' extra spread)'
    },
    {
      tier: 3,
      name: 'Tier 3: Deep-Discount Limit',
      volumeUsdt: v3,
      volumePct: volToDistribute > 0 ? Math.round((v3 / volToDistribute) * 100) : 20,
      targetPrice: p3,
      totalNgn: v3 * p3,
      spreadCapture: calculatedSellPrice - p3,
      description: 'Deep discount limit ad to capture market dumps and panic sells'
    }
  ];

  return {
    mode,
    totalVolume: safeVol,
    targetAvgPrice: calculatedAvgBuyPrice,
    maxAllowableAvgBuyPrice,
    targetSellPrice: calculatedSellPrice,
    profitSpread: safeSpread,
    grossSpread,
    netRealizedProfit,
    effectiveCostBasis,
    progress: {
      boughtVolume: safeBoughtVol,
      boughtAvgPrice: safeBoughtAvg,
      remainingVolume,
      neededRemainingRate,
      progressPercent,
      isTargetAchieved: safeBoughtVol >= safeVol
    },
    feeBreakdown: {
      platformFeePerUnit,
      inflowFeePerUnit,
      totalFeePerUnit
    },
    marketDiagnostics: {
      topBuyPrice,
      cheapestSellPrice,
      buyMarketStatus,
      buyMarketMessage,
      sellMarketStatus,
      sellMarketMessage
    },
    brackets,
    actualWeightedAvg
  };
}

/**
 * Calculate single-target sweet spot pricing from live Bybit P2P order book depth.
 * Anchors directly on the merchant's specified profit target (₦/USDT) and Rank 3–5 active liquid tiers.
 * Guarantees that (Effective Sell Revenue - Effective Buy Cost) >= Target Profit across all market states.
 *
 * @param {Object} params
 * @param {Array<Object>} [params.sellDepth=[]] - Ascending ask ads (or sortedSellAds)
 * @param {Array<Object>} [params.buyDepth=[]] - Descending bid ads (or sortedBuyAds)
 * @param {number} [params.profitTarget=7.0] - Target profit in NGN per USDT
 * @param {number} [params.cycleVolume=100000] - Total macro cycle volume in USDT
 * @param {number} [params.tradeVolume=100] - Per-trade USDT volume for fee calculation
 * @param {number} [params.platformFeePct=0.3] - Maker fee % on Buy side (0.3% default)
 * @param {number} [params.platformFeePctSell=0.0] - Maker fee % on Sell side (0.0% default)
 * @param {number} [params.inflowFee=50.0] - Fiat inflow stamp duty fee in NGN
 * @param {number} [params.outflowFee=0.0] - Fiat outflow transfer fee in NGN
 * @param {number} [params.boughtVolume=0] - Completed buy volume in current session
 * @param {number} [params.boughtAvgPrice=0] - Average executed price of completed buys
 * @param {boolean} [params.filterLimits=true] - Whether to filter dust / limit ads
 * @param {number} [params.rankStart=3] - Sweet spot rank start (default 3)
 * @param {number} [params.rankEnd=5] - Sweet spot rank end (default 5)
 * @returns {Object} Sweet spot pricing result matching PROJECT.md interface contract
 */
export function calculateSweetSpotPricing(params = {}) {
  const {
    sellDepth = [],
    buyDepth = [],
    profitTarget = 7.0,
    cycleVolume = 100000,
    tradeVolume = 100,
    platformFeePct = 0.3,
    platformFeePctSell = 0.0,
    inflowFee = 50.0,
    outflowFee = 0.0,
    boughtVolume = 0,
    boughtAvgPrice = 0,
    filterLimits = true,
    rankStart = 3,
    rankEnd = 5
  } = params;

  // Resilient parameter parsing supporting aliases
  const rawProfitTarget = params.profitTarget !== undefined
    ? params.profitTarget
    : (params.profitSpread !== undefined ? params.profitSpread : params.targetSpread);
  const safeProfitTarget = (rawProfitTarget !== undefined && !isNaN(Number(rawProfitTarget)))
    ? Number(rawProfitTarget)
    : 7.0;

  const rawCycleVol = params.cycleVolume !== undefined
    ? params.cycleVolume
    : params.totalVolume;
  const safeCycleVol = (!rawCycleVol || isNaN(Number(rawCycleVol)) || Number(rawCycleVol) <= 0)
    ? 100000
    : Number(rawCycleVol);

  const rawTradeVol = params.tradeVolume !== undefined
    ? params.tradeVolume
    : params.avgVolume;
  const safeTradeVol = (!rawTradeVol || isNaN(Number(rawTradeVol)) || Number(rawTradeVol) <= 0)
    ? 100
    : Number(rawTradeVol);

  const safeInflowFee = (inflowFee !== undefined && !isNaN(Number(inflowFee))) ? Number(inflowFee) : 50.0;
  const safeOutflowFee = (outflowFee !== undefined && !isNaN(Number(outflowFee))) ? Number(outflowFee) : 0.0;

  const safeBoughtVol = Math.max(0, Number(boughtVolume) || 0);
  const safeBoughtAvg = Math.max(0, Number(boughtAvgPrice) || 0);

  const phiBuy = normalizeFeeRate(platformFeePct !== undefined ? platformFeePct : 0.3);
  const divisor = Math.max(0.0001, 1 - phiBuy);
  const phiSell = normalizeFeeRate(platformFeePctSell !== undefined ? platformFeePctSell : 0.0);

  // Extract raw ads supporting common aliases
  const rawSellAds = Array.isArray(sellDepth) && sellDepth.length > 0
    ? sellDepth
    : (Array.isArray(params.sortedSellAds) && params.sortedSellAds.length > 0
      ? params.sortedSellAds
      : (Array.isArray(params.sellItems) && params.sellItems.length > 0
        ? params.sellItems
        : (Array.isArray(params.activeSellAds) ? params.activeSellAds : [])));

  const rawBuyAds = Array.isArray(buyDepth) && buyDepth.length > 0
    ? buyDepth
    : (Array.isArray(params.sortedBuyAds) && params.sortedBuyAds.length > 0
      ? params.sortedBuyAds
      : (Array.isArray(params.buyItems) && params.buyItems.length > 0
        ? params.buyItems
        : (Array.isArray(params.activeBuyAds) ? params.activeBuyAds : [])));

  const sMin = params.userSellMin !== undefined ? params.userSellMin : (params.userMin !== undefined ? params.userMin : null);
  const sMax = params.userSellMax !== undefined ? params.userSellMax : (params.userMax !== undefined ? params.userMax : null);

  const bMin = params.userBuyMin !== undefined ? params.userBuyMin : (params.userMin !== undefined ? params.userMin : null);
  const bMax = params.userBuyMax !== undefined ? params.userBuyMax : (params.userMax !== undefined ? params.userMax : null);

  // 1. Sell Sweet Spot: Filter competitor ads, sort ascending, find Rank 3–5 median ask
  let filteredSell = null;
  if (sMin !== null && sMax !== null && !isNaN(Number(sMin)) && !isNaN(Number(sMax)) && Number(sMin) > 0 && Number(sMax) >= Number(sMin)) {
    const imm = filterImmediateCompetitors(rawSellAds, Number(sMin), Number(sMax));
    if (imm.length > 0) {
      filteredSell = imm;
    }
  }
  if (!filteredSell) {
    filteredSell = filterCompetitorAds(rawSellAds, safeTradeVol, filterLimits);
    if (filteredSell.length === 0 && rawSellAds.length > 0 && filterLimits) {
      filteredSell = filterCompetitorAds(rawSellAds, safeTradeVol, false);
    }
  }
  filteredSell.sort((a, b) => (parseFloat(a.price) || 0) - (parseFloat(b.price) || 0));
  const sellPrices = filteredSell.map(ad => parseFloat(ad.price) || 0).filter(p => p > 0);
  const N = sellPrices.length;

  let sellSweetSpot = 0;
  let sellTargetRank = 0;

  if (N >= 5) {
    const rStart = (rankStart && rankStart >= 1) ? Math.floor(rankStart) : 3;
    const rEnd = (rankEnd && rankEnd >= rStart) ? Math.floor(rankEnd) : 5;
    if (rStart === 3 && rEnd === 5) {
      sellSweetSpot = sellPrices[3]; // Rank 4 (median of Rank 3, 4, 5)
      sellTargetRank = 4;
    } else {
      const slice = sellPrices.slice(rStart - 1, rEnd);
      const mid = Math.floor(slice.length / 2);
      sellSweetSpot = slice.length % 2 !== 0 ? slice[mid] : (slice[mid - 1] + slice[mid]) / 2;
      sellTargetRank = Math.min(N, Math.round((rStart + rEnd) / 2));
    }
  } else if (N === 4) {
    // Graceful fallback: N=4 -> (p3+p4)/2
    sellSweetSpot = (sellPrices[2] + sellPrices[3]) / 2;
    sellTargetRank = 4;
  } else if (N === 3) {
    // Graceful fallback: N=3 -> p3
    sellSweetSpot = sellPrices[2];
    sellTargetRank = 3;
  } else if (N === 2) {
    // Graceful fallback: N=2 -> p2
    sellSweetSpot = sellPrices[1];
    sellTargetRank = 2;
  } else if (N === 1) {
    // Graceful fallback: N=1 -> p1
    sellSweetSpot = sellPrices[0];
    sellTargetRank = 1;
  } else {
    // Graceful fallback: N=0 -> 0
    sellSweetSpot = 0;
    sellTargetRank = 0;
  }
  sellSweetSpot = Math.round(sellSweetSpot * 100) / 100;

  // 2. Effective Sell Revenue
  const effectiveSellRevenue = sellSweetSpot > 0
    ? (sellSweetSpot * (1 - phiSell) - (safeOutflowFee / safeTradeVol))
    : 0;

  // 3. Maximum Safe Buy Rate (maxBuyPrice)
  // maxBuyPrice = (1 - platformFeePct/100) * (effectiveSellRevenue - profitTarget - (inflowFee / tradeVolume))
  // Strictly floor to 2 decimal places (Math.floor(val * 100) / 100) to guarantee (Sell Rev - Buy Cost) >= Target Profit
  let maxBuyPrice = 0;
  if (sellSweetSpot > 0) {
    const rawMaxBuy = (1 - phiBuy) * (effectiveSellRevenue - safeProfitTarget - (safeInflowFee / safeTradeVol));
    if (rawMaxBuy > 0) {
      maxBuyPrice = Math.floor(rawMaxBuy * 100) / 100;
    } else {
      maxBuyPrice = 0;
    }
  }

  // 4. Market Buy Sweet Spot: Filter competitor buy ads, sort descending, find Rank 3–5 median bid + ₦0.10
  let filteredBuy = null;
  if (bMin !== null && bMax !== null && !isNaN(Number(bMin)) && !isNaN(Number(bMax)) && Number(bMin) > 0 && Number(bMax) >= Number(bMin)) {
    const immBuy = filterImmediateCompetitors(rawBuyAds, Number(bMin), Number(bMax));
    if (immBuy.length > 0) {
      filteredBuy = immBuy;
    }
  }
  if (!filteredBuy) {
    filteredBuy = filterCompetitorAds(rawBuyAds, safeTradeVol, filterLimits);
    if (filteredBuy.length === 0 && rawBuyAds.length > 0 && filterLimits) {
      filteredBuy = filterCompetitorAds(rawBuyAds, safeTradeVol, false);
    }
  }
  filteredBuy.sort((a, b) => (parseFloat(b.price) || 0) - (parseFloat(a.price) || 0));
  const buyPrices = filteredBuy.map(ad => parseFloat(ad.price) || 0).filter(p => p > 0);
  const M = buyPrices.length;

  let baseBid = 0;
  let buyTargetRank = 0;

  if (M >= 5) {
    const rStart = (rankStart && rankStart >= 1) ? Math.floor(rankStart) : 3;
    const rEnd = (rankEnd && rankEnd >= rStart) ? Math.floor(rankEnd) : 5;
    if (rStart === 3 && rEnd === 5) {
      baseBid = buyPrices[3]; // Rank 4 (median of Rank 3, 4, 5)
      buyTargetRank = 4;
    } else {
      const slice = buyPrices.slice(rStart - 1, rEnd);
      const mid = Math.floor(slice.length / 2);
      baseBid = slice.length % 2 !== 0 ? slice[mid] : (slice[mid - 1] + slice[mid]) / 2;
      buyTargetRank = Math.min(M, Math.round((rStart + rEnd) / 2));
    }
  } else if (M === 4) {
    baseBid = (buyPrices[2] + buyPrices[3]) / 2;
    buyTargetRank = 4;
  } else if (M === 3) {
    baseBid = buyPrices[2];
    buyTargetRank = 3;
  } else if (M === 2) {
    baseBid = buyPrices[1];
    buyTargetRank = 2;
  } else if (M === 1) {
    baseBid = buyPrices[0];
    buyTargetRank = 1;
  } else {
    baseBid = 0;
    buyTargetRank = 0;
  }

  let marketBuySweetSpot = 0;
  if (baseBid > 0) {
    marketBuySweetSpot = Math.round((baseBid + 0.10) * 100) / 100;
  } else {
    marketBuySweetSpot = maxBuyPrice;
  }

  // 5. Spread Compression Handling
  // buySweetSpot = Math.min(marketBuySweetSpot, maxBuyPrice)
  // isSafe = marketBuySweetSpot <= maxBuyPrice
  // isCompressed = marketBuySweetSpot > maxBuyPrice
  // status = isCompressed ? 'COMPRESSED' : 'SAFE'
  const buySweetSpot = (marketBuySweetSpot > 0 && maxBuyPrice > 0)
    ? Math.min(marketBuySweetSpot, maxBuyPrice)
    : (maxBuyPrice > 0 ? maxBuyPrice : marketBuySweetSpot);
  const isSafe = marketBuySweetSpot <= maxBuyPrice && maxBuyPrice > 0;
  const isCompressed = marketBuySweetSpot > maxBuyPrice && maxBuyPrice > 0;

  let status = 'SAFE';
  let statusMessage = 'Market spread is safe. Target profit guaranteed.';

  if (sellSweetSpot <= 0) {
    status = 'OFFLINE';
    statusMessage = 'Order book offline or insufficient sell depth.';
  } else if (maxBuyPrice <= 0) {
    status = 'INVALID_TARGET';
    statusMessage = 'Target profit exceeds feasible market spread.';
  } else if (isCompressed) {
    status = 'COMPRESSED';
    statusMessage = `Spread compression detected: Market buy sweet spot (₦${marketBuySweetSpot.toFixed(2)}) exceeds safe ceiling (₦${maxBuyPrice.toFixed(2)}). Buy rate clamped to protect profit target.`;
  }

  // 6. Effective Buy Cost & Realized Spread
  const effectiveBuyCost = buySweetSpot > 0
    ? ((buySweetSpot / divisor) + (safeInflowFee / safeTradeVol))
    : 0;
  const realizedSpread = (sellSweetSpot > 0 && buySweetSpot > 0)
    ? (effectiveSellRevenue - effectiveBuyCost)
    : 0;

  // 7. Fee Breakdown per unit volume
  const platformFeePerUnit = buySweetSpot > 0 ? (buySweetSpot * phiBuy) : 0;
  const fiatFeePerUnit = safeInflowFee / safeTradeVol;
  const totalFeePerUnit = platformFeePerUnit + fiatFeePerUnit;

  const feeBreakdown = {
    platformFeePerUnit: Math.round(platformFeePerUnit * 10000) / 10000,
    fiatFeePerUnit: Math.round(fiatFeePerUnit * 10000) / 10000,
    totalFeePerUnit: Math.round(totalFeePerUnit * 10000) / 10000,
    effectiveCostBasis: Math.round(effectiveBuyCost * 10000) / 10000
  };

  // 8. Cycle Guidance & Live Trade Tracking
  const remainingVolume = Math.max(0, safeCycleVol - safeBoughtVol);
  const progressPercent = Math.min(100, Math.round((safeBoughtVol / safeCycleVol) * 1000) / 10);
  const isTargetAchieved = safeBoughtVol >= safeCycleVol;

  let neededRemainingRate = maxBuyPrice;
  if (remainingVolume > 0 && safeBoughtVol > 0 && safeBoughtAvg > 0) {
    const totalBudget = safeCycleVol * maxBuyPrice;
    const spentBudget = safeBoughtVol * safeBoughtAvg;
    neededRemainingRate = (totalBudget - spentBudget) / remainingVolume;
  }
  neededRemainingRate = Math.round(neededRemainingRate * 100) / 100;

  const cycleGuidance = {
    cycleVolume: safeCycleVol,
    boughtVolume: safeBoughtVol,
    remainingVolume,
    targetAvgBuyRate: maxBuyPrice,
    neededRemainingRate,
    progressPercent,
    isTargetAchieved
  };

  // 9. 3-Tier Maker Ladder Allocations anchored to neededRemainingRate (Tier 1: 40%, Tier 2: 40%, Tier 3: 20%)
  const baseRate = Math.round(neededRemainingRate * 100) / 100;
  const stepDiscount = Math.max(1.0, Math.round(safeProfitTarget * 0.4 * 100) / 100);

  const p1 = baseRate;
  const p2 = Math.max(1.0, Math.round((baseRate - stepDiscount) * 100) / 100);
  const p3 = Math.max(1.0, Math.round((baseRate - (stepDiscount * 2.5)) * 100) / 100);

  const volToDistribute = remainingVolume > 0 ? remainingVolume : safeCycleVol;
  const v1 = Math.round(volToDistribute * 0.40);
  const v3 = Math.round(volToDistribute * 0.20);
  const v2 = Math.max(0, volToDistribute - v1 - v3);

  const actualWeightedAvg = volToDistribute > 0
    ? Math.round((((v1 * p1) + (v2 * p2) + (v3 * p3)) / volToDistribute) * 100) / 100
    : baseRate;

  const brackets = [
    {
      tier: 1,
      name: 'Tier 1: Target / Fast Fill Limit',
      volumeUsdt: v1,
      volumePct: volToDistribute > 0 ? Math.round((v1 / volToDistribute) * 100) : 40,
      targetPrice: p1,
      totalNgn: Math.round(v1 * p1 * 100) / 100,
      spreadCapture: Math.round((sellSweetSpot - p1) * 100) / 100,
      description: 'Upper boundary maker limit ad for initial fills at target rate'
    },
    {
      tier: 2,
      name: 'Tier 2: Mid-Discount Limit',
      volumeUsdt: v2,
      volumePct: volToDistribute > 0 ? Math.round((v2 / volToDistribute) * 100) : 40,
      targetPrice: p2,
      totalNgn: Math.round(v2 * p2 * 100) / 100,
      spreadCapture: Math.round((sellSweetSpot - p2) * 100) / 100,
      description: `Discounted maker limit ad (+₦${stepDiscount.toFixed(2)} extra spread)`
    },
    {
      tier: 3,
      name: 'Tier 3: Deep-Discount Limit',
      volumeUsdt: v3,
      volumePct: volToDistribute > 0 ? Math.round((v3 / volToDistribute) * 100) : 20,
      targetPrice: p3,
      totalNgn: Math.round(v3 * p3 * 100) / 100,
      spreadCapture: Math.round((sellSweetSpot - p3) * 100) / 100,
      description: 'Deep discount limit ad to capture market dumps and panic sells'
    }
  ];

  // 10. Diagnostics
  const topBuyPrice = buyPrices.length > 0 ? buyPrices[0] : 0;
  const cheapestSellPrice = sellPrices.length > 0 ? sellPrices[0] : 0;

  let buyMarketStatus = 'NORMAL';
  let buyMarketMessage = '';
  if (topBuyPrice > 0) {
    if (topBuyPrice > maxBuyPrice) {
      buyMarketStatus = 'LIMIT_DISCOUNT';
      buyMarketMessage = `Top market bid is ₦${topBuyPrice.toFixed(2)} (₦${(topBuyPrice - maxBuyPrice).toFixed(2)} above safe ceiling). Post maker limit bids at these 3 tiers to protect your spread.`;
    } else {
      buyMarketStatus = 'IN_MARKET';
      buyMarketMessage = `Top market bid is ₦${topBuyPrice.toFixed(2)} (within safe rate). Maker limit fills will be fast.`;
    }
  }

  let sellMarketStatus = 'NORMAL';
  let sellMarketMessage = '';
  if (cheapestSellPrice > 0) {
    if (sellSweetSpot <= cheapestSellPrice) {
      sellMarketStatus = 'COMPETITIVE';
      sellMarketMessage = `Target sell rate (₦${sellSweetSpot.toFixed(2)}) matches or undercuts lowest market ask (₦${cheapestSellPrice.toFixed(2)}).`;
    } else {
      sellMarketStatus = 'ABOVE_MARKET';
      sellMarketMessage = `Target sell rate (₦${sellSweetSpot.toFixed(2)}) is above lowest market ask (₦${cheapestSellPrice.toFixed(2)}). Anchored at Rank 3–5 liquid tier.`;
    }
  }

  const marketDiagnostics = {
    topBuyPrice,
    cheapestSellPrice,
    buyMarketStatus,
    buyMarketMessage,
    sellMarketStatus,
    sellMarketMessage
  };

  // 11. Markers
  const markers = {
    sellTargetRank,
    buyTargetRank,
    sellMarkerPrice: sellSweetSpot,
    buyMarkerPrice: buySweetSpot
  };

  return {
    sellSweetSpot,
    buySweetSpot,
    maxBuyPrice,
    marketBuySweetSpot,
    profitTarget: safeProfitTarget,
    effectiveSellRevenue,
    effectiveBuyCost,
    realizedSpread,
    isSafe,
    isCompressed,
    status,
    statusMessage,
    markers,
    cycleGuidance,
    feeBreakdown,
    isOffline: sellSweetSpot <= 0,

    // Aliases and extensions for full UI and controller interoperability
    rawSuggestedBuy: marketBuySweetSpot,
    suggestedBuy: buySweetSpot,
    suggestedSell: sellSweetSpot,
    targetSellPrice: sellSweetSpot,
    targetAvgPrice: maxBuyPrice,
    maxAllowableAvgBuyPrice: maxBuyPrice,
    profitSpread: safeProfitTarget,
    grossSpread: Math.round((sellSweetSpot - buySweetSpot) * 100) / 100,
    netRealizedProfit: realizedSpread,
    effectiveCostBasis: effectiveBuyCost,
    progress: cycleGuidance,
    brackets,
    tiers: brackets,
    actualWeightedAvg,
    marketDiagnostics
  };
}

// =========================================================================
// Immediate Competitor Trade Limit Overlap & Queue Analysis
// =========================================================================

/**
 * Extract and normalize trade limit boundaries from a Bybit competitor advertisement
 * @param {Object} ad - Raw Bybit advertisement object
 * @returns {{ min: number, max: number }} Normalized limit interval [min, max]
 */
export function getCompetitorLimits(ad) {
  if (!ad || typeof ad !== 'object') {
    return { min: 0, max: Infinity };
  }

  // 1. Min Limit normalization (supporting Bybit property aliases)
  const rawMin = ad.minAmount !== undefined ? ad.minAmount : ad.minSingleTransAmount;
  let min = parseFloat(rawMin);
  if (isNaN(min) || min < 0) {
    min = 0;
  }

  // 2. Max Limit normalization (supporting Bybit property aliases)
  const rawMax = ad.maxAmount !== undefined ? ad.maxAmount : ad.maxSingleTransAmount;
  let max = parseFloat(rawMax);

  // If max is missing, zero, or NaN, infer from inventory: price * quantity
  if (isNaN(max) || max <= 0) {
    const price = parseFloat(ad.price) || 0;
    const qty = parseFloat(
      ad.lastQuantity !== undefined ? ad.lastQuantity :
      (ad.quantity !== undefined ? ad.quantity : ad.freezeQuantity)
    ) || 0;

    if (price > 0 && qty > 0) {
      max = price * qty;
    } else {
      max = Infinity;
    }
  }

  return { min, max };
}

/**
 * Evaluate whether competitor trade limits overlap with the user's configured trade limits.
 * Polymorphic: Supports (userMin, userMax, compMin, compMax), (ad, userMin, userMax), or (userMin, userMax, ad).
 * 
 * @param {number|Object|string} arg1 - userMin OR competitor ad object
 * @param {number|string} arg2 - userMax OR userMin
 * @param {number|Object|string} [arg3] - compMin OR userMax OR competitor ad object
 * @param {number|string} [arg4] - compMax
 * @returns {boolean} True if the competitor's limits overlap with the user's limit range
 */
export function isImmediateCompetitor(arg1, arg2, arg3, arg4) {
  let uMin, uMax, cMin, cMax;

  // Pattern A: isImmediateCompetitor(ad, userMin, userMax)
  if (arg1 !== null && typeof arg1 === 'object') {
    const limits = getCompetitorLimits(arg1);
    cMin = limits.min;
    cMax = limits.max;
    uMin = arg2;
    uMax = arg3;
  }
  // Pattern B: isImmediateCompetitor(userMin, userMax, ad)
  else if (arg3 !== null && typeof arg3 === 'object') {
    uMin = arg1;
    uMax = arg2;
    const limits = getCompetitorLimits(arg3);
    cMin = limits.min;
    cMax = limits.max;
  }
  // Pattern C: isImmediateCompetitor(userMin, userMax, compMin, compMax)
  else {
    uMin = arg1;
    uMax = arg2;

    // Parse compMin with safe default 0
    if (arg3 === undefined || arg3 === null || arg3 === '') {
      cMin = 0;
    } else {
      const parsedCompMin = Number(arg3);
      cMin = isNaN(parsedCompMin) ? 0 : Math.max(0, parsedCompMin);
    }

    // Parse compMax with safe default Infinity
    if (arg4 === undefined || arg4 === null || arg4 === '' || arg4 === 0 || arg4 === '0') {
      cMax = Infinity;
    } else {
      const parsedCompMax = Number(arg4);
      if (isNaN(parsedCompMax) || parsedCompMax === 0) {
        cMax = Infinity;
      } else {
        cMax = parsedCompMax;
      }
    }
  }

  // Reject boolean arguments explicitly (prevents Number(true) === 1 coercion)
  if (typeof uMin === 'boolean' || typeof uMax === 'boolean') {
    return false;
  }

  // Reject empty string or missing user limits
  if (uMin === undefined || uMin === null || (typeof uMin === 'string' && uMin.trim() === '')) {
    return false;
  }
  if (uMax === undefined || uMax === null || (typeof uMax === 'string' && uMax.trim() === '')) {
    return false;
  }

  const numUMin = Number(uMin);
  const numUMax = Number(uMax);

  // Validate user bounds: must be finite, non-negative, with numUMax > 0 and numUMin <= numUMax
  if (!Number.isFinite(numUMin) || !Number.isFinite(numUMax)) return false;
  if (numUMin < 0 || numUMax <= 0 || numUMin > numUMax) return false;

  // Inverted competitor bounds indicate invalid/corrupted ad limits
  if (cMin > cMax && cMax !== Infinity) {
    return false;
  }

  // Closed interval overlap: [cMin, cMax] intersects [numUMin, numUMax]
  return cMin <= numUMax && cMax >= numUMin;
}

/**
 * Filter an array of competitor advertisements to those whose trade limits overlap with user limits
 * @param {Array<Object>} ads - Competitor advertisement list
 * @param {number|string} userMin - User configured minimum trade limit in NGN
 * @param {number|string} userMax - User configured maximum trade limit in NGN
 * @returns {Array<Object>} Array of immediate competitor advertisements
 */
export function filterImmediateCompetitors(ads = [], userMin, userMax) {
  if (!Array.isArray(ads) || ads.length === 0) {
    return [];
  }

  if (userMin === undefined || userMin === null || userMax === undefined || userMax === null) {
    return [];
  }
  if (typeof userMin === 'boolean' || typeof userMax === 'boolean') {
    return [];
  }
  const uMin = Number(userMin);
  const uMax = Number(userMax);
  if (isNaN(uMin) || isNaN(uMax) || uMin < 0 || uMax <= 0 || uMin > uMax) {
    return [];
  }

  return ads.filter(ad => {
    if (!ad || typeof ad !== 'object') return false;
    return isImmediateCompetitor(ad, uMin, uMax);
  });
}

export const calculateImmediateCompetitors = filterImmediateCompetitors;

/**
 * Calculate user's relative queue position and cumulative volume ahead in the order book.
 * Evaluates competitors using direction-aware priority:
 * - Buy side: Higher price has priority (P_c >= P_user). Equal price favors existing ad.
 * - Sell side: Lower price has priority (P_c <= P_user). Equal price favors existing ad.
 *
 * @param {Array<Object>} [competitors=[]] - Competitor advertisements
 * @param {number|string} [targetPrice=0] - User's target ad price in NGN
 * @param {string} [side='buy'] - Trade direction ('buy' or 'sell')
 * @returns {{
 *   rank: number,
 *   totalCompetitors: number,
 *   competitorsAhead: number,
 *   volumeAhead: number
 * }}
 */
export function calculateQueuePosition(competitors = [], targetPrice = 0, side = 'buy') {
  const safeList = Array.isArray(competitors) ? competitors : [];
  const tPrice = (targetPrice !== undefined && targetPrice !== null && !isNaN(Number(targetPrice)))
    ? Number(targetPrice)
    : 0;
  const isBuy = String(side || 'buy').trim().toLowerCase() !== 'sell';

  // Filter valid competitor ads with valid positive price
  const validCompetitors = safeList.filter(ad => {
    if (!ad || typeof ad !== 'object') return false;
    const p = parseFloat(ad.price);
    return !isNaN(p) && p > 0;
  });

  const totalCompetitors = validCompetitors.length + 1;

  if (validCompetitors.length === 0) {
    return {
      rank: 1,
      totalCompetitors: 1,
      competitorsAhead: 0,
      volumeAhead: 0
    };
  }

  const EPSILON = 1e-6;
  let competitorsAhead = 0;
  let volumeAhead = 0;

  for (const ad of validCompetitors) {
    const cPrice = parseFloat(ad.price);
    const cQty = Math.max(0, parseFloat(ad.lastQuantity ?? ad.quantity) || 0);

    // Buy: higher or equal price is ahead. Sell: lower or equal price is ahead.
    const isAhead = isBuy
      ? (cPrice >= tPrice - EPSILON)
      : (cPrice <= tPrice + EPSILON);

    if (isAhead) {
      competitorsAhead++;
      volumeAhead += cQty;
    }
  }

  const rank = competitorsAhead + 1;
  const roundedVol = Math.round(volumeAhead * 100) / 100;

  return {
    rank,
    totalCompetitors,
    competitorsAhead,
    volumeAhead: roundedVol
  };
}

/**
 * Calculate deterministic order fill speed score and qualitative classification.
 * Combines queue rank penalty and cumulative volume ahead barrier into a bounded score.
 *
 * Classification:
 * - 80-100: 'Very Fast' (< 5 mins)
 * - 60-79:  'Fast' (5-15 mins)
 * - 40-59:  'Moderate' (15-45 mins)
 * - 0-39:   'Slow' (> 45 mins)
 *
 * @param {number|string} [rank=1] - User's 1-based order book rank
 * @param {number|string} [volumeAhead=0] - Cumulative USDT volume ahead
 * @param {number|string} [totalCompetitors=0] - Total number of competitors evaluated
 * @returns {{
 *   score: number,
 *   label: string,
 *   estMinutes: string,
 *   description: string
 * }}
 */
export function calculateFillSpeed(rank = 1, volumeAhead = 0, totalCompetitors = 0) {
  const safeRank = (rank !== undefined && !isNaN(Number(rank)) && Number(rank) >= 1)
    ? Math.floor(Number(rank))
    : 1;
  const safeVolAhead = (volumeAhead !== undefined && !isNaN(Number(volumeAhead)) && Number(volumeAhead) >= 0)
    ? Number(volumeAhead)
    : 0;
  const safeTotal = (totalCompetitors !== undefined && !isNaN(Number(totalCompetitors)) && Number(totalCompetitors) >= 0)
    ? Math.floor(Number(totalCompetitors))
    : 0;

  // Uncontested monopoly or rank 1 with 0 volume ahead -> score 100, Very Fast
  if (safeRank === 1 && safeVolAhead === 0) {
    return {
      score: 100,
      label: 'Very Fast',
      estMinutes: '< 5 mins',
      description: 'Top queue priority with minimal volume ahead'
    };
  }

  // 1. Rank penalty: 15 points per position behind Rank 1
  const rankPenalty = (safeRank - 1) * 15;

  // 2. Volume penalty: 10 points per 500 USDT ahead, capped at 40 points
  const volumePenalty = Math.min(40, (safeVolAhead / 500) * 10);

  // 3. Composite bounded score (floored at 5, capped at 100 per test harness specification)
  const rawScore = 100 - rankPenalty - volumePenalty;
  const score = Math.max(5, Math.min(100, Math.round(rawScore)));

  // 4. Categorical classification
  let label = 'Slow';
  let estMinutes = '> 45 mins';
  let description = 'Deep queue position with substantial volume ahead';

  if (score >= 80) {
    label = 'Very Fast';
    estMinutes = '< 5 mins';
    description = 'Top queue priority with minimal volume ahead';
  } else if (score >= 60) {
    label = 'Fast';
    estMinutes = '5-15 mins';
    description = 'Competitive queue position';
  } else if (score >= 40) {
    label = 'Moderate';
    estMinutes = '15-45 mins';
    description = 'Moderate queue depth ahead';
  } else {
    label = 'Slow';
    estMinutes = '> 45 mins';
    description = 'Deep queue position with substantial volume ahead';
  }

  return {
    score,
    label,
    estMinutes,
    description
  };
}

/**
 * Calculate Dual-Book Buy Advisory comparing Taker Buy (Sell Book Asks) vs Maker Buy (Buy Book Bids)
 * Anchored to current FIFO average cost basis and active Live Sell Ad exit price.
 * 
 * @param {Object} params
 * @returns {Object} Dual-book smart buy advice
 */
export function calculateDualBookBuyAdvice({
  costBasis = 0,
  liveSellPrice = 0,
  liveBuyPrice = 0,
  sortedSellAds = [],
  sortedBuyAds = [],
  targetProfit = 7.0,
  userMin = 30000,
  userMax = 60000,
  platformFeePct = 0.3,
  inflowFee = 50.0,
  tradeVolume = 100
} = {}) {
  const currentFifoAvg = Number(costBasis) > 0 ? Number(costBasis) : 0;
  const safeVol = (!tradeVolume || isNaN(Number(tradeVolume)) || Number(tradeVolume) <= 0) ? 100 : Number(tradeVolume);
  const safeProfit = (!targetProfit || isNaN(Number(targetProfit)) || Number(targetProfit) <= 0) ? 7.0 : Number(targetProfit);
  const phiBuy = normalizeFeeRate(platformFeePct);
  const fiatFeePerUnit = Number(inflowFee || 0) / safeVol;

  // 1. Resolve Exit Anchor: Active Live Sell Ad > Top Market Ask > FIFO + Target
  const sellAdsList = Array.isArray(sortedSellAds) ? sortedSellAds : [];
  const buyAdsList = Array.isArray(sortedBuyAds) ? sortedBuyAds : [];

  let exitAnchorPrice = 0;
  if (liveSellPrice > 0) {
    exitAnchorPrice = Number(liveSellPrice);
  } else if (sellAdsList.length > 0 && parseFloat(sellAdsList[0].price) > 0) {
    exitAnchorPrice = parseFloat(sellAdsList[0].price);
  } else if (currentFifoAvg > 0) {
    exitAnchorPrice = currentFifoAvg + safeProfit;
  }

  // 2. Channel A: Taker Buy from Sell Order Book (Market Asks)
  // Direct competitor asks within user limits
  const directAsks = sellAdsList.filter(ad => isImmediateCompetitor(ad, userMin, userMax));
  const candidateAsks = directAsks.length > 0 ? directAsks : sellAdsList;
  const cheapestAsk = candidateAsks.length > 0 ? candidateAsks[0] : null;

  const takerPrice = cheapestAsk ? (parseFloat(cheapestAsk.price) || 0) : 0;
  const takerQty = cheapestAsk ? (parseFloat(cheapestAsk.lastQuantity) || 0) : 0;
  const takerAdvName = cheapestAsk ? (cheapestAsk.nickName || cheapestAsk.memberName || 'Seller') : 'None online';

  const takerDropsFifo = currentFifoAvg > 0 && takerPrice > 0 && takerPrice < currentFifoAvg;
  const takerFifoDropAmount = (currentFifoAvg > 0 && takerPrice > 0) ? Math.round((currentFifoAvg - takerPrice) * 100) / 100 : 0;
  const takerGrossSpread = (exitAnchorPrice > 0 && takerPrice > 0) ? Math.round((exitAnchorPrice - takerPrice) * 100) / 100 : 0;
  const takerNetMargin = takerGrossSpread - fiatFeePerUnit; // 0% taker fee on Bybit P2P!

  // 3. Channel B: Maker Buy from Buy Order Book (Market Bids)
  // Safe ceiling: maximum price user can bid as Maker while ensuring safe profit
  const makerSafeCeiling = exitAnchorPrice > 0
    ? Math.floor((1 - phiBuy) * (exitAnchorPrice - safeProfit - fiatFeePerUnit) * 100) / 100
    : (currentFifoAvg > 0 ? Math.floor((currentFifoAvg - safeProfit) * 100) / 100 : 0);

  const directBids = buyAdsList.filter(ad => isImmediateCompetitor(ad, userMin, userMax));
  const candidateBids = directBids.length > 0 ? directBids : buyAdsList;
  const topBidPrice = candidateBids.length > 0 ? (parseFloat(candidateBids[0].price) || 0) : 0;

  // Maker buy recommendation: competitive bid clamped to safe ceiling
  const recommendedMakerRate = makerSafeCeiling > 0
    ? (topBidPrice > 0 ? Math.min(makerSafeCeiling, Math.round((topBidPrice + 0.10) * 100) / 100) : makerSafeCeiling)
    : 0;

  const makerDropsFifo = currentFifoAvg > 0 && recommendedMakerRate > 0 && recommendedMakerRate < currentFifoAvg;
  const makerFifoDropAmount = (currentFifoAvg > 0 && recommendedMakerRate > 0) ? Math.round((currentFifoAvg - recommendedMakerRate) * 100) / 100 : 0;
  const makerNetMargin = (exitAnchorPrice > 0 && recommendedMakerRate > 0)
    ? Math.round((exitAnchorPrice - (recommendedMakerRate / Math.max(0.001, 1 - phiBuy)) - fiatFeePerUnit) * 100) / 100
    : 0;

  // 4. Order-Book Grounded 3-Tier FIFO Averaging Brackets
  // Tiers are derived strictly from REAL order book prices (Sell Asks + Buy Bids + Live Ad)
  
  // Tier 1: Instant Taker Buy from cheapest ask in Sell Order Book
  const p1 = takerPrice > 0 ? takerPrice : (recommendedMakerRate > 0 ? recommendedMakerRate : 1369.45);
  const v1 = Math.round(safeVol * 0.40);
  const tier1Spread = (exitAnchorPrice > 0 && p1 > 0) ? Math.round((exitAnchorPrice - p1) * 100) / 100 : 0;
  const tier1FifoDrop = (currentFifoAvg > 0 && p1 > 0) ? Math.round((currentFifoAvg - p1) * 100) / 100 : 0;
  const tier1Net = Math.round(takerNetMargin * 100) / 100;

  // Tier 2: Competitive Maker Bid from top direct competitor in Buy Order Book
  let p2 = 0;
  let p2Adv = 'Buy Book';
  const compBid = candidateBids.find(ad => {
    const p = parseFloat(ad.price);
    return p > 0 && (takerPrice <= 0 || p <= takerPrice) && (makerSafeCeiling <= 0 || p <= makerSafeCeiling + 2.0);
  }) || (candidateBids.length > 0 ? candidateBids[0] : null);

  if (compBid) {
    p2 = parseFloat(compBid.price);
    p2Adv = compBid.nickName || compBid.memberName || 'Direct Bid';
  } else {
    p2 = recommendedMakerRate > 0 ? recommendedMakerRate : 1369.70;
  }
  const v2 = Math.round(safeVol * 0.40);
  const tier2Spread = (exitAnchorPrice > 0 && p2 > 0) ? Math.round((exitAnchorPrice - p2) * 100) / 100 : 0;
  const tier2FifoDrop = (currentFifoAvg > 0 && p2 > 0) ? Math.round((currentFifoAvg - p2) * 100) / 100 : 0;
  const tier2Net = (exitAnchorPrice > 0 && p2 > 0)
    ? Math.round((exitAnchorPrice - (p2 / Math.max(0.001, 1 - phiBuy)) - fiatFeePerUnit) * 100) / 100
    : 0;

  // Tier 3: Passive / Live Buy Ad from user's live running Buy ad or deeper queue bid
  const p3 = liveBuyPrice > 0
    ? Number(liveBuyPrice)
    : (candidateBids.length > 2 ? parseFloat(candidateBids[candidateBids.length - 1].price) : Math.round(Math.max(1.0, p2 - 3.5) * 100) / 100);
  const v3 = Math.max(1, safeVol - v1 - v2);
  const tier3Spread = (exitAnchorPrice > 0 && p3 > 0) ? Math.round((exitAnchorPrice - p3) * 100) / 100 : 0;
  const tier3FifoDrop = (currentFifoAvg > 0 && p3 > 0) ? Math.round((currentFifoAvg - p3) * 100) / 100 : 0;
  const tier3Net = (exitAnchorPrice > 0 && p3 > 0)
    ? Math.round((exitAnchorPrice - (p3 / Math.max(0.001, 1 - phiBuy)) - fiatFeePerUnit) * 100) / 100
    : 0;

  const brackets = [
    {
      tier: 1,
      name: `Tier 1: Instant Taker Buy (${takerAdvName})`,
      targetPrice: Math.round(p1 * 100) / 100,
      volumeUsdt: v1,
      volumePct: 40,
      totalNgn: Math.round(v1 * p1),
      description: `Cheapest ask on Sell Order Book (${takerAdvName}). 0% taker fee, instant fill.`,
      spreadCapture: tier1Spread,
      fifoDrop: tier1FifoDrop,
      netMargin: tier1Net
    },
    {
      tier: 2,
      name: `Tier 2: Competitive Maker Bid (${p2Adv})`,
      targetPrice: Math.round(p2 * 100) / 100,
      volumeUsdt: v2,
      volumePct: 40,
      totalNgn: Math.round(v2 * p2),
      description: `Top direct bid on Buy Order Book (${p2Adv}). Fast queue fill.`,
      spreadCapture: tier2Spread,
      fifoDrop: tier2FifoDrop,
      netMargin: tier2Net
    },
    {
      tier: 3,
      name: liveBuyPrice > 0 ? 'Tier 3: Your Live Buy Ad (Bybit)' : 'Tier 3: Passive Limit Bid (Buy Book)',
      targetPrice: Math.round(p3 * 100) / 100,
      volumeUsdt: v3,
      volumePct: 20,
      totalNgn: Math.round(v3 * p3),
      description: liveBuyPrice > 0 ? 'Your live running Buy Ad on Bybit. Deepest FIFO reduction.' : 'Deep limit bid on Buy Order Book.',
      spreadCapture: tier3Spread,
      fifoDrop: tier3FifoDrop,
      netMargin: tier3Net
    }
  ];

  return {
    currentFifoAvg,
    exitAnchorPrice,
    fifoDropCeiling: currentFifoAvg > 0 ? currentFifoAvg : exitAnchorPrice,
    taker: {
      bestPrice: takerPrice,
      availableQty: takerQty,
      advertiserName: takerAdvName,
      dropsFifo: takerDropsFifo,
      fifoDropAmount: takerFifoDropAmount,
      grossSpread: takerGrossSpread,
      netMargin: Math.round(takerNetMargin * 100) / 100,
      isViable: takerPrice > 0 && (currentFifoAvg <= 0 || takerDropsFifo) && takerGrossSpread > 0
    },
    maker: {
      recommendedRate: recommendedMakerRate,
      safeCeiling: makerSafeCeiling,
      dropsFifo: makerDropsFifo,
      fifoDropAmount: makerFifoDropAmount,
      netMargin: makerNetMargin,
      topBidPrice
    },
    brackets
  };
}

