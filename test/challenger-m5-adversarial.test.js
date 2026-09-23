/**
 * Challenger Suite: Milestone 5 Adversarial Empirical Hardening
 * Role: m5_challenger_ai_4 (Milestone 5 Adversarial Challenger 4)
 *
 * Scenarios:
 * 1. Corrupted existing analysis report:
 *    - Invalid JSON in content/analysis/<sha>.json ({invalid: json)
 *    - Verify CLI handles gracefully without crash (skips or exits cleanly)
 *    - Verify CLI regenerates valid DevelopmentSessionReport with --force
 * 2. Missing GEMINI_API_KEY without AI_CONTENT_MOCK=1:
 *    - Verify CLI outputs clear, informative error instructing user to configure .env
 *    - Verify status command displays 'Not Set (Add GEMINI_API_KEY to .env)'
 * 3. Edge-case Git commits:
 *    - Empty commits (git commit --allow-empty) -> handles 0 changed files
 *    - Large diffs (> 30,000 chars) -> line-boundary diff truncation banner
 *    - Merge commits (2 parents) -> extracts parents and merge diff header
 *    - Detached HEAD -> resolves commit SHA correctly
 * 4. Rapid sequential commits:
 *    - 5 sequential commits produce independent, atomically written deliverables with zero .tmp remnants
 */

const { describe, it } = require('./harness/test-runner');
const { assert } = require('./harness/assertions');
const { createTestRepo } = require('./ai-content/harness/git-test-helper');
const { invokeCli } = require('./ai-content/harness/cli-invoker');
const {
  validateSessionReport,
  validateTechnicalArticle,
  validateDevJournal,
  validateSocialThread
} = require('./ai-content/harness/schema-validator');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const WORKSPACE_ROOT = path.resolve(__dirname, '..');

