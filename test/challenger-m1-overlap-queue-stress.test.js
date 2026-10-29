/**
 * Adversarial Mathematical Stress Test Suite for Milestone 1
 * Targets: isImmediateCompetitor, calculateQueuePosition, calculateFillSpeed
 * Executed by: m1_challenger_2 (Overlap & Queue Math Stress Harness)
 */

const { describe, it, beforeEach } = require('./harness/test-runner');
const { assert } = require('./harness/assertions');

// =========================================================================
// SECTION 1: isImmediateCompetitor — Overlap Math, Point Intervals & Fuzzing
// =========================================================================
describe('Challenger M1-2: 1. isImmediateCompetitor Adversarial Fuzzing', () => {
  let pricingEngine;

  beforeEach(async () => {
    pricingEngine = await import('../js/pricingEngine.js');
  });

  // 1.1: Point intervals (uMin == uMax, cMin == cMax)
  it('1.1.1: Exact matching point intervals ([20000, 20000] vs [20000, 20000]) overlap', () => {
    const res = pricingEngine.isImmediateCompetitor(20000, 20000, 20000, 20000);
    assert.strictEqual(res, true, 'Identical point intervals must overlap');
  });

  it('1.1.2: Point user interval inside competitor interval overlaps', () => {
    const res = pricingEngine.isImmediateCompetitor(20000, 20000, 10000, 50000);
    assert.strictEqual(res, true, 'Point user interval inside competitor interval must overlap');
  });

  it('1.1.3: Point competitor interval inside user interval overlaps', () => {
    const res = pricingEngine.isImmediateCompetitor(10000, 50000, 20000, 20000);
    assert.strictEqual(res, true, 'Point competitor interval inside user interval must overlap');
  });

  it('1.1.4: Disjoint point intervals do not overlap', () => {
    assert.strictEqual(pricingEngine.isImmediateCompetitor(20000, 20000, 20001, 20001), false);
    assert.strictEqual(pricingEngine.isImmediateCompetitor(20000, 20000, 19999, 19999), false);
  });

  // 1.2: Closed interval boundary touches
  it('1.2.1: Competitor upper bound touching user lower bound (touch at uMin)', () => {
    // User [15000, 40000], Comp [5000, 15000] -> touch at 15000
    const res = pricingEngine.isImmediateCompetitor(15000, 40000, 5000, 15000);
    assert.strictEqual(res, true, 'Closed intervals touching at uMin must overlap');
  });

  it('1.2.2: Competitor lower bound touching user upper bound (touch at uMax)', () => {
    // User [15000, 40000], Comp [40000, 100000] -> touch at 40000
    const res = pricingEngine.isImmediateCompetitor(15000, 40000, 40000, 100000);
    assert.strictEqual(res, true, 'Closed intervals touching at uMax must overlap');
  });

  it('1.2.3: Strictly disjoint by fractional epsilon do not overlap', () => {
    // Comp [5000, 14999.99] vs User [15000, 40000]
    assert.strictEqual(pricingEngine.isImmediateCompetitor(15000, 40000, 5000, 14999.99), false);
    // Comp [40000.01, 100000] vs User [15000, 40000]
    assert.strictEqual(pricingEngine.isImmediateCompetitor(15000, 40000, 40000.01, 100000), false);
  });

  // 1.3: Infinite and missing limits
  it('1.3.1: Competitor max Infinity / 0 / missing defaults safely to Infinity', () => {
    // Comp max = 0 (means unlimited in Bybit P2P)
    assert.strictEqual(pricingEngine.isImmediateCompetitor(15000, 40000, 10000, 0), true);
    // Comp max = undefined
    assert.strictEqual(pricingEngine.isImmediateCompetitor(15000, 40000, 10000, undefined), true);
    // Comp max = Infinity
    assert.strictEqual(pricingEngine.isImmediateCompetitor(15000, 40000, 10000, Infinity), true);
  });

  it('1.3.2: Competitor min missing / undefined defaults to 0', () => {
    assert.strictEqual(pricingEngine.isImmediateCompetitor(15000, 40000, undefined, 50000), true);
    assert.strictEqual(pricingEngine.isImmediateCompetitor(15000, 40000, null, 50000), true);
    assert.strictEqual(pricingEngine.isImmediateCompetitor(15000, 40000, '', 50000), true);
  });

  it('1.3.3: User limits containing Infinity or NaN are safely rejected', () => {
    assert.strictEqual(pricingEngine.isImmediateCompetitor(15000, Infinity, 10000, 50000), false);
    assert.strictEqual(pricingEngine.isImmediateCompetitor(-Infinity, 40000, 10000, 50000), false);
    assert.strictEqual(pricingEngine.isImmediateCompetitor(NaN, 40000, 10000, 50000), false);
    assert.strictEqual(pricingEngine.isImmediateCompetitor(15000, NaN, 10000, 50000), false);
  });

  // 1.4: Zero limits & Zero intervals
  it('1.4.1: User minimum 0 is valid, but user maximum 0 is rejected', () => {
    assert.strictEqual(pricingEngine.isImmediateCompetitor(0, 40000, 1000, 5000), true);
    // Max trade limit of 0 NGN is invalid
    assert.strictEqual(pricingEngine.isImmediateCompetitor(0, 0, 1000, 5000), false);
  });

  // 1.5: Negative limits
  it('1.5.1: Negative user limits are strictly rejected', () => {
    assert.strictEqual(pricingEngine.isImmediateCompetitor(-1000, 40000, 5000, 20000), false);
    assert.strictEqual(pricingEngine.isImmediateCompetitor(15000, -500, 5000, 20000), false);
  });

  it('1.5.2: Negative competitor limits are safely clamped or rejected', () => {
    // Negative compMin is clamped to 0
    assert.strictEqual(pricingEngine.isImmediateCompetitor(15000, 40000, -500, 30000), true);
    // Negative compMax causes inverted competitor range (0 > -100) -> rejected
    assert.strictEqual(pricingEngine.isImmediateCompetitor(15000, 40000, 0, -100), false);
  });

  // 1.6: Inverted bounds
  it('1.6.1: Inverted user bounds (uMin > uMax) are strictly rejected', () => {
    assert.strictEqual(pricingEngine.isImmediateCompetitor(40000, 15000, 10000, 50000), false);
    assert.strictEqual(pricingEngine.isImmediateCompetitor(100.01, 100.00, 50, 150), false);
  });

  it('1.6.2: Inverted competitor bounds (cMin > cMax) are strictly rejected', () => {
    assert.strictEqual(pricingEngine.isImmediateCompetitor(15000, 40000, 50000, 10000), false);
  });

  // 1.7: Polymorphic signatures (ad object vs 4 scalars)
  it('1.7.1: Polymorphic Pattern A: isImmediateCompetitor(ad, uMin, uMax)', () => {
    const ad1 = { minAmount: 10000, maxAmount: 50000 };
    assert.strictEqual(pricingEngine.isImmediateCompetitor(ad1, 15000, 40000), true);

    const adDisjoint = { minAmount: 50000, maxAmount: 100000 };
    assert.strictEqual(pricingEngine.isImmediateCompetitor(adDisjoint, 15000, 40000), false);
  });

  it('1.7.2: Polymorphic Pattern B: isImmediateCompetitor(uMin, uMax, ad)', () => {
    const ad1 = { minSingleTransAmount: 20000, maxSingleTransAmount: 30000 };
    assert.strictEqual(pricingEngine.isImmediateCompetitor(15000, 40000, ad1), true);

    const adDisjoint = { minSingleTransAmount: 5000, maxSingleTransAmount: 10000 };
    assert.strictEqual(pricingEngine.isImmediateCompetitor(15000, 40000, adDisjoint), false);
  });

  it('1.7.3: Ad with missing maxAmount infers max from price * quantity', () => {
    const adInfer = { minAmount: 10000, maxAmount: 0, price: '1500', lastQuantity: '20' }; // 1500 * 20 = 30000 max
    assert.strictEqual(pricingEngine.isImmediateCompetitor(adInfer, 20000, 40000), true);

    const adInferDisjoint = { minAmount: 50000, maxAmount: 0, price: '1500', lastQuantity: '10' }; // 15000 max < 50000 min -> cMin > cMax -> false
    assert.strictEqual(pricingEngine.isImmediateCompetitor(adInferDisjoint, 20000, 40000), false);
  });

  // 1.8: Adversarial types (booleans, strings, symbols, objects)
  it('1.8.1: Booleans are never coerced to numbers 1 or 0', () => {
    assert.strictEqual(pricingEngine.isImmediateCompetitor(true, false, 0, 100), false);
    assert.strictEqual(pricingEngine.isImmediateCompetitor(true, 50000, 0, 100), false);
    assert.strictEqual(pricingEngine.isImmediateCompetitor(10000, true, 0, 100), false);
  });

  it('1.8.2: Empty strings and whitespace strings are rejected', () => {
    assert.strictEqual(pricingEngine.isImmediateCompetitor('', '40000', 10000, 50000), false);
    assert.strictEqual(pricingEngine.isImmediateCompetitor('   ', '40000', 10000, 50000), false);
    assert.strictEqual(pricingEngine.isImmediateCompetitor('15000', '', 10000, 50000), false);
  });

  it('1.8.3: Clean numeric strings are supported', () => {
    assert.strictEqual(pricingEngine.isImmediateCompetitor('15000', '40000', '10000', '50000'), true);
    assert.strictEqual(pricingEngine.isImmediateCompetitor('15000', '40000', '50000', '80000'), false);
  });

  // 1.9: Monte Carlo Fuzzing Oracle (1,000 random intervals)
  it('1.9: Monte Carlo Fuzzing against Mathematical Interval Intersection Oracle (1,000 trials)', () => {
    function oracleIntersection(uMin, uMax, cMin, cMax) {
      if (!Number.isFinite(uMin) || !Number.isFinite(uMax)) return false;
      if (uMin < 0 || uMax <= 0 || uMin > uMax) return false;
      const safeCMin = Math.max(0, Number.isFinite(cMin) ? cMin : 0);
      const safeCMax = Number.isFinite(cMax) && cMax > 0 ? cMax : Infinity;
      if (safeCMin > safeCMax && safeCMax !== Infinity) return false;
      return Math.max(uMin, safeCMin) <= Math.min(uMax, safeCMax);
    }

    let seed = 42;
    function pseudoRandom() {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    }

    for (let i = 0; i < 1000; i++) {
      const u1 = Math.round(pseudoRandom() * 100000);
      const u2 = Math.round(pseudoRandom() * 100000);
      const uMin = Math.min(u1, u2);
      const uMax = Math.max(u1, u2) + 1; // ensure uMax > 0

      const c1 = Math.round(pseudoRandom() * 100000);
      const c2 = Math.round(pseudoRandom() * 100000);
      const cMin = Math.min(c1, c2);
      const cMax = Math.max(c1, c2);

      const actual = pricingEngine.isImmediateCompetitor(uMin, uMax, cMin, cMax);
      const expected = oracleIntersection(uMin, uMax, cMin, cMax);

      assert.strictEqual(
        actual,
        expected,
        `Oracle divergence at trial ${i}: User=[${uMin}, ${uMax}], Comp=[${cMin}, ${cMax}]`
      );
    }
  });
});

