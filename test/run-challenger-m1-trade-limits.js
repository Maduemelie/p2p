#!/usr/bin/env node

/**
 * Challenger Runner: M1 Trade Limits Validation & Store Persistence Stress
 */

const { globalContext, TestRunner } = require('./harness/test-runner');
require('./challenger-m1-trade-limits-store.test');

async function main() {
  const runner = new TestRunner(globalContext);
  const results = await runner.run();
  console.log(`\n======================================================`);
  console.log(`Challenger M1: Trade Limits & Store Integrity Stress Results:`);
  console.log(`Total: ${results.total}, Passed: ${results.passed}, Failed: ${results.failed}`);
  console.log(`======================================================\n`);
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error running challenger tests:', err);
  process.exit(1);
});
