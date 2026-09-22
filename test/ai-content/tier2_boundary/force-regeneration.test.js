/**
 * Tier 2: Boundary & Corner Cases — Force Execution Override
 * Verifies R4 / Acceptance Criteria:
 * "Skip generation if content/analysis/<sha>.json exists unless a --force flag is passed."
 */

const { globalContext } = require('../../harness/test-runner');
const { assert } = require('../../harness/assertions');
const { createTestRepo } = require('../harness/git-test-helper');
const { invokeCli } = require('../harness/cli-invoker');
const path = require('path');
const fs = require('fs');

globalContext.describe('[Tier 2] AI Content — Force Execution Override', () => {
  let repo;

  globalContext.beforeEach(() => {
    repo = createTestRepo('t2_force');
  });

  globalContext.afterEach(() => {
    if (repo) repo.cleanup();
  });

  globalContext.it('2.1: Running with --force bypasses duplicate skipping and regenerates content', () => {
    const sha = repo.makeCommit('feat(p2p): integrate multi-bank settlement options', {
      'src/settlement.js': '// settlement'
    });

    // Run 1
    invokeCli(repo.repoPath, ['generate', sha]);
    const analysisFile = path.join(repo.repoPath, 'content', 'analysis', `${sha}.json`);
    assert.ok(fs.existsSync(analysisFile));

    // Run 2 with --force
    const run2 = invokeCli(repo.repoPath, ['generate', sha, '--force']);
    assert.strictEqual(run2.exitCode, 0, `Forced run should exit 0, got ${run2.exitCode}. stderr: ${run2.stderr}`);
    assert.doesNotMatch(run2.stdout.toLowerCase(), /skipping generation/i, 'Forced run must not report skipping');
  });

  globalContext.it('2.2: Running with short flag -f overrides duplicate skipping identically to --force', () => {
    const sha = repo.makeCommit('feat(sync): add background ledger synchronization', {
      'src/sync.js': '// ledger sync'
    });

    invokeCli(repo.repoPath, ['generate', sha]);

    const run2 = invokeCli(repo.repoPath, ['generate', sha, '-f']);
    assert.strictEqual(run2.exitCode, 0);
    assert.doesNotMatch(run2.stdout.toLowerCase(), /skipping generation/i);
  });

  globalContext.it('2.3: Forced regeneration updates file mtimeMs to reflect fresh write', () => {
    const sha = repo.makeCommit('fix(rounding): round naira amounts to 2 decimal places', {
      'src/rounding.js': '// rounding fix'
    });

    invokeCli(repo.repoPath, ['generate', sha]);
    const analysisFile = path.join(repo.repoPath, 'content', 'analysis', `${sha}.json`);
    const initialMtime = fs.statSync(analysisFile).mtimeMs;

    // Small delay to ensure timestamp difference
    const endSleep = Date.now() + 60;
    while (Date.now() < endSleep) {}

    invokeCli(repo.repoPath, ['generate', sha, '--force']);
    const forcedMtime = fs.statSync(analysisFile).mtimeMs;

    assert.ok(forcedMtime > initialMtime, `Forced run must update mtime (${forcedMtime} > ${initialMtime})`);
  });

  globalContext.it('2.4: Forced regeneration overwrites modified or corrupted existing markdown files', () => {
    const sha = repo.makeCommit('feat(alert): notify user on spread compression', {
      'src/alert.js': '// spread compression alert'
    });

    invokeCli(repo.repoPath, ['generate', sha]);

    // Intentionally corrupt an output article
    const articlesDir = path.join(repo.repoPath, 'content', 'articles');
    const articleFiles = fs.readdirSync(articlesDir).filter(f => f.startsWith(sha));
    assert.strictEqual(articleFiles.length, 1);
    const articlePath = path.join(articlesDir, articleFiles[0]);

    fs.writeFileSync(articlePath, 'CORRUPTED_MANUAL_EDIT', 'utf8');

    // Run with --force
    const res = invokeCli(repo.repoPath, ['generate', sha, '--force']);
    assert.strictEqual(res.exitCode, 0);

    const recoveredContent = fs.readFileSync(articlePath, 'utf8');
    assert.notStrictEqual(recoveredContent, 'CORRUPTED_MANUAL_EDIT', 'Forced run must restore generated content');
    assert.match(recoveredContent, /^#\s+/m, 'Recovered content must be valid markdown article');
  });

  globalContext.it('2.5: Flag position flexibility (generate --force <sha> vs generate <sha> --force)', () => {
    const sha = repo.makeCommit('refactor(audit): clean up unused calculation functions', {
      'src/clean.js': '// clean'
    });

    invokeCli(repo.repoPath, ['generate', sha]);

    // Pass flag before commit ref
    const res = invokeCli(repo.repoPath, ['generate', '--force', sha]);
    assert.strictEqual(res.exitCode, 0);
    assert.doesNotMatch(res.stdout.toLowerCase(), /skipping generation/i);
  });
}, { tier: 2, category: 'Force Regeneration' });
