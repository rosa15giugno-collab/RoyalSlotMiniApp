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
  betSelectionLabel,
  buildPayoutRows,
  buildSpinBody,
  outcomeHeadline,
  outcomeKicker,
  pocketColor,
  pushHistory,
} from '../roulette/layout.js';
import {
  Scene,
  bettingResetPatch,
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

record('spin body target_number null for non-straight', () => {
  assert(buildSpinBody({ bet: 500, betType: 'red', targetNumber: 17, actionId: 'a' }).target_number === null, 'red');
  assert(buildSpinBody({ bet: 500, betType: 'straight', targetNumber: 17, actionId: 'a' }).target_number === 17, 'straight');
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
  assert(app.includes('goResult(payload)'), 'go result');
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

record('NUOVA PUNTATA reset keeps amount clears bet', () => {
  const patch = bettingResetPatch();
  assert(patch.scene === Scene.BETTING, 'scene');
  assert(patch.betType === null, 'betType');
  assert(patch.targetNumber === null, 'target');
  assert(patch.pending === null, 'pending');
  assert(patch.lastPayload === null, 'payload');
  assert(app.includes('goBettingFresh'), 'handler');
  assert(app.includes('bettingResetPatch'), 'uses patch');
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

record('breakdown VIP chain + lose empty', () => {
  const rows = buildPayoutRows(PREVIEW_SCENARIOS.win_full_chain, String);
  assert(rows.some((r) => r.label === 'TOTALE'), 'total');
  assert(buildPayoutRows(PREVIEW_SCENARIOS.lose, String).length === 0, 'lose');
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

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
