/**
 * Tier 4: Real-World Scenarios — End-to-End Application Scenarios
 * Simulates real developer workflows:
 * - Scenario 1: Standard feature commit generating all 4 files end-to-end
 * - Scenario 2: Duplicate commit detection and skip
 * - Scenario 3: Forced regeneration of an existing commit
 * - Scenario 4: Complex multi-file commit with modified, added, and deleted files
 * - Scenario 5: Merge commit handling across branches
 */

const { globalContext } = require('../../harness/test-runner');
const { assert } = require('../../harness/assertions');
const { createTestRepo } = require('../harness/git-test-helper');
const { invokeCli } = require('../harness/cli-invoker');
const { validateSessionReport, validateTechnicalArticle, validateDevJournal, validateSocialThread } = require('../harness/schema-validator');
const path = require('path');
const fs = require('fs');

globalContext.describe('[Tier 4] AI Content — Real-World Application Workflows', () => {
  let repo;

  globalContext.beforeEach(() => {
    repo = createTestRepo('t4_workflow');
  });

  globalContext.afterEach(() => {
    if (repo) repo.cleanup();
  });

  globalContext.it('4.1: Scenario 1 — Standard feature commit generates all 4 deliverables end-to-end', () => {
    const sha = repo.makeCommit('feat(pricing): implement sweet spot pricing calculations', {
      'js/pricingEngine.js': '// Sweet spot pricing engine\nexport function calcSweetSpot() { return 1500; }',
      'js/views/pricing.view.js': '// Sweet spot view UI\nexport function renderPricing() {}'
    });

    const res = invokeCli(repo.repoPath, ['generate', 'HEAD']);
    assert.strictEqual(res.exitCode, 0, `Pipeline failed: ${res.stderr}`);

    // Verify 1. Analysis JSON
    const reportPath = path.join(repo.repoPath, 'content', 'analysis', `${sha}.json`);
    assert.ok(fs.existsSync(reportPath));
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    validateSessionReport(report, sha);

    // Verify 2. Article
    const articleFiles = fs.readdirSync(path.join(repo.repoPath, 'content', 'articles'))
      .filter(f => f.startsWith(sha));
    assert.strictEqual(articleFiles.length, 1);
    const articleContent = fs.readFileSync(path.join(repo.repoPath, 'content', 'articles', articleFiles[0]), 'utf8');
    validateTechnicalArticle(articleContent, report.suggested_article_title);

    // Verify 3. Journal
    const journalFiles = fs.readdirSync(path.join(repo.repoPath, 'content', 'journal'))
      .filter(f => f.startsWith(sha));
    assert.strictEqual(journalFiles.length, 1);
    const journalContent = fs.readFileSync(path.join(repo.repoPath, 'content', 'journal', journalFiles[0]), 'utf8');
    validateDevJournal(journalContent, sha);

    // Verify 4. Social
    const socialFiles = fs.readdirSync(path.join(repo.repoPath, 'content', 'social'))
      .filter(f => f.startsWith(sha));
    assert.strictEqual(socialFiles.length, 1);
    const socialContent = fs.readFileSync(path.join(repo.repoPath, 'content', 'social', socialFiles[0]), 'utf8');
    validateSocialThread(socialContent);
  });

  globalContext.it('4.2: Scenario 2 — Duplicate commit test: immediate skip on second run', () => {
    const sha = repo.makeCommit('fix(rounding): ensure 2-decimal precision for fiat', {
      'js/utils.js': '// rounding utils'
    });

    const run1 = invokeCli(repo.repoPath, ['generate', sha]);
    assert.strictEqual(run1.exitCode, 0);

    const reportPath = path.join(repo.repoPath, 'content', 'analysis', `${sha}.json`);
    const mtime1 = fs.statSync(reportPath).mtimeMs;

    const run2 = invokeCli(repo.repoPath, ['generate', sha]);
    assert.strictEqual(run2.exitCode, 0);
    assert.includes(run2.stdout.toLowerCase(), 'skip');

    const mtime2 = fs.statSync(reportPath).mtimeMs;
    assert.strictEqual(mtime1, mtime2, 'File was not touched');
  });

  globalContext.it('4.3: Scenario 3 — Forced regeneration overwrites existing files', () => {
    const sha = repo.makeCommit('feat(export): export transactions to pdf', {
      'src/pdf.js': '// pdf export'
    });

    invokeCli(repo.repoPath, ['generate', sha]);
    const reportPath = path.join(repo.repoPath, 'content', 'analysis', `${sha}.json`);
    const mtime1 = fs.statSync(reportPath).mtimeMs;

    const endSleep = Date.now() + 60;
    while (Date.now() < endSleep) {}

    const runForce = invokeCli(repo.repoPath, ['generate', sha, '--force']);
    assert.strictEqual(runForce.exitCode, 0);

    const mtime2 = fs.statSync(reportPath).mtimeMs;
    assert.ok(mtime2 > mtime1, 'File was regenerated');
  });

  globalContext.it('4.4: Scenario 4 — Multi-file commit with additions, modifications, and deletions', () => {
    repo.makeCommit('setup files', {
      'file_to_modify.txt': 'initial content',
      'file_to_delete.txt': 'will be deleted'
    });

    // Modify, delete, and add
    fs.unlinkSync(path.join(repo.repoPath, 'file_to_delete.txt'));
    repo.writeFile('file_to_modify.txt', 'updated content');
    repo.writeFile('file_to_add.txt', 'brand new file');
    repo.runGit('add -A');
    const commitSha = repo.runGit('commit -m "refactor: multi-file modifications"').stdout.trim();
    const sha = repo.getHeadSha();

    const res = invokeCli(repo.repoPath, ['generate', sha]);
    assert.strictEqual(res.exitCode, 0);

    const reportPath = path.join(repo.repoPath, 'content', 'analysis', `${sha}.json`);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    validateSessionReport(report, sha);
  });

  globalContext.it('4.5: Scenario 5 — Merge commit handles multiple parents without error', () => {
    const mergeSha = repo.makeMergeCommit('feature_branch', 'Merge branch feature_branch into master');
    assert.strictEqual(mergeSha.length, 40);

    const res = invokeCli(repo.repoPath, ['generate', mergeSha]);
    assert.strictEqual(res.exitCode, 0, `Merge commit generation should succeed: ${res.stderr}`);

    const reportPath = path.join(repo.repoPath, 'content', 'analysis', `${mergeSha}.json`);
    assert.ok(fs.existsSync(reportPath));
  });
}, { tier: 4, category: 'Real-World Scenarios' });
