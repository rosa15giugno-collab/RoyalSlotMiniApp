/**
 * PokerSlot frontend — MATH_V6.
 * Production: server-authoritative /api/poker/spin (no local payout/RNG).
 * DEV preview (?lineTest, ?bonusTest, ?comboTest, ?winFxTest, ?fsTest, …):
 * local fixtures only — never touches the real wallet.
 * Audio: poker/audio-manager.js. POKERSLOT_SELECTED_V1 frozen.
 */

import { TelegramBridge } from '../js/telegram-bridge.js';
import { CONFIG } from '../js/config.js';
import { formatChips } from '../js/utils.js';
import {
  ASSETS,
  BETS,
  CONTROLS,
  DEMO_GRID,
  HUD,
  REELS,
  SPIN_TIMING,
  SYMBOL_FILES,
} from './layout.js?v=6';
import {
  buildSpinStrip,
  measureReel,
  mountReel,
  paintIdle,
  pickStripExtras,
  preloadCards,
  spinReels,
} from './reel-animator.js?v=9';
import { COLS, filenameFromId, idsFromFilenames } from './game-config.js';
import { getActivePaylines } from './paylines.js?v=6';
import { evaluateGrid } from './engine.js';
import {
  MATH_V6,
  createWeightedSampler,
  generateWeightedGrid,
  settleGuaranteedCashBonus,
  settleSimulatedSpin,
} from './math-config.js?v=6';
import { toWalletChips } from './wallet-chips.js';
import { classifyWin, pokerAudio, WIN_TIERS } from './audio-manager.js?v=27';
import {
  bindWinFx,
  hideWinFx,
  playWinFx,
  winFxTestChips,
} from './win-fx.js?v=4';
import {
  clearPaylineSvg,
  paylineMap,
  renderPaylineGuides,
  renderWinningPaylines,
} from './payline-overlay.js?v=6';
import {
  freeSpinsForScatterCount,
  overlayPipCount,
  overlayScatterLabel,
} from './free-spin-award.js';
import {
  buildServerFxRound,
  expectedAudioSeq,
  parseServerFxKind,
} from './server-fx-fixtures.js?v=1';

const telegram = new TelegramBridge();

/** Debug only: engine eval after demo grid. Flip to false to silence. */
const ENGINE_DEBUG = true;

const FS_OVERLAY_MS = 1800;
const FS_GAP_MS = 420;
const WIN_HIGHLIGHT_MS = 1400;
const LINE_PREVIEW_MS = 850;
const LINE_SEQ_MS = 620;
const MX_HIGHLIGHT_MS = 850;
const MX_FLIP_MS = 560;
const MX_REVEAL_MS = 1700;

const WIN_PREVIEW_ONE = Object.freeze([
  'a.png', 'a.png', 'a.png', 'k.png', 'q.png',
  'club.png', 'spade.png', 'heart.png', 'diamond.png', 'k.png',
  'q.png', 'j.png', '777.png', 'club.png', 'spade.png',
]);

const WIN_PREVIEW_MULTI = Object.freeze([
  'a.png', 'a.png', 'a.png', 'a.png', 'a.png',
  'a.png', 'a.png', 'a.png', 'a.png', 'a.png',
  'club.png', 'spade.png', 'heart.png', 'diamond.png', 'k.png',
]);

const LINE_TEST_A = Object.freeze([
  'heart.png', 'heart.png', 'heart.png', 'club.png', 'spade.png',
  'a.png', 'k.png', 'q.png', 'j.png', '777.png',
  'a.png', 'k.png', 'q.png', 'j.png', '777.png',
]);

const LINE_TEST_B = Object.freeze([
  'club.png', 'club.png', 'heart.png', 'k.png', 'heart.png',
  'heart.png', 'spade.png', 'q.png', 'j.png', '777.png',
  'a.png', 'k.png', 'q.png', 'heart.png', 'heart.png',
]);

const LINE_TEST_C = Object.freeze([
  'heart.png', 'heart.png', 'heart.png', 'heart.png', 'heart.png',
  'a.png', 'k.png', 'q.png', 'j.png', '777.png',
  'a.png', 'k.png', 'q.png', 'j.png', '777.png',
]);

const LINE_TEST_D = Object.freeze([
  'a.png', 'a.png', 'a.png', 'club.png', 'spade.png',
  'k.png', 'k.png', 'k.png', 'q.png', 'j.png',
  'club.png', 'spade.png', 'heart.png', 'diamond.png', '777.png',
]);

const LINE_TEST_E = Object.freeze([
  'heart.png', 'wild.png', 'heart.png', 'club.png', 'spade.png',
  'a.png', 'k.png', 'q.png', 'j.png', '777.png',
  'a.png', 'k.png', 'q.png', 'j.png', '777.png',
]);

const pickWeighted = createWeightedSampler(MATH_V6.symbols);
const gridBuffer = new Array(15);

const state = {
  betKey: '100',
  balance: CONFIG.demo.initialBalance,
  spinning: false,
  ready: false,
  cards: [...DEMO_GRID],
  lastEval: null,
  lastSettle: null,
  lastMystery: null,
  mysteryDraws: 0,
  mysteryCredited: false,
  inFreeSpins: false,
  freeSpinsLeft: 0,
  lockedBet: null,
  overlayShows: 0,
  fsTestRetriggerCheck: false,
  mysteryPhase: '',
  serverAuthoritative: false,
};

const dom = {
  machine: document.getElementById('machine'),
  machineArt: document.getElementById('machineArt'),
  cardGrid: document.getElementById('cardGrid'),
  balanceValue: document.getElementById('balanceValue'),
  winPlaque: document.getElementById('winPlaque'),
  winValue: document.getElementById('winValue'),
  betValue: document.getElementById('betValue'),
  controls: document.getElementById('controls'),
  fsOverlay: document.getElementById('freeSpinOverlay'),
  fsRemain: document.getElementById('fsRemain'),
  fsRemainCount: document.getElementById('fsRemainCount'),
  fsLabel: document.getElementById('fsLabel'),
  fsCount: document.getElementById('fsCount'),
  fsScatterImg: document.getElementById('fsScatterImg'),
  fsPips: document.getElementById('fsPips'),
  mxOverlay: document.getElementById('mysteryOverlay'),
  mxCount: document.getElementById('mxCount'),
  mxPips: document.getElementById('mxPips'),
  mxPick: document.getElementById('mxPick'),
  mxPrize: document.getElementById('mxPrize'),
  mxBurst: document.getElementById('mxBurst'),
  paylineGuides: document.getElementById('paylineGuides'),
  paylineWins: document.getElementById('paylineWins'),
  lineCount: document.getElementById('lineCount'),
  winFx: document.getElementById('winFx'),
  winFxKicker: document.getElementById('winFxKicker'),
  winFxAmount: document.getElementById('winFxAmount'),
  winFxBurst: document.getElementById('winFxBurst'),
  winFxRain: document.getElementById('winFxRain'),
  winFxFlash: document.getElementById('winFxFlash'),
};

