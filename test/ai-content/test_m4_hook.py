"""Unit and Integration Tests for Milestone 4 (Post-Commit Hook & Duplicate Protection).

Covers:
  - install-hook subcommand creates .git/hooks/post-commit with 0o755 permissions and POSIX LF line endings
  - install-hook idempotency (multiple runs succeed with exit code 0)
  - Hook script template string assertions (unset GIT_INDEX_FILE, nohup, redirection, fast duplicate check)
  - status subcommand output formatting (Hook Installed: Yes/No, Analyses Count, commit SHA listing)
  - Worktree detection in install-hook and status commands (gitdir: resolution)
  - Duplicate skipping behavior via Click runner:
      * First run creates deliverables
      * Second run exits code 0, prints [SKIP] mentioning 40-char SHA and --force
      * mtime of analysis file is completely untouched
  - --force / -f flag bypasses duplicate skipping and updates deliverables
  - Click Option Error Formatting for unrecognized options (contains 'No such option' and 'unknown')
"""

from __future__ import annotations

import json
import os
import stat
import subprocess
import time
from pathlib import Path
from typing import Generator

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
def m4_git_repo(tmp_path: Path) -> Generator[Path, None, None]:
    """Create a real initialized Git repository with sample commits for M4 tests."""
    repo_dir = tmp_path / "m4_repo"
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
                "GIT_AUTHOR_NAME": "M4 Developer",
                "GIT_AUTHOR_EMAIL": "m4dev@example.com",
                "GIT_COMMITTER_NAME": "M4 Committer",
                "GIT_COMMITTER_EMAIL": "m4committer@example.com",
            },
        )

    run_git("init", "-b", "main")
    run_git("config", "user.name", "M4 Developer")
    run_git("config", "user.email", "m4dev@example.com")
    run_git("config", "commit.gpgsign", "false")

    # Initial commit
    readme = repo_dir / "README.md"
    readme.write_text("# M4 Test Repository\n", encoding="utf-8")
    run_git("add", "README.md")
    run_git("commit", "-m", "feat: initial commit for m4 testing")

    repo_dir.run_git = run_git  # type: ignore[attr-defined]
    yield repo_dir


class TestPostCommitHookInstallation:
    """Tests for Git post-commit hook deployment, permissions, and idempotency."""

    def test_install_hook_creates_executable_post_commit_hook(
        self, m4_git_repo: Path, monkeypatch: pytest.MonkeyPatch
    ):
        """Verify install-hook creates .git/hooks/post-commit with 0o755 and POSIX LF endings."""
        monkeypatch.chdir(m4_git_repo)
        runner = CliRunner()

        hook_path = m4_git_repo / ".git" / "hooks" / "post-commit"
        assert not hook_path.exists(), "Hook should not exist prior to installation"

        result = runner.invoke(cli, ["install-hook"])
        assert result.exit_code == 0, f"install-hook failed: {result.output}"
        assert "Git post-commit hook successfully installed!" in result.output
        assert hook_path.is_file(), "Hook file must be created"

        # Check raw bytes for POSIX LF endings (no CRLF '\r\n')
        raw_bytes = hook_path.read_bytes()
        assert b"\r\n" not in raw_bytes, "Hook must use POSIX LF line endings, not CRLF"
        assert raw_bytes.startswith(b"#!/bin/sh"), "Hook must start with #!/bin/sh"
        assert raw_bytes.endswith(b"\n"), "Hook must end with a trailing newline"

        # Check executable permissions (on POSIX systems, and mode bits on Windows)
        mode = hook_path.stat().st_mode
        # The file mode should include read and execute permissions
        assert mode & stat.S_IEXEC or os.name == "nt", "Hook file should be marked executable"

    def test_install_hook_idempotency(
        self, m4_git_repo: Path, monkeypatch: pytest.MonkeyPatch
    ):
        """Verify install-hook can be executed repeatedly with zero errors or side-effects."""
        monkeypatch.chdir(m4_git_repo)
        runner = CliRunner()

        # Run 1
        res1 = runner.invoke(cli, ["install-hook"])
        assert res1.exit_code == 0
        hook_path = m4_git_repo / ".git" / "hooks" / "post-commit"
        assert hook_path.is_file()
        content1 = hook_path.read_text(encoding="utf-8")

        # Run 2
        res2 = runner.invoke(cli, ["install-hook"])
        assert res2.exit_code == 0
        content2 = hook_path.read_text(encoding="utf-8")

        # Run 3
        res3 = runner.invoke(cli, ["install-hook"])
        assert res3.exit_code == 0
        content3 = hook_path.read_text(encoding="utf-8")

        assert content1 == content2 == content3

    def test_hook_template_string_validations(self):
        """Verify HOOK_SCRIPT_TEMPLATE contains all required shell invariants."""
        assert HOOK_SCRIPT_TEMPLATE.startswith("#!/bin/sh")
        assert "unset GIT_INDEX_FILE GIT_DIR GIT_WORK_TREE" in HOOK_SCRIPT_TEMPLATE
        assert 'cd "$REPO_ROOT" || exit 0' in HOOK_SCRIPT_TEMPLATE
        assert 'ANALYSIS_FILE="$REPO_ROOT/content/analysis/${COMMIT_SHA}.json"' in HOOK_SCRIPT_TEMPLATE
        assert '[ -f "$ANALYSIS_FILE" ] && exit 0' in HOOK_SCRIPT_TEMPLATE
        assert "nohup uv run python -m ai_content.cli generate" in HOOK_SCRIPT_TEMPLATE
        assert ">> content/logs/post-commit.log 2>&1 < /dev/null &" in HOOK_SCRIPT_TEMPLATE
        assert 'LOG_FILE="$LOGS_DIR/post-commit.log"' in HOOK_SCRIPT_TEMPLATE
        assert "exit 0" in HOOK_SCRIPT_TEMPLATE

    def test_install_hook_missing_git_directory_raises_clean_error(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ):
        """Verify calling install-hook from a bare directory lacking .git raises ClickException."""
        bare_dir = tmp_path / "bare_non_repo"
        bare_dir.mkdir(parents=True, exist_ok=True)

        monkeypatch.chdir(bare_dir)
        runner = CliRunner()

        result = runner.invoke(cli, ["install-hook"])
        assert result.exit_code != 0
        assert "Git repository not found" in result.output


