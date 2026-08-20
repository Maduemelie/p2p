/**
 * Bybit NGN P2P Trade Tracker — Store (Data Persistence Layer)
 * Handles LocalStorage read/write, migrations, opening inventory, and reactive update events
 */

import { generateId } from './utils.js';

const STORAGE_KEYS = {
  VERSION: 'bybit_p2p_version',
  TRADES: 'bybit_p2p_trades',
  BANKS: 'bybit_p2p_banks',
  TRANSFERS: 'bybit_p2p_transfers',
  SETTINGS: 'bybit_p2p_settings',
  OPENING_INVENTORY: 'bybit_p2p_opening_inventory'
};

const CURRENT_SCHEMA_VERSION = 1;

const DEFAULT_BANKS = [
  { id: 'bank_opay_default', name: 'OPay', last4: '1234', alias: 'OPay Main' },
  { id: 'bank_kuda_default', name: 'Kuda Bank', last4: '5678', alias: 'Kuda Trading' },
  { id: 'bank_gtb_default', name: 'GTBank', last4: '9012', alias: 'GTB Corporate' }
];

class Store {
  constructor() {
    this.init();
  }

  init() {
    // Check & perform schema migrations if necessary
    const savedVersion = parseInt(localStorage.getItem(STORAGE_KEYS.VERSION) || '0', 10);
    if (savedVersion < CURRENT_SCHEMA_VERSION) {
      this.migrate(savedVersion);
      localStorage.setItem(STORAGE_KEYS.VERSION, CURRENT_SCHEMA_VERSION.toString());
    }

    // Initialize default banks if none exist
    if (!localStorage.getItem(STORAGE_KEYS.BANKS)) {
      this.saveItem(STORAGE_KEYS.BANKS, DEFAULT_BANKS);
    }
  }

  migrate(fromVersion) {
    if (fromVersion === 0) {
      // First time initialization
      if (!localStorage.getItem(STORAGE_KEYS.TRADES)) {
        this.saveItem(STORAGE_KEYS.TRADES, []);
      }
      if (!localStorage.getItem(STORAGE_KEYS.TRANSFERS)) {
        this.saveItem(STORAGE_KEYS.TRANSFERS, []);
      }
    }
  }

  // --- Generic Helpers ---

