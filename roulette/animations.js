import { EUROPEAN_WHEEL_ORDER, pocketColor, wheelIndexForNumber } from './layout.js';

/**
 * Premium European roulette wheel (SVG + CSS transforms).
 * Result is ALWAYS driven by server `number` — no client RNG for outcome.
 *
 * Motion model (elapsed-time based):
 * - Wheel: continuous ease-out rotation to exact landing angle (no piecewise speed jumps).
 * - Ball: opposite direction, stays fast longer, then decaying pocket hops (ball only).
 * - Audio phase windows (tick / track fade / bounce) stay aligned with progress 0..1.
 */

const POCKETS = EUROPEAN_WHEEL_ORDER.length;
const POCKET_ANGLE = 360 / POCKETS;

/** Must stay in sync with roulette/audio.js SPIN_AUDIO bounceHopTs / windows. */
export const SPIN_MOTION = Object.freeze({
  tickStart: 0.07,
  tickEnd: 0.76,
  trackFadeStart: 0.68,
  trackStop: 0.76,
  dropStart: 0.70,
  bounceStart: 0.78,
  bounceEnd: 0.94,
  settleStart: 0.94,
  // Peaks start after u=0 so ball enters pockets without an angle teleport.
  bounceHopTs: Object.freeze([0.14, 0.42, 0.70]),
  bounceHopAmps: Object.freeze([1, 0.55, 0.28]),
  bounceHopSigns: Object.freeze([1, -1, 1]),
});

