/**
 * Roulette Mini App — pure layout / bet helpers (no DOM, no payout math).
 */

import {
  normalizeCorner,
  normalizeSplit,
  splitKey,
  cornerKey,
  uniqSorted,
} from './table-geometry.js?v=12';

export {
  TABLE_EDGE,
  ZERO_SPLIT_BAND,
  MAGNET,
  aimPreviewLabel,
  buildMagneticSnaps,
  coveredNumbers,
  isValidCornerNumbers,
  isValidSplitNumbers,
  normalizeCorner,
  normalizeSplit,
  numberCell,
  numbersInCell,
  pickMagneticSnap,
  resolveInsideSpot,
  resolveZeroSpot,
  uniqSorted,
} from './table-geometry.js?v=12';

export const BETS = [500, 1000, 2000];
export const DEFAULT_BET = 500;
export const CHIP_UNIT = 500;
export const MAX_TABLE_BETS = 44;
export const MAX_STRAIGHT_NUMBERS_PER_SPIN = 12;
export const MAX_DOZENS_PER_SPIN = 2;
export const MAX_COVERED_NUMBERS_PER_SPIN = 24;
export const MAX_TOTAL_STAKE_PER_SPIN = 10000;

const DOZEN_TYPES = new Set(['dozen_1', 'dozen_2', 'dozen_3']);
const COMPLEMENTARY_PAIRS = [
  ['COMPLEMENTARY_COLOR', ['red', 'black']],
  ['COMPLEMENTARY_PARITY', ['even', 'odd']],
  ['COMPLEMENTARY_RANGE', ['low', 'high']],
  ['COMPLEMENTARY_RANGE', ['1_18', '19_36']],
  ['COMPLEMENTARY_RANGE', ['low_18', 'high_18']],
];

/** European single-zero wheel order (clockwise from 0). */
export const EUROPEAN_WHEEL_ORDER = Object.freeze([
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
  24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
]);

export const RED_NUMBERS = Object.freeze(new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]));

export const BLACK_NUMBERS = Object.freeze(new Set([
  2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35,
]));

const EVEN_NUMBERS = Object.freeze(new Set([2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36]));
const ODD_NUMBERS = Object.freeze(new Set([1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 33, 35]));
const LOW_NUMBERS = Object.freeze(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]));
const HIGH_NUMBERS = Object.freeze(new Set([19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36]));
const DOZEN_RANGES = Object.freeze({
  dozen_1: Object.freeze([...Array(12)].map((_, i) => i + 1)),
  dozen_2: Object.freeze([...Array(12)].map((_, i) => i + 13)),
  dozen_3: Object.freeze([...Array(12)].map((_, i) => i + 25)),
});

export const OUTSIDE_BETS = Object.freeze([
  { type: 'red', label: 'ROSSO', className: 'bet-chip bet-chip--red' },
  { type: 'black', label: 'NERO', className: 'bet-chip bet-chip--black' },
  { type: 'even', label: 'PARI', className: 'bet-chip bet-chip--even' },
  { type: 'odd', label: 'DISPARI', className: 'bet-chip bet-chip--odd' },
]);

export const DOZEN_BETS = Object.freeze([
  { type: 'dozen_1', label: '1ª DECINA', range: '1–12' },
  { type: 'dozen_2', label: '2ª DECINA', range: '13–24' },
  { type: 'dozen_3', label: '3ª DECINA', range: '25–36' },
]);

export const ERROR_COPY = {
  INVALID_BET: 'Puntata non valida',
  INVALID_BET_TYPE: 'Tipo di puntata non valido',
  INVALID_STRAIGHT_TARGET: 'Seleziona un numero da 0 a 36',
  INSUFFICIENT_CHIPS: 'Chips insufficienti',
  INVALID_ACTION: 'Azione non valida',
  USER_NOT_FOUND: 'Utente non trovato',
  NETWORK_ERROR: 'Errore di rete. Riprova.',
  CONNECTION_INTERRUPTED: 'Connessione interrotta. Riprovo…',
  API_ERROR: 'Risposta non valida dal server. Riprova.',
  AUTH_ERROR: 'Apri Roulette direttamente da Telegram per giocare.',
  SELECT_BET: 'Seleziona una puntata sul tavolo',
  COMPLEMENTARY_COLOR: 'Non puoi coprire contemporaneamente Rosso e Nero.',
  COMPLEMENTARY_PARITY: 'Non puoi coprire contemporaneamente Pari e Dispari.',
  COMPLEMENTARY_RANGE: 'Non puoi coprire contemporaneamente 1–18 e 19–36.',
  MAX_DOZENS: 'Massimo 2 decine per giro.',
  MAX_STRAIGHT: 'Massimo 12 numeri pieni per giro.',
  MAX_TOTAL_STAKE: 'Puntata totale massima superata.',
  MAX_COVERED: 'Troppi numeri coperti nello stesso giro.',
};

