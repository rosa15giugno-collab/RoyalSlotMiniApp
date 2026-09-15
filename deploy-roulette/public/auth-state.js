/**
 * Pure helpers for Roulette Telegram auth UI — testable without DOM.
 */

export function hasInitData(initData) {
  return Boolean(initData && String(initData).trim());
}

export function balanceLabel(balance, authenticated) {
  if (!authenticated) return '—';
  if (balance == null) return '—';
  return null;
}

export function errorCodeFromHttp(status, detail, knownCodes) {
  if (status === 401 || status === 403) return 'AUTH_ERROR';
  let key = detail;
  if (detail && typeof detail === 'object' && typeof detail.detail === 'string') {
    key = detail.detail;
  }
  if (typeof key === 'string' && knownCodes?.[key]) return key;
  // Recognized HTTP failure that is not auth / known business code.
  if (Number(status) >= 400 && Number(status) < 600) return 'API_ERROR';
  return 'NETWORK_ERROR';
}

export function isRecoverableNetworkError(error) {
  if (!error) return true;
  if (error.code === 'AUTH_ERROR') return false;
  if (error.code === 'API_ERROR') return false;
  if (error.httpStatus === 401 || error.httpStatus === 403) return false;
  if (error.code && error.code !== 'NETWORK_ERROR' && error.code !== 'CONNECTION_INTERRUPTED') {
    return false;
  }
  return !error.code || error.code === 'NETWORK_ERROR' || error.code === 'CONNECTION_INTERRUPTED';
}

export function controlsDisabled({ authenticated, busy, hasSelection }) {
  return {
    spin: !authenticated || busy || !hasSelection,
    bets: !authenticated || busy,
    amounts: !authenticated || busy,
  };
}