function polar(cx, cy, r, deg) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function wedgePath(cx, cy, rOuter, rInner, startDeg, endDeg) {
  const a0 = polar(cx, cy, rOuter, startDeg);
  const a1 = polar(cx, cy, rOuter, endDeg);
  const b1 = polar(cx, cy, rInner, endDeg);
  const b0 = polar(cx, cy, rInner, startDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${a0.x.toFixed(2)} ${a0.y.toFixed(2)}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${a1.x.toFixed(2)} ${a1.y.toFixed(2)}`,
    `L ${b1.x.toFixed(2)} ${b1.y.toFixed(2)}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${b0.x.toFixed(2)} ${b0.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

function fretLine(cx, cy, rOuter, rInner, deg) {
  const o = polar(cx, cy, rOuter, deg);
  const i = polar(cx, cy, rInner, deg);
  return `M ${o.x.toFixed(2)} ${o.y.toFixed(2)} L ${i.x.toFixed(2)} ${i.y.toFixed(2)}`;
}

function clamp01(t) {
  return Math.max(0, Math.min(1, t));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Smooth ease-out; continuous velocity → 0 at t=1 (no piecewise kinks). */
function easeOutPow(t, power) {
  return 1 - (1 - clamp01(t)) ** power;
}

function smootherstep(t) {
  const x = clamp01(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

function norm360(deg) {
  return ((deg % 360) + 360) % 360;
}

/** Shortest positive delta so end ≡ targetMod (mod 360), plus fullSpins. */
function spinDelta(fromDeg, targetMod, fullSpins) {
  const fromMod = norm360(fromDeg);
  const deltaToTarget = norm360(targetMod - fromMod);
  return fullSpins * 360 + deltaToTarget;
}

/**
 * Continuous pocket-hop contribution for the ball (not the wheel).
 * Peaks near SPIN_MOTION.bounceHopTs for audio sync.
 */
function ballHopAt(u) {
  const t = clamp01(u);
  // Fade in from track seat; fade out into settle — both ends at ~0 contribution.
  const env = (1 - smootherstep(t)) * smootherstep(Math.min(1, t / 0.1));
  let ang = 0;
  let lift = 0;
  const sigma = 0.085;
  for (let i = 0; i < SPIN_MOTION.bounceHopTs.length; i += 1) {
    const peak = SPIN_MOTION.bounceHopTs[i];
    const amp = SPIN_MOTION.bounceHopAmps[i];
    const sign = SPIN_MOTION.bounceHopSigns[i];
    const d = t - peak;
    const g = Math.exp(-(d * d) / (2 * sigma * sigma));
    ang += sign * amp * POCKET_ANGLE * 0.92 * g;
    lift += amp * 0.38 * g;
  }
  return {
    ang: ang * env,
    lift: lift * env,
  };
}

/**
 * Pure pose sampler — used by runtime + continuity checks.
 * @param {number} raw progress 0..1
 * @param {{ startWheel: number, endWheel: number, startBall: number, endBall: number }} span
 */
export function sampleSpinPose(raw, span) {
  const t = clamp01(raw);
  const { startWheel, endWheel, startBall, endBall } = span;

  // Wheel: single continuous decelerating curve to exact end.
  const wProg = easeOutPow(t, 2.45);
  const wheel = lerp(startWheel, endWheel, wProg);

  // Ball: opposite, decelerates later so it stays vivid on the track.
  const ballDrive = clamp01(t / SPIN_MOTION.bounceStart);
  const bProg = easeOutPow(ballDrive, 1.95);
  let ball = lerp(startBall, endBall, bProg);

  // Radial seat: rest → track → fall → hops → settle.
  let drop;
  if (t < 0.045) {
    drop = 1 - smootherstep(t / 0.045);
  } else if (t < SPIN_MOTION.dropStart) {
    drop = 0;
  } else if (t < SPIN_MOTION.bounceStart) {
    drop = smootherstep((t - SPIN_MOTION.dropStart) / (SPIN_MOTION.bounceStart - SPIN_MOTION.dropStart));
  } else if (t < SPIN_MOTION.bounceEnd) {
    const u = (t - SPIN_MOTION.bounceStart) / (SPIN_MOTION.bounceEnd - SPIN_MOTION.bounceStart);
    const hop = ballHopAt(u);
    // Enter from track pose (ball=endBall, drop≈1); hops rise continuously from 0.
    ball = endBall + hop.ang;
    drop = Math.max(0.52, Math.min(1.08, 1 - hop.lift * 0.9));
  } else {
    const u = (t - SPIN_MOTION.settleStart) / Math.max(1e-6, 1 - SPIN_MOTION.settleStart);
    const hopEnd = ballHopAt(1);
    // Blend residual hop energy out — continuous with bounceEnd pose.
    const fade = smootherstep(u);
    ball = lerp(endBall + hopEnd.ang, endBall, fade);
    drop = lerp(Math.max(0.52, 1 - hopEnd.lift * 0.9), 1, fade);
  }

  if (t >= 1) {
    return { wheel: endWheel, ball: endBall, drop: 1 };
  }
  return { wheel, ball, drop: Math.max(0, Math.min(1.08, drop)) };
}

/**
 * Continuity diagnostic: max |Δangle| between samples (should stay bounded).
 */
export function measureSpinContinuity(span, samples = 240) {
  let maxWheelJump = 0;
  let maxBallJump = 0;
  let prev = sampleSpinPose(0, span);
  for (let i = 1; i <= samples; i += 1) {
    const pose = sampleSpinPose(i / samples, span);
    maxWheelJump = Math.max(maxWheelJump, Math.abs(pose.wheel - prev.wheel));
    maxBallJump = Math.max(maxBallJump, Math.abs(pose.ball - prev.ball));
    prev = pose;
  }
  const end = sampleSpinPose(1, span);
  return {
    maxWheelJump,
    maxBallJump,
    endWheelExact: Math.abs(end.wheel - span.endWheel) < 1e-9,
    endBallExact: Math.abs(end.ball - span.endBall) < 1e-9,
  };
}

export function mountEuropeanWheel(mount) {
  if (!mount) return null;

  const cx = 120;
  const cy = 120;
  const rRimOuter = 114;
  const rRimInner = 104;
  const rTrackOuter = 103;
  const rTrackInner = 96;
  const rPocketOuter = 95;
  const rPocketInner = 58;
  const rCone = 52;
  const rHub = 16;

  const fills = {
    green: 'url(#pocketGreen)',
    red: 'url(#pocketRed)',
    black: 'url(#pocketBlack)',
  };

  const pockets = EUROPEAN_WHEEL_ORDER.map((num, i) => {
    const start = i * POCKET_ANGLE;
    const end = (i + 1) * POCKET_ANGLE;
    const mid = start + POCKET_ANGLE / 2;
    const color = pocketColor(num);
    const tPos = polar(cx, cy, (rPocketOuter + rPocketInner) / 2 + 0.6, mid);
    const wellOuter = rPocketOuter - 1.35;
    const wellInner = rPocketInner + 1.1;
    return `
      <path class="wheel-pocket wheel-pocket--${color}" data-number="${num}"
        d="${wedgePath(cx, cy, rPocketOuter, rPocketInner, start, end)}"
        fill="${fills[color]}"
        stroke="rgba(0,0,0,0.55)" stroke-width="0.28" />
      <path class="wheel-pocket-well" data-number="${num}"
        d="${wedgePath(cx, cy, wellOuter, wellInner, start + 0.35, end - 0.35)}"
        fill="rgba(0,0,0,0.22)" />
      <path d="${wedgePath(cx, cy, rPocketOuter - 0.15, rPocketOuter - 2.1, start + 0.2, end - 0.2)}"
        fill="rgba(255,255,255,0.055)" />
      <text class="wheel-num" x="${tPos.x.toFixed(2)}" y="${tPos.y.toFixed(2)}"
        fill="#f8f2e6" font-size="5.35" font-weight="700" font-family="Manrope,sans-serif"
        text-anchor="middle" dominant-baseline="middle"
        style="paint-order:stroke;stroke:rgba(0,0,0,0.55);stroke-width:0.55px"
        transform="rotate(${mid.toFixed(2)}, ${tPos.x.toFixed(2)}, ${tPos.y.toFixed(2)})">${num}</text>
    `;
  }).join('');

  const frets = EUROPEAN_WHEEL_ORDER.map((_, i) => {
    const deg = i * POCKET_ANGLE;
    return `
      <path d="${fretLine(cx, cy, rPocketOuter + 0.4, rPocketInner - 0.2, deg)}"
        stroke="rgba(20,12,4,0.85)" stroke-width="1.9" stroke-linecap="butt" />
      <path d="${fretLine(cx, cy, rPocketOuter + 0.55, rPocketInner - 0.35, deg)}"
        stroke="url(#fretMetal)" stroke-width="1.15" stroke-linecap="round" />
      <path d="${fretLine(cx, cy, rPocketOuter + 0.2, rPocketInner + 0.4, deg)}"
        stroke="rgba(255,245,210,0.35)" stroke-width="0.35" stroke-linecap="round" />
    `;
  }).join('');

  const rimStuds = Array.from({ length: 28 }, (_, i) => {
    const deg = (i * 360) / 28;
    const p = polar(cx, cy, (rRimOuter + rRimInner) / 2 + 0.2, deg);
    return `<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="1.05" fill="url(#studGold)"
      stroke="rgba(40,24,8,0.45)" stroke-width="0.25" />`;
  }).join('');

  mount.innerHTML = `
    <div class="wheel__frame">
      <div class="wheel__glow" aria-hidden="true"></div>
      <div class="wheel__marker" aria-hidden="true"></div>

      <div class="wheel__spin" id="wheelRotor">
        <svg class="wheel__svg" viewBox="0 0 240 240" role="img" aria-label="Ruota europea 0-36">
          <defs>
            <radialGradient id="rimWood" cx="36%" cy="30%" r="72%">
              <stop offset="0%" stop-color="#6a4428"/>
              <stop offset="38%" stop-color="#3a2214"/>
              <stop offset="72%" stop-color="#1a0e08"/>
              <stop offset="100%" stop-color="#0a0503"/>
            </radialGradient>
            <linearGradient id="rimGold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#f7e7b8"/>
              <stop offset="28%" stop-color="#d4b06a"/>
              <stop offset="55%" stop-color="#8a6028"/>
              <stop offset="78%" stop-color="#c4963e"/>
              <stop offset="100%" stop-color="#efe0b0"/>
            </linearGradient>
            <linearGradient id="rimGoldInner" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#efe0b0"/>
              <stop offset="50%" stop-color="#7a5420"/>
              <stop offset="100%" stop-color="#d8b86a"/>
            </linearGradient>
            <radialGradient id="trackMetal" cx="48%" cy="36%" r="62%">
              <stop offset="0%" stop-color="#4a4a4a"/>
              <stop offset="35%" stop-color="#222222"/>
              <stop offset="70%" stop-color="#0c0c0c"/>
              <stop offset="100%" stop-color="#000000"/>
            </radialGradient>
            <linearGradient id="trackHighlight" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="rgba(240,217,160,0.55)"/>
              <stop offset="45%" stop-color="rgba(180,150,90,0.15)"/>
              <stop offset="100%" stop-color="rgba(0,0,0,0.55)"/>
            </linearGradient>
            <radialGradient id="pocketRed" cx="38%" cy="32%" r="78%">
              <stop offset="0%" stop-color="#d4454c"/>
              <stop offset="42%" stop-color="#9a1e28"/>
              <stop offset="78%" stop-color="#5a1016"/>
              <stop offset="100%" stop-color="#2a080c"/>
            </radialGradient>
            <radialGradient id="pocketBlack" cx="38%" cy="32%" r="78%">
              <stop offset="0%" stop-color="#3a3a3a"/>
              <stop offset="45%" stop-color="#161616"/>
              <stop offset="80%" stop-color="#070707"/>
              <stop offset="100%" stop-color="#000000"/>
            </radialGradient>
            <radialGradient id="pocketGreen" cx="38%" cy="32%" r="78%">
              <stop offset="0%" stop-color="#3aad58"/>
              <stop offset="45%" stop-color="#1a7034"/>
              <stop offset="80%" stop-color="#0c3a1c"/>
              <stop offset="100%" stop-color="#04180c"/>
            </radialGradient>
            <linearGradient id="fretMetal" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#fff6d4"/>
              <stop offset="35%" stop-color="#d4b06a"/>
              <stop offset="70%" stop-color="#8a6428"/>
              <stop offset="100%" stop-color="#efe0b0"/>
            </linearGradient>
            <radialGradient id="coneDark" cx="40%" cy="32%" r="72%">
              <stop offset="0%" stop-color="#243830"/>
              <stop offset="40%" stop-color="#0e1c16"/>
              <stop offset="75%" stop-color="#060c0a"/>
              <stop offset="100%" stop-color="#020404"/>
            </radialGradient>
            <radialGradient id="hubGold" cx="32%" cy="28%" r="72%">
              <stop offset="0%" stop-color="#fff3c8"/>
              <stop offset="28%" stop-color="#e0c070"/>
              <stop offset="62%" stop-color="#a07830"/>
              <stop offset="100%" stop-color="#4a3410"/>
            </radialGradient>
            <radialGradient id="hubGoldMid" cx="40%" cy="35%" r="65%">
              <stop offset="0%" stop-color="#f0d9a0"/>
              <stop offset="55%" stop-color="#8a6028"/>
              <stop offset="100%" stop-color="#3a280c"/>
            </radialGradient>
            <radialGradient id="studGold" cx="35%" cy="30%" r="65%">
              <stop offset="0%" stop-color="#fff6d0"/>
              <stop offset="55%" stop-color="#c4963e"/>
              <stop offset="100%" stop-color="#6e4e1c"/>
            </radialGradient>
            <radialGradient id="bowlShade" cx="50%" cy="50%" r="50%">
              <stop offset="70%" stop-color="rgba(0,0,0,0)"/>
              <stop offset="100%" stop-color="rgba(0,0,0,0.45)"/>
            </radialGradient>
          </defs>

          <circle cx="${cx}" cy="${cy}" r="${rRimOuter}" fill="url(#rimWood)" />
          <circle cx="${cx}" cy="${cy}" r="${rRimOuter - 0.8}" fill="none"
            stroke="rgba(0,0,0,0.4)" stroke-width="1.6" />
          <circle cx="${cx}" cy="${cy}" r="${rRimOuter}" fill="none"
            stroke="url(#rimGold)" stroke-width="4.1" />
          <circle cx="${cx}" cy="${cy}" r="${rRimOuter - 2.4}" fill="none"
            stroke="url(#rimGoldInner)" stroke-width="1.1" opacity="0.85" />
          <circle cx="${cx}" cy="${cy}" r="${rRimInner + 0.3}" fill="none"
            stroke="rgba(240,217,160,0.5)" stroke-width="1.5" />
          <circle cx="${cx}" cy="${cy}" r="${rRimInner - 0.9}" fill="none"
            stroke="rgba(0,0,0,0.65)" stroke-width="1.2" />
          ${rimStuds}

          <circle cx="${cx}" cy="${cy}" r="${(rTrackOuter + rTrackInner) / 2}"
            fill="none" stroke="url(#trackMetal)" stroke-width="${rTrackOuter - rTrackInner + 1.2}" />
          <circle cx="${cx}" cy="${cy}" r="${rTrackOuter + 0.15}" fill="none"
            stroke="url(#trackHighlight)" stroke-width="1.15" />
          <circle cx="${cx}" cy="${cy}" r="${rTrackOuter - 0.9}" fill="none"
            stroke="rgba(255,255,255,0.07)" stroke-width="0.7" />
          <circle cx="${cx}" cy="${cy}" r="${(rTrackOuter + rTrackInner) / 2}"
            fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="2.4" />
          <circle cx="${cx}" cy="${cy}" r="${rTrackInner + 0.2}" fill="none"
            stroke="rgba(212,176,106,0.42)" stroke-width="1.05" />
          <circle cx="${cx}" cy="${cy}" r="${rTrackInner - 1.1}" fill="none"
            stroke="rgba(0,0,0,0.75)" stroke-width="1.35" />
          <circle cx="${cx}" cy="${cy}" r="${rTrackInner - 2.4}" fill="none"
            stroke="rgba(255,255,255,0.04)" stroke-width="1.8" />

          <g class="wheel__pockets">${pockets}</g>
          <g class="wheel__frets">${frets}</g>
          <circle cx="${cx}" cy="${cy}" r="${rPocketOuter + 0.15}" fill="none"
            stroke="rgba(212,176,106,0.28)" stroke-width="0.7" />
          <circle cx="${cx}" cy="${cy}" r="${rPocketInner - 0.15}" fill="none"
            stroke="rgba(0,0,0,0.55)" stroke-width="1.1" />

          <circle cx="${cx}" cy="${cy}" r="${rCone}" fill="url(#coneDark)"
            stroke="rgba(212,176,106,0.28)" stroke-width="1.15" />
          <circle cx="${cx}" cy="${cy}" r="${rCone}" fill="url(#bowlShade)" />
          <circle cx="${cx}" cy="${cy}" r="44" fill="none"
            stroke="rgba(255,255,255,0.045)" stroke-width="5" />
          <circle cx="${cx}" cy="${cy}" r="36" fill="none"
            stroke="rgba(212,176,106,0.12)" stroke-width="1" />
          <circle cx="${cx}" cy="${cy}" r="28" fill="none"
            stroke="rgba(0,0,0,0.4)" stroke-width="1.1" />

          <circle cx="${cx}" cy="${cy}" r="${rHub + 7}" fill="rgba(0,0,0,0.35)" />
          <circle cx="${cx}" cy="${cy}" r="${rHub + 5.5}" fill="url(#hubGoldMid)"
            stroke="rgba(255,248,220,0.25)" stroke-width="0.6" />
          <circle cx="${cx}" cy="${cy}" r="${rHub + 3.2}" fill="url(#hubGold)" opacity="0.55" />
          <circle cx="${cx}" cy="${cy}" r="${rHub}" fill="url(#hubGold)"
            stroke="rgba(255,248,220,0.65)" stroke-width="0.9" />
          <ellipse cx="${cx - 2.2}" cy="${cy - 3.2}" rx="5.2" ry="3.4"
            fill="rgba(255,255,255,0.28)" />
          <circle cx="${cx}" cy="${cy}" r="7.2" fill="#1a1408"
            stroke="rgba(212,176,106,0.35)" stroke-width="0.5" />
          <circle cx="${cx}" cy="${cy}" r="3.1" fill="url(#hubGold)" />
          <circle cx="${cx - 0.6}" cy="${cy - 0.8}" r="1.1" fill="rgba(255,255,255,0.55)" />
        </svg>
      </div>

      <div class="wheel__ball-orbit" id="wheelBallOrbit" aria-hidden="true">
        <div class="wheel__ball" id="wheelBall"></div>
      </div>
    </div>
  `;

  const frame = mount.querySelector('.wheel__frame');
  const rotor = mount.querySelector('#wheelRotor');
  const ballOrbit = mount.querySelector('#wheelBallOrbit');
  const ball = mount.querySelector('#wheelBall');

  let wheelDeg = -POCKET_ANGLE / 2;
  let ballDeg = 0;
  let ballDrop = 1;
  let rafId = 0;
  let spinning = false;

  function paintTransforms() {
    // translateZ(0) promotes a stable compositor layer on mobile Safari.
    if (rotor) rotor.style.transform = `translateZ(0) rotate(${wheelDeg}deg)`;
    if (ballOrbit) {
      ballOrbit.style.transform = `translateZ(0) rotate(${ballDeg}deg)`;
      ballOrbit.style.setProperty('--ball-drop', ballDrop.toFixed(4));
      const scale = 1.1 - ballDrop * 0.14;
      ballOrbit.style.setProperty('--ball-scale', scale.toFixed(4));
    }
  }

  paintTransforms();

  function clearWinHighlight() {
    mount.querySelectorAll('.wheel-pocket.is-win-pocket').forEach((el) => {
      el.classList.remove('is-win-pocket');
    });
  }

  function highlightWinPocket(number) {
    clearWinHighlight();
    const pocket = mount.querySelector(`.wheel-pocket[data-number="${number}"]`);
    pocket?.classList.add('is-win-pocket');
  }

  function cancelSpin() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    spinning = false;
    frame?.classList.remove('is-spinning');
    clearWinHighlight();
  }

  /**
   * Final wheel angle places pocket center under the top marker.
   */
  function landingWheelMod(number) {
    const idx = wheelIndexForNumber(number);
    return norm360(-(idx * POCKET_ANGLE + POCKET_ANGLE / 2));
  }

  return {
    ball,
    getRotation: () => wheelDeg,
    setRotation(deg) {
      cancelSpin();
      wheelDeg = deg;
      paintTransforms();
      return Promise.resolve();
    },
    clearWinHighlight,
    highlightWinPocket,
    async spinToNumber(number, { onTick, onProgress, durationMs = 6200 } = {}) {
      cancelSpin();
      spinning = true;
      frame?.classList.add('is-spinning');
      ball?.classList.add('is-rolling');
      ball?.classList.remove('is-rest');

      const targetWheelMod = landingWheelMod(number);
      // Wheel clockwise (+). Ball opposite (−). Destination = server number only.
      const endWheel = wheelDeg + spinDelta(wheelDeg, targetWheelMod, 5);
      const endBall = ballDeg - spinDelta(-ballDeg, 0, 10);
      const span = {
        startWheel: wheelDeg,
        endWheel,
        startBall: ballDeg,
        endBall,
      };

      let lastTick = performance.now();
      let startTime = 0;

      await new Promise((resolve) => {
        const step = (now) => {
          if (!spinning) {
            resolve();
            return;
          }
          if (!startTime) startTime = now;
          // Elapsed-time clock (not frame-count) — smooth under variable FPS.
          const elapsed = Math.max(0, now - startTime);
          const raw = Math.min(1, elapsed / durationMs);
          const pose = sampleSpinPose(raw, span);

          wheelDeg = pose.wheel;
          ballDeg = pose.ball;
          ballDrop = pose.drop;
          paintTransforms();
          onProgress?.(raw);

          if (now - lastTick > 48) {
            lastTick = now;
            onTick?.(raw);
          }

          if (raw < 1) {
            rafId = requestAnimationFrame(step);
          } else {
            wheelDeg = endWheel;
            ballDeg = endBall;
            ballDrop = 1;
            paintTransforms();
            spinning = false;
            rafId = 0;
            frame?.classList.remove('is-spinning');
            highlightWinPocket(number);
            onProgress?.(1);
            resolve();
          }
        };
        rafId = requestAnimationFrame(step);
      });

      ball?.classList.remove('is-rolling');
      ball?.classList.add('is-rest');
      window.setTimeout(() => ball?.classList.remove('is-rest'), 700);
    },
  };
}

export function animateBalanceText(el, value, formatChips) {
  if (!el) return;
  el.textContent = formatChips(value);
  el.classList.remove('is-pulse');
  void el.offsetWidth;
  el.classList.add('is-pulse');
}
