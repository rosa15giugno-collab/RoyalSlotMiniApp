/**
 * Continuity checks for roulette spin pose sampler (no DOM).
 * Run: node scripts/test-roulette-spin-continuity.mjs
 */
import {
  measureSpinContinuity,
  sampleSpinPose,
  SPIN_MOTION,
} from '../roulette/animations.js';
import { SPIN_AUDIO } from '../roulette/audio.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const span = {
  startWheel: -4.86,
  endWheel: -4.86 + 5 * 360 + 120,
  startBall: 12,
  endBall: 12 - 10 * 360,
};

const report = measureSpinContinuity(span, 620);
console.log('continuity', report);

// Dense sampling (~100 samples/sec over 6.2s curve): jumps stay bounded for continuous motion.
assert(report.maxWheelJump < 12, `wheel jump too large: ${report.maxWheelJump}`);
assert(report.maxBallJump < 22, `ball jump too large: ${report.maxBallJump}`);
assert(report.endWheelExact, 'end wheel must match target');
assert(report.endBallExact, 'end ball must match target');

// Phase boundaries must not teleport (entry/exit of pocket hops).
const eps = 1e-4;
for (const edge of [SPIN_MOTION.bounceStart, SPIN_MOTION.bounceEnd, SPIN_MOTION.settleStart]) {
  const a = sampleSpinPose(edge - eps, span);
  const b = sampleSpinPose(edge, span);
  const c = sampleSpinPose(Math.min(1, edge + eps), span);
  assert(Math.abs(b.ball - a.ball) < 0.05, `ball teleport at ${edge} (pre)`);
  assert(Math.abs(c.ball - b.ball) < 0.05, `ball teleport at ${edge} (post)`);
  assert(Math.abs(b.drop - a.drop) < 0.02, `drop teleport at ${edge} (pre)`);
  assert(Math.abs(c.drop - b.drop) < 0.02, `drop teleport at ${edge} (post)`);
}

// Audio phase windows stay aligned.
assert(SPIN_MOTION.bounceStart === SPIN_AUDIO.bounceStart, 'bounceStart sync');
assert(SPIN_MOTION.bounceEnd === SPIN_AUDIO.bounceEnd, 'bounceEnd sync');
assert(
  JSON.stringify([...SPIN_MOTION.bounceHopTs]) === JSON.stringify([...SPIN_AUDIO.bounceHopTs]),
  'bounceHopTs sync',
);
assert(SPIN_MOTION.bounceHopTs[0] > 0, 'first hop after bounce entry (no u=0 teleport)');

// Pose at t=1 locked; mid-track ball still moving opposite family.
const mid = sampleSpinPose(0.4, span);
const late = sampleSpinPose(0.85, span);
assert(mid.drop < 0.15, 'ball should be on track mid-spin');
assert(late.drop > 0.5, 'ball should be in pocket zone late');
assert(mid.wheel > span.startWheel, 'wheel advances');
assert(mid.ball < span.startBall, 'ball opposite direction');

console.log('PASS  roulette spin continuity');
