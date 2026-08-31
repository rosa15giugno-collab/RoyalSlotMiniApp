/**
 * PokerSlot V6 — progressive paylines + frozen V4/V5.
 * Run: node scripts/test-poker-math-v6.mjs
 */

import { CELL_COUNT } from '../poker/game-config.js';
import {
  BONUS_FEATURE_V4,
  BONUS_FEATURE_V5,
  BONUS_MYSTERY_D,
  LINE_SCALE_RATIO_V4,
  LINE_SCALE_RATIO_V5,
  MATH_V4,
  MATH_V5,
  MATH_V6,
  SCATTER_FEATURE_V3,
  SIM_BET,
  settleGuaranteedCashBonus,
  settleSimulatedSpin,
  validateMathConfig,
} from '../poker/math-config.js';
import {
  PAYLINE_COUNT_BY_BET,
  PAYLINE_DEFINITIONS,
  getActivePaylines,
} from '../poker/paylines.js';
import { evaluateGrid } from '../poker/engine.js';
import { playPaidRound } from '../poker/math-round.js';

const FILL = ['club', 'spade', 'diamond', 'j', 'q', 'k', 'a', '777', 'club', 'spade', 'diamond', 'j', 'q', 'k', 'a'];

function fillGrid(overrides) {
  const grid = FILL.slice(0, CELL_COUNT);
  Object.entries(overrides).forEach(([index, id]) => {
    grid[Number(index)] = id;
  });
  return grid;
}

function queue(grids) {
  let i = 0;
  return () => {
    const grid = grids[i];
    i += 1;
    return grid;
  };
}

