export const BETS = [100, 500, 1000];
export const DEFAULT_BET = 100;

export { SUIT_SYMBOL, RED_SUITS } from './card-ui.js';

export const ERROR_COPY = {
  INSUFFICIENT_BALANCE: 'Chips insufficienti',
  INVALID_BET: 'Puntata non valida',
  ROUND_NOT_FOUND: 'Mano non trovata',
  ROUND_ALREADY_SETTLED: 'Mano già conclusa',
  ROUND_NOT_OWNER: 'Questa mano non è tua',
  INVALID_ACTION: 'Azione non valida',
  ROUND_IN_PROGRESS: 'Hai già una mano in corso',
  NETWORK_ERROR: 'Errore di rete. Riprova.',
  CONNECTION_INTERRUPTED: 'Connessione interrotta. Verifico la mano…',
  USER_NOT_FOUND: 'Utente non trovato',
  AUTH_ERROR: 'Apri Blackjack direttamente da Telegram per giocare.',
};

/**
 * Presentational outcome helpers — no payout math.
 * Prefer server message; classify FX from payload fields only.
 */
export function classifyOutcome(payload) {
  if (!payload || payload.status !== 'settled') return null;
  const message = String(payload.message || '').toLowerCase();
  const outcome = String(payload.outcome || '').toLowerCase();
  const playerScore = Number(payload.player_score);
  const isBj = Boolean(payload.is_blackjack)
    || message.includes('blackjack')
    || outcome === 'blackjack'
    || outcome === 'bj';
  if (isBj) return 'blackjack';
  if (Number.isFinite(playerScore) && playerScore > 21) return 'bust';
  if (message.includes('sball') || message.includes('bust') || outcome === 'bust') return 'bust';
  if (
    message.includes('pareggio')
    || message.includes('push')
    || message.includes('restitu')
    || outcome === 'push'
    || outcome === 'p'
  ) return 'push';
  if (
    message.includes('pers')
    || message.includes('banco')
    || outcome === 'lose'
    || outcome === 'l'
    || outcome === 'dealer'
  ) return 'lose';
  if (
    payload.outcome === 'a'
    || message.includes('vinto')
    || message.includes('vinci')
    || outcome === 'win'
    || outcome === 'w'
    || (typeof payload.final_credit === 'number' && payload.final_credit > 0)
  ) return 'win';
  if (typeof payload.final_credit === 'number' && payload.final_credit === 0) return 'push';
  return 'lose';
}

export function outcomeHeadline(kind, payload) {
  const server = String(payload?.message || '').trim();
  if (kind === 'blackjack') return server || 'BLACKJACK';
  if (kind === 'win') return server || 'HAI VINTO';
  if (kind === 'push') return server || 'PAREGGIO';
  if (kind === 'bust') return server || 'SBALLATO';
  if (kind === 'lose') return server || 'IL BANCO VINCE';
  return server;
}

export function outcomeSubline(kind, payload, formatChips) {
  if (kind === 'blackjack' || kind === 'win') {
    if (typeof payload?.final_credit === 'number') {
      return `+${formatChips(payload.final_credit)} Chips`;
    }
    return '';
  }
  if (kind === 'push') return 'Puntata restituita';
  if (kind === 'bust') return 'Hai superato 21';
  return '';
}

/** Build payout breakdown rows only from fields present on the payload. */
export function buildPayoutRows(payload, formatChips) {
  if (!payload || payload.status !== 'settled') return [];
  if (!(typeof payload.final_credit === 'number' && payload.final_credit > 0)) return [];

  const rows = [];
  const base = payload.base_credit ?? payload.base_win ?? payload.base_payout;
  if (typeof base === 'number') {
    rows.push({ label: 'Vincita base', value: formatChips(base) });
  }

  if (payload.vip_applied && typeof payload.vip_extra === 'number') {
    const tier = payload.vip_tier || payload.vip_label || 'VIP';
    rows.push({ label: String(tier), value: `+${formatChips(payload.vip_extra)}` });
  } else if (payload.vip_applied && payload.vip_multiplier) {
    rows.push({ label: `VIP ×${payload.vip_multiplier}`, value: '' });
  }

  if (typeof payload.level_multiplier === 'number' && payload.level_multiplier > 1) {
    const block = payload.level_block != null ? ` ${payload.level_block}` : '';
    rows.push({ label: `Livello${block} ×${String(payload.level_multiplier).replace('.', ',')}`, value: '' });
  }

  if (payload.daily_applied && payload.daily_multiplier) {
    rows.push({ label: `Bonus Daily ×${payload.daily_multiplier}`, value: '' });
  }

  rows.push({ label: 'TOTALE', value: formatChips(payload.final_credit), total: true });
  return rows;
}
