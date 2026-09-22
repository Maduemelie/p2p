/**
 * Tier 2: Boundary & Corner Cases — Duplicate Execution Skipping
 * Verifies R4 / Acceptance Criteria:
 * "Running the command twice for the same commit skips the CrewAI generation on the second run."
 */

const { globalContext } = require('../../harness/test-runner');
const { assert } = require('../../harness/assertions');
const { createTestRepo } = require('../harness/git-test-helper');
const { invokeCli } = require('../harness/cli-invoker');
const path = require('path');
const fs = require('fs');

globalContext.describe('[Tier 2] AI Content — Duplicate Commit Skipping', () => {
  let repo;

  globalContext.beforeEach(() => {
    repo = createTestRepo('t2_duplicate');
  });

  globalContext.afterEach(() => {
    if (repo) repo.cleanup();
  });

  globalContext.it('1.1: Running generation twice for same commit skips on second run', () => {
    const sha = repo.makeCommit('feat(store): initialize persistent indexeddb layer', {
      'src/store.js': '// indexeddb store'
    });

    // Run 1: initial generation
    const run1 = invokeCli(repo.repoPath, ['generate', sha]);
    assert.strictEqual(run1.exitCode, 0, 'First run must succeed');

    // Run 2: duplicate generation without --force
    const run2 = invokeCli(repo.repoPath, ['generate', sha]);
    assert.strictEqual(run2.exitCode, 0, 'Second run must also exit 0 (clean skip)');
    assert.includes(run2.stdout.toLowerCase(), 'skip', 'Second run stdout must indicate skipping');
  });

  globalContext.it('1.2: Duplicate skipping executes fast (bypasses heavy pipeline generation)', () => {
    const sha = repo.makeCommit('fix(rate): prevent zero rate division', {
      'src/rate.js': '// rate calculation'
    });

    const run1 = invokeCli(repo.repoPath, ['generate', sha]);
    assert.strictEqual(run1.exitCode, 0);

    // Second run should bypass LLM and return rapidly
    const run2 = invokeCli(repo.repoPath, ['generate', sha]);
    assert.strictEqual(run2.exitCode, 0);
    assert.includes(run2.stdout.toLowerCase(), 'skip');
    assert.isBelow(run2.durationMs, 5000, `Duplicate bypass should complete quickly, took ${run2.durationMs}ms`);
  });

  globalContext.it('1.3: Existing analysis file mtime is strictly preserved on duplicate skip', () => {
    const sha = repo.makeCommit('feat(limits): compute optimal order size limits', {
      'src/limits.js': '// limits'
    });

    invokeCli(repo.repoPath, ['generate', sha]);
    const analysisFile = path.join(repo.repoPath, 'content', 'analysis', `${sha}.json`);
    const initialMtime = fs.statSync(analysisFile).mtimeMs;

    // Small delay to ensure any touch would change mtime
    const endSleep = Date.now() + 50;
    while (Date.now() < endSleep) {}

    invokeCli(repo.repoPath, ['generate', sha]);
    const secondMtime = fs.statSync(analysisFile).mtimeMs;

    assert.strictEqual(secondMtime, initialMtime, 'Analysis file mtime must not change when generation is skipped');
  });

  globalContext.it('1.4: Output message informs user that generation was skipped and mentions --force', () => {
    const sha = repo.makeCommit('feat(export): add csv transaction export', {
      'src/export.js': '// csv export'
    });

    invokeCli(repo.repoPath, ['generate', sha]);
    const run2 = invokeCli(repo.repoPath, ['generate', sha]);

    assert.includes(run2.stdout, sha);
    assert.includes(run2.stdout, '--force');
  });

  globalContext.it('1.5: Duplicate skipping works identically across SHA aliases (HEAD vs full SHA)', () => {
    const sha = repo.makeCommit('perf(render): memoize sweet spot cards', {
      'src/cards.js': '// memoized cards'
    });

    // Generate using full SHA
    const run1 = invokeCli(repo.repoPath, ['generate', sha]);
    assert.strictEqual(run1.exitCode, 0);

    // Skip using HEAD
    const run2 = invokeCli(repo.repoPath, ['generate', 'HEAD']);
    assert.strictEqual(run2.exitCode, 0);
    assert.includes(run2.stdout.toLowerCase(), 'skip');

    // Skip using short SHA
    const run3 = invokeCli(repo.repoPath, ['generate', sha.slice(0, 7)]);
    assert.strictEqual(run3.exitCode, 0);
    assert.includes(run3.stdout.toLowerCase(), 'skip');
  });
}, { tier: 2, category: 'Duplicate Skipping' });
