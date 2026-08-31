/**
 * PokerSlot reel engine.
 * One rAF loop, transform-only, snap to integer pitch, no filters.
 */

import { BASE, REEL_METRICS } from './layout.js';

/** Keep decoded Image objects alive so the browser does not evict bitmaps. */
const decodedCards = [];

function makeCell(src, pitchPx, cellPx) {
  const cell = document.createElement('div');
  cell.className = 'reel-cell';
  cell.style.height = `${pitchPx}px`;
  const img = document.createElement('img');
  img.alt = '';
  img.draggable = false;
  img.decoding = 'async';
  img.src = src;
  img.style.height = `${cellPx}px`;
  cell.appendChild(img);
  return cell;
}

function setY(el, y) {
  el.style.transform = `translate3d(0, ${y}px, 0)`;
}

/**
 * Fast start → cruise → cubic decelerate to 1 at t=0.9.
 * The last 10% is a light settle applied in the rAF loop.
 * Visual rest / lock-in is t >= 0.9 (ease already 1); t = 1 is bounce-complete.
 */
function slotEase(t) {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  if (x >= 0.9) return 1;
  if (x < 0.08) {
    const u = x / 0.08;
    return 0.14 * u * u;
  }
  if (x < 0.4) {
    return 0.14 + ((x - 0.08) / 0.32) * 0.52;
  }
  const u = (x - 0.4) / 0.5;
  return 0.66 + (1 - (1 - u) ** 3) * 0.34;
}

function loadAndDecode(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (typeof img.decode === 'function') {
        img.decode().then(() => resolve(img)).catch(() => resolve(img));
      } else {
        resolve(img);
      }
    };
    img.onerror = () => reject(new Error(`Card preload failed: ${src}`));
    img.src = src;
  });
}

export async function preloadCards(urls) {
  const loaded = await Promise.all(urls.map(loadAndDecode));
  decodedCards.push(...loaded);
}

export function mountReel(parent, layout) {
  const viewport = document.createElement('div');
  viewport.className = 'reel';
  viewport.style.left = `${layout.left}%`;
  viewport.style.top = `${layout.top}%`;
  viewport.style.width = `${layout.width}%`;
  viewport.style.height = `${layout.height}%`;

  const strip = document.createElement('div');
  strip.className = 'reel-strip';
  viewport.appendChild(strip);
  parent.appendChild(viewport);

  return {
    viewport,
    strip,
    layout,
    pitchPx: 0,
    cellPx: 0,
    extraCount: 0,
  };
}

export function measureReel(reel, machineEl) {
  const scale = machineEl.getBoundingClientRect().height / BASE.height;
  reel.pitchPx = REEL_METRICS.pitchPx * scale;
  reel.cellPx = REEL_METRICS.cellHeightPx * scale;
  reel.viewport.style.height = `${2 * reel.pitchPx + reel.cellPx}px`;
}

export function paintIdle(reel, urls) {
  const { strip, pitchPx, cellPx } = reel;
  strip.replaceChildren();
  urls.forEach((src) => strip.appendChild(makeCell(src, pitchPx, cellPx)));
  setY(strip, 0);
}

function settleIdle(reel) {
  const cells = Array.from(reel.strip.children);
  reel.strip.replaceChildren(...cells.slice(-3));
  setY(reel.strip, 0);
}

export function buildSpinStrip(reel, current, extras, final) {
  const { strip, pitchPx, cellPx } = reel;
  strip.replaceChildren();
  [...current, ...extras, ...final].forEach((src) => {
    strip.appendChild(makeCell(src, pitchPx, cellPx));
  });
  reel.extraCount = extras.length;
  setY(strip, 0);
}

export function spinReels(reels, plans, { onReelStop } = {}) {
  const start = performance.now();
  const durations = plans.map((plan) => plan.duration);
  const targets = reels.map((reel) => -((3 + reel.extraCount) * reel.pitchPx));
  const stopped = reels.map(() => false);

  reels.forEach((reel) => {
    reel.strip.style.willChange = 'transform';
  });

  return new Promise((resolve) => {
    const tick = (now) => {
      let pending = 0;
      reels.forEach((reel, index) => {
        const t = (now - start) / durations[index];
        const target = targets[index];
        /* Ease is already 1 at t>=0.9: symbol is in the rest cell. Fire
           onReelStop here (visual lock-in), not at t>=1 (end of 2.5px bounce). */
        if (t >= 0.9 && !stopped[index]) {
          stopped[index] = true;
          try {
            onReelStop?.(index);
          } catch {
            /* audio must never block settle */
          }
        }
        if (t >= 1) {
          setY(reel.strip, target);
          return;
        }
        pending += 1;
        let y = slotEase(t) * target;
        if (t > 0.9) {
          const u = (t - 0.9) / 0.1;
          const amp = Math.min(2.5, reel.pitchPx * 0.015);
          y = target - Math.sin(u * Math.PI) * amp * (1 - u);
        }
        setY(reel.strip, y);
      });
      if (pending > 0) {
        requestAnimationFrame(tick);
        return;
      }
      requestAnimationFrame(() => {
        reels.forEach((reel) => {
          settleIdle(reel);
          reel.strip.style.willChange = 'auto';
        });
        resolve();
      });
    };
    requestAnimationFrame(tick);
  });
}

export function pickStripExtras(cardUrls, count) {
  const extras = [];
  while (extras.length < count) {
    extras.push(cardUrls[(Math.random() * cardUrls.length) | 0]);
  }
  return extras;
}

export function pickGrid(symbolFiles, count) {
  const grid = [];
  const n = symbolFiles.length;
  while (grid.length < count) {
    grid.push(symbolFiles[(Math.random() * n) | 0]);
  }
  return grid;
}
