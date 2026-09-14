const crypto = require('crypto');
const axios = require('axios');

const API_KEY = process.env.BYBIT_API_KEY;
const API_SECRET = process.env.BYBIT_API_SECRET;
const TESTNET = process.env.BYBIT_TESTNET === 'true';

const BASE_URL_CANDIDATES = TESTNET
  ? ['https://api-testnet.bybit.com']
  : [
      process.env.BYBIT_BASE_URL,
      'https://api.bybitglobal.com',
      'https://api.bytick.com',
      'https://api.bybit.com'
    ].filter(Boolean);

function sanitizeKey(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '').trim();
}

function getHeader(req, name) {
  if (!req) return undefined;
  if (typeof req.get === 'function') {
    const val = req.get(name);
    if (val !== undefined) return val;
  }
  if (req.headers && typeof req.headers === 'object') {
    const lowerName = name.toLowerCase();
    if (req.headers[lowerName] !== undefined) return req.headers[lowerName];
    if (req.headers[name] !== undefined) return req.headers[name];
    const foundKey = Object.keys(req.headers).find(k => k.toLowerCase() === lowerName);
    if (foundKey) return req.headers[foundKey];
  }
  return undefined;
}

function generateSignature(timestamp, apiKey, apiSecret, recvWindow, paramsString = '') {
  const preSignString = timestamp + apiKey + recvWindow + paramsString;
  return crypto
    .createHmac('sha256', apiSecret)
    .update(preSignString)
    .digest('hex');
}

function getBybitHeaders(timestamp, recvWindow, signature, apiKey = (process.env.BYBIT_API_KEY || API_KEY)) {
  return {
    'X-BAPI-API-KEY': apiKey,
    'X-BAPI-TIMESTAMP': timestamp.toString(),
    'X-BAPI-SIGN': signature,
    'X-BAPI-RECV-WINDOW': recvWindow.toString(),
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  };
}

