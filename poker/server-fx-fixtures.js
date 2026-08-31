/**
 * Local server-mode presentation fixtures.
 * Presentation only — no RNG, no wallet, no MATH_V6.
 */

import { freeSpinsForScatterCount } from './free-spin-award.js';

export const SERVER_FX_KINDS = Object.freeze([
  'spin',
  'scatter3',
  'scatter4',
  'scatter5',
  'fsWin',
]);

const SCATTER_CELLS = Object.freeze([10, 11, 12, 13, 14]);

export function parseServerFxKind(raw) {
  const kind = String(raw || '').trim().toLowerCase();
  if (kind === 'fswin') return 'fsWin';
  if (SERVER_FX_KINDS.includes(kind)) return kind;
  return '';
}

export function scatterCountForKind(kind) {
  if (kind === 'scatter3' || kind === 'fsWin') return 3;
  if (kind === 'scatter4') return 4;
  if (kind === 'scatter5') return 5;
  return 0;
}

export function expectedAudioSeq(kind) {
  const paid = [
    'spin-button',
    'reel-start',
    'reel-loop',
    'reel-stop-1',
    'reel-stop-2',
    'reel-stop-3',
    'reel-stop-4',
    'reel-stop-final',
  ];
  if (kind === 'spin') {
    return [...paid, 'line-win'];
  }
  const feature = ['scatter', 'free-spin-start', 'free-spin-loop', 'free-spin-end'];
  if (kind === 'fsWin') {
    return [...paid, 'line-win', ...feature];
  }
  return [...paid, ...feature];
}

export function buildServerFxRound(kind) {
  const parsed = parseServerFxKind(kind);
  if (!parsed) {
    throw new Error(`PokerSlot serverFx sconosciuto: ${kind}`);
  }
  const scatterCount = scatterCountForKind(parsed);
  const awarded = freeSpinsForScatterCount(scatterCount);
  const paidLineWin = parsed === 'spin' || parsed === 'fsWin';
  const grid = Array(15).fill('q');
  if (paidLineWin) {
    grid[0] = 'a';
    grid[1] = 'a';
    grid[2] = 'a';
  }
  const scatter_cell_indexes = SCATTER_CELLS.slice(0, scatterCount);
  scatter_cell_indexes.forEach((index) => {
    grid[index] = 'scatter';
  });
  const winning_lines = paidLineWin
    ? [{
        line_id: 'h-top',
        symbol: 'a',
        count: 3,
        cell_indexes: [0, 1, 2],
        all_wild: false,
      }]
    : [];

  const free_spins = Array.from({ length: awarded }, (_, index) => {
    const fsGrid = Array(15).fill('club');
    const fsWin = parsed === 'fsWin' && index === 0;
    if (fsWin) {
      fsGrid[0] = 'a';
      fsGrid[1] = 'a';
      fsGrid[2] = 'a';
    }
    return {
      index,
      grid: fsGrid,
      winning_lines: fsWin
        ? [{
            line_id: 'h-top',
            symbol: 'a',
            count: 3,
            cell_indexes: [0, 1, 2],
            all_wild: false,
          }]
        : [],
      scatter_count: 0,
      scatter_cell_indexes: [],
      bonus_count: 0,
      bonus_cell_indexes: [],
      base_win: fsWin ? 80 : 0,
    };
  });

  return {
    bet: 100,
    paid_spin: {
      grid,
      winning_lines,
      scatter_count: scatterCount,
      scatter_cell_indexes,
      bonus_count: 0,
      bonus_cell_indexes: [],
    },
    paid_spin_base_win: paidLineWin ? 120 : 0,
    mystery: null,
    mystery_draws: 0,
    free_spins_awarded: awarded,
    free_spins,
  };
}
