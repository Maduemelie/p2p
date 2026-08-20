const { API_KEY, API_SECRET, executeWithFailover } = require('./_bybit');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!API_KEY || !API_SECRET) {
    return res.status(500).json({ retCode: -1, retMsg: 'Bybit API credentials not configured in Vercel Environment Variables' });
  }

  try {
    const coin = req.query.coin || 'USDT';
    const accountType = req.query.accountType || 'FUND';
    const queryString = `accountType=${accountType}&coin=${coin}`;
    const endpointPath = `/v5/asset/transfer/query-account-coins-balance?${queryString}`;

    const response = await executeWithFailover('GET', endpointPath, queryString);
    res.status(200).json(response.data);
  } catch (error) {
    console.error('[Vercel Balance Error]:', error.response?.data || error.message);
    const statusCode = error.response ? error.response.status : 500;
    const errorData = error.response ? error.response.data : { retCode: -1, retMsg: error.message };
    res.status(statusCode).json(errorData);
  }
};
