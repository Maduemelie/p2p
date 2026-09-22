"""Empirical Challenge Stress Test Suite for Milestone 1: Configuration & CLI.

Targeting:
  - Subcommands: generate, install-hook, status
  - CLI argument parsing, invalid arguments, unknown options
  - Missing and non-existent commit references, branch names, and synthetic SHAs
  - Duplicate protection logic with --force and -f flags
  - ensure_directories() creation, idempotency, and partial deletion recovery
  - Shell injection resistance and special character handling in commit_ref
  - Working directory independence (invoking from different directories)
  - Worktree gitdir pointer handling in install-hook
  - Status display metrics under empty vs populated content directories
"""

import json
import os
import stat
import subprocess
from pathlib import Path
from unittest.mock import patch

import pytest
from click.testing import CliRunner

from ai_content.cli import cli, resolve_commit_sha, HOOK_SCRIPT_TEMPLATE
from ai_content.config import (
    ANALYSIS_DIR,
    ARTICLES_DIR,
    CONTENT_DIR,
    JOURNAL_DIR,
    LOGS_DIR,
    REPO_ROOT,
    SOCIAL_DIR,
    ALL_CONTENT_DIRS,
    ensure_directories,
    is_gemini_configured,
    reload_config,
)


@pytest.fixture
def runner():
    """CLI runner fixture."""
    return CliRunner()


# ==============================================================================
# 1. SUBCOMMAND: generate & FLAGS (--force / -f)
# ==============================================================================

class TestCliGenerateSubcommand:
    """Stress tests for the 'generate' subcommand."""

    def test_generate_default_argument(self, runner):
        """Invoke generate with no arguments; defaults to HEAD."""
        result = runner.invoke(cli, ["generate"])
        assert result.exit_code == 0
        assert "Verified CLI invocation for ref 'HEAD'" in result.output
        assert "force=False" in result.output

    def test_generate_explicit_head(self, runner):
        """Invoke generate with explicit 'HEAD'."""
        result = runner.invoke(cli, ["generate", "HEAD"])
        assert result.exit_code == 0
        assert "Verified CLI invocation for ref 'HEAD'" in result.output
        assert "force=False" in result.output

    def test_generate_flag_force_long(self, runner):
        """Invoke generate HEAD with --force."""
        result = runner.invoke(cli, ["generate", "HEAD", "--force"])
        assert result.exit_code == 0
        assert "force=True" in result.output

    def test_generate_flag_force_short(self, runner):
        """Invoke generate HEAD with -f."""
        result = runner.invoke(cli, ["generate", "HEAD", "-f"])
        assert result.exit_code == 0
        assert "force=True" in result.output

    def test_generate_flag_before_argument(self, runner):
        """Invoke generate -f HEAD (flag preceding argument)."""
        result = runner.invoke(cli, ["generate", "-f", "HEAD"])
        assert result.exit_code == 0
        assert "force=True" in result.output
        assert "Verified CLI invocation for ref 'HEAD'" in result.output

    def test_generate_flag_force_without_argument(self, runner):
        """Invoke generate --force without commit ref (defaults to HEAD)."""
        result = runner.invoke(cli, ["generate", "--force"])
        assert result.exit_code == 0
        assert "force=True" in result.output
        assert "Verified CLI invocation for ref 'HEAD'" in result.output

    def test_generate_duplicate_skipping_behavior(self, runner):
        """Test duplicate protection: skip when report exists unless --force or -f is passed."""
        ensure_directories()
        synthetic_sha = "aabbccddeeff00112233445566778899aabbccdd"
        report_path = ANALYSIS_DIR / f"{synthetic_sha}.json"

        try:
            report_path.write_text(json.dumps({"commit_sha": synthetic_sha}), encoding="utf-8")
            assert report_path.is_file()

            # Case 1: normal generate -> must SKIP
            res_skip = runner.invoke(cli, ["generate", synthetic_sha])
            assert res_skip.exit_code == 0
            assert "[SKIP]" in res_skip.output
            assert "Content already generated" in res_skip.output

            # Case 2: generate with --force -> must BYPASS skip
            res_force = runner.invoke(cli, ["generate", synthetic_sha, "--force"])
            assert res_force.exit_code == 0
            assert "[SKIP]" not in res_force.output
            assert "force=True" in res_force.output

            # Case 3: generate with -f -> must BYPASS skip
            res_f = runner.invoke(cli, ["generate", synthetic_sha, "-f"])
            assert res_f.exit_code == 0
            assert "[SKIP]" not in res_f.output
            assert "force=True" in res_f.output
        finally:
            if report_path.exists():
                report_path.unlink()

    def test_generate_uppercase_sha_normalization(self, runner):
        """Ensure uppercase 40-char SHA is normalized to lowercase for duplicate check."""
        ensure_directories()
        lower_sha = "c0ffee0123456789c0ffee0123456789c0ffee01"
        upper_sha = lower_sha.upper()
        report_path = ANALYSIS_DIR / f"{lower_sha}.json"

        try:
            report_path.write_text(json.dumps({"commit_sha": lower_sha}), encoding="utf-8")

            # Calling with uppercase SHA should find the lowercase file and skip
            res = runner.invoke(cli, ["generate", upper_sha])
            assert res.exit_code == 0
            assert "[SKIP]" in res.output
        finally:
            if report_path.exists():
                report_path.unlink()


