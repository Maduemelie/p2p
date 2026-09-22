/**
 * Tier 3: Cross-Feature Combinations — Post-Commit Hook & Duplicate Protection Integration
 * Tests dual-layer duplicate checking:
 * 1. Fast check in shell hook
 * 2. Secondary check in CLI pipeline
 */

const { globalContext } = require('../../harness/test-runner');
const { assert } = require('../../harness/assertions');
const { createTestRepo } = require('../harness/git-test-helper');
const { invokeCli } = require('../harness/cli-invoker');
const path = require('path');
const fs = require('fs');

globalContext.describe('[Tier 3] AI Content — Hook & Duplicate Protection Integration', () => {
  let repo;

  globalContext.beforeEach(() => {
    repo = createTestRepo('t3_hook_dup');
  });

  globalContext.afterEach(() => {
    if (repo) repo.cleanup();
  });

  globalContext.it('3.1: Post-commit hook shell script includes fast-path duplicate check', () => {
    invokeCli(repo.repoPath, ['install-hook']);

    const hookPath = path.join(repo.repoPath, '.git', 'hooks', 'post-commit');
    const content = fs.readFileSync(hookPath, 'utf8');

    // The shell hook must check for existing analysis file before launching heavy background process
    assert.includes(content, 'content/analysis/${COMMIT_SHA}.json');
    assert.includes(content, 'exit 0');
  });

  globalContext.it('3.2: Hook properly unsets GIT_INDEX_FILE to avoid index lock collisions', () => {
    invokeCli(repo.repoPath, ['install-hook']);

    const hookPath = path.join(repo.repoPath, '.git', 'hooks', 'post-commit');
    const content = fs.readFileSync(hookPath, 'utf8');

    assert.includes(content, 'unset GIT_INDEX_FILE');
  });

  globalContext.it('3.3: Hook directs background logs to content/logs/post-commit.log', () => {
    invokeCli(repo.repoPath, ['install-hook']);

    const hookPath = path.join(repo.repoPath, '.git', 'hooks', 'post-commit');
    const content = fs.readFileSync(hookPath, 'utf8');

    assert.includes(content, 'content/logs/post-commit.log');
  });

  globalContext.it('3.4: Handles sequential commits cleanly with hook installed', () => {
    invokeCli(repo.repoPath, ['install-hook']);

    const sha1 = repo.makeCommit('feat(seq): commit one', { 'seq1.txt': '1' });
    const sha2 = repo.makeCommit('feat(seq): commit two', { 'seq2.txt': '2' });

    assert.notStrictEqual(sha1, sha2);

    // Both can be generated independently
    const res1 = invokeCli(repo.repoPath, ['generate', sha1]);
    const res2 = invokeCli(repo.repoPath, ['generate', sha2]);

    assert.strictEqual(res1.exitCode, 0);
    assert.strictEqual(res2.exitCode, 0);

    assert.ok(fs.existsSync(path.join(repo.repoPath, 'content', 'analysis', `${sha1}.json`)));
    assert.ok(fs.existsSync(path.join(repo.repoPath, 'content', 'analysis', `${sha2}.json`)));
  });
}, { tier: 3, category: 'Hook Integration' });
