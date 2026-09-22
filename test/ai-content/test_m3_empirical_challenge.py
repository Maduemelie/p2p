"""Milestone 3 Empirical Challenge & Stress Test Suite.

Authoritative Specification: PROJECT.md § Milestone 3 & M3 ↔ M4 Interface Contracts.
Empirically challenges:
1. `run_pipeline(commit_ref="HEAD", force=True)` across diverse real Git commits.
2. Deliverable 1: `content/analysis/<sha>.json` valid JSON, Pydantic `DevelopmentSessionReport` schema conformance, extra fields rejection (`extra="forbid"`).
3. Deliverable 2: `content/articles/<sha>-<slug>.md` valid YAML frontmatter, H1 heading, required sections (Executive Summary, Architectural Breakdown, Changes Overview, Key Technical Takeaways).
4. Deliverable 3: `content/journal/<sha>-<slug>.md` short SHA heading, commit metadata, reflection sections (Session Overview, Engineering Challenges & Decisions, Next Steps).
5. Deliverable 4: `content/social/<sha>-<slug>.md` exactly 5 tweets (1/5 to 5/5), all under 280 characters.
6. Deliverable 5: Zero temporary `.tmp` files anywhere under `content/`.
7. Atomic writes, debris cleanup under simulated disk/filesystem errors, concurrent runs.
8. Duplicate skip idempotency and `--force` flag regeneration.
9. Delimiter parsing and fallback resilience in `execute_crew_pipeline`.
10. CLI contract: exit code 0 on success/skip, exit code 1 on non-existent commits.
"""

from __future__ import annotations

import concurrent.futures
import json
import os
import re
import subprocess
import time
from pathlib import Path
from typing import Dict, List, Optional
from unittest.mock import MagicMock, patch

import pytest
from click.testing import CliRunner
from pydantic import ValidationError

from ai_content.agents import (
    create_context_analyst_agent,
    create_journal_writer_agent,
    create_quality_reviewer_agent,
    create_social_writer_agent,
    create_technical_writer_agent,
    get_llm,
)
from ai_content.cli import cli, resolve_commit_sha
from ai_content.git_context import (
    FileChangeDetail,
    GitCommitContext,
    GitCommitNotFoundError,
    GitError,
    collect_git_context,
)
from ai_content.models import (
    DevelopmentSessionReport,
    ISO_8601_REGEX,
    SHA_40_REGEX,
    SLUG_REGEX,
    slugify,
)
from ai_content.pipeline import (
    atomic_write_text,
    execute_crew_pipeline,
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


# ==============================================================================
# Helper Utilities for Isolated Git Testing
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
            "GIT_AUTHOR_NAME": "Challenger Developer",
            "GIT_AUTHOR_EMAIL": "challenger@example.com",
            "GIT_COMMITTER_NAME": "Challenger Committer",
            "GIT_COMMITTER_EMAIL": "committer@example.com",
        },
    )
    return res.stdout.strip()


@pytest.fixture
def isolated_git_repo(tmp_path: Path) -> Path:
    """Creates a completely isolated real Git repository with initial commit."""
    repo = tmp_path / "challenge_repo"
    repo.mkdir(parents=True, exist_ok=True)

    git(repo, "init", "-b", "main")
    git(repo, "config", "user.name", "Challenger Developer")
    git(repo, "config", "user.email", "challenger@example.com")

    # Initial commit
    (repo / "README.md").write_text("# Empirical Challenge Target\n", encoding="utf-8")
    git(repo, "add", "README.md")
    git(repo, "commit", "-m", "chore: initial repository creation")

    return repo


# ==============================================================================
# 1. DELIVERABLES FORMAT & SCHEMA EMPIRICAL STRESS TESTS
# ==============================================================================