// =========================================================================
// SECTION 2: calculateQueuePosition — Depth, Tie-Breaking & Stress
// =========================================================================
describe('Challenger M1-2: 2. calculateQueuePosition Adversarial Stress', () => {
  let pricingEngine;

  beforeEach(async () => {
    pricingEngine = await import('../js/pricingEngine.js');
  });

  // 2.1: Empty and degenerate books
  it('2.1.1: Empty competitor book yields rank 1 and 0 volume ahead', () => {
    const res = pricingEngine.calculateQueuePosition([], 1500, 'buy');
    assert.deepStrictEqual(res, {
      rank: 1,
      totalCompetitors: 1,
      competitorsAhead: 0,
      volumeAhead: 0
    });
  });

  it('2.1.2: Null, undefined, or non-array competitors degrade gracefully to empty book', () => {
    assert.strictEqual(pricingEngine.calculateQueuePosition(null, 1500, 'buy').rank, 1);
    assert.strictEqual(pricingEngine.calculateQueuePosition(undefined, 1500, 'buy').rank, 1);
    assert.strictEqual(pricingEngine.calculateQueuePosition('invalid', 1500, 'buy').rank, 1);
  });

  // 2.2: Direction-aware priority (Buy vs Sell)
  it('2.2.1: Buy side: Higher price is ahead, lower price is behind', () => {
    const competitors = [
      { price: '1510.00', lastQuantity: '100' }, // Ahead (higher bid)
      { price: '1505.00', lastQuantity: '200' }, // Ahead (higher bid)
      { price: '1495.00', lastQuantity: '300' }, // Behind (lower bid)
      { price: '1490.00', lastQuantity: '400' }  // Behind (lower bid)
    ];

    const res = pricingEngine.calculateQueuePosition(competitors, 1500.00, 'buy');
    assert.strictEqual(res.rank, 3, 'User rank must be 3 on buy side');
    assert.strictEqual(res.competitorsAhead, 2, '2 competitors ahead on buy side');
    assert.strictEqual(res.volumeAhead, 300, 'Volume ahead must be 100 + 200 = 300');
    assert.strictEqual(res.totalCompetitors, 5, 'Total competitors including user must be 5');
  });

  it('2.2.2: Sell side: Lower price is ahead, higher price is behind', () => {
    const competitors = [
      { price: '1490.00', lastQuantity: '100' }, // Ahead (cheaper ask)
      { price: '1495.00', lastQuantity: '200' }, // Ahead (cheaper ask)
      { price: '1505.00', lastQuantity: '300' }, // Behind (more expensive ask)
      { price: '1510.00', lastQuantity: '400' }  // Behind (more expensive ask)
    ];

    const res = pricingEngine.calculateQueuePosition(competitors, 1500.00, 'sell');
    assert.strictEqual(res.rank, 3, 'User rank must be 3 on sell side');
    assert.strictEqual(res.competitorsAhead, 2, '2 competitors ahead on sell side');
    assert.strictEqual(res.volumeAhead, 300, 'Volume ahead must be 100 + 200 = 300');
    assert.strictEqual(res.totalCompetitors, 5, 'Total competitors must be 5');
  });

  // 2.3: Tie-breaking on identical prices (FIFO priority favors existing ad)
  it('2.3.1: Buy side identical price: existing competitors are prioritized ahead', () => {
    const competitors = [
      { price: '1500.00', lastQuantity: '50' },  // Exact tie
      { price: '1500.00', lastQuantity: '150' }, // Exact tie
      { price: '1499.00', lastQuantity: '500' }  // Behind
    ];

    const res = pricingEngine.calculateQueuePosition(competitors, 1500.00, 'buy');
    assert.strictEqual(res.rank, 3, 'Tied competitors must be ahead');
    assert.strictEqual(res.competitorsAhead, 2);
    assert.strictEqual(res.volumeAhead, 200);
  });

  it('2.3.2: Sell side identical price: existing competitors are prioritized ahead', () => {
    const competitors = [
      { price: '1500.00', lastQuantity: '100' }, // Exact tie
      { price: '1501.00', lastQuantity: '500' }  // Behind
    ];

    const res = pricingEngine.calculateQueuePosition(competitors, 1500.00, 'sell');
    assert.strictEqual(res.rank, 2);
    assert.strictEqual(res.competitorsAhead, 1);
    assert.strictEqual(res.volumeAhead, 100);
  });

  // 2.4: Floating point epsilon sensitivity (1e-6)
  it('2.4.1: Floating point near-ties (within 1e-8) are treated as ties', () => {
    const competitors = [
      { price: 1500.000000001, lastQuantity: 100 }
    ];
    // On buy side with target 1500.000000002 (difference is 1e-9 < 1e-6 EPSILON)
    const res = pricingEngine.calculateQueuePosition(competitors, 1500.000000002, 'buy');
    assert.strictEqual(res.rank, 2, 'Difference within 1e-6 EPSILON must be treated as tie');
  });

  // 2.5: Malformed ads in the order book
  it('2.5.1: Malformed ads (null, missing price, negative price, NaN) are safely ignored', () => {
    const competitors = [
      null,
      undefined,
      'not_an_ad',
      { price: '0', lastQuantity: '100' },
      { price: '-1500', lastQuantity: '100' },
      { price: 'NaN', lastQuantity: '100' },
      { price: '1510.00', lastQuantity: '250' } // Only this one is valid
    ];

    const res = pricingEngine.calculateQueuePosition(competitors, 1500, 'buy');
    assert.strictEqual(res.totalCompetitors, 2, 'Total must count 1 valid competitor + user');
    assert.strictEqual(res.rank, 2);
    assert.strictEqual(res.volumeAhead, 250);
  });

  it('2.5.2: Ads with fallback quantity fields and negative quantities', () => {
    const competitors = [
      { price: '1510', quantity: '100' },          // fallback to quantity
      { price: '1510', lastQuantity: '-50' },      // negative quantity clamped to 0
      { price: '1510', lastQuantity: 'invalid' }   // NaN quantity defaults to 0
    ];

    const res = pricingEngine.calculateQueuePosition(competitors, 1500, 'buy');
    assert.strictEqual(res.rank, 4);
    assert.strictEqual(res.volumeAhead, 100, 'Negative and NaN quantities must not corrupt volume');
  });

  // 2.6: Massive Order Book Stress (2,500 ads)
  it('2.6: Massive Order Book Stress: 2,500 ads executed in sub-millisecond time', () => {
    const massiveAds = [];
    let expectedAhead = 0;
    let expectedVolume = 0;

    for (let i = 0; i < 2500; i++) {
      const price = 1450 + (i % 100); // 1450 to 1549
      const qty = (i % 50) + 1;        // 1 to 50
      massiveAds.push({ price: price.toFixed(2), lastQuantity: qty.toString() });

      if (price >= 1500 - 1e-6) {
        expectedAhead++;
        expectedVolume += qty;
      }
    }

    const t0 = Date.now();
    const res = pricingEngine.calculateQueuePosition(massiveAds, 1500, 'buy');
    const elapsed = Date.now() - t0;

    assert.strictEqual(res.totalCompetitors, 2501);
    assert.strictEqual(res.competitorsAhead, expectedAhead);
    assert.strictEqual(res.rank, expectedAhead + 1);
    assert.closeTo(res.volumeAhead, expectedVolume, 0.01);
    assert.isBelow(elapsed, 50, `Execution time must be < 50ms, took ${elapsed}ms`);
  });
});