const winFxRefs = bindWinFx({
  winFx: document.getElementById('winFx'),
  winFxKicker: document.getElementById('winFxKicker'),
  winFxAmount: document.getElementById('winFxAmount'),
  winFxBurst: document.getElementById('winFxBurst'),
  winFxRain: document.getElementById('winFxRain'),
  winFxFlash: document.getElementById('winFxFlash'),
  machine: document.getElementById('machine'),
});

let mysteryPickLocked = false;

const betButtons = new Map();
const reels = [];
let spinButton = null;
let linePreviewTimer = 0;
const cardUrls = SYMBOL_FILES.map((name) => `${ASSETS.symbolsDir}${name}`);

function applyBox(el, box) {
  el.style.left = `${box.left}%`;
  el.style.top = `${box.top}%`;
  el.style.width = `${box.width}%`;
  el.style.height = `${box.height}%`;
}

function cardUrl(name) {
  return `${ASSETS.symbolsDir}${name}`;
}

function columnUrls(names, col) {
  return [names[col], names[col + 5], names[col + 10]].map(cardUrl);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Impossibile caricare ${src}`));
    img.src = src;
  });
}

function isEdgeWhite(r, g, b, a) {
  if (a < 8) return true;
  const brightness = (r + g + b) / 3;
  const saturation = Math.max(r, g, b) - Math.min(r, g, b);
  return brightness >= 242 && saturation <= 18;
}

async function knockoutWhiteBackdrop(src) {
  const img = await loadImage(src);
  const maxW = 480;
  const scale = Math.min(1, maxW / img.naturalWidth);
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const seen = new Uint8Array(width * height);
  const stack = [];

  const tryPush = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * width + x;
    if (seen[i]) return;
    const o = i * 4;
    if (!isEdgeWhite(data[o], data[o + 1], data[o + 2], data[o + 3])) return;
    seen[i] = 1;
    stack.push(i);
  };

  for (let x = 0; x < width; x += 1) {
    tryPush(x, 0);
    tryPush(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    tryPush(0, y);
    tryPush(width - 1, y);
  }

  while (stack.length) {
    const i = stack.pop();
    const x = i % width;
    const y = (i / width) | 0;
    data[i * 4 + 3] = 0;
    tryPush(x + 1, y);
    tryPush(x - 1, y);
    tryPush(x, y + 1);
    tryPush(x, y - 1);
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

function formatBetLabel() {
  return formatChips(currentBetAmount() || BETS[state.betKey] || 0);
}

function activeLinesForCurrentBet() {
  return getActivePaylines(state.betKey);
}

function updateLineCountUi() {
  const n = activeLinesForCurrentBet().length;
  if (dom.lineCount) {
    dom.lineCount.textContent = `LINEE ${n}`;
  }
}

function setGuideMode(mode) {
  if (!dom.paylineGuides) return;
  dom.paylineGuides.classList.remove('is-preview', 'is-dim');
  if (mode) dom.paylineGuides.classList.add(mode);
}

function hideWinPaylines() {
  clearPaylineSvg(dom.paylineWins);
  dom.paylineWins?.classList.remove('is-win');
}

function previewActivePaylines() {
  const lines = activeLinesForCurrentBet();
  renderPaylineGuides(dom.paylineGuides, lines);
  hideWinPaylines();
  setGuideMode('is-preview');
  window.clearTimeout(linePreviewTimer);
  linePreviewTimer = window.setTimeout(() => {
    if (state.spinning) return;
    setGuideMode('is-dim');
  }, LINE_PREVIEW_MS);
}

function hidePaylineGuides() {
  window.clearTimeout(linePreviewTimer);
  setGuideMode('');
}

function updateBetUi() {
  dom.betValue.textContent = formatBetLabel();
  updateLineCountUi();
  betButtons.forEach((btn, key) => {
    btn.classList.toggle('is-selected', key === state.betKey);
    btn.setAttribute('aria-pressed', key === state.betKey ? 'true' : 'false');
  });
}

function selectBet(key) {
  if (state.spinning) return;
  pokerAudio.unlock();
  pokerAudio.playBetClick();
  state.betKey = key;
  updateBetUi();
  previewActivePaylines();
  telegram.haptic?.('light');
}

function setSpinEnabled(enabled) {
  if (!spinButton) return;
  spinButton.disabled = !enabled;
}

function setBetButtonsEnabled(enabled) {
  betButtons.forEach((btn) => {
    btn.disabled = !enabled;
  });
}

function setControlsLocked(locked) {
  setSpinEnabled(!locked);
  setBetButtonsEnabled(!locked);
}

function showInsufficientBalanceNotice() {
  telegram.haptic?.('error');
  telegram.notifyPlayer?.('Saldo insufficiente. Riduci la puntata.');
}

function armAudioUnlock() {
  const once = () => {
    pokerAudio.unlock();
    window.removeEventListener('pointerdown', once, true);
  };
  window.addEventListener('pointerdown', once, { capture: true, passive: true });
}

function featureOverlayOpen() {
  return Boolean(
    (dom.mxOverlay && !dom.mxOverlay.hidden)
    || (dom.fsOverlay && !dom.fsOverlay.hidden),
  );
}

async function celebrateCredit(chips) {
  const amount = Number(chips);
  if (!Number.isInteger(amount) || amount <= 0) return;
  const bet = state.lockedBet || currentBetAmount() || 0;
  const tier = classifyWin(amount, bet);
  document.body.dataset.winFx = tier;
  if (tier === WIN_TIERS.none || tier === WIN_TIERS.normal) return;
  await playWinFx({
    refs: winFxRefs,
    tier,
    chips: amount,
    formatChips,
    audio: pokerAudio,
    overlayBlocked: featureOverlayOpen(),
  });
  document.body.dataset.winFx = '';
}

function layoutReels() {
  reels.forEach((reel) => measureReel(reel, dom.machine));
}

function paintAllIdle() {
  reels.forEach((reel, col) => paintIdle(reel, columnUrls(state.cards, col)));
}

function updateBalanceUi() {
  dom.balanceValue.textContent = formatChips(state.balance);
}

function clearSpinWin() {
  if (dom.winPlaque) {
    dom.winPlaque.classList.remove('is-win');
    dom.winPlaque.hidden = true;
  }
  if (dom.winValue) dom.winValue.textContent = '';
}

/** Temporary plaque of the already-settled spin credit — no second payout formula. */
function showSpinWin(amount) {
  if (!dom.winPlaque || !dom.winValue) return;
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    clearSpinWin();
    return;
  }
  dom.winValue.textContent = formatChips(value);
  dom.winPlaque.hidden = false;
  dom.winPlaque.classList.remove('is-win');
  void dom.winPlaque.offsetWidth;
  dom.winPlaque.classList.add('is-win');
}

function currentBetAmount() {
  const amount = BETS[state.betKey];
  return typeof amount === 'number' && amount > 0 ? amount : null;
}

function publishFlow() {
  document.body.dataset.pokerMath = 'v6';
  document.body.dataset.pokerMode = state.inFreeSpins ? 'free' : 'paid';
  document.body.dataset.fsLeft = String(state.freeSpinsLeft);
  document.body.dataset.overlayShows = String(state.overlayShows);
  document.body.dataset.spinning = state.spinning ? '1' : '0';
  document.body.dataset.overlayOpen = dom.fsOverlay && !dom.fsOverlay.hidden ? '1' : '0';
  document.body.dataset.mysteryOpen = dom.mxOverlay && !dom.mxOverlay.hidden ? '1' : '0';
  document.body.dataset.mysteryPhase = state.mysteryPhase || '';
  document.body.dataset.mysteryDraws = String(state.mysteryDraws);
  document.body.dataset.mysteryTier = state.lastMystery?.tier ? String(state.lastMystery.tier) : '';
  document.body.dataset.mysteryChips = state.lastMystery?.chips
    ? String(state.lastMystery.chips)
    : '';
  document.body.dataset.activeLines = String(activeLinesForCurrentBet().length);
  document.body.dataset.lineWins = String(state.lastEval?.lineWins?.length || 0);
  document.body.dataset.winFx = document.body.dataset.winFx || '';
}

function updateFsRemain() {
  if (!dom.fsRemain) return;
  if (!state.inFreeSpins || state.freeSpinsLeft <= 0) {
    dom.fsRemain.hidden = true;
    if (dom.fsRemainCount) dom.fsRemainCount.textContent = '';
    publishFlow();
    return;
  }
  dom.fsRemain.hidden = false;
  if (dom.fsRemainCount) {
    dom.fsRemainCount.textContent = String(state.freeSpinsLeft);
  }
  publishFlow();
}

function creditAmount(amount) {
  const chips = toWalletChips(amount);
  if (chips <= 0) return 0;
  if (state.serverAuthoritative) return chips;
  state.balance += chips;
  updateBalanceUi();
  return chips;
}

function settleAndCredit(evalResult, bet) {
  if (!evalResult || !bet) {
    return { lineScatterCredit: 0, mysteryCredit: 0, mystery: null };
  }
  const paylines = activeLinesForCurrentBet();
  const settleOpts = { totalBet: bet, paylineCount: paylines.length };
  const settled = settleSimulatedSpin(evalResult, MATH_V6.symbols, settleOpts);
  state.lastSettle = settled;
  const lineScatterCredit = toWalletChips(settled.lineReturn + settled.scatterReturn);
  let mystery = null;
  if (!state.inFreeSpins) {
    const drawn = settleGuaranteedCashBonus(evalResult, MATH_V6, Math.random, bet);
    state.mysteryDraws += 1;
    if (drawn.triggered) {
      mystery = {
        ...drawn,
        chips: toWalletChips(drawn.bonusReturn),
      };
    }
    state.lastMystery = mystery;
    publishFlow();
  }
  creditAmount(lineScatterCredit);
  return { lineScatterCredit, mysteryCredit: mystery?.chips ?? 0, mystery };
}
function logEngineEval(filenames) {
  try {
    const result = evaluateGrid(idsFromFilenames(filenames), activeLinesForCurrentBet());
    state.lastEval = result;
    if (ENGINE_DEBUG) {
      console.debug('[PokerSlot engine]', result);
    }
    return result;
  } catch (error) {
    state.lastEval = null;
    if (ENGINE_DEBUG) {
      console.debug('[PokerSlot engine] eval failed', error);
    }
    return null;
  }
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/**
 * Live award — only freeSpinsForScatterCount (V3/V4 same map).
 * 3→5, 4→7, >=5→10, <3→0.
 */
function awardedFreeSpins(evalResult) {
  return freeSpinsForScatterCount(evalResult?.scatter?.count ?? 0);
}

function filenamesFromIds(ids) {
  return ids.map((id) => filenameFromId(id));
}

function fillWithout(files) {
  const pool = SYMBOL_FILES.filter((name) => !files.includes(name));
  return pool[(Math.random() * pool.length) | 0];
}

function gridWithForcedSymbols(placements) {
  const files = placements.map((entry) => entry.file);
  const ids = generateWeightedGrid(pickWeighted, gridBuffer.slice());
  const grid = filenamesFromIds(ids).map((name) =>
    files.includes(name) ? fillWithout(files) : name,
  );
  const used = new Set();
  placements.forEach(({ file, count }) => {
    const slots = [];
    for (let i = 0; i < 15; i += 1) {
      if (!used.has(i)) slots.push(i);
    }
    const n = Math.min(15, Math.max(0, count));
    for (let i = 0; i < n && slots.length; i += 1) {
      const pick = (Math.random() * slots.length) | 0;
      const index = slots.splice(pick, 1)[0];
      used.add(index);
      grid[index] = file;
    }
  });
  return grid;
}

function gridWithScatterCount(count) {
  return gridWithForcedSymbols([{ file: 'scatter.png', count }]);
}

function gridWithBonusCount(count) {
  return gridWithForcedSymbols([{ file: 'bonus.png', count }]);
}

function gridWithBonusAndScatter(bonusCount, scatterCount) {
  return gridWithForcedSymbols([
    { file: 'bonus.png', count: bonusCount },
    { file: 'scatter.png', count: scatterCount },
  ]);
}

function takeNextGrid() {
  const preview = readWinPreviewMode();
  if (preview === '1') return WIN_PREVIEW_ONE.slice();
  if (preview === 'multi') return WIN_PREVIEW_MULTI.slice();
  if (preview === 'fs') {
    return state.inFreeSpins ? WIN_PREVIEW_ONE.slice() : gridWithScatterCount(3);
  }
  const lineTest = readLineTest();
  if (lineTest === 'a') return LINE_TEST_A.slice();
  if (lineTest === 'b') return LINE_TEST_B.slice();
  if (lineTest === 'c') return LINE_TEST_C.slice();
  if (lineTest === 'd') return LINE_TEST_D.slice();
  if (lineTest === 'e') return LINE_TEST_E.slice();
  const forcedGrid = window.__POKER_FORCE_GRID;
  if (Array.isArray(forcedGrid) && forcedGrid.length === 15) {
    window.__POKER_FORCE_GRID = null;
    return forcedGrid.map((cell) =>
      String(cell).endsWith('.png') ? cell : filenameFromId(cell),
    );
  }
  if (!state.inFreeSpins) {
    const combo = window.__POKER_FORCE_COMBO;
    if (combo) {
      window.__POKER_FORCE_COMBO = 0;
      return gridWithBonusAndScatter(3, 3);
    }
    const forcedBonus = Number.parseInt(window.__POKER_FORCE_BONUS, 10);
    if (Number.isInteger(forcedBonus) && forcedBonus >= 0 && forcedBonus <= 15) {
      window.__POKER_FORCE_BONUS = 0;
      return gridWithBonusCount(forcedBonus);
    }
  }
  const forcedScatter = Number.parseInt(window.__POKER_FORCE_SCATTER, 10);
  if (Number.isInteger(forcedScatter) && forcedScatter >= 0 && forcedScatter <= 15) {
    window.__POKER_FORCE_SCATTER = 0;
    return gridWithScatterCount(forcedScatter);
  }
  return filenamesFromIds(generateWeightedGrid(pickWeighted, gridBuffer));
}

function winningCellIndexes(wins) {
  const indexes = new Set();
  wins?.forEach((win) => {
    win.cellIndexes?.forEach((index) => indexes.add(index));
  });
  return indexes;
}

function clearWinHighlights() {
  reels.forEach((reel) => {
    reel.viewport.classList.remove('reel--win');
    reel.strip.querySelectorAll('.reel-cell.is-win').forEach((cell) => {
      cell.classList.remove('is-win');
    });
  });
}

function highlightWinningCells(wins) {
  clearWinHighlights();
  const colsWithWin = new Set();
  winningCellIndexes(wins).forEach((index) => {
    const col = index % COLS;
    const row = (index / COLS) | 0;
    const cell = reels[col]?.strip.children[row];
    if (!cell) return;
    cell.classList.add('is-win');
    colsWithWin.add(col);
  });
  colsWithWin.forEach((col) => {
    reels[col].viewport.classList.add('reel--win');
  });
}

function showWinPaylines(wins) {
  const map = paylineMap(activeLinesForCurrentBet());
  renderWinningPaylines(dom.paylineWins, wins, map);
  if (wins.length) {
    dom.paylineWins.classList.add('is-win');
  } else {
    hideWinPaylines();
  }
}

async function playWinHighlight(evalResult, totalWin) {
  const wins = evalResult?.lineWins || [];
  const chips = Number(totalWin);
  const bet = state.lockedBet || currentBetAmount() || 0;
  const tier = Number.isInteger(chips) && chips > 0
    ? classifyWin(chips, bet)
    : WIN_TIERS.none;
  hidePaylineGuides();
  if (!wins.length) {
    hideWinPaylines();
    if (chips > 0) {
      showSpinWin(chips);
      if (state.inFreeSpins) pokerAudio.playFreeSpinWin();
      else pokerAudio.playLineWin();
      if (tier === WIN_TIERS.good) {
        await Promise.all([wait(WIN_HIGHLIGHT_MS), celebrateCredit(chips)]);
      } else {
        await wait(WIN_HIGHLIGHT_MS);
        if (tier === WIN_TIERS.big || tier === WIN_TIERS.mega) {
          await celebrateCredit(chips);
        }
      }
      clearSpinWin();
    }
    return;
  }
  showSpinWin(chips);
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  if (!reduceMotion && wins.length > 1) {
    for (const win of wins) {
      highlightWinningCells([win]);
      showWinPaylines([win]);
      if (state.inFreeSpins) pokerAudio.playFreeSpinWin();
      else pokerAudio.playLineWin();
      await wait(LINE_SEQ_MS);
    }
  } else if (state.inFreeSpins) {
    pokerAudio.playFreeSpinWin();
  } else {
    pokerAudio.playLineWin();
  }
  highlightWinningCells(wins);
  showWinPaylines(wins);
  if (tier === WIN_TIERS.good) {
    await Promise.all([wait(WIN_HIGHLIGHT_MS), celebrateCredit(chips)]);
  } else {
    await wait(WIN_HIGHLIGHT_MS);
    if (tier === WIN_TIERS.big || tier === WIN_TIERS.mega) {
      await celebrateCredit(chips);
    }
  }
  clearWinHighlights();
  hideWinPaylines();
  clearSpinWin();
}

function setPips(count) {
  const lit = overlayPipCount(count);
  const pips = [...dom.fsPips.querySelectorAll('span')];
  pips.forEach((pip, index) => {
    pip.classList.toggle('is-on', index < lit);
  });
}

function showFreeSpinOverlay(scatterCount, awarded, { persist = false } = {}) {
  setPips(scatterCount);
  dom.fsLabel.textContent = overlayScatterLabel(scatterCount);
  dom.fsCount.textContent = String(awarded);
  const overlay = dom.fsOverlay;
  overlay.classList.remove('is-open');
  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');
  void overlay.offsetWidth;
  overlay.classList.add('is-open');
  if (!persist) state.overlayShows += 1;
  publishFlow();
  telegram.haptic?.('success');
  pokerAudio.stopMysteryBed();
  pokerAudio.playScatterTrigger();
  window.setTimeout(() => {
    pokerAudio.playFreeSpinStart();
  }, 280);

  if (persist) return Promise.resolve();

  return new Promise((resolve) => {
    window.setTimeout(() => {
      overlay.classList.remove('is-open');
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
      publishFlow();
      resolve();
    }, FS_OVERLAY_MS);
  });
}

function mysteryCountLabel(bonusCount) {
  if (bonusCount >= 5) return '5+ BONUS';
  return `${bonusCount} BONUS`;
}

function setMysteryPips(bonusCount) {
  if (!dom.mxPips) return;
  const lit = overlayPipCount(bonusCount);
  [...dom.mxPips.querySelectorAll('span')].forEach((pip, index) => {
    pip.classList.toggle('is-on', index < lit);
  });
}

function mysteryCards() {
  return [...(dom.mxPick?.querySelectorAll('.mx-card') || [])];
}

function resetMysteryCards() {
  mysteryPickLocked = false;
  mysteryCards().forEach((card) => {
    card.disabled = false;
    card.classList.remove('is-flipped', 'is-chosen', 'is-idle');
    const prize = card.querySelector('.mx-card__prize');
    if (prize) prize.textContent = '';
  });
  if (dom.mxPrize) dom.mxPrize.textContent = '';
}

function closeMysteryOverlay() {
  if (!dom.mxOverlay) return;
  pokerAudio.stopMysteryBed();
  dom.mxOverlay.classList.remove('is-open', 'is-reveal', 'is-picked');
  resetMysteryCards();
  if (dom.mxBurst) dom.mxBurst.replaceChildren();
  dom.mxOverlay.hidden = true;
  dom.mxOverlay.setAttribute('aria-hidden', 'true');
  state.mysteryPhase = '';
  publishFlow();
}

function spawnMysteryBurst() {
  const host = dom.mxBurst;
  if (!host) return;
  host.replaceChildren();
  const count = 10;
  for (let i = 0; i < count; i += 1) {
    const coin = document.createElement('span');
    coin.className = 'mx-coin';
    const angle = ((Math.PI * 2 * i) / count) + (Math.random() * 0.35);
    const dist = 52 + Math.random() * 64;
    coin.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    coin.style.setProperty('--dy', `${Math.sin(angle) * dist - 12}px`);
    host.appendChild(coin);
  }
  window.setTimeout(() => {
    if (dom.mxBurst === host) host.replaceChildren();
  }, 900);
}

function waitForMysteryCardPick() {
  return new Promise((resolve) => {
    const cards = mysteryCards();
    if (!cards.length) {
      resolve(null);
      return;
    }
    const onPick = (event) => {
      if (mysteryPickLocked) return;
      mysteryPickLocked = true;
      pokerAudio.playCardPick();
      const chosen = event.currentTarget;
      cards.forEach((card) => {
        card.disabled = true;
        card.removeEventListener('click', onPick);
        if (card === chosen) {
          card.classList.add('is-chosen');
        } else {
          card.classList.add('is-idle');
        }
      });
      resolve(chosen);
    };
    cards.forEach((card) => {
      card.disabled = false;
      card.classList.remove('is-flipped', 'is-chosen', 'is-idle');
      card.addEventListener('click', onPick);
    });
  });
}

async function revealMysteryCard(card, chips) {
  if (!card || !(chips > 0)) return;
  const facePrize = card.querySelector('.mx-card__prize');
  const prizeText = formatChips(chips);
  if (facePrize) facePrize.textContent = prizeText;
  if (dom.mxPrize) dom.mxPrize.textContent = prizeText;
  if (dom.mxOverlay) dom.mxOverlay.classList.add('is-picked');
  pokerAudio.playCardFlip();
  telegram.haptic?.('success');
  state.mysteryPhase = 'flip';
  publishFlow();
  card.classList.add('is-flipped');
  await wait(MX_FLIP_MS);
  if (dom.mxOverlay) dom.mxOverlay.classList.add('is-reveal');
  spawnMysteryBurst();
  pokerAudio.playMysteryWin();
  if (!state.mysteryCredited) {
    creditAmount(chips);
    state.mysteryCredited = true;
  }
  state.mysteryPhase = 'reveal';
  publishFlow();
  telegram.haptic?.('medium');
}

async function showMysteryOverlay(bonusCount, chips) {
  if (!dom.mxOverlay || !(chips > 0)) return;
  setMysteryPips(bonusCount);
  if (dom.mxCount) dom.mxCount.textContent = mysteryCountLabel(bonusCount);
  if (dom.mxBurst) dom.mxBurst.replaceChildren();
  resetMysteryCards();
  const overlay = dom.mxOverlay;
  overlay.classList.remove('is-open', 'is-reveal', 'is-picked');
  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');
  void overlay.offsetWidth;
  overlay.classList.add('is-open');
  state.mysteryPhase = 'pick';
  publishFlow();
  telegram.haptic?.('light');
  pokerAudio.playMysteryOpen();
  pokerAudio.startMysteryBed();
  const chosen = await waitForMysteryCardPick();
  if (chosen) {
    await revealMysteryCard(chosen, chips);
    await wait(MX_REVEAL_MS);
  }
  clearBonusHighlights();
  closeMysteryOverlay();
}

function clearBonusHighlights() {
  dom.machine?.classList.remove('is-bonus-glow');
  reels.forEach((reel) => {
    reel.strip.querySelectorAll('.reel-cell.is-bonus').forEach((cell) => {
      cell.classList.remove('is-bonus');
    });
  });
}

async function highlightBonusCells(evalResult) {
  const indexes = evalResult?.bonus?.cellIndexes;
  if (!Array.isArray(indexes) || indexes.length < 3) return;
  state.mysteryPhase = 'highlight';
  publishFlow();
  pokerAudio.playBonusTrigger();
  telegram.haptic?.('success');
  indexes.forEach((index) => {
    const col = index % COLS;
    const row = (index / COLS) | 0;
    const cell = reels[col]?.strip.children[row];
    if (cell) cell.classList.add('is-bonus');
  });
  dom.machine?.classList.add('is-bonus-glow');
  await wait(MX_HIGHLIGHT_MS);
}

/** Temporary local preview: ?fsPreview=3|4|5|6… — overlay only, not SPIN. */
function readFsPreviewCount() {
  const raw = new URLSearchParams(window.location.search).get('fsPreview');
  const count = Number.parseInt(raw, 10);
  return Number.isInteger(count) && count >= 3 && count <= 15 ? count : 0;
}

/** Temporary local flow test: ?fsTest=3|4|5 — real paid spin + FS sequence. */
function readFsTestCount() {
  const raw = new URLSearchParams(window.location.search).get('fsTest');
  const count = Number.parseInt(raw, 10);
  return count === 3 || count === 4 || count === 5 ? count : 0;
}

/** Temporary local flow test: ?bonusTest=2|3|4|5|6 — real paid spin + Mystery D. */
function readBonusTestCount() {
  const raw = new URLSearchParams(window.location.search).get('bonusTest');
  const count = Number.parseInt(raw, 10);
  return Number.isInteger(count) && count >= 2 && count <= 15 ? count : 0;
}

/** Temporary local flow test: ?comboTest=1 — 3 BONUS + 3 SCATTER on the same paid spin. */
function readComboTest() {
  const raw = String(new URLSearchParams(window.location.search).get('comboTest') || '').trim();
  return raw === '1' || raw === 'true';
}

function maybeShowFsPreview() {
  if (
    readServerFxKind()
    || readFsTestCount()
    || readBonusTestCount()
    || readComboTest()
    || readWinPreviewMode()
    || readLineTest()
    || readWinFxTest()
  ) return;
  const count = readFsPreviewCount();
  if (!count) return;
  showFreeSpinOverlay(count, freeSpinsForScatterCount(count), { persist: true });
}

/** Temporary local win-fx test: ?winPreview=1|multi|fs — real is-win animation. */
function readWinPreviewMode() {
  const raw = String(new URLSearchParams(window.location.search).get('winPreview') || '')
    .trim()
    .toLowerCase();
  if (raw === '1' || raw === 'multi' || raw === 'fs') return raw;
  return '';
}

function maybeRunWinPreview() {
  if (readServerFxKind() || readLineTest() || readWinFxTest() || !readWinPreviewMode()) return;
  demoSpin();
}

function maybeRunFsTest() {
  if (readServerFxKind()) return;
  if (readLineTest() || readWinFxTest() || readWinPreviewMode() || readBonusTestCount() || readComboTest()) return;
  const count = readFsTestCount();
  if (!count) return;
  window.__POKER_FORCE_SCATTER = count;
  state.fsTestRetriggerCheck = true;
  demoSpin();
}

function maybeRunBonusTest() {
  if (readServerFxKind()) return;
  if (readLineTest() || readWinFxTest() || readWinPreviewMode() || readComboTest()) return;
  const count = readBonusTestCount();
  if (!count) return;
  window.__POKER_FORCE_BONUS = count;
  demoSpin();
}

function maybeRunComboTest() {
  if (readServerFxKind()) return;
  if (readWinFxTest() || readLineTest() || readWinPreviewMode()) return;
  if (!readComboTest()) return;
  window.__POKER_FORCE_COMBO = 1;
  demoSpin();
}

function readWinFxTest() {
  const raw = String(new URLSearchParams(window.location.search).get('winFxTest') || '')
    .trim()
    .toLowerCase();
  return ['normal', 'good', 'big', 'mega'].includes(raw) ? raw : '';
}

/** Local server-payload presentation harness. No Railway, no wallet. */
async function maybeRunServerFxTest() {
  const kind = readServerFxKind();
  if (!kind) return;
  const round = buildServerFxRound(kind);
  document.body.dataset.serverFx = kind;
  document.body.dataset.audioSeq = expectedAudioSeq(kind).join(',');
  state.betKey = '100';
  state.lockedBet = 100;
  state.spinning = true;
  state.serverAuthoritative = true;
  state.overlayShows = 0;
  setControlsLocked(true);
  hideWinFx(winFxRefs);
  cueSpinGesture();
  publishFlow();
  try {
    await presentServerRound(round, { applyBalance: false });
  } catch (error) {
    console.warn('[PokerSlot] serverFx harness failed:', error);
  } finally {
    clearBonusHighlights();
    hideWinPaylines();
    state.inFreeSpins = false;
    state.freeSpinsLeft = 0;
    state.lockedBet = null;
    state.spinning = false;
    state.serverAuthoritative = false;
    state.mysteryPhase = '';
    updateFsRemain();
    setControlsLocked(false);
    publishFlow();
    previewActivePaylines();
  }
}

/** Visual-only celebration. Does not debit/credit the wallet or call math. */
async function maybeRunWinFxTest() {
  if (readServerFxKind()) return;
  const kind = readWinFxTest();
  if (!kind) return;
  state.betKey = '100';
  state.lockedBet = 100;
  updateBetUi();
  const chips = winFxTestChips(kind);
  document.body.dataset.winFxTest = kind;
  if (kind === 'normal') {
    showSpinWin(chips);
    await wait(WIN_HIGHLIGHT_MS);
    clearSpinWin();
    return;
  }
  if (kind === 'good') {
    await pokerAudio.whenSamplesReady();
    const run = async () => {
      pokerAudio.unlock();
      await pokerAudio.whenSamplesReady();
      await playWinFx({
        refs: winFxRefs,
        tier: WIN_TIERS.good,
        chips,
        formatChips,
        audio: pokerAudio,
        overlayBlocked: false,
      });
    };
    if (pokerAudio.unlocked) {
      await run();
      return;
    }
    await new Promise((resolve) => {
      const once = () => {
        window.removeEventListener('pointerdown', once, true);
        void run().then(resolve, resolve);
      };
      window.addEventListener('pointerdown', once, { capture: true, passive: true });
    });
    return;
  }
  if (kind === 'mega') {
    await pokerAudio.whenSamplesReady();
    const run = async () => {
      pokerAudio.unlock();
      await pokerAudio.whenSamplesReady();
      await playWinFx({
        refs: winFxRefs,
        tier: WIN_TIERS.mega,
        chips,
        formatChips,
        audio: pokerAudio,
        overlayBlocked: false,
      });
    };
    if (pokerAudio.unlocked) {
      await run();
      return;
    }
    await new Promise((resolve) => {
      const once = () => {
        window.removeEventListener('pointerdown', once, true);
        void run().then(resolve, resolve);
      };
      window.addEventListener('pointerdown', once, { capture: true, passive: true });
    });
    return;
  }
  showSpinWin(chips);
  await celebrateCredit(chips);
  clearSpinWin();
}

function readLineTest() {
  const raw = String(new URLSearchParams(window.location.search).get('lineTest') || '')
    .trim()
    .toLowerCase();
  return ['a', 'b', 'c', 'd', 'e', 'f'].includes(raw) ? raw : '';
}

function maybeRunLineTest() {
  const kind = readLineTest();
  if (!kind || readWinFxTest()) return;
  if (kind === 'b') state.betKey = 'max';
  else state.betKey = '100';
  updateBetUi();
  if (kind === 'f') {
    window.__POKER_FORCE_COMBO = 1;
  }
  demoSpin();
}

async function playReelSpin(forcedNames, forcedSettlement) {
  hidePaylineGuides();
  hideWinPaylines();
  clearWinHighlights();
  clearSpinWin();
  const nextNames = forcedNames || takeNextGrid();
  const evalResult = forcedSettlement?.evalResult || logEngineEval(nextNames);
  const plans = reels.map((reel, col) => {
    const current = columnUrls(state.cards, col);
    const final = columnUrls(nextNames, col);
    const extras = pickStripExtras(cardUrls, SPIN_TIMING.extraCards);
    buildSpinStrip(reel, current, extras, final);
    return { final, duration: SPIN_TIMING.stopMs[col] };
  });

  await Promise.all(
    reels.flatMap((reel) =>
      [...reel.strip.querySelectorAll('img')].map((img) =>
        typeof img.decode === 'function' ? img.decode().catch(() => undefined) : Promise.resolve(),
      ),
    ),
  );

  await pokerAudio.resumePlayback();
  await pokerAudio.whenSamplesReady();
  pokerAudio.playSpin();
  pokerAudio.startReelLoop({ energetic: state.inFreeSpins });
  try {
    await spinReels(reels, plans, {
      onReelStop(index) {
        try {
          pokerAudio.logReelSync(`reel ${index + 1} visual settled`);
          pokerAudio.playReelStop(index);
        } catch {
          /* audio must never block settle */
        }
      },
    });
  } finally {
    pokerAudio.stopReelLoop();
  }
  state.cards = nextNames;
  const settlement = forcedSettlement
    || settleAndCredit(evalResult, state.lockedBet);
  state.lastEval = evalResult;
  if (settlement.mystery?.triggered && settlement.mysteryCredit > 0) {
    await highlightBonusCells(evalResult);
  } else {
    await playWinHighlight(evalResult, settlement.lineScatterCredit);
  }
  return { evalResult, settlement };
}

async function runFreeSpins(awarded) {
  state.inFreeSpins = true;
  state.freeSpinsLeft = awarded;
  updateFsRemain();
  let fsCredit = 0;
  try {
    let firstFs = true;
    while (state.freeSpinsLeft > 0) {
      await wait(FS_GAP_MS);
      if (state.fsTestRetriggerCheck && firstFs) {
        window.__POKER_FORCE_SCATTER = 3;
        firstFs = false;
      }
      const result = await playReelSpin();
      fsCredit += result?.settlement?.lineScatterCredit || 0;
      state.freeSpinsLeft -= 1;
      updateFsRemain();
    }
  } finally {
    state.inFreeSpins = false;
    state.freeSpinsLeft = 0;
    state.fsTestRetriggerCheck = false;
    updateFsRemain();
    await pokerAudio.stopFreeSpinLoop({ fadeSec: 0.4 });
    pokerAudio.playFreeSpinEnd(fsCredit > 0);
  }
}

function readServerFxKind() {
  try {
    return parseServerFxKind(new URLSearchParams(window.location.search).get('serverFx'));
  } catch {
    return '';
  }
}

function isLocalPreviewFlow() {
  return Boolean(
    readLineTest()
    || readBonusTestCount()
    || readComboTest()
    || readWinFxTest()
    || readFsTestCount()
    || readFsPreviewCount()
    || readWinPreviewMode()
    || readServerFxKind(),
  );
}

function cueSpinGesture() {
  pokerAudio.unlock();
  pokerAudio.playSpinButton();
  telegram.haptic?.('heavy');
}

function isServerMode() {
  return Boolean(CONFIG.api.baseUrl) && Boolean(telegram.getInitData()) && !isLocalPreviewFlow();
}

function createSpinReferenceId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `poker-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function evalFromServerSpin(paid) {
  const scatterCount = paid?.scatter_count ?? 0;
  const bonusCount = paid?.bonus_count ?? 0;
  return {
    lineWins: (paid?.winning_lines || []).map((win) => ({
      lineId: win.line_id,
      symbol: win.symbol,
      count: win.count,
      cellIndexes: win.cell_indexes,
      allWild: win.all_wild,
    })),
    scatter: {
      count: scatterCount,
      cellIndexes: paid?.scatter_cell_indexes || [],
      triggered: scatterCount >= 3,
    },
    bonus: {
      count: bonusCount,
      cellIndexes: paid?.bonus_cell_indexes || [],
      triggered: bonusCount >= 3,
    },
  };
}

function namesFromServerGrid(grid) {
  if (!Array.isArray(grid) || grid.length !== 15) {
    throw new Error('PokerSlot: griglia server non valida');
  }
  return filenamesFromIds(grid);
}

function settlementFromServerPaid(round, evalResult) {
  const mystery = round?.mystery;
  const triggered = Boolean(mystery?.triggered) && (mystery?.reward_chips || 0) > 0;
  return {
    evalResult,
    lineScatterCredit: round?.paid_spin_base_win || 0,
    mysteryCredit: triggered ? mystery.reward_chips : 0,
    mystery: triggered
      ? {
          triggered: true,
          tier: mystery.tier,
          x: mystery.x,
          bonusReturn: mystery.bonus_return,
          chips: mystery.reward_chips,
        }
      : null,
  };
}

async function runServerFreeSpins(spins) {
  state.inFreeSpins = true;
  state.freeSpinsLeft = spins.length;
  updateFsRemain();
  let fsCredit = 0;
  try {
    for (const fs of spins) {
      await wait(FS_GAP_MS);
      const names = namesFromServerGrid(fs.grid);
      const evalResult = evalFromServerSpin(fs);
      const settlement = {
        evalResult,
        lineScatterCredit: fs.base_win || 0,
        mysteryCredit: 0,
        mystery: null,
      };
      const result = await playReelSpin(names, settlement);
      fsCredit += result?.settlement?.lineScatterCredit || 0;
      state.freeSpinsLeft -= 1;
      updateFsRemain();
    }
  } finally {
    state.inFreeSpins = false;
    state.freeSpinsLeft = 0;
    state.fsTestRetriggerCheck = false;
    updateFsRemain();
    await pokerAudio.stopFreeSpinLoop({ fadeSec: 0.4 });
    pokerAudio.playFreeSpinEnd(fsCredit > 0);
  }
}

async function presentServerRound(round, { applyBalance = true } = {}) {
  if (!round?.paid_spin?.grid) {
    throw new Error('Invalid poker spin response');
  }
  state.serverAuthoritative = true;
  if (typeof round.bet === 'number' && Number.isFinite(round.bet) && round.bet > 0) {
    state.lockedBet = round.bet;
  }
  state.mysteryDraws = round.mystery_draws || 1;
  const names = namesFromServerGrid(round.paid_spin.grid);
  const evalResult = evalFromServerSpin(round.paid_spin);
  const settlement = settlementFromServerPaid(round, evalResult);
  await playReelSpin(names, settlement);
  if (settlement.mystery?.triggered && settlement.mysteryCredit > 0) {
    await showMysteryOverlay(evalResult.bonus.count, settlement.mysteryCredit);
    state.mysteryCredited = true;
  }
  const awarded = round.free_spins_awarded || round.free_spins?.length || 0;
  if (awarded > 0) {
    await showFreeSpinOverlay(
      round.paid_spin.scatter_count,
      awarded,
    );
    await runServerFreeSpins(round.free_spins || []);
  } else if (settlement.mystery?.triggered) {
    await playWinHighlight(evalResult, settlement.lineScatterCredit);
  }
  if (
    applyBalance
    && typeof round.balance_after === 'number'
    && Number.isFinite(round.balance_after)
  ) {
    state.balance = toWalletChips(round.balance_after);
    updateBalanceUi();
  }
}

async function serverSpin() {
  if (state.spinning || !state.ready || state.inFreeSpins) return;
  const bet = currentBetAmount();
  if (!bet || state.balance < bet) {
    showInsufficientBalanceNotice();
    return;
  }

  state.spinning = true;
  state.serverAuthoritative = true;
  state.overlayShows = 0;
  state.lockedBet = bet;
  state.lastMystery = null;
  state.mysteryDraws = 0;
  state.mysteryCredited = false;
  state.mysteryPhase = '';
  setControlsLocked(true);
  hideWinFx(winFxRefs);
  cueSpinGesture();
  publishFlow();

  try {
    const referenceId = createSpinReferenceId();
    const round = await telegram.requestPokerSpin(bet, referenceId);
    await presentServerRound(round);
  } catch (error) {
    if (error?.code === 'insufficient_balance' || error?.message === 'INSUFFICIENT_BALANCE') {
      showInsufficientBalanceNotice();
      try {
        const data = await telegram.fetchBalance();
        if (typeof data?.balance === 'number') {
          state.balance = toWalletChips(data.balance);
          updateBalanceUi();
        }
      } catch {
        /* keep displayed balance */
      }
    } else {
      console.warn('[PokerSlot] Server spin failed:', error);
    }
  } finally {
    clearBonusHighlights();
    hideWinPaylines();
    state.inFreeSpins = false;
    state.freeSpinsLeft = 0;
    state.lockedBet = null;
    state.spinning = false;
    state.serverAuthoritative = false;
    state.mysteryPhase = '';
    updateFsRemain();
    setControlsLocked(false);
    publishFlow();
    previewActivePaylines();
  }
}

function handlePokerSpin() {
  if (isServerMode()) {
    serverSpin();
    return;
  }
  demoSpin();
}

async function demoSpin() {
  if (state.spinning || !state.ready || state.inFreeSpins) return;
  const bet = currentBetAmount();
  if (!bet || state.balance < bet) {
    showInsufficientBalanceNotice();
    return;
  }

  state.spinning = true;
  state.overlayShows = 0;
  state.lockedBet = bet;
  state.lastMystery = null;
  state.mysteryDraws = 0;
  state.mysteryCredited = false;
  state.mysteryPhase = '';
  setControlsLocked(true);
  hideWinFx(winFxRefs);
  cueSpinGesture();
  state.balance -= bet;
  updateBalanceUi();
  publishFlow();

  try {
    const { evalResult, settlement } = await playReelSpin();
    if (settlement.mystery?.triggered && settlement.mysteryCredit > 0) {
      await showMysteryOverlay(evalResult.bonus.count, settlement.mysteryCredit);
      if (!state.mysteryCredited) {
        creditAmount(settlement.mysteryCredit);
        state.mysteryCredited = true;
      }
    }
    const awarded = awardedFreeSpins(evalResult);
    if (awarded > 0) {
      await showFreeSpinOverlay(evalResult.scatter.count, awarded);
      await runFreeSpins(awarded);
    } else if (settlement.mystery?.triggered) {
      // Mystery owned the moment; queue paid-spin plaque / GOOD-BIG-MEGA after it closes.
      await playWinHighlight(evalResult, settlement.lineScatterCredit);
    }
  } finally {
    clearBonusHighlights();
    hideWinPaylines();
    state.inFreeSpins = false;
    state.freeSpinsLeft = 0;
    state.lockedBet = null;
    state.spinning = false;
    state.mysteryPhase = '';
    updateFsRemain();
    setControlsLocked(false);
    publishFlow();
    previewActivePaylines();
  }
}

function buildReels() {
  REELS.forEach((layout) => {
    reels.push(mountReel(dom.cardGrid, layout));
  });
  layoutReels();
  paintAllIdle();
}

function buildHud() {
  applyBox(dom.balanceValue, HUD.balance);
  applyBox(dom.betValue, HUD.bet);
  if (dom.lineCount && HUD.lines) applyBox(dom.lineCount, HUD.lines);
  clearSpinWin();
}

function makeControl(box, className, label) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.setAttribute('aria-label', label);
  applyBox(btn, box);
  const img = document.createElement('img');
  img.alt = '';
  img.draggable = false;
  btn.appendChild(img);
  return { btn, img };
}

