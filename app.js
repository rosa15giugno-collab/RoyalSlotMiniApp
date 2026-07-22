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
import { formatChips } from './js/utils.js';

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
  winOverlayAmount: document.getElementById('winOverlayAmount'),
  paylineGuides: document.getElementById('paylineGuides'),
  paylineWins: document.getElementById('paylineWins'),
  reelsWindow: document.querySelector('.reels-window'),
  reels: [...document.querySelectorAll('.reel')],
};

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

function renderBalance() {
  dom.balanceValue.textContent = formatChips(state.balance);
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
  } catch (err) {
    console.warn('[RoyalSlot] Balance load skipped:', err);
  }

  renderUsername();
  renderBalance();
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

function setSpinning(active) {
  state.spinning = active;
  dom.spinBtn.disabled = active;
  dom.spinBtn.classList.toggle('is-spinning', active);
  document.getElementById('app').classList.toggle('is-spinning', active);
  dom.reelsWindow.classList.toggle('reels-window--spinning', active);
  renderBet();
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
      state.betIndex = CONFIG.bet.presets.indexOf(amount);
      state.bet = amount;
      renderBet();
    });
    dom.betPresets.appendChild(btn);
  });
}

function applyGridToReels(grid) {
  dom.reels.forEach((reelEl, reelIndex) => {
    const strip = reelEl.querySelector('.reel__strip');
    strip.innerHTML = '';
    grid[reelIndex].forEach((symbolId) => strip.appendChild(createSymbolCell(symbolId)));
    strip.style.transform = 'translate3d(0, 0, 0)';
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
  renderPaylineGuidesOverlay();
}

function showWinOverlay(amount) {
  if (amount < CONFIG.ui.bigWinThreshold) return;
  dom.winOverlayAmount.textContent = `+${formatChips(amount)}`;
  dom.winOverlay.classList.add('is-visible');
  window.setTimeout(() => dom.winOverlay.classList.remove('is-visible'), CONFIG.ui.bigWinOverlayMs);
}

function formatServerWinningSummary(winningLines) {
  if (!winningLines?.length) return '';

  return winningLines
    .map((entry) => `${entry.line_name} (${String(entry.match).toUpperCase()} x3)`)
    .join(', ');
}

async function handleSpin() {
  if (state.spinning) return;
  if (state.balance < state.bet) {
    setResult('Saldo insufficiente. Riduci la puntata.', 'loss');
    telegram.haptic('error');
    return;
  }

  clearWinEffects();
  setSpinning(true);
  setResult('I rulli girano...', 'neutral');
  state.lastWin = 0;
  renderWin(0);
  telegram.haptic('light');

  const isServerMode = Boolean(CONFIG.api.baseUrl);

  if (isServerMode) {
    try {
      const serverResult = await telegram.requestSpin(state.bet);

      if (!serverResult?.grid) {
        throw new Error('Invalid spin response');
      }

      const stopPromises = dom.reels.map((reelEl, index) => {
        const strip = reelEl.querySelector('.reel__strip');
        return animator.spinReelToColumn({
          reelEl,
          stripEl: strip,
          targetColumn: serverResult.grid[index],
          reelIndex: index,
          createSymbolCell,
          engine,
        });
      });

      await Promise.all(stopPromises);

      const winAmount = serverResult.winAmount;
      const winningSummary = formatServerWinningSummary(serverResult.winningLines);
      const paylineEvaluation = evaluateEnabledPaylines(serverResult.grid, state.bet);

      state.balance = serverResult.balanceAfter;
      state.lastWin = winAmount;
      renderBalance();
      renderWin(winAmount);

      if (winAmount > 0) {
        highlightPaylineWins(paylineEvaluation);
        setResult(formatSpinResult(winAmount, state.bet, winningSummary), 'win');
        showWinOverlay(winAmount);
        telegram.haptic('success');
      } else {
        setResult(formatSpinResult(0, state.bet), 'loss');
        renderPaylineGuidesOverlay();
        telegram.haptic('light');
      }
    } catch (err) {
      console.warn('[RoyalSlot] Server spin failed:', err);
      setResult('Errore durante lo spin. Riprova.', 'loss');
      telegram.haptic('error');
    }

    setSpinning(false);
    return;
  }

  state.balance -= state.bet;
  renderBalance();

  const outcome = engine.spin(state.bet, evaluateEnabledPaylines);

  const stopPromises = dom.reels.map((reelEl, index) => {
    const strip = reelEl.querySelector('.reel__strip');
    return animator.spinReelToColumn({
      reelEl,
      stripEl: strip,
      targetColumn: outcome.grid[index],
      reelIndex: index,
      createSymbolCell,
      engine,
    });
  });

  await Promise.all(stopPromises);

  const finalGrid = readGridFromReels(dom.reels);
  const paylineEvaluation = evaluateEnabledPaylines(finalGrid, state.bet);
  const winAmount = calculateWinAmount(paylineEvaluation);
  const winningSummary = formatWinningLinesSummary(paylineEvaluation.winningLines);

  if (winAmount > 0) {
    state.balance += winAmount;
    state.lastWin = winAmount;
    renderBalance();
    renderWin(winAmount);
    highlightPaylineWins(paylineEvaluation);
    setResult(formatSpinResult(winAmount, state.bet, winningSummary), 'win');
    showWinOverlay(winAmount);
    telegram.haptic('success');
  } else {
    renderWin(0);
    setResult(formatSpinResult(0, state.bet), 'loss');
    renderPaylineGuidesOverlay();
    telegram.haptic('light');
  }

  setSpinning(false);
}

function bindEvents() {
  dom.betMinus.addEventListener('click', () => {
    if (state.spinning || state.betIndex <= 0) return;
    state.betIndex -= 1;
    state.bet = CONFIG.bet.presets[state.betIndex];
    renderBet();
  });

  dom.betPlus.addEventListener('click', () => {
    if (state.spinning || state.betIndex >= CONFIG.bet.presets.length - 1) return;
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

  buildBetPresets();
  buildInitialReels();
  renderUsername();
  renderBalance();
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
