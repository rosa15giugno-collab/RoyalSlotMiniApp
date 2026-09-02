/**
 * Mini App access gate — production vs local demo rules + Poker app_id wiring.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

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

const pokerApp = readFileSync(join(root, 'poker', 'app.js'), 'utf8');
const royaleApp = readFileSync(join(root, 'app.js'), 'utf8');
const bridge = readFileSync(join(root, 'js', 'telegram-bridge.js'), 'utf8');

assert.match(pokerApp, /const POKER_APP_ID = 'poker'/);
assert.match(pokerApp, /fetchBalance\(POKER_APP_ID\)/);
assert.doesNotMatch(pokerApp, /fetchBalance\(\)/, 'PokerSlot must not call fetchBalance() without poker app id');
assert.match(pokerApp, /runAccessGate\(telegram, POKER_APP_ID/);
assert.match(pokerApp, /requestPokerSpin\(/);
assert.match(bridge, /appId = 'poker'/, 'requestPokerSpin default must stay poker');
assert.match(royaleApp, /CONFIG\.miniapp\.appId/, 'Royale keeps shared royale app id');

console.log('test-miniapp-access-gate.mjs OK');
