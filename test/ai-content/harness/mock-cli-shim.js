#!/usr/bin/env node

/**
 * CLI Shim for AI Development Content Generator
 * Matches Click CLI specifications from PROJECT.md:
 * - `generate <commit_ref> [--force / -f]`
 * - `install-hook`
 * - `status`
 */

const path = require('path');
const { MockLLMRunner } = require('./mock-llm-runner');

function printUsage() {
  console.log(`Usage: ai:content [OPTIONS] COMMAND [ARGS]...

  AI Development Content Generator CLI.

Options:
  --help  Show this message and exit.

Commands:
  generate      Generate AI content for a specific commit reference.
  install-hook  Install asynchronous Git post-commit hook.
  status        Display status of git repository, hooks, and content.
`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const command = args[0];
  const runner = new MockLLMRunner(process.cwd());

  switch (command) {
    case 'generate': {
      let commitRef = 'HEAD';
      let force = false;

      for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--force' || arg === '-f') {
          force = true;
        } else if (!arg.startsWith('-')) {
          commitRef = arg;
        } else {
          console.error(`Error: Unknown option: ${arg}`);
          process.exit(2);
        }
      }

      try {
        const res = runner.generate(commitRef, { force });
        if (res.skipped) {
          console.log(res.message);
          process.exit(0);
        } else {
          console.log(`[SUCCESS] Generated AI content for ${res.sha} (${res.slug}):`);
          console.log(` - Analysis: ${res.files.analysis}`);
          console.log(` - Article:  ${res.files.article}`);
          console.log(` - Journal:  ${res.files.journal}`);
          console.log(` - Social:   ${res.files.social}`);
          process.exit(0);
        }
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
      break;
    }

    case 'install-hook': {
      try {
        const res = runner.installHook();
        console.log(`[SUCCESS] Post-commit hook installed at ${res.hookPath}`);
        process.exit(0);
      } catch (err) {
        console.error(`Error installing hook: ${err.message}`);
        process.exit(1);
      }
      break;
    }

    case 'status': {
      const stat = runner.status();
      console.log('AI Development Content Generator Status:');
      console.log(`  Repo Root:       ${stat.repoRoot}`);
      console.log(`  HEAD Commit:     ${stat.headSha}`);
      console.log(`  Hook Installed:  ${stat.hookInstalled ? 'Yes' : 'No'}`);
      console.log(`  Analyses Count:  ${stat.analysisCount}`);
      process.exit(0);
      break;
    }

    default:
      console.error(`Error: No such command '${command}'.`);
      printUsage();
      process.exit(2);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
