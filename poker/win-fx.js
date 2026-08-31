/**
 * PokerSlot win celebration — UX only.
 * Amounts must already be integer wallet chips (toWalletChips).
 * Does not touch MATH_V6 or settlement.
 */

import { WIN_TIERS } from './audio-manager.js?v=26';

export const WIN_FX_MS = Object.freeze({
  good: 1250,
  big: 2200,
  mega: 3300,
});

/** MEGA presentation only — visual count-up vs 3.6 s cue. Does not credit the wallet. */
const MEGA_COUNT_MS = 3300;
const MEGA_HOLD_MS = 300;

const TEST_CHIPS = Object.freeze({
  normal: 100,
  good: 250,
  big: 579,
  mega: 12500,
});

export function winFxTestChips(kind) {
  return TEST_CHIPS[kind] || 0;
}

const COIN_RAIN = Object.freeze({
  count: 32,
  durationMs: 3000,
});

let rainTimer = 0;

function reducedMotion() {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
}

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

/** Gentle ease-out for MEGA payout count-up (cubic reaches ~87% by t=0.5). */
function easeOutSine(t) {
  return Math.sin(t * Math.PI * 0.5);
}

function particleCount(tier, reduced) {
  if (tier === WIN_TIERS.good) return reduced ? 0 : 7;
  if (tier === WIN_TIERS.big) return reduced ? 4 : 16;
  if (tier === WIN_TIERS.mega) return reduced ? 8 : 28;
  return 0;
}

function spawnBurst(host, count, rain) {
  if (!host || count <= 0) return;
  host.replaceChildren();
  for (let i = 0; i < count; i += 1) {
    const chip = document.createElement('span');
    chip.className = rain ? 'win-fx__chip win-fx__chip--rain' : 'win-fx__chip';
    const angle = ((Math.PI * 2 * i) / count) + (Math.random() * 0.4);
    const dist = rain ? 18 + Math.random() * 28 : 42 + Math.random() * 70;
    chip.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    chip.style.setProperty('--dy', rain
      ? `${70 + Math.random() * 110}px`
      : `${Math.sin(angle) * dist - 8}px`);
    chip.style.setProperty('--delay', `${Math.random() * 180}ms`);
    host.appendChild(chip);
  }
}

function clearBurst(host) {
  host?.replaceChildren();
}

function clearCoinRain(host) {
  if (rainTimer) {
    window.clearTimeout(rainTimer);
    rainTimer = 0;
  }
  host?.replaceChildren();
}

function spawnCoinRain(host, reduced) {
  clearCoinRain(host);
  if (!host) return;
  const count = reduced ? 6 : COIN_RAIN.count;
  const fallMs = reduced ? 400 : COIN_RAIN.durationMs;
  for (let i = 0; i < count; i += 1) {
    const coin = document.createElement('span');
    coin.className = 'win-fx__coin';
    const x = 4 + Math.random() * 92;
    const drift = (Math.random() - 0.5) * 18;
    const size = 7 + Math.random() * 7;
    const dur = reduced ? 400 : 2200 + Math.random() * 900;
    const delay = reduced ? 0 : Math.random() * 420;
    const rot0 = Math.random() * 360;
    const rot1 = rot0 + (120 + Math.random() * 280) * (Math.random() < 0.5 ? -1 : 1);
    coin.style.setProperty('--x', `${x}%`);
    coin.style.setProperty('--dx', `${drift}px`);
    coin.style.setProperty('--size', `${size}px`);
    coin.style.setProperty('--dur', `${Math.round(dur)}ms`);
    coin.style.setProperty('--delay', `${Math.round(delay)}ms`);
    coin.style.setProperty('--rot0', `${rot0}deg`);
    coin.style.setProperty('--rot1', `${rot1}deg`);
    host.appendChild(coin);
  }
  rainTimer = window.setTimeout(() => {
    rainTimer = 0;
    host.replaceChildren();
  }, fallMs + 80);
}