# ==============================================================================
# 2. SUBCOMMAND: install-hook & HOOK PERMISSIONS / TEMPLATE
# ==============================================================================

class TestCliInstallHookSubcommand:
    """Stress tests for the 'install-hook' subcommand."""

    def test_install_hook_execution_and_content(self, runner):
        """Verify install-hook creates valid executable hook."""
        result = runner.invoke(cli, ["install-hook"])
        assert result.exit_code == 0
        assert "Git post-commit hook successfully installed!" in result.output

        hook_file = REPO_ROOT / ".git" / "hooks" / "post-commit"
        assert hook_file.is_file()

        content = hook_file.read_text(encoding="utf-8")
        assert content.startswith("#!/bin/sh")
        assert "unset GIT_INDEX_FILE GIT_DIR GIT_WORK_TREE" in content
        assert "git rev-parse HEAD" in content
        assert "content/analysis/${COMMIT_SHA}.json" in content
        assert "$REPO_ROOT/content/logs" in content
        assert 'LOG_FILE="$LOGS_DIR/post-commit.log"' in content
        assert "nohup" in content

    def test_install_hook_idempotency(self, runner):
        """Verify calling install-hook multiple times consecutively is safe."""
        for _ in range(3):
            result = runner.invoke(cli, ["install-hook"])
            assert result.exit_code == 0
            assert "successfully installed" in result.output.lower()

    def test_install_hook_missing_git_directory(self, runner, tmp_path):
        """Verify install-hook errors cleanly when .git does not exist."""
        # Monkeypatch REPO_ROOT to a bare tmp_path without .git
        with patch("ai_content.cli.REPO_ROOT", tmp_path):
            result = runner.invoke(cli, ["install-hook"])
            assert result.exit_code != 0
            assert "Git repository not found" in result.output

    def test_install_hook_worktree_gitdir_pointer(self, runner, tmp_path):
        """Verify install-hook correctly handles .git as a gitdir pointer file."""
        real_git_dir = tmp_path / "actual_git_dir"
        real_git_dir.mkdir(parents=True)

        git_pointer_file = tmp_path / ".git"
        git_pointer_file.write_text(f"gitdir: {real_git_dir}\n", encoding="utf-8")

        with patch("ai_content.cli.REPO_ROOT", tmp_path):
            result = runner.invoke(cli, ["install-hook"])
            assert result.exit_code == 0
            hook_file = real_git_dir / "hooks" / "post-commit"
            assert hook_file.is_file()
            assert "unset GIT_INDEX_FILE" in hook_file.read_text(encoding="utf-8")


# ==============================================================================
# 3. SUBCOMMAND: status & INVENTORY REPORTING
# ==============================================================================

