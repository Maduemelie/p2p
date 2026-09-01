#!/usr/bin/env node

/**
 * Challenger 2 Runner: Adversarial Boundary Fuzzing, Invariants & UI Consistency Stress Testing
 * Usage: node test/run-challenger-2.js
 */

const { globalContext, TestRunner } = require('./harness/test-runner');
require('./challenger-2-boundary-fuzzing-stress.test');

async function main() {
  const runner = new TestRunner(globalContext);
  const results = await runner.run();
  console.log(`\n======================================================`);
  console.log(`Challenger 2 Empirical Boundary Fuzzing & Invariant Results:`);
  console.log(`Total: ${results.total}, Passed: ${results.passed}, Failed: ${results.failed}`);
  console.log(`Duration: ${results.duration || 0}ms`);
  console.log(`======================================================\n`);
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error running challenger 2 tests:', err);
  process.exit(1);
});
