/**
 * PokerSlot engine tests — run: node scripts/test-poker-engine.mjs
 */

import { PAYLINE_DEFINITIONS } from '../poker/paylines.js';
import { evaluateGrid, PokerEngineError } from '../poker/engine.js';

const TOP = [{ id: 'h-top', rows: [0, 0, 0, 0, 0] }];
const MID = [{ id: 'h-mid', rows: [1, 1, 1, 1, 1] }];

const FILL_MID = ['j', 'k', 'q', 'diamond', 'heart'];
const FILL_BOT = ['club', 'spade', 'j', 'k', 'q'];

function grid(top, mid = FILL_MID, bot = FILL_BOT) {
  return [...top, ...mid, ...bot];
}

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
  if (!cond) throw new Error(message || 'assertion failed');
}

function assertEqual(actual, expected, label) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) {
    throw new Error(`${label}: atteso ${right}, ottenuto ${left}`);
  }
}

function expectThrow(fn, snippet) {
  let thrown = null;
  try {
    fn();
  } catch (error) {
    thrown = error;
  }
  if (!thrown) throw new Error('atteso un errore');
  if (!(thrown instanceof PokerEngineError)) {
    throw new Error(`atteso PokerEngineError, ottenuto ${thrown.name}: ${thrown.message}`);
  }
  if (snippet && !thrown.message.includes(snippet)) {
    throw new Error(`errore senza "${snippet}": ${thrown.message}`);
  }
}

function topWin(evalResult) {
  const wins = evalResult.lineWins.filter((w) => w.lineId === 'h-top');
  return wins[0] ?? null;
}

record('1. A A A → x3', () => {
  const out = evaluateGrid(grid(['a', 'a', 'a', 'k', 'j']), TOP);
  const win = topWin(out);
  assert(win, 'mancava lineWin');
  assertEqual(win.symbol, 'a', 'symbol');
  assertEqual(win.count, 3, 'count');
  assertEqual(win.allWild, false, 'allWild');
  assertEqual(win.cellIndexes, [0, 1, 2], 'cellIndexes');
});

record('2. A A A A → x4', () => {
  const out = evaluateGrid(grid(['a', 'a', 'a', 'a', 'j']), TOP);
  assertEqual(topWin(out).count, 4, 'count');
  assertEqual(topWin(out).symbol, 'a', 'symbol');
  assertEqual(topWin(out).cellIndexes, [0, 1, 2, 3], 'cellIndexes');
});

record('3. A A A A A → x5', () => {
  const out = evaluateGrid(grid(['a', 'a', 'a', 'a', 'a']), TOP);
  assertEqual(topWin(out).count, 5, 'count');
  assertEqual(topWin(out).cellIndexes, [0, 1, 2, 3, 4], 'cellIndexes');
});

record('4. A A K → nessuna vincita', () => {
  const out = evaluateGrid(grid(['a', 'a', 'k', 'a', 'a']), TOP);
  assertEqual(out.lineWins.length, 0, 'lineWins');
});

record('5. A WILD A → A x3', () => {
  const out = evaluateGrid(grid(['a', 'wild', 'a', 'k', 'j']), TOP);
  const win = topWin(out);
  assertEqual(win.symbol, 'a', 'symbol');
  assertEqual(win.count, 3, 'count');
  assertEqual(win.allWild, false, 'allWild');
});

record('6. WILD A A → A x3', () => {
  const out = evaluateGrid(grid(['wild', 'a', 'a', 'k', 'j']), TOP);
  const win = topWin(out);
  assertEqual(win.symbol, 'a', 'symbol');
  assertEqual(win.count, 3, 'count');
});

record('7. WILD WILD K K K → K x5', () => {
  const out = evaluateGrid(grid(['wild', 'wild', 'k', 'k', 'k']), TOP);
  const win = topWin(out);
  assertEqual(win.symbol, 'k', 'symbol');
  assertEqual(win.count, 5, 'count');
  assertEqual(win.allWild, false, 'allWild');
});

record('8. K WILD WILD K K → K x5', () => {
  const out = evaluateGrid(grid(['k', 'wild', 'wild', 'k', 'k']), TOP);
  const win = topWin(out);
  assertEqual(win.symbol, 'k', 'symbol');
  assertEqual(win.count, 5, 'count');
});

record('9. WILD non sostituisce SCATTER', () => {
  const out = evaluateGrid(grid(['a', 'wild', 'scatter', 'a', 'a']), TOP);
  assertEqual(out.lineWins.length, 0, 'lineWins');
  assertEqual(out.scatter.count, 1, 'scatter.count');
  assertEqual(out.scatter.triggered, false, 'scatter.triggered');
});

record('10. WILD non sostituisce BONUS', () => {
  const out = evaluateGrid(grid(['a', 'wild', 'bonus', 'a', 'a']), TOP);
  assertEqual(out.lineWins.length, 0, 'lineWins');
  assertEqual(out.bonus.count, 1, 'bonus.count');
  assertEqual(out.bonus.triggered, false, 'bonus.triggered');
});

