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
 */

import { evaluateGrid } from './engine.js';
import { PAYLINE_DEFINITIONS } from './paylines.js';
import {
  SIM_BET,
  assertSimGrid,
  isGuaranteedCashBonus,
  scatterFreeSpinsAwarded,
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
  if (award.awarded > 0) {
    for (let i = 0; i < award.awarded; i += 1) {
      const grid = nextGrid().slice();
      assertSimGrid(grid);
      const evaluated = evaluateGrid(grid, paylines);
      const settled = settleSimulatedSpin(evaluated, symbols, settleOpts);
      freeSpins.push({
        grid,
        evaluated,
        settled,
        bonusCount: evaluated.bonus.count,
        scatterCount: evaluated.scatter.count,
        lineWinCount: evaluated.lineWins.length,
        triggeredForRetrigger: false,
      });
    }
  }

  const freeSpinReturn = freeSpins.reduce((sum, fs) => sum + fs.settled.totalReturn, 0);
  const freeSpinLineReturn = freeSpins.reduce((sum, fs) => sum + fs.settled.lineReturn, 0);
  const freeSpinScatterReturn = freeSpins.reduce((sum, fs) => sum + fs.settled.scatterReturn, 0);

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
    freeSpins,
    freeSpinReturn,
    freeSpinLineReturn,
    freeSpinScatterReturn,
    totalRoundReturn: baseSettle.totalReturn + freeSpinReturn,
  };
}
