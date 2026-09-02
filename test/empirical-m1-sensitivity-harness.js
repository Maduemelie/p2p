/**
 * Empirical Challenge Harness: Trade Size & Limit Sensitivity (m1_challenger_2)
 * 
 * Verifies:
 * 1. Trade size sensitivity across Tier 1 (₦5k), Tier 2 (₦10k), Tier 3 (₦30k), Tier 4 (₦100k)
 * 2. Limit recommendation math and fee drag invariants
 * 3. Dust filtering boundaries and kink points
 * 4. Fee percentage parameter normalization & stress bounds
 * 5. Order book limit filtering fuzzing & malformed data robustness
 */

import * as pricingEngine from '../js/pricingEngine.js';

let passedChecks = 0;
let totalChecks = 0;
const failureLog = [];

function check(desc, condition, detail = '') {
  totalChecks++;
  if (condition) {
    passedChecks++;
  } else {
    failureLog.push(`FAIL: ${desc} ${detail ? `(${detail})` : ''}`);
    console.error(`[FAIL] ${desc}: ${detail}`);
  }
}

function approx(actual, expected, tol = 1e-4) {
  return Math.abs(actual - expected) <= tol;
}

console.log('================================================================');
console.log('STARTING EMPIRICAL SENSITIVITY & LIMIT HARNESS (m1_challenger_2)');
console.log('================================================================\n');

// -------------------------------------------------------------------------
// 1. TIER SIMULATIONS: ₦5k, ₦10k, ₦30k, ₦100k
// -------------------------------------------------------------------------
console.log('--- 1. Trade Size Sensitivity Tier Simulations ---');

const basePrice = 1500.0;
const targetSpread = 5.0;
const fiatFee = 50.0;
const platformFeePct = 0.3; // 0.3%
const phi = 0.003;

const tiers = [
  { name: 'Tier 1: ₦5,000 Micro-Trade', fiat: 5000, usdt: 5000 / 1500, expectedDragRatio: 3.00, expectedStatus: 'COMPRESSED', isBelowBreakEven: true, satisfiesPolicy: false },
  { name: 'Tier 2: ₦10,000 Boundary Trade', fiat: 10000, usdt: 10000 / 1500, expectedDragRatio: 1.50, expectedStatus: 'COMPRESSED', isBelowBreakEven: true, satisfiesPolicy: false },
  { name: 'Tier 3: ₦30,000 Standard Trade', fiat: 30000, usdt: 30000 / 1500, expectedDragRatio: 0.50, expectedStatus: 'SAFE_OR_COMPRESSED', isBelowBreakEven: false, satisfiesPolicy: false },
  { name: 'Tier 4: ₦100,000 Optimal Trade', fiat: 100000, usdt: 100000 / 1500, expectedDragRatio: 0.15, expectedStatus: 'SAFE', isBelowBreakEven: false, satisfiesPolicy: true }
];

const limits = pricingEngine.calculateRecommendedLimits({
  price: basePrice,
  targetSpread,
  fiatFee,
  maxFeeDragRatio: 0.20,
  platformFeePct
});

console.log(`Recommended Limits for Price=₦${basePrice}, Spread=₦${targetSpread}, FiatFee=₦${fiatFee}:`);
console.log(`  Min Fiat Limit (20% drag): ₦${limits.minFiatLimit.toLocaleString()} (${limits.minUsdtLimit} USDT)`);
console.log(`  Break-Even Fiat Limit (100% drag): ₦${limits.breakEvenFiatLimit.toLocaleString()} (${limits.breakEvenUsdtLimit} USDT)`);
console.log(`  Recommended Text: "${limits.recommendedText}"\n`);

check('Recommended min USDT limit is 50.0 USDT', limits.minUsdtLimit === 50.0);
check('Recommended min Fiat limit is ₦75,000', limits.minFiatLimit === 75000);
check('Break-even USDT limit is 10.0 USDT', limits.breakEvenUsdtLimit === 10.0);
check('Break-even Fiat limit is ₦15,000', limits.breakEvenFiatLimit === 15000);

