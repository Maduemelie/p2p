"""Milestone 4 Empirical Challenge & Adversarial Stress Test Suite.

Authoritative Specifications:
- c:/dev/p2p/.agents/ORIGINAL_REQUEST.md § 2026-09-22T11:12:20Z (Requirement R4)
- c:/dev/p2p/PROJECT.md § Feature 11, 12, 13 & M4 Post-Commit Hook Contract
- Dispatch instructions for m4_challenger_ai_2:
  1. Duplicate skipping mtime preservation: generate content, note mtime_ns of content/analysis/<sha>.json,
     generate again, verify mtime_ns is strictly identical and stdout contains full 40-char SHA and --force hint.
  2. Test --force and -f flags: verify generation is forced and file mtime updates.
  3. Test invalid CLI flags (generate HEAD --unknown-flag, generate -z): verify exit code is 2 and
     output contains BOTH "No such option" and "unknown".
  4. Worktree resolution, hook template invariants, alias consistency, and rapid duplicate bypass.
"""

from __future__ import annotations

import json
import os
import stat
import subprocess
import time
from pathlib import Path
from typing import Generator
from unittest.mock import patch

import pytest
from click.testing import CliRunner

from ai_content.cli import (
    HOOK_SCRIPT_TEMPLATE,
    cli,
    resolve_commit_sha,
    resolve_hooks_dir,
)
from ai_content.pipeline import run_pipeline


@pytest.fixture
def test_git_repo(tmp_path: Path) -> Generator[Path, None, None]:
    """Create an isolated, real Git repository with commits for empirical testing."""
    repo_dir = tmp_path / "empirical_m4_repo"
    repo_dir.mkdir(parents=True, exist_ok=True)

    def run_git(*args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["git", *args],
            cwd=str(repo_dir),
            capture_output=True,
            text=True,
            check=True,
            env={
                **os.environ,
                "GIT_AUTHOR_NAME": "M4 Challenger",
                "GIT_AUTHOR_EMAIL": "challenger@example.com",
                "GIT_COMMITTER_NAME": "M4 Committer",
                "GIT_COMMITTER_EMAIL": "committer@example.com",
            },
        )

    run_git("init", "-b", "main")
    run_git("config", "user.name", "M4 Challenger")
    run_git("config", "user.email", "challenger@example.com")
    run_git("config", "commit.gpgsign", "false")

    # Commit 1
    readme = repo_dir / "README.md"
    readme.write_text("# Empirical M4 Test\n", encoding="utf-8")
    run_git("add", "README.md")
    run_git("commit", "-m", "feat: initial empirical commit")

    # Commit 2
    feature = repo_dir / "feature.py"
    feature.write_text("print('hello world')\n", encoding="utf-8")
    run_git("add", "feature.py")
    run_git("commit", "-m", "feat: second empirical commit")

    repo_dir.run_git = run_git  # type: ignore[attr-defined]
    yield repo_dir


# ==============================================================================
# 1. DUPLICATE SKIPPING & MTIME PRESERVATION
# ==============================================================================

