/**
 * PokerSlot mathematical sandbox.
 * Experimental only — not production economy, not Chips, not backend.
 *
 * MATH_V0 = original paytable (preserved, reproducible)
 * MATH_V1 = same weights, line/all-wild payouts × 12.5, scatter unchanged
 * MATH_V2 = V1 paytable + 5 free spins on 3+ BONUS (no retrigger)
 * MATH_V3 = V1 paytable + free spins on SCATTER count (no retrigger)
 *           3→5, 4→7, >=5→10. BONUS stays in the table but is not the trigger.
 * MATH_V4 = V3 scatter FS (same awards) + Mystery BONUS D on the paid spin.
 *           Line/wild payouts = V0 × LINE_PAYOUT_SCALE_V4. Scatter paytable unchanged.
 * MATH_V5 = V4 weights / BONUS frequency / SCATTER FS / relative line paytable,
 *           new Mystery D chip scale, LINE_SCALE_RATIO_V5 as the only lever.
 * MATH_V6 = V5 paytable / Mystery D / SCATTER FS, progressive active paylines.
 *           betPerLine = totalBet / activeLineCount. Weights and Table D unchanged.
 */

import {
  ALL_SYMBOL_IDS,
  BONUS,
  CELL_COUNT,
  COLS,
  PAY_SYMBOLS,
  ROWS,
  SCATTER,
  WILD,
  isKnownSymbol,
} from './game-config.js';
import { PAYLINE_DEFINITIONS } from './paylines.js';

/** Shared relative weights. Must stay identical across V0, V1, V2, V3, V4 and V5. */
export const WEIGHTS = Object.freeze({
  777: 2,
  wild: 3,
  bonus: 3,
  scatter: 3,
  a: 5,
  k: 6,
  q: 7,
  j: 8,
  diamond: 10,
  heart: 11,
  spade: 12,
  club: 13,
});

export const LINE_PAYOUT_SCALE_V1 = 12.5;

/**
 * V4 global LINE scale (single lever). Scatter paytable is not scaled.
 * FASE 1: line-sensitive RTP ≈ paid LINE + FS LINE ≈ 90.04% on the V3 1M sample.
 * Mystery D adds ≈ 1.84–1.94 pt. Ratio 0.979 cuts ≈ 2.1% of LINE prizes
 * (≈ 1.89 pt) to aim TOTAL back at 95.30–95.40%.
 */
export const LINE_SCALE_RATIO_V4 = 0.979;
export const LINE_PAYOUT_SCALE_V4 = LINE_PAYOUT_SCALE_V1 * LINE_SCALE_RATIO_V4;

/**
 * V5 LINE scale. Mystery D chip scale raises theoretical Mystery RTP
 * from ≈ 1.83 pt to ≈ 6.52 pt (+4.69). Same BONUS frequency, so the
 * only compensation is this ratio vs V4's 0.979:
 *   0.979 × (1 − 4.692 / 88.15) ≈ 0.927
 * where 88.15% is V3 line-sensitive RTP × LINE_SCALE_RATIO_V4.
 */
export const LINE_SCALE_RATIO_V5 = 0.927;
export const LINE_PAYOUT_SCALE_V5 = LINE_PAYOUT_SCALE_V1 * LINE_SCALE_RATIO_V5;

export const SIM_BET = Object.freeze({
  TOTAL_BET: 100,
  PAYLINE_COUNT: 10,
});

export const BET_PER_LINE = SIM_BET.TOTAL_BET / SIM_BET.PAYLINE_COUNT;

function freezePayouts(payouts) {
  return payouts == null ? null : Object.freeze({ ...payouts });
}

function buildSymbols(payoutsById) {
  const symbols = {};
  ALL_SYMBOL_IDS.forEach((id) => {
    symbols[id] = Object.freeze({
      id,
      weight: WEIGHTS[id],
      payouts: freezePayouts(payoutsById[id]),
    });
  });
  return Object.freeze(symbols);
}

