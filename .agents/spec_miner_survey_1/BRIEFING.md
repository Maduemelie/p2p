# BRIEFING — 2026-09-01T13:05:00Z

## Mission
Extract and document comprehensive requirement specifications (R1-R4) and UI/view behavior from codebase and specification sources.

## 🔒 My Identity
- Archetype: Teamwork Specialist / Specification Miner
- Roles: Specification Miner (UI/View & Requirement Specifications)
- Working directory: c:\dev\p2p\.agents\spec_miner_survey_1
- Original parent: 9715ceef-643e-43fe-b45d-faeb52875532
- Milestone: Survey / Spec Mining

## 🔒 Key Constraints
- Do NOT implement anything — read-only spec mining and documentation.
- Probe authoritative sources (`ORIGINAL_REQUEST.md`, `js/views/pricing.view.js`, `js/pricing.js`, `js/pricingEngine.js`, `server.js`, HTML files).
- Document features discovered and edge cases in required table format.
- Produce `spec_report.md` and `handoff.md`.
- Communicate results via `send_message`.

## Current Parent
- Conversation ID: 9715ceef-643e-43fe-b45d-faeb52875532
- Updated: 2026-09-01T13:05:00Z

## Task Summary
- **What to build**: Specification report (`spec_report.md`) detailing R1-R4 requirements, UI/view inventory, card structures, badges/colors, maker/taker labels, orderbook table schemas, and pricing strategy metrics.
- **Success criteria**: Complete specification mining report covering R1-R4, edge cases, exact line numbers, inconsistency analysis, and acceptance criteria.
- **Interface contracts**: `c:\dev\p2p\.agents\ORIGINAL_REQUEST.md`, `c:\dev\p2p\js\views\pricing.view.js`, `c:\dev\p2p\js\pricing.js`, `c:\dev\p2p\server.js`.
- **Code layout**: Project root `c:\dev\p2p`.

## Key Decisions Made
- Confirmed Bybit `/v5/p2p/item/online` `side: 0` = Buy Ads / `side: 1` = Sell Ads.
- Pinpointed inversion in `server.js` (lines 522, 530) and `api/market-depth.js` (lines 21, 29).
- Documented badge mismatch in `pricing.view.js` line 154 (`badge-buy` used on Outflow card).
- Documented full UI element registry, pricing engine formulas, safety capping rules, and deterministic test requirements.

## Artifact Index
- `c:\dev\p2p\.agents\spec_miner_survey_1\spec_report.md` — Comprehensive specification mining report
- `c:\dev\p2p\.agents\spec_miner_survey_1\handoff.md` — 5-component hard handoff report
- `c:\dev\p2p\.agents\spec_miner_survey_1\progress.md` — Liveness & progress tracking