class TestDuplicateSkippingMtimePreservation:
    """Stress-test duplicate skipping and nanosecond-level mtime preservation."""

    def test_duplicate_skipping_preserves_mtime_ns_strictly(
        self, test_git_repo: Path, monkeypatch: pytest.MonkeyPatch
    ):
        """Initial run creates files; second run leaves mtime_ns strictly identical."""
        monkeypatch.setenv("AI_CONTENT_MOCK", "1")
        monkeypatch.chdir(test_git_repo)
        runner = CliRunner()

        sha = test_git_repo.run_git("rev-parse", "HEAD").stdout.strip()  # type: ignore[attr-defined]
        assert len(sha) == 40

        # Step 1: Initial generation
        res1 = runner.invoke(cli, ["generate", sha])
        assert res1.exit_code == 0, f"Initial generation failed: {res1.output}"
        assert "Pipeline completed successfully" in res1.output
        assert sha in res1.output

        analysis_file = test_git_repo / "content" / "analysis" / f"{sha}.json"
        assert analysis_file.is_file(), f"Analysis file missing: {analysis_file}"
        initial_mtime_ns = analysis_file.stat().st_mtime_ns

        # Also track article, journal, social files
        articles_dir = test_git_repo / "content" / "articles"
        journal_dir = test_git_repo / "content" / "journal"
        social_dir = test_git_repo / "content" / "social"
        articles = list(articles_dir.glob(f"{sha}*.md"))
        journals = list(journal_dir.glob(f"{sha}*.md"))
        socials = list(social_dir.glob(f"{sha}*.md"))
        assert len(articles) == 1, f"Expected 1 article for {sha}, found {len(articles)}"
        assert len(journals) == 1, f"Expected 1 journal for {sha}, found {len(journals)}"
        assert len(socials) == 1, f"Expected 1 social for {sha}, found {len(socials)}"
        article_file = articles[0]
        journal_file = journals[0]
        social_file = socials[0]

        initial_art_mtime = article_file.stat().st_mtime_ns
        initial_jrn_mtime = journal_file.stat().st_mtime_ns
        initial_soc_mtime = social_file.stat().st_mtime_ns

        # Sleep to guarantee time progression if touch occurred
        time.sleep(0.06)

        # Step 2: Duplicate generation
        res2 = runner.invoke(cli, ["generate", sha])
        assert res2.exit_code == 0, f"Duplicate generation failed: {res2.output}"
        assert "[SKIP]" in res2.output
        assert sha in res2.output, "Skip notice must cite full 40-char SHA"
        assert "--force" in res2.output, "Skip notice must cite --force flag"

        # Step 3: Verify mtime_ns is strictly identical
        second_mtime_ns = analysis_file.stat().st_mtime_ns
        assert second_mtime_ns == initial_mtime_ns, (
            f"Analysis file mtime_ns changed! Initial: {initial_mtime_ns}, After skip: {second_mtime_ns}"
        )
        assert article_file.stat().st_mtime_ns == initial_art_mtime
        assert journal_file.stat().st_mtime_ns == initial_jrn_mtime
        assert social_file.stat().st_mtime_ns == initial_soc_mtime

    def test_duplicate_skipping_across_all_ref_aliases(
        self, test_git_repo: Path, monkeypatch: pytest.MonkeyPatch
    ):
        """Duplicate skipping succeeds and preserves mtime across HEAD, short SHA, and full SHA."""
        monkeypatch.setenv("AI_CONTENT_MOCK", "1")
        monkeypatch.chdir(test_git_repo)
        runner = CliRunner()

        full_sha = test_git_repo.run_git("rev-parse", "HEAD").stdout.strip()  # type: ignore[attr-defined]
        short_sha = full_sha[:7]

        # Initial generation with HEAD
        res_head = runner.invoke(cli, ["generate", "HEAD"])
        assert res_head.exit_code == 0
        analysis_file = test_git_repo / "content" / "analysis" / f"{full_sha}.json"
        assert analysis_file.is_file()
        baseline_mtime_ns = analysis_file.stat().st_mtime_ns

        time.sleep(0.06)

        # Duplicate with full SHA
        res_full = runner.invoke(cli, ["generate", full_sha])
        assert res_full.exit_code == 0
        assert "[SKIP]" in res_full.output
        assert full_sha in res_full.output
        assert analysis_file.stat().st_mtime_ns == baseline_mtime_ns

        time.sleep(0.06)

        # Duplicate with short SHA
        res_short = runner.invoke(cli, ["generate", short_sha])
        assert res_short.exit_code == 0
        assert "[SKIP]" in res_short.output
        assert analysis_file.stat().st_mtime_ns == baseline_mtime_ns

        time.sleep(0.06)

        # Duplicate with default ref (omit argument)
        res_default = runner.invoke(cli, ["generate"])
        assert res_default.exit_code == 0
        assert "[SKIP]" in res_default.output
        assert analysis_file.stat().st_mtime_ns == baseline_mtime_ns

    def test_multiple_consecutive_duplicate_skips(
        self, test_git_repo: Path, monkeypatch: pytest.MonkeyPatch
    ):
        """Five consecutive duplicate runs must all succeed and leave mtime untouched."""
        monkeypatch.setenv("AI_CONTENT_MOCK", "1")
        monkeypatch.chdir(test_git_repo)
        runner = CliRunner()

        sha = test_git_repo.run_git("rev-parse", "HEAD").stdout.strip()  # type: ignore[attr-defined]
        runner.invoke(cli, ["generate", sha])
        analysis_file = test_git_repo / "content" / "analysis" / f"{sha}.json"
        orig_mtime_ns = analysis_file.stat().st_mtime_ns

        for i in range(5):
            time.sleep(0.02)
            res = runner.invoke(cli, ["generate", sha])
            assert res.exit_code == 0
            assert "[SKIP]" in res.output
            assert sha in res.output
            assert analysis_file.stat().st_mtime_ns == orig_mtime_ns, (
                f"mtime changed on duplicate run {i + 1}"
            )