const PAYOUTS_V0 = Object.freeze({
  777: Object.freeze({ 3: 8, 4: 20, 5: 75 }),
  a: Object.freeze({ 3: 5, 4: 12, 5: 40 }),
  k: Object.freeze({ 3: 4, 4: 10, 5: 30 }),
  q: Object.freeze({ 3: 3, 4: 8, 5: 20 }),
  j: Object.freeze({ 3: 2.5, 4: 6, 5: 15 }),
  diamond: Object.freeze({ 3: 2, 4: 5, 5: 12 }),
  heart: Object.freeze({ 3: 1.5, 4: 4, 5: 10 }),
  spade: Object.freeze({ 3: 1.25, 4: 3, 5: 8 }),
  club: Object.freeze({ 3: 1, 4: 2.5, 5: 6 }),
  wild: Object.freeze({ 3: 10, 4: 30, 5: 100 }),
  scatter: Object.freeze({ 3: 2, 4: 10, 5: 50 }),
  bonus: null,
});

/** Explicit V1 table (V0 line/wild × 12.5; scatter copied). Not rounded. */
const PAYOUTS_V1 = Object.freeze({
  777: Object.freeze({ 3: 100, 4: 250, 5: 937.5 }),
  a: Object.freeze({ 3: 62.5, 4: 150, 5: 500 }),
  k: Object.freeze({ 3: 50, 4: 125, 5: 375 }),
  q: Object.freeze({ 3: 37.5, 4: 100, 5: 250 }),
  j: Object.freeze({ 3: 31.25, 4: 75, 5: 187.5 }),
  diamond: Object.freeze({ 3: 25, 4: 62.5, 5: 150 }),
  heart: Object.freeze({ 3: 18.75, 4: 50, 5: 125 }),
  spade: Object.freeze({ 3: 15.625, 4: 37.5, 5: 100 }),
  club: Object.freeze({ 3: 12.5, 4: 31.25, 5: 75 }),
  wild: Object.freeze({ 3: 125, 4: 375, 5: 1250 }),
  scatter: Object.freeze({ 3: 2, 4: 10, 5: 50 }),
  bonus: null,
});

export const MATH_V0 = Object.freeze({
  id: 'v0',
  version: 'V0-experimental',
  symbols: buildSymbols(PAYOUTS_V0),
  bonusFeature: null,
});

export const MATH_V1 = Object.freeze({
  id: 'v1',
  version: 'V1-experimental',
  symbols: buildSymbols(PAYOUTS_V1),
  bonusFeature: null,
});

/** V2 uses the V1 symbol table by reference — paytable is not copied or altered. */
export const BONUS_FEATURE_V2 = Object.freeze({
  id: 'free-spins-v2',
  triggerCount: 3,
  freeSpins: 5,
  retrigger: false,
});

export const MATH_V2 = Object.freeze({
  id: 'v2',
  version: 'V2-experimental',
  symbols: MATH_V1.symbols,
  bonusFeature: BONUS_FEATURE_V2,
});

/** V3 reuses the V1 symbol table by reference — paytable/weights are not copied.
 *  awards[5] is the prize for 5 or more scatters. */
export const SCATTER_FREE_SPINS_V3 = Object.freeze({
  3: 5,
  4: 7,
  5: 10,
});

export const SCATTER_FEATURE_V3 = Object.freeze({
  id: 'free-spins-v3',
  triggerSymbol: SCATTER,
  awards: SCATTER_FREE_SPINS_V3,
  retrigger: false,
});

export const MATH_V3 = Object.freeze({
  id: 'v3',
  version: 'V3-experimental',
  symbols: MATH_V1.symbols,
  bonusFeature: null,
  scatterFeature: SCATTER_FEATURE_V3,
});

function scaleLinePayoutsFromV0(scale) {
  const payouts = {
    scatter: PAYOUTS_V0.scatter,
    bonus: null,
  };
  [...PAY_SYMBOLS, WILD].forEach((id) => {
    payouts[id] = Object.freeze({
      3: PAYOUTS_V0[id][3] * scale,
      4: PAYOUTS_V0[id][4] * scale,
      5: PAYOUTS_V0[id][5] * scale,
    });
  });
  return payouts;
}

