const { API_KEY, API_SECRET, executeWithFailover, verifyAuth } = require('./_bybit');

const extractItems = (data) => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.result)) return data.result;
  if (data.result && typeof data.result === 'object') {
    if (Array.isArray(data.result.items)) return data.result.items;
    if (Array.isArray(data.result.list)) return data.result.list;
    if (Array.isArray(data.result.data)) return data.result.data;
    if (Array.isArray(data.result.rows)) return data.result.rows;
    if (Array.isArray(data.result.records)) return data.result.records;
    if (Array.isArray(data.result.itemList)) return data.result.itemList;
  }
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.list)) return data.list;
  return [];
};

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

    /**
     * Bybit P2P Side Conventions for /v5/p2p/item/online (Public Market Depth):
     * The public orderbook API is formulated from the Taker's (retail user's) perspective:
     * - side: '1' (Taker Sells) -> Returns merchant BUY advertisements (Market Bids / buyDepth).
     * - side: '0' (Taker Buys)  -> Returns merchant SELL advertisements (Market Asks / sellDepth).
     *
     * In contrast, Merchant Personal Ads (/v5/p2p/item/personal/list) are from the Merchant's perspective:
     * - side: 0 -> Merchant Buy Ad
     * - side: 1 -> Merchant Sell Ad
     */
    // Build Buy side: Taker sells crypto -> Competitors are buying -> side: '1' -> buyDepth (bids)
    const buyPayload = {
      tokenId: coin,
      currencyId: fiat,
      side: '1',
      page: '1',
      size: String(limit)
    };

    // Build Sell side: Taker buys crypto -> Competitors are selling -> side: '0' -> sellDepth (asks)
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
        buyDepth: extractItems(buyRes.data),
        sellDepth: extractItems(sellRes.data)
      }
    });
  } catch (error) {
    console.error('[Vercel Market Depth Error]:', error.response?.data || error.message);
    const statusCode = error.response ? error.response.status : 500;
    const errorData = error.response ? error.response.data : { retCode: -1, retMsg: error.message };
    res.status(statusCode).json(errorData);
  }
};
