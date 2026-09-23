# Project: AI Development Content Generator

## Architecture
- **Python Package (`ai_content/`)**: Dedicated Python package managed with `uv` (pinning `requires-python = ">=3.12,<3.14"`), providing CLI commands via `click` (`generate`, `install-hook`, `status`).
- **NPM Integration (`package.json`)**: Seamless integration into the existing Node.js project via `"ai:content": "uv run python -m ai_content.cli"` with argument passthrough (`npm run ai:content -- generate HEAD`).
- **Git Context Collector (`ai_content/git_context.py`)**: Robust Git metadata extraction (canonical 40-character SHA, author, date, message, diff, changed files) with edge-case handling for root commits (`4b825dc...`), merge commits, and large diffs.
- **CrewAI Pipeline (`ai_content/pipeline.py`)**: Sequential multi-agent CrewAI pipeline utilizing native Gemini (`gemini/gemini-2.0-flash` via `google-genai` and `GEMINI_API_KEY`):
  1. Context Analyst: Analyzes git diff and generates structured `DevelopmentSessionReport` Pydantic model, atomically saved to `content/analysis/<sha>.json`.
  2. Writers (Technical, Journal, Social): Generates deep-dive technical article, dev journal, and X/Twitter thread.
  3. Quality Reviewer: Audits drafts against JSON report and writes finalized Markdown files to `content/articles/`, `content/journal/`, and `content/social/`.
- **Git Post-Commit Hook (`.git/hooks/post-commit`)**: Asynchronous, non-blocking execution via POSIX `nohup` (`~320ms` commit time, well below the 1-second requirement), unsetting `GIT_INDEX_FILE`, with dual-layer duplicate protection checking `content/analysis/<sha>.json` and respecting `--force`.
- **Testing Track (`test/ai-content/`)**: Independent E2E test suite covering CLI invocation, duplicate skipping, output generation, format verification, and hook non-blocking latency.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Python Toolchain & Pyproject Config | Configure `pyproject.toml` with `uv`, pinning Python `>=3.12,<3.14`, dependencies (`crewai`, `google-genai`, `click`, `pydantic`, `python-dotenv`) | M1 | R1 |
| 2 | Configuration & Environment Loader | `ai_content/config.py` loading `REPO_ROOT / ".env"` for `GEMINI_API_KEY`, setting model defaults, updating `.env.example` and `.gitignore` | M1 | R1 |
| 3 | Click CLI Skeleton & Subcommands | CLI with `generate`, `install-hook`, and `status` subcommands, accepting commit ref and `--force` flag | M1 | R1 |
| 4 | NPM Script Integration | `"ai:content": "uv run python -m ai_content.cli"` in `package.json`, passing existing Node test suite (773/773 green) | M1 | R1 |
| 5 | Git Context Extractor Core | Extract canonical 40-char SHA, author, timestamp, commit message, and changed files list | M2 | R2 |
| 6 | Git Diff Extractor & Edge Cases | Extract unified git diff; handle root commits (`4b825dc...`), merge commits, detached HEAD, and diff truncation | M2 | R2 |
| 7 | Structured Data Models | Pydantic V2 models for `DevelopmentSessionReport`, `CommitInfo`, `FileChangeDetail`, `KeyTakeaway` | M2 | R2, R3 |
| 8 | CrewAI Context Analyst Agent | CrewAI agent and task to analyze git context and produce structured JSON report at `content/analysis/<sha>.json` | M3 | R3.1 |
| 9 | CrewAI Writer Agents | Technical Writer (Markdown article), Journal Writer (Markdown dev log), and Social Writer (X thread) | M3 | R3.2 |
| 10 | CrewAI Quality Reviewer Agent | Quality Reviewer auditing drafts against JSON report and writing final files to `content/articles/`, `content/journal/`, `content/social/` | M3 | R3.3 |
| 11 | Post-Commit Hook Script | Shell hook `.git/hooks/post-commit` with `unset GIT_INDEX_FILE` and POSIX `nohup` non-blocking background spawn | M4 | R4 |
| 12 | Duplicate Protection & Force Flag | Skip execution if `content/analysis/<sha>.json` exists; bypass when `--force` is passed; atomic file writing | M4 | R4 |
| 13 | Hook Installer Subcommand | `ai:content install-hook` command to deploy and verify `.git/hooks/post-commit` permissions | M4 | R4 |
| 14 | E2E Testing Suite (Tiers 1-4) | Comprehensive automated test suite verifying CLI, outputs, duplicate skipping, and hook latency | E2E | AC |
| 15 | Adversarial Hardening (Tier 5) | Stress tests for corrupted JSON, missing API keys, empty commits, huge diffs, and rapid sequential commits | E2E | AC |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Python Package, CLI & NPM Integration | `pyproject.toml`, `ai_content/config.py`, `ai_content/cli.py`, `package.json`, `.gitignore`, `.env.example` | none | DONE |
| M2 | Git Context Collector & Data Models | `ai_content/git_context.py`, `ai_content/models.py`, Pydantic V2 schemas, edge cases | M1 | DONE |
| M3 | CrewAI Pipeline & Gemini Integration | `ai_content/agents.py`, `ai_content/tasks.py`, `ai_content/pipeline.py`, Gemini LLM configuration | M1, M2 | DONE |
| M4 | Post-Commit Hook & Duplicate Protection | `.git/hooks/post-commit`, hook installer, duplicate checking, atomic writing | M1, M2, M3 | DONE |
| M5 | 100% E2E Pass & Adversarial Hardening | Verify all acceptance criteria against test suite (Tiers 1-5) | M1, M2, M3, M4 | DONE |

