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
import { mountEuropeanWheel, animateBalanceText } from './animations.js?v=18';
import { RouletteAudio } from './audio.js?v=30';
import {
  Scene,
  bettingResetPatch,
  canStartSpin,
  sceneAfterAnimation,
  sceneAfterPayload,
} from './scene.js';
import {
  BETS,
  DEFAULT_BET,
  DOZEN_BETS,
  ERROR_COPY,
  OUTSIDE_BETS,
  PREVIEW_SCENARIOS,
  betSelectionLabel,
  buildPayoutRows,
  buildSpinBody,
  isStraightWinPayload,
  outcomeHeadline,
  outcomeKicker,
  outcomeSubline,
  pocketColor,
  pocketColorLabel,
  pushHistory,
} from './layout.js';

const telegram = new TelegramBridge();
const PREVIEW = Boolean(window.__ROULETTE_PREVIEW__);

/**
 * Client idempotency:
 * - NEW spin → mint action_id, keep in pending until RESULT.
 * - timeout/network → retry SAME action_id (never mint a new one).
 */
const state = {
  scene: Scene.BETTING,
  bet: DEFAULT_BET,
  betType: null,
  targetNumber: null,
  balance: null,
  authenticated: false,
  animating: false,
  /** @type {{ actionId: string, bet: number, betType: string, targetNumber: number|null } | null} */
  pending: null,
  history: [],
  lastPayload: null,
};

const dom = {
  app: document.getElementById('app'),
  muteBtn: document.getElementById('muteBtn'),
  balanceValue: document.getElementById('balanceValue'),
  betTypeLabel: document.getElementById('betTypeLabel'),
  betAmountLabel: document.getElementById('betAmountLabel'),
  spinBetLabel: document.getElementById('spinBetLabel'),
  spinAmountLabel: document.getElementById('spinAmountLabel'),
  spinSuspense: document.getElementById('spinSuspense'),
  wheelMount: document.getElementById('wheelMount'),
  historyStrip: document.getElementById('historyStrip'),
  historyRow: document.getElementById('historyRow'),
  resultHistoryStrip: document.getElementById('resultHistoryStrip'),
  resultHistoryRow: document.getElementById('resultHistoryRow'),
  outcomePanel: document.getElementById('outcomePanel'),
  outcomeTitle: document.getElementById('outcomeTitle'),
  outcomeSub: document.getElementById('outcomeSub'),
  breakdown: document.getElementById('breakdown'),
  resultHero: document.getElementById('resultHero'),
  resultNumber: document.getElementById('resultNumber'),
  resultColorLabel: document.getElementById('resultColorLabel'),
  resultKicker: document.getElementById('resultKicker'),
  outsideBets: document.getElementById('outsideBets'),
  dozenBets: document.getElementById('dozenBets'),
  numberGrid: document.getElementById('numberGrid'),
  chipPresets: document.getElementById('chipPresets'),
  spinBtn: document.getElementById('spinBtn'),
  againBtn: document.getElementById('againBtn'),
  retryBtn: document.getElementById('retryBtn'),
  errorBox: document.getElementById('errorBox'),
  panels: {
    [Scene.BETTING]: document.getElementById('sceneBetting'),
    [Scene.SPINNING]: document.getElementById('sceneSpinning'),
    [Scene.RESULT]: document.getElementById('sceneResult'),
    [Scene.NETWORK_ERROR]: document.getElementById('sceneNetwork'),
    [Scene.AUTH_ERROR]: document.getElementById('sceneAuth'),
  },
};

const wheel = mountEuropeanWheel(dom.wheelMount);