class TestDeliverablesFormatAndSchemaStress:
    """Empirically stress-test the 4 deliverables and temporary file invariants."""

    def test_run_pipeline_produces_all_4_deliverables(self, isolated_git_repo: Path):
        """Verify run_pipeline generates analysis JSON, article MD, journal MD, and social MD."""
        # Add a feature commit
        (isolated_git_repo / "src").mkdir()
        (isolated_git_repo / "src" / "arbitrage.py").write_text(
            "def calculate_sweet_spot(orderbook):\n    return 1500.0\n",
            encoding="utf-8",
        )
        git(isolated_git_repo, "add", "src/arbitrage.py")
        git(isolated_git_repo, "commit", "-m", "feat(arb): implement sweet spot pricing model")

        head_sha = git(isolated_git_repo, "rev-parse", "HEAD")
        short_sha = head_sha[:7]

        # Execute pipeline
        outputs = run_pipeline(commit_ref="HEAD", force=True, mock=True, repo_root=isolated_git_repo)

        assert set(outputs.keys()) == {"analysis", "article", "journal", "social"}
        for key, file_path in outputs.items():
            assert file_path.is_file(), f"Output deliverable {key} must exist at {file_path}"
            assert file_path.stat().st_size > 0, f"Output deliverable {key} must not be empty"

    def test_deliverable_1_analysis_json_schema_and_extra_fields_rejection(self, isolated_git_repo: Path):
        """Deliverable 1: content/analysis/<sha>.json must strictly satisfy DevelopmentSessionReport."""
        git(isolated_git_repo, "commit", "--allow-empty", "-m", "feat(core): empty commit session")
        head_sha = git(isolated_git_repo, "rev-parse", "HEAD")

        outputs = run_pipeline(commit_ref=head_sha, force=True, mock=True, repo_root=isolated_git_repo)
        analysis_path = outputs["analysis"]

        # 1. Valid JSON parsing
        raw_text = analysis_path.read_text(encoding="utf-8")
        parsed_json = json.loads(raw_text)
        assert isinstance(parsed_json, dict)

        # 2. Pydantic validation via DevelopmentSessionReport
        report = DevelopmentSessionReport.model_validate(parsed_json)
        assert report.commit_sha == head_sha
        assert SHA_40_REGEX.match(report.commit_sha)
        assert ISO_8601_REGEX.match(report.timestamp)
        assert len(report.summary.strip()) > 10
        assert len(report.architecture_impact.strip()) > 10
        assert len(report.key_takeaways) >= 1
        for item in report.key_takeaways:
            assert isinstance(item, str) and len(item.strip()) > 0
        assert isinstance(report.changed_components, list)
        assert len(report.suggested_article_title.strip()) > 0
        assert SLUG_REGEX.match(report.suggested_article_slug)

        # 3. Strict extra="forbid" rejection
        tampered_json = {**parsed_json, "unexpected_extra_field": "disallowed_value"}
        with pytest.raises(ValidationError) as exc_info:
            DevelopmentSessionReport.model_validate(tampered_json)
        assert "extra_forbidden" in str(exc_info.value) or "Extra inputs are not permitted" in str(exc_info.value)

    def test_deliverable_2_article_markdown_structure_and_yaml_frontmatter(self, isolated_git_repo: Path):
        """Deliverable 2: content/articles/<sha>-<slug>.md must have valid YAML frontmatter, H1, sections."""
        (isolated_git_repo / "cache.py").write_text("CACHE = {}\n", encoding="utf-8")
        git(isolated_git_repo, "add", "cache.py")
        git(isolated_git_repo, "commit", "-m", "fix(cache): resolve cache invalidation race condition")
        head_sha = git(isolated_git_repo, "rev-parse", "HEAD")

        outputs = run_pipeline(commit_ref="HEAD", force=True, mock=True, repo_root=isolated_git_repo)
        article_path = outputs["article"]
        content = article_path.read_text(encoding="utf-8")

        # 1. Substantial length
        assert len(content.strip()) >= 50

        # 2. YAML frontmatter format
        assert content.startswith("---\n"), "Article must start with YAML frontmatter opener '---'"
        parts = content.split("---\n", 2)
        assert len(parts) >= 3, "Article must contain closed YAML frontmatter block"
        frontmatter = parts[1]
        assert f'commit: "{head_sha}"' in frontmatter or f"commit: '{head_sha}'" in frontmatter
        assert "title:" in frontmatter
        assert "slug:" in frontmatter
        assert "date:" in frontmatter
        assert "author:" in frontmatter

        # 3. Top-level H1 heading
        assert re.search(r"^#\s+.+", parts[2], re.MULTILINE), "Article body must contain top-level H1 heading"

        # 4. Mandatory Section Headings
        assert re.search(r"^##\s+Executive Summary", parts[2], re.MULTILINE | re.IGNORECASE)
        assert re.search(r"^##\s+Architectural Breakdown", parts[2], re.MULTILINE | re.IGNORECASE)
        assert re.search(r"^##\s+Changes Overview", parts[2], re.MULTILINE | re.IGNORECASE)
        assert re.search(r"^##\s+Key Technical Takeaways", parts[2], re.MULTILINE | re.IGNORECASE)

        # 5. Footer author/commit citation
        assert f"Commit {head_sha}" in content

    def test_deliverable_3_journal_markdown_structure_and_short_sha(self, isolated_git_repo: Path):
        """Deliverable 3: content/journal/<sha>-<slug>.md must feature short SHA and reflection sections."""
        (isolated_git_repo / "server.js").write_text("const express = require('express');\n", encoding="utf-8")
        git(isolated_git_repo, "add", "server.js")
        git(isolated_git_repo, "commit", "-m", "refactor(server): modularize middleware stack")
        head_sha = git(isolated_git_repo, "rev-parse", "HEAD")
        short_sha = head_sha[:7]

        outputs = run_pipeline(commit_ref="HEAD", force=True, mock=True, repo_root=isolated_git_repo)
        journal_path = outputs["journal"]
        content = journal_path.read_text(encoding="utf-8")

        # 1. Content length >= 30 chars
        assert len(content.strip()) >= 30

        # 2. Title format with short SHA
        assert content.startswith(f"# Development Journal — {short_sha}")

        # 3. Metadata bullets with full and short SHA
        assert head_sha in content
        assert short_sha in content

        # 4. Mandatory Reflection Sections
        assert re.search(r"^##\s+Session Overview", content, re.MULTILINE | re.IGNORECASE)
        assert re.search(r"^##\s+Engineering Challenges & Decisions", content, re.MULTILINE | re.IGNORECASE)
        assert re.search(r"^##\s+Next Steps", content, re.MULTILINE | re.IGNORECASE)

    def test_deliverable_4_social_thread_tweet_count_and_character_limits(self, isolated_git_repo: Path):
        """Deliverable 4: content/social/<sha>-<slug>.md must have 5 tweets, all under 280 characters."""
        # Create commit with moderately verbose message
        (isolated_git_repo / "config.json").write_text('{"v": 2}\n', encoding="utf-8")
        git(isolated_git_repo, "add", "config.json")
        git(
            isolated_git_repo,
            "commit",
            "-m",
            "feat(config): upgrade configuration schema and add validation rules for environment overrides",
        )
        head_sha = git(isolated_git_repo, "rev-parse", "HEAD")

        outputs = run_pipeline(commit_ref="HEAD", force=True, mock=True, repo_root=isolated_git_repo)
        social_path = outputs["social"]
        content = social_path.read_text(encoding="utf-8")

        # 1. Substantial length >= 20 chars
        assert len(content.strip()) >= 20

        # 2. Split into individual tweets
        tweets = [t.strip() for t in content.split("\n\n") if t.strip()]
        assert len(tweets) == 5, f"Social thread must have exactly 5 tweets, found {len(tweets)}"

        # 3. Numbered progression 1/5 to 5/5
        assert tweets[0].startswith("1/5")
        assert tweets[1].startswith("2/5")
        assert tweets[2].startswith("3/5")
        assert tweets[3].startswith("4/5")
        assert tweets[4].startswith("5/5")

        # 4. Character count enforcement across every single tweet
        for i, tweet in enumerate(tweets, 1):
            char_count = len(tweet)
            assert char_count <= 280, (
                f"Tweet {i}/5 exceeded Twitter character limit of 280 ({char_count} chars): {tweet}"
            )

    def test_deliverable_5_zero_tmp_files_exist_under_content_tree(self, isolated_git_repo: Path):
        """Deliverable 5: Zero temporary .tmp files remain anywhere under content/."""
        # Execute multiple pipeline runs
        for i in range(3):
            (isolated_git_repo / f"file_{i}.txt").write_text(f"content {i}\n", encoding="utf-8")
            git(isolated_git_repo, "add", ".")
            git(isolated_git_repo, "commit", "-m", f"chore: commit number {i}")
            run_pipeline(commit_ref="HEAD", force=True, mock=True, repo_root=isolated_git_repo)

        content_dir = isolated_git_repo / "content"
        assert content_dir.is_dir()

        # Recursively search for any file containing .tmp in its name
        tmp_files = list(content_dir.rglob("*.tmp*"))
        assert len(tmp_files) == 0, f"Found orphan temporary files under content/: {tmp_files}"


