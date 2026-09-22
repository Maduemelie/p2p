/**
 * Tier 1: Feature Coverage — Markdown Output Verification
 * Tests generation and structure of all 3 markdown output files:
 * 1. content/articles/<sha>-<slug>.md
 * 2. content/journal/<sha>-<slug>.md
 * 3. content/social/<sha>-<slug>.md
 * Also verifies atomic writing (no temporary files left behind).
 */

const { globalContext } = require('../../harness/test-runner');
const { assert } = require('../../harness/assertions');
const { createTestRepo } = require('../harness/git-test-helper');
const { invokeCli } = require('../harness/cli-invoker');
const {
  validateTechnicalArticle,
  validateDevJournal,
  validateSocialThread
} = require('../harness/schema-validator');
const path = require('path');
const fs = require('fs');

globalContext.describe('[Tier 1] AI Content — Markdown File Outputs & Formatting', () => {
  let repo;

  globalContext.beforeEach(() => {
    repo = createTestRepo('t1_markdown');
  });

  globalContext.afterEach(() => {
    if (repo) repo.cleanup();
  });

  globalContext.it('3.1: Creates technical article markdown file with valid title and sections', () => {
    const sha = repo.makeCommit('feat(p2p): optimize maker ad matching latency', {
      'src/p2p.js': '// p2p optimization'
    });

    const res = invokeCli(repo.repoPath, ['generate', sha]);
    assert.strictEqual(res.exitCode, 0);

    const articlesDir = path.join(repo.repoPath, 'content', 'articles');
    assert.ok(fs.existsSync(articlesDir), 'articles directory must exist');

    const files = fs.readdirSync(articlesDir).filter(f => f.startsWith(sha) && f.endsWith('.md'));
    assert.strictEqual(files.length, 1, `Expected exactly 1 article file for sha ${sha}`);

    const articlePath = path.join(articlesDir, files[0]);
    const content = fs.readFileSync(articlePath, 'utf8');

    validateTechnicalArticle(content);
    assert.match(content, /##\s+Executive Summary/i, 'Must contain Executive Summary heading');
    assert.match(content, /##\s+Key Technical Takeaways/i, 'Must contain Takeaways heading');
  });

  globalContext.it('3.2: Creates development journal markdown file referencing commit metadata', () => {
    const sha = repo.makeCommit('fix(websocket): reconnect gracefully on heartbeat timeout', {
      'src/ws.js': '// ws reconnection logic'
    });

    invokeCli(repo.repoPath, ['generate', sha]);

    const journalDir = path.join(repo.repoPath, 'content', 'journal');
    assert.ok(fs.existsSync(journalDir), 'journal directory must exist');

    const files = fs.readdirSync(journalDir).filter(f => f.startsWith(sha) && f.endsWith('.md'));
    assert.strictEqual(files.length, 1, `Expected 1 journal file for sha ${sha}`);

    const journalPath = path.join(journalDir, files[0]);
    const content = fs.readFileSync(journalPath, 'utf8');

    validateDevJournal(content, sha);
    assert.includes(content, sha.slice(0, 7), 'Journal should mention short SHA');
  });

  globalContext.it('3.3: Creates social thread markdown file with structured tweet numbering', () => {
    const sha = repo.makeCommit('feat(ui): add mobile responsive orderbook markers', {
      'src/ui/markers.js': '// UI markers'
    });

    invokeCli(repo.repoPath, ['generate', sha]);

    const socialDir = path.join(repo.repoPath, 'content', 'social');
    assert.ok(fs.existsSync(socialDir), 'social directory must exist');

    const files = fs.readdirSync(socialDir).filter(f => f.startsWith(sha) && f.endsWith('.md'));
    assert.strictEqual(files.length, 1, `Expected 1 social thread file for sha ${sha}`);

    const socialPath = path.join(socialDir, files[0]);
    const content = fs.readFileSync(socialPath, 'utf8');

    validateSocialThread(content);
  });

  globalContext.it('3.4: Verifies all 4 content files are created simultaneously in their designated folders', () => {
    const sha = repo.makeCommit('feat(arbitrage): calculate volume-weighted average price', {
      'src/vwap.js': '// vwap calculation'
    });

    invokeCli(repo.repoPath, ['generate', sha]);

    const jsonPath = path.join(repo.repoPath, 'content', 'analysis', `${sha}.json`);
    assert.ok(fs.existsSync(jsonPath), 'analysis json must exist');

    const articleFiles = fs.readdirSync(path.join(repo.repoPath, 'content', 'articles'))
      .filter(f => f.startsWith(sha) && f.endsWith('.md'));
    assert.strictEqual(articleFiles.length, 1, 'article md must exist');

    const journalFiles = fs.readdirSync(path.join(repo.repoPath, 'content', 'journal'))
      .filter(f => f.startsWith(sha) && f.endsWith('.md'));
    assert.strictEqual(journalFiles.length, 1, 'journal md must exist');

    const socialFiles = fs.readdirSync(path.join(repo.repoPath, 'content', 'social'))
      .filter(f => f.startsWith(sha) && f.endsWith('.md'));
    assert.strictEqual(socialFiles.length, 1, 'social md must exist');
  });

  globalContext.it('3.5: Verifies atomic write contract leaves no temporary files on disk', () => {
    const sha = repo.makeCommit('chore(audit): verify atomic file writes', {
      'src/atomic.js': '// atomic test'
    });

    invokeCli(repo.repoPath, ['generate', sha]);

    // Check all subfolders for any .tmp files
    const subdirs = ['analysis', 'articles', 'journal', 'social'];
    for (const subdir of subdirs) {
      const dirPath = path.join(repo.repoPath, 'content', subdir);
      const tmpFiles = fs.readdirSync(dirPath).filter(f => f.includes('.tmp'));
      assert.strictEqual(tmpFiles.length, 0, `No temporary files should exist in content/${subdir}, found: ${tmpFiles.join(', ')}`);
    }
  });
}, { tier: 1, category: 'Markdown Outputs' });
