/**
 * INTEGER wallet settlement — not a math-pack recalibration.
 * MATH_V4 / V5 / V6 stay full-precision float internally.
 *
 * Real Casino wallet is INTEGER chips. Apply this rule only at an actual
 * credit boundary (paid line+scatter, Mystery, each Free Spin line+scatter).
 * Do not round multipliers, per-line wins, or intermediate feature totals.
 *
 * When Economy backend is wired, replace this module — keep the same call sites.
 */

export const WALLET_SETTLEMENT = Object.freeze({
  id: 'chips-integer-v1',
  rule: 'Math.round once per real credit event',
  note: 'Not MATH_V6. Float math is unchanged; this is the accounting edge.',
});

/**
 * Convert a non-negative mathematical payout into wallet Chips.
 * @param {number} amount
 * @returns {number} integer >= 0
 */
export function toWalletChips(amount) {
  if (!Number.isFinite(amount)) {
    throw new TypeError(`toWalletChips: amount must be a finite number, got ${amount}`);
  }
  if (amount < 0) {
    throw new RangeError(`toWalletChips: amount must be >= 0, got ${amount}`);
  }
  return Math.round(amount);
}

/**
 * Mirror the live game's credit events for one paid round (option B).
 * Paid spin credits line+scatter as one amount; Mystery is a separate credit;
 * each Free Spin credits its own line+scatter. Mystery is not drawn on FS.
 *
 * `once` is option A (round the whole feature total) — reference only.
 */
export function walletCreditsForRound(round) {
  const base = round?.baseSettle || {};
  const paidLineScatter = toWalletChips(
    (base.lineReturn || 0) + (base.scatterReturn || 0),
  );
  const mystery = toWalletChips(base.bonusReturn || 0);
  let freeSpins = 0;
  const spins = round?.freeSpins || [];
  for (let i = 0; i < spins.length; i += 1) {
    const settled = spins[i].settled || {};
    freeSpins += toWalletChips(
      (settled.lineReturn || 0) + (settled.scatterReturn || 0),
    );
  }
  return {
    paidLineScatter,
    mystery,
    freeSpins,
    total: paidLineScatter + mystery + freeSpins,
    once: toWalletChips(round?.totalRoundReturn || 0),
  };
}
