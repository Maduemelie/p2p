const { API_KEY, API_SECRET, executeWithFailover } = require('./_bybit');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!API_KEY || !API_SECRET) {
    return res.status(500).json({ retCode: -1, retMsg: 'Bybit API credentials not configured in Vercel Environment Variables' });
  }

  try {
    const {
      page = 1,
      size = 30,
      status = null,
      side = null,
      tokenId = null,
      beginTime = null,
      endTime = null
    } = req.body || {};

    const payload = {
      page: Number(page),
      size: Number(size)
    };

    if (status !== null && status !== undefined && status !== '') payload.status = Number(status);
    if (side !== null && side !== undefined && side !== '') payload.side = Number(side);
    if (tokenId) payload.tokenId = tokenId;
    if (beginTime) payload.beginTime = String(beginTime);
    if (endTime) payload.endTime = String(endTime);

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
