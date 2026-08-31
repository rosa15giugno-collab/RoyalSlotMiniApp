/**
 * PokerSlot offline math simulator.
 * No backend, no Chips, no Telegram spin.
 *
 *   node scripts/simulate-poker-math.mjs 1000000 v0
 *   node scripts/simulate-poker-math.mjs 1000000 v1
 *   node scripts/simulate-poker-math.mjs 1000000 v2
 *   node scripts/simulate-poker-math.mjs 1000000 v3
 *   node scripts/simulate-poker-math.mjs 1000000 v4
 *   node scripts/simulate-poker-math.mjs 1000000 v5
 *   node scripts/simulate-poker-math.mjs 1000000 v6 lines=3 bet=100
 *   node scripts/simulate-poker-math.mjs 1000000 v6 lines=5 bet=500
 *
 * Reports FLOAT theoretical RTP (full precision) and INTEGER wallet RTP
 * (Math.round at each real credit event — see poker/wallet-chips.js).
 */

import { PAYLINE_DEFINITIONS } from '../poker/paylines.js';
import {
  PAY_SYMBOLS,
  SIM_BET,
  WILD,
  createWeightedSampler,
  generateWeightedGrid,
  resolveMathPack,
  totalWeight,
  validateMathConfig,
} from '../poker/math-config.js';
import { playPaidRound } from '../poker/math-round.js';
import { WALLET_SETTLEMENT, walletCreditsForRound } from '../poker/wallet-chips.js';

const DEFAULT_SPINS = 100_000;
const PAYOUT_BUCKETS = [
  { id: '0x', label: '0x bet', test: (x) => x === 0 },
  { id: '0-1x', label: '>0 fino a <1x', test: (x) => x > 0 && x < 1 },
  { id: '1-2x', label: '1x–<2x', test: (x) => x >= 1 && x < 2 },
  { id: '2-5x', label: '2x–<5x', test: (x) => x >= 2 && x < 5 },
  { id: '5-10x', label: '5x–<10x', test: (x) => x >= 5 && x < 10 },
  { id: '10-25x', label: '10x–<25x', test: (x) => x >= 10 && x < 25 },
  { id: '25-50x', label: '25x–<50x', test: (x) => x >= 25 && x < 50 },
  { id: '50-100x', label: '50x–<100x', test: (x) => x >= 50 && x < 100 },
  { id: '100-250x', label: '100x–<250x', test: (x) => x >= 100 && x < 250 },
  { id: '250-500x', label: '250x–<500x', test: (x) => x >= 250 && x < 500 },
  { id: '500x+', label: '500×+', test: (x) => x >= 500 },
];

const BONUS_FS_BUCKETS = [
  { id: '0', label: '0 ritorno FS', test: (x) => x === 0 },
  { id: '0-1x', label: '>0–<1×', test: (x) => x > 0 && x < 1 },
  { id: '1-5x', label: '1–5×', test: (x) => x >= 1 && x < 5 },
  { id: '5-10x', label: '5–10×', test: (x) => x >= 5 && x < 10 },
  { id: '10-25x', label: '10–25×', test: (x) => x >= 10 && x < 25 },
  { id: '25x+', label: '25×+', test: (x) => x >= 25 },
];

function parseArgs(argv) {
  let spins = DEFAULT_SPINS;
  let version = 'v0';
  let seed = null;
  let lines = null;
  let bet = null;
  argv.slice(2).forEach((raw) => {
    const lower = String(raw).trim().toLowerCase();
    if (
      lower === 'v0'
      || lower === 'v1'
      || lower === 'v2'
      || lower === 'v3'
      || lower === 'v4'
      || lower === 'v5'
      || lower === 'v6'
    ) {
      version = lower;
      return;
    }
    if (lower.startsWith('seed=')) {
      const n = Number(lower.slice(5));
      if (!Number.isInteger(n) || n < 0) {
        throw new Error(`Seed non valido: "${raw}"`);
      }
      seed = n;
      return;
    }
    if (lower.startsWith('lines=')) {
      const n = Number(lower.slice(6));
      if (!Number.isInteger(n) || n < 1 || n > 10) {
        throw new Error(`lines non valido: "${raw}"`);
      }
      lines = n;
      return;
    }
    if (lower.startsWith('bet=')) {
      const n = Number(lower.slice(4));
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`bet non valido: "${raw}"`);
      }
      bet = n;
      return;
    }
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error(`Argomento non valido: "${raw}"`);
    }
    spins = n;
  });
  if ((version === 'v4' || version === 'v5' || version === 'v6') && seed == null) {
    seed = 20260829;
  }
  if (version !== 'v6') {
    lines = null;
    bet = null;
  } else if (lines == null) {
    lines = 10;
  }
  if (version === 'v6' && bet == null) bet = SIM_BET.TOTAL_BET;
  return { spins, version, seed, lines, bet };
}

