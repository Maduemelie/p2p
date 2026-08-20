const { API_KEY, API_SECRET, TESTNET, BASE_URL_CANDIDATES } = require('./_bybit');

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  res.status(200).json({
    status: 'online',
    testnet: TESTNET,
    candidates: BASE_URL_CANDIDATES,
    apiKeyConfigured: !!API_KEY,
    apiSecretConfigured: !!API_SECRET
  });
};
