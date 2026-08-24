/**
 * Adversarial Stress Test Suite for Milestone 3 (R3: Comprehensive Multi-Bank Order Reconciliation)
 * Executed by Challenger 1
 *
 * Scope:
 * 1. 10 SELL orders batch import across multi-bank accounts (cash inflow isolation).
 * 2. 10 BUY orders batch import across multi-bank accounts (cash outflow & fintech fee isolation).
 * 3. Mixed 50 BUY/SELL orders stress test across 5 bank accounts (full UI flow, mathematical invariant verification, zero fund bleed).
 * 4. Boundary cases: Idempotency/deduplication, partial overlaps, bank deletion isolation, interleaved transfers, float precision.
 */

const { describe, it, beforeEach } = require('./harness/test-runner');
const { assert } = require('./harness/assertions');
const { setupDomEnvironment } = require('./harness/dom-mock');
const fs = require('fs');
const path = require('path');

// Helper to initialize full app DOM & controllers
async function initFullContext() {
  const dom = setupDomEnvironment();

  // Load view templates
  const modalsView = await import('../js/views/modals.view.js');
  const settingsView = await import('../js/views/settings.view.js');
  const dashboardView = await import('../js/views/dashboard.view.js');
  const historyView = await import('../js/views/history.view.js');

  dom.document.body.innerHTML = `
    <div id="app-container">
      ${dashboardView.renderDashboardView()}
      ${historyView.renderHistoryView()}
      ${settingsView.renderSettingsView()}
    </div>
    ${modalsView.renderModalsView()}
  `;

  const storeModule = await import('../js/store.js');
  const utilsModule = await import('../js/utils.js');
  const feesModule = await import('../js/fees.js');
  const bybitServiceModule = await import('../js/bybitService.js');
  const settingsModule = await import('../js/settings.js');

  return {
    dom,
    store: storeModule.store,
    utils: utilsModule,
    fees: feesModule,
    bybitService: bybitServiceModule.bybitService,
    settingsModule
  };
}

