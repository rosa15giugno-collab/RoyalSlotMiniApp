/**
 * Royal Slot by Rosa — Frontend Demo
 */

import { CONFIG } from './js/config.js';
import { TelegramBridge } from './js/telegram-bridge.js';
import { SlotEngine } from './js/slot-engine.js';
import { ReelAnimator } from './js/reel-animator.js';
import {
  clearWinningLineOverlays,
  renderPaylineGuides,
  renderWinningLineOverlays,
} from './js/payline-guides.js';
import {
  calculateWinAmount,
  evaluateEnabledPaylines,
  formatWinningLinesSummary,
  getGridCell,
  readGridFromReels,
} from './js/paylines.js';
import { formatChips, formatPayoutMultiplier, shouldShowVipSecondChance, vipTierLabel } from './js/utils.js';
import { audio } from './js/audio-manager.js';

const telegram = new TelegramBridge();
const engine = new SlotEngine(CONFIG);
const animator = new ReelAnimator(CONFIG);

const state = {
  balance: CONFIG.demo.initialBalance,
  bet: CONFIG.bet.default,
  betIndex: CONFIG.bet.presets.indexOf(CONFIG.bet.default),
  spinning: false,
  lastWin: 0,
  username: null,
  usernameIsTest: false,
};

let displayedBalance = null;
let balanceAnimFrame = null;
const reelStopTimers = [];
let fxLayerEl = null;

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const dom = {
  usernameRow: document.getElementById('usernameRow'),
  usernameValue: document.getElementById('usernameValue'),
  balanceValue: document.getElementById('balanceValue'),
  betValue: document.getElementById('betValue'),
  betMinus: document.getElementById('betMinus'),
  betPlus: document.getElementById('betPlus'),
  betPresets: document.getElementById('betPresets'),
  spinBtn: document.getElementById('spinBtn'),
  resultText: document.getElementById('resultText'),
  winValue: document.getElementById('winValue'),
  winOverlay: document.getElementById('winOverlay'),
  winOverlayTitle: document.getElementById('winOverlayTitle'),
  winOverlayBase: document.getElementById('winOverlayBase'),
  winOverlayBonus: document.getElementById('winOverlayBonus'),
  winOverlayExtra: document.getElementById('winOverlayExtra'),
  winOverlayAmount: document.getElementById('winOverlayAmount'),
  payoutBadge: document.getElementById('payoutBadge'),
  vipOverlay: document.getElementById('vipOverlay'),
  vipOverlayTier: document.getElementById('vipOverlayTier'),
  vipOverlayTitle: document.getElementById('vipOverlayTitle'),
  paylineGuides: document.getElementById('paylineGuides'),
  paylineWins: document.getElementById('paylineWins'),
  reelsWindow: document.querySelector('.reels-window'),
  reels: [...document.querySelectorAll('.reel')],
  appShell: document.getElementById('app'),
  audioToggle: null,
};

function ensureAudioUnlocked() {
  audio.unlock();
}

function clearReelStopTimers() {
  while (reelStopTimers.length) {
    window.clearTimeout(reelStopTimers.pop());
  }
}

function getReelStopDelayMs(reelIndex) {
  const { spinDurationMs, reelStopDelayMs } = CONFIG.reels;
  return reelIndex * reelStopDelayMs + spinDurationMs + reelIndex * 140;
}

function scheduleReelStopSounds() {
  clearReelStopTimers();

  for (let reelIndex = 0; reelIndex < CONFIG.reels.count; reelIndex += 1) {
    const timerId = window.setTimeout(() => {
      audio.playReelStop(reelIndex);
    }, getReelStopDelayMs(reelIndex));
    reelStopTimers.push(timerId);
  }
}

function playOutcomeSound(winAmount) {
  if (winAmount >= CONFIG.ui.bigWinThreshold) {
    audio.playBigWin();
    return;
  }
  if (winAmount > 0) {
    audio.playWinNormal();
    return;
  }
  audio.playLoss();
}

function getFxLayer() {
  if (fxLayerEl?.isConnected) return fxLayerEl;

  fxLayerEl = document.createElement('div');
  fxLayerEl.className = 'fx-layer';
  fxLayerEl.setAttribute('aria-hidden', 'true');
  dom.appShell.appendChild(fxLayerEl);
  return fxLayerEl;
}