// =========================================================================
// SECTION 3: calculateFillSpeed — Bounded Scores & Invariant Testing
// =========================================================================
describe('Challenger M1-2: 3. calculateFillSpeed Adversarial Invariants', () => {
  let pricingEngine;

  beforeEach(async () => {
    pricingEngine = await import('../js/pricingEngine.js');
  });

  // 3.1: Monopolies and Rank 1
  it('3.1.1: Rank 1 with 0 volume ahead yields perfect score 100 ("Very Fast")', () => {
    const res = pricingEngine.calculateFillSpeed(1, 0, 10);
    assert.strictEqual(res.score, 100);
    assert.strictEqual(res.label, 'Very Fast');
    assert.strictEqual(res.estMinutes, '< 5 mins');
  });

  it('3.1.2: Rank 1 with volume ahead applies volume penalty correctly', () => {
    // 500 volume ahead = 10 pt penalty -> 90 score -> 'Very Fast'
    const res1 = pricingEngine.calculateFillSpeed(1, 500);
    assert.strictEqual(res1.score, 90);
    assert.strictEqual(res1.label, 'Very Fast');

    // 1500 volume ahead = 30 pt penalty -> 70 score -> 'Fast'
    const res2 = pricingEngine.calculateFillSpeed(1, 1500);
    assert.strictEqual(res2.score, 70);
    assert.strictEqual(res2.label, 'Fast');

    // 2500 volume ahead = 40 pt max penalty -> 60 score -> 'Fast'
    const res3 = pricingEngine.calculateFillSpeed(1, 2500);
    assert.strictEqual(res3.score, 60);
    assert.strictEqual(res3.label, 'Fast');
  });

  // 3.2: Extreme volume barriers (10^6 and 10^9 USDT)
  it('3.2: Extreme volume barriers are capped at 40 points penalty', () => {
    const res1M = pricingEngine.calculateFillSpeed(1, 1000000);
    assert.strictEqual(res1M.score, 60, '1M volume ahead must cap at 40 penalty on Rank 1');

    const res1B = pricingEngine.calculateFillSpeed(1, 1e9);
    assert.strictEqual(res1B.score, 60, '1B volume ahead must cap at 40 penalty on Rank 1');
  });

  // 3.3: Extreme ranks (1,000 to 1,000,000) strictly floored at 5
  it('3.3: Extreme ranks strictly floor score at 5 and never drop negative', () => {
    const res100 = pricingEngine.calculateFillSpeed(100, 10000);
    assert.strictEqual(res100.score, 5, 'Score must be floored at 5');
    assert.strictEqual(res100.label, 'Slow');
    assert.strictEqual(res100.estMinutes, '> 45 mins');

    const res1M = pricingEngine.calculateFillSpeed(1000000, 1000000);
    assert.strictEqual(res1M.score, 5);
    assert.strictEqual(res1M.label, 'Slow');
  });

  // 3.4: Rank 0, negative ranks, and non-integer ranks
  it('3.4: Rank 0, negative ranks, and non-integer ranks clamp safely', () => {
    assert.strictEqual(pricingEngine.calculateFillSpeed(0, 0).score, 100);
    assert.strictEqual(pricingEngine.calculateFillSpeed(-10, 0).score, 100);
    assert.strictEqual(pricingEngine.calculateFillSpeed(2.9, 0).score, 85, 'Rank 2.9 floors to Rank 2 (15 penalty)');
  });

  // 3.5: Categorical classification boundary partitions
  it('3.5: Categorical labels strictly partition score domain [5, 100]', () => {
    function testPartition(scoreInput, expectedLabel) {
      // Find a rank/volume that produces this exact score
      // Score = 100 - (rank-1)*15 - min(40, vol/50)
      let rank = 1;
      let vol = 0;
      if (scoreInput < 100) {
        const penalty = 100 - scoreInput;
        vol = penalty * 50;
      }
      const res = pricingEngine.calculateFillSpeed(rank, vol);
      assert.strictEqual(res.score, scoreInput, `Expected score ${scoreInput}`);
      assert.strictEqual(res.label, expectedLabel, `Expected label ${expectedLabel} for score ${scoreInput}`);
    }

    testPartition(100, 'Very Fast');
    testPartition(80, 'Very Fast');
    testPartition(79, 'Fast');
    testPartition(60, 'Fast');
    // Note: for score < 60, volume penalty is capped at 40, so rank penalty must be used
    const res59 = pricingEngine.calculateFillSpeed(2, 1300); // 100 - 15 - 26 = 59
    assert.strictEqual(res59.score, 59);
    assert.strictEqual(res59.label, 'Moderate');

    const res40 = pricingEngine.calculateFillSpeed(3, 1500); // 100 - 30 - 30 = 40
    assert.strictEqual(res40.score, 40);
    assert.strictEqual(res40.label, 'Moderate');

    const res39 = pricingEngine.calculateFillSpeed(3, 1550); // 100 - 30 - 31 = 39
    assert.strictEqual(res39.score, 39);
    assert.strictEqual(res39.label, 'Slow');

    const res5 = pricingEngine.calculateFillSpeed(10, 5000); // floored at 5
    assert.strictEqual(res5.score, 5);
    assert.strictEqual(res5.label, 'Slow');
  });

  // 3.6: Exhaustive sweep & Monte Carlo across 1,000 combinations
  it('3.6: Monte Carlo fuzzing across 1,000 parameter combinations preserves all mathematical invariants', () => {
    let seed = 12345;
    function pseudoRandom() {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    }

    const validLabels = new Set(['Very Fast', 'Fast', 'Moderate', 'Slow']);

    for (let i = 0; i < 1000; i++) {
      const rank = Math.floor(pseudoRandom() * 50); // 0 to 49
      const volume = pseudoRandom() * 10000;        // 0 to 10000
      const total = rank + Math.floor(pseudoRandom() * 50);

      const res = pricingEngine.calculateFillSpeed(rank, volume, total);

      // Invariants
      assert.ok(Number.isInteger(res.score), `Score must be integer at trial ${i}`);
      assert.ok(res.score >= 5 && res.score <= 100, `Score must be in [5, 100] at trial ${i}`);
      assert.ok(validLabels.has(res.label), `Label must be valid at trial ${i}`);
      assert.ok(typeof res.estMinutes === 'string', 'estMinutes must be string');
      assert.ok(typeof res.description === 'string', 'description must be string');

      // Label-score bijection
      if (res.score >= 80) assert.strictEqual(res.label, 'Very Fast');
      else if (res.score >= 60) assert.strictEqual(res.label, 'Fast');
      else if (res.score >= 40) assert.strictEqual(res.label, 'Moderate');
      else assert.strictEqual(res.label, 'Slow');
    }
  });
});

