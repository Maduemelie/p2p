"""Unit and Integration Tests for Milestone 3 (CrewAI Pipeline & Content Generation).

Covers:
  - Agent factories and LLM configuration (get_llm, 5 agents)
  - Task factories and schema bindings (create_*_task, output_pydantic)
  - Mock content generation and strict schema compliance
  - Atomic text writing and temporary file cleanup on errors
  - run_pipeline end-to-end execution (analysis JSON, article, journal, social)
  - Duplicate skipping behavior without altering timestamps
  - Force regeneration via --force flag
  - CLI generate command execution, duplicate skip exit code 0, error exit code 1
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import time
from pathlib import Path
from unittest.mock import patch

import pytest
from click.testing import CliRunner

from ai_content.agents import (
    create_context_analyst_agent,
    create_journal_writer_agent,
    create_quality_reviewer_agent,
    create_social_writer_agent,
    create_technical_writer_agent,
    get_llm,
)
from ai_content.cli import cli
from ai_content.git_context import GitCommitContext, FileChangeDetail, collect_git_context
from ai_content.models import (
    DevelopmentSessionReport,
    ISO_8601_REGEX,
    SHA_40_REGEX,
    SLUG_REGEX,
    slugify,
)
from ai_content.pipeline import (
    atomic_write_text,
    generate_mock_content,
    get_effective_repo_root,
    is_mock_mode,
    run_pipeline,
)
from ai_content.tasks import (
    create_context_analyst_task,
    create_journal_writer_task,
    create_quality_reviewer_task,
    create_social_writer_task,
    create_technical_writer_task,
)


@pytest.fixture
def mock_git_context() -> GitCommitContext:
    """Provides a synthetic GitCommitContext for deterministic unit testing."""
    sha = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"
    return GitCommitContext(
        sha=sha,
        short_sha="a1b2c3d",
        author_name="Test Developer",
        author_email="dev@example.com",
        date="2026-09-22T14:30:00Z",
        message_subject="feat(pricing): add sweet spot calculation engine",
        message_body="Implemented volume-weighted sweet spot pricing calculation.",
        changed_files=[
            FileChangeDetail(
                filename="js/pricingEngine.js",
                status="M",
                additions=45,
                deletions=10,
            ),
            FileChangeDetail(
                filename="test/pricing-engine.test.js",
                status="A",
                additions=120,
                deletions=0,
            ),
        ],
        diff="""diff --git a/js/pricingEngine.js b/js/pricingEngine.js
