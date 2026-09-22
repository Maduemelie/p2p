# E2E Test Suite: AI Development Content Generator

## Overview
This directory contains the requirement-driven, opaque-box End-to-End (E2E) test suite for the AI Development Content Generator as specified in `PROJECT.md` and `TEST_INFRA.md`.

## Test Structure
```
test/ai-content/
├── harness/
│   ├── cli-invoker.js          # Unified runner for real/mock CLI
│   ├── git-test-helper.js      # Isolated temporary Git repository fixture
│   ├── mock-cli-shim.js        # Mock CLI matching Click CLI interface
│   ├── mock-llm-runner.js      # Reference oracle and deterministic mock runner
│   └── schema-validator.js     # Strict Pydantic schema validation for DevelopmentSessionReport
├── tier1_feature/
│   ├── cli-generation.test.js  # CLI invocation, HEAD/SHA/short-sha resolution
│   ├── report-schema.test.js   # DevelopmentSessionReport schema & fields verification
│   └── markdown-outputs.test.js # Technical article, dev journal, and social thread files
├── tier2_boundary/
│   ├── duplicate-skipping.test.js # Duplicate commit skipping (R4)
│   ├── force-regeneration.test.js # Force flag override (--force, -f)
│   └── invalid-and-empty.test.js  # Invalid SHA, empty diffs, root commits, detached HEAD
├── tier3_combination/
│   ├── cli-flags-combinations.test.js # Ref formats, help screens, unknown options
│   ├── cli-subcommands.test.js       # install-hook & status subcommands
│   └── hook-duplicate-integration.test.js # Dual-layer duplicate protection & git isolation
├── tier4_realworld/
│   ├── end-to-end-workflow.test.js   # Full 5 real-world developer scenarios
│   └── hook-latency.test.js          # Git commit non-blocking latency (< 1s)
├── tier5_adversarial/
│   └── adversarial-edge-cases.test.js # Corrupted JSON, big diffs, complex strings
├── test_ai_content_e2e.py            # Python Pytest equivalent test suite
├── run-e2e.js                        # Standalone Node test runner
└── README.md
```

## Running the Tests

### 1. Node Runner (Default)
Run all tiers:
```bash
node test/ai-content/run-e2e.js
```

Run specific tiers:
```bash
node test/ai-content/run-e2e.js --tier=1
node test/ai-content/run-e2e.js --tier=2
node test/ai-content/run-e2e.js --tier=3
node test/ai-content/run-e2e.js --tier=4
node test/ai-content/run-e2e.js --tier=5
```

### 2. Python Pytest Runner
```bash
uv run pytest test/ai-content/
```
or
```bash
pytest test/ai-content/
```

### 3. Mock Mode vs Live Gemini Mode
- **Deterministic Mock Mode (Default)**: Set `AI_CONTENT_MOCK=1` (enabled by default in test runner) to execute without requiring Gemini API credits or internet connectivity.
- **Live Gemini Mode**: Run `node test/ai-content/run-e2e.js --live` with `GEMINI_API_KEY` in `.env` or environment to run against Google Gemini 2.0 Flash.
