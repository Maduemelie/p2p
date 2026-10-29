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
  if (code === 10001 || /params error|param error|invalid parameters/i.test(rawMsg)) {
    if (/minAmount|maxAmount/i.test(rawMsg)) {
      return 'Parameter Error (Code 10001): Minimum trade limit cannot be greater than maximum trade limit.';
    }
    if (/price/i.test(rawMsg)) {
      return 'Parameter Error (Code 10001): Advertisement price must be a positive number.';
    }
    return `Parameter Error (Code 10001): ${rawMsg}`;
  }
  if (code === 10002 || /request expired/i.test(rawMsg)) {
    return 'Bybit API request expired (Code 10002). Please verify your system clock is accurate.';
  }
  if (code === 10003 || /api_?key is invalid/i.test(rawMsg)) {
    return 'Unauthorized: Bybit API Key is invalid or does not exist. Please check your Bybit API Key in Settings.';
  }
  if (code === 10004 || /error sign/i.test(rawMsg)) {
    return 'Bybit API Signature error: API Secret mismatch. Please check your Bybit API Secret in Settings.';
  }
  if (code === 10005 || /permission denied/i.test(rawMsg)) {
    return 'Permission denied (Code 10005): Direct ad modification requires approved Bybit P2P Merchant status and a Read-Write API key with P2P permissions enabled in Bybit API management.';
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

/**
 * Normalizes advertisement update payload to Bybit Open API V5 specification.
 * Formats id, actionType, price, minAmount, maxAmount as strings per spec.
 */
export function normalizeAdUpdatePayload(data = {}) {
  if (!data || typeof data !== 'object') return {};
  const adId = data.id || data.itemId;
  const payload = {
    id: String(adId !== undefined && adId !== null ? adId : '').trim(),
    actionType: data.actionType || 'MODIFY'
  };
  if (data.price !== undefined && data.price !== null) {
    payload.price = String(data.price);
  }
  if (data.minAmount !== undefined && data.minAmount !== null) {
    payload.minAmount = String(data.minAmount);
  }
  if (data.maxAmount !== undefined && data.maxAmount !== null) {
    payload.maxAmount = String(data.maxAmount);
  }
  if (data.priceType !== undefined && data.priceType !== null) {
    payload.priceType = Number(data.priceType);
  }
  if (data.quantity !== undefined && data.quantity !== null && String(data.quantity).trim() !== '') {
    payload.quantity = String(data.quantity);
  }
  if (data.paymentPeriod !== undefined && data.paymentPeriod !== null && String(data.paymentPeriod).trim() !== '') {
    payload.paymentPeriod = String(data.paymentPeriod);
  }
  if (Array.isArray(data.paymentIds)) {
    payload.paymentIds = data.paymentIds.map(String);
  }
  if (data.remark !== undefined && data.remark !== null) {
    payload.remark = String(data.remark);
  }
  return payload;
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
  },

  /**
   * Helper function attached to bybitService for payload normalization
   */
  normalizeAdUpdatePayload,

  /**
   * Format Bybit API error messages for user presentation
   */
  formatBybitErrorMessage,

  /**
   * Check Bybit P2P ad editing capability and order immutability status
   * @returns {Promise<{ supported: boolean, canEditAds: boolean, ordersImmutable: boolean, endpoint: string, reason: string }>}
   */
  async checkAdEditCapability() {
    return {
      supported: true,
      canEditAds: true,
      ordersImmutable: true,
      endpoint: '/v5/p2p/item/update',
      reason: 'Bybit V5 P2P API supports editing active advertisements via /v5/p2p/item/update for verified P2P merchants with Read-Write API keys. Active matched trade orders cannot be edited once placed.'
    };
  },

  /**
   * Update an active P2P advertisement (price, trade limits, quantity)
   * Dispatches POST to /api/ads/update via the local proxy
   *
   * @param {Object} adData - Ad data { id|itemId, price, minAmount, maxAmount, quantity?, actionType? }
   * @returns {Promise<{ success: boolean, retCode: number, retMsg: string, data?: any, error?: string, isPermissionDenied?: boolean, guidanceMessage?: string }>}
   */
  async updateAd(adData) {
    if (!adData || typeof adData !== 'object') {
      const errMsg = 'Invalid ad data: payload must be a non-null object';
      return {
        success: false,
        retCode: 10001,
        retMsg: errMsg,
        error: errMsg,
        isPermissionDenied: false,
        guidanceMessage: errMsg,
        data: null
      };
    }

    const adId = adData.id || adData.itemId;
    if (!adId) {
      const errMsg = 'Missing ad ID: id or itemId is required to update an advertisement';
      return {
        success: false,
        retCode: 10001,
        retMsg: errMsg,
        error: errMsg,
        isPermissionDenied: false,
        guidanceMessage: errMsg,
        data: null
      };
    }

    // Client-side limits validation
    if (adData.minAmount !== undefined && adData.maxAmount !== undefined) {
      const minNum = Number(adData.minAmount);
      const maxNum = Number(adData.maxAmount);
      if (!isNaN(minNum) && !isNaN(maxNum) && minNum > maxNum) {
        const errMsg = 'Validation error (Code 10001): minAmount cannot be greater than maxAmount';
        return {
          success: false,
          retCode: 10001,
          retMsg: errMsg,
          error: errMsg,
          isPermissionDenied: false,
          guidanceMessage: errMsg,
          data: null
        };
      }
    }

    if (adData.price !== undefined) {
      const priceNum = Number(adData.price);
      if (!isNaN(priceNum) && priceNum <= 0) {
        const errMsg = 'Validation error (Code 10001): price must be positive';
        return {
          success: false,
          retCode: 10001,
          retMsg: errMsg,
          error: errMsg,
          isPermissionDenied: false,
          guidanceMessage: errMsg,
          data: null
        };
      }
    }

    try {
      const baseUrl = getProxyUrl();
      const payload = {
        ...adData,
        id: String(adId),
        actionType: adData.actionType || 'MODIFY'
      };

      const response = await fetch(`${baseUrl}/api/ads/update`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });

      let data;
      try {
        data = await response.json();
      } catch {
        data = { retCode: response.status, retMsg: `HTTP ${response.status} ${response.statusText}` };
      }

      const retCode = Number(data?.retCode ?? data?.ret_code ?? (response.ok ? 0 : response.status));
      const rawMsg = data?.retMsg || data?.ret_msg || data?.message || (response.ok ? 'success' : `HTTP ${response.status}`);
      const formattedMsg = formatBybitErrorMessage(data, rawMsg);
      const isPermissionDenied = retCode === 10005 || /permission denied/i.test(formattedMsg);
      const guidanceMessage = isPermissionDenied
        ? 'Direct ad update is restricted to approved Bybit P2P Merchants. Use Bybit Merchant Portal.'
        : formattedMsg;

      const isSuccess = retCode === 0 && response.ok;

      return {
        success: isSuccess,
        retCode,
        retMsg: formattedMsg,
        error: isSuccess ? undefined : formattedMsg,
        isPermissionDenied,
        guidanceMessage,
        data: data?.result !== undefined ? data.result : data
      };
    } catch (e) {
      const errMsg = e.message || 'Network request failed: Bybit proxy is unreachable';
      return {
        success: false,
        retCode: -1,
        retMsg: errMsg,
        error: errMsg,
        isPermissionDenied: false,
        guidanceMessage: errMsg,
        data: null
      };
    }
  },

  /**
   * Attempt to modify an active trade order
   * Protocol contract: Active matched P2P trade orders are locked in escrow and immutable.
   *
   * @param {string} orderId
   * @param {Object} [orderData=null]
   * @returns {Promise<{ success: false, retCode: 10001, error: 'IMMUTABLE_ORDER', message: string, retMsg: string }>}
   */
  async updateOrder(orderId, orderData = null) {
    const message = 'Active matched trade orders cannot be edited once placed in escrow';
    return {
      success: false,
      retCode: 10001,
      error: 'IMMUTABLE_ORDER',
      retMsg: message,
      message
    };
  }
};