  getItem(key, fallback = []) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : fallback;
    } catch (e) {
      console.error(`[Store] Error reading key ${key}:`, e);
      return fallback;
    }
  }

  saveItem(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error(`[Store] Error saving key ${key}:`, e);
      return false;
    }
  }

  notify(eventType, payload = null) {
    window.dispatchEvent(new CustomEvent('store:updated', {
      detail: { type: eventType, payload, timestamp: Date.now() }
    }));
  }

  // --- Trades CRUD ---

  getTrades() {
    return this.getItem(STORAGE_KEYS.TRADES, []);
  }

  getTradeById(id) {
    const trades = this.getTrades();
    return trades.find(t => t.id === id) || null;
  }

  addTrade(tradeData) {
    const trades = this.getTrades();
    const newTrade = {
      id: generateId('trade'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...tradeData
    };
    trades.unshift(newTrade);
    this.saveItem(STORAGE_KEYS.TRADES, trades);
    this.notify('trades', newTrade);
    return newTrade;
  }

  updateTrade(id, updatedFields) {
    const trades = this.getTrades();
    const index = trades.findIndex(t => t.id === id);
    if (index === -1) return null;

    trades[index] = {
      ...trades[index],
      ...updatedFields,
      updatedAt: new Date().toISOString()
    };

    this.saveItem(STORAGE_KEYS.TRADES, trades);
    this.notify('trades', trades[index]);
    return trades[index];
  }

  deleteTrade(id) {
    const trades = this.getTrades();
    const filtered = trades.filter(t => t.id !== id);
    this.saveItem(STORAGE_KEYS.TRADES, filtered);
    this.notify('trades', { deletedId: id });
    return true;
  }

  // --- Bank Accounts CRUD ---

  getBankAccounts() {
    return this.getItem(STORAGE_KEYS.BANKS, DEFAULT_BANKS);
  }

  getBankAccountById(id) {
    const banks = this.getBankAccounts();
    return banks.find(b => b.id === id) || null;
  }

  addBankAccount(bankData) {
    const banks = this.getBankAccounts();
    const newBank = {
      id: generateId('bank'),
      createdAt: new Date().toISOString(),
      initialBalance: Number(bankData.initialBalance) || 0,
      ...bankData
    };
    banks.push(newBank);
    this.saveItem(STORAGE_KEYS.BANKS, banks);
    this.notify('banks', newBank);
    return newBank;
  }

  updateBankAccount(id, updatedFields) {
    const banks = this.getBankAccounts();
    const index = banks.findIndex(b => b.id === id);
    if (index === -1) return null;

    banks[index] = {
      ...banks[index],
      ...updatedFields,
      initialBalance: Number(updatedFields.initialBalance !== undefined ? updatedFields.initialBalance : banks[index].initialBalance) || 0,
      updatedAt: new Date().toISOString()
    };

    this.saveItem(STORAGE_KEYS.BANKS, banks);
    this.notify('banks', banks[index]);
    return banks[index];
  }

  deleteBankAccount(id) {
    const banks = this.getBankAccounts();
    const filtered = banks.filter(b => b.id !== id);
    this.saveItem(STORAGE_KEYS.BANKS, filtered);
    this.notify('banks', { deletedId: id });
    return true;
  }

  /**
   * Compute dynamic ledger balances for all bank accounts
   * Balance = initialBalance + Sum(SELL netAmount) - Sum(BUY netAmount)
   * @returns {Map<string, { bank: Object, initialBalance: number, currentBalance: number, totalInflow: number, totalOutflow: number, totalFees: number }>}
   */
  getComputedBankBalances() {
    const banks = this.getBankAccounts();
    const trades = this.getTrades();
    const transfers = this.getTransfers();

    const balanceMap = new Map();

    banks.forEach(bank => {
      const initBal = Number(bank.initialBalance) || 0;
      balanceMap.set(bank.id, {
        bank,
        initialBalance: initBal,
        currentBalance: initBal,
        totalInflow: 0,
        totalOutflow: 0,
        totalFees: 0
      });
    });

    // 1. Process Trades
    trades.forEach(trade => {
      const bankId = trade.bankAccountId;
      if (!balanceMap.has(bankId)) return;

      const record = balanceMap.get(bankId);
      const ngn = Number(trade.ngnAmount) || 0;
      const totalFees = Number(trade.totalFees) || 0;
      const netAmount = Number(trade.netAmount) || (trade.type === 'BUY' ? ngn + totalFees : Math.max(0, ngn - totalFees));

      if (trade.type === 'BUY') {
        record.currentBalance -= netAmount;
        record.totalOutflow += netAmount;
        record.totalFees += totalFees;
      } else if (trade.type === 'SELL') {
        record.currentBalance += netAmount;
        record.totalInflow += netAmount;
        record.totalFees += totalFees;
      }
    });

    // 2. Process Transfers
    transfers.forEach(transfer => {
      const fromId = transfer.fromBankId;
      const toId = transfer.toBankId;
      const amount = Number(transfer.amount) || 0;

      if (fromId && balanceMap.has(fromId)) {
        balanceMap.get(fromId).currentBalance -= amount;
      }
      if (toId && balanceMap.has(toId)) {
        balanceMap.get(toId).currentBalance += amount;
      }
    });

    return balanceMap;
  }

  // --- Transfers CRUD ---

  getTransfers() {
    return this.getItem(STORAGE_KEYS.TRANSFERS, []);
  }

  addTransfer(transferData) {
    const transfers = this.getTransfers();
    const newTransfer = {
      id: generateId('transfer'),
      createdAt: new Date().toISOString(),
      ...transferData
    };
    transfers.unshift(newTransfer);
    this.saveItem(STORAGE_KEYS.TRANSFERS, transfers);
    this.notify('transfers', newTransfer);
    return newTransfer;
  }

  deleteTransfer(id) {
    const transfers = this.getTransfers();
    const filtered = transfers.filter(t => t.id !== id);
    this.saveItem(STORAGE_KEYS.TRANSFERS, filtered);
    this.notify('transfers', { deletedId: id });
    return true;
  }

  // --- Opening Inventory Settings ---

  getOpeningInventory() {
    return this.getItem(STORAGE_KEYS.OPENING_INVENTORY, {
      startingUsdtBalance: 0,
      defaultCostBasis: 0
    });
  }

  setOpeningInventory(inventory) {
    this.saveItem(STORAGE_KEYS.OPENING_INVENTORY, {
      startingUsdtBalance: Number(inventory.startingUsdtBalance) || 0,
      defaultCostBasis: Number(inventory.defaultCostBasis) || 0
    });
    this.notify('settings', inventory);
  }

  // --- Backup, Restore & Reset ---

  exportAllData() {
    return {
      version: CURRENT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      trades: this.getTrades(),
      bankAccounts: this.getBankAccounts(),
      transfers: this.getTransfers(),
      openingInventory: this.getOpeningInventory()
    };
  }

  importAllData(data, replace = true) {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid JSON backup data format.');
    }

    if (replace) {
      if (Array.isArray(data.trades)) this.saveItem(STORAGE_KEYS.TRADES, data.trades);
      if (Array.isArray(data.bankAccounts)) this.saveItem(STORAGE_KEYS.BANKS, data.bankAccounts);
      if (Array.isArray(data.transfers)) this.saveItem(STORAGE_KEYS.TRANSFERS, data.transfers);
      if (data.openingInventory) this.saveItem(STORAGE_KEYS.OPENING_INVENTORY, data.openingInventory);
    } else {
      // Merge
      if (Array.isArray(data.trades)) {
        const existing = this.getTrades();
        const existingIds = new Set(existing.map(t => t.id));
        const newTrades = data.trades.filter(t => !existingIds.has(t.id));
        this.saveItem(STORAGE_KEYS.TRADES, [...newTrades, ...existing]);
      }
      if (Array.isArray(data.bankAccounts)) {
        const existing = this.getBankAccounts();
        const existingIds = new Set(existing.map(b => b.id));
        const newBanks = data.bankAccounts.filter(b => !existingIds.has(b.id));
        this.saveItem(STORAGE_KEYS.BANKS, [...existing, ...newBanks]);
      }
    }

    this.notify('all');
    return true;
  }

  clearAllData() {
    localStorage.removeItem(STORAGE_KEYS.TRADES);
    localStorage.removeItem(STORAGE_KEYS.BANKS);
    localStorage.removeItem(STORAGE_KEYS.TRANSFERS);
    localStorage.removeItem(STORAGE_KEYS.OPENING_INVENTORY);
    this.init();
    this.notify('all');
  }
}

export const store = new Store();
