const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
// Serve frontend static files directly
app.use(express.static(__dirname));

// Bybit API configuration from environment variables
const API_KEY = process.env.BYBIT_API_KEY;
const API_SECRET = process.env.BYBIT_API_SECRET;
const TESTNET = process.env.BYBIT_TESTNET === 'true';

// Candidate Base URLs in order of preference
const BASE_URL_CANDIDATES = TESTNET
  ? ['https://api-testnet.bybit.com']
  : [
      process.env.BYBIT_BASE_URL,
      'https://api.bybitglobal.com',
      'https://api.bytick.com',
      'https://api.bybit.com'
    ].filter(Boolean);

/**
 * Generate Bybit API Signature (HMAC_SHA256)
 * Rule: timestamp + api_key + recv_window + (queryString OR jsonBodyString)
 */
function generateSignature(timestamp, apiKey, apiSecret, recvWindow, paramsString = '') {
  const preSignString = timestamp + apiKey + recvWindow + paramsString;
  return crypto
    .createHmac('sha256', apiSecret)
    .update(preSignString)
    .digest('hex');
}

/**
 * Common Headers Generator
 */
function getBybitHeaders(timestamp, recvWindow, signature) {
  return {
    'X-BAPI-API-KEY': API_KEY,
    'X-BAPI-TIMESTAMP': timestamp.toString(),
    'X-BAPI-SIGN': signature,
    'X-BAPI-RECV-WINDOW': recvWindow.toString(),
    'Content-Type': 'application/json'
  };
}

/**
 * Execute request across available Bybit domain candidates with automatic failover
 */
async function executeWithFailover(method, endpointPath, paramsString, payload = null) {
  const timestamp = Date.now();
  const recvWindow = 5000;
  const signature = generateSignature(timestamp, API_KEY, API_SECRET, recvWindow, paramsString);
  const headers = getBybitHeaders(timestamp, recvWindow, signature);

  let lastError = null;

  for (const baseUrl of BASE_URL_CANDIDATES) {
    const fullUrl = `${baseUrl}${endpointPath}`;
    try {
      console.log(`[Proxy] Trying Bybit endpoint: ${fullUrl}`);
      if (method.toUpperCase() === 'GET') {
        return await axios.get(fullUrl, { headers, timeout: 8000 });
      } else {
        return await axios.post(fullUrl, payload, { headers, timeout: 8000 });
      }
    } catch (err) {
      lastError = err;
      const isNetworkOrDnsError = err.code === 'ENOTFOUND' || err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || !err.response;
      if (isNetworkOrDnsError) {
        console.warn(`[Proxy] Domain ${baseUrl} unreachable (${err.code || err.message}). Trying next candidate...`);
        continue;
      }
      // If Bybit responded with an API error code (e.g. 401, 403, 10002), don't retry other domains as credentials apply globally
      throw err;
    }
  }

  throw lastError;
}

/**
 * Endpoint to check if Proxy is alive and credentials are configured
 */
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    testnet: TESTNET,
    candidates: BASE_URL_CANDIDATES,
    apiKeyConfigured: !!API_KEY,
    apiSecretConfigured: !!API_SECRET
  });
});

/**
 * Route: Get Funding (P2P) Coin Balance
 * Proxies: GET /v5/asset/transfer/query-account-coins-balance
 */