# ==============================================================================
# 2. FORCE REGENERATION (--force / -f)
# ==============================================================================

class TestForceRegeneration:
    """Stress-test forced generation bypassing duplicate skip and advancing mtime."""

    def test_long_flag_force_updates_mtime(
        self, test_git_repo: Path, monkeypatch: pytest.MonkeyPatch
    ):
        """Verify --force flag forces generation and strictly advances mtime."""
        monkeypatch.setenv("AI_CONTENT_MOCK", "1")
        monkeypatch.chdir(test_git_repo)
        runner = CliRunner()

        sha = test_git_repo.run_git("rev-parse", "HEAD").stdout.strip()  # type: ignore[attr-defined]

        # Initial generation
        res1 = runner.invoke(cli, ["generate", sha])
        assert res1.exit_code == 0
        analysis_file = test_git_repo / "content" / "analysis" / f"{sha}.json"
        mtime1 = analysis_file.stat().st_mtime_ns

        time.sleep(0.06)

        # Forced run with --force
        res_force = runner.invoke(cli, ["generate", sha, "--force"])
        assert res_force.exit_code == 0, f"--force run failed: {res_force.output}"
        assert "[SKIP]" not in res_force.output, "Forced run must NOT be skipped"
        assert "Pipeline completed successfully" in res_force.output
        assert sha in res_force.output

        mtime2 = analysis_file.stat().st_mtime_ns
        assert mtime2 > mtime1, f"mtime was not updated after --force: {mtime2} <= {mtime1}"

    def test_short_flag_f_updates_mtime(
        self, test_git_repo: Path, monkeypatch: pytest.MonkeyPatch
    ):
        """Verify -f short flag forces generation and strictly advances mtime."""
        monkeypatch.setenv("AI_CONTENT_MOCK", "1")
        monkeypatch.chdir(test_git_repo)
        runner = CliRunner()

        sha = test_git_repo.run_git("rev-parse", "HEAD").stdout.strip()  # type: ignore[attr-defined]

        # Initial generation
        runner.invoke(cli, ["generate", sha])
        analysis_file = test_git_repo / "content" / "analysis" / f"{sha}.json"
        mtime1 = analysis_file.stat().st_mtime_ns

        time.sleep(0.06)

        # Forced run with -f
        res_f = runner.invoke(cli, ["generate", sha, "-f"])
        assert res_f.exit_code == 0, f"-f run failed: {res_f.output}"
        assert "[SKIP]" not in res_f.output
        assert "Pipeline completed successfully" in res_f.output

        mtime2 = analysis_file.stat().st_mtime_ns
        assert mtime2 > mtime1, f"mtime was not updated after -f: {mtime2} <= {mtime1}"

    def test_force_with_head_and_short_sha(
        self, test_git_repo: Path, monkeypatch: pytest.MonkeyPatch
    ):
        """Verify --force works with relative ref HEAD and short SHA."""
        monkeypatch.setenv("AI_CONTENT_MOCK", "1")
        monkeypatch.chdir(test_git_repo)
        runner = CliRunner()

        sha = test_git_repo.run_git("rev-parse", "HEAD").stdout.strip()  # type: ignore[attr-defined]
        short_sha = sha[:7]

        # Initial generation
        runner.invoke(cli, ["generate", "HEAD"])
        analysis_file = test_git_repo / "content" / "analysis" / f"{sha}.json"
        mtime1 = analysis_file.stat().st_mtime_ns

        time.sleep(0.06)

        # Force with HEAD
        res_head = runner.invoke(cli, ["generate", "HEAD", "--force"])
        assert res_head.exit_code == 0
        assert "[SKIP]" not in res_head.output
        mtime2 = analysis_file.stat().st_mtime_ns
        assert mtime2 > mtime1

        time.sleep(0.06)

        # Force with short SHA
        res_short = runner.invoke(cli, ["generate", short_sha, "-f"])
        assert res_short.exit_code == 0
        assert "[SKIP]" not in res_short.output
        mtime3 = analysis_file.stat().st_mtime_ns
        assert mtime3 > mtime2

    def test_force_regeneration_leaves_no_temp_files(
        self, test_git_repo: Path, monkeypatch: pytest.MonkeyPatch
    ):
        """Verify repeated --force runs leave zero .tmp files under content/."""
        monkeypatch.setenv("AI_CONTENT_MOCK", "1")
        monkeypatch.chdir(test_git_repo)
        runner = CliRunner()

        runner.invoke(cli, ["generate", "HEAD"])
        runner.invoke(cli, ["generate", "HEAD", "--force"])
        runner.invoke(cli, ["generate", "HEAD", "-f"])

        content_dir = test_git_repo / "content"
        tmp_files = list(content_dir.rglob("*.tmp*"))
        assert len(tmp_files) == 0, f"Found lingering temporary files: {tmp_files}"


