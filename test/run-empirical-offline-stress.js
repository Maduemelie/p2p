#!/usr/bin/env node

/**
 * Empirical Bybit Offline & Rate Fallback Runner
 */

const { globalContext, TestRunner } = require('./harness/test-runner');

require('./empirical-bybit-offline-fallback-stress.test');

async function runEmpiricalStress() {
  const runner = new TestRunner(globalContext);
  const results = await runner.run();

  console.log(`\n======================================================`);
  console.log(`Empirical Offline & Rate Fallback Stress Test Results:`);
  console.log(`Total: ${results.total}, Passed: ${results.passed}, Failed: ${results.failed}`);
  console.log(`======================================================\n`);

  if (results.failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runEmpiricalStress().catch(err => {
  console.error('Fatal error in empirical runner:', err);
  process.exit(1);
});
