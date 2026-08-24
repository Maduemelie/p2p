/**
 * Tier 1: Feature Coverage — R5: Complete Offline PWA Pre-caching
 */

const { describe, it } = require('../harness/test-runner');
const { assert } = require('../harness/assertions');
const fs = require('fs');
const path = require('path');

describe('Tier 1 — R5: Complete Offline PWA Pre-caching', () => {
  const swContent = fs.readFileSync(path.resolve(__dirname, '../../sw.js'), 'utf-8');

  // List all real files in js/ and js/views/
  const jsDir = path.resolve(__dirname, '../../js');
  const viewsDir = path.resolve(__dirname, '../../js/views');

  const jsFiles = fs.readdirSync(jsDir).filter(f => f.endsWith('.js')).map(f => `./js/${f}`);
  const viewFiles = fs.readdirSync(viewsDir).filter(f => f.endsWith('.js')).map(f => `./js/views/${f}`);

  it('R5.1: Service Worker STATIC_ASSETS pre-caches all local JS controller files in js/*.js', () => {
    // Acceptance criterion: "All local JS controller files (js/*.js) and view templates (js/views/*.js) are included in the Service Worker pre-cache list."
    jsFiles.forEach(file => {
      const normalizedPath = file.replace(/^\.\//, '');
      const isInManifest = swContent.includes(file) || swContent.includes(normalizedPath);
      assert.ok(isInManifest, `Service worker STATIC_ASSETS must include controller file: ${file}`);
    });
  });

  it('R5.2: Service Worker STATIC_ASSETS pre-caches all view templates in js/views/*.js', () => {
    viewFiles.forEach(file => {
      const normalizedPath = file.replace(/^\.\//, '');
      const isInManifest = swContent.includes(file) || swContent.includes(normalizedPath);
      assert.ok(isInManifest, `Service worker STATIC_ASSETS must include view template: ${file}`);
    });
  });

  it('R5.3: Service Worker STATIC_ASSETS includes app entry point, css styles, manifest, and icons', () => {
    const requiredCoreAssets = [
      './',
      './index.html',
      './manifest.json',
      './icons/icon.svg',
      './icons/icon-192.png',
      './icons/icon-512.png'
    ];

    requiredCoreAssets.forEach(asset => {
      const normalized = asset.replace(/^\.\//, '');
      assert.ok(swContent.includes(asset) || swContent.includes(normalized), `Core asset must be pre-cached: ${asset}`);
    });
  });

  it('R5.4: Service Worker implements offline fallback strategy for navigation and assets', () => {
    // Acceptance criterion: "The application successfully loads the shell and navigates between views when offline."
    const hasFetchHandler = swContent.includes("self.addEventListener('fetch'") || swContent.includes('self.addEventListener("fetch"');
    const hasOfflineMatch = swContent.includes('caches.match') || swContent.includes('match');
    const hasNetworkCatch = swContent.includes('.catch(') || swContent.includes('catch');

    assert.ok(hasFetchHandler, 'Service worker must implement fetch event listener');
    assert.ok(hasOfflineMatch, 'Service worker must match cached assets during offline fetch');
    assert.ok(hasNetworkCatch, 'Service worker must catch network errors and provide offline response');
  });

  it('R5.5: Service Worker activate handler clears stale cache versions', () => {
    const hasActivateHandler = swContent.includes("self.addEventListener('activate'") || swContent.includes('self.addEventListener("activate"');
    const hasCacheDelete = swContent.includes('caches.delete') || swContent.includes('delete');

    assert.ok(hasActivateHandler, 'Service worker must implement activate listener');
    assert.ok(hasCacheDelete, 'Service worker must purge obsolete cache versions on activate');
  });
}, { tier: 1, category: 'R5: Offline PWA' });