# ==============================================================================
# 2. ADVERSARIAL GIT COMMIT INPUTS & SLUG GENERATION
# ==============================================================================

class TestAdversarialCommitInputs:
    """Stress test pipeline against complex commit messages, diffs, and special characters."""

    def test_commit_with_special_characters_quotes_and_emojis(self, isolated_git_repo: Path):
        """Verify pipeline handles quotes, markdown, brackets, and emojis in commit messages."""
        (isolated_git_repo / "special.txt").write_text("sample\n", encoding="utf-8")
        git(isolated_git_repo, "add", "special.txt")
        complex_msg = (
            'feat(ui): add "sweet-spot" badges! 🚀 #123 [breaking] *bold* `inline_code`\n\n'
            'Detailed body explaining "quoted logic" & <XML/HTML> tokens with $ symbols.'
        )
        git(isolated_git_repo, "commit", "-m", complex_msg)

        head_sha = git(isolated_git_repo, "rev-parse", "HEAD")
        outputs = run_pipeline(commit_ref=head_sha, force=True, mock=True, repo_root=isolated_git_repo)

        # Verify JSON
        report = DevelopmentSessionReport.from_json_file(outputs["analysis"])
        assert SLUG_REGEX.match(report.suggested_article_slug)
        assert "sweet-spot" in report.suggested_article_slug

        # Verify social thread tweets all under 280
        social_content = outputs["social"].read_text(encoding="utf-8")
        tweets = [t.strip() for t in social_content.split("\n\n") if t.strip()]
        for t in tweets:
            assert len(t) <= 280

    def test_commit_with_very_long_subject_line(self, isolated_git_repo: Path):
        """Verify very long subject line (500 chars) generates valid slug and <= 280 char tweets."""
        (isolated_git_repo / "long.txt").write_text("long\n", encoding="utf-8")
        git(isolated_git_repo, "add", "long.txt")
        long_subject = "feat(scalability): " + "super-long-description-" * 25
        git(isolated_git_repo, "commit", "-m", long_subject)

        outputs = run_pipeline(commit_ref="HEAD", force=True, mock=True, repo_root=isolated_git_repo)
        report = DevelopmentSessionReport.from_json_file(outputs["analysis"])

        # Slug must be strictly valid
        assert SLUG_REGEX.match(report.suggested_article_slug)

        # Every tweet must be <= 280 chars even with 500-char subject
        social_content = outputs["social"].read_text(encoding="utf-8")
        tweets = [t.strip() for t in social_content.split("\n\n") if t.strip()]
        assert len(tweets) == 5
        for i, t in enumerate(tweets, 1):
            assert len(t) <= 280, f"Tweet {i} exceeded 280 chars ({len(t)} chars)"

    def test_commit_with_pure_emojis_and_symbols(self, isolated_git_repo: Path):
        """Verify pure emoji message falls back safely to 'content-update' slug."""
        (isolated_git_repo / "emoji.txt").write_text("emoji\n", encoding="utf-8")
        git(isolated_git_repo, "add", "emoji.txt")
        git(isolated_git_repo, "commit", "-m", "🎉✨💥 🔥🔥🔥")

        outputs = run_pipeline(commit_ref="HEAD", force=True, mock=True, repo_root=isolated_git_repo)
        report = DevelopmentSessionReport.from_json_file(outputs["analysis"])
        assert report.suggested_article_slug == "content-update"
        assert SLUG_REGEX.match(report.suggested_article_slug)

    def test_commit_with_empty_diff_allow_empty(self, isolated_git_repo: Path):
        """Verify empty commit (0 files changed) produces complete deliverables without crashing."""
        git(isolated_git_repo, "commit", "--allow-empty", "-m", "chore: empty commit trigger")
        outputs = run_pipeline(commit_ref="HEAD", force=True, mock=True, repo_root=isolated_git_repo)

        report = DevelopmentSessionReport.from_json_file(outputs["analysis"])
        assert report.changed_components == ["core"]
        assert "Zero file delta detected" in report.architecture_impact

        article_content = outputs["article"].read_text(encoding="utf-8")
        assert "No file changes in this commit" in article_content

    def test_merge_commit_pipeline_execution(self, isolated_git_repo: Path):
        """Verify 2-parent merge commit generates valid deliverables."""
        # Create branch
        git(isolated_git_repo, "checkout", "-b", "feature-branch")
        (isolated_git_repo / "feat.txt").write_text("feature content\n", encoding="utf-8")
        git(isolated_git_repo, "add", "feat.txt")
        git(isolated_git_repo, "commit", "-m", "feat: branch commit")

        # Checkout main and commit
        git(isolated_git_repo, "checkout", "main")
        (isolated_git_repo / "main.txt").write_text("main content\n", encoding="utf-8")
        git(isolated_git_repo, "add", "main.txt")
        git(isolated_git_repo, "commit", "-m", "chore: main concurrent commit")

        # Merge feature into main
        git(isolated_git_repo, "merge", "--no-ff", "feature-branch", "-m", "merge: merge feature branch into main")

        merge_sha = git(isolated_git_repo, "rev-parse", "HEAD")
        outputs = run_pipeline(commit_ref=merge_sha, force=True, mock=True, repo_root=isolated_git_repo)

        report = DevelopmentSessionReport.from_json_file(outputs["analysis"])
        assert report.commit_sha == merge_sha