function scatterBucket(count) {
  if (count >= 6) return '6+';
  return String(count);
}

function bonusBucket(count) {
  if (count >= 5) return '5+';
  return String(count);
}

function emptyCountMap(keys, init = 0) {
  return Object.fromEntries(keys.map((key) => [key, init]));
}

function pct(part, whole) {
  if (!whole) return 0;
  return (100 * part) / whole;
}

function fmt(n, digits = 4) {
  if (!Number.isFinite(n)) return String(n);
  return Number(n).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function fmtPct(n) {
  return `${fmt(n, 4)}%`;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function extrema(values) {
  if (!values.length) return { min: 0, max: 0 };
  let min = values[0];
  let max = values[0];
  for (let i = 1; i < values.length; i += 1) {
    const v = values[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function rng() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function simulate(paidRounds, pack, { seed = null, paylines = PAYLINE_DEFINITIONS, totalBet = SIM_BET.TOTAL_BET } = {}) {
  validateMathConfig(PAYLINE_DEFINITIONS, pack);
  const stake = totalBet > 0 ? totalBet : SIM_BET.TOTAL_BET;
  const activeLines = paylines.length;
  const stakePerLine = stake / activeLines;
  const gridRng = seed == null ? Math.random : mulberry32(seed);
  const bonusRng = seed == null ? Math.random : mulberry32(seed ^ 0x85ebca6b);
  const pick = createWeightedSampler(pack.symbols, gridRng);
  const buffer = new Array(15);
  const nextGrid = () => generateWeightedGrid(pick, buffer);

  const scatterHist = emptyCountMap(['0', '1', '2', '3', '4', '5', '6+']);
  const bonusHist = emptyCountMap(['0', '1', '2', '3', '4', '5+']);
  const payoutDist = emptyCountMap(PAYOUT_BUCKETS.map((b) => b.id));
  const bonusFsDist = emptyCountMap(BONUS_FS_BUCKETS.map((b) => b.id));

  let totalPaidBet = 0;
  let baseReturn = 0;
  let baseLineReturn = 0;
  let baseScatterReturn = 0;
  let baseBonusReturn = 0;
  let freeSpinReturn = 0;
  let freeSpinLineReturn = 0;
  let freeSpinScatterReturn = 0;
  let totalReturn = 0;
  let winningRounds = 0;
  let winReturnSum = 0;
  let maxBaseWin = 0;
  let maxFreeSpinWin = 0;
  let maxRoundWin = 0;
  let maxRoundWinMultiple = 0;
  let wildCells = 0;
  let gridsWithWild = 0;
  let scatterTriggers = 0;
  let bonusTriggers = 0;
  let featureTriggers = 0;
  let lineWinRounds = 0;
  let freeSpinsGenerated = 0;
  const scatterExact = { 3: 0, 4: 0, 5: 0 };
  const fsFromScatter = {
    3: { triggers: 0, freeSpins: 0, fsReturn: 0 },
    4: { triggers: 0, freeSpins: 0, fsReturn: 0 },
    5: { triggers: 0, freeSpins: 0, fsReturn: 0 },
  };
  let extraFsFrom45Return = 0;
  let extraFsFrom45Count = 0;
  let walletPaidLineScatter = 0;
  let walletMystery = 0;
  let walletFreeSpins = 0;
  let walletTotal = 0;
  let walletOnceTotal = 0;
  let walletWinningRounds = 0;
  let walletMaxRoundWin = 0;
  let gridsGenerated = 0;
  let mean = 0;
  let m2 = 0;
  const bonusFsReturns = [];
  const bonusRoundTotals = [];
  const mysteryPrize = { 3: {}, 4: {}, 5: {} };
  const mysteryChips = {};
  let mysteryZero = 0;

  const t0 = Date.now();

  for (let i = 0; i < paidRounds; i += 1) {
    const round = playPaidRound({
      pack,
      nextGrid,
      paylines,
      bonusRng,
      totalBet: stake,
    });
    gridsGenerated += 1 + round.freeSpinsGenerated;
    totalPaidBet += round.paidBet;
    baseReturn += round.baseSettle.lineReturn + round.baseSettle.scatterReturn;
    baseLineReturn += round.baseSettle.lineReturn;
    baseScatterReturn += round.baseSettle.scatterReturn;
    baseBonusReturn += round.baseSettle.bonusReturn || 0;
    freeSpinReturn += round.freeSpinReturn;
    freeSpinLineReturn += round.freeSpinLineReturn || 0;
    freeSpinScatterReturn += round.freeSpinScatterReturn || 0;
    totalReturn += round.totalRoundReturn;

    const wallet = walletCreditsForRound(round);
    walletPaidLineScatter += wallet.paidLineScatter;
    walletMystery += wallet.mystery;
    walletFreeSpins += wallet.freeSpins;
    walletTotal += wallet.total;
    walletOnceTotal += wallet.once;
    if (wallet.total > 0) walletWinningRounds += 1;
    if (wallet.total > walletMaxRoundWin) walletMaxRoundWin = wallet.total;

    const delta = round.totalRoundReturn - mean;
    mean += delta / (i + 1);
    m2 += delta * (round.totalRoundReturn - mean);

    if (round.totalRoundReturn > 0) {
      winningRounds += 1;
      winReturnSum += round.totalRoundReturn;
    }

    if (round.baseSettle.totalReturn > maxBaseWin) {
      maxBaseWin = round.baseSettle.totalReturn;
    }
    round.freeSpins.forEach((fs) => {
      if (fs.settled.totalReturn > maxFreeSpinWin) {
        maxFreeSpinWin = fs.settled.totalReturn;
      }
    });
    if (round.totalRoundReturn > maxRoundWin) {
      maxRoundWin = round.totalRoundReturn;
      maxRoundWinMultiple = round.totalRoundReturn / stake;
    }

    const sCount = round.baseEval.scatter.count;
    scatterHist[scatterBucket(sCount)] += 1;
    if (round.baseEval.scatter.triggered) scatterTriggers += 1;
    if (round.baseEval.lineWins.length > 0) lineWinRounds += 1;
    if (sCount === 3 || sCount === 4 || sCount === 5) {
      scatterExact[sCount] += 1;
    }

    const bCount = round.baseEval.bonus.count;
    bonusHist[bonusBucket(bCount)] += 1;

    const featureTriggered = round.bonusTriggered || round.scatterTriggered;
    if (featureTriggered) {
      featureTriggers += 1;
      bonusTriggers += round.bonusTriggered ? 1 : 0;
      freeSpinsGenerated += round.freeSpinsGenerated;
      bonusFsReturns.push(round.freeSpinReturn);
      bonusRoundTotals.push(round.totalRoundReturn);
      const fsMultiple = round.freeSpinReturn / stake;
      const fsBucket = BONUS_FS_BUCKETS.find((entry) => entry.test(fsMultiple));
      bonusFsDist[fsBucket.id] += 1;
    }

    if (round.scatterTriggered) {
      const key = Math.min(5, round.triggerScatterCount);
      if (fsFromScatter[key]) {
        fsFromScatter[key].triggers += 1;
        fsFromScatter[key].freeSpins += round.freeSpinsGenerated;
        fsFromScatter[key].fsReturn += round.freeSpinReturn;
      }
      const extraSpins = key === 4 ? 2 : key === 5 ? 5 : 0;
      if (extraSpins > 0) {
        extraFsFrom45Count += extraSpins;
        const extra = round.freeSpins.slice(-extraSpins);
        extraFsFrom45Return += extra.reduce((sum, fs) => sum + fs.settled.totalReturn, 0);
      }
    }

    let wilds = 0;
    for (let c = 0; c < round.baseGrid.length; c += 1) {
      if (round.baseGrid[c] === WILD) wilds += 1;
    }
    wildCells += wilds;
    if (wilds > 0) gridsWithWild += 1;

    const multiple = round.totalRoundReturn / stake;
    const bucket = PAYOUT_BUCKETS.find((entry) => entry.test(multiple));
    payoutDist[bucket.id] += 1;

    if (round.bonusDraw) {
      const { tier, x } = round.bonusDraw;
      mysteryPrize[tier][String(x)] = (mysteryPrize[tier][String(x)] || 0) + 1;
      const chips = round.baseSettle.bonusReturn;
      const chipKey = String(chips);
      mysteryChips[chipKey] = (mysteryChips[chipKey] || 0) + 1;
      if (!(round.baseSettle.bonusReturn > 0)) mysteryZero += 1;
    }
  }

  const elapsedMs = Date.now() - t0;
  const losingRounds = paidRounds - winningRounds;
  const variance = paidRounds > 1 ? m2 / (paidRounds - 1) : 0;
  const stddev = Math.sqrt(variance);
  const baseRtp = pct(baseReturn, totalPaidBet);
  const lineRtp = pct(baseLineReturn, totalPaidBet);
  const scatterRtp = pct(baseScatterReturn, totalPaidBet);
  const mysteryBonusRtp = pct(baseBonusReturn, totalPaidBet);
  const bonusRtp = pct(freeSpinReturn, totalPaidBet);
  const totalRtp = pct(totalReturn, totalPaidBet);
  const fsLineRtp = pct(freeSpinLineReturn, totalPaidBet);
  const fsScatterRtp = pct(freeSpinScatterReturn, totalPaidBet);
  const lineTotalRtp = pct(baseLineReturn + freeSpinLineReturn, totalPaidBet);
  const scatterTotalRtp = pct(baseScatterReturn + freeSpinScatterReturn, totalPaidBet);

  return {
    mathVersion: pack.version,
    mathId: pack.id,
    seed,
    paidRounds,
    activePaylines: activeLines,
    totalBet: stake,
    betPerLine: stakePerLine,
    baseSpins: paidRounds,
    freeSpinsGenerated,
    totalSpinsGenerated: gridsGenerated,
    elapsedMs,
    totalWeight: totalWeight(pack.symbols),
    bet: { ...SIM_BET },
    totalPaidBet,
    baseReturn,
    mysteryBonusReturn: baseBonusReturn,
    freeSpinReturn,
    totalReturn,
    baseLineRtpPct: lineRtp,
    baseScatterRtpPct: scatterRtp,
    baseGameRtpPct: baseRtp,
    mysteryBonusRtpPct: mysteryBonusRtp,
    bonusFreeSpinRtpPct: bonusRtp,
    fsLineRtpPct: fsLineRtp,
    fsScatterRtpPct: fsScatterRtp,
    lineTotalRtpPct: lineTotalRtp,
    scatterTotalRtpPct: scatterTotalRtp,
    totalRtpPct: totalRtp,
    rtpCheckPct: lineTotalRtp + scatterTotalRtp + mysteryBonusRtp,
    walletSettlement: WALLET_SETTLEMENT.id,
    walletPaidLineScatter,
    walletMysteryReturn: walletMystery,
    walletFreeSpinReturn: walletFreeSpins,
    walletTotalReturn: walletTotal,
    walletOnceReturn: walletOnceTotal,
    walletPaidLineScatterRtpPct: pct(walletPaidLineScatter, totalPaidBet),
    walletMysteryRtpPct: pct(walletMystery, totalPaidBet),
    walletFreeSpinRtpPct: pct(walletFreeSpins, totalPaidBet),
    walletTotalRtpPct: pct(walletTotal, totalPaidBet),
    walletOnceRtpPct: pct(walletOnceTotal, totalPaidBet),
    roundingDeltaPt: pct(walletTotal, totalPaidBet) - totalRtp,
    roundingOnceDeltaPt: pct(walletOnceTotal, totalPaidBet) - totalRtp,
    walletHitRatePaidRoundPct: pct(walletWinningRounds, paidRounds),
    walletMaxTotalRoundWin: walletMaxRoundWin,
    walletMaxTotalRoundWinMultiple: stake > 0 ? walletMaxRoundWin / stake : 0,
    winningRounds,
    losingRounds,
    hitRatePaidRoundPct: pct(winningRounds, paidRounds),
    lineWinRounds,
    lineWinRatePct: pct(lineWinRounds, paidRounds),
    losingPct: pct(losingRounds, paidRounds),
    averageWinOnWinningRounds: winningRounds ? winReturnSum / winningRounds : 0,
    averageReturnPerPaidRound: totalReturn / paidRounds,
    averageFreeSpinsPerPaidRound: freeSpinsGenerated / paidRounds,
    averageBonusReturnPerTrigger: featureTriggers ? freeSpinReturn / featureTriggers : 0,
    averageTotalReturnPerBonusRound: featureTriggers
      ? bonusRoundTotals.reduce((s, n) => s + n, 0) / featureTriggers
      : 0,
    maxBaseSpinWin: maxBaseWin,
    maxFreeSpinWin,
    maxTotalRoundWin: maxRoundWin,
    maxTotalRoundWinMultiple: maxRoundWinMultiple,
    volatility: {
      stddevReturn: stddev,
      meanReturn: mean,
      cv: mean > 0 ? stddev / mean : 0,
      stddevBetMultiple: stddev / stake,
    },
    scatter: {
      hist: scatterHist,
      exact: scatterExact,
      triggerCount: scatterTriggers,
      triggerRatePct: pct(scatterTriggers, paidRounds),
    },
    bonus: {
      hist: bonusHist,
      triggerCount: bonusTriggers,
      triggerRatePct: pct(bonusTriggers, paidRounds),
      mysteryZero,
      mysteryPrize,
      mysteryChips,
      mysteryDraws: bonusTriggers,
      averageMysteryPrize: bonusTriggers ? baseBonusReturn / bonusTriggers : 0,
    },
    feature: {
      triggerCount: featureTriggers,
      triggerRatePct: pct(featureTriggers, paidRounds),
    },
    scatterFreeSpins: {
      from3: fsFromScatter[3],
      from4: fsFromScatter[4],
      from5: fsFromScatter[5],
      extraSpinsFrom4and5: extraFsFrom45Count,
      extraReturnFrom4and5: extraFsFrom45Return,
      extraRtpFrom4and5Pct: pct(extraFsFrom45Return, totalPaidBet),
      rtpFrom3Pct: pct(fsFromScatter[3].fsReturn, totalPaidBet),
      rtpFrom4Pct: pct(fsFromScatter[4].fsReturn, totalPaidBet),
      rtpFrom5Pct: pct(fsFromScatter[5].fsReturn, totalPaidBet),
    },
    wild: {
      meanPerGrid: wildCells / paidRounds,
      gridsWithAtLeastOnePct: pct(gridsWithWild, paidRounds),
    },
    payoutDist,
    payoutDistLabels: Object.fromEntries(
      PAYOUT_BUCKETS.map((b) => [b.id, b.label]),
    ),
    bonusRoundAnalysis: {
      bonusRounds: featureTriggers,
      totalFreeSpins: freeSpinsGenerated,
      avgFreeSpinReturn: featureTriggers ? freeSpinReturn / featureTriggers : 0,
      medianFreeSpinReturn: median(bonusFsReturns),
      minFreeSpinReturn: extrema(bonusFsReturns).min,
      maxFreeSpinReturn: extrema(bonusFsReturns).max,
      dist: bonusFsDist,
      distLabels: Object.fromEntries(BONUS_FS_BUCKETS.map((b) => [b.id, b.label])),
      pctZeroFsReturn: pct(
        bonusFsReturns.filter((v) => v === 0).length,
        featureTriggers,
      ),
    },
    paySymbols: PAY_SYMBOLS,
  };
}

function printReport(stats) {
  const lines = [];
  const push = (s = '') => lines.push(s);

  push(`PokerSlot math sandbox ${stats.mathVersion}`);
  if (stats.seed != null) push(`SEED                  ${stats.seed}`);
  if (stats.activePaylines != null) {
    push(`ACTIVE PAYLINES       ${fmt(stats.activePaylines, 0)}`);
    push(`TOTAL BET             ${fmt(stats.totalBet, 4)}`);
    push(`BET PER LINE          ${fmt(stats.betPerLine, 4)}`);
  }
  push(`PAID ROUNDS           ${fmt(stats.paidRounds, 0)}`);
  push(`BASE SPINS            ${fmt(stats.baseSpins, 0)}`);
  push(`FREE SPINS GENERATED  ${fmt(stats.freeSpinsGenerated, 0)}`);
  push(`TOTAL SPINS GENERATED ${fmt(stats.totalSpinsGenerated, 0)}`);
  push(`elapsed               ${fmt(stats.elapsedMs / 1000, 2)} s`);
  push(`total weight          ${fmt(stats.totalWeight, 0)}`);
  push('');
  push(`TOTAL PAID BET        ${fmt(stats.totalPaidBet, 2)}`);
  push(`BASE RETURN           ${fmt(stats.baseReturn, 2)}`);
  push(`FREE SPIN RETURN      ${fmt(stats.freeSpinReturn, 2)}`);
  push(`TOTAL RETURN          ${fmt(stats.totalReturn, 2)}`);
  push('');
  push(`BASE LINE RTP %       ${fmtPct(stats.baseLineRtpPct)}`);
  push(`FS LINE RTP %         ${fmtPct(stats.fsLineRtpPct || 0)}`);
  push(`LINE RTP %            ${fmtPct(stats.lineTotalRtpPct || stats.baseLineRtpPct)}`);
  push(`BASE SCATTER RTP %    ${fmtPct(stats.baseScatterRtpPct)}`);
  push(`FS SCATTER RTP %      ${fmtPct(stats.fsScatterRtpPct || 0)}`);
  push(`SCATTER RTP %         ${fmtPct(stats.scatterTotalRtpPct || stats.baseScatterRtpPct)}`);
  push(`BASE GAME RTP %       ${fmtPct(stats.baseGameRtpPct)}`);
  push(`MYSTERY BONUS RTP %   ${fmtPct(stats.mysteryBonusRtpPct || 0)}`);
  push(`BONUS FREE-SPIN RTP % ${fmtPct(stats.bonusFreeSpinRtpPct)}`);
  push(`TOTAL RTP %           ${fmtPct(stats.totalRtpPct)}`);
  push(`LINE+SCATTER+MYST     ${fmtPct(stats.rtpCheckPct)}`);
  if (stats.walletSettlement) {
    push('');
    push(`WALLET SETTLEMENT     ${stats.walletSettlement}`);
    push(`FLOAT TOTAL RTP %     ${fmtPct(stats.totalRtpPct)}`);
    push(`WALLET INTEGER RTP %  ${fmtPct(stats.walletTotalRtpPct)}`);
    push(`ROUNDING DELTA        ${fmt(stats.roundingDeltaPt, 6)} pt  (B per-credit − float)`);
    push(`ALT A (round once)    ${fmtPct(stats.walletOnceRtpPct)}  delta ${fmt(stats.roundingOnceDeltaPt, 6)} pt`);
    push(`WALLET LINE+SCATTER   ${fmtPct(stats.walletPaidLineScatterRtpPct)}  (paid spin credit)`);
    push(`WALLET MYSTERY RTP %  ${fmtPct(stats.walletMysteryRtpPct)}`);
    push(`WALLET FS RTP %       ${fmtPct(stats.walletFreeSpinRtpPct)}`);
    push(`WALLET TOTAL RTP %    ${fmtPct(stats.walletTotalRtpPct)}`);
  }
  push('');
  push(`HIT RATE PAID ROUND   ${fmtPct(stats.hitRatePaidRoundPct)}`);
  if (stats.lineWinRatePct != null) {
    push(`LINE WIN RATE         ${fmtPct(stats.lineWinRatePct)}  (${fmt(stats.lineWinRounds, 0)})`);
  }
  push(`LOSING ROUNDS %       ${fmtPct(stats.losingPct)}`);
  push(`AVG WIN (on wins)     ${fmt(stats.averageWinOnWinningRounds, 4)}`);
  push(`AVG RETURN / ROUND    ${fmt(stats.averageReturnPerPaidRound, 4)}`);
  push(`AVG FS / PAID ROUND   ${fmt(stats.averageFreeSpinsPerPaidRound, 4)}`);
  push(`AVG BONUS RET/TRIG    ${fmt(stats.averageBonusReturnPerTrigger, 4)}`);
  push(`AVG TOTAL / BONUS RD  ${fmt(stats.averageTotalReturnPerBonusRound, 4)}`);
  push(`MAX BASE-SPIN WIN     ${fmt(stats.maxBaseSpinWin, 4)}`);
  push(`MAX FREE-SPIN WIN     ${fmt(stats.maxFreeSpinWin, 4)}`);
  push(`MAX TOTAL ROUND WIN   ${fmt(stats.maxTotalRoundWin, 4)}  (${fmt(stats.maxTotalRoundWinMultiple, 4)}x bet)`);
  if (stats.walletMaxTotalRoundWin != null) {
    push(`WALLET HIT RATE       ${fmtPct(stats.walletHitRatePaidRoundPct)}`);
    push(`WALLET MAX ROUND WIN  ${fmt(stats.walletMaxTotalRoundWin, 0)}  (${fmt(stats.walletMaxTotalRoundWinMultiple, 4)}x bet)`);
  }
  push(`VOLATILITY (indic.)   stddev=${fmt(stats.volatility.stddevReturn, 4)}  CV=${fmt(stats.volatility.cv, 4)}  stddev/bet=${fmt(stats.volatility.stddevBetMultiple, 4)}`);
  push('');
  push('BASE SPIN — SCATTER counts:');
  Object.entries(stats.scatter.hist).forEach(([k, v]) => {
    push(`  ${k.padEnd(4)} ${fmt(v, 0)}  (${fmtPct(pct(v, stats.paidRounds))})`);
  });
  push(`  trigger rate        ${fmtPct(stats.scatter.triggerRatePct)}  (${fmt(stats.scatter.triggerCount, 0)})`);
  push('');
  push('BASE SPIN — BONUS counts:');
  Object.entries(stats.bonus.hist).forEach(([k, v]) => {
    push(`  ${k.padEnd(4)} ${fmt(v, 0)}  (${fmtPct(pct(v, stats.paidRounds))})`);
  });
  push(`  trigger rate        ${fmtPct(stats.bonus.triggerRatePct)}  (${fmt(stats.bonus.triggerCount, 0)})`);
  if (stats.bonus.mysteryPrize && (stats.mathId === 'v4' || stats.mathId === 'v5' || stats.mathId === 'v6')) {
    push(`  mystery premio 0    ${fmt(stats.bonus.mysteryZero, 0)}`);
    push(`  mystery draws       ${fmt(stats.bonus.mysteryDraws, 0)}`);
    push(`  mystery prize medio ${fmt(stats.bonus.averageMysteryPrize, 4)}`);
    [3, 4, 5].forEach((tier) => {
      const name = tier === 5 ? '5+' : String(tier);
      const dist = stats.bonus.mysteryPrize[tier];
      const parts = Object.entries(dist)
        .map(([x, n]) => `${x}×:${fmt(n, 0)}`)
        .join('  ');
      push(`  mystery ${name}         ${parts || '(none)'}`);
    });
    if (stats.bonus.mysteryChips) {
      push('  mystery chips:');
      Object.entries(stats.bonus.mysteryChips)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .forEach(([chips, n]) => {
          push(`    ${chips.padStart(6)}  ${fmt(n, 0)}  (${fmtPct(pct(n, stats.bonus.mysteryDraws))})`);
        });
    }
  }
  push('');
  push(`WILD mean / base grid ${fmt(stats.wild.meanPerGrid, 4)}`);
  push(`WILD base grids >=1   ${fmtPct(stats.wild.gridsWithAtLeastOnePct)}`);
  push('');
  push('PAYOUT DISTRIBUTION (paid round return / TOTAL_BET):');
  PAYOUT_BUCKETS.forEach((bucket) => {
    const count = stats.payoutDist[bucket.id];
    push(`  ${bucket.label.padEnd(16)} ${fmt(count, 0)}  (${fmtPct(pct(count, stats.paidRounds))})`);
  });
  push('');
  push('BONUS ROUND ANALYSIS (free-spin return only / TOTAL_BET):');
  push(`  bonus rounds        ${fmt(stats.bonusRoundAnalysis.bonusRounds, 0)}`);
  push(`  total free spins    ${fmt(stats.bonusRoundAnalysis.totalFreeSpins, 0)}`);
  push(`  avg FS return       ${fmt(stats.bonusRoundAnalysis.avgFreeSpinReturn, 4)}`);
  push(`  median FS return    ${fmt(stats.bonusRoundAnalysis.medianFreeSpinReturn, 4)}`);
  push(`  min FS return       ${fmt(stats.bonusRoundAnalysis.minFreeSpinReturn, 4)}`);
  push(`  max FS return       ${fmt(stats.bonusRoundAnalysis.maxFreeSpinReturn, 4)}`);
  push(`  % FS return = 0     ${fmtPct(stats.bonusRoundAnalysis.pctZeroFsReturn)}`);
  Object.entries(stats.bonusRoundAnalysis.dist).forEach(([id, count]) => {
    const label = stats.bonusRoundAnalysis.distLabels[id];
    push(`  ${label.padEnd(16)} ${fmt(count, 0)}  (${fmtPct(pct(count, stats.bonusRoundAnalysis.bonusRounds))})`);
  });

  if (stats.scatterFreeSpins) {
    push('');
    push('SCATTER EXACT (paid base):');
    push(`  3                   ${fmt(stats.scatter.exact[3], 0)}  (${fmtPct(pct(stats.scatter.exact[3], stats.paidRounds))})`);
    push(`  4                   ${fmt(stats.scatter.exact[4], 0)}  (${fmtPct(pct(stats.scatter.exact[4], stats.paidRounds))})`);
    push(`  5                   ${fmt(stats.scatter.exact[5], 0)}  (${fmtPct(pct(stats.scatter.exact[5], stats.paidRounds))})`);
    push('');
    push('FREE SPINS BY SCATTER TRIGGER:');
    [3, 4, 5].forEach((n) => {
      const row = stats.scatterFreeSpins[`from${n}`];
      push(`  ${n} SCATTER  trig=${fmt(row.triggers, 0)}  FS=${fmt(row.freeSpins, 0)}  FS-RTP=${fmtPct(pct(row.fsReturn, stats.totalPaidBet))}`);
    });
    push(`  extra FS from 4+5   ${fmt(stats.scatterFreeSpins.extraSpinsFrom4and5, 0)}`);
    push(`  extra RTP from 4+5  ${fmtPct(stats.scatterFreeSpins.extraRtpFrom4and5Pct)}`);
  }

  const text = lines.join('\n');
  console.log(text);
  return text;
}

const { spins, version, seed, lines, bet } = parseArgs(process.argv);
const pack = resolveMathPack(version);
const paylines = lines
  ? PAYLINE_DEFINITIONS.slice(0, lines)
  : PAYLINE_DEFINITIONS;
const stats = simulate(spins, pack, { seed, paylines, totalBet: bet ?? SIM_BET.TOTAL_BET });
printReport(stats);
console.log('');
console.log('JSON_SUMMARY_BEGIN');
console.log(JSON.stringify(stats));
console.log('JSON_SUMMARY_END');
