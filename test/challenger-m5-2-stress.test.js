/**
 * Milestone 5 Challenger 2 Adversarial Stress Test Suite
 * R5: Complete Offline PWA Pre-caching, Import Graph Parity, and Fetch Event Stress Testing
 */

const { describe, it, beforeEach } = require('./harness/test-runner');
const { assert } = require('./harness/assertions');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/**
 * Service Worker Sandbox & Mock Environment
 */
class MockResponse {
  constructor(body = '', init = {}) {
    this.body = body;
    this.status = init.status !== undefined ? init.status : 200;
    this.statusText = init.statusText || (this.status === 200 ? 'OK' : 'Error');
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

  async json() {
    return JSON.parse(String(this.body));
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
    return typeof request === 'string' ? request : request.url;
  }

  async add(request) {
    return this.addAll([request]);
  }

  async addAll(requests) {
    for (const req of requests) {
      const urlStr = typeof req === 'string' ? req : req.url;
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

      // Also map normalized localhost full URL
      const fullUrl = `http://localhost:3000/${relativePath === 'index.html' && urlStr.endsWith('/') ? '' : relativePath}`;
      this.entries.set(fullUrl, response);
      if (urlStr.includes('?')) {
        const query = urlStr.substring(urlStr.indexOf('?'));
        this.entries.set(`${fullUrl}${query}`, response);
      }
    }
  }

  async put(request, response) {
    const key = this._normalizeKey(request);
    this.entries.set(key, response.clone());
  }

  async match(request, options = {}) {
    const reqUrl = typeof request === 'string' ? request : request.url;

    // 1. Direct exact key match
    if (this.entries.has(reqUrl)) {
      return this.entries.get(reqUrl).clone();
    }

    // 2. Relative vs absolute path resolution
    for (const [key, resp] of this.entries.entries()) {
      if (key === reqUrl || `./${key}` === reqUrl || key === `./${reqUrl}`) {
        return resp.clone();
      }

      try {
        const parsedReq = new URL(reqUrl, 'http://localhost:3000');
        const parsedKey = new URL(key, 'http://localhost:3000');

        if (options.ignoreSearch) {
          if (parsedReq.pathname === parsedKey.pathname) {
            return resp.clone();
          }
        } else {
          if (parsedReq.href === parsedKey.href ||
              (parsedReq.pathname === parsedKey.pathname && parsedReq.search === parsedKey.search)) {
            return resp.clone();
          }
        }
      } catch {
        // Continue iterating
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

  const networkFetch = options.fetch || (async (req) => {
    throw new TypeError(`Failed to fetch: Network is offline (${typeof req === 'string' ? req : req.url})`);
  });

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
    fetch: networkFetch
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
        let responded = false;
        h({
          request,
          respondWith: (p) => {
            responded = true;
            respondPromise = p;
          }
        });
        if (responded) break;
      }
      return respondPromise;
    }
  };
}

describe('Challenger 2 — M5: Empirical JS Import Parity & Fetch Stress Suite', () => {

  describe('Task 1: Comprehensive Transitive JS Import Graph & STATIC_ASSETS Parity', () => {
    const swPath = path.resolve(__dirname, '../sw.js');
    const swContent = fs.readFileSync(swPath, 'utf-8');

    // Extract STATIC_ASSETS array from sw.js
    const match = swContent.match(/const STATIC_ASSETS = \[([\s\S]*?)\];/);
    assert.ok(match, 'STATIC_ASSETS array must be defined in sw.js');
    const staticAssets = eval(`[${match[1]}]`);

    /**
     * Helper to recursively extract all import paths from a JS file
     */
    function extractImportsFromCode(code) {
      const imports = [];
      // Static imports: import ... from './path.js' or import './path.js'
      const staticImportRegex = /(?:import\s+(?:[\w*\s{},]*\s+from\s+)?['"]([^'"]+)['"])/g;
      let m;
      while ((m = staticImportRegex.exec(code)) !== null) {
        imports.push(m[1]);
      }
      // Dynamic imports: import('./path.js')
      const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
      while ((m = dynamicImportRegex.exec(code)) !== null) {
        imports.push(m[1]);
      }
      return imports;
    }

    /**
     * Crawl the entire module graph starting from entry points
     */
    function buildModuleGraph(entryPoints) {
      const visited = new Set();
      const queue = [...entryPoints];
      const graph = new Map();

      while (queue.length > 0) {
        const currentRelPath = queue.shift();
        const normalizedRel = currentRelPath.startsWith('./') ? currentRelPath : `./${currentRelPath}`;
        if (visited.has(normalizedRel)) continue;
        visited.add(normalizedRel);

        const fullPath = path.resolve(__dirname, '..', normalizedRel.replace(/^\.\//, ''));
        assert.ok(fs.existsSync(fullPath), `Target module file must exist on disk: ${normalizedRel} (${fullPath})`);

        const content = fs.readFileSync(fullPath, 'utf-8');
        const rawImports = extractImportsFromCode(content);
        const resolvedDeps = [];

        for (const rawImp of rawImports) {
          // Resolve relative to current module directory
          const currentDir = path.dirname(normalizedRel);
          const resolvedDep = './' + path.normalize(path.join(currentDir, rawImp)).replace(/\\/g, '/');
          resolvedDeps.push(resolvedDep);
          if (!visited.has(resolvedDep)) {
            queue.push(resolvedDep);
          }
        }

        graph.set(normalizedRel, resolvedDeps);
      }

      return { visited, graph };
    }

    it('M5-CH2.1: Entry point js/app.js exists, is non-empty, and successfully builds complete dependency graph', () => {
      const { visited, graph } = buildModuleGraph(['./js/app.js']);
      assert.ok(visited.size >= 15, `Expected dependency graph to discover >= 15 modules, found ${visited.size}`);
      assert.ok(graph.has('./js/app.js'), 'Graph must contain ./js/app.js');
    });

    it('M5-CH2.2: 100% of all transitively imported JS files from js/app.js are included in sw.js STATIC_ASSETS', () => {
      const { visited } = buildModuleGraph(['./js/app.js']);
      const missingModules = [];

      for (const modulePath of visited) {
        const inStaticAssets = staticAssets.includes(modulePath);
        if (!inStaticAssets) {
          missingModules.push(modulePath);
        }
      }

      assert.strictEqual(
        missingModules.length,
        0,
        `The following transitively imported JS files are MISSING from sw.js STATIC_ASSETS: ${missingModules.join(', ')}`
      );
    });

    it('M5-CH2.3: Every physical JS file in js/ and js/views/ is present in sw.js STATIC_ASSETS (0 orphan files)', () => {
      const jsDir = path.resolve(__dirname, '../js');
      const viewsDir = path.resolve(__dirname, '../js/views');

      const physicalJsFiles = [
        ...fs.readdirSync(jsDir).filter(f => f.endsWith('.js')).map(f => `./js/${f}`),
        ...fs.readdirSync(viewsDir).filter(f => f.endsWith('.js')).map(f => `./js/views/${f}`)
      ];

      const missingFromManifest = [];
      for (const file of physicalJsFiles) {
        if (!staticAssets.includes(file)) {
          missingFromManifest.push(file);
        }
      }

      assert.strictEqual(
        missingFromManifest.length,
        0,
        `Physical JS files on disk not included in sw.js STATIC_ASSETS: ${missingFromManifest.join(', ')}`
      );
    });

    it('M5-CH2.4: Every single entry in sw.js STATIC_ASSETS exists on disk and is non-empty (>0 bytes)', () => {
      const brokenAssets = [];

      for (const asset of staticAssets) {
        let cleanPath = asset.replace(/^\.\//, '').split('?')[0];
        if (cleanPath === '' || cleanPath === '/') {
          cleanPath = 'index.html';
        }
        const fullDiskPath = path.resolve(__dirname, '..', cleanPath);

        if (!fs.existsSync(fullDiskPath)) {
          brokenAssets.push({ asset, reason: 'File does not exist on disk', fullDiskPath });
          continue;
        }

        const stat = fs.statSync(fullDiskPath);
        if (stat.size === 0) {
          brokenAssets.push({ asset, reason: 'File is 0 bytes (empty)', fullDiskPath });
        }
      }

      assert.strictEqual(
        brokenAssets.length,
        0,
        `STATIC_ASSETS contains invalid entries: ${JSON.stringify(brokenAssets, null, 2)}`
      );
    });

    it('M5-CH2.5: All view templates (6/6) and controllers (7/7) have valid export contracts matching app.js imports', () => {
      // Required view functions
      const expectedViews = [
        { path: './js/views/dashboard.view.js', exportName: 'renderDashboardView' },
        { path: './js/views/addTrade.view.js', exportName: 'renderAddTradeView' },
        { path: './js/views/pricing.view.js', exportName: 'renderPricingView' },
        { path: './js/views/history.view.js', exportName: 'renderHistoryView' },
        { path: './js/views/settings.view.js', exportName: 'renderSettingsView' },
        { path: './js/views/modals.view.js', exportName: 'renderModalsView' }
      ];

      for (const v of expectedViews) {
        const fullPath = path.resolve(__dirname, '..', v.path);
        const code = fs.readFileSync(fullPath, 'utf-8');
        const hasExport = code.includes(`export function ${v.exportName}`) || code.includes(`export const ${v.exportName}`) || code.includes(`${v.exportName}`);
        assert.ok(hasExport, `View module ${v.path} must export function ${v.exportName}`);
      }

      // Required controller init functions
      const expectedControllers = [
        { path: './js/banks.js', exportName: 'initBanks' },
        { path: './js/transfers.js', exportName: 'initTransfers' },
        { path: './js/trades.js', exportName: 'initTrades' },
        { path: './js/dashboard.js', exportName: 'initDashboard' },
        { path: './js/history.js', exportName: 'initHistory' },
        { path: './js/settings.js', exportName: 'initSettings' },
        { path: './js/pricing.js', exportName: 'initPricing' }
      ];

      for (const c of expectedControllers) {
        const fullPath = path.resolve(__dirname, '..', c.path);
        const code = fs.readFileSync(fullPath, 'utf-8');
        const hasExport = code.includes(`export function ${c.exportName}`) || code.includes(`export const ${c.exportName}`);
        assert.ok(hasExport, `Controller module ${c.path} must export function ${c.exportName}`);
      }
    });
  });

  describe('Task 2: Fetch Event Handler Stress Testing', () => {

    describe('A. Non-GET Request Handling', () => {
      let sw;

      beforeEach(async () => {
        sw = createServiceWorkerSandbox();
        await sw.dispatchInstall();
        await sw.dispatchActivate();
      });

      it('M5-CH2.6: POST requests bypass the service worker without calling respondWith()', async () => {
        const postReq = new MockRequest('http://localhost:3000/api/balance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        const resPromise = await sw.dispatchFetch(postReq);
        assert.strictEqual(resPromise, null, 'Fetch event listener must NOT call event.respondWith for POST requests');
      });

      it('M5-CH2.7: PUT, DELETE, PATCH, OPTIONS, and HEAD methods all bypass cache handler', async () => {
        const methods = ['PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];

        for (const method of methods) {
          const req = new MockRequest('http://localhost:3000/api/orders', { method });
          const resPromise = await sw.dispatchFetch(req);
          assert.strictEqual(resPromise, null, `Fetch listener must NOT intercept ${method} requests`);
        }
      });

      it('M5-CH2.8: Cross-origin non-GET requests (e.g. Bybit OpenAPI POST) bypass cache handler', async () => {
        const crossOriginPost = new MockRequest('https://api.bybit.com/v5/asset/transfer/query-account-coins-balance', {
          method: 'POST'
        });
        const resPromise = await sw.dispatchFetch(crossOriginPost);
        assert.strictEqual(resPromise, null, 'Cross-origin POST must bypass service worker');
      });
    });

    describe('B. External CDN Failures & Resilience', () => {
      it('M5-CH2.9: Online CDN requests fetch and dynamically cache whitelisted CDNs', async () => {
        let fetchCount = 0;
        const mockCdnUrl = 'https://unpkg.com/lucide@latest/dist/lucide.min.js';
        const cdnResponse = new MockResponse('console.log("lucide icons");', { status: 200, url: mockCdnUrl });

        const sw = createServiceWorkerSandbox({
          fetch: async (req) => {
            fetchCount++;
            return cdnResponse.clone();
          }
        });
        await sw.dispatchInstall();
        await sw.dispatchActivate();

        // First fetch (cache miss, network fetch)
        const req1 = new MockRequest(mockCdnUrl);
        const res1 = await sw.dispatchFetch(req1);
        assert.ok(res1, 'CDN fetch should return response');
        assert.strictEqual(fetchCount, 1, 'Network fetch should be called on first request');

        // Allow any async cache.put to settle
        await new Promise(resolve => setTimeout(resolve, 20));

        // Verify it was stored in cache
        const cache = await sw.cacheStorage.open('bybit-p2p-v9');
        const cached = await cache.match(req1);
        assert.ok(cached, 'Whitelisted CDN response must be placed into cache');
      });

      it('M5-CH2.10: Offline CDN requests serve cached copies when CDN is unreachable', async () => {
        const mockCdnUrl = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans';
        const sw = createServiceWorkerSandbox({
          fetch: async () => {
            throw new TypeError('Network error: CDN server unreachable');
          }
        });
        await sw.dispatchInstall();
        await sw.dispatchActivate();

        // Pre-populate the cache with the CDN asset
        const cache = await sw.cacheStorage.open('bybit-p2p-v9');
        await cache.put(mockCdnUrl, new MockResponse('/* Google Font CSS */', { status: 200, url: mockCdnUrl }));

        // Query asset while network is down
        const req = new MockRequest(mockCdnUrl);
        const res = await sw.dispatchFetch(req);
        assert.ok(res, 'Offline CDN fetch should resolve from cache');
        const text = await res.text();
        assert.strictEqual(text, '/* Google Font CSS */');
      });

      it('M5-CH2.11: First-load CDN failure (cache miss + network failure) rejects gracefully without breaking SW', async () => {
        const mockCdnUrl = 'https://cdn.jsdelivr.net/npm/chart.js';
        const sw = createServiceWorkerSandbox({
          fetch: async () => {
            throw new TypeError('Failed to fetch: Connection timeout to CDN');
          }
        });
        await sw.dispatchInstall();
        await sw.dispatchActivate();

        const req = new MockRequest(mockCdnUrl);
        let errorCaught = false;
        try {
          await sw.dispatchFetch(req);
        } catch (err) {
          errorCaught = true;
          assert.ok(err.message.includes('Connection timeout'), 'Should propagate expected network failure');
        }

        assert.ok(errorCaught, 'Uncached CDN request during offline network should reject cleanly');
      });

      it('M5-CH2.12: CDN returning non-200 (404/500) is NOT saved into cache', async () => {
        const mockCdnUrl = 'https://unpkg.com/lucide@latest/non-existent.js';
        const sw = createServiceWorkerSandbox({
          fetch: async () => {
            return new MockResponse('404 Not Found', { status: 404, url: mockCdnUrl });
          }
        });
        await sw.dispatchInstall();
        await sw.dispatchActivate();

        const req = new MockRequest(mockCdnUrl);
        const res = await sw.dispatchFetch(req);
        assert.strictEqual(res.status, 404);

        // Verify 404 was NOT cached
        const cache = await sw.cacheStorage.open('bybit-p2p-v9');
        const inCache = await cache.match(mockCdnUrl);
        assert.strictEqual(inCache, undefined, '404 responses from CDNs must not be cached');
      });

      it('M5-CH2.13: Non-whitelisted third-party domain is not cached even if successful', async () => {
        const untrustedUrl = 'https://analytics.thirdparty.com/track.js';
        const sw = createServiceWorkerSandbox({
          fetch: async () => {
            return new MockResponse('console.log("track");', { status: 200, url: untrustedUrl });
          }
        });
        await sw.dispatchInstall();
        await sw.dispatchActivate();

        const req = new MockRequest(untrustedUrl);
        const res = await sw.dispatchFetch(req);
        assert.strictEqual(res.status, 200);

        await new Promise(resolve => setTimeout(resolve, 20));
        const cache = await sw.cacheStorage.open('bybit-p2p-v9');
        const inCache = await cache.match(untrustedUrl);
        assert.strictEqual(inCache, undefined, 'Non-whitelisted external URLs must not be cached');
      });
    });

    describe('C. Query String Variations & Search Ignore Fallback', () => {
      let sw;

      beforeEach(async () => {
        sw = createServiceWorkerSandbox();
        await sw.dispatchInstall();
        await sw.dispatchActivate();
      });

      it('M5-CH2.14: Stylesheet with exact pre-cached query param css/styles.css?v=2.5 loads offline', async () => {
        const req = new MockRequest('http://localhost:3000/css/styles.css?v=2.5');
        const res = await sw.dispatchFetch(req);
        assert.ok(res, 'css/styles.css?v=2.5 must resolve offline');
        assert.strictEqual(res.status, 200);
      });

      it('M5-CH2.15: Asset with cache-busting query strings falls back to base asset via ignoreSearch', async () => {
        const variations = [
          'http://localhost:3000/css/styles.css?v=3.1.0',
          'http://localhost:3000/css/styles.css?ts=1724520000',
          'http://localhost:3000/js/app.js?build=production&hash=abc1234',
          'http://localhost:3000/js/utils.js?debug=true&lang=en',
          'http://localhost:3000/manifest.json?rev=99'
        ];

        for (const urlStr of variations) {
          const req = new MockRequest(urlStr);
          const res = await sw.dispatchFetch(req);
          assert.ok(res, `Asset with query string ${urlStr} must resolve via ignoreSearch fallback`);
          assert.strictEqual(res.status, 200);
          const text = await res.text();
          assert.ok(text.length > 0, `Response for ${urlStr} must contain valid content`);
        }
      });

      it('M5-CH2.16: Complex URL-encoded query strings match base asset correctly offline', async () => {
        const encodedUrl = 'http://localhost:3000/js/store.js?key=%20%2B%2F%3D&filter=BUY%26SELL';
        const req = new MockRequest(encodedUrl);
        const res = await sw.dispatchFetch(req);
        assert.ok(res, 'Encoded query strings must resolve base file');
        assert.strictEqual(res.status, 200);
      });
    });

    describe('D. Missing Assets, HTML Navigation Fallback & MIME Safety', () => {
      let sw;

      beforeEach(async () => {
        sw = createServiceWorkerSandbox();
        await sw.dispatchInstall();
        await sw.dispatchActivate();
      });

      it('M5-CH2.17: HTML navigation request (mode: "navigate") to non-cached route falls back to index.html', async () => {
        const routes = [
          'http://localhost:3000/dashboard',
          'http://localhost:3000/pricing',
          'http://localhost:3000/history',
          'http://localhost:3000/settings',
          'http://localhost:3000/trade/edit/12345',
          'http://localhost:3000/unknown/deep/route'
        ];

        for (const route of routes) {
          const navReq = new MockRequest(route, {
            mode: 'navigate',
            headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' }
          });
          const res = await sw.dispatchFetch(navReq);
          assert.ok(res, `Navigation to ${route} must return index.html shell`);
          const body = await res.text();
          assert.ok(body.includes('Bybit NGN P2P Trade Tracker'), 'Shell must contain page title');
          assert.ok(body.includes('app-shell'), 'Shell must contain app-shell element');
        }
      });

      it('M5-CH2.18: Missing JS script offline does NOT return HTML (MIME safety to avoid Uncaught SyntaxError)', async () => {
        const missingJsReq = new MockRequest('http://localhost:3000/js/non-existent-plugin.js', {
          mode: 'cors',
          headers: { 'Accept': '*/*' }
        });

        const res = await sw.dispatchFetch(missingJsReq);
        // Should return undefined (so browser gives 404 or network error) instead of returning index.html HTML
        if (res) {
          const body = await res.text();
          assert.ok(!body.includes('<!DOCTYPE html>'), 'Missing JS file must NEVER return HTML document');
        } else {
          assert.strictEqual(res, undefined, 'Missing JS file correctly resolves to undefined');
        }
      });

      it('M5-CH2.19: Missing image/media asset offline does NOT return HTML document', async () => {
        const missingImgReq = new MockRequest('http://localhost:3000/icons/missing-icon.png', {
          mode: 'no-cors',
          headers: { 'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8' }
        });

        const res = await sw.dispatchFetch(missingImgReq);
        if (res) {
          const body = await res.text();
          assert.ok(!body.includes('<!DOCTYPE html>'), 'Missing image asset must not return HTML');
        } else {
          assert.strictEqual(res, undefined, 'Missing image asset correctly resolves to undefined');
        }
      });
    });

    describe('E. Concurrent Stress & Resilience Under Rapid Requests', () => {
      it('M5-CH2.20: 50 concurrent offline requests for diverse assets execute without error or corruption', async () => {
        const sw = createServiceWorkerSandbox();
        await sw.dispatchInstall();
        await sw.dispatchActivate();

        const testUrls = [
          'http://localhost:3000/',
          'http://localhost:3000/index.html',
          'http://localhost:3000/manifest.json',
          'http://localhost:3000/css/styles.css',
          'http://localhost:3000/css/styles.css?v=2.5',
          'http://localhost:3000/icons/icon.svg',
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

        // Create 50 concurrent requests by doubling the list
        const concurrentRequests = [...testUrls, ...testUrls].map(url => {
          return sw.dispatchFetch(new MockRequest(url));
        });

        const responses = await Promise.all(concurrentRequests);
        assert.strictEqual(responses.length, 50, 'All 50 concurrent requests must complete');

        for (let i = 0; i < responses.length; i++) {
          const resp = responses[i];
          assert.ok(resp, `Response ${i} must not be null/undefined`);
          assert.strictEqual(resp.status, 200, `Response ${i} must have status 200`);
        }
      });
    });

  });

}, { tier: 5, category: 'Milestone 5 Challenger 2 Stress' });