# ==============================================================================
# 3. ATOMIC WRITING & DEBRIS CLEANUP UNDER STRESS
# ==============================================================================

class TestAtomicWritingAndDebrisStress:
    """Stress test atomic file operations and temporary file cleanup on disk failures."""

    def test_atomic_write_text_creates_directories_automatically(self, tmp_path: Path):
        """Verify atomic_write_text creates non-existent deeply nested directories."""
        deep_file = tmp_path / "deep" / "nested" / "dir" / "deliverable.md"
        assert not deep_file.parent.exists()

        result = atomic_write_text(deep_file, "# Deep Content\n")
        assert result.is_file()
        assert result.read_text(encoding="utf-8") == "# Deep Content\n"
        assert len(list(tmp_path.rglob("*.tmp*"))) == 0

    def test_atomic_write_text_cleans_up_temp_file_on_exception(self, tmp_path: Path):
        """Verify temp file is unlinked when replace fails with OSError."""
        target_file = tmp_path / "target.txt"

        with patch.object(Path, "replace", side_effect=OSError("Simulated disk error")):
            with pytest.raises(OSError, match="Simulated disk error"):
                atomic_write_text(target_file, "Payload that must not remain")

        assert not target_file.exists()
        # Ensure zero .tmp files remained
        tmp_files = list(tmp_path.rglob("*.tmp*"))
        assert len(tmp_files) == 0

    def test_concurrent_atomic_writes_do_not_collide_or_corrupt(self, tmp_path: Path):
        """Verify 20 concurrent threads writing to separate files in the same directory."""
        def write_worker(idx: int) -> bool:
            dest = tmp_path / f"concurrent_file_{idx}.txt"
            content = f"Content for worker {idx}\n" * 50
            atomic_write_text(dest, content)
            read_back = dest.read_text(encoding="utf-8")
            return read_back == content

        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
            futures = [executor.submit(write_worker, i) for i in range(20)]
            results = [f.result() for f in concurrent.futures.as_completed(futures)]

        assert all(results)
        # Verify 0 temp files remained
        tmp_files = list(tmp_path.rglob("*.tmp*"))
        assert len(tmp_files) == 0


