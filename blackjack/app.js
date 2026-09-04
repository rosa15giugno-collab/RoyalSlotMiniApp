import { CONFIG } from '../js/config.js';
import { TelegramBridge } from '../js/telegram-bridge.js';
import { formatChips } from '../js/utils.js';
import { BETS, DEFAULT_BET, ERROR_COPY, RED_SUITS, SUIT_SYMBOL } from './layout.js';

const telegram = new TelegramBridge();

/**
 * Client idempotency:
 * - NEW user action → generate action_id, keep in state.pending until success.
 * - timeout/network → DO NOT mint a new id; retry SAME action_id / round_id / type.
 * - Primary recovery: retry pending action_id. /current only for player_turn resume.
 * - STAND response lost: retry same stand action_id (replay, never second credit).
 */
const state = {
  ui: 'idle',
  bet: DEFAULT_BET,
  balance: null,
  roundId: null,
  payload: null,
  /** @type {{ kind: 'start'|'hit'|'stand', actionId: string, bet?: number, roundId?: string } | null} */
  pending: null,
};

const dom = {
  dealerHand: document.getElementById('dealerHand'),
  playerHand: document.getElementById('playerHand'),
  dealerScore: document.getElementById('dealerScore'),
  playerScore: document.getElementById('playerScore'),
  outcome: document.getElementById('outcome'),
  balance: document.getElementById('balanceValue'),
  betValue: document.getElementById('betValue'),
  betPresets: document.getElementById('betPresets'),
  dealBtn: document.getElementById('dealBtn'),
  playActions: document.getElementById('playActions'),
  hitBtn: document.getElementById('hitBtn'),
  standBtn: document.getElementById('standBtn'),
  errorBox: document.getElementById('errorBox'),
};

