/**
 * Blackjack Telegram auth UI — pure helpers + wiring checks.
 * Run: node scripts/test-blackjack-auth-state.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  balanceLabel,
  controlsDisabled,
  errorCodeFromHttp,
  hasInitData,
  isRecoverableNetworkError,
} from '../blackjack/auth-state.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const results = [];

function record(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
    console.log(`FAIL  ${name}`);
    console.log(`      ${error.message}`);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const app = readFileSync(join(root, 'blackjack/app.js'), 'utf8');
const layout = readFileSync(join(root, 'blackjack/layout.js'), 'utf8');

record('no initData → deal disabled', () => {
  const flags = controlsDisabled({ authenticated: false, busy: false, playing: false });
  assert(flags.deal === true, 'deal disabled');
  assert(flags.hit === true, 'hit disabled');
  assert(flags.stand === true, 'stand disabled');
});

record('initData presente → deal abilitato', () => {
  assert(hasInitData('query_id=1&user=%7B%7D&hash=abc') === true, 'hasInitData');
  const flags = controlsDisabled({ authenticated: true, busy: false, playing: false });
  assert(flags.deal === false, 'deal enabled');
});

record('no initData → saldo non mostra 5000', () => {
  assert(balanceLabel(5000, false) === '—', 'hides demo 5000');
  assert(balanceLabel(null, false) === '—', 'null stays dash');
  assert(balanceLabel(5000, true) === null, 'authenticated uses real format path');
  assert(app.includes('state.balance = null'), 'app clears balance without auth');
  assert(app.includes("data?.demo"), 'rejects demo balance payload');
  assert(!app.includes('CONFIG.demo.initialBalance'), 'app never reads demo initialBalance');
});

record('401 → AUTH_ERROR', () => {
  assert(errorCodeFromHttp(401, 'Missing X-Telegram-Init-Data header', {}) === 'AUTH_ERROR', '401');
  assert(errorCodeFromHttp(403, 'Forbidden', {}) === 'AUTH_ERROR', '403');
  assert(layout.includes('AUTH_ERROR'), 'layout AUTH_ERROR');
  assert(layout.includes('Apri Blackjack direttamente da Telegram per giocare.'), 'copy');
  assert(app.includes("errorCodeFromHttp(response.status"), 'app maps http');
});

record('401 non entra in recoverAfterNetwork', () => {
  const authErr = { code: 'AUTH_ERROR', httpStatus: 401 };
  assert(isRecoverableNetworkError(authErr) === false, 'AUTH_ERROR not recoverable');
  assert(isRecoverableNetworkError({ code: 'AUTH_ERROR', httpStatus: 403 }) === false, '403 AUTH not recoverable');
  assert(isRecoverableNetworkError({ code: 'NETWORK_ERROR' }) === true, 'NETWORK recoverable');
  assert(isRecoverableNetworkError({ code: 'INSUFFICIENT_BALANCE', httpStatus: 400 }) === false, 'business not recoverable');
  assert(app.includes('isRecoverableNetworkError(error)'), 'deal/play use recoverable check');
});

record('AUTH log sicuro senza initData dump', () => {
  assert(app.includes('[BLACKJACK AUTH] initData_present='), 'auth log');
  assert(app.includes('[BLACKJACK API] start status='), 'api status log');
  assert(!/console\.(info|log|debug|warn|error)\([^)]*getInitData\(\)/.test(app), 'no initData value logged');
});

const failed = results.filter((item) => !item.ok);
console.log(`${results.length - failed.length}/${results.length} pass`);
if (failed.length) process.exit(1);