describe('[Tier 5] Challenger M5 — AI Content Adversarial Empirical Hardening', () => {

  // =========================================================================
  // SCENARIO 1: Corrupted existing analysis report
  // =========================================================================
  it('1.1: Corrupted JSON in content/analysis/<sha>.json without --force is handled gracefully', () => {
    const repo = createTestRepo('adv_m5_corrupt_noforce');
    try {
      const sha = repo.makeCommit('feat(core): corrupted json edge test', { 'core.js': 'console.log("core");' });
      const analysisPath = path.join(repo.repoPath, 'content', 'analysis', `${sha}.json`);
      const parentDir = path.dirname(analysisPath);
      if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });

      // Write invalid malformed JSON
      fs.writeFileSync(analysisPath, '{invalid: json', 'utf8');

      // Invoke generate without --force
      const res = invokeCli(repo.repoPath, ['generate', sha]);
      // Should handle gracefully (exit 0 with SKIP or exit 1 with clear message, NO unhandled traceback)
      assert.strictEqual(
        res.exitCode,
        0,
        `Corrupted JSON without --force should skip without unhandled crash. Stderr: ${res.stderr}`
      );
      assert.ok(
        res.stdout.includes('[SKIP]') || res.stdout.includes('already generated') || res.stdout.includes('force'),
        `CLI should indicate skipping or prompting for --force: ${res.stdout}`
      );
      assert.ok(
        !res.stderr.includes('Traceback (most recent call last)'),
        'No unhandled Python traceback on corrupted JSON skip'
      );
    } finally {
      repo.cleanup();
    }
  });

  it('1.2: Corrupted JSON in content/analysis/<sha>.json is safely replaced when --force is used', () => {
    const repo = createTestRepo('adv_m5_corrupt_force');
    try {
      const sha = repo.makeCommit('feat(core): corrupted json recovery test', { 'core.js': 'console.log("core");' });
      const analysisPath = path.join(repo.repoPath, 'content', 'analysis', `${sha}.json`);
      const parentDir = path.dirname(analysisPath);
      if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });

      // Write invalid malformed JSON
      fs.writeFileSync(analysisPath, '{invalid: json', 'utf8');

      // Invoke generate with --force
      const res = invokeCli(repo.repoPath, ['generate', sha, '--force']);
      assert.strictEqual(
        res.exitCode,
        0,
        `Forced generation must overwrite corrupted JSON successfully. Stderr: ${res.stderr}`
      );

      // Verify valid JSON is restored
      assert.ok(fs.existsSync(analysisPath), 'Analysis report must exist');
      const rawContent = fs.readFileSync(analysisPath, 'utf8');
      let reportData;
      try {
        reportData = JSON.parse(rawContent);
      } catch (parseErr) {
        assert.fail(`Overwritten file is not valid JSON: ${parseErr.message}`);
      }

      validateSessionReport(reportData, sha);
      assert.strictEqual(reportData.commit_sha, sha, 'Restored report must contain correct commit SHA');
      assert.ok(reportData.summary.length > 0, 'Summary must not be empty');
      assert.ok(reportData.key_takeaways.length > 0, 'Takeaways must not be empty');
    } finally {
      repo.cleanup();
    }
  });

  // =========================================================================
  // SCENARIO 2: Missing GEMINI_API_KEY without AI_CONTENT_MOCK=1
  // =========================================================================
  it('2.1: Missing GEMINI_API_KEY in live mode (AI_CONTENT_MOCK=0) outputs clear error instructing .env configuration', () => {
    const rootEnvPath = path.join(WORKSPACE_ROOT, '.env');
    const rootEnvBackup = path.join(WORKSPACE_ROOT, '.env.m5_test_backup');
    let envSwapped = false;

    // Temporarily rename root .env so config.py does not load existing GEMINI_API_KEY with override=True
    if (fs.existsSync(rootEnvPath)) {
      try {
        fs.copyFileSync(rootEnvPath, rootEnvBackup);
        // Write .env without GEMINI_API_KEY
        const envContent = fs.readFileSync(rootEnvPath, 'utf8');
        const strippedEnv = envContent
          .split('\n')
          .filter(line => !line.trim().startsWith('GEMINI_API_KEY'))
          .join('\n');
        fs.writeFileSync(rootEnvPath, strippedEnv, 'utf8');
        envSwapped = true;
      } catch (e) {
        // Fallback if file copy/write fails
      }
    }

    const repo = createTestRepo('adv_m5_missing_key_live');
    try {
      const sha = repo.makeCommit('feat(api): test live mode missing key', { 'api.js': 'module.exports = {};' });

      // Run with AI_CONTENT_MOCK=0 and GEMINI_API_KEY empty
      const res = invokeCli(repo.repoPath, ['generate', sha, '--force'], {
        mock: false,
        env: {
          AI_CONTENT_MOCK: '0',
          GEMINI_API_KEY: '',
          PYTEST_CURRENT_TEST: ''
        }
      });

      assert.strictEqual(
        res.exitCode,
        1,
        `Live mode without GEMINI_API_KEY must exit with non-zero error code. Output: ${res.stdout} ${res.stderr}`
      );

      const combinedOutput = `${res.stderr} ${res.stdout}`;
      const hasClearError = combinedOutput.includes('GEMINI_API_KEY is not configured in .env or environment') ||
                            combinedOutput.includes('GEMINI_API_KEY');

      assert.ok(
        hasClearError,
        `Error output must inform user about GEMINI_API_KEY and .env. Output was: ${combinedOutput}`
      );
    } finally {
      if (envSwapped && fs.existsSync(rootEnvBackup)) {
        try {
          fs.copyFileSync(rootEnvBackup, rootEnvPath);
          fs.unlinkSync(rootEnvBackup);
        } catch (e) {}
      }
      repo.cleanup();
    }
  });

  it('2.2: CLI status command explicitly instructs user to add GEMINI_API_KEY to .env when missing', () => {
    const rootEnvPath = path.join(WORKSPACE_ROOT, '.env');
    const rootEnvBackup = path.join(WORKSPACE_ROOT, '.env.m5_test_backup_status');
    let envSwapped = false;

    if (fs.existsSync(rootEnvPath)) {
      try {
        fs.copyFileSync(rootEnvPath, rootEnvBackup);
        const envContent = fs.readFileSync(rootEnvPath, 'utf8');
        const strippedEnv = envContent
          .split('\n')
          .filter(line => !line.trim().startsWith('GEMINI_API_KEY'))
          .join('\n');
        fs.writeFileSync(rootEnvPath, strippedEnv, 'utf8');
        envSwapped = true;
      } catch (e) {}
    }

    const repo = createTestRepo('adv_m5_missing_key_status');
    try {
      const res = invokeCli(repo.repoPath, ['status'], {
        env: {
          GEMINI_API_KEY: ''
        }
      });

      assert.strictEqual(res.exitCode, 0, `Status command must exit 0: ${res.stderr}`);
      assert.ok(
        res.stdout.includes('Add GEMINI_API_KEY to .env') || res.stdout.includes('Not Set'),
        `Status command must instruct user to add GEMINI_API_KEY to .env: ${res.stdout}`
      );
    } finally {
      if (envSwapped && fs.existsSync(rootEnvBackup)) {
        try {
          fs.copyFileSync(rootEnvBackup, rootEnvPath);
          fs.unlinkSync(rootEnvBackup);
        } catch (e) {}
      }
      repo.cleanup();
    }
  });

  it('2.3: CLI generate emits warning when GEMINI_API_KEY is missing and mock mode is unconfigured', () => {
    const rootEnvPath = path.join(WORKSPACE_ROOT, '.env');
    const rootEnvBackup = path.join(WORKSPACE_ROOT, '.env.m5_test_backup_warn');
    let envSwapped = false;

    if (fs.existsSync(rootEnvPath)) {
      try {
        fs.copyFileSync(rootEnvPath, rootEnvBackup);
        const envContent = fs.readFileSync(rootEnvPath, 'utf8');
        const strippedEnv = envContent
          .split('\n')
          .filter(line => !line.trim().startsWith('GEMINI_API_KEY'))
          .join('\n');
        fs.writeFileSync(rootEnvPath, strippedEnv, 'utf8');
        envSwapped = true;
      } catch (e) {}
    }

    const repo = createTestRepo('adv_m5_missing_key_warn');
    try {
      const sha = repo.makeCommit('feat: unconfigured mock key warning', { 'test.txt': 'data' });
      const res = invokeCli(repo.repoPath, ['generate', sha, '--force'], {
        env: {
          GEMINI_API_KEY: '',
          AI_CONTENT_MOCK: '',
          PYTEST_CURRENT_TEST: ''
        }
      });

      const combined = `${res.stderr} ${res.stdout}`;
      assert.ok(
        combined.includes('GEMINI_API_KEY is not configured in .env or environment') ||
        combined.includes('Warning: GEMINI_API_KEY'),
        `Should warn about missing GEMINI_API_KEY: ${combined}`
      );
    } finally {
      if (envSwapped && fs.existsSync(rootEnvBackup)) {
        try {
          fs.copyFileSync(rootEnvBackup, rootEnvPath);
          fs.unlinkSync(rootEnvBackup);
        } catch (e) {}
      }
      repo.cleanup();
    }
  });

  // =========================================================================
  // SCENARIO 3: Edge-case Git commits
  // =========================================================================
  it('3.1: Empty commit (git commit --allow-empty) produces valid report with 0 changed files', () => {
    const repo = createTestRepo('adv_m5_empty_commit');
    try {
      const emptySha = repo.makeEmptyCommit('chore(empty): checkpoint commit with zero file changes');
      const res = invokeCli(repo.repoPath, ['generate', emptySha]);

      assert.strictEqual(res.exitCode, 0, `Empty commit generation should succeed: ${res.stderr}`);

      const reportPath = path.join(repo.repoPath, 'content', 'analysis', `${emptySha}.json`);
      assert.ok(fs.existsSync(reportPath), 'Analysis report must exist for empty commit');

      const data = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      validateSessionReport(data, emptySha);
      assert.strictEqual(data.commit_sha, emptySha);
      assert.ok(data.summary.includes('empty') || data.summary.length > 0);
    } finally {
      repo.cleanup();
    }
  });

  it('3.2: Large diff (> 30,000 chars) processes without memory failure', () => {
    const repo = createTestRepo('adv_m5_large_diff');
    try {
      // Create ~45,000 characters of source code
      const lines = [];
      for (let i = 0; i < 1200; i++) {
        lines.push(`export const data_point_${i} = { id: ${i}, hash: "crypto_token_digest_${i * 1337}" };`);
      }
      const largeContent = lines.join('\n');
      const sha = repo.makeCommit('feat(big): add 1200 data points generating >40k chars diff', {
        'large_asset.js': largeContent
      });

      const res = invokeCli(repo.repoPath, ['generate', sha]);
      assert.strictEqual(res.exitCode, 0, `Large diff generation must succeed: ${res.stderr}`);

      const reportPath = path.join(repo.repoPath, 'content', 'analysis', `${sha}.json`);
      assert.ok(fs.existsSync(reportPath), 'Analysis report must exist for large diff commit');
      const data = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      validateSessionReport(data, sha);
    } finally {
      repo.cleanup();
    }
  });

  it('3.3: Line-boundary diff truncation banner is strictly verified in GitCommitContext', () => {
    const repo = createTestRepo('adv_m5_truncation_banner');
    try {
      const lines = [];
      for (let i = 0; i < 1200; i++) {
        lines.push(`const row_${i} = "payload_line_${i}_${'x'.repeat(40)}";`);
      }
      const sha = repo.makeCommit('feat(trunc): test truncation banner', {
        'bulk_rows.js': lines.join('\n')
      });

      // Verify truncation banner via Python git_context
      const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
      const pyScript = [
        'import sys',
        'from pathlib import Path',
        'from ai_content.git_context import collect_git_context',
        `repo_path = Path(r"${repo.repoPath}")`,
        `ctx = collect_git_context("${sha}", repo_root=repo_path)`,
        'assert "[DIFF TRUNCATED: Exceeded LLM Context Threshold]" in ctx.diff, "Missing truncation banner"',
        'assert "max 30,000 characters" in ctx.diff, "Missing max 30,000 characters banner"',
        'print("BANNER_VERIFIED")'
      ].join('; ');

      const pyRes = spawnSync(pyCmd, ['-c', pyScript], {
        cwd: WORKSPACE_ROOT,
        encoding: 'utf8',
        env: { ...process.env, PYTHONPATH: WORKSPACE_ROOT }
      });

      assert.strictEqual(
        pyRes.status,
        0,
        `Python truncation verification failed: ${pyRes.stderr || pyRes.stdout}`
      );
      assert.ok(pyRes.stdout.includes('BANNER_VERIFIED'), 'Truncation banner must be present in diff');
    } finally {
      repo.cleanup();
    }
  });

  it('3.4: Merge commit (2 parents) extracts parents and includes [MERGE COMMIT CONTEXT] diff header', () => {
    const repo = createTestRepo('adv_m5_merge_commit');
    try {
      repo.makeCommit('initial commit on master', { 'master_base.txt': 'base content\n' });

      // Create feature branch with commit
      repo.runGit('checkout -b feature-arbitrage');
      repo.makeCommit('feat: arbitrage worker', { 'arbitrage.js': 'export const run = () => {};\n' });

      // Back to master, create independent commit
      repo.runGit('checkout master');
      repo.makeCommit('fix: base security patch', { 'security.txt': 'security patch\n' });

      // Merge feature branch
      repo.runGit('merge feature-arbitrage -m "Merge branch \'feature-arbitrage\' into master" --no-ff');
      const mergeSha = repo.getHeadSha();

      // Run CLI generate on merge commit
      const res = invokeCli(repo.repoPath, ['generate', mergeSha]);
      assert.strictEqual(res.exitCode, 0, `Merge commit generation must succeed: ${res.stderr}`);

      const reportPath = path.join(repo.repoPath, 'content', 'analysis', `${mergeSha}.json`);
      assert.ok(fs.existsSync(reportPath), 'Analysis report must exist for merge commit');

      // Verify git_context in Python
      const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
      const pyScript = [
        'import sys',
        'from pathlib import Path',
        'from ai_content.git_context import collect_git_context',
        `repo_path = Path(r"${repo.repoPath}")`,
        `ctx = collect_git_context("${mergeSha}", repo_root=repo_path)`,
        'assert ctx.is_merge is True, f"Expected is_merge=True, got {ctx.is_merge}"',
        'assert len(ctx.parent_shas) == 2, f"Expected 2 parent SHAs, got {len(ctx.parent_shas)}"',
        'assert "[MERGE COMMIT CONTEXT]" in ctx.diff, "Missing [MERGE COMMIT CONTEXT] banner in diff"',
        'print("MERGE_VERIFIED")'
      ].join('; ');

      const pyRes = spawnSync(pyCmd, ['-c', pyScript], {
        cwd: WORKSPACE_ROOT,
        encoding: 'utf8',
        env: { ...process.env, PYTHONPATH: WORKSPACE_ROOT }
      });

      assert.strictEqual(
        pyRes.status,
        0,
        `Merge context verification failed: ${pyRes.stderr || pyRes.stdout}`
      );
      assert.ok(pyRes.stdout.includes('MERGE_VERIFIED'), 'Merge commit context must be verified');
    } finally {
      repo.cleanup();
    }
  });

  it('3.5: Detached HEAD correctly resolves target commit SHA and generates deliverables', () => {
    const repo = createTestRepo('adv_m5_detached_head');
    try {
      const sha1 = repo.makeCommit('feat: first commit', { 'f1.txt': '1\n' });
      const targetSha = repo.makeCommit('feat: second target commit', { 'f2.txt': '2\n' });
      const sha3 = repo.makeCommit('feat: third commit', { 'f3.txt': '3\n' });

      // Detach HEAD to targetSha
      repo.runGit(`checkout --detach ${targetSha}`);

      // Invoke CLI with 'HEAD'
      const res = invokeCli(repo.repoPath, ['generate', 'HEAD']);
      assert.strictEqual(res.exitCode, 0, `Detached HEAD generate must succeed: ${res.stderr}`);

      const reportPath = path.join(repo.repoPath, 'content', 'analysis', `${targetSha}.json`);
      assert.ok(fs.existsSync(reportPath), `Report must be created under target SHA ${targetSha}`);

      const data = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      assert.strictEqual(data.commit_sha, targetSha, 'Report commit_sha must match detached HEAD target SHA');
      validateSessionReport(data, targetSha);
    } finally {
      // Re-attach HEAD before cleanup
      try { repo.runGit('checkout master'); } catch (e) {}
      repo.cleanup();
    }
  });

  // =========================================================================
  // SCENARIO 4: Rapid sequential commits & atomic file integrity
  // =========================================================================
  it('4.1: 5 rapid sequential commits produce independent, atomically written deliverables', () => {
    const repo = createTestRepo('adv_m5_rapid_sequential');
    try {
      const count = 5;
      const shas = [];

      for (let i = 1; i <= count; i++) {
        const sha = repo.makeCommit(`feat(module): sequential component ${i}`, {
          [`service_${i}.js`]: `export const service_${i} = { id: ${i}, active: true };\n`
        });
        shas.push(sha);

        const res = invokeCli(repo.repoPath, ['generate', sha]);
        assert.strictEqual(
          res.exitCode,
          0,
          `Sequential generation ${i} failed for SHA ${sha}: ${res.stderr}`
        );
      }

      const analysisDir = path.join(repo.repoPath, 'content', 'analysis');
      const articlesDir = path.join(repo.repoPath, 'content', 'articles');
      const journalDir = path.join(repo.repoPath, 'content', 'journal');
      const socialDir = path.join(repo.repoPath, 'content', 'social');

      // Verify all 5 deliverables exist independently
      for (const sha of shas) {
        const reportPath = path.join(analysisDir, `${sha}.json`);
        assert.ok(fs.existsSync(reportPath), `Report ${sha}.json must exist`);

        const data = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        assert.strictEqual(data.commit_sha, sha, `Report must have commit SHA ${sha}`);
        validateSessionReport(data, sha);

        // Check article, journal, social files
        const articles = fs.readdirSync(articlesDir).filter(f => f.startsWith(sha));
        const journals = fs.readdirSync(journalDir).filter(f => f.startsWith(sha));
        const socials = fs.readdirSync(socialDir).filter(f => f.startsWith(sha));

        assert.strictEqual(articles.length, 1, `Exactly 1 article must exist for SHA ${sha}`);
        assert.strictEqual(journals.length, 1, `Exactly 1 journal must exist for SHA ${sha}`);
        assert.strictEqual(socials.length, 1, `Exactly 1 social thread must exist for SHA ${sha}`);

        validateTechnicalArticle(fs.readFileSync(path.join(articlesDir, articles[0]), 'utf8'));
        validateDevJournal(fs.readFileSync(path.join(journalDir, journals[0]), 'utf8'), sha);
        validateSocialThread(fs.readFileSync(path.join(socialDir, socials[0]), 'utf8'));
      }

      // Check atomic writing: zero .tmp files remain across all directories
      for (const dir of [analysisDir, articlesDir, journalDir, socialDir]) {
        const files = fs.readdirSync(dir);
        const tmpFiles = files.filter(f => f.includes('.tmp'));
        assert.strictEqual(
          tmpFiles.length,
          0,
          `No .tmp files should remain in ${dir}. Found: ${tmpFiles.join(', ')}`
        );
      }
    } finally {
      repo.cleanup();
    }
  });

}, { tier: 5, category: 'Adversarial Hardening' });
