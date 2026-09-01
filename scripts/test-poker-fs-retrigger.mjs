/**
 * PokerSlot FS retrigger + FS BONUS — JS math player, injected grids.
 * node scripts/test-poker-fs-retrigger.mjs
 */

import { MATH_V6, scatterFsRetriggerAwarded, scatterFreeSpinsAwarded } from '../poker/math-config.js';
import { playPaidRound } from '../poker/math-round.js';
import { walletCreditsForRound } from '../poker/wallet-chips.js';
import { PAYLINE_DEFINITIONS } from '../poker/paylines.js';

const DEAD = [
  'q', 'k', 'j', 'a', 'club',
  'k', 'j', 'a', 'club', 'q',
  'j', 'a', 'club', 'q', 'k',
];

function dead() {
  return DEAD.slice();
}

function scatter(n) {
  const grid = dead();
  for (let i = 0; i < n; i += 1) grid[10 + i] = 'scatter';
  return grid;
}

function bonus(n) {
  const grid = dead();
  for (let i = 0; i < n; i += 1) grid[10 + i] = 'bonus';
  return grid;
}

function play(grids, bonusSeq = [0]) {
  const queue = grids.map((g) => g.slice());
  const nextGrid = () => {
    if (!queue.length) return dead();
    return queue.shift();
  };
  let i = 0;
  const bonusRng = () => {
    const v = bonusSeq[Math.min(i, bonusSeq.length - 1)];
    i += 1;
    return v;
  };
  return playPaidRound({
    pack: MATH_V6,
    nextGrid,
    paylines: PAYLINE_DEFINITIONS.slice(0, 3),
    bonusRng,
    totalBet: 100,
  });
}

let failed = 0;
function check(name, cond, detail = '') {
  if (cond) {
    console.log(`PASS  ${name}`);
    return;
  }
  failed += 1;
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

check('paid scatter table unchanged', scatterFreeSpinsAwarded(3, MATH_V6.scatterFeature) === 5
  && scatterFreeSpinsAwarded(4, MATH_V6.scatterFeature) === 7
  && scatterFreeSpinsAwarded(5, MATH_V6.scatterFeature) === 10);
check('retrigger map 3/4/5', scatterFsRetriggerAwarded(3) === 1
  && scatterFsRetriggerAwarded(4) === 3
  && scatterFsRetriggerAwarded(5) === 5);

const a = play([scatter(3), scatter(3)]);
check('A 3 scatter → +1', a.freeSpins[0].retriggerAwarded === 1 && a.freeSpins.length === 6);

const b = play([scatter(3), scatter(4)]);
check('B 4 scatter → +3', b.freeSpins[0].retriggerAwarded === 3 && b.freeSpins.length === 8);

const c = play([scatter(3), scatter(5)]);
check('C 5 scatter → +5', c.freeSpins[0].retriggerAwarded === 5 && c.freeSpins.length === 10);

const d = play([scatter(3), scatter(3), scatter(3), scatter(3)]);
check('D third retrigger blocked', d.freeSpins[0].retriggerAwarded === 1
  && d.freeSpins[1].retriggerAwarded === 1
  && d.freeSpins[2].retriggerAwarded === 0
  && d.freeSpins[2].retriggerBlocked === true
  && d.retriggerCount === 2
  && d.freeSpins.length === 7);

const e = play([scatter(3), dead(), dead(), dead(), scatter(3)]);
check('E remaining 2 + 3 scatter → +1', e.freeSpins[3].remainingBefore === 2
  && e.freeSpins[3].retriggerAwarded === 1
  && e.freeSpins[3].remainingAfter === 2
  && e.freeSpins[e.freeSpins.length - 1].remainingAfter === 0);

const f = play([scatter(3), bonus(3)], [0]);
const hit = f.freeSpins.find((fs) => fs.bonusDraw);
check('F BONUS FS T1 1x', Boolean(hit) && hit.bonusDraw.x === 1 && hit.settled.bonusReturn === 100);
const wallet = walletCreditsForRound(f);
check('G FS wallet includes BONUS', wallet.freeSpins >= 100);

const f2 = play([scatter(3), bonus(5)], [0.95]);
const hit5 = f2.freeSpins.find((fs) => fs.bonusDraw);
check('F 5 BONUS T1 10x', Boolean(hit5) && hit5.bonusDraw.x === 10 && hit5.settled.bonusReturn === 1000);

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nAll JS retrigger checks passed');
