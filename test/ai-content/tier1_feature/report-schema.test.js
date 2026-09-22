/**
 * Tier 1: Feature Coverage — Report Schema Validation
 * Validates that content/analysis/<sha>.json strictly matches DevelopmentSessionReport model:
 * - commit_sha: 40-character hex string
 * - timestamp: ISO-8601 string
 * - summary: non-empty string
 * - architecture_impact: non-empty string
 * - key_takeaways: array of non-empty strings
 * - changed_components: array of strings
 * - suggested_article_title: non-empty string
 * - suggested_article_slug: valid kebab-case slug
 */

const { globalContext } = require('../../harness/test-runner');
const { assert } = require('../../harness/assertions');
const { createTestRepo } = require('../harness/git-test-helper');
const { invokeCli } = require('../harness/cli-invoker');
const { validateSessionReport, ISO_8601_REGEX, SHA_40_REGEX, SLUG_REGEX } = require('../harness/schema-validator');
const path = require('path');
const fs = require('fs');

globalContext.describe('[Tier 1] AI Content — Report Schema & Contract Compliance', () => {
  let repo;

  globalContext.beforeEach(() => {
    repo = createTestRepo('t1_schema');
  });

  globalContext.afterEach(() => {
    if (repo) repo.cleanup();
  });

  globalContext.it('2.1: Creates valid, parseable JSON file in content/analysis/<sha>.json', () => {
    const sha = repo.makeCommit('feat(orderbook): optimize order book depth calculations', {
      'src/orderbook.js': 'export const depth = () => [];'
    });

    const res = invokeCli(repo.repoPath, ['generate', sha]);
    assert.strictEqual(res.exitCode, 0);

    const reportPath = path.join(repo.repoPath, 'content', 'analysis', `${sha}.json`);
    assert.ok(fs.existsSync(reportPath), 'Report file must exist');

    const content = fs.readFileSync(reportPath, 'utf8');
    let parsed;
    assert.doesNotThrow(() => {
      parsed = JSON.parse(content);
    }, 'Report must be valid JSON');

    validateSessionReport(parsed, sha);
  });

  globalContext.it('2.2: Verifies commit_sha strictly matches canonical 40-character hexadecimal SHA', () => {
    const sha = repo.makeCommit('fix(fifo): correct fractional lot liquidation accounting', {
      'src/fifo.js': '// FIFO lot liquidation fix'
    });

    invokeCli(repo.repoPath, ['generate', sha]);
    const reportPath = path.join(repo.repoPath, 'content', 'analysis', `${sha}.json`);
    const data = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

    assert.strictEqual(data.commit_sha.toLowerCase(), sha.toLowerCase());
    assert.match(data.commit_sha, SHA_40_REGEX);
  });

  globalContext.it('2.3: Verifies timestamp is a valid ISO-8601 timestamp string', () => {
    const sha = repo.makeCommit('refactor(models): migrate state store to immutable ledger', {
      'src/models.js': '// immutable models'
    });

    invokeCli(repo.repoPath, ['generate', sha]);
    const reportPath = path.join(repo.repoPath, 'content', 'analysis', `${sha}.json`);
    const data = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

    assert.match(data.timestamp, ISO_8601_REGEX);
    const parsedDate = new Date(data.timestamp);
    assert.ok(!isNaN(parsedDate.getTime()), 'Timestamp must parse as valid Date');
  });

  globalContext.it('2.4: Verifies summary and architecture_impact are meaningful non-empty strings', () => {
    const sha = repo.makeCommit('feat(security): implement origin validation for webhook receiver', {
      'src/security.js': '// webhook origin check'
    });

    invokeCli(repo.repoPath, ['generate', sha]);
    const reportPath = path.join(repo.repoPath, 'content', 'analysis', `${sha}.json`);
    const data = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

    assert.ok(typeof data.summary === 'string');
    assert.isAbove(data.summary.trim().length, 10, 'Summary must be descriptive');
    assert.ok(typeof data.architecture_impact === 'string');
    assert.isAbove(data.architecture_impact.trim().length, 10, 'Architecture impact must be descriptive');
  });

  globalContext.it('2.5: Verifies key_takeaways and changed_components are valid string arrays', () => {
    const sha = repo.makeCommit('chore(deps): bump dependencies and add health monitors', {
      'package.json': '{"name":"test"}'
    });

    invokeCli(repo.repoPath, ['generate', sha]);
    const reportPath = path.join(repo.repoPath, 'content', 'analysis', `${sha}.json`);
    const data = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

    assert.ok(Array.isArray(data.key_takeaways), 'key_takeaways must be array');
    assert.isAbove(data.key_takeaways.length, 0, 'Must have at least one takeaway');
    assert.ok(Array.isArray(data.changed_components), 'changed_components must be array');
  });

  globalContext.it('2.6: Verifies suggested_article_title and suggested_article_slug kebab format', () => {
    const sha = repo.makeCommit('feat(analytics): add historical profit chart rendering', {
      'src/analytics.js': '// historical chart'
    });

    invokeCli(repo.repoPath, ['generate', sha]);
    const reportPath = path.join(repo.repoPath, 'content', 'analysis', `${sha}.json`);
    const data = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

    assert.ok(data.suggested_article_title.length > 0);
    assert.match(data.suggested_article_slug, SLUG_REGEX, 'Slug must be valid kebab-case');
    assert.doesNotMatch(data.suggested_article_slug, /[A-Z\s_]/, 'Slug must not contain uppercase or spaces');
  });
}, { tier: 1, category: 'Report Schema' });
