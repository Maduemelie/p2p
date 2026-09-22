/**
 * Tier 1: Feature Coverage — CLI Generation
 * Tests CLI invocation with diverse commit references:
 * 40-character SHA, HEAD, short 7-char SHA, relative refs.
 */

const { globalContext } = require('../../harness/test-runner');
const { assert } = require('../../harness/assertions');
const { createTestRepo } = require('../harness/git-test-helper');
const { invokeCli } = require('../harness/cli-invoker');
const path = require('path');
const fs = require('fs');

globalContext.describe('[Tier 1] AI Content — CLI Invocation & Generation', () => {
  let repo;

  globalContext.beforeEach(() => {
    repo = createTestRepo('t1_cli_gen');
  });

  globalContext.afterEach(() => {
    if (repo) repo.cleanup();
  });

  globalContext.it('1.1: Generates content for canonical 40-character commit SHA', () => {
    const sha = repo.makeCommit('feat(core): add core transaction router', {
      'src/router.js': '// Core router implementation'
    });
    assert.strictEqual(sha.length, 40, 'Commit SHA must be 40 chars');

    const res = invokeCli(repo.repoPath, ['generate', sha]);
    assert.strictEqual(res.exitCode, 0, `CLI should exit with code 0, got ${res.exitCode}. stderr: ${res.stderr}`);
    
    // Verify analysis file was created
    const analysisPath = path.join(repo.repoPath, 'content', 'analysis', `${sha}.json`);
    assert.ok(fs.existsSync(analysisPath), `Analysis JSON must exist at ${analysisPath}`);
  });

  globalContext.it('1.2: Generates content using "HEAD" symbolic reference', () => {
    const sha = repo.makeCommit('feat(api): add health check endpoint', {
      'src/api/health.js': 'export const health = () => ({ status: "ok" });'
    });

    const res = invokeCli(repo.repoPath, ['generate', 'HEAD']);
    assert.strictEqual(res.exitCode, 0, `CLI should exit 0 for HEAD. stderr: ${res.stderr}`);

    const analysisPath = path.join(repo.repoPath, 'content', 'analysis', `${sha}.json`);
    assert.ok(fs.existsSync(analysisPath), `Analysis JSON for HEAD commit must exist at ${analysisPath}`);
  });

  globalContext.it('1.3: Resolves 7-character short SHA to canonical SHA', () => {
    const fullSha = repo.makeCommit('fix(cache): resolve cache invalidation race', {
      'src/cache.js': '// Fixed race condition'
    });
    const shortSha = fullSha.slice(0, 7);

    const res = invokeCli(repo.repoPath, ['generate', shortSha]);
    assert.strictEqual(res.exitCode, 0, `CLI should exit 0 for short SHA. stderr: ${res.stderr}`);

    // Must be saved with the full 40-char SHA name, not short SHA
    const fullShaPath = path.join(repo.repoPath, 'content', 'analysis', `${fullSha}.json`);
    assert.ok(fs.existsSync(fullShaPath), `File must be saved under canonical 40-char SHA: ${fullShaPath}`);
  });

  globalContext.it('1.4: Resolves relative commit reference HEAD~1', () => {
    const firstSha = repo.makeCommit('feat(db): add database connection pool', {
      'src/db.js': '// db pool'
    });
    repo.makeCommit('docs: update read me with db setup', {
      'README.md': '# Updated docs\n'
    });

    const res = invokeCli(repo.repoPath, ['generate', 'HEAD~1']);
    assert.strictEqual(res.exitCode, 0, `CLI should exit 0 for HEAD~1. stderr: ${res.stderr}`);

    const analysisPath = path.join(repo.repoPath, 'content', 'analysis', `${firstSha}.json`);
    assert.ok(fs.existsSync(analysisPath), `Analysis for HEAD~1 (${firstSha}) must exist`);
  });

  globalContext.it('1.5: Successful generation produces expected stdout output', () => {
    const sha = repo.makeCommit('feat(auth): add jwt authentication middleware', {
      'src/auth.js': '// JWT auth'
    });

    const res = invokeCli(repo.repoPath, ['generate', sha]);
    assert.strictEqual(res.exitCode, 0);
    assert.includes(res.stdout, sha, 'Stdout should mention the generated commit SHA');
  });
}, { tier: 1, category: 'AI Content CLI' });