export function pocketColor(number) {
  const n = Number(number);
  if (n === 0) return 'green';
  if (RED_NUMBERS.has(n)) return 'red';
  return 'black';
}

export function pocketColorLabel(color) {
  if (color === 'green') return 'Verde';
  if (color === 'red') return 'Rosso';
  if (color === 'black') return 'Nero';
  return '';
}

export function wheelIndexForNumber(number) {
  const idx = EUROPEAN_WHEEL_ORDER.indexOf(Number(number));
  return idx >= 0 ? idx : 0;
}

/** Degrees to rotate so `number` sits under the top marker (ball). */
export function wheelRotationForNumber(number, { spins = 5 } = {}) {
  const pockets = EUROPEAN_WHEEL_ORDER.length;
  const angle = 360 / pockets;
  const idx = wheelIndexForNumber(number);
  return spins * 360 - idx * angle;
}

export function betSelectionLabel(selection) {
  if (!selection?.betType) return '—';
  if (selection.betType === 'straight') {
    const n = selection.targetNumber;
    return Number.isFinite(n) ? `NUMERO ${n}` : 'NUMERO';
  }
  if (selection.betType === 'split') {
    const nums = uniqSorted(selection.numbers);
    return nums.length === 2 ? `CAVALLO ${nums.join('-')}` : 'CAVALLO';
  }
  if (selection.betType === 'corner') {
    const nums = uniqSorted(selection.numbers);
    return nums.length === 4 ? `CARRÉ ${nums.join('-')}` : 'CARRÉ';
  }
  if (selection.betType === 'red') return 'ROSSO';
  if (selection.betType === 'black') return 'NERO';
  if (selection.betType === 'even') return 'PARI';
  if (selection.betType === 'odd') return 'DISPARI';
  if (selection.betType === 'dozen_1') return '1ª DECINA';
  if (selection.betType === 'dozen_2') return '2ª DECINA';
  if (selection.betType === 'dozen_3') return '3ª DECINA';
  return String(selection.betType);
}

export function betKey(betType, targetNumber, numbers) {
  if (betType === 'straight') return `straight:${Number(targetNumber)}`;
  if (betType === 'split') return splitKey(numbers);
  if (betType === 'corner') return cornerKey(numbers);
  return String(betType || '');
}

export function rowKey(row) {
  return betKey(row?.betType, row?.targetNumber, row?.numbers);
}

export function totalBet(bets) {
  return (bets || []).reduce((sum, bet) => sum + Number(bet.amount || 0), 0);
}

export function numbersCoveredByBet(bet) {
  const betType = String(bet?.betType || '');
  if (betType === 'straight') {
    const n = Number(bet.targetNumber);
    return Number.isInteger(n) ? [n] : [];
  }
  if (betType === 'split' || betType === 'corner') return uniqSorted(bet.numbers);
  if (betType === 'red') return [...RED_NUMBERS];
  if (betType === 'black') return [...BLACK_NUMBERS];
  if (betType === 'even') return [...EVEN_NUMBERS];
  if (betType === 'odd') return [...ODD_NUMBERS];
  if (DOZEN_RANGES[betType]) return [...DOZEN_RANGES[betType]];
  if (betType === 'low' || betType === 'low_18' || betType === '1_18') return [...LOW_NUMBERS];
  if (betType === 'high' || betType === 'high_18' || betType === '19_36') return [...HIGH_NUMBERS];
  return [];
}

export function coveredNumberSet(bets) {
  const union = new Set();
  (bets || []).forEach((bet) => {
    numbersCoveredByBet(bet).forEach((n) => union.add(Number(n)));
  });
  return union;
}

