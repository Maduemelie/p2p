const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-proxy-token', 'x-api-token', 'x-auth-token']
}));
app.use(express.json());
// Serve frontend static files directly
app.use(express.static(__dirname));

// Bybit API configuration from environment variables
const API_KEY = process.env.BYBIT_API_KEY;
const API_SECRET = process.env.BYBIT_API_SECRET;
const TESTNET = process.env.BYBIT_TESTNET === 'true';
const PROXY_AUTH_TOKEN = process.env.PROXY_AUTH_TOKEN || process.env.BYBIT_PROXY_TOKEN || process.env.AUTH_TOKEN;

function verifyToken(providedToken, expectedToken) {
  if (!providedToken || !expectedToken) return false;
  const bufA = Buffer.from(String(providedToken));
  const bufB = Buffer.from(String(expectedToken));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function extractToken(req) {
  const getHeader = (name) => {
    if (req.headers) {
      return req.headers[name.toLowerCase()] || req.headers[name];
    }
    if (typeof req.get === 'function') {
      return req.get(name);
    }
    return undefined;
  };

  const authHeader = getHeader('authorization');
  if (authHeader && typeof authHeader === 'string') {
    const trimmed = authHeader.trim();
    const bearerMatch = trimmed.match(/^Bearer\s+(.+)$/i);
    if (bearerMatch) {
      const t = bearerMatch[1].trim();
      if (t) return t;
    } else if (!/^[a-zA-Z]+\s+/.test(trimmed)) {
      if (trimmed) return trimmed;
    } else {
      return null;
    }
  }

  const customHeader = getHeader('x-proxy-token') || getHeader('x-api-token') || getHeader('x-auth-token');
  if (customHeader && typeof customHeader === 'string' && customHeader.trim()) {
    return customHeader.trim();
  }

  if (req.query && req.query.token && typeof req.query.token === 'string' && req.query.token.trim()) {
    return req.query.token.trim();
  }

  if (req.body) {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) {}
    }
    if (body && typeof body === 'object' && body.token && typeof body.token === 'string' && body.token.trim()) {
      return body.token.trim();
    }
  }

  return null;
}

function validateAuth(req, res, next) {
  if (req.method === 'OPTIONS') {
    return next();
  }

  const expectedToken = process.env.PROXY_AUTH_TOKEN || process.env.BYBIT_PROXY_TOKEN || process.env.AUTH_TOKEN || PROXY_AUTH_TOKEN;
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({
      retCode: 401,
      retMsg: 'Unauthorized: Invalid or missing proxy authorization token'
    });
  }

  if (expectedToken && !verifyToken(token, expectedToken)) {
    return res.status(401).json({
      retCode: 401,
      retMsg: 'Unauthorized: Invalid or missing proxy authorization token'
    });
  }

  next();
}

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
  const currentProxyToken = process.env.PROXY_AUTH_TOKEN || process.env.BYBIT_PROXY_TOKEN || process.env.AUTH_TOKEN || PROXY_AUTH_TOKEN;
  res.json({
    status: 'online',
    testnet: TESTNET,
    candidates: BASE_URL_CANDIDATES,
    apiKeyConfigured: !!API_KEY,
    apiSecretConfigured: !!API_SECRET,
    authRequired: !!currentProxyToken
  });
});

// Protect Bybit Proxy Endpoints with Token Authorization Middleware
app.use('/api/balance', validateAuth);
app.use('/api/orders', validateAuth);
app.use('/api/ads', validateAuth);
app.use('/api/market-depth', validateAuth);

/**
 * Route: Get Funding (P2P) Coin Balance
 * Proxies: GET /v5/asset/transfer/query-account-coins-balance
 */
