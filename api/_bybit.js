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

function generateSignature(timestamp, apiKey, apiSecret, recvWindow, paramsString = '') {
  const preSignString = timestamp + apiKey + recvWindow + paramsString;
  return crypto
    .createHmac('sha256', apiSecret)
    .update(preSignString)
    .digest('hex');
}

function getBybitHeaders(timestamp, recvWindow, signature) {
  return {
    'X-BAPI-API-KEY': API_KEY,
    'X-BAPI-TIMESTAMP': timestamp.toString(),
    'X-BAPI-SIGN': signature,
    'X-BAPI-RECV-WINDOW': recvWindow.toString(),
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  };
}

async function executeWithFailover(method, endpointPath, paramsString, payload = null) {
  const timestamp = Date.now();
  const recvWindow = 5000;
  const signature = generateSignature(timestamp, API_KEY, API_SECRET, recvWindow, paramsString);
  const headers = getBybitHeaders(timestamp, recvWindow, signature);

  let lastError = null;

  for (const baseUrl of BASE_URL_CANDIDATES) {
    const fullUrl = `${baseUrl}${endpointPath}`;
    try {
      console.log(`[Vercel Serverless] Requesting: ${fullUrl}`);
      if (method.toUpperCase() === 'GET') {
        return await axios.get(fullUrl, { headers, timeout: 8000 });
      } else {
        return await axios.post(fullUrl, payload, { headers, timeout: 8000 });
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

function verifyAuth(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-proxy-token, x-api-token, x-auth-token');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return false;
  }

  const currentExpectedToken = process.env.PROXY_AUTH_TOKEN || process.env.BYBIT_PROXY_TOKEN || process.env.AUTH_TOKEN || PROXY_AUTH_TOKEN;
  const token = extractToken(req);

  if (!token) {
    res.status(401).json({
      retCode: 401,
      retMsg: 'Unauthorized: Invalid or missing proxy authorization token'
    });
    return false;
  }

  if (currentExpectedToken && !verifyToken(token, currentExpectedToken)) {
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
  verifyToken,
  extractToken,
  verifyAuth,
  executeWithFailover
};
