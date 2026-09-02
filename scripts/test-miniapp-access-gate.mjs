/**
 * Mini App access gate — production vs local demo rules.
 */
import assert from 'node:assert/strict';

function isProductionBackend(baseUrl) {
  if (!baseUrl) return false;
  return !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(baseUrl);
}

function isLocalDevHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

function allowsLocalDemo(hostname, baseUrl) {
  return isLocalDevHost(hostname) && !isProductionBackend(baseUrl);
}

const prodBase = 'https://casinobot-stabile-production-2a50.up.railway.app';

assert.equal(allowsLocalDemo('localhost', prodBase), false, 'localhost + prod API must not allow demo');
assert.equal(allowsLocalDemo('127.0.0.1', prodBase), false);
assert.equal(allowsLocalDemo('example.com', prodBase), false, 'browser without Telegram on prod host denied');
assert.equal(allowsLocalDemo('localhost', 'http://localhost:8000'), true, 'local dev stack may demo');
assert.equal(isProductionBackend(prodBase), true);
assert.equal(isProductionBackend('http://127.0.0.1:8000'), false);

console.log('test-miniapp-access-gate.mjs OK');