// ---------------------------------------------------------------------------
// SUITE 1: 10 SELL ORDERS MULTI-BANK IMPORT ASSIGNMENT & INFLOW ISOLATION
// ---------------------------------------------------------------------------
describe('Challenger Multi-Bank — 1. 10 SELL Orders Batch Import Assignment & Inflow Isolation', () => {

  it('1.1: 10 SELL orders rendered with correct UI labels, badges, and bank selection dropdowns', async () => {
    const ctx = await initFullContext();
    const { dom, store, bybitService, settingsModule } = ctx;

    store.clearAllData();
    const bankA = store.addBankAccount({ name: 'OPay Vault', last4: '1001', initialBalance: 250000 });
    const bankB = store.addBankAccount({ name: 'Kuda Trading', last4: '2002', initialBalance: 150000 });
    const bankC = store.addBankAccount({ name: 'GTBank Ops', last4: '3003', initialBalance: 500000 });

    settingsModule.initSettings();

    // Create 10 mock SELL orders from Bybit
    const mockSellOrders = [];
    for (let i = 1; i <= 10; i++) {
      mockSellOrders.push({
        id: `bybit_sell_${1000 + i}`,
        side: 1, // SELL
        status: 50, // Completed
        price: `${1600 + i * 5}.00`,
        amount: `${100000 + i * 20000}.00`,
        notifyTokenQuantity: `${((100000 + i * 20000) / (1600 + i * 5)).toFixed(4)}`,
        buyerRealName: `Buyer_${i}`,
        createDate: 1754000000000 + (i * 3600000)
      });
    }

    bybitService.fetchP2POrders = async () => ({ items: mockSellOrders });

    // Trigger Import click
    const btnImport = dom.document.getElementById('btn-import-bybit-trades');
    await btnImport.click();

    // Modal should be visible
    const modalAssign = dom.document.getElementById('modal-assign-banks-backdrop');
    assert.strictEqual(modalAssign.classList.contains('hidden'), false, 'Assign banks modal must be displayed');

    const assignList = dom.document.getElementById('assign-banks-items-list');
    const selectElements = assignList.querySelectorAll('.assign-bank-select');
    assert.strictEqual(selectElements.length, 10, 'Must render exactly 10 bank selector dropdowns for 10 orders');

    // Verify each SELL order card has SELL badge and NO same-bank checkbox
    const htmlContent = assignList.innerHTML;
    assert.ok(htmlContent.includes('SELL USDT'), 'Cards must display SELL USDT badge');
    assert.ok(htmlContent.includes('Received Into Bank Account:'), 'Cards must display Received Into Bank Account label');
    const sameBankCheckboxes = assignList.querySelectorAll('.assign-same-bank-check');
    assert.strictEqual(sameBankCheckboxes.length, 0, 'SELL orders must NOT render same-bank fee checkboxes');
  });

  it('1.2: 10 SELL orders assigned across 3 banks strictly credit designated accounts with zero cross-account bleed', async () => {
    const ctx = await initFullContext();
    const { dom, store, bybitService, settingsModule } = ctx;

    store.clearAllData();
    const bank1 = store.addBankAccount({ name: 'OPay Alpha', last4: '1111', initialBalance: 100000 });
    const bank2 = store.addBankAccount({ name: 'Kuda Beta', last4: '2222', initialBalance: 200000 });
    const bank3 = store.addBankAccount({ name: 'GTB Gamma', last4: '3333', initialBalance: 300000 });
    const bankUntouched = store.addBankAccount({ name: 'Zenith Idle', last4: '9999', initialBalance: 500000 });

    settingsModule.initSettings();

    // Distribution:
    // Bank 1: Orders 1, 2, 3, 4 (4 orders)
    // Bank 2: Orders 5, 6, 7 (3 orders)
    // Bank 3: Orders 8, 9, 10 (3 orders)
    // Bank Untouched: 0 orders

    const mockSellOrders = [];
    const expectedInflows = {
      [bank1.id]: 0,
      [bank2.id]: 0,
      [bank3.id]: 0,
      [bankUntouched.id]: 0
    };

    for (let i = 1; i <= 10; i++) {
      const orderId = `sell_order_${i}`;
      const ngnAmount = 50000 * i; // 50k, 100k, 150k...
      const rate = 1600;
      const usdt = ngnAmount / rate;

      let targetBankId;
      if (i <= 4) targetBankId = bank1.id;
      else if (i <= 7) targetBankId = bank2.id;
      else targetBankId = bank3.id;

      expectedInflows[targetBankId] += ngnAmount;

      mockSellOrders.push({
        id: orderId,
        side: 1,
        status: 50,
        price: `${rate}.00`,
        amount: `${ngnAmount}.00`,
        notifyTokenQuantity: `${usdt.toFixed(4)}`,
        buyerRealName: `P2P_Buyer_${i}`,
        createDate: 1754000000000 + (i * 100000)
      });
    }

    bybitService.fetchP2POrders = async () => ({ items: mockSellOrders });

    // Open import modal
    const btnImport = dom.document.getElementById('btn-import-bybit-trades');
    await btnImport.click();

    const assignList = dom.document.getElementById('assign-banks-items-list');
    const selectElements = assignList.querySelectorAll('.assign-bank-select');

    // Assign banks to dropdowns
    selectElements.forEach(sel => {
      const orderId = sel.getAttribute('data-order-id');
      const orderNum = parseInt(orderId.replace('sell_order_', ''), 10);
      if (orderNum <= 4) sel.value = bank1.id;
      else if (orderNum <= 7) sel.value = bank2.id;
      else sel.value = bank3.id;
    });

    // Submit import form
    const formAssign = dom.document.getElementById('form-assign-banks');
    formAssign.dispatchEvent({ type: 'submit', preventDefault: () => {} });

    // Assertions on Store trades
    const trades = store.getTrades();
    assert.strictEqual(trades.length, 10, 'All 10 SELL trades must be recorded');

    // Verify dynamic ledger balances
    const balances = store.getComputedBankBalances();

    // Bank 1: 100,000 + (50k + 100k + 150k + 200k = 500k) = 600,000
    const b1 = balances.get(bank1.id);
    assert.strictEqual(b1.totalInflow, expectedInflows[bank1.id], 'Bank 1 total inflow mismatch');
    assert.strictEqual(b1.totalOutflow, 0, 'Bank 1 total outflow must be 0 for SELLs');
    assert.strictEqual(b1.currentBalance, 100000 + expectedInflows[bank1.id], 'Bank 1 balance mismatch');

    // Bank 2: 200,000 + (250k + 300k + 350k = 900k) = 1,100,000
    const b2 = balances.get(bank2.id);
    assert.strictEqual(b2.totalInflow, expectedInflows[bank2.id], 'Bank 2 total inflow mismatch');
    assert.strictEqual(b2.totalOutflow, 0, 'Bank 2 total outflow must be 0 for SELLs');
    assert.strictEqual(b2.currentBalance, 200000 + expectedInflows[bank2.id], 'Bank 2 balance mismatch');

    // Bank 3: 300,000 + (400k + 450k + 500k = 1,350,000) = 1,650,000
    const b3 = balances.get(bank3.id);
    assert.strictEqual(b3.totalInflow, expectedInflows[bank3.id], 'Bank 3 total inflow mismatch');
    assert.strictEqual(b3.totalOutflow, 0, 'Bank 3 total outflow must be 0 for SELLs');
    assert.strictEqual(b3.currentBalance, 300000 + expectedInflows[bank3.id], 'Bank 3 balance mismatch');

    // Untouched Bank: 500,000 with 0 inflows/outflows
    const bUntouched = balances.get(bankUntouched.id);
    assert.strictEqual(bUntouched.totalInflow, 0, 'Untouched bank must have 0 inflow (zero bleed)');
    assert.strictEqual(bUntouched.totalOutflow, 0, 'Untouched bank must have 0 outflow');
    assert.strictEqual(bUntouched.currentBalance, 500000, 'Untouched bank balance must remain exactly initial');

    // Global Cash Invariant:
    const totalInitial = 100000 + 200000 + 300000 + 500000;
    const totalInflowAll = expectedInflows[bank1.id] + expectedInflows[bank2.id] + expectedInflows[bank3.id];
    const totalCurrentAll = b1.currentBalance + b2.currentBalance + b3.currentBalance + bUntouched.currentBalance;
    assert.strictEqual(totalCurrentAll, totalInitial + totalInflowAll, 'Global cash invariant must hold strictly across all accounts');
  });
});

