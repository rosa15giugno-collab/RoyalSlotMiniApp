import { CONFIG } from './config.js';
import { resolveLine, symbolMeta } from './slot-engine.js';

/** @typedef {[number, number]} PaylineCoord [reel, row] */

export const PAYLINE_DEFINITIONS = [
  { id: 'h-top', name: 'Riga superiore', type: 'horizontal', coords: [[0, 0], [1, 0], [2, 0]] },
  { id: 'h-mid', name: 'Riga centrale', type: 'horizontal', coords: [[0, 1], [1, 1], [2, 1]] },
  { id: 'h-bot', name: 'Riga inferiore', type: 'horizontal', coords: [[0, 2], [1, 2], [2, 2]] },
  { id: 'v-left', name: 'Colonna sinistra', type: 'vertical', coords: [[0, 0], [0, 1], [0, 2]] },
  { id: 'v-mid', name: 'Colonna centrale', type: 'vertical', coords: [[1, 0], [1, 1], [1, 2]] },
  { id: 'v-right', name: 'Colonna destra', type: 'vertical', coords: [[2, 0], [2, 1], [2, 2]] },
  { id: 'd-tl-br', name: 'Diagonale TL-BR', type: 'diagonal', coords: [[0, 0], [1, 1], [2, 2]] },
  { id: 'd-tr-bl', name: 'Diagonale TR-BL', type: 'diagonal', coords: [[2, 0], [1, 1], [0, 2]] },
];

/** Linee abilitate per importo puntata. */
export const PAYLINES_BY_BET = {
  250: ['h-top', 'h-mid', 'h-bot'],
  500: ['h-top', 'h-mid', 'h-bot', 'v-left', 'v-mid', 'v-right'],
  1000: ['h-top', 'h-mid', 'h-bot', 'v-left', 'v-mid', 'v-right', 'd-tl-br', 'd-tr-bl'],
};

const paylineMap = new Map(PAYLINE_DEFINITIONS.map((line) => [line.id, line]));

export function getEnabledPaylines(bet = CONFIG.bet.default) {
  const ids = PAYLINES_BY_BET[bet] ?? PAYLINES_BY_BET[CONFIG.bet.default];
  return ids.map((id) => paylineMap.get(id)).filter(Boolean);
}

export function getSymbolsForLine(grid, line) {
  return line.coords.map(([reel, row]) => grid[reel][row]);
}

export function evaluatePayline(grid, line) {
  const symbols = getSymbolsForLine(grid, line);
  const resolved = resolveLine(symbols);

  if (!resolved) {
    return {
      line,
      symbols,
      win: false,
      match: null,
    };
  }

  const meta = symbolMeta(resolved.match);
  if (!meta || meta.isWild) {
    return {
      line,
      symbols,
      win: false,
      match: null,
    };
  }

  return {
    line,
    symbols,
    win: true,
    match: meta.id,
    payoutMultiplier: meta.payout,
  };
}

export function evaluateEnabledPaylines(grid, bet) {
  const enabledLines = getEnabledPaylines(bet);
  const results = enabledLines.map((line) => evaluatePayline(grid, line));

  return {
    bet,
    enabledLines,
    results,
    winningLines: results.filter((result) => result.win),
  };
}

export function calculateWinAmount(paylineEvaluation) {
  const bet = paylineEvaluation.bet;
  return paylineEvaluation.winningLines.reduce(
    (total, entry) => total + entry.payoutMultiplier * bet,
    0,
  );
}

export function formatWinningLinesSummary(winningLines) {
  if (!winningLines.length) return '';

  return winningLines
    .map((entry) => `${entry.line.name} (${entry.match.toUpperCase()} x3)`)
    .join(', ');
}

export function collectWinningCoords(winningLines) {
  const coords = new Set();

  winningLines.forEach((entry) => {
    entry.line.coords.forEach(([reel, row]) => coords.add(`${reel},${row}`));
  });

  return coords;
}

export function getGridCell(reels, reelIndex, rowIndex) {
  const strip = reels[reelIndex]?.querySelector('.reel__strip');
  if (!strip) return null;
  const cells = [...strip.querySelectorAll('.symbol-cell')];
  return cells[rowIndex] ?? null;
}

/** Legge la griglia 3×3 attualmente visibile nei rulli. */
export function readGridFromReels(reels) {
  const { count, visibleRows } = CONFIG.reels;
  return Array.from({ length: count }, (_, reelIndex) => {
    const strip = reels[reelIndex]?.querySelector('.reel__strip');
    const cells = [...strip.querySelectorAll('.symbol-cell')];
    return cells.slice(0, visibleRows).map((cell) => cell.dataset.symbol);
  });
}
