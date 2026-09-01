/**
 * Tier 1: Feature Coverage — Active Bybit Buy & Sell Ads Verification Suite
 */

const { describe, it, beforeEach } = require('../harness/test-runner');
const { assert } = require('../harness/assertions');
const { setupDomEnvironment } = require('../harness/dom-mock');

describe('Tier 1 — Active Buy & Sell Ads Suite', () => {
  let dom;
  let utils;
  let store;
  let dashboardView;
  let dashboardModule;
  let bybitServiceModule;
  let settingsView;
  let settingsModule;
  let originalFetchActiveAds;
  let originalFetchFundingBalance;
  let originalFetch;

  beforeEach(async () => {
    dom = setupDomEnvironment();
    utils = await import('../../js/utils.js');
    const storeModule = await import('../../js/store.js');
    store = storeModule.store;
    dashboardView = await import('../../js/views/dashboard.view.js');
    dashboardModule = await import('../../js/dashboard.js');
    bybitServiceModule = await import('../../js/bybitService.js');
    settingsView = await import('../../js/views/settings.view.js');
    settingsModule = await import('../../js/settings.js');
    
    if (!originalFetchActiveAds) {
      originalFetchActiveAds = bybitServiceModule.bybitService.fetchActiveAds;
    }
    if (!originalFetchFundingBalance) {
      originalFetchFundingBalance = bybitServiceModule.bybitService.fetchFundingBalance;
    }
    if (!originalFetch) {
      originalFetch = global.fetch;
    }
    bybitServiceModule.bybitService.fetchActiveAds = originalFetchActiveAds;
    bybitServiceModule.bybitService.fetchFundingBalance = originalFetchFundingBalance;
    global.fetch = originalFetch;

    store.clearAllData();

    // Attach Dashboard View markup to DOM
    const viewContainer = dom.document.getElementById('main-content') || dom.document.body;
    viewContainer.innerHTML = dashboardView.renderDashboardView();
  });

  // ========================================================
  // 1. Dashboard DOM Elements for Buy & Sell Ads
  // ========================================================
  it('ADS.1: renderDashboardView() includes dedicated Buy Ad and Sell Ad cards and metric elements', () => {
    const html = dashboardView.renderDashboardView();
    // Sell ad elements
    assert.ok(html.includes('id="card-active-ad-spread"'), 'Must contain Sell ad card');
    assert.ok(html.includes('id="active-ad-badge"'), 'Must contain Sell ad badge');
    assert.ok(html.includes('id="active-ad-title"'), 'Must contain Sell ad title');
    assert.ok(html.includes('id="metric-ad-sell-price"'), 'Must contain Sell ad price');
    assert.ok(html.includes('id="metric-ad-qty-stock"'), 'Must contain Sell ad qty');
    assert.ok(html.includes('id="metric-ad-avg-buy-cost"'), 'Must contain Sell ad avg buy cost');
    assert.ok(html.includes('id="metric-ad-spread-usdt"'), 'Must contain Sell ad spread');
    assert.ok(html.includes('id="metric-ad-margin-pct"'), 'Must contain Sell ad margin pct');
    assert.ok(html.includes('id="metric-ad-projected-pnl"'), 'Must contain Sell ad projected pnl');

    // Buy ad elements
    assert.ok(html.includes('id="card-active-buy-ad"'), 'Must contain Buy ad card');
    assert.ok(html.includes('id="active-buy-ad-badge"'), 'Must contain Buy ad badge');
    assert.ok(html.includes('id="active-buy-ad-title"'), 'Must contain Buy ad title');
    assert.ok(html.includes('id="metric-ad-buy-price"'), 'Must contain Buy ad price');
    assert.ok(html.includes('id="metric-ad-qty-buy"'), 'Must contain Buy ad qty');
    assert.ok(html.includes('id="metric-ad-buy-fiat"'), 'Must contain Buy ad fiat allocation');
    assert.ok(html.includes('id="metric-ad-buy-status"'), 'Must contain Buy ad status');
  });

  // ========================================================
  // 2. Active Buy Ad Rendering
  // ========================================================
  it('ADS.2: syncAndRenderActiveAd() renders active Buy Ad with accurate price, target USDT, and fiat allocation', async () => {
    // Mock Bybit Service returning an active Buy Ad (side: 0, price: 1480.50, lastQty: 500, frozenQty: 100)
    bybitServiceModule.bybitService.fetchActiveAds = async () => [
      {
        id: 'buy_ad_101',
        side: '0',
        status: '10',
        price: '1480.50',
        lastQuantity: '500.00',
        frozenQuantity: '100.00',
        tokenId: 'USDT',
        currencyId: 'NGN'
      }
    ];

    await dashboardModule.syncAndRenderActiveAd();

    const buyBadge = dom.document.getElementById('active-buy-ad-badge');
    const buyTitle = dom.document.getElementById('active-buy-ad-title');
    const metricBuyPrice = dom.document.getElementById('metric-ad-buy-price');
    const metricBuyQty = dom.document.getElementById('metric-ad-qty-buy');
    const metricBuyFiat = dom.document.getElementById('metric-ad-buy-fiat');
    const metricBuyStatus = dom.document.getElementById('metric-ad-buy-status');

    assert.ok(buyBadge.className.includes('live-badge'), 'Buy badge must be active live-badge');
    assert.ok(buyBadge.innerHTML.includes('Active Buy Ad'), 'Buy badge must display Active Buy Ad');
    assert.strictEqual(buyTitle.textContent, 'Bybit Buy Ad #buy_ad_101');
    assert.strictEqual(metricBuyPrice.textContent, '₦1,480.50');
    assert.strictEqual(metricBuyQty.textContent, '600.00 USDT targeted');
    // Fiat allocation = 600 * 1480.50 = 888,300
    assert.strictEqual(metricBuyFiat.textContent, '₦888,300.00');
    assert.strictEqual(metricBuyStatus.textContent, 'Online / Active');
    assert.ok(metricBuyStatus.className.includes('text-success'), 'Online status must have text-success');
  });

  // ========================================================
  // 3. Concurrent Active Buy & Sell Ads
  // ========================================================
  it('ADS.3: syncAndRenderActiveAd() renders both Buy Ad and Sell Ad concurrently without interference', async () => {
    store.setOpeningInventory({ startingUsdtBalance: 1000, defaultCostBasis: 1450 });

    bybitServiceModule.bybitService.fetchActiveAds = async () => [
      {
        id: 'sell_ad_202',
        side: '1',
        status: '10',
        price: '1550.00',
        lastQuantity: '400.00',
        frozenQuantity: '50.00'
      },
      {
        id: 'buy_ad_203',
        side: '0',
        status: '10',
        price: '1475.00',
        lastQuantity: '1000.00',
        frozenQuantity: '0.00'
      }
    ];

    await dashboardModule.syncAndRenderActiveAd();

    // Verify Sell Ad
    const sellTitle = dom.document.getElementById('active-ad-title');
    const metricSellPrice = dom.document.getElementById('metric-ad-sell-price');
    const metricSellQty = dom.document.getElementById('metric-ad-qty-stock');
    const metricSpread = dom.document.getElementById('metric-ad-spread-usdt');
    const metricProjectedPnl = dom.document.getElementById('metric-ad-projected-pnl');

    assert.strictEqual(sellTitle.textContent, 'Bybit Sell Ad #sell_ad_202');
    assert.strictEqual(metricSellPrice.textContent, '₦1,550.00');
    assert.strictEqual(metricSellQty.textContent, '450.00 USDT listed');
    // Spread = 1550 - 1450 = +₦100.00
    assert.strictEqual(metricSpread.textContent, '+₦100.00 / USDT');
    // Projected profit = 450 * 100 = ₦45,000.00
    assert.strictEqual(metricProjectedPnl.textContent, '+₦45,000.00');

    // Verify Buy Ad
    const buyTitle = dom.document.getElementById('active-buy-ad-title');
    const metricBuyPrice = dom.document.getElementById('metric-ad-buy-price');
    const metricBuyQty = dom.document.getElementById('metric-ad-qty-buy');
    const metricBuyFiat = dom.document.getElementById('metric-ad-buy-fiat');
    const metricBuyStatus = dom.document.getElementById('metric-ad-buy-status');

    assert.strictEqual(buyTitle.textContent, 'Bybit Buy Ad #buy_ad_203');
    assert.strictEqual(metricBuyPrice.textContent, '₦1,475.00');
    assert.strictEqual(metricBuyQty.textContent, '1000.00 USDT targeted');
    // Fiat allocation = 1000 * 1475 = ₦1,475,000.00
    assert.strictEqual(metricBuyFiat.textContent, '₦1,475,000.00');
    assert.strictEqual(metricBuyStatus.textContent, 'Online / Active');
  });

  // ========================================================
  // 4. Fallback States When No Ads are Active
  // ========================================================
  it('ADS.4: syncAndRenderActiveAd() renders clean empty states when no active ads are found', async () => {
    bybitServiceModule.bybitService.fetchActiveAds = async () => [];

    await dashboardModule.syncAndRenderActiveAd();

    // Sell Ad empty state
    const sellBadge = dom.document.getElementById('active-ad-badge');
    const sellTitle = dom.document.getElementById('active-ad-title');
    const metricSellPrice = dom.document.getElementById('metric-ad-sell-price');
    const metricSellQty = dom.document.getElementById('metric-ad-qty-stock');

    assert.ok(sellBadge.className.includes('badge-neutral'));
    assert.strictEqual(sellTitle.textContent, 'No Live Sell Ad on Bybit');
    assert.strictEqual(metricSellPrice.textContent, '—');
    assert.strictEqual(metricSellQty.textContent, 'Post a Sell Ad on Bybit');

    // Buy Ad empty state
    const buyBadge = dom.document.getElementById('active-buy-ad-badge');
    const buyTitle = dom.document.getElementById('active-buy-ad-title');
    const metricBuyPrice = dom.document.getElementById('metric-ad-buy-price');
    const metricBuyQty = dom.document.getElementById('metric-ad-qty-buy');
    const metricBuyFiat = dom.document.getElementById('metric-ad-buy-fiat');
    const metricBuyStatus = dom.document.getElementById('metric-ad-buy-status');

    assert.ok(buyBadge.className.includes('badge-neutral'));
    assert.strictEqual(buyTitle.textContent, 'No Live Buy Ad on Bybit');
    assert.strictEqual(metricBuyPrice.textContent, '—');
    assert.strictEqual(metricBuyQty.textContent, 'Post a Buy Ad on Bybit');
    assert.strictEqual(metricBuyFiat.textContent, '₦0.00');
    assert.strictEqual(metricBuyStatus.textContent, 'Offline');
  });

  // ========================================================
  // 5. Heterogeneous Side / Status Data Types
  // ========================================================
  it('ADS.5: Handles numeric side (0, 1), string side ("BUY", "SELL"), and paused status (20)', async () => {
    bybitServiceModule.bybitService.fetchActiveAds = async () => [
      {
        id: 'numeric_buy_ad',
        side: 0, // Numeric 0
        status: 20, // Paused / offline
        price: '1460.00',
        lastQuantity: '250',
        frozenQuantity: '0'
      },
      {
        id: 'string_sell_ad',
        side: 'SELL', // String "SELL"
        status: 'ONLINE',
        price: '1520.00',
        lastQuantity: '300',
        frozenQuantity: '50'
      }
    ];

    await dashboardModule.syncAndRenderActiveAd();

    // Check Sell Ad
    const sellTitle = dom.document.getElementById('active-ad-title');
    const metricSellPrice = dom.document.getElementById('metric-ad-sell-price');
    assert.strictEqual(sellTitle.textContent, 'Bybit Sell Ad #string_sell_ad');
    assert.strictEqual(metricSellPrice.textContent, '₦1,520.00');

    // Check Buy Ad
    const buyTitle = dom.document.getElementById('active-buy-ad-title');
    const metricBuyPrice = dom.document.getElementById('metric-ad-buy-price');
    const metricBuyQty = dom.document.getElementById('metric-ad-qty-buy');
    const metricBuyStatus = dom.document.getElementById('metric-ad-buy-status');

    assert.strictEqual(buyTitle.textContent, 'Bybit Buy Ad #numeric_buy_ad');
    assert.strictEqual(metricBuyPrice.textContent, '₦1,460.00');
    assert.strictEqual(metricBuyQty.textContent, '250.00 USDT targeted');
    assert.strictEqual(metricBuyStatus.textContent, 'Paused / Offline');
    assert.ok(metricBuyStatus.className.includes('text-warning'));
  });

  // ========================================================
  // 6. Network Error / Rejection Clearance
  // ========================================================
  it('ADS.6: Network error during fetchActiveAds() clears active ad state cleanly without throwing uncaught rejection', async () => {
    // First set active ad
    bybitServiceModule.bybitService.fetchActiveAds = async () => [
      { id: 'ad_before_crash', side: '0', status: '10', price: '1490.00', lastQuantity: '100', frozenQuantity: '0' }
    ];
    await dashboardModule.syncAndRenderActiveAd();

    // Now mock network throw
    bybitServiceModule.bybitService.fetchActiveAds = async () => {
      throw new Error('500 Internal Server Error');
    };

    // Must not throw uncaught error
    await dashboardModule.syncAndRenderActiveAd();

    const buyTitle = dom.document.getElementById('active-buy-ad-title');
    const metricBuyPrice = dom.document.getElementById('metric-ad-buy-price');
    assert.strictEqual(buyTitle.textContent, 'No Live Buy Ad on Bybit');
    assert.strictEqual(metricBuyPrice.textContent, '—');
  });

  // ========================================================
  // 7. side: null with tradeType / sideName & itemId / adId Fallbacks
  // ========================================================
  it('ADS.7: Resolves side correctly when side is null and tradeType is provided, with itemId fallback', async () => {
    bybitServiceModule.bybitService.fetchActiveAds = async () => [
      {
        itemId: 'item_id_buy_777', // itemId instead of id
        side: null,
        tradeType: 'BUY',
        status: 'ONLINE',
        price: '1495.00',
        quantity: '800.00', // quantity instead of lastQuantity
        frozenQuantity: '50.00'
      },
      {
        adId: 'ad_id_sell_888', // adId instead of id
        side: null,
        tradeType: 1, // numeric 1 in tradeType
        status: 1,
        price: '1540.00',
        lastQuantity: '500.00',
        frozenQuantity: '0.00'
      }
    ];

    await dashboardModule.syncAndRenderActiveAd();

    // Verify Buy Ad with itemId
    const buyTitle = dom.document.getElementById('active-buy-ad-title');
    const metricBuyPrice = dom.document.getElementById('metric-ad-buy-price');
    const metricBuyQty = dom.document.getElementById('metric-ad-qty-buy');
    const metricBuyFiat = dom.document.getElementById('metric-ad-buy-fiat');

    assert.strictEqual(buyTitle.textContent, 'Bybit Buy Ad #item_id_buy_777');
    assert.strictEqual(metricBuyPrice.textContent, '₦1,495.00');
    assert.strictEqual(metricBuyQty.textContent, '850.00 USDT targeted');
    // 850 * 1495 = 1,270,750
    assert.strictEqual(metricBuyFiat.textContent, '₦1,270,750.00');

    // Verify Sell Ad with adId
    const sellTitle = dom.document.getElementById('active-ad-title');
    const metricSellPrice = dom.document.getElementById('metric-ad-sell-price');
    assert.strictEqual(sellTitle.textContent, 'Bybit Sell Ad #ad_id_sell_888');
    assert.strictEqual(metricSellPrice.textContent, '₦1,540.00');
  });

  // ========================================================
  // 8. Comma-Formatted Numerical Strings in Prices & Quantities
  // ========================================================
  it('ADS.8: Handles comma-separated numbers in price and quantity without NaN corruption', async () => {
    bybitServiceModule.bybitService.fetchActiveAds = async () => [
      {
        id: 'comma_ad',
        side: '0',
        status: '10',
        price: '1,500.50',
        lastQuantity: '1,200.00',
        frozenQuantity: '300.00'
      }
    ];

    await dashboardModule.syncAndRenderActiveAd();

    const metricBuyPrice = dom.document.getElementById('metric-ad-buy-price');
    const metricBuyQty = dom.document.getElementById('metric-ad-qty-buy');
    const metricBuyFiat = dom.document.getElementById('metric-ad-buy-fiat');

    assert.strictEqual(metricBuyPrice.textContent, '₦1,500.50');
    assert.strictEqual(metricBuyQty.textContent, '1500.00 USDT targeted');
    // 1500 * 1500.50 = 2,250,750.00
    assert.strictEqual(metricBuyFiat.textContent, '₦2,250,750.00');
  });

  // ========================================================
  // 9. bybitService.fetchActiveAds with Array vs Object result payload
  // ========================================================
  it('ADS.9: bybitService.fetchActiveAds handles direct array response payload', async () => {
    // Setup fetch mock returning { retCode: 0, result: [ { id: 'arr_ad_1', side: '0', price: '1480' } ] }
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        retCode: 0,
        result: [{ id: 'arr_ad_1', side: '0', price: '1480' }]
      })
    });

    const ads = await bybitServiceModule.bybitService.fetchActiveAds();
    assert.strictEqual(ads.length, 1);
    assert.strictEqual(ads[0].id, 'arr_ad_1');
  });

  // ========================================================
  // 10. Settings View Live Holdings Sync with Heterogeneous Ad Shapes
  // ========================================================
  it('ADS.10: Settings syncSettingsLiveHoldings parses string side SELL and status ONLINE with quantity fallback', async () => {
    // Mount settings view to DOM
    const viewContainer = dom.document.getElementById('main-content') || dom.document.body;
    viewContainer.innerHTML = settingsView.renderSettingsView();
    settingsModule.initSettings();

    // Mock wallet balance: 1000 USDT total
    bybitServiceModule.bybitService.fetchFundingBalance = async () => ({
      balance: [{ coin: 'USDT', transferBalance: '1000.00', walletBalance: '1000.00' }]
    });

    // Mock active ad with string side 'SELL', status 'ONLINE', and quantity '350.00'
    bybitServiceModule.bybitService.fetchActiveAds = async () => [
      {
        id: 'ad_settings_sell_1',
        side: 'SELL',
        status: 'ONLINE',
        price: '1530.00',
        quantity: '350.00',
        frozenQuantity: '50.00'
      }
    ];

    const btnSyncBalance = dom.document.getElementById('btn-sync-balance');
    assert.ok(btnSyncBalance, 'Sync balance button must exist');
    btnSyncBalance.click();

    // Allow promise microtasks to resolve
    await new Promise(resolve => setTimeout(resolve, 50));

    const elTotal = dom.document.getElementById('settings-total-usdt');
    const elLocked = dom.document.getElementById('settings-locked-usdt');
    const elFree = dom.document.getElementById('settings-free-usdt');

    assert.strictEqual(elTotal.textContent, '1000.00 USDT');
    // Ad allocation = 350 + 50 = 400.00 USDT
    assert.strictEqual(elLocked.textContent, '400.00 USDT');
    // Free for buyback = 1000 - 400 = 600.00 USDT
    assert.strictEqual(elFree.textContent, '600.00 USDT');
  });

  // ========================================================
  // 11. Multi-Sell Ad Cumulative Ad Allocation
  // ========================================================
  it('ADS.11: Cumulative ad allocation correctly sums across multiple active sell ads', async () => {
    bybitServiceModule.bybitService.fetchFundingBalance = async () => ({
      balance: [{ coin: 'USDT', transferBalance: '1500.00', walletBalance: '1500.00' }]
    });

    bybitServiceModule.bybitService.fetchActiveAds = async () => [
      {
        id: 'sell_ad_A',
        side: '1',
        status: '10',
        price: '1550.00',
        lastQuantity: '200.00',
        frozenQuantity: '50.00'
      },
      {
        id: 'sell_ad_B',
        side: 'SELL',
        status: 'ONLINE',
        price: '1560.00',
        lastQuantity: '300.00',
        frozenQuantity: '100.00'
      },
      {
        id: 'sell_ad_cancelled',
        side: '1',
        status: '30', // Cancelled should not be summed
        price: '1570.00',
        lastQuantity: '500.00',
        frozenQuantity: '0.00'
      }
    ];

    await dashboardModule.syncBybitLiveInventory();

    const elTotal = dom.document.getElementById('stat-bybit-live-total');
    const elLocked = dom.document.getElementById('stat-bybit-locked');
    const elFree = dom.document.getElementById('stat-bybit-free');

    // Total = 1500.00
    assert.strictEqual(elTotal.textContent, '1500.00 USDT');
    // Locked = (200 + 50) + (300 + 100) = 650.00 USDT
    assert.strictEqual(elLocked.textContent, '650.00 USDT');
    // Free = 1500 - 650 = 850.00 USDT
    assert.strictEqual(elFree.textContent, '850.00 USDT');
  });

  // ========================================================
  // 12. Extended ID Property Fallbacks (advId, idStr)
  // ========================================================
  it('ADS.12: syncAndRenderActiveAd resolves advId and idStr fallbacks for ad cards', async () => {
    bybitServiceModule.bybitService.fetchActiveAds = async () => [
      {
        advId: 'adv_9988',
        side: 'BUY',
        status: 'ACTIVE',
        price: '1485.00',
        quantity: '500.00',
        frozenQuantity: '0.00'
      },
      {
        idStr: 'idstr_3344',
        side: 'SELL',
        status: 'ACTIVE',
        price: '1545.00',
        quantity: '600.00',
        frozenQuantity: '0.00'
      }
    ];

    await dashboardModule.syncAndRenderActiveAd();

    const buyTitle = dom.document.getElementById('active-buy-ad-title');
    const sellTitle = dom.document.getElementById('active-ad-title');

    assert.strictEqual(buyTitle.textContent, 'Bybit Buy Ad #adv_9988');
    assert.strictEqual(sellTitle.textContent, 'Bybit Sell Ad #idstr_3344');
  });

  // ========================================================
  // 13. bybitService.fetchActiveAds with result.list Array
  // ========================================================
  it('ADS.13: bybitService.fetchActiveAds parses result.list array payload', async () => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        retCode: 0,
        result: {
          list: [{ id: 'list_ad_1', side: '0', price: '1470' }]
        }
      })
    });

    const ads = await bybitServiceModule.bybitService.fetchActiveAds();
    assert.strictEqual(ads.length, 1);
    assert.strictEqual(ads[0].id, 'list_ad_1');
  });

  // ========================================================
  // 14. resolveReferenceRate with String Side, Status & Comma Formatting
  // ========================================================
  it('ADS.14: resolveReferenceRate extracts rate from Active Sell Ad with string side SELL, status ONLINE, and comma-formatted price', () => {
    const rate = utils.resolveReferenceRate({
      activeSellAd: {
        side: 'SELL',
        status: 'ONLINE',
        price: '1,580.50'
      },
      fallbackRate: 1500.00
    });

    assert.strictEqual(rate, 1580.50, 'Must extract 1580.50 from active sell ad');
  });

  // ========================================================
  // 15. bybitService.fetchActiveAds with result.rows, result.data, result.records
  // ========================================================
  it('ADS.15: bybitService.fetchActiveAds parses result.rows, result.data, and result.records payloads', async () => {
    // Test rows
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        retCode: 0,
        result: { rows: [{ id: 'rows_ad_1', side: '0', price: '1465' }] }
      })
    });
    let ads = await bybitServiceModule.bybitService.fetchActiveAds();
    assert.strictEqual(ads.length, 1);
    assert.strictEqual(ads[0].id, 'rows_ad_1');

    // Test data
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        retCode: 0,
        result: { data: [{ id: 'data_ad_1', side: '1', price: '1555' }] }
      })
    });
    ads = await bybitServiceModule.bybitService.fetchActiveAds();
    assert.strictEqual(ads.length, 1);
    assert.strictEqual(ads[0].id, 'data_ad_1');

    // Test records
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        retCode: 0,
        result: { records: [{ id: 'rec_ad_1', side: '0', price: '1490' }] }
      })
    });
    ads = await bybitServiceModule.bybitService.fetchActiveAds();
    assert.strictEqual(ads.length, 1);
    assert.strictEqual(ads[0].id, 'rec_ad_1');
  });

  // ========================================================
  // 16. Out-of-Order Async Reordering / Rapid Refreshes (ISSUE-4)
  // ========================================================
  it('ADS.16: Rapid consecutive syncAndRenderActiveAd calls ignore stale out-of-order resolved responses', async () => {
    let resolveFirstCall;
    let resolveSecondCall;

    const firstPromise = new Promise(res => { resolveFirstCall = res; });
    const secondPromise = new Promise(res => { resolveSecondCall = res; });

    let callCount = 0;
    bybitServiceModule.bybitService.fetchActiveAds = async () => {
      callCount++;
      if (callCount === 1) {
        await firstPromise;
        return [{ id: 'stale_ad_1', side: '0', status: '10', price: '1400.00', lastQuantity: '100' }];
      } else {
        await secondPromise;
        return [{ id: 'fresh_ad_2', side: '0', status: '10', price: '1500.00', lastQuantity: '200' }];
      }
    };

    // Trigger Call 1 and Call 2 rapidly
    const p1 = dashboardModule.syncAndRenderActiveAd();
    const p2 = dashboardModule.syncAndRenderActiveAd();

    // Resolve Call 2 FIRST (fresh), then Call 1 (stale out-of-order)
    resolveSecondCall();
    await p2;

    const buyPriceAfterP2 = dom.document.getElementById('metric-ad-buy-price');
    assert.strictEqual(buyPriceAfterP2.textContent, '₦1,500.00');

    // Now resolve Call 1 (which was older)
    resolveFirstCall();
    await p1;

    // Must still reflect Call 2 (fresh), not overwritten by Call 1
    const buyPriceFinal = dom.document.getElementById('metric-ad-buy-price');
    assert.strictEqual(buyPriceFinal.textContent, '₦1,500.00', 'Stale out-of-order sync must not overwrite fresh UI state');
  });

  // ========================================================
  // 17. Status: 0 Safe Formatting
  // ========================================================
  it('ADS.17: Ad with status 0 formats as "Status: 0" rather than falsely defaulting to "Active"', async () => {
    bybitServiceModule.bybitService.fetchActiveAds = async () => [
      {
        id: 'ad_status_zero',
        side: '0',
        status: 0,
        price: '1470.00',
        lastQuantity: '100.00'
      }
    ];

    await dashboardModule.syncAndRenderActiveAd();

    const metricBuyStatus = dom.document.getElementById('metric-ad-buy-status');
    assert.strictEqual(metricBuyStatus.textContent, 'Status: 0');
  });
});


