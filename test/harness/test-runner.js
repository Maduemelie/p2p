/**
 * Multi-Tier E2E Test Suite Runner Engine
 */

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

class TestSuiteContext {
  constructor() {
    this.suites = [];
    this.currentSuite = null;
    this.beforeAllHooks = [];
    this.afterAllHooks = [];
  }

  describe(title, fn, options = {}) {
    const suite = {
      title,
      tier: options.tier || 1,
      category: options.category || 'General',
      tests: [],
      beforeEachHooks: [],
      afterEachHooks: [],
      beforeAllHooks: [],
      afterAllHooks: []
    };

    const prevSuite = this.currentSuite;
    this.currentSuite = suite;
    this.suites.push(suite);

    try {
      fn();
    } finally {
      this.currentSuite = prevSuite;
    }
  }

  it(title, fn) {
    if (!this.currentSuite) {
      throw new Error(`Test "${title}" must be defined inside a describe() block.`);
    }
    this.currentSuite.tests.push({
      title,
      fn,
      status: 'pending',
      error: null,
      duration: 0
    });
  }

  test(title, fn) {
    return this.it(title, fn);
  }

  beforeEach(fn) {
    if (this.currentSuite) this.currentSuite.beforeEachHooks.push(fn);
  }

  afterEach(fn) {
    if (this.currentSuite) this.currentSuite.afterEachHooks.push(fn);
  }

  beforeAll(fn) {
    if (this.currentSuite) this.currentSuite.beforeAllHooks.push(fn);
    else this.beforeAllHooks.push(fn);
  }

  afterAll(fn) {
    if (this.currentSuite) this.currentSuite.afterAllHooks.push(fn);
    else this.afterAllHooks.push(fn);
  }
}

class TestRunner {
  constructor(context) {
    this.context = context;
    this.results = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      duration: 0,
      failures: [],
      tierStats: {}
    };
  }

  async run(options = {}) {
    const startTime = Date.now();
    const filterTier = options.tier !== undefined ? Number(options.tier) : null;
    const filterSuite = options.suite ? String(options.suite).toLowerCase() : null;

    console.log(`${colors.bright}${colors.cyan}======================================================${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}  Bybit NGN P2P Trade Tracker — E2E Test Suite Runner${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}======================================================${colors.reset}`);
    if (filterTier) console.log(`${colors.dim}Filtering Tier: ${filterTier}${colors.reset}`);
    if (filterSuite) console.log(`${colors.dim}Filtering Suite: ${filterSuite}${colors.reset}`);
    console.log('');

    // Global beforeAll
    for (const hook of this.context.beforeAllHooks) {
      await hook();
    }

    for (const suite of this.context.suites) {
      if (filterTier && suite.tier !== filterTier) continue;
      if (filterSuite && !suite.title.toLowerCase().includes(filterSuite)) continue;

      const tierKey = `Tier ${suite.tier}`;
      if (!this.results.tierStats[tierKey]) {
        this.results.tierStats[tierKey] = { total: 0, passed: 0, failed: 0 };
      }

      console.log(`${colors.bright}${colors.blue}▶ [${tierKey}] ${suite.title}${colors.reset}`);

      // Suite beforeAll
      for (const hook of suite.beforeAllHooks) {
        await hook();
      }

      for (const t of suite.tests) {
        this.results.total++;
        this.results.tierStats[tierKey].total++;
        const testStartTime = Date.now();

        try {
          // beforeEach
          for (const hook of suite.beforeEachHooks) {
            await hook();
          }

          // Run test
          await t.fn();
          t.duration = Date.now() - testStartTime;
          t.status = 'passed';
          this.results.passed++;
          this.results.tierStats[tierKey].passed++;

          console.log(`  ${colors.green}✔${colors.reset} ${t.title} ${colors.dim}(${t.duration}ms)${colors.reset}`);
        } catch (err) {
          t.duration = Date.now() - testStartTime;
          t.status = 'failed';
          t.error = err;
          this.results.failed++;
          this.results.tierStats[tierKey].failed++;
          this.results.failures.push({
            suiteTitle: suite.title,
            tier: suite.tier,
            testTitle: t.title,
            error: err
          });

          console.log(`  ${colors.red}✖${colors.reset} ${t.title} ${colors.dim}(${t.duration}ms)${colors.reset}`);
          console.log(`    ${colors.red}${err.message}${colors.reset}`);
        } finally {
          // afterEach
          for (const hook of suite.afterEachHooks) {
            try {
              await hook();
            } catch (afterErr) {
              console.error(`${colors.yellow}Warning in afterEach hook:${colors.reset}`, afterErr);
            }
          }
        }
      }

      // Suite afterAll
      for (const hook of suite.afterAllHooks) {
        await hook();
      }

      console.log('');
    }

    // Global afterAll
    for (const hook of this.context.afterAllHooks) {
      await hook();
    }

    this.results.duration = Date.now() - startTime;
    this.printSummary();

    return this.results;
  }

  printSummary() {
    console.log(`${colors.bright}${colors.cyan}------------------------------------------------------${colors.reset}`);
    console.log(`${colors.bright}Test Execution Summary:${colors.reset}`);
    console.log(`Total Tests : ${this.results.total}`);
    console.log(`Passed      : ${colors.green}${this.results.passed}${colors.reset}`);
    console.log(`Failed      : ${this.results.failed > 0 ? colors.red : colors.dim}${this.results.failed}${colors.reset}`);
    console.log(`Duration    : ${this.results.duration}ms`);
    console.log('');

    console.log(`${colors.bright}Tier Breakdown:${colors.reset}`);
    for (const [tier, stats] of Object.entries(this.results.tierStats)) {
      const passRate = stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(1) : 0;
      const statColor = stats.failed === 0 ? colors.green : colors.red;
      console.log(`  ${tier.padEnd(8)}: ${statColor}${stats.passed}/${stats.total} passed (${passRate}%)${colors.reset}`);
    }

    if (this.results.failures.length > 0) {
      console.log('');
      console.log(`${colors.bright}${colors.red}Detailed Failures (${this.results.failures.length}):${colors.reset}`);
      this.results.failures.forEach((f, idx) => {
        console.log(`\n${colors.red}${idx + 1}) [Tier ${f.tier}] ${f.suiteTitle} > ${f.testTitle}${colors.reset}`);
        console.log(`   ${colors.yellow}${f.error.stack || f.error.message}${colors.reset}`);
      });
    }
    console.log(`${colors.bright}${colors.cyan}======================================================${colors.reset}`);
  }
}

const globalContext = new TestSuiteContext();

module.exports = {
  globalContext,
  describe: (title, fn, options) => globalContext.describe(title, fn, options),
  it: (title, fn) => globalContext.it(title, fn),
  test: (title, fn) => globalContext.test(title, fn),
  beforeEach: (fn) => globalContext.beforeEach(fn),
  afterEach: (fn) => globalContext.afterEach(fn),
  beforeAll: (fn) => globalContext.beforeAll(fn),
  afterAll: (fn) => globalContext.afterAll(fn),
  TestRunner
};