async function buildControls() {
  const jobs = CONTROLS.bets.map(async (spec) => {
    const label =
      spec.id === 'max' ? 'Puntata max' : `Punta ${spec.id === '1000' ? '1K' : spec.id}`;
    const { btn, img } = makeControl(spec, 'ctrl ctrl--bet', label);
    btn.dataset.bet = spec.id;
    img.src = await knockoutWhiteBackdrop(ASSETS.buttons[spec.id]);
    btn.addEventListener('click', () => selectBet(spec.id));
    dom.controls.appendChild(btn);
    betButtons.set(spec.id, btn);
  });

  const spinJob = (async () => {
    const { btn, img } = makeControl(CONTROLS.spin, 'ctrl ctrl--spin', 'Spin');
    img.src = await knockoutWhiteBackdrop(ASSETS.buttons.spin);
    btn.disabled = true;
    btn.addEventListener('click', () => {
      pokerAudio.unlock();
      handlePokerSpin();
    });
    btn.addEventListener('contextmenu', (event) => event.preventDefault());
    btn.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) event.preventDefault();
    });
    dom.controls.appendChild(btn);
    spinButton = btn;
  })();

  await Promise.all([...jobs, spinJob]);
}

async function loadBalance() {
  try {
    const data = await telegram.fetchBalance();
    if (typeof data?.balance === 'number' && Number.isFinite(data.balance) && data.balance >= 0) {
      state.balance = toWalletChips(data.balance);
    }
  } catch (error) {
    console.info('[PokerSlot] saldo demo, fetchBalance non disponibile.', error);
  }
  updateBalanceUi();
  publishFlow();
}