const results = [];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: atteso ${expected}, trovato ${actual}`);
  }
}

function assertClose(actual, expected, label, eps = 1e-9) {
  if (Math.abs(actual - expected) > eps) {
    throw new Error(`${label}: atteso ${expected}, trovato ${actual}`);
  }
}

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

record('1. V4 e V5 restano congelate', () => {
  assertEqual(LINE_SCALE_RATIO_V4, 0.979, 'V4 ratio');
  assertEqual(LINE_SCALE_RATIO_V5, 0.927, 'V5 ratio');
  assertEqual(BONUS_MYSTERY_D[3][0].x, 0.5, 'V4 50 chips');
  assert(MATH_V4.bonusFeature === BONUS_FEATURE_V4, 'V4 feature');
  assert(MATH_V5.bonusFeature === BONUS_FEATURE_V5, 'V5 feature');
  assert(MATH_V5.scatterFeature === SCATTER_FEATURE_V3, 'V5 FS');
  validateMathConfig(PAYLINE_DEFINITIONS, MATH_V4);
  validateMathConfig(PAYLINE_DEFINITIONS, MATH_V5);
});

record('2. V6 riusa V5 (pesi, Mystery, SCATTER)', () => {
  assert(MATH_V6.symbols === MATH_V5.symbols, 'stessa paytable');
  assert(MATH_V6.bonusFeature === BONUS_FEATURE_V5, 'stessa Table D');
  assert(MATH_V6.scatterFeature === SCATTER_FEATURE_V3, 'stesso FS');
  validateMathConfig(PAYLINE_DEFINITIONS, MATH_V6);
  assertEqual(PAYLINE_COUNT_BY_BET[100], 3, '100');
  assertEqual(PAYLINE_COUNT_BY_BET[500], 5, '500');
  assertEqual(PAYLINE_COUNT_BY_BET[1000], 8, '1k');
  assertEqual(PAYLINE_COUNT_BY_BET.max, 10, 'max');
  assertEqual(getActivePaylines(100).length, 3, 'active 100');
  assertEqual(getActivePaylines('max').length, 10, 'active max');
});

record('3. TEST A — 3 ♥️ su linea 1, 3 linee attive → win', () => {
  const grid = fillGrid({ 0: 'heart', 1: 'heart', 2: 'heart' });
  const evalResult = evaluateGrid(grid, getActivePaylines(100));
  assertEqual(evalResult.lineWins.length, 1, 'una linea');
  assertEqual(evalResult.lineWins[0].lineId, 'line-01', 'top');
  assertEqual(evalResult.lineWins[0].symbol, 'heart', 'heart');
  assertEqual(evalResult.lineWins[0].count, 3, 'count 3');
});

record('4. TEST B — 5 ♥️ sparsi, 10 linee → nessuna win ♥️', () => {
  const grid = [
    'club', 'club', 'heart', 'k', 'heart',
    'heart', 'spade', 'q', 'j', '777',
    'a', 'k', 'q', 'heart', 'heart',
  ];
  const evalResult = evaluateGrid(grid, PAYLINE_DEFINITIONS);
  const heartWins = evalResult.lineWins.filter((w) => w.symbol === 'heart');
  assertEqual(heartWins.length, 0, 'no heart lines');
});

record('5. TEST C — 5 ♥️ su linea 1 → heart x5', () => {
  const grid = fillGrid({ 0: 'heart', 1: 'heart', 2: 'heart', 3: 'heart', 4: 'heart' });
  const evalResult = evaluateGrid(grid, getActivePaylines(100));
  assertEqual(evalResult.lineWins[0].symbol, 'heart', 'heart');
  assertEqual(evalResult.lineWins[0].count, 5, 'count 5');
  const settled = settleSimulatedSpin(evalResult, MATH_V6.symbols, {
    totalBet: 100,
    paylineCount: 3,
  });
  const mult = MATH_V6.symbols.heart.payouts[5];
  assertClose(settled.lineReturn, (100 / 3) * mult, 'payout 5♥');
});

record('6. TEST D — due paylines vincenti, totale corretto', () => {
  const grid = fillGrid({
    0: 'a', 1: 'a', 2: 'a',
    5: 'k', 6: 'k', 7: 'k',
  });
  const evalResult = evaluateGrid(grid, getActivePaylines(100));
  assertEqual(evalResult.lineWins.length, 2, 'due linee');
  const ids = evalResult.lineWins.map((w) => w.lineId).sort().join(',');
  assertEqual(ids, 'line-01,line-02', 'top+mid');
  const settled = settleSimulatedSpin(evalResult, MATH_V6.symbols, {
    totalBet: 100,
    paylineCount: 3,
  });
  const expected = (100 / 3) * (MATH_V6.symbols.a.payouts[3] + MATH_V6.symbols.k.payouts[3]);
  assertClose(settled.lineReturn, expected, 'somma due linee');
});

record('7. TEST E — WILD completa ♥️', () => {
  const grid = fillGrid({ 0: 'heart', 1: 'wild', 2: 'heart' });
  const evalResult = evaluateGrid(grid, getActivePaylines(100));
  assertEqual(evalResult.lineWins.length, 1, 'una linea');
  assertEqual(evalResult.lineWins[0].symbol, 'heart', 'base heart');
  assertEqual(evalResult.lineWins[0].count, 3, 'count');
  assert(evalResult.lineWins[0].cellIndexes.includes(1), 'wild cell');
});

record('8. TEST F — BONUS/SCATTER non sono payline', () => {
  const grid = fillGrid({
    0: 'bonus', 1: 'bonus', 2: 'bonus',
    5: 'scatter', 6: 'scatter', 7: 'scatter',
  });
  const evalResult = evaluateGrid(grid, getActivePaylines('max'));
  assertEqual(evalResult.bonus.count, 3, 'bonus anywhere');
  assertEqual(evalResult.scatter.count, 3, 'scatter anywhere');
  assertEqual(evalResult.lineWins.length, 0, 'no line from bonus/scatter');
});

record('9. betPerLine = totale / N; V5 10 linee invariato a bet 100', () => {
  const grid = fillGrid({ 0: 'heart', 1: 'heart', 2: 'heart' });
  const all = evaluateGrid(grid, PAYLINE_DEFINITIONS);
  const v5 = settleSimulatedSpin(all, MATH_V5.symbols);
  const v6ten = settleSimulatedSpin(all, MATH_V6.symbols, {
    totalBet: 100,
    paylineCount: 10,
  });
  assertClose(v5.lineReturn, v6ten.lineReturn, '10 linee = V5');
  const three = evaluateGrid(grid, getActivePaylines(100));
  const v6three = settleSimulatedSpin(three, MATH_V6.symbols, {
    totalBet: 100,
    paylineCount: 3,
  });
  assert(v6three.lineReturn > v5.lineReturn, '3 linee pagano di più per-linea');
  const mystery = settleGuaranteedCashBonus(
    { bonus: { count: 3 } },
    MATH_V6,
    () => 0,
    500,
  );
  assertEqual(mystery.bonusReturn, 1250, 'mystery scala con bet 500');
  const mysteryV5 = settleGuaranteedCashBonus(
    { bonus: { count: 3 } },
    MATH_V5,
    () => 0,
  );
  assertEqual(mysteryV5.bonusReturn, 250, 'V5 default 100');
});

record('10. playPaidRound V6 3 linee + Mystery una sola estrazione', () => {
  const grid = fillGrid({ 0: 'bonus', 1: 'bonus', 2: 'bonus', 10: 'club', 11: 'spade' });
  const round = playPaidRound({
    pack: MATH_V6,
    nextGrid: queue([grid]),
    paylines: getActivePaylines(100),
    bonusRng: () => 0,
    totalBet: 100,
  });
  assertEqual(round.paidBet, 100, 'paidBet');
  assertEqual(round.baseSettle.bonusReturn, 250, 'mystery 250');
  assertEqual(round.freeSpinsGenerated, 0, 'no FS');
  assert(round.bonusDraw != null, 'un draw');
  assertEqual(round.bonusDraw.tier, 3, 'tier 3');
});

const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok);
console.log('');
console.log(`${passed}/${results.length} test passati`);
if (failed.length) process.exitCode = 1;