for (const t of tiers) {
  const feeDragPerUnit = fiatFee / t.usdt;
  const dragRatio = feeDragPerUnit / targetSpread;

  console.log(`[${t.name}]`);
  console.log(`  Trade Volume: ${t.usdt.toFixed(4)} USDT (₦${t.fiat.toLocaleString()})`);
  console.log(`  Single-Leg Fiat Fee Drag: ₦${feeDragPerUnit.toFixed(2)}/USDT (${(dragRatio * 100).toFixed(1)}% of ₦${targetSpread} spread)`);
  console.log(`  Round-Trip Fiat Fee Drag: ₦${(feeDragPerUnit * 2).toFixed(2)}/USDT (${(dragRatio * 200).toFixed(1)}% of spread)`);

  check(`${t.name}: drag ratio close to ${t.expectedDragRatio}`, approx(dragRatio, t.expectedDragRatio, 0.01));
  check(`${t.name}: below break-even correctly identified`, (t.usdt < limits.breakEvenUsdtLimit) === t.isBelowBreakEven);
  check(`${t.name}: 20% policy compliance correctly identified`, (t.usdt >= limits.minUsdtLimit) === t.satisfiesPolicy);

  // Simulate Buy Pricing with Top Sell Competitor at ₦1520
  const activeBuyAds = [{ price: '1500.00', lastQuantity: '1000' }];
  const sortedSellAds = [{ price: '1520.00', lastQuantity: '1000' }];

  const buyRes = pricingEngine.calculateBuyPricing({
    activeBuyAds,
    sortedSellAds,
    targetSpread,
    inflowFee: fiatFee,
    outflowFee: fiatFee,
    platformFeePct,
    avgVolume: t.usdt,
    pricingMode: 'competitor'
  });

  // Calculate Net Profit if merchant buys at suggestedBuy and sells at 1520
  const actualBuyPrice = buyRes.suggestedBuy;
  const netExitRev = (1520 * (1 - phi)) - (fiatFee / t.usdt);
  const effectiveBuyCost = (actualBuyPrice / (1 - phi)) + (fiatFee / t.usdt);
  const realizedNetSpread = netExitRev - effectiveBuyCost;

  console.log(`  Max Buy Price: ₦${buyRes.maxBuyPrice.toFixed(2)}, Raw Outbid: ₦${buyRes.rawSuggestedBuy.toFixed(2)}, Suggested: ₦${buyRes.suggestedBuy.toFixed(2)}`);
  console.log(`  Status: ${buyRes.status}, IsSafe: ${buyRes.isSafe}, Effective Cost Basis: ₦${buyRes.feeBreakdown.effectiveCostBasis.toFixed(2)}`);
  console.log(`  Realized Net Spread at Suggested Price: ₦${realizedNetSpread.toFixed(2)}/USDT (Target: ₦${targetSpread.toFixed(2)})`);

  if (t.fiat === 5000 || t.fiat === 10000) {
    // Under Tier 1 & Tier 2, market reference price (1500.10) exceeds maxBuyPrice, so engine MUST compress and cap suggestedBuy
    check(`${t.name}: status must be COMPRESSED when outbid exceeds safe ceiling`, buyRes.status === 'COMPRESSED');
    check(`${t.name}: isSafe must be false`, buyRes.isSafe === false);
    check(`${t.name}: suggestedBuy capped at maxBuyPrice`, approx(buyRes.suggestedBuy, buyRes.maxBuyPrice, 0.001));
  }

  // Verify Mathematical Guarantee: If bought at maxBuyPrice, realized net spread is EXACTLY targetSpread
  const costAtMax = (buyRes.maxBuyPrice / (1 - phi)) + (fiatFee / t.usdt);
  const spreadAtMax = netExitRev - costAtMax;
  check(`${t.name}: Mathematical Invariant - Realized spread at maxBuyPrice == targetSpread`, approx(spreadAtMax, targetSpread, 1e-4), `Got ${spreadAtMax}`);
  console.log('');
}

// -------------------------------------------------------------------------
// 2. LIMIT RECOMMENDATION SENSITIVITY SWEEPS
// -------------------------------------------------------------------------
console.log('--- 2. Limit Recommendation Mathematical Sweeps ---');

const sweepSpreads = [0.5, 1.0, 2.0, 5.0, 10.0, 20.0, 50.0];
const sweepFees = [10, 20, 50, 100, 200, 500];
const sweepDragRatios = [0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.50];

