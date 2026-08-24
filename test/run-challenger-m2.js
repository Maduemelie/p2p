#!/usr/bin/env node

const { globalContext, TestRunner } = require('./harness/test-runner');
require('./challenger-m2-fifo-stress.test');

async function main() {
  const runner = new TestRunner(globalContext);
  const results = await runner.run();
  console.log(`\n======================================================`);
  console.log(`Challenger 2 (Milestone 2) Stress Test Results:`);
  console.log(`Total: ${results.total}, Passed: ${results.passed}, Failed: ${results.failed}`);
  console.log(`======================================================\n`);
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error running challenger tests:', err);
  process.exit(1);
});