function getElementCenter(el) {
  const rect = el.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function scheduleFxRemoval(el, ms) {
  window.setTimeout(() => {
    el.remove();
  }, ms);
}

function spawnFlyingChips() {
  const layer = getFxLayer();
  const origin = getElementCenter(dom.reelsWindow);
  const target = getElementCenter(dom.balanceValue);
  const count = 5 + Math.floor(Math.random() * 4);

  for (let i = 0; i < count; i += 1) {
    const chip = document.createElement('div');
    chip.className = 'fx-chip';
    if (i % 2 === 0) chip.classList.add('fx-chip--disc');

    const startOffsetX = (Math.random() - 0.5) * 96;
    const startOffsetY = (Math.random() - 0.5) * 48;
    const duration = 500 + Math.random() * 300;
    const delay = i * (35 + Math.random() * 25);
    const deltaX = target.x - origin.x - startOffsetX;
    const deltaY = target.y - origin.y - startOffsetY;

    chip.style.left = `${origin.x + startOffsetX}px`;
    chip.style.top = `${origin.y + startOffsetY}px`;
    chip.style.setProperty('--fx-dx', `${deltaX}px`);
    chip.style.setProperty('--fx-dy', `${deltaY}px`);
    chip.style.setProperty('--fx-rotate', `${160 + Math.random() * 320}deg`);
    chip.style.setProperty('--fx-duration', `${duration}ms`);
    chip.style.setProperty('--fx-delay', `${delay}ms`);

    chip.addEventListener('animationend', () => chip.remove(), { once: true });
    scheduleFxRemoval(chip, duration + delay + 120);
    layer.appendChild(chip);
  }
}

function spawnCoinRain() {
  const layer = getFxLayer();
  const count = 18 + Math.floor(Math.random() * 7);

  for (let i = 0; i < count; i += 1) {
    const coin = document.createElement('div');
    coin.className = 'fx-rain-coin';

    const left = Math.random() * window.innerWidth;
    const duration = 1200 + Math.random() * 800;
    const delay = Math.random() * 550;
    const drift = (Math.random() - 0.5) * 140;

    coin.style.left = `${left}px`;
    coin.style.setProperty('--fx-rain-drift', `${drift}px`);
    coin.style.setProperty('--fx-rain-rotate', `${360 + Math.random() * 720}deg`);
    coin.style.setProperty('--fx-duration', `${duration}ms`);
    coin.style.setProperty('--fx-delay', `${delay}ms`);

    coin.addEventListener('animationend', () => coin.remove(), { once: true });
    scheduleFxRemoval(coin, duration + delay + 120);
    layer.appendChild(coin);
  }
}

function playWinVisualEffects(winAmount) {
  if (winAmount <= 0 || prefersReducedMotion.matches) return;

  spawnFlyingChips();

  if (winAmount >= CONFIG.ui.bigWinThreshold) {
    spawnCoinRain();
  }
}

function clearWinFx() {
  if (fxLayerEl) {
    fxLayerEl.replaceChildren();
  }
}

function createAudioToggle() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'audio-toggle';
  btn.setAttribute('aria-label', 'Attiva o disattiva audio');
  btn.textContent = audio.isEnabled() ? '🔊' : '🔇';

  btn.addEventListener('click', () => {
    ensureAudioUnlocked();
    audio.setEnabled(!audio.isEnabled());
    btn.textContent = audio.isEnabled() ? '🔊' : '🔇';
    if (audio.isEnabled()) {
      audio.playClick();
    }
  });

  dom.appShell.appendChild(btn);
  dom.audioToggle = btn;
}

function createAmbientSparkles() {
  const sparkleLayout = [
    { top: '10%', left: '6%', delay: '0s', drift: '-14px' },
    { top: '24%', right: '4%', delay: '1.2s', drift: '12px' },
    { top: '46%', left: '3%', delay: '2.4s', drift: '10px' },
    { top: '58%', right: '8%', delay: '0.8s', drift: '-10px' },
    { top: '72%', left: '10%', delay: '1.8s', drift: '16px' },
    { top: '84%', right: '12%', delay: '3s', drift: '-12px' },
  ];

  sparkleLayout.forEach((layout) => {
    const sparkle = document.createElement('div');
    sparkle.className = 'ambient-sparkle';
    sparkle.setAttribute('aria-hidden', 'true');
    sparkle.style.top = layout.top;
    if (layout.left) sparkle.style.left = layout.left;
    if (layout.right) sparkle.style.right = layout.right;
    sparkle.style.setProperty('--sparkle-delay', layout.delay);
    sparkle.style.setProperty('--sparkle-drift', layout.drift);
    dom.appShell.appendChild(sparkle);
  });
}