// ---------------------------------------------------------------------------
// SUITE 2: 10 BUY ORDERS MULTI-BANK IMPORT ASSIGNMENT & OUTFLOW ISOLATION
// ---------------------------------------------------------------------------
describe('Challenger Multi-Bank — 2. 10 BUY Orders Batch Import Assignment & Outflow Isolation', () => {

  it('2.1: 10 BUY orders render with Paid From Bank Account label, BUY badge, and Same-Bank transfer checkboxes', async () => {
    const ctx = await initFullContext();
    const { dom, store, bybitService, settingsModule } = ctx;

    store.clearAllData();
    store.addBankAccount({ name: 'OPay Vault', last4: '1001', initialBalance: 1000000 });
    settingsModule.initSettings();

    const mockBuyOrders = [];
    for (let i = 1; i <= 10; i++) {
      mockBuyOrders.push({
        id: `bybit_buy_${2000 + i}`,
        side: 0, // BUY
        status: 50,
        price: '1550.00',
        amount: `${5000 * i}.00`,
        notifyTokenQuantity: `${((5000 * i) / 1550).toFixed(4)}`,
        sellerRealName: `Merchant_Seller_${i}`,
        createDate: 1754000000000 + (i * 3600000)
      });
    }

    bybitService.fetchP2POrders = async () => ({ items: mockBuyOrders });

    const btnImport = dom.document.getElementById('btn-import-bybit-trades');
    await btnImport.click();

    const assignList = dom.document.getElementById('assign-banks-items-list');
    assert.ok(assignList.innerHTML.includes('BUY USDT'), 'Cards must display BUY USDT badge');
    assert.ok(assignList.innerHTML.includes('Paid From Bank Account:'), 'Cards must display Paid From Bank Account label');

    const sameBankCheckboxes = assignList.querySelectorAll('.assign-same-bank-check');
    assert.strictEqual(sameBankCheckboxes.length, 10, 'Each BUY order card must have a same-bank transfer checkbox');
  });

  it('2.2: 10 BUY orders with varied sizes and fee configurations debit designated accounts with exact fee accounting', async () => {
    const ctx = await initFullContext();
    const { dom, store, bybitService, settingsModule, fees } = ctx;

    store.clearAllData();
    const bankA = store.addBankAccount({ name: 'OPay Main', last4: '4444', initialBalance: 1000000 });
    const bankB = store.addBankAccount({ name: 'Kuda Business', last4: '5555', initialBalance: 1000000 });
    const bankC = store.addBankAccount({ name: 'GTB Corporate', last4: '6666', initialBalance: 1000000 });
    const bankIdle = store.addBankAccount({ name: 'Access Isolated', last4: '7777', initialBalance: 800000 });

    settingsModule.initSettings();

    // 10 BUY orders:
    // Orders 1-4: Bank A
    // Orders 5-7: Bank B
    // Orders 8-10: Bank C
    // Varied amounts:
    // Order 1: ₦3,000 (sameBank=true)  -> fee: 0, net: 3,000
    // Order 2: ₦4,500 (sameBank=false) -> fee: 0 (< 5k), net: 4,500
    // Order 3: ₦8,000 (sameBank=false) -> fee: 10 (>=5k, <10k), net: 8,010
    // Order 4: ₦50,000 (sameBank=true) -> fee: 50 (stamp duty >=10k), net: 50,050
    // Order 5: ₦100,000 (sameBank=false) -> fee: 10 (transfer) + 50 (stamp duty) = 60, net: 100,060
    // Order 6: ₦25,000 (sameBank=true) -> fee: 50 (stamp duty), net: 25,050
    // Order 7: ₦6,000 (sameBank=true)  -> fee: 0, net: 6,000
    // Order 8: ₦200,000 (sameBank=false) -> fee: 60, net: 200,060
    // Order 9: ₦15,000 (sameBank=false) -> fee: 60, net: 15,060
    // Order 10: ₦2,000 (sameBank=false) -> fee: 0, net: 2,000

    const buyConfigs = [
      { id: 'buy_1', amount: 3000, sameBank: true, bankId: bankA.id },
      { id: 'buy_2', amount: 4500, sameBank: false, bankId: bankA.id },
      { id: 'buy_3', amount: 8000, sameBank: false, bankId: bankA.id },
      { id: 'buy_4', amount: 50000, sameBank: true, bankId: bankA.id },
      { id: 'buy_5', amount: 100000, sameBank: false, bankId: bankB.id },
      { id: 'buy_6', amount: 25000, sameBank: true, bankId: bankB.id },
      { id: 'buy_7', amount: 6000, sameBank: true, bankId: bankB.id },
      { id: 'buy_8', amount: 200000, sameBank: false, bankId: bankC.id },
      { id: 'buy_9', amount: 15000, sameBank: false, bankId: bankC.id },
      { id: 'buy_10', amount: 2000, sameBank: false, bankId: bankC.id }
    ];

    const mockBuyOrders = buyConfigs.map((cfg, idx) => ({
      id: cfg.id,
      side: 0,
      status: 50,
      price: '1500.00',
      amount: `${cfg.amount}.00`,
      notifyTokenQuantity: `${(cfg.amount / 1500).toFixed(4)}`,
      sellerRealName: `Seller_${idx + 1}`,
      createDate: 1754000000000 + (idx * 100000)
    }));

    bybitService.fetchP2POrders = async () => ({ items: mockBuyOrders });

    const btnImport = dom.document.getElementById('btn-import-bybit-trades');
    await btnImport.click();

    const assignList = dom.document.getElementById('assign-banks-items-list');

    // Configure bank assignments and same-bank checkboxes
    buyConfigs.forEach(cfg => {
      const sel = assignList.querySelector(`.assign-bank-select[data-order-id="${cfg.id}"]`);
      if (sel) sel.value = cfg.bankId;

      const chk = assignList.querySelector(`.assign-same-bank-check[data-order-id="${cfg.id}"]`);
      if (chk) chk.checked = cfg.sameBank;
    });

    const formAssign = dom.document.getElementById('form-assign-banks');
    formAssign.dispatchEvent({ type: 'submit', preventDefault: () => {} });

    // Compute expected per-bank stats
    const expectedOutflows = { [bankA.id]: 0, [bankB.id]: 0, [bankC.id]: 0, [bankIdle.id]: 0 };
    const expectedFees = { [bankA.id]: 0, [bankB.id]: 0, [bankC.id]: 0, [bankIdle.id]: 0 };

    buyConfigs.forEach(cfg => {
      const calculatedFees = fees.calculateFintechTradeFees('BUY', cfg.amount, cfg.sameBank);
      const totalFee = calculatedFees.reduce((s, f) => s + f.amount, 0);
      const net = cfg.amount + totalFee;
      expectedOutflows[cfg.bankId] += net;
      expectedFees[cfg.bankId] += totalFee;
    });

    const balances = store.getComputedBankBalances();

    // Bank A Verification
    const bA = balances.get(bankA.id);
    assert.strictEqual(bA.totalOutflow, expectedOutflows[bankA.id], 'Bank A outflow mismatch');
    assert.strictEqual(bA.totalFees, expectedFees[bankA.id], 'Bank A fee mismatch');
    assert.strictEqual(bA.totalInflow, 0, 'Bank A inflow must be 0');
    assert.strictEqual(bA.currentBalance, 1000000 - expectedOutflows[bankA.id], 'Bank A current balance mismatch');

    // Bank B Verification
    const bB = balances.get(bankB.id);
    assert.strictEqual(bB.totalOutflow, expectedOutflows[bankB.id], 'Bank B outflow mismatch');
    assert.strictEqual(bB.totalFees, expectedFees[bankB.id], 'Bank B fee mismatch');
    assert.strictEqual(bB.totalInflow, 0, 'Bank B inflow must be 0');
    assert.strictEqual(bB.currentBalance, 1000000 - expectedOutflows[bankB.id], 'Bank B current balance mismatch');

    // Bank C Verification
    const bC = balances.get(bankC.id);
    assert.strictEqual(bC.totalOutflow, expectedOutflows[bankC.id], 'Bank C outflow mismatch');
    assert.strictEqual(bC.totalFees, expectedFees[bankC.id], 'Bank C fee mismatch');
    assert.strictEqual(bC.totalInflow, 0, 'Bank C inflow must be 0');
    assert.strictEqual(bC.currentBalance, 1000000 - expectedOutflows[bankC.id], 'Bank C current balance mismatch');

    // Bank Idle Verification (Zero bleed)
    const bIdle = balances.get(bankIdle.id);
    assert.strictEqual(bIdle.totalOutflow, 0, 'Idle bank outflow must be 0');
    assert.strictEqual(bIdle.totalFees, 0, 'Idle bank fees must be 0');
    assert.strictEqual(bIdle.totalInflow, 0, 'Idle bank inflow must be 0');
    assert.strictEqual(bIdle.currentBalance, 800000, 'Idle bank balance must not change');
  });
});