# ==============================================================================
# 3. INVALID CLI FLAGS & ERROR FORMATTING
# ==============================================================================

class TestInvalidCliFlags:
    """Stress-test invalid CLI flags for exit code 2 and BOTH error tokens."""

    def test_generate_head_unknown_flag(self):
        """'generate HEAD --unknown-flag': exit code 2, output contains 'No such option' AND 'unknown'."""
        runner = CliRunner()
        result = runner.invoke(cli, ["generate", "HEAD", "--unknown-flag"])
        assert result.exit_code == 2, f"Expected exit code 2, got {result.exit_code}"
        assert "No such option" in result.output, f"Missing 'No such option' in: {result.output}"
        assert "unknown" in result.output.lower(), f"Missing 'unknown' in: {result.output}"

    def test_generate_short_unknown_flag_z(self):
        """'generate -z': exit code 2, output contains 'No such option' AND 'unknown'."""
        runner = CliRunner()
        result = runner.invoke(cli, ["generate", "-z"])
        assert result.exit_code == 2, f"Expected exit code 2, got {result.exit_code}"
        assert "No such option" in result.output, f"Missing 'No such option' in: {result.output}"
        assert "unknown" in result.output.lower(), f"Missing 'unknown' in: {result.output}"

    def test_generate_head_short_unknown_flag_z(self):
        """'generate HEAD -z': exit code 2, output contains 'No such option' AND 'unknown'."""
        runner = CliRunner()
        result = runner.invoke(cli, ["generate", "HEAD", "-z"])
        assert result.exit_code == 2, f"Expected exit code 2, got {result.exit_code}"
        assert "No such option" in result.output, f"Missing 'No such option' in: {result.output}"
        assert "unknown" in result.output.lower(), f"Missing 'unknown' in: {result.output}"

    def test_generate_arbitrary_unknown_long_flags(self):
        """Various unknown long flags all exit with code 2 and both error tokens."""
        runner = CliRunner()
        for flag in ["--nonexistent-flag", "--bogus", "--foo-bar", "--output-format"]:
            result = runner.invoke(cli, ["generate", "HEAD", flag])
            assert result.exit_code == 2, f"Failed for {flag}: {result.exit_code}"
            assert "No such option" in result.output, f"Failed for {flag}: {result.output}"
            assert "unknown" in result.output.lower(), f"Failed for {flag}: {result.output}"

    def test_root_command_unknown_flags(self):
        """Root command invalid flags exit with code 2 and both error tokens."""
        runner = CliRunner()
        res_long = runner.invoke(cli, ["--unknown-flag"])
        assert res_long.exit_code == 2
        assert "No such option" in res_long.output
        assert "unknown" in res_long.output.lower()

        res_short = runner.invoke(cli, ["-z"])
        assert res_short.exit_code == 2
        assert "No such option" in res_short.output
        assert "unknown" in res_short.output.lower()

    def test_subcommands_unknown_flags(self):
        """Other subcommands (install-hook, status) also reject unknown options identically."""
        runner = CliRunner()

        for subcmd in ["install-hook", "status"]:
            res_long = runner.invoke(cli, [subcmd, "--unknown-flag"])
            assert res_long.exit_code == 2, f"{subcmd} --unknown-flag failed"
            assert "No such option" in res_long.output
            assert "unknown" in res_long.output.lower()

            res_short = runner.invoke(cli, [subcmd, "-z"])
            assert res_short.exit_code == 2, f"{subcmd} -z failed"
            assert "No such option" in res_short.output
            assert "unknown" in res_short.output.lower()


