"""Empirical Challenge Stress Test Suite for Milestone 2: Git Context & Data Models.

Verifies and empirically challenges Git operations in isolated temporary Git repos:
1. Root commit (initial commit with 0 parents).
2. Merge commit (2 parents).
3. Empty commit (git commit --allow-empty).
4. Detached HEAD (git checkout --detach).
5. Huge diff (>5,000 lines or >30,000 chars) -> line-boundary truncation and summary banner.
6. Binary file add/modify (both addition and modification of binary assets).
7. Rename file tracking (status 'R' and old_filename tracking).
8. Invalid commit SHA (ffffffffffffffffffffffffffffffffffffffff) -> exit code 1.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import List
from unittest.mock import patch

import pytest
from click.testing import CliRunner

from ai_content.cli import cli
from ai_content.git_context import (
    GitCommitNotFoundError,
    GitError,
    collect_git_context,
    extract_diff,
    extract_new_path_from_numstat,
    get_changed_files,
    get_commit_metadata,
    resolve_commit_sha,
    truncate_diff,
    unquote_git_path,
)
from ai_content.models import FileChangeDetail, GitCommitContext


# ==============================================================================
# Helper utilities for isolated git operations
# ==============================================================================

def git(repo: Path, *args: str) -> str:
    """Execute git command in the test repository and return trimmed stdout."""
    res = subprocess.run(
        ["git", *args],
        cwd=str(repo),
        capture_output=True,
        text=True,
        check=True,
        env={
            **os.environ,
            "GIT_AUTHOR_NAME": "Challenger Author",
            "GIT_AUTHOR_EMAIL": "challenger@example.com",
            "GIT_COMMITTER_NAME": "Challenger Committer",
            "GIT_COMMITTER_EMAIL": "committer@example.com",
        },
    )
    return res.stdout.strip()


# ==============================================================================
# 1. ROOT COMMIT (Initial Commit with 0 Parents)
# ==============================================================================

class TestRootCommitExtraction:
    """Adversarially challenge root commit extraction (0 parents, initial commit)."""

    def test_root_commit_with_multiple_files_and_dirs(self, git_repo: Path):
        """Verify root commit with nested directory structure, multiple files, and full diff."""
        (git_repo / "src").mkdir()
        (git_repo / "src" / "index.js").write_text("console.log('hello');\nconst x = 1;\n", encoding="utf-8")
        (git_repo / "README.md").write_text("# Project Root\nEmpirical verification.\n", encoding="utf-8")

        git(git_repo, "add", ".")
        git(git_repo, "commit", "-m", "chore: initial repository creation\n\nSetup initial project files.")

        root_sha = git(git_repo, "rev-parse", "HEAD")
        ctx = collect_git_context(root_sha, repo_root=git_repo)

        # 0 parents verification
        assert ctx.parent_shas == [], "Root commit must have empty parent_shas list"
        assert ctx.is_root_commit is True, "is_root_commit property must be True"
        assert ctx.is_merge is False, "is_merge property must be False"
        assert ctx.sha == root_sha
        assert ctx.message_subject == "chore: initial repository creation"
        assert "Setup initial project files." in ctx.message_body

        # Changed files verification
        assert len(ctx.changed_files) == 2
        file_map = {f.filename: f for f in ctx.changed_files}
        assert "src/index.js" in file_map or "src/index.js".replace("/", os.sep) in file_map
        assert "README.md" in file_map

        for f in ctx.changed_files:
            assert f.status_code == "A"
            assert f.deletions == 0
            assert f.additions > 0
            assert f.is_binary is False

        # Unified diff verification against empty tree
        assert "diff --git" in ctx.diff
        assert "+console.log('hello');" in ctx.diff
        assert "+# Project Root" in ctx.diff

    def test_root_commit_empty_initial(self, git_repo: Path):
        """Edge case: initial root commit created with --allow-empty (0 files, 0 parents)."""
        git(git_repo, "commit", "--allow-empty", "-m", "chore: initial empty root commit")

        root_sha = git(git_repo, "rev-parse", "HEAD")
        ctx = collect_git_context(root_sha, repo_root=git_repo)

        assert ctx.parent_shas == []
        assert ctx.is_root_commit is True
        assert ctx.is_empty_commit is True
        assert ctx.changed_files == []
        assert ctx.diff == ""
        assert ctx.total_additions == 0
        assert ctx.total_deletions == 0


# ==============================================================================
# 2. MERGE COMMIT (2 Parents)
# ==============================================================================

class TestMergeCommitExtraction:
    """Challenge merge commit extraction with 2 parents."""

    def test_two_parent_merge_commit_first_parent_diff(self, git_repo: Path):
        """Verify 2-parent merge commit captures first-parent cumulative diff and metadata."""
        # 1. Base commit
        (git_repo / "base.txt").write_text("line 1\nline 2\n", encoding="utf-8")
        git(git_repo, "add", "base.txt")
        git(git_repo, "commit", "-m", "feat: base commit")
        base_sha = git(git_repo, "rev-parse", "HEAD")

        # 2. Feature branch
        git(git_repo, "checkout", "-b", "feature-arb")
        (git_repo / "arbitrage.py").write_text("def calculate_sweet_spot():\n    return 42\n", encoding="utf-8")
        git(git_repo, "add", "arbitrage.py")
        git(git_repo, "commit", "-m", "feat(arb): add sweet spot pricing logic")
        feature_sha = git(git_repo, "rev-parse", "HEAD")

        # 3. Main branch concurrent commit
        git(git_repo, "checkout", "master")
        (git_repo / "main_update.txt").write_text("concurrent work on master\n", encoding="utf-8")
        git(git_repo, "add", "main_update.txt")
        git(git_repo, "commit", "-m", "chore: maintenance commit on master")
        master_head_sha = git(git_repo, "rev-parse", "HEAD")

        # 4. Merge feature into master
        git(git_repo, "merge", "--no-ff", "-m", "Merge branch 'feature-arb' into master", "feature-arb")
        merge_sha = git(git_repo, "rev-parse", "HEAD")

        ctx = collect_git_context(merge_sha, repo_root=git_repo)

        # Merge assertions
        assert ctx.is_merge is True
        assert ctx.is_root_commit is False
        assert len(ctx.parent_shas) == 2
        assert ctx.parent_shas[0] == master_head_sha, "First parent must be the target branch parent"
        assert ctx.parent_shas[1] == feature_sha, "Second parent must be the merged branch parent"

        # Merge diff banner assertions
        assert "--- [MERGE COMMIT CONTEXT] ---" in ctx.diff
        assert f"Target Branch Parent (Parent 1): {master_head_sha}" in ctx.diff
        assert f"Merged Branch Parents: {feature_sha}" in ctx.diff
        assert "Mode: First-Parent Cumulative Diff" in ctx.diff

        # Content introduced by merge
        assert "arbitrage.py" in [f.filename for f in ctx.changed_files]
        assert "+def calculate_sweet_spot():" in ctx.diff

    def test_merge_commit_prompt_context_formatting(self, git_repo: Path):
        """Verify to_prompt_context formats merge commit cleanly."""
        (git_repo / "f.txt").write_text("base\n", encoding="utf-8")
        git(git_repo, "add", "f.txt")
        git(git_repo, "commit", "-m", "base")

        git(git_repo, "checkout", "-b", "b1")
        (git_repo / "b1.txt").write_text("b1\n", encoding="utf-8")
        git(git_repo, "add", "b1.txt")
        git(git_repo, "commit", "-m", "b1")

        git(git_repo, "checkout", "master")
        (git_repo / "m.txt").write_text("m\n", encoding="utf-8")
        git(git_repo, "add", "m.txt")
        git(git_repo, "commit", "-m", "m")

        git(git_repo, "merge", "--no-ff", "-m", "Merge b1", "b1")
        merge_sha = git(git_repo, "rev-parse", "HEAD")

        ctx = collect_git_context(merge_sha, repo_root=git_repo)
        prompt_str = ctx.to_prompt_context()

        assert "| Status | File | Additions | Deletions |" in prompt_str
        assert "b1.txt" in prompt_str
        assert "[MERGE COMMIT CONTEXT]" in prompt_str


# ==============================================================================
# 3. EMPTY COMMIT (git commit --allow-empty)
# ==============================================================================

class TestEmptyCommitExtraction:
    """Challenge empty commit handling."""

    def test_empty_commit_after_regular_commits(self, git_repo: Path):
        """Verify empty commit has 1 parent, 0 changed files, empty diff, and is_empty_commit=True."""
        (git_repo / "file.txt").write_text("content\n", encoding="utf-8")
        git(git_repo, "add", "file.txt")
        git(git_repo, "commit", "-m", "feat: initial commit")
        first_sha = git(git_repo, "rev-parse", "HEAD")

        # Allow empty commit
        git(git_repo, "commit", "--allow-empty", "-m", "chore: trigger CI pipeline without changes\n\nNo file changes.")
        empty_sha = git(git_repo, "rev-parse", "HEAD")

        ctx = collect_git_context(empty_sha, repo_root=git_repo)

        assert ctx.sha == empty_sha
        assert len(ctx.parent_shas) == 1
        assert ctx.parent_shas[0] == first_sha
        assert ctx.is_empty_commit is True
        assert ctx.is_root_commit is False
        assert ctx.is_merge is False
        assert ctx.changed_files == []
        assert ctx.diff == ""
        assert ctx.total_additions == 0
        assert ctx.total_deletions == 0
        assert ctx.diff_summary() == "0 files changed, 0 insertions(+), 0 deletions(-)"

        # Check prompt representation
        prompt_repr = ctx.to_prompt_context()
        assert "_No file changes detected (empty commit)._" in prompt_repr


# ==============================================================================
# 4. DETACHED HEAD (git checkout --detach)
# ==============================================================================

class TestDetachedHeadExtraction:
    """Challenge detached HEAD extraction."""

    def test_detached_head_resolves_and_extracts_cleanly(self, git_repo: Path):
        """Verify collect_git_context('HEAD') resolves properly when repository is in detached HEAD state."""
        # Commit 1
        (git_repo / "version1.txt").write_text("v1\n", encoding="utf-8")
        git(git_repo, "add", "version1.txt")
        git(git_repo, "commit", "-m", "v1 commit")
        c1_sha = git(git_repo, "rev-parse", "HEAD")

        # Commit 2
        (git_repo / "version2.txt").write_text("v2\n", encoding="utf-8")
        git(git_repo, "add", "version2.txt")
        git(git_repo, "commit", "-m", "v2 commit")
        c2_sha = git(git_repo, "rev-parse", "HEAD")

        # Commit 3
        (git_repo / "version3.txt").write_text("v3\n", encoding="utf-8")
        git(git_repo, "add", "version3.txt")
        git(git_repo, "commit", "-m", "v3 commit")

        # Detach to Commit 1
        git(git_repo, "checkout", "--detach", c1_sha)

        # Context collection on 'HEAD'
        ctx1 = collect_git_context("HEAD", repo_root=git_repo)
        assert ctx1.sha == c1_sha
        assert ctx1.message_subject == "v1 commit"
        assert len(ctx1.changed_files) == 1
        assert ctx1.changed_files[0].filename == "version1.txt"

        # Detach to Commit 2
        git(git_repo, "checkout", "--detach", c2_sha)
        ctx2 = collect_git_context("HEAD", repo_root=git_repo)
        assert ctx2.sha == c2_sha
        assert ctx2.message_subject == "v2 commit"
        assert len(ctx2.changed_files) == 1
        assert ctx2.changed_files[0].filename == "version2.txt"


# ==============================================================================
# 5. HUGE DIFF (>5,000 lines or >30,000 chars)
# ==============================================================================

class TestHugeDiffTruncation:
    """Adversarially challenge large diff extraction (>5,000 lines / >30,000 chars)."""

    def test_diff_exceeding_5000_lines(self, git_repo: Path):
        """Create a commit with >5,000 added lines (>150,000 chars) and verify line truncation."""
        (git_repo / "base.txt").write_text("base\n", encoding="utf-8")
        git(git_repo, "add", "base.txt")
        git(git_repo, "commit", "-m", "base")

        # 5,500 lines generated
        lines = [f"// line {i}: export const DATA_KEY_{i:05d} = 'payload_value_{i:06d}';\n" for i in range(5500)]
        big_content = "".join(lines)
        assert len(lines) == 5500
        assert len(big_content) > 150000

        (git_repo / "big_dataset.ts").write_text(big_content, encoding="utf-8")
        git(git_repo, "add", "big_dataset.ts")
        git(git_repo, "commit", "-m", "perf: commit 5500 lines of data constants")
        huge_sha = git(git_repo, "rev-parse", "HEAD")

        # Collect with default limits (max 30,000 chars / max 500 lines)
        ctx = collect_git_context(huge_sha, repo_root=git_repo)

        # 1. Truncation banner must be present
        assert "[DIFF TRUNCATED: Exceeded LLM Context Threshold]" in ctx.diff
        assert "Thresholds: max 30,000 characters / max 500 lines" in ctx.diff
        assert "5,500 lines" in ctx.diff or "5500 lines" in ctx.diff or "lines across 1 file(s)" in ctx.diff

        # 2. Line boundary integrity check:
        # Every line before the truncation banner must be complete (not sliced mid-line).
        hunk_before_banner = ctx.diff.split("==============================================================================")[0]
        diff_lines = hunk_before_banner.strip().split("\n")
        assert len(diff_lines) <= 505

        # Check each line starts with valid diff prefixes (+, -, @, diff, index, etc.)
        valid_prefixes = ("+", "-", "@", "diff", "index", "---", "+++", " ", "new file mode", "deleted file mode", "similarity index", "rename ")
        for line in diff_lines:
            if line:
                assert line.startswith(valid_prefixes), f"Line has unexpected diff prefix: '{line}'"

        # The last line before the banner must be a complete line from lines[] or diff header
        last_diff_line = diff_lines[-1]
        assert last_diff_line.startswith("+// line ")
        assert last_diff_line.endswith("';")

    def test_diff_truncation_across_multiple_files_omitted_list(self, git_repo: Path):
        """Create multiple files exceeding 30,000 chars and verify omitted files are listed in banner."""
        (git_repo / "base.txt").write_text("base\n", encoding="utf-8")
        git(git_repo, "add", "base.txt")
        git(git_repo, "commit", "-m", "base")

        # Create 10 files each with 100 lines (~5,000 chars each = ~50,000 chars total)
        for f_idx in range(10):
            content = "".join([f"export const item_{f_idx}_{i} = 'some data {i}';\n" for i in range(100)])
            (git_repo / f"module_{f_idx}.ts").write_text(content, encoding="utf-8")

        git(git_repo, "add", ".")
        git(git_repo, "commit", "-m", "feat: add 10 separate data modules")
        multi_sha = git(git_repo, "rev-parse", "HEAD")

        ctx = collect_git_context(multi_sha, max_diff_chars=10000, max_diff_lines=200, repo_root=git_repo)

        assert "[DIFF TRUNCATED: Exceeded LLM Context Threshold]" in ctx.diff
        assert "Remaining changed file(s) omitted from diff:" in ctx.diff

        # Verify omitted files are cited in banner
        banner_part = ctx.diff.split("[DIFF TRUNCATED: Exceeded LLM Context Threshold]")[1]
        assert "module_" in banner_part

    def test_direct_truncate_diff_function(self):
        """Directly challenge truncate_diff unit boundary edge cases."""
        fake_files = [
            FileChangeDetail(filename="a.py", status="M", additions=50, deletions=10),
            FileChangeDetail(filename="b.py", status="A", additions=200, deletions=0),
            FileChangeDetail(filename="c.py", status="D", additions=0, deletions=100),
        ]

        # Case 1: diff below thresholds -> unchanged, is_truncated == False
        small_diff = "diff --git a/a.py b/a.py\n+hello\n"
        res, is_trunc = truncate_diff(small_diff, fake_files, max_chars=1000, max_lines=100)
        assert res == small_diff
        assert is_trunc is False

        # Case 2: diff exceeds line limit
        many_lines = "\n".join([f"+line {i}" for i in range(100)])
        res, is_trunc = truncate_diff(many_lines, fake_files, max_chars=100000, max_lines=10)
        assert is_trunc is True
        assert "[DIFF TRUNCATED: Exceeded LLM Context Threshold]" in res
        assert "10 lines" in res

        # Case 3: diff exceeds char limit
        long_line = "+" + "A" * 500 + "\n"
        three_long_lines = long_line * 3  # 1503 chars
        res, is_trunc = truncate_diff(three_long_lines, fake_files, max_chars=700, max_lines=100)
        assert is_trunc is True
        assert "[DIFF TRUNCATED: Exceeded LLM Context Threshold]" in res


# ==============================================================================
# 6. BINARY FILE ADD / MODIFY
# ==============================================================================

class TestBinaryFileOperations:
    """Challenge binary file addition and modification tracking."""

    def test_binary_file_add_and_subsequent_modify(self, git_repo: Path):
        """Verify binary file add recorded as is_binary=True, and modify also recorded as is_binary=True."""
        (git_repo / "readme.txt").write_text("initial repo\n", encoding="utf-8")
        git(git_repo, "add", "readme.txt")
        git(git_repo, "commit", "-m", "initial commit")

        # 1. ADD binary file
        # PNG header with null bytes and non-ASCII binary sequence
        binary_v1 = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x10\x00\x00\x00\x10\x08\x06\x00\x00\x00\x1f\xf3\xffa"
        (git_repo / "logo.png").write_bytes(binary_v1)
        git(git_repo, "add", "logo.png")
        git(git_repo, "commit", "-m", "feat: add binary logo asset")
        add_sha = git(git_repo, "rev-parse", "HEAD")

        ctx_add = collect_git_context(add_sha, repo_root=git_repo)
        assert len(ctx_add.changed_files) == 1
        f_add = ctx_add.changed_files[0]
        assert f_add.filename == "logo.png"
        assert f_add.status_code == "A"
        assert f_add.is_binary is True
        assert f_add.additions == 0
        assert f_add.deletions == 0
        assert "[A] logo.png (binary)" in f_add.format_line()

        # 2. MODIFY binary file
        binary_v2 = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x20\x00\x00\x00\x20\x08\x06\x00\x00\x00\x3b\x1a\xaa\xbb\xcc\xdd"
        (git_repo / "logo.png").write_bytes(binary_v2)
        git(git_repo, "add", "logo.png")
        git(git_repo, "commit", "-m", "fix: update binary logo resolution")
        mod_sha = git(git_repo, "rev-parse", "HEAD")

        ctx_mod = collect_git_context(mod_sha, repo_root=git_repo)
        assert len(ctx_mod.changed_files) == 1
        f_mod = ctx_mod.changed_files[0]
        assert f_mod.filename == "logo.png"
        assert f_mod.status_code == "M"
        assert f_mod.is_binary is True
        assert f_mod.additions == 0
        assert f_mod.deletions == 0
        assert "[M] logo.png (binary)" in f_mod.format_line()

    def test_mixed_binary_and_text_commit(self, git_repo: Path):
        """Verify commit containing BOTH binary and text files properly categorizes each."""
        (git_repo / "base.txt").write_text("base\n", encoding="utf-8")
        git(git_repo, "add", "base.txt")
        git(git_repo, "commit", "-m", "base")

        # Add binary + add text
        (git_repo / "favicon.ico").write_bytes(b"\x00\x00\x01\x00\x01\x00\x10\x10\x00\x00")
        (git_repo / "config.json").write_text('{\n  "version": "1.0.0"\n}\n', encoding="utf-8")
        git(git_repo, "add", "favicon.ico", "config.json")
        git(git_repo, "commit", "-m", "feat: add favicon and config")
        mixed_sha = git(git_repo, "rev-parse", "HEAD")

        ctx = collect_git_context(mixed_sha, repo_root=git_repo)
        assert len(ctx.changed_files) == 2
        file_map = {f.filename: f for f in ctx.changed_files}

        ico = file_map["favicon.ico"]
        assert ico.is_binary is True
        assert ico.additions == 0
        assert ico.deletions == 0

        cfg = file_map["config.json"]
        assert cfg.is_binary is False
        assert cfg.additions == 3
        assert cfg.deletions == 0


# ==============================================================================
# 7. RENAME FILE TRACKING (Status 'R' and old_filename)
# ==============================================================================

class TestRenameFileTracking:
    """Challenge rename file tracking in Git."""

    def test_file_rename_with_git_mv(self, git_repo: Path):
        """Verify renamed file is tracked with status 'R' and old_filename populated."""
        (git_repo / "original_module.py").write_text(
            "def foo():\n    return 'original'\n",
            encoding="utf-8",
        )
        git(git_repo, "add", "original_module.py")
        git(git_repo, "commit", "-m", "feat: create original module")

        # Rename with git mv
        git(git_repo, "mv", "original_module.py", "renamed_module.py")
        git(git_repo, "commit", "-m", "refactor: rename original_module to renamed_module")
        rename_sha = git(git_repo, "rev-parse", "HEAD")

        ctx = collect_git_context(rename_sha, repo_root=git_repo)
        assert len(ctx.changed_files) == 1
        rf = ctx.changed_files[0]
        assert rf.status_code == "R"
        assert rf.filename == "renamed_module.py"
        assert rf.old_filename == "original_module.py"
        assert "renamed from original_module.py" in rf.format_line()

    def test_directory_move_rename_braced_numstat(self, git_repo: Path):
        """Verify directory move resulting in braced numstat '{old => new}/file' is parsed correctly."""
        (git_repo / "old_dir").mkdir()
        (git_repo / "old_dir" / "service.py").write_text(
            "class Service:\n    def run(self):\n        pass\n",
            encoding="utf-8",
        )
        git(git_repo, "add", ".")
        git(git_repo, "commit", "-m", "feat: add service in old_dir")

        # Move to new_dir
        (git_repo / "new_dir").mkdir()
        git(git_repo, "mv", "old_dir/service.py", "new_dir/service.py")
        git(git_repo, "commit", "-m", "refactor: move service to new_dir")
        move_sha = git(git_repo, "rev-parse", "HEAD")

        ctx = collect_git_context(move_sha, repo_root=git_repo)
        assert len(ctx.changed_files) == 1
        rf = ctx.changed_files[0]
        assert rf.status_code == "R"
        assert "new_dir/service.py" in rf.filename or "new_dir/service.py".replace("/", os.sep) in rf.filename
        assert "old_dir/service.py" in rf.old_filename or "old_dir/service.py".replace("/", os.sep) in rf.old_filename

    def test_extract_new_path_from_numstat_helpers(self):
        """Unit test the numstat arrow syntax parsers directly."""
        assert extract_new_path_from_numstat("old.txt => new.txt") == "new.txt"
        assert extract_new_path_from_numstat("src/{old => new}/index.js") == "src/new/index.js"
        assert extract_new_path_from_numstat("{old_pkg => new_pkg}/main.py") == "new_pkg/main.py"
        assert extract_new_path_from_numstat("regular_path.ts") == "regular_path.ts"


# ==============================================================================
# 8. INVALID COMMIT SHA (ffffffffffffffffffffffffffffffffffffffff -> exit code 1)
# ==============================================================================

class TestInvalidCommitShaHandling:
    """Challenge invalid commit SHA handling in collector and CLI."""

    def test_collect_git_context_raises_for_invalid_40char_sha(self, git_repo: Path):
        """Verify collect_git_context raises GitCommitNotFoundError for 40 f's."""
        invalid_sha = "ffffffffffffffffffffffffffffffffffffffff"
        with pytest.raises(GitCommitNotFoundError) as exc_info:
            collect_git_context(invalid_sha, repo_root=git_repo)
        assert "ffffffffffffffffffffffffffffffffffffffff" in str(exc_info.value)

    def test_resolve_commit_sha_verify_exists_raises_for_40_fs(self, git_repo: Path):
        """Verify resolve_commit_sha with verify_exists=True raises GitCommitNotFoundError."""
        invalid_sha = "ffffffffffffffffffffffffffffffffffffffff"
        with pytest.raises(GitCommitNotFoundError):
            resolve_commit_sha(invalid_sha, repo_root=git_repo, verify_exists=True)

    def test_cli_generate_invalid_sha_exits_code_1(self):
        """Verify CLI 'generate ffffffffffffffffffffffffffffffffffffffff' terminates with exit code 1."""
        runner = CliRunner()
        invalid_sha = "ffffffffffffffffffffffffffffffffffffffff"

        result = runner.invoke(cli, ["generate", invalid_sha])

        assert result.exit_code == 1, f"Expected exit code 1, got {result.exit_code}. Output: {result.output}"
        assert f"Error: Commit '{invalid_sha}' not found in repository" in result.output or f"Error: Commit '{invalid_sha}' not found in repository" in (result.stderr or "")

    def test_cli_generate_invalid_nonexistent_branch_exits_code_1(self):
        """Verify CLI 'generate non_existent_branch' terminates with exit code 1."""
        runner = CliRunner()
        result = runner.invoke(cli, ["generate", "branch_does_not_exist_xyz"])
        assert result.exit_code == 1
        assert "not found in repository" in result.output or "Error:" in result.output

    def test_cli_generate_malformed_syntax_ref_exits_code_1(self):
        """Verify CLI with malformed reference syntax terminates with exit code 1."""
        runner = CliRunner()
        result = runner.invoke(cli, ["generate", "refs/heads/invalid..branch..name"])
        assert result.exit_code == 1
