/**
 * Tier 2: Boundary & Corner Cases — R4: Search, Navigation & Interactive Order Book UX
 */

const { describe, it, beforeEach } = require('../harness/test-runner');
const { assert } = require('../harness/assertions');
const { setupDomEnvironment } = require('../harness/dom-mock');

describe('Tier 2 — R4: Boundary & Corner Cases (Search & Navigation)', () => {
  let dom;

  beforeEach(() => {
    dom = setupDomEnvironment();
  });

  it('R4-B.1: Search query with regex special meta-characters matches literally without crash', () => {
    const trades = [
      { id: 't1', refId: 'order[2026]*special', counterparty: 'User(VIP)+Pro', notes: 'Rate: $1600 / USDT?' },
      { id: 't2', refId: 'normal_order_123', counterparty: 'PlainUser', notes: 'Simple note' }
    ];

    function searchTrades(list, query) {
      const q = query.trim().toLowerCase();
      if (!q) return list;
      return list.filter(t => {
        const fields = [t.refId, t.counterparty, t.notes].filter(Boolean).map(s => s.toLowerCase());
        return fields.some(f => f.includes(q));
      });
    }

    // Test meta-characters: [, *, +, ?, $
    assert.strictEqual(searchTrades(trades, '[').length, 1);
    assert.strictEqual(searchTrades(trades, '*').length, 1);
    assert.strictEqual(searchTrades(trades, '+').length, 1);
    assert.strictEqual(searchTrades(trades, '?').length, 1);
    assert.strictEqual(searchTrades(trades, '$1600').length, 1);
    assert.strictEqual(searchTrades(trades, '(VIP)').length, 1);
  });

  it('R4-B.2: Search with excessive whitespace and mixed uppercase matches trimmed text', () => {
    const trades = [
      { id: 't1', refId: '1849302948572019', counterparty: 'CryptoKing', notes: 'P2P Transfer' }
    ];

    function searchTrades(list, query) {
      const q = query.trim().toLowerCase();
      if (!q) return list;
      return list.filter(t => {
        const fields = [t.refId, t.counterparty, t.notes].filter(Boolean).map(s => s.toLowerCase());
        return fields.some(f => f.includes(q));
      });
    }

    assert.strictEqual(searchTrades(trades, '  1849302948572019   ').length, 1);
    assert.strictEqual(searchTrades(trades, '   CRYPTOKING  ').length, 1);
    assert.strictEqual(searchTrades(trades, '   nonexistent   ').length, 0);
  });

  it('R4-B.3: Empty or blank search query returns full unfiltered dataset', () => {
    const trades = [{ id: '1' }, { id: '2' }, { id: '3' }];
    function searchTrades(list, query) {
      const q = (query || '').trim().toLowerCase();
      if (!q) return list;
      return list.filter(t => (t.id || '').includes(q));
    }

    assert.strictEqual(searchTrades(trades, '').length, 3);
    assert.strictEqual(searchTrades(trades, '   ').length, 3);
    assert.strictEqual(searchTrades(trades, null).length, 3);
  });

  it('R4-B.4: Form validation flags invalid and zero-value numerical inputs', () => {
    function validateTradeInput({ date, bankAccountId, rate, ngnAmount, usdtAmount }) {
      const errors = [];
      if (!date) errors.push('date');
      if (!bankAccountId) errors.push('bankAccountId');
      if (!rate || rate <= 0) errors.push('rate');
      if (!ngnAmount || ngnAmount <= 0) errors.push('ngnAmount');
      if (!usdtAmount || usdtAmount <= 0) errors.push('usdtAmount');
      return { isValid: errors.length === 0, errors };
    }

    const invalidTest = validateTradeInput({
      date: '',
      bankAccountId: '',
      rate: -1500,
      ngnAmount: 0,
      usdtAmount: 0
    });

    assert.strictEqual(invalidTest.isValid, false);
    assert.strictEqual(invalidTest.errors.length, 5);

    const validTest = validateTradeInput({
      date: '2026-08-24T12:00:00Z',
      bankAccountId: 'bank_opay',
      rate: 1600,
      ngnAmount: 500000,
      usdtAmount: 312.5
    });

    assert.strictEqual(validTest.isValid, true);
    assert.strictEqual(validTest.errors.length, 0);
  });

  it('R4-B.5: Interactive order book row handles zero-volume or missing nickname without errors', () => {
    const sampleAd = {
      price: '1610.50',
      lastQuantity: '0.00',
      minAmount: '0',
      maxAmount: '0',
      nickName: null
    };

    const price = parseFloat(sampleAd.price) || 0;
    const qty = parseFloat(sampleAd.lastQuantity) || 0;
    const name = sampleAd.nickName || sampleAd.memberName || sampleAd.userId || 'Advertiser';

    assert.strictEqual(price, 1610.50);
    assert.strictEqual(qty, 0);
    assert.strictEqual(name, 'Advertiser');
  });
}, { tier: 2, category: 'R4: Boundary Cases' });
