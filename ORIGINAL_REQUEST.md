# Original User Request

## 2026-09-02T05:07:59Z

Research Bybit P2P platform maker transaction fees (0.3%) and local transfer fees (e.g. ₦50 for transactions > ₦10,000), then update the Bybit P2P Tracker engine (`js/pricingEngine.js`, `js/pricing.js`, `js/utils.js`, `js/dashboard.js`, and `js/views/pricing.view.js`) to incorporate percentage platform fees and transaction limits for net profit optimization.

Working directory: c:\dev\p2p

## Requirements

### R1. Bybit P2P Fee Model Research & Analysis
- Analyze Bybit P2P fee structure for advertisers/makers (0.3% maker transaction fee on completed P2P buy/sell orders).
- Determine how percentage platform fees (0.3% crypto/fiat deduction) interact with fixed fiat transfer fees (e.g. ₦50 for transfers > ₦10,000) across different trade sizes and order limit bounds (e.g. ₦5,000 – ₦30,000).

### R2. Arbitrage Math & Engine Integration
- Update `calculateBuyPricing` and `calculateSellPricing` in `js/pricingEngine.js` to incorporate:
  - Percentage platform fee `platformFeePct` (default: 0.3%).
  - Fixed per-transaction fee `inflowFee` / `outflowFee` (default: ₦50).
  - Effective net cost basis and recommended buy/sell rates accounting for percentage and fixed fees simultaneously.
- Compute recommended minimum order limits (e.g., ₦10,000 or custom threshold) to prevent small trades from being eaten away by fixed transaction fees.

### R3. UI Controls & Settings
- Add Bybit Platform Fee (%) input settings to `js/views/pricing.view.js` and `js/views/settings.view.js`.
- Display net fee breakdown (Platform Fee + Transfer Fee = Total Fee per USDT) and optimal order limit recommendations in the Pricing Assistant UI.

### R4. Verification
- Verify mathematical accuracy via automated unit tests in `test/tier1-feature-coverage/pricing-engine.test.js`.
- Test edge cases across varying trade sizes (₦5,000, ₦10,000, ₦30,000, ₦100,000).

## Acceptance Criteria

### Functionality
- [ ] Bybit 0.3% platform fee is configurable and factored into max buy price, break-even sell price, and recommended rates.
- [ ] Net profit remains positive across all valid trade sizes within recommended order limit bounds.
- [ ] Automated unit tests pass with 100% accuracy for fee-adjusted arbitrage math.

## Follow-up — 2026-09-12T11:48:50Z

This is a single self-contained fix; keep it small and focused.

Convert the Bybit P2P platform from a single-tenant local server app to a multi-tenant web application ready for Vercel deployment, allowing multiple users to safely configure their own Bybit API keys in settings and run queries independently.

Working directory: c:\dev\p2p
Integrity mode: development

## Requirements

### R1. Client-Side Bybit API Credentials UI & Persistence
Update the settings UI (`js/views/settings.view.js` and `js/settings.js`) so users can enter and save their own Bybit API Key and Bybit API Secret in browser local storage. Outbound API proxy requests must pass these credentials in custom headers (`x-bybit-api-key`, `x-bybit-api-secret`).

### R2. Vercel Serverless Multi-Tenant API Proxy
Implement a Vercel-compatible serverless API handler (`api/index.js` or `api/proxy.js`) replacing single-tenant `server.js` reliance. The handler must extract Bybit API credentials dynamically from incoming request headers and execute signed Bybit API calls statelessly without logging or storing user secrets.

### R3. Test Suite Verification
Ensure all automated unit and invariant tests (`npm test`) continue passing cleanly without regressions.

## Acceptance Criteria

### Settings & UI Credentials
- [ ] User can input, save, and clear Bybit API Key and Bybit API Secret in the settings UI.
- [ ] Frontend API calls automatically attach saved user credentials in request headers.

### Vercel Serverless Proxy
- [ ] Serverless API proxy dynamically signs and forwards Bybit P2P requests based on headers from each user.
- [ ] `vercel.json` properly configures static file serving and `/api/*` routing for Vercel deployment.

### Test Integrity
- [ ] Automated test suite (`npm test`) passes 100% cleanly.

## 2026-09-15T15:07:49Z

This is a single self-contained feature; keep it small and focused.

Add a Buyback Average Price & Range Calculator with dual-mode Profit Spread switching to the P2P Pricing Tab in `c:\dev\p2p`.

Working directory: c:\dev\p2p
Integrity mode: development

## Requirements

### R1. Dual-Mode Profit & Buyback Pricing Calculator
Implement a calculator inside `js/views/pricing.view.js`, `js/pricing.js`, and `js/pricingEngine.js` that allows switching between two modes:
- **Target-Driven Mode (Inside-Out):** User inputs Desired Average Buy Price, total volume goal (USDT), and Profit Difference ($\Delta$). System calculates the volume/price tier brackets needed to achieve the target average buy price, and calculates the Target Sell Price ($\text{Average Buy Price} + \Delta$).
- **Market-Driven Mode (Outside-In):** User inputs Live Market Sell Price, total volume goal (USDT), and Profit Difference ($\Delta$). System calculates the Maximum Allowable Average Buy Price ($\text{Market Sell Price} - \Delta$) and determines the maximum buy ranges/brackets to stay within that average.

### R2. Volume-Weighted Range & Goal-Seeking Solver
Implement pure mathematical functions in `js/pricingEngine.js` to compute volume-weighted average prices (VWAP) across volume brackets/tiers and solve for tier allocations given a target total volume and target average buy price.

