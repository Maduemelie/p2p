#!/usr/bin/env node

/**
 * Milestone 3 Challenger 2 Stress Test Runner
 * Focus: Multi-Bank Reconciliation, Ledger Math, Batch Imports, Modal Stress Testing
 */

const { globalContext, TestRunner } = require('./harness/test-runner');

// Load Challenger M3-2 Stress Test Suite
require('./challenger-m3-bank-reconciliation-stress.test');
require('./challenger-m3-persistence-events.test');

async function runChallengerM3_2() {
  const runner = new TestRunner(globalContext);
  const results = await runner.run();

  console.log(`\n======================================================`);
  console.log(`Challenger 2 (Milestone 3) Stress Test Results:`);
  console.log(`Total: ${results.total}, Passed: ${results.passed}, Failed: ${results.failed}`);
  console.log(`======================================================\n`);

  if (results.failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runChallengerM3_2().catch(err => {
  console.error('Fatal error in challenger 2 runner:', err);
  process.exit(1);
});
