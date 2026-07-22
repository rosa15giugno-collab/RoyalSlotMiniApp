import { CONFIG } from './config.js';

function pickWeighted(items) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item.id;
  }
  return items[items.length - 1].id;
}

export function symbolMeta(id) {
  return CONFIG.symbols.find((s) => s.id === id);
}

export function resolveLine(symbols) {
  const [a, b, c] = symbols;
  const wild = CONFIG.symbols.find((s) => s.isWild)?.id;

  if (a === b && b === c) return { match: a, count: 3 };
  if (a === wild && b === c) return { match: b, count: 3 };
  if (b === wild && a === c) return { match: a, count: 3 };
  if (c === wild && a === b) return { match: a, count: 3 };
  if (a === wild && b === wild) return { match: c, count: 3 };
  if (a === wild && c === wild) return { match: b, count: 3 };
  if (b === wild && c === wild) return { match: a, count: 3 };

  return null;
}

export class SlotEngine {
  constructor(config = CONFIG) {
    this.config = config;
  }

  randomSymbol() {
    return pickWeighted(this.config.symbols);
  }

  buildInitialGrid() {
    const ids = this.config.symbols.map((symbol) => symbol.id);
    const shuffled = [...ids];

    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const { visibleRows, count } = this.config.reels;
    return Array.from({ length: count }, (_, reelIndex) =>
      shuffled.slice(reelIndex * visibleRows, reelIndex * visibleRows + visibleRows),
    );
  }

  buildRandomGrid() {
    const { count, visibleRows } = this.config.reels;
    return Array.from({ length: count }, () =>
      Array.from({ length: visibleRows }, () => this.randomSymbol()),
    );
  }

  spin(bet, evaluatePaylinesFn) {
    const grid = this.buildRandomGrid();
    const reels = grid.map((column) => column[1]);
    const paylineEvaluation = evaluatePaylinesFn(grid, bet);
    const winAmount = paylineEvaluation.winningLines.reduce(
      (total, entry) => total + entry.payoutMultiplier * bet,
      0,
    );

    let message = winAmount > 0
      ? `Vincita +${winAmount.toLocaleString('it-IT')} CHIP`
      : `Nessuna vincita -${bet.toLocaleString('it-IT')} CHIP`;

    const detected = paylineEvaluation.winningLines;
    if (detected.length) {
      const summary = detected
        .map((entry) => `${entry.line.name} (${entry.match.toUpperCase()} x3)`)
        .join(', ');
      message = winAmount > 0
        ? `${message} | Linee: ${summary}`
        : `Linee vincenti rilevate: ${summary}`;
    }

    return {
      grid,
      reels,
      winAmount,
      message,
      paylines: paylineEvaluation,
    };
  }
}
