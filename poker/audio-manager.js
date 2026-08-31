/**
 * PokerSlot audio — dedicated manager (not Slot Royale).
 * Reel product path: local WAV/MP3 in assets/royal-poker/audio/.
 * Synth A/B/C/D is a leftover technical test only (?audioTest=reelA..D).
 * Approved pack POKERSLOT_SELECTED_V1 (frozen 2026-08-31): ?audioFiles=1&soundPack=selected-v1
 * In pack mode missing files stay silent (no synth A/B/C/D fallback).
 */

import { reelSamples, SELECTED_V1_FILES } from './reel-samples.js?v=25';


/**
 * Licensed drop-in filenames (never fetched until files exist — no 404).
 * Procedural Web Audio is the fallback until these land.
 *
 * Reel sample slots (assets/royal-poker/audio/, wav or mp3):
 *   playSpinButton()     → spin-button | spin-a/b/c
 *   playSpin()           → reel-start  | start-a/b/c
 *   startReelLoop()      → reel-loop   | loop-a/b/c
 *   playReelStop(0..3)   → reel-stop-1..4 | stop-a/b/c
 *   playReelStop(4)      → reel-stop-final | final-a/b/c
 * Synth A/B/C/D remains only behind ?audioTest=reelA..D (not a product candidate).
 */
export const AUDIO_FILE_PLAN = Object.freeze({
  'spin-button': '../assets/royal-poker/audio/spin-button.mp3',
  'reel-start': '../assets/royal-poker/audio/reel-start.mp3',
  'reel-loop': '../assets/royal-poker/audio/reel-loop.mp3',
  'reel-stop-1': '../assets/royal-poker/audio/reel-stop-1.mp3',
  'reel-stop-2': '../assets/royal-poker/audio/reel-stop-2.mp3',
  'reel-stop-3': '../assets/royal-poker/audio/reel-stop-3.mp3',
  'reel-stop-4': '../assets/royal-poker/audio/reel-stop-4.mp3',
  'reel-stop-final': '../assets/royal-poker/audio/reel-stop-final.mp3',
  'line-win': '../assets/royal-poker/audio/line-win.mp3',
  'bonus-trigger': '../assets/royal-poker/audio/bonus-trigger.mp3',
  'mystery-open': '../assets/royal-poker/audio/mystery-open.mp3',
  'card-pick': '../assets/royal-poker/audio/card-pick.mp3',
  'card-flip': '../assets/royal-poker/audio/card-flip.mp3',
  'mystery-win': '../assets/royal-poker/audio/mystery-win.mp3',
  'scatter-trigger': '../assets/royal-poker/audio/scatter-trigger.mp3',
  'free-spin-start': '../assets/royal-poker/audio/free-spin-start.mp3',
  'free-spin-end': '../assets/royal-poker/audio/free-spin-end.mp3',
  'big-win': '../assets/royal-poker/audio/big-win.mp3',
  'mega-win': '../assets/royal-poker/audio/mega-win.mp3',
});

export const WIN_TIERS = Object.freeze({
  none: 'none',
  normal: 'normal',
  good: 'good',
  big: 'big',
  mega: 'mega',
});

/** Sample-node gains for POKERSLOT_SELECTED_V1 (buses MASTER/REEL/EFFECTS/FEATURE unchanged). */
export const PACK_GAIN = Object.freeze({
  spin: 0.55,
  bet: 0.35,
  start: 0.45,
  loop: 0.27,
  loopEnergetic: 0.30,
  stop: 0.55,
  final: 0.66,
  fsLoop: 0.24,
  lineWin: 0.40,
  mysteryOpen: 0.55,
  cardPick: 0.45,
  cardFlip: 0.53,
  mysteryWin: 0.57,
  scatter: 0.55,
  fsStart: 0.57,
  fsEnd: 0.53,
  goodWin: 0.52,
  bigWin: 0.63,
  megaWin: 0.68,
});

/** Visual/SFX only — never used by MATH_V6 or settlement. */
export function classifyWin(amount, bet) {
  if (!(amount > 0) || !(bet > 0)) return WIN_TIERS.none;
  const x = amount / bet;
  if (x < 2) return WIN_TIERS.normal;
  if (x < 5) return WIN_TIERS.good;
  if (x < 10) return WIN_TIERS.big;
  return WIN_TIERS.mega;
}

const STORAGE_KEY = 'pokerSlotAudioEnabled';

function readEnabled() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored == null) return true;
    return stored === 'true';
  } catch {
    return true;
  }
}

function writeEnabled(value) {
  try {
    localStorage.setItem(STORAGE_KEY, String(Boolean(value)));
  } catch {
    /* private mode */
  }
}

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Legacy synth tests only: ?audioTest=reelA|reelB|reelC|reelD — not product candidates. */
function readReelVoice() {
  try {
    const raw = String(new URLSearchParams(window.location.search).get('audioTest') || '')
      .trim()
      .toLowerCase();
    if (raw === 'reela' || raw === 'a') return 'A';
    if (raw === 'reelb' || raw === 'b') return 'B';
    if (raw === 'reelc' || raw === 'c') return 'C';
    if (raw === 'reeld' || raw === 'd') return 'D';
  } catch {
    /* ignore */
  }
  return '';
}

function normalizeReelVoice(voice) {
  const v = String(voice || '').toUpperCase();
  return v === 'A' || v === 'B' || v === 'C' || v === 'D' ? v : '';
}

function publishReelVoice(voice) {
  try {
    if (document.body) document.body.dataset.reelAudio = voice;
  } catch {
    /* ignore */
  }
}

export class PokerAudioManager {
  constructor() {
    this.master = 0.52;
    this.reel = 0.38;
    this.effects = 0.72;
    this.feature = 0.78;
    this._enabled = readEnabled();
    this._unlocked = false;
    this._ctx = null;
    this._noise = null;
    this._noiseWhite = null;
    this._tickSlow = null;
    this._tickMid = null;
    this._tickFast = null;
    this._reelNodes = null;
    this._bedNodes = null;
    this._buses = null;
    this._reelVoice = readReelVoice();
    this._reelEnergetic = false;
    this._sampleLoop = null;
    this._fsLoop = null;
    this._fsLoopTimer = null;
    this._betVoice = null;
    this._packVoices = [];
    this._packWarned = new Set();
    this._preparePromise = null;
    publishReelVoice(this._reelVoice);
  }

  isEnabled() {
    return this._enabled;
  }

