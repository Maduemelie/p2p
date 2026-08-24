const { API_KEY, API_SECRET, executeWithFailover, verifyAuth } = require('./_bybit');

module.exports = async function handler(req, res) {
  if (!verifyAuth(req, res)) return;

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');

  if (!API_KEY || !API_SECRET) {
    return res.status(500).json({ retCode: -1, retMsg: 'Bybit API credentials not configured in Vercel Environment Variables' });
  }

  try {
    const coin = req.query.coin || req.body?.coin || 'USDT';
    const fiat = req.query.fiat || req.body?.fiat || 'NGN';
    const limit = req.query.limit || req.body?.limit || '5';

    // Build Buy side (competitors trying to BUY crypto from users -> users are selling -> side 1)
    const buyPayload = {
      tokenId: coin,
      currencyId: fiat,
      side: '1',
      page: '1',
      size: String(limit)
    };

    // Build Sell side (competitors trying to SELL crypto to users -> users are buying -> side 0)
    const sellPayload = {
      tokenId: coin,
      currencyId: fiat,
      side: '0',
      page: '1',
      size: String(limit)
    };

    const buyParamsString = JSON.stringify(buyPayload);
    const sellParamsString = JSON.stringify(sellPayload);

    const [buyRes, sellRes] = await Promise.all([
      executeWithFailover('POST', '/v5/p2p/item/online', buyParamsString, buyPayload),
      executeWithFailover('POST', '/v5/p2p/item/online', sellParamsString, sellPayload)
    ]);

    res.status(200).json({
      retCode: 0,
      retMsg: 'SUCCESS',
      result: {
        coin,
        fiat,
        buyDepth: buyRes.data?.result?.items || [],
        sellDepth: sellRes.data?.result?.items || []
      }
    });
  } catch (error) {
    console.error('[Vercel Market Depth Error]:', error.response?.data || error.message);
    const statusCode = error.response ? error.response.status : 500;
    const errorData = error.response ? error.response.data : { retCode: -1, retMsg: error.message };
    res.status(statusCode).json(errorData);
  }
};
