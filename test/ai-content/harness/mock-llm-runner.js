/**
 * Reference Oracle and Mock Runner for AI Development Content Generator
 * Implements the exact interface contract specified in PROJECT.md:
 * - Atomic write (.tmp -> rename)
 * - DevelopmentSessionReport JSON generation
 * - Technical article, dev journal, and X thread markdown generation
 * - Fast duplicate check (skips if content/analysis/<sha>.json exists unless --force/-f)
 * - Git post-commit hook installation and execution
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '') || 'content-update';
}

class MockLLMRunner {
  constructor(repoRoot) {
    this.repoRoot = path.resolve(repoRoot);
    this.contentDir = path.join(this.repoRoot, 'content');
    this.analysisDir = path.join(this.contentDir, 'analysis');
    this.articlesDir = path.join(this.contentDir, 'articles');
    this.journalDir = path.join(this.contentDir, 'journal');
    this.socialDir = path.join(this.contentDir, 'social');
    this.logsDir = path.join(this.contentDir, 'logs');
  }

  ensureDirs() {
    [this.analysisDir, this.articlesDir, this.journalDir, this.socialDir, this.logsDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  runGit(cmd) {
    return execSync(`git ${cmd}`, {
      cwd: this.repoRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  }

  resolveCommit(ref = 'HEAD') {
    try {
      const sha = this.runGit(`rev-parse --verify "${ref}^{commit}"`);
      const logOutput = this.runGit(`log -1 --format="%s%x1f%b%x1f%an%x1f%aI" ${sha}`);
      const parts = logOutput.split('\x1f');
      const subject = parts[0] || 'Update';
      const body = parts[1] || '';
      const author = parts[2] || 'Author';
      const date = parts[3] || new Date().toISOString();
      
      let changedFiles = [];
      try {
        const diffNames = this.runGit(`diff-tree --no-commit-id --name-only -r ${sha}`);
        if (diffNames) {
          changedFiles = diffNames.split('\n').filter(Boolean);
        }
      } catch {
        changedFiles = [];
      }

      return {
        sha,
        shortSha: sha.slice(0, 7),
        subject,
        body,
        author,
        date,
        changedFiles
      };
    } catch (err) {
      throw new Error(`Invalid or non-existent commit ref: "${ref}"`);
    }
  }

  generate(commitRef = 'HEAD', options = {}) {
    const force = Boolean(options.force || options.f);
    this.ensureDirs();

    // Fast-path 1: If commitRef is already a 40-char canonical SHA, check duplicate without any git commands
    if (/^[0-9a-f]{40}$/i.test(commitRef.trim())) {
      const sha = commitRef.trim().toLowerCase();
      const analysisFile = path.join(this.analysisDir, `${sha}.json`);
      if (fs.existsSync(analysisFile) && !force) {
        return {
          skipped: true,
          sha,
          message: `[INFO] Analysis for ${sha} already exists at ${analysisFile}. Skipping generation (use --force to override).`,
          files: { analysis: analysisFile }
        };
      }
    }

    // Resolve commit
    const commit = this.resolveCommit(commitRef);
    const sha = commit.sha;

    const analysisFile = path.join(this.analysisDir, `${sha}.json`);
    const analysisExists = fs.existsSync(analysisFile);

    // Fast-path 2: If resolved SHA analysis file exists and force is not set, skip generation
    if (analysisExists && !force) {
      return {
        skipped: true,
        sha,
        message: `[INFO] Analysis for ${sha} already exists at ${analysisFile}. Skipping generation (use --force to override).`,
        files: { analysis: analysisFile }
      };
    }

    const slug = slugify(commit.subject);
    const articleFile = path.join(this.articlesDir, `${sha}-${slug}.md`);
    const journalFile = path.join(this.journalDir, `${sha}-${slug}.md`);
    const socialFile = path.join(this.socialDir, `${sha}-${slug}.md`);

    const title = `Technical Deep Dive: ${commit.subject}`;

    // Generate DevelopmentSessionReport
    const reportData = {
      commit_sha: sha,
      timestamp: new Date().toISOString(),
      summary: `Automated analysis for commit ${commit.shortSha}: ${commit.subject}. ${commit.body ? commit.body.trim() : 'Session completed without issues.'}`,
      architecture_impact: commit.changedFiles.length > 0
        ? `Modifications in ${commit.changedFiles.join(', ')} maintain architectural integrity.`
        : 'Zero file delta detected (empty commit). Minimal architectural impact.',
      key_takeaways: [
        `Commit ${commit.shortSha} successfully analyzed`,
        `Files modified: ${commit.changedFiles.length > 0 ? commit.changedFiles.length : 0}`,
        'Atomic writing and duplicate protection verified'
      ],
      changed_components: commit.changedFiles.map(f => path.dirname(f)).filter((v, i, a) => a.indexOf(v) === i && v !== '.'),
      suggested_article_title: title,
      suggested_article_slug: slug
    };

    if (reportData.changed_components.length === 0) {
      reportData.changed_components = ['core'];
    }

    // Generate Technical Article
    const articleContent = [
      `# ${title}`,
      '',
      '## Executive Summary',
      reportData.summary,
      '',
      '## Architectural Breakdown',
      reportData.architecture_impact,
      '',
      '## Changes Overview',
      commit.changedFiles.length > 0
        ? commit.changedFiles.map(f => `- \`${f}\``).join('\n')
        : '_No file changes in this commit._',
      '',
      '## Key Technical Takeaways',
      reportData.key_takeaways.map(t => `- ${t}`).join('\n'),
      '',
      `_Commit ${commit.sha} by ${commit.author} on ${commit.date}_`
    ].join('\n');

    // Generate Dev Journal
    const journalContent = [
      `# Development Journal — ${commit.shortSha}`,
      '',
      `- **Date**: ${commit.date}`,
      `- **Commit**: \`${commit.sha}\``,
      `- **Author**: ${commit.author}`,
      '',
      '## Session Overview',
      reportData.summary,
      '',
      '## Engineering Challenges & Decisions',
      `Addressed changes across ${commit.changedFiles.length} file(s). Ensured atomic file updates and idempotency.`,
      '',
      '## Next Steps',
      'Proceed with integration testing and system verification.'
    ].join('\n');

    // Generate Social Thread
    const socialContent = [
      `1/4 🚀 Just pushed commit ${commit.shortSha}: ${commit.subject}!`,
      '',
      `2/4 🛠️ ${reportData.summary}`,
      '',
      `3/4 💡 Key takeaway: ${reportData.key_takeaways[0]}`,
      '',
      `4/4 📚 Full deep dive generated at content/articles/${sha}-${slug}.md #devlog #coding #ai`
    ].join('\n');

    // Atomic write contract: write to .tmp then rename
    this.atomicWrite(analysisFile, JSON.stringify(reportData, null, 2));
    this.atomicWrite(articleFile, articleContent);
    this.atomicWrite(journalFile, journalContent);
    this.atomicWrite(socialFile, socialContent);

    return {
      skipped: false,
      sha,
      slug,
      report: reportData,
      files: {
        analysis: analysisFile,
        article: articleFile,
        journal: journalFile,
        social: socialFile
      }
    };
  }

  atomicWrite(targetPath, content) {
    const tmpPath = `${targetPath}.tmp.${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const parentDir = path.dirname(targetPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(tmpPath, content, 'utf8');
    fs.renameSync(tmpPath, targetPath);
  }

  installHook() {
    const hooksDir = path.join(this.repoRoot, '.git', 'hooks');
    if (!fs.existsSync(hooksDir)) {
      fs.mkdirSync(hooksDir, { recursive: true });
    }

    const hookScriptPath = path.join(hooksDir, 'post-commit');
    // Shell hook script adhering to PROJECT.md § M4
    const hookScriptContent = [
      '#!/bin/sh',
      '# AI Development Content Generator — Post-Commit Hook',
      'unset GIT_INDEX_FILE GIT_DIR GIT_WORK_TREE',
      'COMMIT_SHA=$(git rev-parse HEAD 2>/dev/null)',
      'if [ -z "$COMMIT_SHA" ]; then exit 0; fi',
      '',
      '# Fast duplicate check in shell (<5ms)',
      'if [ -f "content/analysis/${COMMIT_SHA}.json" ]; then',
      '  exit 0',
      'fi',
      '',
      'mkdir -p content/logs',
      '# Spawn non-blocking background generator via nohup',
      'nohup node test/ai-content/harness/mock-cli-shim.js generate "$COMMIT_SHA" >> content/logs/post-commit.log 2>&1 < /dev/null &',
      'exit 0'
    ].join('\n');

    fs.writeFileSync(hookScriptPath, hookScriptContent, { encoding: 'utf8', mode: 0o755 });
    try {
      fs.chmodSync(hookScriptPath, 0o755);
    } catch {}

    return {
      success: true,
      hookPath: hookScriptPath
    };
  }

  status() {
    const hookPath = path.join(this.repoRoot, '.git', 'hooks', 'post-commit');
    const hookInstalled = fs.existsSync(hookPath);
    
    let analysisCount = 0;
    if (fs.existsSync(this.analysisDir)) {
      analysisCount = fs.readdirSync(this.analysisDir).filter(f => f.endsWith('.json')).length;
    }

    let headSha = 'N/A';
    try {
      headSha = this.runGit('rev-parse HEAD');
    } catch {}

    return {
      repoRoot: this.repoRoot,
      headSha,
      hookInstalled,
      analysisCount
    };
  }
}

module.exports = {
  MockLLMRunner,
  slugify
};
