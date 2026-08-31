/**
 * PokerSlot reel / SFX sample loader — local WAV/MP3 only.
 * Does not pick a definitive sound. Does not fetch remote/CDN assets.
 * Pack selected-v1 is POKERSLOT_SELECTED_V1 = APPROVATO DALL'UTENTE (frozen 2026-08-31).
 * Missing files: silence + DEV warning. No synth fallback in file/pack mode.
 */

export const REEL_AUDIO_DIR = '../assets/royal-poker/audio/';
export const REEL_KIT_URL = `${REEL_AUDIO_DIR}reel-kit.json`;
export const REEL_FILE_STORAGE = 'pokerSlotReelFileKit';

/** POKERSLOT_SELECTED_V1 — APPROVATO DALL'UTENTE. Frozen; do not retune without a new request. */
export const SELECTED_PACK_ID = 'selected-v1';
export const SELECTED_V1_FILES = Object.freeze({
  spin: 'spin-button-selected.wav',
  start: 'reel-start-selected.wav',
  loop: 'reel-loop-selected.wav',
  stop: 'reel-stop-selected.wav',
  final: 'reel-stop-final-selected.wav',
  lineWin: 'line-win-selected.wav',
  mysteryOpen: 'mystery-open-selected.wav',
  cardPick: 'card-pick-selected.wav',
  cardFlip: 'card-flip-selected.wav',
  mysteryWin: 'mystery-win-selected.wav',
  scatter: 'scatter-selected.wav',
  fsStart: 'free-spin-start-selected.wav',
  fsLoop: 'free-spin-loop-selected.wav',
  fsEnd: 'free-spin-end-selected.wav',
  goodWin: 'good-win-selected.wav',
  bigWin: 'big-win-selected.wav',
  megaWin: 'mega-win-selected.wav',
});

const PACK_SLOTS = Object.keys(SELECTED_V1_FILES);
const PACK_PRELOAD = Object.freeze([
  ['spin', 'start', 'loop', 'stop', 'final'],
  ['lineWin'],
  ['mysteryOpen', 'cardPick', 'cardFlip', 'mysteryWin', 'scatter', 'fsStart', 'fsLoop', 'fsEnd'],
  ['goodWin', 'bigWin', 'megaWin'],
]);

const EXTS = ['.wav', '.mp3'];
const SLOTS = ['spin', 'start', 'loop', 'stop', 'final'];
const STOP_VAR = Object.freeze([
  { gain: 0.90, rate: 1.02 },
  { gain: 0.94, rate: 0.99 },
  { gain: 0.97, rate: 1.01 },
  { gain: 1.00, rate: 0.98 },
  { gain: 1.00, rate: 0.96 },
]);

function isLocalHost() {
  try {
    const host = String(window.location.hostname || '');
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  } catch {
    return false;
  }
}

function letterFrom(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  const m = s.match(/^[abc]$/i);
  return m ? m[0].toUpperCase() : '';
}

function parseChoice(value) {
  const s = String(value || '').trim();
  if (!s) return { letter: '', file: '' };
  if (/\.(wav|mp3)$/i.test(s)) return { letter: '', file: s };
  const letter = letterFrom(s);
  if (letter) return { letter, file: '' };
  return { letter: '', file: s };
}

function parsePackId(value) {
  const p = String(value || '').trim().toLowerCase();
  if (p === 'off' || p === 'none' || p === '0') return '';
  if (p === 'selected-v1' || p === 'pokerslot_selected_v1' || p === 'v1') {
    return SELECTED_PACK_ID;
  }
  return '';
}

function synthTestActive() {
  try {
    return Boolean(String(new URLSearchParams(window.location.search).get('audioTest') || '').trim());
  } catch {
    return false;
  }
}

function readUrlKit() {
  try {
    const q = new URLSearchParams(window.location.search);
    const filesFlag = String(q.get('audioFiles') || '').trim();
    const packOff = String(q.get('soundPack') || '').trim().toLowerCase() === 'off';
    let pack = parsePackId(q.get('soundPack'));
    // Product default: approved POKERSLOT_SELECTED_V1. Query flag is no longer required
    // (Telegram Mini App opens /poker/ without DEV params). Synth tests opt out.
    if (!packOff && !pack && !synthTestActive()) {
      pack = SELECTED_PACK_ID;
    }
    const enabled = !packOff && (
      filesFlag === '1'
      || filesFlag.toLowerCase() === 'true'
      || Boolean(pack)
      || SLOTS.some((slot) => q.has(slot))
    );
    return {
      enabled,
      pack,
      spin: parseChoice(q.get('spin')),
      start: parseChoice(q.get('start')),
      loop: parseChoice(q.get('loop')),
      stop: parseChoice(q.get('stop')),
      final: parseChoice(q.get('final')),
    };
  } catch {
    return emptyKit();
  }
}

