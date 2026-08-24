#!/usr/bin/env node

const { globalContext, TestRunner } = require('./harness/test-runner');
require('./challenger-m3-multibank-stress.test');

async function main() {
  const runner = new TestRunner(globalContext);
  const results = await runner.run();
  console.log(`\n======================================================`);
  console.log(`Challenger 1 (Milestone 3) Stress Test Results:`);
  console.log(`Total: ${results.total}, Passed: ${results.passed}, Failed: ${results.failed}`);
  console.log(`======================================================\n`);
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error running challenger M3 tests:', err);
  process.exit(1);
});
