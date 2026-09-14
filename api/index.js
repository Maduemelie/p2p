/**
 * Vercel Serverless Entry Point
 * Exports unified multi-tenant proxy handler
 */

const proxyHandler = require('./proxy');

module.exports = proxyHandler;
