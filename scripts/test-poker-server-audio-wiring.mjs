/**
 * Server-mode audio wiring tests — run: node scripts/test-poker-server-audio-wiring.mjs
 * No DOM, no WAV, no MATH_V6, no wallet.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildServerFxRound,
  expectedAudioSeq,
  scatterCountForKind,
} from '../poker/server-fx-fixtures.js';
import { freeSpinsForScatterCount } from '../poker/free-spin-award.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const results = [];

function record(name, fn) {
  try {
    fn();
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

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: atteso ${JSON.stringify(expected)}, ottenuto ${JSON.stringify(actual)}`);
  }
}

function sliceFn(src, name) {
  const start = src.indexOf(`async function ${name}`) >= 0
    ? src.indexOf(`async function ${name}`)
    : src.indexOf(`function ${name}`);
  if (start < 0) throw new Error(`funzione ${name} non trovata`);
  const next = src.slice(start + 1).search(/\n(?:async )?function /);
  return next < 0 ? src.slice(start) : src.slice(start, start + 1 + next);
}

const appSrc = readFileSync(join(root, 'poker/app.js'), 'utf8');
const audioSrc = readFileSync(join(root, 'poker/audio-manager.js'), 'utf8');
const samplesSrc = readFileSync(join(root, 'poker/reel-samples.js'), 'utf8');
const layoutSrc = readFileSync(join(root, 'poker/layout.js'), 'utf8');

record('fixture spin: 0 scatter, line win, no FS', () => {
  const round = buildServerFxRound('spin');
  assertEqual(round.paid_spin.scatter_count, 0, 'scatter');
  assertEqual(round.free_spins_awarded, 0, 'fs');
  assertEqual(round.paid_spin.grid.length, 15, 'grid');
  assertEqual(round.paid_spin.winning_lines.length, 1, 'line');
  assert(!('balance_after' in round), 'no wallet field');
});

['scatter3', 'scatter4', 'scatter5'].forEach((kind) => {
  record(`fixture ${kind}: scatter ${scatterCountForKind(kind)} → ${freeSpinsForScatterCount(scatterCountForKind(kind))} FS`, () => {
    const n = scatterCountForKind(kind);
    const round = buildServerFxRound(kind);
    assertEqual(round.paid_spin.scatter_count, n, 'scatter');
    assertEqual(round.free_spins_awarded, freeSpinsForScatterCount(n), 'award');
    assertEqual(round.free_spins.length, round.free_spins_awarded, 'fs rows');
    assertEqual(round.paid_spin.scatter_cell_indexes.length, n, 'cells');
    round.paid_spin.scatter_cell_indexes.forEach((index) => {
      assertEqual(round.paid_spin.grid[index], 'scatter', `cell ${index}`);
    });
  });
});

record('fixture fsWin: 3 scatter + paid win + FS win', () => {
  const round = buildServerFxRound('fsWin');
  assertEqual(round.paid_spin.scatter_count, 3, 'scatter');
  assertEqual(round.free_spins_awarded, 5, 'fs');
  assert(round.paid_spin_base_win > 0, 'paid win');
  assertEqual(round.free_spins[0].base_win, 80, 'fs win');
  assertEqual(round.free_spins.slice(1).every((row) => row.base_win === 0), true, 'later fs quiet');
});

record('expected seq scatter3 includes scatter + FS start/loop/end', () => {
  const seq = expectedAudioSeq('scatter3');
  assert(seq.includes('spin-button'), 'spin');
  assert(seq.includes('reel-start'), 'start');
  assert(seq.includes('reel-loop'), 'loop');
  assert(seq.includes('scatter'), 'scatter');
  assert(seq.includes('free-spin-start'), 'fs start');
  assert(seq.includes('free-spin-loop'), 'fs loop');
  assert(seq.includes('free-spin-end'), 'fs end');
  assertEqual(seq.filter((id) => id === 'free-spin-loop').length, 1, 'loop once');
});

record('pack default selected-v1 without DEV query', () => {
  assert(samplesSrc.includes("pack = SELECTED_PACK_ID"), 'default pack');
  assert(samplesSrc.includes("synthTestActive()"), 'synth opt-out');
  assert(samplesSrc.includes("soundPack") && samplesSrc.includes("off"), 'off opt-out');
});

record('SPIN SFX on gesture before HTTP', () => {
  const server = sliceFn(appSrc, 'serverSpin');
  const cueAt = server.indexOf('cueSpinGesture()');
  const httpAt = server.indexOf('requestPokerSpin');
  assert(cueAt >= 0, 'cueSpinGesture in serverSpin');
  assert(httpAt >= 0, 'requestPokerSpin in serverSpin');
  assert(cueAt < httpAt, 'SPIN prima della request');
  assert(!/await pokerAudio\.whenSamplesReady\(\);\s*pokerAudio\.playSpinButton/.test(server), 'no await before spin SFX');
});

record('server presentation still calls reel + scatter + FS overlay', () => {
  const present = sliceFn(appSrc, 'presentServerRound');
  assert(present.includes('playReelSpin('), 'playReelSpin');
  assert(present.includes('showFreeSpinOverlay('), 'showFreeSpinOverlay');
  assert(present.includes('runServerFreeSpins('), 'runServerFreeSpins');
});

record('playReelSpin resumes audio then start/loop/stops', () => {
  const server = sliceFn(appSrc, 'serverSpin');
  const motion = sliceFn(appSrc, 'runPreparedReelMotion');
  const motionAt = server.indexOf('runPreparedReelMotion(');
  const httpAt = server.indexOf('requestPokerSpin');
  const roundAwaitAt = server.indexOf('await roundPromise');
  const settleAt = server.indexOf('presentServerRound');
  assert(motionAt >= 0 && httpAt >= 0 && motionAt < httpAt, 'reel/audio start prima dell\'attesa HTTP');
  assert(motion.includes('resumePlayback()'), 'resume');
  assert(motion.includes('playSpin()'), 'reel-start');
  assert(motion.includes('startReelLoop('), 'reel-loop');
  assert(motion.includes('playReelStop(index)'), 'reel-stop');
  assert(motion.includes('stopReelLoop()'), 'reel-loop stop');
  assert(server.includes('applyServerStripFinals(namesFromServerGrid('), 'server grid authoritative');
  assert(roundAwaitAt >= 0 && settleAt >= 0 && httpAt < settleAt && roundAwaitAt < settleAt, 'stop/settle dopo risultato server');
});

record('showFreeSpinOverlay keeps scatter + FS start hooks', () => {
  const overlay = sliceFn(appSrc, 'showFreeSpinOverlay');
  assert(overlay.includes('playScatterTrigger()'), 'scatter SFX');
  assert(overlay.includes('playFreeSpinStart()'), 'fs start');
});

record('FS loop starts once and ends with approved fade', () => {
  assert(audioSrc.includes('if (this._fsLoop) return true;'), 'no restart');
  const serverFs = sliceFn(appSrc, 'runServerFreeSpins');
  assert(!serverFs.includes('playFreeSpinStart'), 'no FS start per giro');
  assert(!serverFs.includes('startFreeSpinLoop'), 'no FS loop per giro');
  assert(serverFs.includes('stopFreeSpinLoop({ fadeSec: 0.4 })'), 'fade 0.4');
  assert(serverFs.includes('playFreeSpinEnd('), 'fs end');
  assert(serverFs.includes('showFreeSpinSummary(freeSpinFeatureTotal(spins), round)'), 'FS summary display');
});

record('FS_TOTAL sums only server free_spins.base_win', () => {
  const fnSrc = sliceFn(appSrc, 'freeSpinFeatureTotal');
  const summarySrc = sliceFn(appSrc, 'showFreeSpinSummary');
  const runSrc = sliceFn(appSrc, 'runServerFreeSpins');
  assert(fnSrc.includes('base_win'), 'base_win only');
  assert(!summarySrc.includes('requestPokerSpin'), 'no extra request');
  assert(!summarySrc.includes('creditAmount'), 'no extra credit');
  assert(!runSrc.includes('createSpinReferenceId'), 'no extra reference');
  const fn = new Function(`${fnSrc}; return freeSpinFeatureTotal;`)();
  assertEqual(fn([{ base_win: 100 }, { base_win: 500 }, { base_win: 0 }, { base_win: 1000 }, { base_win: 0 }]), 1600, 'A 1600');
  assertEqual(fn([{ base_win: 0 }, { base_win: 0 }, { base_win: 0 }, { base_win: 0 }, { base_win: 0 }]), 0, 'B 0');
  assertEqual(
    fn([{ base_win: 350, mystery: { reward_chips: 250 } }, { base_win: 80 }]),
    430,
    'FS bonus already inside base_win',
  );
});

record('server FS presents retrigger remaining and Pick a Card without extra credit', () => {
  const runSrc = sliceFn(appSrc, 'runServerFreeSpins');
  assert(runSrc.includes('remaining_after'), 'HUD remaining_after');
  assert(runSrc.includes('remaining_before'), 'HUD remaining_before');
  assert(runSrc.includes('retrigger_awarded'), 'present retrigger_awarded');
  assert(runSrc.includes('showMysteryOverlay'), 'Pick a Card on FS BONUS');
  assert(runSrc.includes('credit: false'), 'no frontend FS bonus credit');
  assert(!runSrc.includes('scatterFsRetriggerAwarded'), 'no client retrigger math');
  assert(!runSrc.includes('settleGuaranteedCashBonus'), 'no client bonus draw');
  assert(!runSrc.includes('Math.random'), 'no client RNG');
});

record('daily multiplier UX is server-driven', () => {
  assert(appSrc.includes('applyDailyBadge('), 'badge helper');
  assert(appSrc.includes('showDailyBonusOverlay('), 'overlay helper');
  assert(appSrc.includes('daily_bonus_active'), 'uses server active flag');
  assert(appSrc.includes('daily_wins_remaining'), 'uses server remaining');
  assert(appSrc.includes('bonus_applied'), 'overlay if chip bonus applied');
  assert(appSrc.includes('payout_multiplier'), 'uses server payout multiplier');
  const present = sliceFn(appSrc, 'presentServerRound');
  assert(present.includes('showDailyBonusOverlay(round)'), 'overlay from server round');
  assert(present.includes('applyDailyBadge(round)'), 'badge from server round');
  assert(!present.includes('bonus_games_left - 1'), 'no local decrement');
});

record('timing rulli invariato', () => {
  assert(layoutSrc.includes('stopMs: [1200, 1400, 1600, 1800, 2000]'), 'stopMs');
});

record('PACK_GAIN invariati', () => {
  const expect = {
    spin: 0.55,
    bet: 0.35,
    start: 0.45,
    loop: 0.27,
    stop: 0.55,
    final: 0.66,
    fsLoop: 0.24,
    scatter: 0.55,
    fsStart: 0.57,
    fsEnd: 0.53,
    lineWin: 0.40,
  };
  Object.entries(expect).forEach(([key, value]) => {
    const re = new RegExp(`${key}: ${String(value).replace('.', '\\.')}`);
    assert(re.test(audioSrc), `${key}=${value}`);
  });
});

record('WAV selected-v1 invariati', () => {
  [
    'spin-button-selected.wav',
    'reel-start-selected.wav',
    'reel-loop-selected.wav',
    'reel-stop-selected.wav',
    'reel-stop-final-selected.wav',
    'scatter-selected.wav',
    'free-spin-start-selected.wav',
    'free-spin-loop-selected.wav',
    'free-spin-end-selected.wav',
  ].forEach((name) => {
    assert(samplesSrc.includes(`'${name}'`), name);
  });
});

const royaleHtml = readFileSync(join(root, 'index.html'), 'utf8');
const royaleApp = readFileSync(join(root, 'app.js'), 'utf8');
const pokerHtml = readFileSync(join(root, 'poker/index.html'), 'utf8');
const utilsSrc = readFileSync(join(root, 'js/utils.js'), 'utf8');
const bridgeSrc = readFileSync(join(root, 'js/telegram-bridge.js'), 'utf8');

record('Royale HTML: vip overlay presente', () => {
  assert(royaleHtml.includes('id="vipOverlay"'), 'vipOverlay');
  assert(royaleHtml.includes('id="vipOverlayTier"'), 'vipOverlayTier');
});

record('Royale app: showVipSecondChanceOverlay collegato', () => {
  assert(royaleApp.includes('function showVipSecondChanceOverlay'), 'fn');
  assert(royaleApp.includes('showVipSecondChanceOverlay(serverResult)'), 'call');
});

record('Poker HTML: vip overlay presente', () => {
  assert(pokerHtml.includes('id="vipOverlay"'), 'vipOverlay');
});

record('Poker app: showVipSecondChanceOverlay collegato', () => {
  assert(appSrc.includes('function showVipSecondChanceOverlay'), 'fn');
  assert(appSrc.includes('await showVipSecondChanceOverlay(round)'), 'call');
});

record('utils: shouldShowVipSecondChance richiede entrambi i flag', () => {
  assert(utilsSrc.includes('vip_second_chance_triggered'), 'triggered');
  assert(utilsSrc.includes('vip_second_chance_result_used'), 'result_used');
});

record('bridge spin: campi VIP esposti', () => {
  assert(bridgeSrc.includes('vipSecondChanceTriggered'), 'vip triggered');
  assert(bridgeSrc.includes('vipSecondChanceResultUsed'), 'vip result used');
});

const failed = results.filter((row) => !row.ok);
console.log('');
console.log(`${results.length - failed.length}/${results.length} pass`);
if (failed.length) {
  process.exitCode = 1;
}