function countUp(el, chips, format, durationMs, ease = easeOutCubic) {
  return new Promise((resolve) => {
    if (!el) {
      resolve();
      return;
    }
    const target = chips;
    if (reducedMotion() || durationMs < 80 || target <= 0) {
      el.textContent = format(target);
      resolve();
      return;
    }
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      if (t >= 1) {
        el.textContent = format(target);
        resolve();
        return;
      }
      const eased = ease(t);
      const value = Math.round(target * eased);
      el.textContent = format(value > target ? target : value);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

export function bindWinFx(dom) {
  return {
    overlay: dom.winFx,
    kicker: dom.winFxKicker,
    amount: dom.winFxAmount,
    burst: dom.winFxBurst,
    rain: dom.winFxRain,
    flash: dom.winFxFlash,
    machine: dom.machine,
  };
}

export async function playWinFx({
  refs,
  tier,
  chips,
  formatChips,
  audio,
  overlayBlocked = false,
}) {
  const n = Number(chips);
  if (!Number.isInteger(n) || n < 0) return;
  const reduced = reducedMotion();
  const machine = refs.machine;

  if (tier === WIN_TIERS.good) {
    const devPreview = document.body?.dataset?.winFxTest === 'good';
    audio?.playGoodWin?.();
    machine?.classList.add('is-good-win');
    if (devPreview && refs.overlay) {
      refs.overlay.hidden = false;
      refs.overlay.classList.remove('is-good-only', 'is-mega');
      refs.overlay.setAttribute('aria-hidden', 'false');
      refs.overlay.classList.remove('is-open');
      if (refs.kicker) refs.kicker.textContent = 'GOOD WIN';
      if (refs.amount) refs.amount.textContent = `+${formatChips(n)}`;
      void refs.overlay.offsetWidth;
      refs.overlay.classList.add('is-open');
      spawnBurst(refs.burst, particleCount(tier, reduced), false);
      const hold = reduced ? 400 : Math.max(WIN_FX_MS.good, 1800);
      try {
        await new Promise((r) => window.setTimeout(r, hold));
      } finally {
        refs.overlay.classList.remove('is-open', 'is-mega', 'is-good-only');
        refs.overlay.hidden = true;
        refs.overlay.setAttribute('aria-hidden', 'true');
        machine?.classList.remove('is-good-win');
        clearBurst(refs.burst);
      }
      return;
    }
    if (refs.overlay) {
      refs.overlay.hidden = false;
      refs.overlay.classList.add('is-good-only');
      refs.overlay.setAttribute('aria-hidden', 'true');
    }
    spawnBurst(refs.burst, particleCount(tier, reduced), false);
    await new Promise((r) => window.setTimeout(r, reduced ? 400 : WIN_FX_MS.good));
    machine?.classList.remove('is-good-win');
    refs.overlay?.classList.remove('is-good-only');
    if (refs.overlay) {
      refs.overlay.hidden = true;
      refs.overlay.setAttribute('aria-hidden', 'true');
    }
    clearBurst(refs.burst);
    return;
  }

  if (tier !== WIN_TIERS.big && tier !== WIN_TIERS.mega) return;
  if (overlayBlocked || !refs.overlay) return;

  const mega = tier === WIN_TIERS.mega;
  const duration = mega ? WIN_FX_MS.mega : WIN_FX_MS.big;
  machine?.classList.add(mega ? 'is-mega-win' : 'is-big-win');
  refs.overlay.hidden = false;
  refs.overlay.setAttribute('aria-hidden', 'false');
  refs.overlay.classList.toggle('is-mega', mega);
  refs.overlay.classList.remove('is-open');
  if (refs.kicker) refs.kicker.textContent = mega ? 'MEGA WIN' : 'BIG WIN';
  if (refs.amount) refs.amount.textContent = `+${formatChips(0)}`;
  void refs.overlay.offsetWidth;
  refs.overlay.classList.add('is-open');
  if (mega && refs.flash) {
    refs.flash.classList.remove('is-on');
    void refs.flash.offsetWidth;
    refs.flash.classList.add('is-on');
  }
  spawnBurst(refs.burst, particleCount(tier, reduced), mega);
  if (!mega) spawnCoinRain(refs.rain, reduced);

  const countMs = reduced
    ? 200
    : (mega ? MEGA_COUNT_MS : duration * 0.62);
  const hold = reduced
    ? 280
    : (mega ? MEGA_HOLD_MS : Math.max(duration * 0.38, COIN_RAIN.durationMs - duration * 0.62));
  const ease = mega ? easeOutSine : easeOutCubic;
  const devMega = mega && document.body?.dataset?.winFxTest === 'mega';
  const fxStart = performance.now();
  if (mega) audio?.playMegaWin?.();
  else audio?.playBigWin?.();
  const audioStart = performance.now();
  const counterStart = performance.now();
  if (devMega) {
    window.__POKER_MEGA_FX_TRACE = {
      fxStart,
      audioStart,
      counterStart,
      countMs,
      holdMs: hold,
      wavSec: 3.6,
      target: n,
    };
  }

  try {
    await countUp(refs.amount, n, (v) => `+${formatChips(v)}`, countMs, ease);
    if (refs.amount) refs.amount.textContent = `+${formatChips(n)}`;
    const counterFinal = performance.now();
    if (devMega && window.__POKER_MEGA_FX_TRACE) {
      window.__POKER_MEGA_FX_TRACE.counterFinal = counterFinal;
      window.__POKER_MEGA_FX_TRACE.displayed = refs.amount?.textContent || '';
      window.__POKER_MEGA_FX_TRACE.countElapsed = counterFinal - counterStart;
      window.__POKER_MEGA_FX_TRACE.audioExpectedEnd = audioStart + 3600;
    }
    await new Promise((r) => window.setTimeout(r, hold));
  } finally {
    refs.overlay.classList.remove('is-open', 'is-mega', 'is-good-only');
    refs.overlay.hidden = true;
    refs.overlay.setAttribute('aria-hidden', 'true');
    refs.flash?.classList.remove('is-on');
    machine?.classList.remove('is-big-win', 'is-mega-win', 'is-good-win');
    clearBurst(refs.burst);
    clearCoinRain(refs.rain);
  }
}

export function hideWinFx(refs) {
  refs?.overlay?.classList.remove('is-open', 'is-mega', 'is-good-only');
  if (refs?.overlay) {
    refs.overlay.hidden = true;
    refs.overlay.setAttribute('aria-hidden', 'true');
  }
  refs?.flash?.classList.remove('is-on');
  refs?.machine?.classList.remove('is-big-win', 'is-mega-win', 'is-good-win');
  clearBurst(refs?.burst);
  clearCoinRain(refs?.rain);
}
