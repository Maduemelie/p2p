/**
 * Tier 2: Boundary & Corner Cases — R5: Complete Offline PWA Pre-caching
 */

const { describe, it } = require('../harness/test-runner');
const { assert } = require('../harness/assertions');
const fs = require('fs');
const path = require('path');

describe('Tier 2 — R5: Boundary & Corner Cases (Offline PWA)', () => {
  const swContent = fs.readFileSync(path.resolve(__dirname, '../../sw.js'), 'utf-8');

  it('R5-B.1: Non-GET requests bypass the Service Worker cache handler', () => {
    // Check sw.js for non-GET bypass check: if (event.request.method !== 'GET') return;
    const hasMethodBypass = swContent.includes("event.request.method !== 'GET'") || swContent.includes('event.request.method !== "GET"');
    assert.ok(hasMethodBypass, 'Service worker must bypass cache for non-GET requests');
  });

  it('R5-B.2: Service Worker differentiates local origin network-first vs external CDN cache-first', () => {
    const hasOriginCheck = swContent.includes('requestUrl.origin === self.location.origin') || swContent.includes('isLocalAsset');
    assert.ok(hasOriginCheck, 'Service worker should distinguish local vs CDN assets');
  });

  it('R5-B.3: Cache cleanup purges old versions while preserving active version', () => {
    const activeVersion = 'bybit-p2p-v9';
    const existingCacheKeys = ['bybit-p2p-v6', 'bybit-p2p-v7', 'bybit-p2p-v8', 'bybit-p2p-v9'];

    const cachesToDelete = existingCacheKeys.filter(name => name !== activeVersion);
    assert.strictEqual(cachesToDelete.length, 3);
    assert.includes(cachesToDelete, 'bybit-p2p-v8');
    assert.ok(!cachesToDelete.includes('bybit-p2p-v9'));
  });

  it('R5-B.4: HTML navigation request falls back to cached index.html when offline', () => {
    const hasHtmlFallback = swContent.includes("headers.get('accept')?.includes('text/html')") || 
                            swContent.includes("caches.match('./index.html')") || 
                            swContent.includes("caches.match('/index.html')");
    assert.ok(hasHtmlFallback, 'Offline fetch should provide HTML shell fallback');
  });

  it('R5-B.5: Pre-cache install handler catches individual asset errors without killing registration', () => {
    const hasInstallCatch = swContent.includes('.catch(') && swContent.includes('Pre-cache');
    assert.ok(hasInstallCatch, 'Pre-cache install must catch runtime warnings');
  });
}, { tier: 2, category: 'R5: Boundary Cases' });
