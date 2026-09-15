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
      const hostname = window.location.hostname;
      const port = window.location.port;
      // If running on a local development port other than 3000, redirect requests to proxy on port 3000
      const isLocal = hostname === 'localhost' || 
                      hostname === '127.0.0.1' || 
                      hostname.startsWith('192.168.') || 
                      hostname.startsWith('10.') || 
                      hostname.startsWith('172.');
      if (isLocal && port !== '3000') {
        return `http://${hostname}:3000`;
      }
      return window.location.origin;
    }
  }
  return 'http://localhost:3000';
}

export function sanitizeKey(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '').trim();
}

function getAuthHeaders(customHeaders = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...customHeaders
  };
  if (typeof window !== 'undefined' && window.localStorage) {
    const rawApiKey = localStorage.getItem('bybit_api_key') || localStorage.getItem('bybit_p2p_api_key');
    const rawApiSecret = localStorage.getItem('bybit_api_secret') || localStorage.getItem('bybit_p2p_api_secret');
    const apiKey = sanitizeKey(rawApiKey);
    const apiSecret = sanitizeKey(rawApiSecret);
    if (apiKey) {
      headers['x-bybit-api-key'] = apiKey;
    }
    if (apiSecret) {
      headers['x-bybit-api-secret'] = apiSecret;
    }
  }
  return headers;
}

export function formatBybitErrorMessage(data, defaultMsg = 'Unknown error occurred') {
  if (!data) return defaultMsg;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      data = { retMsg: data };
    }
  }
  const code = Number(data?.retCode ?? data?.ret_code ?? data?.code ?? 0);
  const rawMsg = String(data?.retMsg || data?.ret_msg || data?.message || defaultMsg || '');

  if (rawMsg.startsWith('<')) {
    return `Upstream gateway error (HTTP ${code || 'network'}). Bybit services may be temporarily unreachable.`;
  }
  if (code === 10003 || /api_?key is invalid/i.test(rawMsg)) {
    return 'Unauthorized: Bybit API Key is invalid or does not exist. Please check your Bybit API Key in Settings.';
  }
  if (code === 10004 || /error sign/i.test(rawMsg)) {
    return 'Bybit API Signature error: API Secret mismatch. Please check your Bybit API Secret in Settings.';
  }
  if (code === 10005 || /permission denied/i.test(rawMsg)) {
    return 'Permission denied (Code 10005): Your Bybit API key lacks permissions for this action. Ensure "Read-Write" and Account/P2P permissions are enabled in Bybit API management, and check IP restrictions.';
  }
  if (code === 10010 || /unmatched ip|ip restriction/i.test(rawMsg)) {
    return 'IP Restriction (Code 10010): Your Bybit API key is restricted by IP address. Please set it to "No IP restriction" on Bybit to allow serverless queries.';
  }
  if (code === 33004 || /expired/i.test(rawMsg)) {
    return 'Bybit API key has expired (Code 33004). Please create a new key on Bybit and update Settings.';
  }
  if (code === 10006 || /too many visits|rate limit/i.test(rawMsg)) {
    return 'Bybit rate limit exceeded (Code 10006). Please wait a moment before trying again.';
  }
  if (code === 401 || /unauthorized/i.test(rawMsg)) {
    return 'Unauthorized: Invalid or missing Bybit API credentials. Please configure your Bybit API Key and Secret in Settings.';
  }
  return rawMsg || defaultMsg;
}

export const bybitService = {
  /**
   * Check if the local proxy server is running and configured
   */
  async checkStatus() {
    try {
      const baseUrl = getProxyUrl();
      const response = await fetch(`${baseUrl}/api/status`, {
        headers: getAuthHeaders()
      });
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
        headers: getAuthHeaders()
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(formatBybitErrorMessage(errData, errData.retMsg || `HTTP ${response.status}`));
      }
      const data = await response.json();
      if (data.retCode !== 0 && data.ret_code !== 0) {
        throw new Error(formatBybitErrorMessage(data, data.retMsg || data.ret_msg || `Error code: ${data.retCode ?? data.ret_code}`));
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
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(formatBybitErrorMessage(errData, errData.retMsg || errData.ret_msg || `HTTP ${response.status}`));
      }

      const data = await response.json();
      if (data.retCode !== 0 && data.ret_code !== 0) {
        throw new Error(formatBybitErrorMessage(data, data.retMsg || data.ret_msg || `Error code: ${data.retCode ?? data.ret_code}`));
      }

      return data.result; // Returns { count, items: [...] }
    } catch (e) {
      console.error('[Bybit Service] Error fetching P2P orders:', e.message);
      throw e;
    }
  },

  /**
   * Fetch Active Bybit P2P Advertisements (POST /v5/p2p/item/personal/list)
   * @param {string} [side=''] - Filter by side ('0' for Buy, '1' for Sell, '' or null for all)
   * @param {string} [tokenId='USDT'] - Coin symbol (e.g. 'USDT')
   * @returns {Promise<Array>} Array of ad objects
   */
  async fetchActiveAds(side = '', tokenId = 'USDT') {
    try {
      const baseUrl = getProxyUrl();
      const params = new URLSearchParams();
      if (tokenId) params.append('tokenId', tokenId);
      if (side !== undefined && side !== null && String(side).trim() !== '') {
        params.append('side', String(side).trim());
      }
      params.append('_t', Date.now().toString());

      const payload = {
        tokenId: tokenId || 'USDT',
        ...(side !== undefined && side !== null && String(side).trim() !== '' ? { side: String(side).trim() } : {})
      };

      const response = await fetch(`${baseUrl}/api/ads?${params.toString()}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(formatBybitErrorMessage(errData, errData.retMsg || `HTTP ${response.status}`));
      }
      const data = await response.json();
      if (data.retCode !== 0 && data.ret_code !== 0) {
        throw new Error(formatBybitErrorMessage(data, data.retMsg || `Error code: ${data.retCode}`));
      }
      if (Array.isArray(data.result)) return data.result;
      if (data.result && typeof data.result === 'object') {
        return (
          data.result.items ||
          data.result.list ||
          data.result.rows ||
          data.result.data ||
          data.result.records ||
          []
        );
      }
      if (Array.isArray(data.items)) return data.items;
      if (Array.isArray(data.list)) return data.list;
      return [];
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
      const response = await fetch(`${baseUrl}/api/market-depth?coin=${coin}&fiat=${fiat}&limit=${limit}&_t=${Date.now()}`, {
        headers: getAuthHeaders()
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(formatBybitErrorMessage(errData, errData.retMsg || `HTTP ${response.status}`));
      }
      const data = await response.json();
      if (data.retCode !== 0) {
        throw new Error(formatBybitErrorMessage(data, data.retMsg || `Error code: ${data.retCode}`));
      }
      return data.result;
    } catch (e) {
      console.error('[Bybit Service] Error fetching market depth:', e.message);
      throw e;
    }
  }
};