function symbolImageSrc(id) {
  return `${CONFIG.assets.symbolsPath}/${id}.png?v=3`;
}

function createSymbolCell(symbolId) {
  const cell = document.createElement('div');
  cell.className = 'symbol-cell';
  cell.dataset.symbol = symbolId;

  const img = document.createElement('img');
  img.className = 'symbol-cell__img';
  img.src = symbolImageSrc(symbolId);
  img.alt = symbolId;
  img.loading = 'eager';
  img.decoding = 'async';
  img.onerror = () => {
    img.remove();
    cell.classList.add('symbol-cell--fallback');
    cell.dataset.fallbackLabel = symbolId.toUpperCase();
  };

  cell.appendChild(img);
  return cell;
}

function buildInitialReels() {
  const grid = engine.buildInitialGrid();

  dom.reels.forEach((reelEl, reelIndex) => {
    const strip = reelEl.querySelector('.reel__strip');
    strip.innerHTML = '';
    grid[reelIndex].forEach((symbolId) => strip.appendChild(createSymbolCell(symbolId)));
    strip.style.transform = 'translate3d(0, 0, 0)';
  });
}

function applyPayoutBadge(payload) {
  const badge = dom.payoutBadge;
  if (!badge) return;
  const payout = Number(payload?.payout_multiplier);
  const label = formatPayoutMultiplier(payout);
  const dailyActive = Boolean(payload?.daily_bonus_active);
  const remaining = Number(payload?.daily_wins_remaining);
  if (!label) {
    badge.hidden = true;
    badge.textContent = '';
    return;
  }
  badge.hidden = false;
  if (dailyActive && remaining > 0) {
    badge.textContent = `${label} • ${Math.trunc(remaining)} rimaste`;
  } else {
    badge.textContent = label;
  }
}

function renderBalance(animate = false) {
  const target = state.balance;

  if (!animate || displayedBalance === null) {
    if (balanceAnimFrame) {
      cancelAnimationFrame(balanceAnimFrame);
      balanceAnimFrame = null;
    }
    displayedBalance = target;
    dom.balanceValue.textContent = formatChips(target);
    return;
  }

  const from = displayedBalance;
  if (from === target) return;

  if (balanceAnimFrame) {
    cancelAnimationFrame(balanceAnimFrame);
  }

  const start = performance.now();
  const duration = 560;

  const tick = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - (1 - progress) ** 3;
    const current = Math.round(from + (target - from) * eased);
    dom.balanceValue.textContent = formatChips(current);

    if (progress < 1) {
      balanceAnimFrame = requestAnimationFrame(tick);
      return;
    }

    displayedBalance = target;
    balanceAnimFrame = null;
    dom.balanceValue.textContent = formatChips(target);
    dom.balanceValue.classList.remove('player-info__balance-value--animating');
  };

  dom.balanceValue.classList.add('player-info__balance-value--animating');
  balanceAnimFrame = requestAnimationFrame(tick);
}

function renderUsername() {
  if (!state.username) {
    dom.usernameRow.hidden = true;
    dom.usernameValue.textContent = '';
    dom.usernameRow.removeAttribute('data-test-mode');
    return;
  }

  dom.usernameValue.textContent = state.username;
  dom.usernameRow.hidden = false;
  if (state.usernameIsTest) {
    dom.usernameRow.dataset.testMode = 'true';
  } else {
    dom.usernameRow.removeAttribute('data-test-mode');
  }
}

async function loadPlayerProfile() {
  const resolved = telegram.resolveUsername();
  state.username = resolved.username;
  state.usernameIsTest = resolved.isTest;

  try {
    const profile = await telegram.fetchProfile();
    if (profile?.username) {
      state.username = profile.username;
      state.usernameIsTest = false;
    }
    if (profile && !profile.demo && typeof profile.balance === 'number') {
      state.balance = profile.balance;
    }
  } catch (err) {
    console.warn('[RoyalSlot] Profile load skipped:', err);
  }

  const telegramUsername = telegram.getUsername();
  if (telegramUsername) {
    state.username = telegramUsername;
    state.usernameIsTest = false;
  }

  try {
    const data = await telegram.fetchBalance();
    if (data && !data.demo && typeof data.balance === 'number') {
      state.balance = data.balance;
    }
    if (data && !data.demo) {
      applyPayoutBadge(data);
    }
  } catch (err) {
    console.warn('[RoyalSlot] Balance load skipped:', err);
  }

  renderUsername();
  renderBalance(false);
}

