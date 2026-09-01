# Challenge Report — Iteration 2 Boundary & Lifecycle Verification

## Challenge Summary

- **Overall Risk Assessment**: LOW
- **Verdict**: **APPROVE**
- **Iteration**: Iteration 2 (Pricing & Arbitrage Assistant Refactoring)

---

## Challenges & Empirical Findings

### [Low] Challenge 1: Sub-40 USDT Dust Floor Clamping & Scaling
- **Assumption Challenged**: `filterCompetitorAds` dust calculation could fail to protect against sub-2.0 USDT dust when target trade volume is small ($avgVolume < 40$) or over-filter institutional volumes.
- **Attack Scenario**: Evaluated volume extremes ($0.01, 0.5, 1, 5, 10, 20, 39.9, 40, 100, 500, 1000, 10000$ USDT) and tested boundary quantities with infinitesimal perturbations $threshold \pm \epsilon$ ($\epsilon \in [10^{-1}, 10^{-12}]$).
- **Blast Radius**: Inclusion of micro-dust ads could distort top competitor rate or volume-weighted average price (VWAP) calculation.
- **Mitigation**: `js/pricingEngine.js` strictly applies `minQty = Math.max(2, safeAvgVol * 0.05)` and safely falls back invalid/non-positive volumes to $100$ USDT.
- **Stress Test Result**: **PASS**. 2,000 randomized ad collections verified against mathematical dust oracle with 100% parity.

---

### [Low] Challenge 2: Single-Sided and Alternate Field Trade Limits
- **Assumption Challenged**: Competitor ads specifying only `minAmount`, only `maxAmount`, alternate Bybit keys (`minSingleTransAmount`, `maxSingleTransAmount`), or opting out via `filterLimits: false` might be improperly filtered.
- **Attack Scenario**: Fuzzed 2,000 trade limit configurations across single-sided limits, zero limits, boundary-equal trade amounts ($tradeAmount = safeAvgVol \times price$), and filter bypasses.
- **Blast Radius**: Inadvertent competitor ad exclusion or inclusion, altering reference price benchmarks.
- **Mitigation**: Filter logic cleanly checks `ad.minAmount || ad.minSingleTransAmount` and `ad.maxAmount || ad.maxSingleTransAmount` and allows complete bypass when `filterLimits === false`.
- **Stress Test Result**: **PASS**. 2,000 randomized limit trials matched oracle predictions with zero discrepancies.

---

### [Low] Challenge 3: Extreme Volatility, Spread Compression, and Crash Scenarios
- **Assumption Challenged**: Under sharp market movements (e.g., aggressive competitor bids exceeding market exit price, or competitor sells crashing below FIFO cost basis), suggested rates could cause trades at negative spreads or financial losses.
- **Attack Scenario**: Simulated 5,000 Monte Carlo market depths with randomized buy/sell prices, wide spreads, negative target spreads, and oversized fintech fees.
- **Blast Radius**: Severe capital loss if suggested rates bypassed spread protection caps or floors.
- **Mitigation**: Mathematical invariant gates:
  - Buy Gate: `suggestedBuy = Math.min(rawSuggestedBuy, maxBuyPrice)` ensures `suggestedBuy <= maxBuyPrice` with `isSafe: false` when compressed.
  - Sell Gate: `suggestedSell = Math.max(rawSuggestedSell, targetSellPrice)` ensures `suggestedSell >= targetSellPrice` with `isSafe: false` when compressed.
- **Stress Test Result**: **PASS**. Zero invariant violations across 5,000 Monte Carlo trials.

---

### [Low] Challenge 4: Consecutive Multi-Lot Arbitrage Cycle with Dynamic FIFO Tracking
- **Assumption Challenged**: Continuous round-trip executions might desynchronize FIFO cost basis, produce lingering inventory fragments, or generate NaN profit values.
- **Attack Scenario**: Executed 100 consecutive buy & sell cycles with trending price curves, variable fintech fees, multi-lot blended cost accumulation, and asymmetric partial liquidations.
- **Blast Radius**: Miscalculated inventory cost basis propagating into invalid sell pricing floors.
- **Mitigation**: Verified end-to-end integration between `pricingEngine`, `calculateFIFOInventoryAndPnL`, and trade execution ledger.
- **Stress Test Result**: **PASS**. All 100 cycles completed with exact zero remaining inventory, consistent positive realized PnL, and valid non-NaN margin values.

---

### [Low] Challenge 5: UI Perspective, Badges, and Order Book Interaction Consistency
- **Assumption Challenged**: Taker vs. Maker perspectives and orderbook click-to-trade directions might be inverted or confusing in the UI.
- **Attack Scenario**: Verified rendered HTML DOM from `renderPricingView()`, tested element IDs, inspected badge CSS classes (`badge-primary`, `badge-success`, `badge-danger`, `badge-neutral`), and verified event prefill directions.
- **Blast Radius**: Trader confusion leading to inverted trade execution on Bybit P2P.
- **Mitigation**:
  - Buy Ad Assistant clearly marked `<span class="badge badge-primary">Inflow</span>` with explanatory note that it appears under Bybit P2P **"Sell"** tab for takers.
  - Sell Ad Assistant clearly marked `<span class="badge badge-primary">Outflow</span>` with explanatory note that it appears under Bybit P2P **"Buy"** tab for takers.
  - Buy Order Book (Market Bids) rows prefill `SELL` trades (selling into high bids).
  - Sell Order Book (Market Asks) rows prefill `BUY` trades (buying from low asks).
- **Stress Test Result**: **PASS**. All 23 mandatory DOM element IDs and interaction handlers verified.

---

## Stress Test Results Summary

| Test Category | Suite / Scenario | Trials / Assertions | Result |
|---|---|:---:|:---:|
| Dust Filtering Boundaries | $threshold \pm \epsilon$ with $\epsilon \in [10^{-1}, 10^{-12}]$ | 15 boundary checks | **PASS** |
| Dust Fuzzing Oracle | 2,000 randomized collections | 2,000 trials | **PASS** |
| Limit Boundaries & Bypasses | Exact matches & single-sided limits | 12 boundary checks | **PASS** |
| Limit Fuzzing Oracle | 2,000 randomized limit bounds | 2,000 trials | **PASS** |
| Safety Invariants (Buy Cap) | $suggestedBuy \le maxBuyPrice$ | 5,000 Monte Carlo states | **PASS** |
| Safety Invariants (Sell Floor) | $suggestedSell \ge targetSellPrice$ | 5,000 Monte Carlo states | **PASS** |
| Arbitrage Lifecycle | 100 continuous buy/sell cycles + FIFO | 100 full round-trips | **PASS** |
| Multi-lot Blended FIFO | 3-lot accumulation + partial sale | 5 state assertions | **PASS** |
| UI Elements & Badges | DOM structure, IDs, classes & prefill | 23 element assertions | **PASS** |
| Tier 1 Pricing Engine Tests | `pricing-engine.test.js` | 26 tests | **PASS** |

---

## Unchallenged Areas

- **Historical Snapshot Charts & Legacy Deletion Reactivity** (Milestone 4 legacy tests): 9 failing tests in older test files (`r4-m4-historical-analytics.test.js`, `challenger-m4-2-history-backup-stress.test.js`, `active-buy-sell-ads.test.js`) pertain to historical snapshot deletion reactivity and active ad status formatting from prior milestones; they do not impact the Pricing & Arbitrage Engine domain or the Iteration 2 scope.
