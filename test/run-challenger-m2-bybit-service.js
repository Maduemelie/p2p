#!/usr/bin/env node

/**
 * Test Runner: Challenger M2 Bybit Service & Error Mapping Adversarial Stress Suite
 * Role: m2_challenger_2
 */

const { globalContext, TestRunner } = require('./harness/test-runner');
require('./challenger-m2-bybit-service-stress.test');

async function main() {
  const runner = new TestRunner(globalContext);
  const results = await runner.run();

  console.log(`\n======================================================`);
  console.log(`Challenger M2: Bybit Service Adversarial Stress Results:`);
  console.log(`Total: ${results.total}, Passed: ${results.passed}, Failed: ${results.failed}`);
  console.log(`======================================================\n`);

  if (results.failed > 0) {
    console.error('Adversarial stress test failures detected:');
    for (const f of results.failures) {
      console.error(`- [${f.suiteTitle}] ${f.testTitle}: ${f.error.message}`);
    }
  }

  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error running challenger harness:', err);
  process.exit(1);
});