function renderPaylineGuidesOverlay() {
  if (state.spinning) return;
  renderPaylineGuides(dom.paylineGuides, state.bet, dom.reelsWindow, dom.reels);
}

function renderBet() {
  dom.betValue.textContent = formatChips(state.bet);
  dom.betPresets.querySelectorAll('.bet-preset').forEach((btn) => {
    btn.classList.toggle('is-active', Number(btn.dataset.bet) === state.bet);
  });
  dom.betMinus.disabled = state.spinning || state.betIndex <= 0;
  dom.betPlus.disabled = state.spinning || state.betIndex >= CONFIG.bet.presets.length - 1;
  renderPaylineGuidesOverlay();
}

function renderWin(amount = state.lastWin) {
  dom.winValue.textContent = amount > 0 ? `+${formatChips(amount)}` : formatChips(amount);
}

function formatSpinResult(winAmount, bet, winningSummary = '') {
  if (winAmount > 0) {
    const lines = winningSummary ? `\n${winningSummary}` : '';
    return `🎉 VINCITA!\n+${formatChips(winAmount)} CHIP${lines}`;
  }
  return `Nessuna vincita\n-${formatChips(bet)} CHIP`;
}

function setResult(message, tone = 'neutral') {
  dom.resultText.textContent = message;
  dom.resultText.dataset.tone = tone;
}

function setSpinLoading(active) {
  dom.spinBtn.classList.toggle('is-loading', active);
}

function setReelsSpinning(active) {
  dom.appShell.classList.toggle('is-spinning', active);
  dom.reelsWindow.classList.toggle('reels-window--spinning', active);
}

function setSpinning(active) {
  state.spinning = active;
  dom.spinBtn.disabled = active;
  dom.spinBtn.classList.toggle('is-spinning', active);

  if (!active) {
    setSpinLoading(false);
    setReelsSpinning(false);
  }

  renderBet();
}

async function runReelAnimations(getTargetGrid) {
  setSpinLoading(false);
  setReelsSpinning(true);
  audio.playSpinStart();
  scheduleReelStopSounds();

  const stopPromises = dom.reels.map((reelEl, index) => {
    const strip = reelEl.querySelector('.reel__strip');
    return animator.spinReelToColumn({
      reelEl,
      stripEl: strip,
      targetColumn: getTargetGrid(index),
      reelIndex: index,
      createSymbolCell,
      engine,
    });
  });

  await Promise.all(stopPromises);
  setReelsSpinning(false);
}

function buildBetPresets() {
  CONFIG.bet.presets.forEach((amount) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bet-preset';
    btn.dataset.bet = String(amount);
    btn.textContent = formatChips(amount);
    btn.addEventListener('click', () => {
      if (state.spinning) return;
      ensureAudioUnlocked();
      audio.playClick();
      state.betIndex = CONFIG.bet.presets.indexOf(amount);
      state.bet = amount;
      renderBet();
    });
    dom.betPresets.appendChild(btn);
  });
}

function highlightPaylineWins(paylineEvaluation) {
  if (!paylineEvaluation.winningLines.length) return;

  dom.reelsWindow.classList.add('reels-window--has-wins');
  renderWinningLineOverlays(dom.paylineWins, paylineEvaluation.winningLines, dom.reelsWindow, dom.reels);

  paylineEvaluation.winningLines.forEach((entry) => {
    entry.line.coords.forEach(([reel, row]) => {
      const cell = getGridCell(dom.reels, reel, row);
      if (cell) {
        cell.classList.add('symbol-cell--win');
        cell.dataset.winLine = entry.line.id;
      }
    });
  });
}

function clearWinEffects() {
  document.querySelectorAll('.symbol-cell--win').forEach((el) => {
    el.classList.remove('symbol-cell--win');
    delete el.dataset.winLine;
  });
  dom.reelsWindow.classList.remove('reels-window--has-wins');
  clearWinningLineOverlays(dom.paylineWins);
  dom.winOverlay.classList.remove('is-visible');
  clearWinFx();
  renderPaylineGuidesOverlay();
}

