/**
 * Bybit NGN P2P Trade Tracker — Main Application & Controller Coordinator
 */

import { renderDashboardView } from './views/dashboard.view.js';
import { renderAddTradeView } from './views/addTrade.view.js';
import { renderHistoryView } from './views/history.view.js';
import { renderSettingsView } from './views/settings.view.js';
import { renderModalsView } from './views/modals.view.js';

import { initBanks } from './banks.js';
import { initTransfers } from './transfers.js';
import { initTrades } from './trades.js';
import { initDashboard } from './dashboard.js';
import { initHistory } from './history.js';
import { initSettings } from './settings.js';

document.addEventListener('DOMContentLoaded', () => {
  // 1. Mount Modular View Templates into App Shell
  mountAppViews();

  // 2. Initialize Lucide Icons
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // 3. Navigation & Routing Coordinator
  initNavigation();

  // 4. Initialize Modular Feature Controllers
  initBanks();
  initTransfers();
  initTrades();
  initDashboard();
  initHistory();
  initSettings();

  // 5. PWA & Offline Service Worker Setup
  initPWA();
});

/**
 * Mount all sub-views and modals into shell containers
 */
function mountAppViews() {
  const mainContent = document.getElementById('main-content');
  const modalsContainer = document.getElementById('modals-container');

  if (mainContent) {
    mainContent.innerHTML = `
      ${renderDashboardView()}
      ${renderAddTradeView()}
      ${renderHistoryView()}
      ${renderSettingsView()}
    `;
  }

  if (modalsContainer) {
    modalsContainer.innerHTML = renderModalsView();
  }
}

/**
 * Tab Switching & Router Logic
 */
function initNavigation() {
  const navTabs = document.querySelectorAll('.nav-tab');
  const views = document.querySelectorAll('.app-view');

  function switchTab(targetViewId, pushState = true) {
    // 1. Update active tab buttons
    navTabs.forEach(tab => {
      const isTarget = tab.getAttribute('data-target') === targetViewId;
      tab.classList.toggle('active', isTarget);
    });

    // 2. Update active view panels
    views.forEach(view => {
      const isTarget = view.getAttribute('data-view') === targetViewId;
      if (isTarget) {
        view.classList.add('active');
      } else {
        view.classList.remove('active');
      }
    });

    // 3. Update URL hash
    if (pushState) {
      window.location.hash = targetViewId;
    }

    // Smooth scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Refresh icons in newly visible view
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  // Attach click events to navigation tabs
  navTabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const target = tab.getAttribute('data-target');
      switchTab(target);
    });
  });

  // Quick Action Buttons
  const btnDashQuickAdd = document.getElementById('btn-dash-quick-add');
  if (btnDashQuickAdd) {
    btnDashQuickAdd.addEventListener('click', () => switchTab('add-trade'));
  }

  const btnViewAllHistory = document.getElementById('btn-view-all-history');
  if (btnViewAllHistory) {
    btnViewAllHistory.addEventListener('click', () => switchTab('history'));
  }

  // Handle URL hash on initial load & popstate
  function handleHashRoute() {
    const hash = window.location.hash.replace('#', '');
    const validViews = ['dashboard', 'add-trade', 'history', 'settings'];
    if (validViews.includes(hash)) {
      switchTab(hash, false);
    } else {
      switchTab('dashboard', false);
    }
  }

  window.addEventListener('hashchange', handleHashRoute);
  handleHashRoute();

  // Expose switchTab globally
  window.switchView = switchTab;
}

/**
 * Toast Notification System
 */
window.showToast = function(message, type = 'info', duration = 3200) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let iconName = 'info';
  if (type === 'success') iconName = 'check-circle';
  if (type === 'error') iconName = 'alert-circle';

  toast.innerHTML = `
    <i data-lucide="${iconName}" class="toast-icon"></i>
    <span class="toast-message">${message}</span>
  `;

  container.appendChild(toast);
  if (window.lucide) window.lucide.createIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 0.25s ease';
    setTimeout(() => toast.remove(), 250);
  }, duration);
};

/**
 * PWA Service Worker & Install Prompt Registration
 */
function initPWA() {
  // Register Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => {
          console.log('[PWA] Service Worker registered with scope:', reg.scope);
        })
        .catch(err => {
          console.warn('[PWA] Service Worker registration failed:', err);
        });
    });
  }

  // PWA Install Prompt Hook
  let deferredPrompt;
  const btnInstall = document.getElementById('btn-install-pwa');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (btnInstall) {
      btnInstall.style.display = 'inline-flex';
      btnInstall.addEventListener('click', () => {
        if (deferredPrompt) {
          deferredPrompt.prompt();
          deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
              window.showToast('App installed successfully!', 'success');
            }
            deferredPrompt = null;
          });
        }
      });
    }
  });
}
