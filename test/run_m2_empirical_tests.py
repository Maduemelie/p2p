"""Direct empirical test harness for Milestone 2 Git Context.

Executes all 8 empirical challenge scenarios against ai_content.git_context and ai_content.cli:
1. Root commit (initial commit with 0 parents).
2. Merge commit (2 parents).
3. Empty commit (git commit --allow-empty).
4. Detached HEAD (git checkout --detach).
5. Huge diff (>5,000 lines or >30,000 chars) -> line-boundary truncation and summary banner.
6. Binary file add/modify (both addition and modification).
7. Rename file tracking ('R' and old_filename).
8. Invalid commit SHA (ffffffffffffffffffffffffffffffffffffffff) -> exit code 1.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from click.testing import CliRunner

# Ensure repo root is on sys.path
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from ai_content.cli import cli
from ai_content.git_context import (
    GitCommitNotFoundError,
    GitError,
    collect_git_context,
    extract_diff,
    get_changed_files,
    get_commit_metadata,
    resolve_commit_sha,
    truncate_diff,
)
from ai_content.models import FileChangeDetail, GitCommitContext


def git_cmd(cwd: Path, *args: str) -> str:
    res = subprocess.run(
        ["git", *args],
        cwd=str(cwd),
        capture_output=True,
        text=True,
        check=True,
        env={
            **os.environ,
            "GIT_AUTHOR_NAME": "Test Author",
            "GIT_AUTHOR_EMAIL": "author@example.com",
            "GIT_COMMITTER_NAME": "Test Committer",
            "GIT_COMMITTER_EMAIL": "committer@example.com",
            "GIT_CONFIG_GLOBAL": os.devnull,
            "GIT_CONFIG_SYSTEM": os.devnull,
        },
    )
    return res.stdout.strip()


def create_temp_repo() -> Path:
    temp_dir = Path(tempfile.mkdtemp(prefix="git_m2_challenge_"))
    git_cmd(temp_dir, "init")
    git_cmd(temp_dir, "config", "user.name", "Test Author")
    git_cmd(temp_dir, "config", "user.email", "author@example.com")
    git_cmd(temp_dir, "config", "commit.gpgsign", "false")
    return temp_dir


def test_1_root_commit():
    print("[RUN] 1. Root commit (0 parents)...")
    repo = create_temp_repo()
    try:
        (repo / "initial.txt").write_text("line 1\nline 2\n", encoding="utf-8")
        git_cmd(repo, "add", "initial.txt")
        git_cmd(repo, "commit", "-m", "chore: initial root commit")

        root_sha = git_cmd(repo, "rev-parse", "HEAD")
        ctx = collect_git_context(root_sha, repo_root=repo)

        assert ctx.sha == root_sha, f"Expected {root_sha}, got {ctx.sha}"
        assert ctx.parent_shas == [], f"Expected 0 parents, got {ctx.parent_shas}"
        assert ctx.is_root_commit is True, "Expected is_root_commit to be True"
        assert ctx.is_merge is False, "Expected is_merge to be False"
        assert len(ctx.changed_files) == 1
        assert ctx.changed_files[0].filename == "initial.txt"
        assert ctx.changed_files[0].status == "A"
        assert ctx.changed_files[0].additions == 2
        assert ctx.changed_files[0].deletions == 0
        assert "+line 1" in ctx.diff
        print("  [OK] PASS: Root commit verified (0 parents, status 'A', full diff).")
    finally:
        shutil.rmtree(repo, ignore_errors=True)


def test_2_merge_commit():
    print("[RUN] 2. Merge commit (2 parents)...")
    repo = create_temp_repo()
    try:
        (repo / "base.txt").write_text("base\n", encoding="utf-8")
        git_cmd(repo, "add", "base.txt")
        git_cmd(repo, "commit", "-m", "base")
        base_sha = git_cmd(repo, "rev-parse", "HEAD")

        # Feature branch
        git_cmd(repo, "checkout", "-b", "feature")
        (repo / "feature.py").write_text("print('feature')\n", encoding="utf-8")
        git_cmd(repo, "add", "feature.py")
        git_cmd(repo, "commit", "-m", "add feature")
        feat_sha = git_cmd(repo, "rev-parse", "HEAD")

        # Main branch
        git_cmd(repo, "checkout", "master")
        (repo / "master.py").write_text("print('master')\n", encoding="utf-8")
        git_cmd(repo, "add", "master.py")
        git_cmd(repo, "commit", "-m", "update master")
        master_sha = git_cmd(repo, "rev-parse", "HEAD")

        # Merge
        git_cmd(repo, "merge", "--no-ff", "-m", "Merge feature into master", "feature")
        merge_sha = git_cmd(repo, "rev-parse", "HEAD")

        ctx = collect_git_context(merge_sha, repo_root=repo)

        assert ctx.is_merge is True, "Expected is_merge to be True"
        assert len(ctx.parent_shas) == 2, f"Expected 2 parents, got {len(ctx.parent_shas)}"
        assert ctx.parent_shas[0] == master_sha, f"Parent 1 mismatch: {ctx.parent_shas[0]}"
        assert ctx.parent_shas[1] == feat_sha, f"Parent 2 mismatch: {ctx.parent_shas[1]}"
        assert "[MERGE COMMIT CONTEXT]" in ctx.diff, "Diff must contain merge header"
        assert f"Target Branch Parent (Parent 1): {master_sha}" in ctx.diff
        assert "feature.py" in [f.filename for f in ctx.changed_files]
        print("  [OK] PASS: Merge commit verified (2 parents, merge header, first-parent diff).")
    finally:
        shutil.rmtree(repo, ignore_errors=True)


def test_3_empty_commit():
    print("[RUN] 3. Empty commit (git commit --allow-empty)...")
    repo = create_temp_repo()
    try:
        (repo / "f.txt").write_text("hello\n", encoding="utf-8")
        git_cmd(repo, "add", "f.txt")
        git_cmd(repo, "commit", "-m", "init")

        git_cmd(repo, "commit", "--allow-empty", "-m", "chore: empty commit trigger")
        empty_sha = git_cmd(repo, "rev-parse", "HEAD")

        ctx = collect_git_context(empty_sha, repo_root=repo)

        assert ctx.is_empty_commit is True, "Expected is_empty_commit to be True"
        assert ctx.changed_files == [], "Expected empty changed_files"
        assert ctx.diff == "", "Expected empty diff"
        assert ctx.total_additions == 0
        assert ctx.total_deletions == 0
        print("  [OK] PASS: Empty commit verified (0 changed files, empty diff string).")
    finally:
        shutil.rmtree(repo, ignore_errors=True)


def test_4_detached_head():
    print("[RUN] 4. Detached HEAD (git checkout --detach)...")
    repo = create_temp_repo()
    try:
        (repo / "c1.txt").write_text("1\n", encoding="utf-8")
        git_cmd(repo, "add", "c1.txt")
        git_cmd(repo, "commit", "-m", "commit 1")
        sha1 = git_cmd(repo, "rev-parse", "HEAD")

        (repo / "c2.txt").write_text("2\n", encoding="utf-8")
        git_cmd(repo, "add", "c2.txt")
        git_cmd(repo, "commit", "-m", "commit 2")

        # Detach
        git_cmd(repo, "checkout", "--detach", sha1)

        ctx = collect_git_context("HEAD", repo_root=repo)
        assert ctx.sha == sha1, f"Expected HEAD to resolve to {sha1}, got {ctx.sha}"
        assert ctx.message_subject == "commit 1"
        assert len(ctx.changed_files) == 1
        assert ctx.changed_files[0].filename == "c1.txt"
        print("  [OK] PASS: Detached HEAD verified (resolved to target detached SHA).")
    finally:
        shutil.rmtree(repo, ignore_errors=True)


def test_5_huge_diff_truncation():
    print("[RUN] 5. Huge diff (>5,000 lines / >30,000 chars)...")
    repo = create_temp_repo()
    try:
        (repo / "base.txt").write_text("base\n", encoding="utf-8")
        git_cmd(repo, "add", "base.txt")
        git_cmd(repo, "commit", "-m", "base")

        # 5,500 lines (>160,000 characters)
        lines = [f"// row_{i:05d}: const config_val_{i} = 'some_arbitrary_string_data_payload_{i}';\n" for i in range(5500)]
        (repo / "huge_data.js").write_text("".join(lines), encoding="utf-8")
        git_cmd(repo, "add", "huge_data.js")
        git_cmd(repo, "commit", "-m", "perf: add huge data file 5500 lines")
        huge_sha = git_cmd(repo, "rev-parse", "HEAD")

        ctx = collect_git_context(huge_sha, repo_root=repo)

        # Truncation banner
        assert "[DIFF TRUNCATED: Exceeded LLM Context Threshold]" in ctx.diff
        assert "Thresholds: max 30,000 characters / max 500 lines" in ctx.diff
        assert "lines across 1 file(s)" in ctx.diff or "5,505 lines" in ctx.diff

        # Line-boundary verification:
        hunk_before_banner = ctx.diff.split("==============================================================================")[0]
        diff_lines = hunk_before_banner.strip().split("\n")
        assert len(diff_lines) <= 505

        last_line = diff_lines[-1]
        assert last_line.startswith("+// row_")
        assert last_line.endswith("';"), f"Line was sliced mid-boundary: {last_line}"
        print("  [OK] PASS: Huge diff truncated at clean line boundary with complete summary banner.")
    finally:
        shutil.rmtree(repo, ignore_errors=True)


def test_6_binary_file_add_modify():
    print("[RUN] 6. Binary file add/modify...")
    repo = create_temp_repo()
    try:
        (repo / "init.txt").write_text("init\n", encoding="utf-8")
        git_cmd(repo, "add", "init.txt")
        git_cmd(repo, "commit", "-m", "init")

        # 1. ADD binary file
        bin_content_v1 = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00"
        (repo / "test_icon.png").write_bytes(bin_content_v1)
        git_cmd(repo, "add", "test_icon.png")
        git_cmd(repo, "commit", "-m", "add binary icon")
        add_sha = git_cmd(repo, "rev-parse", "HEAD")

        ctx_add = collect_git_context(add_sha, repo_root=repo)
        assert len(ctx_add.changed_files) == 1
        f_add = ctx_add.changed_files[0]
        assert f_add.filename == "test_icon.png"
        assert f_add.status_code == "A"
        assert f_add.is_binary is True
        assert f_add.additions == 0
        assert f_add.deletions == 0

        # 2. MODIFY binary file
        bin_content_v2 = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x02\x00\x00\x00\x02\x08\x06\x00\x00\x00\xff\xee\xdd"
        (repo / "test_icon.png").write_bytes(bin_content_v2)
        git_cmd(repo, "add", "test_icon.png")
        git_cmd(repo, "commit", "-m", "update binary icon")
        mod_sha = git_cmd(repo, "rev-parse", "HEAD")

        ctx_mod = collect_git_context(mod_sha, repo_root=repo)
        assert len(ctx_mod.changed_files) == 1
        f_mod = ctx_mod.changed_files[0]
        assert f_mod.filename == "test_icon.png"
        assert f_mod.status_code == "M"
        assert f_mod.is_binary is True
        assert f_mod.additions == 0
        assert f_mod.deletions == 0
        print("  [OK] PASS: Binary file add and modify both tracked with is_binary=True and 0 lines changed.")
    finally:
        shutil.rmtree(repo, ignore_errors=True)


def test_7_rename_file_tracking():
    print("[RUN] 7. Rename file tracking ('R')...")
    repo = create_temp_repo()
    try:
        (repo / "original.txt").write_text("content to be preserved across rename\n", encoding="utf-8")
        git_cmd(repo, "add", "original.txt")
        git_cmd(repo, "commit", "-m", "add original")

        git_cmd(repo, "mv", "original.txt", "renamed.txt")
        git_cmd(repo, "commit", "-m", "rename original to renamed")
        rename_sha = git_cmd(repo, "rev-parse", "HEAD")

        ctx = collect_git_context(rename_sha, repo_root=repo)
        assert len(ctx.changed_files) == 1
        rf = ctx.changed_files[0]
        assert rf.status_code == "R", f"Expected status 'R', got {rf.status_code}"
        assert rf.filename == "renamed.txt"
        assert rf.old_filename == "original.txt"
        assert "renamed from original.txt" in rf.format_line()
        print("  [OK] PASS: Rename tracked with status 'R' and old_filename='original.txt'.")
    finally:
        shutil.rmtree(repo, ignore_errors=True)


def test_8_invalid_commit_sha():
    print("[RUN] 8. Invalid commit SHA (ffffffffffffffffffffffffffffffffffffffff) -> exit code 1...")
    repo = create_temp_repo()
    try:
        (repo / "base.txt").write_text("base\n", encoding="utf-8")
        git_cmd(repo, "add", "base.txt")
        git_cmd(repo, "commit", "-m", "base")

        invalid_sha = "ffffffffffffffffffffffffffffffffffffffff"

        # Direct function check raises GitCommitNotFoundError
        try:
            collect_git_context(invalid_sha, repo_root=repo)
            assert False, "Expected GitCommitNotFoundError"
        except GitCommitNotFoundError:
            pass

        # CLI invocation check exits with code 1
        runner = CliRunner()
        result = runner.invoke(cli, ["generate", invalid_sha])
        assert result.exit_code == 1, f"Expected CLI exit code 1, got {result.exit_code}. Output: {result.output}"
        assert "not found in repository" in result.output or "Error:" in result.output
        print("  [OK] PASS: Invalid SHA raises GitCommitNotFoundError and CLI exits with code 1.")
    finally:
        shutil.rmtree(repo, ignore_errors=True)



def main():
    print("=" * 70)
    print("Milestone 2 Empirical Challenge Test Suite (Direct Execution)")
    print("=" * 70)
    test_1_root_commit()
    test_2_merge_commit()
    test_3_empty_commit()
    test_4_detached_head()
    test_5_huge_diff_truncation()
    test_6_binary_file_add_modify()
    test_7_rename_file_tracking()
    test_8_invalid_commit_sha()
    print("=" * 70)
    print("All 8 Milestone 2 empirical challenge scenarios PASSED with 100% success!")
    print("=" * 70)


if __name__ == "__main__":
    main()
