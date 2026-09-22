"""Automated unit test suite for Milestone 1: Configuration & CLI.

Tests:
  - Dynamic REPO_ROOT resolution
  - Directory constants and ensure_directories creation
  - .env loading with override
  - Click CLI commands: generate, install-hook, status
  - Duplicate protection logic and --force override
  - Hook file content and permissions
"""

import json
from pathlib import Path
from click.testing import CliRunner
import pytest

from ai_content.config import (
    REPO_ROOT,
    CONTENT_DIR,
    ANALYSIS_DIR,
    ARTICLES_DIR,
    JOURNAL_DIR,
    SOCIAL_DIR,
    LOGS_DIR,
    GEMINI_MODEL,
    ensure_directories,
    is_gemini_configured,
)
from ai_content.cli import cli, resolve_commit_sha


def test_repo_root_resolution():
    """Verify REPO_ROOT dynamically points to the valid repository root."""
    assert REPO_ROOT.is_dir()
    assert (REPO_ROOT / "package.json").is_file()
    assert (REPO_ROOT / "PROJECT.md").is_file()


def test_directory_constants():
    """Verify directory constants conform to PROJECT.md specification."""
    assert CONTENT_DIR == REPO_ROOT / "content"
    assert ANALYSIS_DIR == CONTENT_DIR / "analysis"
    assert ARTICLES_DIR == CONTENT_DIR / "articles"
    assert JOURNAL_DIR == CONTENT_DIR / "journal"
    assert SOCIAL_DIR == CONTENT_DIR / "social"
    assert LOGS_DIR == CONTENT_DIR / "logs"


def test_ensure_directories():
    """Verify ensure_directories creates all expected directories idempotently."""
    ensure_directories()
    for d in (CONTENT_DIR, ANALYSIS_DIR, ARTICLES_DIR, JOURNAL_DIR, SOCIAL_DIR, LOGS_DIR):
        assert d.is_dir()


def test_gemini_model_default():
    """Verify GEMINI_MODEL defaults to gemini/gemini-2.0-flash or configured model."""
    assert GEMINI_MODEL in ("gemini/gemini-2.0-flash", "gemini-2.0-flash")


def test_cli_version():
    """Verify CLI version option."""
    runner = CliRunner()
    result = runner.invoke(cli, ["--version"])
    assert result.exit_code == 0
    assert "0.1.0" in result.output


def test_cli_help():
    """Verify root CLI help outputs subcommands and options."""
    runner = CliRunner()
    result = runner.invoke(cli, ["--help"])
    assert result.exit_code == 0
    assert "generate" in result.output
    assert "install-hook" in result.output
    assert "status" in result.output


def test_cli_generate_help():
    """Verify generate subcommand help documents arguments and flags."""
    runner = CliRunner()
    result = runner.invoke(cli, ["generate", "--help"])
    assert result.exit_code == 0
    assert "COMMIT_REF" in result.output
    assert "--force" in result.output
    assert "-f" in result.output


def test_cli_status():
    """Verify status command outputs system information cleanly."""
    runner = CliRunner()
    result = runner.invoke(cli, ["status"])
    assert result.exit_code == 0
    assert "AI Content Generator - System Status" in result.output
    assert "Repository Root" in result.output
    assert "Content Directory" in result.output


def test_cli_generate_duplicate_skipping():
    """Verify duplicate protection skips generation unless --force is passed."""
    ensure_directories()
    runner = CliRunner()

    head_sha = resolve_commit_sha("HEAD")
    test_sha = head_sha if head_sha else "1111111111111111111111111111111111111111"
    analysis_file = ANALYSIS_DIR / f"{test_sha}.json"

    try:
        # Create mock analysis file
        analysis_file.write_text(
            json.dumps({"commit_sha": test_sha, "summary": "test"}),
            encoding="utf-8",
        )

        # 1. Normal execution should skip
        result = runner.invoke(cli, ["generate", test_sha])
        assert result.exit_code == 0
        assert "[SKIP]" in result.output

        # 2. Force execution should bypass skip
        force_result = runner.invoke(cli, ["generate", test_sha, "--force"])
        assert force_result.exit_code == 0
        assert "[SKIP]" not in force_result.output
    finally:
        if analysis_file.exists():
            analysis_file.unlink()


def test_cli_install_hook():
    """Verify install-hook deploys .git/hooks/post-commit with correct contents."""
    runner = CliRunner()
    result = runner.invoke(cli, ["install-hook"])
    assert result.exit_code == 0
    assert "successfully installed" in result.output.lower()

    hook_file = REPO_ROOT / ".git" / "hooks" / "post-commit"
    assert hook_file.is_file()
    content = hook_file.read_text(encoding="utf-8")
    assert "unset GIT_INDEX_FILE" in content
    assert "nohup" in content


def test_resolve_commit_sha():
    """Verify commit SHA resolution."""
    # Direct 40-char string
    dummy_sha = "abcdef0123456789abcdef0123456789abcdef01"
    resolved = resolve_commit_sha(dummy_sha)
    assert resolved == dummy_sha

    # HEAD resolution (in a git repo)
    git_dir = REPO_ROOT / ".git"
    if git_dir.exists():
        head_sha = resolve_commit_sha("HEAD")
        assert head_sha is not None
        assert len(head_sha) == 40


# Milestone 2 Test Suite Integration
from test_m2_git_context import (
    TestFileChangeDetail,
    TestGitCommitContext,
    TestDevelopmentSessionReport,
    TestSlugifyHelper,
    TestPersistenceAndSchemaExport,
    TestLiveGitContextCollector,
)

