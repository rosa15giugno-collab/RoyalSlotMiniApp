export const BETS = [500, 1000, 2000];
export const DEFAULT_BET = 500;

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
 * Backend outcomes: "a" (win), "b" (lose), "push".
 */
export function classifyOutcome(payload) {
  if (!payload || payload.status !== 'settled') return null;
  const message = String(payload.message || '').toLowerCase();
  const outcome = String(payload.outcome || '').toLowerCase();
  const playerScore = Number(payload.player_score);
  const natural = Boolean(payload.natural_win || payload.player_blackjack || payload.is_blackjack);

  // Prefer authoritative backend codes before message heuristics.
  if (outcome === 'push' || outcome === 'p') return 'push';
  if (outcome === 'b' || outcome === 'lose' || outcome === 'l' || outcome === 'dealer') {
    if (Number.isFinite(playerScore) && playerScore > 21) return 'bust';
    if (message.includes('sball') || message.includes('bust')) return 'bust';
    return 'lose';
  }
  if (outcome === 'a' || outcome === 'win' || outcome === 'w' || outcome === 'blackjack' || outcome === 'bj') {
    if (natural || message.includes('blackjack') || outcome === 'blackjack' || outcome === 'bj') {
      return 'blackjack';
    }
    return 'win';
  }

  if (natural || message.includes('blackjack')) return 'blackjack';
  if (Number.isFinite(playerScore) && playerScore > 21) return 'bust';
  if (message.includes('sball') || message.includes('bust')) return 'bust';
  if (
    message.includes('pareggio')
    || message.includes('push')
    || message.includes('restitu')
  ) return 'push';
  if (
    message.includes('pers')
    || message.includes('banco vince')
  ) return 'lose';
  if (
    message.includes('vinto')
    || message.includes('vinci')
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
    if (typeof payload?.final_credit === 'number' && Number.isFinite(payload.final_credit)) {
      try {
        return `+${formatChips(payload.final_credit)} Chips`;
      } catch {
        return `+${payload.final_credit} Chips`;
      }
    }
    return '';
  }
  if (kind === 'push') return 'Puntata restituita';
  if (kind === 'bust') return 'Hai superato 21';
  return '';
}

function formatMult(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  if (Number.isInteger(n)) return String(n);
  return String(n).replace('.', ',');
}

/** Build payout breakdown rows only from fields present on the payload. */
export function buildPayoutRows(payload, formatChips) {
  if (!payload || payload.status !== 'settled') return [];
  if (!(typeof payload.final_credit === 'number' && payload.final_credit > 0)) return [];
  // Push refunds bet into final_credit — not a win breakdown.
  if (String(payload.outcome || '').toLowerCase() === 'push') return [];

  const rows = [];
  const safeFormat = (value) => {
    try {
      return formatChips(value);
    } catch {
      return String(value);
    }
  };

  // Backend field is payout_base (not base_credit).
  const base = payload.payout_base ?? payload.base_credit ?? payload.base_win ?? payload.base_payout;
  if (typeof base === 'number' && Number.isFinite(base)) {
    rows.push({ label: 'Vincita base', value: safeFormat(base) });
  }

  if (payload.streak_bonus_applied && Number(payload.streak_multiplier) > 1) {
    const after = payload.after_streak;
    rows.push({
      label: `Royal Streak ×${formatMult(payload.streak_multiplier)}`,
      value: typeof after === 'number' ? safeFormat(after) : '',
    });
  }

  if (payload.vip_applied && Number(payload.vip_multiplier) > 1) {
    const pct = Math.round((Number(payload.vip_multiplier) - 1) * 100);
    const after = payload.after_vip;
    rows.push({
      label: `VIP +${pct}%`,
      value: typeof after === 'number' ? safeFormat(after) : (
        typeof payload.vip_extra === 'number' ? `+${safeFormat(payload.vip_extra)}` : ''
      ),
    });
  } else if (payload.vip_applied && typeof payload.vip_extra === 'number') {
    const tier = payload.vip_tier || payload.vip_label || 'VIP';
    rows.push({ label: String(tier), value: `+${safeFormat(payload.vip_extra)}` });
  }

  if (typeof payload.level_multiplier === 'number' && payload.level_multiplier > 1) {
    const after = payload.after_level;
    rows.push({
      label: `Livello ×${formatMult(payload.level_multiplier)}`,
      value: typeof after === 'number' ? safeFormat(after) : '',
    });
  }

  if (payload.daily_applied && Number(payload.daily_multiplier) > 1) {
    rows.push({
      label: `Bonus giornaliero ×${formatMult(payload.daily_multiplier)}`,
      value: '',
    });
  }

  if (rows.length === 0) return [];
  rows.push({ label: 'TOTALE', value: safeFormat(payload.final_credit), total: true });
  return rows;
}

/** Streak badge copy — server fields only. */
export function streakBadgeText(payload) {
  const count = Number(payload?.streak_count || 0);
  const mult = Number(payload?.streak_multiplier || 1);
  if (!Number.isFinite(count) || count < 2) return '';
  if (count >= 10) return `🔥 ROYAL STREAK ×${formatMult(mult || 10)}`;
  return `🔥 SERIE ${count} · ×${formatMult(mult)}`;
}