export function validateBetSlip(bets) {
  const list = bets || [];
  if (!list.length) return 'INVALID_BET';
  const types = new Set(list.map((row) => String(row.betType || '')));
  for (const [code, pair] of COMPLEMENTARY_PAIRS) {
    if (pair.every((name) => types.has(name))) return code;
  }
  const dozenCount = [...types].filter((name) => DOZEN_TYPES.has(name)).length;
  if (dozenCount > MAX_DOZENS_PER_SPIN) return 'MAX_DOZENS';
  const straightNumbers = new Set(
    list.filter((row) => row.betType === 'straight').map((row) => Number(row.targetNumber)),
  );
  if (straightNumbers.size > MAX_STRAIGHT_NUMBERS_PER_SPIN) return 'MAX_STRAIGHT';
  if (totalBet(list) > MAX_TOTAL_STAKE_PER_SPIN) return 'MAX_TOTAL_STAKE';
  if (coveredNumberSet(list).size > MAX_COVERED_NUMBERS_PER_SPIN) return 'MAX_COVERED';
  return null;
}

export function isAllowedChip(amount) {
  return BETS.includes(Number(amount));
}

export function canAddChip(bets, amount, balance) {
  const chip = Number(amount);
  if (!isAllowedChip(chip)) return false;
  const used = totalBet(bets);
  if (used + chip > MAX_TOTAL_STAKE_PER_SPIN) return false;
  if (Number.isFinite(balance) && used + chip > balance) return false;
  return true;
}

function normalizePlacedBet(betType, targetNumber, numbers) {
  if (betType === 'straight') {
    const n = Number(targetNumber);
    if (!Number.isInteger(n) || n < 0 || n > 36) return { error: 'INVALID_STRAIGHT_TARGET' };
    return { betType, targetNumber: n, numbers: null };
  }
  if (betType === 'split') {
    const nums = normalizeSplit(numbers);
    if (!nums) return { error: 'INVALID_BET' };
    return { betType, targetNumber: null, numbers: nums };
  }
  if (betType === 'corner') {
    const nums = normalizeCorner(numbers);
    if (!nums) return { error: 'INVALID_BET' };
    return { betType, targetNumber: null, numbers: nums };
  }
  if (
    betType === 'red' || betType === 'black' || betType === 'even' || betType === 'odd'
    || betType === 'dozen_1' || betType === 'dozen_2' || betType === 'dozen_3'
  ) {
    return { betType, targetNumber: null, numbers: null };
  }
  return { error: 'INVALID_BET_TYPE' };
}

export function addChipToBets(bets, { betType, targetNumber, numbers, amount, balance }) {
  const chip = Number(amount);
  if (!isAllowedChip(chip)) {
    return { bets: bets || [], error: 'INVALID_BET' };
  }
  const placed = normalizePlacedBet(betType, targetNumber, numbers);
  if (placed.error) {
    return { bets: bets || [], error: placed.error };
  }
  const current = Array.isArray(bets) ? bets.map((row) => ({
    ...row,
    numbers: Array.isArray(row.numbers) ? [...row.numbers] : row.numbers,
  })) : [];
  if (Number.isFinite(balance) && totalBet(current) + chip > balance) {
    return { bets: current, error: 'INSUFFICIENT_CHIPS' };
  }
  const key = rowKey(placed);
  if (current.length >= MAX_TABLE_BETS && !current.some((row) => rowKey(row) === key)) {
    return { bets: current, error: 'INVALID_BET' };
  }
  const next = current.map((row) => ({
    ...row,
    numbers: Array.isArray(row.numbers) ? [...row.numbers] : row.numbers,
  }));
  const existing = next.find((row) => rowKey(row) === key);
  if (existing) {
    existing.amount = Number(existing.amount) + chip;
  } else {
    next.push({
      betType: placed.betType,
      targetNumber: placed.targetNumber,
      numbers: placed.numbers,
      amount: chip,
    });
  }
  const slipError = validateBetSlip(next);
  if (slipError) {
    return { bets: current, error: slipError };
  }
  return { bets: next, error: null };
}

export function clearBets() {
  return [];
}

export function spotChipClass(amount) {
  const n = Number(amount);
  if (n >= 2000) return 'spot-2000';
  if (n >= 1000) return 'spot-1000';
  return 'spot-500';
}

export function formatSpotLabel(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n % 1000 === 0) return `${n / 1000}k`;
  if (n > 1000 && n % 500 === 0) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function findPlacedBet(bets, betType, targetNumber, numbers) {
  const key = betKey(betType, targetNumber, numbers);
  return (bets || []).find((row) => rowKey(row) === key) || null;
}

