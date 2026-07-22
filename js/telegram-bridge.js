import { CONFIG } from './config.js';

/**
 * Telegram WebApp bridge — demo-safe, ready for Casino Bot integration.
 */
export class TelegramBridge {
  constructor() {
    this.webApp = window.Telegram?.WebApp ?? null;
    this.user = null;
  }

  init() {
    if (!this.webApp) {
      console.info('[RoyalSlot] Telegram WebApp SDK not detected — demo mode.');
      return;
    }

    this.webApp.ready();
    this.webApp.expand();
    this.webApp.setHeaderColor('#0a0a0f');
    this.webApp.setBackgroundColor('#0a0a0f');
    this.user = this.webApp.initDataUnsafe?.user ?? null;

    if (this.webApp.MainButton) {
      this.webApp.MainButton.hide();
    }
  }

  getInitData() {
    return this.webApp?.initData ?? '';
  }

  getUsername() {
    const user = this.user ?? this.webApp?.initDataUnsafe?.user ?? null;
    if (!user?.username) return null;
    return `@${user.username}`;
  }

  /**
   * Username per UI: Telegram reale se disponibile, altrimenti test in demo locale.
   */
  resolveUsername() {
    const telegramUsername = this.getUsername();
    if (telegramUsername) {
      return { username: telegramUsername, isTest: false };
    }

    if (!CONFIG.api.baseUrl && CONFIG.demo.testUsername) {
      return { username: CONFIG.demo.testUsername, isTest: true };
    }

    return { username: null, isTest: false };
  }

  /**
   * Future: fetch profile (username, balance) from Python backend.
   */
  async fetchProfile() {
    const localUsername = this.getUsername();
    const base = CONFIG.api.baseUrl;
    if (!base) {
      return { username: localUsername, demo: true };
    }

    const response = await fetch(`${base}${CONFIG.api.endpoints.profile}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': this.getInitData(),
      },
    });

    if (!response.ok) throw new Error('Profile fetch failed');
    const data = await response.json();
    const balance = typeof data.balance === 'number' ? data.balance : data.chips;

    return {
      username: data.username ? `@${String(data.username).replace(/^@/, '')}` : localUsername,
      balance,
      demo: false,
    };
  }

  haptic(type = 'light') {
    const impact = this.webApp?.HapticFeedback;
    if (!impact) return;

    if (type === 'success' && impact.notificationOccurred) {
      impact.notificationOccurred('success');
      return;
    }
    if (type === 'error' && impact.notificationOccurred) {
      impact.notificationOccurred('error');
      return;
    }
    if (impact.impactOccurred) {
      impact.impactOccurred(type === 'heavy' ? 'heavy' : 'light');
    }
  }

  /**
   * Future: fetch real chip balance from Python backend.
   */
  async fetchBalance() {
    const base = CONFIG.api.baseUrl;
    if (!base) {
      return { balance: CONFIG.demo.initialBalance, demo: true };
    }

    const response = await fetch(`${base}${CONFIG.api.endpoints.balance}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': this.getInitData(),
      },
    });

    if (!response.ok) throw new Error('Balance fetch failed');
    const data = await response.json();
    return {
      balance: typeof data.balance === 'number' ? data.balance : data.chips,
      demo: false,
    };
  }

  /**
   * Future: server-authoritative spin (recommended for production).
   */
  async requestSpin(bet) {
    const base = CONFIG.api.baseUrl;
    if (!base) return null;

    const response = await fetch(`${base}${CONFIG.api.endpoints.spin}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': this.getInitData(),
      },
      body: JSON.stringify({ bet }),
    });

    if (!response.ok) throw new Error('Spin request failed');
    const data = await response.json();

    return {
      bet: data.bet,
      grid: data.grid,
      winningLines: data.winning_lines ?? [],
      winAmount: data.win_amount ?? 0,
      balanceBefore: data.balance_before,
      balanceAfter: data.balance_after,
    };
  }
}
