/**
 * PokerSlot overlay layout.
 * Percentages of royal_poker_base_v2.png (941 × 1672).
 *
 * Reel overlay measured on the inner black window of the v2 base:
 *   inner frame ≈ x 48–892, y 782–1308
 *   5×3 grid centered with uniform 22px gutters.
 */

export const BASE = {
  width: 941,
  height: 1672,
};

export const SYMBOL_FILES = [
  '777.png',
  'a.png',
  'k.png',
  'q.png',
  'j.png',
  'diamond.png',
  'heart.png',
  'spade.png',
  'club.png',
  'wild.png',
  'bonus.png',
  'scatter.png',
];

export const ASSETS = {
  base: '../assets/royal-poker/royal_poker_base_v2.png',
  symbolsDir: '../assets/royal-poker/symbols/',
  buttons: {
    100: '../assets/royal-poker/buttons/bet_100_active.png',
    500: '../assets/royal-poker/buttons/bet_500_active.png',
    1000: '../assets/royal-poker/buttons/bet_1k_active.png',
    max: '../assets/royal-poker/buttons/bet_max_active.png',
    spin: '../assets/royal-poker/buttons/spin.png',
  },
};

/** Five equal columns inside the v2 black reel window (px on 941×1672). */
const COL_PX = [
  { left: 66, width: 144 },
  { left: 232, width: 144 },
  { left: 398, width: 144 },
  { left: 564, width: 144 },
  { left: 730, width: 144 },
];

const CELL_H_PX = 150;
const GAP_PX = 22;
const PITCH_PX = CELL_H_PX + GAP_PX; // 172
const REEL_TOP_PX = 798;
const VIEWPORT_H_PX = 3 * CELL_H_PX + 2 * GAP_PX; // 494

function pctX(px) {
  return (px / BASE.width) * 100;
}

function pctY(px) {
  return (px / BASE.height) * 100;
}

export const REEL_METRICS = {
  cellHeightPct: pctY(CELL_H_PX),
  rowGapPct: pctY(GAP_PX),
  pitchPct: pctY(PITCH_PX),
  viewportHeightPct: pctY(VIEWPORT_H_PX),
  cellHeightPx: CELL_H_PX,
  rowGapPx: GAP_PX,
  pitchPx: PITCH_PX,
  viewportHeightPx: VIEWPORT_H_PX,
};

export const REELS = COL_PX.map((col) => ({
  left: pctX(col.left),
  top: pctY(REEL_TOP_PX),
  width: pctX(col.width),
  height: pctY(VIEWPORT_H_PX),
  cellHeight: pctY(CELL_H_PX),
  rowGap: pctY(GAP_PX),
  pitch: pctY(PITCH_PX),
}));

/**
 * Numeric values only — labels are already painted on the base art.
 * SALDO ink band x 102–205 (center 153.5 / 16.31%).
 * PUNTATA TOTALE ink band x 576–811 (center 693.5 / 73.70%).
 * Gold underline y 1330–1335; values sit in the dark band below it.
 */
export const HUD = {
  balance: { left: 5.6, top: 82.0, width: 22.1, height: 3.2 },
  bet: { left: 58.85, top: 82.0, width: 29.7, height: 3.2 },
  /** Above the black reel window, centered — does not cover SALDO / puntata / SPIN. */
  lines: { left: 36.5, top: 44.35, width: 27, height: 2.35 },
};

export const CONTROLS = {
  bets: [
    { id: '100', left: 7.6, top: 87.75, width: 13.6, height: 9.7 },
    { id: '500', left: 22.6, top: 87.75, width: 13.6, height: 9.7 },
    { id: '1000', left: 63.8, top: 87.75, width: 13.6, height: 9.7 },
    { id: 'max', left: 78.8, top: 87.75, width: 13.6, height: 9.7 },
  ],
  spin: { left: 40.55, top: 87.45, width: 18.9, height: 10.65 },
};

export const SPIN_TIMING = {
  extraCards: 36,
  stopMs: [1200, 1400, 1600, 1800, 2000],
};

export const BETS = {
  100: 100,
  500: 500,
  1000: 1000,
  /** MAX = 10 paylines. Stake is the amount actually deducted. */
  max: 2500,
};

/** 15 cells, row-major: 0–4 row1, 5–9 row2, 10–14 row3. Repeats allowed. */
export const DEMO_GRID = [
  '777.png',
  'a.png',
  'k.png',
  'q.png',
  'j.png',
  'diamond.png',
  'heart.png',
  'spade.png',
  'club.png',
  'wild.png',
  'bonus.png',
  'scatter.png',
  '777.png',
  'a.png',
  'k.png',
];
