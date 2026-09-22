/**
 * Tier 3: Cross-Feature Combinations — CLI Subcommands
 * Tests:
 * - ai:content install-hook (creation of post-commit hook script with executable permissions)
 * - ai:content status (reports repository status, hook status, analysis count)
 * - Idempotency of install-hook
 */

const { globalContext } = require('../../harness/test-runner');
const { assert } = require('../../harness/assertions');
const { createTestRepo } = require('../harness/git-test-helper');
const { invokeCli } = require('../harness/cli-invoker');
const path = require('path');
const fs = require('fs');

globalContext.describe('[Tier 3] AI Content — CLI Subcommands (install-hook & status)', () => {
  let repo;

  globalContext.beforeEach(() => {
    repo = createTestRepo('t3_subcommands');
  });

  globalContext.afterEach(() => {
    if (repo) repo.cleanup();
  });

  globalContext.it('2.1: install-hook creates executable .git/hooks/post-commit script', () => {
    const hookPath = path.join(repo.repoPath, '.git', 'hooks', 'post-commit');
    assert.ok(!fs.existsSync(hookPath), 'Hook must not exist initially');

    const res = invokeCli(repo.repoPath, ['install-hook']);
    assert.strictEqual(res.exitCode, 0, `install-hook should succeed. stderr: ${res.stderr}`);

    assert.ok(fs.existsSync(hookPath), 'post-commit hook must exist after installation');
    const content = fs.readFileSync(hookPath, 'utf8');
    assert.match(content, /^#!\/bin\/sh/, 'Hook must be a POSIX shell script');
    assert.includes(content, 'GIT_INDEX_FILE', 'Hook must unset GIT_INDEX_FILE');
    assert.includes(content, 'nohup', 'Hook must use nohup for non-blocking execution');
  });

  globalContext.it('2.2: status reports hook status and analysis count correctly', () => {
    // Initial status: hook not installed, 0 analyses
    const res1 = invokeCli(repo.repoPath, ['status']);
    assert.strictEqual(res1.exitCode, 0);
    assert.includes(res1.stdout, 'Hook Installed:  No');
    assert.includes(res1.stdout, 'Analyses Count:  0');

    // Install hook
    invokeCli(repo.repoPath, ['install-hook']);

    // Generate 1 analysis
    const sha = repo.makeCommit('feat(test): add sample feature', { 'sample.txt': 'hello' });
    invokeCli(repo.repoPath, ['generate', sha]);

    // Updated status: hook installed, 1 analysis
    const res2 = invokeCli(repo.repoPath, ['status']);
    assert.strictEqual(res2.exitCode, 0);
    assert.includes(res2.stdout, 'Hook Installed:  Yes');
    assert.includes(res2.stdout, 'Analyses Count:  1');
    assert.includes(res2.stdout, sha);
  });

  globalContext.it('2.3: install-hook is idempotent and safe to run repeatedly', () => {
    const run1 = invokeCli(repo.repoPath, ['install-hook']);
    assert.strictEqual(run1.exitCode, 0);

    const run2 = invokeCli(repo.repoPath, ['install-hook']);
    assert.strictEqual(run2.exitCode, 0);

    const hookPath = path.join(repo.repoPath, '.git', 'hooks', 'post-commit');
    assert.ok(fs.existsSync(hookPath));
  });
}, { tier: 3, category: 'CLI Subcommands' });
