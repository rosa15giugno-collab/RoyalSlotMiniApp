/**
 * Mini App access gate — server-side session exchange.
 */
import { CONFIG } from './config.js';

export const AccessState = {
  AUTHENTICATING: 'authenticating',
  AUTHORIZED: 'authorized',
  DENIED: 'denied',
};

let sessionToken = null;

export function getMiniappSession() {
  return sessionToken;
}

export function isProductionBackend() {
  const base = String(CONFIG.api.baseUrl || '');
  if (!base) return false;
  return !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(base);
}

export function isLocalDevHost() {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

export function allowsLocalDemo() {
  return isLocalDevHost() && !isProductionBackend();
}

export async function establishMiniappAccess(telegram, appId) {
  const initData = telegram.getInitData?.() ?? '';
  const hasSdk = Boolean(window.Telegram?.WebApp);

  if (!hasSdk || !initData) {
    return allowsLocalDemo() ? AccessState.AUTHORIZED : AccessState.DENIED;
  }

  if (!CONFIG.api.baseUrl) {
    return allowsLocalDemo() ? AccessState.AUTHORIZED : AccessState.DENIED;
  }

  const response = await fetch(`${CONFIG.api.baseUrl}${CONFIG.api.endpoints.accessSession}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': initData,
      'X-Miniapp-App': appId,
    },
  });

  if (response.status === 403) {
    sessionToken = null;
    return AccessState.DENIED;
  }

  if (!response.ok) {
    sessionToken = null;
    return AccessState.DENIED;
  }

  const data = await response.json();
  sessionToken = data.session_token || null;
  return sessionToken ? AccessState.AUTHORIZED : AccessState.DENIED;
}

export function miniappAuthHeaders(appId, telegram) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Miniapp-App': appId,
  };
  const initData = telegram.getInitData?.() ?? '';
  if (initData) headers['X-Telegram-Init-Data'] = initData;
  if (sessionToken) headers['X-Miniapp-Session'] = sessionToken;
  return headers;
}
