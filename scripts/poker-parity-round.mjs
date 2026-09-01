/**
 * PokerSlot MATH_V6 JS dump for Python parity tests.
 *
 *   node scripts/poker-parity-round.mjs seed=42 bet=100
 *   node scripts/poker-parity-round.mjs sequence=0.1,0.2,... bet=100
 *   node scripts/poker-parity-round.mjs simulate=20000 seed=20260829 bet=100
 *
 * Does not change MATH_V6. Offline only.
 */

import { PAYLINE_DEFINITIONS } from '../poker/paylines.js';
import {
  MATH_V6,
  createWeightedSampler,
  generateWeightedGrid,
  scatterFreeSpinsAwarded,
  validateMathConfig,
} from '../poker/math-config.js';
import { playPaidRound } from '../poker/math-round.js';
import { toWalletChips, walletCreditsForRound } from '../poker/wallet-chips.js';

function mulberry32(seed) {
  let t = seed >>> 0;
  return function rng() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function parseArgs(argv) {
  const out = {
    seed: null,
    bet: 100,
    lines: null,
    sequence: null,
    simulate: 0,
    twoStream: true,
    draws: 0,
  };
  argv.slice(2).forEach((raw) => {
    const lower = String(raw).trim();
    if (lower.startsWith('seed=')) {
      out.seed = Number(lower.slice(5));
      return;
    }
    if (lower.startsWith('bet=')) {
      out.bet = Number(lower.slice(4));
      return;
    }
    if (lower.startsWith('lines=')) {
      out.lines = Number(lower.slice(6));
      return;
    }
    if (lower.startsWith('sequence=')) {
      out.sequence = lower.slice(9).split(',').filter(Boolean).map(Number);
      return;
    }
    if (lower.startsWith('simulate=')) {
      out.simulate = Number(lower.slice(9));
      return;
    }
    if (lower === 'one-stream') {
      out.twoStream = false;
      return;
    }
    if (lower.startsWith('draws=')) {
      out.draws = Number(lower.slice(6));
    }
  });
  return out;
}

function lineCountForBet(bet) {
  if (bet === 100) return 3;
  if (bet === 500) return 5;
  if (bet === 1000) return 8;
  if (bet === 2500) return 10;
  throw new Error(`bet non whitelist: ${bet}`);
}

function serializeEval(evaluated) {
  return {
    line_wins: (evaluated.lineWins || []).map((win) => ({
      line_id: win.lineId,
      symbol: win.symbol,
      count: win.count,
      cell_indexes: win.cellIndexes,
      all_wild: win.allWild,
    })),
    scatter: evaluated.scatter,
    bonus: evaluated.bonus,
  };
}

function dumpRound(round, wallet) {
  return {
    paid_grid: round.baseGrid,
    paid_eval: serializeEval(round.baseEval),
    paid_settle: {
      line_return: round.baseSettle.lineReturn,
      scatter_return: round.baseSettle.scatterReturn,
      bonus_return: round.baseSettle.bonusReturn || 0,
      total_return: round.baseSettle.totalReturn,
    },
    mystery: round.bonusDraw
      ? { triggered: true, tier: round.bonusDraw.tier, x: round.bonusDraw.x }
      : { triggered: false, tier: 0, x: 0 },
    bonus_triggered: round.bonusTriggered,
    scatter_triggered: round.scatterTriggered,
    trigger_scatter_count: round.triggerScatterCount,
    free_spins_generated: round.freeSpinsGenerated,
    free_spins_initial: round.freeSpinsInitial,
    retrigger_count: round.retriggerCount,
    free_spins: round.freeSpins.map((fs, index) => {
      const lineScatter = toWalletChips(
        (fs.settled.lineReturn || 0) + (fs.settled.scatterReturn || 0),
      );
      const mysteryChips = toWalletChips(fs.settled.bonusReturn || 0);
      const mystery = fs.bonusDraw
        ? {
            triggered: true,
            tier: fs.bonusDraw.tier,
            x: fs.bonusDraw.x,
            bonus_return: fs.bonusDraw.bonusReturn,
            reward_chips: mysteryChips,
          }
        : null;
      return {
        index,
        grid: fs.grid,
        evaluated: serializeEval(fs.evaluated),
        settled: {
          line_return: fs.settled.lineReturn,
          scatter_return: fs.settled.scatterReturn,
          bonus_return: fs.settled.bonusReturn || 0,
          total_return: fs.settled.totalReturn,
        },
        base_win: lineScatter + mysteryChips,
        mystery,
        retrigger_awarded: fs.retriggerAwarded || 0,
        remaining_before: fs.remainingBefore,
        remaining_after: fs.remainingAfter,
        retrigger_blocked: Boolean(fs.retriggerBlocked),
      };
    }),
    wallet: {
      paid_line_scatter: wallet.paidLineScatter,
      mystery: wallet.mystery,
      free_spins: wallet.freeSpins,
      total: wallet.total,
    },
  };
}

function sequenceRng(values) {
  let i = 0;
  return function rng() {
    if (i >= values.length) {
      throw new Error(`sequence RNG exhausted at ${i}`);
    }
    const v = values[i];
    i += 1;
    return v;
  };
}

function playOne({ seed, bet, lines, sequence, twoStream }) {
  validateMathConfig(PAYLINE_DEFINITIONS, MATH_V6);
  const n = lines || lineCountForBet(bet);
  const paylines = PAYLINE_DEFINITIONS.slice(0, n);
  let gridRng;
  let bonusRng;
  if (sequence) {
    const rng = sequenceRng(sequence);
    gridRng = rng;
    bonusRng = rng;
  } else {
    const s = seed == null ? 1 : seed;
    gridRng = mulberry32(s);
    bonusRng = twoStream ? mulberry32(s ^ 0x85ebca6b) : gridRng;
  }
  const pick = createWeightedSampler(MATH_V6.symbols, gridRng);
  const buffer = new Array(15);
  const nextGrid = () => generateWeightedGrid(pick, buffer).slice();
  const round = playPaidRound({
    pack: MATH_V6,
    nextGrid,
    paylines,
    bonusRng,
    totalBet: bet,
  });
  return dumpRound(round, walletCreditsForRound(round));
}

function simulate({ seed, bet, lines, n, twoStream }) {
  validateMathConfig(PAYLINE_DEFINITIONS, MATH_V6);
  const lineN = lines || lineCountForBet(bet);
  const paylines = PAYLINE_DEFINITIONS.slice(0, lineN);
  const s = seed == null ? 20260829 : seed;
  const gridRng = mulberry32(s);
  const bonusRng = twoStream ? mulberry32(s ^ 0x85ebca6b) : gridRng;
  const pick = createWeightedSampler(MATH_V6.symbols, gridRng);
  const buffer = new Array(15);
  const nextGrid = () => generateWeightedGrid(pick, buffer);

  let walletTotal = 0;
  let winningRounds = 0;
  let bonusTriggers = 0;
  let scatterTriggers = 0;
  let mysteryTriggered = 0;
  const fsAward = { 5: 0, 7: 0, 10: 0 };
  const mysteryX = {};
  const scatterHist = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, '6+': 0 };
  const bonusHist = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, '5+': 0 };
  const buckets = {
    '0x': 0,
    '0-1x': 0,
    '1-2x': 0,
    '2-5x': 0,
    '5-10x': 0,
    '10-25x': 0,
    '25-50x': 0,
    '50-100x': 0,
    '100-250x': 0,
    '250-500x': 0,
    '500x+': 0,
  };

  function bucket(mult) {
    if (mult === 0) return '0x';
    if (mult < 1) return '0-1x';
    if (mult < 2) return '1-2x';
    if (mult < 5) return '2-5x';
    if (mult < 10) return '5-10x';
    if (mult < 25) return '10-25x';
    if (mult < 50) return '25-50x';
    if (mult < 100) return '50-100x';
    if (mult < 250) return '100-250x';
    if (mult < 500) return '250-500x';
    return '500x+';
  }

  for (let i = 0; i < n; i += 1) {
    const round = playPaidRound({
      pack: MATH_V6,
      nextGrid,
      paylines,
      bonusRng,
      totalBet: bet,
    });
    const wallet = walletCreditsForRound(round);
    walletTotal += wallet.total;
    if (wallet.total > 0) winningRounds += 1;
    if (round.baseEval.bonus.triggered) bonusTriggers += 1;
    if (round.baseEval.scatter.triggered) scatterTriggers += 1;
    const awarded = scatterFreeSpinsAwarded(
      round.baseEval.scatter.count,
      MATH_V6.scatterFeature,
    );
    if (awarded === 5 || awarded === 7 || awarded === 10) fsAward[awarded] += 1;
    if (round.bonusDraw) {
      mysteryTriggered += 1;
      const key = `${round.bonusDraw.tier}x${round.bonusDraw.x}`;
      mysteryX[key] = (mysteryX[key] || 0) + 1;
    }
    const sc = round.baseEval.scatter.count;
    if (sc >= 6) scatterHist['6+'] += 1;
    else scatterHist[sc] += 1;
    const bc = round.baseEval.bonus.count;
    if (bc >= 5) bonusHist['5+'] += 1;
    else bonusHist[bc] += 1;
    buckets[bucket(wallet.total / bet)] += 1;
  }

  return {
    rounds: n,
    bet,
    total_bet: n * bet,
    wallet_total: walletTotal,
    rtp: walletTotal / (n * bet),
    hit_rate: winningRounds / n,
    bonus_frequency: bonusTriggers / n,
    scatter_frequency: scatterTriggers / n,
    bonus_triggers: bonusTriggers,
    scatter_triggers: scatterTriggers,
    mystery_triggered: mysteryTriggered,
    fs_award: fsAward,
    mystery_x: mysteryX,
    scatter_hist: scatterHist,
    bonus_hist: bonusHist,
    payout_buckets: buckets,
    winning_rounds: winningRounds,
  };
}

function dumpDraws({ seed, n }) {
  const rng = mulberry32(seed);
  const pick = createWeightedSampler(MATH_V6.symbols, rng);
  const symbols = [];
  for (let i = 0; i < n; i += 1) symbols.push(pick());
  return { seed, draws: n, symbols };
}

const args = parseArgs(process.argv);
let result;
if (args.draws > 0) {
  result = dumpDraws({ seed: args.seed == null ? 1 : args.seed, n: args.draws });
} else if (args.simulate > 0) {
  result = simulate({
    seed: args.seed,
    bet: args.bet,
    lines: args.lines,
    n: args.simulate,
    twoStream: args.twoStream,
  });
} else {
  result = playOne(args);
}
process.stdout.write(`${JSON.stringify(result)}\n`);
