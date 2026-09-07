/**
 * Blackjack premium card renderer — all 52 faces via HTML/CSS (no PNG deck).
 */

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];

export const SUIT_SYMBOL = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

export const RED_SUITS = new Set(['hearts', 'diamonds']);

const RANK_IT = {
  A: 'Asso',
  J: 'Jack',
  Q: 'Donna',
  K: 'Re',
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
};

const SUIT_IT = {
  hearts: 'cuori',
  diamonds: 'quadri',
  clubs: 'fiori',
  spades: 'picche',
};

export function normalizeRank(rank) {
  const raw = String(rank ?? '').trim().toUpperCase();
  if (raw === '1' || raw === 'ACE') return 'A';
  if (raw === '11' || raw === 'JACK') return 'J';
  if (raw === '12' || raw === 'QUEEN') return 'Q';
  if (raw === '13' || raw === 'KING') return 'K';
  if (RANKS.includes(raw)) return raw;
  return raw;
}

export function normalizeSuit(suit) {
  const raw = String(suit ?? '').trim().toLowerCase();
  if (SUITS.includes(raw)) return raw;
  const map = {
    h: 'hearts',
    d: 'diamonds',
    c: 'clubs',
    s: 'spades',
    heart: 'hearts',
    diamond: 'diamonds',
    club: 'clubs',
    spade: 'spades',
    cuori: 'hearts',
    quadri: 'diamonds',
    fiori: 'clubs',
    picche: 'spades',
  };
  return map[raw] || raw;
}

export function cardAriaLabel(card) {
  if (!card || card.hidden) return 'Carta coperta';
  const rank = normalizeRank(card.rank);
  const suit = normalizeSuit(card.suit);
  const rankName = RANK_IT[rank] || rank;
  const suitName = SUIT_IT[suit] || suit;
  return `${rankName} di ${suitName}`;
}

export function isFaceCard(rank) {
  return ['J', 'Q', 'K'].includes(normalizeRank(rank));
}

/** Build a premium face or back card element. */
export function createCardElement(card, options = {}) {
  const el = document.createElement('div');
  el.className = 'bj-card';
  el.setAttribute('role', 'img');

  if (card?.hidden) {
    el.classList.add('bj-card--back');
    el.setAttribute('aria-label', 'Carta coperta');
    el.innerHTML = `
      <div class="bj-card__back" aria-hidden="true">
        <div class="bj-card__back-outer">
          <div class="bj-card__back-inner">
            <div class="bj-card__back-pattern"></div>
            <div class="bj-card__back-mark">
              <span class="bj-card__crown">♛</span>
              <span class="bj-card__mono">R</span>
            </div>
          </div>
        </div>
      </div>
    `;
    return el;
  }

  const rank = normalizeRank(card?.rank);
  const suit = normalizeSuit(card?.suit);
  const symbol = SUIT_SYMBOL[suit] || '•';
  const red = RED_SUITS.has(suit);
  if (red) el.classList.add('bj-card--red');
  if (isFaceCard(rank)) {
    el.classList.add('bj-card--face');
    el.classList.add(`bj-card--${rank}`);
  }
  if (options.enter) el.classList.add('bj-card--enter');
  if (options.flipIn) el.classList.add('bj-card--flip-in');

  el.setAttribute('aria-label', cardAriaLabel({ rank, suit }));
  el.dataset.rank = rank;
  el.dataset.suit = suit;

  const faceCenter = isFaceCard(rank)
    ? `
      <div class="bj-card__center bj-card__center--face" aria-hidden="true">
        <span class="bj-card__ornament bj-card__ornament--top"></span>
        <span class="bj-card__center-rank">${rank}</span>
        <span class="bj-card__center-pip">${symbol}</span>
        <span class="bj-card__ornament bj-card__ornament--bot"></span>
      </div>`
    : `
      <div class="bj-card__center" aria-hidden="true">
        <span class="bj-card__center-pip">${symbol}</span>
      </div>`;

  el.innerHTML = `
    <div class="bj-card__face">
      <div class="bj-card__corner bj-card__corner--tl">
        <span class="bj-card__rank">${rank}</span>
        <span class="bj-card__pip">${symbol}</span>
      </div>
      ${faceCenter}
      <div class="bj-card__corner bj-card__corner--br">
        <span class="bj-card__rank">${rank}</span>
        <span class="bj-card__pip">${symbol}</span>
      </div>
    </div>
  `;
  return el;
}

export function allDeckSpecs() {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit })));
}