function emptyKit() {
  return {
    enabled: false,
    pack: '',
    spin: { letter: '', file: '' },
    start: { letter: '', file: '' },
    loop: { letter: '', file: '' },
    stop: { letter: '', file: '' },
    final: { letter: '', file: '' },
  };
}

function readStoredKit() {
  if (!isLocalHost()) return emptyKit();
  try {
    const raw = localStorage.getItem(REEL_FILE_STORAGE);
    if (!raw) return emptyKit();
    const data = JSON.parse(raw);
    return {
      enabled: true,
      pack: parsePackId(data.pack),
      spin: parseChoice(data.spin),
      start: parseChoice(data.start),
      loop: parseChoice(data.loop),
      stop: parseChoice(data.stop),
      final: parseChoice(data.final),
    };
  } catch {
    return emptyKit();
  }
}

function mergeKit(base, extra) {
  const out = { ...base };
  SLOTS.forEach((slot) => {
    const choice = extra[slot];
    if (!choice) return;
    if (choice.file || choice.letter) out[slot] = choice;
  });
  if (extra.enabled) out.enabled = true;
  if (extra.pack) out.pack = extra.pack;
  return out;
}

function stemsFor(slot, letter, numberedStop) {
  const L = String(letter || '').toLowerCase();
  if (slot === 'spin') {
    return L ? [`spin-${L}`, 'spin-button'] : ['spin-button'];
  }
  if (slot === 'start') {
    return L ? [`start-${L}`, `reel-start-${L}`, 'reel-start'] : ['reel-start'];
  }
  if (slot === 'loop') {
    return L ? [`loop-${L}`, 'reel-loop'] : ['reel-loop'];
  }
  if (slot === 'stop') {
    if (numberedStop) {
      return L
        ? [`reel-stop-${numberedStop}`, `stop-${L}`, 'reel-stop', 'stop']
        : [`reel-stop-${numberedStop}`, 'reel-stop', 'stop'];
    }
    return L ? [`stop-${L}`, 'reel-stop', 'reel-stop-1'] : ['reel-stop-1', 'reel-stop', 'stop'];
  }
  if (slot === 'final') {
    return L ? [`final-${L}`, 'reel-stop-final'] : ['reel-stop-final'];
  }
  return [];
}

export class ReelSampleBank {
  constructor() {
    this._kit = mergeKit(emptyKit(), readUrlKit());
    this._buffers = new Map();
    this._missing = new Set();
    this._ok = new Set();
    this._ready = false;
    this._loading = null;
    this._preloadMs = 0;
    this._publish();
  }

  get kit() {
    return this._kit;
  }

  isSelectedPack() {
    return this._kit.pack === SELECTED_PACK_ID;
  }

  missingPackFiles() {
    if (!this.isSelectedPack()) return [];
    return PACK_SLOTS
      .filter((slot) => !this._buffers.has(slot))
      .map((slot) => SELECTED_V1_FILES[slot]);
  }

  packStats() {
    let pcmBytes = 0;
    let heaviest = { slot: '', bytes: 0, duration: 0 };
    this._buffers.forEach((buffer, slot) => {
      const bytes = buffer.length * buffer.numberOfChannels * 2;
      pcmBytes += bytes;
      if (bytes > heaviest.bytes) {
        heaviest = { slot, bytes, duration: buffer.duration };
      }
    });
    return {
      pack: this._kit.pack || '',
      files: this._buffers.size,
      pcmBytes,
      preloadMs: this._preloadMs,
      heaviest,
      missing: this.missingPackFiles(),
    };
  }

  snapshot() {
    const k = this._kit;
    return {
      pack: k.pack || '',
      spin: k.spin.file || k.spin.letter || '',
      start: k.start.file || k.start.letter || '',
      loop: k.loop.file || k.loop.letter || '',
      stop: k.stop.file || k.stop.letter || '',
      final: k.final.file || k.final.letter || '',
    };
  }

  setKit(partial = {}) {
    const next = { ...this._kit, enabled: true };
    if (partial.pack != null) next.pack = parsePackId(partial.pack);
    SLOTS.forEach((slot) => {
      if (partial[slot] == null) return;
      next[slot] = parseChoice(partial[slot]);
    });
    this._kit = next;
    this._ready = false;
    this._buffers = new Map();
    if (isLocalHost()) {
      try {
        localStorage.setItem(REEL_FILE_STORAGE, JSON.stringify(this.snapshot()));
      } catch {
        /* ignore */
      }
    }
    this._publish();
  }

  _publish() {
    try {
      const snap = this.snapshot();
      document.body.dataset.reelFiles = this._kit.enabled ? '1' : '';
      document.body.dataset.soundPack = snap.pack;
      document.body.dataset.reelSpin = snap.spin;
      document.body.dataset.reelStart = snap.start;
      document.body.dataset.reelLoop = snap.loop;
      document.body.dataset.reelStop = snap.stop;
      document.body.dataset.reelFinal = snap.final;
    } catch {
      /* ignore */
    }
  }

