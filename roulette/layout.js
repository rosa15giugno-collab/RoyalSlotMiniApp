/**
 * Roulette Mini App — pure layout / bet helpers (no DOM, no payout math).
 */

export const BETS = [500, 1000, 2000];
export const DEFAULT_BET = 500;

/** European single-zero wheel order (clockwise from 0). */
export const EUROPEAN_WHEEL_ORDER = Object.freeze([
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
  24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
]);

export const RED_NUMBERS = Object.freeze(new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]));

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
  if (selection.betType === 'red') return 'ROSSO';
  if (selection.betType === 'black') return 'NERO';
  if (selection.betType === 'even') return 'PARI';
  if (selection.betType === 'odd') return 'DISPARI';
  if (selection.betType === 'dozen_1') return '1ª DECINA';
  if (selection.betType === 'dozen_2') return '2ª DECINA';
  if (selection.betType === 'dozen_3') return '3ª DECINA';
  return String(selection.betType);
}

export function buildSpinBody({ bet, betType, targetNumber, actionId }) {
  const body = {
    bet: Number(bet),
    bet_type: String(betType),
    action_id: String(actionId),
    target_number: null,
  };
  if (betType === 'straight') {
    body.target_number = Number(targetNumber);
  }
  return body;
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

function formatMult(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  if (Number.isInteger(n)) return String(n);
  return String(n).replace('.', ',');
}

/** Breakdown rows from server payload only — no client math. */
export function buildPayoutRows(payload, formatChips) {
  if (!payload?.won) return [];
  if (!(typeof payload.final_credit === 'number' && payload.final_credit > 0)) return [];

  const rows = [];
  const safeFormat = (value) => {
    try {
      return formatChips(value);
    } catch {
      return String(value);
    }
  };

  if (typeof payload.payout_base === 'number') {
    rows.push({ label: 'Vincita base', value: safeFormat(payload.payout_base) });
  }

  if (payload.vip_applied && Number(payload.vip_multiplier) > 1) {
    const pct = Math.round((Number(payload.vip_multiplier) - 1) * 100);
    rows.push({
      label: `VIP +${pct}%`,
      value: typeof payload.after_vip === 'number' ? safeFormat(payload.after_vip) : '',
    });
  }

  if (Number(payload.level_multiplier) > 1) {
    rows.push({
      label: `Livello ×${formatMult(payload.level_multiplier)}`,
      value: typeof payload.after_level === 'number' ? safeFormat(payload.after_level) : '',
    });
  }

  if (payload.daily_applied && Number(payload.daily_multiplier) > 1) {
    rows.push({
      label: `Bonus giornaliero ×${formatMult(payload.daily_multiplier)}`,
      value: '',
    });
  }

  rows.push({ label: 'TOTALE', value: `+${safeFormat(payload.final_credit)}`, emphasis: true });
  return rows;
}

export function isStraightWinPayload(payload) {
  return Boolean(payload?.won && payload?.bet_type === 'straight');
}

export function outcomeHeadline(payload) {
  if (!payload) return '';
  if (isStraightWinPayload(payload)) return 'NUMERO PIENO!';
  return payload.won ? 'HAI VINTO' : 'RITENTA';
}

export function outcomeKicker(payload) {
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
    after_vip: 1000,
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
    after_vip: 3000,
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
    after_vip: 18000,
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
    after_vip: 23400,
    after_level: 35100,
    daily_applied: true,
    daily_multiplier: 2,
    final_credit: 70200,
    vip_applied: true,
    vip_level: 3,
    vip_multiplier: 1.3,
    level_multiplier: 1.5,
    balance_before: 10000,
    balance_after: 79700,
    chips_delta: 69700,
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
    after_vip: 1300,
    after_level: 1950,
    daily_applied: true,
    daily_multiplier: 2,
    final_credit: 3900,
    vip_applied: true,
    vip_level: 3,
    vip_multiplier: 1.3,
    level_multiplier: 1.5,
    balance_before: 20000,
    balance_after: 23400,
    chips_delta: 3400,
    history_multiplier: 1.5,
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