let sweepCount = 0;
for (const s of sweepSpreads) {
  for (const f of sweepFees) {
    for (const r of sweepDragRatios) {
      sweepCount++;
      const res = pricingEngine.calculateRecommendedLimits({
        price: 1500.0,
        targetSpread: s,
        fiatFee: f,
        maxFeeDragRatio: r
      });

      const expectedMinVol = f / (s * r);
      const expectedBreakEvenVol = f / s;

      check(`Sweep ${sweepCount}: minUsdtLimit matches formula`, approx(res.minUsdtLimit, Math.max(2.0, Math.round(expectedMinVol * 100) / 100), 0.01));
      check(`Sweep ${sweepCount}: breakEvenUsdtLimit matches formula`, approx(res.breakEvenUsdtLimit, Math.max(2.0, Math.round(expectedBreakEvenVol * 100) / 100), 0.01));
      check(`Sweep ${sweepCount}: feeDragRatio bounded close to r`, approx(res.feeDragRatio, r, 0.05) || res.minUsdtLimit === 2.0);
    }
  }
}
console.log(`Completed ${sweepCount} parametric limit sweeps.\n`);

// -------------------------------------------------------------------------
// 3. DUST FILTERING BOUNDARY FUZZING & KINK ANALYSIS
// -------------------------------------------------------------------------
console.log('--- 3. Dust Filtering Boundary Fuzzing ---');

// Test kink point at avgVol = 40 (40 * 0.05 = 2.0)
const kinkVolumes = [0.1, 1, 10, 20, 39.99, 40.0, 40.01, 50, 100, 500, 1000];
const epsilons = [1e-1, 1e-3, 1e-6, 1e-9];

for (const vol of kinkVolumes) {
  const expectedThreshold = Math.max(2.0, vol * 0.05);

  for (const eps of epsilons) {
    const below = [{ price: '1500', lastQuantity: String(expectedThreshold - eps) }];
    const exact = [{ price: '1500', lastQuantity: String(expectedThreshold) }];
    const above = [{ price: '1500', lastQuantity: String(expectedThreshold + eps) }];

    const resBelow = pricingEngine.filterCompetitorAds(below, vol, false);
    const resExact = pricingEngine.filterCompetitorAds(exact, vol, false);
    const resAbove = pricingEngine.filterCompetitorAds(above, vol, false);

    check(`Dust filter vol=${vol} eps=${eps}: rejects below threshold`, resBelow.length === 0);
    check(`Dust filter vol=${vol} eps=${eps}: keeps exact threshold`, resExact.length === 1);
    check(`Dust filter vol=${vol} eps=${eps}: keeps above threshold`, resAbove.length === 1);
  }
}

// Fuzzing with edge volume inputs
const badVolumes = [0, -10, -0.001, NaN, Infinity, -Infinity, null, undefined, 'not-a-number'];
for (const badVol of badVolumes) {
  // Should default safely to 100 USDT (threshold = 5.0)
  const ad4 = [{ price: '1500', lastQuantity: '4.9' }];
  const ad5 = [{ price: '1500', lastQuantity: '5.0' }];

  const res4 = pricingEngine.filterCompetitorAds(ad4, badVol, false);
  const res5 = pricingEngine.filterCompetitorAds(ad5, badVol, false);

  check(`Dust filter badVol=${badVol}: rejects 4.9 USDT (defaults to 100 vol)`, res4.length === 0);
  check(`Dust filter badVol=${badVol}: keeps 5.0 USDT (defaults to 100 vol)`, res5.length === 1);
}
console.log('Dust filtering boundary fuzzing completed.\n');

// -------------------------------------------------------------------------
// 4. FEE PERCENTAGE PARAMETER FUZZING & NORMALIZATION
// -------------------------------------------------------------------------
console.log('--- 4. Platform Fee Percentage Parameter Fuzzing ---');

const feeTestCases = [
  { input: 0, expectedPhi: 0 },
  { input: 0.003, expectedPhi: 0.003 },
  { input: 0.3, expectedPhi: 0.003 },
  { input: '0.3', expectedPhi: 0.003 },
  { input: 1.0, expectedPhi: 0.01 },
  { input: 5.0, expectedPhi: 0.05 },
  { input: 100.0, expectedPhi: 1.0 },
  { input: -0.5, expectedPhi: 0 },
  { input: NaN, expectedPhi: 0 },
  { input: null, expectedPhi: 0 },
  { input: undefined, expectedPhi: 0 }
];

