const { API_KEY, API_SECRET, executeWithFailover, verifyAuth } = require('./_bybit');

module.exports = async function handler(req, res) {
  if (!verifyAuth(req, res)) return;

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');

  if (!API_KEY || !API_SECRET) {
    return res.status(500).json({ retCode: -1, retMsg: 'Bybit API credentials not configured in Vercel Environment Variables' });
  }

  try {
    const payload = {
      side: '1', // 1 is SELL ad
      tokenId: 'USDT',
      status: '2', // 2 is AVAILABLE (excludes completed/removed)
      page: '1',
      size: '10'
    };

    const jsonBodyString = JSON.stringify(payload);
    const endpointPath = `/v5/p2p/item/personal/list`;

    const response = await executeWithFailover('POST', endpointPath, jsonBodyString, payload);
    res.status(200).json(response.data);
  } catch (error) {
    console.error('[Vercel Ads Error]:', error.response?.data || error.message);
    const statusCode = error.response ? error.response.status : 500;
    const errorData = error.response ? error.response.data : { retCode: -1, retMsg: error.message };
    res.status(statusCode).json(errorData);
  }
};
