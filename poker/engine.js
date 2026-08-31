/**
 * PokerSlot 5×3 evaluation engine.
 * Pure: no DOM, no fetch, no RNG, no balance, no payouts.
 *
 * Left-to-right from column 0. A win needs 3, 4 or 5 consecutive
 * compatible symbols; the run stops at the first incompatible cell.
 *
 * WILD substitutes PAY_SYMBOLS only — never scatter or bonus.
 * Leading WILDs take their base from the first later PAY_SYMBOL.
 * All-WILD (or 3–4 leading WILDs then scatter/bonus) is reported as
 * symbol=wild, allWild=true, with no payout attached.
 */

import {
  BONUS,
  CELL_COUNT,
  COLS,
  PAY_SYMBOLS,
  ROWS,
  SCATTER,
  WILD,
  isKnownSymbol,
  isPaySymbol,
} from './game-config.js';
import { PAYLINE_DEFINITIONS, lineCellIndexes } from './paylines.js';

const PAY_SET = new Set(PAY_SYMBOLS);
const ROW_MAX = ROWS - 1;

export class PokerEngineError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PokerEngineError';
  }
}

function assertGrid(grid) {
  if (!Array.isArray(grid)) {
    throw new PokerEngineError('Griglia non valida: atteso un array');
  }
  if (grid.length !== CELL_COUNT) {
    throw new PokerEngineError(
      `Griglia non valida: attesi ${CELL_COUNT} simboli, ricevuti ${grid.length}`,
    );
  }
  grid.forEach((id, index) => {
    if (id == null) {
      throw new PokerEngineError(`Griglia non valida: cella ${index} è ${id}`);
    }
    if (typeof id !== 'string' || !isKnownSymbol(id)) {
      throw new PokerEngineError(`Simbolo sconosciuto in cella ${index}: "${id}"`);
    }
  });
}

function assertPayline(line, index) {
  const label = line?.id != null ? `payline "${line.id}"` : `payline[${index}]`;
  if (!line || typeof line !== 'object') {
    throw new PokerEngineError(`${label}: oggetto mancante`);
  }
  if (typeof line.id !== 'string' || !line.id) {
    throw new PokerEngineError(`${label}: id mancante`);
  }
  if (!Array.isArray(line.rows) || line.rows.length !== COLS) {
    throw new PokerEngineError(
      `${label}: rows deve avere esattamente ${COLS} valori`,
    );
  }
  line.rows.forEach((row, col) => {
    if (!Number.isInteger(row) || row < 0 || row > ROW_MAX) {
      throw new PokerEngineError(
        `${label}: row ${row} in colonna ${col} fuori da 0..${ROW_MAX}`,
      );
    }
  });
}

function assertPaylines(paylines) {
  if (!Array.isArray(paylines)) {
    throw new PokerEngineError('Paylines non valide: atteso un array');
  }
  paylines.forEach((line, index) => assertPayline(line, index));
}

/**
 * Evaluate one payline. Returns a lineWin or null (no combination).
 *
 * WILD rules:
 * 1. Walk left → right from col 0.
 * 2. If all 5 are WILD → { symbol: wild, count: 5, allWild: true }.
 * 3. If the first non-WILD is scatter/bonus:
 *    WILD cannot substitute it. If there were already 3 or 4 leading
 *    WILDs, report that WILD run (allWild: true). Otherwise no win.
 * 4. Otherwise the first PAY_SYMBOL is the base. Count consecutive
 *    base-or-WILD cells from col 0. Stop at the first other symbol
 *    (including scatter/bonus). Win if count >= 3.
 */
export function evaluatePayline(grid, line) {
  assertGrid(grid);
  assertPayline(line, 0);

  const indexes = lineCellIndexes(line.rows);
  const cells = indexes.map((index) => grid[index]);

  let firstOther = -1;
  for (let col = 0; col < COLS; col += 1) {
    if (cells[col] !== WILD) {
      firstOther = col;
      break;
    }
  }

  if (firstOther === -1) {
    return {
      lineId: line.id,
      symbol: WILD,
      count: COLS,
      cellIndexes: indexes.slice(),
      allWild: true,
    };
  }

  const head = cells[firstOther];

  if (head === SCATTER || head === BONUS) {
    const wildCount = firstOther;
    if (wildCount >= 3) {
      return {
        lineId: line.id,
        symbol: WILD,
        count: wildCount,
        cellIndexes: indexes.slice(0, wildCount),
        allWild: true,
      };
    }
    return null;
  }

  if (!PAY_SET.has(head)) {
    throw new PokerEngineError(
      `Payline "${line.id}": simbolo non classificabile "${head}"`,
    );
  }

  let count = 0;
  for (let col = 0; col < COLS; col += 1) {
    const symbol = cells[col];
    if (symbol === head || symbol === WILD) {
      count += 1;
      continue;
    }
    break;
  }

  if (count < 3) return null;

  return {
    lineId: line.id,
    symbol: head,
    count,
    cellIndexes: indexes.slice(0, count),
    allWild: false,
  };
}

export function evaluatePaylines(grid, paylines) {
  assertGrid(grid);
  assertPaylines(paylines);
  const lineWins = [];
  paylines.forEach((line) => {
    const win = evaluatePayline(grid, line);
    if (win) lineWins.push(win);
  });
  return { lineWins };
}

function countSymbol(grid, symbolId) {
  const cellIndexes = [];
  grid.forEach((id, index) => {
    if (id === symbolId) cellIndexes.push(index);
  });
  return {
    count: cellIndexes.length,
    cellIndexes,
    triggered: cellIndexes.length >= 3,
  };
}

/** Scatter pays anywhere (not on paylines). 3+ → triggered. No chips. */
export function evaluateScatter(grid) {
  assertGrid(grid);
  return countSymbol(grid, SCATTER);
}

/** Bonus counted anywhere. 3+ → triggered. Feature not implemented. */
export function evaluateBonus(grid) {
  assertGrid(grid);
  return countSymbol(grid, BONUS);
}

/**
 * Full evaluation. `paylines` defaults to PAYLINE_DEFINITIONS.
 * No winAmount.
 */
export function evaluateGrid(grid, paylines = PAYLINE_DEFINITIONS) {
  assertGrid(grid);
  assertPaylines(paylines);
  const { lineWins } = evaluatePaylines(grid, paylines);
  return {
    lineWins,
    scatter: evaluateScatter(grid),
    bonus: evaluateBonus(grid),
  };
}

export { isPaySymbol, PAYLINE_DEFINITIONS };