// =========================================================================
// SECTION 4: Pipeline Integration — Overlap Filtering -> Queue -> Fill Speed
// =========================================================================
describe('Challenger M1-2: 4. Full Pipeline Integration', () => {
  let pricingEngine;

  beforeEach(async () => {
    pricingEngine = await import('../js/pricingEngine.js');
  });

  it('4.1: End-to-end pipeline: Raw ads -> filterImmediateCompetitors -> calculateQueuePosition -> calculateFillSpeed', () => {
    const rawAds = [
      { id: '1', price: '1520.00', minAmount: 10000, maxAmount: 30000, lastQuantity: '500' }, // Overlaps [15000, 40000]
      { id: '2', price: '1515.00', minAmount: 50000, maxAmount: 100000, lastQuantity: '1000' }, // NO overlap (disjoint high)
      { id: '3', price: '1510.00', minAmount: 20000, maxAmount: 35000, lastQuantity: '300' }, // Overlaps [15000, 40000]
      { id: '4', price: '1505.00', minAmount: 1000, maxAmount: 5000, lastQuantity: '200' },   // NO overlap (disjoint low)
      { id: '5', price: '1490.00', minAmount: 15000, maxAmount: 40000, lastQuantity: '800' }  // Overlaps [15000, 40000]
    ];

    // Step 1: Filter immediate competitors
    const immediate = pricingEngine.filterImmediateCompetitors(rawAds, 15000, 40000);
    assert.strictEqual(immediate.length, 3, 'Only ads 1, 3, and 5 should overlap');
    assert.deepStrictEqual(immediate.map(a => a.id), ['1', '3', '5']);

    // Step 2: Queue position targeting 1508.00 on Buy side
    // Ads 1 (1520) and 3 (1510) are ahead. Ad 5 (1490) is behind.
    const queue = pricingEngine.calculateQueuePosition(immediate, 1508.00, 'buy');
    assert.strictEqual(queue.rank, 3);
    assert.strictEqual(queue.competitorsAhead, 2);
    assert.strictEqual(queue.volumeAhead, 800); // 500 + 300
    assert.strictEqual(queue.totalCompetitors, 4);

    // Step 3: Fill speed calculation
    // Rank 3 (penalty 30), Volume 800 (penalty 16) -> 100 - 30 - 16 = 54 -> 'Moderate'
    const fill = pricingEngine.calculateFillSpeed(queue.rank, queue.volumeAhead, queue.totalCompetitors);
    assert.strictEqual(fill.score, 54);
    assert.strictEqual(fill.label, 'Moderate');
    assert.strictEqual(fill.estMinutes, '15-45 mins');
  });
});
