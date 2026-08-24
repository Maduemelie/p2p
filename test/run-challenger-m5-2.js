#!/usr/bin/env node

/**
 * Challenger 2 Runner for Milestone 5 (R5: Complete Offline PWA Pre-caching)
 */

const { globalContext, TestRunner } = require('./harness/test-runner');

// Load the Challenger M5-2 test suite
require('./challenger-m5-2-stress.test');

async function main() {
  console.log('======================================================');
  console.log('  Challenger 2 Adversarial Test Runner — Milestone 5  ');
  console.log('  (R5: Empirical JS Import Parity & Fetch Stress)     ');
  console.log('======================================================');

  const runner = new TestRunner(globalContext);
  const results = await runner.run();

  console.log('\n======================================================');
  console.log(`Results: ${results.passed} passed, ${results.failed} failed`);
  console.log('======================================================');

  if (results.failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal error in challenger 2 runner:', err);
  process.exit(1);
});
