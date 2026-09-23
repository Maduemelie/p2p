/**
 * Empirical Adversarial Challenger 2 — Milestone 5
 * Target Scenarios:
 * 1. Corrupted existing analysis report:
 *    - Invalid JSON in content/analysis/<sha>.json -> verify CLI handles gracefully or regenerates with --force.
 * 2. Missing GEMINI_API_KEY without AI_CONTENT_MOCK=1:
 *    - Verify CLI outputs a clear, informative error/warning instructing user to configure .env.
 * 3. Edge-case Git commits:
 *    - Empty commits (git commit --allow-empty) -> verify pipeline handles zero changed files.
 *    - Large diffs (> 30,000 chars) -> verify line-boundary diff truncation banner.
 *    - Merge commits (2 parents) -> verify parents and merge diff are extracted.
 *    - Detached HEAD -> verify commit SHA is correctly resolved.
 * 4. Rapid sequential commits:
 *    - Verify multiple sequential commits produce independent, atomically written deliverables.
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const WORKSPACE_ROOT = path.resolve(__dirname, '../../..');
const SCRATCH_ROOT = path.join(WORKSPACE_ROOT, '.test_scratch', 'm5_ai_challenger_2');

// Ensure scratch directory exists
if (!fs.existsSync(SCRATCH_ROOT)) {
  fs.mkdirSync(SCRATCH_ROOT, { recursive: true });
}

let testIndex = 0;
const results = [];

function logSection(title) {
  console.log('\n' + '='.repeat(70));
  console.log(`  ${title}`);
  console.log('='.repeat(70));
}

function recordResult(scenario, passed, details = '') {
  results.push({ scenario, passed, details });
  const status = passed ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${scenario}`);
  if (details) {
    console.log(`       ${details}`);
  }
}

class IsolatedRepo {
  constructor(name) {
    this.name = name;
    this.repoPath = path.join(SCRATCH_ROOT, `${name}_${Date.now()}_${++testIndex}`);
    fs.mkdirSync(this.repoPath, { recursive: true });

    this.runGit('init -b master');
    this.runGit('config user.name "Challenger 2"');
    this.runGit('config user.email "challenger2@example.com"');
    this.runGit('config commit.gpgsign false');
  }

  runGit(args, env = {}) {
    const res = spawnSync('git', args.split(' '), {
      cwd: this.repoPath,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Challenger 2',
        GIT_AUTHOR_EMAIL: 'challenger2@example.com',
        GIT_COMMITTER_NAME: 'Challenger 2',
        GIT_COMMITTER_EMAIL: 'challenger2@example.com',
        ...env
      }
    });
    if (res.status !== 0) {
      const err = (res.stderr || res.stdout || '').trim();
      throw new Error(`Git error (${args}): ${err}`);
    }
    return (res.stdout || '').trim();
  }

  writeFile(relPath, content) {
    const fullPath = path.join(this.repoPath, relPath);
    const parent = path.dirname(fullPath);
    if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
    return fullPath;
  }

  readFile(relPath) {
    const fullPath = path.join(this.repoPath, relPath);
    if (!fs.existsSync(fullPath)) return null;
    return fs.readFileSync(fullPath, 'utf8');
  }

  makeCommit(message, files = {}) {
    for (const [relPath, content] of Object.entries(files)) {
      this.writeFile(relPath, content);
    }
    this.runGit('add -A');
    this.runGit(`commit -m "${message}"`);
    return this.runGit('rev-parse HEAD');
  }

  makeEmptyCommit(message) {
    this.runGit(`commit --allow-empty -m "${message}"`);
    return this.runGit('rev-parse HEAD');
  }

  invokeCli(args, envOverrides = {}) {
    const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
    const env = {
      ...process.env,
      PYTHONPATH: WORKSPACE_ROOT,
      PYTHONIOENCODING: 'utf-8',
      ...envOverrides
    };

    const res = spawnSync(pyCmd, ['-m', 'ai_content.cli', ...args], {
      cwd: this.repoPath,
      encoding: 'utf8',
      env,
      timeout: 30000
    });

    return {
      status: res.status !== null ? res.status : 1,
      stdout: (res.stdout || '').trim(),
      stderr: (res.stderr || (res.error ? res.error.message : '')).trim()
    };
  }

  cleanup() {
    try {
      if (fs.existsSync(this.repoPath)) {
        fs.rmSync(this.repoPath, { recursive: true, force: true });
      }
    } catch (e) {
      // Ignore cleanup error on Windows
    }
  }
}

async function runAllScenarios() {
  logSection('Milestone 5 Adversarial Empirical Challenge Suite');
  console.log(`Workspace Root: ${WORKSPACE_ROOT}`);
  console.log(`Scratch Base:   ${SCRATCH_ROOT}\n`);

  // =========================================================================
  // SCENARIO 1: Corrupted existing analysis report
  // =========================================================================
  logSection('Scenario 1: Corrupted Existing Analysis Report');
  try {
    const repo = new IsolatedRepo('scenario1_corrupted');
    const sha = repo.makeCommit('feat: add core logic', { 'index.js': 'console.log("hello");' });
    const analysisFile = path.join(repo.repoPath, 'content', 'analysis', `${sha}.json`);
    const parentDir = path.dirname(analysisFile);
    if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });

    // Place invalid JSON in content/analysis/<sha>.json
    const corruptedJson = '{invalid: json';
    fs.writeFileSync(analysisFile, corruptedJson, 'utf8');

    // 1A. Test CLI generate without --force -> handles gracefully or skips without crash
    const resNoForce = repo.invokeCli(['generate', sha], { AI_CONTENT_MOCK: '1' });
    const handlesGracefully = (resNoForce.status === 0 || resNoForce.status === 1) &&
      !resNoForce.stderr.includes('Traceback') &&
      (resNoForce.stdout.includes('[SKIP]') || resNoForce.stdout.includes('already generated') || resNoForce.stdout.includes('force'));

    recordResult(
      '1.1: Corrupted JSON without --force handled gracefully without unhandled crash',
      handlesGracefully,
      `Exit code: ${resNoForce.status}, Output: ${resNoForce.stdout || resNoForce.stderr}`
    );

    // 1B. Test CLI generate with --force -> regenerates and overwrites with valid JSON
    const resForce = repo.invokeCli(['generate', sha, '--force'], { AI_CONTENT_MOCK: '1' });
    let validJsonRestored = false;
    let reportData = null;

    if (resForce.status === 0) {
      try {
        const fileContent = fs.readFileSync(analysisFile, 'utf8');
        reportData = JSON.parse(fileContent);
        if (
          reportData.commit_sha === sha &&
          typeof reportData.summary === 'string' &&
          Array.isArray(reportData.key_takeaways)
        ) {
          validJsonRestored = true;
        }
      } catch (err) {
        validJsonRestored = false;
      }
    }

    recordResult(
      '1.2: Corrupted JSON overwritten with valid DevelopmentSessionReport via --force',
      validJsonRestored,
      `Exit code: ${resForce.status}, Valid JSON: ${validJsonRestored}, SHA in report: ${reportData ? reportData.commit_sha : 'none'}`
    );

    repo.cleanup();
  } catch (err) {
    recordResult('1.x: Scenario 1 Execution', false, err.message);
  }

  // =========================================================================
  // SCENARIO 2: Missing GEMINI_API_KEY without AI_CONTENT_MOCK=1
  // =========================================================================
  logSection('Scenario 2: Missing GEMINI_API_KEY without AI_CONTENT_MOCK=1');
  try {
    const repo = new IsolatedRepo('scenario2_missing_key');
    const sha = repo.makeCommit('feat: test missing api key', { 'main.py': 'pass' });

    // 2A: Generate with AI_CONTENT_MOCK=0 (requesting live generation without key)
    const resLiveNoKey = repo.invokeCli(['generate', sha], {
      GEMINI_API_KEY: '',
      AI_CONTENT_MOCK: '0'
    });

    const hasClearError = resLiveNoKey.status !== 0 &&
      (resLiveNoKey.stderr.includes('GEMINI_API_KEY is not configured') ||
       resLiveNoKey.stdout.includes('GEMINI_API_KEY is not configured'));

    recordResult(
      '2.1: Missing GEMINI_API_KEY under live mode (AI_CONTENT_MOCK=0) outputs clear error',
      hasClearError,
      `Exit code: ${resLiveNoKey.status}, Stderr: ${resLiveNoKey.stderr}`
    );

    // 2B: CLI status command when GEMINI_API_KEY is missing instructs to configure .env
    const resStatus = repo.invokeCli(['status'], {
      GEMINI_API_KEY: '',
      AI_CONTENT_MOCK: ''
    });

    const statusInstructsEnv = resStatus.status === 0 &&
      (resStatus.stdout.includes('Add GEMINI_API_KEY to .env') ||
       resStatus.stdout.includes('.env'));

    recordResult(
      '2.2: CLI status instructs user to add GEMINI_API_KEY to .env when missing',
      statusInstructsEnv,
      `Exit code: ${resStatus.status}, Output snippet: ${resStatus.stdout.split('\n').filter(l => l.includes('Gemini API Key')).join(' | ')}`
    );

    // 2C: Generate when AI_CONTENT_MOCK is unset and no key in env/file -> emits warning
    const resUnsetMock = repo.invokeCli(['generate', sha, '--force'], {
      GEMINI_API_KEY: '',
      AI_CONTENT_MOCK: ''
    });

    const warnsAboutKey = resUnsetMock.stderr.includes('GEMINI_API_KEY is not configured') ||
                          resUnsetMock.stdout.includes('GEMINI_API_KEY is not configured');

    recordResult(
      '2.3: CLI generate emits warning about missing GEMINI_API_KEY when unset',
      warnsAboutKey,
      `Warning present: ${warnsAboutKey}`
    );

    repo.cleanup();
  } catch (err) {
    recordResult('2.x: Scenario 2 Execution', false, err.message);
  }

  // =========================================================================
  // SCENARIO 3: Edge-case Git commits
  // =========================================================================
  logSection('Scenario 3: Edge-Case Git Commits');

  // 3A: Empty commit (git commit --allow-empty)
  try {
    const repo = new IsolatedRepo('scenario3a_empty');
    repo.makeCommit('initial commit', { 'init.txt': 'base' });
    const emptySha = repo.makeEmptyCommit('chore: empty checkpoint commit');

    const resEmpty = repo.invokeCli(['generate', emptySha], { AI_CONTENT_MOCK: '1' });
    const reportPath = path.join(repo.repoPath, 'content', 'analysis', `${emptySha}.json`);
    let emptyHandled = false;

    if (resEmpty.status === 0 && fs.existsSync(reportPath)) {
      const data = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      if (data.commit_sha === emptySha && data.summary) {
        emptyHandled = true;
      }
    }

    recordResult(
      '3.1: Empty commit (git commit --allow-empty) handled with zero changed files',
      emptyHandled,
      `Exit code: ${resEmpty.status}, Report exists: ${fs.existsSync(reportPath)}`
    );
    repo.cleanup();
  } catch (err) {
    recordResult('3.1: Empty Commit', false, err.message);
  }

  // 3B: Large diff (> 30,000 chars) -> line-boundary diff truncation banner
  try {
    const repo = new IsolatedRepo('scenario3b_large_diff');
    repo.makeCommit('initial commit', { 'init.txt': 'base' });

    // Generate ~40,000 chars of code
    const lines = [];
    for (let i = 0; i < 1200; i++) {
      lines.push(`const generated_data_point_${i} = { id: ${i}, value: "random_payload_token_${i * 1337}" };`);
    }
    const largeContent = lines.join('\n');
    console.log(`       Generated large file size: ${largeContent.length} chars, ${lines.length} lines`);

    const largeSha = repo.makeCommit('feat: add large generated asset file', { 'large_file.js': largeContent });
    const resLarge = repo.invokeCli(['generate', largeSha], { AI_CONTENT_MOCK: '1' });

    const reportPath = path.join(repo.repoPath, 'content', 'analysis', `${largeSha}.json`);
    let largeHandled = false;
    if (resLarge.status === 0 && fs.existsSync(reportPath)) {
      const data = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      if (data.commit_sha === largeSha) {
        largeHandled = true;
      }
    }

    recordResult(
      '3.2: Large diff (> 30,000 chars) processed successfully without memory/execution failure',
      largeHandled,
      `Exit code: ${resLarge.status}, Report created: ${fs.existsSync(reportPath)}`
    );

    // Also verify Python truncate_diff logic directly
    const pyCheckCmd = [
      '-c',
      [
        'from ai_content.git_context import collect_git_context;',
        `ctx = collect_git_context("${largeSha}");`,
        'assert "[DIFF TRUNCATED: Exceeded LLM Context Threshold]" in ctx.diff;',
        'assert "max 30,000 characters" in ctx.diff;',
        'print("BANNER_VERIFIED")'
      ].join(' ')
    ];
    const pyCheckRes = repo.invokeCli(pyCheckCmd, { AI_CONTENT_MOCK: '1' });
    const bannerVerified = pyCheckRes.stdout.includes('BANNER_VERIFIED');

    recordResult(
      '3.3: Line-boundary diff truncation banner strictly verified in GitCommitContext',
      bannerVerified,
      `Truncation banner detected: ${bannerVerified}, Output: ${pyCheckRes.stdout || pyCheckRes.stderr}`
    );

    repo.cleanup();
  } catch (err) {
    recordResult('3.2/3.3: Large Diff', false, err.message);
  }

  // 3C: Merge commits (2 parents) -> verify parents and merge diff are extracted
  try {
    const repo = new IsolatedRepo('scenario3c_merge');
    repo.makeCommit('initial commit on master', { 'master_base.txt': 'base content' });

    // Branch feature
    repo.runGit('checkout -b feature-alpha');
    repo.makeCommit('commit on feature branch', { 'feature.txt': 'feature work' });

    // Back to master
    repo.runGit('checkout master');
    repo.makeCommit('independent commit on master', { 'master_file.txt': 'master work' });

    // Merge
    repo.runGit('merge feature-alpha -m "Merge feature-alpha into master" --no-ff');
    const mergeSha = repo.runGit('rev-parse HEAD');

    // Run CLI
    const resMerge = repo.invokeCli(['generate', mergeSha], { AI_CONTENT_MOCK: '1' });
    const reportPath = path.join(repo.repoPath, 'content', 'analysis', `${mergeSha}.json`);
    let mergeHandled = false;
    if (resMerge.status === 0 && fs.existsSync(reportPath)) {
      const data = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      if (data.commit_sha === mergeSha) {
        mergeHandled = true;
      }
    }

    recordResult(
      '3.4: Merge commit (2 parents) processed cleanly via CLI',
      mergeHandled,
      `Exit code: ${resMerge.status}, Merge SHA: ${mergeSha}`
    );

    // Verify parents and merge header in Python context
    const pyMergeCheck = [
      '-c',
      [
        'from ai_content.git_context import collect_git_context;',
        `ctx = collect_git_context("${mergeSha}");`,
        'assert ctx.is_merge == True;',
        'assert len(ctx.parent_shas) == 2;',
        'assert "[MERGE COMMIT CONTEXT]" in ctx.diff;',
        'print(f"PARENTS={len(ctx.parent_shas)}|MERGE={ctx.is_merge}")'
      ].join(' ')
    ];
    const pyMergeRes = repo.invokeCli(pyMergeCheck, { AI_CONTENT_MOCK: '1' });
    const mergeContextVerified = pyMergeRes.stdout.includes('PARENTS=2|MERGE=True');

    recordResult(
      '3.5: Merge commit extracts 2 parent SHAs and contains [MERGE COMMIT CONTEXT] diff header',
      mergeContextVerified,
      `Output: ${pyMergeRes.stdout || pyMergeRes.stderr}`
    );

    repo.cleanup();
  } catch (err) {
    recordResult('3.4/3.5: Merge Commit', false, err.message);
  }

  // 3D: Detached HEAD -> verify commit SHA is correctly resolved
  try {
    const repo = new IsolatedRepo('scenario3d_detached');
    repo.makeCommit('c1', { 'f1.txt': '1' });
    const targetSha = repo.makeCommit('c2', { 'f2.txt': '2' });
    repo.makeCommit('c3', { 'f3.txt': '3' });

    // Detach HEAD to c2
    repo.runGit(`checkout --detach ${targetSha}`);

    const resDetach = repo.invokeCli(['generate', 'HEAD'], { AI_CONTENT_MOCK: '1' });
    const reportPath = path.join(repo.repoPath, 'content', 'analysis', `${targetSha}.json`);
    let detachResolved = false;

    if (resDetach.status === 0 && fs.existsSync(reportPath)) {
      const data = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      if (data.commit_sha === targetSha) {
        detachResolved = true;
      }
    }

    recordResult(
      '3.6: Detached HEAD correctly resolves target commit SHA and generates output',
      detachResolved,
      `Exit code: ${resDetach.status}, Resolved SHA: ${targetSha}, Report exists: ${fs.existsSync(reportPath)}`
    );

    repo.runGit('checkout master');
    repo.cleanup();
  } catch (err) {
    recordResult('3.6: Detached HEAD', false, err.message);
  }

  // =========================================================================
  // SCENARIO 4: Rapid sequential commits
  // =========================================================================
  logSection('Scenario 4: Rapid Sequential Commits & Atomic File Integrity');
  try {
    const repo = new IsolatedRepo('scenario4_rapid');
    const commitCount = 5;
    const generatedShas = [];

    // Make 5 distinct sequential commits and generate deliverables for each
    for (let i = 1; i <= commitCount; i++) {
      const sha = repo.makeCommit(`feat: sequential milestone commit ${i}`, {
        [`module_${i}.js`]: `export const mod_${i} = { version: ${i} };\n`
      });
      generatedShas.push(sha);

      const res = repo.invokeCli(['generate', sha], { AI_CONTENT_MOCK: '1' });
      if (res.status !== 0) {
        throw new Error(`Generation failed on commit ${i} (${sha}): ${res.stderr}`);
      }
    }

    // Verify all 5 deliverables exist independently
    let allDeliverablesValid = true;
    const analysisDir = path.join(repo.repoPath, 'content', 'analysis');
    const articlesDir = path.join(repo.repoPath, 'content', 'articles');
    const journalDir = path.join(repo.repoPath, 'content', 'journal');
    const socialDir = path.join(repo.repoPath, 'content', 'social');

    for (let i = 0; i < generatedShas.length; i++) {
      const sha = generatedShas[i];
      const repPath = path.join(analysisDir, `${sha}.json`);
      if (!fs.existsSync(repPath)) {
        allDeliverablesValid = false;
        break;
      }
      const data = JSON.parse(fs.readFileSync(repPath, 'utf8'));
      if (data.commit_sha !== sha) {
        allDeliverablesValid = false;
        break;
      }

      // Check articles, journal, social files for this SHA
      const artFiles = fs.readdirSync(articlesDir).filter(f => f.startsWith(sha));
      const jrnFiles = fs.readdirSync(journalDir).filter(f => f.startsWith(sha));
      const socFiles = fs.readdirSync(socialDir).filter(f => f.startsWith(sha));

      if (artFiles.length === 0 || jrnFiles.length === 0 || socFiles.length === 0) {
        allDeliverablesValid = false;
        break;
      }
    }

    // Check that no temporary (.tmp) files remain in any directory
    let noTmpFilesRemain = true;
    for (const dir of [analysisDir, articlesDir, journalDir, socialDir]) {
      const files = fs.readdirSync(dir);
      if (files.some(f => f.includes('.tmp'))) {
        noTmpFilesRemain = false;
        break;
      }
    }

    recordResult(
      '4.1: 5 rapid sequential commits produce 5 independent, distinct deliverables',
      allDeliverablesValid,
      `All 5 commits verified: ${allDeliverablesValid}, SHAs: ${generatedShas.map(s => s.substring(0, 7)).join(', ')}`
    );

    recordResult(
      '4.2: Atomic writing guarantees zero temporary (.tmp) files remain on disk',
      noTmpFilesRemain,
      `Zero .tmp remnants verified: ${noTmpFilesRemain}`
    );

    repo.cleanup();
  } catch (err) {
    recordResult('4.x: Rapid Sequential Commits', false, err.message);
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  logSection('Summary of Empirical Verification');
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;

  console.log(`Total Empirical Checks: ${total}`);
  console.log(`Passed:                 ${passed} (${((passed / total) * 100).toFixed(1)}%)`);
  console.log(`Failed:                 ${failed}`);
  console.log('='.repeat(70));

  if (failed > 0) {
    console.error('\nFAILED CHECKS:');
    results.filter(r => !r.passed).forEach(r => console.error(` - ${r.scenario}: ${r.details}`));
    process.exit(1);
  } else {
    console.log('\nAll Milestone 5 adversarial empirical challenges PASSED successfully!');
    process.exit(0);
  }
}

runAllScenarios().catch(err => {
  console.error('Fatal unhandled error in adversarial test runner:', err);
  process.exit(1);
});
