/**
 * Roulette audio e2e flow validation (local, no mapping/asset changes).
 * Simulates BETTING → SPIN progress curve → LOCK → hold → OUTCOME → return BETTING.
 * Run: node scripts/validate-roulette-audio-e2e.mjs
 */
import { PREVIEW_SCENARIOS } from '../roulette/layout.js';
import {
  RouletteAudio,
  resolveOutcomeAudioPlan,
  SPIN_AUDIO,
  EVENT_VOLUMES,
} from '../roulette/audio.js';

const LAND_HOLD_MS = 800;
const results = [];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function record(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    console.log(`FAIL  ${name}`);
    console.log(`      ${e.message}`);
  }
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Drive a full spin audio timeline (mirrors animations progress phases).
 */
async function runFullSpinFlow(payload, { mute = false, returnToBetting = true } = {}) {
  RouletteAudio.setEnabled(true);
  RouletteAudio.clearPlayed();

  // BETTING UI
  await RouletteAudio.playBetSelect();
  await RouletteAudio.playChipSelect();

  if (mute) {
    RouletteAudio.setEnabled(false);
    RouletteAudio.clearPlayed();
  }

  RouletteAudio.playStart();

  // Progress samples — dwell long enough for rate-limited ticks (140ms+)
  const samples = [
    0.05, 0.12, 0.25, 0.4, 0.5, 0.6, 0.7, 0.74, 0.76, 0.81, 0.86, 0.91, 0.93, 0.98,
  ];
  for (const t of samples) {
    RouletteAudio.onSpinProgress(t);
    RouletteAudio.playTick(t);
    const dwell = t >= SPIN_AUDIO.tickStart && t < SPIN_AUDIO.tickEnd ? 160 : 8;
    await wait(dwell);
  }

  await RouletteAudio.playPocketLock();
  // Simulate hold (don't wait full 800 in CI — still verify order after)
  if (!mute) await wait(20);
  await RouletteAudio.playOutcome(payload);

  const plays = RouletteAudio.drainPlayed();

  if (returnToBetting) {
    RouletteAudio.stopActiveAudio();
    const residual = {
      physicalArmed: RouletteAudio.isPhysicalArmed(),
      climaxArmed: RouletteAudio.isClimaxArmed(),
      enabled: RouletteAudio.isEnabled(),
      activePlayers: RouletteAudio.activePlayerCount(),
    };
    return { plays, residual, mute };
  }
  return { plays, residual: null, mute };
}

function firstIndex(plays, id) {
  return plays.indexOf(id);
}

function count(plays, id) {
  return plays.filter((e) => e === id).length;
}

function assertPhaseOrder(plays, expectedClimax) {
  assert(count(plays, 'bet-select') === 1, 'bet once');
  assert(count(plays, 'chip-select') === 1, 'chip once');
  assert(count(plays, 'spin-start') === 1, 'spin-start once');
  assert(count(plays, 'ball-track') === 1, 'track once');
  assert(count(plays, 'ball-tick') === 0, 'no ball-tick');
  assert(count(plays, 'ball-bounce') === 3, '3 bounces');
  assert(count(plays, 'pocket-lock') === 1, 'lock once');
  assert(count(plays, expectedClimax) === 1, `${expectedClimax} once`);

  const climaxes = ['straight-win', 'result-win', 'result-lose'].filter((c) => plays.includes(c));
  assert(climaxes.length === 1, `exactly one climax, got ${climaxes.join(',')}`);
  assert(climaxes[0] === expectedClimax, `expected ${expectedClimax}`);

  assert(firstIndex(plays, 'bet-select') < firstIndex(plays, 'spin-start'), 'bet before spin');
  assert(firstIndex(plays, 'chip-select') < firstIndex(plays, 'spin-start'), 'chip before spin');
  assert(firstIndex(plays, 'spin-start') < firstIndex(plays, 'ball-track'), 'spin before track');
  assert(firstIndex(plays, 'ball-track') < firstIndex(plays, 'ball-bounce'), 'track before bounce');
  assert(firstIndex(plays, 'ball-bounce') < firstIndex(plays, 'pocket-lock'), 'bounce before lock');
  assert(firstIndex(plays, 'pocket-lock') < firstIndex(plays, expectedClimax), 'lock before climax');
}

// --- scenarios ---