app.all('/api/balance', async (req, res) => {
  if (!API_KEY || !API_SECRET) {
    return res.status(500).json({ retCode: -1, retMsg: 'Bybit API credentials not configured in proxy .env file' });
  }

  try {
    const coin = req.query.coin || req.body?.coin || 'USDT';
    const accountType = req.query.accountType || req.body?.accountType || 'FUND';

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
      const adEndpoint = `/v5/p2p/item/personal/list`;

      const extractAdItems = (data) => {
        if (!data) return [];
        if (Array.isArray(data)) return data;
        if (Array.isArray(data.result)) return data.result;
        if (data.result && typeof data.result === 'object') {
          if (Array.isArray(data.result.items)) return data.result.items;
          if (Array.isArray(data.result.list)) return data.result.list;
          if (Array.isArray(data.result.data)) return data.result.data;
          if (Array.isArray(data.result.rows)) return data.result.rows;
          if (Array.isArray(data.result.records)) return data.result.records;
          if (Array.isArray(data.result.itemList)) return data.result.itemList;
        }
        if (Array.isArray(data.items)) return data.items;
        if (Array.isArray(data.list)) return data.list;
        return [];
      };

      const isSellSide = (ad) => {
        if (!ad) return false;
        const raw = (ad.side !== undefined && ad.side !== null) ? ad.side : (ad.tradeType ?? ad.sideName ?? ad.type ?? ad.action ?? '');
        const s = String(raw).trim().toUpperCase();
        return s === '1' || s === 'SELL';
      };

      const isOnlineAd = (status) => {
        if (status === undefined || status === null) return false;
        const s = String(status).trim().toUpperCase();
        return s === '10' || s === '1' || s === 'ONLINE' || s === 'ACTIVE';
      };

      // Query both string side '1' and integer side 1 concurrently for maximum compatibility
      const [adResStr, adResNum] = await Promise.all([
        executeWithFailover('POST', adEndpoint, JSON.stringify({ side: '1', tokenId: coin }), { side: '1', tokenId: coin }).catch(() => null),
        executeWithFailover('POST', adEndpoint, JSON.stringify({ side: 1, tokenId: coin }), { side: 1, tokenId: coin }).catch(() => null)
      ]);

      const itemsStr = adResStr ? extractAdItems(adResStr.data) : [];
      const itemsNum = adResNum ? extractAdItems(adResNum.data) : [];

      const map = new Map();
      [...itemsStr, ...itemsNum].forEach((item, index) => {
        if (!item || typeof item !== 'object') return;
        const id = item.id || item.itemId || item.adId || item.advId || item.idStr || `ad_bal_${index}`;
        if (!item.id) item.id = id;
        map.set(String(id), item);
      });

      map.forEach(ad => {
        if (isSellSide(ad) && isOnlineAd(ad.status)) {
          const lastQty = parseFloat(String(ad.lastQuantity ?? ad.quantity ?? 0).replace(/,/g, '')) || 0;
          const frozenQty = parseFloat(String(ad.frozenQuantity ?? 0).replace(/,/g, '')) || 0;
          const adTotal = lastQty + frozenQty;
          lockedInAds += adTotal;

          activeAdsList.push({
            id: ad.id || ad.itemId || ad.adId || ad.advId || ad.idStr || '',
            price: ad.price,
            lastQuantity: lastQty,
            frozenQuantity: frozenQty,
            totalInAd: adTotal,
            status: ad.status
          });
        }
      });
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
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  if (!API_KEY || !API_SECRET) {
    return res.status(500).json({ retCode: -1, retMsg: 'Bybit API credentials not configured in proxy .env file' });
  }

  try {
    const extractItems = (data) => {
      if (!data) return [];
      if (Array.isArray(data)) return data;
      if (Array.isArray(data.result)) return data.result;
      if (data.result && typeof data.result === 'object') {
        if (Array.isArray(data.result.items)) return data.result.items;
        if (Array.isArray(data.result.list)) return data.result.list;
        if (Array.isArray(data.result.data)) return data.result.data;
        if (Array.isArray(data.result.rows)) return data.result.rows;
        if (Array.isArray(data.result.records)) return data.result.records;
        if (Array.isArray(data.result.itemList)) return data.result.itemList;
      }
      if (Array.isArray(data.items)) return data.items;
      if (Array.isArray(data.list)) return data.list;
      return [];
    };

    const fetchAdsWithPayload = async (payload) => {
      try {
        const jsonBodyString = JSON.stringify(payload);
        const endpointPath = `/v5/p2p/item/personal/list`;
        const response = await executeWithFailover('POST', endpointPath, jsonBodyString, payload);
        const data = response.data;
        let items = extractItems(data);

        // Auto-paginate when caller did not explicitly request a specific page and more items exist
        const isDefaultPage = (!req.query?.page && !req.body?.page) || payload.page === 1 || payload.page === '1';
        const pageSize = Number(payload.size || 30);
        const totalCount = Number(data?.result?.count || data?.result?.total || data?.result?.totalNumber || data?.result?.totalCount || data?.result?.total_count || 0);

        if (isDefaultPage && ((totalCount > items.length && items.length > 0) || items.length === pageSize)) {
          const maxPages = totalCount > 0 ? Math.min(Math.ceil(totalCount / pageSize), 5) : 3;
          for (let p = 2; p <= maxPages; p++) {
            try {
              const nextPagePayload = {
                ...payload,
                page: typeof payload.page === 'number' ? p : String(p)
              };
              const nextJson = JSON.stringify(nextPagePayload);
              const nextRes = await executeWithFailover('POST', endpointPath, nextJson, nextPagePayload);
              const nextItems = extractItems(nextRes.data);
              if (!nextItems || nextItems.length === 0) break;
              items = items.concat(nextItems);
              if (nextItems.length < pageSize) break;
            } catch (pageErr) {
              console.warn(`[Proxy] Pagination page ${p} warning:`, pageErr.message);
              break;
            }
          }
        }

        return items;
      } catch (e) {
        return [];
      }
    };

    const tokenId = req.query?.tokenId || req.body?.tokenId || 'USDT';
    const requestedSide = req.query?.side !== undefined && req.query?.side !== null && String(req.query.side).trim() !== ''
      ? String(req.query.side).trim()
      : (req.body?.side !== undefined && req.body?.side !== null && String(req.body?.side).trim() !== '' ? String(req.body?.side).trim() : null);

    const page = String(req.query?.page || req.body?.page || '1');
    const size = String(req.query?.size || req.body?.size || '30');

    let combinedItems = [];

    const addItemsToMap = (map, items) => {
      if (!Array.isArray(items)) return;
      items.forEach((item, index) => {
        if (!item || typeof item !== 'object') return;
        const id = item.id || item.itemId || item.adId || item.advId || item.idStr || `ad_auto_${index}_${Date.now()}`;
        if (!item.id) item.id = id;
        map.set(String(id), item);
      });
    };

    if (requestedSide === '0' || requestedSide === 'BUY' || requestedSide === 'buy') {
      // User specifically requested Buy Ads
      const [strRes, numRes] = await Promise.all([
        fetchAdsWithPayload({ side: '0', tokenId, page, size }),
        fetchAdsWithPayload({ side: 0, tokenId, page: Number(page), size: Number(size) })
      ]);
      const map = new Map();
      addItemsToMap(map, [...strRes, ...numRes]);
      combinedItems = Array.from(map.values());
    } else if (requestedSide === '1' || requestedSide === 'SELL' || requestedSide === 'sell') {
      // User specifically requested Sell Ads
      const [strRes, numRes] = await Promise.all([
        fetchAdsWithPayload({ side: '1', tokenId, page, size }),
        fetchAdsWithPayload({ side: 1, tokenId, page: Number(page), size: Number(size) })
      ]);
      const map = new Map();
      addItemsToMap(map, [...strRes, ...numRes]);
      combinedItems = Array.from(map.values());
    } else {
      // Fetch both Buy ads and Sell ads, as well as without side filter
      const [allAds, side0Str, side0Num, side1Str, side1Num] = await Promise.all([
        fetchAdsWithPayload({ tokenId, page, size }),
        fetchAdsWithPayload({ side: '0', tokenId, page, size }),
        fetchAdsWithPayload({ side: 0, tokenId, page: Number(page), size: Number(size) }),
        fetchAdsWithPayload({ side: '1', tokenId, page, size }),
        fetchAdsWithPayload({ side: 1, tokenId, page: Number(page), size: Number(size) })
      ]);

      const map = new Map();
      addItemsToMap(map, [...allAds, ...side0Str, ...side0Num, ...side1Str, ...side1Num]);
      combinedItems = Array.from(map.values());
    }

    res.json({
      retCode: 0,
      retMsg: 'SUCCESS',
      result: {
        items: combinedItems,
        count: combinedItems.length
      }
    });
  } catch (error) {
    console.error('[Proxy] Error fetching active ads:', error.response?.data || error.message);
    const statusCode = error.response ? error.response.status : 500;
    const errorData = error.response ? error.response.data : { retCode: -1, retMsg: error.message };
    res.status(statusCode).json(errorData);
  }
});

/**
 * Route: Get Market P2P Depth (Order Book)
 * Proxies: POST /v5/p2p/item/online (concurrently for side 0 and 1)
 *
 * Bybit P2P Side Conventions for /v5/p2p/item/online (Public Market Depth):
 * The public orderbook API is formulated from the Taker's (retail user's) perspective:
 * - side: '1' (Taker Sells) -> Returns merchant BUY advertisements (Market Bids / buyDepth).
 * - side: '0' (Taker Buys)  -> Returns merchant SELL advertisements (Market Asks / sellDepth).
 *
 * In contrast, Merchant Personal Ads (/v5/p2p/item/personal/list) are from the Merchant's perspective:
 * - side: 0 -> Merchant Buy Ad
 * - side: 1 -> Merchant Sell Ad
 */
app.all('/api/market-depth', async (req, res) => {
  if (!API_KEY || !API_SECRET) {
    return res.status(500).json({ retCode: -1, retMsg: 'Bybit API credentials not configured in proxy .env file' });
  }

  try {
    const extractItems = (data) => {
      if (!data) return [];
      if (Array.isArray(data)) return data;
      if (Array.isArray(data.result)) return data.result;
      if (data.result && typeof data.result === 'object') {
        if (Array.isArray(data.result.items)) return data.result.items;
        if (Array.isArray(data.result.list)) return data.result.list;
        if (Array.isArray(data.result.data)) return data.result.data;
        if (Array.isArray(data.result.rows)) return data.result.rows;
        if (Array.isArray(data.result.records)) return data.result.records;
        if (Array.isArray(data.result.itemList)) return data.result.itemList;
      }
      if (Array.isArray(data.items)) return data.items;
      if (Array.isArray(data.list)) return data.list;
      return [];
    };

    const coin = req.query?.coin || req.body?.coin || 'USDT';
    const fiat = req.query?.fiat || req.body?.fiat || 'NGN';
    const limit = req.query?.limit || req.body?.limit || '5';

    // Build Buy side: Merchants buying USDT -> side: '0' -> buyDepth (bids)
    const buyPayload = {
      tokenId: coin,
      currencyId: fiat,
      side: '0',
      page: '1',
      size: String(limit)
    };

    // Build Sell side: Merchants selling USDT -> side: '1' -> sellDepth (asks)
    const sellPayload = {
      tokenId: coin,
      currencyId: fiat,
      side: '1',
      page: '1',
      size: String(limit)
    };

    const buyParamsString = JSON.stringify(buyPayload);
    const sellParamsString = JSON.stringify(sellPayload);

    const [buyRes, sellRes] = await Promise.all([
      executeWithFailover('POST', '/v5/p2p/item/online', buyParamsString, buyPayload),
      executeWithFailover('POST', '/v5/p2p/item/online', sellParamsString, sellPayload)
    ]);

    res.json({
      retCode: 0,
      retMsg: 'SUCCESS',
      result: {
        coin,
        fiat,
        buyDepth: extractItems(buyRes.data),
        sellDepth: extractItems(sellRes.data)
      }
    });
  } catch (error) {
    console.error('[Proxy] Error fetching market depth:', error.response?.data || error.message);
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
