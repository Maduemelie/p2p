"""
AI Development Content Generator — Pytest E2E Suite
Compatible with `uv run pytest test/ai-content/` and `pytest test/ai-content/`
"""

import json
import os
import re
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
import pytest

ISO_8601_REGEX = r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$"
SHA_40_REGEX = r"^[0-9a-f]{40}$"
SLUG_REGEX = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent.parent


@pytest.fixture
def test_git_repo(tmp_path):
    """Initializes an isolated Git repository in a temporary path."""
    repo_dir = tmp_path / "repo"
    repo_dir.mkdir(parents=True, exist_ok=True)

    def run_git(*args):
        return subprocess.run(
            ["git", *args],
            cwd=repo_dir,
            capture_output=True,
            text=True,
            check=True,
            env={
                **os.environ,
                "GIT_AUTHOR_NAME": "Pytest User",
                "GIT_AUTHOR_EMAIL": "pytest@example.com",
                "GIT_COMMITTER_NAME": "Pytest Committer",
                "GIT_COMMITTER_EMAIL": "committer@example.com",
            },
        )

    run_git("init", "-b", "master")
    run_git("config", "user.name", "Pytest User")
    run_git("config", "user.email", "pytest@example.com")

    # Initial commit
    readme = repo_dir / "README.md"
    readme.write_text("# Test Repo\n", encoding="utf-8")
    run_git("add", "README.md")
    run_git("commit", "-m", "Initial commit")

    repo_dir.run_git = run_git
    return repo_dir


def invoke_cli(repo_dir, args, mock=True):
    """Invokes the AI Content Generator CLI in the test repo."""
    env = {
        **os.environ,
        "AI_CONTENT_MOCK": "1" if mock else "0",
    }
    # Check if python module is available, otherwise invoke node mock-cli-shim
    py_cli = WORKSPACE_ROOT / "ai_content" / "cli.py"
    shim_js = WORKSPACE_ROOT / "test" / "ai-content" / "harness" / "mock-cli-shim.js"

    if py_cli.exists() and os.getenv("AI_CONTENT_FORCE_MOCK") != "1":
        cmd = ["python", "-m", "ai_content.cli", *args]
    else:
        cmd = ["node", str(shim_js), *args]

    start_time = time.perf_counter()
    res = subprocess.run(
        cmd,
        cwd=repo_dir,
        capture_output=True,
        text=True,
        env=env,
    )
    duration_ms = (time.perf_counter() - start_time) * 1000
    return res.returncode, res.stdout, res.stderr, duration_ms


class TestTier1FeatureCoverage:
    """Tier 1: Feature Coverage (CLI, JSON schema, Markdown deliverables)."""

    def test_cli_generate_head(self, test_git_repo):
        # Create commit
        src_file = test_git_repo / "main.py"
        src_file.write_text("print('hello')", encoding="utf-8")
        test_git_repo.run_git("add", "main.py")
        test_git_repo.run_git("commit", "-m", "feat: add main script")

        head_sha = test_git_repo.run_git("rev-parse", "HEAD").stdout.strip()

        ret, stdout, stderr, _ = invoke_cli(test_git_repo, ["generate", "HEAD"])
        assert ret == 0, f"CLI failed: {stderr}"

        # Check analysis json file
        analysis_json = test_git_repo / "content" / "analysis" / f"{head_sha}.json"
        assert analysis_json.exists(), f"Analysis JSON missing: {analysis_json}"

    def test_analysis_json_schema(self, test_git_repo):
        src_file = test_git_repo / "calc.py"
        src_file.write_text("def add(a, b): return a + b", encoding="utf-8")
        test_git_repo.run_git("add", "calc.py")
        test_git_repo.run_git("commit", "-m", "feat: add math calculator")

        head_sha = test_git_repo.run_git("rev-parse", "HEAD").stdout.strip()
        ret, stdout, stderr, _ = invoke_cli(test_git_repo, ["generate", head_sha])
        assert ret == 0

        analysis_json = test_git_repo / "content" / "analysis" / f"{head_sha}.json"
        data = json.loads(analysis_json.read_text(encoding="utf-8"))

        assert re.match(SHA_40_REGEX, data["commit_sha"], re.IGNORECASE)
        assert data["commit_sha"].lower() == head_sha.lower()
        assert re.match(ISO_8601_REGEX, data["timestamp"])
        assert len(data["summary"].strip()) > 0
        assert len(data["architecture_impact"].strip()) > 0
        assert isinstance(data["key_takeaways"], list) and len(data["key_takeaways"]) > 0
        assert isinstance(data["changed_components"], list)
        assert len(data["suggested_article_title"].strip()) > 0
        assert re.match(SLUG_REGEX, data["suggested_article_slug"])

    def test_markdown_outputs_exist(self, test_git_repo):
        f = test_git_repo / "app.py"
        f.write_text("app = None", encoding="utf-8")
        test_git_repo.run_git("add", "app.py")
        test_git_repo.run_git("commit", "-m", "feat: init app container")

        head_sha = test_git_repo.run_git("rev-parse", "HEAD").stdout.strip()
        invoke_cli(test_git_repo, ["generate", head_sha])

        articles_dir = test_git_repo / "content" / "articles"
        journal_dir = test_git_repo / "content" / "journal"
        social_dir = test_git_repo / "content" / "social"

        assert any(f.name.startswith(head_sha) for f in articles_dir.glob("*.md"))
        assert any(f.name.startswith(head_sha) for f in journal_dir.glob("*.md"))
        assert any(f.name.startswith(head_sha) for f in social_dir.glob("*.md"))


