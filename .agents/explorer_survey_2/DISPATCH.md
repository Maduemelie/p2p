# Task Assignment: Survey Explorer 2 - Pricing Engine Math & Logic

## Role & Mission
You are `explorer_survey_2`. Your working directory is `c:\dev\p2p\.agents\explorer_survey_2`.
You are conducting a survey of `js/pricingEngine.js` and `js/pricing.js`.

## Reference Files to Read
- `c:\dev\p2p\.agents\ORIGINAL_REQUEST.md`
- `c:\dev\p2p\js\pricingEngine.js`
- `c:\dev\p2p\js\pricing.js`
- Any tests in `tests/` or test suites across the repo

## Objectives
1. Read `ORIGINAL_REQUEST.md` completely.
2. Investigate `js/pricingEngine.js`:
   - Inspect all functions, especially `calculateBuyPricing`, `calculateSellPricing`, competitor parsing, spread calculations, break-even rates, outbidding and undercutting logic.
   - Trace the mathematical formulation:
     - For Buying (Merchant placing BUY ads to acquire USDT): How does the merchant compete? Should the merchant outbid (higher price in fiat per USDT) up to target buy rate / max buy ceiling? How does spread protection factor in?
     - For Selling (Merchant placing SELL ads to offload USDT): How does the merchant compete? Should the merchant undercut (lower price in fiat per USDT) down to break-even rate / target sell floor?
     - Identify any bugs, sign errors, inverted logic, or inconsistencies in `pricingEngine.js`.
3. Investigate `js/pricing.js`:
   - How does `js/pricing.js` coordinate data flow between `server.js` (market depth API), `pricingEngine.js`, and the UI view?
   - How are user inputs (target spread, capital, min profit, payment methods, competitor filtering) processed and passed to `pricingEngine`?
4. Document existing test files, test framework (Jest, Node test runner, etc.), package.json scripts.
5. Write a comprehensive survey report to `c:\dev\p2p\.agents\explorer_survey_2\survey_report.md` and a self-contained `handoff.md`. Include concrete file paths, line numbers, and findings.
6. Send a message to your parent when done.
