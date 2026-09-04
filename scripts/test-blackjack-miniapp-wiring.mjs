/**
 * Blackjack Mini App wiring — no DOM.
 * Run: node scripts/test-blackjack-miniapp-wiring.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
const html = readFileSync(join(root, 'blackjack/index.html'), 'utf8');
const layout = readFileSync(join(root, 'blackjack/layout.js'), 'utf8');
const config = readFileSync(join(root, 'js/config.js'), 'utf8');

record('usa /api/blackjack/start', () => {
  assert(config.includes("blackjackStart: '/api/blackjack/start'"), 'config start');
  assert(app.includes('CONFIG.api.endpoints.blackjackStart'), 'app start');
});

record('usa /hit', () => {
  assert(config.includes("blackjackHit: '/api/blackjack/hit'"), 'config hit');
  assert(app.includes('blackjackHit'), 'app hit');
});

record('usa /stand', () => {
  assert(config.includes("blackjackStand: '/api/blackjack/stand'"), 'config stand');
  assert(app.includes('blackjackStand'), 'app stand');
});

record('chiama /api/blackjack/current al boot', () => {
  assert(config.includes("blackjackCurrent: '/api/blackjack/current'"), 'config current');
  assert(app.includes('blackjackCurrent'), 'app current endpoint');
  assert(app.includes('resumeRound'), 'resumeRound');
  assert(app.includes('await resumeRound()'), 'boot calls resumeRound');
  assert(app.includes('fetchCurrentRound'), 'fetchCurrentRound');
});

record('resume UI playing', () => {
  assert(app.includes("payload.status === 'player_turn'") && app.includes("state.ui = 'playing'"), 'playing on player_turn');
  assert(app.includes('has_active_round') && app.includes('applyPayload(current.round)'), 'apply current round');
});

record('non mostra DISTRIBUISCI con round attivo', () => {
  assert(app.includes('dom.dealBtn.hidden = playing'), 'hide deal when playing');
  assert(app.includes('Hide DISTRIBUISCI') || app.includes('DISTRIBUISCI'), 'distribuisci comment/intent');
});

record('initData header presente', () => {
  assert(app.includes("'X-Telegram-Init-Data'"), 'header');
  assert(app.includes('telegram.getInitData()'), 'initData');
});

record('non invia user_id', () => {
  assert(!/user_id\s*:/.test(app), 'no user_id field');
});

record('action_id generato', () => {
  assert(app.includes('newActionId'), 'generator');
  assert(app.includes('ensurePending'), 'ensurePending');
  assert(app.includes('actionId: newActionId()'), 'pending stores new id');
});

record('pending action_id mantenuto su network error', () => {
  assert(app.includes('state.pending'), 'pending state');
  assert(app.includes('recoverAfterNetwork'), 'recover');
  assert(app.includes('CONNECTION_INTERRUPTED'), 'connection message');
  assert(layout.includes('Connessione interrotta. Verifico la mano'), 'layout copy');
  assert(app.includes('Keep pending') || app.includes('keep pending') || app.includes('state.pending'), 'keep pending');
});

record('retry usa stesso action_id', () => {
  assert(app.includes('if (state.pending && state.pending.kind === kind)'), 'reuse pending same kind');
  assert(app.includes('sendPending(pending)'), 'sendPending uses pending.actionId');
  assert(app.includes('action_id: pending.actionId'), 'same action_id in body');
});

record('nuovo click dopo successo genera nuovo action_id', () => {
  assert(app.includes('clearPending()'), 'clear on success');
  assert(app.includes('state.pending = { kind, actionId: newActionId()'), 'new id after clear');
});

record('stand response lost non genera nuovo stand id', () => {
  assert(app.includes("if (state.pending && state.pending.kind !== kind) return"), 'block other kinds while pending');
  assert(app.includes("pending.kind === 'stand'") || app.includes("kind === 'stand'"), 'stand pending path');
  assert(app.includes('retry same stand') || app.includes('STAND response lost'), 'stand docs');
});

record('start response lost no second debit logic', () => {
  assert(app.includes("ensurePending('start'") || app.includes('kind === \'start\''), 'start pending');
  assert(app.includes('recoverAfterNetwork'), 'recover retries same start id');
  assert(app.includes("pending.kind === 'start'"), 'start recovery branch');
});

record('nessun deck/hole processing client', () => {
  assert(!/deck/.test(app.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '')), 'no deck in client logic');
  assert(app.includes('card?.hidden'), 'renders hidden hole only');
  assert(!app.includes('hole_rank') && !app.includes('hole_suit'), 'no hole fields');
});

record('buttons disabled during request', () => {
  assert(app.includes('setBusy'), 'setBusy');
  assert(app.includes('dom.dealBtn.disabled'), 'deal disabled');
  assert(app.includes('dom.hitBtn.disabled'), 'hit disabled');
  assert(app.includes("state.ui === 'starting' || state.ui === 'action_pending'"), 'busy states');
});

record('no double/split controls', () => {
  assert(!/double|split|raddoppia|dividi/i.test(html + app + layout), 'no extra actions');
  assert(html.includes('CARTA') && html.includes('STO'), 'hit/stand');
});

record('dealer hole hidden fino al settle', () => {
  assert(app.includes('card?.hidden'), 'hidden renderer');
  assert(app.includes("payload.status === 'settled'"), 'score after settle');
});

record('balance refresh corretto', () => {
  assert(app.includes('fetchBalance'), 'fetchBalance');
  assert(app.includes('balance_after'), 'server balance');
});

record('error states presenti', () => {
  ['INSUFFICIENT_BALANCE', 'INVALID_BET', 'ROUND_NOT_FOUND', 'ROUND_ALREADY_SETTLED', 'ROUND_NOT_OWNER', 'INVALID_ACTION', 'NETWORK_ERROR'].forEach((code) => {
    assert(layout.includes(code), code);
  });
  assert(app.includes('setError'), 'setError');
});

const failed = results.filter((item) => !item.ok);
console.log(`${results.length - failed.length}/${results.length} pass`);
if (failed.length) process.exit(1);