export function betsSummaryLabel(bets) {
  const list = bets || [];
  if (!list.length) return '—';
  if (list.length === 1) {
    return betSelectionLabel({
      betType: list[0].betType,
      targetNumber: list[0].targetNumber,
    });
  }
  return `${list.length} PUNTATE`;
}

export function toApiBets(bets) {
  return (bets || []).map((row) => {
    const item = {
      bet_type: String(row.betType),
      amount: Number(row.amount),
    };
    if (row.betType === 'straight') {
      item.target_number = Number(row.targetNumber);
    }
    if (row.betType === 'split' || row.betType === 'corner') {
      item.numbers = uniqSorted(row.numbers);
    }
    return item;
  });
}

export function buildSpinBody({ bets, bet, betType, targetNumber, actionId }) {
  const list = Array.isArray(bets) && bets.length
    ? toApiBets(bets)
    : toApiBets([{
      betType,
      targetNumber: betType === 'straight' ? targetNumber : null,
      amount: bet,
    }]);
  return {
    action_id: String(actionId),
    bets: list,
  };
}

function previewBetWins(betType, targetNumber, numbers, number) {
  const n = Number(number);
  if (betType === 'straight') return n === Number(targetNumber);
  if (betType === 'split' || betType === 'corner') {
    return uniqSorted(numbers).includes(n);
  }
  if (betType === 'red') return pocketColor(n) === 'red';
  if (betType === 'black') return pocketColor(n) === 'black';
  if (betType === 'even') return n !== 0 && n % 2 === 0;
  if (betType === 'odd') return n !== 0 && n % 2 === 1;
  if (betType === 'dozen_1') return n >= 1 && n <= 12;
  if (betType === 'dozen_2') return n >= 13 && n <= 24;
  if (betType === 'dozen_3') return n >= 25 && n <= 36;
  return false;
}

function previewMultiplier(betType) {
  if (betType === 'straight') return 36;
  if (betType === 'split') return 18;
  if (betType === 'corner') return 9;
  if (String(betType).startsWith('dozen')) return 3;
  return 2;
}

/** Preview-only settlement mirror. Production never uses this. */
export function previewEvaluateBets(bets, number) {
  const rows = (bets || []).map((row) => {
    const won = previewBetWins(row.betType, row.targetNumber, row.numbers, number);
    const amount = Number(row.amount);
    const base_credit = won ? amount * previewMultiplier(row.betType) : 0;
    const out = {
      bet_type: row.betType,
      amount,
      target_number: row.betType === 'straight' ? Number(row.targetNumber) : null,
      won,
      base_credit,
    };
    if (row.betType === 'split' || row.betType === 'corner') {
      out.numbers = uniqSorted(row.numbers);
    }
    return out;
  });
  const total = totalBet(bets);
  const base_credit_total = rows.reduce((sum, row) => sum + row.base_credit, 0);
  const won = rows.some((row) => row.won);
  return {
    bets: rows,
    total_bet: total,
    base_credit_total,
    won,
    payout_base: base_credit_total,
    final_credit: base_credit_total,
    net_result: base_credit_total - total,
  };
}

export function pushHistory(history, entry, { limit = 10 } = {}) {
  const next = [
    {
      number: Number(entry.number),
      color: entry.color || pocketColor(entry.number),
    },
    ...(history || []),
  ];
  return next.slice(0, limit);
}

/** Breakdown rows from server payload only — no client math. */
export function buildPayoutRows(payload, formatChips) {
  if (!payload) return [];
  const safeFormat = (value) => {
    try {
      return formatChips(value);
    } catch {
      return String(value);
    }
  };
  const rows = [];
  const stake = payload.total_stake ?? payload.total_bet ?? payload.bet;
  if (typeof stake === 'number') {
    rows.push({ label: 'Puntata totale', value: safeFormat(stake) });
  }

  const standard = payload.standard_return ?? payload.total_base_return ?? payload.payout_base;
  if (Number(standard) > 0) {
    rows.push({ label: 'Vincita Roulette', value: safeFormat(standard) });
  }

  if (Number(payload.roulette_bonus) > 0) {
    rows.push({ label: 'BONUS CASINÒ', value: `+${safeFormat(payload.roulette_bonus)}` });
  }

  if (Number(payload.zero_bonus) > 0) {
    rows.push({ label: 'ZERO BONUS', value: `+${safeFormat(payload.zero_bonus)}` });
  }

  const total = payload.final_credit;
  if (typeof total === 'number') {
    rows.push({
      label: 'TOTALE',
      value: payload.won && total > 0 ? `+${safeFormat(total)}` : safeFormat(0),
      emphasis: true,
    });
  }
  return rows;
}