record('11. 3 SCATTER anywhere → triggered', () => {
  const g = grid(
    ['scatter', 'a', 'k', 'q', 'j'],
    ['diamond', 'scatter', 'heart', 'spade', 'club'],
    ['777', 'a', 'scatter', 'k', 'q'],
  );
  const out = evaluateGrid(g, TOP);
  assertEqual(out.scatter.count, 3, 'count');
  assertEqual(out.scatter.triggered, true, 'triggered');
  assertEqual(out.scatter.cellIndexes, [0, 6, 12], 'cellIndexes');
});

record('12. 2 SCATTER → non triggered', () => {
  const g = grid(
    ['scatter', 'a', 'k', 'q', 'j'],
    ['diamond', 'scatter', 'heart', 'spade', 'club'],
    FILL_BOT,
  );
  const out = evaluateGrid(g, TOP);
  assertEqual(out.scatter.count, 2, 'count');
  assertEqual(out.scatter.triggered, false, 'triggered');
});

record('13. 3 BONUS anywhere → triggered', () => {
  const g = grid(
    ['bonus', 'a', 'k', 'q', 'j'],
    ['diamond', 'heart', 'bonus', 'spade', 'club'],
    ['777', 'a', 'k', 'bonus', 'q'],
  );
  const out = evaluateGrid(g, TOP);
  assertEqual(out.bonus.count, 3, 'count');
  assertEqual(out.bonus.triggered, true, 'triggered');
  assertEqual(out.bonus.cellIndexes, [0, 7, 13], 'cellIndexes');
});

record('14. 2 BONUS → non triggered', () => {
  const g = grid(
    ['bonus', 'a', 'k', 'q', 'j'],
    ['diamond', 'heart', 'bonus', 'spade', 'club'],
    FILL_BOT,
  );
  const out = evaluateGrid(g, TOP);
  assertEqual(out.bonus.count, 2, 'count');
  assertEqual(out.bonus.triggered, false, 'triggered');
});

record('15. più paylines vincenti nello stesso grid', () => {
  const g = grid(
    ['a', 'a', 'a', 'k', 'j'],
    ['q', 'q', 'q', 'q', 'j'],
    FILL_BOT,
  );
  const out = evaluateGrid(g, [...TOP, ...MID]);
  assertEqual(out.lineWins.length, 2, 'lineWins.length');
  const byId = Object.fromEntries(out.lineWins.map((w) => [w.lineId, w]));
  assertEqual(byId['h-top'].symbol, 'a', 'top symbol');
  assertEqual(byId['h-top'].count, 3, 'top count');
  assertEqual(byId['h-mid'].symbol, 'q', 'mid symbol');
  assertEqual(byId['h-mid'].count, 4, 'mid count');
});

record('16. grid length diversa da 15 → errore', () => {
  expectThrow(() => evaluateGrid(['a', 'a', 'a'], TOP), 'attesi 15');
});

record('17. simbolo sconosciuto → errore', () => {
  const g = grid(['a', 'banana', 'a', 'k', 'j']);
  expectThrow(() => evaluateGrid(g, TOP), 'sconosciuto');
});

record('18. payline con row fuori 0..2 → errore', () => {
  const bad = [{ id: 'bad', rows: [0, 0, 3, 0, 0] }];
  expectThrow(() => evaluateGrid(grid(['a', 'a', 'a', 'a', 'a']), bad), 'fuori da 0..2');
});

record('19. griglia senza vincite → risultato valido vuoto', () => {
  const g = grid(
    ['a', 'k', 'q', 'j', 'diamond'],
    ['heart', 'spade', 'club', '777', 'a'],
    ['k', 'q', 'j', 'diamond', 'heart'],
  );
  const out = evaluateGrid(g, PAYLINE_DEFINITIONS);
  assertEqual(out.lineWins, [], 'lineWins');
  assertEqual(out.scatter.triggered, false, 'scatter');
  assertEqual(out.bonus.triggered, false, 'bonus');
  assert(Array.isArray(out.lineWins), 'lineWins array');
});

record('20. combinazione all-WILD → wild x5 allWild', () => {
  const out = evaluateGrid(grid(['wild', 'wild', 'wild', 'wild', 'wild']), TOP);
  const win = topWin(out);
  assert(win, 'mancava lineWin all-wild');
  assertEqual(win.symbol, 'wild', 'symbol');
  assertEqual(win.count, 5, 'count');
  assertEqual(win.allWild, true, 'allWild');
  assertEqual(win.cellIndexes, [0, 1, 2, 3, 4], 'cellIndexes');
});

record('20b. 3 WILD + SCATTER → wild x3 allWild (no substitute)', () => {
  const out = evaluateGrid(grid(['wild', 'wild', 'wild', 'scatter', 'a']), TOP);
  const win = topWin(out);
  assertEqual(win.symbol, 'wild', 'symbol');
  assertEqual(win.count, 3, 'count');
  assertEqual(win.allWild, true, 'allWild');
  assertEqual(win.cellIndexes, [0, 1, 2], 'cellIndexes');
});

record('20c. 2 WILD + SCATTER → nessuna payline', () => {
  const out = evaluateGrid(grid(['wild', 'wild', 'scatter', 'a', 'a']), TOP);
  assertEqual(out.lineWins.length, 0, 'lineWins');
});

const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok);
console.log('');
console.log(`${passed}/${results.length} test passati`);
if (failed.length) {
  process.exitCode = 1;
}