const PAYOUTS_V4 = scaleLinePayoutsFromV0(LINE_PAYOUT_SCALE_V4);

/** Mystery BONUS D — guaranteed cash × TOTAL_BET. Paid spin only. */
export const BONUS_MYSTERY_D = Object.freeze({
  3: Object.freeze([
    Object.freeze({ w: 60, x: 0.5 }),
    Object.freeze({ w: 30, x: 1 }),
    Object.freeze({ w: 10, x: 2 }),
  ]),
  4: Object.freeze([
    Object.freeze({ w: 50, x: 2 }),
    Object.freeze({ w: 30, x: 4 }),
    Object.freeze({ w: 15, x: 6 }),
    Object.freeze({ w: 5, x: 10 }),
  ]),
  5: Object.freeze([
    Object.freeze({ w: 40, x: 5 }),
    Object.freeze({ w: 30, x: 10 }),
    Object.freeze({ w: 20, x: 20 }),
    Object.freeze({ w: 10, x: 30 }),
  ]),
});

export const BONUS_FEATURE_V4 = Object.freeze({
  id: 'mystery-bonus-d',
  kind: 'guaranteed-cash',
  tables: BONUS_MYSTERY_D,
  paidSpinOnly: true,
  retrigger: false,
});

export const MATH_V4 = Object.freeze({
  id: 'v4',
  version: 'V4-experimental',
  symbols: buildSymbols(PAYOUTS_V4),
  bonusFeature: BONUS_FEATURE_V4,
  scatterFeature: SCATTER_FEATURE_V3,
});

const PAYOUTS_V5 = scaleLinePayoutsFromV0(LINE_PAYOUT_SCALE_V5);

/**
 * Mystery D V5 — same relative weights per BONUS tier as V4.
 * Multipliers × TOTAL_BET (100) → 250 / 500 / 750 / 1000 / 1500 / 2500 / 5000.
 * 50 and 100 chips are removed.
 */
export const BONUS_MYSTERY_D_V5 = Object.freeze({
  3: Object.freeze([
    Object.freeze({ w: 60, x: 2.5 }),
    Object.freeze({ w: 30, x: 5 }),
    Object.freeze({ w: 10, x: 7.5 }),
  ]),
  4: Object.freeze([
    Object.freeze({ w: 50, x: 5 }),
    Object.freeze({ w: 30, x: 7.5 }),
    Object.freeze({ w: 15, x: 10 }),
    Object.freeze({ w: 5, x: 15 }),
  ]),
  5: Object.freeze([
    Object.freeze({ w: 40, x: 10 }),
    Object.freeze({ w: 30, x: 15 }),
    Object.freeze({ w: 20, x: 25 }),
    Object.freeze({ w: 10, x: 50 }),
  ]),
});

export const BONUS_FEATURE_V5 = Object.freeze({
  id: 'mystery-bonus-d-v5',
  kind: 'guaranteed-cash',
  tables: BONUS_MYSTERY_D_V5,
  paidSpinOnly: true,
  retrigger: false,
});

export const MATH_V5 = Object.freeze({
  id: 'v5',
  version: 'V5-experimental',
  symbols: buildSymbols(PAYOUTS_V5),
  bonusFeature: BONUS_FEATURE_V5,
  scatterFeature: SCATTER_FEATURE_V3,
});

/** Same economy as V5; live game evaluates a bet-dependent prefix of the 10 lines. */
export const MATH_V6 = Object.freeze({
  id: 'v6',
  version: 'V6-experimental',
  symbols: MATH_V5.symbols,
  bonusFeature: BONUS_FEATURE_V5,
  scatterFeature: SCATTER_FEATURE_V3,
});

/** INTEGER chips settlement lives in wallet-chips.js — not a V6 recalibration. */

export const MATH_PACKS = Object.freeze({
  v0: MATH_V0,
  v1: MATH_V1,
  v2: MATH_V2,
  v3: MATH_V3,
  v4: MATH_V4,
  v5: MATH_V5,
  v6: MATH_V6,
});

