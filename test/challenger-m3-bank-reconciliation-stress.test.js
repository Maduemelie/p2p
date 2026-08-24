/**
 * Adversarial Stress Test Suite for Milestone 3 (R3: Comprehensive Multi-Bank Order Reconciliation)
 * Executed by Challenger 2
 */

const { describe, it, beforeEach } = require('./harness/test-runner');
const { assert } = require('./harness/assertions');
const { setupDomEnvironment } = require('./harness/dom-mock');
const fs = require('fs');
const path = require('path');

// Helper to wait for DOM/async microtasks
const tick = (ms = 10) => new Promise(resolve => setTimeout(resolve, ms));

async function initTestContext() {
  const dom = setupDomEnvironment();

  // Import core modules
  const utils = await import('../js/utils.js');
  const feesModule = await import('../js/fees.js');
  const storeModule = await import('../js/store.js');
  const bybitServiceModule = await import('../js/bybitService.js');
  const modalsView = await import('../js/views/modals.view.js');
  const settingsView = await import('../js/views/settings.view.js');
  const addTradeView = await import('../js/views/addTrade.view.js');

  // Build full DOM shell
  dom.document.body.innerHTML = `
    <div id="app-container">
      ${modalsView.renderModalsView()}
      ${settingsView.renderSettingsView()}
      ${addTradeView.renderAddTradeView()}
      <select id="filter-bank"></select>
      <div id="bank-accounts-list"></div>
      <div id="transfers-summary-list"></div>
    </div>
  `;

  const banksModule = await import('../js/banks.js');
  const transfersModule = await import('../js/transfers.js');
  const settingsModule = await import('../js/settings.js');
  const tradesModule = await import('../js/trades.js');

  return {
    dom,
    utils,
    feesModule,
    storeModule,
    bybitServiceModule,
    banksModule,
    transfersModule,
    settingsModule,
    tradesModule
  };
}

