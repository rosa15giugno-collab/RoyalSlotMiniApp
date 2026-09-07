/**
 * Pure helpers for Blackjack /current resume vs idle reset.
 * Keeps balance outside this module — caller must not clear chips.
 */

export function shouldResumeActiveRound(current) {
  return Boolean(current?.has_active_round && current.round);
}

/** Fields cleared when /current has no active round (balance untouched). */
export function idleRoundFields() {
  return {
    roundId: null,
    payload: null,
    pending: null,
    animating: false,
    ui: 'idle',
  };
}

/** Safe console payload — never includes initData. */
export function redactCurrentLog(current) {
  const round = current?.round;
  const id = round?.round_id != null ? String(round.round_id) : '';
  return {
    has_active_round: Boolean(current?.has_active_round),
    status: round?.status ?? null,
    round_id: id ? `${id.slice(0, 8)}…` : null,
    bet: round?.bet ?? null,
  };
}
