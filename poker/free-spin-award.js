/**
 * PokerSlot frontend free-spin award mapping.
 * Mirrors V3 math: 3→5, 4→7, >=5→10. No paytable, no engine, no DOM.
 */

export const FREE_SPINS_BY_SCATTER = Object.freeze({
  3: 5,
  4: 7,
  5: 10,
});

/** 3→5, 4→7, 5 or more→10. Invalid / <3 → 0. */
export function freeSpinsForScatterCount(count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n < 3) return 0;
  if (n === 3) return 5;
  if (n === 4) return 7;
  return 10;
}

/** Overlay has 5 pips; 5+ scatter lights all five. */
export function overlayPipCount(scatterCount) {
  const n = Number(scatterCount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(5, n);
}

export function overlayScatterLabel(scatterCount) {
  return `${scatterCount} SCATTER`;
}