class TestStatusCommand:
    """Tests for the 'status' command reporting hook status and content inventory."""

    def test_status_hook_not_installed_initially(
        self, m4_git_repo: Path, monkeypatch: pytest.MonkeyPatch
    ):
        """Verify status reports 'Hook Installed:  No' and 'Analyses Count:  0' initially."""
        monkeypatch.chdir(m4_git_repo)
        runner = CliRunner()

        result = runner.invoke(cli, ["status"])
        assert result.exit_code == 0
        assert "Hook Installed:  No" in result.output
        assert "Analyses Count:  0" in result.output

    def test_status_hook_installed_and_inventory_reporting(
        self, m4_git_repo: Path, monkeypatch: pytest.MonkeyPatch
    ):
        """Verify status reflects installed hook and reports commit SHA in recent analyses."""
        monkeypatch.chdir(m4_git_repo)
        runner = CliRunner()

        # Install hook
        install_res = runner.invoke(cli, ["install-hook"])
        assert install_res.exit_code == 0

        # Create mock analysis report
        head_sha = m4_git_repo.run_git("rev-parse", "HEAD").stdout.strip()  # type: ignore[attr-defined]
        analysis_dir = m4_git_repo / "content" / "analysis"
        analysis_dir.mkdir(parents=True, exist_ok=True)
        report_file = analysis_dir / f"{head_sha}.json"
        report_file.write_text(
            json.dumps({"commit_sha": head_sha, "summary": "M4 test report"}),
            encoding="utf-8",
        )

        result = runner.invoke(cli, ["status"])
        assert result.exit_code == 0
        assert "Hook Installed:  Yes" in result.output
        assert "Analyses Count:  1" in result.output
        assert head_sha in result.output

    def test_worktree_detection_in_install_hook_and_status(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ):
        """Verify resolve_hooks_dir, install-hook, and status support worktree pointer files."""
        worktree_repo = tmp_path / "worktree_repo"
        worktree_repo.mkdir(parents=True, exist_ok=True)

        actual_git_dir = tmp_path / "actual_git_dir"
        actual_git_dir.mkdir(parents=True, exist_ok=True)

        # Create .git file with gitdir pointer
        git_pointer = worktree_repo / ".git"
        git_pointer.write_text(f"gitdir: {actual_git_dir}\n", encoding="utf-8")

        monkeypatch.chdir(worktree_repo)
        runner = CliRunner()

        # Before installation
        status_res1 = runner.invoke(cli, ["status"])
        assert status_res1.exit_code == 0
        assert "Hook Installed:  No" in status_res1.output

        # Install hook
        install_res = runner.invoke(cli, ["install-hook"])
        assert install_res.exit_code == 0
        expected_hook = actual_git_dir / "hooks" / "post-commit"
        assert expected_hook.is_file(), "Hook must be installed inside the pointed gitdir"

        # After installation
        status_res2 = runner.invoke(cli, ["status"])
        assert status_res2.exit_code == 0
        assert "Hook Installed:  Yes" in status_res2.output

    def test_status_missing_git_directory_raises_clean_error(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ):
        """Verify calling status from a bare directory lacking .git raises ClickException."""
        bare_dir = tmp_path / "bare_non_repo"
        bare_dir.mkdir(parents=True, exist_ok=True)

        monkeypatch.chdir(bare_dir)
        runner = CliRunner()

        result = runner.invoke(cli, ["status"])
        assert result.exit_code != 0
        assert "Git repository not found" in result.output