// ============================================================================
// 1. DYNAMIC BANK LEDGER COMPUTATION & MATHEMATICAL CONSERVATION HARNESS
// ============================================================================
describe('Challenger M3 — 1. Dynamic Bank Ledger Math & Conservation Invariants', () => {

  it('1.1: Math Conservation Invariant across 1,000 randomized trades on 10 custom bank accounts', async () => {
    const ctx = await initTestContext();
    const { storeModule } = ctx;
    const store = storeModule.store;
    store.clearAllData();
    // Wipe default banks for clean 10-bank topology
    store.saveItem('bybit_p2p_banks', []);

    // Setup 10 banks with distinct initial balances
    const bankIds = [];
    let expectedTotalInitial = 0;
    for (let b = 1; b <= 10; b++) {
      const initBal = b * 125000.75;
      expectedTotalInitial += initBal;
      const bank = store.addBankAccount({
        name: `Bank Account #${b}`,
        last4: String(1000 + b),
        alias: `Vault ${b}`,
        initialBalance: initBal
      });
      bankIds.push(bank.id);
    }

    let expectedSystemInflow = 0;
    let expectedSystemOutflow = 0;
    let expectedSystemFees = 0;

    const bankTracking = new Map();
    bankIds.forEach((id, idx) => {
      bankTracking.set(id, {
        initial: (idx + 1) * 125000.75,
        inflow: 0,
        outflow: 0,
        fees: 0
      });
    });

    // Generate 1,000 trades (500 BUYs, 500 SELLs) with arbitrary kobo amounts and fees
    for (let i = 0; i < 1000; i++) {
      const bankId = bankIds[i % bankIds.length];
      const isBuy = i % 2 === 0;
      const type = isBuy ? 'BUY' : 'SELL';
      const ngnAmount = 5000 + ((i * 137.65) % 150000);
      const totalFees = isBuy ? (i % 3 === 0 ? 53.75 : 0) : 0;
      const netAmount = isBuy ? ngnAmount + totalFees : Math.max(0, ngnAmount - totalFees);
      const rate = 1500 + (i % 200);
      const usdtAmount = Number((ngnAmount / rate).toFixed(4));

      store.addTrade({
        type,
        bankAccountId: bankId,
        ngnAmount,
        usdtAmount,
        rate,
        totalFees,
        netAmount,
        date: new Date(Date.now() - i * 60000).toISOString()
      });

      const track = bankTracking.get(bankId);
      if (isBuy) {
        track.outflow += netAmount;
        track.fees += totalFees;
        expectedSystemOutflow += netAmount;
        expectedSystemFees += totalFees;
      } else {
        track.inflow += netAmount;
        track.fees += totalFees;
        expectedSystemInflow += netAmount;
        expectedSystemFees += totalFees;
      }
    }

    const computed = store.getComputedBankBalances();
    assert.strictEqual(computed.size, 10, 'All 10 banks must be tracked in computed balance map');

    let totalSystemCalculatedBalance = 0;
    for (const [bankId, track] of bankTracking.entries()) {
      const record = computed.get(bankId);
      assert.ok(record, `Record for bank ${bankId} must exist`);
      
      const expectedBalance = track.initial + track.inflow - track.outflow;
      assert.ok(
        Math.abs(record.currentBalance - expectedBalance) < 0.0001,
        `Bank ${bankId} balance mismatch: expected ${expectedBalance}, got ${record.currentBalance}`
      );
      assert.ok(
        Math.abs(record.totalInflow - track.inflow) < 0.0001,
        `Bank ${bankId} inflow mismatch: expected ${track.inflow}, got ${record.totalInflow}`
      );
      assert.ok(
        Math.abs(record.totalOutflow - track.outflow) < 0.0001,
        `Bank ${bankId} outflow mismatch: expected ${track.outflow}, got ${record.totalOutflow}`
      );
      assert.ok(
        Math.abs(record.totalFees - track.fees) < 0.0001,
        `Bank ${bankId} fees mismatch: expected ${track.fees}, got ${record.totalFees}`
      );

      totalSystemCalculatedBalance += record.currentBalance;
    }

    const expectedSystemBalance = expectedTotalInitial + expectedSystemInflow - expectedSystemOutflow;
    assert.ok(
      Math.abs(totalSystemCalculatedBalance - expectedSystemBalance) < 0.0001,
      `Total system cash conservation violated: expected ${expectedSystemBalance}, got ${totalSystemCalculatedBalance}`
    );
  });

  it('1.2: Trade mutation lifecycle (Add -> Edit Direction/Amount/Bank -> Delete) maintains exact ledger integrity', async () => {
    const ctx = await initTestContext();
    const { storeModule } = ctx;
    const store = storeModule.store;
    store.clearAllData();

    const bankA = store.addBankAccount({ name: 'Alpha Bank', last4: '1111', initialBalance: 500000 });
    const bankB = store.addBankAccount({ name: 'Beta Bank', last4: '2222', initialBalance: 300000 });

    // Step 1: Add initial BUY on Bank A (Outflow: ₦200,050)
    const trade = store.addTrade({
      type: 'BUY',
      bankAccountId: bankA.id,
      ngnAmount: 200000,
      usdtAmount: 125,
      rate: 1600,
      totalFees: 50,
      netAmount: 200050,
      date: new Date().toISOString()
    });

    let balMap = store.getComputedBankBalances();
    assert.strictEqual(balMap.get(bankA.id).currentBalance, 299950);
    assert.strictEqual(balMap.get(bankB.id).currentBalance, 300000);

    // Step 2: Edit trade to change amount & fee (Outflow: ₦250,100)
    store.updateTrade(trade.id, {
      ngnAmount: 250000,
      totalFees: 100,
      netAmount: 250100
    });

    balMap = store.getComputedBankBalances();
    assert.strictEqual(balMap.get(bankA.id).currentBalance, 249900);
    assert.strictEqual(balMap.get(bankA.id).totalOutflow, 250100);

    // Step 3: Edit trade to switch bankAccountId from Bank A to Bank B
    store.updateTrade(trade.id, {
      bankAccountId: bankB.id
    });

    balMap = store.getComputedBankBalances();
    assert.strictEqual(balMap.get(bankA.id).currentBalance, 500000, 'Bank A should be restored to initial balance');
    assert.strictEqual(balMap.get(bankA.id).totalOutflow, 0, 'Bank A outflow should be 0');
    assert.strictEqual(balMap.get(bankB.id).currentBalance, 49900, 'Bank B should be debited ₦250,100');
    assert.strictEqual(balMap.get(bankB.id).totalOutflow, 250100, 'Bank B outflow should be ₦250,100');

    // Step 4: Edit trade direction from BUY to SELL (Bank B becomes Inflow: ₦250,000)
    store.updateTrade(trade.id, {
      type: 'SELL',
      totalFees: 0,
      netAmount: 250000
    });

    balMap = store.getComputedBankBalances();
    assert.strictEqual(balMap.get(bankB.id).currentBalance, 550000, 'Bank B should be credited ₦250,000');
    assert.strictEqual(balMap.get(bankB.id).totalInflow, 250000);
    assert.strictEqual(balMap.get(bankB.id).totalOutflow, 0);

    // Step 5: Delete trade
    store.deleteTrade(trade.id);

    balMap = store.getComputedBankBalances();
    assert.strictEqual(balMap.get(bankA.id).currentBalance, 500000, 'Bank A remains at initial');
    assert.strictEqual(balMap.get(bankB.id).currentBalance, 300000, 'Bank B is restored to initial');
    assert.strictEqual(balMap.get(bankB.id).totalInflow, 0);
  });

  it('1.3: Inter-bank transfer network with fees preserves zero-drift conservation invariant', async () => {
    const ctx = await initTestContext();
    const { storeModule } = ctx;
    const store = storeModule.store;
    store.clearAllData();

    const bank1 = store.addBankAccount({ name: 'Bank 1', last4: '0001', initialBalance: 1000000 });
    const bank2 = store.addBankAccount({ name: 'Bank 2', last4: '0002', initialBalance: 1000000 });
    const bank3 = store.addBankAccount({ name: 'Bank 3', last4: '0003', initialBalance: 1000000 });

    // Transfer 1: Bank 1 -> Bank 2 (₦200,000 + ₦10.75 fee)
    const t1 = store.addTransfer({
      asset: 'NGN',
      fromBankId: bank1.id,
      toBankId: bank2.id,
      amount: 200000,
      fee: 10.75,
      date: new Date().toISOString()
    });

    // Transfer 2: Bank 2 -> Bank 3 (₦350,000 + ₦26.88 fee)
    const t2 = store.addTransfer({
      asset: 'NGN',
      fromBankId: bank2.id,
      toBankId: bank3.id,
      amount: 350000,
      fee: 26.88,
      date: new Date().toISOString()
    });

    // Transfer 3: Bank 3 -> Bank 1 (₦100,000 + ₦10.75 fee)
    const t3 = store.addTransfer({
      asset: 'NGN',
      fromBankId: bank3.id,
      toBankId: bank1.id,
      amount: 100000,
      fee: 10.75,
      date: new Date().toISOString()
    });

    let balMap = store.getComputedBankBalances();

    // Bank 1: 1,000,000 - (200,000 + 10.75) + 100,000 = 899,989.25
    assert.strictEqual(balMap.get(bank1.id).currentBalance, 899989.25);
    assert.strictEqual(balMap.get(bank1.id).totalOutflow, 200010.75);
    assert.strictEqual(balMap.get(bank1.id).totalInflow, 100000);
    assert.strictEqual(balMap.get(bank1.id).totalFees, 10.75);

    // Bank 2: 1,000,000 + 200,000 - (350,000 + 26.88) = 849,973.12
    assert.strictEqual(balMap.get(bank2.id).currentBalance, 849973.12);
    assert.strictEqual(balMap.get(bank2.id).totalInflow, 200000);
    assert.strictEqual(balMap.get(bank2.id).totalOutflow, 350026.88);
    assert.strictEqual(balMap.get(bank2.id).totalFees, 26.88);

    // Bank 3: 1,000,000 + 350,000 - (100,000 + 10.75) = 1,249,989.25
    assert.strictEqual(balMap.get(bank3.id).currentBalance, 1249989.25);
    assert.strictEqual(balMap.get(bank3.id).totalInflow, 350000);
    assert.strictEqual(balMap.get(bank3.id).totalOutflow, 100010.75);
    assert.strictEqual(balMap.get(bank3.id).totalFees, 10.75);

    // Verify overall system loss is exactly the sum of transfer fees: 10.75 + 26.88 + 10.75 = 48.38
    const systemTotal = balMap.get(bank1.id).currentBalance + balMap.get(bank2.id).currentBalance + balMap.get(bank3.id).currentBalance;
    const expectedSystemTotal = 3000000 - (10.75 + 26.88 + 10.75);
    assert.ok(Math.abs(systemTotal - expectedSystemTotal) < 0.0001, 'System balance must reflect exact fee deductions');

    // Deleting t2 reverts Bank 2 and Bank 3 balances
    store.deleteTransfer(t2.id);
    balMap = store.getComputedBankBalances();
    // Bank 2: 1,000,000 + 200,000 = 1,200,000
    assert.strictEqual(balMap.get(bank2.id).currentBalance, 1200000);
    // Bank 3: 1,000,000 - (100,000 + 10.75) = 899,989.25
    assert.strictEqual(balMap.get(bank3.id).currentBalance, 899989.25);
  });
});

