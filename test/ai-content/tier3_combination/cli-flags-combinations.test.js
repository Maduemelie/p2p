/**
 * Tier 3: Cross-Feature Combinations — CLI Flag Combinations
 * Tests interactions between commit ref formats, flags, and help menus.
 */

const { globalContext } = require('../../harness/test-runner');
const { assert } = require('../../harness/assertions');
const { createTestRepo } = require('../harness/git-test-helper');
const { invokeCli } = require('../harness/cli-invoker');
const path = require('path');
const fs = require('fs');

globalContext.describe('[Tier 3] AI Content — CLI Flag Combinations & Parsing', () => {
  let repo;

  globalContext.beforeEach(() => {
    repo = createTestRepo('t3_flags');
  });

  globalContext.afterEach(() => {
    if (repo) repo.cleanup();
  });

  globalContext.it('1.1: Displays usage and subcommands when --help is passed', () => {
    const res = invokeCli(repo.repoPath, ['--help']);
    assert.strictEqual(res.exitCode, 0);
    assert.includes(res.stdout, 'generate');
    assert.includes(res.stdout, 'install-hook');
    assert.includes(res.stdout, 'status');
  });

  globalContext.it('1.2: Exits with non-zero code on unrecognized options', () => {
    const res = invokeCli(repo.repoPath, ['generate', 'HEAD', '--non-existent-option']);
    assert.notStrictEqual(res.exitCode, 0);
    assert.includes(`${res.stdout} ${res.stderr}`.toLowerCase(), 'unknown');
  });

  globalContext.it('1.3: Combines relative ref HEAD~1 with --force flag', () => {
    const sha1 = repo.makeCommit('feat(m1): commit 1', { 'file1.txt': '1' });
    repo.makeCommit('feat(m2): commit 2', { 'file2.txt': '2' });

    // Pre-generate
    invokeCli(repo.repoPath, ['generate', 'HEAD~1']);
    const analysisFile = path.join(repo.repoPath, 'content', 'analysis', `${sha1}.json`);
    const initialMtime = fs.statSync(analysisFile).mtimeMs;

    const sleepEnd = Date.now() + 50;
    while (Date.now() < sleepEnd) {}

    // Regenerate with relative ref and --force
    const res = invokeCli(repo.repoPath, ['generate', 'HEAD~1', '--force']);
    assert.strictEqual(res.exitCode, 0);

    const updatedMtime = fs.statSync(analysisFile).mtimeMs;
    assert.ok(updatedMtime > initialMtime);
  });

  globalContext.it('1.4: Combines short SHA with -f flag', () => {
    const sha = repo.makeCommit('feat(m3): commit 3', { 'file3.txt': '3' });
    const shortSha = sha.slice(0, 7);

    invokeCli(repo.repoPath, ['generate', shortSha]);
    const res = invokeCli(repo.repoPath, ['generate', shortSha, '-f']);
    assert.strictEqual(res.exitCode, 0);
    assert.doesNotMatch(res.stdout.toLowerCase(), /skipping generation/i);
  });
}, { tier: 3, category: 'CLI Combinations' });