function showVipSecondChanceOverlay(serverResult) {
  if (!shouldShowVipSecondChance({
    vip_second_chance_triggered: serverResult.vipSecondChanceTriggered,
    vip_second_chance_result_used: serverResult.vipSecondChanceResultUsed,
  })) return Promise.resolve();
  const overlay = dom.vipOverlay;
  if (!overlay) return Promise.resolve();
  const tier = vipTierLabel(serverResult.vipLevel);
  if (dom.vipOverlayTier) {
    dom.vipOverlayTier.textContent = tier ? `VIP ${tier}` : 'BONUS VIP';
  }
  if (dom.vipOverlayTitle) {
    dom.vipOverlayTitle.textContent = 'SECONDA CHANCE!';
  }
  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');
  overlay.classList.add('is-visible');
  return new Promise((resolve) => {
    window.setTimeout(() => {
      overlay.classList.remove('is-visible');
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
      resolve();
    }, 1800);
  });
}

function showWinOverlay(amount, bonus = null) {
  const hasBonus = Boolean(bonus?.applied) && amount > 0;
  if (!hasBonus && amount < CONFIG.ui.bigWinThreshold) return;
  const title = dom.winOverlayTitle;
  const baseEl = dom.winOverlayBase;
  const bonusEl = dom.winOverlayBonus;
  const extraEl = dom.winOverlayExtra;
  if (hasBonus) {
    const multLabel = formatPayoutMultiplier(bonus.multiplier);
    if (title) title.textContent = 'VINCITA';
    if (baseEl) {
      baseEl.hidden = false;
      baseEl.textContent = `${formatChips(bonus.baseWin)} CHIPS`;
    }
    if (bonusEl) {
      bonusEl.hidden = false;
      bonusEl.textContent = `BONUS ${multLabel}!`;
    }
    if (extraEl) {
      extraEl.hidden = !(bonus.extra > 0);
      extraEl.textContent = bonus.extra > 0 ? `+${formatChips(bonus.extra)} CHIPS` : '';
    }
    if (dom.winOverlayAmount) {
      dom.winOverlayAmount.textContent = `TOTALE ${formatChips(amount)}`;
    }
    dom.winOverlay.classList.add('has-bonus');
  } else {
    if (title) title.textContent = 'JACKPOT!';
    if (baseEl) baseEl.hidden = true;
    if (bonusEl) bonusEl.hidden = true;
    if (extraEl) extraEl.hidden = true;
    if (dom.winOverlayAmount) {
      dom.winOverlayAmount.textContent = `+${formatChips(amount)}`;
    }
    dom.winOverlay.classList.remove('has-bonus');
  }
  dom.winOverlay.classList.add('is-visible');
  window.setTimeout(() => {
    dom.winOverlay.classList.remove('is-visible', 'has-bonus');
  }, hasBonus ? Math.max(CONFIG.ui.bigWinOverlayMs, 2600) : CONFIG.ui.bigWinOverlayMs);
}

function formatServerWinningSummary(winningLines) {
  if (!winningLines?.length) return '';

  return winningLines
    .map((entry) => `${entry.line_name} (${String(entry.match).toUpperCase()} x3)`)
    .join(', ');
}