/** Default alias: V0 remains the reproducible baseline. */
export const MATH_VERSION = MATH_V0.version;
export const MATH_SYMBOLS = MATH_V0.symbols;

export class PokerMathConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PokerMathConfigError';
  }
}

export function resolveMathPack(name = 'v0') {
  const key = String(name).trim().toLowerCase();
  const pack = MATH_PACKS[key];
  if (!pack) {
    throw new PokerMathConfigError(
      `Versione math sconosciuta "${name}". Usa: ${Object.keys(MATH_PACKS).join(', ')}`,
    );
  }
  return pack;
}

export function totalWeight(table = MATH_V0.symbols) {
  return Object.values(table).reduce((sum, entry) => sum + entry.weight, 0);
}

function assertNonNegativeNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new PokerMathConfigError(`${label} non valido: ${value}`);
  }
}

function assertV1Paytable(pack) {
  [...PAY_SYMBOLS, WILD].forEach((id) => {
    [3, 4, 5].forEach((count) => {
      const expected = PAYOUTS_V0[id][count] * LINE_PAYOUT_SCALE_V1;
      const actual = pack.symbols[id].payouts[count];
      if (actual !== expected) {
        throw new PokerMathConfigError(
          `V1 ${id} x${count}: atteso ${expected} (V0×${LINE_PAYOUT_SCALE_V1}), trovato ${actual}`,
        );
      }
    });
  });
  [3, 4, 5].forEach((count) => {
    if (pack.symbols[SCATTER].payouts[count] !== PAYOUTS_V0.scatter[count]) {
      throw new PokerMathConfigError(`V1 scatter x${count} deve restare uguale a V0`);
    }
  });
}

function assertV2Feature(pack) {
  if (pack.symbols !== MATH_V1.symbols) {
    throw new PokerMathConfigError('V2 deve riusare la stessa tabella simboli di V1');
  }
  const feature = pack.bonusFeature;
  if (!feature || feature.freeSpins !== 5 || feature.triggerCount !== 3 || feature.retrigger !== false) {
    throw new PokerMathConfigError(
      'V2 bonusFeature deve essere 3+ BONUS → 5 free spins, retrigger=false',
    );
  }
  if (pack.scatterFeature) {
    throw new PokerMathConfigError('V2 non deve avere scatterFeature');
  }
  if (MATH_V1.bonusFeature) {
    throw new PokerMathConfigError('V1 non deve avere bonusFeature');
  }
}

function assertV4Paytable(pack) {
  [...PAY_SYMBOLS, WILD].forEach((id) => {
    [3, 4, 5].forEach((count) => {
      const expected = PAYOUTS_V0[id][count] * LINE_PAYOUT_SCALE_V4;
      const actual = pack.symbols[id].payouts[count];
      if (actual !== expected) {
        throw new PokerMathConfigError(
          `V4 ${id} x${count}: atteso ${expected} (V0×${LINE_PAYOUT_SCALE_V4}), trovato ${actual}`,
        );
      }
    });
  });
  [3, 4, 5].forEach((count) => {
    if (pack.symbols[SCATTER].payouts[count] !== PAYOUTS_V0.scatter[count]) {
      throw new PokerMathConfigError(`V4 scatter x${count} deve restare uguale a V0`);
    }
  });
}

function assertV5Paytable(pack) {
  [...PAY_SYMBOLS, WILD].forEach((id) => {
    [3, 4, 5].forEach((count) => {
      const expected = PAYOUTS_V0[id][count] * LINE_PAYOUT_SCALE_V5;
      const actual = pack.symbols[id].payouts[count];
      if (actual !== expected) {
        throw new PokerMathConfigError(
          `V5 ${id} x${count}: atteso ${expected} (V0×${LINE_PAYOUT_SCALE_V5}), trovato ${actual}`,
        );
      }
    });
  });
  [3, 4, 5].forEach((count) => {
    if (pack.symbols[SCATTER].payouts[count] !== PAYOUTS_V0.scatter[count]) {
      throw new PokerMathConfigError(`V5 scatter x${count} deve restare uguale a V0`);
    }
  });
}

