/**
 * Blackjack V2 dealer reveal on settlement (hit→21, stand, natural, bust).
 * Run: node scripts/test-blackjack-dealer-reveal.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { animateDealerReveal } from '../blackjack/animations.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(join(root, 'blackjack/app.js'), 'utf8');
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

function makeHand() {
  return {
    children: [],
    replaceChildren(...nodes) {
      this.children = nodes;
    },
    append(n) {
      this.children.push(n);
    },
  };
}

function createCard(card, opts = {}) {
  const el = {
    hidden: Boolean(card?.hidden),
    rank: card?.rank || null,
    suit: card?.suit || null,
    flipIn: Boolean(opts.flipIn),
    enter: Boolean(opts.enter),
    classList: { remove() {} },
    replaceWith(next) {
      const hand = el._hand;
      if (!hand) return;
      const idx = hand.children.indexOf(el);
      if (idx >= 0) hand.children[idx] = next;
      next._hand = hand;
    },
  };
  return el;
}

async function runReveal(prev, next) {
  const dealerHand = makeHand();
  const createCardBound = (card, opts = {}) => {
    const el = createCard(card, opts);
    el._hand = dealerHand;
    return el;
  };
  // Seed prev faces via animateDealerReveal internals (it rebuilds from prev).
  await animateDealerReveal({
    dealerHand,
    previousDealerCards: prev,
    nextDealerCards: next,
    createCard: createCardBound,
    gapMs: 0,
  });
  return dealerHand;
}

const prevHole = [
  { rank: '7', suit: 'hearts' },
  { hidden: true },
];

record('HIT settled wiring chiama animateDealerReveal', () => {
  const hitIdx = app.indexOf("mode === 'hit'");
  const standIdx = app.indexOf("} else {");
  // Hit branch must call reveal when settled before paintScores/outcome.
  assert(app.includes("mode === 'hit'"), 'hit mode');
  assert(
    /mode === 'hit'[\s\S]*?payload\.status === 'settled'[\s\S]*?animateDealerReveal/.test(app),
    'hit→settled→animateDealerReveal',
  );
  assert(app.includes('paintHandsInstant(payload)'), 'settled paint fallback');
});

record('outcome dopo reveal (ordine nel codice)', () => {
  const revealLast = app.lastIndexOf('animateDealerReveal');
  const paintHands = app.indexOf('paintHandsInstant(payload)', revealLast);
  const paintScores = app.indexOf('paintScores(payload)', paintHands >= 0 ? paintHands : revealLast);
  const outcome = app.indexOf('renderOutcome(payload)', paintScores);
  assert(revealLast >= 0 && paintScores > revealLast, 'scores after reveal');
  assert(outcome > paintScores, 'outcome after scores');
});

await recordAsync('HIT→21 push → dealer completo, nessun hidden', async () => {
  const next = [
    { rank: '7', suit: 'hearts' },
    { rank: 'K', suit: 'spades' },
  ];
  const dealerHand = await runReveal(prevHole, next);
  assert(dealerHand.children.length === 2, '2 dealer cards');
  assert(dealerHand.children.every((c) => !c.hidden), 'no hidden');
  assert(dealerHand.children[0].rank === '7' && dealerHand.children[1].rank === 'K', 'faces match');
});

await recordAsync('HIT→21 win → dealer completo con carte extra', async () => {
  const next = [
    { rank: '6', suit: 'clubs' },
    { rank: '5', suit: 'diamonds' },
    { rank: '9', suit: 'hearts' },
  ];
  const dealerHand = await runReveal(prevHole, next);
  assert(dealerHand.children.length === 3, 'extra card rendered');
  assert(dealerHand.children.every((c) => !c.hidden && c.rank), 'all faces');
});

await recordAsync('HIT→bust → dealer completo (payload settled faces)', async () => {
  const next = [
    { rank: '10', suit: 'clubs' },
    { rank: '9', suit: 'hearts' },
  ];
  const dealerHand = await runReveal(prevHole, next);
  assert(dealerHand.children.every((c) => !c.hidden), 'bust settle no hole');
});

await recordAsync('STAND → dealer completo', async () => {
  const dealerHand = await runReveal(prevHole, [
    { rank: '10', suit: 'spades' },
    { rank: '8', suit: 'clubs' },
  ]);
  assert(dealerHand.children.length === 2, 'stand 2');
  assert(!dealerHand.children.some((c) => c.hidden), 'stand revealed');
});

await recordAsync('natural settlement → dealer completo', async () => {
  const next = [
    { rank: 'A', suit: 'spades' },
    { rank: 'K', suit: 'hearts' },
  ];
  const dealerHand = await runReveal([], next);
  assert(dealerHand.children.length === 2, 'bj dealer 2');
  assert(dealerHand.children.every((c) => !c.hidden), 'bj no hidden');
});

record('nessun hidden:true dopo settled (helper payload)', () => {
  const settled = {
    status: 'settled',
    dealer_cards: [
      { rank: '7', suit: 'hearts' },
      { rank: '4', suit: 'clubs' },
    ],
  };
  assert(!settled.dealer_cards.some((c) => c.hidden), 'payload clean');
  assert(app.includes("payload.status === 'settled'"), 'settled gate');
  assert(
    app.includes('paintHandsInstant(payload)')
      && /if \(payload\.status === 'settled'\) \{\s*paintHandsInstant\(payload\);/.test(app),
    'final paintHandsInstant fallback after settled anim',
  );
});

const failed = results.filter((item) => !item.ok);
console.log(`${results.length - failed.length}/${results.length} pass`);
if (failed.length) process.exit(1);
