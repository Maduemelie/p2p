/**
 * Empirical Adversarial Challenger Test: Bybit Offline / Failure State & Reference Rate Fallback
 * 
 * Objectives:
 *  1. Empirically verify that when Bybit API fails or goes offline, latestActiveAd is cleanly reset to null.
 *  2. Empirically verify rate resolution falls back cleanly through priority tiers:
 *     - Priority 2: Latest Trade rate
 *     - Priority 3: FIFO avg buy cost
 *     - Priority 4: Opening default cost basis
 *     - Priority 5: System default fallback rate (1500.00)
 *  3. Verify no stale prices leak from earlier online sessions into widget or modal.
 *  4. Verify rapid oscillating online/offline state machine transitions.
 *  5. Verify snapshot persistence and delta badge alignment during offline states.
 */

const { describe, it, beforeEach } = require('./harness/test-runner');
const { assert } = require('./harness/assertions');
const { setupDomEnvironment } = require('./harness/dom-mock');

let utils;
let store;
let STORAGE_KEYS;
let dashboardView;
let modalsView;
let dashboardModule;
let bybitServiceModule;
let dom;
let toastLogs = [];

async function setupTestEnvironment() {
  dom = setupDomEnvironment();
  utils = await import('../js/utils.js');
  const storeMod = await import('../js/store.js');
  store = storeMod.store;
  STORAGE_KEYS = storeMod.STORAGE_KEYS;
  dashboardView = await import('../js/views/dashboard.view.js');
  modalsView = await import('../js/views/modals.view.js');
  dashboardModule = await import('../js/dashboard.js');
  bybitServiceModule = await import('../js/bybitService.js');

  store.clearAllData();
  toastLogs = [];

  window.showToast = (msg, type) => {
    toastLogs.push({ msg, type });
  };

  // Reset Bybit mocks
  bybitServiceModule.bybitService.fetchFundingBalance = async () => {
    throw new Error('Offline default');
  };
  bybitServiceModule.bybitService.fetchActiveAds = async () => {
    throw new Error('Offline default');
  };

  // Render full DOM container
  const container = document.getElementById('view-container') || document.body;
  container.innerHTML = `
    <div id="main-content">
      ${dashboardView.renderDashboardView()}
    </div>
    <div id="modals-container">
      ${modalsView.renderModalsView()}
    </div>
    <div id="toast-container"></div>
  `;

  const canvas = document.getElementById('pnlChart');
  if (canvas) {
    canvas.getContext = () => ({
      createLinearGradient: () => ({ addColorStop: () => {} }),
      clearRect: () => {},
      fillRect: () => {}
    });
  }

  // Clear live inventory state in dashboardModule
  await dashboardModule.syncBybitLiveInventory();

  return { utils, store, dashboardView, modalsView, dashboardModule, bybitServiceModule };
}