function newActionId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `bj-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-Telegram-Init-Data': telegram.getInitData() || '',
  };
}

function busy() {
  return state.ui === 'starting' || state.ui === 'action_pending' || state.ui === 'recovering';
}

function setError(code) {
  const text = ERROR_COPY[code] || ERROR_COPY.NETWORK_ERROR;
  dom.errorBox.hidden = false;
  dom.errorBox.textContent = text;
}

function clearError() {
  dom.errorBox.hidden = true;
  dom.errorBox.textContent = '';
}

function setBusy(isBusy) {
  const playing = state.ui === 'playing' || state.ui === 'action_pending' || state.ui === 'recovering';
  const canBet = state.ui === 'idle' || state.ui === 'settled' || state.ui === 'error';
  dom.dealBtn.disabled = isBusy || playing;
  dom.hitBtn.disabled = isBusy || !playing;
  dom.standBtn.disabled = isBusy || !playing;
  dom.betPresets.querySelectorAll('button').forEach((btn) => {
    btn.disabled = isBusy || playing;
  });
  void canBet;
}

function cardEl(card) {
  const el = document.createElement('div');
  if (card?.hidden) {
    el.className = 'card card--hidden';
    el.innerHTML = '<span class="card__suit">◆</span>';
    el.setAttribute('aria-label', 'Carta coperta');
    return el;
  }
  const red = RED_SUITS.has(card.suit);
  el.className = `card${red ? ' card--red' : ''}`;
  const suit = SUIT_SYMBOL[card.suit] || card.suit;
  el.innerHTML = `<span class="card__rank">${card.rank}</span><span class="card__suit">${suit}</span>`;
  return el;
}

function paintHand(node, cards) {
  node.replaceChildren(...(cards || []).map(cardEl));
}

function paint() {
  const payload = state.payload;
  dom.betValue.textContent = String(state.bet);
  dom.balance.textContent = state.balance == null ? '—' : formatChips(state.balance);
  paintHand(dom.dealerHand, payload?.dealer_cards);
  paintHand(dom.playerHand, payload?.player_cards);
  if (!payload) {
    dom.dealerScore.textContent = '—';
    dom.playerScore.textContent = '—';
    dom.outcome.textContent = '';
  } else {
    const dealerShown = payload.status === 'settled'
      ? payload.dealer_score
      : payload.dealer_upcard_score;
    dom.dealerScore.textContent = dealerShown == null ? '—' : String(dealerShown);
    dom.playerScore.textContent = payload.player_score == null ? '—' : String(payload.player_score);
    let line = payload.message || '';
    if (payload.status === 'settled' && payload.outcome === 'a') {
      const bits = [`+${formatChips(payload.final_credit)} Chips`];
      if (payload.vip_applied) bits.push(`VIP ×${payload.vip_multiplier}`);
      if (payload.level_multiplier > 1) bits.push(`Livello ${payload.level_block}`);
      if (payload.daily_applied) bits.push(`Daily ×${payload.daily_multiplier}`);
      line = `${payload.message} · ${bits.join(' · ')}`;
    }
    dom.outcome.textContent = line;
  }
  const playing = state.ui === 'playing' || state.ui === 'action_pending' || state.ui === 'recovering';
  dom.playActions.hidden = !playing;
  // Hide DISTRIBUISCI while an active round is in play (resume or live).
  dom.dealBtn.hidden = playing;
  setBusy(busy());
}

function applyPayload(payload) {
  state.payload = payload;
  state.roundId = payload.round_id;
  if (typeof payload.bet === 'number') state.bet = payload.bet;
  if (typeof payload.balance_after === 'number') state.balance = payload.balance_after;
  if (payload.status === 'settled') state.ui = 'settled';
  else if (payload.status === 'player_turn') state.ui = 'playing';
  paint();
}

function errorCodeFromResponse(data, fallback) {
  const detail = data?.detail;
  if (typeof detail === 'string' && ERROR_COPY[detail]) return detail;
  return fallback;
}

function isNetworkError(error) {
  return !error?.code || error.code === 'NETWORK_ERROR' || error.code === 'CONNECTION_INTERRUPTED';
}

async function api(path, body, method = 'POST') {
  const url = `${CONFIG.api.baseUrl}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const options = {
      method,
      headers: authHeaders(),
      signal: controller.signal,
    };
    if (method !== 'GET' && body != null) {
      options.body = JSON.stringify(body);
    }
    const response = await fetch(url, options);
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    if (!response.ok) {
      const err = new Error(errorCodeFromResponse(data, 'NETWORK_ERROR'));
      err.code = errorCodeFromResponse(data, 'NETWORK_ERROR');
      throw err;
    }
    return data;
  } catch (error) {
    if (error.code && error.code !== 'NETWORK_ERROR') throw error;
    const err = new Error('NETWORK_ERROR');
    err.code = 'NETWORK_ERROR';
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function ensurePending(kind, fields = {}) {
  if (state.pending && state.pending.kind === kind) {
    return state.pending;
  }
  state.pending = { kind, actionId: newActionId(), ...fields };
  return state.pending;
}

function clearPending() {
  state.pending = null;
}

function pendingRequestBody(pending) {
  if (pending.kind === 'start') {
    return { bet: pending.bet, action_id: pending.actionId };
  }
  return {
    round_id: pending.roundId || state.roundId,
    action_id: pending.actionId,
  };
}

function pendingPath(pending) {
  if (pending.kind === 'start') return CONFIG.api.endpoints.blackjackStart;
  if (pending.kind === 'hit') return CONFIG.api.endpoints.blackjackHit;
  return CONFIG.api.endpoints.blackjackStand;
}

async function sendPending(pending) {
  return api(pendingPath(pending), pendingRequestBody(pending));
}

async function fetchCurrentRound() {
  return api(CONFIG.api.endpoints.blackjackCurrent, null, 'GET');
}

/**
 * On network/timeout: keep pending action_id, show verify message,
 * retry SAME action_id first; then GET /current to realign player_turn.
 * Never auto-HIT with a new action_id.
 */
async function recoverAfterNetwork() {
  const pending = state.pending;
  if (!pending) return false;
  state.ui = 'recovering';
  setError('CONNECTION_INTERRUPTED');
  paint();

  try {
    const payload = await sendPending(pending);
    clearPending();
    applyPayload(payload);
    clearError();
    return true;
  } catch (error) {
    if (!isNetworkError(error)) {
      clearPending();
      state.ui = state.roundId ? 'playing' : 'error';
      setError(error.code || 'NETWORK_ERROR');
      paint();
      return false;
    }
  }

  try {
    const current = await fetchCurrentRound();
    if (current?.has_active_round && current.round) {
      applyPayload(current.round);
      // Keep pending so a later user retry reuses the same action_id.
      state.ui = 'playing';
      setError('CONNECTION_INTERRUPTED');
      paint();
      return false;
    }
    // No open round: start/stand may have committed — retry same id for replay.
    if (pending.kind === 'start' || pending.kind === 'stand') {
      try {
        const payload = await sendPending(pending);
        clearPending();
        applyPayload(payload);
        clearError();
        return true;
      } catch (error) {
        if (!isNetworkError(error)) {
          clearPending();
          state.ui = 'error';
          setError(error.code || 'NETWORK_ERROR');
          paint();
          return false;
        }
      }
    }
  } catch {
    /* keep pending */
  }

  if (state.roundId) state.ui = 'playing';
  else state.ui = 'error';
  setError('CONNECTION_INTERRUPTED');
  paint();
  return false;
}

async function refreshBalance() {
  try {
    const data = await telegram.fetchBalance();
    if (typeof data?.balance === 'number') {
      state.balance = data.balance;
      paint();
    }
  } catch {
    /* keep last known balance */
  }
}

async function resumeRound() {
  try {
    const current = await fetchCurrentRound();
    if (current?.has_active_round && current.round) {
      applyPayload(current.round);
    }
  } catch {
    /* idle if resume fails */
  }
}

async function deal() {
  if (state.pending && state.pending.kind !== 'start') return;
  clearError();
  const pending = ensurePending('start', { bet: state.bet });
  state.ui = 'starting';
  paint();
  try {
    const payload = await sendPending(pending);
    clearPending();
    applyPayload(payload);
  } catch (error) {
    if (isNetworkError(error)) {
      await recoverAfterNetwork();
      await refreshBalance();
      return;
    }
    clearPending();
    state.ui = 'error';
    setError(error.code || 'NETWORK_ERROR');
    paint();
    await refreshBalance();
  }
}

async function play(kind) {
  if (state.pending && state.pending.kind !== kind) return;
  if (!state.roundId && !(state.pending && state.pending.kind === kind)) return;
  clearError();
  const pending = ensurePending(kind, { roundId: state.roundId });
  state.ui = 'action_pending';
  paint();
  try {
    const payload = await sendPending(pending);
    clearPending();
    applyPayload(payload);
  } catch (error) {
    if (isNetworkError(error)) {
      await recoverAfterNetwork();
      return;
    }
    clearPending();
    state.ui = state.roundId ? 'playing' : 'error';
    setError(error.code || 'NETWORK_ERROR');
    paint();
  }
}

function buildBets() {
  BETS.forEach((amount) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bet-chip';
    btn.dataset.bet = String(amount);
    btn.textContent = String(amount);
    btn.addEventListener('click', () => {
      if (busy() || state.ui === 'playing' || state.ui === 'action_pending') return;
      state.bet = amount;
      dom.betPresets.querySelectorAll('.bet-chip').forEach((el) => {
        el.classList.toggle('is-active', Number(el.dataset.bet) === state.bet);
      });
      paint();
    });
    if (amount === state.bet) btn.classList.add('is-active');
    dom.betPresets.append(btn);
  });
}

async function init() {
  telegram.init();
  buildBets();
  dom.dealBtn.addEventListener('click', () => {
    if (busy()) return;
    void deal();
  });
  dom.hitBtn.addEventListener('click', () => {
    if (busy()) return;
    void play('hit');
  });
  dom.standBtn.addEventListener('click', () => {
    if (busy()) return;
    void play('stand');
  });
  paint();
  await refreshBalance();
  await resumeRound();
}

init().catch((error) => {
  state.ui = 'error';
  setError('NETWORK_ERROR');
  paint();
  console.error('[Blackjack]', error);
});