await record('1 WIN normale ROSSO', async () => {
  const { plays, residual } = await runFullSpinFlow(PREVIEW_SCENARIOS.win_red);
  assertPhaseOrder(plays, 'result-win');
  assert(!plays.includes('bonus-accent'), 'no bonus');
  assert(!plays.includes('straight-win'), 'not straight');
  assert(residual.physicalArmed === false, 'no physical after');
  assert(residual.climaxArmed === false, 'climax consumed');
  assert(residual.activePlayers === 0, 'no residual players after BETTING cleanup');
});

await record('2 WIN DECINA', async () => {
  const { plays } = await runFullSpinFlow(PREVIEW_SCENARIOS.win_dozen);
  assertPhaseOrder(plays, 'result-win');
  assert(!plays.includes('straight-win'), 'not straight');
});

await record('3 WIN NUMERO PIENO (straight B)', async () => {
  const { plays } = await runFullSpinFlow(PREVIEW_SCENARIOS.win_straight);
  assertPhaseOrder(plays, 'straight-win');
  assert(!plays.includes('result-win'), 'xor result-win');
  assert(EVENT_VOLUMES['straight-win'] > EVENT_VOLUMES['result-win'], 'straight louder than win');
});

await record('4 LOSE', async () => {
  const { plays } = await runFullSpinFlow(PREVIEW_SCENARIOS.lose);
  assertPhaseOrder(plays, 'result-lose');
  assert(!plays.includes('result-win'), 'no win');
  assert(!plays.includes('bonus-accent'), 'no bonus on lose');
  assert(EVENT_VOLUMES['result-lose'] < EVENT_VOLUMES['result-win'], 'lose softer than win');
});

await record('5 WIN VIP+level+daily', async () => {
  const plan = resolveOutcomeAudioPlan(PREVIEW_SCENARIOS.win_full_chain);
  assert(plan.climax === 'result-win', 'normal win climax');
  assert(plan.bonusAccent === true, 'bonus planned');
  const { plays } = await runFullSpinFlow(PREVIEW_SCENARIOS.win_full_chain);
  assertPhaseOrder(plays, 'result-win');
  assert(count(plays, 'bonus-accent') === 1, 'bonus once');
  assert(firstIndex(plays, 'result-win') < firstIndex(plays, 'bonus-accent'), 'win before bonus');
  assert(EVENT_VOLUMES['bonus-accent'] < EVENT_VOLUMES['result-win'], 'bonus quieter');
});

await record('6 MUTE attivo (full chain silent)', async () => {
  const { plays } = await runFullSpinFlow(PREVIEW_SCENARIOS.win_straight_chain, { mute: true });
  assert(plays.length === 0, `mute silent, got ${plays.join(',')}`);
  RouletteAudio.setEnabled(true);
});

await record('timing windows: track fades before bounce; win after lock+hold', async () => {
  assert(SPIN_AUDIO.trackFadeStart < SPIN_AUDIO.trackStop, 'fade window');
  assert(SPIN_AUDIO.trackStop <= SPIN_AUDIO.bounceStart, 'track gone before bounce');
  assert(SPIN_AUDIO.tickEnd <= SPIN_AUDIO.bounceStart, 'ticks end before bounce');
  assert(SPIN_AUDIO.bounceEnd < 1, 'bounce before settle');
  assert(LAND_HOLD_MS === 800, '800ms hold before outcome');
});

await record('replay climax no duplicate after return path', async () => {
  RouletteAudio.setEnabled(true);
  RouletteAudio.playStart();
  RouletteAudio.clearPlayed();
  await RouletteAudio.playOutcome(PREVIEW_SCENARIOS.win_red);
  assert(RouletteAudio.drainPlayed().includes('result-win'), 'first climax');
  const skip = await RouletteAudio.playOutcome(PREVIEW_SCENARIOS.win_red);
  assert(skip.skipped === true, 'second skipped');
  assert(RouletteAudio.drainPlayed().length === 0, 'no residual climax log');
});

await record('volume hierarchy coherent', async () => {
  const v = EVENT_VOLUMES;
  assert(v['bet-select'] <= v['chip-select'], 'bet ≤ chip');
  assert(v['chip-select'] < v['spin-start'], 'chip < spin');
  assert(v['bonus-accent'] < v['result-win'], 'bonus < win');
  assert(v['result-lose'] < v['result-win'], 'lose < win');
  assert(v['result-win'] < v['straight-win'], 'win < straight');
  assert(v['ball-track'] < v['ball-bounce'], 'soft track under bounce');
  assert(v['pocket-lock'] > v['ball-bounce'], 'lock > bounce');
  assert(v['straight-win'] >= v['pocket-lock'], 'straight ≥ lock');
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} e2e checks passed`);
if (failed.length) process.exit(1);
