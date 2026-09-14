const _bybit = require('./_bybit');

module.exports = async function handler(req, res) {
  if (!_bybit.verifyAuth(req, res)) return;

  const credentials = _bybit.getCredentials(req);
  if (!credentials.apiKey || !credentials.apiSecret) {
    return res.status(500).json({ retCode: -1, retMsg: 'Bybit API credentials not configured in request headers or environment variables' });
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

    const response = await _bybit.executeWithFailover('POST', endpointPath, jsonBodyString, payload, credentials);
    res.status(200).json(response.data);
  } catch (error) {
    console.error('[Vercel Orders Error]:', error.response?.data || error.message);
    const statusCode = error.response ? error.response.status : 500;
    let errorData = error.response?.data;
    if (!errorData || typeof errorData !== 'object') {
      errorData = { retCode: statusCode, retMsg: error.response?.statusText || error.message };
    }
    res.status(statusCode).json(errorData);
  }
};