class TestCliStatusSubcommand:
    """Stress tests for the 'status' subcommand."""

    def test_status_baseline_output(self, runner):
        """Verify status displays expected header sections."""
        result = runner.invoke(cli, ["status"])
        assert result.exit_code == 0
        assert "AI Content Generator - System Status" in result.output
        assert "[Configuration]" in result.output
        assert "[Git Post-Commit Hook]" in result.output
        assert "[Generated Content Inventory]" in result.output

    def test_status_inventory_counting(self, runner):
        """Verify status accurately counts generated files in directories."""
        ensure_directories()
        dummy_sha = "9988776655443322110099887766554433221100"
        mock_analysis = ANALYSIS_DIR / f"{dummy_sha}.json"
        mock_article = ARTICLES_DIR / f"{dummy_sha}-test.md"
        mock_journal = JOURNAL_DIR / f"{dummy_sha}-journal.md"
        mock_social = SOCIAL_DIR / f"{dummy_sha}-social.md"
        mock_log = LOGS_DIR / "post-commit.log"

        try:
            mock_analysis.write_text(json.dumps({"test": 1}), encoding="utf-8")
            mock_article.write_text("# Article", encoding="utf-8")
            mock_journal.write_text("# Journal", encoding="utf-8")
            mock_social.write_text("# Social", encoding="utf-8")
            mock_log.write_text("log data", encoding="utf-8")

            result = runner.invoke(cli, ["status"])
            assert result.exit_code == 0
            assert "Analysis Reports (content/analysis/):" in result.output
            assert "Articles         (content/articles/):" in result.output
            assert "Dev Journals     (content/journal/):" in result.output
            assert "Social Threads   (content/social/):" in result.output
            assert "Logs             (content/logs/):" in result.output
            assert f"{dummy_sha[:7]}" in result.output
        finally:
            for p in (mock_analysis, mock_article, mock_journal, mock_social, mock_log):
                if p.exists():
                    p.unlink()

    def test_status_hook_installed_vs_uninstalled(self, runner, tmp_path):
        """Verify status accurately reports hook installed vs not installed."""
        hooks_dir = tmp_path / ".git" / "hooks"
        hooks_dir.mkdir(parents=True)
        hook_path = hooks_dir / "post-commit"

        with patch("ai_content.cli.REPO_ROOT", tmp_path):
            # Not installed
            res_not_inst = runner.invoke(cli, ["status"])
            assert res_not_inst.exit_code == 0
            assert "Not Installed" in res_not_inst.output

            # Installed
            hook_path.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
            res_inst = runner.invoke(cli, ["status"])
            assert res_inst.exit_code == 0
            assert "Installed" in res_inst.output


# ==============================================================================
# 4. INVALID ARGUMENTS, OPTIONS & ERROR HANDLING
# ==============================================================================

class TestCliInvalidArgumentsAndOptions:
    """Test behavior under invalid arguments, flags, and subcommands."""

    def test_unknown_subcommand(self, runner):
        """Invoke unknown subcommand; click should return exit code 2."""
        result = runner.invoke(cli, ["nonexistent-command"])
        assert result.exit_code == 2
        assert "No such command" in result.output

    def test_status_unexpected_argument(self, runner):
        """Invoke status with extra arguments; should fail with code 2."""
        result = runner.invoke(cli, ["status", "extra-argument"])
        assert result.exit_code == 2
        assert "Got unexpected extra argument" in result.output

    def test_install_hook_unexpected_argument(self, runner):
        """Invoke install-hook with extra arguments; should fail with code 2."""
        result = runner.invoke(cli, ["install-hook", "unexpected"])
        assert result.exit_code == 2
        assert "Got unexpected extra argument" in result.output

    def test_generate_unexpected_multiple_arguments(self, runner):
        """Invoke generate with multiple positional args; should fail with code 2."""
        result = runner.invoke(cli, ["generate", "HEAD", "extra_arg"])
        assert result.exit_code == 2
        assert "Got unexpected extra argument" in result.output

    def test_generate_unknown_option(self, runner):
        """Invoke generate with an invalid option; should fail with code 2."""
        result = runner.invoke(cli, ["generate", "--nonexistent-flag"])
        assert result.exit_code == 2
        assert "No such option" in result.output

    def test_generate_unknown_short_option(self, runner):
        """Invoke generate with an invalid short flag -z; should fail with code 2."""
        result = runner.invoke(cli, ["generate", "-z"])
        assert result.exit_code == 2
        assert "No such option" in result.output


# ==============================================================================
# 5. COMMIT RESOLUTION & ADVERSARIAL REFS
# ==============================================================================

