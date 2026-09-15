/**
 * Roulette audio router — mute-aware, server-payload driven.
 * Physical SFX: spin-start → ball-track → bounce → pocket-lock → climax.
 * Climax: straight-win XOR result-win XOR result-lose (one per spin).
 * Optional soft bonus-accent after climax (max once).
 *
 * Runtime definitive files live under ./audio/ (candidates/ is listen-only).
 */

const STORAGE_KEY = 'roulette_audio_muted';

/** Definitive runtime assets (candidates/* never loaded here). */
export const RUNTIME_FILES = {
  'bet-select': new URL('./audio/bet-select.wav?v=24', import.meta.url).href,
  'chip-select': new URL('./audio/chip-select.wav?v=24', import.meta.url).href,
  'spin-start': new URL('./audio/spin-start.wav?v=24', import.meta.url).href, // SPIN B
  'ball-track': new URL('./audio/ball-track.wav?v=27', import.meta.url).href, // BALL SOFT C only
  'ball-tick': new URL('./audio/ball-tick.wav?v=24', import.meta.url).href,
  'ball-bounce': new URL('./audio/ball-bounce.wav?v=24', import.meta.url).href,
  'pocket-lock': new URL('./audio/pocket-lock.wav?v=24', import.meta.url).href,
  'result-win': new URL('./audio/result-win.wav?v=24', import.meta.url).href,
  'result-lose': new URL('./audio/result-lose.wav?v=24', import.meta.url).href,
  'straight-win': new URL('./audio/straight-win.wav?v=24', import.meta.url).href,
  'bonus-accent': new URL('./audio/bonus-accent.wav?v=24', import.meta.url).href,
};

/**
 * Relative volumes — hierarchy:
 * BET/CHIP low → BONUS low → physical mid → LOCK mid → WIN mid → LOSE soft → STRAIGHT climax
 */
export const EVENT_VOLUMES = {
  'bet-select': 0.55,
  'chip-select': 0.6,
  'bonus-accent': 0.55,
  'spin-start': 0.78,
  'ball-track': 0.4,
  'ball-tick': 0.68,
  'ball-bounce': 0.78,
  'pocket-lock': 0.9,
  'result-win': 0.85,
  'result-lose': 0.7,
  'straight-win': 1.0,
};

/** Animation progress thresholds (match animations.js spin curve). */
export const SPIN_AUDIO = {
  tickStart: 0.07,
  tickEnd: 0.76,
  trackFadeStart: 0.68,
  trackStop: 0.76,
  bounceStart: 0.78,
  bounceEnd: 0.94,
  /** Hop keyframe t values inside bounce window (must match animations.js). */
  bounceHopTs: [0.14, 0.42, 0.70],
};

/** @type {string[]} */
const playedLog = [];

/** @type {HTMLAudioElement[]} */
const activePlayers = [];

/** @type {HTMLAudioElement | null} */
let trackPlayer = null;
/** @type {HTMLAudioElement | null} */
let bouncePlayer = null;

let enabled = true;
/** Preview-only isolation: skip spin-start. Default ON = definitive runtime. */
let spinStartEnabled = true;
/** One climax per spin cycle — armed on playStart, consumed on playOutcome. */
let climaxArmed = false;
/** Physical SFX armed once per spin — cleared after lock / on mute. */
let physicalArmed = false;
let pocketLockPlayed = false;
let trackStarted = false;
let spinProgress = 0;
/** @type {Set<number>} */
let bounceHopsFired = new Set();
let trackFadeRaf = 0;
/** Bumped on stopActiveAudio — invalidates in-flight outcome waits. */
let playbackEpoch = 0;

try {
  enabled = localStorage.getItem(STORAGE_KEY) !== '1';
} catch {
  enabled = true;
}

export function isStraightWin(payload) {
  if (!payload?.won) return false;
  if (payload.bet_type === 'straight') return true;
  return Array.isArray(payload.bets)
    && payload.bets.some((row) => row?.won && row?.bet_type === 'straight');
}

export function hasBonusAccent(payload) {
  if (!payload?.won) return false;
  const vip = payload.vip_applied && Number(payload.vip_multiplier) > 1;
  const level = Number(payload.level_multiplier) > 1;
  const daily = payload.daily_applied && Number(payload.daily_multiplier) > 1;
  return Boolean(vip || level || daily);
}

