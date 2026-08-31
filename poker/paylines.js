/**
 * PokerSlot payline definitions.
 * Format: rows[col] = row index (0..2) for each of the 5 columns.
 * No rendering.
 *
 * PAYLINE_DEFINITIONS is a CANDIDATE set of 10 lines for math V0.
 * Not a locked production count.
 */

import { COLS, ROWS } from './game-config.js';

/**
 * @type {ReadonlyArray<{ id: string, rows: ReadonlyArray<number> }>}
 */
export const PAYLINE_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'line-01', rows: Object.freeze([0, 0, 0, 0, 0]) }),
  Object.freeze({ id: 'line-02', rows: Object.freeze([1, 1, 1, 1, 1]) }),
  Object.freeze({ id: 'line-03', rows: Object.freeze([2, 2, 2, 2, 2]) }),
  Object.freeze({ id: 'line-04', rows: Object.freeze([0, 1, 2, 1, 0]) }),
  Object.freeze({ id: 'line-05', rows: Object.freeze([2, 1, 0, 1, 2]) }),
  Object.freeze({ id: 'line-06', rows: Object.freeze([0, 0, 1, 2, 2]) }),
  Object.freeze({ id: 'line-07', rows: Object.freeze([2, 2, 1, 0, 0]) }),
  Object.freeze({ id: 'line-08', rows: Object.freeze([1, 0, 0, 0, 1]) }),
  Object.freeze({ id: 'line-09', rows: Object.freeze([1, 2, 2, 2, 1]) }),
  Object.freeze({ id: 'line-10', rows: Object.freeze([0, 1, 1, 1, 0]) }),
]);

/**
 * Progressive activation — first N lines of PAYLINE_DEFINITIONS.
 * Geometries are not reordered: line-01 top, line-02 mid, line-03 bot, then V / stairs.
 */
export const PAYLINE_COUNT_BY_BET = Object.freeze({
  100: 3,
  500: 5,
  1000: 8,
  max: 10,
});

export function activePaylineCount(betKey) {
  const n = PAYLINE_COUNT_BY_BET[betKey];
  return Number.isInteger(n) && n > 0 ? n : PAYLINE_DEFINITIONS.length;
}

export function getActivePaylines(betKey) {
  return PAYLINE_DEFINITIONS.slice(0, activePaylineCount(betKey));
}

export function paylineNumber(line) {
  const match = String(line?.id || '').match(/(\d+)$/);
  return match ? Number.parseInt(match[1], 10) : 0;
}

export function betPerLine(totalBet, lineCount) {
  const n = lineCount > 0 ? lineCount : 1;
  return totalBet / n;
}

/**
 * Row-major cell indexes for a payline: index = row * 5 + col.
 * @param {number[]} rows
 * @returns {number[]}
 */
export function lineCellIndexes(rows) {
  return rows.map((row, col) => row * COLS + col);
}

/**
 * Symbols sitting on a payline, left-to-right (col 0 → 4).
 * @param {string[]} grid
 * @param {{ rows: number[] }} line
 * @returns {string[]}
 */
export function getLineSymbols(grid, line) {
  return lineCellIndexes(line.rows).map((index) => grid[index]);
}

export { COLS, ROWS };