# ==============================================================================
# 4. DUPLICATE SKIPPING & FORCE REGENERATION INVARIANTS
# ==============================================================================

class TestDuplicateSkippingAndForceInvariants:
    """Stress test idempotency, timestamp preservation, and force regeneration."""

    def test_duplicate_skip_preserves_file_timestamps_exactly(self, isolated_git_repo: Path):
        """Verify second run without force returns existing paths and preserves exact mtimes."""
        (isolated_git_repo / "data.csv").write_text("1,2,3\n", encoding="utf-8")
        git(isolated_git_repo, "add", "data.csv")
        git(isolated_git_repo, "commit", "-m", "feat(data): add dataset")

        # 1st run
        first_outputs = run_pipeline(commit_ref="HEAD", force=False, mock=True, repo_root=isolated_git_repo)
        analysis_file = first_outputs["analysis"]
        article_file = first_outputs["article"]

        orig_analysis_mtime = analysis_file.stat().st_mtime_ns
        orig_article_mtime = article_file.stat().st_mtime_ns

        # Small delay
        time.sleep(0.02)

        # 2nd run
        second_outputs = run_pipeline(commit_ref="HEAD", force=False, mock=True, repo_root=isolated_git_repo)

        assert second_outputs["analysis"] == analysis_file
        assert second_outputs["article"] == article_file
        # Timestamps MUST remain strictly identical
        assert analysis_file.stat().st_mtime_ns == orig_analysis_mtime
        assert article_file.stat().st_mtime_ns == orig_article_mtime

    def test_force_regeneration_updates_file_timestamps(self, isolated_git_repo: Path):
        """Verify run with force=True updates mtime and overwrites content."""
        (isolated_git_repo / "force.py").write_text("X = 1\n", encoding="utf-8")
        git(isolated_git_repo, "add", "force.py")
        git(isolated_git_repo, "commit", "-m", "feat(force): test force regeneration")

        # 1st run
        first_outputs = run_pipeline(commit_ref="HEAD", force=False, mock=True, repo_root=isolated_git_repo)
        analysis_file = first_outputs["analysis"]
        orig_mtime = analysis_file.stat().st_mtime_ns

        time.sleep(0.02)

        # 2nd run with force=True
        second_outputs = run_pipeline(commit_ref="HEAD", force=True, mock=True, repo_root=isolated_git_repo)

        assert second_outputs["analysis"] == analysis_file
        assert analysis_file.stat().st_mtime_ns > orig_mtime

    def test_force_regeneration_recovers_from_corrupted_json(self, isolated_git_repo: Path):
        """Verify force=True safely recovers when existing analysis JSON file is corrupted."""
        git(isolated_git_repo, "commit", "--allow-empty", "-m", "chore: corrupted recovery")
        head_sha = git(isolated_git_repo, "rev-parse", "HEAD")

        analysis_dir = isolated_git_repo / "content" / "analysis"
        analysis_dir.mkdir(parents=True, exist_ok=True)
        corrupted_file = analysis_dir / f"{head_sha}.json"
        corrupted_file.write_text("{\"commit_sha\": \"TRUNCATED_JSON_CORRUPT...", encoding="utf-8")

        # Force generation must overwrite corrupted JSON with valid report
        outputs = run_pipeline(commit_ref=head_sha, force=True, mock=True, repo_root=isolated_git_repo)
        report = DevelopmentSessionReport.from_json_file(outputs["analysis"])
        assert report.commit_sha == head_sha


