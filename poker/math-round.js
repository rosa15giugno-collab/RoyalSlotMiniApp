/**
 * PokerSlot math paid-round player (offline sandbox only).
 * No DOM, no wallet, no frontend feature.
 *
 * V2: 3+ BONUS → 5 free spins (no retrigger).
 * V3: SCATTER 3/4/>=5 → 5/7/10 free spins (no retrigger).
 *     Scatter on free spins still pays; it does not award more spins.
 * V4: same scatter FS as V3 + Mystery BONUS D cash on the paid spin only.
 *     BONUS during free spins does not draw the mystery table.
 * V5: same as V4 except Mystery D chip scale and LINE_SCALE_RATIO_V5.
 * V6: V5 economy + optional active-payline subset; betPerLine = totalBet / N.
 *     During FS: scatter retrigger 3→+3 / 4→+5 / 5→+7 (max 2); Mystery BONUS may fire.
 */

import { evaluateGrid } from './engine.js';
import { PAYLINE_DEFINITIONS } from './paylines.js';
import {
  SIM_BET,
  assertSimGrid,
  isGuaranteedCashBonus,
  MAX_FS_RETRIGGERS,
  scatterFreeSpinsAwarded,
  scatterFsRetriggerAwarded,
  settleFsCashBonus,
  settleGuaranteedCashBonus,
  settleSimulatedSpin,
} from './math-config.js';

function resolveFeatureAward(pack, baseEval) {
  const cashTriggered = Boolean(
    isGuaranteedCashBonus(pack.bonusFeature) && baseEval.bonus.count >= 3,
  );

  if (pack.scatterFeature) {
    const awarded = scatterFreeSpinsAwarded(
      baseEval.scatter.count,
      pack.scatterFeature,
    );
    return {
      bonusTriggered: cashTriggered,
      scatterTriggered: awarded > 0,
      awarded,
      triggerScatterCount: baseEval.scatter.count,
    };
  }

  const feature = pack.bonusFeature;
  const bonusTriggered = Boolean(
    feature && feature.freeSpins && baseEval.bonus.count >= feature.triggerCount,
  );
  return {
    bonusTriggered,
    scatterTriggered: false,
    awarded: bonusTriggered ? feature.freeSpins : 0,
    triggerScatterCount: 0,
  };
}

/**
 * Play one paid round.
 * Costs SIM_BET.TOTAL_BET once. Free spins do not add bet.
 *
 * @param {{ pack: object, nextGrid: () => string[], paylines?: object[], bonusRng?: () => number }} args
 */
export function playPaidRound({
  pack,
  nextGrid,
  paylines = PAYLINE_DEFINITIONS,
  bonusRng = Math.random,
  totalBet = SIM_BET.TOTAL_BET,
  fsRetrigger = true,
  fsBonus = true,
}) {
  if (typeof nextGrid !== 'function') {
    throw new Error('playPaidRound: nextGrid è obbligatorio');
  }

  const symbols = pack.symbols;
  const stake = totalBet > 0 ? totalBet : SIM_BET.TOTAL_BET;
  const settleOpts = {
    totalBet: stake,
    paylineCount: paylines.length,
  };

  const baseGrid = nextGrid().slice();
  assertSimGrid(baseGrid);
  const baseEval = evaluateGrid(baseGrid, paylines);
  const spinSettle = settleSimulatedSpin(baseEval, symbols, settleOpts);
  const cash = settleGuaranteedCashBonus(baseEval, pack, bonusRng, stake);
  const baseSettle = cash.triggered
    ? {
        lineReturn: spinSettle.lineReturn,
        scatterReturn: spinSettle.scatterReturn,
        bonusReturn: cash.bonusReturn,
        totalReturn: spinSettle.totalReturn + cash.bonusReturn,
      }
    : spinSettle;
  const award = resolveFeatureAward(pack, baseEval);

  const freeSpins = [];
  let remaining = award.awarded;
  let retriggerCount = 0;
  const allowRetrigger = Boolean(fsRetrigger && pack.scatterFeature);
  const allowFsBonus = Boolean(fsBonus && isGuaranteedCashBonus(pack.bonusFeature));
  while (remaining > 0) {
    const remainingBefore = remaining;
    const grid = nextGrid().slice();
    assertSimGrid(grid);
    const evaluated = evaluateGrid(grid, paylines);
    const lineSettle = settleSimulatedSpin(evaluated, symbols, settleOpts);
    remaining -= 1;

    let retriggerAwarded = 0;
    let retriggerBlocked = false;
    const extra = pack.scatterFeature
      ? scatterFsRetriggerAwarded(evaluated.scatter.count)
      : 0;
    if (extra > 0) {
      if (allowRetrigger && retriggerCount < MAX_FS_RETRIGGERS) {
        remaining += extra;
        retriggerAwarded = extra;
        retriggerCount += 1;
      } else {
        retriggerBlocked = true;
      }
    }

    let bonusDraw = null;
    let bonusReturn = 0;
    if (allowFsBonus) {
      const cashFs = settleFsCashBonus(evaluated, bonusRng, stake);
      if (cashFs.triggered) {
        bonusDraw = cashFs;
        bonusReturn = cashFs.bonusReturn;
      }
    }

    const settled = bonusReturn > 0
      ? {
          lineReturn: lineSettle.lineReturn,
          scatterReturn: lineSettle.scatterReturn,
          bonusReturn,
          totalReturn: lineSettle.totalReturn + bonusReturn,
        }
      : lineSettle;

    freeSpins.push({
      grid,
      evaluated,
      settled,
      bonusCount: evaluated.bonus.count,
      scatterCount: evaluated.scatter.count,
      lineWinCount: evaluated.lineWins.length,
      triggeredForRetrigger: retriggerAwarded > 0,
      bonusDraw,
      retriggerAwarded,
      retriggerCount,
      retriggerBlocked,
      remainingBefore,
      remainingAfter: remaining,
    });
  }

  const freeSpinReturn = freeSpins.reduce((sum, fs) => sum + fs.settled.totalReturn, 0);
  const freeSpinLineReturn = freeSpins.reduce((sum, fs) => sum + fs.settled.lineReturn, 0);
  const freeSpinScatterReturn = freeSpins.reduce((sum, fs) => sum + fs.settled.scatterReturn, 0);
  const freeSpinBonusReturn = freeSpins.reduce(
    (sum, fs) => sum + (fs.settled.bonusReturn || 0),
    0,
  );

  return {
    paidBet: stake,
    baseGrid,
    baseEval,
    baseSettle,
    bonusDraw: cash.triggered ? { tier: cash.tier, x: cash.x } : null,
    bonusTriggered: award.bonusTriggered,
    scatterTriggered: award.scatterTriggered,
    triggerScatterCount: award.triggerScatterCount,
    freeSpinsGenerated: freeSpins.length,
    freeSpinsInitial: award.awarded,
    retriggerCount,
    freeSpins,
    freeSpinReturn,
    freeSpinLineReturn,
    freeSpinScatterReturn,
    freeSpinBonusReturn,
    totalRoundReturn: baseSettle.totalReturn + freeSpinReturn,
  };
}