function assertMysteryTable(actual, expected, label) {
  if (!Array.isArray(actual) || actual.length !== expected.length) {
    throw new PokerMathConfigError(`${label}: tabella mystery di lunghezza errata`);
  }
  expected.forEach((row, index) => {
    if (actual[index].w !== row.w || actual[index].x !== row.x) {
      throw new PokerMathConfigError(
        `${label}[${index}]: atteso w=${row.w} x=${row.x}, trovato w=${actual[index]?.w} x=${actual[index]?.x}`,
      );
    }
  });
}

function assertV4Feature(pack) {
  if (pack.symbols === MATH_V1.symbols || pack.symbols === MATH_V3.symbols) {
    throw new PokerMathConfigError('V4 deve avere una tabella simboli propria (scala LINE diversa da V1/V3)');
  }
  if (MATH_V3.bonusFeature) {
    throw new PokerMathConfigError('V3 deve restare congelata: bonusFeature null');
  }
  if (MATH_V3.scatterFeature !== SCATTER_FEATURE_V3) {
    throw new PokerMathConfigError('V3 scatterFeature non deve essere stato sostituito');
  }
  if (pack.scatterFeature !== SCATTER_FEATURE_V3) {
    throw new PokerMathConfigError('V4 deve riusare SCATTER_FEATURE_V3 (stessi award FS)');
  }
  const feature = pack.bonusFeature;
  if (!feature || feature.kind !== 'guaranteed-cash' || feature.id !== 'mystery-bonus-d') {
    throw new PokerMathConfigError('V4 bonusFeature deve essere mystery-bonus-d guaranteed-cash');
  }
  if (feature.retrigger !== false || feature.paidSpinOnly !== true) {
    throw new PokerMathConfigError('V4 mystery BONUS: paidSpinOnly=true, retrigger=false');
  }
  if (feature.freeSpins != null) {
    throw new PokerMathConfigError('V4 BONUS non deve assegnare free spins');
  }
  assertMysteryTable(feature.tables[3], BONUS_MYSTERY_D[3], 'V4 BONUS x3');
  assertMysteryTable(feature.tables[4], BONUS_MYSTERY_D[4], 'V4 BONUS x4');
  assertMysteryTable(feature.tables[5], BONUS_MYSTERY_D[5], 'V4 BONUS x5+');
}

function assertV5Feature(pack) {
  if (pack.symbols === MATH_V1.symbols || pack.symbols === MATH_V4.symbols) {
    throw new PokerMathConfigError('V5 deve avere una tabella simboli propria (scala LINE diversa da V1/V4)');
  }
  if (MATH_V4.bonusFeature !== BONUS_FEATURE_V4) {
    throw new PokerMathConfigError('V4 deve restare congelata: bonusFeature V4');
  }
  if (MATH_V4.scatterFeature !== SCATTER_FEATURE_V3) {
    throw new PokerMathConfigError('V4 scatterFeature non deve essere stato sostituito');
  }
  if (pack.scatterFeature !== SCATTER_FEATURE_V3) {
    throw new PokerMathConfigError('V5 deve riusare SCATTER_FEATURE_V3 (stessi award FS)');
  }
  const feature = pack.bonusFeature;
  if (!feature || feature.kind !== 'guaranteed-cash' || feature.id !== 'mystery-bonus-d-v5') {
    throw new PokerMathConfigError('V5 bonusFeature deve essere mystery-bonus-d-v5 guaranteed-cash');
  }
  if (feature.retrigger !== false || feature.paidSpinOnly !== true) {
    throw new PokerMathConfigError('V5 mystery BONUS: paidSpinOnly=true, retrigger=false');
  }
  if (feature.freeSpins != null) {
    throw new PokerMathConfigError('V5 BONUS non deve assegnare free spins');
  }
  assertMysteryTable(feature.tables[3], BONUS_MYSTERY_D_V5[3], 'V5 BONUS x3');
  assertMysteryTable(feature.tables[4], BONUS_MYSTERY_D_V5[4], 'V5 BONUS x4');
  assertMysteryTable(feature.tables[5], BONUS_MYSTERY_D_V5[5], 'V5 BONUS x5+');
}

