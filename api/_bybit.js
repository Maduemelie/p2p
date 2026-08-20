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
    'Content-Type': 'application/json'
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

module.exports = {
  API_KEY,
  API_SECRET,
  TESTNET,
  BASE_URL_CANDIDATES,
  executeWithFailover
};
