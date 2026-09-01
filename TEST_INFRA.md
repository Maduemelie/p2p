# E2E Test Infra: Pricing & Arbitrage Assistant

## Test Philosophy
- Opaque-box, requirement-driven and unit-mathematical testing.
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise + Workload Testing.

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | Market Depth API (`/api/market-depth`) | ORIGINAL_REQUEST R1 | 5 | 5 | ✓ |
| 2 | `calculateBuyPricing` Math & Spread Cap | ORIGINAL_REQUEST R2 | 5 | 5 | ✓ |
| 3 | `calculateSellPricing` Math & Break-Even | ORIGINAL_REQUEST R2 | 5 | 5 | ✓ |
| 4 | Reference Pricing (Competitor, SMA, VWAP) | ORIGINAL_REQUEST R2 | 5 | 5 | ✓ |
| 5 | Filter Competitor Ads (Dust & Limits) | ORIGINAL_REQUEST R2 | 5 | 5 | ✓ |
| 6 | UI View & Badge Consistency | ORIGINAL_REQUEST R3 | 5 | 5 | ✓ |
| 7 | Order Book Formatting & Sorting | ORIGINAL_REQUEST R3 | 5 | 5 | ✓ |

## Test Architecture
- Test runner: `node test/run-tests.js`
- Test suites:
  - `test/tier1-feature-coverage/pricing-engine.test.js`: Pure mathematical determinism, reference pricing modes, outbidding, undercutting, spread protection, break-even.
  - `test/tier1-feature-coverage/r1-api-security.test.js`: API authorization and endpoint security.
  - `test/tier2-boundary-corner/pricing-boundaries.test.js`: Empty orderbooks, dust amounts, negative spreads, zero volume, high fees.
  - `test/tier3-cross-feature/arbitrage-pipeline.test.js`: Simultaneous buy & sell cycle with FIFO inventory cost basis.
  - `test/tier4-real-world-scenarios/market-depth-live-flow.test.js`: Full lifecycle simulations.
  - `test/tier5-adversarial-coverage/`: Stress tests, fuzzing, adversarial edge cases.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Standard High-Spread Arbitrage Cycle | F1, F2, F3, F4, F5 | Medium |
| 2 | Thin Market / Low Liquidity Adaptation | F1, F2, F4, F5 | Medium |
| 3 | Volatile Shift with Outbid Exceeding Max Buy | F2, F3, F4 | High |
| 4 | Large Inventory Liquidation with FIFO Cost Basis | F3, F4, F5 | High |
| 5 | Dust Ads Flooding Orderbook Filtering | F4, F5 | Medium |

## Coverage Thresholds
- Tier 1: >=5 per feature
- Tier 2: >=5 per feature
- Tier 3: pairwise coverage of major feature interactions
- Tier 4: >=5 realistic application scenarios
- Tier 5: Adversarial edge coverage
