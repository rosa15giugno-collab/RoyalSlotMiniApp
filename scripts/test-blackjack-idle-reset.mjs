/**
 * Blackjack idle reset when GET /current has no active round.
 * Run: node scripts/test-blackjack-idle-reset.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { controlsDisabled } from '../blackjack/auth-state.js';
import {
  idleRoundFields,
  redactCurrentLog,
  shouldResumeActiveRound,
} from '../blackjack/resume-state.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(join(root, 'blackjack/app.js'), 'utf8');
const html = readFileSync(join(root, 'blackjack/index.html'), 'utf8');
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

record('current false → idle', () => {
  assert(!shouldResumeActiveRound({ has_active_round: false }), 'no resume');
  assert(idleRoundFields().ui === 'idle', 'ui idle');
});

record('current false → roundId null', () => {
  assert(idleRoundFields().roundId === null, 'roundId');
});

record('current false → payload null', () => {
  assert(idleRoundFields().payload === null, 'payload');
});

record('current false → pending/animating cleared', () => {
  const idle = idleRoundFields();
  assert(idle.pending === null && idle.animating === false, 'pending+anim');
});

record('current false → carte/score/outcome via resetToIdle wiring', () => {
  assert(app.includes('function resetToIdle'), 'resetToIdle');
  assert(app.includes('paintHandsInstant(null)'), 'clear hands');
  assert(app.includes('paintScores(null)'), 'clear scores');
  assert(app.includes('clearOutcomeFx()'), 'clear outcome');
});

record('current false → DISTRIBUISCI visibile / hit-stand off', () => {
  const flags = controlsDisabled({ authenticated: true, busy: false, playing: false });
  assert(flags.deal === false, 'deal enabled');
  assert(flags.hit === true && flags.stand === true, 'hit/stand disabled');
  assert(flags.bets === false, 'bets selectable');
  assert(app.includes('paintChrome()'), 'chrome after reset');
});

record('soft reopen con vecchia mano → reset completo', () => {
  const polluted = {
    balance: 948581,
    bet: 500,
    roundId: '4e8c9193deadbeef',
    payload: {
      status: 'player_turn',
      player_cards: [{ rank: 'K' }, { rank: '5' }],
      dealer_cards: [{ rank: '7' }, { hidden: true }],
    },
    pending: { kind: 'stand', actionId: 'x' },
    animating: true,
    ui: 'playing',
  };
  Object.assign(polluted, idleRoundFields());
  assert(polluted.roundId === null && polluted.payload === null, 'cleared ids');
  assert(polluted.pending === null && polluted.ui === 'idle', 'idle flags');
  assert(polluted.balance === 948581 && polluted.bet === 500, 'balance+bet preserved');
  assert(app.includes('resetToIdle()'), 'called on false path');
});

record('current true → resume invariato', () => {
  const current = {
    has_active_round: true,
    round: { round_id: 'abcdef12dead', status: 'player_turn', bet: 100 },
  };
  assert(shouldResumeActiveRound(current) === true, 'resume');
  assert(app.includes('shouldResumeActiveRound(current)'), 'wired');
  assert(app.includes("applyPayload(current.round, { mode: 'instant' })"), 'apply');
});

record('log temporaneo [BJ current] redacted', () => {
  const log = redactCurrentLog({
    has_active_round: false,
  });
  assert(log.has_active_round === false, 'flag');
  assert(log.round_id === null && log.status === null && log.bet === null, 'empty');
  const active = redactCurrentLog({
    has_active_round: true,
    round: { round_id: '4e8c91939bb246298f73a9a9dd01400f', status: 'player_turn', bet: 500 },
  });
  assert(active.round_id === '4e8c9193…', `redacted=${active.round_id}`);
  assert(!JSON.stringify(active).includes('initData'), 'no initData');
  assert(app.includes("[BJ current]"), 'logged');
});

record('cache bust app v=6 style v=7', () => {
  assert(html.includes('app.js?v=6'), 'app bust');
  assert(html.includes('style.css?v=7'), 'css bust');
});

const failed = results.filter((item) => !item.ok);
console.log(`${results.length - failed.length}/${results.length} pass`);
if (failed.length) process.exit(1);