function assertV6Feature(pack) {
  if (MATH_V5.bonusFeature !== BONUS_FEATURE_V5) {
    throw new PokerMathConfigError('V5 deve restare congelata: bonusFeature V5');
  }
  if (MATH_V5.scatterFeature !== SCATTER_FEATURE_V3) {
    throw new PokerMathConfigError('V5 scatterFeature non deve essere stato sostituito');
  }
  if (MATH_V4.bonusFeature !== BONUS_FEATURE_V4) {
    throw new PokerMathConfigError('V4 deve restare congelata');
  }
  if (pack.symbols !== MATH_V5.symbols) {
    throw new PokerMathConfigError('V6 deve riusare la paytable V5 (stessi simboli)');
  }
  if (pack.bonusFeature !== BONUS_FEATURE_V5) {
    throw new PokerMathConfigError('V6 deve riusare BONUS_FEATURE_V5 (stessa Table D)');
  }
  if (pack.scatterFeature !== SCATTER_FEATURE_V3) {
    throw new PokerMathConfigError('V6 deve riusare SCATTER_FEATURE_V3');
  }
}

function assertV3Feature(pack) {
  if (pack.symbols !== MATH_V1.symbols) {
    throw new PokerMathConfigError('V3 deve riusare la stessa tabella simboli di V1');
  }
  if (pack.bonusFeature) {
    throw new PokerMathConfigError('V3 non deve usare BONUS come trigger (bonusFeature deve essere null)');
  }
  const feature = pack.scatterFeature;
  if (!feature || feature.triggerSymbol !== SCATTER || feature.retrigger !== false) {
    throw new PokerMathConfigError(
      'V3 scatterFeature deve essere SCATTER, retrigger=false',
    );
  }
  if (
    feature.awards?.[3] !== 5
    || feature.awards?.[4] !== 7
    || feature.awards?.[5] !== 10
  ) {
    throw new PokerMathConfigError('V3 awards devono essere 3→5, 4→7, >=5→10');
  }
}

