/**
 * INTEGER wallet settlement — not a MATH_V6 recalibration.
 * Run: node scripts/test-poker-wallet-chips.mjs
 */

import { formatChips } from '../js/utils.js';
import { CELL_COUNT } from '../poker/game-config.js';
import {
  MATH_V6,
  settleSimulatedSpin,
} from '../poker/math-config.js';
import {
  getActivePaylines,
} from '../poker/paylines.js';
import { evaluateGrid } from '../poker/engine.js';
import { playPaidRound } from '../poker/math-round.js';
import {
  WALLET_SETTLEMENT,
  toWalletChips,
  walletCreditsForRound,
} from '../poker/wallet-chips.js';

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

function displayWin(chips) {
  return formatChips(chips);
}

record('1. 579.375 → 579', () => {
  assertEqual(toWalletChips(579.375), 579, 'round');
});

record('2. 579.5 → 580', () => {
  assertEqual(toWalletChips(579.5), 580, 'half up');
});

record('3. 579.625 → 580', () => {
  assertEqual(toWalletChips(579.625), 580, 'above half');
});

record('4. 0 → 0', () => {
  assertEqual(toWalletChips(0), 0, 'zero');
});

record('5. intero resta invariato', () => {
  assertEqual(toWalletChips(250), 250, '250');
  assertEqual(toWalletChips(1000), 1000, '1000');
});

record('6. NaN / Infinity rifiutati', () => {
  let nanThrown = false;
  try {
    toWalletChips(Number.NaN);
  } catch (error) {
    nanThrown = error instanceof TypeError;
  }
  assert(nanThrown, 'NaN');
  let infThrown = false;
  try {
    toWalletChips(Number.POSITIVE_INFINITY);
  } catch (error) {
    infThrown = error instanceof TypeError;
  }
  assert(infThrown, '+Infinity');
  let negInfThrown = false;
  try {
    toWalletChips(Number.NEGATIVE_INFINITY);
  } catch (error) {
    negInfThrown = error instanceof TypeError;
  }
  assert(negInfThrown, '-Infinity');
});

record('7. 3♥ bet 100/3: float 579.375, wallet 579, UI = credito', () => {
  const grid = fillGrid({ 0: 'heart', 1: 'heart', 2: 'heart' });
  const evalResult = evaluateGrid(grid, getActivePaylines(100));
  const settled = settleSimulatedSpin(evalResult, MATH_V6.symbols, {
    totalBet: 100,
    paylineCount: 3,
  });
  assertClose(settled.lineReturn, 579.375, 'float line');
  const credited = toWalletChips(settled.lineReturn + settled.scatterReturn);
  assertEqual(credited, 579, 'wallet');
  assertEqual(displayWin(credited), formatChips(579), 'UI = credito');
  assert(displayWin(credited) !== formatChips(settled.lineReturn), 'non mostra i decimali');
});

record('8. round combinato: linee + Mystery + Scatter + FS, UI = crediti', () => {
  const paid = fillGrid({
    0: 'heart', 1: 'heart', 2: 'heart', 3: 'scatter', 4: 'scatter',
    5: 'k', 6: 'k', 7: 'k', 8: 'scatter',
    10: 'bonus', 11: 'bonus', 12: 'bonus',
  });
  const fsWin = fillGrid({ 0: 'heart', 1: 'heart', 2: 'heart' });
  const fsBlank = fillGrid({});
  const round = playPaidRound({
    pack: MATH_V6,
    nextGrid: queue([paid, fsWin, fsBlank, fsBlank, fsBlank, fsBlank]),
    paylines: getActivePaylines(100),
    bonusRng: () => 0,
    totalBet: 100,
  });
  assertEqual(round.baseEval.lineWins.length, 2, 'due line wins');
  assertEqual(round.baseEval.scatter.count, 3, '3 scatter');
  assertEqual(round.baseEval.bonus.count, 3, '3 bonus');
  assertEqual(round.freeSpinsGenerated, 5, '5 FS');
  assertEqual(round.baseSettle.bonusReturn, 250, 'mystery già intero');
  assert(round.bonusDraw && round.bonusDraw.tier === 3, 'un solo draw Mystery');

  const wallet = walletCreditsForRound(round);
  const paidFloat = round.baseSettle.lineReturn + round.baseSettle.scatterReturn;
  const paidCredit = toWalletChips(paidFloat);
  const mysteryCredit = toWalletChips(round.baseSettle.bonusReturn);
  const fsCredits = round.freeSpins.map((fs) => (
    toWalletChips(fs.settled.lineReturn + fs.settled.scatterReturn)
  ));
  const creditedTotal = paidCredit + mysteryCredit + fsCredits.reduce((s, n) => s + n, 0);

  assertEqual(wallet.paidLineScatter, paidCredit, 'paid credit event');
  assertEqual(wallet.mystery, mysteryCredit, 'mystery credit event');
  assertEqual(wallet.mystery, 250, 'mystery 250');
  assertEqual(wallet.freeSpins, fsCredits.reduce((s, n) => s + n, 0), 'FS credits');
  assertEqual(wallet.total, creditedTotal, 'somma eventi = wallet');
  assertEqual(displayWin(paidCredit), formatChips(paidCredit), 'plaque paid = credito');
  assertEqual(displayWin(mysteryCredit), formatChips(mysteryCredit), 'carta Mystery = credito');
  fsCredits.forEach((chips, i) => {
    if (chips > 0) {
      assertEqual(displayWin(chips), formatChips(chips), `plaque FS${i + 1} = credito`);
    }
  });
  assert(Number.isInteger(wallet.total), 'wallet integer');
  assertEqual(WALLET_SETTLEMENT.id, 'chips-integer-v1', 'settlement id');
});

record('9. MATH_V6 non arrotonda i moltiplicatori', () => {
  const grid = fillGrid({ 0: 'heart', 1: 'heart', 2: 'heart' });
  const settled = settleSimulatedSpin(
    evaluateGrid(grid, getActivePaylines(100)),
    MATH_V6.symbols,
    { totalBet: 100, paylineCount: 3 },
  );
  assert(settled.lineReturn !== Math.round(settled.lineReturn), 'float interno');
  assertClose(settled.lineReturn, 579.375, '579.375 resta float');
});

const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok);
console.log('');
console.log(`${passed}/${results.length} test passati`);
if (failed.length) process.exitCode = 1;
