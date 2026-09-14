/**
 * Vercel Serverless Multi-Tenant API Proxy Handler
 * Dynamically extracts Bybit API credentials from request headers and executes
 * signed Bybit P2P API requests statelessly without logging or storing secrets.
 */

const _bybit = require('./_bybit');
const balanceHandler = require('./balance');
const ordersHandler = require('./orders');
const adsHandler = require('./ads');
const depthHandler = require('./market-depth');
const statusHandler = require('./status');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-proxy-token, x-api-token, x-auth-token, x-bybit-api-key, x-bybit-api-secret, x-bybit-endpoint');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Parse request path
  const host = req.headers?.host || 'localhost';
  const urlObj = new URL(req.url || '/', `http://${host}`);
  const rawPathname = urlObj.pathname;
  const normalizedPathname = rawPathname.toLowerCase().replace(/\/+$/, '') || '/';
  const dispatchPath = normalizedPathname.replace(/^\/api\/proxy(?=\/|$)/, '/api');

  // Route dispatching for specific endpoints
  if (dispatchPath === '/api/balance' || dispatchPath === '/balance') {
    return balanceHandler(req, res);
  }
  if (dispatchPath === '/api/orders' || dispatchPath === '/orders') {
    return ordersHandler(req, res);
  }
  if (dispatchPath === '/api/ads' || dispatchPath === '/ads') {
    return adsHandler(req, res);
  }
  if (dispatchPath === '/api/market-depth' || dispatchPath === '/market-depth' || dispatchPath === '/api/depth' || dispatchPath === '/depth') {
    return depthHandler(req, res);
  }
  if (dispatchPath === '/api/status' || dispatchPath === '/status') {
    return statusHandler(req, res);
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  } else if (!body || typeof body !== 'object') {
    body = {};
  }

  let endpoint = req.query?.endpoint || urlObj.searchParams.get('endpoint') || body.endpoint || _bybit.getHeader(req, 'x-bybit-endpoint');
  if (!endpoint) {
    const strippedPath = rawPathname.replace(/^\/api(\/proxy)?/i, '');
    if (strippedPath && strippedPath !== '/' && strippedPath.length > 1) {
      endpoint = strippedPath;
    }
  }

  // If no specific Bybit endpoint is requested, treat as proxy status/healthcheck probe
  if (!endpoint) {
    return statusHandler(req, res);
  }

  // Specific Bybit API endpoint proxy execution requires authentication
  if (!_bybit.verifyAuth(req, res)) return;

  const credentials = _bybit.getCredentials(req);
  if (!credentials.apiKey || !credentials.apiSecret) {
    return res.status(500).json({
      retCode: -1,
      retMsg: 'Bybit API credentials not configured in request headers or environment variables'
    });
  }

  const method = (body.method || req.query?.method || urlObj.searchParams.get('method') || req.method || 'GET').toUpperCase();
  let payload = body.payload;
  if (!payload && (method === 'POST' || method === 'PUT' || method === 'DELETE')) {
    if (body && typeof body === 'object' && Object.keys(body).length > 0) {
      const cleanBody = { ...body };
      delete cleanBody.endpoint;
      delete cleanBody.method;
      delete cleanBody.token;
      delete cleanBody.proxyToken;
      delete cleanBody.proxy_token;
      delete cleanBody.auth_token;
      payload = Object.keys(cleanBody).length > 0 ? cleanBody : null;
    } else {
      payload = null;
    }
  }

  let finalEndpoint = endpoint;
  let paramsString = '';

  if (method === 'GET') {
    const searchParams = new URLSearchParams(urlObj.search);
    searchParams.delete('endpoint');
    searchParams.delete('method');
    searchParams.delete('token');
    searchParams.delete('proxyToken');
    searchParams.delete('proxy_token');
    searchParams.delete('auth_token');
    searchParams.delete('_t');
    const queryString = searchParams.toString();
    if (queryString) {
      finalEndpoint = endpoint.includes('?') ? `${endpoint}&${queryString}` : `${endpoint}?${queryString}`;
    }
    paramsString = finalEndpoint.includes('?') ? finalEndpoint.slice(finalEndpoint.indexOf('?') + 1) : '';
  } else {
    paramsString = payload ? JSON.stringify(payload) : '';
  }

  try {
    const response = await _bybit.executeWithFailover(method, finalEndpoint, paramsString, payload, credentials);
    return res.status(200).json(response.data);
  } catch (error) {
    const statusCode = error.response ? error.response.status : 500;
    let errorData = error.response?.data;
    if (!errorData || typeof errorData !== 'object') {
      errorData = { retCode: statusCode, retMsg: error.response?.statusText || error.message };
    }
    return res.status(statusCode).json(errorData);
  }
};
