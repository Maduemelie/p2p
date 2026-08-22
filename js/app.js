/**
 * Bybit NGN P2P Trade Tracker — Main Application & Controller Coordinator
 * v2.0 — Redesigned with sidebar nav, theme toggle, confirmation modals
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
  // 1. Initialize theme before rendering
  initTheme();

  // 2. Mount views
  mountAppViews();

  // 3. Initialize icons
  if (window.lucide) window.lucide.createIcons();

  // 4. Navigation
  initNavigation();

  // 5. Feature controllers
  initBanks();
  initTransfers();
  initTrades();
  initDashboard();
  initHistory();
  initSettings();

  // 6. PWA
  initPWA();

  // 7. Global keyboard shortcuts
  initKeyboardShortcuts();
});

/**
 * Mount all sub-views into shell containers
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
 * Theme Toggle (Dark / Light)
 */
function initTheme() {
  const savedTheme = localStorage.getItem('bybit_p2p_theme') || 'dark';
  if (savedTheme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }

  // Bind both toggle buttons (header + sidebar)
  document.addEventListener('click', (e) => {
    const toggle = e.target.closest('#btn-theme-toggle, #btn-theme-toggle-sidebar');
    if (!toggle) return;

    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    if (isLight) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('bybit_p2p_theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('bybit_p2p_theme', 'light');
    }

    // Update theme-color meta for PWA
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', isLight ? '#0A0F1A' : '#F8FAFC');
    }

    if (window.lucide) window.lucide.createIcons();
  });
}

/**
 * Navigation — Tab switching for bottom nav + sidebar
 */
function initNavigation() {
  const bottomTabs = document.querySelectorAll('.nav-tab');
  const sidebarItems = document.querySelectorAll('.sidebar-nav-item');
  const views = document.querySelectorAll('.app-view');

  function switchTab(targetViewId, pushState = true) {
    // Update bottom nav tabs
    bottomTabs.forEach(tab => {
      tab.classList.toggle('active', tab.getAttribute('data-target') === targetViewId);
    });

    // Update sidebar items
    sidebarItems.forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-target') === targetViewId);
    });

    // Update views
    views.forEach(view => {
      const isTarget = view.getAttribute('data-view') === targetViewId;
      if (isTarget) {
        view.classList.add('active');
      } else {
        view.classList.remove('active');
      }
    });

    // URL hash
    if (pushState) {
      window.location.hash = targetViewId;
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (window.lucide) window.lucide.createIcons();
  }

  // Bottom nav clicks
  bottomTabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab(tab.getAttribute('data-target'));
    });
  });

  // Sidebar nav clicks
  sidebarItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab(item.getAttribute('data-target'));
    });
  });

  // Quick action buttons
  const btnDashQuickAdd = document.getElementById('btn-dash-quick-add');
  if (btnDashQuickAdd) {
    btnDashQuickAdd.addEventListener('click', () => switchTab('add-trade'));
  }

  const btnViewAllHistory = document.getElementById('btn-view-all-history');
  if (btnViewAllHistory) {
    btnViewAllHistory.addEventListener('click', () => switchTab('history'));
  }

  // Hash routing
  function handleHashRoute() {
    const hash = window.location.hash.replace('#', '');
    const validViews = ['dashboard', 'add-trade', 'history', 'settings'];
    switchTab(validViews.includes(hash) ? hash : 'dashboard', false);
  }

  window.addEventListener('hashchange', handleHashRoute);
  handleHashRoute();

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
 * Confirmation Modal System
 * Replaces native confirm() with styled modal
 * @param {string} title
 * @param {string} message
 * @param {Function} onConfirm
 * @param {'danger'|'warning'} type
 */
window.showConfirmModal = function(title, message, onConfirm, type = 'danger') {
  const container = document.getElementById('confirm-modal-container');
  if (!container) return;

  const iconName = type === 'danger' ? 'alert-triangle' : 'alert-circle';

  container.innerHTML = `
    <div class="modal-backdrop" id="confirm-modal-backdrop">
      <div class="modal-card" style="max-width: 400px;">
        <div class="confirm-modal-body">
          <div class="confirm-modal-icon ${type}-icon">
            <i data-lucide="${iconName}"></i>
          </div>
          <h3 class="confirm-modal-title">${title}</h3>
          <p class="confirm-modal-message">${message}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="confirm-modal-cancel">Cancel</button>
          <button class="btn ${type === 'danger' ? 'btn-danger' : 'btn-primary'}" id="confirm-modal-ok">
            ${type === 'danger' ? 'Delete' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  const backdrop = document.getElementById('confirm-modal-backdrop');
  const btnCancel = document.getElementById('confirm-modal-cancel');
  const btnOk = document.getElementById('confirm-modal-ok');

  function close() {
    container.innerHTML = '';
  }

  btnCancel?.addEventListener('click', close);
  btnOk?.addEventListener('click', () => {
    close();
    if (onConfirm) onConfirm();
  });

  // Close on backdrop click
  backdrop?.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
};

/**
 * Global keyboard shortcuts
 */
function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // Close confirmation modal
      const confirmContainer = document.getElementById('confirm-modal-container');
      if (confirmContainer && confirmContainer.innerHTML.trim()) {
        confirmContainer.innerHTML = '';
        return;
      }

      // Close any open modal
      const openModals = document.querySelectorAll('.modal-backdrop:not(.hidden)');
      openModals.forEach(modal => {
        modal.classList.add('hidden');
      });
    }
  });

  // Close modals on backdrop click
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop') && !e.target.closest('.modal-card')) {
      e.target.classList.add('hidden');
    }
  });
}

/**
 * PWA Service Worker & Install Prompt
 */
function initPWA() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('[PWA] SW registered:', reg.scope))
        .catch(err => console.warn('[PWA] SW failed:', err));
    });
  }

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
          deferredPrompt.userChoice.then((result) => {
            if (result.outcome === 'accepted') {
              window.showToast('App installed successfully!', 'success');
            }
            deferredPrompt = null;
          });
        }
      });
    }
  });
}