# ==============================================================================
# 4. HOOK SCRIPT FAST DUPLICATE BYPASS & INVARIANTS
# ==============================================================================

class TestHookScriptInvariants:
    """Stress-test hook script template invariants and duplicate bypass design."""

    def test_hook_template_contains_fast_duplicate_bypass(self):
        """Hook script must check analysis file existence in shell and exit 0 immediately."""
        assert 'ANALYSIS_FILE="$REPO_ROOT/content/analysis/${COMMIT_SHA}.json"' in HOOK_SCRIPT_TEMPLATE
        assert '[ -f "$ANALYSIS_FILE" ] && exit 0' in HOOK_SCRIPT_TEMPLATE

    def test_hook_template_unsets_git_env(self):
        """Hook script must unset GIT_INDEX_FILE, GIT_DIR, GIT_WORK_TREE to avoid index lock."""
        assert "unset GIT_INDEX_FILE GIT_DIR GIT_WORK_TREE" in HOOK_SCRIPT_TEMPLATE

    def test_hook_template_nohup_spawn(self):
        """Hook script must invoke CLI in background via nohup redirecting to post-commit.log."""
        assert "nohup uv run python -m ai_content.cli generate" in HOOK_SCRIPT_TEMPLATE
        assert ">> content/logs/post-commit.log 2>&1 < /dev/null &" in HOOK_SCRIPT_TEMPLATE

    def test_hook_installation_writes_posix_lf(
        self, test_git_repo: Path, monkeypatch: pytest.MonkeyPatch
    ):
        """install-hook subcommand writes .git/hooks/post-commit with POSIX LF line endings."""
        monkeypatch.chdir(test_git_repo)
        runner = CliRunner()

        res = runner.invoke(cli, ["install-hook"])
        assert res.exit_code == 0

        hook_path = test_git_repo / ".git" / "hooks" / "post-commit"
        assert hook_path.is_file()
        content_bytes = hook_path.read_bytes()
        assert b"\r\n" not in content_bytes, "Hook script must strictly use POSIX LF endings"
        assert content_bytes.startswith(b"#!/bin/sh\n")


# ==============================================================================
# 5. ITERATION 2 REMEDIATION: ISOLATED WORKTREE, BARE DIRECTORY & MONKEYPATCH HARNESS
# ==============================================================================

