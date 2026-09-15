# Original User Request

## Initial Request — 2026-09-02T05:08:25Z

Research Bybit P2P platform maker transaction fees (0.3%) and local transfer fees (e.g. ₦50 for transactions > ₦10,000), then update the Bybit P2P Tracker engine (js/pricingEngine.js, js/pricing.js, js/utils.js, js/dashboard.js, and js/views/pricing.view.js) to incorporate percentage platform fees and transaction limits for net profit optimization.

Key Requirements:
- R1: Bybit P2P Fee Model Research & Analysis (0.3% maker transaction fee, interaction with fixed fiat transfer fees across varying trade sizes/limits).
- R2: Arbitrage Math & Engine Integration in js/pricingEngine.js (platformFeePct default 0.3%, inflowFee/outflowFee default ₦50, simultaneous fee accounting for net cost basis and recommended rates, recommended minimum order limits).
- R3: UI Controls & Settings in js/views/pricing.view.js and js/views/settings.view.js, fee breakdown and optimal limit recommendations in Pricing Assistant UI.
- R4: Verification via automated unit tests in test/tier1-feature-coverage/pricing-engine.test.js across varying trade sizes (₦5,000, ₦10,000, ₦30,000, ₦100,000) and ensure all tests pass.

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

