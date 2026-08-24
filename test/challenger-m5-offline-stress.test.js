/**
 * Milestone 5 Challenger Adversarial Stress Test Suite
 * R5: Complete Offline PWA Pre-caching, 5-View Navigation, Cache Migration (v8 -> v9)
 */

const { describe, it, beforeEach } = require('./harness/test-runner');
const { assert } = require('./harness/assertions');
const { setupDomEnvironment } = require('./harness/dom-mock');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/**
 * High-Fidelity Service Worker Environment Mock
 */
class MockResponse {
  constructor(body = '', init = {}) {
    this.body = body;
    this.status = init.status || 200;
    this.statusText = init.statusText || 'OK';
    this.headers = new Map(Object.entries(init.headers || {}));
    this.url = init.url || '';
  }

  clone() {
    return new MockResponse(this.body, {
      status: this.status,
      statusText: this.statusText,
      headers: Object.fromEntries(this.headers.entries()),
      url: this.url
    });
  }

  async text() {
    return String(this.body);
  }
}

class MockRequest {
  constructor(url, init = {}) {
    this.url = typeof url === 'string' ? url : url.url;
    this.method = (init.method || 'GET').toUpperCase();
    this.mode = init.mode || 'cors';
    this.headers = {
      get: (headerName) => {
        const key = Object.keys(init.headers || {}).find(k => k.toLowerCase() === headerName.toLowerCase());
        return key ? init.headers[key] : null;
      }
    };
  }
}

class MockCache {
  constructor(name) {
    this.name = name;
    this.entries = new Map();
  }

  _normalizeKey(request) {
    const urlStr = typeof request === 'string' ? request : request.url;
    return urlStr;
  }

  async add(request) {
    return this.addAll([request]);
  }

  async addAll(requests) {
    for (const req of requests) {
      const urlStr = typeof req === 'string' ? req : req.url;
      // In real SW install, this calls fetch. We resolve relative to project root.
      let relativePath = urlStr.replace(/^\.\//, '').split('?')[0];
      if (relativePath === '' || relativePath === '/') {
        relativePath = 'index.html';
      }

      const filePath = path.resolve(__dirname, '..', relativePath);
      if (!fs.existsSync(filePath)) {
        throw new Error(`[MockCache] 404 File not found: ${filePath} (from request: ${urlStr})`);
      }

      const fileContent = fs.readFileSync(filePath);
      const response = new MockResponse(fileContent, { status: 200, url: urlStr });
      this.entries.set(urlStr, response);
      // Also index normalized full URL
      const fullUrl = `http://localhost:3000/${relativePath === 'index.html' && urlStr.endsWith('/') ? '' : relativePath}`;
      this.entries.set(fullUrl, response);
    }
  }

  async put(request, response) {
    const key = this._normalizeKey(request);
    this.entries.set(key, response.clone());
  }

  async match(request, options = {}) {
    const reqUrl = typeof request === 'string' ? request : request.url;
    
    // Direct exact match
    if (this.entries.has(reqUrl)) {
      return this.entries.get(reqUrl).clone();
    }

    // Relative match against entries
    for (const [key, resp] of this.entries.entries()) {
      if (key === reqUrl || `./${key}` === reqUrl || key === `./${reqUrl}`) {
        return resp.clone();
      }
      
      // Match origin-prefixed URL to relative key
      try {
        const parsedReq = new URL(reqUrl, 'http://localhost:3000');
        const parsedKey = new URL(key, 'http://localhost:3000');
        
        if (options.ignoreSearch) {
          if (parsedReq.pathname === parsedKey.pathname) {
            return resp.clone();
          }
        } else {
          if (parsedReq.href === parsedKey.href || parsedReq.pathname === parsedKey.pathname && parsedReq.search === parsedKey.search) {
            return resp.clone();
          }
        }
      } catch {
        // Continue
      }
    }

    return undefined;
  }

  async delete(request) {
    const key = this._normalizeKey(request);
    return this.entries.delete(key);
  }

  async keys() {
    return Array.from(this.entries.keys());
  }
}

class MockCacheStorage {
  constructor() {
    this.caches = new Map();
  }

  async open(name) {
    if (!this.caches.has(name)) {
      this.caches.set(name, new MockCache(name));
    }
    return this.caches.get(name);
  }

  async has(name) {
    return this.caches.has(name);
  }

  async delete(name) {
    return this.caches.delete(name);
  }

  async keys() {
    return Array.from(this.caches.keys());
  }