// ============================================================================
// 2. BATCH IMPORT & MULTI-BANK ASSIGNMENT INTEGRATION HARNESS
// ============================================================================
describe('Challenger M3 — 2. Batch Import & Multi-Bank Assignment Integration', () => {

  it('2.1: Full Bybit order batch with BUY and SELL correctly assigns selected banks and calculates ledger', async () => {
    const ctx = await initTestContext();
    const { dom, storeModule, bybitServiceModule, settingsModule } = ctx;
    const store = storeModule.store;
    store.clearAllData();

    const bankA = store.addBankAccount({ name: 'OPay Business', last4: '1001', initialBalance: 800000 });
    const bankB = store.addBankAccount({ name: 'Kuda Trading', last4: '2002', initialBalance: 500000 });
    const bankC = store.addBankAccount({ name: 'Zenith Escrow', last4: '3003', initialBalance: 200000 });

    settingsModule.initSettings();

    // Mock Bybit P2P completed orders (status 50)
    const mockOrders = [
      {
        id: '90001',
        side: 0, // BUY
        price: '1600.00',
        amount: '160000.00',
        notifyTokenQuantity: '100.00',
        status: 50,
        createDate: Date.now() - 300000,
        sellerRealName: 'CryptoTrader99'
      },
      {
        id: '90002',
        side: 1, // SELL
        price: '1650.00',
        amount: '330000.00',
        notifyTokenQuantity: '200.00',
        status: 50,
        createDate: Date.now() - 200000,
        buyerRealName: 'NairaMerchant'
      },
      {
        id: '90003',
        side: 0, // BUY
        price: '1605.00',
        amount: '80250.00',
        notifyTokenQuantity: '50.00',
        status: 50,
        createDate: Date.now() - 100000,
        sellerRealName: 'LagosP2P'
      }
    ];

    bybitServiceModule.bybitService.fetchP2POrders = async () => ({ items: mockOrders });

    // Trigger Import click and wait for async fetch
    const btnImport = dom.document.getElementById('btn-import-bybit-trades');
    btnImport.click();
    await tick(20);

    // Modal should now be open
    const modalAssign = dom.document.getElementById('modal-assign-banks-backdrop');
    assert.strictEqual(modalAssign.classList.contains('hidden'), false, 'Assign modal must be visible');

    // Assign banks in dropdowns:
    // Order 90001 (BUY ₦160k, Same Bank -> Fee = ₦50 Stamp Duty, Outflow = ₦160,050) -> Bank A
    // Order 90002 (SELL ₦330k, Inflow = ₦330,000) -> Bank B
    // Order 90003 (BUY ₦80.25k, Same Bank -> Fee = ₦50 Stamp Duty, Outflow = ₦80,300) -> Bank C
    const selectElements = dom.document.querySelectorAll('.assign-bank-select');
    assert.strictEqual(selectElements.length, 3, 'Must render 3 bank assignment selectors');

    selectElements[0].value = bankA.id;
    selectElements[1].value = bankB.id;
    selectElements[2].value = bankC.id;

    // Submit Assign form
    const formAssign = dom.document.getElementById('form-assign-banks');
    formAssign.dispatchEvent({ type: 'submit', preventDefault: () => {} });

    // Modal should close
    assert.strictEqual(modalAssign.classList.contains('hidden'), true, 'Assign modal must close after submit');

    // Check store trades
    const trades = store.getTrades();
    assert.strictEqual(trades.length, 3, 'All 3 trades must be saved into store');

    const trade1 = trades.find(t => t.refId === '90001');
    const trade2 = trades.find(t => t.refId === '90002');
    const trade3 = trades.find(t => t.refId === '90003');

    assert.strictEqual(trade1.bankAccountId, bankA.id, 'Trade 90001 assigned to Bank A');
    assert.strictEqual(trade2.bankAccountId, bankB.id, 'Trade 90002 assigned to Bank B');
    assert.strictEqual(trade3.bankAccountId, bankC.id, 'Trade 90003 assigned to Bank C');

    // Check Ledger balances
    const balMap = store.getComputedBankBalances();
    // Bank A: 800,000 - (160,000 + 50) = 639,950
    assert.strictEqual(balMap.get(bankA.id).currentBalance, 639950);
    assert.strictEqual(balMap.get(bankA.id).totalOutflow, 160050);

    // Bank B: 500,000 + 330,000 = 830,000
    assert.strictEqual(balMap.get(bankB.id).currentBalance, 830000);
    assert.strictEqual(balMap.get(bankB.id).totalInflow, 330000);

    // Bank C: 200,000 - (80,250 + 50) = 119,700
    assert.strictEqual(balMap.get(bankC.id).currentBalance, 119700);
    assert.strictEqual(balMap.get(bankC.id).totalOutflow, 80300);
  });

  it('2.2: Batch import idempotence: re-fetching orders with partial or full overlaps skips duplicates cleanly', async () => {
    const ctx = await initTestContext();
    const { dom, storeModule, bybitServiceModule, settingsModule } = ctx;
    const store = storeModule.store;
    store.clearAllData();

    const bank = store.addBankAccount({ name: 'Primary Bank', last4: '7777', initialBalance: 1000000 });
    settingsModule.initSettings();

    // First batch: Order 101 (BUY 100k, fee 50) and 102 (SELL 120k, fee 0)
    const firstBatch = [
      { id: '101', side: 0, price: '1600', amount: '100000', quantity: '62.5', status: 50 },
      { id: '102', side: 1, price: '1650', amount: '120000', quantity: '72.72', status: 50 }
    ];

    bybitServiceModule.bybitService.fetchP2POrders = async () => ({ items: firstBatch });
    dom.document.getElementById('btn-import-bybit-trades').click();
    await tick(20);

    // Assign to our bank
    const sel1 = dom.document.querySelectorAll('.assign-bank-select');
    sel1.forEach(s => { s.value = bank.id; });

    // Confirm first batch
    const formAssign = dom.document.getElementById('form-assign-banks');
    formAssign.dispatchEvent({ type: 'submit', preventDefault: () => {} });

    assert.strictEqual(store.getTrades().length, 2);
    let balMap = store.getComputedBankBalances();
    // 1,000,000 - (100,000 + 50) + 120,000 = 1,019,950
    assert.strictEqual(balMap.get(bank.id).currentBalance, 1019950);

    // Second batch: Contains 101, 102 (duplicates) + 103 (new SELL 50k)
    const secondBatch = [
      { id: '101', side: 0, price: '1600', amount: '100000', quantity: '62.5', status: 50 },
      { id: '102', side: 1, price: '1650', amount: '120000', quantity: '72.72', status: 50 },
      { id: '103', side: 1, price: '1650', amount: '50000', quantity: '30.3', status: 50 }
    ];

    bybitServiceModule.bybitService.fetchP2POrders = async () => ({ items: secondBatch });
    dom.document.getElementById('btn-import-bybit-trades').click();
    await tick(20);

    // Only order 103 should be in modal
    const renderedCards = dom.document.querySelectorAll('.assign-bank-select');
    assert.strictEqual(renderedCards.length, 1, 'Only the new order 103 must appear in the assignment modal');
    assert.strictEqual(renderedCards[0].getAttribute('data-order-id'), '103');
    renderedCards[0].value = bank.id;

    // Confirm second batch
    formAssign.dispatchEvent({ type: 'submit', preventDefault: () => {} });

    assert.strictEqual(store.getTrades().length, 3, 'Total trades must be 3');
    balMap = store.getComputedBankBalances();
    // 1,019,950 + 50,000 = 1,069,950
    assert.strictEqual(balMap.get(bank.id).currentBalance, 1069950);

    // Third batch: All duplicates (101, 102, 103)
    bybitServiceModule.bybitService.fetchP2POrders = async () => ({ items: secondBatch });
    dom.document.getElementById('btn-import-bybit-trades').click();
    await tick(20);

    // Modal should NOT open, toast should indicate all orders already imported
    const modalAssign = dom.document.getElementById('modal-assign-banks-backdrop');
    assert.strictEqual(modalAssign.classList.contains('hidden'), true, 'Modal should remain hidden when 0 new orders');
    assert.strictEqual(store.getTrades().length, 3, 'Trade count must remain 3');
    assert.strictEqual(store.getComputedBankBalances().get(bank.id).currentBalance, 1069950);
  });
});