export function validateMathConfig(paylines = PAYLINE_DEFINITIONS, pack = MATH_V0) {
  if (!(SIM_BET.TOTAL_BET > 0)) {
    throw new PokerMathConfigError(`TOTAL_BET deve essere > 0 (ora ${SIM_BET.TOTAL_BET})`);
  }
  if (SIM_BET.PAYLINE_COUNT !== 10) {
    throw new PokerMathConfigError(
      `PAYLINE_COUNT candidato deve essere 10 (ora ${SIM_BET.PAYLINE_COUNT})`,
    );
  }
  if (!Array.isArray(paylines) || paylines.length !== 10) {
    throw new PokerMathConfigError(
      `Paylines candidate: attese 10, trovate ${paylines?.length}`,
    );
  }

  paylines.forEach((line, index) => {
    if (!line?.id || !Array.isArray(line.rows) || line.rows.length !== COLS) {
      throw new PokerMathConfigError(
        `Payline[${index}] "${line?.id}": rows deve avere ${COLS} coordinate`,
      );
    }
    line.rows.forEach((row, col) => {
      if (!Number.isInteger(row) || row < 0 || row >= ROWS) {
        throw new PokerMathConfigError(
          `Payline "${line.id}": row ${row} in col ${col} fuori da 0..${ROWS - 1}`,
        );
      }
    });
  });

  const table = pack.symbols;
  ALL_SYMBOL_IDS.forEach((id) => {
    if (!table[id]) {
      throw new PokerMathConfigError(`${pack.version}: manca l'id "${id}"`);
    }
    if (table[id].weight !== WEIGHTS[id]) {
      throw new PokerMathConfigError(
        `${pack.version}: peso "${id}"=${table[id].weight} diverso da WEIGHTS (${WEIGHTS[id]})`,
      );
    }
  });

  Object.keys(table).forEach((id) => {
    if (!isKnownSymbol(id)) {
      throw new PokerMathConfigError(`id sconosciuto "${id}"`);
    }
    const entry = table[id];
    if (typeof entry.weight !== 'number' || !Number.isFinite(entry.weight) || entry.weight < 0) {
      throw new PokerMathConfigError(`Peso non valido per "${id}": ${entry.weight}`);
    }
    if (id === BONUS) {
      if (entry.payouts != null) {
        throw new PokerMathConfigError('BONUS non deve avere payout diretto');
      }
      return;
    }
    if (!entry.payouts) {
      throw new PokerMathConfigError(`Payout mancanti per "${id}"`);
    }
    Object.entries(entry.payouts).forEach(([count, payout]) => {
      assertNonNegativeNumber(payout, `payout ${id} x${count}`);
    });
  });

  if (totalWeight(table) !== 83) {
    throw new PokerMathConfigError(`Peso totale deve essere 83 (ora ${totalWeight(table)})`);
  }
  if (
    totalWeight(MATH_V0.symbols) !== totalWeight(MATH_V1.symbols)
    || totalWeight(MATH_V1.symbols) !== totalWeight(MATH_V2.symbols)
    || totalWeight(MATH_V2.symbols) !== totalWeight(MATH_V3.symbols)
    || totalWeight(MATH_V3.symbols) !== totalWeight(MATH_V4.symbols)
    || totalWeight(MATH_V4.symbols) !== totalWeight(MATH_V5.symbols)
    || totalWeight(MATH_V5.symbols) !== totalWeight(MATH_V6.symbols)
  ) {
    throw new PokerMathConfigError('I pesi V0, V1, V2, V3, V4, V5 e V6 devono coincidere');
  }
  if (BET_PER_LINE !== SIM_BET.TOTAL_BET / 10) {
    throw new PokerMathConfigError('BET_PER_LINE incoerente con TOTAL_BET / 10');
  }
  if (pack.id === 'v1' || pack.id === 'v2' || pack.id === 'v3') {
    assertV1Paytable(pack);
  }
  if (pack.id === 'v2') {
    assertV2Feature(pack);
  } else if (pack.id === 'v3') {
    assertV3Feature(pack);
  } else if (pack.id === 'v4') {
    assertV4Paytable(pack);
    assertV4Feature(pack);
  } else if (pack.id === 'v5') {
    assertV5Paytable(pack);
    assertV5Feature(pack);
  } else if (pack.id === 'v6') {
    assertV5Paytable(pack);
    assertV6Feature(pack);
  } else if (pack.bonusFeature || pack.scatterFeature) {
    throw new PokerMathConfigError(`${pack.version} non deve avere feature free-spin`);
  }
}

/** 3→5, 4→7, count >= 5 → awards[5] (10 FS). */
export function scatterFreeSpinsAwarded(count, scatterFeature) {
  if (!scatterFeature?.awards) return 0;
  if (count >= 5) return scatterFeature.awards[5] || 0;
  return scatterFeature.awards[count] || 0;
}

export function bonusCountTier(count) {
  if (count >= 5) return 5;
  if (count === 4 || count === 3) return count;
  return 0;
}

export function pickWeightedRow(rows, rng = Math.random) {
  let total = 0;
  for (let i = 0; i < rows.length; i += 1) total += rows[i].w;
  if (!(total > 0)) {
    throw new PokerMathConfigError('pickWeightedRow: peso totale <= 0');
  }
  let roll = rng() * total;
  for (let i = 0; i < rows.length; i += 1) {
    roll -= rows[i].w;
    if (roll < 0) return rows[i];
  }
  return rows[rows.length - 1];
}

export function isGuaranteedCashBonus(feature) {
  return Boolean(feature && feature.kind === 'guaranteed-cash');
}

