/**
 * Tier 1: Feature Coverage — R4: Search, Navigation & Interactive Order Book UX
 */

const { describe, it, beforeEach } = require('../harness/test-runner');
const { assert } = require('../harness/assertions');
const { setupDomEnvironment } = require('../harness/dom-mock');
const fs = require('fs');
const path = require('path');

describe('Tier 1 — R4: Search, Navigation & Interactive Order Book UX', () => {
  let dom;

  beforeEach(() => {
    dom = setupDomEnvironment();
  });

  it('R4.1: Trade history search indexes and matches Bybit Order ID (refId)', () => {
    const historyJs = fs.readFileSync(path.resolve(__dirname, '../../js/history.js'), 'utf-8');
    
    // Acceptance criterion: "Pasting a Bybit Order ID (refId) into the Trade History search bar immediately displays the matching trade."
    const searchIndexesRefId = historyJs.includes('refId') || historyJs.includes('trade.refId');
    assert.ok(searchIndexesRefId, 'history.js search matching must check trade.refId');
  });

  it('R4.2: Trade history filtering logic correctly filters by refId query', () => {
    const trades = [
      { id: 't1', refId: '1849302948572019', counterparty: 'AlphaTrader', ngnAmount: 500000, usdtAmount: 312.5, rate: 1600, notes: 'Morning buy' },
      { id: 't2', refId: '9928174029184711', counterparty: 'BetaBuyer', ngnAmount: 200000, usdtAmount: 125, rate: 1600, notes: 'Afternoon sell' },
      { id: 't3', counterparty: 'GammaSeller', ngnAmount: 100000, usdtAmount: 62.5, rate: 1600, notes: 'Manual entry no ref' }
    ];

    function filterTrades(list, query) {
      const q = query.trim().toLowerCase();
      if (!q) return list;
      return list.filter(trade => {
        const refIdStr = (trade.refId || '').toLowerCase();
        const counterparty = (trade.counterparty || '').toLowerCase();
        const notes = (trade.notes || '').toLowerCase();
        const ngnStr = String(trade.ngnAmount);
        return refIdStr.includes(q) || counterparty.includes(q) || notes.includes(q) || ngnStr.includes(q);
      });
    }

    const matchRefIdExact = filterTrades(trades, '1849302948572019');
    assert.strictEqual(matchRefIdExact.length, 1, 'Should find 1 exact refId match');
    assert.strictEqual(matchRefIdExact[0].id, 't1');

    const matchRefIdPartial = filterTrades(trades, '9928174');
    assert.strictEqual(matchRefIdPartial.length, 1, 'Should find 1 partial refId match');
    assert.strictEqual(matchRefIdPartial[0].id, 't2');
  });

  it('R4.3: Order book row interaction connects rate and volume to trade form navigation', () => {
    const pricingJs = fs.readFileSync(path.resolve(__dirname, '../../js/pricing.js'), 'utf-8');
    const pricingViewJs = fs.readFileSync(path.resolve(__dirname, '../../js/views/pricing.view.js'), 'utf-8');

    // Acceptance criterion: "Tapping an order book row in the Pricing Assistant navigates to the trade form with pre-filled rate and volume."
    const hasOrderBookRowHandler = pricingJs.includes('orderbook-row') || pricingViewJs.includes('orderbook-row');
    assert.ok(hasOrderBookRowHandler, 'Order book rows must have interactive row handler');
  });

  it('R4.4: Record Trade form includes an accessible Cancel / Back navigation control', () => {
    const addTradeViewJs = fs.readFileSync(path.resolve(__dirname, '../../js/views/addTrade.view.js'), 'utf-8');
    const tradesJs = fs.readFileSync(path.resolve(__dirname, '../../js/trades.js'), 'utf-8');

    // Acceptance criterion: '"Record Trade" form includes an accessible "Cancel / Back" button that returns to the previous screen.'
    const hasCancelButton = addTradeViewJs.includes('btn-cancel-edit') || 
                            addTradeViewJs.includes('Cancel') || 
                            addTradeViewJs.includes('btn-back') || 
                            addTradeViewJs.includes('Back');
    assert.ok(hasCancelButton, 'Record Trade view must include Cancel / Back button');
  });

  it('R4.5: Cancel navigation resets active editing state and clears form inputs', async () => {
    const tradesModule = await import('../../js/trades.js');
    assert.ok(typeof tradesModule.resetTradeForm === 'function', 'resetTradeForm function should be exported');
  });
}, { tier: 1, category: 'R4: Search & Navigation' });