### R3. Exact P2P Fee Integration
Enforce fee logic:
- **Buy Ad Side:** Include Bybit 0.3% Maker Fee and ₦50 fiat transfer inflow fee (stamp duty for transfers > ₦10,000) when calculating effective buy cost basis and net spread.
- **Sell Ad Side:** Apply 0% Maker Fee and ₦0 fiat outflow fee for maker sell ads.

## Acceptance Criteria

### Functionality & UI Integration
- [ ] UI provides a toggle/switch between Target-Driven and Market-Driven modes.
- [ ] Mathematical calculations in `pricingEngine.js` are covered by unit tests.
- [ ] Calculations correctly reflect Bybit 0.3% maker fee & ₦50 stamp duty on Buy side, and 0% maker fee on Sell side.
- [ ] Live UI elements update dynamically when user adjusts inputs.

## 2026-09-18T08:06:58Z

Redesign the P2P Arbitrage & Pricing engine and UI to compute actionable Buy and Sell "sweet spots" directly from live Bybit P2P order book depth, anchored solely on the user's defined per-USDT profit target.

Working directory: c:/dev/p2p
Integrity mode: development

## Requirements

### R1. Single-Target Sweet Spot Pricing Engine
The pricing engine must take a single user profit target (e.g. ₦X / USDT profit) and compute:
1. **Sell Sweet Spot:** The optimal competitive sell price targeting the active liquid tier (Rank 3–5 median/cluster) in the Sell Order Book (Maker sell / Taker buy).
2. **Buy Sweet Spot & Maximum Safe Buy Rate:** The optimal buy price and ceiling calculated as `Sell Sweet Spot - Profit Target - Platform Maker Fees (0.3% default on buy side) - Fiat Transfer Fees`.
3. **Average Buy Guidance:** A clear average buy rate target to guarantee the locked profit target over the entire cycle.

### R2. Streamlined Single-Focus Pricing UI
Clean up the pricing interface to eliminate clutter:
1. Replace complex forms and dual-mode toggles with a single primary input: **Profit Target (₦/USDT)** (with optional cycle volume).
2. Display high-contrast **Buy Sweet Spot** and **Sell Sweet Spot** recommendation cards with one-click copy buttons and status badges.
3. Remove hidden legacy markup blocks (`style="display: none;"`) and unused calculation controls.

### R3. Visual Order Book Markers
Render the live Buy and Sell order book tables (top 10 active competitor ads) with clear visual indicators and badges marking the exact row where the merchant's suggested Buy and Sell ads will sit.

### R4. System & Integration Consistency
Maintain compatibility with existing FIFO inventory stores, trade recording modals, and Bybit proxy depth APIs (`npm test` test suite must remain green).

## Acceptance Criteria

### Mathematical Correctness & Spread Guarantee
- [ ] Given any valid profit target (e.g., ₦7.00/USDT) and live order book data, the engine computes Buy and Sell rates where `(Effective Sell Revenue - Effective Buy Cost) >= Target Profit`.
- [ ] Incorporates platform maker fee (0.30% default on buy side) and fiat fees accurately into cost basis.
- [ ] When the market buy sweet spot is above the safe ceiling, the engine caps the suggested buy rate at `maxBuyPrice` and alerts the user of spread compression.

### UI & UX Verification
- [ ] The user only needs to provide their Profit Target to get immediate, actionable recommendations.
- [ ] Order book tables dynamically highlight the corresponding sweet spot tier row for both Buy and Sell sides.
- [ ] Clipboard copy buttons work smoothly for both Buy and Sell recommended rates.
- [ ] All automated unit and regression tests in `test/` pass without failure (`npm test`).

## 2026-09-18T08:26:31Z

[CRITICAL USER INSTRUCTION & SPECIFICATION UPDATE]
The user explicitly reviewed the current mobile UI and instructed:
"Do not remove this from the ui work it into your design"

The following components MUST BE PRESERVED and seamlessly integrated into the new sweet-spot driven design:
1. **Current Buyback Session Progress Bar**: (Progress %, Volume acquired vs goal, session start time).
2. **The 6-Card Metrics Grid**:
   - `Bought So Far` ($USDT + Avg rate)
   - `Remaining Needed` ($USDT + Naira Budget)
   - `Required Rate` (Needed for target average)
   - `Target Avg Buy` (Sweet spot buy benchmark)
   - `Target Sell Rate` (Sweet spot sell benchmark + Gross spread Δ)
   - `Net Profit (After Fees)` (Realized net profit per USDT after 0.3% maker fee & fiat fee)
3. **Market Guidance Diagnostics Banner**: Real-time comparison between target rates and live order book top bids/asks.
4. **The 3-Tier Limit Ladder Cards**:
   - `Tier 1: Target / Fast Fill Limit` (40% allocation)
   - `Tier 2: Mid-Discount Limit` (40% allocation)
   - `Tier 3: Deep-Discount Limit` (20% allocation)
5. **Live Order Book Depth Tables** with visual indicators showing where these sweet spot and tier rates sit in the order book.

**How it works with the single Profit Target:**
- User specifies their **Profit Target (₦/USDT)** and **Total Volume Goal (USDT)**.
- The engine uses the live Order Book (Rank 3–5 sweet spot on Sell side) as the anchor:
  * Sell Target = Sell Sweet Spot
  * Target Avg Buy = Sell Target - Profit Target - Fees
  * Live trade progress calculates the exact Required Rate for remaining USDT
  * Tier 1, 2, 3 are anchored to this required rate.
  * Order books visually mark the sweet spot and tier levels.

Do NOT remove or hide these components. Ensure all cards and tier ladders remain active, reactive, and beautifully styled for mobile and desktop.



