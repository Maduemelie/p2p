# Execution Plan: Bybit P2P Platform Fees & Net Profit Optimization

## 1. Objective
Enhance Bybit P2P Tracker engine and UI to support:
- 0.3% Bybit maker platform transaction fee (and custom configurable percentage)
- Inflow/outflow fiat transfer fees (e.g. ₦50 for transfer > ₦10,000)
- Optimal order limit recommendations taking fixed fee overhead into account
- Complete engine integration in `js/pricingEngine.js`, `js/pricing.js`, `js/utils.js`, `js/dashboard.js`
- UI controls in `js/views/pricing.view.js` and `js/views/settings.view.js`
- Comprehensive test coverage in `test/tier1-feature-coverage/pricing-engine.test.js`

## 2. Phase Breakdown
- **Phase 0: Survey & Exploration**
  - Explorer 1: Inspect `js/pricingEngine.js`, `js/pricing.js`, `js/utils.js`, `js/dashboard.js`, existing fee calculations, rates, limits.
  - Explorer 2: Inspect `js/views/pricing.view.js`, `js/views/settings.view.js`, UI state management, settings persistence, input controls.
  - Explorer 3 / Spec Miner: Inspect test infrastructure (`test/tier1-feature-coverage/pricing-engine.test.js`, runner, package.json), fee math formulas, test expectations.
- **Phase 1: Synthesis & PROJECT.md Architecture**
  - Synthesize reports into `PROJECT.md` (Architecture, Feature Inventory, Milestones, Interface Contracts).
- **Phase 2: Milestone Execution**
  - M1: Pricing Engine & Utilities (Worker -> Reviewers -> Challenger -> Auditor)
  - M2: UI & Settings Views (Worker -> Reviewers -> Challenger -> Auditor)
  - M3: Unit & Regression Tests (Worker / Test Writer -> Reviewers -> Challenger -> Auditor)
- **Phase 3: Final E2E Gate Verification & Handoff**
  - Full test suite run, multi-perspective reviews, clean forensic audit.