class TestDuplicateProtection:
    """Tests for duplicate skipping, SHA inclusion in stdout, and --force bypass."""

    def test_duplicate_skipping_preserves_mtime(
        self, m4_git_repo: Path, monkeypatch: pytest.MonkeyPatch
    ):
        """Verify second generate run exits 0, mentions 40-char SHA and --force, and keeps mtime untouched."""
        monkeypatch.setenv("AI_CONTENT_MOCK", "1")
        monkeypatch.chdir(m4_git_repo)
        runner = CliRunner()

        head_sha = m4_git_repo.run_git("rev-parse", "HEAD").stdout.strip()  # type: ignore[attr-defined]
        assert len(head_sha) == 40

        # Run 1: Create deliverables
        run1 = runner.invoke(cli, ["generate", "HEAD"])
        assert run1.exit_code == 0
        assert "Pipeline completed successfully" in run1.output
        assert head_sha in run1.output

        analysis_file = m4_git_repo / "content" / "analysis" / f"{head_sha}.json"
        assert analysis_file.is_file()
        orig_mtime_ns = analysis_file.stat().st_mtime_ns

        # Sleep briefly to ensure any modification would change timestamp
        time.sleep(0.05)

        # Run 2: Duplicate invocation without --force
        run2 = runner.invoke(cli, ["generate", "HEAD"])
        assert run2.exit_code == 0
        assert "[SKIP]" in run2.output
        assert head_sha in run2.output, "Skip message must explicitly mention the 40-char SHA"
        assert "--force" in run2.output, "Skip message must mention --force"

        # Check mtime is completely untouched
        current_mtime_ns = analysis_file.stat().st_mtime_ns
        assert current_mtime_ns == orig_mtime_ns, "Analysis file mtime must be completely untouched on duplicate skip"

    def test_force_flag_bypasses_duplicate_protection(
        self, m4_git_repo: Path, monkeypatch: pytest.MonkeyPatch
    ):
        """Verify --force and -f flags bypass duplicate skipping and regenerate files."""
        monkeypatch.setenv("AI_CONTENT_MOCK", "1")
        monkeypatch.chdir(m4_git_repo)
        runner = CliRunner()

        head_sha = m4_git_repo.run_git("rev-parse", "HEAD").stdout.strip()  # type: ignore[attr-defined]

        # Initial generation
        run1 = runner.invoke(cli, ["generate", "HEAD"])
        assert run1.exit_code == 0
        analysis_file = m4_git_repo / "content" / "analysis" / f"{head_sha}.json"
        assert analysis_file.is_file()
        mtime1 = analysis_file.stat().st_mtime_ns

        time.sleep(0.05)

        # Force run with --force
        run_force = runner.invoke(cli, ["generate", "HEAD", "--force"])
        assert run_force.exit_code == 0
        assert "[SKIP]" not in run_force.output
        assert "Pipeline completed successfully" in run_force.output
        mtime2 = analysis_file.stat().st_mtime_ns
        assert mtime2 > mtime1, "Analysis file mtime must be updated after --force run"

        time.sleep(0.05)

        # Force run with short flag -f
        run_short_f = runner.invoke(cli, ["generate", "HEAD", "-f"])
        assert run_short_f.exit_code == 0
        assert "[SKIP]" not in run_short_f.output
        assert "Pipeline completed successfully" in run_short_f.output
        mtime3 = analysis_file.stat().st_mtime_ns
        assert mtime3 > mtime2, "Analysis file mtime must be updated after -f run"


class TestClickOptionErrorFormatting:
    """Tests for Click error message formatting on invalid/unrecognized options."""

    def test_unrecognized_long_option_formatting(self):
        """Verify error message contains both 'No such option' and 'unknown' with exit code 2."""
        runner = CliRunner()
        result = runner.invoke(cli, ["generate", "HEAD", "--non-existent-option"])
        assert result.exit_code == 2
        assert "No such option" in result.output
        assert "unknown" in result.output.lower()

    def test_unrecognized_short_option_formatting(self):
        """Verify error message for invalid short flag contains both 'No such option' and 'unknown'."""
        runner = CliRunner()
        result = runner.invoke(cli, ["generate", "-z"])
        assert result.exit_code == 2
        assert "No such option" in result.output
        assert "unknown" in result.output.lower()
