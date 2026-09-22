# Handoff Report — Explorer 2 (UI Survey Explorer)

**Date**: 2026-09-18  
**Working Directory**: `c:\dev\p2p\.agents\explorer_survey_2`  
**Handoff Type**: Hard (Task Complete)  
**Recipient**: Orchestrator (`parent`, conversation ID: `286d5d9d-ca4a-46cf-9d10-84380adc4108`)  

---

## 1. Observation

1. **Hidden Legacy Markup Blocks**:
   - `c:\dev\p2p\js\views\pricing.view.js:22-121`:
     ```html
     <!-- Settings & Targets Card (Hidden to streamline pricing UI) -->
     <div class="card mb-4" style="display: none;">
     ```
     Contains 9 controls: `#input-platform-fee-pct`, `#input-target-spread`, `#input-avg-volume`, `#input-max-fee-drag-pct`, `#input-inflow-fee`, `#input-outflow-fee`, `#input-pricing-mode`, `#input-depth-limit`, `#input-filter-limits`.
   - `c:\dev\p2p\js\views\pricing.view.js:193-202`:
     ```html
     <div class="form-group col-12 col-md-6" id="group-buyback-market-sell" style="display: none;">
     ```
   - `c:\dev\p2p\js\views\pricing.view.js:271-275`:
     ```html
     <div style="display: none;">
       <table id="table-buyback-brackets">
         <tbody id="tbody-buyback-brackets"></tbody>
       </table>
     </div>
     ```
   - `c:\dev\p2p\js\views\pricing.view.js:279-410`:
     ```html
     <!-- Split Buy / Sell Pricing Calculators (Hidden for streamlined view) -->
     <div class="form-grid mb-4" style="display: none;">
     ```
     Encloses the primary Buy and Sell recommendation cards, including `#pricing-suggested-buy`, `#btn-copy-buy-price`, `#pricing-buy-status`, `#pricing-suggested-sell`, `#btn-copy-sell-price`, `#pricing-sell-status`, fee breakdowns, and limit advisors.

2. **Obsolete Dual-Mode Switches**:
   - `c:\dev\p2p\js\views\pricing.view.js:154-162`:
     ```html
     <select id="input-buyback-mode" class="form-select">
       <option value="target-driven" selected>Target-Driven (Inside-Out)</option>
       <option value="market-driven">Market-Driven (Outside-In)</option>
     </select>
     ```
   - Controlled by `updateBuybackModeVisibility()` in `js/pricing.js:101-121`, toggling visibility between `#group-buyback-target-price` and `#group-buyback-market-sell`.

3. **User Instruction to Preserve 5 Mobile UI Components**:
   - Dispatched in `ORIGINAL_REQUEST.md` under `## 2026-09-18T08:26:31Z`:
     1. Current Buyback Session Progress Bar (`#buyback-progress-bar`, `#buyback-progress-text`, `#buyback-session-summary-label`, `#buyback-target-banner`).
     2. 6-Card Metrics Grid (`#buyback-res-bought-so-far`, `#buyback-res-remaining-needed`, `#buyback-res-needed-remaining-rate`, `#buyback-res-avg-buy`, `#buyback-res-sell-rate`, `#buyback-res-net-profit`).
     3. Market Guidance Diagnostics Banner (`#buyback-market-guidance`, `#buyback-market-guidance-text`).
     4. 3-Tier Limit Ladder Cards (`#buyback-tier-ladder`).
     5. Live Order Book Depth Tables (`#pricing-buy-orderbook`, `#pricing-sell-orderbook`).

4. **Order Book DOM Invariant**:
   - In `test/challenger-2-boundary-fuzzing-stress.test.js:1061-1065`:
     ```javascript
     const buyRows = buyTable ? buyTable.querySelectorAll('.orderbook-row') : [];
     const sellRows = sellTable ? sellTable.querySelectorAll('.orderbook-row') : [];
     assert.strictEqual(buyRows.length, 2, 'Buy orderbook should have 2 rows');
     assert.strictEqual(sellRows.length, 2, 'Sell orderbook should have 2 rows');
     ```
   - Each row must remain an individual competitor row (`.orderbook-row`) with `data-direction`, `data-rate`, `data-volume`, and `data-counterparty`.

5. **Test Invariant Baseline**:
   - Executed `npm test` synchronously via runner:
     `Total Tests: 758 | Passed: 758 | Failed: 0 | Duration: 29062ms`.
   - Sections 4.1 & 4.2 in `test/challenger-2-boundary-fuzzing-stress.test.js` require 23 specific DOM element IDs and exact subtitle text strings.
   - Section 5.1 in `test/challenger-m2-1-ui-fuzzing-stress.test.js` requires 15 DOM element IDs and attribute types on `#input-platform-fee-pct`.

---

## 2. Logic Chain