export function isStraightWinPayload(payload) {
  if (!payload?.won) return false;
  if (payload.bet_type === 'straight') return true;
  return Array.isArray(payload.bets)
    && payload.bets.some((row) => row?.won && row?.bet_type === 'straight');
}

export function isZeroBonusPayload(payload) {
  return Number(payload?.number) === 0 && Number(payload?.zero_bonus) > 0;
}

export function outcomeHeadline(payload) {
  if (!payload) return '';
  if (isZeroBonusPayload(payload)) return 'ZERO BONUS';
  if (isStraightWinPayload(payload)) return 'NUMERO PIENO!';
  return payload.won ? 'HAI VINTO' : 'RITENTA';
}

export function outcomeKicker(payload) {
  if (isZeroBonusPayload(payload)) {
    const extra = Number(payload.zero_bonus);
    return Number.isFinite(extra) ? `+${extra} Chips` : 'ZERO BONUS';
  }
  if (!isStraightWinPayload(payload)) return '';
  return 'GRANDE VINCITA';
}

export function outcomeSubline(payload, formatChips) {
  if (!payload) return '';
  const color = pocketColorLabel(payload.color || pocketColor(payload.number));
  const num = `${payload.number} · ${color}`.trim();
  if (payload.won && typeof payload.final_credit === 'number') {
    try {
      return `${num}  ·  +${formatChips(payload.final_credit)}`;
    } catch {
      return `${num}  ·  +${payload.final_credit}`;
    }
  }
  return num;
}

