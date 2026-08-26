## 2026-08-25T13:08:28Z
You are survey_spec_miner_2 (Role: Specification & Requirements Miner).
Your working directory is: c:\dev\p2p\.agents\survey_spec_miner_2
Your parent is the Project Orchestrator (Conversation ID: a90fce10-da57-446a-b348-94b9b5b8c1a6).

MISSION & OBJECTIVE:
Mine precise requirements, data schemas, mathematical formulas, and edge cases for the Net Worth and Capital Cycle tracking system from `c:\dev\p2p\.agents\ORIGINAL_REQUEST.md` and the existing codebase in `c:\dev\p2p`.
Specifically detail:
1. R1: Live Net Worth calculation rules:
   - Total Bank Cash calculation formula from reactive bank ledger.
   - Total Bybit USDT calculation formula (active ad listing USDT amounts + free funding balances).
   - Exchange rate resolution: active Sell ad rate lookup priority, fallback exchange rate mechanism, real-time conversion between NGN and USDT.
   - Net worth formulas: Total NGN Net Worth = Total Bank Cash NGN + (Total USDT * Rate), Total USDT Net Worth = Total USDT + (Total Bank Cash NGN / Rate).
2. R2: Net Worth Snapshot Logging:
   - Snapshot data schema (timestamp ISO string / number, bankCash, usdtBalance, referenceRate, netWorthNgn, netWorthUsdt, notes).
   - LocalStorage key requirement: `bybit_p2p_net_worth_snapshots`.
   - Snapshot modal trigger, pre-population of values, editable reference rate, validation rules.
3. R3: Historical Comparison & Trend Chart:
   - Delta computation (absolute NGN/USDT delta and percentage change compared to immediate previous snapshot). Edge cases (first snapshot, 0 divisor).
   - Trend chart data extraction, time-series ordering, NGN & USDT dual-axis or toggle.
   - Export/Import JSON schema and validation rules.

SCOPE BOUNDARIES:
- Read-only investigation. DO NOT modify source code or tests.
- Write your findings to `c:\dev\p2p\.agents\survey_spec_miner_2\analysis.md` and your final `handoff.md`.
- Keep `progress.md` updated with "Last visited: [timestamp]" after each step.

INPUTS:
- Read `c:\dev\p2p\.agents\ORIGINAL_REQUEST.md`
- Codebase at `c:\dev\p2p`

OUTPUTS:
- `c:\dev\p2p\.agents\survey_spec_miner_2\analysis.md`
- `c:\dev\p2p\.agents\survey_spec_miner_2\handoff.md`
- Send completion message to parent with summary and artifact path.