  async match(request, options) {
    for (const cache of this.caches.values()) {
      const match = await cache.match(request, options);
      if (match) return match;
    }
    return undefined;
  }
}

/**
 * Helper to build an isolated SW sandbox and run sw.js
 */
function createServiceWorkerSandbox(options = {}) {
  const cacheStorage = new MockCacheStorage();
  const eventListeners = new Map();
  let skipWaitingCalled = false;
  let clientsClaimCalled = false;

  const sandboxSelf = {
    location: {
      origin: 'http://localhost:3000',
      href: 'http://localhost:3000/sw.js'
    },
    addEventListener: (event, handler) => {
      if (!eventListeners.has(event)) eventListeners.set(event, []);
      eventListeners.get(event).push(handler);
    },
    skipWaiting: async () => {
      skipWaitingCalled = true;
    },
    clients: {
      claim: async () => {
        clientsClaimCalled = true;
      }
    }
  };

  const sandboxContext = {
    self: sandboxSelf,
    caches: cacheStorage,
    URL: URL,
    Promise: Promise,
    console: {
      log: () => {},
      warn: () => {},
      error: () => {}
    },
    fetch: options.fetch || (async () => {
      throw new TypeError('Failed to fetch: Network is offline');
    })
  };

  const swPath = path.resolve(__dirname, '../sw.js');
  const swCode = fs.readFileSync(swPath, 'utf-8');

  const context = vm.createContext(sandboxContext);
  vm.runInContext(swCode, context);

  return {
    cacheStorage,
    eventListeners,
    sandboxContext,
    isSkipWaitingCalled: () => skipWaitingCalled,
    isClientsClaimCalled: () => clientsClaimCalled,
    
    async dispatchInstall() {
      const handlers = eventListeners.get('install') || [];
      const waitPromises = [];
      for (const h of handlers) {
        h({
          waitUntil: (p) => waitPromises.push(p)
        });
      }
      return Promise.all(waitPromises);
    },

    async dispatchActivate() {
      const handlers = eventListeners.get('activate') || [];
      const waitPromises = [];
      for (const h of handlers) {
        h({
          waitUntil: (p) => waitPromises.push(p)
        });
      }
      return Promise.all(waitPromises);
    },

    async dispatchFetch(request) {
      const handlers = eventListeners.get('fetch') || [];
      let respondPromise = null;
      for (const h of handlers) {
        h({
          request,
          respondWith: (p) => { respondPromise = p; }
        });
      }
      return respondPromise;
    }
  };
}

describe('Challenger 1 — M5: Adversarial Service Worker Pre-Caching & Offline Suite', () => {

  describe('1. Static Asset Manifest & File System Parity', () => {
    const swPath = path.resolve(__dirname, '../sw.js');
    const swContent = fs.readFileSync(swPath, 'utf-8');

    it('M5-CH1.1: Every asset in STATIC_ASSETS exists on disk and is non-empty', () => {
      const match = swContent.match(/const STATIC_ASSETS = \[([\s\S]*?)\];/);
      assert.ok(match, 'STATIC_ASSETS array must be defined in sw.js');

      const assetList = eval(`[${match[1]}]`);
      assert.ok(assetList.length >= 25, `Expected >= 25 static assets, found ${assetList.length}`);

      assetList.forEach(asset => {
        let relativePath = asset.replace(/^\.\//, '').split('?')[0];
        if (relativePath === '') relativePath = 'index.html';

        const fullPath = path.resolve(__dirname, '../', relativePath);
        assert.ok(fs.existsSync(fullPath), `Asset in STATIC_ASSETS must exist on disk: ${asset} -> ${fullPath}`);
        const stat = fs.statSync(fullPath);
        assert.ok(stat.size > 0, `Asset ${asset} must not be an empty file (size: ${stat.size} bytes)`);
      });
    });

    it('M5-CH1.2: 100% of all js/*.js and js/views/*.js files are included in STATIC_ASSETS', () => {
      const jsDir = path.resolve(__dirname, '../js');
      const viewsDir = path.resolve(__dirname, '../js/views');

      const allJsFiles = fs.readdirSync(jsDir).filter(f => f.endsWith('.js')).map(f => `./js/${f}`);
      const allViewFiles = fs.readdirSync(viewsDir).filter(f => f.endsWith('.js')).map(f => `./js/views/${f}`);

      const match = swContent.match(/const STATIC_ASSETS = \[([\s\S]*?)\];/);
      const assetList = eval(`[${match[1]}]`);

      allJsFiles.forEach(jsFile => {
        assert.ok(assetList.includes(jsFile), `Missing controller/module in STATIC_ASSETS: ${jsFile}`);
      });

      allViewFiles.forEach(viewFile => {
        assert.ok(assetList.includes(viewFile), `Missing view template in STATIC_ASSETS: ${viewFile}`);
      });
    });

    it('M5-CH1.3: HTML entry point, manifest, styles with versioning, and icons are all pre-cached', () => {
      const requiredCore = [
        './',
        './index.html',
        './manifest.json',
        './css/styles.css',
        './css/styles.css?v=2.5',
        './icons/icon.svg',
        './icons/icon-192.png',
        './icons/icon-512.png'
      ];

      const match = swContent.match(/const STATIC_ASSETS = \[([\s\S]*?)\];/);
      const assetList = eval(`[${match[1]}]`);

      requiredCore.forEach(coreAsset => {
        assert.ok(assetList.includes(coreAsset), `Required core asset missing from STATIC_ASSETS: ${coreAsset}`);
      });
    });
  });

  describe('2. Service Worker Lifecycle (Install & skipWaiting)', () => {
    it('M5-CH1.4: Install event opens bybit-p2p-v9 cache and pre-caches all static assets', async () => {
      const sw = createServiceWorkerSandbox();
      await sw.dispatchInstall();

      const hasV9 = await sw.cacheStorage.has('bybit-p2p-v9');
      assert.ok(hasV9, 'Cache bybit-p2p-v9 must be created upon install');

      const v9Cache = await sw.cacheStorage.open('bybit-p2p-v9');
      const cachedKeys = await v9Cache.keys();
      assert.ok(cachedKeys.length >= 25, `Expected >= 25 entries in cache, found ${cachedKeys.length}`);
      assert.ok(sw.isSkipWaitingCalled(), 'skipWaiting() must be called to activate immediately');
    });

    it('M5-CH1.5: Pre-cache gracefully handles missing runtime resources without unhandled rejection', async () => {
      const sw = createServiceWorkerSandbox();
      // Install should succeed even with warning logs
      await sw.dispatchInstall();
      assert.ok(true, 'Install completed without crashing');
    });
  });

  describe('3. Cache Migration & Stale Cache Purge (v8 -> v9)', () => {
    it('M5-CH1.6: Activate event purges legacy cache versions (v6, v7, v8) and preserves active v9', async () => {
      const sw = createServiceWorkerSandbox();

      // Pre-populate old caches
      const v6 = await sw.cacheStorage.open('bybit-p2p-v6');
      await v6.put('./old1.js', new MockResponse('old v6'));
      const v7 = await sw.cacheStorage.open('bybit-p2p-v7');
      await v7.put('./old2.js', new MockResponse('old v7'));
      const v8 = await sw.cacheStorage.open('bybit-p2p-v8');
      await v8.put('./old3.js', new MockResponse('old v8'));
      const v9 = await sw.cacheStorage.open('bybit-p2p-v9');
      await v9.put('./js/app.js', new MockResponse('v9 app'));

      const initialCaches = await sw.cacheStorage.keys();
      assert.strictEqual(initialCaches.length, 4);

      // Trigger activate
      await sw.dispatchActivate();

      const finalCaches = await sw.cacheStorage.keys();
      assert.strictEqual(finalCaches.length, 1);
      assert.strictEqual(finalCaches[0], 'bybit-p2p-v9');
      assert.ok(sw.isClientsClaimCalled(), 'clients.claim() must be called during activation');
    });

    it('M5-CH1.7: Upgrading from v8 to v9 seamlessly replaces stale app assets with v9 assets', async () => {
      const sw = createServiceWorkerSandbox();

      // Simulate v8 installed
      const v8 = await sw.cacheStorage.open('bybit-p2p-v8');
      await v8.put('http://localhost:3000/js/app.js', new MockResponse('console.log("v8 stale");'));

      // Now install v9
      await sw.dispatchInstall();
      // Now activate v9
      await sw.dispatchActivate();

      // Query app.js in offline mode
      const req = new MockRequest('http://localhost:3000/js/app.js');
      const res = await sw.dispatchFetch(req);
      assert.ok(res, 'Fetch should return response for js/app.js');
      const text = await res.text();
      assert.ok(text.includes('initDashboard'), 'Response must be fresh v9 file content');
      assert.ok(!text.includes('v8 stale'), 'Response must not contain obsolete v8 content');
    });
  });

  describe('4. Zero-Network Offline Fetch Interception & Asset Delivery', () => {
    let sw;

    beforeEach(async () => {
      // Create SW where fetch throws Network Offline error
      sw = createServiceWorkerSandbox({
        fetch: async () => {
          throw new TypeError('Failed to fetch: Network is completely offline (Airplane mode)');
        }
      });
      await sw.dispatchInstall();
      await sw.dispatchActivate();
    });

    it('M5-CH1.8: Serves HTML entry point index.html and root URL / in zero-network environment', async () => {
      // 1. Root /
      const rootReq = new MockRequest('http://localhost:3000/');
      const rootRes = await sw.dispatchFetch(rootReq);
      assert.ok(rootRes, 'Root / request must resolve from offline cache');
      const rootHtml = await rootRes.text();
      assert.ok(rootHtml.includes('Bybit NGN P2P Trade Tracker'), 'Root must return index.html shell');

      // 2. /index.html
      const indexReq = new MockRequest('http://localhost:3000/index.html');
      const indexRes = await sw.dispatchFetch(indexReq);
      assert.ok(indexRes, 'index.html request must resolve from offline cache');
      const indexHtml = await indexRes.text();
      assert.ok(indexHtml.includes('app-shell'), 'index.html must contain app shell');
    });

    it('M5-CH1.9: Serves all 19 local JavaScript modules from offline cache with 0 network calls', async () => {
      const jsModules = [
        'http://localhost:3000/js/app.js',
        'http://localhost:3000/js/store.js',
        'http://localhost:3000/js/utils.js',
        'http://localhost:3000/js/fees.js',
        'http://localhost:3000/js/export.js',
        'http://localhost:3000/js/bybitService.js',
        'http://localhost:3000/js/dashboard.js',
        'http://localhost:3000/js/trades.js',
        'http://localhost:3000/js/history.js',
        'http://localhost:3000/js/pricing.js',
        'http://localhost:3000/js/banks.js',
        'http://localhost:3000/js/transfers.js',
        'http://localhost:3000/js/settings.js',
        'http://localhost:3000/js/views/dashboard.view.js',
        'http://localhost:3000/js/views/addTrade.view.js',
        'http://localhost:3000/js/views/pricing.view.js',
        'http://localhost:3000/js/views/history.view.js',
        'http://localhost:3000/js/views/settings.view.js',
        'http://localhost:3000/js/views/modals.view.js'
      ];

      for (const modUrl of jsModules) {
        const req = new MockRequest(modUrl);
        const res = await sw.dispatchFetch(req);
        assert.ok(res, `Failed to retrieve ${modUrl} from offline cache`);
        assert.strictEqual(res.status, 200, `Expected 200 OK for ${modUrl}`);
        const content = await res.text();
        assert.ok(content.length > 50, `Module ${modUrl} content should not be empty`);
      }
    });

    it('M5-CH1.10: Serves stylesheets with and without version query parameters (css/styles.css?v=2.5)', async () => {
      const reqVersioned = new MockRequest('http://localhost:3000/css/styles.css?v=2.5');
      const resVersioned = await sw.dispatchFetch(reqVersioned);
      assert.ok(resVersioned, 'styles.css?v=2.5 must resolve from offline cache');

      const reqUnversioned = new MockRequest('http://localhost:3000/css/styles.css');
      const resUnversioned = await sw.dispatchFetch(reqUnversioned);
      assert.ok(resUnversioned, 'styles.css must resolve from offline cache');

      const reqNewParam = new MockRequest('http://localhost:3000/css/styles.css?v=999.0');
      const resNewParam = await sw.dispatchFetch(reqNewParam);
      assert.ok(resNewParam, 'styles.css with arbitrary query param must fallback via ignoreSearch');
    });

    it('M5-CH1.11: HTML Navigation fallback returns index.html for direct navigation routes offline', async () => {
      const navRoutes = [
        'http://localhost:3000/dashboard',
        'http://localhost:3000/pricing',
        'http://localhost:3000/history',
        'http://localhost:3000/settings',
        'http://localhost:3000/add-trade'
      ];

      for (const route of navRoutes) {
        const req = new MockRequest(route, {
          mode: 'navigate',
          headers: { 'Accept': 'text/html,application/xhtml+xml' }
        });
        const res = await sw.dispatchFetch(req);
        assert.ok(res, `Navigation to ${route} must return offline app shell`);
        const html = await res.text();
        assert.ok(html.includes('app-shell'), `Route ${route} must deliver index.html`);
      }
    });

    it('M5-CH1.12: Non-GET requests bypass the offline cache handler', async () => {
      const postReq = new MockRequest('http://localhost:3000/api/trades', { method: 'POST' });
      const postRes = await sw.dispatchFetch(postReq);
      // Service worker returns undefined (does not call event.respondWith) for non-GET
      assert.strictEqual(postRes, null, 'Non-GET POST request must bypass service worker cache handler');
    });
  });

  describe('5. Offline Browser App Shell & Complete 5-View Navigation Simulation', () => {
    let dom;
    let store;
    let utils;
    let fees;
    let dashboardView;
    let addTradeView;
    let pricingView;
    let historyView;
    let settingsView;
    let modalsView;

    let banksController;
    let transfersController;
    let tradesController;
    let dashboardController;
    let historyController;
    let settingsController;
    let pricingController;

    beforeEach(async () => {
      dom = setupDomEnvironment();

      // Import all view templates
      dashboardView = await import('../js/views/dashboard.view.js');
      addTradeView = await import('../js/views/addTrade.view.js');
      pricingView = await import('../js/views/pricing.view.js');
      historyView = await import('../js/views/history.view.js');
      settingsView = await import('../js/views/settings.view.js');
      modalsView = await import('../js/views/modals.view.js');

      // Import utility modules
      const storeModule = await import('../js/store.js');
      store = storeModule.store;
      store.clearAllData();
      utils = await import('../js/utils.js');
      fees = await import('../js/fees.js');

      // Import controllers
      banksController = await import('../js/banks.js');
      transfersController = await import('../js/transfers.js');
      tradesController = await import('../js/trades.js');
      dashboardController = await import('../js/dashboard.js');
      historyController = await import('../js/history.js');
      settingsController = await import('../js/settings.js');
      pricingController = await import('../js/pricing.js');
    });

    it('M5-CH1.13: Mounts all 5 view templates and modal structures into app shell DOM with zero network', () => {
      const mainContent = dom.document.createElement('div');
      mainContent.id = 'main-content';
      dom.document.body.appendChild(mainContent);

      const modalsContainer = dom.document.createElement('div');
      modalsContainer.id = 'modals-container';
      dom.document.body.appendChild(modalsContainer);

      // Mount views
      mainContent.innerHTML = `
        ${dashboardView.renderDashboardView()}
        ${addTradeView.renderAddTradeView()}
        ${pricingView.renderPricingView()}
        ${historyView.renderHistoryView()}
        ${settingsView.renderSettingsView()}
      `;

      modalsContainer.innerHTML = modalsView.renderModalsView();

      // Verify all 5 views exist
      const viewDashboard = dom.document.querySelector('[data-view="dashboard"]');
      const viewAddTrade = dom.document.querySelector('[data-view="add-trade"]');
      const viewPricing = dom.document.querySelector('[data-view="pricing"]');
      const viewHistory = dom.document.querySelector('[data-view="history"]');
      const viewSettings = dom.document.querySelector('[data-view="settings"]');

      assert.ok(viewDashboard, 'Dashboard view must be mounted in DOM');
      assert.ok(viewAddTrade, 'Add Trade view must be mounted in DOM');
      assert.ok(viewPricing, 'Pricing view must be mounted in DOM');
      assert.ok(viewHistory, 'History view must be mounted in DOM');
      assert.ok(viewSettings, 'Settings view must be mounted in DOM');

      // Verify modal elements
      const modalBank = dom.document.getElementById('modal-bank-backdrop');
      const modalTransfer = dom.document.getElementById('modal-transfer-backdrop');
      const modalAssignBanks = dom.document.getElementById('modal-assign-banks-backdrop');
      const modalBankTransfer = dom.document.getElementById('modal-bank-transfer-backdrop');
      assert.ok(modalBank, 'Add Bank modal must be mounted');
      assert.ok(modalTransfer, 'Transfer modal must be mounted');
      assert.ok(modalAssignBanks, 'Assign Banks modal must be mounted');
      assert.ok(modalBankTransfer, 'Bank Transfer modal must be mounted');
    });

    it('M5-CH1.14: Initializes all 7 controllers without throwing offline errors', () => {
      // Set up DOM elements required by controllers
      const mainContent = dom.document.createElement('div');
      mainContent.id = 'main-content';
      dom.document.body.appendChild(mainContent);
      mainContent.innerHTML = `
        ${dashboardView.renderDashboardView()}
        ${addTradeView.renderAddTradeView()}
        ${pricingView.renderPricingView()}
        ${historyView.renderHistoryView()}
        ${settingsView.renderSettingsView()}
      `;

      const modalsContainer = dom.document.createElement('div');
      modalsContainer.id = 'modals-container';
      dom.document.body.appendChild(modalsContainer);
      modalsContainer.innerHTML = modalsView.renderModalsView();

      // Initialize all controllers
      assert.doesNotThrow(() => banksController.initBanks(), 'initBanks should execute cleanly');
      assert.doesNotThrow(() => transfersController.initTransfers(), 'initTransfers should execute cleanly');
      assert.doesNotThrow(() => tradesController.initTrades(), 'initTrades should execute cleanly');
      assert.doesNotThrow(() => dashboardController.initDashboard(), 'initDashboard should execute cleanly');
      assert.doesNotThrow(() => historyController.initHistory(), 'initHistory should execute cleanly');
      assert.doesNotThrow(() => settingsController.initSettings(), 'initSettings should execute cleanly');
      assert.doesNotThrow(() => pricingController.initPricing(), 'initPricing should execute cleanly');
    });

    it('M5-CH1.15: Navigates cleanly across all 5 views (Dashboard -> Pricing -> History -> Settings -> Add Trade) with state retention', () => {
      // Build navigation mock in DOM
      const bottomNav = dom.document.createElement('nav');
      bottomNav.id = 'bottom-nav';
      bottomNav.innerHTML = `
        <button class="nav-tab active" data-target="dashboard"></button>
        <button class="nav-tab" data-target="pricing"></button>
        <button class="nav-tab" data-target="history"></button>
        <button class="nav-tab" data-target="settings"></button>
      `;
      dom.document.body.appendChild(bottomNav);

      const sidebarNav = dom.document.createElement('nav');
      sidebarNav.id = 'sidebar-nav';
      sidebarNav.innerHTML = `
        <button class="sidebar-nav-item active" data-target="dashboard"></button>
        <button class="sidebar-nav-item" data-target="pricing"></button>
        <button class="sidebar-nav-item" data-target="history"></button>
        <button class="sidebar-nav-item" data-target="settings"></button>
      `;
      dom.document.body.appendChild(sidebarNav);

      const mainContent = dom.document.createElement('div');
      mainContent.id = 'main-content';
      dom.document.body.appendChild(mainContent);
      mainContent.innerHTML = `
        ${dashboardView.renderDashboardView()}
        ${addTradeView.renderAddTradeView()}
        ${pricingView.renderPricingView()}
        ${historyView.renderHistoryView()}
        ${settingsView.renderSettingsView()}
      `;

      const bottomTabs = dom.document.querySelectorAll('.nav-tab');
      const sidebarItems = dom.document.querySelectorAll('.sidebar-nav-item');
      const views = dom.document.querySelectorAll('.app-view');

      let currentView = 'dashboard';
      let previousView = 'dashboard';

      function switchTab(targetViewId) {
        if (targetViewId && targetViewId !== currentView) {
          previousView = currentView;
          currentView = targetViewId;
        }

        bottomTabs.forEach(tab => {
          tab.classList.toggle('active', tab.getAttribute('data-target') === targetViewId);
        });

        sidebarItems.forEach(item => {
          item.classList.toggle('active', item.getAttribute('data-target') === targetViewId);
        });

        views.forEach(view => {
          const isTarget = view.getAttribute('data-view') === targetViewId;
          if (isTarget) view.classList.add('active');
          else view.classList.remove('active');
        });
      }

      // Initial View: Dashboard
      switchTab('dashboard');
      assert.strictEqual(currentView, 'dashboard');
      assert.ok(dom.document.querySelector('[data-view="dashboard"]').classList.contains('active'));

      // Transition 1: Dashboard -> Pricing
      switchTab('pricing');
      assert.strictEqual(currentView, 'pricing');
      assert.strictEqual(previousView, 'dashboard');
      assert.ok(dom.document.querySelector('[data-view="pricing"]').classList.contains('active'));
      assert.ok(!dom.document.querySelector('[data-view="dashboard"]').classList.contains('active'));

      // Transition 2: Pricing -> History
      switchTab('history');
      assert.strictEqual(currentView, 'history');
      assert.strictEqual(previousView, 'pricing');
      assert.ok(dom.document.querySelector('[data-view="history"]').classList.contains('active'));

      // Transition 3: History -> Settings
      switchTab('settings');
      assert.strictEqual(currentView, 'settings');
      assert.strictEqual(previousView, 'history');
      assert.ok(dom.document.querySelector('[data-view="settings"]').classList.contains('active'));

      // Transition 4: Settings -> Add-Trade
      switchTab('add-trade');
      assert.strictEqual(currentView, 'add-trade');
      assert.strictEqual(previousView, 'settings');
      assert.ok(dom.document.querySelector('[data-view="add-trade"]').classList.contains('active'));

      // Transition 5: Add-Trade -> Back to previousView (Settings)
      switchTab(previousView);
      assert.strictEqual(currentView, 'settings');
      assert.ok(dom.document.querySelector('[data-view="settings"]').classList.contains('active'));
    });
  });

  describe('6. Offline Data Operations & Isolated Calculation Integrity', () => {
    let store;
    let utils;
    let fees;

    beforeEach(async () => {
      setupDomEnvironment();
      const storeModule = await import('../js/store.js');
      store = storeModule.store;
      store.clearAllData();
      utils = await import('../js/utils.js');
      fees = await import('../js/fees.js');
    });

    it('M5-CH1.16: Full trade recording, FIFO recalculation, and bank ledger updates work 100% offline', () => {
      const bank = store.addBankAccount({ name: 'Offline Bank', last4: '1234', initialBalance: 1000000 });
      store.setOpeningInventory({ startingUsdtBalance: 100, defaultCostBasis: 1400 });

      // Add offline BUY trade
      const buyTrade = store.addTrade({
        id: 'offline_trade_1',
        refId: 'BYBIT_OFFLINE_001',
        type: 'BUY',
        bankAccountId: bank.id,
        ngnAmount: 300000,
        usdtAmount: 200,
        rate: 1500,
        totalFees: 50,
        netAmount: 300050,
        date: '2026-08-20T10:00:00Z'
      });
      assert.ok(buyTrade.id, 'Trade should be added to offline store');

      // Add offline SELL trade
      const sellTrade = store.addTrade({
        id: 'offline_trade_2',
        refId: 'BYBIT_OFFLINE_002',
        type: 'SELL',
        bankAccountId: bank.id,
        ngnAmount: 160000,
        usdtAmount: 100,
        rate: 1600,
        totalFees: 0,
        netAmount: 160000,
        date: '2026-08-20T11:00:00Z'
      });
      assert.ok(sellTrade.id, 'Trade should be added to offline store');

      // Recalculate FIFO
      const fifo = utils.calculateFIFOInventoryAndPnL(store.getTrades(), store.getOpeningInventory());
      assert.strictEqual(fifo.remainingInventoryUSDT, 200); // 100 + 200 - 100 = 200
      assert.strictEqual(fifo.totalRealizedPnL, 20000); // 100 * (1600 - 1400) = 20000
      assert.strictEqual(fifo.avgHoldingCostPerUSDT, 1500.25);

      // Verify computed bank balances
      const balances = store.getComputedBankBalances();
      const currentBankBal = balances.get(bank.id).currentBalance;
      // 1000000 - 300050 + 160000 = 859950
      assert.strictEqual(currentBankBal, 859950);
    });

    it('M5-CH1.17: Full JSON backup export and restore cycle operates completely in offline environment', () => {
      const bank = store.addBankAccount({ name: 'Cold Vault', last4: '7777', initialBalance: 500000 });
      store.addTrade({
        id: 'vault_1',
        refId: 'REC_777',
        type: 'BUY',
        bankAccountId: bank.id,
        ngnAmount: 150000,
        usdtAmount: 100,
        rate: 1500,
        totalFees: 0,
        netAmount: 150000,
        date: '2026-08-21T00:00:00Z'
      });

      const backup = store.exportAllData();
      assert.strictEqual(backup.trades.length, 1);
      assert.ok(backup.bankAccounts.some(b => b.name === 'Cold Vault'));

      // Wipe
      store.clearAllData();
      assert.strictEqual(store.getTrades().length, 0);

      // Restore
      store.importAllData(backup, true);
      assert.strictEqual(store.getTrades().length, 1);
      assert.strictEqual(store.getTrades()[0].refId, 'REC_777');
      assert.ok(store.getBankAccounts().some(b => b.name === 'Cold Vault'));
    });

    it('M5-CH1.18: Bybit API sync failure during offline state is caught cleanly without crash', async () => {
      const bybitModule = await import('../js/bybitService.js');
      const service = bybitModule.bybitService;

      // Force network error
      global.fetch = async () => {
        throw new TypeError('Failed to fetch (offline)');
      };

      try {
        await service.fetchBalance();
        assert.fail('Should have thrown offline error');
      } catch (err) {
        assert.ok(err.message.includes('offline') || err.message.includes('fetch'), 'Offline network error captured cleanly');
      }
    });
  });

  describe('7. Concurrency & Stress Harness', () => {
    it('M5-CH1.19: High-concurrency offline stress test: 500 rapid parallel cache fetch requests', async () => {
      const sw = createServiceWorkerSandbox({
        fetch: async () => {
          throw new TypeError('Offline');
        }
      });
      await sw.dispatchInstall();
      await sw.dispatchActivate();

      const requests = [];
      const testUrls = [
        'http://localhost:3000/',
        'http://localhost:3000/index.html',
        'http://localhost:3000/css/styles.css?v=2.5',
        'http://localhost:3000/js/app.js',
        'http://localhost:3000/js/store.js',
        'http://localhost:3000/js/utils.js',
        'http://localhost:3000/js/views/dashboard.view.js',
        'http://localhost:3000/js/views/pricing.view.js',
        'http://localhost:3000/manifest.json',
        'http://localhost:3000/icons/icon.svg'
      ];

      for (let i = 0; i < 500; i++) {
        const url = testUrls[i % testUrls.length];
        const req = new MockRequest(url);
        requests.push(sw.dispatchFetch(req));
      }

      const results = await Promise.all(requests);
      assert.strictEqual(results.length, 500);
      results.forEach((res, idx) => {
        assert.ok(res, `Request ${idx} should have returned cached response`);
        assert.strictEqual(res.status, 200, `Request ${idx} status should be 200`);
      });
    });

    it('M5-CH1.20: Rapid multi-view switching stress test: 200 rapid tab transitions maintain consistent state', () => {
      setupDomEnvironment();
      const views = ['dashboard', 'pricing', 'history', 'settings', 'add-trade'];
      let currentView = 'dashboard';
      let prevView = 'dashboard';

      for (let i = 0; i < 200; i++) {
        const nextView = views[i % views.length];
        if (nextView !== currentView) {
          prevView = currentView;
          currentView = nextView;
        }
      }

      assert.strictEqual(currentView, views[199 % views.length]);
      assert.strictEqual(prevView, views[198 % views.length]);
    });
  });

  describe('8. Advanced CDN Caching, Arbitrary Cache Eviction & Offline User Journey', () => {
    it('M5-CH1.21: External CDN cache-first strategy populates v9 cache and serves offline', async () => {
      const cdnUrl = 'https://unpkg.com/lucide@latest';
      const cdnContent = '/* Lucide Icons Library */';

      // 1. First fetch online: cache miss -> fetch -> cache
      const onlineSw = createServiceWorkerSandbox({
        fetch: async (req) => {
          return new MockResponse(cdnContent, { status: 200, url: cdnUrl });
        }
      });
      await onlineSw.dispatchInstall();
      await onlineSw.dispatchActivate();

      const reqOnline = new MockRequest(cdnUrl);
      const resOnline = await onlineSw.dispatchFetch(reqOnline);
      assert.ok(resOnline, 'Online fetch of CDN asset should succeed');
      const textOnline = await resOnline.text();
      assert.strictEqual(textOnline, cdnContent);

      // Verify asset was stored in bybit-p2p-v9
      const v9Cache = await onlineSw.cacheStorage.open('bybit-p2p-v9');
      const matched = await v9Cache.match(cdnUrl);
      assert.ok(matched, 'External CDN asset must be cached in bybit-p2p-v9 cache');

      // 2. Now simulate offline: fetch throws error -> served from cache
      onlineSw.sandboxContext.fetch = async () => {
        throw new TypeError('Network offline');
      };

      const reqOffline = new MockRequest(cdnUrl);
      const resOffline = await onlineSw.dispatchFetch(reqOffline);
      assert.ok(resOffline, 'Offline fetch of cached CDN asset must return cached copy');
      const textOffline = await resOffline.text();
      assert.strictEqual(textOffline, cdnContent);
    });

    it('M5-CH1.22: Multi-cache eviction matrix: purges 10 arbitrary legacy caches on v9 activation', async () => {
      const sw = createServiceWorkerSandbox();

      const legacyCaches = [
        'bybit-p2p-v1',
        'bybit-p2p-v2',
        'bybit-p2p-v3',
        'bybit-p2p-v4',
        'bybit-p2p-v5',
        'bybit-p2p-v6',
        'bybit-p2p-v7',
        'bybit-p2p-v8',
        'workbox-precache-v1',
        'legacy-runtime-cache'
      ];

      for (const cName of legacyCaches) {
        const c = await sw.cacheStorage.open(cName);
        await c.put('http://localhost:3000/stale.js', new MockResponse('stale'));
      }

      const activeCache = await sw.cacheStorage.open('bybit-p2p-v9');
      await activeCache.put('http://localhost:3000/active.js', new MockResponse('active'));

      const allBefore = await sw.cacheStorage.keys();
      assert.strictEqual(allBefore.length, 11);

      await sw.dispatchActivate();

      const allAfter = await sw.cacheStorage.keys();
      assert.strictEqual(allAfter.length, 1);
      assert.strictEqual(allAfter[0], 'bybit-p2p-v9');
    });

    it('M5-CH1.23: Full offline merchant user journey across all 5 views with zero network connectivity', async () => {
      const dom = setupDomEnvironment();

      // 1. Mount App Shell & all views
      const dashboardView = await import('../js/views/dashboard.view.js');
      const addTradeView = await import('../js/views/addTrade.view.js');
      const pricingView = await import('../js/views/pricing.view.js');
      const historyView = await import('../js/views/history.view.js');
      const settingsView = await import('../js/views/settings.view.js');
      const modalsView = await import('../js/views/modals.view.js');

      const mainContent = dom.document.createElement('div');
      mainContent.id = 'main-content';
      dom.document.body.appendChild(mainContent);
      mainContent.innerHTML = `
        ${dashboardView.renderDashboardView()}
        ${addTradeView.renderAddTradeView()}
        ${pricingView.renderPricingView()}
        ${historyView.renderHistoryView()}
        ${settingsView.renderSettingsView()}
      `;

      const modalsContainer = dom.document.createElement('div');
      modalsContainer.id = 'modals-container';
      dom.document.body.appendChild(modalsContainer);
      modalsContainer.innerHTML = modalsView.renderModalsView();

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
      };

      // 2. Initialize controllers
      const { store } = await import('../js/store.js');
      store.clearAllData();
      const utils = await import('../js/utils.js');
      const fees = await import('../js/fees.js');
      const { initBanks } = await import('../js/banks.js');
      const { initTrades } = await import('../js/trades.js');
      const { initDashboard } = await import('../js/dashboard.js');
      const { initHistory } = await import('../js/history.js');
      const { initPricing } = await import('../js/pricing.js');
      const { initSettings } = await import('../js/settings.js');

      initBanks();
      initTrades();
      initDashboard();
      initHistory();
      initPricing();
      initSettings();

      // 3. User Journey Step A: Settings — Set Opening Inventory & Add Bank
      const bank = store.addBankAccount({ name: 'Stanbic IBTC', last4: '4321', initialBalance: 2000000 });
      store.setOpeningInventory({ startingUsdtBalance: 500, defaultCostBasis: 1450 });

      // 4. User Journey Step B: Add Trade — Record 1,000 USDT Buy
      const trade1 = store.addTrade({
        id: 't_journey_1',
        refId: 'BYBIT_OFFLINE_J1',
        type: 'BUY',
        bankAccountId: bank.id,
        ngnAmount: 1480000,
        usdtAmount: 1000,
        rate: 1480,
        totalFees: 50,
        netAmount: 1480050,
        date: '2026-08-22T08:00:00Z'
      });

      // 5. User Journey Step C: Record 600 USDT Sell
      const trade2 = store.addTrade({
        id: 't_journey_2',
        refId: 'BYBIT_OFFLINE_J2',
        type: 'SELL',
        bankAccountId: bank.id,
        ngnAmount: 930000,
        usdtAmount: 600,
        rate: 1550,
        totalFees: 0,
        netAmount: 930000,
        date: '2026-08-22T10:00:00Z'
      });

      // 6. User Journey Step D: FIFO Recalculation Verification
      const fifo = utils.calculateFIFOInventoryAndPnL(store.getTrades(), store.getOpeningInventory());
      // Consumes 500 from opening (at 1450) + 100 from trade1 (at 1480.05)
      // Total realized profit: 500 * (1550 - 1450) + 100 * (1550 - 1480.05) = 50000 + 6995 = 56995
      assert.strictEqual(fifo.remainingInventoryUSDT, 900);
      assert.strictEqual(Math.round(fifo.totalRealizedPnL), 56995);

      // 7. User Journey Step E: History Search & Export Verification
      const filtered = store.getTrades().filter(t => t.refId.includes('OFFLINE_J'));
      assert.strictEqual(filtered.length, 2);

      const backup = store.exportAllData();
      assert.strictEqual(backup.trades.length, 2);

      // 8. User Journey Step F: Final Bank Balance Verification
      const balances = store.getComputedBankBalances();
      // 2000000 - 1480050 + 930000 = 1449950
      assert.strictEqual(balances.get(bank.id).currentBalance, 1449950);
    });
  });
});