function paintAudioToggle() {
  const btn = document.getElementById('pokerAudioToggle');
  if (!btn) return;
  const on = pokerAudio.isEnabled();
  btn.textContent = on ? '🔊' : '🔇';
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.setAttribute('aria-label', on ? 'Disattiva audio' : 'Attiva audio');
}

function createAudioToggle() {
  if (document.getElementById('pokerAudioToggle') || !dom.machine) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'pokerAudioToggle';
  btn.className = 'poker-audio-toggle';
  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    pokerAudio.unlock();
    pokerAudio.setEnabled(!pokerAudio.isEnabled());
    paintAudioToggle();
    if (pokerAudio.isEnabled()) pokerAudio.playClick();
  });
  dom.machine.appendChild(btn);
  paintAudioToggle();
}

async function init() {
  if (dom.machineArt) {
    dom.machineArt.src = ASSETS.base;
  }
  telegram.init();
  armAudioUnlock();
  setSpinEnabled(false);
  if (dom.fsScatterImg) {
    dom.fsScatterImg.src = cardUrl('scatter.png');
  }
  buildReels();
  buildHud();
  createAudioToggle();
  updateBetUi();
  window.addEventListener('resize', () => {
    if (state.spinning) return;
    layoutReels();
    paintAllIdle();
  });
  await Promise.all([buildControls(), loadBalance(), preloadCards(cardUrls)]);
  state.ready = true;
  setSpinEnabled(true);
  updateBetUi();
  previewActivePaylines();
  void maybeRunServerFxTest();
  maybeShowFsPreview();
  void maybeRunWinFxTest();
  maybeRunLineTest();
  maybeRunWinPreview();
  maybeRunComboTest();
  maybeRunBonusTest();
  maybeRunFsTest();
}

init().catch((error) => {
  console.error('[PokerSlot]', error);
});
