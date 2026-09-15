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
  addChipToBets,
  aimPreviewLabel,
  betSelectionLabel,
  betsSummaryLabel,
  buildMagneticSnaps,
  buildPayoutRows,
  buildSpinBody,
  coveredNumbers,
  findPlacedBet,
  formatSpotLabel,
  isStraightWinPayload,
  MAGNET,
  numberCell,
  outcomeHeadline,
  outcomeKicker,
  outcomeSubline,
  pickMagneticSnap,
  pocketColor,
  pocketColorLabel,
  previewEvaluateBets,
  pushHistory,
  resolveInsideSpot,
  resolveZeroSpot,
  rowKey,
  spotChipClass,
  totalBet,
} from './layout.js?v=12';

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
  bets: [],
  betType: null,
  targetNumber: null,
  balance: null,
  authenticated: false,
  animating: false,
  /** @type {{ actionId: string, bets: Array } | null} */
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
  clearBetsBtn: document.getElementById('clearBetsBtn'),
  againBtn: document.getElementById('againBtn'),
  retryBtn: document.getElementById('retryBtn'),
  errorBox: document.getElementById('errorBox'),
  spinBetsRow: document.getElementById('spinBetsRow'),
  resultBetsRow: document.getElementById('resultBetsRow'),
  tokenLayer: document.getElementById('tokenLayer'),
  ghostChip: document.getElementById('ghostChip'),
  aimHint: document.getElementById('aimHint'),
  aimHintLabel: document.getElementById('aimHintLabel'),
  aimMark: document.getElementById('aimMark'),
  board: document.querySelector('.board'),
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
  return (activeBets()).length > 0;
}

function activeBets() {
  if (state.pending?.bets?.length) return state.pending.bets;
  return state.bets;
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
  if (scene !== Scene.BETTING) clearBettingPointerUi();
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
  return betsSummaryLabel(activeBets());
}

