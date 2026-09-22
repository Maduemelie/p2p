/**
 * Challenger Suite: Milestone 2 Git Operations Empirical Verification
 * Role: m2_challenger_ai_2 (Milestone 2 Empirical Challenger 2)
 *
 * Requirements:
 * 1. Root commit (initial commit with 0 parents).
 * 2. Merge commit (2 parents).
 * 3. Empty commit (git commit --allow-empty).
 * 4. Detached HEAD (git checkout --detach).
 * 5. Huge diff (>5,000 lines or >30,000 chars) -> verify line-boundary truncation and summary banner.
 * 6. Binary file add/modify (both addition and modification of binary assets).
 * 7. Rename file tracking ('R' and old_filename).
 * 8. Invalid commit SHA (ffffffffffffffffffffffffffffffffffffffff) -> verify exit code 1.
 */

const { describe, it } = require('./harness/test-runner');
const { assert } = require('./harness/assertions');
const { spawnSync } = require('child_process');
const path = require('path');

const WORKSPACE_ROOT = path.resolve(__dirname, '..');

describe('[Tier 5] Challenger M2-2 — Empirical Git Operations Challenge', () => {

  it('1.1: Executes Python empirical challenge runner verifying all 8 Git edge-case scenarios', () => {
    // Run test/run_m2_empirical_tests.py
    const scriptPath = path.join(__dirname, 'run_m2_empirical_tests.py');
    const env = { ...process.env, PYTHONIOENCODING: 'utf-8' };
    let res = spawnSync('uv', ['run', 'python', scriptPath], {
      cwd: WORKSPACE_ROOT,
      encoding: 'utf8',
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000,
    });

    if (res.error || res.status !== 0) {
      // Fallback to direct python
      const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
      res = spawnSync(pyCmd, [scriptPath], {
        cwd: WORKSPACE_ROOT,
        encoding: 'utf8',
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 60000,
      });
    }

    const stdout = res.stdout || '';
    const stderr = res.stderr || '';

    assert.strictEqual(
      res.status,
      0,
      `Empirical test runner failed with exit code ${res.status}. stdout:\n${stdout}\nstderr:\n${stderr}`
    );

    assert.ok(stdout.includes('1. Root commit (0 parents)'), 'Must test root commit');
    assert.ok(stdout.includes('2. Merge commit (2 parents)'), 'Must test merge commit');
    assert.ok(stdout.includes('3. Empty commit'), 'Must test empty commit');
    assert.ok(stdout.includes('4. Detached HEAD'), 'Must test detached HEAD');
    assert.ok(stdout.includes('5. Huge diff (>5,000 lines / >30,000 chars)'), 'Must test huge diff truncation');
    assert.ok(stdout.includes('6. Binary file add/modify'), 'Must test binary file operations');
    assert.ok(stdout.includes('7. Rename file tracking'), 'Must test rename tracking');
    assert.ok(stdout.includes('8. Invalid commit SHA (ffffffffffffffffffffffffffffffffffffffff)'), 'Must test invalid commit SHA');
    assert.ok(
      stdout.includes('All 8 Milestone 2 empirical challenge scenarios PASSED'),
      'All 8 scenarios must pass 100%'
    );
  });

  it('1.2: Executes pytest empirical challenge test suite (test_m2_empirical_challenge.py)', () => {
    const testFile = path.join(__dirname, 'ai-content', 'test_m2_empirical_challenge.py');
    const env = { ...process.env, PYTHONIOENCODING: 'utf-8' };
    let res = spawnSync('uv', ['run', 'pytest', testFile, '-v'], {
      cwd: WORKSPACE_ROOT,
      encoding: 'utf8',
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000,
    });

    if (res.error || res.status !== 0) {
      // Fallback to direct python pytest module
      const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
      res = spawnSync(pyCmd, ['-m', 'pytest', testFile, '-v'], {
        cwd: WORKSPACE_ROOT,
        encoding: 'utf8',
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 60000,
      });
    }

    const stdout = res.stdout || '';
    const stderr = res.stderr || '';

    assert.strictEqual(
      res.status,
      0,
      `Pytest challenge suite failed with exit code ${res.status}.\nStdout:\n${stdout}\nStderr:\n${stderr}`
    );

    assert.ok(stdout.includes('passed') || stdout.includes('PASSED'), 'Pytest suite must report passed tests');
  });

});
