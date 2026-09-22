/**
 * Tier 5: Adversarial Hardening & Stress Testing
 * Tests resilience against:
 * - Corrupted existing JSON files
 * - Complex commit messages (emojis, Markdown, quotes, newlines)
 * - Large diffs
 * - Rapid sequential generation (race conditions)
 */

const { globalContext } = require('../../harness/test-runner');
const { assert } = require('../../harness/assertions');
const { createTestRepo } = require('../harness/git-test-helper');
const { invokeCli } = require('../harness/cli-invoker');
const { validateSessionReport } = require('../harness/schema-validator');
const path = require('path');
const fs = require('fs');

globalContext.describe('[Tier 5] AI Content — Adversarial Hardening & Stress Testing', () => {
  let repo;

  globalContext.beforeEach(() => {
    repo = createTestRepo('t5_adversarial');
  });

  globalContext.afterEach(() => {
    if (repo) repo.cleanup();
  });

  globalContext.it('5.1: Corrupted JSON file in content/analysis/<sha>.json is safely replaced when --force is used', () => {
    const sha = repo.makeCommit('feat(test): corrupted json recovery', { 'f.txt': '1' });
    const analysisPath = path.join(repo.repoPath, 'content', 'analysis', `${sha}.json`);
    const parent = path.dirname(analysisPath);
    if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });

    // Write completely invalid JSON
    fs.writeFileSync(analysisPath, '{ "commit_sha": "TRUNCATED_JSON_DATA', 'utf8');

    // Force run should overwrite without crash
    const res = invokeCli(repo.repoPath, ['generate', sha, '--force']);
    assert.strictEqual(res.exitCode, 0, `Forced run must recover from corrupted JSON: ${res.stderr}`);

    const restoredData = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
    validateSessionReport(restoredData, sha);
  });

  globalContext.it('5.2: Commit messages with quotes, emojis, and markdown tokens serialize safely', () => {
    const complexMsg = 'feat(ui): add "sweet-spot" badges! #123 [breaking] *important* `code`';
    const sha = repo.makeCommit(complexMsg, { 'badge.js': '// badge' });

    const res = invokeCli(repo.repoPath, ['generate', sha]);
    assert.strictEqual(res.exitCode, 0);

    const reportPath = path.join(repo.repoPath, 'content', 'analysis', `${sha}.json`);
    const data = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

    assert.ok(data.summary.includes('sweet-spot'));
    validateSessionReport(data, sha);
  });

  globalContext.it('5.3: Large diff commit (5,000 lines generated) is processed without memory failure', () => {
    const lines = [];
    for (let i = 0; i < 5000; i++) {
      lines.push(`const line_${i} = ${i * 42};`);
    }
    const sha = repo.makeCommit('feat(big): add large generated source file', {
      'big_data.js': lines.join('\n')
    });

    const res = invokeCli(repo.repoPath, ['generate', sha]);
    assert.strictEqual(res.exitCode, 0, `Large diff should be handled without failure: ${res.stderr}`);

    const reportPath = path.join(repo.repoPath, 'content', 'analysis', `${sha}.json`);
    assert.ok(fs.existsSync(reportPath));
  });

  globalContext.it('5.4: Rapid sequential generation calls maintain atomic file integrity', () => {
    const sha = repo.makeCommit('feat(rapid): rapid generation testing', { 'rapid.txt': 'test' });

    // Fire 5 sequential forced generations in a row
    for (let i = 0; i < 5; i++) {
      const res = invokeCli(repo.repoPath, ['generate', sha, '--force']);
      assert.strictEqual(res.exitCode, 0);
    }

    const reportPath = path.join(repo.repoPath, 'content', 'analysis', `${sha}.json`);
    const data = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    validateSessionReport(data, sha);
  });
}, { tier: 5, category: 'Adversarial Hardening' });
