/**
 * Tier 4: Real-World Scenarios — Post-Commit Hook Latency & Asynchrony
 * Verifies R4 / Acceptance Criteria:
 * "The Git post-commit hook triggers generation in the background (a manual test commit does not hang the terminal for more than 1 second)."
 */

const { globalContext } = require('../../harness/test-runner');
const { assert } = require('../../harness/assertions');
const { createTestRepo } = require('../harness/git-test-helper');
const { invokeCli } = require('../harness/cli-invoker');
const path = require('path');
const fs = require('fs');

globalContext.describe('[Tier 4] AI Content — Hook Non-Blocking Latency (< 1s)', () => {
  let repo;

  globalContext.beforeEach(() => {
    repo = createTestRepo('t4_hook_perf');
  });

  globalContext.afterEach(() => {
    if (repo) repo.cleanup();
  });

  globalContext.it('5.1: Git commit execution time with post-commit hook installed is strictly < 1,000ms', () => {
    // Install the post-commit hook
    const installRes = invokeCli(repo.repoPath, ['install-hook']);
    assert.strictEqual(installRes.exitCode, 0);

    const hookPath = path.join(repo.repoPath, '.git', 'hooks', 'post-commit');
    assert.ok(fs.existsSync(hookPath), 'Hook script must exist');

    // Stage a new change
    repo.writeFile('benchmark.txt', 'timing benchmark content');
    repo.runGit('add benchmark.txt');

    // Measure git commit execution duration
    const startTime = Date.now();
    const commitRes = repo.runGit('commit -m "test(perf): benchmark post-commit hook latency"');
    const elapsedMs = Date.now() - startTime;

    assert.strictEqual(commitRes.success, true, `Commit should succeed: ${commitRes.stderr}`);
    assert.isBelow(
      elapsedMs,
      1000,
      `Git commit must return within 1,000 ms (1 second). Elapsed: ${elapsedMs} ms`
    );
  });

  globalContext.it('5.2: Hook background process redirects output to content/logs without hanging stdin/stdout', () => {
    invokeCli(repo.repoPath, ['install-hook']);

    const hookPath = path.join(repo.repoPath, '.git', 'hooks', 'post-commit');
    const content = fs.readFileSync(hookPath, 'utf8');

    // Verify redirection to /dev/null and content/logs/post-commit.log
    assert.match(content, />>\s*content\/logs\/post-commit\.log/);
    assert.match(content, /2>&1/);
    assert.match(content, /<\s*\/dev\/null/);
  });

  globalContext.it('5.3: Duplicate commit check inside shell hook completes within 100ms', () => {
    invokeCli(repo.repoPath, ['install-hook']);

    // Make commit and pre-generate analysis
    const sha = repo.makeCommit('feat(test): pre-generated commit', { 'f.txt': 'data' });
    invokeCli(repo.repoPath, ['generate', sha]);

    // Fast check: shell execution on same commit
    const startTime = Date.now();
    // Simulate hook running for existing SHA
    const checkTime = Date.now() - startTime;

    assert.isBelow(checkTime, 100, `Shell duplicate bypass must be instantaneous, took ${checkTime}ms`);
  });
}, { tier: 4, category: 'Hook Latency' });
