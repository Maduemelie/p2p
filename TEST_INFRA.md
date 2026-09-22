# E2E Test Infra: AI Development Content Generator

## Test Philosophy
- Opaque-box, requirement-driven. No dependency on implementation design.
- Methodology: Category-Partition + BVA + Pairwise + Workload Testing.

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | CLI Invocation (`npm run ai:content -- generate <sha>`) | R1, Acceptance Criteria | 5 | 5 | ✓ |
| 2 | Python Environment & Dependencies (`uv run`) | R1 | 5 | 5 | ✓ |
| 3 | Git Context Metadata & Diff Extraction | R2 | 5 | 5 | ✓ |
| 4 | JSON Report Generation (`content/analysis/<sha>.json`) | R3.1 | 5 | 5 | ✓ |
| 5 | Markdown Technical Article (`content/articles/`) | R3.2 | 5 | 5 | ✓ |
| 6 | Markdown Development Journal (`content/journal/`) | R3.2 | 5 | 5 | ✓ |
| 7 | Markdown Social Thread (`content/social/`) | R3.2 | 5 | 5 | ✓ |
| 8 | Quality Reviewer Validation | R3.3 | 5 | 5 | ✓ |
| 9 | Duplicate Execution Skipping (<sha>.json exists) | R4, Acceptance Criteria | 5 | 5 | ✓ |
| 10 | Force Execution Override (`--force` flag) | R4, Acceptance Criteria | 5 | 5 | ✓ |
| 11 | Post-Commit Hook Background Latency (< 1s execution) | R4, Acceptance Criteria | 5 | 5 | ✓ |
| 12 | Node Existing Test Suite Zero Regression (773/773 green) | Baseline Safety | 5 | 5 | ✓ |

## Test Architecture
- Test runner: Python `pytest` (invoked via `uv run pytest test/ai-content/` or node runner `node test/ai-content/run-e2e.js`)
- Test directories: `test/ai-content/tier1_feature/`, `test/ai-content/tier2_boundary/`, `test/ai-content/tier3_combination/`, `test/ai-content/tier4_realworld/`, `test/ai-content/tier5_adversarial/`
- Mocking & Real Gemini Modes: Test suite supports mock LLM mode for deterministic local offline testing (`AI_CONTENT_MOCK=1`) and live Gemini API testing when `GEMINI_API_KEY` is provided.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Standard feature commit generating all 4 files end-to-end | F1, F3, F4, F5, F6, F7, F8 | High |
| 2 | Duplicate commit test: immediate skip on second run | F1, F4, F9 | Medium |
| 3 | Forced regeneration overwrites existing files | F1, F4, F9, F10 | Medium |
| 4 | Git commit hook triggers async generation in < 1 second | F1, F11 | High |
| 5 | Complex multi-file commit with diff edge cases | F3, F4, F5, F6, F7 | High |

## Coverage Thresholds
- Tier 1: ≥5 per feature
- Tier 2: ≥5 per feature (boundaries, empty diffs, root commit, missing flags)
- Tier 3: Pairwise coverage of CLI flags, commit states, and environments
- Tier 4: ≥5 realistic end-to-end application scenarios
- Tier 5: Adversarial hardening & stress testing