# ==============================================================================
# 5. CREWAI PIPELINE DELIMITER PARSING & FALLBACK ROBUSTNESS
# ==============================================================================

class TestPipelineDelimiterAndFallbackRobustness:
    """Stress test execute_crew_pipeline fallback mechanisms."""

    def test_execute_crew_pipeline_parses_delimiters_properly(self):
        """Verify delimiter parsing extracts article, journal, and social from Quality Reviewer."""
        git_context = GitCommitContext(
            sha="e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4",
            short_sha="e5f6a7b",
            author_name="Sample Author",
            author_email="author@example.com",
            date="2026-09-22T12:00:00Z",
            message_subject="feat(test): delimiter test",
            message_body="Testing delimiter extraction.",
            changed_files=[],
            diff="",
            is_merge=False,
            parent_shas=[],
        )

        mock_reviewer_output = (
            "Reviewer preamble text...\n\n"
            "===ARTICLE===\n"
            "# Audited Article Title\n\n## Executive Summary\nAudited summary content.\n"
            "===JOURNAL===\n"
            "# Development Journal — e5f6a7b\n\n## Session Overview\nAudited journal content.\n"
            "===SOCIAL===\n"
            "1/5 🚀 Pushed commit e5f6a7b!\n\n2/5 Architecture\n\n3/5 Implementation\n\n4/5 Takeaway\n\n5/5 CTA\n"
        )

        with patch("crewai.Crew") as MockCrew:
            mock_crew_instance = MagicMock()
            MockCrew.return_value = mock_crew_instance

            # Simulate task execution output
            with patch("ai_content.pipeline.create_context_analyst_task") as m_ana, \
                 patch("ai_content.pipeline.create_technical_writer_task") as m_art, \
                 patch("ai_content.pipeline.create_journal_writer_task") as m_jrn, \
                 patch("ai_content.pipeline.create_social_writer_task") as m_soc, \
                 patch("ai_content.pipeline.create_quality_reviewer_task") as m_rev:

                t_ana = MagicMock()
                t_ana.output = MagicMock(pydantic=None, raw=None)
                m_ana.return_value = t_ana

                t_art = MagicMock(output=MagicMock(raw="Article fallback"))
                m_art.return_value = t_art
                t_jrn = MagicMock(output=MagicMock(raw="Journal fallback"))
                m_jrn.return_value = t_jrn
                t_soc = MagicMock(output=MagicMock(raw="Social fallback"))
                m_soc.return_value = t_soc

                t_rev = MagicMock()
                t_rev.output = MagicMock(raw=mock_reviewer_output)
                m_rev.return_value = t_rev

                report, art, jrn, soc = execute_crew_pipeline(git_context)

                assert "# Audited Article Title" in art
                assert "# Development Journal — e5f6a7b" in jrn
                assert "1/5 🚀 Pushed commit e5f6a7b!" in soc


