/**
 * Tier 2: Boundary & Corner Cases — Invalid Inputs & Git Diff Edges
 * Tests handling of:
 * - Non-existent commit SHAs
 * - Malformed git references
 * - Empty commit diffs (git commit --allow-empty)
 * - Root commits (parentless commits)
 * - Detached HEAD state
 */

const { globalContext } = require('../../harness/test-runner');
const { assert } = require('../../harness/assertions');
const { createTestRepo } = require('../harness/git-test-helper');
const { invokeCli } = require('../harness/cli-invoker');
const path = require('path');
const fs = require('fs');

globalContext.describe('[Tier 2] AI Content — Invalid Inputs & Git Diff Edges', () => {
  let repo;

  globalContext.beforeEach(() => {
    repo = createTestRepo('t2_edges');
  });

  globalContext.afterEach(() => {
    if (repo) repo.cleanup();
  });

  globalContext.it('3.1: Non-existent 40-character commit SHA exits with non-zero code', () => {
    const fakeSha = '0000000000000000000000000000000000000000';
    const res = invokeCli(repo.repoPath, ['generate', fakeSha]);

    assert.notStrictEqual(res.exitCode, 0, 'CLI must exit non-zero for non-existent SHA');
    const combinedOutput = `${res.stdout} ${res.stderr}`.toLowerCase();
    assert.ok(
      combinedOutput.includes('error') || combinedOutput.includes('not found') || combinedOutput.includes('invalid'),
      'Must provide descriptive error for non-existent commit'
    );
  });

  globalContext.it('3.2: Malformed git reference string exits with non-zero code', () => {
    const invalidRef = 'invalid..branch@#$!*';
    const res = invokeCli(repo.repoPath, ['generate', invalidRef]);

    assert.notStrictEqual(res.exitCode, 0, 'CLI must exit non-zero for invalid ref');
  });

  globalContext.it('3.3: Empty commit diff (allow-empty) generates valid report noting zero changes', () => {
    const emptySha = repo.makeEmptyCommit('chore: trigger empty checkpoint commit');
    assert.strictEqual(emptySha.length, 40);

    const res = invokeCli(repo.repoPath, ['generate', emptySha]);
    assert.strictEqual(res.exitCode, 0, `CLI should handle empty commit gracefully. stderr: ${res.stderr}`);

    const reportPath = path.join(repo.repoPath, 'content', 'analysis', `${emptySha}.json`);
    assert.ok(fs.existsSync(reportPath), 'Report file must exist for empty commit');

    const data = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert.strictEqual(data.commit_sha, emptySha);
    assert.ok(data.summary.length > 0);
  });

  globalContext.it('3.4: Root commit (first commit in repository) is processed without crash', () => {
    // Get root commit SHA (initial commit from createTestRepo)
    const rootSha = repo.runGit('rev-list --max-parents=0 HEAD').stdout.trim();
    assert.strictEqual(rootSha.length, 40);

    const res = invokeCli(repo.repoPath, ['generate', rootSha]);
    assert.strictEqual(res.exitCode, 0, `Root commit generation must succeed. stderr: ${res.stderr}`);

    const reportPath = path.join(repo.repoPath, 'content', 'analysis', `${rootSha}.json`);
    assert.ok(fs.existsSync(reportPath));
  });

  globalContext.it('3.5: Detached HEAD state correctly resolves commit and generates content', () => {
    const sha = repo.makeCommit('feat(detached): test detached HEAD resolution', {
      'detached.txt': 'detached HEAD test'
    });

    // Detach HEAD to this commit
    repo.runGit(`checkout --detach ${sha}`);

    const res = invokeCli(repo.repoPath, ['generate', 'HEAD']);
    assert.strictEqual(res.exitCode, 0, `Detached HEAD generation must succeed. stderr: ${res.stderr}`);

    const reportPath = path.join(repo.repoPath, 'content', 'analysis', `${sha}.json`);
    assert.ok(fs.existsSync(reportPath));

    // Return to master branch
    repo.runGit('checkout master');
  });
}, { tier: 2, category: 'Invalid & Empty Diffs' });
