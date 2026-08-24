/**
 * HTTP and Serverless Handler Mock Harness for API Proxy Testing
 */

const http = require('http');

class MockRequest {
  constructor({
    method = 'GET',
    url = '/',
    query = {},
    body = {},
    headers = {}
  } = {}) {
    this.method = method.toUpperCase();
    this.url = url;
    this.query = { ...query };
    this.body = body;
    // Normalize headers to lowercase
    this.headers = {};
    for (const [k, v] of Object.entries(headers)) {
      this.headers[k.toLowerCase()] = String(v);
    }
  }

  get(headerName) {
    return this.headers[headerName.toLowerCase()];
  }
}

class MockResponse {
  constructor() {
    this.statusCode = 200;
    this.headers = {};
    this.body = null;
    this.ended = false;
  }

  status(code) {
    this.statusCode = code;
    return this;
  }

  setHeader(name, value) {
    this.headers[name.toLowerCase()] = value;
    return this;
  }

  getHeader(name) {
    return this.headers[name.toLowerCase()];
  }

  json(data) {
    this.body = data;
    this.setHeader('content-type', 'application/json');
    this.ended = true;
    return this;
  }

  send(data) {
    this.body = data;
    this.ended = true;
    return this;
  }

  end(data) {
    if (data) this.body = data;
    this.ended = true;
    return this;
  }
}

/**
 * Execute a Vercel serverless function with mock request and response
 */
async function invokeServerlessHandler(handler, requestOptions = {}) {
  const req = new MockRequest(requestOptions);
  const res = new MockResponse();

  await handler(req, res);
  return {
    status: res.statusCode,
    headers: res.headers,
    data: res.body,
    res
  };
}

/**
 * Create a simple HTTP client to make requests against running Express server
 */
function makeHttpRequest({
  port,
  path = '/',
  method = 'GET',
  headers = {},
  body = null
}) {
  return new Promise((resolve, reject) => {
    const serializedBody = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const reqHeaders = { ...headers };
    if (serializedBody && !reqHeaders['Content-Type'] && !reqHeaders['content-type']) {
      reqHeaders['Content-Type'] = 'application/json';
    }
    if (serializedBody && !reqHeaders['Content-Length'] && !reqHeaders['content-length']) {
      reqHeaders['Content-Length'] = Buffer.byteLength(serializedBody);
    }

    const options = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: reqHeaders
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        let parsed = data;
        try {
          parsed = JSON.parse(data);
        } catch {
          // keep as string
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: parsed
        });
      });
    });

    req.on('error', (err) => reject(err));
    if (serializedBody) {
      req.write(serializedBody);
    }
    req.end();
  });
}

module.exports = {
  MockRequest,
  MockResponse,
  invokeServerlessHandler,
  makeHttpRequest
};
