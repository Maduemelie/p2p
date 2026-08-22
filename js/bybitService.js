/**
 * Frontend Service: Bybit P2P Integration Client
 * Interacts with the local Node.js proxy server to get balances and sync history.
 * Automatically adapts to the host domain (localhost, local network IP, or custom proxy).
 */

function getProxyUrl() {
  if (typeof window !== 'undefined' && window.location) {
    // Allow custom override in localStorage if configured
    const customUrl = localStorage.getItem('bybit_p2p_proxy_url');
    if (customUrl && customUrl.trim()) {
      return customUrl.trim().replace(/\/$/, '');
    }
    // Default to current browser origin when served over HTTP/HTTPS
    if (window.location.protocol.startsWith('http')) {
      return window.location.origin;
    }
  }
  return 'http://localhost:3000';
}

export const bybitService = {
  /**
   * Check if the local proxy server is running and configured
   */
  async checkStatus() {
    try {
      const baseUrl = getProxyUrl();
      const response = await fetch(`${baseUrl}/api/status`);
      if (!response.ok) throw new Error('Proxy status error');
      return await response.json();
    } catch (e) {
      console.warn('[Bybit Service] Local proxy server is offline or unreachable:', e.message);
      return { status: 'offline', error: e.message };
    }
  },

  /**
   * Fetch current Funding (P2P) Balance from Bybit for a specific coin
   */
  async fetchFundingBalance(coin = 'USDT') {
    try {
      const baseUrl = getProxyUrl();
      const response = await fetch(`${baseUrl}/api/balance?coin=${coin}&accountType=FUND&_t=${Date.now()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.retMsg || `HTTP ${response.status}`);
      }
      const data = await response.json();
      if (data.retCode !== 0 && data.ret_code !== 0) {
        throw new Error(data.retMsg || data.ret_msg || `Error code: ${data.retCode ?? data.ret_code}`);
      }
      return data.result;
    } catch (e) {
      console.error('[Bybit Service] Error fetching funding balance:', e.message);
      throw e;
    }
  },

  /**
   * Fetch recent P2P Orders from Bybit (POST /v5/p2p/order/simplifyList)
   */
  async fetchP2POrders(page = 1, size = 30, status = null) {
    try {
      const baseUrl = getProxyUrl();
      const payload = {
        page: Number(page),
        size: Number(size)
      };
      if (status !== null) {
        payload.status = Number(status);
      }

      const response = await fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.retMsg || errData.ret_msg || `HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.retCode !== 0 && data.ret_code !== 0) {
        throw new Error(data.retMsg || data.ret_msg || `Error code: ${data.retCode ?? data.ret_code}`);
      }

      return data.result; // Returns { count, items: [...] }
    } catch (e) {
      console.error('[Bybit Service] Error fetching P2P orders:', e.message);
      throw e;
    }
  },

  /**
   * Fetch Active Bybit P2P Advertisements (POST /v5/p2p/item/personal/list)
   */
  async fetchActiveAds(side = '1', tokenId = 'USDT') {
    try {
      const baseUrl = getProxyUrl();
      const response = await fetch(`${baseUrl}/api/ads?_t=${Date.now()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.retMsg || `HTTP ${response.status}`);
      }
      const data = await response.json();
      if (data.retCode !== 0 && data.ret_code !== 0) {
        throw new Error(data.retMsg || `Error code: ${data.retCode}`);
      }
      return data.result?.items || [];
    } catch (e) {
      console.warn('[Bybit Service] Error fetching active ads:', e.message);
      return [];
    }
  },

  /**
   * Fetch Market Depth (P2P Order Book) (GET /api/market-depth)
   */
  async fetchMarketDepth(coin = 'USDT', fiat = 'NGN', limit = 5) {
    try {
      const baseUrl = getProxyUrl();
      const response = await fetch(`${baseUrl}/api/market-depth?coin=${coin}&fiat=${fiat}&limit=${limit}&_t=${Date.now()}`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.retMsg || `HTTP ${response.status}`);
      }
      const data = await response.json();
      if (data.retCode !== 0) {
        throw new Error(data.retMsg || `Error code: ${data.retCode}`);
      }
      return data.result;
    } catch (e) {
      console.error('[Bybit Service] Error fetching market depth:', e.message);
      throw e;
    }
  }
};