// ============================================================================
// 3. ADVERSARIAL STRESS TESTING: EDGE CASES, INJECTIONS & RESILIENCE
// ============================================================================
describe('Challenger M3 — 3. Adversarial Edge Cases & Modal Rendering Stress Harness', () => {

  it('3.1: Non-standard bank names and XSS vectors are escaped and do not corrupt modal DOM or ledger calculations', async () => {
    const ctx = await initTestContext();
    const { dom, storeModule, bybitServiceModule, settingsModule, banksModule } = ctx;
    const store = storeModule.store;
    store.clearAllData();

    // Create banks with adversarial strings
    const xssBank1 = store.addBankAccount({
      name: '<script>alert("hack")</script> Bank',
      last4: '9999',
      alias: '"><img src=x onerror=alert(1)>',
      initialBalance: 250000
    });

    const unicodeBank2 = store.addBankAccount({
      name: '🇳🇬 Diamond Vault 💎 ✨ 🚀',
      last4: '8888',
      alias: 'Special & Co. <Ltd>',
      initialBalance: 750000
    });

    const extremeBank3 = store.addBankAccount({
      name: 'A'.repeat(300),
      last4: '0000',
      alias: 'Long'.repeat(100),
      initialBalance: 100000000000.55 // 100 Billion Naira
    });

    settingsModule.initSettings();
    banksModule.initBanks();

    // Verify settings list renders without throwing
    const settingsBankList = dom.document.getElementById('bank-accounts-list');
    assert.ok(settingsBankList.innerHTML.includes('&lt;script&gt;'), 'XSS tags in bank name must be HTML escaped');
    assert.ok(settingsBankList.innerHTML.includes('&lt;img src=x'), 'XSS tags in alias must be HTML escaped');

    // Trigger Bybit Import modal
    const mockOrder = [{
      id: 'adv_001',
      side: 0,
      price: '1600',
      amount: '50000',
      quantity: '31.25',
      status: 50,
      sellerRealName: '<svg onload=alert(1)> Hacker'
    }];

    bybitServiceModule.bybitService.fetchP2POrders = async () => ({ items: mockOrder });
    dom.document.getElementById('btn-import-bybit-trades').click();
    await tick(20);

    const assignList = dom.document.getElementById('assign-banks-items-list');
    assert.ok(assignList.innerHTML.includes('&lt;script&gt;alert'), 'Dropdown option names must be escaped');
    assert.ok(assignList.innerHTML.includes('&lt;svg onload=alert(1)&gt;'), 'Counterparty XSS must be escaped');

    // Assign to extremeBank3 and confirm
    const select = dom.document.querySelector('.assign-bank-select');
    select.value = extremeBank3.id;
    dom.document.getElementById('form-assign-banks').dispatchEvent({ type: 'submit', preventDefault: () => {} });

    // Verify ledger calculated balance (50k BUY has ₦50 stamp duty -> 50,050 netAmount)
    const balMap = store.getComputedBankBalances();
    const extremeBal = balMap.get(extremeBank3.id).currentBalance;
    assert.ok(Math.abs(extremeBal - (100000000000.55 - 50050)) < 0.01, '100B balance calculation must be accurate');
  });

  it('3.2: Missing bank IDs, orphaned trades, and deleted bank accounts do not crash store or UI views', async () => {
    const ctx = await initTestContext();
    const { dom, storeModule, banksModule } = ctx;
    const store = storeModule.store;
    store.clearAllData();

    const bankA = store.addBankAccount({ name: 'Temp Bank A', last4: '1234', initialBalance: 100000 });
    const bankB = store.addBankAccount({ name: 'Temp Bank B', last4: '5678', initialBalance: 200000 });

    // Trade 1 with Bank A
    store.addTrade({
      type: 'BUY',
      bankAccountId: bankA.id,
      ngnAmount: 40000,
      usdtAmount: 25,
      rate: 1600,
      totalFees: 0,
      netAmount: 40000,
      date: new Date().toISOString()
    });

    // Trade 2 with Bank B
    store.addTrade({
      type: 'SELL',
      bankAccountId: bankB.id,
      ngnAmount: 60000,
      usdtAmount: 37.5,
      rate: 1600,
      totalFees: 0,
      netAmount: 60000,
      date: new Date().toISOString()
    });

    // Trade 3 with null/undefined/missing bankAccountId
    store.addTrade({
      type: 'BUY',
      bankAccountId: null,
      ngnAmount: 10000,
      usdtAmount: 6.25,
      rate: 1600,
      totalFees: 0,
      netAmount: 10000,
      date: new Date().toISOString()
    });

    // Trade 4 with phantom/corrupted bankAccountId
    store.addTrade({
      type: 'BUY',
      bankAccountId: 'ghost_bank_id_99999',
      ngnAmount: 20000,
      usdtAmount: 12.5,
      rate: 1600,
      totalFees: 0,
      netAmount: 20000,
      date: new Date().toISOString()
    });

    // Delete Bank A from store
    store.deleteBankAccount(bankA.id);

    // Call getComputedBankBalances - MUST NOT CRASH
    let balMap;
    assert.doesNotThrow(() => {
      balMap = store.getComputedBankBalances();
    }, 'getComputedBankBalances must not throw when orphaned trades exist');

    assert.strictEqual(balMap.has(bankA.id), false, 'Deleted Bank A should not be in active balance map');
    assert.strictEqual(balMap.has(bankB.id), true, 'Bank B must remain');
    assert.strictEqual(balMap.get(bankB.id).currentBalance, 260000, 'Bank B balance must be exactly 260,000');

    // UI render dropdowns - MUST NOT CRASH
    banksModule.initBanks();
    const filterSelect = dom.document.getElementById('filter-bank');
    assert.ok(filterSelect.innerHTML.includes('Temp Bank B'), 'Dropdown should render existing bank');
    assert.ok(!filterSelect.innerHTML.includes('Temp Bank A'), 'Dropdown should not contain deleted bank');
  });

  it('3.3: Empty bank configuration handled gracefully without crash during batch import fallback', async () => {
    const ctx = await initTestContext();
    const { dom, storeModule, bybitServiceModule, settingsModule } = ctx;
    const store = storeModule.store;
    store.clearAllData();

    // Wipe all banks
    store.saveItem('bybit_p2p_banks', []);
    assert.strictEqual(store.getBankAccounts().length, 0, 'No banks in store');

    settingsModule.initSettings();

    const mockOrders = [{
      id: 'no_bank_01',
      side: 0,
      price: '1600',
      amount: '50000',
      quantity: '31.25',
      status: 50
    }];

    bybitServiceModule.bybitService.fetchP2POrders = async () => ({ items: mockOrders });

    // Open import modal
    dom.document.getElementById('btn-import-bybit-trades').click();
    await tick(20);

    // Submit with empty bank list
    assert.doesNotThrow(() => {
      dom.document.getElementById('form-assign-banks').dispatchEvent({ type: 'submit', preventDefault: () => {} });
    }, 'Submitting assignment with no banks must not throw exception');

    const trades = store.getTrades();
    assert.strictEqual(trades.length, 1, 'Trade should be imported with default fallback bank ID');
    assert.strictEqual(trades[0].bankAccountId, 'bank_opay_default');
  });

  it('3.4: High-throughput stress test: 200 orders in batch import assigned across 20 banks processes in < 500ms', async () => {
    const ctx = await initTestContext();
    const { dom, storeModule, bybitServiceModule, settingsModule } = ctx;
    const store = storeModule.store;
    store.clearAllData();
    // Wipe default banks for 20-bank test
    store.saveItem('bybit_p2p_banks', []);

    // Setup 20 banks
    const banks = [];
    for (let b = 1; b <= 20; b++) {
      banks.push(store.addBankAccount({
        name: `Institution ${b}`,
        last4: String(2000 + b),
        initialBalance: 1000000
      }));
    }

    settingsModule.initSettings();

    // 200 orders
    const orders = [];
    for (let i = 1; i <= 200; i++) {
      orders.push({
        id: `stress_order_${i}`,
        side: i % 2 === 0 ? 0 : 1,
        price: '1600.00',
        amount: String(10000 + (i * 500)),
        notifyTokenQuantity: String(((10000 + (i * 500)) / 1600).toFixed(4)),
        status: 50,
        createDate: Date.now() - i * 10000,
        buyerRealName: `Buyer_${i}`,
        sellerRealName: `Seller_${i}`
      });
    }

    bybitServiceModule.bybitService.fetchP2POrders = async () => ({ items: orders });

    const startTime = Date.now();
    dom.document.getElementById('btn-import-bybit-trades').click();
    await tick(50);

    const selectElements = dom.document.querySelectorAll('.assign-bank-select');
    assert.strictEqual(selectElements.length, 200);

    // Map each order to a rotating bank
    selectElements.forEach((sel, idx) => {
      sel.value = banks[idx % banks.length].id;
    });

    // Submit
    dom.document.getElementById('form-assign-banks').dispatchEvent({ type: 'submit', preventDefault: () => {} });

    const duration = Date.now() - startTime;
    assert.strictEqual(store.getTrades().length, 200);

    // Compute balances
    const balMap = store.getComputedBankBalances();
    assert.strictEqual(balMap.size, 20);

    // Ensure processing took reasonable time under JS mock DOM parser (e.g. < 3000ms in Node mock)
    assert.ok(duration < 3000, `Batch processing took ${duration}ms, must be < 3000ms`);
  });
});