/**
 * Pure plan for outcome SFX — used by runtime + tests.
 * @returns {{ climax: 'straight-win' | 'result-win' | 'result-lose' | null, bonusAccent: boolean }}
 */
export function resolveOutcomeAudioPlan(payload) {
  if (!payload) return { climax: null, bonusAccent: false };
  if (isStraightWin(payload)) {
    return { climax: 'straight-win', bonusAccent: hasBonusAccent(payload) };
  }
  if (payload.won) {
    return { climax: 'result-win', bonusAccent: hasBonusAccent(payload) };
  }
  return { climax: 'result-lose', bonusAccent: false };
}

/**
 * Tick interval (ms) from spin progress — faster early, slower late. null = no tick.
 * @param {number} raw
 * @returns {number | null}
 */
export function tickIntervalForProgress(raw) {
  const t = Number(raw);
  if (!(t >= SPIN_AUDIO.tickStart && t < SPIN_AUDIO.tickEnd)) return null;
  if (t < 0.44) return 140;
  if (t < 0.58) return 220;
  if (t < 0.68) return 340;
  return 480;
}

/**
 * Which bounce hop index (0..) should fire at this progress, or -1.
 * @param {number} raw
 * @param {Iterable<number>} alreadyFired
 */
export function bounceHopIndexAt(raw, alreadyFired = []) {
  const fired = alreadyFired instanceof Set ? alreadyFired : new Set(alreadyFired);
  if (!(raw >= SPIN_AUDIO.bounceStart && raw < SPIN_AUDIO.bounceEnd)) return -1;
  const u = (raw - SPIN_AUDIO.bounceStart) / (SPIN_AUDIO.bounceEnd - SPIN_AUDIO.bounceStart);
  for (let idx = 0; idx < SPIN_AUDIO.bounceHopTs.length; idx += 1) {
    const hopT = SPIN_AUDIO.bounceHopTs[idx];
    if (u + 0.02 >= hopT && !fired.has(idx)) return idx;
  }
  return -1;
}

function record(eventId) {
  if (!enabled) return false;
  playedLog.push(eventId);
  return true;
}

function vol(eventId) {
  return EVENT_VOLUMES[eventId] ?? 1;
}

function stopEl(el) {
  if (!el) return;
  try {
    el.pause();
    el.currentTime = 0;
  } catch {
    /* ignore */
  }
  // Unblock awaiters listening for 'ended' (e.g. mid-climax cleanup).
  try {
    if (typeof Event !== 'undefined') {
      el.dispatchEvent(new Event('ended'));
    }
  } catch {
    /* ignore */
  }
}

function cancelTrackFade() {
  if (trackFadeRaf && typeof cancelAnimationFrame !== 'undefined') {
    cancelAnimationFrame(trackFadeRaf);
  }
  trackFadeRaf = 0;
}

function stopTrack() {
  cancelTrackFade();
  stopEl(trackPlayer);
  trackPlayer = null;
}

function stopBounce() {
  stopEl(bouncePlayer);
  bouncePlayer = null;
}

/**
 * Hard-stop every runtime player. Does not change mute preference.
 * Does not play any sound.
 */
function stopActiveAudioInternal() {
  playbackEpoch += 1;
  cancelTrackFade();
  stopTrack();
  stopBounce();
  while (activePlayers.length) {
    const el = activePlayers.pop();
    stopEl(el);
  }
  climaxArmed = false;
  resetPhysicalFlags();
}

function stopActive() {
  stopActiveAudioInternal();
}

function resetPhysicalFlags() {
  physicalArmed = false;
  pocketLockPlayed = false;
  trackStarted = false;
  spinProgress = 0;
  bounceHopsFired = new Set();
}

/**
 * @param {string} eventId
 * @param {string | null | undefined} url
 * @param {{ volume?: number }} [opts]
 * @returns {Promise<boolean>}
 */
