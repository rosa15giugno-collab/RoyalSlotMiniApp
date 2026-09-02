import { CONFIG } from './config.js?v=2';
import {
  allowsLocalDemo,
  getMiniappSession,
  isProductionBackend,
  miniappAuthHeaders,
} from './miniapp-access.js?v=2';

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

  /**
   * Call the Casino API only with real Telegram initData and valid session.
   */
  _canUseApi(appId = CONFIG.miniapp.appId) {
    if (!CONFIG.api.baseUrl || !this._hasTelegramAuth()) return false;
    if (isProductionBackend()) return Boolean(getMiniappSession());
    if (allowsLocalDemo()) return true;
    return Boolean(getMiniappSession());
  }

  _apiHeaders(appId = CONFIG.miniapp.appId) {
    return miniappAuthHeaders(appId, this);
  }

  _hasTelegramAuth() {
    return Boolean(this.getInitData());
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
  async fetchProfile(appId = CONFIG.miniapp.appId) {
    const localUsername = this.getUsername();
    const base = CONFIG.api.baseUrl;
    if (!base || !this._canUseApi(appId)) {
      if (allowsLocalDemo() && !isProductionBackend()) {
        return { username: localUsername, demo: true };
      }
      throw new Error('ACCESS_DENIED');
    }

    const response = await fetch(`${base}${CONFIG.api.endpoints.profile}`, {
      method: 'GET',
      headers: this._apiHeaders(appId),
    });

    if (response.status === 403) throw new Error('ACCESS_DENIED');
    if (!response.ok) throw new Error('Profile fetch failed');
    const data = await response.json();
    const balance = typeof data.balance === 'number' ? data.balance : data.chips;

    return {
      username: data.username ? `@${String(data.username).replace(/^@/, '')}` : localUsername,
      balance,
      demo: false,
    };
  }

  notifyPlayer(message) {
    const text = String(message || '').trim();
    if (!text) return;
    if (this.webApp?.showAlert) {
      this.webApp.showAlert(text);
    }
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
  async fetchBalance(appId = CONFIG.miniapp.appId) {
    const base = CONFIG.api.baseUrl;
    if (!base || !this._canUseApi(appId)) {
      if (allowsLocalDemo() && !isProductionBackend()) {
        return { balance: CONFIG.demo.initialBalance, demo: true };
      }
      throw new Error('ACCESS_DENIED');
    }

    const response = await fetch(`${base}${CONFIG.api.endpoints.balance}`, {
      method: 'GET',
      headers: this._apiHeaders(appId),
    });

    if (response.status === 403) throw new Error('ACCESS_DENIED');
    if (!response.ok) throw new Error('Balance fetch failed');
    const data = await response.json();
    return {
      balance: typeof data.balance === 'number' ? data.balance : data.chips,
      daily_bonus_active: Boolean(data.daily_bonus_active),
      daily_bonus_multiplier: Number(data.daily_bonus_multiplier) || 1,
      daily_wins_remaining: Number(data.daily_wins_remaining) || 0,
      profile_level_multiplier: Number(data.profile_level_multiplier) || 1,
      payout_multiplier: Number(data.payout_multiplier) || 1,
      demo: false,
    };
  }

  /**
   * Server-authoritative spin. Same reference_id is reused for HTTP retries
   * of this request only — a new SPIN click must generate a new UUID.
   */
  async requestSpin(bet, referenceId, appId = CONFIG.miniapp.appId) {
    const base = CONFIG.api.baseUrl;
    if (!base || !this._canUseApi(appId)) return null;

    const response = await fetch(`${base}${CONFIG.api.endpoints.spin}`, {
      method: 'POST',
      headers: this._apiHeaders(appId),
      body: JSON.stringify({ bet, reference_id: referenceId }),
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 403) {
      const err = new Error('ACCESS_DENIED');
      err.code = 'access_denied';
      throw err;
    }

    if (response.status === 400) {
      const detail = data.detail;
      const errorCode = detail && typeof detail === 'object' ? detail.error : null;
      const message = typeof detail === 'string' ? detail : detail?.message;
      if (errorCode === 'insufficient_balance' || message === 'Insufficient balance') {
        const err = new Error('INSUFFICIENT_BALANCE');
        err.code = 'insufficient_balance';
        err.chips = typeof detail?.chips === 'number' ? detail.chips : null;
        throw err;
      }
    }

    if (!response.ok) throw new Error('Spin request failed');

    return {
      bet: data.bet,
      grid: data.grid,
      winningLines: data.winning_lines ?? [],
      winAmount: data.win_amount ?? data.final_win ?? 0,
      baseWin: data.base_win,
      payoutMultiplier: Number(data.payout_multiplier) || 1,
      bonusApplied: Boolean(data.bonus_applied),
      bonusExtra: Number(data.bonus_extra) || 0,
      dailyApplied: Boolean(data.daily_applied),
      dailyWinsRemaining: Number(data.daily_wins_remaining) || 0,
      dailyBonusActive: Boolean(data.daily_bonus_active),
      dailyBonusMultiplier: Number(data.daily_bonus_multiplier) || 1,
      balanceBefore: data.balance_before,
      balanceAfter: data.balance_after,
      referenceId: data.reference_id,
      replayed: Boolean(data.replayed),
      xpAwarded: data.xp_awarded,
      vipLevel: Number(data.vip_level) || 0,
      vipSecondChanceTriggered: Boolean(data.vip_second_chance_triggered),
      vipSecondChanceResultUsed: Boolean(data.vip_second_chance_result_used),
    };
  }

  /**
   * PokerSlot server-authoritative round. Full payload — the client animates
   * it and must not re-roll Mystery, Free Spins, or wallet math.
   */
  async requestPokerSpin(bet, referenceId, appId = 'poker') {
    const base = CONFIG.api.baseUrl;
    if (!base || !this._canUseApi(appId)) return null;

    const response = await fetch(`${base}${CONFIG.api.endpoints.pokerSpin}`, {
      method: 'POST',
      headers: this._apiHeaders(appId),
      body: JSON.stringify({ bet, reference_id: referenceId }),
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 403) {
      const err = new Error('ACCESS_DENIED');
      err.code = 'access_denied';
      throw err;
    }

    if (response.status === 400) {
      const detail = data.detail;
      const errorCode = detail && typeof detail === 'object' ? detail.error : null;
      const message = typeof detail === 'string' ? detail : detail?.message;
      if (errorCode === 'insufficient_balance' || message === 'Insufficient balance') {
        const err = new Error('INSUFFICIENT_BALANCE');
        err.code = 'insufficient_balance';
        err.chips = typeof detail?.chips === 'number' ? detail.chips : null;
        throw err;
      }
    }

    if (!response.ok) throw new Error('Poker spin request failed');
    return data;
  }
}