  async loadConfig() {
    let kit = emptyKit();
    try {
      const res = await fetch(REEL_KIT_URL, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const fromJson = {
          enabled: SLOTS.some((slot) => String(data[slot] || '').trim()),
          pack: '',
          spin: parseChoice(data.spin),
          start: parseChoice(data.start),
          loop: parseChoice(data.loop),
          stop: parseChoice(data.stop),
          final: parseChoice(data.final),
        };
        kit = mergeKit(kit, fromJson);
      }
    } catch {
      /* folder empty / no kit */
    }
    kit = mergeKit(kit, readStoredKit());
    kit = mergeKit(kit, readUrlKit());
    if (readUrlKit().enabled) kit.enabled = true;
    if (kit.pack === SELECTED_PACK_ID) kit.enabled = true;
    this._kit = kit;
    this._publish();
    return kit;
  }

  async prepare(ctx) {
    if (!ctx) return;
    if (this._loading) return this._loading;
    this._loading = this._prepareInner(ctx);
    try {
      await this._loading;
    } finally {
      this._loading = null;
    }
  }

  async _prepareInner(ctx) {
    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    await this.loadConfig();
    if (!this._kit.enabled) {
      this._ready = true;
      this._preloadMs = 0;
      return;
    }
    if (this.isSelectedPack()) {
      await this._prepareSelectedPack(ctx);
    } else {
      const jobs = [
        this._loadSlot(ctx, 'spin'),
        this._loadSlot(ctx, 'start'),
        this._loadSlot(ctx, 'loop'),
        this._loadSlot(ctx, 'stop'),
        this._loadSlot(ctx, 'final'),
      ];
      if (!this._kit.stop.letter && !this._kit.stop.file) {
        jobs.push(
          this._loadSlot(ctx, 'stop', 1),
          this._loadSlot(ctx, 'stop', 2),
          this._loadSlot(ctx, 'stop', 3),
          this._loadSlot(ctx, 'stop', 4),
        );
      }
      await Promise.all(jobs);
    }
    const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    this._preloadMs = Math.round(t1 - t0);
    this._ready = true;
    this._warnMissingPack();
  }

  async _prepareSelectedPack(ctx) {
    for (const batch of PACK_PRELOAD) {
      await Promise.all(batch.map((slot) => this._loadPackFile(ctx, slot)));
    }
  }

  async _loadPackFile(ctx, slot) {
    const name = SELECTED_V1_FILES[slot];
    if (!name) return;
    const url = `${REEL_AUDIO_DIR}${name}`;
    const buffer = await this._fetchDecode(ctx, url);
    if (buffer) this._buffers.set(slot, buffer);
  }

  _warnMissingPack() {
    if (!this.isSelectedPack()) return;
    const missing = this.missingPackFiles();
    if (!missing.length) {
      const stats = this.packStats();
      console.info('[PokerSlot][audio] POKERSLOT_SELECTED_V1 ready', stats);
      return;
    }
    console.warn(
      '[PokerSlot][audio] POKERSLOT_SELECTED_V1 missing (silence, no synth fallback):',
      missing,
    );
  }

  buffer(slot, numberedStop) {
    const key = this._key(slot, numberedStop);
    return this._buffers.get(key) || null;
  }

  hasAny() {
    return this._buffers.size > 0;
  }

  stopVariation(index) {
    return STOP_VAR[index] || STOP_VAR[0];
  }

  _key(slot, numberedStop) {
    return numberedStop ? `${slot}-${numberedStop}` : slot;
  }

  async _loadSlot(ctx, slot, numberedStop) {
    const choice = this._kit[slot] || { letter: '', file: '' };
    const urls = [];
    if (choice.file) {
      urls.push(choice.file.includes('/') ? choice.file : `${REEL_AUDIO_DIR}${choice.file}`);
    }
    stemsFor(slot, choice.letter, numberedStop).forEach((stem) => {
      EXTS.forEach((ext) => urls.push(`${REEL_AUDIO_DIR}${stem}${ext}`));
    });
    for (const url of urls) {
      const buffer = await this._fetchDecode(ctx, url);
      if (buffer) {
        this._buffers.set(this._key(slot, numberedStop), buffer);
        return;
      }
    }
  }

  async _fetchDecode(ctx, url) {
    if (this._missing.has(url)) return null;
    try {
      let ok = false;
      try {
        const head = await fetch(url, { method: 'HEAD', cache: 'no-store' });
        ok = head.ok;
        if (!ok && head.status !== 405 && head.status !== 501) {
          this._missing.add(url);
          return null;
        }
      } catch {
        ok = true;
      }
      if (!ok) {
        this._missing.add(url);
        return null;
      }
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        this._missing.add(url);
        return null;
      }
      const raw = await res.arrayBuffer();
      const buffer = await ctx.decodeAudioData(raw.slice(0));
      this._ok.add(url);
      return buffer;
    } catch {
      this._missing.add(url);
      return null;
    }
  }
}

export const reelSamples = new ReelSampleBank();
