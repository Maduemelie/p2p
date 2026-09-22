/**
 * Git Test Helper for AI Development Content Generator
 * Creates and manages isolated temporary Git repositories within the workspace for testing.
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const WORKSPACE_ROOT = path.resolve(__dirname, '../../..');
const SCRATCH_BASE = path.join(WORKSPACE_ROOT, '.test_scratch');

class TestRepo {
  constructor(repoPath) {
    this.repoPath = repoPath;
  }

  runGit(args, options = {}) {
    const cmd = `git ${args}`;
    try {
      const result = execSync(cmd, {
        cwd: this.repoPath,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'Test Author',
          GIT_AUTHOR_EMAIL: 'test@example.com',
          GIT_COMMITTER_NAME: 'Test Committer',
          GIT_COMMITTER_EMAIL: 'committer@example.com',
          ...options.env
        },
        ...options
      });
      return { success: true, stdout: result.trim(), stderr: '', exitCode: 0 };
    } catch (err) {
      return {
        success: false,
        stdout: (err.stdout || '').toString().trim(),
        stderr: (err.stderr || err.message || '').toString().trim(),
        exitCode: err.status !== undefined ? err.status : 1
      };
    }
  }

  getHeadSha() {
    const res = this.runGit('rev-parse HEAD');
    if (!res.success) {
      throw new Error(`Failed to get HEAD SHA: ${res.stderr}`);
    }
    return res.stdout.trim();
  }

  getShortSha() {
    const res = this.runGit('rev-parse --short HEAD');
    if (!res.success) {
      throw new Error(`Failed to get short SHA: ${res.stderr}`);
    }
    return res.stdout.trim();
  }

  writeFile(relPath, content) {
    const absPath = path.join(this.repoPath, relPath);
    const parent = path.dirname(absPath);
    if (!fs.existsSync(parent)) {
      fs.mkdirSync(parent, { recursive: true });
    }
    fs.writeFileSync(absPath, content, 'utf8');
    return absPath;
  }

  readFile(relPath) {
    const absPath = path.join(this.repoPath, relPath);
    if (!fs.existsSync(absPath)) return null;
    return fs.readFileSync(absPath, 'utf8');
  }

  fileExists(relPath) {
    return fs.existsSync(path.join(this.repoPath, relPath));
  }

  makeCommit(message, files = {}) {
    for (const [relPath, content] of Object.entries(files)) {
      this.writeFile(relPath, content);
    }
    this.runGit('add -A');
    const safeMsg = message.replace(/"/g, '\\"');
    const res = this.runGit(`commit -m "${safeMsg}"`);
    if (!res.success) {
      throw new Error(`Failed to create commit: ${res.stderr}`);
    }
    return this.getHeadSha();
  }

  makeEmptyCommit(message) {
    const safeMsg = message.replace(/"/g, '\\"');
    const res = this.runGit(`commit --allow-empty -m "${safeMsg}"`);
    if (!res.success) {
      throw new Error(`Failed to create empty commit: ${res.stderr}`);
    }
    return this.getHeadSha();
  }

  makeMergeCommit(branchName, commitMsg) {
    this.runGit(`checkout -b ${branchName}`);
    this.makeCommit(`commit on ${branchName}`, { [`${branchName}.txt`]: 'feature branch data' });
    this.runGit('checkout master');
    this.makeCommit('master commit ahead', { 'master.txt': 'master branch data' });
    const safeMsg = commitMsg.replace(/"/g, '\\"');
    const res = this.runGit(`merge ${branchName} -m "${safeMsg}" --no-ff`);
    if (!res.success) {
      throw new Error(`Failed to merge: ${res.stderr}`);
    }
    return this.getHeadSha();
  }

  cleanup() {
    try {
      if (fs.existsSync(this.repoPath)) {
        fs.rmSync(this.repoPath, { recursive: true, force: true });
      }
    } catch (e) {
      // Ignore cleanup error on Windows file locks
    }
  }
}

/**
 * Creates an isolated test git repository
 */
function createTestRepo(prefix = 'test_repo') {
  if (!fs.existsSync(SCRATCH_BASE)) {
    fs.mkdirSync(SCRATCH_BASE, { recursive: true });
  }

  const repoDir = path.join(
    SCRATCH_BASE,
    `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
  );
  fs.mkdirSync(repoDir, { recursive: true });

  const repo = new TestRepo(repoDir);
  repo.runGit('init -b master');
  repo.runGit('config user.name "Test User"');
  repo.runGit('config user.email "test@example.com"');

  // Initial commit
  repo.makeCommit('Initial commit', { 'README.md': '# Test Repository\n' });

  return repo;
}

/**
 * Clean all scratch repos
 */
function cleanupScratchBase() {
  try {
    if (fs.existsSync(SCRATCH_BASE)) {
      fs.rmSync(SCRATCH_BASE, { recursive: true, force: true });
    }
  } catch (e) {
    // Ignore cleanup error
  }
}

module.exports = {
  createTestRepo,
  cleanupScratchBase,
  TestRepo,
  WORKSPACE_ROOT,
  SCRATCH_BASE
};
