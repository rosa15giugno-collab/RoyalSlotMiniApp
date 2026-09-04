/**
 * Central configuration — edit here for backend wiring and game tuning.
 */
export const CONFIG = {
  appName: 'Royal Slot by Rosa',

  /** Future Python backend base URL (leave empty in demo mode). */
  api: {
    baseUrl: 'https://casinobot-stabile-production-2a50.up.railway.app',
    endpoints: {
      balance: '/api/balance',
      spin: '/api/slot/spin',
      pokerSpin: '/api/poker/spin',
      profile: '/api/user/profile',
      blackjackStart: '/api/blackjack/start',
      blackjackHit: '/api/blackjack/hit',
      blackjackStand: '/api/blackjack/stand',
      blackjackCurrent: '/api/blackjack/current',
    },
  },

  demo: {
    initialBalance: 5000,
    /** Solo simulazione locale — sostituito automaticamente da Telegram. */
    testUsername: '@Rosa',
  },

  bet: {
    default: 250,
    presets: [250, 500, 1000],
  },

  /**
   * FASE 6 — display-only line scale. Must match api/slot_engine.py LINE_SCALE_BY_BET.
   * Server remains authoritative for credited chips.
   */
  lineScaleByBet: {
    250: 1.655634,
    500: 0.827817,
    1000: 0.620863,
  },

  assets: {
    symbolsPath: 'assets/symbols',
  },

  reels: {
    count: 3,
    visibleRows: 3,
    /** CSS --symbol-height in px; keep in sync with style.css */
    symbolHeight: 96,
    spinDurationMs: 1800,
    reelStopDelayMs: 420,
    extraSpins: 6,
  },

  symbols: [
    { id: 'bar', weight: 8, payout: 25 },
    { id: 'seven', weight: 3, payout: 75 },
    { id: 'horseshoe', weight: 20, payout: 5 },
    { id: 'cherry', weight: 22, payout: 5 },
    { id: 'jollypoker', weight: 18, payout: 8 },
    { id: 'crown', weight: 5, payout: 40 },
    { id: 'bell', weight: 16, payout: 10 },
    { id: 'star', weight: 12, payout: 15 },
    { id: 'diamond', weight: 2, payout: 150 },
  ],

  ui: {
    bigWinThreshold: 500,
    bigWinOverlayMs: 2200,
  },
};