/** Preview / mock payloads — UI only. */
export const PREVIEW_SCENARIOS = {
  win_red: {
    action_id: 'preview-win-red',
    number: 32,
    color: 'red',
    parity: 'even',
    bet: 500,
    bet_type: 'red',
    target_number: null,
    won: true,
    payout_base: 1000,
    standard_return: 1000,
    base_net_profit: 500,
    theoretical_bonus: 0,
    roulette_bonus_cap: 5,
    roulette_bonus: 0,
    zero_stake: 0,
    zero_bonus: 0,
    total_stake: 500,
    after_vip: 500,
    after_level: 1000,
    daily_applied: false,
    daily_multiplier: 1,
    final_credit: 1000,
    vip_applied: false,
    vip_level: 0,
    vip_multiplier: 1,
    level_multiplier: 1,
    balance_before: 10000,
    balance_after: 10500,
    chips_delta: 500,
    history_multiplier: 1,
    xp_awarded: 0,
    streak_count: 0,
    streak_multiplier: 1,
    second_chance_applied: false,
    replayed: false,
  },
  win_dozen: {
    action_id: 'preview-win-dozen',
    number: 17,
    color: 'black',
    parity: 'odd',
    bet: 1000,
    bet_type: 'dozen_2',
    target_number: null,
    won: true,
    payout_base: 3000,
    standard_return: 3000,
    base_net_profit: 2000,
    theoretical_bonus: 0,
    roulette_bonus_cap: 10,
    roulette_bonus: 0,
    zero_stake: 0,
    zero_bonus: 0,
    total_stake: 1000,
    after_vip: 2000,
    after_level: 3000,
    daily_applied: false,
    daily_multiplier: 1,
    final_credit: 3000,
    vip_applied: false,
    vip_level: 0,
    vip_multiplier: 1,
    level_multiplier: 1,
    balance_before: 20000,
    balance_after: 22000,
    chips_delta: 2000,
    history_multiplier: 1,
    xp_awarded: 0,
    streak_count: 0,
    streak_multiplier: 1,
    second_chance_applied: false,
    replayed: false,
  },
  win_straight: {
    action_id: 'preview-win-straight',
    number: 17,
    color: 'black',
    parity: 'odd',
    bet: 500,
    bet_type: 'straight',
    target_number: 17,
    won: true,
    payout_base: 18000,
    standard_return: 18000,
    base_net_profit: 17500,
    theoretical_bonus: 0,
    roulette_bonus_cap: 5,
    roulette_bonus: 0,
    zero_stake: 0,
    zero_bonus: 0,
    total_stake: 500,
    after_vip: 17500,
    after_level: 18000,
    daily_applied: false,
    daily_multiplier: 1,
    final_credit: 18000,
    vip_applied: false,
    vip_level: 0,
    vip_multiplier: 1,
    level_multiplier: 1,
    balance_before: 10000,
    balance_after: 27500,
    chips_delta: 17500,
    history_multiplier: 1,
    xp_awarded: 0,
    streak_count: 0,
    streak_multiplier: 1,
    second_chance_applied: false,
    replayed: false,
  },
  win_straight_chain: {
    action_id: 'preview-win-straight-chain',
    number: 17,
    color: 'black',
    parity: 'odd',
    bet: 500,
    bet_type: 'straight',
    target_number: 17,
    won: true,
    payout_base: 18000,
    standard_return: 18000,
    base_net_profit: 17500,
    theoretical_bonus: 16625,
    roulette_bonus_cap: 5,
    roulette_bonus: 5,
    zero_stake: 0,
    zero_bonus: 0,
    total_stake: 500,
    after_vip: 22750,
    after_level: 34125,
    daily_applied: false,
    daily_multiplier: 1,
    final_credit: 18005,
    vip_applied: true,
    vip_level: 3,
    vip_multiplier: 1.3,
    level_multiplier: 1.5,
    balance_before: 10000,
    balance_after: 27505,
    chips_delta: 17505,
    history_multiplier: 1.5,
    xp_awarded: 0,
    streak_count: 0,
    streak_multiplier: 1,
    second_chance_applied: false,
    replayed: false,
  },
  lose_straight: {
    action_id: 'preview-lose-straight',
    number: 32,
    color: 'red',
    parity: 'even',
    bet: 500,
    bet_type: 'straight',
    target_number: 17,
    won: false,
    payout_base: 0,
    after_vip: 0,
    after_level: 0,
    daily_applied: false,
    daily_multiplier: 1,
    final_credit: 0,
    vip_applied: false,
    vip_level: 0,
    vip_multiplier: 1,
    level_multiplier: 1,
    balance_before: 10000,
    balance_after: 9500,
    chips_delta: -500,
    history_multiplier: 1,
    xp_awarded: 0,
    streak_count: 0,
    streak_multiplier: 1,
    second_chance_applied: false,
    replayed: false,
  },
  lose: {
    action_id: 'preview-lose',
    number: 0,
    color: 'green',
    parity: null,
    bet: 500,
    bet_type: 'red',
    target_number: null,
    won: false,
    payout_base: 0,
    after_vip: 0,
    after_level: 0,
    daily_applied: false,
    daily_multiplier: 1,
    final_credit: 0,
    vip_applied: false,
    vip_level: 0,
    vip_multiplier: 1,
    level_multiplier: 1,
    balance_before: 10000,
    balance_after: 9500,
    chips_delta: -500,
    history_multiplier: 1,
    xp_awarded: 0,
    streak_count: 0,
    streak_multiplier: 1,
    second_chance_applied: false,
    replayed: false,
  },
  win_full_chain: {
    action_id: 'preview-full-chain',
    number: 32,
    color: 'red',
    parity: 'even',
    bet: 500,
    bet_type: 'red',
    target_number: null,
    won: true,
    payout_base: 1000,
    standard_return: 1000,
    base_net_profit: 500,
    theoretical_bonus: 475,
    roulette_bonus_cap: 5,
    roulette_bonus: 5,
    zero_stake: 0,
    zero_bonus: 0,
    total_stake: 500,
    after_vip: 650,
    after_level: 975,
    daily_applied: false,
    daily_multiplier: 1,
    final_credit: 1005,
    vip_applied: true,
    vip_level: 3,
    vip_multiplier: 1.3,
    level_multiplier: 1.5,
    balance_before: 20000,
    balance_after: 20505,
    chips_delta: 505,
    history_multiplier: 1.5,
    xp_awarded: 0,
    streak_count: 0,
    streak_multiplier: 1,
    second_chance_applied: false,
    replayed: false,
  },
  win_zero: {
    action_id: 'preview-win-zero',
    number: 0,
    color: 'green',
    parity: null,
    bet: 500,
    bet_type: 'straight',
    target_number: 0,
    won: true,
    payout_base: 18000,
    standard_return: 18000,
    base_net_profit: 17500,
    theoretical_bonus: 0,
    roulette_bonus_cap: 5,
    roulette_bonus: 0,
    zero_stake: 500,
    zero_bonus: 250,
    total_stake: 500,
    after_vip: 17500,
    after_level: 17500,
    daily_applied: false,
    daily_multiplier: 1,
    final_credit: 18250,
    vip_applied: false,
    vip_level: 0,
    vip_multiplier: 1,
    level_multiplier: 1,
    balance_before: 10000,
    balance_after: 27750,
    chips_delta: 17750,
    history_multiplier: 1,
    xp_awarded: 0,
    streak_count: 0,
    streak_multiplier: 1,
    second_chance_applied: false,
    replayed: false,
  },
  /** Preview scene helpers (wrapped by preview.html). */
  spin_32_red: null,
  spin_17_black: null,
  spin_0_green: null,
};

