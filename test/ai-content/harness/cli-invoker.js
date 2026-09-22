/**
 * Unified CLI Invoker for E2E Tests
 * Supports:
 * 1. Real Python/uv CLI: `python -m ai_content.cli` or `uv run python -m ai_content.cli`
 * 2. Real NPM script: `npm run ai:content -- <args>`
 * 3. Mock CLI shim: `node test/ai-content/harness/mock-cli-shim.js <args>`
 *
 * Automatically detects whether real implementation exists or mock mode is requested.
 */

const path = require('path');
const { spawnSync } = require('child_process');
const fs = require('fs');

const WORKSPACE_ROOT = path.resolve(__dirname, '../../..');
const SHIM_SCRIPT = path.join(__dirname, 'mock-cli-shim.js');

/**
 * Check if real implementation is present in the workspace
 */
function isRealImplementationAvailable() {
  if (process.env.AI_CONTENT_FORCE_MOCK === '1' || process.env.USE_MOCK_RUNNER === '1') {
    return false;
  }
  const pyPackage = path.join(WORKSPACE_ROOT, 'ai_content');
  const pipelinePy = path.join(pyPackage, 'pipeline.py');
  return fs.existsSync(pipelinePy);
}

/**
 * Invokes the AI Content Generator CLI
 * @param {string} repoDir - Target Git repository directory
 * @param {string[]} args - CLI arguments (e.g. ['generate', 'HEAD', '--force'])
 * @param {object} options - Environment and invocation options
 * @returns {{ exitCode: number, stdout: string, stderr: string, durationMs: number }}
 */
function invokeCli(repoDir, args = [], options = {}) {
  const startTime = Date.now();
  const env = {
    ...process.env,
    AI_CONTENT_MOCK: options.mock !== undefined ? (options.mock ? '1' : '0') : (process.env.AI_CONTENT_MOCK || '1'),
    PYTHONPATH: process.env.PYTHONPATH ? `${WORKSPACE_ROOT}${path.delimiter}${process.env.PYTHONPATH}` : WORKSPACE_ROOT,
    ...options.env
  };

  const useReal = (options.useReal !== undefined ? options.useReal : isRealImplementationAvailable());

  let command;
  let cmdArgs;

  if (useReal) {
    // Prefer python module invocation
    command = process.platform === 'win32' ? 'python' : 'python3';
    cmdArgs = ['-m', 'ai_content.cli', ...args];
  } else {
    // Use Mock CLI Shim
    command = process.execPath; // node executable
    cmdArgs = [SHIM_SCRIPT, ...args];
  }

  const res = spawnSync(command, cmdArgs, {
    cwd: repoDir,
    encoding: 'utf8',
    env,
    timeout: options.timeout || 30000,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const durationMs = Date.now() - startTime;

  return {
    exitCode: res.status !== null ? res.status : 1,
    stdout: (res.stdout || '').trim(),
    stderr: (res.stderr || (res.error ? res.error.message : '')).trim(),
    durationMs,
    invokedWith: useReal ? 'real_python_cli' : 'mock_cli_shim'
  };
}

module.exports = {
  invokeCli,
  isRealImplementationAvailable,
  WORKSPACE_ROOT,
  SHIM_SCRIPT
};