class TestTier2BoundaryCornerCases:
    """Tier 2: Boundary & Corner Cases (Duplicate skipping, force override, errors)."""

    def test_duplicate_skipping(self, test_git_repo):
        f = test_git_repo / "dup.txt"
        f.write_text("test dup", encoding="utf-8")
        test_git_repo.run_git("add", "dup.txt")
        test_git_repo.run_git("commit", "-m", "feat: test duplicate detection")

        head_sha = test_git_repo.run_git("rev-parse", "HEAD").stdout.strip()

        # Run 1
        ret1, _, _, _ = invoke_cli(test_git_repo, ["generate", head_sha])
        assert ret1 == 0

        # Run 2
        ret2, out2, _, duration = invoke_cli(test_git_repo, ["generate", head_sha])
        assert ret2 == 0
        assert "skip" in out2.lower()
        assert duration < 1000

    def test_force_regeneration(self, test_git_repo):
        f = test_git_repo / "force.txt"
        f.write_text("test force", encoding="utf-8")
        test_git_repo.run_git("add", "force.txt")
        test_git_repo.run_git("commit", "-m", "feat: test force override")

        head_sha = test_git_repo.run_git("rev-parse", "HEAD").stdout.strip()
        invoke_cli(test_git_repo, ["generate", head_sha])

        ret_force, out_force, _, _ = invoke_cli(test_git_repo, ["generate", head_sha, "--force"])
        assert ret_force == 0
        assert "skipping generation" not in out_force.lower()

    def test_invalid_commit_sha(self, test_git_repo):
        fake_sha = "ffffffffffffffffffffffffffffffffffffffff"
        ret, _, _, _ = invoke_cli(test_git_repo, ["generate", fake_sha])
        assert ret != 0

    def test_empty_commit(self, test_git_repo):
        test_git_repo.run_git("commit", "--allow-empty", "-m", "chore: allow empty commit")
        head_sha = test_git_repo.run_git("rev-parse", "HEAD").stdout.strip()

        ret, _, _, _ = invoke_cli(test_git_repo, ["generate", head_sha])
        assert ret == 0

        analysis_json = test_git_repo / "content" / "analysis" / f"{head_sha}.json"
        assert analysis_json.exists()


