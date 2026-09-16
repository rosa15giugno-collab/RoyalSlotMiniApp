/**
 * Roulette Mini App frontend contract checks (3-scene UX).
 * Run: node scripts/test-roulette-frontend.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  balanceLabel,
  controlsDisabled,
  errorCodeFromHttp,
  hasInitData,
  isRecoverableNetworkError,
} from '../roulette/auth-state.js';
import {
  BETS,
  DEFAULT_BET,
  ERROR_COPY,
  EUROPEAN_WHEEL_ORDER,
  PREVIEW_SCENARIOS,
  addChipToBets,
  betSelectionLabel,
  betsSummaryLabel,
  buildPayoutRows,
  buildSpinBody,
  canAddChip,
  isValidCornerNumbers,
  isValidSplitNumbers,
  MAGNET,
  numberCell,
  outcomeHeadline,
  outcomeKicker,
  pickMagneticSnap,
  pocketColor,
  previewEvaluateBets,
  pushHistory,
  resolveInsideSpot,
  resolveZeroSpot,
  totalBet,
  validateBetSlip,
  aimPreviewLabel,
  buildMagneticSnaps,
  coveredNumberSet,
  MAX_COVERED_NUMBERS_PER_SPIN,
  MAX_STRAIGHT_NUMBERS_PER_SPIN,
  MAX_TOTAL_STAKE_PER_SPIN,
} from '../roulette/layout.js';
import {
  Scene,
  bettingResetPatch,
  canRevealWinningMarks,
  canStartSpin,
  isBusyScene,
  sceneAfterAnimation,
  sceneAfterPayload,
} from '../roulette/scene.js';
import {
  RouletteAudio,
  isStraightWin,
  resolveOutcomeAudioPlan,
  tickIntervalForProgress,
  bounceHopIndexAt,
  SPIN_AUDIO,
} from '../roulette/audio.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const results = [];

function record(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      throw new Error(`Test "${name}" returned a Promise — use recordAsync`);
    }
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
    console.log(`FAIL  ${name}`);
    console.log(`      ${error.message}`);
  }
}

async function recordAsync(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
    console.log(`FAIL  ${name}`);
    console.log(`      ${error.message}`);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const app = readFileSync(join(root, 'roulette/app.js'), 'utf8');
const html = readFileSync(join(root, 'roulette/index.html'), 'utf8');
const css = readFileSync(join(root, 'roulette/style.css'), 'utf8');

record('stakes Mini App 500/1000/2000', () => {
  assert(JSON.stringify(BETS) === JSON.stringify([500, 1000, 2000]), 'BETS');
  assert(DEFAULT_BET === 500, 'default');
});

record('european wheel 0-36 order', () => {
  assert(EUROPEAN_WHEEL_ORDER.length === 37, '37');
  assert(EUROPEAN_WHEEL_ORDER[0] === 0, '0 first');
});

record('selection labels', () => {
  assert(betSelectionLabel({ betType: 'red' }) === 'ROSSO', 'red');
  assert(betSelectionLabel({ betType: 'dozen_2' }) === '2ª DECINA', 'dozen');
  assert(betSelectionLabel({ betType: 'straight', targetNumber: 17 }) === 'NUMERO 17', 'straight');
});

record('spin body uses bets array', () => {
  const red = buildSpinBody({ bet: 500, betType: 'red', targetNumber: 17, actionId: 'a' });
  assert(red.action_id === 'a', 'action');
  assert(red.bets.length === 1, 'one bet');
  assert(red.bets[0].bet_type === 'red', 'red type');
  assert(red.bets[0].amount === 500, 'amount');
  assert(red.bets[0].target_number === undefined, 'red no target');
  const straight = buildSpinBody({ bet: 500, betType: 'straight', targetNumber: 17, actionId: 'b' });
  assert(straight.bets[0].target_number === 17, 'straight target');
  const multi = buildSpinBody({
    actionId: 'c',
    bets: [
      { betType: 'red', amount: 500, targetNumber: null },
      { betType: 'dozen_2', amount: 1000, targetNumber: null },
      { betType: 'straight', amount: 500, targetNumber: 17 },
    ],
  });
  assert(multi.bets.length === 3, 'three');
  assert(multi.bets[2].target_number === 17, 'n17');
});

record('pocket colors red/black/zero', () => {
  assert(pocketColor(0) === 'green', '0');
  assert(pocketColor(32) === 'red', '32');
  assert(pocketColor(17) === 'black', '17');
});

record('initial scene BETTING', () => {
  assert(canStartSpin(Scene.BETTING) === true, 'can start');
  assert(canStartSpin(Scene.SPINNING) === false, 'no start spinning');
  assert(html.includes('data-scene="BETTING"'), 'html default');
  assert(app.includes("setScene(Scene.BETTING)"), 'boot betting');
});

record('GIRA → pending action + SPINNING after payload', () => {
  assert(app.includes('actionId: newActionId()'), 'mint');
  assert(app.includes('state.pending'), 'pending');
  assert(sceneAfterPayload() === Scene.SPINNING, 'after payload');
  assert(app.includes('playSpinAnimation'), 'spin scene');
});

record('animation → RESULT', () => {
  assert(sceneAfterAnimation() === Scene.RESULT, 'result scene');
  assert(app.includes('clearBettingPointerUi'), 'pointer ui cleanup');
  assert(app.includes('goResult(payload)'), 'go result');
  assert(html.includes('id="ghostChip"'), 'ghost html');
  assert(html.indexOf('id="ghostChip"') > html.indexOf('id="sceneBetting"'), 'ghost in betting tree');
  assert(html.indexOf('id="ghostChip"') < html.indexOf('id="sceneSpinning"'), 'ghost before spinning');
});

record('WIN / LOSE headlines', () => {
  assert(outcomeHeadline({ won: true, bet_type: 'red' }) === 'HAI VINTO', 'win');
  assert(outcomeHeadline({ won: false }) === 'RITENTA', 'lose');
  assert(outcomeHeadline({ won: true, bet_type: 'straight' }) === 'NUMERO PIENO!', 'straight');
  assert(outcomeKicker({ won: true, bet_type: 'straight' }) === 'GRANDE VINCITA', 'kicker');
  assert(outcomeKicker({ won: true, bet_type: 'red' }) === '', 'no kicker red');
});

await recordAsync('straight-win audio priority', async () => {
  assert(isStraightWin(PREVIEW_SCENARIOS.lose_straight) === false, 'straight lose flag');
  assert(isStraightWin(PREVIEW_SCENARIOS.win_straight) === true, 'straight win flag');
  assert(existsSync(join(root, 'roulette/audio/straight-win.wav')), 'runtime straight-win.wav');
  assert(
    String(RouletteAudio.RUNTIME_FILES['straight-win'] || '').includes('straight-win.wav'),
    'runtime maps to B file',
  );
  assert(!String(RouletteAudio.RUNTIME_FILES['straight-win'] || '').includes('candidates'), 'no candidates path');

  RouletteAudio.setEnabled(true);

  RouletteAudio.playStart();
  RouletteAudio.clearPlayed();
  await RouletteAudio.playOutcome(PREVIEW_SCENARIOS.lose_straight);
  assert(!RouletteAudio.peekPlayed().includes('straight-win'), 'straight lose → no straight-win');
  assert(RouletteAudio.drainPlayed().includes('result-lose'), 'straight lose → result-lose');

  RouletteAudio.playStart();
  RouletteAudio.clearPlayed();
  await RouletteAudio.playOutcome(PREVIEW_SCENARIOS.win_straight);
  const straightPlays = RouletteAudio.drainPlayed();
  assert(straightPlays.filter((e) => e === 'straight-win').length === 1, 'straight-win once');
  assert(!straightPlays.includes('result-win'), 'no normal result-win');

  // retry/replay guard: second playOutcome without new playStart → no double climax
  RouletteAudio.clearPlayed();
  const skipped = await RouletteAudio.playOutcome(PREVIEW_SCENARIOS.win_straight);
  assert(skipped.skipped === true, 'duplicate climax skipped');
  assert(RouletteAudio.drainPlayed().length === 0, 'no second straight-win');

  RouletteAudio.playStart();
  RouletteAudio.clearPlayed();
  await RouletteAudio.playOutcome(PREVIEW_SCENARIOS.win_red);
  const redPlays = RouletteAudio.drainPlayed();
  assert(redPlays.includes('result-win'), 'red → result-win');
  assert(!redPlays.includes('straight-win'), 'red → no straight-win');

  RouletteAudio.playStart();
  RouletteAudio.clearPlayed();
  await RouletteAudio.playOutcome(PREVIEW_SCENARIOS.win_dozen);
  assert(RouletteAudio.drainPlayed().includes('result-win'), 'dozen → result-win');

  for (const key of ['win_red', 'win_dozen']) {
    const plan = resolveOutcomeAudioPlan(PREVIEW_SCENARIOS[key]);
    assert(plan.climax === 'result-win', `${key} climax`);
  }

  const oddPlan = resolveOutcomeAudioPlan({ ...PREVIEW_SCENARIOS.win_red, bet_type: 'odd' });
  const evenPlan = resolveOutcomeAudioPlan({ ...PREVIEW_SCENARIOS.win_red, bet_type: 'even' });
  const blackPlan = resolveOutcomeAudioPlan({ ...PREVIEW_SCENARIOS.win_red, bet_type: 'black' });
  assert(oddPlan.climax === 'result-win', 'odd');
  assert(evenPlan.climax === 'result-win', 'even');
  assert(blackPlan.climax === 'result-win', 'black');

  const chainPlan = resolveOutcomeAudioPlan(PREVIEW_SCENARIOS.win_straight_chain);
  assert(chainPlan.climax === 'straight-win', 'chain climax');
  assert(chainPlan.bonusAccent === true, 'chain bonus accent');
  RouletteAudio.playStart();
  RouletteAudio.clearPlayed();
  await RouletteAudio.playOutcome(PREVIEW_SCENARIOS.win_straight_chain);
  const chainPlays = RouletteAudio.drainPlayed();
  assert(chainPlays.filter((e) => e === 'straight-win').length === 1, 'chain one fanfare');
  assert(!chainPlays.includes('result-win'), 'chain no result-win');
  assert(chainPlays.filter((e) => e === 'bonus-accent').length === 1, 'one accent only');

  RouletteAudio.playStart();
  RouletteAudio.setEnabled(false);
  RouletteAudio.clearPlayed();
  RouletteAudio.playBetSelect();
  RouletteAudio.playChipSelect();
  RouletteAudio.playPocketLock();
  await RouletteAudio.playOutcome(PREVIEW_SCENARIOS.win_straight);
  assert(RouletteAudio.drainPlayed().length === 0, 'mute → silent');
  RouletteAudio.setEnabled(true);
});

record('app uses pocket-lock → outcome router', () => {
  assert(app.includes('playPocketLock()'), 'pocket lock');
  assert(app.includes('await RouletteAudio.playOutcome(payload)'), 'await outcome');
  assert(app.includes('onSpinProgress'), 'spin progress audio');
  assert(!app.includes('playTick(raw)'), 'ball-tick not scheduled');
  assert(app.includes('playBetSelect()'), 'bet select wired');
  assert(app.includes('playChipSelect()'), 'chip select wired');
  assert(!app.includes('RouletteAudio.playWin()'), 'no direct playWin');
  assert(app.includes('isStraightWinPayload'), 'straight UI');
  assert(html.includes('resultKicker'), 'kicker');
});

await recordAsync('approved UI/outcome runtime mapping', async () => {
  const map = {
    'bet-select': 'bet-select.wav',
    'chip-select': 'chip-select.wav',
    'spin-start': 'spin-start.wav',
    'result-win': 'result-win.wav',
    'result-lose': 'result-lose.wav',
    'bonus-accent': 'bonus-accent.wav',
    'pocket-lock': 'pocket-lock.wav',
    'ball-track': 'ball-track.wav',
    'ball-tick': 'ball-tick.wav',
    'ball-bounce': 'ball-bounce.wav',
    'straight-win': 'straight-win.wav',
  };
  for (const [id, file] of Object.entries(map)) {
    assert(existsSync(join(root, `roulette/audio/${file}`)), `runtime file ${file}`);
    const href = String(RouletteAudio.RUNTIME_FILES[id] || '');
    assert(href.includes(file), `${id} mapped to ${file}`);
    assert(!href.includes('candidates'), `${id} not from candidates/`);
  }

  const sha = (rel) => createHash('sha256').update(readFileSync(join(root, rel))).digest('hex');
  const runtimeTrack = sha('roulette/audio/ball-track.wav');
  assert(runtimeTrack === sha('roulette/audio/candidates/ball-track/ball-soft-c.wav'), 'runtime track is BALL SOFT C');
  assert(runtimeTrack !== sha('roulette/audio/candidates/ball-track/ball-soft-b.wav'), 'not BALL SOFT B');
  for (const old of [
    'track-4a.wav', 'track-4b.wav', 'track-1a.wav',
    'track-new-a.wav', 'track-new-b.wav', 'track-new-c.wav', 'track-new-d.wav',
    'ball-soft-a.wav', 'ball-soft-b.wav', 'ball-soft-d.wav',
  ]) {
    const p = join(root, 'roulette/audio/candidates/ball-track', old);
    if (existsSync(p)) {
      assert(runtimeTrack !== createHash('sha256').update(readFileSync(p)).digest('hex'), `old ${old} excluded`);
    }
  }

  const vols = RouletteAudio.EVENT_VOLUMES;
  assert(vols['ball-track'] === 0.4, 'soft C track gain');
  assert(vols['spin-start'] === 0.78, 'SPIN B gain unchanged');
  assert(RouletteAudio.isSpinStartEnabled() === true, 'definitive spin-start on');
  assert(vols['bet-select'] < vols['spin-start'], 'bet < spin');
  assert(vols['chip-select'] < vols['spin-start'], 'chip < spin');
  assert(vols['bonus-accent'] < vols['result-win'], 'bonus < win');
  assert(vols['result-lose'] < vols['result-win'], 'lose < win');
  assert(vols['result-win'] < vols['straight-win'], 'win < straight');
  assert(vols['pocket-lock'] < vols['straight-win'], 'lock < straight');

  RouletteAudio.setEnabled(true);
  RouletteAudio.clearPlayed();
  await RouletteAudio.playBetSelect();
  assert(RouletteAudio.drainPlayed().includes('bet-select'), 'bet A plays');

  RouletteAudio.clearPlayed();
  await RouletteAudio.playChipSelect();
  assert(RouletteAudio.drainPlayed().includes('chip-select'), 'chip A plays');

  RouletteAudio.clearPlayed();
  await RouletteAudio.playWin();
  assert(RouletteAudio.drainPlayed().includes('result-win'), 'win B plays');

  RouletteAudio.clearPlayed();
  await RouletteAudio.playLose();
  assert(RouletteAudio.drainPlayed().includes('result-lose'), 'lose D plays');

  RouletteAudio.clearPlayed();
  await RouletteAudio.playBonusAccent();
  assert(RouletteAudio.drainPlayed().includes('bonus-accent'), 'bonus A plays');
});

await recordAsync('physical SFX runtime + sequence guards', async () => {
  const files = [
    'pocket-lock',
    'ball-track',
    'ball-tick',
    'ball-bounce',
    'straight-win',
    'spin-start',
    'result-win',
    'result-lose',
    'bet-select',
    'chip-select',
    'bonus-accent',
  ];
  for (const id of files) {
    assert(existsSync(join(root, `roulette/audio/${id}.wav`)), `runtime ${id}.wav`);
    const href = String(RouletteAudio.RUNTIME_FILES[id] || '');
    assert(href.includes(`${id}.wav`), `${id} mapped`);
    assert(!href.includes('candidates'), `${id} not from candidates/`);
  }

  assert(tickIntervalForProgress(0.2) === 140, 'tick fast early');
  assert(tickIntervalForProgress(0.5) === 220, 'tick mid');
  assert(tickIntervalForProgress(0.7) === 480, 'tick slow late');
  assert(tickIntervalForProgress(0.8) === null, 'tick stop before lock');
  assert(SPIN_AUDIO.trackFadeStart < SPIN_AUDIO.bounceStart, 'fade before bounce');

  const fired = new Set();
  // Hop windows (u≥peak-0.02): raw ≈ 0.802 / 0.847 / 0.892 with current bounceHopTs.
  assert(bounceHopIndexAt(0.802, fired) === 0, 'hop0');
  fired.add(0);
  assert(bounceHopIndexAt(0.85, fired) === 1, 'hop1');
  fired.add(1);
  assert(bounceHopIndexAt(0.895, fired) === 2, 'hop2');
  fired.add(2);
  assert(bounceHopIndexAt(0.92, fired) === -1, 'no more hops');

  RouletteAudio.setEnabled(true);
  RouletteAudio.playStart();
  const startPlays = RouletteAudio.drainPlayed();
  assert(startPlays.filter((e) => e === 'spin-start').length === 1, 'spin-start once (B)');
  assert(startPlays.filter((e) => e === 'ball-track').length === 1, 'track once on start');
  assert(startPlays.indexOf('spin-start') < startPlays.indexOf('ball-track'), 'spin before track');

  RouletteAudio.onSpinProgress(0.3);
  RouletteAudio.playTick(0.3);
  RouletteAudio.playTick(0.3);
  const mid = RouletteAudio.drainPlayed();
  assert(!mid.includes('ball-tick'), 'ball-tick never plays');

  RouletteAudio.onSpinProgress(0.81);
  RouletteAudio.onSpinProgress(0.86);
  RouletteAudio.onSpinProgress(0.91);
  const bouncePlays = RouletteAudio.drainPlayed();
  assert(bouncePlays.filter((e) => e === 'ball-bounce').length === 3, '3 hop bounces');
  assert(!bouncePlays.includes('pocket-lock'), 'no lock during bounce');

  await RouletteAudio.playPocketLock();
  const lockPlays = RouletteAudio.drainPlayed();
  assert(lockPlays.filter((e) => e === 'pocket-lock').length === 1, 'lock once');
  await RouletteAudio.playPocketLock();
  assert(RouletteAudio.drainPlayed().length === 0, 'no duplicate lock');

  await RouletteAudio.playOutcome(PREVIEW_SCENARIOS.win_straight);
  const climax = RouletteAudio.drainPlayed();
  assert(climax.includes('straight-win'), 'straight after lock');
  assert(!climax.includes('result-win'), 'xor result-win');

  // replay cached climax without new playStart
  RouletteAudio.clearPlayed();
  const replay = await RouletteAudio.playOutcome(PREVIEW_SCENARIOS.win_red);
  assert(replay.skipped === true, 'replay climax skipped');
  assert(RouletteAudio.drainPlayed().length === 0, 'replay no duplicate');

  // mute silences full chain including betting UI
  RouletteAudio.playStart();
  RouletteAudio.setEnabled(false);
  RouletteAudio.clearPlayed();
  await RouletteAudio.playBetSelect();
  await RouletteAudio.playChipSelect();
  RouletteAudio.onSpinProgress(0.3);
  RouletteAudio.playTick(0.3);
  await RouletteAudio.playPocketLock();
  await RouletteAudio.playOutcome(PREVIEW_SCENARIOS.win_dozen);
  await RouletteAudio.playBonusAccent();
  assert(RouletteAudio.drainPlayed().length === 0, 'mute total silence');
  RouletteAudio.setEnabled(true);

  // normal win + bonus once
  RouletteAudio.playStart();
  RouletteAudio.clearPlayed();
  await RouletteAudio.playOutcome({
    ...PREVIEW_SCENARIOS.win_red,
    vip_applied: true,
    vip_multiplier: 1.1,
  });
  const bonusWin = RouletteAudio.drainPlayed();
  assert(bonusWin.includes('result-win'), 'normal win B');
  assert(!bonusWin.includes('straight-win'), 'not straight');
  assert(bonusWin.filter((e) => e === 'bonus-accent').length === 1, 'bonus once');
});

await recordAsync('RESULT→BETTING stopActiveAudio clears residual SFX', async () => {
  class FakeAudio {
    constructor(src) {
      this.src = String(src || '');
      this.volume = 1;
      this.loop = false;
      this.paused = true;
      this.currentTime = 0;
      this._ended = null;
      this._timer = null;
    }
    addEventListener(type, fn) {
      if (type === 'ended') this._ended = fn;
    }
    play() {
      this.paused = false;
      // Short virtual duration for natural completion; interrupt tests stop sooner.
      this._timer = setTimeout(() => {
        if (!this.paused && this._ended) this._ended();
      }, 40);
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
      if (this._timer) {
        clearTimeout(this._timer);
        this._timer = null;
      }
    }
    dispatchEvent(ev) {
      if (ev?.type === 'ended') {
        this.pause();
        if (this._ended) this._ended();
      }
      return true;
    }
  }
  const prevAudio = globalThis.Audio;
  globalThis.Audio = FakeAudio;

  try {
    assert(app.includes('RouletteAudio.stopActiveAudio()'), 'goBettingFresh wires stop');
    assert(typeof RouletteAudio.stopActiveAudio === 'function', 'helper exported');

    RouletteAudio.setEnabled(true);
    const muteBefore = RouletteAudio.isEnabled();

    // 1) straight-win mid-play → stop
    RouletteAudio.clearPlayed();
    RouletteAudio.playStart();
    RouletteAudio.clearPlayed();
    const straightP = RouletteAudio.playStraightWin();
    assert(RouletteAudio.activePlayerCount() >= 1, 'straight-win active');
    RouletteAudio.stopActiveAudio();
    await straightP;
    assert(RouletteAudio.activePlayerCount() === 0, 'straight-win stopped');
    assert(RouletteAudio.isEnabled() === muteBefore, 'mute preserved after straight stop');

    // 2) normal-win mid-play → stop
    const winP = RouletteAudio.playWin();
    assert(RouletteAudio.activePlayerCount() >= 1, 'result-win active');
    RouletteAudio.stopActiveAudio();
    await winP;
    assert(RouletteAudio.activePlayerCount() === 0, 'result-win stopped');

    // 3) bonus-accent mid-play → stop
    const bonusP = RouletteAudio.playBonusAccent();
    assert(RouletteAudio.activePlayerCount() >= 1, 'bonus active');
    RouletteAudio.stopActiveAudio();
    await bonusP;
    assert(RouletteAudio.activePlayerCount() === 0, 'bonus stopped');

    // 4) no residual + flags clear (BETTING silence)
    assert(RouletteAudio.isPhysicalArmed() === false, 'physical clear');
    assert(RouletteAudio.isClimaxArmed() === false, 'climax clear');
    assert(RouletteAudio.activePlayerCount() === 0, 'no residual players');

    // 5) mute preference preserved when already muted
    RouletteAudio.setEnabled(false);
    assert(RouletteAudio.isEnabled() === false, 'muted');
    RouletteAudio.stopActiveAudio();
    assert(RouletteAudio.isEnabled() === false, 'still muted after cleanup');
    RouletteAudio.setEnabled(true);
    assert(RouletteAudio.isEnabled() === true, 'unmute still works');

    // 6) next round plays full chain again
    RouletteAudio.clearPlayed();
    RouletteAudio.playStart();
    const start = RouletteAudio.drainPlayed();
    assert(start.includes('spin-start'), 'next spin-start');
    assert(start.includes('ball-track'), 'next ball-track');
    await RouletteAudio.playPocketLock();
    const outcomeP = RouletteAudio.playOutcome(PREVIEW_SCENARIOS.win_straight);
    // Allow climax to start, then ensure a fresh stop still leaves silence —
    // and that natural completion also works when not interrupted.
    await outcomeP;
    const round = RouletteAudio.drainPlayed();
    assert(round.includes('pocket-lock'), 'next lock');
    assert(round.includes('straight-win'), 'next straight');
    RouletteAudio.stopActiveAudio();
    assert(RouletteAudio.activePlayerCount() === 0, 'cleanup after round');
  } finally {
    if (prevAudio === undefined) delete globalThis.Audio;
    else globalThis.Audio = prevAudio;
    RouletteAudio.setEnabled(true);
    RouletteAudio.stopActiveAudio();
    RouletteAudio.clearPlayed();
  }
});

record('NUOVA PUNTATA reset keeps amount clears bets', () => {
  const patch = bettingResetPatch();
  assert(patch.scene === Scene.BETTING, 'scene');
  assert(Array.isArray(patch.bets) && patch.bets.length === 0, 'bets');
  assert(patch.betType === null, 'betType');
  assert(patch.targetNumber === null, 'target');
  assert(patch.pending === null, 'pending');
  assert(patch.lastPayload === null, 'payload');
  assert(app.includes('goBettingFresh'), 'handler');
  assert(app.includes('bettingResetPatch'), 'uses patch');
  assert(app.includes('clearPlacedBets'), 'annulla');
  assert(html.includes('ANNULLA PUNTATE'), 'annulla label');
});

record('action_id reset only after RESULT', () => {
  assert(app.includes('// Clear pending only after round concluded'), 'comment');
  assert(/goResult[\s\S]*state\.pending = null/.test(app), 'clear in goResult');
});

record('retry same action_id', () => {
  assert(app.includes('Keep pending action_id for retry'), 'retry comment');
  assert(app.includes('if (state.pending) runSpin()'), 'retry click');
  assert(isBusyScene(Scene.NETWORK_ERROR) === true, 'network busy');
});

record('double spin blocked', () => {
  assert(app.includes('if (busy()) return'), 'guard');
  assert(isBusyScene(Scene.SPINNING) === true, 'spinning busy');
});

record('backend authoritative number', () => {
  assert(app.includes('spinToNumber(payload.number'), 'server number');
  assert(!/spinToNumber\(\s*Math\.random/.test(app), 'no rng');
});

record('auth + network', () => {
  assert(controlsDisabled({ authenticated: false, busy: false, hasSelection: true }).spin === true, 'spin off');
  assert(balanceLabel(1, false) === '—', 'dash');
  assert(errorCodeFromHttp(401, 'x', { AUTH_ERROR: true }) === 'AUTH_ERROR', '401');
  assert(errorCodeFromHttp(500, 'nope', ERROR_COPY) === 'API_ERROR', '500→API_ERROR');
  assert(errorCodeFromHttp(422, 'INVALID_BET', ERROR_COPY) === 'INVALID_BET', 'known detail');
  assert(isRecoverableNetworkError({ code: 'NETWORK_ERROR' }) === true, 'net');
  assert(isRecoverableNetworkError({ code: 'API_ERROR' }) === false, 'api not connection scene');
  assert(hasInitData('') === false, 'no init');
  assert(html.includes('sceneNetwork'), 'network scene');
  assert(html.includes('sceneAuth'), 'auth scene');
});

record('history limit 10', () => {
  let hist = [];
  for (let i = 0; i < 12; i += 1) hist = pushHistory(hist, { number: i });
  assert(hist.length === 10, 'cap');
});

record('breakdown VIP chain + lose still shows totals', () => {
  const rows = buildPayoutRows(PREVIEW_SCENARIOS.win_full_chain, String);
  assert(rows.some((r) => r.label === 'TOTALE'), 'win total');
  assert(rows.some((r) => r.label === 'Puntata totale'), 'staked');
  assert(rows.some((r) => r.label === 'Vincita Roulette'), 'standard');
  assert(rows.some((r) => r.label === 'BONUS CASINÒ'), 'capped bonus');
  assert(!rows.some((r) => r.label === 'ZERO BONUS'), 'no zero row');
  const lose = buildPayoutRows(PREVIEW_SCENARIOS.lose, String);
  assert(lose.some((r) => r.label === 'Puntata totale'), 'lose stake');
  assert(lose.some((r) => r.label === 'TOTALE'), 'lose win total');
  assert(!lose.some((r) => r.label === 'BONUS CASINÒ'), 'no bonus on lose');
});

record('zero bonus copy from payload only', () => {
  assert(outcomeHeadline(PREVIEW_SCENARIOS.win_zero) === 'ZERO BONUS', 'headline');
  assert(outcomeKicker(PREVIEW_SCENARIOS.win_zero).includes('250'), 'kicker chips');
  const rows = buildPayoutRows(PREVIEW_SCENARIOS.win_zero, String);
  assert(rows.some((r) => r.label === 'ZERO BONUS'), 'zero row');
  assert(html.includes('resultZeroBonus'), 'hero slot');
});

record('preview spin scenarios present', () => {
  assert(PREVIEW_SCENARIOS.spin_32_red.number === 32, '32');
  assert(PREVIEW_SCENARIOS.spin_17_black.color === 'black', '17');
  assert(PREVIEW_SCENARIOS.spin_0_green.number === 0, '0');
});

record('3 scene panels in HTML', () => {
  assert(html.includes('sceneBetting'), 'betting');
  assert(html.includes('sceneSpinning'), 'spinning');
  assert(html.includes('sceneResult'), 'result');
  assert(html.includes('NUOVA PUNTATA'), 'cta');
});

record('multi-bet merge same position', () => {
  let placed = [];
  placed = addChipToBets(placed, { betType: 'straight', targetNumber: 17, amount: 500, balance: 20000 }).bets;
  placed = addChipToBets(placed, { betType: 'straight', targetNumber: 17, amount: 1000, balance: 20000 }).bets;
  assert(placed.length === 1, 'one stack');
  assert(placed[0].amount === 1500, '1500');
  assert(totalBet(placed) === 1500, 'total');
});

record('multi-bet three positions payload', () => {
  let placed = [];
  placed = addChipToBets(placed, { betType: 'red', amount: 500, balance: 20000 }).bets;
  placed = addChipToBets(placed, { betType: 'dozen_2', amount: 1000, balance: 20000 }).bets;
  placed = addChipToBets(placed, { betType: 'straight', targetNumber: 17, amount: 500, balance: 20000 }).bets;
  assert(totalBet(placed) === 2000, 'total 2000');
  assert(betsSummaryLabel(placed) === '3 PUNTATE', 'summary');
  const body = buildSpinBody({ bets: placed, actionId: 'multi-1' });
  assert(body.bets.length === 3, '3 api bets');
  assert(body.bets[0].bet_type === 'red', 'red');
  assert(body.bets[1].amount === 1000, 'dozen amt');
  assert(body.bets[2].target_number === 17, 'n17');
});

record('cannot add chip over balance', () => {
  const placed = [{ betType: 'red', targetNumber: null, amount: 2000 }];
  assert(canAddChip(placed, 500, 2000) === false, 'blocked');
  const result = addChipToBets(placed, { betType: 'black', amount: 500, balance: 2000 });
  assert(result.error === 'INSUFFICIENT_CHIPS', 'error');
  assert(result.bets.length === 1, 'unchanged');
});

record('preview evaluate 3 bets on 17', () => {
  const evaluated = previewEvaluateBets([
    { betType: 'red', targetNumber: null, amount: 500 },
    { betType: 'dozen_2', targetNumber: null, amount: 1000 },
    { betType: 'straight', targetNumber: 17, amount: 500 },
  ], 17);
  assert(evaluated.total_bet === 2000, 'stake');
  assert(evaluated.bets[0].won === false, 'red lose on black');
  assert(evaluated.bets[1].won === true, 'dozen');
  assert(evaluated.bets[2].won === true, 'straight');
  assert(evaluated.base_credit_total === 21000, '21000');
});

record('multi-bet audio straight still fanfare', () => {
  const plan = resolveOutcomeAudioPlan(PREVIEW_SCENARIOS.win_multi);
  assert(plan.climax === 'straight-win', 'straight in mix');
});

record('app posts bets array not single bet_type only', () => {
  assert(app.includes('buildSpinBody({'), 'builder');
  assert(app.includes('bets: pending.bets'), 'pending bets');
  assert(app.includes('placeBet'), 'place');
  assert(app.includes('clearPlacedBets'), 'clear');
});

record('split geometry adjacent vs not', () => {
  assert(isValidSplitNumbers([17, 20]) === true, 'vertical 17-20');
  assert(isValidSplitNumbers([16, 17]) === true, 'horizontal 16-17');
  assert(isValidSplitNumbers([17, 19]) === false, 'not adjacent');
  assert(isValidSplitNumbers([0, 1]) === true, '0-1');
  assert(isValidSplitNumbers([0, 2]) === true, '0-2');
  assert(isValidSplitNumbers([0, 3]) === true, '0-3');
  assert(isValidSplitNumbers([0, 4]) === false, '0-4');
});

record('corner geometry 2x2 vs zero/arbitrary', () => {
  assert(isValidCornerNumbers([17, 18, 20, 21]) === true, '2x2');
  assert(isValidCornerNumbers([21, 17, 20, 18]) === true, 'order');
  assert(isValidCornerNumbers([1, 2, 3, 4]) === false, 'not 2x2');
  assert(isValidCornerNumbers([0, 1, 2, 3]) === false, 'zero');
});

record('hit testing center/edge/corner', () => {
  const straight = resolveInsideSpot({ row: 5, col: 1, localX: 0.5, localY: 0.5, n: 17 });
  assert(straight.betType === 'straight' && straight.targetNumber === 17, 'center');
  const splitV = resolveInsideSpot({ row: 5, col: 1, localX: 0.5, localY: 0.97, n: 17 });
  assert(splitV.betType === 'split' && splitV.numbers.join(',') === '17,20', 'bottom split');
  const splitH = resolveInsideSpot({ row: 5, col: 1, localX: 0.97, localY: 0.5, n: 17 });
  assert(splitH.betType === 'split' && splitH.numbers.join(',') === '17,18', 'right split');
  const corner = resolveInsideSpot({ row: 5, col: 1, localX: 0.97, localY: 0.97, n: 17 });
  assert(corner.betType === 'corner' && corner.numbers.join(',') === '17,18,20,21', 'corner');
  const zeroSplit = resolveZeroSpot(0.5, 0.9);
  assert(zeroSplit.betType === 'split' && zeroSplit.numbers.join(',') === '0,2', 'zero mid');
  const zeroStraight = resolveZeroSpot(0.5, 0.4);
  assert(zeroStraight.betType === 'straight' && zeroStraight.targetNumber === 0, 'zero body');
});

record('magnetic snap prefers straight on small miss', () => {
  const w = 40;
  const h = 28;
  const rects = {};
  rects[0] = { left: 0, top: 0, width: 120, height: 26 };
  for (let n = 1; n <= 36; n += 1) {
    const cell = numberCell(n);
    rects[n] = { left: cell.col * w, top: 26 + cell.row * h, width: w, height: h };
  }
  const snaps = buildMagneticSnaps(rects);
  const c17 = { x: 40 + 20, y: 26 + 5 * 28 + 14 };
  const pick = (x, y) => pickMagneticSnap(x, y, snaps, MAGNET, rects);
  assert(MAGNET.splitPx === 6, 'split px');
  assert(MAGNET.cornerPx === 11, 'corner px');
  const mid = pick(c17.x, c17.y);
  assert(mid.betType === 'straight' && mid.targetNumber === 17, 'center 17');
  const left = pick(c17.x - 8, c17.y);
  assert(left.betType === 'straight' && left.targetNumber === 17, 'slight left');
  const right = pick(c17.x + 8, c17.y);
  assert(right.betType === 'straight' && right.targetNumber === 17, 'slight right');
  const up = pick(c17.x, c17.y - 8);
  assert(up.betType === 'straight' && up.targetNumber === 17, 'slight above');
  const down = pick(c17.x, c17.y + 8);
  assert(down.betType === 'straight' && down.targetNumber === 17, 'slight below');
  const nearLine = pick(c17.x, c17.y + 12);
  assert(nearLine.betType === 'split' && nearLine.numbers.join(',') === '17,20', '2px from 17/20');
  const split = pick(c17.x, c17.y + 14);
  assert(split.betType === 'split' && split.numbers.join(',') === '17,20', 'near 17/20 line');
  const corner = pick(c17.x + 20, c17.y + 14);
  assert(corner.betType === 'corner' && corner.numbers.join(',') === '17,18,20,21', '17/18/20/21');
  assert(aimPreviewLabel(mid) === 'NUMERO 17', 'label straight');
  assert(aimPreviewLabel(split) === 'SPLIT 17–20', 'label split');
  assert(aimPreviewLabel(corner) === 'CORNER 17·18·20·21', 'label corner');
});

record('split/corner payload and stack', () => {
  let placed = [];
  placed = addChipToBets(placed, { betType: 'split', numbers: [17, 20], amount: 500, balance: 20000 }).bets;
  placed = addChipToBets(placed, { betType: 'split', numbers: [20, 17], amount: 1000, balance: 20000 }).bets;
  assert(placed.length === 1, 'one stack');
  assert(placed[0].amount === 1500, '1500');
  const body = buildSpinBody({ bets: placed, actionId: 'split-1' });
  assert(body.bets[0].bet_type === 'split', 'type');
  assert(body.bets[0].numbers.join(',') === '17,20', 'nums');
  placed = addChipToBets(placed, { betType: 'corner', numbers: [21, 18, 17, 20], amount: 500, balance: 20000 }).bets;
  assert(placed.length === 2, 'two positions');
  const mixed = previewEvaluateBets(placed, 17);
  assert(mixed.bets[0].base_credit === 27000, 'split 1500x18');
  assert(mixed.bets[1].base_credit === 4500, 'corner 500x9');
});

record('drag wiring tap still present', () => {
  assert(app.includes('pointerdown'), 'pointerdown');
  assert(app.includes('pointermove'), 'pointermove');
  assert(app.includes('pointerup'), 'pointerup');
  assert(app.includes('pointercancel'), 'pointercancel');
  assert(app.includes('ghostChip'), 'ghost');
  assert(app.includes('GHOST_LIFT'), 'ghost lift');
  assert(app.includes('is-chip-dragging'), 'no scroll class');
  assert(app.includes('bindChipDrag'), 'chip drag');
  assert(app.includes('resolveDrop'), 'drop');
  assert(app.includes('showAim'), 'aim preview');
  assert(app.includes('pickMagneticSnap'), 'magnet');
  assert(html.includes('tokenLayer'), 'tokens');
  assert(html.includes('ghostChip'), 'ghost html');
  assert(html.includes('aimHint'), 'aim hint');
  assert(app.includes('selectOutside'), 'tap outside');
  assert(app.includes('ANNULLA') || html.includes('ANNULLA PUNTATE'), 'clear');
  assert(app.includes('clearBettingPointerUi'), 'cleanup fn');
  assert(css.includes('.placed-chip.spot-500::after') || css.includes('.placed-chip.spot-2000::after'), 'no result chip leak');
  assert(/\.ghost-chip(?:\.chip)?\s*,\s*\.ghost-chip\.chip/.test(css) || css.includes('.ghost-chip.chip'), 'ghost stays fixed');
});

record('no street/sixline/trio/basket in live app', () => {
  assert(!app.includes('sixline'), 'no sixline');
  assert(!app.includes('trio-0'), 'no trio');
  assert(!app.includes('basket-0'), 'no basket');
  assert(!html.includes('street'), 'no street html');
});

record('winning marks only on RESULT', () => {
  assert(canRevealWinningMarks(Scene.BETTING) === false, 'betting');
  assert(canRevealWinningMarks(Scene.SPINNING) === false, 'spinning');
  assert(canRevealWinningMarks(Scene.RESULT) === true, 'result');
  const apply = app.slice(app.indexOf('async function applyServerPayload'));
  const beforeSpin = apply.split('await playSpinAnimation')[0];
  assert(!beforeSpin.includes('state.lastPayload = payload'), 'payload hidden until reveal');
  assert(app.includes('canRevealWinningMarks(state.scene)'), 'paint uses helper');
});

record('complementary red+black even+odd blocked', () => {
  let placed = addChipToBets([], { betType: 'red', amount: 500, balance: 20000 }).bets;
  const black = addChipToBets(placed, { betType: 'black', amount: 500, balance: 20000 });
  assert(black.error === 'COMPLEMENTARY_COLOR', 'red+black');
  assert(black.bets.length === 1, 'red kept');
  placed = addChipToBets([], { betType: 'even', amount: 500, balance: 20000 }).bets;
  const odd = addChipToBets(placed, { betType: 'odd', amount: 500, balance: 20000 });
  assert(odd.error === 'COMPLEMENTARY_PARITY', 'even+odd');
  assert(ERROR_COPY.COMPLEMENTARY_COLOR.includes('Rosso e Nero'), 'copy color');
  assert(ERROR_COPY.COMPLEMENTARY_PARITY.includes('Pari e Dispari'), 'copy parity');
});

record('low+high blocked at slip layer', () => {
  assert(
    validateBetSlip([
      { betType: 'low', amount: 500 },
      { betType: 'high', amount: 500 },
    ]) === 'COMPLEMENTARY_RANGE',
    'range',
  );
});

record('dozens 1 and 2 ok, 3 rejected', () => {
  let placed = addChipToBets([], { betType: 'dozen_1', amount: 500, balance: 20000 }).bets;
  placed = addChipToBets(placed, { betType: 'dozen_2', amount: 500, balance: 20000 }).bets;
  assert(placed.length === 2, 'two dozens');
  const third = addChipToBets(placed, { betType: 'dozen_3', amount: 500, balance: 20000 });
  assert(third.error === 'MAX_DOZENS', 'third blocked');
  assert(third.bets.length === 2, 'unchanged');
});

record('12 straight ok, 13 rejected, duplicates merge', () => {
  let placed = [];
  for (let n = 0; n < MAX_STRAIGHT_NUMBERS_PER_SPIN; n += 1) {
    placed = addChipToBets(placed, { betType: 'straight', targetNumber: n, amount: 500, balance: 20000 }).bets;
  }
  assert(placed.length === 12, '12 numbers');
  const extra = addChipToBets(placed, { betType: 'straight', targetNumber: 12, amount: 500, balance: 20000 });
  assert(extra.error === 'MAX_STRAIGHT', '13th number');
  const stack = addChipToBets(placed, { betType: 'straight', targetNumber: 0, amount: 500, balance: 20000 });
  assert(stack.error === null, 'stack same number');
  assert(stack.bets[0].amount === 1000, '0 stacked');
});

record('total stake cap', () => {
  let placed = [];
  for (let n = 0; n < 5; n += 1) {
    placed = addChipToBets(placed, { betType: 'straight', targetNumber: n, amount: 2000, balance: 50000 }).bets;
  }
  assert(totalBet(placed) === 10000, 'at cap');
  const over = addChipToBets(placed, { betType: 'straight', targetNumber: 5, amount: 500, balance: 50000 });
  assert(over.error === 'MAX_TOTAL_STAKE', 'over cap');
  assert(canAddChip(placed, 500, 50000) === false, 'canAddChip cap');
  assert(MAX_TOTAL_STAKE_PER_SPIN === 10000, 'medium default');
});

record('stake cap copy in betting chrome', () => {
  assert(html.includes('PUNTATA TOTALE'), 'label');
  assert(MAX_TOTAL_STAKE_PER_SPIN === 10000, 'cap 10000');
  assert(MAX_COVERED_NUMBERS_PER_SPIN === 24, 'coverage 24');
});

record('two dozens ok if coverage is 24', () => {
  let placed = addChipToBets([], { betType: 'dozen_1', amount: 500, balance: 20000 }).bets;
  placed = addChipToBets(placed, { betType: 'dozen_2', amount: 500, balance: 20000 }).bets;
  assert(placed.length === 2, 'two dozens');
  assert(coveredNumberSet(placed).size === 24, 'union 24');
  assert(validateBetSlip(placed) === null, 'allowed');
});

record('two dozens plus already-covered straight ok', () => {
  const slip = [
    { betType: 'dozen_1', amount: 500 },
    { betType: 'dozen_2', amount: 500 },
    { betType: 'straight', targetNumber: 5, amount: 500 },
  ];
  assert(coveredNumberSet(slip).size === 24, 'still 24');
  assert(validateBetSlip(slip) === null, 'allowed');
  let placed = addChipToBets([], { betType: 'dozen_1', amount: 500, balance: 20000 }).bets;
  placed = addChipToBets(placed, { betType: 'dozen_2', amount: 500, balance: 20000 }).bets;
  const extra = addChipToBets(placed, { betType: 'straight', targetNumber: 5, amount: 500, balance: 20000 });
  assert(extra.error === null, 'covered straight');
});

record('two dozens plus external straight rejected', () => {
  let placed = addChipToBets([], { betType: 'dozen_1', amount: 500, balance: 20000 }).bets;
  placed = addChipToBets(placed, { betType: 'dozen_2', amount: 500, balance: 20000 }).bets;
  const extra = addChipToBets(placed, { betType: 'straight', targetNumber: 25, amount: 500, balance: 20000 });
  assert(extra.error === 'MAX_COVERED', 'external');
  assert(extra.bets.length === 2, 'unchanged');
});

record('dozen1+dozen2+12 straights of dozen3 rejected', () => {
  const slip = [
    { betType: 'dozen_1', amount: 500 },
    { betType: 'dozen_2', amount: 500 },
    ...Array.from({ length: 12 }, (_, i) => ({ betType: 'straight', targetNumber: 25 + i, amount: 500 })),
  ];
  assert(coveredNumberSet(slip).size === 36, 'full 1-36');
  assert(validateBetSlip(slip) === 'MAX_COVERED', 'blocked');
});

record('red plus extra numbers over 24 rejected', () => {
  const slip = [
    { betType: 'red', amount: 500 },
    ...[2, 4, 6, 8, 10, 11, 13].map((n) => ({ betType: 'straight', targetNumber: n, amount: 500 })),
  ];
  assert(coveredNumberSet(slip).size === 25, '25');
  assert(validateBetSlip(slip) === 'MAX_COVERED', 'blocked');
});

record('24 covered ok, 25 rejected, 0 counts', () => {
  const twentyFour = [
    { betType: 'red', amount: 500 },
    ...[2, 4, 6, 8, 10, 11].map((n) => ({ betType: 'straight', targetNumber: n, amount: 500 })),
  ];
  assert(coveredNumberSet(twentyFour).size === 24, '24');
  assert(validateBetSlip(twentyFour) === null, '24 ok');
  const twentyFive = [...twentyFour, { betType: 'straight', targetNumber: 13, amount: 500 }];
  assert(coveredNumberSet(twentyFive).size === 25, '25');
  assert(validateBetSlip(twentyFive) === 'MAX_COVERED', '25 blocked');
  const withZero = [
    { betType: 'dozen_1', amount: 500 },
    { betType: 'dozen_2', amount: 500 },
    { betType: 'straight', targetNumber: 0, amount: 500 },
  ];
  assert(coveredNumberSet(withZero).has(0), '0 in union');
  assert(coveredNumberSet(withZero).size === 25, '0 makes 25');
  assert(validateBetSlip(withZero) === 'MAX_COVERED', '0 counts');
  assert(ERROR_COPY.MAX_COVERED.includes('numeri coperti'), 'copy');
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