/**
 * Mystery cash on the evaluated grid. Caller must apply only on the paid spin.
 * Always bonusReturn > 0 when triggered.
 */
export function settleGuaranteedCashBonus(
  evalResult,
  pack,
  rng = Math.random,
  totalBet = SIM_BET.TOTAL_BET,
) {
  const feature = pack?.bonusFeature;
  if (!isGuaranteedCashBonus(feature)) {
    return { triggered: false, tier: 0, x: 0, bonusReturn: 0 };
  }
  const tier = bonusCountTier(evalResult.bonus.count);
  if (!tier) {
    return { triggered: false, tier: 0, x: 0, bonusReturn: 0 };
  }
  const row = pickWeightedRow(feature.tables[tier], rng);
  const stake = totalBet > 0 ? totalBet : SIM_BET.TOTAL_BET;
  const bonusReturn = stake * row.x;
  if (!(bonusReturn > 0)) {
    throw new PokerMathConfigError(`Mystery payout non positivo: x=${row.x}`);
  }
  return { triggered: true, tier, x: row.x, bonusReturn };
}

export function createWeightedSampler(table = MATH_V0.symbols, rng = Math.random) {
  const ids = Object.keys(table);
  const cdf = [];
  let acc = 0;
  ids.forEach((id) => {
    acc += table[id].weight;
    cdf.push(acc);
  });
  const total = acc;
  if (!(total > 0)) {
    throw new PokerMathConfigError('Impossibile campionare: peso totale <= 0');
  }

  return function pick() {
    const roll = rng() * total;
    for (let i = 0; i < cdf.length; i += 1) {
      if (roll < cdf[i]) return ids[i];
    }
    return ids[ids.length - 1];
  };
}

export function generateWeightedGrid(pick, grid = new Array(CELL_COUNT)) {
  for (let i = 0; i < CELL_COUNT; i += 1) {
    grid[i] = pick();
  }
  return grid;
}

export function assertSimGrid(grid) {
  if (!Array.isArray(grid) || grid.length !== CELL_COUNT) {
    throw new PokerMathConfigError(
      `Griglia simulata non valida: attese ${CELL_COUNT} celle`,
    );
  }
  for (let i = 0; i < grid.length; i += 1) {
    if (grid[i] == null || !isKnownSymbol(grid[i])) {
      throw new PokerMathConfigError(`Cella ${i} invalida: ${grid[i]}`);
    }
  }
}

export function linePayoutMultiplier(lineWin, symbols = MATH_V0.symbols) {
  const count = lineWin.count;
  if (count < 3 || count > 5) return 0;
  if (lineWin.allWild) {
    return symbols[WILD].payouts[count] ?? 0;
  }
  const entry = symbols[lineWin.symbol];
  if (!entry?.payouts) return 0;
  return entry.payouts[count] ?? 0;
}

export function scatterPayoutMultiplier(count, symbols = MATH_V0.symbols) {
  if (count >= 5) return symbols[SCATTER].payouts[5];
  if (count === 4) return symbols[SCATTER].payouts[4];
  if (count === 3) return symbols[SCATTER].payouts[3];
  return 0;
}

export function settleSimulatedSpin(evalResult, symbols = MATH_V0.symbols, options = {}) {
  const totalBet = options.totalBet > 0 ? options.totalBet : SIM_BET.TOTAL_BET;
  const paylineCount = options.paylineCount > 0
    ? options.paylineCount
    : SIM_BET.PAYLINE_COUNT;
  const stakePerLine = totalBet / paylineCount;
  let lineReturn = 0;
  evalResult.lineWins.forEach((win) => {
    lineReturn += stakePerLine * linePayoutMultiplier(win, symbols);
  });
  const scatterReturn = totalBet * scatterPayoutMultiplier(
    evalResult.scatter.count,
    symbols,
  );
  return {
    lineReturn,
    scatterReturn,
    bonusReturn: 0,
    totalReturn: lineReturn + scatterReturn,
  };
}

export { PAY_SYMBOLS, WILD, SCATTER, BONUS, CELL_COUNT };