PREVIEW_SCENARIOS.spin_32_red = {
  ...PREVIEW_SCENARIOS.win_red,
  number: 32,
  color: 'red',
  bet_type: 'red',
  won: true,
};

PREVIEW_SCENARIOS.spin_17_black = {
  ...PREVIEW_SCENARIOS.win_dozen,
  number: 17,
  color: 'black',
  bet_type: 'black',
  bet: 500,
  payout_base: 1000,
  after_vip: 1000,
  after_level: 1000,
  final_credit: 1000,
  vip_applied: false,
  vip_multiplier: 1,
  level_multiplier: 1,
  daily_applied: false,
  daily_multiplier: 1,
  won: true,
};

PREVIEW_SCENARIOS.spin_0_green = {
  ...PREVIEW_SCENARIOS.lose,
  number: 0,
  color: 'green',
  bet_type: 'red',
  won: false,
  final_credit: 0,
  balance_after: 9500,
};

PREVIEW_SCENARIOS.win_inside = {
  action_id: 'preview-win-inside',
  number: 17,
  color: 'black',
  parity: 'odd',
  bet: 2000,
  bet_type: 'straight',
  target_number: 17,
  total_bet: 2000,
  base_credit_total: 31500,
  net_result: 29500,
  bets: [
    { bet_type: 'straight', amount: 500, target_number: 17, won: true, base_credit: 18000 },
    { bet_type: 'split', amount: 500, numbers: [17, 20], won: true, base_credit: 9000 },
    { bet_type: 'corner', amount: 500, numbers: [17, 18, 20, 21], won: true, base_credit: 4500 },
    { bet_type: 'red', amount: 500, target_number: null, won: false, base_credit: 0 },
  ],
  won: true,
  payout_base: 31500,
  standard_return: 31500,
  roulette_bonus: 0,
  zero_bonus: 0,
  total_stake: 2000,
  after_vip: 31500,
  after_level: 31500,
  daily_applied: false,
  daily_multiplier: 1,
  final_credit: 31500,
  vip_applied: false,
  vip_level: 0,
  vip_multiplier: 1,
  level_multiplier: 1,
  balance_before: 20000,
  balance_after: 49500,
  balance: 49500,
  chips_delta: 29500,
  history_multiplier: 1,
  xp_awarded: 0,
  streak_count: 0,
  streak_multiplier: 1,
  second_chance_applied: false,
  replayed: false,
};

PREVIEW_SCENARIOS.win_multi = {
  action_id: 'preview-win-multi',
  number: 17,
  color: 'black',
  parity: 'odd',
  bet: 2000,
  bet_type: 'red',
  target_number: null,
  total_bet: 2000,
  base_credit_total: 21000,
  net_result: 19000,
  bets: [
    { bet_type: 'red', amount: 500, target_number: null, won: false, base_credit: 0 },
    { bet_type: 'dozen_2', amount: 1000, target_number: null, won: true, base_credit: 3000 },
    { bet_type: 'straight', amount: 500, target_number: 17, won: true, base_credit: 18000 },
  ],
  won: true,
  payout_base: 21000,
  standard_return: 21000,
  roulette_bonus: 0,
  zero_bonus: 0,
  total_stake: 2000,
  after_vip: 21000,
  after_level: 21000,
  daily_applied: false,
  daily_multiplier: 1,
  final_credit: 21000,
  vip_applied: false,
  vip_level: 0,
  vip_multiplier: 1,
  level_multiplier: 1,
  balance_before: 20000,
  balance_after: 39000,
  balance: 39000,
  chips_delta: 19000,
  history_multiplier: 1,
  xp_awarded: 0,
  streak_count: 0,
  streak_multiplier: 1,
  second_chance_applied: false,
  replayed: false,
};