function paintSelection() {
  const label = selectionLabel();
  const total = totalBet(activeBets());
  dom.betTypeLabel.textContent = label;
  dom.betTypeLabel.classList.toggle('is-active', hasSelection());
  dom.betAmountLabel.textContent = formatChips(total);
  if (dom.spinBetLabel) {
    dom.spinBetLabel.textContent = label;
    dom.spinAmountLabel.textContent = formatChips(total);
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

const SPOT_CHIP_CLASSES = ['spot-500', 'spot-1000', 'spot-2000', 'spot-placed', 'is-hit', 'is-miss'];

function paintSpotChip(btn, placed, resultRow) {
  btn.classList.remove(...SPOT_CHIP_CLASSES);
  btn.removeAttribute('data-spot-label');
  const selected = Boolean(placed);
  btn.classList.toggle('is-selected', selected);
  if (!placed) return;
  btn.classList.add('spot-placed', spotChipClass(placed.amount));
  btn.setAttribute('data-spot-label', formatSpotLabel(placed.amount));
  if (resultRow) {
    btn.classList.toggle('is-hit', Boolean(resultRow.won));
    btn.classList.toggle('is-miss', !resultRow.won);
  }
}

function resultRowForSpot(betType, targetNumber, numbers) {
  const payload = state.lastPayload;
  if (!payload?.bets) return null;
  const key = rowKey({ betType, targetNumber, numbers });
  return payload.bets.find((row) => rowKey({
    betType: row.bet_type,
    targetNumber: row.target_number,
    numbers: row.numbers,
  }) === key) || null;
}

function paintPlacedStrip(rowEl, bets, payloadBets) {
  if (!rowEl) return;
  const list = bets || [];
  if (!list.length) {
    rowEl.hidden = true;
    rowEl.replaceChildren();
    return;
  }
  rowEl.hidden = false;
  rowEl.replaceChildren(
    ...list.map((bet) => {
      const el = document.createElement('span');
      const result = (payloadBets || []).find((row) => rowKey({
        betType: row.bet_type,
        targetNumber: row.target_number,
        numbers: row.numbers,
      }) === rowKey(bet));
      el.className = `placed-chip ${spotChipClass(bet.amount)}${result?.won ? ' is-hit' : result ? ' is-miss' : ''}`;
      el.setAttribute('data-spot-label', formatSpotLabel(bet.amount));
      el.title = `${betSelectionLabel(bet)} · ${formatChips(bet.amount)}`;
      el.innerHTML = `<strong>${formatSpotLabel(bet.amount)}</strong><small>${betSelectionLabel(bet)}</small>`;
      return el;
    }),
  );
}

function cellEl(n) {
  return dom.numberGrid?.querySelector(`[data-number="${n}"]`);
}

function cellCenter(n) {
  const el = cellEl(n);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function tokenPoint(bet) {
  if (bet.betType === 'straight') return cellCenter(bet.targetNumber);
  const nums = bet.numbers || [];
  const pts = nums.map(cellCenter).filter(Boolean);
  if (!pts.length) return null;
  return {
    x: pts.reduce((sum, p) => sum + p.x, 0) / pts.length,
    y: pts.reduce((sum, p) => sum + p.y, 0) / pts.length,
  };
}

function paintTokenLayer(bets, payloadBets) {
  const layer = dom.tokenLayer;
  if (!layer) return;
  const print = layer.parentElement;
  if (!print) return;
  const origin = print.getBoundingClientRect();
  const inside = (bets || []).filter((bet) => (
    bet.betType === 'straight' || bet.betType === 'split' || bet.betType === 'corner'
  )).sort((a, b) => {
    const rank = { corner: 0, split: 1, straight: 2 };
    return (rank[a.betType] ?? 0) - (rank[b.betType] ?? 0);
  });
  layer.replaceChildren(
    ...inside.map((bet) => {
      const pt = tokenPoint(bet);
      if (!pt) return document.createComment('');
      const result = (payloadBets || []).find((row) => rowKey({
        betType: row.bet_type,
        targetNumber: row.target_number,
        numbers: row.numbers,
      }) === rowKey(bet));
      const el = document.createElement('span');
      el.className = `table-token ${spotChipClass(bet.amount)}${result?.won ? ' is-hit' : result ? ' is-miss' : ''}`;
      el.textContent = formatSpotLabel(bet.amount);
      el.title = `${betSelectionLabel(bet)} · ${formatChips(bet.amount)}`;
      el.style.left = `${pt.x - origin.left}px`;
      el.style.top = `${pt.y - origin.top}px`;
      return el;
    }),
  );
}

function cellRectsFromDom() {
  const rects = {};
  for (let n = 0; n <= 36; n += 1) {
    const el = cellEl(n);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    rects[n] = { left: r.left, top: r.top, width: r.width, height: r.height };
  }
  return rects;
}

function inflateRect(r, px) {
  return {
    left: r.left - px,
    top: r.top - px,
    width: r.width + px * 2,
    height: r.height + px * 2,
  };
}

function clearHotCells() {
  dom.numberGrid?.querySelectorAll('.is-covered, .is-hot, .is-straight-aim').forEach((el) => {
    el.classList.remove('is-covered', 'is-hot', 'is-straight-aim');
  });
}

function clearAim() {
  clearHotCells();
  if (dom.aimHint) dom.aimHint.hidden = true;
  if (dom.aimMark) dom.aimMark.hidden = true;
  dom.dozenBets?.querySelectorAll('.is-hot').forEach((el) => el.classList.remove('is-hot'));
  dom.outsideBets?.querySelectorAll('.is-hot').forEach((el) => el.classList.remove('is-hot'));
}

function showAim(spot) {
  if (!spot) {
    clearAim();
    return;
  }
  highlightSpot(spot);
  if (dom.aimHint && dom.aimHintLabel) {
    dom.aimHint.hidden = false;
    dom.aimHintLabel.textContent = aimPreviewLabel(spot);
  }
  const mark = dom.aimMark;
  const layer = dom.tokenLayer;
  if (mark && layer && spot.betType !== 'straight') {
    const origin = layer.getBoundingClientRect();
    const pt = tokenPoint(spot);
    if (pt) {
      mark.hidden = false;
      mark.style.left = `${pt.x - origin.left}px`;
      mark.style.top = `${pt.y - origin.top}px`;
    } else {
      mark.hidden = true;
    }
  } else if (mark) {
    mark.hidden = true;
  }
  if (spot.betType && !['straight', 'split', 'corner'].includes(spot.betType)) {
    const btn = document.querySelector(`#outsideBets [data-type="${spot.betType}"], #dozenBets [data-type="${spot.betType}"]`);
    btn?.classList.add('is-hot');
  }
}

function highlightSpot(spot) {
  clearHotCells();
  coveredNumbers(spot).forEach((n) => {
    const el = cellEl(n);
    if (!el) return;
    el.classList.add('is-covered', 'is-hot');
    if (spot.betType === 'straight') el.classList.add('is-straight-aim');
  });
}

function pointInRect(clientX, clientY, rect) {
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

function resolveOutsideFromPoint(clientX, clientY) {
  const ghost = dom.ghostChip;
  const prev = ghost?.hidden;
  if (ghost) ghost.hidden = true;
  const raw = document.elementFromPoint(clientX, clientY);
  if (ghost) ghost.hidden = prev;
  const zone = raw?.closest?.('#outsideBets button, #dozenBets button');
  if (zone?.dataset?.type) {
    const r = zone.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    return {
      betType: zone.dataset.type,
      targetNumber: null,
      numbers: null,
      x: cx,
      y: cy,
    };
  }
  let best = null;
  document.querySelectorAll('#outsideBets button, #dozenBets button').forEach((btn) => {
    const r = btn.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const d = Math.hypot(clientX - cx, clientY - cy);
    if (d <= MAGNET.outsidePx && (!best || d < best.d)) {
      best = { betType: btn.dataset.type, targetNumber: null, numbers: null, x: cx, y: cy, d };
    }
  });
  return best;
}

function pointNearInside(clientX, clientY) {
  return Object.values(cellRectsFromDom()).some((r) => pointInRect(clientX, clientY, inflateRect(r, 8)));
}

function resolveInsideFromPoint(clientX, clientY) {
  const rects = cellRectsFromDom();
  return pickMagneticSnap(clientX, clientY, buildMagneticSnaps(rects), MAGNET, rects);
}

function resolveDrop(clientX, clientY) {
  const inside = resolveInsideFromPoint(clientX, clientY);
  if (inside && pointNearInside(clientX, clientY)) return inside;
  const outside = resolveOutsideFromPoint(clientX, clientY);
  if (outside) return outside;
  return inside;
}

function paintChrome() {
  const flags = controlsDisabled({
    authenticated: state.authenticated || PREVIEW,
    busy: busy() || state.animating || state.scene === Scene.SPINNING,
    hasSelection: hasSelection(),
  });
  if (dom.spinBtn) dom.spinBtn.disabled = flags.spin;
  if (dom.clearBetsBtn) {
    dom.clearBetsBtn.disabled = flags.bets || !state.bets.length || state.scene !== Scene.BETTING;
  }
  dom.chipPresets?.querySelectorAll('button').forEach((btn) => {
    btn.disabled = flags.amounts;
    btn.classList.toggle('is-selected', Number(btn.dataset.bet) === state.bet);
  });
  const placed = activeBets();
  const showResultMarks = Boolean(state.lastPayload?.bets) && (state.scene === Scene.RESULT || state.scene === Scene.SPINNING);
  dom.outsideBets?.querySelectorAll('button').forEach((btn) => {
    btn.disabled = flags.bets;
    const type = btn.dataset.type;
    paintSpotChip(
      btn,
      findPlacedBet(placed, type, null),
      showResultMarks ? resultRowForSpot(type, null) : null,
    );
  });
  dom.dozenBets?.querySelectorAll('button').forEach((btn) => {
    btn.disabled = flags.bets;
    const type = btn.dataset.type;
    paintSpotChip(
      btn,
      findPlacedBet(placed, type, null),
      showResultMarks ? resultRowForSpot(type, null) : null,
    );
  });
  dom.numberGrid?.querySelectorAll('button').forEach((btn) => {
    btn.disabled = flags.bets;
    btn.classList.remove('is-selected', 'is-covered', 'is-hot', 'is-straight-aim', ...SPOT_CHIP_CLASSES);
    btn.removeAttribute('data-spot-label');
  });
  paintTokenLayer(placed, showResultMarks ? state.lastPayload?.bets : null);
  paintPlacedStrip(dom.spinBetsRow, placed, state.lastPayload?.bets);
  paintPlacedStrip(dom.resultBetsRow, placed, state.lastPayload?.bets);
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

function placeBet(betType, targetNumber = null, numbers = null) {
  if (busy() || !(state.authenticated || PREVIEW) || state.scene !== Scene.BETTING) return false;
  const result = addChipToBets(state.bets, {
    betType,
    targetNumber,
    numbers,
    amount: state.bet,
    balance: state.balance,
  });
  if (result.error) {
    setError(result.error);
    paintChrome();
    return false;
  }
  state.bets = result.bets;
  state.betType = betType;
  state.targetNumber = betType === 'straight' ? Number(targetNumber) : null;
  clearError();
  paintChrome();
  RouletteAudio.playBetSelect();
  return true;
}

function placeResolvedSpot(spot) {
  if (!spot?.betType) return false;
  return placeBet(spot.betType, spot.targetNumber, spot.numbers);
}

function selectOutside(type) {
  placeBet(type, null, null);
}

function selectDozen(type) {
  placeBet(type, null, null);
}

function selectStraight(number) {
  placeBet('straight', Number(number), null);
}

function clearPlacedBets() {
  if (busy() || state.scene !== Scene.BETTING) return;
  if (!state.bets.length) return;
  state.bets = [];
  state.betType = null;
  state.targetNumber = null;
  clearError();
  paintChrome();
}

function selectBet(amount) {
  if (busy() || !(state.authenticated || PREVIEW) || state.scene !== Scene.BETTING) return;
  if (!BETS.includes(amount)) return;
  const changed = state.bet !== amount;
  state.bet = amount;
  paintChrome();
  if (changed) RouletteAudio.playChipSelect();
}

const DRAG_THRESHOLD = 8;
const GHOST_LIFT = 40;
/** @type {{ mode: 'pending'|'drag'|'tap', pointerId: number, startX: number, startY: number, amount: number, fromChip: boolean } | null} */
let gesture = null;
let ignoreTableTapUntil = 0;

function showGhost(amount, clientX, clientY) {
  const g = dom.ghostChip;
  if (!g) return;
  g.hidden = false;
  g.removeAttribute('hidden');
  g.className = `ghost-chip chip chip--${amount}`;
  g.textContent = formatChips(amount);
  g.style.left = `${clientX}px`;
  g.style.top = `${clientY - GHOST_LIFT}px`;
}

function hideGhost() {
  const g = dom.ghostChip;
  if (!g) return;
  g.hidden = true;
  g.setAttribute('hidden', '');
  g.setAttribute('aria-hidden', 'true');
  g.className = 'ghost-chip';
  g.textContent = '';
  g.style.left = '-9999px';
  g.style.top = '-9999px';
}

function setDragging(on) {
  document.documentElement.classList.toggle('is-chip-dragging', on);
}

function clearBettingPointerUi() {
  const pointerId = gesture?.pointerId;
  if (pointerId != null) {
    document.querySelectorAll('.chip').forEach((el) => {
      try {
        if (el.hasPointerCapture?.(pointerId)) el.releasePointerCapture(pointerId);
      } catch {
        /* already released */
      }
    });
  }
  gesture = null;
  ignoreTableTapUntil = 0;
  hideGhost();
  setDragging(false);
  clearAim();
}

function endGesture() {
  clearBettingPointerUi();
}

function bindChipDrag(btn, amount) {
  btn.addEventListener('pointerdown', (ev) => {
    if (busy() || !(state.authenticated || PREVIEW) || state.scene !== Scene.BETTING) return;
    if (ev.button != null && ev.button !== 0) return;
    gesture = {
      mode: 'pending',
      pointerId: ev.pointerId,
      startX: ev.clientX,
      startY: ev.clientY,
      amount,
      fromChip: true,
    };
    try {
      btn.setPointerCapture?.(ev.pointerId);
    } catch {
      /* capture not required for tap-select */
    }
  });
}

function bindTablePointer() {
  const startInside = (ev) => {
    if (busy() || !(state.authenticated || PREVIEW) || state.scene !== Scene.BETTING) return;
    if (gesture?.mode === 'drag') return;
    if (ev.button != null && ev.button !== 0) return;
    if (Date.now() < ignoreTableTapUntil) return;
    ev.preventDefault();
    const local = {
      mode: 'tap',
      pointerId: ev.pointerId,
      startX: ev.clientX,
      startY: ev.clientY,
      amount: state.bet,
      fromChip: false,
    };
    showAim(resolveDrop(ev.clientX, ev.clientY));
    const move = (e) => {
      if (e.pointerId !== local.pointerId) return;
      const dx = e.clientX - local.startX;
      const dy = e.clientY - local.startY;
      if (local.mode === 'tap' && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        local.mode = 'drag';
      }
      showAim(resolveDrop(e.clientX, e.clientY));
    };
    const up = (e) => {
      if (e.pointerId !== local.pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      if (Date.now() < ignoreTableTapUntil) {
        clearAim();
        return;
      }
      const spot = resolveDrop(e.clientX, e.clientY);
      clearAim();
      if (spot) placeResolvedSpot(spot);
    };
    const cancel = (e) => {
      if (e.pointerId !== local.pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      clearAim();
    };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };
  dom.numberGrid.addEventListener('pointerdown', startInside);
}

function onPointerMove(ev) {
  if (!gesture || ev.pointerId !== gesture.pointerId) return;
  const dx = ev.clientX - gesture.startX;
  const dy = ev.clientY - gesture.startY;
  if (gesture.mode === 'pending' && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
    gesture.mode = 'drag';
    selectBet(gesture.amount);
    setDragging(true);
    ev.preventDefault();
  }
  if (gesture.mode !== 'drag') return;
  ev.preventDefault();
  showGhost(gesture.amount, ev.clientX, ev.clientY);
  showAim(resolveDrop(ev.clientX, ev.clientY));
}

function onPointerUp(ev) {
  if (!gesture || ev.pointerId !== gesture.pointerId) return;
  const current = gesture;
  if (current.mode === 'drag') {
    ignoreTableTapUntil = Date.now() + 280;
    const spot = resolveDrop(ev.clientX, ev.clientY);
    endGesture();
    if (spot) placeResolvedSpot(spot);
    return;
  }
  endGesture();
}

window.addEventListener('pointermove', onPointerMove, { passive: false, capture: true });
window.addEventListener('pointerup', onPointerUp, { capture: true });
window.addEventListener('pointercancel', () => endGesture(), { capture: true });
window.addEventListener('resize', () => {
  if (state.scene === Scene.BETTING) paintChrome();
});

function buildBoard() {
  dom.outsideBets.replaceChildren(
    ...OUTSIDE_BETS.map((bet) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = bet.className;
      btn.dataset.type = bet.type;
      btn.textContent = bet.label;
      btn.addEventListener('click', () => {
        if (gesture?.mode === 'drag') return;
        selectOutside(bet.type);
      });
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
      btn.addEventListener('click', () => {
        if (gesture?.mode === 'drag') return;
        selectDozen(bet.type);
      });
      return btn;
    }),
  );

  const zero = document.createElement('button');
  zero.type = 'button';
  zero.className = 'num num--green';
  zero.dataset.number = '0';
  zero.textContent = '0';
  const cells = [zero];
  for (let n = 1; n <= 36; n += 1) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `num num--${pocketColor(n)}`;
    btn.dataset.number = String(n);
    btn.textContent = String(n);
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
      btn.addEventListener('click', (ev) => {
        if (gesture?.mode === 'drag' || ev.defaultPrevented) return;
        selectBet(amount);
      });
      bindChipDrag(btn, amount);
      return btn;
    }),
  );

  bindTablePointer();
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
  clearBettingPointerUi();
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
  clearBettingPointerUi();
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
      bets: state.bets.map((row) => ({
        ...row,
        numbers: Array.isArray(row.numbers) ? [...row.numbers] : row.numbers,
      })),
    };
  }

  const pending = state.pending;
  const body = buildSpinBody({
    bets: pending.bets,
    actionId: pending.actionId,
  });

  // Disable table while requesting.
  paintChrome();

  if (PREVIEW) {
    const forced = window.__ROULETTE_PREVIEW_PAYLOAD__;
    const number = forced?.number
      ?? (pending.bets.find((row) => row.betType === 'straight')?.targetNumber ?? 32);
    const evaluated = previewEvaluateBets(pending.bets, number);
    const mock = forced ? {
      ...forced,
      ...evaluated,
      number: forced.number ?? number,
      color: forced.color || pocketColor(forced.number ?? number),
      action_id: pending.actionId,
      balance_after: (state.balance ?? 20000) - evaluated.total_bet + (forced.final_credit ?? evaluated.final_credit),
    } : {
      ...PREVIEW_SCENARIOS.win_red,
      ...evaluated,
      action_id: pending.actionId,
      number,
      color: pocketColor(number),
      parity: number === 0 ? null : (number % 2 === 0 ? 'even' : 'odd'),
      bet: evaluated.total_bet,
      bet_type: pending.bets.length === 1 ? pending.bets[0].betType : pending.bets[0]?.betType,
      target_number: pending.bets.length === 1 && pending.bets[0].betType === 'straight'
        ? pending.bets[0].targetNumber
        : null,
      balance_before: state.balance ?? 20000,
      balance_after: (state.balance ?? 20000) - evaluated.total_bet + evaluated.final_credit,
      chips_delta: evaluated.net_result,
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
        if (Array.isArray(detail.bets) && detail.bets.length) {
          state.bets = detail.bets.map((row) => ({ ...row }));
          paintChrome();
        }
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
      if (detail.bets) {
        state.bets = detail.bets;
      } else if (detail.bet_type) {
        state.bets = [{
          betType: detail.bet_type,
          targetNumber: detail.target_number ?? null,
          amount: detail.bet || state.bet,
        }];
        state.betType = detail.bet_type;
        state.targetNumber = detail.target_number ?? null;
        state.bet = detail.bet || state.bet;
      } else if (!state.bets.length) {
        state.bets = [{ betType: 'red', targetNumber: null, amount: state.bet }];
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

dom.clearBetsBtn?.addEventListener('click', () => {
  clearPlacedBets();
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
