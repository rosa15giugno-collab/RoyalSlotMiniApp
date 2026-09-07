/**
 * Blackjack V2 audio hooks — architecture only.
 * No remote downloads. No copyrighted packs.
 * Wire real local files later via AUDIO_FILES paths.
 *
 * Events:
 *   deal-card | card-flip | chip-bet | hit | stand |
 *   win | blackjack | push | lose | bust
 */

/** @type {Record<string, string | null>} */
export const AUDIO_FILES = {
  'deal-card': null,
  'card-flip': null,
  'chip-bet': null,
  hit: null,
  stand: null,
  win: null,
  blackjack: null,
  push: null,
  lose: null,
  bust: null,
};

const cache = new Map();

function resolveUrl(key) {
  return AUDIO_FILES[key] || null;
}

export function playSfx(key) {
  const url = resolveUrl(key);
  if (!url) return;
  try {
    let audio = cache.get(key);
    if (!audio) {
      audio = new Audio(url);
      audio.preload = 'auto';
      cache.set(key, audio);
    }
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  } catch {
    /* optional audio */
  }
}

export const BlackjackAudio = {
  dealCard: () => playSfx('deal-card'),
  cardFlip: () => playSfx('card-flip'),
  chipBet: () => playSfx('chip-bet'),
  hit: () => playSfx('hit'),
  stand: () => playSfx('stand'),
  win: () => playSfx('win'),
  blackjack: () => playSfx('blackjack'),
  push: () => playSfx('push'),
  lose: () => playSfx('lose'),
  bust: () => playSfx('bust'),
};