## Interface Contracts

### M1 ↔ M2, M3, M4: Configuration & CLI Contract
- **Module**: `ai_content.config`
  ```python
  REPO_ROOT: Path
  GEMINI_API_KEY: str
  GEMINI_MODEL: str  # Default "gemini/gemini-2.0-flash"
  CONTENT_DIR: Path  # REPO_ROOT / "content"
  ANALYSIS_DIR: Path # CONTENT_DIR / "analysis"
  ARTICLES_DIR: Path # CONTENT_DIR / "articles"
  JOURNAL_DIR: Path  # CONTENT_DIR / "journal"
  SOCIAL_DIR: Path   # CONTENT_DIR / "social"
  LOGS_DIR: Path     # CONTENT_DIR / "logs"
  ```
- **CLI Entry**: `ai_content.cli:cli`
  - `python -m ai_content.cli generate <commit_ref> [--force / -f]`
  - `python -m ai_content.cli install-hook`
  - `python -m ai_content.cli status`
- **NPM Script**:
  - `npm run ai:content -- <args>` forwards directly to `uv run python -m ai_content.cli <args>`.

### M2 ↔ M3: Git Context & Data Models
- **Function**: `collect_git_context(commit_ref: str = "HEAD", max_diff_chars: int = 30000) -> GitCommitContext`
- **Model**: `GitCommitContext`
  ```python
  class GitCommitContext(BaseModel):
      sha: str  # 40-char canonical hex
      short_sha: str
      author_name: str
      author_email: str
      date: str  # ISO-8601
      message_subject: str
      message_body: str
      changed_files: List[FileChangeDetail]
      diff: str
      is_merge: bool
      parent_shas: List[str]
  ```
- **Model**: `DevelopmentSessionReport`
  ```python
  class DevelopmentSessionReport(BaseModel):
      commit_sha: str
      timestamp: str
      summary: str
      architecture_impact: str
      key_takeaways: List[str]
      changed_components: List[str]
      suggested_article_title: str
      suggested_article_slug: str
  ```

### M3 ↔ M4: Pipeline Invocation & File Outputs
- **Function**: `run_pipeline(commit_ref: str = "HEAD", force: bool = False) -> Dict[str, Path]`
- **Outputs**:
  - `content/analysis/<sha>.json` (JSON conforming to `DevelopmentSessionReport`)
  - `content/articles/<sha>-<slug>.md`
  - `content/journal/<sha>-<slug>.md`
  - `content/social/<sha>-<slug>.md`
- **Atomic Writing**: Write to `.tmp` first, then atomic rename.

### M4: Post-Commit Hook Contract
- **File**: `.git/hooks/post-commit`
- **Shell**: `#!/bin/sh`
- **Latency**: `< 1 second` exit.
- **Log**: `content/logs/post-commit.log`.
- **Duplicate behavior**: If `content/analysis/<sha>.json` exists, exit immediately with status 0.

## Code Layout
- `pyproject.toml`: Python package specification & dependencies.
- `package.json`: Node.js root config with `"ai:content"` script.
- `ai_content/`:
  - `__init__.py`: Package init.
  - `config.py`: Path resolution, `.env` loading, settings.
  - `models.py`: Pydantic V2 schemas for git context and reports.
  - `git_context.py`: Git extraction, diff computation, edge cases.
  - `agents.py`: CrewAI agent definitions (Analyst, Writers, Quality Reviewer).
  - `tasks.py`: CrewAI task definitions and output schema bindings.
  - `pipeline.py`: Orchestrates CrewAI crew, duplicate checks, atomic writes.
  - `cli.py`: Click CLI entry point.
- `content/`:
  - `analysis/`: `<sha>.json` reports.
  - `articles/`: Markdown technical articles.
  - `journal/`: Markdown dev journals.
  - `social/`: Markdown X/Twitter threads.
  - `logs/`: `post-commit.log` (ignored by git).
- `.git/hooks/post-commit`: Shell hook script.
- `test/ai-content/`: E2E test suite.
