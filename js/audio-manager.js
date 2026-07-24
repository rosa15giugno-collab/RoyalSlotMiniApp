/**
 * Synthetic Web Audio API — no external files, no loops.
 */

const STORAGE_KEY = 'royalSlotAudioEnabled';

export class AudioManager {
  constructor(options = {}) {
    this.masterVolume = options.masterVolume ?? 0.32;
    this._ctx = null;
    this._unlocked = false;
    this._enabled = this._readEnabledPreference();
  }

  _readEnabledPreference() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === null) return true;
      return stored === 'true';
    } catch {
      return true;
    }
  }

  isEnabled() {
    return this._enabled;
  }

  setEnabled(value) {
    this._enabled = Boolean(value);
    try {
      localStorage.setItem(STORAGE_KEY, String(this._enabled));
    } catch {
      /* ignore storage errors */
    }
  }

  unlock() {
    if (this._unlocked) return true;

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return false;

    try {
      this._ctx = new AudioCtx();
      this._unlocked = true;
      if (this._ctx.state === 'suspended') {
        this._ctx.resume().catch(() => {});
      }
      return true;
    } catch {
      this._ctx = null;
      return false;
    }
  }

  _getContext() {
    if (!this._unlocked || !this._ctx) return null;
    if (this._ctx.state === 'suspended') {
      this._ctx.resume().catch(() => {});
    }
    return this._ctx;
  }

  _now() {
    const ctx = this._getContext();
    return ctx ? ctx.currentTime : 0;
  }

  _safeDisconnect(node) {
    try {
      if (node && typeof node.disconnect === 'function') {
        node.disconnect();
      }
    } catch {
      /* node may already be disconnected */
    }
  }

  _disconnectNodes(...nodes) {
    nodes.forEach((node) => this._safeDisconnect(node));
  }

  _scheduleTone({
    frequency,
    type = 'sine',
    startAt,
    duration,
    volume = 1,
    attack = 0.008,
    release = 0.06,
    endFrequency = null,
  }) {
    if (!this._enabled) return;

    const ctx = this._getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const peak = this.masterVolume * volume;
    const stopAt = startAt + duration + release + 0.02;

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, startAt);

    if (endFrequency !== null) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(endFrequency, 1),
        startAt + duration,
      );
    }

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.linearRampToValueAtTime(peak, startAt + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration + release);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.onended = () => {
      this._disconnectNodes(osc, gain);
    };

    osc.start(startAt);
    osc.stop(stopAt);
  }

  _scheduleNoise({ startAt, duration, volume = 1, filterFreq = 1200 }) {
    if (!this._enabled) return;

    const ctx = this._getContext();
    if (!ctx) return;

    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const peak = this.masterVolume * volume * 0.35;
    const stopAt = startAt + duration + 0.02;

    source.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = 0.8;

    gain.gain.setValueAtTime(peak, startAt);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    source.onended = () => {
      this._disconnectNodes(source, filter, gain);
    };

    source.start(startAt);
    source.stop(stopAt);
  }

  playClick() {
    const t = this._now();
    this._scheduleTone({ frequency: 880, duration: 0.04, volume: 0.45, startAt: t });
    this._scheduleTone({ frequency: 1320, duration: 0.03, volume: 0.2, startAt: t + 0.01 });
  }

  playSpinStart() {
    const t = this._now();
    this._scheduleTone({
      frequency: 220,
      endFrequency: 620,
      type: 'triangle',
      duration: 0.14,
      volume: 0.55,
      startAt: t,
    });
    this._scheduleNoise({ startAt: t, duration: 0.1, volume: 0.35, filterFreq: 900 });
  }

  playReelStop(reelIndex = 0) {
    const t = this._now();
    const baseFreq = 320 - reelIndex * 40;

    this._scheduleTone({
      frequency: baseFreq,
      endFrequency: baseFreq * 0.72,
      type: 'square',
      duration: 0.07,
      volume: 0.42,
      attack: 0.004,
      release: 0.05,
      startAt: t,
    });
    this._scheduleTone({
      frequency: baseFreq * 1.5,
      duration: 0.05,
      volume: 0.18,
      startAt: t + 0.01,
    });
  }

  playWinNormal() {
    const t = this._now();
    const notes = [523.25, 659.25, 783.99];

    notes.forEach((freq, index) => {
      this._scheduleTone({
        frequency: freq,
        type: 'triangle',
        duration: 0.16,
        volume: 0.5,
        startAt: t + index * 0.1,
      });
    });
  }

  playBigWin() {
    const t = this._now();
    const notes = [392, 523.25, 659.25, 783.99, 987.77];

    notes.forEach((freq, index) => {
      this._scheduleTone({
        frequency: freq,
        type: 'triangle',
        duration: 0.2,
        volume: 0.55,
        startAt: t + index * 0.09,
      });
      this._scheduleTone({
        frequency: freq * 2,
        type: 'sine',
        duration: 0.12,
        volume: 0.15,
        startAt: t + index * 0.09 + 0.04,
      });
    });

    this._scheduleNoise({ startAt: t + 0.15, duration: 0.35, volume: 0.25, filterFreq: 1800 });
  }

  playLoss() {
    const t = this._now();
    this._scheduleTone({
      frequency: 180,
      endFrequency: 140,
      type: 'sine',
      duration: 0.08,
      volume: 0.12,
      startAt: t,
    });
  }
}

export const audio = new AudioManager();
