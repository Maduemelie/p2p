# Orchestration Plan: Net Worth and Capital Cycle Tracking

## 1. Survey Phase (Phase 0)
- Spawn 3 parallel explorers / spec miners to investigate:
  - Agent 1 (Codebase Explorer): Existing app architecture, frontend structure (vanilla JS / React / Vue / etc.), reactive bank ledger state, and ad listing / Bybit balance state.
  - Agent 2 (Spec Miner): Exact data contracts, exchange rate calculations, conversion logic (Sell ad rate vs fallback), snapshot schema, localStorage key (`bybit_p2p_net_worth_snapshots`), and snapshot calculation formulas.
  - Agent 3 (UI & Visualization Explorer): Dashboard layout, modal UI patterns, Chart.js usage/integration, historical comparison delta calculations, export/import mechanics.
- Synthesize findings into `PROJECT.md` (Feature Inventory, Architecture, Interface Contracts, Code Layout).

## 2. Decomposition & Dual Track Setup
- **Track 1: E2E Testing Track**:
  - Test harness and runner for live widget calculations, snapshot storage, historical delta computations, Chart.js rendering, and export/import roundtrip.
  - Tiers 1-4 test cases (Requirement-driven, opaque-box).
  - Publish `TEST_READY.md`.
- **Track 2: Implementation Milestones**:
  - Milestone 1: Core State & Calculations (Bank cash ledger aggregation, Bybit balance calculation, real-time NGN/USDT conversion).
  - Milestone 2: Live Net Worth Dashboard Widget UI & reactive updates.
  - Milestone 3: End Day / Save Snapshot Modal & localStorage persistence (`bybit_p2p_net_worth_snapshots`).
  - Milestone 4: Historical Comparison (delta amount/percentage), Chart.js Trend Visualization, and Export/Import.
- **Track 3: Final Verification & Hardening**:
  - Phase 1: 100% E2E test pass (Tiers 1-4).
  - Phase 2: Tier 5 adversarial verification with Challengers and Forensic Auditor.

## 3. Iteration Loop per Milestone
- 3 Explorers -> 1 Worker -> 2 Reviewers + 2 Challengers + 1 Forensic Auditor -> Gate evaluation in `GATE_STATUS.md`.
