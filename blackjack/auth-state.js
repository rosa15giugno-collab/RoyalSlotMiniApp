/**
 * Pure helpers for Blackjack Telegram auth UI — testable without DOM.
 */

export function hasInitData(initData) {
  return Boolean(initData && String(initData).trim());
}

export function balanceLabel(balance, authenticated) {
  if (!authenticated) return '—';
  if (balance == null) return '—';
  return null; // caller formats chips
}

/** Map HTTP failures: 401/403 → AUTH_ERROR; never NETWORK_ERROR. */
export function errorCodeFromHttp(status, detail, knownCodes) {
  if (status === 401 || status === 403) return 'AUTH_ERROR';
  if (typeof detail === 'string' && knownCodes?.[detail]) return detail;
  return 'NETWORK_ERROR';
}

export function isRecoverableNetworkError(error) {
  if (!error) return true;
  if (error.code === 'AUTH_ERROR') return false;
  if (error.httpStatus === 401 || error.httpStatus === 403) return false;
  if (error.code && error.code !== 'NETWORK_ERROR' && error.code !== 'CONNECTION_INTERRUPTED') {
    return false;
  }
  return !error.code || error.code === 'NETWORK_ERROR' || error.code === 'CONNECTION_INTERRUPTED';
}

export function controlsDisabled({ authenticated, busy, playing }) {
  return {
    deal: !authenticated || busy || playing,
    hit: !authenticated || busy || !playing,
    stand: !authenticated || busy || !playing,
    bets: !authenticated || busy || playing,
  };
}
