const _bybit = require('./_bybit');

module.exports = async function handler(req, res) {
  if (!_bybit.verifyAuth(req, res)) return;

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');

  const credentials = _bybit.getCredentials(req);
  if (!credentials.apiKey || !credentials.apiSecret) {
    return res.status(500).json({ retCode: -1, retMsg: 'Bybit API credentials not configured in request headers or environment variables' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    } else if (!body || typeof body !== 'object') {
      body = {};
    }

    const coin = req.query?.coin || body.coin || 'USDT';
    const accountType = req.query?.accountType || body.accountType || 'FUND';
    const queryString = `accountType=${accountType}&coin=${coin}`;
    const endpointPath = `/v5/asset/transfer/query-account-coins-balance?${queryString}`;

    const response = await _bybit.executeWithFailover('GET', endpointPath, queryString, null, credentials);
    res.status(200).json(response.data);
  } catch (error) {
    console.error('[Vercel Balance Error]:', error.response?.data || error.message);
    const statusCode = error.response ? error.response.status : 500;
    let errorData = error.response?.data;
    if (!errorData || typeof errorData !== 'object') {
      errorData = { retCode: statusCode, retMsg: error.response?.statusText || error.message };
    }
    res.status(statusCode).json(errorData);
  }
};
