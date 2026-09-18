# Project: P2P Arbitrage & Pricing Engine Redesign

## Architecture
- **Pricing Engine (`js/pricingEngine.js`)**: Pure mathematical module providing deterministic P2P arbitrage pricing, Bybit maker fee modeling (0.3% buy side, 0% sell side), Nigerian fiat fee accounting (₦50 stamp duty), Rank 3–5 median/cluster sweet spots, safe buy ceiling clamping, and volume-weighted guidance.
- **Pricing Controller (`js/pricing.js`)**: Coordinates live Bybit P2P order book depth fetching (`cachedMarketDepth`), FIFO inventory basis (`avgHoldingCostPerUSDT`), parameter synchronization, DOM event listeners, and UI state reactivity.
- **Pricing View (`js/views/pricing.view.js`)**: Renders the responsive single-focus pricing interface, high-contrast Buy/Sell recommendation cards with 1-click copy buttons, preserved mobile buyback session progress bar, 6-card metrics grid, market guidance diagnostics banner, 3-tier limit ladder cards, and order book depth tables with visual placement markers.
- **Testing Track (`test/`)**: Automated Node.js test runner (`node test/run-tests.js`) verifying 758 baseline tests across 5 tiers plus new sweet-spot test suite (`test/tier1-feature-coverage/sweet-spot-pricing.test.js`).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Sell Sweet Spot Calculation | Compute optimal competitive sell rate targeting Rank 3–5 median/cluster in sellDepth with graceful degradation | M1 | R1.1 |
| 2 | Safe Buy Ceiling Calculation | Compute maxBuyPrice strictly netting 0.3% maker fee and ₦50 stamp duty: 0.997 * (P_sell - Target - 50/V) | M1 | R1.2 |
| 3 | Spread Compression Handling | Detect when market buy sweet spot > maxBuyPrice, cap suggested buy at maxBuyPrice, flag COMPRESSED status | M1 | R1.2 |
| 4 | Average Buy Guidance & Anchoring | Compute required rate for remaining volume to lock cycle profit; anchor 3-tier limit ladder (40/40/20) to this rate | M1 | R1.3 |
| 5 | Streamlined Single-Focus Input UI | Single primary input for Profit Target (₦/USDT) + Volume Goal; sync with legacy input IDs | M2 | R2.1 |
| 6 | High-Contrast Recommendation Cards | Buy and Sell sweet spot cards with 1-click copy buttons and status badges unhidden from display:none | M2 | R2.2 |
| 7 | Legacy Markup & Toggle Cleanup | Remove display:none blocks; place secondary test-required inputs into collapsible `<details>` | M2 | R2.3 |
| 8 | Preserved 5 Mobile UI Components | Keep Buyback Progress Bar, 6-Card Metrics Grid, Guidance Banner, 3-Tier Ladder, and Depth Tables active & reactive | M2 | User Directive 08:26:31Z |
| 9 | Visual Order Book Markers | Highlight Rank 3-5 sweet spot rows with classes and inline badges without altering .orderbook-row count | M2 | R3 |
| 10 | FIFO & Modal Trade Prefill Consistency | Ensure order book row clicks trigger window.prefillTradeForm with correct directions and rates | M3 | R4 |
| 11 | Comprehensive Automated Test Suite | Add sweet-spot-pricing.test.js covering all R1-R4 requirements; ensure 100% passing across all 758+ tests | M3 | R4 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Single-Target Sweet Spot Pricing Engine Core | Implement `calculateSweetSpotPricing` in `js/pricingEngine.js` with full mathematical rigor, fee amortization, and tier anchoring | none | BLOCKED: Boundary defects identified by Challenger 2 |
| M2 | Streamlined Pricing UI & Visual Markers | Refactor `js/views/pricing.view.js`, `js/pricing.js`, and styling to streamline UI, preserve 5 mobile components, and add visual markers | M1 | PLANNED |
| M3 | Integration Consistency & Full Test Verification | Add new sweet-spot test suite, verify FIFO and trade modal integration, run full test suite to 100% green | M1, M2 | PLANNED |

