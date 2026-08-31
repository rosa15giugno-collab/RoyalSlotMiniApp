/**
 * PokerSlot logical symbol catalog.
 * No CSS, no payouts, no RNG.
 */

export const ROWS = 3;
export const COLS = 5;
export const CELL_COUNT = ROWS * COLS;

/** Pay symbols — WILD may substitute these only. */
export const PAY_SYMBOLS = Object.freeze([
  '777',
  'a',
  'k',
  'q',
  'j',
  'diamond',
  'heart',
  'spade',
  'club',
]);

export const WILD = 'wild';
export const SCATTER = 'scatter';
export const BONUS = 'bonus';

export const SPECIAL_SYMBOLS = Object.freeze([WILD, SCATTER, BONUS]);

/** id → runtime filename (assets/royal-poker/symbols/) */
export const SYMBOL_FILE_BY_ID = Object.freeze({
  777: '777.png',
  a: 'a.png',
  k: 'k.png',
  q: 'q.png',
  j: 'j.png',
  diamond: 'diamond.png',
  heart: 'heart.png',
  spade: 'spade.png',
  club: 'club.png',
  wild: 'wild.png',
  scatter: 'scatter.png',
  bonus: 'bonus.png',
});

export const SYMBOL_ID_BY_FILE = Object.freeze(
  Object.fromEntries(
    Object.entries(SYMBOL_FILE_BY_ID).map(([id, file]) => [file, id]),
  ),
);

export const ALL_SYMBOL_IDS = Object.freeze([
  ...PAY_SYMBOLS,
  ...SPECIAL_SYMBOLS,
]);

const PAY_SET = new Set(PAY_SYMBOLS);
const ID_SET = new Set(ALL_SYMBOL_IDS);

export function isPaySymbol(id) {
  return PAY_SET.has(id);
}

export function isKnownSymbol(id) {
  return ID_SET.has(id);
}

export function filenameFromId(id) {
  const file = SYMBOL_FILE_BY_ID[id];
  if (!file) {
    throw new Error(`PokerSlot: id simbolo sconosciuto "${id}"`);
  }
  return file;
}

export function idFromFilename(file) {
  const id = SYMBOL_ID_BY_FILE[file];
  if (!id) {
    throw new Error(`PokerSlot: filename simbolo sconosciuto "${file}"`);
  }
  return id;
}

/** Convert a 15-cell filename grid (demo renderer) to logical ids. */
export function idsFromFilenames(files) {
  if (!Array.isArray(files)) {
    throw new Error('PokerSlot: atteso un array di filename');
  }
  return files.map((file) => idFromFilename(file));
}