for (const tc of feeTestCases) {
  const buyRes = pricingEngine.calculateBuyPricing({
    activeBuyAds: [{ price: '1500', lastQuantity: '100' }],
    sortedSellAds: [{ price: '1520', lastQuantity: '100' }],
    targetSpread: 5.0,
    inflowFee: 0,
    outflowFee: 0,
    platformFeePct: tc.input,
    avgVolume: 100
  });

  const sellRes = pricingEngine.calculateSellPricing({
    activeSellAds: [{ price: '1550', lastQuantity: '100' }],
    costBasis: 1500,
    targetSpread: 5.0,
    outflowFee: 0,
    platformFeePct: tc.input,
    avgVolume: 100
  });

  check(`PlatformFee input=${tc.input}: buy maxBuyPrice is finite`, isFinite(buyRes.maxBuyPrice) && !isNaN(buyRes.maxBuyPrice));
  check(`PlatformFee input=${tc.input}: sell breakEven is finite`, isFinite(sellRes.breakEven) && !isNaN(sellRes.breakEven));
  check(`PlatformFee input=${tc.input}: feeBreakdown is populated`, buyRes.feeBreakdown && sellRes.feeBreakdown);
}
console.log('Platform fee parameter fuzzing completed.\n');

// -------------------------------------------------------------------------
// 5. ORDER BOOK BOUNDARY FUZZING & MALFORMED ADS (5,000 Iterations)
// -------------------------------------------------------------------------
console.log('--- 5. Order Book Boundary & Malformed Ads Fuzzing ---');

let fuzzedPassed = 0;
for (let i = 0; i < 5000; i++) {
  const adCount = Math.floor(Math.random() * 20);
  const ads = [];

  for (let j = 0; j < adCount; j++) {
    const r = Math.random();
    if (r < 0.1) {
      ads.push(null);
    } else if (r < 0.2) {
      ads.push(undefined);
    } else if (r < 0.3) {
      ads.push({ price: 'invalid', lastQuantity: 'NaN' });
    } else if (r < 0.4) {
      ads.push({ price: -1000, lastQuantity: -5 });
    } else {
      ads.push({
        price: (1400 + Math.random() * 200).toFixed(2),
        lastQuantity: (Math.random() * 500).toFixed(4),
        minAmount: Math.random() < 0.5 ? (Math.random() * 50000).toFixed(0) : undefined,
        maxAmount: Math.random() < 0.5 ? (50000 + Math.random() * 500000).toFixed(0) : undefined,
        minSingleTransAmount: Math.random() < 0.5 ? (Math.random() * 50000).toFixed(0) : undefined,
        maxSingleTransAmount: Math.random() < 0.5 ? (50000 + Math.random() * 500000).toFixed(0) : undefined
      });
    }
  }

  const randomVol = Math.random() < 0.2 ? 0 : Math.random() * 500;
  const randomSpread = (Math.random() * 20).toFixed(2);
  const randomFee = (Math.random() * 100).toFixed(0);
  const randomPlatformFee = Math.random() < 0.5 ? 0.3 : (Math.random() * 2).toFixed(2);

  try {
    const filtered = pricingEngine.filterCompetitorAds(ads, randomVol, true);
    const refBuy = pricingEngine.calculateReferencePrice(filtered, 'avg-10');
    const refVwap = pricingEngine.calculateReferencePrice(filtered, 'vwap-5');
    const buyRes = pricingEngine.calculateBuyPricing({
      activeBuyAds: filtered,
      sortedSellAds: filtered,
      targetSpread: Number(randomSpread),
      inflowFee: Number(randomFee),
      outflowFee: Number(randomFee),
      platformFeePct: Number(randomPlatformFee),
      avgVolume: randomVol
    });
    const sellRes = pricingEngine.calculateSellPricing({
      activeSellAds: filtered,
      costBasis: 1500,
      targetSpread: Number(randomSpread),
      outflowFee: Number(randomFee),
      platformFeePct: Number(randomPlatformFee),
      avgVolume: randomVol
    });

    if (!isNaN(refBuy) && !isNaN(refVwap) && buyRes && sellRes) {
      fuzzedPassed++;
    }
  } catch (err) {
    check(`Fuzz iteration ${i} threw error: ${err.message}`, false);
  }
}

check('5,000 randomized orderbook fuzz iterations completed without exceptions', fuzzedPassed === 5000, `Passed: ${fuzzedPassed}/5000`);
console.log(`Completed 5,000 fuzz iterations (${fuzzedPassed}/5000 passed).\n`);

// -------------------------------------------------------------------------
// 6. SUMMARY & VERDICT
// -------------------------------------------------------------------------
console.log('================================================================');
console.log(`TOTAL CHECKS: ${totalChecks}`);
console.log(`PASSED: ${passedChecks}`);
console.log(`FAILED: ${failureLog.length}`);
console.log('================================================================');

if (failureLog.length > 0) {
  console.error('\nFailures:');
  failureLog.forEach(f => console.error(f));
  process.exit(1);
} else {
  console.log('\nALL EMPIRICAL CHECKS PASSED WITH 100% PRECISION.');
  process.exit(0);
}
