const { API_KEY, API_SECRET, TESTNET, BASE_URL_CANDIDATES, PROXY_AUTH_TOKEN } = require('./_bybit');

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-proxy-token, x-api-token, x-auth-token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const currentProxyToken = process.env.PROXY_AUTH_TOKEN || process.env.BYBIT_PROXY_TOKEN || process.env.AUTH_TOKEN || PROXY_AUTH_TOKEN;

  res.status(200).json({
    status: 'online',
    testnet: TESTNET,
    candidates: BASE_URL_CANDIDATES,
    apiKeyConfigured: !!API_KEY,
    apiSecretConfigured: !!API_SECRET,
    authRequired: !!currentProxyToken
  });
};
