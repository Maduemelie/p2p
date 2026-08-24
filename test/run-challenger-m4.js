#!/usr/bin/env node

/**
 * Milestone 4 Challenger 2 Empirical Stress Test Runner
 * Focus: View Transitions, Navigation State Stack, Form Resetting Upon Cancel, Order Book Row Prefill & Trade Search Indexing
 */

const { globalContext, TestRunner } = require('./harness/test-runner');

// Load Challenger M4 Stress Test Suite
require('./challenger-m4-ux-navigation-stress.test');

async function runChallengerM4() {
  const runner = new TestRunner(globalContext);
  const results = await runner.run();

  console.log(`\n======================================================`);
  console.log(`Challenger 2 (Milestone 4) Empirical Stress Test Results:`);
  console.log(`Total: ${results.total}, Passed: ${results.passed}, Failed: ${results.failed}`);
  console.log(`Duration: ${results.duration || 0}ms`);
  console.log(`======================================================\n`);

  if (results.failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runChallengerM4().catch(err => {
  console.error('Fatal error in challenger 4 runner:', err);
  process.exit(1);
});
