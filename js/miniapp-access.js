/**
 * Mini App access gate — server-side session exchange.
 */
import { CONFIG } from './config.js?v=2';

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

const ACCESS_EXCHANGE_TIMEOUT_MS = 10000;

function logFrontendStep(step, detail = '') {
  const suffix = detail ? ` ${detail}` : '';
  console.info(`[MINIAPP FRONTEND] ${step}${suffix}`);
}

export async function establishMiniappAccess(telegram, appId) {
  const hasSdk = Boolean(window.Telegram?.WebApp);
  logFrontendStep(1, hasSdk ? 'init telegram ok' : 'init telegram missing');

  const initData = telegram.getInitData?.() ?? '';
  logFrontendStep(2, initData ? 'initData present' : 'initData missing');

  if (!hasSdk || !initData) {
    return allowsLocalDemo() ? AccessState.AUTHORIZED : AccessState.DENIED;
  }

  if (!CONFIG.api.baseUrl) {
    return allowsLocalDemo() ? AccessState.AUTHORIZED : AccessState.DENIED;
  }

  const url = `${CONFIG.api.baseUrl}${CONFIG.api.endpoints.accessSession}`;
  logFrontendStep(3, `start access exchange app=${appId}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ACCESS_EXCHANGE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': initData,
        'X-Miniapp-App': appId,
      },
      signal: controller.signal,
    });

    logFrontendStep(4, `response status=${response.status}`);

    if (response.status === 403) {
      sessionToken = null;
      return AccessState.DENIED;
    }

    if (!response.ok) {
      sessionToken = null;
      return AccessState.DENIED;
    }

    const data = await response.json();
    logFrontendStep(5, 'response parsed');

    sessionToken = data.session_token || null;
    logFrontendStep(6, sessionToken ? 'session token received' : 'session token missing');

    if (sessionToken) {
      logFrontendStep(7, `access authorized via=${data.authorized_via || 'unknown'}`);
      return AccessState.AUTHORIZED;
    }

    return AccessState.DENIED;
  } catch (error) {
    const reason = error?.name === 'AbortError' ? 'timeout' : 'network';
    logFrontendStep(4, `response error=${reason}`);
    sessionToken = null;
    return AccessState.DENIED;
  } finally {
    clearTimeout(timeoutId);
  }
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
