import { CONFIG } from '../js/config.js';
import { TelegramBridge } from '../js/telegram-bridge.js';
import { formatChips } from '../js/utils.js';
import {
  balanceLabel,
  controlsDisabled,
  errorCodeFromHttp,
  hasInitData,
  isRecoverableNetworkError,
} from './auth-state.js';
import {
  animateBalanceText,
  animateDealerReveal,
  animateHitCard,
  animateInitialDeal,
} from './animations.js';
import { BlackjackAudio } from './audio.js';
import { createCardElement } from './card-ui.js';
import {
  BETS,
  DEFAULT_BET,
  ERROR_COPY,
  buildPayoutRows,
  classifyOutcome,
  outcomeHeadline,
  outcomeSubline,
} from './layout.js';

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
  authenticated: false,
  animating: false,
  /** @type {{ kind: 'start'|'hit'|'stand', actionId: string, bet?: number, roundId?: string } | null} */
  pending: null,
};

const dom = {
  app: document.getElementById('app'),
  dealerHand: document.getElementById('dealerHand'),
  playerHand: document.getElementById('playerHand'),
  dealerScore: document.getElementById('dealerScore'),
  playerScore: document.getElementById('playerScore'),
  softHint: document.getElementById('softHint'),
  outcomePanel: document.getElementById('outcomePanel'),
  outcomeTitle: document.getElementById('outcomeTitle'),
  outcomeSub: document.getElementById('outcomeSub'),
  breakdown: document.getElementById('breakdown'),
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
  return state.ui === 'starting'
    || state.ui === 'action_pending'
    || state.ui === 'recovering'
    || state.animating;
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
  const flags = controlsDisabled({
    authenticated: state.authenticated,
    busy: isBusy || state.animating,
    playing,
  });
  dom.dealBtn.disabled = flags.deal;
  dom.hitBtn.disabled = flags.hit;
  dom.standBtn.disabled = flags.stand;
  dom.betPresets.querySelectorAll('button').forEach((btn) => {
    btn.disabled = flags.bets;
  });
}

function paintHandsInstant(payload) {
  const dealer = payload?.dealer_cards || [];
  const player = payload?.player_cards || [];
  // Preserve hole secrecy: render card?.hidden backs only.
  dom.dealerHand.replaceChildren(...dealer.map((card) => createCardElement(card)));
  dom.playerHand.replaceChildren(...player.map((card) => createCardElement(card)));
}

function clearOutcomeFx() {
  dom.app.classList.remove('is-win', 'is-blackjack', 'is-push', 'is-lose', 'is-bust');
  dom.outcomePanel.hidden = true;
  dom.outcomePanel.className = 'outcome';
  dom.outcomeTitle.textContent = '';
  dom.outcomeSub.textContent = '';
  dom.breakdown.hidden = true;
  dom.breakdown.replaceChildren();
  dom.playerScore.classList.remove('is-hot', 'is-bust');
  dom.dealerScore.classList.remove('is-hot');
}

function renderSoftHint(payload) {
  const soft = payload?.player_soft ?? payload?.is_soft ?? payload?.soft;
  if (soft == null || soft === false) {
    dom.softHint.hidden = true;
    dom.softHint.textContent = '';
    return;
  }
  dom.softHint.hidden = false;
  dom.softHint.textContent = typeof soft === 'string' ? soft : 'Soft';
}

function renderOutcome(payload) {
  const kind = classifyOutcome(payload);
  if (!kind) {
    clearOutcomeFx();
    return;
  }
  dom.outcomePanel.hidden = false;
  dom.outcomePanel.className = `outcome outcome--${kind}`;
  dom.outcomeTitle.textContent = outcomeHeadline(kind, payload);
  dom.outcomeSub.textContent = outcomeSubline(kind, payload, formatChips);

  const rows = buildPayoutRows(payload, formatChips);
  if (rows.length > 1) {
    dom.breakdown.hidden = false;
    dom.breakdown.replaceChildren(...rows.map((row) => {
      const el = document.createElement('div');
      el.className = `breakdown__row${row.total ? ' breakdown__row--total' : ''}`;
      el.innerHTML = `<span>${row.label}</span><span>${row.value}</span>`;
      return el;
    }));
  } else {
    dom.breakdown.hidden = true;
    dom.breakdown.replaceChildren();
  }

  dom.app.classList.remove('is-win', 'is-blackjack', 'is-push', 'is-lose', 'is-bust');
  dom.app.classList.add(`is-${kind}`);
  dom.playerScore.classList.toggle('is-bust', kind === 'bust');
  dom.playerScore.classList.toggle('is-hot', kind === 'win' || kind === 'blackjack');

  if (kind === 'blackjack') BlackjackAudio.blackjack();
  else if (kind === 'win') BlackjackAudio.win();
  else if (kind === 'push') BlackjackAudio.push();
  else if (kind === 'bust') BlackjackAudio.bust();
  else BlackjackAudio.lose();
}

