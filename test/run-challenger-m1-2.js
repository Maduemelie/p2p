#!/usr/bin/env node

/**
 * Challenger M1-2 Runner: Adversarial Boundary & Edge Case Verification
 * Usage: node test/run-challenger-m1-2.js
 */

const { globalContext, TestRunner } = require('./harness/test-runner');
require('./challenger-m1-2-sweetspot-boundaries.test');

async function main() {
  const runner = new TestRunner(globalContext);
  const results = await runner.run();
  console.log(`\n======================================================`);
  console.log(`Challenger M1-2 Boundary & Edge Case Verification Results:`);
  console.log(`Total: ${results.total}, Passed: ${results.passed}, Failed: ${results.failed}`);
  console.log(`Duration: ${results.duration || 0}ms`);
  console.log(`======================================================\n`);
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error running challenger M1-2 tests:', err);
  process.exit(1);
});