describe('Empirical Challenger — Bybit Offline Reset & Reference Rate Fallback Suite', () => {
  beforeEach(async () => {
    await setupTestEnvironment();
  });

  it('EMP-1: Online sell ad is used, then network failure immediately resets latestActiveAd to null and switches rate', async () => {
    store.addBankAccount({ name: 'Access Bank', initialBalance: 1000000 });
    store.setOpeningInventory({ startingUsdtBalance: 500, defaultCostBasis: 1520.00 });

    // Step 1: Bybit is ONLINE with an active Sell Ad @ 1680.00
    bybitServiceModule.bybitService.fetchActiveAds = async () => [
      { id: 'ad-online-1', side: 1, status: 10, price: '1680.00', lastQuantity: '300', frozenQuantity: '50' }
    ];
    bybitServiceModule.bybitService.fetchFundingBalance = async () => ({
      balance: [{ coin: 'USDT', transferBalance: '500.00' }]
    });

    dashboardModule.initDashboard();
    await dashboardModule.syncBybitLiveInventory();
    await dashboardModule.syncAndRenderActiveAd();

    // Verify online state in DOM and modal
    const elRefRate = document.getElementById('metric-nw-ref-rate');
    const elNetWorthNgn = document.getElementById('stat-net-worth-ngn');
    assert.strictEqual(elRefRate.textContent, '₦1,680.00 / USDT', 'Live widget must show active ad rate');
    
    // Net worth = 1,000,000 + (500 * 1680) = 1,840,000.00
    assert.ok(elNetWorthNgn.textContent.includes('1,840,000.00'), 'Net worth should be calculated with 1680 rate');

    dashboardModule.openSnapshotModal();
    const modalRate = document.getElementById('input-snapshot-ref-rate');
    const modalBadge = document.getElementById('snapshot-rate-source-badge');
    assert.strictEqual(modalRate.value, '1680', 'Modal should prefill active ad rate');
    assert.strictEqual(modalBadge.textContent, 'Active Ad Rate', 'Modal should indicate Active Ad Rate');

    // Close modal
    document.getElementById('btn-cancel-snapshot-modal').click();

    // Step 2: Bybit goes OFFLINE / throws error
    bybitServiceModule.bybitService.fetchActiveAds = async () => {
      throw new Error('503 Service Unavailable / Network Timeout');
    };

    await dashboardModule.syncAndRenderActiveAd();

    // Verify rate immediately falls back to FIFO cost basis (1520.00)
    assert.strictEqual(elRefRate.textContent, '₦1,520.00 / USDT', 'Live widget must immediately drop stale ad rate and show FIFO cost');
    
    // Net worth = 1,000,000 + (500 * 1520) = 1,760,000.00
    assert.ok(elNetWorthNgn.textContent.includes('1,760,000.00'), 'Net worth should recalculate to 1,760,000 using fallback rate');

    // Verify modal prefill reflects clean fallback without stale 1680
    dashboardModule.openSnapshotModal();
    assert.strictEqual(modalRate.value, '1520', 'Modal must prefill fallback FIFO rate 1520, not stale 1680');
    assert.strictEqual(modalBadge.textContent, 'FIFO Cost', 'Modal badge must indicate FIFO Cost');
  });

  it('EMP-2: Rate fallback priority hierarchy is strictly respected when offline', async () => {
    store.addBankAccount({ name: 'Zenith Bank', initialBalance: 2000000 });

    // Setup: Bybit API always fails
    bybitServiceModule.bybitService.fetchActiveAds = async () => {
      throw new Error('Connection refused');
    };

    // Subcase 2A: With Latest Trade, Trade rate wins (Priority 2)
    store.setOpeningInventory({ startingUsdtBalance: 100, defaultCostBasis: 1400.00 });
    store.addTrade({
      type: 'BUY',
      usdtAmount: 100,
      ngnAmount: 155000,
      rate: 1550.00,
      date: '2026-08-20T10:00:00.000Z'
    });
    store.addTrade({
      type: 'SELL',
      usdtAmount: 50,
      ngnAmount: 79000,
      rate: 1580.00,
      date: '2026-08-22T10:00:00.000Z'
    });

    dashboardModule.initDashboard();
    await dashboardModule.syncAndRenderActiveAd();

    const elRefRate = document.getElementById('metric-nw-ref-rate');
    assert.strictEqual(elRefRate.textContent, '₦1,580.00 / USDT', 'Should fall back to latest trade rate (1580)');

    dashboardModule.openSnapshotModal();
    assert.strictEqual(document.getElementById('input-snapshot-ref-rate').value, '1580');
    assert.strictEqual(document.getElementById('snapshot-rate-source-badge').textContent, 'Latest Trade');
    document.getElementById('btn-cancel-snapshot-modal').click();

    // Subcase 2B: No trades, only FIFO opening inventory (Priority 3)
    store.clearAllData();
    store.addBankAccount({ name: 'Zenith Bank', initialBalance: 2000000 });
    store.setOpeningInventory({ startingUsdtBalance: 200, defaultCostBasis: 1535.50 });

    dashboardModule.initDashboard();
    await dashboardModule.syncAndRenderActiveAd();

    assert.strictEqual(elRefRate.textContent, '₦1,535.50 / USDT', 'Should fall back to FIFO holding cost (1535.50)');
    dashboardModule.openSnapshotModal();
    assert.strictEqual(document.getElementById('input-snapshot-ref-rate').value, '1535.5');
    assert.strictEqual(document.getElementById('snapshot-rate-source-badge').textContent, 'FIFO Cost');
    document.getElementById('btn-cancel-snapshot-modal').click();

    // Subcase 2C: 0 inventory USDT, opening defaultCostBasis (Priority 4)
    store.clearAllData();
    store.addBankAccount({ name: 'Zenith Bank', initialBalance: 2000000 });
    store.setOpeningInventory({ startingUsdtBalance: 0, defaultCostBasis: 1490.00 });

    dashboardModule.initDashboard();
    await dashboardModule.syncAndRenderActiveAd();

    assert.strictEqual(elRefRate.textContent, '₦1,490.00 / USDT', 'Should fall back to opening defaultCostBasis (1490.00)');
    dashboardModule.openSnapshotModal();
    assert.strictEqual(document.getElementById('input-snapshot-ref-rate').value, '1490');
    assert.strictEqual(document.getElementById('snapshot-rate-source-badge').textContent, 'Default Rate');
    document.getElementById('btn-cancel-snapshot-modal').click();

    // Subcase 2D: Completely unconfigured / zero defaults (Priority 5 fallback 1500.00)
    store.clearAllData();
    store.addBankAccount({ name: 'Zenith Bank', initialBalance: 2000000 });

    dashboardModule.initDashboard();
    await dashboardModule.syncAndRenderActiveAd();

    assert.strictEqual(elRefRate.textContent, '₦1,500.00 / USDT', 'Should fall back to system default 1500.00');
    dashboardModule.openSnapshotModal();
    assert.strictEqual(document.getElementById('input-snapshot-ref-rate').value, '1500');
    assert.strictEqual(document.getElementById('snapshot-rate-source-badge').textContent, 'Default Rate');
  });

  it('EMP-3: 50-cycle oscillating connectivity stress test guarantees zero stale price leakage', async () => {
    store.addBankAccount({ name: 'Kuda Bank', initialBalance: 5000000 });
    store.setOpeningInventory({ startingUsdtBalance: 1000, defaultCostBasis: 1515.00 });

    dashboardModule.initDashboard();

    for (let cycle = 1; cycle <= 50; cycle++) {
      const dynamicAdPrice = (1600 + (cycle * 3.5)).toFixed(2);

      // Phase A: Online with dynamic ad price
      bybitServiceModule.bybitService.fetchActiveAds = async () => [
        { id: `ad-${cycle}`, side: 1, status: 10, price: dynamicAdPrice, lastQuantity: '100', frozenQuantity: '0' }
      ];
      await dashboardModule.syncAndRenderActiveAd();

      // Check online resolution
      const elRefRate = document.getElementById('metric-nw-ref-rate');
      const expectedOnlineFormatted = `₦${Number(dynamicAdPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / USDT`;
      assert.strictEqual(elRefRate.textContent, expectedOnlineFormatted, `Cycle ${cycle} online rate mismatch`);

      // Phase B: Offline failure
      const errorTypes = [
        new Error('ETIMEDOUT: Connection timed out'),
        new Error('HTTP 500 Internal Server Error'),
        new Error('HTTP 403 Forbidden - IP Restricted'),
        new Error('Fetch failed: network down'),
        new Error('AbortError: signal timed out')
      ];
      const selectedError = errorTypes[cycle % errorTypes.length];
      bybitServiceModule.bybitService.fetchActiveAds = async () => {
        throw selectedError;
      };

      await dashboardModule.syncAndRenderActiveAd();

      // Check that stale dynamicAdPrice is NEVER retained
      assert.strictEqual(elRefRate.textContent, '₦1,515.00 / USDT', `Cycle ${cycle} offline failed to fall back to 1515.00, retained stale price!`);

      // Verify modal immediately reflects fallback
      dashboardModule.openSnapshotModal();
      const modalRate = document.getElementById('input-snapshot-ref-rate');
      assert.strictEqual(modalRate.value, '1515', `Cycle ${cycle} modal retained stale online rate`);
      document.getElementById('btn-cancel-snapshot-modal').click();
    }
  });

  it('EMP-4: Snapshot saved during offline state maintains 0.00% delta baseline with live dashboard', async () => {
    store.addBankAccount({ name: 'Stanbic IBTC', initialBalance: 3000000 });
    store.setOpeningInventory({ startingUsdtBalance: 800, defaultCostBasis: 1540.00 });

    // Step 1: Online sync with ad @ 1720.00
    bybitServiceModule.bybitService.fetchActiveAds = async () => [
      { id: 'ad-online', side: 1, status: 10, price: '1720.00', lastQuantity: '800', frozenQuantity: '0' }
    ];
    dashboardModule.initDashboard();
    await dashboardModule.syncBybitLiveInventory();
    await dashboardModule.syncAndRenderActiveAd();

    // Step 2: Go offline
    bybitServiceModule.bybitService.fetchActiveAds = async () => {
      throw new Error('Offline');
    };
    bybitServiceModule.bybitService.fetchFundingBalance = async () => {
      throw new Error('Offline');
    };
    await dashboardModule.syncBybitLiveInventory();
    await dashboardModule.syncAndRenderActiveAd();

    // Step 3: Open snapshot modal and submit with default prefilled rate (1540.00)
    dashboardModule.openSnapshotModal();
    const form = document.getElementById('form-save-snapshot');
    form.dispatchEvent(new CustomEvent('submit', { cancelable: true }));

    // Step 4: Verify snapshot saved in store
    const snapshots = store.getSnapshots();
    assert.strictEqual(snapshots.length, 1, 'Snapshot should be saved');
    assert.strictEqual(snapshots[0].referenceRate, 1540, 'Snapshot should use fallback rate 1540');
    assert.strictEqual(snapshots[0].bankCash, 3000000);
    assert.strictEqual(snapshots[0].usdtBalance, 800);
    
    // Net worth = 3,000,000 + (800 * 1540) = 4,232,000.00
    assert.strictEqual(snapshots[0].netWorthNgn, 4232000);

    // Step 5: Check live hero card delta badge
    const deltaBadge = document.getElementById('badge-net-worth-delta');
    assert.ok(deltaBadge, 'Delta badge must exist');
    assert.ok(
      deltaBadge.textContent.includes('₦0.00 (0.00%)') || deltaBadge.textContent.includes('0.00%'),
      `Delta badge should be flat 0.00%, actual: ${deltaBadge.textContent}`
    );
  });
});
