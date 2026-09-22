"""Shared pytest fixtures for ai_content test suite.

Provides git_repo fixture for testing Git operations, commit extraction,
and CLI behavior in isolated temporary Git repositories.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Generator

import pytest


@pytest.fixture
def git_repo(tmp_path: Path) -> Generator[Path, None, None]:
    """Create a temporary initialized Git repository with default test configuration."""
    repo = tmp_path / "test_repo"
    repo.mkdir(parents=True, exist_ok=True)

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