# ==============================================================================
# 6. CLI INTEGRATION & EXIT CODE CONTRACTS
# ==============================================================================

class TestCliIntegrationAndExitCodes:
    """Empirically test Click CLI commands, exit codes, and output formatting."""

    def test_cli_generate_head_success_exit_code_zero(self, isolated_git_repo: Path, monkeypatch):
        """CLI generate HEAD exits 0 and prints created deliverable paths."""
        monkeypatch.setenv("AI_CONTENT_MOCK", "1")
        monkeypatch.chdir(isolated_git_repo)

        runner = CliRunner()
        result = runner.invoke(cli, ["generate", "HEAD"])

        assert result.exit_code == 0
        assert "Pipeline completed successfully" in result.output
        assert "- analysis:" in result.output
        assert "- article:" in result.output
        assert "- journal:" in result.output
        assert "- social:" in result.output

    def test_cli_generate_duplicate_skip_prints_notice_and_exits_zero(self, isolated_git_repo: Path, monkeypatch):
        """CLI duplicate execution without --force prints [SKIP] notice and exits 0."""
        monkeypatch.setenv("AI_CONTENT_MOCK", "1")
        monkeypatch.chdir(isolated_git_repo)

        runner = CliRunner()
        # 1st run
        res1 = runner.invoke(cli, ["generate", "HEAD"])
        assert res1.exit_code == 0

        # 2nd run
        res2 = runner.invoke(cli, ["generate", "HEAD"])
        assert res2.exit_code == 0
        assert "[SKIP]" in res2.output
        assert "Use --force / -f to regenerate" in res2.output

    def test_cli_generate_non_existent_commit_exits_one(self, isolated_git_repo: Path, monkeypatch):
        """CLI generate non-existent commit ref exits 1 and displays error message."""
        monkeypatch.chdir(isolated_git_repo)

        runner = CliRunner()
        result = runner.invoke(cli, ["generate", "0000000000000000000000000000000000000000"])

        assert result.exit_code == 1
        assert "Error: Commit '0000000000000000000000000000000000000000' not found" in result.output