function playFile(eventId, url, opts = {}) {
  if (!enabled) return Promise.resolve(false);
  if (!url) {
    record(eventId);
    return Promise.resolve(true);
  }
  if (typeof Audio === 'undefined') {
    record(eventId);
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    try {
      const audio = new Audio(url);
      audio.preload = 'auto';
      audio.volume = Math.max(0, Math.min(1, opts.volume ?? vol(eventId)));
      activePlayers.push(audio);
      const done = () => {
        const idx = activePlayers.indexOf(audio);
        if (idx >= 0) activePlayers.splice(idx, 1);
        resolve(true);
      };
      audio.addEventListener('ended', done, { once: true });
      audio.addEventListener('error', done, { once: true });
      record(eventId);
      const p = audio.play();
      if (p && typeof p.then === 'function') {
        p.catch(() => done());
      }
    } catch {
      record(eventId);
      resolve(true);
    }
  });
}

function wait(ms) {
  return new Promise((resolve) => {
    if (typeof setTimeout === 'undefined') {
      resolve();
      return;
    }
    setTimeout(resolve, ms);
  });
}

function startTrackOnce() {
  if (!enabled || !physicalArmed || trackStarted) return;
  trackStarted = true;
  record('ball-track');
  if (typeof Audio === 'undefined') return;
  const url = RUNTIME_FILES['ball-track'];
  if (!url) return;
  try {
    stopTrack();
    const audio = new Audio(url);
    audio.preload = 'auto';
    audio.loop = false;
    audio.volume = vol('ball-track');
    trackPlayer = audio;
    const p = audio.play();
    if (p && typeof p.then === 'function') p.catch(() => {});
  } catch {
    /* ignore */
  }
}

function fadeTrackTowardStop(raw) {
  if (!trackPlayer) return;
  const { trackFadeStart, trackStop } = SPIN_AUDIO;
  if (raw < trackFadeStart) return;
  if (raw >= trackStop) {
    stopTrack();
    return;
  }
  const u = (raw - trackFadeStart) / (trackStop - trackFadeStart);
  try {
    trackPlayer.volume = Math.max(0, vol('ball-track') * (1 - u));
  } catch {
    /* ignore */
  }
}

function playBounceHop(hopIndex) {
  if (!enabled || !physicalArmed) return;
  if (bounceHopsFired.has(hopIndex)) return;
  bounceHopsFired.add(hopIndex);
  record('ball-bounce');
  if (typeof Audio === 'undefined') return;
  const url = RUNTIME_FILES['ball-bounce'];
  if (!url) return;
  try {
    stopBounce();
    const audio = new Audio(url);
    audio.preload = 'auto';
    audio.volume = vol('ball-bounce');
    bouncePlayer = audio;
    const p = audio.play();
    if (p && typeof p.then === 'function') p.catch(() => {});
  } catch {
    /* ignore */
  }
}

