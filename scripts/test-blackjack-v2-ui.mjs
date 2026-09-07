/**
 * Blackjack V2 visual/wiring frontend tests.
 * Run: node scripts/test-blackjack-v2-ui.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RANKS,
  SUITS,
  allDeckSpecs,
  cardAriaLabel,
  createCardElement,
  normalizeRank,
  normalizeSuit,
} from '../blackjack/card-ui.js';
import {
  buildPayoutRows,
  classifyOutcome,
  outcomeHeadline,
} from '../blackjack/layout.js';
import { AUDIO_FILES } from '../blackjack/audio.js';
import {
  animateHitCard,
  animateInitialDeal,
  prefersReducedMotion,
} from '../blackjack/animations.js';

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

const app = readFileSync(join(root, 'blackjack/app.js'), 'utf8');
const html = readFileSync(join(root, 'blackjack/index.html'), 'utf8');
const css = readFileSync(join(root, 'blackjack/style.css'), 'utf8');
const layout = readFileSync(join(root, 'blackjack/layout.js'), 'utf8');
const audio = readFileSync(join(root, 'blackjack/audio.js'), 'utf8');

record('tutte le 13 rank', () => {
  assert(RANKS.length === 13, '13 ranks');
  ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].forEach((r) => {
    assert(RANKS.includes(r), r);
  });
});

record('tutti i 4 semi', () => {
  assert(SUITS.length === 4, '4 suits');
  assert(allDeckSpecs().length === 52, '52 combos');
});

record('hidden card', () => {
  globalThis.document = {
    createElement(tag) {
      const el = {
        tagName: tag.toUpperCase(),
        className: '',
        classList: {
          _set: new Set(),
          add(...xs) { xs.forEach((x) => this._set.add(x)); el.className = [...this._set].join(' '); },
          remove(...xs) { xs.forEach((x) => this._set.delete(x)); el.className = [...this._set].join(' '); },
        },
        attrs: {},
        setAttribute(k, v) { this.attrs[k] = v; },
        getAttribute(k) { return this.attrs[k]; },
        innerHTML: '',
        dataset: {},
      };
      return el;
    },
  };
  const back = createCardElement({ hidden: true });
  assert(back.className.includes('bj-card--back'), 'back class');
  assert(back.getAttribute('aria-label') === 'Carta coperta', 'aria hidden');
  assert(cardAriaLabel({ hidden: true }) === 'Carta coperta', 'label helper');
});

record('no hole leak', () => {
  assert(!app.includes('hole_rank') && !app.includes('hole_suit'), 'no hole fields');
  assert(app.includes('card?.hidden'), 'respects hidden flag');
  assert(createCardElement({ hidden: true, rank: 'A', suit: 'spades' }).className.includes('bj-card--back'), 'hidden wins');
});

await recordAsync('sequential initial deal', async () => {
  const order = [];
  const dealerHand = { children: [], replaceChildren(...nodes) { this.children = nodes; }, append(n) { this.children.push(n); } };
  const playerHand = { children: [], replaceChildren(...nodes) { this.children = nodes; }, append(n) { this.children.push(n); } };
  await animateInitialDeal({
    dealerHand,
    playerHand,
    dealerCards: [{ rank: 'A', suit: 'spades' }, { hidden: true }],
    playerCards: [{ rank: '10', suit: 'hearts' }, { rank: '9', suit: 'clubs' }],
    createCard: (c) => ({ card: c }),
    onCard: (c) => order.push(c.hidden ? 'H' : `${c.rank}${c.suit[0]}`),
    gapMs: 0,
  });
  assert(order.join(',') === 'As,10h,H,9c', `order=${order.join(',')}`);
  assert(dealerHand.children.length === 2, 'dealer 2');
  assert(playerHand.children.length === 2, 'player 2');
});

await recordAsync('hit adds one visual card', async () => {
  const playerHand = {
    children: [{ id: 1 }, { id: 2 }],
    replaceChildren(...nodes) { this.children = nodes; },
    append(n) { this.children.push(n); },
    get lastElementChild() { return this.children[this.children.length - 1] || null; },
  };
  await animateHitCard({
    playerHand,
    previousCount: 2,
    playerCards: [
      { rank: '10', suit: 'hearts' },
      { rank: '8', suit: 'clubs' },
      { rank: '3', suit: 'diamonds' },
    ],
    createCard: (c, opts = {}) => ({ rank: c.rank, enter: Boolean(opts.enter) }),
    onCard: () => {},
  });
  assert(playerHand.children.length === 3, 'three cards');
  assert(playerHand.children[2].enter === true || playerHand.children[2].rank === '3', 'new card appended');
});

record('dealer reveal helpers present', () => {
  assert(app.includes('animateDealerReveal'), 'wired');
  assert(app.includes("mode === 'stand'"), 'stand mode');
});

record('controls disabled during animation', () => {
  assert(app.includes('state.animating'), 'animating flag');
  assert(app.includes('state.animating = true'), 'sets true');
  assert(app.includes('busy: isBusy || state.animating') || app.includes('|| state.animating'), 'disables controls');
});

record('result states', () => {
  assert(classifyOutcome({ status: 'settled', message: 'Blackjack!', final_credit: 250 }) === 'blackjack'
    || classifyOutcome({ status: 'settled', is_blackjack: true, final_credit: 250 }) === 'blackjack', 'bj');
  assert(classifyOutcome({ status: 'settled', player_score: 22, message: 'Bust' }) === 'bust', 'bust');
  assert(classifyOutcome({ status: 'settled', outcome: 'a', final_credit: 200, message: 'Hai vinto' }) === 'win', 'win');
  assert(classifyOutcome({ status: 'settled', message: 'Pareggio', final_credit: 0 }) === 'push', 'push');
  assert(outcomeHeadline('win', { message: 'Vittoria' }) === 'Vittoria', 'server wording');
});

record('payout breakdown', () => {
  const rows = buildPayoutRows({
    status: 'settled',
    final_credit: 6240,
    base_credit: 2000,
    vip_applied: true,
    vip_extra: 600,
    vip_tier: 'VIP Gold',
    level_multiplier: 1.2,
    level_block: 'A',
    daily_applied: true,
    daily_multiplier: 2,
  }, (n) => String(n));
  assert(rows.some((r) => r.label === 'Vincita base'), 'base');
  assert(rows.some((r) => r.label.includes('VIP')), 'vip');
  assert(rows.some((r) => r.label.includes('Livello')), 'level');
  assert(rows.some((r) => r.label.includes('Daily')), 'daily');
  assert(rows.at(-1).total && rows.at(-1).value === '6240', 'total server value');
  assert(buildPayoutRows({ status: 'settled', final_credit: 0 }, String).length === 0, 'no empty win rows');
});

record('responsive class/hooks', () => {
  assert(css.includes('safe-area-inset'), 'safe area');
  assert(css.includes('@media (max-width: 360px)'), 'narrow phones');
  assert(css.includes('prefers-reduced-motion'), 'reduced motion');
  assert(html.includes('viewport-fit=cover'), 'telegram viewport');
});

record('no double/split', () => {
  assert(!/double|split|raddoppia|dividi/i.test(html + app + layout), 'no extra actions');
  assert(html.includes('CARTA') && html.includes('STO'), 'hit/stand');
});

record('no client payout calculation', () => {
  assert(!app.includes('final_credit *'), 'no multiply credit');
  assert(!app.includes('bet * 1.5') && !app.includes('bet*1.5'), 'no bj calc');
  assert(app.includes('payload.final_credit') || layout.includes('final_credit'), 'uses server credit');
  assert(app.includes('buildPayoutRows'), 'breakdown helper');
});

record('audio hooks only', () => {
  Object.keys(AUDIO_FILES).forEach((key) => {
    assert(AUDIO_FILES[key] == null, `${key} unset`);
  });
  assert(audio.includes('deal-card') && audio.includes('blackjack'), 'events documented');
});

record('face cards all suits renderable', () => {
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      const el = createCardElement({ rank, suit });
      assert(el.dataset.rank === normalizeRank(rank), `${rank}${suit} rank`);
      assert(el.dataset.suit === normalizeSuit(suit), `${rank}${suit} suit`);
      assert(!el.className.includes('bj-card--back'), 'not back');
    }
  }
});

void prefersReducedMotion;

const failed = results.filter((item) => !item.ok);
console.log(`${results.length - failed.length}/${results.length} pass`);
if (failed.length) process.exit(1);