app.get('/api/balance', async (req, res) => {
  if (!API_KEY || !API_SECRET) {
    return res.status(500).json({ retCode: -1, retMsg: 'Bybit API credentials not configured in proxy .env file' });
  }

  try {
    const coin = req.query.coin || 'USDT';
    const accountType = req.query.accountType || 'FUND';

    // 1. Fetch free/available balance in Funding Wallet
    const queryString = `accountType=${accountType}&coin=${coin}`;
    const balanceEndpoint = `/v5/asset/transfer/query-account-coins-balance?${queryString}`;
    let freeBalance = 0;
    let rawBalanceData = null;

    try {
      const balanceRes = await executeWithFailover('GET', balanceEndpoint, queryString);
      rawBalanceData = balanceRes.data;
      if (rawBalanceData?.result?.balance) {
        const item = rawBalanceData.result.balance.find(b => b.coin === coin) || rawBalanceData.result.balance[0];
        freeBalance = parseFloat(item?.transferBalance ?? item?.walletBalance ?? 0) || 0;
      }
    } catch (balErr) {
      console.warn('[Proxy] Wallet balance query warning:', balErr.message);
    }

    // 2. Fetch coins locked in Active P2P Sell Ads (POST /v5/p2p/item/personal/list)
    let lockedInAds = 0;
    let activeAdsList = [];

    try {
      const adPayload = { side: '1', tokenId: coin };
      const adJsonString = JSON.stringify(adPayload);
      const adEndpoint = `/v5/p2p/item/personal/list`;

      const adRes = await executeWithFailover('POST', adEndpoint, adJsonString, adPayload);
      const adData = adRes.data;

      if (adData?.result?.items && Array.isArray(adData.result.items)) {
        adData.result.items.forEach(ad => {
          const status = Number(ad.status);
          const isSell = Number(ad.side) === 1;
          if (isSell && status !== 30) {
            const lastQty = parseFloat(ad.lastQuantity) || 0;
            const frozenQty = parseFloat(ad.frozenQuantity) || 0;
            const adTotal = lastQty + frozenQty;
            lockedInAds += adTotal;

            activeAdsList.push({
              id: ad.id,
              price: ad.price,
              lastQuantity: lastQty,
              frozenQuantity: frozenQty,
              totalInAd: adTotal,
              status: ad.status
            });
          }
        });
      }
    } catch (adErr) {
      console.warn('[Proxy] Active Ads query warning:', adErr.message);
    }

    const totalBalance = freeBalance + lockedInAds;

    res.json({
      retCode: 0,
      retMsg: 'SUCCESS',
      result: {
        coin,
        freeBalance,
        lockedInAds,
        totalBalance,
        activeAds: activeAdsList,
        rawBalance: rawBalanceData?.result
      }
    });
  } catch (error) {
    console.error('[Proxy] Error fetching balance:', error.response?.data || error.message);
    const statusCode = error.response ? error.response.status : 500;
    const errorData = error.response ? error.response.data : { retCode: -1, retMsg: error.message };
    res.status(statusCode).json(errorData);
  }
});

/**
 * Route: Get P2P Order List (History)
 * Proxies: POST /v5/p2p/order/simplifyList
 */
app.post('/api/orders', async (req, res) => {
  if (!API_KEY || !API_SECRET) {
    return res.status(500).json({ retCode: -1, retMsg: 'Bybit API credentials not configured in proxy .env file' });
  }

  try {
    const {
      page = 1,
      size = 30,
      status = null,
      side = null,
      tokenId = null,
      beginTime = null,
      endTime = null
    } = req.body || {};

    const payload = {
      page: Number(page),
      size: Number(size)
    };

    if (status !== null && status !== undefined && status !== '') payload.status = Number(status);
    if (side !== null && side !== undefined && side !== '') payload.side = Number(side);
    if (tokenId) payload.tokenId = tokenId;
    if (beginTime) payload.beginTime = String(beginTime);
    if (endTime) payload.endTime = String(endTime);

    const jsonBodyString = JSON.stringify(payload);
    const endpointPath = `/v5/p2p/order/simplifyList`;

    const response = await executeWithFailover('POST', endpointPath, jsonBodyString, payload);
    res.json(response.data);
  } catch (error) {
    console.error('[Proxy] Error fetching P2P orders:', error.response?.data || error.message);
    const statusCode = error.response ? error.response.status : 500;
    const errorData = error.response ? error.response.data : { retCode: -1, retMsg: error.message };
    res.status(statusCode).json(errorData);
  }
});

/**
 * Route: Get Active P2P Advertisements
 * Proxies: POST /v5/p2p/item/personal/list
 */
app.all('/api/ads', async (req, res) => {
  if (!API_KEY || !API_SECRET) {
    return res.status(500).json({ retCode: -1, retMsg: 'Bybit API credentials not configured in proxy .env file' });
  }

  try {
    const payload = {
      side: '1', // 1 is SELL ad
      tokenId: 'USDT',
      page: '1',
      size: '10'
    };

    const jsonBodyString = JSON.stringify(payload);
    const endpointPath = `/v5/p2p/item/personal/list`;

    const response = await executeWithFailover('POST', endpointPath, jsonBodyString, payload);
    res.json(response.data);
  } catch (error) {
    console.error('[Proxy] Error fetching active ads:', error.response?.data || error.message);
    const statusCode = error.response ? error.response.status : 500;
    const errorData = error.response ? error.response.data : { retCode: -1, retMsg: error.message };
    res.status(statusCode).json(errorData);
  }
});

app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`🚀 Bybit P2P Tracker Proxy Running on http://localhost:${PORT}`);
  console.log(`🔧 Mode: ${TESTNET ? 'TESTNET' : 'MAINNET'}`);
  console.log(`🌐 Primary Domain: ${BASE_URL_CANDIDATES[0]}`);
  console.log(`🔄 Failover Domains: ${BASE_URL_CANDIDATES.slice(1).join(', ')}`);
  console.log(`🔑 Credentials Configured: API Key = ${API_KEY ? 'YES' : 'NO'}, API Secret = ${API_SECRET ? 'YES' : 'NO'}`);
  console.log(`=================================================`);
});