1. **Observation 1 & 2** demonstrate that the pricing UI is cluttered by legacy hidden blocks (`style="display: none;"`) and an obsolete manual dual-mode switch. Crucially, the Buy and Sell recommendation cards with copy buttons were accidentally hidden from the user behind an outer `style="display: none;"` wrapper.
2. **Observation 3** establishes the user's explicit directive: the current mobile components (Session Progress Bar, 6-Card Metrics Grid, Diagnostic Guidance Banner, and 3-Tier Limit Ladders) must NOT be deleted, but rather preserved and seamlessly integrated into the sweet-spot workflow.
3. Combining **Observation 1, 2, and 3**, the new layout must:
   - Provide a clean, single-focus target input card: **Profit Target (₦/USDT)** (`#input-target-spread`) + **Cycle Volume Goal (USDT)** (`#input-avg-volume`).
   - Remove the manual dual-mode dropdown (`#input-buyback-mode`).
   - Retain the active session progress bar, 6-card metrics grid, diagnostic guidance banner, and 3-tier limit ladders.
   - Unhide the high-contrast Buy Sweet Spot and Sell Sweet Spot recommendation cards (`#pricing-suggested-buy`, `#pricing-suggested-sell`, status badges, and copy buttons).
4. **Observation 4** proves that inserting dummy spacer rows with class `.orderbook-row` would break existing test assertions like `assert.strictEqual(buyRows.length, 2)`. Therefore, visual order book markers (Requirement R3) must be implemented by:
   - Applying a highlight class (`.orderbook-row-sweetspot`, `.orderbook-row-sweetspot-sell`) directly to the matching competitor row.
   - Appending an inline visual badge (`<span class="badge badge-success tiny sweetspot-tag"><i data-lucide="crosshair"></i> Sell Sweet Spot</span>` or `<span class="badge badge-primary tiny sweetspot-tag"><i data-lucide="target"></i> Buy Sweet Spot</span>`) into that row's advertiser cell.
5. **Observation 5** establishes that secondary inputs required by unit tests (`#input-platform-fee-pct`, `#input-inflow-fee`, `#input-outflow-fee`, `#input-pricing-mode`, `#input-depth-limit`, `#input-filter-limits`, `#input-max-fee-drag-pct`) can be cleanly nested inside a collapsible `<details class="card mb-4 pricing-advanced-details">`. This eliminates `style="display: none;"` entirely, leaves the elements present in the DOM for automated tests, and keeps the user interface uncluttered.

---

## 3. Caveats

1. **Bi-directional Parameter Syncing**: In `pricing.js`, `#input-target-spread` (from old Arbitrage Settings) and `#input-buyback-profit-spread` (from old Buyback Calculator) historically held separate values. During implementation, these two inputs must be kept in sync so that any existing controller or test referencing either ID receives the exact same value.
2. **Order Book Row Count Invariant**: Automated test suites assert exact lengths of `.orderbook-row`. Implementing agents must NOT create additional `<tr>` elements with class `orderbook-row` for visual indicators. Use row classes and inline badges instead.
3. **No Code Modified**: In accordance with the Explorer archetype instructions, no application code was edited during this turn. All proposals are documented in `analysis.md` and this handoff report.

---

## 4. Conclusion

1. **Streamlined UI Layout (R2)**:
   - Single primary input: **Profit Target (₦/USDT)** (`#input-target-spread`) with optional Cycle Volume Goal (`#input-avg-volume`).
   - Preserved 5 mobile UI components: Session Progress Bar, 6-Card Metrics Grid, Guidance Diagnostics, 3-Tier Limit Ladders, and Order Book Tables.
   - Unhidden and elevated High-Contrast Buy Sweet Spot and Sell Sweet Spot Recommendation Cards with 1-click clipboard copy buttons and status badges.
   - Elimination of all 4 legacy `style="display: none;"` blocks; secondary test-required inputs preserved in an accessible `<details>` drawer.
2. **Visual Order Book Markers (R3)**:
   - Sell Order Book highlights the Rank 3–5 active liquid tier row with `.orderbook-row-sweetspot-sell` and badge `🎯 Sell Sweet Spot`.
   - Buy Order Book highlights the target placement row with `.orderbook-row-sweetspot` and badge `🎯 Buy Sweet Spot`.
3. **100% Test Stability (R4)**:
   - Preserves all 23 mandatory IDs from `challenger-2`, 15 IDs from `challenger-m2-1`, and exact text strings, ensuring all 758 tests remain green.

---

## 5. Verification Method

To verify this architectural survey and prepare for implementation:
1. **Inspect Survey Report**: Read `c:\dev\p2p\.agents\explorer_survey_2\analysis.md` for the full layout specification, ASCII mockup, and CSS definitions.
2. **Run Baseline Tests**: Execute `npm test` in `c:\dev\p2p` to verify the 758/758 passing baseline.
3. **Inspect DOM Selectors**: Search `test/challenger-2-boundary-fuzzing-stress.test.js:598-632` and `test/challenger-m2-1-ui-fuzzing-stress.test.js:528-556` to confirm all retained element IDs match the test suite requirements.
4. **Invalidation Conditions**:
   - If an implementation removes `#input-platform-fee-pct` or changes its `type="number"` / `step="0.01"` attributes, `test/challenger-m2-1-ui-fuzzing-stress.test.js:5.1` will fail.
   - If an implementation adds extra `.orderbook-row` elements for markers, `test/challenger-2-boundary-fuzzing-stress.test.js:8.1` will fail.
