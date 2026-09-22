"""Automated unit test suite for Milestone 2: Git Context & Pydantic Data Models.

Tests:
  - FileChangeDetail model, status validation, properties, and line formatting.
  - GitCommitContext model, 40-char SHA validation, short_sha derivation,
    ISO-8601 date parsing, diff statistics, prompt formatting, and truncation.
  - DevelopmentSessionReport model schema compliance matching PROJECT.md and
    schema-validator.js contracts (SHA_40, ISO_8601, summary, takeaways, slug).
  - slugify helper and kebab-case slug generation under complex commit titles.
  - JSON serialization, schema export (model_json_schema), and atomic file persistence.
  - Live Git context extraction: root commits, merge commits, empty commits,
    detached HEAD, large diff truncation, binary files, and nonexistent commits.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path
from typing import Generator

import pytest
from pydantic import ValidationError

from ai_content.git_context import (
    GitCommitNotFoundError,
    GitError,
    collect_git_context,
    resolve_commit_sha,
    truncate_diff,
)
from ai_content.models import (
    DevelopmentSessionReport,
    FileChangeDetail,
    GitCommitContext,
    ISO_8601_REGEX,
    SHA_40_REGEX,
    SLUG_REGEX,
    slugify,
)


# ==============================================================================
# 1. FileChangeDetail Tests
# ==============================================================================

class TestFileChangeDetail:
    """Test suite for FileChangeDetail model."""

    def test_valid_file_change_modified(self):
        """Verify instantiation with standard modified file."""
        detail = FileChangeDetail(
            filename="src/orderbook.js",
            status="M",
            additions=45,
            deletions=12,
        )
        assert detail.filename == "src/orderbook.js"
        assert detail.status == "M"
        assert detail.additions == 45
        assert detail.deletions == 12
        assert detail.net_change == 33
        assert detail.status_code == "M"
        assert detail.status_description == "Modified"
        assert "[M] src/orderbook.js (+45, -12)" in detail.format_line()
        assert str(detail) == detail.format_line()

    def test_status_codes_and_normalization(self):
        """Verify acceptance and normalization of valid Git status codes."""
        for code, desc in [
            ("A", "Added"),
            ("M", "Modified"),
            ("D", "Deleted"),
            ("R", "Renamed"),
            ("C", "Copied"),
            ("T", "Type Changed"),
            ("U", "Unmerged"),
        ]:
            item = FileChangeDetail(filename="test.txt", status=code.lower())
            assert item.status == code
            assert item.status_description == desc

    def test_git_diff_tree_status_with_score(self):
        """Verify status strings like R100, C090 from git diff-tree are accepted."""
        item = FileChangeDetail(
            filename="new_name.py",
            old_filename="old_name.py",
            status="R100",
            additions=5,
            deletions=2,
        )
        assert item.status == "R100"
        assert item.status_code == "R"
        assert item.status_description == "Renamed"
        assert "renamed from old_name.py" in item.format_line()

    def test_invalid_status_rejected(self):
        """Verify invalid git status codes raise ValidationError."""
        with pytest.raises(ValidationError):
            FileChangeDetail(filename="test.txt", status="Z")

        with pytest.raises(ValidationError):
            FileChangeDetail(filename="test.txt", status="")

    def test_negative_additions_or_deletions_rejected(self):
        """Verify additions and deletions must be >= 0."""
        with pytest.raises(ValidationError):
            FileChangeDetail(filename="test.txt", status="M", additions=-1)

        with pytest.raises(ValidationError):
            FileChangeDetail(filename="test.txt", status="M", deletions=-5)

    def test_binary_file_flag(self):
        """Verify binary file change details formatting."""
        detail = FileChangeDetail(
            filename="assets/logo.png",
            status="A",
            additions=0,
            deletions=0,
            is_binary=True,
        )
        assert detail.is_binary is True
        assert "(binary)" in detail.format_line()


# ==============================================================================
# 2. GitCommitContext Tests
# ==============================================================================

class TestGitCommitContext:
    """Test suite for GitCommitContext model."""

    VALID_SHA = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"
    PARENT_1 = "1111111111111111111111111111111111111111"
    PARENT_2 = "2222222222222222222222222222222222222222"

    def test_valid_context_creation(self):
        """Verify instantiation with complete metadata."""
        context = GitCommitContext(
            sha=self.VALID_SHA,
            author_name="Alice Developer",
            author_email="alice@example.com",
            date="2026-09-22T11:49:12Z",
            message_subject="feat(core): implement robust context collector",
            message_body="Detailed explanation of the changes made.",
            changed_files=[
                FileChangeDetail(filename="ai_content/models.py", status="A", additions=150, deletions=0),
                FileChangeDetail(filename="ai_content/git_context.py", status="M", additions=80, deletions=10),
            ],
            diff="diff --git a/ai_content/models.py ...",
            parent_shas=[self.PARENT_1],
        )

        assert context.sha == self.VALID_SHA
        assert context.short_sha == self.VALID_SHA[:7]
        assert context.author_name == "Alice Developer"
        assert context.author_email == "alice@example.com"
        assert context.date == "2026-09-22T11:49:12Z"
        assert context.message_subject == "feat(core): implement robust context collector"
        assert context.total_files_changed == 2
        assert context.total_additions == 230
        assert context.total_deletions == 10
        assert context.is_merge is False
        assert context.is_root_commit is False
        assert context.is_empty_commit is False

    def test_sha_normalization_and_validation(self):
        """Verify SHA is normalized to lowercase and invalid SHAs raise ValidationError."""
        upper_sha = self.VALID_SHA.upper()
        ctx = GitCommitContext(
            sha=upper_sha,
            author_name="Bob",
            date="2026-09-22T11:49:12Z",
            message_subject="test",
        )
        assert ctx.sha == self.VALID_SHA

        # Short SHA (<40 chars)
        with pytest.raises(ValidationError):
            GitCommitContext(sha="4b825dc", author_name="Bob", date="2026-09-22T11:49:12Z", message_subject="test")

        # Non-hex characters
        with pytest.raises(ValidationError):
            GitCommitContext(
                sha="4b825dc642cb6eb9a060e54bf8d69288fbee490z",
                author_name="Bob",
                date="2026-09-22T11:49:12Z",
                message_subject="test",
            )

    def test_parent_shas_validation(self):
        """Verify parent SHAs are validated as 40-char hex strings."""
        ctx = GitCommitContext(
            sha=self.VALID_SHA,
            author_name="Bob",
            date="2026-09-22T11:49:12Z",
            message_subject="test",
            parent_shas=[self.PARENT_1, self.PARENT_2.upper()],
        )
        assert len(ctx.parent_shas) == 2
        assert ctx.parent_shas[1] == self.PARENT_2
        assert ctx.is_merge is True

        with pytest.raises(ValidationError):
            GitCommitContext(
                sha=self.VALID_SHA,
                author_name="Bob",
                date="2026-09-22T11:49:12Z",
                message_subject="test",
                parent_shas=["invalid-sha"],
            )

    def test_iso_date_validation(self):
        """Verify date field accepts ISO-8601 timestamps and rejects malformed strings."""
        for valid_date in (
            "2026-09-22T11:49:12Z",
            "2026-09-22T12:49:12+01:00",
            "2026-09-22T06:49:12-05:00",
            "2026-09-22T11:49:12.123456Z",
        ):
            ctx = GitCommitContext(
                sha=self.VALID_SHA,
                author_name="Bob",
                date=valid_date,
                message_subject="test",
            )
            assert ctx.date == valid_date

        for invalid_date in ("yesterday", "2026-09-22", "22/09/2026 11:49:12", "invalid"):
            with pytest.raises(ValidationError):
                GitCommitContext(
                    sha=self.VALID_SHA,
                    author_name="Bob",
                    date=invalid_date,
                    message_subject="test",
                )

    def test_root_commit_detection(self):
        """Verify is_root_commit returns True when parent_shas is empty."""
        ctx = GitCommitContext(
            sha=self.VALID_SHA,
            author_name="Bob",
            date="2026-09-22T11:49:12Z",
            message_subject="Initial commit",
            parent_shas=[],
        )
        assert ctx.is_root_commit is True

    def test_empty_commit_detection(self):
        """Verify is_empty_commit returns True when no changed files and empty diff."""
        ctx = GitCommitContext(
            sha=self.VALID_SHA,
            author_name="Bob",
            date="2026-09-22T11:49:12Z",
            message_subject="chore: empty commit",
            parent_shas=[self.PARENT_1],
            changed_files=[],
            diff="",
        )
        assert ctx.is_empty_commit is True
        assert ctx.diff_summary() == "0 files changed, 0 insertions(+), 0 deletions(-)"

    def test_diff_summary_formatting(self):
        """Verify diff_summary formatting pluralization and counts."""
        ctx1 = GitCommitContext(
            sha=self.VALID_SHA,
            author_name="Bob",
            date="2026-09-22T11:49:12Z",
            message_subject="fix",
            changed_files=[FileChangeDetail(filename="a.py", status="M", additions=1, deletions=1)],
        )
        assert ctx1.diff_summary() == "1 file changed, 1 insertion(+), 1 deletion(-)"

        ctx2 = GitCommitContext(
            sha=self.VALID_SHA,
            author_name="Bob",
            date="2026-09-22T11:49:12Z",
            message_subject="feat",
            changed_files=[
                FileChangeDetail(filename="a.py", status="M", additions=10, deletions=5),
                FileChangeDetail(filename="b.py", status="A", additions=20, deletions=0),
            ],
        )
        assert ctx2.diff_summary() == "2 files changed, 30 insertions(+), 5 deletions(-)"

    def test_to_prompt_context_formatting(self):
        """Verify to_prompt_context produces structured Markdown with all metadata."""
        ctx = GitCommitContext(
            sha=self.VALID_SHA,
            author_name="Charlie",
            author_email="charlie@example.com",
            date="2026-09-22T11:49:12Z",
            message_subject="feat(api): add webhook support",
            message_body="Adds full webhook notification pipeline with retry logic.",
            changed_files=[FileChangeDetail(filename="api/webhook.py", status="A", additions=100, deletions=0)],
            diff="+ class WebhookHandler:\n+     pass\n",
            parent_shas=[self.PARENT_1],
        )

        prompt = ctx.to_prompt_context()
        assert f"Commit SHA: `{self.VALID_SHA}`" in prompt
        assert f"({self.VALID_SHA[:7]})" in prompt
        assert "Author: Charlie <charlie@example.com>" in prompt
        assert "Date: 2026-09-22T11:49:12Z" in prompt
        assert "feat(api): add webhook support" in prompt
        assert "Adds full webhook notification pipeline" in prompt
        assert "| A | `api/webhook.py` | +100 | -0 |" in prompt
        assert "```diff" in prompt
        assert "WebhookHandler" in prompt

    def test_to_prompt_context_diff_truncation(self):
        """Verify to_prompt_context cleanly truncates huge diffs and includes banner."""
        huge_diff = "const x = 1;\n" * 5000
        ctx = GitCommitContext(
            sha=self.VALID_SHA,
            author_name="David",
            date="2026-09-22T11:49:12Z",
            message_subject="feat(big): large diff",
            diff=huge_diff,
        )

        prompt = ctx.to_prompt_context(max_diff_chars=200)
        assert "[DIFF TRUNCATED:" in prompt
        assert "showing first 200 characters" in prompt
        assert len(huge_diff) > 200


# ==============================================================================
# 3. DevelopmentSessionReport Schema & Validation Tests
# ==============================================================================

class TestDevelopmentSessionReport:
    """Test suite for DevelopmentSessionReport Pydantic V2 schema."""

    VALID_SHA = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"

    def test_valid_report_creation(self):
        """Verify creation of a valid DevelopmentSessionReport matching PROJECT.md."""
        report = DevelopmentSessionReport(
            commit_sha=self.VALID_SHA,
            timestamp="2026-09-22T11:49:12Z",
            summary="Implemented complete Pydantic V2 data model architecture for Git context.",
            architecture_impact="Introduces type-safe data validation layer between Git and CrewAI agents.",
            key_takeaways=[
                "Pydantic V2 models ensure type safety across pipeline stages.",
                "Atomic JSON file persistence prevents race conditions.",
            ],
            changed_components=["ai_content", "test/ai-content"],
            suggested_article_title="Building Type-Safe Multi-Agent Git Pipelines with Pydantic V2",
            suggested_article_slug="building-type-safe-multi-agent-git-pipelines-with-pydantic-v2",
        )

        assert report.commit_sha == self.VALID_SHA
        assert report.timestamp == "2026-09-22T11:49:12Z"
        assert len(report.key_takeaways) == 2
        assert report.suggested_article_slug.startswith("building-type-safe")

    def test_commit_sha_validation_and_lowercasing(self):
        """Verify commit_sha validates 40-char hex and normalizes uppercase to lowercase."""
        upper_sha = self.VALID_SHA.upper()
        report = DevelopmentSessionReport(
            commit_sha=upper_sha,
            timestamp="2026-09-22T11:49:12Z",
            summary="A comprehensive summary of the commit changes exceeding ten characters.",
            architecture_impact="A comprehensive description of architecture impact exceeding ten characters.",
            key_takeaways=["Takeaway 1"],
            suggested_article_title="Sample Title",
            suggested_article_slug="sample-title",
        )
        assert report.commit_sha == self.VALID_SHA

        with pytest.raises(ValidationError):
            DevelopmentSessionReport(
                commit_sha="shortsha",
                timestamp="2026-09-22T11:49:12Z",
                summary="Valid summary exceeding ten characters.",
                architecture_impact="Valid architecture impact statement.",
                key_takeaways=["Valid takeaway"],
                suggested_article_title="Title",
                suggested_article_slug="title",
            )

        with pytest.raises(ValidationError):
            DevelopmentSessionReport(
                commit_sha="g1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
                timestamp="2026-09-22T11:49:12Z",
                summary="Valid summary string with plenty of characters.",
                architecture_impact="Valid impact string with plenty of characters.",
                key_takeaways=["Valid takeaway"],
                suggested_article_title="Valid Title",
                suggested_article_slug="valid-title",
            )

    def test_timestamp_iso8601_validation(self):
        """Verify timestamp strictly enforces ISO-8601 format."""
        with pytest.raises(ValidationError):
            DevelopmentSessionReport(
                commit_sha=self.VALID_SHA,
                timestamp="invalid-timestamp",
                summary="Valid summary string with plenty of characters.",
                architecture_impact="Valid impact string with plenty of characters.",
                key_takeaways=["Valid takeaway"],
                suggested_article_title="Valid Title",
                suggested_article_slug="valid-title",
            )

    def test_summary_and_impact_length_validation(self):
        """Verify summary and architecture_impact require > 10 non-whitespace chars."""
        with pytest.raises(ValidationError):
            DevelopmentSessionReport(
                commit_sha=self.VALID_SHA,
                timestamp="2026-09-22T11:49:12Z",
                summary="Too short",
                architecture_impact="Valid architecture impact statement.",
                key_takeaways=["Takeaway"],
                suggested_article_title="Title",
                suggested_article_slug="title-slug",
            )

        with pytest.raises(ValidationError):
            DevelopmentSessionReport(
                commit_sha=self.VALID_SHA,
                timestamp="2026-09-22T11:49:12Z",
                summary="Valid summary with sufficient character count.",
                architecture_impact="Minimal",
                key_takeaways=["Takeaway"],
                suggested_article_title="Title",
                suggested_article_slug="title-slug",
            )

    def test_key_takeaways_validation(self):
        """Verify key_takeaways requires at least 1 non-empty item."""
        with pytest.raises(ValidationError):
            DevelopmentSessionReport(
                commit_sha=self.VALID_SHA,
                timestamp="2026-09-22T11:49:12Z",
                summary="Valid summary with sufficient character count.",
                architecture_impact="Valid architecture impact statement.",
                key_takeaways=[],
                suggested_article_title="Title",
                suggested_article_slug="title-slug",
            )

        with pytest.raises(ValidationError):
            DevelopmentSessionReport(
                commit_sha=self.VALID_SHA,
                timestamp="2026-09-22T11:49:12Z",
                summary="Valid summary with sufficient character count.",
                architecture_impact="Valid architecture impact statement.",
                key_takeaways=["   "],
                suggested_article_title="Title",
                suggested_article_slug="title-slug",
            )

    def test_slug_kebab_case_validation(self):
        """Verify suggested_article_slug strictly enforces valid kebab-case."""
        valid_slugs = [
            "valid-slug",
            "feature-123-update",
            "simple",
            "p2p-pricing-engine-v2",
        ]
        for s in valid_slugs:
            report = DevelopmentSessionReport(
                commit_sha=self.VALID_SHA,
                timestamp="2026-09-22T11:49:12Z",
                summary="Valid summary with sufficient character count.",
                architecture_impact="Valid architecture impact statement.",
                key_takeaways=["Takeaway"],
                suggested_article_title="Title",
                suggested_article_slug=s,
            )
            assert report.suggested_article_slug == s

        invalid_slugs = [
            "Invalid-Uppercase",
            "with spaces in slug",
            "with_underscores",
            "consecutive--hyphens",
            "-leading-hyphen",
            "trailing-hyphen-",
            "special!@#$chars",
        ]
        for s in invalid_slugs:
            with pytest.raises(ValidationError):
                DevelopmentSessionReport(
                    commit_sha=self.VALID_SHA,
                    timestamp="2026-09-22T11:49:12Z",
                    summary="Valid summary with sufficient character count.",
                    architecture_impact="Valid architecture impact statement.",
                    key_takeaways=["Takeaway"],
                    suggested_article_title="Title",
                    suggested_article_slug=s,
                )


# ==============================================================================
# 4. Slugify Helper Tests
# ==============================================================================

class TestSlugifyHelper:
    """Test suite for slugify utility function."""

    def test_slugify_standard_commit_messages(self):
        """Verify slugify transforms commit messages into clean kebab-case slugs."""
        cases = [
            ("feat(orderbook): optimize order book depth", "feat-orderbook-optimize-order-book-depth"),
            ("fix(fifo): correct fractional lot liquidation", "fix-fifo-correct-fractional-lot-liquidation"),
            ("refactor: update models/state_store.py", "refactor-update-models-state-store-py"),
        ]
        for input_text, expected_slug in cases:
            slug = slugify(input_text)
            assert slug == expected_slug
            assert SLUG_REGEX.match(slug)

    def test_slugify_complex_tokens_and_emojis(self):
        """Verify slugify handles quotes, markdown backticks, emojis, and special characters."""
        text = 'feat(ui): add "sweet-spot" badges! #123 [breaking] *important* `code` 🚀'
        slug = slugify(text)
        assert "sweet-spot" in slug
        assert "123" in slug
        assert SLUG_REGEX.match(slug)
        assert not any(c in slug for c in ['"', '!', '#', '[', ']', '*', '`', ' '])

    def test_slugify_empty_and_punctuation_fallbacks(self):
        """Verify slugify returns fallback 'content-update' for empty or symbol-only strings."""
        assert slugify("") == "content-update"
        assert slugify("   ") == "content-update"
        assert slugify("!@#$%^&*()") == "content-update"
        assert slugify("---") == "content-update"


# ==============================================================================
# 5. Serialization, Schema Export & Atomic Persistence Tests
# ==============================================================================

class TestPersistenceAndSchemaExport:
    """Test suite for serialization, schema export, and atomic file saving."""

    VALID_SHA = "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3"

    @pytest.fixture
    def sample_report(self):
        return DevelopmentSessionReport(
            commit_sha=self.VALID_SHA,
            timestamp="2026-09-22T11:49:12Z",
            summary="Automated analysis for commit b2c3d4e: Implement atomic persistence.",
            architecture_impact="Guarantees atomic file updates without data corruption on crash.",
            key_takeaways=[
                "Atomic file write prevents partial writes during unexpected termination.",
                "Pydantic V2 schema validation strictly guarantees contract adherence.",
            ],
            changed_components=["ai_content"],
            suggested_article_title="Ensuring Atomic Persistence in Multi-Agent Pipelines",
            suggested_article_slug="ensuring-atomic-persistence-in-multi-agent-pipelines",
        )

    def test_json_roundtrip_serialization(self, sample_report):
        """Verify model_dump_json and model_validate_json roundtrip cleanly."""
        json_str = sample_report.model_dump_json(indent=2)
        assert isinstance(json_str, str)

        parsed_data = json.loads(json_str)
        assert parsed_data["commit_sha"] == self.VALID_SHA
        assert parsed_data["summary"] == sample_report.summary

        restored_report = DevelopmentSessionReport.model_validate_json(json_str)
        assert restored_report == sample_report

    def test_export_json_schema(self):
        """Verify export_json_schema returns valid Pydantic V2 JSON schema."""
        schema = DevelopmentSessionReport.export_json_schema()
        assert isinstance(schema, dict)
        assert schema.get("type") == "object"
        properties = schema.get("properties", {})
        assert "commit_sha" in properties
        assert "timestamp" in properties
        assert "summary" in properties
        assert "architecture_impact" in properties
        assert "key_takeaways" in properties
        assert "suggested_article_slug" in properties
        required = schema.get("required", [])
        assert "commit_sha" in required
        assert "suggested_article_slug" in required

    def test_atomic_file_saving_and_loading(self, sample_report, tmp_path):
        """Verify to_json_file atomically writes and from_json_file accurately reads."""
        target_path = tmp_path / "analysis" / f"{self.VALID_SHA}.json"

        saved_path = sample_report.to_json_file(target_path, atomic=True)
        assert saved_path == target_path
        assert target_path.is_file()

        temp_files = list(tmp_path.glob("*.tmp*"))
        assert len(temp_files) == 0

        loaded_report = DevelopmentSessionReport.from_json_file(target_path)
        assert loaded_report == sample_report

    def test_from_json_file_missing_raises_filenotfound(self, tmp_path):
        """Verify from_json_file raises FileNotFoundError for missing paths."""
        nonexistent = tmp_path / "nonexistent.json"
        with pytest.raises(FileNotFoundError):
            DevelopmentSessionReport.from_json_file(nonexistent)

    def test_from_json_file_corrupted_raises_validation_error(self, tmp_path):
        """Verify from_json_file raises ValidationError for corrupted/incomplete JSON."""
        corrupt_path = tmp_path / "corrupt.json"
        corrupt_path.write_text('{"commit_sha": "TRUNCATED', encoding="utf-8")

        with pytest.raises(Exception):
            DevelopmentSessionReport.from_json_file(corrupt_path)

    def test_rapid_atomic_overwrites(self, sample_report, tmp_path):
        """Verify rapid sequential atomic overwrites maintain complete file integrity."""
        target_path = tmp_path / "rapid_test.json"
        for i in range(10):
            sample_report.summary = f"Updated summary iteration {i} with sufficient characters."
            sample_report.to_json_file(target_path, atomic=True)
            loaded = DevelopmentSessionReport.from_json_file(target_path)
            assert f"iteration {i}" in loaded.summary


# ==============================================================================
# 6. Live Git Context Collector Tests (Edge Cases & Git Operations)
# ==============================================================================

@pytest.fixture
def git_repo(tmp_path: Path) -> Generator[Path, None, None]:
    """Create a temporary initialized Git repository with default test configuration."""
    repo = tmp_path / "test_repo"
    repo.mkdir()

    env = dict(os.environ)
    env["GIT_AUTHOR_NAME"] = "Test Author"
    env["GIT_AUTHOR_EMAIL"] = "author@example.com"
    env["GIT_COMMITTER_NAME"] = "Test Committer"
    env["GIT_COMMITTER_EMAIL"] = "committer@example.com"

    def run_git(*cmd_args: str) -> str:
        res = subprocess.run(
            ["git", *cmd_args],
            cwd=str(repo),
            capture_output=True,
            text=True,
            check=True,
            env=env,
        )
        return res.stdout.strip()

    run_git("init")
    run_git("config", "user.name", "Test Author")
    run_git("config", "user.email", "author@example.com")
    run_git("config", "commit.gpgsign", "false")

    yield repo


class TestLiveGitContextCollector:
    """Live Git repository test suite verifying collect_git_context on all edge cases."""

    def test_collect_context_root_commit(self, git_repo: Path):
        """Verify root (initial) commit extraction: diffs against empty tree, parents == []."""
        file_a = git_repo / "initial.txt"
        file_a.write_text("Hello, world!\nSecond line.\n", encoding="utf-8")

        subprocess.run(["git", "add", "initial.txt"], cwd=str(git_repo), check=True)
        subprocess.run(["git", "commit", "-m", "Initial root commit\n\nFull description."], cwd=str(git_repo), check=True)

        root_sha = subprocess.run(["git", "rev-parse", "HEAD"], cwd=str(git_repo), capture_output=True, text=True, check=True).stdout.strip()

        ctx = collect_git_context(root_sha, repo_root=git_repo)

        assert ctx.sha == root_sha
        assert ctx.parent_shas == []
        assert ctx.is_root_commit is True
        assert ctx.is_merge is False
        assert ctx.message_subject == "Initial root commit"
        assert "Full description." in ctx.message_body
        assert len(ctx.changed_files) == 1
        assert ctx.changed_files[0].filename == "initial.txt"
        assert ctx.changed_files[0].status == "A"
        assert ctx.changed_files[0].additions == 2
        assert ctx.changed_files[0].deletions == 0
        assert "diff --git a/initial.txt b/initial.txt" in ctx.diff
        assert "+Hello, world!" in ctx.diff

    def test_collect_context_merge_commit(self, git_repo: Path):
        """Verify merge commit extraction: detects parents, includes [MERGE COMMIT CONTEXT] banner."""
        # 1. Initial commit on master
        (git_repo / "base.txt").write_text("base\n", encoding="utf-8")
        subprocess.run(["git", "add", "base.txt"], cwd=str(git_repo), check=True)
        subprocess.run(["git", "commit", "-m", "base commit"], cwd=str(git_repo), check=True)

        # 2. Feature branch
        subprocess.run(["git", "checkout", "-b", "feature"], cwd=str(git_repo), check=True)
        (git_repo / "feature.txt").write_text("feature content\n", encoding="utf-8")
        subprocess.run(["git", "add", "feature.txt"], cwd=str(git_repo), check=True)
        subprocess.run(["git", "commit", "-m", "add feature"], cwd=str(git_repo), check=True)

        # 3. Master branch commit
        subprocess.run(["git", "checkout", "master"], cwd=str(git_repo), check=True)
        (git_repo / "master.txt").write_text("master content\n", encoding="utf-8")
        subprocess.run(["git", "add", "master.txt"], cwd=str(git_repo), check=True)
        subprocess.run(["git", "commit", "-m", "master update"], cwd=str(git_repo), check=True)

        # 4. Merge feature into master
        subprocess.run(["git", "merge", "--no-ff", "-m", "Merge branch 'feature'", "feature"], cwd=str(git_repo), check=True)
        merge_sha = subprocess.run(["git", "rev-parse", "HEAD"], cwd=str(git_repo), capture_output=True, text=True, check=True).stdout.strip()

        ctx = collect_git_context(merge_sha, repo_root=git_repo)

        assert ctx.sha == merge_sha
        assert ctx.is_merge is True
        assert len(ctx.parent_shas) == 2
        assert "[MERGE COMMIT CONTEXT]" in ctx.diff
        assert "Target Branch Parent (Parent 1):" in ctx.diff
        assert any(f.filename == "feature.txt" for f in ctx.changed_files)

    def test_collect_context_empty_commit(self, git_repo: Path):
        """Verify empty commit (git commit --allow-empty): changed_files == [], diff == ''."""
        (git_repo / "init.txt").write_text("init\n", encoding="utf-8")
        subprocess.run(["git", "add", "init.txt"], cwd=str(git_repo), check=True)
        subprocess.run(["git", "commit", "-m", "initial commit"], cwd=str(git_repo), check=True)

        subprocess.run(["git", "commit", "--allow-empty", "-m", "chore: trigger empty checkpoint"], cwd=str(git_repo), check=True)
        empty_sha = subprocess.run(["git", "rev-parse", "HEAD"], cwd=str(git_repo), capture_output=True, text=True, check=True).stdout.strip()

        ctx = collect_git_context(empty_sha, repo_root=git_repo)

        assert ctx.sha == empty_sha
        assert ctx.is_empty_commit is True
        assert ctx.changed_files == []
        assert ctx.diff == ""

    def test_collect_context_detached_head(self, git_repo: Path):
        """Verify detached HEAD state resolves canonical commit SHA cleanly."""
        (git_repo / "file1.txt").write_text("1\n", encoding="utf-8")
        subprocess.run(["git", "add", "file1.txt"], cwd=str(git_repo), check=True)
        subprocess.run(["git", "commit", "-m", "first"], cwd=str(git_repo), check=True)
        sha1 = subprocess.run(["git", "rev-parse", "HEAD"], cwd=str(git_repo), capture_output=True, text=True, check=True).stdout.strip()

        (git_repo / "file2.txt").write_text("2\n", encoding="utf-8")
        subprocess.run(["git", "add", "file2.txt"], cwd=str(git_repo), check=True)
        subprocess.run(["git", "commit", "-m", "second"], cwd=str(git_repo), check=True)

        # Detach to sha1
        subprocess.run(["git", "checkout", "--detach", sha1], cwd=str(git_repo), check=True)

        ctx = collect_git_context("HEAD", repo_root=git_repo)
        assert ctx.sha == sha1
        assert ctx.message_subject == "first"

    def test_collect_context_large_diff_truncation(self, git_repo: Path):
        """Verify large diff is truncated cleanly at line boundary with summary banner."""
        (git_repo / "base.txt").write_text("base\n", encoding="utf-8")
        subprocess.run(["git", "add", "base.txt"], cwd=str(git_repo), check=True)
        subprocess.run(["git", "commit", "-m", "base"], cwd=str(git_repo), check=True)

        # Generate large file: 1,000 lines (~40,000 characters)
        lines = [f"const variable_{i} = 'some long string content number {i}';\n" for i in range(1000)]
        (git_repo / "huge.js").write_text("".join(lines), encoding="utf-8")
        subprocess.run(["git", "add", "huge.js"], cwd=str(git_repo), check=True)
        subprocess.run(["git", "commit", "-m", "add huge file"], cwd=str(git_repo), check=True)
        huge_sha = subprocess.run(["git", "rev-parse", "HEAD"], cwd=str(git_repo), capture_output=True, text=True, check=True).stdout.strip()

        # Request truncation at 2,000 chars and 50 lines
        ctx = collect_git_context(huge_sha, max_diff_chars=2000, max_diff_lines=50, repo_root=git_repo)

        assert "[DIFF TRUNCATED: Exceeded LLM Context Threshold]" in ctx.diff
        assert "Thresholds: max 2,000 characters / max 50 lines" in ctx.diff
        assert len(ctx.diff) <= 3000

    def test_collect_context_binary_file(self, git_repo: Path):
        """Verify binary file modifications record additions=0, deletions=0, is_binary=True."""
        (git_repo / "base.txt").write_text("base\n", encoding="utf-8")
        subprocess.run(["git", "add", "base.txt"], cwd=str(git_repo), check=True)
        subprocess.run(["git", "commit", "-m", "base"], cwd=str(git_repo), check=True)

        # Write binary asset
        binary_data = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        (git_repo / "icon.png").write_bytes(binary_data)
        subprocess.run(["git", "add", "icon.png"], cwd=str(git_repo), check=True)
        subprocess.run(["git", "commit", "-m", "add binary icon"], cwd=str(git_repo), check=True)
        bin_sha = subprocess.run(["git", "rev-parse", "HEAD"], cwd=str(git_repo), capture_output=True, text=True, check=True).stdout.strip()

        ctx = collect_git_context(bin_sha, repo_root=git_repo)

        assert len(ctx.changed_files) == 1
        bin_file = ctx.changed_files[0]
        assert bin_file.filename == "icon.png"
        assert bin_file.is_binary is True
        assert bin_file.additions == 0
        assert bin_file.deletions == 0

    def test_collect_context_rename_file(self, git_repo: Path):
        """Verify renamed file is tracked with status 'R' and old_filename."""
        (git_repo / "old_name.txt").write_text("renamed content\n", encoding="utf-8")
        subprocess.run(["git", "add", "old_name.txt"], cwd=str(git_repo), check=True)
        subprocess.run(["git", "commit", "-m", "add old name"], cwd=str(git_repo), check=True)

        subprocess.run(["git", "mv", "old_name.txt", "new_name.txt"], cwd=str(git_repo), check=True)
        subprocess.run(["git", "commit", "-m", "rename old to new"], cwd=str(git_repo), check=True)
        rename_sha = subprocess.run(["git", "rev-parse", "HEAD"], cwd=str(git_repo), capture_output=True, text=True, check=True).stdout.strip()

        ctx = collect_git_context(rename_sha, repo_root=git_repo)

        assert len(ctx.changed_files) == 1
        rename_file = ctx.changed_files[0]
        assert rename_file.status_code == "R"
        assert rename_file.filename == "new_name.txt"
        assert rename_file.old_filename == "old_name.txt"

    def test_collect_context_nonexistent_sha_raises_not_found(self, git_repo: Path):
        """Verify non-existent 40-character SHA raises GitCommitNotFoundError."""
        (git_repo / "base.txt").write_text("base\n", encoding="utf-8")
        subprocess.run(["git", "add", "base.txt"], cwd=str(git_repo), check=True)
        subprocess.run(["git", "commit", "-m", "base"], cwd=str(git_repo), check=True)

        fake_sha = "0000000000000000000000000000000000000000"
        with pytest.raises(GitCommitNotFoundError):
            collect_git_context(fake_sha, repo_root=git_repo)

    def test_collect_context_malformed_ref_raises_not_found(self, git_repo: Path):
        """Verify malformed reference string raises GitCommitNotFoundError."""
        with pytest.raises(GitCommitNotFoundError):
            collect_git_context("invalid..branch@#$!*", repo_root=git_repo)

    def test_resolve_commit_sha_verify_exists(self, git_repo: Path):
        """Verify resolve_commit_sha verify_exists flag distinguishes format check from existence."""
        fake_sha = "1234567890abcdef1234567890abcdef12345678"

        # verify_exists=False returns formatted string
        assert resolve_commit_sha(fake_sha, repo_root=git_repo, verify_exists=False) == fake_sha

        # verify_exists=True verifies object in git database and raises error
        with pytest.raises(GitCommitNotFoundError):
            resolve_commit_sha(fake_sha, repo_root=git_repo, verify_exists=True)