function newActionId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `rl-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-Telegram-Init-Data': telegram.getInitData() || '',
  };
}

function hasSelection() {
  return Boolean(state.betType);
}

function busy() {
  return state.animating || state.scene === Scene.SPINNING;
}

function setError(code) {
  const text = ERROR_COPY[code] || ERROR_COPY.NETWORK_ERROR;
  if (dom.errorBox) {
    dom.errorBox.hidden = false;
    dom.errorBox.textContent = text;
  }
}

function clearError() {
  if (dom.errorBox) {
    dom.errorBox.hidden = true;
    dom.errorBox.textContent = '';
  }
}

function setScene(scene) {
  state.scene = scene;
  dom.app.dataset.scene = scene;
  Object.entries(dom.panels).forEach(([key, el]) => {
    if (!el) return;
    el.hidden = key !== scene;
  });
  dom.app.classList.toggle('is-busy', busy() || state.scene === Scene.SPINNING);
}

function syncMuteButton() {
  if (!dom.muteBtn) return;
  const muted = !RouletteAudio.isEnabled();
  dom.muteBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
  dom.muteBtn.classList.toggle('is-muted', muted);
  dom.muteBtn.textContent = muted
    ? String.fromCodePoint(0x1F507)
    : String.fromCodePoint(0x1F50A);
  dom.muteBtn.title = muted ? 'Riattiva audio' : 'Disattiva audio';
}

function paintBalance() {
  const dash = balanceLabel(state.balance, state.authenticated);
  if (dash != null) {
    dom.balanceValue.textContent = dash;
    return;
  }
  dom.balanceValue.textContent = formatChips(state.balance);
}

function selectionLabel() {
  return betSelectionLabel({
    betType: state.betType,
    targetNumber: state.targetNumber,
  });
}

function paintSelection() {
  const label = selectionLabel();
  dom.betTypeLabel.textContent = label;
  dom.betTypeLabel.classList.toggle('is-active', Boolean(state.betType));
  dom.betAmountLabel.textContent = formatChips(state.bet);
  if (dom.spinBetLabel) {
    const pendingLabel = state.pending
      ? betSelectionLabel({
        betType: state.pending.betType,
        targetNumber: state.pending.targetNumber,
      })
      : label;
    dom.spinBetLabel.textContent = pendingLabel;
    dom.spinAmountLabel.textContent = formatChips(state.pending?.bet ?? state.bet);
  }
}

function fillHistoryRow(rowEl, stripEl) {
  const hasHistory = state.history.length > 0;
  if (stripEl) stripEl.hidden = !hasHistory;
  if (!rowEl) return;
  if (!hasHistory) {
    rowEl.replaceChildren();
    return;
  }
  rowEl.replaceChildren(
    ...state.history.map((entry) => {
      const el = document.createElement('span');
      el.className = `history__pip history__pip--${entry.color || pocketColor(entry.number)}`;
      el.textContent = String(entry.number);
      return el;
    }),
  );
}

function paintHistory() {
  fillHistoryRow(dom.historyRow, dom.historyStrip);
  fillHistoryRow(dom.resultHistoryRow, dom.resultHistoryStrip);
}

const SPOT_CHIP_CLASSES = ['spot-500', 'spot-1000', 'spot-2000'];

function paintSpotChip(btn, selected) {
  btn.classList.remove(...SPOT_CHIP_CLASSES);
  btn.classList.toggle('is-selected', selected);
  if (selected) btn.classList.add(`spot-${state.bet}`);
}

function paintChrome() {
  const flags = controlsDisabled({
    authenticated: state.authenticated || PREVIEW,
    busy: busy() || state.animating || state.scene === Scene.SPINNING,
    hasSelection: hasSelection(),
  });
  if (dom.spinBtn) dom.spinBtn.disabled = flags.spin;
  dom.chipPresets?.querySelectorAll('button').forEach((btn) => {
    btn.disabled = flags.amounts;
    btn.classList.toggle('is-selected', Number(btn.dataset.bet) === state.bet);
  });
  dom.outsideBets?.querySelectorAll('button').forEach((btn) => {
    btn.disabled = flags.bets;
    paintSpotChip(btn, state.betType === btn.dataset.type);
  });
  dom.dozenBets?.querySelectorAll('button').forEach((btn) => {
    btn.disabled = flags.bets;
    paintSpotChip(btn, state.betType === btn.dataset.type);
  });
  dom.numberGrid?.querySelectorAll('button').forEach((btn) => {
    btn.disabled = flags.bets;
    const n = Number(btn.dataset.number);
    paintSpotChip(btn, state.betType === 'straight' && state.targetNumber === n);
  });
  paintBalance();
  paintSelection();
  paintHistory();
}

function clearOutcome() {
  if (!dom.outcomePanel) return;
  dom.outcomePanel.className = 'result-card';
  dom.outcomeTitle.textContent = '';
  dom.outcomeSub.textContent = '';
  dom.breakdown.hidden = true;
  dom.breakdown.replaceChildren();
  if (dom.resultNumber) dom.resultNumber.textContent = '—';
  if (dom.resultColorLabel) dom.resultColorLabel.textContent = '';
  if (dom.resultHero) dom.resultHero.className = 'result-hero';
  if (dom.resultKicker) {
    dom.resultKicker.hidden = true;
    dom.resultKicker.textContent = '';
  }
}

function renderOutcome(payload) {
  if (!payload) {
    clearOutcome();
    return;
  }
  const color = payload.color || pocketColor(payload.number);
  const straightWin = isStraightWinPayload(payload);
  dom.resultHero.className = `result-hero is-${color}${straightWin ? ' is-straight-win' : ''}`;
  dom.resultNumber.textContent = String(payload.number);
  dom.resultColorLabel.textContent = pocketColorLabel(color).toUpperCase();

  if (dom.resultKicker) {
    const kicker = outcomeKicker(payload);
    dom.resultKicker.textContent = kicker;
    dom.resultKicker.hidden = !kicker;
  }

  dom.outcomePanel.className = `result-card ${payload.won ? 'is-win' : 'is-lose'}${straightWin ? ' is-straight-win' : ''}`;
  dom.outcomeTitle.textContent = outcomeHeadline(payload);
  dom.outcomeSub.textContent = outcomeSubline(payload, formatChips);

  const rows = buildPayoutRows(payload, formatChips);
  if (!rows.length) {
    dom.breakdown.hidden = true;
    dom.breakdown.replaceChildren();
    return;
  }
  dom.breakdown.hidden = false;
  dom.breakdown.replaceChildren(
    ...rows.map((row) => {
      const el = document.createElement('div');
      el.className = `breakdown__row${row.emphasis ? ' breakdown__row--total' : ''}`;
      el.innerHTML = `<span>${row.label}</span><strong>${row.value}</strong>`;
      return el;
    }),
  );
}

function selectOutside(type) {
  if (busy() || !(state.authenticated || PREVIEW) || state.scene !== Scene.BETTING) return;
  const changed = state.betType !== type || state.targetNumber != null;
  state.betType = type;
  state.targetNumber = null;
  clearError();
  paintChrome();
  if (changed) RouletteAudio.playBetSelect();
}

function selectDozen(type) {
  selectOutside(type);
}

function selectStraight(number) {
  if (busy() || !(state.authenticated || PREVIEW) || state.scene !== Scene.BETTING) return;
  const n = Number(number);
  const changed = state.betType !== 'straight' || state.targetNumber !== n;
  state.betType = 'straight';
  state.targetNumber = n;
  clearError();
  paintChrome();
  if (changed) RouletteAudio.playBetSelect();
}

function selectBet(amount) {
  if (busy() || !(state.authenticated || PREVIEW) || state.scene !== Scene.BETTING) return;
  if (!BETS.includes(amount)) return;
  const changed = state.bet !== amount;
  state.bet = amount;
  paintChrome();
  if (changed) RouletteAudio.playChipSelect();
}

function buildBoard() {
  dom.outsideBets.replaceChildren(
    ...OUTSIDE_BETS.map((bet) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = bet.className;
      btn.dataset.type = bet.type;
      btn.textContent = bet.label;
      btn.addEventListener('click', () => selectOutside(bet.type));
      return btn;
    }),
  );

  dom.dozenBets.replaceChildren(
    ...DOZEN_BETS.map((bet) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dozen-btn';
      btn.dataset.type = bet.type;
      btn.innerHTML = `${bet.label}<small>${bet.range}</small>`;
      btn.addEventListener('click', () => selectDozen(bet.type));
      return btn;
    }),
  );

  const zero = document.createElement('button');
  zero.type = 'button';
  zero.className = 'num num--green';
  zero.dataset.number = '0';
  zero.textContent = '0';
  zero.addEventListener('click', () => selectStraight(0));
  const cells = [zero];
  for (let n = 1; n <= 36; n += 1) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `num num--${pocketColor(n)}`;
    btn.dataset.number = String(n);
    btn.textContent = String(n);
    btn.addEventListener('click', () => selectStraight(n));
    cells.push(btn);
  }
  dom.numberGrid.replaceChildren(...cells);

  dom.chipPresets.replaceChildren(
    ...BETS.map((amount) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `chip chip--${amount}`;
      btn.dataset.bet = String(amount);
      btn.textContent = formatChips(amount);
      btn.addEventListener('click', () => selectBet(amount));
      return btn;
    }),
  );
}

async function fetchBalance() {
  const base = CONFIG.api.baseUrl;
  if (!base || !hasInitData(telegram.getInitData())) {
    state.balance = null;
    return;
  }
  let response;
  try {
    response = await fetch(`${base}${CONFIG.api.endpoints.balance}`, {
      method: 'GET',
      headers: authHeaders(),
    });
  } catch (err) {
    // Browser CORS / offline — no HTTP status available.
    throw Object.assign(new Error('NETWORK_ERROR'), {
      code: 'NETWORK_ERROR',
      cause: err,
    });
  }
  let detail = '';
  let data = null;
  try {
    data = await response.json();
    detail = typeof data?.detail === 'string' ? data.detail : '';
  } catch {
    detail = '';
  }
  if (!response.ok) {
    const code = errorCodeFromHttp(response.status, detail || data, ERROR_COPY);
    throw Object.assign(new Error(code), { code, httpStatus: response.status, detail });
  }
  if (data?.demo) {
    state.balance = null;
    return;
  }
  state.balance = Number(data.chips ?? data.balance ?? data.wallet_chips);
}

async function postSpin(body) {
  const base = CONFIG.api.baseUrl;
  let response;
  try {
    response = await fetch(`${base}${CONFIG.api.endpoints.rouletteSpin}`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw Object.assign(new Error('NETWORK_ERROR'), {
      code: 'NETWORK_ERROR',
      cause: err,
    });
  }
  let detail = '';
  let data = null;
  try {
    data = await response.json();
    detail = typeof data?.detail === 'string' ? data.detail : '';
  } catch {
    detail = '';
  }
  if (!response.ok) {
    const code = errorCodeFromHttp(response.status, detail || data, ERROR_COPY);
    console.info('[ROULETTE API] spin status=', response.status, 'code=', code);
    throw Object.assign(new Error(code), { code, httpStatus: response.status, detail });
  }
  return data;
}

const SUSPENSE_START = 'La fortuna sta girando...';
const SUSPENSE_FINAL = 'Dove si fermerà?';
const LAND_HOLD_MS = 800;

function resetSpinSuspense() {
  if (!dom.spinSuspense) return;
  dom.spinSuspense.classList.remove('is-fading');
  dom.spinSuspense.textContent = SUSPENSE_START;
}

function fadeSpinSuspense(nextText) {
  if (!dom.spinSuspense || dom.spinSuspense.dataset.phase === 'final') return;
  dom.spinSuspense.dataset.phase = 'final';
  dom.spinSuspense.classList.add('is-fading');
  window.setTimeout(() => {
    if (!dom.spinSuspense) return;
    dom.spinSuspense.textContent = nextText;
    dom.spinSuspense.classList.remove('is-fading');
  }, 220);
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function playSpinAnimation(payload) {
  setScene(sceneAfterPayload());
  state.animating = true;
  paintChrome();
  resetSpinSuspense();
  if (dom.spinSuspense) dom.spinSuspense.dataset.phase = 'start';
  wheel?.clearWinHighlight?.();
  RouletteAudio.playStart();
  await wheel?.spinToNumber(payload.number, {
    onProgress: (raw) => {
      RouletteAudio.onSpinProgress(raw);
      // Final decelerate / settle — soft copy swap
      if (raw >= 0.78) fadeSpinSuspense(SUSPENSE_FINAL);
    },
    durationMs: 6000,
  });
  // Sequence: pocket-lock → hold → climax (straight-win XOR result-win) → RESULT
  await RouletteAudio.playPocketLock();
  await wait(LAND_HOLD_MS);
  await RouletteAudio.playOutcome(payload);
  wheel?.clearWinHighlight?.();
  state.animating = false;
}

function goResult(payload) {
  state.lastPayload = payload;
  if (typeof payload.balance_after === 'number') {
    state.balance = payload.balance_after;
    animateBalanceText(dom.balanceValue, state.balance, formatChips);
  }
  state.history = pushHistory(state.history, {
    number: payload.number,
    color: payload.color || pocketColor(payload.number),
  });
  renderOutcome(payload);
  // Clear pending only after round concluded (RESULT).
  state.pending = null;
  setScene(sceneAfterAnimation());
  paintChrome();
}

async function applyServerPayload(payload) {
  state.lastPayload = payload;
  await playSpinAnimation(payload);
  goResult(payload);
}

function goBettingFresh() {
  RouletteAudio.stopActiveAudio();
  Object.assign(state, bettingResetPatch());
  clearOutcome();
  clearError();
  setScene(Scene.BETTING);
  paintChrome();
}

async function runSpin() {
  if (busy()) return;
  if (!(state.authenticated || PREVIEW)) {
    setError('AUTH_ERROR');
    setScene(Scene.AUTH_ERROR);
    return;
  }
  if (!canStartSpin(state.scene) && state.scene !== Scene.NETWORK_ERROR) return;
  if (state.scene === Scene.BETTING && !hasSelection()) {
    setError('SELECT_BET');
    return;
  }
  clearError();

  if (!state.pending) {
    state.pending = {
      actionId: newActionId(),
      bet: state.bet,
      betType: state.betType,
      targetNumber: state.betType === 'straight' ? state.targetNumber : null,
    };
  }

  const pending = state.pending;
  const body = buildSpinBody({
    bet: pending.bet,
    betType: pending.betType,
    targetNumber: pending.targetNumber,
    actionId: pending.actionId,
  });

  // Disable table while requesting.
  paintChrome();

  if (PREVIEW) {
    const forced = window.__ROULETTE_PREVIEW_PAYLOAD__;
    const mock = forced || {
      ...PREVIEW_SCENARIOS.win_red,
      bet: pending.bet,
      bet_type: pending.betType,
      target_number: pending.targetNumber,
      action_id: pending.actionId,
      number: pending.betType === 'straight' ? pending.targetNumber : 32,
      color: pocketColor(pending.betType === 'straight' ? pending.targetNumber : 32),
      won: true,
      payout_base: pending.bet * (pending.betType === 'straight' ? 36 : pending.betType.startsWith('dozen') ? 3 : 2),
      final_credit: pending.bet * (pending.betType === 'straight' ? 36 : pending.betType.startsWith('dozen') ? 3 : 2),
      balance_after: (state.balance ?? 20000) - pending.bet + pending.bet * (pending.betType === 'straight' ? 36 : pending.betType.startsWith('dozen') ? 3 : 2),
    };
    window.__ROULETTE_PREVIEW_PAYLOAD__ = null;
    await applyServerPayload(mock);
    return;
  }

  try {
    console.info('[ROULETTE AUTH] initData_present=', hasInitData(telegram.getInitData()));
    const payload = await postSpin(body);
    await applyServerPayload(payload);
  } catch (error) {
    if (!isRecoverableNetworkError(error)) {
      state.pending = null;
      if (error.code === 'AUTH_ERROR') {
        setScene(Scene.AUTH_ERROR);
      } else {
        setScene(Scene.BETTING);
        setError(error.code || 'NETWORK_ERROR');
      }
      paintChrome();
      return;
    }
    // Keep pending action_id for retry — do not mint a new one.
    setScene(Scene.NETWORK_ERROR);
    paintChrome();
  }
}

async function boot() {
  telegram.init();
  buildBoard();
  syncMuteButton();
  clearOutcome();
  setScene(Scene.BETTING);

  if (PREVIEW) {
    state.authenticated = true;
    state.balance = 20000;
    paintChrome();
    window.addEventListener('roulette-preview', async (ev) => {
      const detail = ev.detail;
      if (!detail) return;
      if (detail.previewScene === 'BETTING') {
        goBettingFresh();
        return;
      }
      if (detail.previewScene === 'RESULT') {
        state.pending = null;
        state.animating = false;
        goResult(detail.payload || detail);
        return;
      }
      // SPIN path: set payload then run through SPINNING → RESULT
      state.pending = null;
      goBettingFresh();
      if (detail.bet_type) {
        state.betType = detail.bet_type;
        state.targetNumber = detail.target_number ?? null;
        state.bet = detail.bet || state.bet;
      } else {
        state.betType = 'red';
      }
      window.__ROULETTE_PREVIEW_PAYLOAD__ = detail.payload || detail;
      paintChrome();
      await runSpin();
    });
    return;
  }

  const initData = telegram.getInitData();
  console.info('[ROULETTE AUTH] initData_present=', hasInitData(initData));
  if (!hasInitData(initData)) {
    state.authenticated = false;
    state.balance = null;
    setScene(Scene.AUTH_ERROR);
    paintChrome();
    return;
  }

  state.authenticated = true;
  try {
    await fetchBalance();
    setScene(Scene.BETTING);
    clearError();
  } catch (error) {
    state.authenticated = error.code !== 'AUTH_ERROR';
    if (error.code === 'AUTH_ERROR') setScene(Scene.AUTH_ERROR);
    else {
      setScene(Scene.BETTING);
      setError(error.code || 'NETWORK_ERROR');
    }
  }
  paintChrome();
}

dom.muteBtn?.addEventListener('click', () => {
  RouletteAudio.toggle();
  syncMuteButton();
});

dom.spinBtn?.addEventListener('click', () => {
  runSpin();
});

dom.againBtn?.addEventListener('click', () => {
  goBettingFresh();
});

dom.retryBtn?.addEventListener('click', () => {
  if (state.pending) runSpin();
});

boot();

// Expose for tests / preview helpers
window.__ROULETTE_STATE__ = state;
window.__ROULETTE_SCENE__ = Scene;
