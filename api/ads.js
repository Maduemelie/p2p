const _bybit = require('./_bybit');

module.exports = async function handler(req, res) {
  if (!_bybit.verifyAuth(req, res)) return;

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');

  const credentials = _bybit.getCredentials(req);
  if (!credentials.apiKey || !credentials.apiSecret) {
    return res.status(500).json({ retCode: -1, retMsg: 'Bybit API credentials not configured in request headers or environment variables' });
  }

  try {
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

    const fetchAdsWithPayload = async (payload) => {
      try {
        const jsonBodyString = JSON.stringify(payload);
        const endpointPath = `/v5/p2p/item/personal/list`;
        const response = await _bybit.executeWithFailover('POST', endpointPath, jsonBodyString, payload, credentials);
        const data = response.data;
        let items = extractItems(data);

        // Auto-paginate when caller did not explicitly request a specific page and more items exist
        const isDefaultPage = (!req.query?.page && !body?.page) || payload.page === 1 || payload.page === '1';
        const pageSize = Number(payload.size || 30);
        const totalCount = Number(data?.result?.count || data?.result?.total || data?.result?.totalNumber || data?.result?.totalCount || data?.result?.total_count || 0);

        if (isDefaultPage && ((totalCount > items.length && items.length > 0) || items.length === pageSize)) {
          const maxPages = totalCount > 0 ? Math.min(Math.ceil(totalCount / pageSize), 5) : 3;
          for (let p = 2; p <= maxPages; p++) {
            try {
              const nextPagePayload = {
                ...payload,
                page: typeof payload.page === 'number' ? p : String(p)
              };
              const nextJson = JSON.stringify(nextPagePayload);
              const nextRes = await _bybit.executeWithFailover('POST', endpointPath, nextJson, nextPagePayload, credentials);
              const nextItems = extractItems(nextRes.data);
              if (!nextItems || nextItems.length === 0) break;
              items = items.concat(nextItems);
              if (nextItems.length < pageSize) break;
            } catch (pageErr) {
              console.warn(`[Vercel Ads] Pagination page ${p} warning:`, pageErr.message);
              break;
            }
          }
        }

        return items;
      } catch (e) {
        return [];
      }
    };

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    } else if (!body || typeof body !== 'object') {
      body = {};
    }

    const tokenId = req.query?.tokenId || body.tokenId || 'USDT';
    const requestedSide = req.query?.side !== undefined && req.query?.side !== null && String(req.query.side).trim() !== ''
      ? String(req.query.side).trim()
      : (body.side !== undefined && body.side !== null && String(body.side).trim() !== '' ? String(body.side).trim() : null);

    const page = String(req.query?.page || body.page || '1');
    const size = String(req.query?.size || body.size || '30');

    let combinedItems = [];

    const addItemsToMap = (map, items) => {
      if (!Array.isArray(items)) return;
      items.forEach((item, index) => {
        if (!item || typeof item !== 'object') return;
        const id = item.id || item.itemId || item.adId || item.advId || item.idStr || `ad_auto_${index}_${Date.now()}`;
        if (!item.id) item.id = id;
        map.set(String(id), item);
      });
    };

    if (requestedSide === '0' || requestedSide === 'BUY' || requestedSide === 'buy') {
      const [strRes, numRes] = await Promise.all([
        fetchAdsWithPayload({ side: '0', tokenId, page, size }),
        fetchAdsWithPayload({ side: 0, tokenId, page: Number(page), size: Number(size) })
      ]);
      const map = new Map();
      addItemsToMap(map, [...strRes, ...numRes]);
      combinedItems = Array.from(map.values());
    } else if (requestedSide === '1' || requestedSide === 'SELL' || requestedSide === 'sell') {
      const [strRes, numRes] = await Promise.all([
        fetchAdsWithPayload({ side: '1', tokenId, page, size }),
        fetchAdsWithPayload({ side: 1, tokenId, page: Number(page), size: Number(size) })
      ]);
      const map = new Map();
      addItemsToMap(map, [...strRes, ...numRes]);
      combinedItems = Array.from(map.values());
    } else {
      const [allAds, side0Str, side0Num, side1Str, side1Num] = await Promise.all([
        fetchAdsWithPayload({ tokenId, page, size }),
        fetchAdsWithPayload({ side: '0', tokenId, page, size }),
        fetchAdsWithPayload({ side: 0, tokenId, page: Number(page), size: Number(size) }),
        fetchAdsWithPayload({ side: '1', tokenId, page, size }),
        fetchAdsWithPayload({ side: 1, tokenId, page: Number(page), size: Number(size) })
      ]);

      const map = new Map();
      addItemsToMap(map, [...allAds, ...side0Str, ...side0Num, ...side1Str, ...side1Num]);
      combinedItems = Array.from(map.values());
    }

    res.status(200).json({
      retCode: 0,
      retMsg: 'SUCCESS',
      result: {
        items: combinedItems,
        count: combinedItems.length
      }
    });
  } catch (error) {
    console.error('[Vercel Ads Error]:', error.response?.data || error.message);
    const statusCode = error.response ? error.response.status : 500;
    let errorData = error.response?.data;
    if (!errorData || typeof errorData !== 'object') {
      errorData = { retCode: statusCode, retMsg: error.response?.statusText || error.message };
    }
    res.status(statusCode).json(errorData);
  }
};