function paintScores(payload) {
  if (!payload) {
    dom.dealerScore.textContent = '—';
    dom.playerScore.textContent = '—';
    renderSoftHint(null);
    return;
  }
  const dealerShown = payload.status === 'settled'
    ? payload.dealer_score
    : payload.dealer_upcard_score;
  dom.dealerScore.textContent = dealerShown == null ? '—' : String(dealerShown);
  dom.playerScore.textContent = payload.player_score == null ? '—' : String(payload.player_score);
  renderSoftHint(payload);
}

function paintChrome() {
  dom.betValue.textContent = String(state.bet);
  const rawBalance = balanceLabel(state.balance, state.authenticated);
  if (rawBalance != null) dom.balance.textContent = rawBalance;
  else if (state.balance != null) dom.balance.textContent = formatChips(state.balance);
  else dom.balance.textContent = '—';

  const playing = state.ui === 'playing' || state.ui === 'action_pending' || state.ui === 'recovering';
  dom.playActions.hidden = !playing;
  // Hide DISTRIBUISCI while an active round is in play (resume or live).
  dom.dealBtn.hidden = playing;
  setBusy(busy());
}

function paint() {
  const payload = state.payload;
  paintChrome();
  paintHandsInstant(payload);
  paintScores(payload);
  if (payload?.status === 'settled') renderOutcome(payload);
  else clearOutcomeFx();
}

async function setBalanceAnimated(nextBalance) {
  const prev = state.balance;
  state.balance = nextBalance;
  if (!state.authenticated || nextBalance == null) {
    dom.balance.textContent = '—';
    return;
  }
  await animateBalanceText(dom.balance, prev, nextBalance, formatChips);
}

