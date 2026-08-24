#!/usr/bin/env node

/**
 * Challenger 1 Runner for Milestone 4 (R4)
 */

const { globalContext, TestRunner } = require('./harness/test-runner');

// Load only the Challenger M4-1 test suite
require('./challenger-m4-1-adversarial.test');

async function main() {
  console.log('======================================================');
  console.log('  Challenger 1 Adversarial Test Runner — Milestone 4  ');
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
  console.error('Fatal error in challenger runner:', err);
  process.exit(1);
});