  setEnabled(on) {
    this._enabled = Boolean(on);
    writeEnabled(this._enabled);
    if (!this._enabled) {
      this.stopReelLoop();
      this.stopFreeSpinLoop({ fadeSec: 0.04 });
      this.stopMysteryBed();
      this._stopBetClick();
      this._stopPackVoices();
    }
  }

  unlock() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!this._ctx) this._ctx = new AC();
      this._ensureGraph();
      if (this._ctx.state === 'suspended') {
        this._ctx.resume().catch(() => undefined);
      }
      this._unlocked = true;
      this._preparePromise = this._prepareReelSamples();
    } catch {
      /* autoplay blocked — visuals still run */
    }
  }

  whenSamplesReady() {
    return this._preparePromise || Promise.resolve();
  }

  get unlocked() {
    return this._unlocked;
  }

  _ensureGraph() {
    const ctx = this._ctx;
    if (!ctx || this._buses) return;
    const master = ctx.createGain();
    master.gain.value = this.master;
    master.connect(ctx.destination);
    const reel = ctx.createGain();
    reel.gain.value = this.reel;
    reel.connect(master);
    const effects = ctx.createGain();
    effects.gain.value = this.effects;
    effects.connect(master);
    const feature = ctx.createGain();
    feature.gain.value = this.feature;
    feature.connect(master);
    this._buses = { master, reel, effects, feature };
    this._noise = this._makeNoiseBuffer('brown');
    this._noiseWhite = this._makeNoiseBuffer('white');
    this._tickSlow = this._makeTickBuffer(8.2, 0.0048);
    this._tickMid = this._makeTickBuffer(15.5, 0.0032);
    this._tickFast = this._makeTickBuffer(22.5, 0.0024);
    publishReelVoice(this._reelVoice);
  }

  _live() {
    return this._enabled && this._unlocked && this._ctx && this._buses;
  }

  _makeNoiseBuffer(kind = 'brown') {
    const ctx = this._ctx;
    const length = Math.floor(ctx.sampleRate * 1.4);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    if (kind === 'white') {
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      return buffer;
    }
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      last = last * 0.97 + (Math.random() * 2 - 1) * 0.16;
      data[i] = Math.max(-1, Math.min(1, last));
    }
    return buffer;
  }

  /** Looping ratchet ticks. hz = pulse rate, pulseSec = click width. */
  _makeTickBuffer(hz = 15.5, pulseSec = 0.0032) {
    const ctx = this._ctx;
    const sr = ctx.sampleRate;
    const length = Math.floor(sr * 0.55);
    const buffer = ctx.createBuffer(1, length, sr);
    const data = buffer.getChannelData(0);
    const period = Math.max(8, Math.floor(sr / hz));
    const pulse = Math.max(4, Math.floor(sr * pulseSec));
    for (let i = 0; i < length; i += 1) {
      const p = i % period;
      if (p < pulse) {
        const t = p / pulse;
        data[i] = (Math.random() * 2 - 1) * (1 - t) * (1 - t);
      }
    }
    return buffer;
  }

  getReelVoice() {
    return normalizeReelVoice(this._reelVoice);
  }

  setReelVoice(voice) {
    this._reelVoice = normalizeReelVoice(voice);
    publishReelVoice(this._reelVoice);
  }

  _synthReelEnabled() {
    if (this._packMode()) return false;
    return Boolean(this._reelVoice);
  }

  _packMode() {
    if (reelSamples.isSelectedPack()) return true;
    try {
      const raw = String(new URLSearchParams(window.location.search).get('soundPack') || '')
        .trim()
        .toLowerCase();
      return raw === 'selected-v1' || raw === 'pokerslot_selected_v1' || raw === 'v1';
    } catch {
      return false;
    }
  }

  _featureBlocked() {
    try {
      return document.body?.dataset?.mysteryOpen === '1';
    } catch {
      return false;
    }
  }

  _warnPackCue(slot) {
    const name = SELECTED_V1_FILES[slot] || slot;
    if (this._packWarned.has(name)) return;
    this._packWarned.add(name);
    console.warn('[PokerSlot][audio] POKERSLOT_SELECTED_V1 missing, silence:', name);
  }

  getReelFileKit() {
    return reelSamples.snapshot();
  }

  setReelFileKit(partial) {
    reelSamples.setKit(partial);
    void this._prepareReelSamples();
    return reelSamples.snapshot();
  }

  async _prepareReelSamples() {
    if (!this._ctx) return;
    try {
      await reelSamples.prepare(this._ctx);
    } catch {
      /* missing samples stay silent */
    }
  }

  _playReelSample(slot, { bus = 'reel', gain = 1, rate = 1, numberedStop, track = false } = {}) {
    if (!this._live()) return false;
    const buffer = reelSamples.buffer(slot, numberedStop);
    if (!buffer) return false;
    try {
      const ctx = this._ctx;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = rate;
      const g = ctx.createGain();
      g.gain.value = clamp01(gain);
      src.connect(g);
      g.connect(this._buses[bus]);
      src.start();
      src.stop(ctx.currentTime + buffer.duration / Math.max(0.05, rate) + 0.05);
      if (track) {
        const voice = { slot, src, g };
        this._packVoices.push(voice);
        src.onended = () => {
          this._packVoices = this._packVoices.filter((v) => v.src !== src);
        };
      }
      return true;
    } catch {
      return false;
    }
  }

  _playPackCue(slot, { bus = 'effects', gain = 1, rate = 1, track = true } = {}) {
    if (!this._live()) return true;
    const ok = this._playReelSample(slot, { bus, gain, rate, track });
    if (!ok) this._warnPackCue(slot);
    return true;
  }

  _fadePackSlot(slot, seconds = 0.18) {
    if (!this._ctx || !this._packVoices.length) return;
    const now = this._ctx.currentTime;
    const fade = Math.max(0.04, seconds);
    this._packVoices = this._packVoices.filter((voice) => {
      if (voice.slot !== slot) return true;
      try {
        const current = Math.max(0.0001, voice.g.gain.value);
        voice.g.gain.cancelScheduledValues(now);
        voice.g.gain.setValueAtTime(current, now);
        voice.g.gain.exponentialRampToValueAtTime(0.0001, now + fade);
        window.setTimeout(() => {
          try {
            voice.src.stop();
          } catch {
            /* already stopped */
          }
        }, Math.round(fade * 1000) + 40);
      } catch {
        /* ignore */
      }
      return false;
    });
  }

  _stopPackVoices() {
    const voices = this._packVoices;
    this._packVoices = [];
    voices.forEach((voice) => {
      try {
        voice.src.stop();
      } catch {
        /* already stopped */
      }
    });
  }

  _startSampleLoop({ energetic = false } = {}) {
    const buffer = reelSamples.buffer('loop');
    if (!buffer || !this._live()) return false;
    this._stopSampleLoop();
    try {
      const ctx = this._ctx;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.playbackRate.value = energetic ? 1.04 : 1;
      const g = ctx.createGain();
      const peak = this._packMode()
        ? (energetic ? PACK_GAIN.loopEnergetic : PACK_GAIN.loop)
        : (energetic ? 0.72 : 0.68);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), ctx.currentTime + 0.04);
      src.connect(g);
      g.connect(this._buses.reel);
      src.start();
      this._sampleLoop = { src, g };
      return true;
    } catch {
      this._sampleLoop = null;
      return false;
    }
  }

  _stopSampleLoop(fadeSec = 0.1) {
    const nodes = this._sampleLoop;
    this._sampleLoop = null;
    if (!nodes || !this._ctx) return;
    try {
      const now = this._ctx.currentTime;
      const fade = Math.max(0.015, Math.min(0.12, Number(fadeSec) || 0.1));
      const current = Math.max(0.0001, nodes.g.gain.value);
      nodes.g.gain.cancelScheduledValues(now);
      nodes.g.gain.setValueAtTime(current, now);
      nodes.g.gain.exponentialRampToValueAtTime(0.0001, now + fade);
      window.setTimeout(() => {
        try {
          nodes.src.stop();
        } catch {
          /* already stopped */
        }
      }, Math.round(fade * 1000) + 40);
    } catch {
      /* ignore */
    }
  }

  _playSampleStop(index) {
    const i = Math.max(0, Math.min(4, Number(index) || 0));
    const pack = this._packMode();
    if (i === 4) {
      const finalGain = pack ? PACK_GAIN.final : 1;
      if (this._playReelSample('final', { bus: 'reel', gain: finalGain, rate: 1 })) return true;
      if (pack) {
        this._warnPackCue('final');
        return true;
      }
      const fallback = reelSamples.stopVariation(4);
      return this._playReelSample('stop', {
        bus: 'reel',
        gain: fallback.gain,
        rate: fallback.rate,
      });
    }
    const variation = reelSamples.stopVariation(i);
    const stopGain = pack ? PACK_GAIN.stop * variation.gain : variation.gain;
    if (this._playReelSample('stop', {
      bus: 'reel',
      gain: stopGain,
      rate: variation.rate,
    })) return true;
    if (pack) {
      this._warnPackCue('stop');
      return true;
    }
    const numbered = reelSamples.buffer('stop', i + 1);
    const shared = reelSamples.buffer('stop');
    if (numbered && numbered !== shared) {
      return this._playReelSample('stop', {
        bus: 'reel',
        gain: 0.88 + i * 0.03,
        rate: 1,
        numberedStop: i + 1,
      });
    }
    if (numbered) {
      return this._playReelSample('stop', {
        bus: 'reel',
        gain: variation.gain,
        rate: variation.rate,
        numberedStop: i + 1,
      });
    }
    return false;
  }

  _traceReel(kind, extra = {}) {
    try {
      const log = window.__POKER_REEL_TRACE__;
      if (Array.isArray(log)) log.push({ kind, t: performance.now(), voice: this.getReelVoice(), ...extra });
    } catch {
      /* ignore */
    }
  }

  _connectEnv(now, peak, attack, dur) {
    const g = this._ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + Math.max(0.002, attack));
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    return g;
  }

  _startNoise(buffer, now, dur) {
    const src = this._ctx.createBufferSource();
    src.buffer = buffer || this._noise;
    src.start(now);
    src.stop(now + dur + 0.03);
    return src;
  }

  _filteredNoise(bus, {
    buffer,
    dur = 0.08,
    gain = 0.12,
    freq = 1200,
    q = 1.2,
    type = 'bandpass',
    start = 0,
    attack = 0.004,
  }) {
    const ctx = this._ctx;
    const now = ctx.currentTime + start;
    const src = this._startNoise(buffer, now, dur);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = this._connectEnv(now, gain, attack, dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this._buses[bus]);
  }

  /** Fast-decaying low body — reads as impact, not a held note. */
  _thump(bus, { freq = 80, dur = 0.09, gain = 0.1, start = 0 }) {
    const ctx = this._ctx;
    const now = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(28, freq * 0.48), now + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(240, freq * 2.4);
    lp.Q.value = 0.55;
    const g = this._connectEnv(now, gain, 0.003, dur);
    osc.connect(lp);
    lp.connect(g);
    g.connect(this._buses[bus]);
    osc.start(now);
    osc.stop(now + dur + 0.04);
  }

  _tone(bus, { freq, dur, type = 'triangle', gain = 0.2, start = 0, slide = 0 }) {
    const ctx = this._ctx;
    const now = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), now + dur);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g);
    g.connect(this._buses[bus]);
    osc.start(now);
    osc.stop(now + dur + 0.03);
  }

  _noiseBurst(bus, { dur = 0.08, gain = 0.18, freq = 1400, q = 4, start = 0 }) {
    const ctx = this._ctx;
    const now = ctx.currentTime + start;
    const src = ctx.createBufferSource();
    src.buffer = this._noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this._buses[bus]);
    src.start(now);
    src.stop(now + dur + 0.02);
  }

  playClick() {
    if (this._packMode()) return;
    if (!this._live()) return;
    try {
      this._noiseBurst('effects', { dur: 0.045, gain: 0.16, freq: 2200, q: 1.2 });
      this._tone('effects', { freq: 180, dur: 0.05, type: 'sine', gain: 0.08 });
    } catch {
      /* ignore */
    }
  }

  _stopBetClick() {
    const voice = this._betVoice;
    this._betVoice = null;
    if (!voice) return;
    try {
      voice.src.stop();
    } catch {
      /* already stopped */
    }
  }

  /** Reuses spin-button-selected.wav at a lower gain. Does not change SPIN (0.55). */
  playBetClick() {
    if (!this._live()) return;
    if (!this._packMode()) {
      this.playClick();
      return;
    }
    try {
      const buffer = reelSamples.buffer('spin');
      if (!buffer) {
        Promise.resolve(this.whenSamplesReady())
          .then(() => {
            if (!this._live() || !this._packMode()) return;
            if (reelSamples.buffer('spin')) this.playBetClick();
          })
          .catch(() => undefined);
        return;
      }
      this._stopBetClick();
      const ctx = this._ctx;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = 1;
      const g = ctx.createGain();
      g.gain.value = clamp01(PACK_GAIN.bet);
      src.connect(g);
      g.connect(this._buses.effects);
      src.start();
      src.stop(ctx.currentTime + buffer.duration + 0.05);
      this._betVoice = { src, g };
      src.onended = () => {
        if (this._betVoice?.src === src) this._betVoice = null;
      };
    } catch {
      this._betVoice = null;
    }
  }

  playSpinButton() {
    this._traceReel('spin-button');
    if (!this._live()) return;
    if (this._packMode()) {
      this._playPackCue('spin', { bus: 'effects', gain: PACK_GAIN.spin, track: false });
      return;
    }
    if (this._playReelSample('spin', { bus: 'effects', gain: 0.9 })) return;
    if (!this._synthReelEnabled()) return;
    const v = this.getReelVoice();
    try {
      if (v === 'A') {
        this._filteredNoise('effects', {
          buffer: this._noiseWhite, dur: 0.012, gain: 0.17, freq: 3800, q: 0.9, type: 'highpass', attack: 0.001,
        });
        this._thump('effects', { freq: 110, dur: 0.045, gain: 0.07 });
      } else if (v === 'B') {
        this._filteredNoise('effects', {
          buffer: this._noiseWhite, dur: 0.016, gain: 0.15, freq: 2800, q: 1.2, type: 'bandpass', attack: 0.001,
        });
        this._filteredNoise('effects', {
          buffer: this._noise, dur: 0.055, gain: 0.1, freq: 520, q: 1.4, type: 'bandpass',
        });
        this._thump('effects', { freq: 72, dur: 0.07, gain: 0.09 });
      } else if (v === 'C') {
        this._thump('effects', { freq: 56, dur: 0.11, gain: 0.13 });
        this._filteredNoise('effects', {
          buffer: this._noiseWhite, dur: 0.02, gain: 0.08, freq: 2400, q: 0.8, type: 'highpass',
        });
      } else {
        this._filteredNoise('effects', {
          buffer: this._noiseWhite, dur: 0.014, gain: 0.16, freq: 3600, q: 0.85, type: 'highpass', attack: 0.001,
        });
        this._thump('effects', { freq: 64, dur: 0.1, gain: 0.12 });
        this._filteredNoise('effects', {
          buffer: this._noise, dur: 0.05, gain: 0.09, freq: 420, q: 0.9, type: 'lowpass',
        });
      }
    } catch {
      /* ignore */
    }
  }

  playSpin() {
    this._traceReel('reel-start');
    if (!this._live()) return;
    if (this._packMode()) {
      this._fadePackSlot('fsStart', 0.22);
      this._playPackCue('start', { bus: 'reel', gain: PACK_GAIN.start, track: false });
      return;
    }
    if (this._playReelSample('start', { bus: 'reel', gain: 0.88 })) return;
    if (!this._synthReelEnabled()) return;
    const v = this.getReelVoice();
    try {
      if (v === 'A') {
        this._filteredNoise('reel', {
          buffer: this._noiseWhite, dur: 0.07, gain: 0.1, freq: 1600, q: 0.8, type: 'bandpass', attack: 0.006,
        });
      } else if (v === 'B') {
        this._filteredNoise('reel', {
          buffer: this._noise, dur: 0.1, gain: 0.11, freq: 380, q: 0.8, type: 'lowpass', attack: 0.01,
        });
        this._filteredNoise('reel', {
          buffer: this._noiseWhite, dur: 0.04, gain: 0.06, freq: 1900, q: 4.5, type: 'bandpass',
        });
      } else if (v === 'C') {
        this._thump('reel', { freq: 48, dur: 0.14, gain: 0.11 });
        this._filteredNoise('reel', {
          buffer: this._noise, dur: 0.12, gain: 0.1, freq: 280, q: 0.6, type: 'lowpass', attack: 0.015,
        });
      } else {
        this._filteredNoise('reel', {
          buffer: this._noise, dur: 0.09, gain: 0.12, freq: 500, q: 0.7, type: 'lowpass', attack: 0.006,
        });
        this._filteredNoise('reel', {
          buffer: this._noiseWhite, dur: 0.05, gain: 0.08, freq: 2200, q: 1.1, type: 'bandpass',
        });
      }
    } catch {
      /* ignore */
    }
  }

  startReelLoop({ energetic = false } = {}) {
    this._traceReel('reel-loop', { energetic: Boolean(energetic) });
    this.stopReelLoop();
    if (!this._live()) return;
    this._reelEnergetic = Boolean(energetic);
    if (this._packMode()) this._fadePackSlot('fsStart', 0.22);
    if (this._startSampleLoop({ energetic })) return;
    if (this._packMode()) {
      this._warnPackCue('loop');
      return;
    }
    if (!this._synthReelEnabled()) return;
    this._startReelLoopVoice(this.getReelVoice(), energetic);
  }

  _tickBufferFor(kind) {
    if (kind === 'slow') return this._tickSlow;
    if (kind === 'fast') return this._tickFast;
    return this._tickMid;
  }

  _startReelLoopVoice(voice, energetic) {
    const specs = {
      A: {
        bodyLp: 980, bodyG: 0.034, airHp: 2600, airG: 0.009,
        flutterHz: 7.4, flutterDepth: 0.0035, tick: 'mid', tickRate: 0.82,
        tickHz: 1750, tickQ: 2.4, tickG: 0.009, mix: 1.04,
      },
      B: {
        bodyLp: 480, bodyG: 0.033, airHp: 1500, airG: 0.007,
        flutterHz: 9.2, flutterDepth: 0.0025, tick: 'slow', tickRate: 1,
        tickHz: 2550, tickQ: 7.2, tickG: 0.03, mix: 0.98,
      },
      C: {
        bodyLp: 390, bodyG: 0.048, airHp: 3100, airG: 0.015,
        flutterHz: 5.8, flutterDepth: 0.006, tick: null, tickRate: 1,
        tickHz: 2000, tickQ: 2, tickG: 0, mix: 1.0,
      },
      D: {
        bodyLp: 720, bodyG: 0.038, airHp: 2000, airG: 0.013,
        flutterHz: 14.8, flutterDepth: 0.0065, tick: 'fast', tickRate: 1.08,
        tickHz: 2100, tickQ: 4.2, tickG: 0.026, mix: 0.93,
      },
    };
    const spec = specs[voice] || specs.A;
    try {
      const ctx = this._ctx;
      const mix = ctx.createGain();
      const mixTarget = energetic ? spec.mix * 0.96 : spec.mix;

      const bodySrc = ctx.createBufferSource();
      bodySrc.buffer = this._noise;
      bodySrc.loop = true;
      const bodyLp = ctx.createBiquadFilter();
      bodyLp.type = 'lowpass';
      bodyLp.frequency.value = energetic ? spec.bodyLp * 1.12 : spec.bodyLp;
      bodyLp.Q.value = 0.5;
      const bodyG = ctx.createGain();
      bodyG.gain.value = energetic ? spec.bodyG * 1.06 : spec.bodyG;
      bodySrc.connect(bodyLp);
      bodyLp.connect(bodyG);
      bodyG.connect(mix);

      const airSrc = ctx.createBufferSource();
      airSrc.buffer = this._noiseWhite;
      airSrc.loop = true;
      const airHp = ctx.createBiquadFilter();
      airHp.type = 'highpass';
      airHp.frequency.value = energetic ? spec.airHp * 1.08 : spec.airHp;
      const airG = ctx.createGain();
      airG.gain.value = energetic ? spec.airG * 1.1 : spec.airG;
      const flutter = ctx.createOscillator();
      flutter.type = 'sine';
      flutter.frequency.value = energetic ? spec.flutterHz * 1.12 : spec.flutterHz;
      const flutterDepth = ctx.createGain();
      flutterDepth.gain.value = spec.flutterDepth;
      flutter.connect(flutterDepth);
      flutterDepth.connect(airG.gain);
      airSrc.connect(airHp);
      airHp.connect(airG);
      airG.connect(mix);

      let tickSrc = null;
      let tickG = null;
      if (spec.tick && spec.tickG > 0) {
        tickSrc = ctx.createBufferSource();
        tickSrc.buffer = this._tickBufferFor(spec.tick);
        tickSrc.loop = true;
        tickSrc.playbackRate.value = energetic ? spec.tickRate * 1.12 : spec.tickRate;
        const tickBp = ctx.createBiquadFilter();
        tickBp.type = 'bandpass';
        tickBp.frequency.value = energetic ? spec.tickHz * 1.08 : spec.tickHz;
        tickBp.Q.value = spec.tickQ;
        tickG = ctx.createGain();
        tickG.gain.value = energetic ? spec.tickG * 1.08 : spec.tickG;
        tickSrc.connect(tickBp);
        tickBp.connect(tickG);
        tickG.connect(mix);
      }

      mix.connect(this._buses.reel);
      const now = ctx.currentTime;
      mix.gain.setValueAtTime(0.0001, now);
      mix.gain.exponentialRampToValueAtTime(mixTarget, now + 0.05);

      bodySrc.start();
      airSrc.start();
      flutter.start();
      tickSrc?.start();
      this._reelNodes = {
        voice,
        g: mix,
        src: bodySrc,
        tickSrc,
        airSrc,
        flutter,
        tickG,
        tickRate: energetic ? spec.tickRate * 1.12 : spec.tickRate,
        tickGBase: energetic ? spec.tickG * 1.08 : spec.tickG,
        extras: [airSrc, tickSrc, flutter].filter(Boolean),
        stops: 0,
      };
    } catch {
      this._reelNodes = null;
    }
  }

  _shapeReelLoopForStop(index) {
    try {
      const now = this._ctx?.currentTime ?? 0;
      const remain = Math.max(0, 4 - index);
      const sample = this._sampleLoop;
      if (sample?.g && this._ctx) {
        const current = Math.max(0.0002, sample.g.gain.value);
        const factor = remain <= 0 ? 0.0001 : remain === 1 ? 0.72 : 0.86;
        const next = remain <= 0 ? 0.0001 : current * factor;
        sample.g.gain.cancelScheduledValues(now);
        sample.g.gain.setValueAtTime(current, now);
        sample.g.gain.exponentialRampToValueAtTime(Math.max(0.0001, next), now + 0.09);
      }
      const nodes = this._reelNodes;
      if (!nodes || !this._ctx) return;
      nodes.stops = (nodes.stops || 0) + 1;
      const voice = nodes.voice;
      const mix = nodes.g;
      if (mix) {
        const current = Math.max(0.0002, mix.gain.value);
        let factor = 0.88;
        if (voice === 'A') factor = remain <= 0 ? 0.0001 : 0.9;
        else if (voice === 'B') factor = remain <= 0 ? 0.0001 : remain === 1 ? 0.78 : 0.88;
        else if (voice === 'C') factor = remain <= 0 ? 0.0001 : 0.92;
        else factor = remain <= 0 ? 0.0001 : remain === 1 ? 0.7 : remain === 2 ? 0.82 : 0.9;
        const next = remain <= 0 ? 0.0001 : current * factor;
        mix.gain.cancelScheduledValues(now);
        mix.gain.setValueAtTime(current, now);
        mix.gain.exponentialRampToValueAtTime(Math.max(0.0001, next), now + 0.09);
      }
      if (voice === 'D' && remain <= 2 && nodes.tickSrc) {
        try {
          nodes.tickSrc.playbackRate.setTargetAtTime((nodes.tickRate || 1) * (remain <= 1 ? 1.14 : 1.07), now, 0.06);
        } catch {
          /* ignore */
        }
      }
      if (voice === 'B' && remain <= 2 && nodes.tickG) {
        nodes.tickG.gain.setTargetAtTime((nodes.tickGBase || 0.03) * (remain <= 1 ? 1.18 : 1.08), now, 0.08);
      }
    } catch {
      /* never block reel animation */
    }
  }

  stopReelLoop({ fadeSec } = {}) {
    const fade = fadeSec == null ? 0.1 : Math.max(0.015, Math.min(0.12, Number(fadeSec) || 0.1));
    this._stopSampleLoop(fade);
    const nodes = this._reelNodes;
    this._reelNodes = null;
    if (!nodes) return;
    try {
      const now = this._ctx?.currentTime ?? 0;
      if (nodes.g && this._ctx) {
        const current = Math.max(0.0001, nodes.g.gain.value);
        nodes.g.gain.cancelScheduledValues(now);
        nodes.g.gain.setValueAtTime(current, now);
        nodes.g.gain.exponentialRampToValueAtTime(0.0001, now + fade);
      }
      window.setTimeout(() => {
        try {
          nodes.src?.stop();
          nodes.lfo?.stop();
          nodes.tickSrc?.stop();
          nodes.airSrc?.stop();
          nodes.flutter?.stop();
        } catch {
          /* already stopped */
        }
      }, Math.round(fade * 1000) + 40);
    } catch {
      /* ignore */
    }
  }

  logReelSync(msg) {
    try {
      const host = String(window.location.hostname || '');
      if (host !== '127.0.0.1' && host !== 'localhost') return;
      console.info(`[PokerSlot][reel-sync] ${msg}`, performance.now());
    } catch {
      /* ignore */
    }
  }

  playReelStop(index = 0) {
    try {
      const i = Math.max(0, Math.min(4, Number(index) || 0));
      this._traceReel('reel-stop', { i });
      if (!this._live()) return;
      if (this._packMode()) {
        /* Loop stays at full level through R1–R4. Cut it on R5 visual lock-in. */
        if (i === 4) {
          this.logReelSync('reel loop stopped');
          this.stopReelLoop({ fadeSec: 0.028 });
        }
      } else {
        this._shapeReelLoopForStop(i);
      }
      if (this._playSampleStop(i)) {
        this._duckFsLoop(0.42, 0.16);
        this.logReelSync(i === 4 ? 'final clunk played' : `reel ${i + 1} clack played`);
        return;
      }
      if (this._packMode()) return;
      if (!this._synthReelEnabled()) return;
      this._playReelStopVoice(this.getReelVoice(), i);
    } catch {
      /* never throw into the animator */
    }
  }

  _playReelStopVoice(voice, i) {
    const tables = {
      A: [
        { click: 0.15, body: 0.1, thump: 0.05, metal: 0.02, thumpHz: 118, bodyHz: 1450, decay: 0.042 },
        { click: 0.15, body: 0.11, thump: 0.055, metal: 0.02, thumpHz: 112, bodyHz: 1380, decay: 0.044 },
        { click: 0.16, body: 0.11, thump: 0.055, metal: 0.022, thumpHz: 108, bodyHz: 1320, decay: 0.046 },
        { click: 0.16, body: 0.12, thump: 0.06, metal: 0.024, thumpHz: 100, bodyHz: 1240, decay: 0.05 },
        { click: 0.17, body: 0.15, thump: 0.09, metal: 0.028, thumpHz: 88, bodyHz: 1100, decay: 0.07 },
      ],
      B: [
        { click: 0.12, body: 0.1, thump: 0.07, metal: 0.055, thumpHz: 86, bodyHz: 720, decay: 0.06 },
        { click: 0.12, body: 0.11, thump: 0.08, metal: 0.06, thumpHz: 80, bodyHz: 660, decay: 0.065 },
        { click: 0.13, body: 0.11, thump: 0.08, metal: 0.062, thumpHz: 76, bodyHz: 620, decay: 0.068 },
        { click: 0.14, body: 0.13, thump: 0.1, metal: 0.07, thumpHz: 68, bodyHz: 540, decay: 0.085 },
        { click: 0.15, body: 0.16, thump: 0.16, metal: 0.08, thumpHz: 50, bodyHz: 420, decay: 0.13 },
      ],
      C: [
        { click: 0.08, body: 0.14, thump: 0.09, metal: 0.02, thumpHz: 70, bodyHz: 480, decay: 0.07 },
        { click: 0.08, body: 0.145, thump: 0.095, metal: 0.02, thumpHz: 68, bodyHz: 460, decay: 0.072 },
        { click: 0.085, body: 0.15, thump: 0.1, metal: 0.022, thumpHz: 64, bodyHz: 440, decay: 0.075 },
        { click: 0.09, body: 0.16, thump: 0.11, metal: 0.024, thumpHz: 60, bodyHz: 400, decay: 0.085 },
        { click: 0.09, body: 0.18, thump: 0.13, metal: 0.03, thumpHz: 52, bodyHz: 340, decay: 0.11 },
      ],
      D: [
        { click: 0.12, body: 0.1, thump: 0.07, metal: 0.03, thumpHz: 92, bodyHz: 900, decay: 0.05 },
        { click: 0.13, body: 0.12, thump: 0.08, metal: 0.035, thumpHz: 84, bodyHz: 820, decay: 0.058 },
        { click: 0.14, body: 0.13, thump: 0.09, metal: 0.04, thumpHz: 76, bodyHz: 740, decay: 0.066 },
        { click: 0.16, body: 0.15, thump: 0.11, metal: 0.05, thumpHz: 68, bodyHz: 620, decay: 0.08 },
        { click: 0.18, body: 0.2, thump: 0.17, metal: 0.06, thumpHz: 54, bodyHz: 480, decay: 0.125 },
      ],
    };
    const s = (tables[voice] || tables.A)[i] || tables.A[0];
    try {
      this._filteredNoise('reel', {
        buffer: this._noiseWhite,
        dur: voice === 'C' ? 0.012 : 0.015,
        gain: s.click,
        freq: voice === 'B' ? 3600 - i * 80 : voice === 'C' ? 2800 : 4800 - i * 160,
        q: voice === 'B' ? 1.4 : 0.85,
        type: voice === 'B' ? 'bandpass' : 'highpass',
        attack: 0.001,
      });
      this._filteredNoise('reel', {
        buffer: this._noise,
        dur: s.decay,
        gain: s.body,
        freq: s.bodyHz,
        q: voice === 'C' ? 0.85 : 1.3,
        type: 'bandpass',
      });
      this._thump('reel', { freq: s.thumpHz, dur: s.decay + 0.02, gain: s.thump });
      if (s.metal > 0.025) {
        this._filteredNoise('reel', {
          buffer: this._noiseWhite,
          dur: 0.02,
          gain: s.metal,
          freq: voice === 'B' ? 2900 - i * 70 : 3100 - i * 80,
          q: voice === 'B' ? 7.5 : 5.5,
          type: 'bandpass',
          start: 0.003,
        });
      }
      if (i === 4 && voice === 'C') {
        this._filteredNoise('reel', {
          buffer: this._noiseWhite,
          dur: 0.014,
          gain: 0.07,
          freq: 6200,
          q: 3.2,
          type: 'bandpass',
          start: 0.01,
        });
      }
      if (i === 4 && (voice === 'B' || voice === 'D')) {
        this._filteredNoise('reel', {
          buffer: this._noise,
          dur: 0.15,
          gain: voice === 'D' ? 0.08 : 0.09,
          freq: 200,
          q: 0.75,
          type: 'lowpass',
          start: 0.012,
        });
      }
    } catch {
      /* ignore */
    }
  }


  playLineWin() {
    if (!this._live()) return;
    if (this._packMode()) {
      this._fadePackSlot('lineWin', 0.05);
      this._duckFsLoop(0.38, 0.22);
      this._playPackCue('lineWin', { bus: 'effects', gain: PACK_GAIN.lineWin });
      return;
    }
    try {
      this._tone('effects', { freq: 784, dur: 0.12, type: 'sine', gain: 0.11 });
      this._tone('effects', { freq: 988, dur: 0.16, type: 'triangle', gain: 0.09, start: 0.05 });
    } catch {
      /* ignore */
    }
  }

  playGoodWin() {
    if (!this._live()) return;
    if (this._packMode()) {
      this._fadePackSlot('lineWin', 0.12);
      this._duckFsLoop(0.32, 0.28);
      this._playPackCue('goodWin', { bus: 'effects', gain: PACK_GAIN.goodWin });
      return;
    }
    try {
      this._tone('effects', { freq: 659, dur: 0.12, type: 'triangle', gain: 0.1 });
      this._tone('effects', { freq: 831, dur: 0.14, type: 'triangle', gain: 0.1, start: 0.07 });
      this._tone('effects', { freq: 988, dur: 0.18, type: 'sine', gain: 0.09, start: 0.14 });
    } catch {
      /* ignore */
    }
  }

  playBigWin() {
    if (!this._live()) return;
    if (this._featureBlocked()) return;
    if (this._packMode()) {
      this._fadePackSlot('lineWin', 0.12);
      this._duckFsLoop(0.28, 0.45);
      this._playPackCue('bigWin', { bus: 'feature', gain: PACK_GAIN.bigWin });
      return;
    }
    try {
      this._tone('feature', { freq: 392, dur: 0.18, type: 'sine', gain: 0.1 });
      this._tone('feature', { freq: 523, dur: 0.18, type: 'triangle', gain: 0.1, start: 0.06 });
      this._tone('feature', { freq: 659, dur: 0.22, type: 'triangle', gain: 0.11, start: 0.14 });
      this._tone('feature', { freq: 784, dur: 0.28, type: 'sine', gain: 0.09, start: 0.24 });
    } catch {
      /* ignore */
    }
  }

  playMegaWin() {
    if (!this._live()) return;
    if (this._featureBlocked()) return;
    if (this._packMode()) {
      this._fadePackSlot('lineWin', 0.12);
      this._duckFsLoop(0.22, 0.55);
      this._playPackCue('megaWin', { bus: 'feature', gain: PACK_GAIN.megaWin });
      return;
    }
    try {
      this._tone('feature', { freq: 262, dur: 0.2, type: 'sine', gain: 0.11 });
      this._tone('feature', { freq: 392, dur: 0.2, type: 'triangle', gain: 0.1, start: 0.08 });
      this._tone('feature', { freq: 523, dur: 0.24, type: 'triangle', gain: 0.11, start: 0.18 });
      this._tone('feature', { freq: 659, dur: 0.28, type: 'sine', gain: 0.12, start: 0.3 });
      this._tone('feature', { freq: 784, dur: 0.32, type: 'sine', gain: 0.11, start: 0.42 });
      this._tone('feature', { freq: 1047, dur: 0.36, type: 'sine', gain: 0.1, start: 0.54 });
    } catch {
      /* ignore */
    }
  }

  playBonusTrigger() {
    if (this._packMode()) return;
    if (!this._live()) return;
    try {
      this._tone('feature', { freq: 196, dur: 0.22, type: 'sine', gain: 0.12 });
      this._tone('feature', { freq: 311, dur: 0.2, type: 'triangle', gain: 0.1, start: 0.08 });
      this._tone('feature', { freq: 415, dur: 0.26, type: 'triangle', gain: 0.11, start: 0.18 });
    } catch {
      /* ignore */
    }
  }

  playMysteryOpen() {
    if (!this._live()) return;
    if (this._packMode()) {
      this._fadePackSlot('bigWin', 0.12);
      this._fadePackSlot('megaWin', 0.12);
      this._fadePackSlot('goodWin', 0.12);
      this._duckFsLoop(0.08, 0.7);
      this._playPackCue('mysteryOpen', { bus: 'feature', gain: PACK_GAIN.mysteryOpen });
      return;
    }
    try {
      this._tone('feature', { freq: 233, dur: 0.28, type: 'sine', gain: 0.09 });
      this._tone('feature', { freq: 349, dur: 0.34, type: 'sine', gain: 0.08, start: 0.12 });
    } catch {
      /* ignore */
    }
  }

  startMysteryBed() {
    this.stopMysteryBed();
    if (this._packMode()) return;
    if (!this._live()) return;
    try {
      const ctx = this._ctx;
      const oscA = ctx.createOscillator();
      const oscB = ctx.createOscillator();
      oscA.type = 'sine';
      oscB.type = 'sine';
      oscA.frequency.value = 110;
      oscB.frequency.value = 164.8;
      const g = ctx.createGain();
      g.gain.value = 0.018;
      oscA.connect(g);
      oscB.connect(g);
      g.connect(this._buses.feature);
      oscA.start();
      oscB.start();
      this._bedNodes = { oscA, oscB, g };
    } catch {
      this._bedNodes = null;
    }
  }

  stopMysteryBed() {
    const nodes = this._bedNodes;
    this._bedNodes = null;
    if (!nodes) return;
    try {
      const now = this._ctx?.currentTime ?? 0;
      if (nodes.g && this._ctx) {
        nodes.g.gain.setValueAtTime(Math.max(0.0001, nodes.g.gain.value), now);
        nodes.g.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      }
      window.setTimeout(() => {
        try {
          nodes.oscA.stop();
          nodes.oscB.stop();
        } catch {
          /* already stopped */
        }
      }, 220);
    } catch {
      /* ignore */
    }
  }

  playCardHover() {
    if (this._packMode()) return;
    if (!this._live()) return;
    try {
      this._tone('effects', { freq: 880, dur: 0.04, type: 'sine', gain: 0.03 });
    } catch {
      /* ignore */
    }
  }

  playCardPick() {
    if (!this._live()) return;
    if (this._packMode()) {
      this._playPackCue('cardPick', { bus: 'effects', gain: PACK_GAIN.cardPick, track: false });
      return;
    }
    try {
      this._noiseBurst('effects', { dur: 0.05, gain: 0.14, freq: 2400, q: 1.4 });
      this._tone('effects', { freq: 320, dur: 0.06, type: 'sine', gain: 0.07 });
    } catch {
      /* ignore */
    }
  }

  playCardFlip() {
    if (!this._live()) return;
    if (this._packMode()) {
      this._playPackCue('cardFlip', { bus: 'effects', gain: PACK_GAIN.cardFlip, track: false });
      return;
    }
    try {
      this._noiseBurst('effects', { dur: 0.12, gain: 0.1, freq: 3200, q: 0.7 });
      this._tone('effects', { freq: 740, dur: 0.14, type: 'sine', gain: 0.06, slide: -180 });
    } catch {
      /* ignore */
    }
  }

  playMysteryWin() {
    if (!this._live()) return;
    if (this._packMode()) {
      this._playPackCue('mysteryWin', { bus: 'feature', gain: PACK_GAIN.mysteryWin });
      return;
    }
    try {
      this._tone('feature', { freq: 349, dur: 0.16, type: 'triangle', gain: 0.1 });
      this._tone('feature', { freq: 440, dur: 0.18, type: 'triangle', gain: 0.1, start: 0.08 });
      this._tone('feature', { freq: 523, dur: 0.28, type: 'sine', gain: 0.12, start: 0.16 });
    } catch {
      /* ignore */
    }
  }

  playScatterTrigger() {
    if (!this._live()) return;
    if (this._packMode()) {
      this._fadePackSlot('mysteryOpen', 0.16);
      this._fadePackSlot('mysteryWin', 0.16);
      this._playPackCue('scatter', { bus: 'feature', gain: PACK_GAIN.scatter });
      return;
    }
    try {
      this._tone('feature', { freq: 523, dur: 0.12, type: 'sine', gain: 0.1 });
      this._tone('feature', { freq: 784, dur: 0.14, type: 'triangle', gain: 0.11, start: 0.08 });
      this._tone('feature', { freq: 1047, dur: 0.2, type: 'sine', gain: 0.1, start: 0.18 });
    } catch {
      /* ignore */
    }
  }

  playFreeSpinStart() {
    if (!this._live()) return;
    if (this._packMode()) {
      this._fadePackSlot('scatter', 0.2);
      this._playPackCue('fsStart', { bus: 'feature', gain: PACK_GAIN.fsStart });
      this._scheduleFreeSpinLoop();
      return;
    }
    try {
      this._tone('feature', { freq: 392, dur: 0.14, type: 'triangle', gain: 0.1 });
      this._tone('feature', { freq: 523, dur: 0.16, type: 'triangle', gain: 0.1, start: 0.1 });
      this._tone('feature', { freq: 659, dur: 0.18, type: 'sine', gain: 0.11, start: 0.2 });
      this._tone('feature', { freq: 784, dur: 0.24, type: 'sine', gain: 0.1, start: 0.32 });
    } catch {
      /* ignore */
    }
  }

  _scheduleFreeSpinLoop() {
    try {
      window.clearTimeout(this._fsLoopTimer);
      this._fsLoopTimer = null;
      const buf = reelSamples.buffer('fsStart');
      const waitMs = buf
        ? Math.round(Math.max(0.4, buf.duration - 0.22) * 1000)
        : 1600;
      this._fsLoopTimer = window.setTimeout(() => {
        this._fsLoopTimer = null;
        this.startFreeSpinLoop();
      }, waitMs);
    } catch {
      this.startFreeSpinLoop();
    }
  }

  startFreeSpinLoop() {
    if (!this._live() || !this._packMode()) return false;
    if (this._fsLoop) return true;
    const buffer = reelSamples.buffer('fsLoop');
    if (!buffer) {
      this._warnPackCue('fsLoop');
      return false;
    }
    try {
      const ctx = this._ctx;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.playbackRate.value = 1;
      const g = ctx.createGain();
      const peak = Math.max(0.0002, PACK_GAIN.fsLoop);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(peak, ctx.currentTime + 0.05);
      src.connect(g);
      g.connect(this._buses.feature);
      src.start();
      this._fsLoop = { src, g, peak };
      return true;
    } catch {
      this._fsLoop = null;
      return false;
    }
  }

  _duckFsLoop(factor = 0.45, recoverSec = 0.2) {
    const nodes = this._fsLoop;
    if (!nodes?.g || !this._ctx || !this._packMode()) return;
    try {
      const now = this._ctx.currentTime;
      const peak = Math.max(0.0002, nodes.peak || PACK_GAIN.fsLoop);
      const ducked = Math.max(0.00012, peak * Math.max(0.08, Math.min(1, factor)));
      const hold = 0.07;
      const recover = Math.max(0.08, recoverSec);
      nodes.g.gain.cancelScheduledValues(now);
      nodes.g.gain.setValueAtTime(Math.max(0.0001, nodes.g.gain.value), now);
      nodes.g.gain.exponentialRampToValueAtTime(ducked, now + 0.04);
      nodes.g.gain.setValueAtTime(ducked, now + hold);
      nodes.g.gain.exponentialRampToValueAtTime(peak, now + hold + recover);
    } catch {
      /* never block cues */
    }
  }

  stopFreeSpinLoop({ fadeSec = 0.35 } = {}) {
    try {
      window.clearTimeout(this._fsLoopTimer);
    } catch {
      /* ignore */
    }
    this._fsLoopTimer = null;
    const nodes = this._fsLoop;
    this._fsLoop = null;
    if (!nodes || !this._ctx) return Promise.resolve();
    const fade = Math.max(0.04, Math.min(0.6, Number(fadeSec) || 0.35));
    try {
      const now = this._ctx.currentTime;
      const current = Math.max(0.0001, nodes.g.gain.value);
      nodes.g.gain.cancelScheduledValues(now);
      nodes.g.gain.setValueAtTime(current, now);
      nodes.g.gain.exponentialRampToValueAtTime(0.0001, now + fade);
    } catch {
      /* ignore */
    }
    return new Promise((resolve) => {
      window.setTimeout(() => {
        try {
          nodes.src.stop();
        } catch {
          /* already stopped */
        }
        resolve();
      }, Math.round(fade * 1000) + 30);
    });
  }

  playFreeSpinWin() {
    this.playLineWin();
  }

  playFreeSpinEnd(hasWin) {
    if (!this._live()) return;
    if (this._packMode()) {
      this._playPackCue('fsEnd', { bus: 'feature', gain: PACK_GAIN.fsEnd });
      return;
    }
    if (!hasWin) return;
    try {
      this._tone('feature', { freq: 523, dur: 0.14, type: 'sine', gain: 0.09 });
      this._tone('feature', { freq: 659, dur: 0.18, type: 'triangle', gain: 0.09, start: 0.1 });
      this._tone('feature', { freq: 784, dur: 0.22, type: 'sine', gain: 0.1, start: 0.2 });
    } catch {
      /* ignore */
    }
  }
}

export const pokerAudio = new PokerAudioManager();

try {
  window.pokerReelAudioTest = (voice) => {
    pokerAudio.setReelVoice(voice);
    return pokerAudio.getReelVoice();
  };
  window.pokerReelFiles = (spec) => pokerAudio.setReelFileKit(spec || {});
  window.pokerSelectedPackStats = () => reelSamples.packStats();
} catch {
  /* non-browser */
}