// ---------------------------------------------------------------------------
// SUITE 3: STRESS HARNESS — MIXED 50 BUY/SELL ORDERS ACROSS 5 BANK ACCOUNTS
// ---------------------------------------------------------------------------
describe('Challenger Multi-Bank — 3. Stress Harness: Mixed 50 BUY/SELL Orders Across 5 Bank Accounts', () => {

  it('3.1: Large batch of 50 interleaved BUY/SELL orders preserves strict ledger isolation and 0 funds bleed across 5 banks', async () => {
    const ctx = await initFullContext();
    const { dom, store, bybitService, settingsModule, fees, utils } = ctx;

    store.clearAllData();

    // 5 Bank accounts with distinct initial balances
    const banks = [
      store.addBankAccount({ name: 'OPay Main Trading', last4: '1001', initialBalance: 1500000 }),
      store.addBankAccount({ name: 'Kuda Retail Vault', last4: '2002', initialBalance: 800000 }),
      store.addBankAccount({ name: 'GTBank Treasury', last4: '3003', initialBalance: 2500000 }),
      store.addBankAccount({ name: 'Zenith Strategic', last4: '4004', initialBalance: 500000 }),
      store.addBankAccount({ name: 'Moniepoint POS Float', last4: '5005', initialBalance: 100000 })
    ];

    settingsModule.initSettings();

    // Generate 50 realistic mixed orders (25 BUYs, 25 SELLs)
    const orders = [];
    const expectedBankStats = new Map();
    banks.forEach(b => {
      expectedBankStats.set(b.id, {
        initialBalance: Number(b.initialBalance),
        totalInflow: 0,
        totalOutflow: 0,
        totalFees: 0,
        assignedTradesCount: 0
      });
    });

    let totalGlobalInflow = 0;
    let totalGlobalOutflow = 0;
    let totalGlobalFees = 0;

    for (let i = 0; i < 50; i++) {
      const orderId = `bybit_stress_order_${10000 + i}`;
      const isBuy = i % 2 === 0; // Alternating BUY (even) and SELL (odd)
      const direction = isBuy ? 'BUY' : 'SELL';
      const side = isBuy ? 0 : 1;

      // Deterministic spread of rates and volumes
      const rate = 1500 + ((i * 7) % 250); // rates between 1500 and 1743
      const usdtAmount = 20 + ((i * 13) % 480); // 20 to 493 USDT
      const ngnAmount = Math.round(rate * usdtAmount * 100) / 100;

      // Assign round-robin to 5 banks
      const targetBank = banks[i % 5];
      const sameBankTransfer = isBuy && (i % 3 === 0);

      // Pre-calculate exact fee & breakdown
      const tradeFees = fees.calculateFintechTradeFees(direction, ngnAmount, sameBankTransfer);
      const totalTradeFees = tradeFees.reduce((sum, f) => sum + f.amount, 0);
      const { netAmount } = utils.calculateTradeBreakdown(direction, ngnAmount, usdtAmount, totalTradeFees);

      const stats = expectedBankStats.get(targetBank.id);
      stats.assignedTradesCount++;
      stats.totalFees += totalTradeFees;
      totalGlobalFees += totalTradeFees;

      if (direction === 'BUY') {
        stats.totalOutflow += netAmount;
        totalGlobalOutflow += netAmount;
      } else {
        stats.totalInflow += netAmount;
        totalGlobalInflow += netAmount;
      }

      orders.push({
        id: orderId,
        side,
        status: 50,
        price: `${rate.toFixed(2)}`,
        amount: `${ngnAmount.toFixed(2)}`,
        notifyTokenQuantity: `${usdtAmount.toFixed(4)}`,
        sellerRealName: isBuy ? `Seller_${i}` : undefined,
        buyerRealName: !isBuy ? `Buyer_${i}` : undefined,
        createDate: 1754000000000 + (i * 60000),
        _targetBankId: targetBank.id,
        _sameBank: sameBankTransfer
      });
    }

    bybitService.fetchP2POrders = async () => ({ items: orders });

    // 1. Click Import
    const btnImport = dom.document.getElementById('btn-import-bybit-trades');
    await btnImport.click();

    // 2. Populate modal assignments
    const assignList = dom.document.getElementById('assign-banks-items-list');
    const selectElements = assignList.querySelectorAll('.assign-bank-select');
    assert.strictEqual(selectElements.length, 50, 'Modal must render exactly 50 order items');

    orders.forEach(ord => {
      const sel = assignList.querySelector(`.assign-bank-select[data-order-id="${ord.id}"]`);
      assert.ok(sel, `Select element for order #${ord.id} must exist in DOM`);
      sel.value = ord._targetBankId;

      if (ord.side === 0) {
        const chk = assignList.querySelector(`.assign-same-bank-check[data-order-id="${ord.id}"]`);
        if (chk) chk.checked = ord._sameBank;
      }
    });

    // 3. Confirm modal submit
    const formAssign = dom.document.getElementById('form-assign-banks');
    formAssign.dispatchEvent({ type: 'submit', preventDefault: () => {} });

    // 4. Verify Store has 50 trades
    const recordedTrades = store.getTrades();
    assert.strictEqual(recordedTrades.length, 50, 'Store must contain exactly 50 imported trades');

    // 5. Verify dynamic ledger computations
    const computedBalances = store.getComputedBankBalances();

    banks.forEach(bank => {
      const expected = expectedBankStats.get(bank.id);
      const actual = computedBalances.get(bank.id);

      assert.ok(actual, `Computed balance record for bank ${bank.name} must exist`);
      assert.strictEqual(actual.totalInflow, expected.totalInflow, `Bank ${bank.name} totalInflow mismatch`);
      assert.strictEqual(actual.totalOutflow, expected.totalOutflow, `Bank ${bank.name} totalOutflow mismatch`);
      assert.strictEqual(actual.totalFees, expected.totalFees, `Bank ${bank.name} totalFees mismatch`);

      const expectedCurrent = expected.initialBalance + expected.totalInflow - expected.totalOutflow;
      assert.strictEqual(actual.currentBalance, expectedCurrent, `Bank ${bank.name} currentBalance formula mismatch`);
    });

    // 6. Global Conservation of Money
    const totalInitialAll = banks.reduce((sum, b) => sum + Number(b.initialBalance), 0);
    const totalCurrentAll = Array.from(computedBalances.values()).reduce((sum, b) => sum + b.currentBalance, 0);
    const expectedGlobalCurrent = totalInitialAll + totalGlobalInflow - totalGlobalOutflow;

    assert.closeTo(totalCurrentAll, expectedGlobalCurrent, 0.01, 'Global sum of bank cash balances must match initial + inflows - outflows');
  });

  it('3.2: Pairwise fund bleed test: Modifying trades in Bank A leaves Bank B, C, D, E completely intact', async () => {
    const ctx = await initFullContext();
    const { store } = ctx;

    store.clearAllData();

    const bankA = store.addBankAccount({ name: 'Bank A', last4: '000A', initialBalance: 500000 });
    const bankB = store.addBankAccount({ name: 'Bank B', last4: '000B', initialBalance: 500000 });
    const bankC = store.addBankAccount({ name: 'Bank C', last4: '000C', initialBalance: 500000 });

    // Seed baseline trades across A, B, C
    store.addTrade({ refId: 'ref_b1', type: 'BUY', bankAccountId: bankB.id, ngnAmount: 100000, usdtAmount: 60, rate: 1666.67, totalFees: 50, netAmount: 100050, date: new Date().toISOString() });
    store.addTrade({ refId: 'ref_c1', type: 'SELL', bankAccountId: bankC.id, ngnAmount: 200000, usdtAmount: 120, rate: 1666.67, totalFees: 0, netAmount: 200000, date: new Date().toISOString() });

    const baselineB = store.getComputedBankBalances().get(bankB.id);
    const baselineC = store.getComputedBankBalances().get(bankC.id);

    // Blast Bank A with 20 massive trades
    for (let i = 0; i < 20; i++) {
      const isBuy = i % 2 === 0;
      store.addTrade({
        refId: `blast_a_${i}`,
        type: isBuy ? 'BUY' : 'SELL',
        bankAccountId: bankA.id,
        ngnAmount: 5000000 + (i * 100000),
        usdtAmount: 3000,
        rate: 1666.67,
        totalFees: isBuy ? 50 : 0,
        netAmount: isBuy ? 5000050 + (i * 100000) : 5000000 + (i * 100000),
        date: new Date().toISOString()
      });
    }

    const afterB = store.getComputedBankBalances().get(bankB.id);
    const afterC = store.getComputedBankBalances().get(bankC.id);

    assert.strictEqual(afterB.currentBalance, baselineB.currentBalance, 'Bank B balance must not be affected by Bank A trades');
    assert.strictEqual(afterB.totalInflow, baselineB.totalInflow, 'Bank B inflow must not be affected');
    assert.strictEqual(afterB.totalOutflow, baselineB.totalOutflow, 'Bank B outflow must not be affected');

    assert.strictEqual(afterC.currentBalance, baselineC.currentBalance, 'Bank C balance must not be affected by Bank A trades');
    assert.strictEqual(afterC.totalInflow, baselineC.totalInflow, 'Bank C inflow must not be affected');
    assert.strictEqual(afterC.totalOutflow, baselineC.totalOutflow, 'Bank C outflow must not be affected');
  });
});

