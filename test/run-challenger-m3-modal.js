#!/usr/bin/env node

/**
 * Milestone 3 Modal Validation & Rate Recalculation Challenger Test Runner
 */

const { globalContext, TestRunner } = require('./harness/test-runner');
require('./challenger-m3-modal-validation-stress.test');

async function main() {
  const runner = new TestRunner(globalContext);
  const results = await runner.run();
  console.log(`\n======================================================`);
  console.log(`Challenger M3 Modal Validation Stress Test Results:`);
  console.log(`Total: ${results.total}, Passed: ${results.passed}, Failed: ${results.failed}`);
  console.log(`======================================================\n`);
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error running challenger M3 modal validation tests:', err);
  process.exit(1);
});
