#!/usr/bin/env node

/**
 * AI Development Content Generator — E2E Test Suite Runner
 * Usage:
 *   node test/ai-content/run-e2e.js
 *   node test/ai-content/run-e2e.js --tier=1
 *   node test/ai-content/run-e2e.js --tier=2
 *   node test/ai-content/run-e2e.js --tier=3
 *   node test/ai-content/run-e2e.js --tier=4
 *   node test/ai-content/run-e2e.js --tier=5
 *   node test/ai-content/run-e2e.js --live
 */

const path = require('path');
const { globalContext, TestRunner } = require('../harness/test-runner');
const { cleanupScratchBase } = require('./harness/git-test-helper');

// Parse CLI flags
const args = process.argv.slice(2);
let tierFilter = null;
let liveMode = false;

for (const arg of args) {
  if (arg.startsWith('--tier=')) {
    tierFilter = parseInt(arg.split('=')[1], 10);
  } else if (arg === '--live') {
    liveMode = true;
  }
}

// Configure Mock / Live mode
if (!liveMode) {
  process.env.AI_CONTENT_MOCK = '1';
}

console.log('======================================================');
console.log('AI Development Content Generator — E2E Test Runner');
console.log(`Execution Mode : ${liveMode ? 'LIVE GEMINI API' : 'DETERMINISTIC MOCK MODE (AI_CONTENT_MOCK=1)'}`);
if (tierFilter) {
  console.log(`Tier Filter    : Tier ${tierFilter} only`);
}
console.log('======================================================\n');

// 1. Tier 1: Feature Coverage
require('./tier1_feature/cli-generation.test');
require('./tier1_feature/report-schema.test');
require('./tier1_feature/markdown-outputs.test');

// 2. Tier 2: Boundary & Corner Cases
require('./tier2_boundary/duplicate-skipping.test');
require('./tier2_boundary/force-regeneration.test');
require('./tier2_boundary/invalid-and-empty.test');

// 3. Tier 3: Cross-Feature Combinations
require('./tier3_combination/cli-flags-combinations.test');
require('./tier3_combination/cli-subcommands.test');
require('./tier3_combination/hook-duplicate-integration.test');

// 4. Tier 4: Real-World Application Scenarios
require('./tier4_realworld/end-to-end-workflow.test');
require('./tier4_realworld/hook-latency.test');

// 5. Tier 5: Adversarial Hardening
require('./tier5_adversarial/adversarial-edge-cases.test');

// Ensure scratch directory cleanup after all tests
globalContext.afterAll(() => {
  cleanupScratchBase();
});

// Run tests
async function run() {
  const runner = new TestRunner(globalContext);
  const options = {};
  if (tierFilter) {
    options.tier = tierFilter;
  }

  const results = await runner.run(options);

  // Final cleanup
  cleanupScratchBase();

  if (results.failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run().catch(err => {
  console.error('Fatal test runner error:', err);
  cleanupScratchBase();
  process.exit(1);
});