async function applyPayload(payload, { mode = 'instant' } = {}) {
  const previous = state.payload;
  const prevDealer = previous?.dealer_cards || [];
  const prevPlayer = previous?.player_cards || [];

  state.payload = payload;
  state.roundId = payload.round_id;
  if (typeof payload.bet === 'number') state.bet = payload.bet;

  if (payload.status === 'settled') state.ui = 'settled';
  else if (payload.status === 'player_turn') state.ui = 'playing';

  const nextBalance = typeof payload.balance_after === 'number' ? payload.balance_after : state.balance;

  if (mode === 'deal') {
    state.animating = true;
    paintChrome();
    clearOutcomeFx();
    paintScores({
      ...payload,
      // During deal, dealer full score stays hidden until settle.
      dealer_score: payload.status === 'settled' ? payload.dealer_score : undefined,
    });
    if (payload.status !== 'settled') {
      dom.dealerScore.textContent = payload.dealer_upcard_score == null
        ? '—'
        : String(payload.dealer_upcard_score);
    }
    await animateInitialDeal({
      dealerHand: dom.dealerHand,
      playerHand: dom.playerHand,
      dealerCards: payload.dealer_cards,
      playerCards: payload.player_cards,
      createCard: createCardElement,
      onCard: () => BlackjackAudio.dealCard(),
    });
    paintScores(payload);
    if (payload.status === 'settled') renderOutcome(payload);
    await setBalanceAnimated(nextBalance);
    state.animating = false;
    paintChrome();
    return;
  }

  if (mode === 'hit') {
    state.animating = true;
    paintChrome();
    BlackjackAudio.hit();
    await animateHitCard({
      playerHand: dom.playerHand,
      previousCount: prevPlayer.length,
      playerCards: payload.player_cards,
      createCard: createCardElement,
      onCard: () => BlackjackAudio.dealCard(),
    });
    paintScores(payload);
    if (payload.player_score === 21) dom.playerScore.classList.add('is-hot');
    if (payload.status === 'settled') renderOutcome(payload);
    await setBalanceAnimated(nextBalance);
    state.animating = false;
    paintChrome();
    return;
  }

  if (mode === 'stand') {
    state.animating = true;
    paintChrome();
    BlackjackAudio.stand();
    await animateDealerReveal({
      dealerHand: dom.dealerHand,
      previousDealerCards: prevDealer,
      nextDealerCards: payload.dealer_cards,
      createCard: createCardElement,
      onFlip: () => BlackjackAudio.cardFlip(),
      onCard: () => BlackjackAudio.dealCard(),
    });
    if (payload.player_cards) {
      dom.playerHand.replaceChildren(
        ...payload.player_cards.map((card) => createCardElement(card)),
      );
    }
    paintScores(payload);
    if (payload.status === 'settled') renderOutcome(payload);
    await setBalanceAnimated(nextBalance);
    state.animating = false;
    paintChrome();
    return;
  }

  if (typeof nextBalance === 'number') state.balance = nextBalance;
  paint();
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
    if (path === CONFIG.api.endpoints.blackjackStart) {
      console.info(`[BLACKJACK API] start status=${response.status}`);
    }
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    if (!response.ok) {
      const detailRaw = data?.detail;
      const detailStr = typeof detailRaw === 'string' ? detailRaw : null;
      const code = errorCodeFromHttp(response.status, detailStr, ERROR_COPY);
      const mapped = detailStr && ERROR_COPY[detailStr] && response.status !== 401 && response.status !== 403
        ? detailStr
        : code;
      const err = new Error(mapped);
      err.code = mapped;
      err.httpStatus = response.status;
      throw err;
    }
    return data;
  } catch (error) {
    if (error.code === 'AUTH_ERROR') throw error;
    if (error.code && error.code !== 'NETWORK_ERROR') throw error;
    if (error.httpStatus === 401 || error.httpStatus === 403) throw error;
    if (error.httpStatus && error.code) throw error;
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
 * AUTH_ERROR must never enter this path.
 */
async function recoverAfterNetwork() {
  const pending = state.pending;
  if (!pending) return false;
  state.ui = 'recovering';
  setError('CONNECTION_INTERRUPTED');
  paintChrome();

  try {
    const payload = await sendPending(pending);
    clearPending();
    await applyPayload(payload, { mode: 'instant' });
    clearError();
    return true;
  } catch (error) {
    if (!isRecoverableNetworkError(error)) {
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
      await applyPayload(current.round, { mode: 'instant' });
      // Keep pending so a later user retry reuses the same action_id.
      state.ui = 'playing';
      setError('CONNECTION_INTERRUPTED');
      paintChrome();
      return false;
    }
    // No open round: start/stand may have committed — retry same id for replay.
    if (pending.kind === 'start' || pending.kind === 'stand') {
      try {
        const payload = await sendPending(pending);
        clearPending();
        await applyPayload(payload, { mode: 'instant' });
        clearError();
        return true;
      } catch (error) {
        if (!isRecoverableNetworkError(error)) {
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
  paintChrome();
  return false;
}

async function refreshBalance() {
  if (!state.authenticated) {
    state.balance = null;
    paintChrome();
    return;
  }
  try {
    const data = await telegram.fetchBalance();
    if (data?.demo) {
      // Never present demo chips as a real wallet in Blackjack.
      state.balance = null;
      paintChrome();
      return;
    }
    if (typeof data?.balance === 'number') {
      await setBalanceAnimated(data.balance);
      paintChrome();
    }
  } catch {
    /* keep last known balance */
  }
}

async function resumeRound() {
  if (!state.authenticated) return;
  try {
    const current = await fetchCurrentRound();
    if (current?.has_active_round && current.round) {
      await applyPayload(current.round, { mode: 'instant' });
    }
  } catch {
    /* idle if resume fails */
  }
}

async function deal() {
  if (!state.authenticated) {
    setError('AUTH_ERROR');
    paintChrome();
    return;
  }
  if (state.pending && state.pending.kind !== 'start') return;
  clearError();
  clearOutcomeFx();
  const pending = ensurePending('start', { bet: state.bet });
  state.ui = 'starting';
  paintChrome();
  try {
    const payload = await sendPending(pending);
    clearPending();
    await applyPayload(payload, { mode: 'deal' });
  } catch (error) {
    if (isRecoverableNetworkError(error)) {
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
  if (!state.authenticated) {
    setError('AUTH_ERROR');
    paintChrome();
    return;
  }
  if (state.pending && state.pending.kind !== kind) return;
  if (!state.roundId && !(state.pending && state.pending.kind === kind)) return;
  clearError();
  const pending = ensurePending(kind, { roundId: state.roundId });
  state.ui = 'action_pending';
  paintChrome();
  try {
    const payload = await sendPending(pending);
    clearPending();
    await applyPayload(payload, { mode: kind === 'hit' ? 'hit' : 'stand' });
  } catch (error) {
    if (isRecoverableNetworkError(error)) {
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
    btn.setAttribute('aria-label', `Puntata ${amount}`);
    btn.addEventListener('click', () => {
      if (!state.authenticated) return;
      if (busy() || state.ui === 'playing' || state.ui === 'action_pending') return;
      state.bet = amount;
      BlackjackAudio.chipBet();
      dom.betPresets.querySelectorAll('.bet-chip').forEach((el) => {
        el.classList.toggle('is-active', Number(el.dataset.bet) === state.bet);
      });
      paintChrome();
    });
    if (amount === state.bet) btn.classList.add('is-active');
    dom.betPresets.append(btn);
  });
}

async function init() {
  telegram.init();
  state.authenticated = hasInitData(telegram.getInitData());
  console.info(`[BLACKJACK AUTH] initData_present=${state.authenticated}`);
  buildBets();
  dom.dealBtn.addEventListener('click', () => {
    if (!state.authenticated) {
      setError('AUTH_ERROR');
      paintChrome();
      return;
    }
    if (busy()) return;
    void deal();
  });
  dom.hitBtn.addEventListener('click', () => {
    if (!state.authenticated) {
      setError('AUTH_ERROR');
      paintChrome();
      return;
    }
    if (busy()) return;
    void play('hit');
  });
  dom.standBtn.addEventListener('click', () => {
    if (!state.authenticated) {
      setError('AUTH_ERROR');
      paintChrome();
      return;
    }
    if (busy()) return;
    void play('stand');
  });
  if (!state.authenticated) {
    state.balance = null;
    setError('AUTH_ERROR');
    paint();
    return;
  }
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
