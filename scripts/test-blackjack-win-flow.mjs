/**
 * Blackjack V2 win-flow frontend tests (settlement UI resilience).
 * Run: node scripts/test-blackjack-win-flow.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { animateBalanceText } from '../blackjack/animations.js';
import {
  buildPayoutRows,
  classifyOutcome,
  outcomeHeadline,
  outcomeSubline,
} from '../blackjack/layout.js';
import { formatChips } from '../js/utils.js';
import { controlsDisabled } from '../blackjack/auth-state.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(join(root, 'blackjack/app.js'), 'utf8');
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

async function recordAsync(name, fn) {
  try {
    await fn();
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

const plainWin = {
  status: 'settled',
  outcome: 'a',
  message: 'Hai vinto',
  payout_base: 200,
  final_credit: 200,
  balance_after: 5200,
  natural_win: false,
  vip_applied: false,
  level_multiplier: 1,
  daily_applied: false,
};

const naturalBj = {
  status: 'settled',
  outcome: 'a',
  message: 'Blackjack naturale',
  payout_base: 250,
  final_credit: 250,
  balance_after: 5250,
  natural_win: true,
  player_blackjack: true,
};

const fullBreakdown = {
  status: 'settled',
  outcome: 'a',
  message: 'Hai vinto',
  payout_base: 2000,
  final_credit: 6240,
  vip_applied: true,
  vip_extra: 600,
  vip_level: 3,
  vip_multiplier: 1.3,
  level_multiplier: 1.2,
  level_block: 'x1.2',
  daily_applied: true,
  daily_multiplier: 2,
};

record('normal win completa classificazione UI', () => {
  assert(classifyOutcome(plainWin) === 'win', 'kind win');
  assert(outcomeHeadline('win', plainWin) === 'Hai vinto', 'headline');
  assert(outcomeSubline('win', plainWin, formatChips).includes('200'), 'subline credit');
  assert(outcomeSubline('win', plainWin, formatChips).includes('Chips'), 'chips label');
});

record('natural blackjack completa classificazione UI', () => {
  assert(classifyOutcome(naturalBj) === 'blackjack', 'kind bj');
  assert(outcomeHeadline('blackjack', naturalBj).toLowerCase().includes('blackjack'), 'headline');
  assert(outcomeSubline('blackjack', naturalBj, formatChips).includes('250'), 'bj credit');
});

record('payout breakdown con tutti i campi (payout_base)', () => {
  const rows = buildPayoutRows(fullBreakdown, formatChips);
  assert(rows.some((r) => r.label === 'Vincita base' && r.value.includes('2')), 'base from payout_base');
  assert(rows.some((r) => String(r.label).includes('VIP') || String(r.value).includes('+')), 'vip');
  assert(rows.some((r) => String(r.label).includes('Livello')), 'level');
  assert(rows.some((r) => String(r.label).includes('Daily')), 'daily');
  assert(rows.at(-1).total && String(rows.at(-1).value).includes('6'), 'total final_credit');
});

record('payout breakdown con campi opzionali mancanti', () => {
  const rows = buildPayoutRows({
    status: 'settled',
    outcome: 'a',
    final_credit: 200,
  }, formatChips);
  assert(rows.length === 0, 'no invented rows without detail fields');
});

record('final_credit presente → subline win', () => {
  const sub = outcomeSubline('win', { final_credit: 1234 }, formatChips);
  assert(sub.includes('1234') || sub.includes('1.234'), `sub=${sub}`);
});

record('outcome codes preferiti su heuristic banco', () => {
  assert(classifyOutcome({
    status: 'settled',
    outcome: 'a',
    message: 'Hai vinto contro il banco',
    final_credit: 200,
  }) === 'win', 'outcome a wins even if message has banco');
  assert(classifyOutcome({
    status: 'settled',
    outcome: 'b',
    message: 'Hai perso',
    final_credit: 0,
  }) === 'lose', 'outcome b');
});

await recordAsync('win FX / balance anim non blocca (sempre resolve)', async () => {
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.performance = { now: () => 0 };
  let t = 0;
  globalThis.requestAnimationFrame = (cb) => {
    t += 300;
    queueMicrotask(() => cb(t));
    return 1;
  };
  const node = { textContent: '' };
  const result = await Promise.race([
    animateBalanceText(node, 5000, 5200, formatChips, 100).then(() => 'ok'),
    new Promise((r) => setTimeout(() => r('timeout'), 1000)),
  ]);
  assert(result === 'ok', `resolved=${result}`);
  assert(node.textContent.includes('5'), `text=${node.textContent}`);
});

await recordAsync('errore FX format → UI comunque settled (anim resolve)', async () => {
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.performance = { now: () => 0 };
  let t = 0;
  globalThis.requestAnimationFrame = (cb) => {
    t += 400;
    queueMicrotask(() => cb(t));
    return 1;
  };
  const node = { textContent: '' };
  const boom = () => {
    throw new TypeError("Cannot read properties of undefined (reading 'toLocaleString')");
  };
  const result = await Promise.race([
    animateBalanceText(node, 100, 200, boom, 100).then(() => 'ok'),
    new Promise((r) => setTimeout(() => r('HUNG'), 1200)),
  ]);
  assert(result === 'ok', `must resolve after format error, got ${result}`);
});

record('errore breakdown → helper non throw', () => {
  const rows = buildPayoutRows({
    status: 'settled',
    outcome: 'a',
    final_credit: 200,
    payout_base: 200,
    vip_applied: true,
    vip_extra: 10,
  }, () => {
    throw new Error('format boom');
  });
  assert(rows.length >= 2, 'still builds rows with safe format');
});

record('saldo finale / controls settled dopo win', () => {
  const flags = controlsDisabled({ authenticated: true, busy: false, playing: false });
  assert(flags.deal === false, 'DISTRIBUISCI enabled when settled (not playing, not busy)');
  assert(flags.hit === true && flags.stand === true, 'hit/stand off when not playing');
});

record('applyPayload usa try/finally su animating', () => {
  assert(app.includes('finally'), 'finally block');
  assert(app.includes('state.animating = false'), 'clears animating');
  assert(app.includes("state.payload?.status === 'settled'"), 'play catch respects settled');
  assert(app.includes('renderOutcome') && app.includes('catch'), 'outcome guarded');
});

record('nuova DISTRIBUISCI dopo win (deal not hidden when settled)', () => {
  assert(app.includes('dom.dealBtn.hidden = playing'), 'deal hidden only while playing');
  assert(app.includes("payload.status === 'settled'") && app.includes("state.ui = 'settled'"), 'settled ui');
});

const failed = results.filter((item) => !item.ok);
console.log(`${results.length - failed.length}/${results.length} pass`);
if (failed.length) process.exit(1);
