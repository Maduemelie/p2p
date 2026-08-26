# Plan: SWE Light Refactoring Pipeline

## Mission
Safely remove dead code, extract tightly coupled reusable components into clean ES modules, and produce `refactor_report.md` while ensuring 100% test integrity on Bybit NGN P2P Trade Tracker.

## Steps
1. **Implementation Phase**: Spawn `teamwork_preview_implementer` to analyze codebase, remove dead code, extract components into ES modules, generate `refactor_report.md`, run tests, and report.
2. **Review Round 1**: Spawn `teamwork_preview_reviewer` to review implementation, test edge cases, fix any issues, and re-verify.
3. **Review Round 2**: Spawn `teamwork_preview_reviewer` to review Round 1 changes, test, and refine.
4. **Review Round 3**: Spawn `teamwork_preview_reviewer` to verify all acceptance criteria and edge cases.
5. **Orchestrator Test Run & Verification**: Verify git diff, re-run test suite.
6. **Post-Victory Audit**: Spawn `teamwork_preview_victory_auditor` for independent verification.
7. **Final Notification**: Report completion and notify Sentinel via `send_message`.