export const RouletteAudio = {
  RUNTIME_FILES,
  EVENT_VOLUMES,
  SPIN_AUDIO,

  isEnabled() {
    return enabled;
  },

  setEnabled(next) {
    enabled = Boolean(next);
    if (!enabled) {
      stopActiveAudioInternal();
    }
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? '0' : '1');
    } catch {
      /* ignore */
    }
  },

  toggle() {
    this.setEnabled(!this.isEnabled());
    return this.isEnabled();
  },

  /**
   * Preview/listen isolation only. Definitive Mini App leaves this true.
   * Does not delete or replace spin-start.wav.
   */
  setSpinStartEnabled(next) {
    spinStartEnabled = Boolean(next);
    return spinStartEnabled;
  },

  isSpinStartEnabled() {
    return spinStartEnabled;
  },

  /**
   * RESULT → BETTING cleanup. Stops every runtime Audio without changing mute.
   * Safe to call anytime; does not play sounds.
   */
  stopActiveAudio() {
    stopActiveAudioInternal();
  },

  /** Test helper — in-flight players still tracked (0 after stop). */
  activePlayerCount() {
    return activePlayers.length + (trackPlayer ? 1 : 0) + (bouncePlayer ? 1 : 0);
  },

  /** Test helper — returns and clears the play log. */
  drainPlayed() {
    const copy = playedLog.slice();
    playedLog.length = 0;
    return copy;
  },

  peekPlayed() {
    return playedLog.slice();
  },

  clearPlayed() {
    playedLog.length = 0;
  },

  /** Test helper */
  isClimaxArmed() {
    return climaxArmed;
  },

  isPhysicalArmed() {
    return physicalArmed;
  },

  /** Betting UI — red/black/even/odd/dozen/number. */
  playBetSelect() {
    return playFile('bet-select', RUNTIME_FILES['bet-select'], { volume: vol('bet-select') });
  },

  /** Chip presets — 500 / 1000 / 2000. */
  playChipSelect() {
    return playFile('chip-select', RUNTIME_FILES['chip-select'], { volume: vol('chip-select') });
  },

  /**
   * Begin spin audio cycle. Plays spin-start once, then starts ball-track once.
   * Retry without a new playStart will not re-arm physical/climax.
   */
  playStart() {
    stopActive();
    climaxArmed = true;
    physicalArmed = true;
    pocketLockPlayed = false;
    trackStarted = false;
    spinProgress = 0;
    bounceHopsFired = new Set();
    if (spinStartEnabled) {
      void playFile('spin-start', RUNTIME_FILES['spin-start'], { volume: vol('spin-start') });
    }
    startTrackOnce();
  },

  /**
   * Drive phase SFX from animation progress (0..1).
   * @param {number} raw
   */
  onSpinProgress(raw) {
    if (!enabled || !physicalArmed) return;
    const t = Math.max(0, Math.min(1, Number(raw) || 0));
    spinProgress = t;
    fadeTrackTowardStop(t);

    // Catch up if frames skip across multiple hop thresholds.
    for (let guard = 0; guard < 4; guard += 1) {
      const hop = bounceHopIndexAt(t, bounceHopsFired);
      if (hop < 0) break;
      playBounceHop(hop);
    }

    if (t >= SPIN_AUDIO.trackStop) {
      stopTrack();
    }
  },

  /**
   * ball-tick.wav is kept on disk but never played (tractor rumble).
   * Call sites may remain; this is a no-op.
   */
  playTick() {
    return;
  },

  /** Alias kept for older call sites — prefer playPocketLock. */
  playResult() {
    this.playPocketLock();
  },

  /**
   * Final pocket settle — once per spin, after bounces.
   * @returns {Promise<boolean>}
   */
  playPocketLock() {
    if (!enabled) return Promise.resolve(false);
    if (!physicalArmed || pocketLockPlayed) return Promise.resolve(false);
    pocketLockPlayed = true;
    stopTrack();
    stopBounce();
    physicalArmed = false;
    return playFile('pocket-lock', RUNTIME_FILES['pocket-lock'], { volume: vol('pocket-lock') });
  },

  playStraightWin() {
    return playFile('straight-win', RUNTIME_FILES['straight-win'], { volume: vol('straight-win') });
  },

  playWin() {
    return playFile('result-win', RUNTIME_FILES['result-win'], { volume: vol('result-win') });
  },

  playLose() {
    return playFile('result-lose', RUNTIME_FILES['result-lose'], { volume: vol('result-lose') });
  },

  /** Soft single accent after climax — never VIP+level+daily fanfare stack. */
  playBonusAccent() {
    return playFile('bonus-accent', RUNTIME_FILES['bonus-accent'], { volume: vol('bonus-accent') });
  },

  /**
   * pocket-lock is played separately before the hold.
   * Plays climax once per spin (+ at most one bonus accent after).
   * Never both straight-win and result-win.
   */
  async playOutcome(payload) {
    const plan = resolveOutcomeAudioPlan(payload);
    if (!plan.climax) return { ...plan, skipped: false };

    if (!climaxArmed) {
      return { ...plan, skipped: true };
    }
    climaxArmed = false;
    const epoch = playbackEpoch;

    if (plan.climax === 'straight-win') {
      await this.playStraightWin();
    } else if (plan.climax === 'result-win') {
      await this.playWin();
    } else if (plan.climax === 'result-lose') {
      await this.playLose();
    }

    if (epoch !== playbackEpoch || !enabled) {
      return { ...plan, skipped: false, aborted: true };
    }

    if (plan.bonusAccent && enabled) {
      await wait(180);
      if (epoch !== playbackEpoch || !enabled) {
        return { ...plan, skipped: false, aborted: true };
      }
      await this.playBonusAccent();
    }
    return { ...plan, skipped: false };
  },
};