function createSpinReferenceId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `spin-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

async function handleSpin() {
  if (state.spinning) return;
  if (state.balance < state.bet) {
    setResult('Saldo insufficiente. Riduci la puntata.', 'loss');
    telegram.haptic('error');
    return;
  }

  ensureAudioUnlocked();
  audio.playClick();

  clearWinEffects();
  clearReelStopTimers();
  setSpinning(true);
  setSpinLoading(Boolean(CONFIG.api.baseUrl) && Boolean(telegram.getInitData()));
  setResult('I rulli girano...', 'neutral');
  state.lastWin = 0;
  renderWin(0);
  telegram.haptic('light');

  const isServerMode = Boolean(CONFIG.api.baseUrl) && Boolean(telegram.getInitData());

  if (isServerMode) {
    const referenceId = createSpinReferenceId();
    try {
      const serverResult = await telegram.requestSpin(state.bet, referenceId);

      if (!serverResult?.grid) {
        throw new Error('Invalid spin response');
      }

      await runReelAnimations((index) => serverResult.grid[index]);

      await showVipSecondChanceOverlay(serverResult);

      const winAmount = serverResult.winAmount;
      const winningSummary = formatServerWinningSummary(serverResult.winningLines);
      // Overlay uses local payline geometry; credited chips are server winAmount.
      const paylineEvaluation = evaluateEnabledPaylines(serverResult.grid, state.bet);

      state.balance = serverResult.balanceAfter;
      state.lastWin = winAmount;
      renderBalance(true);
      renderWin(winAmount);
      playOutcomeSound(winAmount);
      applyPayoutBadge({
        payout_multiplier: serverResult.payoutMultiplier,
        daily_bonus_active: serverResult.dailyBonusActive,
        daily_wins_remaining: serverResult.dailyWinsRemaining,
      });

      if (winAmount > 0) {
        playWinVisualEffects(winAmount);
        highlightPaylineWins(paylineEvaluation);
        setResult(formatSpinResult(winAmount, state.bet, winningSummary), 'win');
        showWinOverlay(winAmount, {
          applied: Boolean(serverResult.bonusApplied) && !serverResult.replayed,
          baseWin: Number(serverResult.baseWin) || 0,
          multiplier: serverResult.payoutMultiplier,
          extra: Number(serverResult.bonusExtra) || 0,
        });
        telegram.haptic('success');
      } else {
        setResult(formatSpinResult(0, state.bet), 'loss');
        renderPaylineGuidesOverlay();
        telegram.haptic('light');
      }
    } catch (err) {
      console.warn('[RoyalSlot] Server spin failed:', err);
      clearReelStopTimers();
      setSpinLoading(false);
      setReelsSpinning(false);
      if (err?.code === 'insufficient_balance') {
        setResult('Saldo insufficiente. Riduci la puntata.', 'loss');
      } else {
        setResult('Errore durante lo spin. Riprova.', 'loss');
      }
      telegram.haptic('error');
    }

    setSpinning(false);
    return;
  }

  state.balance -= state.bet;
  renderBalance(true);

  const outcome = engine.spin(state.bet, evaluateEnabledPaylines);

  await runReelAnimations((index) => outcome.grid[index]);

  const finalGrid = readGridFromReels(dom.reels);
  const paylineEvaluation = evaluateEnabledPaylines(finalGrid, state.bet);
  const winAmount = calculateWinAmount(paylineEvaluation);
  const winningSummary = formatWinningLinesSummary(paylineEvaluation.winningLines);

  if (winAmount > 0) {
    state.balance += winAmount;
    state.lastWin = winAmount;
    renderBalance(true);
    renderWin(winAmount);
    playWinVisualEffects(winAmount);
    highlightPaylineWins(paylineEvaluation);
    setResult(formatSpinResult(winAmount, state.bet, winningSummary), 'win');
    showWinOverlay(winAmount);
    playOutcomeSound(winAmount);
    telegram.haptic('success');
  } else {
    renderWin(0);
    setResult(formatSpinResult(0, state.bet), 'loss');
    renderPaylineGuidesOverlay();
    playOutcomeSound(0);
    telegram.haptic('light');
  }

  setSpinning(false);
}

function bindEvents() {
  dom.betMinus.addEventListener('click', () => {
    if (state.spinning || state.betIndex <= 0) return;
    ensureAudioUnlocked();
    audio.playClick();
    state.betIndex -= 1;
    state.bet = CONFIG.bet.presets[state.betIndex];
    renderBet();
  });

  dom.betPlus.addEventListener('click', () => {
    if (state.spinning || state.betIndex >= CONFIG.bet.presets.length - 1) return;
    ensureAudioUnlocked();
    audio.playClick();
    state.betIndex += 1;
    state.bet = CONFIG.bet.presets[state.betIndex];
    renderBet();
  });

  dom.spinBtn.addEventListener('click', handleSpin);
}

async function init() {
  telegram.init();

  const resolved = telegram.resolveUsername();
  state.username = resolved.username;
  state.usernameIsTest = resolved.isTest;

  createAmbientSparkles();
  createAudioToggle();
  buildBetPresets();
  buildInitialReels();
  renderUsername();
  renderBalance(false);
  renderBet();
  renderWin(0);
  requestAnimationFrame(() => renderPaylineGuidesOverlay());
  window.addEventListener('resize', () => {
    window.requestAnimationFrame(renderPaylineGuidesOverlay);
  });
  bindEvents();
  await loadPlayerProfile();
}

init();
