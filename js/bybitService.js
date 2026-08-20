/**
 * Frontend Service: Bybit P2P Integration Client
 * Interacts with the local Node.js proxy server to get balances and sync history.
 */

const PROXY_URL = 'http://localhost:3000';

export const bybitService = {
  /**
   * Check if the local proxy server is running and configured
   */
  async checkStatus() {
    try {
      const response = await fetch(`${PROXY_URL}/api/status`);
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
      const response = await fetch(`${PROXY_URL}/api/balance?coin=${coin}&accountType=FUND`);
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
      const payload = {
        page: Number(page),
        size: Number(size)
      };
      if (status !== null) {
        payload.status = Number(status);
      }

      const response = await fetch(`${PROXY_URL}/api/orders`, {
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
  }
};
