const { API_KEY, API_SECRET, executeWithFailover, verifyAuth } = require('./_bybit');

module.exports = async function handler(req, res) {
  if (!verifyAuth(req, res)) return;

  if (!API_KEY || !API_SECRET) {
    return res.status(500).json({ retCode: -1, retMsg: 'Bybit API credentials not configured in Vercel Environment Variables' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        body = {};
      }
    } else if (!body || typeof body !== 'object') {
      body = {};
    }

    const page = Number(body.page) || 1;
    const size = Number(body.size) || 30;

    const payload = {
      page: page,
      size: size
    };

    if (body.status !== null && body.status !== undefined && body.status !== '') {
      payload.status = Number(body.status);
    }
    if (body.side !== null && body.side !== undefined && body.side !== '') {
      payload.side = Number(body.side);
    }
    if (body.tokenId) payload.tokenId = String(body.tokenId);
    if (body.beginTime) payload.beginTime = String(body.beginTime);
    if (body.endTime) payload.endTime = String(body.endTime);

    const jsonBodyString = JSON.stringify(payload);
    const endpointPath = `/v5/p2p/order/simplifyList`;

    const response = await executeWithFailover('POST', endpointPath, jsonBodyString, payload);
    res.status(200).json(response.data);
  } catch (error) {
    console.error('[Vercel Orders Error]:', error.response?.data || error.message);
    const statusCode = error.response ? error.response.status : 500;
    const errorData = error.response ? error.response.data : { retCode: -1, retMsg: error.message };
    res.status(statusCode).json(errorData);
  }
};