class TestIteration2RemediationEmpiricalHarness:
    """Stress-test Iteration 2 remediation: isolated bare directories, worktrees, and monkeypatches."""

    def test_install_hook_in_bare_directory_fails_cleanly_without_touching_workspace(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ):
        """Run install-hook in bare temp dir -> non-zero, 'Git repository not found', p2p untouched."""
        bare_dir = tmp_path / "bare_isolated_dir"
        bare_dir.mkdir(parents=True, exist_ok=True)

        p2p_hook = Path("c:/dev/p2p/.git/hooks/post-commit")
        p2p_hook_exists = p2p_hook.is_file()
        p2p_hook_mtime = p2p_hook.stat().st_mtime_ns if p2p_hook_exists else None

        monkeypatch.chdir(bare_dir)
        runner = CliRunner()

        result = runner.invoke(cli, ["install-hook"])
        assert result.exit_code != 0, f"Expected non-zero exit code, got {result.exit_code}"
        assert "Git repository not found" in result.output, f"Expected 'Git repository not found' in: {result.output}"

        if p2p_hook_exists:
            assert p2p_hook.stat().st_mtime_ns == p2p_hook_mtime, "c:/dev/p2p hook was modified!"
        else:
            assert not p2p_hook.exists(), "c:/dev/p2p hook was spuriously created!"

    def test_status_in_bare_directory_fails_cleanly(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ):
        """Run status in bare temp dir -> non-zero, 'Git repository not found'."""
        bare_dir = tmp_path / "bare_status_isolated"
        bare_dir.mkdir(parents=True, exist_ok=True)

        monkeypatch.chdir(bare_dir)
        runner = CliRunner()

        result = runner.invoke(cli, ["status"])
        assert result.exit_code != 0, f"Expected non-zero exit code, got {result.exit_code}"
        assert "Git repository not found" in result.output, f"Expected 'Git repository not found' in: {result.output}"

    def test_install_hook_in_worktree_pointer(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ):
        """Run install-hook in worktree pointer -> hook written to <path>/hooks/post-commit."""
        worktree_repo = tmp_path / "worktree_repo"
        worktree_repo.mkdir(parents=True, exist_ok=True)

        actual_git_dir = tmp_path / "actual_git_dir"
        actual_git_dir.mkdir(parents=True, exist_ok=True)

        # Write .git pointer file
        git_pointer = worktree_repo / ".git"
        git_pointer.write_text(f"gitdir: {actual_git_dir}\n", encoding="utf-8")

        monkeypatch.chdir(worktree_repo)
        runner = CliRunner()

        result = runner.invoke(cli, ["install-hook"])
        assert result.exit_code == 0, f"Expected exit code 0, got {result.exit_code}: {result.output}"

        hook_file = actual_git_dir / "hooks" / "post-commit"
        assert hook_file.is_file(), f"Hook file not written to {hook_file}"
        hook_content = hook_file.read_text(encoding="utf-8")
        assert "unset GIT_INDEX_FILE" in hook_content
        assert "post-commit.log" in hook_content

        # Verify worktree repo itself doesn't have spurious hooks dir
        assert not (worktree_repo / "hooks").exists()

    def test_monkeypatched_repo_root_without_git_raises_click_exception(
        self, tmp_path: Path
    ):
        """Monkeypatch REPO_ROOT without .git -> ClickException with 'Git repository not found'."""
        bare_patch_dir = tmp_path / "bare_patch_dir"
        bare_patch_dir.mkdir(parents=True, exist_ok=True)

        runner = CliRunner()
        with patch("ai_content.cli.REPO_ROOT", bare_patch_dir):
            res_hook = runner.invoke(cli, ["install-hook"])
            assert res_hook.exit_code != 0
            assert "Git repository not found" in res_hook.output

            res_status = runner.invoke(cli, ["status"])
            assert res_status.exit_code != 0
            assert "Git repository not found" in res_status.output