class TestTier3CrossFeatureCombinations:
    """Tier 3: Cross-Feature Combinations (Install-hook, status, flag combinations)."""

    def test_install_hook_and_status(self, test_git_repo):
        ret_hook, _, _, _ = invoke_cli(test_git_repo, ["install-hook"])
        assert ret_hook == 0

        hook_file = test_git_repo / ".git" / "hooks" / "post-commit"
        assert hook_file.exists()

        ret_stat, out_stat, _, _ = invoke_cli(test_git_repo, ["status"])
        assert ret_stat == 0
        assert "Hook Installed:  Yes" in out_stat

    def test_cli_flags_combination(self, test_git_repo):
        f = test_git_repo / "f.txt"
        f.write_text("data", encoding="utf-8")
        test_git_repo.run_git("add", "f.txt")
        test_git_repo.run_git("commit", "-m", "feat: flag combination test")

        head_sha = test_git_repo.run_git("rev-parse", "HEAD").stdout.strip()
        short_sha = head_sha[:7]

        invoke_cli(test_git_repo, ["generate", short_sha])
        ret, out, _, _ = invoke_cli(test_git_repo, ["generate", short_sha, "-f"])
        assert ret == 0
        assert "skipping generation" not in out.lower()


class TestTier4RealWorldScenarios:
    """Tier 4: Real-World Scenarios (Full commit lifecycle, hook latency)."""

    def test_end_to_end_commit_workflow(self, test_git_repo):
        feature_file = test_git_repo / "feature.py"
        feature_file.write_text("def execute(): return True", encoding="utf-8")
        test_git_repo.run_git("add", "feature.py")
        test_git_repo.run_git("commit", "-m", "feat(e2e): full workflow validation")

        head_sha = test_git_repo.run_git("rev-parse", "HEAD").stdout.strip()
        ret, _, _, _ = invoke_cli(test_git_repo, ["generate", "HEAD"])
        assert ret == 0

        # Assert all 4 output files exist
        assert (test_git_repo / "content" / "analysis" / f"{head_sha}.json").exists()
        assert len(list((test_git_repo / "content" / "articles").glob(f"{head_sha}*.md"))) == 1
        assert len(list((test_git_repo / "content" / "journal").glob(f"{head_sha}*.md"))) == 1
        assert len(list((test_git_repo / "content" / "social").glob(f"{head_sha}*.md"))) == 1

    def test_hook_latency_sub_second(self, test_git_repo):
        invoke_cli(test_git_repo, ["install-hook"])

        bench_file = test_git_repo / "bench.txt"
        bench_file.write_text("latency test", encoding="utf-8")
        test_git_repo.run_git("add", "bench.txt")

        start = time.perf_counter()
        test_git_repo.run_git("commit", "-m", "test(perf): latency benchmark")
        elapsed_ms = (time.perf_counter() - start) * 1000

        # Must return in under 1,000 ms
        assert elapsed_ms < 1000, f"Git commit took {elapsed_ms}ms (>= 1,000ms)"


class TestTier5AdversarialHardening:
    """Tier 5: Adversarial Hardening (Corrupted JSON, special chars)."""

    def test_corrupted_json_recovery(self, test_git_repo):
        f = test_git_repo / "rec.txt"
        f.write_text("data", encoding="utf-8")
        test_git_repo.run_git("add", "rec.txt")
        test_git_repo.run_git("commit", "-m", "feat: test recovery")

        head_sha = test_git_repo.run_git("rev-parse", "HEAD").stdout.strip()
        analysis_path = test_git_repo / "content" / "analysis" / f"{head_sha}.json"
        analysis_path.parent.mkdir(parents=True, exist_ok=True)
        analysis_path.write_text("{ CORRUPTED_JSON_DATA", encoding="utf-8")

        ret, _, _, _ = invoke_cli(test_git_repo, ["generate", head_sha, "--force"])
        assert ret == 0
        data = json.loads(analysis_path.read_text(encoding="utf-8"))
        assert data["commit_sha"].lower() == head_sha.lower()

    def test_special_character_commit_message(self, test_git_repo):
        f = test_git_repo / "special.txt"
        f.write_text("special", encoding="utf-8")
        test_git_repo.run_git("add", "special.txt")
        test_git_repo.run_git("commit", "-m", "feat: 'quotes' and \"double\" & `backticks`")

        head_sha = test_git_repo.run_git("rev-parse", "HEAD").stdout.strip()
        ret, _, _, _ = invoke_cli(test_git_repo, ["generate", head_sha])
        assert ret == 0
        analysis_path = test_git_repo / "content" / "analysis" / f"{head_sha}.json"
        assert analysis_path.exists()
