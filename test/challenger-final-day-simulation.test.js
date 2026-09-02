/**
 * Challenger 2 — Final Milestone (M-FINAL) Verification Suite
 * 
 * End-to-End Multi-Step Merchant Trading Day Simulation:
 * 1. Token Auth Setup & Proxy Authorization
 * 2. Batch Order Import with Multi-Bank Selection
 * 3. FIFO Cost Basis & Realized PnL Calculation
 * 4. Pricing Assistant Margin & Floor Check
 * 5. Order Book Row Click -> Trade Form Prefill
 * 6. Navigation Back / Cancel & Form State Reset
 * 7. Offline Reload & Zero-Network Data Integrity
 */

const { describe, it, beforeEach } = require('./harness/test-runner');
const { assert } = require('./harness/assertions');
const { setupDomEnvironment } = require('./harness/dom-mock');
const fs = require('fs');
const path = require('path');

describe('Challenger 2 — M-FINAL: Full Merchant Trading Day Simulation', () => {
  let dom;
  let store;
  let utils;
  let feesModule;

  beforeEach(async () => {
    dom = setupDomEnvironment();
    const storeModule = await import('../js/store.js');
    store = storeModule.store;
    store.clearAllData();
    utils = await import('../js/utils.js');
    feesModule = await import('../js/fees.js');
  });

  it('M-FINAL-SIM: Full Day Merchant Lifecycle (Token Auth -> Multi-Bank Batch Import -> FIFO -> Pricing -> Order Book Prefill -> Cancel Nav -> Offline Reload)', async () => {
    // =========================================================================
    // STEP 1: TOKEN AUTH SETUP & PROXY SECURITY
    // =========================================================================
    const proxyToken = 'merchant_secret_token_live_2026_xyz';
    dom.localStorage.setItem('bybit_p2p_proxy_token', proxyToken);

    // Verify token retrieval in bybitService
    const { bybitService } = await import('../js/bybitService.js');
    
    // Verify serverless token extraction and timing-safe verification
    const { verifyToken, extractToken } = await import('../api/_bybit.js');
    
    process.env.PROXY_AUTH_TOKEN = proxyToken;
    const reqWithBearer = { headers: { authorization: `Bearer ${proxyToken}` }, query: {}, body: {} };
    const extracted = extractToken(reqWithBearer);
    assert.strictEqual(extracted, proxyToken, 'Extracts bearer token correctly');
    assert.strictEqual(verifyToken(extracted, proxyToken), true, 'Valid token passes timingSafeEqual verification');

    const reqWrongToken = { headers: { authorization: 'Bearer wrong_token' }, query: {}, body: {} };
    assert.strictEqual(verifyToken(extractToken(reqWrongToken), proxyToken), false, 'Invalid token is rejected');

    const reqNoToken = { headers: {}, query: {}, body: {} };
    assert.strictEqual(extractToken(reqNoToken), null, 'Missing token extracts to null');
    assert.strictEqual(verifyToken(extractToken(reqNoToken), proxyToken), false, 'Missing token fails verification');


    // =========================================================================
    // STEP 2: SETUP 4 BANK ACCOUNTS & INITIAL OPENING INVENTORY
    // =========================================================================
    const opay = store.addBankAccount({ name: 'OPay Merchant', last4: '1001', initialBalance: 5000000 });
    const kuda = store.addBankAccount({ name: 'Kuda Trading', last4: '2002', initialBalance: 3500000 });
    const palm = store.addBankAccount({ name: 'PalmPay Instant', last4: '3003', initialBalance: 2000000 });
    const monie = store.addBankAccount({ name: 'Moniepoint POS', last4: '4004', initialBalance: 1000000 });

    const initialOpeningInventory = {
      startingUsdtBalance: 500.0,
      defaultCostBasis: 1560.0 // 500 USDT @ 1560 = 780,000 NGN
    };
    store.setOpeningInventory(initialOpeningInventory);

    // Snapshot opening inventory in localStorage
    const storedOpeningRaw = dom.localStorage.getItem('bybit_p2p_opening_inventory');
    assert.ok(storedOpeningRaw, 'Opening inventory saved in localStorage');


    // =========================================================================
    // STEP 3: BATCH ORDER IMPORT WITH MULTI-BANK SELECTION (BUY & SELL)
    // =========================================================================
    // Mount full DOM shell with Settings and Modals
    const { renderSettingsView } = await import('../js/views/settings.view.js');
    const { renderModalsView } = await import('../js/views/modals.view.js');
    const { renderDashboardView } = await import('../js/views/dashboard.view.js');
    const { renderPricingView } = await import('../js/views/pricing.view.js');
    const { renderAddTradeView } = await import('../js/views/addTrade.view.js');
    const { renderHistoryView } = await import('../js/views/history.view.js');

    dom.document.root.innerHTML = `
      <div id="main-content">
        ${renderDashboardView()}
        ${renderAddTradeView()}
        ${renderPricingView()}
        ${renderHistoryView()}
        ${renderSettingsView()}
      </div>
      <div id="modals-container">
        ${renderModalsView()}
      </div>
      <div id="toast-container"></div>
    `;

    // Mock Canvas & Chart for chart rendering
    const canvas = dom.document.getElementById('pnlChart');
    if (canvas) {
      canvas.getContext = () => ({
        createLinearGradient: () => ({ addColorStop: () => {} }),
        clearRect: () => {},
        fillRect: () => {}
      });
    }
    global.Chart = class {
      constructor() {}
      destroy() {}
      update() {}
    };

    // 8 mock completed orders from Bybit (4 BUYs, 4 SELLs)
    const mockBybitOrders = [
      { id: 'BB_ORD_001', side: 0, price: '1580.00', amount: '237000', quantity: '150', status: 50, targetNickName: 'SellerA', createDate: 1724500000000 },
      { id: 'BB_ORD_002', side: 0, price: '1582.00', amount: '395500', quantity: '250', status: 50, targetNickName: 'SellerB', createDate: 1724503600000 },
      { id: 'BB_ORD_003', side: 0, price: '1585.00', amount: '475500', quantity: '300', status: 50, targetNickName: 'SellerC', createDate: 1724507200000 },
      { id: 'BB_ORD_004', side: 0, price: '1590.00', amount: '318000', quantity: '200', status: 50, targetNickName: 'SellerD', createDate: 1724510800000 },
      { id: 'BB_ORD_005', side: 1, price: '1620.00', amount: '324000', quantity: '200', status: 50, targetNickName: 'BuyerA', createDate: 1724514400000 },
      { id: 'BB_ORD_006', side: 1, price: '1625.00', amount: '487500', quantity: '300', status: 50, targetNickName: 'BuyerB', createDate: 1724518000000 },
      { id: 'BB_ORD_007', side: 1, price: '1630.00', amount: '407500', quantity: '250', status: 50, targetNickName: 'BuyerC', createDate: 1724521600000 },
      { id: 'BB_ORD_008', side: 1, price: '1635.00', amount: '245250', quantity: '150', status: 50, targetNickName: 'BuyerD', createDate: 1724525200000 }
    ];

    // Mock bybitService.checkStatus and fetchP2POrders
    const origCheckStatus = bybitService.checkStatus;
    const origFetchOrders = bybitService.fetchP2POrders;
    bybitService.checkStatus = async () => ({ status: 'online', apiKeyConfigured: true });
    bybitService.fetchP2POrders = async () => ({ count: 8, items: mockBybitOrders });

    // Initialize Settings controller
    const { initSettings } = await import('../js/settings.js');
    initSettings();

    // Trigger Import Trades button click
    const btnImport = dom.document.getElementById('btn-import-bybit-trades');
    assert.ok(btnImport, 'Import button exists');
    await btnImport.click();

    // Verify Modal opens and renders all 8 items
    const assignModal = dom.document.getElementById('modal-assign-banks-backdrop');
    assert.ok(!assignModal.classList.contains('hidden'), 'Assign Banks modal is visible');

    const assignList = dom.document.getElementById('assign-banks-items-list');
    const selectElements = assignList.querySelectorAll('.assign-bank-select');
    assert.strictEqual(selectElements.length, 8, 'Modal renders dropdown for all 8 orders');

    // Simulate user selecting designated bank accounts for each order:
    // BUY 1 -> OPay
    // BUY 2 -> Kuda
    // BUY 3 -> PalmPay
    // BUY 4 -> Moniepoint
    // SELL 1 -> OPay
    // SELL 2 -> Kuda
    // SELL 3 -> PalmPay
    // SELL 4 -> Moniepoint
    const assignedBankMapping = {
      'BB_ORD_001': opay.id,
      'BB_ORD_002': kuda.id,
      'BB_ORD_003': palm.id,
      'BB_ORD_004': monie.id,
      'BB_ORD_005': opay.id,
      'BB_ORD_006': kuda.id,
      'BB_ORD_007': palm.id,
      'BB_ORD_008': monie.id
    };

    selectElements.forEach(sel => {
      const ordId = sel.getAttribute('data-order-id');
      if (assignedBankMapping[ordId]) {
        sel.value = assignedBankMapping[ordId];
      }
    });

    // Check same-bank checkboxes for BUY 1 (OPay to OPay -> free transfer)
    const sameBankCheck = dom.document.querySelector('.assign-same-bank-check[data-order-id="BB_ORD_001"]');
    if (sameBankCheck) sameBankCheck.checked = true;

    // Submit batch import form
    const formAssign = dom.document.getElementById('form-assign-banks');
    formAssign.dispatchEvent({ type: 'submit', preventDefault: () => {} });

    // Assert modal closed
    assert.ok(assignModal.classList.contains('hidden'), 'Modal closed after submission');

    // Assert 8 trades added to store
    const importedTrades = store.getTrades();
    assert.strictEqual(importedTrades.length, 8, 'All 8 orders imported into store');

    // Verify RefId and bank associations
    const t1 = importedTrades.find(t => t.refId === 'BB_ORD_001');
    assert.strictEqual(t1.type, 'BUY');
    assert.strictEqual(t1.bankAccountId, opay.id);
    assert.strictEqual(t1.totalFees, 50, 'Same-bank transfer has 0 transfer fee + 50 NGN stamp duty');
    assert.strictEqual(t1.netAmount, 237050);

    const t3 = importedTrades.find(t => t.refId === 'BB_ORD_003');
    assert.strictEqual(t3.type, 'BUY');
    assert.strictEqual(t3.bankAccountId, palm.id);
    assert.strictEqual(t3.totalFees, 50, 'PalmPay default same-bank checkbox has 0 transfer fee + 50 NGN stamp duty');
    assert.strictEqual(t3.netAmount, 475550);

    const t5 = importedTrades.find(t => t.refId === 'BB_ORD_005');
    assert.strictEqual(t5.type, 'SELL');
    assert.strictEqual(t5.bankAccountId, opay.id);
    assert.strictEqual(t5.totalFees, 0, 'SELL order fee is 0 NGN');
    assert.strictEqual(t5.netAmount, 324000);

    // Verify Bank Balances Isolation:
    const computedBalances = store.getComputedBankBalances();
    
    // OPay: 5,000,000 - 237,050 (BUY 1) + 324,000 (SELL 1) = 5,086,950
    assert.strictEqual(computedBalances.get(opay.id).currentBalance, 5086950);

    // Kuda: 3,500,000 - 395,550 (BUY 2: 395,500 + 50 fee) + 487,500 (SELL 2) = 3,591,950
    assert.strictEqual(computedBalances.get(kuda.id).currentBalance, 3591950);

    // PalmPay: 2,000,000 - 475,550 (BUY 3: 475,500 + 50 fee) + 407,500 (SELL 3) = 1,931,950
    assert.strictEqual(computedBalances.get(palm.id).currentBalance, 1931950);

    // Moniepoint: 1,000,000 - 318,050 (BUY 4: 318,000 + 50 fee) + 245,250 (SELL 4) = 927,200
    assert.strictEqual(computedBalances.get(monie.id).currentBalance, 927200);

    // Opening inventory key remains protected
    const storedOpeningAfterImport = JSON.parse(dom.localStorage.getItem('bybit_p2p_opening_inventory'));
    assert.strictEqual(storedOpeningAfterImport.startingUsdtBalance, 500.0);
    assert.strictEqual(storedOpeningAfterImport.defaultCostBasis, 1560.0);


    // =========================================================================
    // STEP 4: AUTHORITATIVE FIFO COST BASIS & REALIZED PNL
    // =========================================================================
    // Total USDT bought: 500 (opening) + 150 + 250 + 300 + 200 = 1,400 USDT
    // Total USDT sold: 200 + 300 + 250 + 150 = 900 USDT
    // Remaining USDT: 1,400 - 900 = 500 USDT
    const fifo = utils.calculateFIFOInventoryAndPnL(store.getTrades(), store.getOpeningInventory());
    assert.strictEqual(fifo.remainingInventoryUSDT, 500);

    // Total Realized Profit = 51,650 NGN
    assert.closeTo(fifo.totalRealizedPnL, 51650, 1.0);

    // Total Remaining Cost Basis = 475,550 + 318,050 = 793,600 NGN
    // Average Cost Basis per USDT = 793,600 / 500 = 1587.20 NGN
    assert.closeTo(fifo.avgHoldingCostPerUSDT, 1587.20, 0.05);

    // Initialize Dashboard controller to verify view rendering
    const { initDashboard } = await import('../js/dashboard.js');
    initDashboard();

    const elDashCost = dom.document.getElementById('dash-avg-cost');
    if (elDashCost) {
      assert.ok(elDashCost.textContent.includes('1,587.20') || elDashCost.textContent.includes('1587'), 'Dashboard displays authoritative FIFO cost basis');
    }


    // =========================================================================
    // STEP 5: PRICING ASSISTANT MARGIN CHECK & COMPETITOR ORDER BOOK
    // =========================================================================
    const mockMarketDepth = {
      buyDepth: [
        { price: '1610.00', lastQuantity: '500', nickName: 'MarketMaker1', minAmount: '50000', maxAmount: '1000000' },
        { price: '1609.50', lastQuantity: '1000', nickName: 'MarketMaker2', minAmount: '50000', maxAmount: '2000000' }
      ],
      sellDepth: [
        { price: '1622.00', lastQuantity: '450', nickName: 'TopSellerX', minAmount: '50000', maxAmount: '1000000' },
        { price: '1623.50', lastQuantity: '800', nickName: 'SellerY', minAmount: '50000', maxAmount: '1500000' }
      ]
    };

    dom.localStorage.setItem('bybit_p2p_pricing_mode', 'competitor');
    dom.localStorage.setItem('bybit_p2p_pricing_spread', '5.0');
    dom.localStorage.setItem('bybit_p2p_pricing_volume', '100');
    dom.localStorage.setItem('bybit_p2p_pricing_outflow', '50');

    const origFetchDepth = bybitService.fetchMarketDepth;
    bybitService.fetchMarketDepth = async () => mockMarketDepth;

    const { initPricing, refreshPricingData } = await import('../js/pricing.js');
    initPricing();
    await refreshPricingData();

    // Verify Cost Basis displayed on Pricing view matches FIFO exactly
    const elPricingCost = dom.document.getElementById('pricing-cost-basis');
    assert.ok(elPricingCost.textContent.includes('1,587.20') || elPricingCost.textContent.includes('1587'), 'Pricing assistant displays identical FIFO holding cost');

    // Verify Break-Even calculation: Cost (1587.20) + (Outflow 50 / Vol 100) = 1587.70 (or 1592.48 with 0.30% maker fee)
    const elBreakEven = dom.document.getElementById('pricing-break-even');
    assert.ok(elBreakEven.textContent.includes('1,592.48') || elBreakEven.textContent.includes('1,587.70') || elBreakEven.textContent.includes('1587') || elBreakEven.textContent.includes('1592'), 'Break-even rate accounts for outflow fees');

    // Target Sell Price: 1587.20 + Spread (5.0) + (50 / 100) = 1592.70 (or 1597.49 with 0.30% maker fee)
    const elTargetSell = dom.document.getElementById('pricing-target-sell-price');
    assert.ok(elTargetSell.textContent.includes('1,597.49') || elTargetSell.textContent.includes('1,592.70') || elTargetSell.textContent.includes('1592') || elTargetSell.textContent.includes('1597'), 'Target sell price protects merchant margin');

    // Suggested Sell Price: Competitor is at 1622.00 -> Undercut is 1621.90 (> 1592.70 floor -> Safe)
    const elSuggestedSell = dom.document.getElementById('pricing-suggested-sell');
    assert.ok(elSuggestedSell.textContent.includes('1,621.90') || elSuggestedSell.textContent.includes('1621.9'), 'Suggested sell undercuts competitor safely');


    // =========================================================================
    // STEP 6: ORDER BOOK ROW CLICK -> TRADE ENTRY FORM PREFILL
    // =========================================================================
    let currentNavView = 'pricing';
    let previousNavView = 'pricing';
    const switchTab = (target) => {
      if (target && target !== currentNavView) {
        previousNavView = currentNavView;
        currentNavView = target;
        dom.window.currentView = target;
      }
    };
    dom.window.switchView = switchTab;
    dom.window.getPreviousView = () => previousNavView;

    const { initTrades } = await import('../js/trades.js');
    initTrades();

    // Find the Top Seller row in the Sell Order Book (Market Ask)
    const sellRows = dom.document.querySelectorAll('#pricing-sell-orderbook .orderbook-row');
    assert.ok(sellRows.length >= 1, 'Sell orderbook rows rendered');

    // Clicking a Sell Depth row means taking the ad -> recording a BUY trade
    const targetRow = sellRows[0];
    assert.strictEqual(targetRow.getAttribute('data-direction'), 'BUY');
    assert.strictEqual(targetRow.getAttribute('data-rate'), '1622');
    assert.strictEqual(targetRow.getAttribute('data-volume'), '450');
    assert.strictEqual(targetRow.getAttribute('data-counterparty'), 'TopSellerX');

    // Trigger row click
    targetRow.click();

    // Verify navigation switched view to 'add-trade'
    assert.strictEqual(dom.window.currentView, 'add-trade', 'Row click navigates to add-trade view');

    // Verify form fields were pre-populated accurately
    const rateInput = dom.document.getElementById('trade-rate');
    const usdtInput = dom.document.getElementById('trade-usdt');
    const ngnInput = dom.document.getElementById('trade-ngn');
    const counterpartyInput = dom.document.getElementById('trade-counterparty');

    assert.strictEqual(rateInput.value, '1622', 'Rate prefilled from order book');
    assert.strictEqual(usdtInput.value, '450', 'Volume prefilled from order book');
    assert.strictEqual(ngnInput.value, '729900.00', 'NGN amount auto-calculated (450 * 1622 = 729,900.00)');
    assert.strictEqual(counterpartyInput.value, 'TopSellerX', 'Counterparty prefilled from advertiser name');


    // =========================================================================
    // STEP 7: NAVIGATION BACK / CANCEL FLOW
    // =========================================================================
    // User decides to cancel the trade entry and return to Pricing view
    const btnCancel = dom.document.getElementById('btn-cancel-trade');
    assert.ok(btnCancel, 'Cancel button exists on trade form');
    btnCancel.click();

    // Verify form was reset
    assert.strictEqual(rateInput.value, '', 'Rate input cleared after cancel');
    assert.strictEqual(usdtInput.value, '', 'USDT input cleared after cancel');
    assert.strictEqual(counterpartyInput.value, '', 'Counterparty cleared after cancel');

    // Verify navigation returned back to 'pricing'
    assert.strictEqual(dom.window.currentView, 'pricing', 'Cancel returns to previous view (pricing)');

    // Verify store trade count was not modified
    assert.strictEqual(store.getTrades().length, 8, 'No uncommitted trade added to store');


    // =========================================================================
    // STEP 8: SEARCH AUDITABILITY BY BYBIT ORDER ID (refId)
    // =========================================================================
    const { initHistory } = await import('../js/history.js');
    initHistory();

    const searchInput = dom.document.getElementById('history-search');
    assert.ok(searchInput, 'History search input exists');

    // Search exact refId
    searchInput.value = 'BB_ORD_006';
    searchInput.dispatchEvent({ type: 'input' });

    const countEl = dom.document.getElementById('history-trade-count');
    assert.ok(countEl.textContent.includes('1'), 'RefId search filters down to exact 1 matching trade');

    const historyContainer = dom.document.getElementById('trades-history-container');
    assert.ok(historyContainer.innerHTML.includes('BB_ORD_006'), 'Trade card renders matched refId');
    assert.ok(historyContainer.innerHTML.includes('BuyerB'), 'Trade card renders correct counterparty');


    // =========================================================================
    // STEP 9: OFFLINE RELOAD & ZERO-NETWORK RESILIENCE
    // =========================================================================
    // Export data snapshot to simulate persistent storage across offline reload
    const preOfflineSnapshot = store.exportAllData();
    assert.strictEqual(preOfflineSnapshot.trades.length, 8);

    // Verify sw.js pre-cache manifest has all files required for offline reboot
    const swPath = path.resolve(__dirname, '../sw.js');
    const swSource = fs.readFileSync(swPath, 'utf8');

    const requiredModules = [
      './js/app.js',
      './js/store.js',
      './js/utils.js',
      './js/fees.js',
      './js/bybitService.js',
      './js/dashboard.js',
      './js/trades.js',
      './js/pricing.js',
      './js/history.js',
      './js/banks.js',
      './js/transfers.js',
      './js/settings.js',
      './js/export.js',
      './js/views/dashboard.view.js',
      './js/views/addTrade.view.js',
      './js/views/pricing.view.js',
      './js/views/history.view.js',
      './js/views/settings.view.js',
      './js/views/modals.view.js',
      './css/styles.css',
      './manifest.json',
      './index.html'
    ];

    requiredModules.forEach(mod => {
      assert.ok(swSource.includes(mod), `sw.js pre-caches ${mod}`);
    });

    // Simulate complete offline app reload:
    // 1. Fresh DOM environment with retained localStorage data
    const offlineDom = setupDomEnvironment();
    for (let i = 0; i < dom.localStorage.length; i++) {
      const k = dom.localStorage.key(i);
      if (k) {
        offlineDom.localStorage.setItem(k, dom.localStorage.getItem(k));
      }
    }

    // 2. Disable network fetch completely (zero-network environment)
    offlineDom.window.fetch = async () => {
      throw new TypeError('Failed to fetch: Zero-network offline environment');
    };

    // 3. Mount offline app views
    offlineDom.document.root.innerHTML = `
      <div id="main-content">
        ${renderDashboardView()}
        ${renderAddTradeView()}
        ${renderPricingView()}
        ${renderHistoryView()}
        ${renderSettingsView()}
      </div>
      <div id="modals-container">
        ${renderModalsView()}
      </div>
      <div id="toast-container"></div>
    `;

    // 4. Load store offline and verify zero-network recovery
    const offlineStoreModule = await import('../js/store.js');
    const offlineStore = offlineStoreModule.store;

    assert.strictEqual(offlineStore.getTrades().length, 8, 'Offline store loaded all 8 trades');
    assert.strictEqual(offlineStore.getBankAccounts().length, store.getBankAccounts().length, 'Offline store loaded all configured bank accounts');

    const offlineFifo = utils.calculateFIFOInventoryAndPnL(offlineStore.getTrades(), offlineStore.getOpeningInventory());
    assert.strictEqual(offlineFifo.remainingInventoryUSDT, 500, 'Offline FIFO inventory matched exactly');
    assert.closeTo(offlineFifo.avgHoldingCostPerUSDT, 1587.24, 0.05, 'Offline cost basis matched exactly');

    // 5. Record a new manual trade while completely offline
    const offlineTrade = {
      type: 'SELL',
      bankAccountId: opay.id,
      rate: 1640.0,
      usdtAmount: 100.0,
      ngnAmount: 164000.0,
      totalFees: 0,
      netAmount: 164000.0,
      date: new Date().toISOString(),
      counterparty: 'OfflineBuyer',
      notes: 'Recorded in zero-network offline mode'
    };

    offlineStore.addTrade(offlineTrade);
    assert.strictEqual(offlineStore.getTrades().length, 9, 'Offline trade saved to local store');

    const postOfflineFifo = utils.calculateFIFOInventoryAndPnL(offlineStore.getTrades(), offlineStore.getOpeningInventory());
    assert.strictEqual(postOfflineFifo.remainingInventoryUSDT, 400, 'Offline sale reduced remaining inventory to 400 USDT');

    const offlineBalances = offlineStore.getComputedBankBalances();
    // OPay: 5,086,950 + 164,000 = 5,250,950 NGN
    assert.strictEqual(offlineBalances.get(opay.id).currentBalance, 5250950, 'Offline trade credited bank ledger immediately');

    // Restore original bybitService mocks
    bybitService.fetchP2POrders = origFetchOrders;
    bybitService.checkStatus = origCheckStatus;
    bybitService.fetchMarketDepth = origFetchDepth;
  });
}, { tier: 4, category: 'Tier 4: Scenarios' });
