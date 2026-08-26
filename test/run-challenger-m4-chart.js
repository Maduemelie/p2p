#!/usr/bin/env node

/**
 * Standalone Runner for Milestone 4 Chart.js Stress Suite
 */

const { globalContext, TestRunner } = require('./harness/test-runner');
require('./challenger-m4-chart-stress.test');

async function main() {
  console.log('================================================================');
  console.log('STARTING ADVERSARIAL CHALLENGER: Milestone 4 Chart.js Stress');
  console.log('================================================================\n');

  const runner = new TestRunner(globalContext);
  const results = await runner.run();

  if (results.failed > 0) {
    console.error(`\nFAILED: ${results.failed} tests failed!`);
    process.exit(1);
  } else {
    console.log(`\nSUCCESS: All ${results.passed} tests passed!`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal error running challenger runner:', err);
  process.exit(1);
});
