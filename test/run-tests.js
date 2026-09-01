#!/usr/bin/env node

/**
 * Main Test Runner Entry Point for Bybit NGN P2P Trade Tracker
 * Usage:
 *   node test/run-tests.js
 *   node test/run-tests.js --tier=1
 *   node test/run-tests.js --tier=2
 *   node test/run-tests.js --tier=3
 *   node test/run-tests.js --tier=4
 *   node test/run-tests.js --suite=fifo
 */

const { globalContext, TestRunner } = require('./harness/test-runner');

// 1. Load Tier 1 Suites: Feature Coverage
require('./tier1-feature-coverage/r1-m1-calculation-engine.test');
require('./tier1-feature-coverage/r1-m2-net-worth-widget.test');
require('./tier1-feature-coverage/r1-m3-snapshot-modal.test');
require('./tier1-feature-coverage/net-worth-features.test');
require('./tier1-feature-coverage/r1-api-security.test');
require('./tier1-feature-coverage/r2-fifo-accounting.test');
require('./tier1-feature-coverage/r3-multi-bank-reconciliation.test');
require('./tier1-feature-coverage/r4-search-navigation.test');
require('./tier1-feature-coverage/r4-m4-historical-analytics.test');
require('./tier1-feature-coverage/r5-offline-pwa.test');
require('./tier1-feature-coverage/active-buy-sell-ads.test');

// 2. Load Tier 2 Suites: Boundary & Corner Cases
require('./tier2-boundary-corner-cases/r1-boundary.test');
require('./tier2-boundary-corner-cases/r2-boundary.test');
require('./tier2-boundary-corner-cases/r3-boundary.test');
require('./tier2-boundary-corner-cases/r4-boundary.test');
require('./tier2-boundary-corner-cases/r5-boundary.test');
require('./tier2-boundary-corner-cases/net-worth-boundary.test');

// 3. Load Tier 3 Suites: Cross-Feature Combinations
require('./tier3-cross-feature/cross-feature-combinations.test');
require('./tier3-cross-feature/integration-flows.test');
require('./tier3-cross-feature/net-worth-cross-feature.test');

// 4. Load Tier 4 Suites: Real-World Scenarios
require('./tier4-real-world-scenarios/full-merchant-lifecycle.test');
require('./tier4-real-world-scenarios/arbitrage-reconciliation.test');
require('./tier4-real-world-scenarios/disaster-recovery-offline.test');
require('./tier4-real-world-scenarios/net-worth-merchant-lifecycle.test');

// 5. Load Challenger Suites
require('./challenger-m1-math-stress.test');
require('./challenger-m1-store-persistence-stress.test');
require('./challenger-m2-fifo-stress.test');
require('./challenger-m2-delta-badge-stress.test');
require('./challenger-m2-reactivity-adversarial.test');
require('./challenger-m3-multibank-stress.test');
require('./challenger-m3-persistence-events.test');
require('./challenger-m3-modal-validation-stress.test');
require('./empirical-bybit-offline-fallback-stress.test');
require('./challenger-m4-1-adversarial.test');
require('./challenger-m4-2-history-backup-stress.test');
require('./challenger-m4-chart-stress.test');
require('./challenger-m5-offline-stress.test');
require('./challenger-m5-2-stress.test');
require('./challenger-m5-1-capital-cycle-concurrency.test');
require('./challenger-m5-boundary-recovery-stress.test');
require('./challenger-final-day-simulation.test');

// Parse CLI flags
const args = process.argv.slice(2);
let tierFilter = null;
let suiteFilter = null;

args.forEach(arg => {
  if (arg.startsWith('--tier=')) {
    tierFilter = parseInt(arg.split('=')[1], 10);
  } else if (arg.startsWith('--suite=')) {
    suiteFilter = arg.split('=')[1];
  }
});

async function main() {
  const runner = new TestRunner(globalContext);
  const results = await runner.run({ tier: tierFilter, suite: suiteFilter });

  if (results.failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal error running test suite:', err);
  process.exit(1);
});
