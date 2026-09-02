## 2026-09-02T05:28:10Z

You are m2_worker_1 (role: UI & Settings View Developer).
Your Working Directory is: c:\dev\p2p\.agents\m2_worker_1
Read ORIGINAL_REQUEST.md at: c:\dev\p2p\.agents\ORIGINAL_REQUEST.md
Read PROJECT.md at: c:\dev\p2p\PROJECT.md
Read Survey Analysis at: c:\dev\p2p\.agents\survey_explorer_2\analysis.md
Read M1 Changes at: c:\dev\p2p\.agents\m1_worker_1\changes.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your task for Milestone 2 (UI Controls, Settings & Pricing Assistant):
1. Write ownership: You own `js/views/pricing.view.js`, `js/views/settings.view.js`, and `js/settings.js`.
2. Update `js/views/pricing.view.js`:
   - Add `#input-platform-fee-pct` (Platform Maker Fee %, type="number", step="0.01", default 0.30, min="0", max="10") to the Arbitrage Settings form.
   - Add Fee Breakdown sub-cards to both Buy Ad Assistant and Sell Ad Assistant:
     - Platform Fee amount (₦/USDT)
     - Fiat Transfer Fee per unit (₦/USDT)
     - Effective Acquisition Cost / Net Realized Revenue
   - Add Optimal Minimum Order Limit advisor element (`#pricing-recommended-buy-limit`, `#pricing-recommended-sell-limit`) showing recommended minimum fiat limit (e.g. $\ge ₦50,000$) to cap fixed fee drag at $\le 20\%$ of target spread.
   - Ensure all event handlers and data bindings work seamlessly with `js/pricing.js`.
3. Update `js/views/settings.view.js`:
   - Add a "Trading Fee Defaults & Arbitrage Parameters" card (`#form-fee-defaults`) allowing merchants to set default Platform Maker Fee %, Inflow Fiat Fee (₦), Outflow Fiat Fee (₦), Target Spread (₦), and Target Volume (USDT).
4. Update `js/settings.js`:
   - Handle form submission for `#form-fee-defaults`, loading from `store.getSettings()` and saving via `store.saveSettings()`.
   - Ensure `store:updated` event with `{ type: 'settings' }` triggers cross-view reactivity.
5. Verify your implementation by running:
   `node test/run-tests.js`
   Document commands run and test output in your handoff report.
6. Write your changes summary to `c:\dev\p2p\.agents\m2_worker_1\changes.md` and complete handoff report to `c:\dev\p2p\.agents\m2_worker_1\handoff.md`.
7. Send a message to the orchestrator when complete with the path to your handoff report.