// ---------------------------------------------------------------------------
// SUITE 4: BOUNDARY, CORNER CASES & RESILIENCE HARNESS
// ---------------------------------------------------------------------------
describe('Challenger Multi-Bank — 4. Boundary Cases & Ledger Resilience', () => {

  it('4.1: Duplicate batch import rejection is 100% idempotent and leaves ledger untouched', async () => {
    const ctx = await initFullContext();
    const { dom, store, bybitService, settingsModule } = ctx;

    store.clearAllData();
    const bank1 = store.addBankAccount({ name: 'Idempotent Bank', last4: '8888', initialBalance: 500000 });
    settingsModule.initSettings();

    const batch = [
      { id: 'bybit_idem_1', side: 0, status: 50, price: '1500.00', amount: '150000.00', notifyTokenQuantity: '100.0000', createDate: 1754000000000 },
      { id: 'bybit_idem_2', side: 1, status: 50, price: '1600.00', amount: '160000.00', notifyTokenQuantity: '100.0000', createDate: 1754001000000 }
    ];

    bybitService.fetchP2POrders = async () => ({ items: batch });

    // 1st Import
    const btnImport = dom.document.getElementById('btn-import-bybit-trades');
    await btnImport.click();

    const formAssign = dom.document.getElementById('form-assign-banks');
    formAssign.dispatchEvent({ type: 'submit', preventDefault: () => {} });

    assert.strictEqual(store.getTrades().length, 2, 'Should have 2 trades after first import');
    const balAfterFirst = store.getComputedBankBalances().get(bank1.id).currentBalance;

    // 2nd Import attempt with identical batch
    await btnImport.click();

    // Modal should NOT open because all orders are already present
    const modalAssign = dom.document.getElementById('modal-assign-banks-backdrop');
    assert.strictEqual(modalAssign.classList.contains('hidden'), true, 'Modal should remain hidden for 100% duplicate batch');
    assert.strictEqual(store.getTrades().length, 2, 'Trade count must remain 2');
    assert.strictEqual(store.getComputedBankBalances().get(bank1.id).currentBalance, balAfterFirst, 'Ledger balance must remain identical');
  });

  it('4.2: Partial overlap imports only new unseen orders without duplicate pollution', async () => {
    const ctx = await initFullContext();
    const { dom, store, bybitService, settingsModule } = ctx;

    store.clearAllData();
    const bank = store.addBankAccount({ name: 'Partial Bank', last4: '9999', initialBalance: 1000000 });
    settingsModule.initSettings();

    // Batch 1: Orders 1, 2
    const batch1 = [
      { id: 'order_part_1', side: 0, status: 50, price: '1500.00', amount: '100000.00', notifyTokenQuantity: '66.6666', createDate: 1754000000000 },
      { id: 'order_part_2', side: 1, status: 50, price: '1600.00', amount: '100000.00', notifyTokenQuantity: '62.5000', createDate: 1754001000000 }
    ];

    bybitService.fetchP2POrders = async () => ({ items: batch1 });
    const btnImport = dom.document.getElementById('btn-import-bybit-trades');
    await btnImport.click();

    const formAssign = dom.document.getElementById('form-assign-banks');
    formAssign.dispatchEvent({ type: 'submit', preventDefault: () => {} });

    assert.strictEqual(store.getTrades().length, 2);

    // Batch 2: Orders 1, 2 (duplicates) + Orders 3, 4 (new)
    const batch2 = [
      ...batch1,
      { id: 'order_part_3', side: 0, status: 50, price: '1500.00', amount: '50000.00', notifyTokenQuantity: '33.3333', createDate: 1754002000000 },
      { id: 'order_part_4', side: 1, status: 50, price: '1600.00', amount: '50000.00', notifyTokenQuantity: '31.2500', createDate: 1754003000000 }
    ];

    bybitService.fetchP2POrders = async () => ({ items: batch2 });
    await btnImport.click();

    const assignList = dom.document.getElementById('assign-banks-items-list');
    const selectElements = assignList.querySelectorAll('.assign-bank-select');
    assert.strictEqual(selectElements.length, 2, 'Modal must only display the 2 unseen orders');

    formAssign.dispatchEvent({ type: 'submit', preventDefault: () => {} });

    assert.strictEqual(store.getTrades().length, 4, 'Store must have exactly 4 trades total');
  });

  it('4.3: Deleting a bank account isolates orphaned trade history without crashing getComputedBankBalances', async () => {
    const ctx = await initFullContext();
    const { store } = ctx;

    store.clearAllData();
    const bankAlpha = store.addBankAccount({ name: 'Alpha Bank', last4: '1111', initialBalance: 300000 });
    const bankBeta = store.addBankAccount({ name: 'Beta Bank', last4: '2222', initialBalance: 400000 });

    store.addTrade({ refId: 't_a1', type: 'BUY', bankAccountId: bankAlpha.id, ngnAmount: 50000, usdtAmount: 30, rate: 1666.67, totalFees: 0, netAmount: 50000, date: new Date().toISOString() });
    store.addTrade({ refId: 't_b1', type: 'SELL', bankAccountId: bankBeta.id, ngnAmount: 100000, usdtAmount: 60, rate: 1666.67, totalFees: 0, netAmount: 100000, date: new Date().toISOString() });

    // Now delete bankAlpha
    store.deleteBankAccount(bankAlpha.id);

    // Compute balances: should NOT throw and bankBeta should remain 100% accurate
    let balances;
    assert.doesNotThrow(() => {
      balances = store.getComputedBankBalances();
    }, 'getComputedBankBalances must not crash when orphaned bankAccountIds exist');

    assert.strictEqual(balances.has(bankAlpha.id), false, 'Deleted bank must not be in active balances');
    assert.strictEqual(balances.has(bankBeta.id), true, 'Remaining bank must be present');
    assert.strictEqual(balances.get(bankBeta.id).currentBalance, 500000, 'Remaining bank balance must be accurate (400k + 100k = 500k)');
  });

  it('4.4: Dynamic ledger maintains mathematical exactness when multi-bank trades are interleaved with bank transfers', async () => {
    const ctx = await initFullContext();
    const { store } = ctx;

    store.clearAllData();
    const bank1 = store.addBankAccount({ name: 'Bank 1', last4: '1111', initialBalance: 1000000 });
    const bank2 = store.addBankAccount({ name: 'Bank 2', last4: '2222', initialBalance: 500000 });

    // Trade on Bank 1: BUY ₦200,000 (net 200,050 with fee) -> Bank 1 = 799,950
    store.addTrade({ type: 'BUY', bankAccountId: bank1.id, ngnAmount: 200000, usdtAmount: 125, rate: 1600, totalFees: 50, netAmount: 200050, date: new Date().toISOString() });

    // Transfer from Bank 1 to Bank 2: ₦300,000 (with ₦10 fee)
    // Bank 1: 799,950 - 300,010 = 499,940
    // Bank 2: 500,000 + 300,000 = 800,000
    store.addTransfer({ asset: 'NGN', fromBankId: bank1.id, toBankId: bank2.id, amount: 300000, fee: 10, date: new Date().toISOString() });

    // Trade on Bank 2: SELL ₦150,000 -> Bank 2 = 950,000
    store.addTrade({ type: 'SELL', bankAccountId: bank2.id, ngnAmount: 150000, usdtAmount: 90, rate: 1666.67, totalFees: 0, netAmount: 150000, date: new Date().toISOString() });

    const balances = store.getComputedBankBalances();
    const b1 = balances.get(bank1.id);
    const b2 = balances.get(bank2.id);

    assert.strictEqual(b1.currentBalance, 499940, 'Bank 1 balance mismatch after interleaved trades and transfers');
    assert.strictEqual(b1.totalOutflow, 200050 + 300010, 'Bank 1 total outflow mismatch');

    assert.strictEqual(b2.currentBalance, 950000, 'Bank 2 balance mismatch after interleaved trades and transfers');
    assert.strictEqual(b2.totalInflow, 300000 + 150000, 'Bank 2 total inflow mismatch');
  });
});

