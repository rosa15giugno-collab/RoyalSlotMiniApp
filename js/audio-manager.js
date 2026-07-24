/**
 * Royal Slot — professional SFX via royalty-free MP3 assets.
 */

const STORAGE_KEY = 'royalSlotAudioEnabled';

const SOUND_FILES = {
  click: 'assets/audio/button-click.mp3',
  spinStart: 'assets/audio/spin-start.mp3',
  reelStop: 'assets/audio/reel-stop.mp3',
  win: 'assets/audio/win.mp3',
  bigWin: 'assets/audio/big-win.mp3',
  lose: 'assets/audio/lose.mp3',
};

export class AudioManager {
  constructor(options = {}) {
    this.masterVolume = options.masterVolume ?? 0.55;
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

    this._unlocked = true;

    try {
      const probe = new Audio(SOUND_FILES.click);
      probe.volume = 0.001;
      probe.play()
        .then(() => {
          probe.pause();
          probe.currentTime = 0;
        })
        .catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  _play(src, { volume = 1, playbackRate = 1 } = {}) {
    if (!this._enabled) return;

    try {
      const clip = new Audio(src);
      clip.volume = Math.min(1, Math.max(0, this.masterVolume * volume));
      clip.playbackRate = playbackRate;
      clip.play().catch(() => {});
    } catch {
      /* silent fallback if audio is unavailable */
    }
  }

  playClick() {
    this._play(SOUND_FILES.click, { volume: 0.75 });
  }

  playSpinStart() {
    this._play(SOUND_FILES.spinStart, { volume: 0.85 });
  }

  playReelStop(reelIndex = 0) {
    const volumeSteps = [0.82, 0.92, 1];
    const rateSteps = [0.96, 1, 1.04];

    this._play(SOUND_FILES.reelStop, {
      volume: volumeSteps[reelIndex] ?? 0.92,
      playbackRate: rateSteps[reelIndex] ?? 1,
    });
  }

  playWinNormal() {
    this._play(SOUND_FILES.win, { volume: 0.9 });
  }

  playBigWin() {
    this._play(SOUND_FILES.bigWin, { volume: 1 });
  }

  playLoss() {
    this._play(SOUND_FILES.lose, { volume: 0.45 });
  }
}

export const audio = new AudioManager();