--- a/js/pricingEngine.js
+++ b/js/pricingEngine.js
@@ -10,3 +10,12 @@
+function calculateSweetSpot() { return 1500.0; }
""",
        is_merge=False,
        parent_shas=["0000000000000000000000000000000000000000"],
    )


@pytest.fixture
def test_git_repo(tmp_path: Path) -> Path:
    """Creates a real initialized Git repository with sample commits for testing."""
    repo_dir = tmp_path / "test_repo"
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
                "GIT_AUTHOR_NAME": "Pytest Developer",
                "GIT_AUTHOR_EMAIL": "developer@example.com",
                "GIT_COMMITTER_NAME": "Pytest Committer",
                "GIT_COMMITTER_EMAIL": "committer@example.com",
            },
        )

    run_git("init", "-b", "main")
    run_git("config", "user.name", "Pytest Developer")
    run_git("config", "user.email", "developer@example.com")

    # Initial commit
    readme = repo_dir / "README.md"
    readme.write_text("# Test Repository\n", encoding="utf-8")
    run_git("add", "README.md")
    run_git("commit", "-m", "Initial commit")

    repo_dir.run_git = run_git  # type: ignore[attr-defined]
    return repo_dir


class TestAgentFactories:
    """Tests for agent factories and LLM initialization in ai_content/agents.py."""

    def test_get_llm_returns_none_in_mock_mode(self, monkeypatch):
        monkeypatch.setenv("AI_CONTENT_MOCK", "1")
        monkeypatch.setenv("GEMINI_API_KEY", "dummy_test_key_12345")
        llm = get_llm()
        assert llm is None

    def test_get_llm_returns_none_when_api_key_empty(self, monkeypatch):
        monkeypatch.delenv("AI_CONTENT_MOCK", raising=False)
        monkeypatch.setenv("GEMINI_API_KEY", "")
        llm = get_llm()
        assert llm is None

    def test_get_llm_instantiates_with_gemini_prefix(self, monkeypatch):
        monkeypatch.delenv("AI_CONTENT_MOCK", raising=False)
        llm = get_llm(model="gemini-2.0-flash", api_key="dummy_key_secret")
        assert llm is not None
        assert llm.model == "gemini/gemini-2.0-flash"
        assert llm.api_key == "dummy_key_secret"

    def test_create_context_analyst_agent(self):
        agent = create_context_analyst_agent(verbose=False)
        assert agent is not None
        assert "Context Analyst" in agent.role
        assert agent.allow_delegation is False

    def test_create_technical_writer_agent(self):
        agent = create_technical_writer_agent(verbose=False)
        assert agent is not None
        assert "Technical Author" in agent.role or "Technical Writer" in agent.role
        assert agent.allow_delegation is False

    def test_create_journal_writer_agent(self):
        agent = create_journal_writer_agent(verbose=False)
        assert agent is not None
        assert "Diarist" in agent.role or "Developer" in agent.role
        assert agent.allow_delegation is False

    def test_create_social_writer_agent(self):
        agent = create_social_writer_agent(verbose=False)
        assert agent is not None
        assert "Advocate" in agent.role or "Evangelist" in agent.role
        assert agent.allow_delegation is False

    def test_create_quality_reviewer_agent(self):
        agent = create_quality_reviewer_agent(verbose=False)
        assert agent is not None
        assert "Quality" in agent.role or "Editor" in agent.role
        assert agent.allow_delegation is False


class TestTaskFactories:
    """Tests for task factories and bindings in ai_content/tasks.py."""

    def test_create_context_analyst_task(self, mock_git_context):
        agent = create_context_analyst_agent()
        task = create_context_analyst_task(agent, mock_git_context)
        assert task.agent == agent
        assert task.output_pydantic == DevelopmentSessionReport
        assert mock_git_context.sha in task.description

    def test_create_technical_writer_task(self, mock_git_context):
        agent = create_technical_writer_agent()
        task = create_technical_writer_task(agent, mock_git_context)
        assert task.agent == agent
        assert "Executive Summary" in task.description
        assert "Key Technical Takeaways" in task.description

    def test_create_journal_writer_task(self, mock_git_context):
        agent = create_journal_writer_agent()
        task = create_journal_writer_task(agent, mock_git_context)
        assert task.agent == agent
        assert mock_git_context.short_sha in task.description
        assert "Session Overview" in task.description

    def test_create_social_writer_task(self, mock_git_context):
        agent = create_social_writer_agent()
        task = create_social_writer_task(agent, mock_git_context)
        assert task.agent == agent
        assert "280" in task.description
        assert "1/5" in task.description

    def test_create_quality_reviewer_task(self, mock_git_context):
        agent = create_quality_reviewer_agent()
        task = create_quality_reviewer_task(agent, mock_git_context)
        assert task.agent == agent
        assert "===ARTICLE===" in task.description
        assert "===JOURNAL===" in task.description
        assert "===SOCIAL===" in task.description


class TestMockContentGeneration:
    """Tests for schema compliance of generate_mock_content in ai_content/pipeline.py."""

    def test_generate_mock_content_schema_compliance(self, mock_git_context):
        report, article_md, journal_md, social_md = generate_mock_content(mock_git_context)

        # 1. Report Pydantic validation
        assert isinstance(report, DevelopmentSessionReport)
        assert SHA_40_REGEX.match(report.commit_sha)
        assert report.commit_sha == mock_git_context.sha
        assert ISO_8601_REGEX.match(report.timestamp)
        assert len(report.summary) > 10
        assert len(report.architecture_impact) > 10
        assert len(report.key_takeaways) >= 1
        assert isinstance(report.changed_components, list)
        assert len(report.suggested_article_title) > 0
        assert SLUG_REGEX.match(report.suggested_article_slug)

        # 2. Technical Article assertions
        assert len(article_md.strip()) >= 50
        assert article_md.startswith("---")  # YAML frontmatter
        assert f"commit: \"{mock_git_context.sha}\"" in article_md
        assert f"# {report.suggested_article_title}" in article_md
        assert "## Executive Summary" in article_md
        assert "## Architectural Breakdown" in article_md
        assert "## Changes Overview" in article_md
        assert "## Key Technical Takeaways" in article_md
        assert mock_git_context.author_name in article_md

        # 3. Developer Journal assertions
        assert len(journal_md.strip()) >= 30
        assert journal_md.startswith(f"# Development Journal — {mock_git_context.short_sha}")
        assert mock_git_context.sha in journal_md
        assert mock_git_context.short_sha in journal_md
        assert "## Session Overview" in journal_md
        assert "## Engineering Challenges & Decisions" in journal_md
        assert "## Next Steps" in journal_md

        # 4. Social Thread assertions
        assert len(social_md.strip()) >= 20
        assert "1/5" in social_md
        assert "2/5" in social_md
        assert "3/5" in social_md
        assert "4/5" in social_md
        assert "5/5" in social_md
        # Every tweet must be <= 280 characters
        tweets = [t.strip() for t in social_md.split("\n\n") if t.strip()]
        assert len(tweets) == 5
        for i, tweet in enumerate(tweets, 1):
            assert len(tweet) <= 280, f"Tweet {i} exceeded 280 characters ({len(tweet)} chars): {tweet}"


class TestAtomicWriting:
    """Tests for atomic file writing and temporary file handling."""

    def test_atomic_write_text_success(self, tmp_path: Path):
        dest = tmp_path / "test_output.txt"
        atomic_write_text(dest, "Sample atomic payload")

        assert dest.is_file()
        assert dest.read_text(encoding="utf-8") == "Sample atomic payload"

        # Check no temporary files remained
        tmp_files = list(tmp_path.glob("*.tmp*"))
        assert len(tmp_files) == 0

    def test_atomic_write_text_cleans_up_on_error(self, tmp_path: Path):
        dest = tmp_path / "corrupted_target.txt"

        # Simulate exception during atomic replace
        with patch.object(Path, "replace", side_effect=OSError("Disk full simulation")):
            with pytest.raises(OSError, match="Disk full simulation"):
                atomic_write_text(dest, "Failing payload")

        # Destination must not exist and temp file must be unlinked
        assert not dest.exists()
        tmp_files = list(tmp_path.glob("*.tmp*"))
        assert len(tmp_files) == 0


class TestPipelineExecution:
    """Tests for run_pipeline execution, duplicate skip, and force regeneration."""

    def test_run_pipeline_end_to_end(self, test_git_repo: Path):
        # Create a new commit in the test repo
        app_file = test_git_repo / "server.py"
        app_file.write_text("print('server running')", encoding="utf-8")
        test_git_repo.run_git("add", "server.py")  # type: ignore[attr-defined]
        test_git_repo.run_git("commit", "-m", "feat: initialize server container")  # type: ignore[attr-defined]

        head_sha = test_git_repo.run_git("rev-parse", "HEAD").stdout.strip()  # type: ignore[attr-defined]

        # Run pipeline in mock mode
        result = run_pipeline(commit_ref="HEAD", force=False, mock=True, repo_root=test_git_repo)

        assert "analysis" in result
        assert "article" in result
        assert "journal" in result
        assert "social" in result

        # Verify all 4 files exist
        assert result["analysis"].is_file()
        assert result["article"].is_file()
        assert result["journal"].is_file()
        assert result["social"].is_file()

        # Check JSON schema
        report_data = json.loads(result["analysis"].read_text(encoding="utf-8"))
        assert report_data["commit_sha"] == head_sha

        # Check filenames
        assert result["analysis"].name == f"{head_sha}.json"
        assert result["article"].name.startswith(head_sha)
        assert result["journal"].name.startswith(head_sha)
        assert result["social"].name.startswith(head_sha)

    def test_run_pipeline_duplicate_skip(self, test_git_repo: Path):
        # Commit file
        f = test_git_repo / "feature.py"
        f.write_text("FEATURE = True", encoding="utf-8")
        test_git_repo.run_git("add", "feature.py")  # type: ignore[attr-defined]
        test_git_repo.run_git("commit", "-m", "feat: duplicate skip test")  # type: ignore[attr-defined]

        # 1st run
        first_result = run_pipeline(commit_ref="HEAD", force=False, mock=True, repo_root=test_git_repo)
        analysis_file = first_result["analysis"]
        orig_mtime = analysis_file.stat().st_mtime_ns

        # Small delay to ensure timestamp differences would register
        time.sleep(0.01)

        # 2nd run without force
        second_result = run_pipeline(commit_ref="HEAD", force=False, mock=True, repo_root=test_git_repo)

        assert second_result["analysis"] == first_result["analysis"]
        assert analysis_file.stat().st_mtime_ns == orig_mtime

    def test_run_pipeline_force_regeneration(self, test_git_repo: Path):
        f = test_git_repo / "force_test.py"
        f.write_text("FORCE = True", encoding="utf-8")
        test_git_repo.run_git("add", "force_test.py")  # type: ignore[attr-defined]
        test_git_repo.run_git("commit", "-m", "feat: test force regeneration")  # type: ignore[attr-defined]

        # 1st run
        first_result = run_pipeline(commit_ref="HEAD", force=False, mock=True, repo_root=test_git_repo)
        analysis_file = first_result["analysis"]
        orig_mtime = analysis_file.stat().st_mtime_ns

        time.sleep(0.02)

        # 2nd run with force=True
        second_result = run_pipeline(commit_ref="HEAD", force=True, mock=True, repo_root=test_git_repo)

        assert second_result["analysis"] == first_result["analysis"]
        # Timestamp must be updated on force regeneration
        assert analysis_file.stat().st_mtime_ns > orig_mtime


class TestCliIntegration:
    """Tests for Click CLI commands with exit codes and output formatting."""

    def test_cli_generate_success(self, test_git_repo: Path, monkeypatch):
        monkeypatch.setenv("AI_CONTENT_MOCK", "1")
        monkeypatch.chdir(test_git_repo)

        f = test_git_repo / "test_cli.py"
        f.write_text("x = 42", encoding="utf-8")
        test_git_repo.run_git("add", "test_cli.py")  # type: ignore[attr-defined]
        test_git_repo.run_git("commit", "-m", "feat: test cli invocation")  # type: ignore[attr-defined]
        head_sha = test_git_repo.run_git("rev-parse", "HEAD").stdout.strip()  # type: ignore[attr-defined]

        runner = CliRunner()
        result = runner.invoke(cli, ["generate", "HEAD"])

        assert result.exit_code == 0
        assert "Pipeline completed successfully" in result.output
        assert (test_git_repo / "content" / "analysis" / f"{head_sha}.json").is_file()

    def test_cli_generate_duplicate_skip_exit_code_zero(self, test_git_repo: Path, monkeypatch):
        monkeypatch.setenv("AI_CONTENT_MOCK", "1")
        monkeypatch.chdir(test_git_repo)

        f = test_git_repo / "skip.py"
        f.write_text("y = 100", encoding="utf-8")
        test_git_repo.run_git("add", "skip.py")  # type: ignore[attr-defined]
        test_git_repo.run_git("commit", "-m", "feat: duplicate skip cli")  # type: ignore[attr-defined]

        runner = CliRunner()
        # 1st run
        res1 = runner.invoke(cli, ["generate", "HEAD"])
        assert res1.exit_code == 0

        # 2nd run
        res2 = runner.invoke(cli, ["generate", "HEAD"])
        assert res2.exit_code == 0
        assert "[SKIP] Content already generated" in res2.output

    def test_cli_generate_invalid_commit_exit_code_one(self, test_git_repo: Path, monkeypatch):
        monkeypatch.chdir(test_git_repo)
        runner = CliRunner()
        result = runner.invoke(cli, ["generate", "non_existent_ref_12345"])

        assert result.exit_code == 1
        assert "Error: Commit 'non_existent_ref_12345' not found" in result.output