class TestCommitResolutionAndAdversarialRefs:
    """Test resolution of standard, non-existent, and adversarial commit refs."""

    def test_resolve_valid_head(self):
        """Resolving 'HEAD' in this repo returns a valid 40-char lowercase hex SHA."""
        sha = resolve_commit_sha("HEAD")
        assert sha is not None
        assert len(sha) == 40
        assert all(c in "0123456789abcdef" for c in sha)

    def test_resolve_synthetic_40char_sha(self):
        """Resolving a synthetic 40-char hex string returns the normalized string."""
        synthetic = "1234567890ABCDEF1234567890ABCDEF12345678"
        resolved = resolve_commit_sha(synthetic)
        assert resolved == synthetic.lower()

    def test_resolve_nonexistent_branch_returns_none(self):
        """Resolving a non-existent branch name returns None without crashing."""
        nonexistent_ref = "nonexistent_branch_name_foo_bar_xyz_123"
        resolved = resolve_commit_sha(nonexistent_ref)
        assert resolved is None

    def test_resolve_nonexistent_sha_prefix(self):
        """Resolving a short non-existent hex string returns None."""
        resolved = resolve_commit_sha("deadbeef")
        assert resolved is None

    def test_generate_with_nonexistent_ref_graceful_handling(self, runner):
        """Generate with non-existent ref executes gracefully without crashing."""
        result = runner.invoke(cli, ["generate", "nonexistent_ref_999"])
        assert result.exit_code == 0
        assert "nonexistent_ref_999" in result.output

    def test_shell_injection_protection_in_commit_ref(self, runner):
        """Verify adversarial shell commands in commit_ref do NOT execute."""
        sentinel_file = REPO_ROOT / "injected_sentinel.txt"
        if sentinel_file.exists():
            sentinel_file.unlink()

        try:
            # Adversarial injection payload
            injection_ref = f"HEAD; touch {sentinel_file}"
            resolved = resolve_commit_sha(injection_ref)
            assert resolved is None  # git rev-parse rejects this safely

            res = runner.invoke(cli, ["generate", injection_ref])
            assert res.exit_code == 0
            # Ensure sentinel was NOT created
            assert not sentinel_file.exists(), "CRITICAL: Shell injection vulnerability detected!"
        finally:
            if sentinel_file.exists():
                sentinel_file.unlink()

    def test_adversarial_special_chars_in_ref(self, runner):
        """Special characters in ref should be handled safely."""
        special_ref = "../../../etc/passwd"
        resolved = resolve_commit_sha(special_ref)
        assert resolved is None

        res = runner.invoke(cli, ["generate", special_ref])
        assert res.exit_code == 0


# ==============================================================================
# 6. DIRECTORY CREATION & IDEMPOTENCY (ensure_directories)
# ==============================================================================

class TestEnsureDirectories:
    """Stress tests for ensure_directories() and content directory layout."""

    def test_ensure_directories_creates_all_five_subdirectories(self, tmp_path):
        """Verify ensure_directories creates all required subdirectories."""
        base_dir = tmp_path / "content"
        subdirs = (
            base_dir / "analysis",
            base_dir / "articles",
            base_dir / "journal",
            base_dir / "social",
            base_dir / "logs",
        )

        with patch("ai_content.config.ALL_CONTENT_DIRS", (base_dir, *subdirs)):
            for d in (base_dir, *subdirs):
                assert not d.exists()

            ensure_directories()

            assert base_dir.is_dir()
            for d in subdirs:
                assert d.is_dir()

    def test_ensure_directories_idempotent_multiple_calls(self):
        """Calling ensure_directories() repeatedly should succeed with no error."""
        for _ in range(5):
            ensure_directories()

        for d in (CONTENT_DIR, ANALYSIS_DIR, ARTICLES_DIR, JOURNAL_DIR, SOCIAL_DIR, LOGS_DIR):
            assert d.is_dir()

    def test_ensure_directories_partial_recovery(self, tmp_path):
        """If some subdirectories are deleted, ensure_directories restores them."""
        base_dir = tmp_path / "content"
        d1 = base_dir / "analysis"
        d2 = base_dir / "logs"

        with patch("ai_content.config.ALL_CONTENT_DIRS", (base_dir, d1, d2)):
            ensure_directories()
            assert d1.is_dir()
            assert d2.is_dir()

            # Remove one
            d2.rmdir()
            assert not d2.exists()

            # Ensure restores it
            ensure_directories()
            assert d2.is_dir()


# ==============================================================================
# 7. WORKING DIRECTORY INDEPENDENCE
# ==============================================================================

class TestWorkingDirectoryIndependence:
    """Test CLI and configuration when invoked from outside or inside deep subdirs."""

    def test_config_repo_root_is_absolute_and_valid(self):
        """REPO_ROOT must be absolute and contain package.json."""
        assert REPO_ROOT.is_absolute()
        assert (REPO_ROOT / "package.json").is_file()

    def test_resolve_commit_sha_from_different_cwd(self, tmp_path):
        """resolve_commit_sha should work even when current working directory is tmp_path."""
        old_cwd = os.getcwd()
        try:
            os.chdir(str(tmp_path))
            sha = resolve_commit_sha("HEAD")
            assert sha is not None
            assert len(sha) == 40
        finally:
            os.chdir(old_cwd)