async function executeWithFailover(method, endpointPath, paramsString, payload = null, credentials = null) {
  let activeKey = '';
  let activeSecret = '';

  if (credentials && (credentials.apiKey !== undefined || credentials.apiSecret !== undefined)) {
    activeKey = sanitizeKey(credentials.apiKey);
    activeSecret = sanitizeKey(credentials.apiSecret);
  } else {
    activeKey = sanitizeKey(process.env.BYBIT_API_KEY || API_KEY || '');
    activeSecret = sanitizeKey(process.env.BYBIT_API_SECRET || API_SECRET || '');
  }

  if (!activeKey || !activeSecret) {
    throw new Error('Bybit API credentials incomplete: both API key and secret are required to execute signed requests');
  }

  const timestamp = Date.now();
  const recvWindow = 5000;
  const signature = generateSignature(timestamp, activeKey, activeSecret, recvWindow, paramsString);
  const headers = getBybitHeaders(timestamp, recvWindow, signature, activeKey);

  const REQUEST_TIMEOUT = parseInt(process.env.BYBIT_TIMEOUT_MS, 10) || 5000;
  let lastError = null;

  for (const baseUrl of BASE_URL_CANDIDATES) {
    const cleanPath = endpointPath.trim().replace(/^\/+/, '/');
    const fullUrl = `${baseUrl}${cleanPath}`;
    try {
      const upperMethod = method.toUpperCase();
      if (upperMethod === 'GET') {
        return await axios.get(fullUrl, { headers, timeout: REQUEST_TIMEOUT });
      } else if (upperMethod === 'POST') {
        return await axios.post(fullUrl, payload, { headers, timeout: REQUEST_TIMEOUT });
      } else if (upperMethod === 'PUT') {
        return await axios.put(fullUrl, payload, { headers, timeout: REQUEST_TIMEOUT });
      } else if (upperMethod === 'DELETE') {
        return await axios.delete(fullUrl, { headers, data: payload, timeout: REQUEST_TIMEOUT });
      } else {
        return await axios({ method: upperMethod, url: fullUrl, headers, data: payload, timeout: REQUEST_TIMEOUT });
      }
    } catch (err) {
      lastError = err;
      const isNetworkOrDnsError = err.code === 'ENOTFOUND' || err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || !err.response;
      if (isNetworkOrDnsError) {
        console.warn(`[Vercel Serverless] Domain ${baseUrl} failed (${err.code || err.message}). Retrying next candidate...`);
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}

const PROXY_AUTH_TOKEN = process.env.PROXY_AUTH_TOKEN || process.env.BYBIT_PROXY_TOKEN || process.env.AUTH_TOKEN;

function verifyToken(providedToken, expectedToken) {
  if (!providedToken || !expectedToken) return false;
  const bufA = Buffer.from(String(providedToken));
  const bufB = Buffer.from(String(expectedToken));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function extractToken(req) {
  const authHeader = getHeader(req, 'authorization');
  if (authHeader && typeof authHeader === 'string') {
    const trimmed = authHeader.trim();
    const bearerMatch = trimmed.match(/^Bearer\s+(.+)$/i);
    if (bearerMatch) {
      const t = bearerMatch[1].trim();
      if (t) return t;
    } else if (trimmed.toLowerCase() === 'bearer') {
      return null;
    } else if (!/^[a-zA-Z]+\s+/.test(trimmed)) {
      if (trimmed) return trimmed;
    } else {
      return null;
    }
  }

  const customHeader = getHeader(req, 'x-proxy-token') || getHeader(req, 'x-api-token') || getHeader(req, 'x-auth-token');
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

function getCredentials(req) {
  const rawApiKey = getHeader(req, 'x-bybit-api-key');
  const rawApiSecret = getHeader(req, 'x-bybit-api-secret');

  const headerApiKey = sanitizeKey(rawApiKey);
  const headerApiSecret = sanitizeKey(rawApiSecret);

  // Multi-tenant: If request provided client API credentials, use them atomically without cross-contaminating from server env
  if (headerApiKey || headerApiSecret) {
    return {
      apiKey: headerApiKey,
      apiSecret: headerApiSecret,
      isClientProvided: true
    };
  }

  // Single-tenant fallback: Use server-side environment variables
  return {
    apiKey: sanitizeKey(process.env.BYBIT_API_KEY || API_KEY || ''),
    apiSecret: sanitizeKey(process.env.BYBIT_API_SECRET || API_SECRET || ''),
    isClientProvided: false
  };
}

function verifyAuth(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-proxy-token, x-api-token, x-auth-token, x-bybit-api-key, x-bybit-api-secret, x-bybit-endpoint');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return false;
  }

  const currentExpectedToken = process.env.PROXY_AUTH_TOKEN || process.env.BYBIT_PROXY_TOKEN || process.env.AUTH_TOKEN || PROXY_AUTH_TOKEN;
  const token = extractToken(req);

  const rawClientApiKey = getHeader(req, 'x-bybit-api-key');
  const rawClientApiSecret = getHeader(req, 'x-bybit-api-secret');
  const hasClientApiKey = Boolean(rawClientApiKey && sanitizeKey(rawClientApiKey));
  const hasClientApiSecret = Boolean(rawClientApiSecret && sanitizeKey(rawClientApiSecret));
  const hasUserCredentials = hasClientApiKey && hasClientApiSecret;

  if (!token && !hasUserCredentials) {
    if (hasClientApiKey && !hasClientApiSecret) {
      res.status(401).json({
        retCode: 401,
        retMsg: 'Unauthorized: Missing Bybit API Secret in request headers (x-bybit-api-secret)'
      });
      return false;
    }
    if (!hasClientApiKey && hasClientApiSecret) {
      res.status(401).json({
        retCode: 401,
        retMsg: 'Unauthorized: Missing Bybit API Key in request headers (x-bybit-api-key)'
      });
      return false;
    }
    res.status(401).json({
      retCode: 401,
      retMsg: 'Unauthorized: Invalid or missing proxy authorization token'
    });
    return false;
  }

  if (currentExpectedToken && token) {
    if (!verifyToken(token, currentExpectedToken)) {
      res.status(401).json({
        retCode: 401,
        retMsg: 'Unauthorized: Invalid or missing proxy authorization token'
      });
      return false;
    }
  } else if (currentExpectedToken && !token && !hasUserCredentials) {
    res.status(401).json({
      retCode: 401,
      retMsg: 'Unauthorized: Invalid or missing proxy authorization token'
    });
    return false;
  }

  return true;
}

module.exports = {
  API_KEY,
  API_SECRET,
  TESTNET,
  BASE_URL_CANDIDATES,
  PROXY_AUTH_TOKEN,
  sanitizeKey,
  getHeader,
  getCredentials,
  verifyToken,
  extractToken,
  verifyAuth,
  executeWithFailover
};
