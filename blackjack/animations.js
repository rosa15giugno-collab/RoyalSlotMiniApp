/**
 * Blackjack presentation animations — transform/opacity only.
 * Respects prefers-reduced-motion.
 */

export function prefersReducedMotion() {
  return typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function sleep(ms) {
  if (prefersReducedMotion()) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function waitAnimation(el, fallbackMs = 420) {
  if (!el || prefersReducedMotion() || typeof el.addEventListener !== 'function') {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.removeEventListener('animationend', finish);
      resolve();
    };
    el.addEventListener('animationend', finish);
    setTimeout(finish, fallbackMs);
  });
}

/**
 * Initial deal order (presentation only):
 * dealer[0] → player[0] → dealer[1] → player[1]
 */
export async function animateInitialDeal({
  dealerHand,
  playerHand,
  dealerCards,
  playerCards,
  createCard,
  onCard,
  gapMs = 180,
}) {
  const d = dealerCards || [];
  const p = playerCards || [];
  dealerHand.replaceChildren();
  playerHand.replaceChildren();

  const steps = [
    { hand: dealerHand, card: d[0] },
    { hand: playerHand, card: p[0] },
    { hand: dealerHand, card: d[1] },
    { hand: playerHand, card: p[1] },
  ].filter((step) => step.card);

  for (const step of steps) {
    const el = createCard(step.card, { enter: true });
    step.hand.append(el);
    onCard?.(step.card);
    await waitAnimation(el, 380);
    el.classList?.remove?.('bj-card--enter');
    await sleep(gapMs);
  }

  // Any extra cards (edge resume) appear without blocking forever.
  for (let i = 2; i < d.length; i += 1) {
    dealerHand.append(createCard(d[i]));
  }
  for (let i = 2; i < p.length; i += 1) {
    playerHand.append(createCard(p[i]));
  }
}

/** Append only the newest player card with enter animation. */
export async function animateHitCard({
  playerHand,
  previousCount,
  playerCards,
  createCard,
  onCard,
}) {
  const cards = playerCards || [];
  if (cards.length <= previousCount) {
    playerHand.replaceChildren(...cards.map((c) => createCard(c)));
    return;
  }
  while (playerHand.children.length > previousCount) {
    playerHand.lastElementChild?.remove();
  }
  while (playerHand.children.length < previousCount && playerHand.children.length < cards.length) {
    const idx = playerHand.children.length;
    playerHand.append(createCard(cards[idx]));
  }
  const next = cards[previousCount];
  const el = createCard(next, { enter: true });
  playerHand.append(el);
  onCard?.(next);
  await waitAnimation(el, 420);
  el.classList?.remove?.('bj-card--enter');
  for (let i = previousCount + 1; i < cards.length; i += 1) {
    playerHand.append(createCard(cards[i]));
  }
}

/**
 * Dealer reveal from a settled payload:
 * 1) flip hole 2) extra dealer cards one-by-one
 */
export async function animateDealerReveal({
  dealerHand,
  previousDealerCards,
  nextDealerCards,
  createCard,
  onFlip,
  onCard,
  gapMs = 220,
}) {
  const prev = previousDealerCards || [];
  const next = nextDealerCards || [];
  const hadHole = prev.some((c) => c?.hidden);
  const revealIndex = prev.findIndex((c) => c?.hidden);

  dealerHand.replaceChildren();
  for (let i = 0; i < Math.min(prev.length, next.length); i += 1) {
    const useHidden = hadHole && i === revealIndex;
    const el = createCard(useHidden ? { hidden: true } : next[i]);
    dealerHand.append(el);
  }

  if (hadHole && revealIndex >= 0 && next[revealIndex] && !next[revealIndex].hidden) {
    const slot = dealerHand.children[revealIndex];
    if (slot) {
      const revealed = createCard(next[revealIndex], { flipIn: true });
      slot.replaceWith(revealed);
      onFlip?.(next[revealIndex]);
      await waitAnimation(revealed, 520);
      revealed.classList?.remove?.('bj-card--flip-in');
    }
  } else {
    dealerHand.replaceChildren(...next.slice(0, Math.max(prev.length, 2)).map((c) => createCard(c)));
  }

  for (let i = Math.max(prev.length, 2); i < next.length; i += 1) {
    await sleep(gapMs);
    const el = createCard(next[i], { enter: true });
    dealerHand.append(el);
    onCard?.(next[i]);
    await waitAnimation(el, 400);
    el.classList?.remove?.('bj-card--enter');
  }
}

function safeFormat(formatFn, value) {
  try {
    return formatFn(value);
  } catch {
    return value == null ? '—' : String(value);
  }
}

/**
 * Animate balance text. Always resolves (hard timeout) so settlement
 * cannot get stuck with animating=true.
 */
export function animateBalanceText(node, fromValue, toValue, formatFn, durationMs = 520) {
  if (!node) return Promise.resolve();
  if (fromValue == null || toValue == null || fromValue === toValue || prefersReducedMotion()) {
    node.textContent = toValue == null ? '—' : safeFormat(formatFn, toValue);
    return Promise.resolve();
  }
  const nowFn = typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? () => performance.now()
    : () => Date.now();
  const start = nowFn();
  const delta = toValue - fromValue;
  const raf = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (cb) => setTimeout(() => cb(nowFn()), 16);

  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      node.textContent = safeFormat(formatFn, toValue);
      resolve();
    };
    const tick = (now) => {
      if (done) return;
      try {
        const t = Math.min(1, (now - start) / durationMs);
        const eased = 1 - (1 - t) ** 3;
        const value = Math.round(fromValue + delta * eased);
        node.textContent = safeFormat(formatFn, value);
        if (t < 1) raf(tick);
        else finish();
      } catch {
        finish();
      }
    };
    raf(tick);
    setTimeout(finish, Math.max(durationMs + 200, 800));
  });
}