## Interface Contracts

### M1: `calculateSweetSpotPricing(params)` in `js/pricingEngine.js`
- **Inputs**:
  ```javascript
  {
    sellDepth: Array<Object>,         // Ascending ask ads
    buyDepth: Array<Object>,          // Descending bid ads
    profitTarget: number,             // Target profit in ₦/USDT (default 7.0)
    cycleVolume: number,              // Total cycle USDT (default 100000)
    tradeVolume: number,              // Per-trade USDT for fee calculation (default 100)
    platformFeePct: number,           // Maker fee % on Buy side (default 0.3)
    platformFeePctSell: number,       // Maker fee % on Sell side (default 0.0)
    inflowFee: number,                // Bank stamp duty / transfer fee (default 50.0)
    outflowFee: number,               // Outflow fee (default 0.0)
    boughtVolume: number,             // Completed buy volume in session
    boughtAvgPrice: number,           // Average price of completed buys
    filterLimits: boolean,            // Filter dust / limit ads
    rankStart: number,                // Default 3
    rankEnd: number                   // Default 5
  }
  ```
- **Outputs**:
  ```javascript
  {
    sellSweetSpot: number,            // Rank 3-5 median ask
    buySweetSpot: number,             // min(marketBuySweetSpot, maxBuyPrice)
    maxBuyPrice: number,              // Safe buy ceiling
    marketBuySweetSpot: number,       // Rank 3-5 median bid + 0.10
    profitTarget: number,
    effectiveSellRevenue: number,
    effectiveBuyCost: number,
    realizedSpread: number,           // effectiveSellRevenue - effectiveBuyCost
    isSafe: boolean,                  // marketBuySweetSpot <= maxBuyPrice
    isCompressed: boolean,            // marketBuySweetSpot > maxBuyPrice
    status: string,                   // 'SAFE' | 'COMPRESSED' | 'OFFLINE' | 'INVALID_TARGET'
    statusMessage: string,
    markers: {
      sellTargetRank: number,
      buyTargetRank: number,
      sellMarkerPrice: number,
      buyMarkerPrice: number
    },
    cycleGuidance: {
      cycleVolume: number,
      boughtVolume: number,
      remainingVolume: number,
      targetAvgBuyRate: number,
      neededRemainingRate: number,
      progressPercent: number,
      isTargetAchieved: boolean
    },
    feeBreakdown: {
      platformFeePerUnit: number,
      fiatFeePerUnit: number,
      totalFeePerUnit: number,
      effectiveCostBasis: number
    },
    isOffline: boolean
  }
  ```

### M2: UI & Controller Contract in `js/pricing.js` & `js/views/pricing.view.js`
- Primary input `#input-target-spread` synchronizes with `#input-buyback-profit-spread`.
- `#pricing-suggested-buy` and `#pricing-suggested-sell` update dynamically with formatted NGN rates.
- Copy buttons `#btn-copy-buy-price` and `#btn-copy-sell-price` copy clean numeric rates to clipboard.
- Preserved DOM elements (Progress bar, 6-card metrics, diagnostics banner, 3-tier ladder) update dynamically based on `calculateSweetSpotPricing` outputs.
- Depth table rows render `.orderbook-row-sweetspot-sell` and `.orderbook-row-sweetspot` with badge `<span class="badge badge-success tiny">🎯 Sell Sweet Spot</span>` without adding extra `<tr>` tags.

### M3: Test Suite Contract in `test/`
- Command: `npm test` (`node test/run-tests.js`).
- Pass Condition: All existing 758 tests + all new sweet spot tests pass with 0 failures, exit code 0.

## Code Layout
- `js/pricingEngine.js`: Pure math functions and sweet spot calculations.
- `js/pricing.js`: Controller logic, depth orchestration, and view binding.
- `js/views/pricing.view.js`: DOM markup generator for pricing tab.
- `css/styles.css`: Styles for high-contrast cards, sweet spot row highlights, badges.
- `test/tier1-feature-coverage/sweet-spot-pricing.test.js`: New automated test suite.
