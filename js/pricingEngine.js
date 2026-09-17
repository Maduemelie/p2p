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