// ---------------------------------------------------------------------------
// SUITE 5: MASS VOLUME (500 TRADES / 10 BANKS), REACTIVE MIGRATION & FEE MATRIX
// ---------------------------------------------------------------------------
describe('Challenger Multi-Bank — 5. Mass Volume, Reactive Account Migration & Fee Boundary Matrix', () => {

  it('5.1: 500 trades across 10 bank accounts maintain 100% exact cash conservation without float drift', async () => {
    const ctx = await initFullContext();
    const { store, fees, utils } = ctx;

    store.clearAllData();

    // Create 10 bank accounts
    const banks = [];
    for (let b = 1; b <= 10; b++) {
      banks.push(store.addBankAccount({
        name: `Bank Account #${b}`,
        last4: `000${b}`,
        initialBalance: b * 500000 // 500k to 5M
      }));
    }

    const expectedStats = new Map();
    banks.forEach(b => {
      expectedStats.set(b.id, {
        initialBalance: Number(b.initialBalance),
        totalInflow: 0,
        totalOutflow: 0,
        totalFees: 0
      });
    });

    let totalGlobalInflows = 0;
    let totalGlobalOutflows = 0;

    // Generate 500 trades
    for (let i = 0; i < 500; i++) {
      const isBuy = i % 2 === 0;
      const direction = isBuy ? 'BUY' : 'SELL';
      const assignedBank = banks[i % 10];
      const rate = 1550 + (i * 0.25);
      const usdt = 10 + (i % 100);
      const ngn = Math.round(rate * usdt * 100) / 100;
      const isSameBank = isBuy && (i % 4 === 0);

      const tradeFees = fees.calculateFintechTradeFees(direction, ngn, isSameBank);
      const totalTradeFees = tradeFees.reduce((s, f) => s + f.amount, 0);
      const { netAmount, effectiveRate } = utils.calculateTradeBreakdown(direction, ngn, usdt, totalTradeFees);

      const stats = expectedStats.get(assignedBank.id);
      stats.totalFees += totalTradeFees;

      if (direction === 'BUY') {
        stats.totalOutflow += netAmount;
        totalGlobalOutflows += netAmount;
      } else {
        stats.totalInflow += netAmount;
        totalGlobalInflows += netAmount;
      }

      store.addTrade({
        id: `trade_mass_${i}`,
        refId: `ref_mass_${i}`,
        type: direction,
        bankAccountId: assignedBank.id,
        ngnAmount: ngn,
        usdtAmount: usdt,
        rate,
        totalFees: totalTradeFees,
        netAmount,
        effectiveRate,
        date: new Date(1754000000000 + (i * 30000)).toISOString()
      });
    }

    assert.strictEqual(store.getTrades().length, 500, 'All 500 trades must be loaded in store');

    const balances = store.getComputedBankBalances();

    // Verify each bank individually
    banks.forEach(bank => {
      const exp = expectedStats.get(bank.id);
      const act = balances.get(bank.id);

      assert.closeTo(act.totalInflow, exp.totalInflow, 0.01, `Bank ${bank.name} totalInflow drift in 500-trade batch`);
      assert.closeTo(act.totalOutflow, exp.totalOutflow, 0.01, `Bank ${bank.name} totalOutflow drift in 500-trade batch`);
      assert.closeTo(act.totalFees, exp.totalFees, 0.01, `Bank ${bank.name} totalFees drift in 500-trade batch`);

      const expectedCurrent = exp.initialBalance + exp.totalInflow - exp.totalOutflow;
      assert.closeTo(act.currentBalance, expectedCurrent, 0.01, `Bank ${bank.name} currentBalance drift in 500-trade batch`);
    });

    // Global Money Conservation
    const sumInitial = banks.reduce((s, b) => s + Number(b.initialBalance), 0);
    const sumCurrent = Array.from(balances.values()).reduce((s, b) => s + b.currentBalance, 0);
    const expectedSumCurrent = sumInitial + totalGlobalInflows - totalGlobalOutflows;

    assert.closeTo(sumCurrent, expectedSumCurrent, 0.01, 'Global sum of 10 bank balances must strictly equal sumInitial + totalInflows - totalOutflows');
  });

  it('5.2: Reassigning trade bankAccountId reactively migrates cash flow without phantom double-counting', async () => {
    const ctx = await initFullContext();
    const { store } = ctx;

    store.clearAllData();
    const bankOrig = store.addBankAccount({ name: 'Bank Orig', last4: '1111', initialBalance: 1000000 });
    const bankDest = store.addBankAccount({ name: 'Bank Dest', last4: '2222', initialBalance: 1000000 });

    // 1. Add BUY trade assigned to bankOrig
    const trade = store.addTrade({
      type: 'BUY',
      bankAccountId: bankOrig.id,
      ngnAmount: 300000,
      usdtAmount: 200,
      rate: 1500,
      totalFees: 50,
      netAmount: 300050,
      date: new Date().toISOString()
    });

    let balances = store.getComputedBankBalances();
    assert.strictEqual(balances.get(bankOrig.id).currentBalance, 699950);
    assert.strictEqual(balances.get(bankDest.id).currentBalance, 1000000);

    // 2. User edits trade to reassign bankAccountId to bankDest
    store.updateTrade(trade.id, { bankAccountId: bankDest.id });

    balances = store.getComputedBankBalances();
    // bankOrig is restored to full initial balance
    assert.strictEqual(balances.get(bankOrig.id).currentBalance, 1000000, 'Original bank balance must be restored');
    assert.strictEqual(balances.get(bankOrig.id).totalOutflow, 0, 'Original bank outflow must be cleared');

    // bankDest receives the debit
    assert.strictEqual(balances.get(bankDest.id).currentBalance, 699950, 'Destination bank must receive exact debit');
    assert.strictEqual(balances.get(bankDest.id).totalOutflow, 300050, 'Destination bank outflow must match netAmount');

    // 3. Delete trade
    store.deleteTrade(trade.id);
    balances = store.getComputedBankBalances();

    assert.strictEqual(balances.get(bankOrig.id).currentBalance, 1000000);
    assert.strictEqual(balances.get(bankDest.id).currentBalance, 1000000);
  });

  it('5.3: Fintech Fee Threshold Matrix accounts exact fees and debits for all boundary amounts', async () => {
    const ctx = await initFullContext();
    const { fees } = ctx;

    // Boundary Test Cases:
    // 1. BUY < 5,000 (!sameBank) -> 0 fee
    const fee1 = fees.calculateFintechTradeFees('BUY', 4999.99, false);
    assert.strictEqual(fee1.reduce((s, f) => s + f.amount, 0), 0);

    // 2. BUY = 5,000 (!sameBank) -> 10 fee
    const fee2 = fees.calculateFintechTradeFees('BUY', 5000.00, false);
    assert.strictEqual(fee2.reduce((s, f) => s + f.amount, 0), 10);

    // 3. BUY = 5,000 (sameBank) -> 0 fee
    const fee3 = fees.calculateFintechTradeFees('BUY', 5000.00, true);
    assert.strictEqual(fee3.reduce((s, f) => s + f.amount, 0), 0);

    // 4. BUY = 9,999.99 (!sameBank) -> 10 fee
    const fee4 = fees.calculateFintechTradeFees('BUY', 9999.99, false);
    assert.strictEqual(fee4.reduce((s, f) => s + f.amount, 0), 10);

    // 5. BUY = 9,999.99 (sameBank) -> 0 fee
    const fee5 = fees.calculateFintechTradeFees('BUY', 9999.99, true);
    assert.strictEqual(fee5.reduce((s, f) => s + f.amount, 0), 0);

    // 6. BUY = 10,000.00 (!sameBank) -> 10 (transfer) + 50 (stamp duty) = 60
    const fee6 = fees.calculateFintechTradeFees('BUY', 10000.00, false);
    assert.strictEqual(fee6.reduce((s, f) => s + f.amount, 0), 60);

    // 7. BUY = 10,000.00 (sameBank) -> 50 (stamp duty only)
    const fee7 = fees.calculateFintechTradeFees('BUY', 10000.00, true);
    assert.strictEqual(fee7.reduce((s, f) => s + f.amount, 0), 50);

    // 8. SELL = any amount -> 0 fee
    const fee8 = fees.calculateFintechTradeFees('SELL', 5000000, false);
    assert.strictEqual(fee8.reduce((s, f) => s + f.amount, 0), 0);
  });
});

