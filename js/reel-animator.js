import { CONFIG } from './config.js';

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function easeOutQuint(t) {
  return 1 - (1 - t) ** 5;
}

export class ReelAnimator {
  constructor(config = CONFIG) {
    this.config = config;
  }

  getSymbolHeight(stripEl) {
    const cell = stripEl.querySelector('.symbol-cell');
    if (cell) {
      return cell.getBoundingClientRect().height;
    }

    const cssValue = getComputedStyle(document.documentElement)
      .getPropertyValue('--symbol-height')
      .trim();
    return parseFloat(cssValue) || this.config.reels.symbolHeight;
  }

  getStripOffset(stripEl) {
    const transform = getComputedStyle(stripEl).transform;
    if (!transform || transform === 'none') return 0;
    return new DOMMatrix(transform).m42;
  }

  ensureVisibleStrip(stripEl, visibleRows, createSymbolCell, engine) {
    const cells = stripEl.querySelectorAll('.symbol-cell');
    if (cells.length >= visibleRows) return;

    stripEl.innerHTML = '';
    for (let i = 0; i < visibleRows; i += 1) {
      stripEl.appendChild(createSymbolCell(engine.randomSymbol()));
    }
    stripEl.style.transform = 'translate3d(0, 0, 0)';
  }

  normalizeStrip(stripEl, offset, cellHeight, visibleRows, createSymbolCell) {
    const cells = [...stripEl.querySelectorAll('.symbol-cell')];
    const firstVisibleIndex = Math.max(0, Math.round(-offset / cellHeight));
    const visibleSymbols = [];

    for (let row = 0; row < visibleRows; row += 1) {
      const cell = cells[firstVisibleIndex + row];
      visibleSymbols.push(cell?.dataset.symbol ?? cells[cells.length - 1]?.dataset.symbol);
    }

    stripEl.innerHTML = '';
    visibleSymbols.forEach((symbolId) => {
      if (symbolId) stripEl.appendChild(createSymbolCell(symbolId));
    });
    stripEl.style.transform = 'translate3d(0, 0, 0)';
  }

  async spinReelToColumn({ reelEl, stripEl, targetColumn, reelIndex, createSymbolCell, engine }) {
    const delay = reelIndex * this.config.reels.reelStopDelayMs;
    await wait(delay);

    const visibleRows = this.config.reels.visibleRows;
    const extra = this.config.reels.extraSpins;
    const cellHeight = this.getSymbolHeight(stripEl);

    this.ensureVisibleStrip(stripEl, visibleRows, createSymbolCell, engine);

    const startOffset = this.getStripOffset(stripEl);

    for (let i = 0; i < extra; i += 1) {
      const columnIndex = i - (extra - visibleRows);
      const symbolId = columnIndex >= 0
        ? targetColumn[columnIndex]
        : engine.randomSymbol();
      stripEl.appendChild(createSymbolCell(symbolId));
    }

    const targetOffset = startOffset - extra * cellHeight;
    const duration = this.config.reels.spinDurationMs + reelIndex * 140;

    reelEl.classList.add('reel--spinning');

    await new Promise((resolve) => {
      const start = performance.now();

      const tick = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = easeOutQuint(progress);
        const offset = startOffset + (targetOffset - startOffset) * eased;
        stripEl.style.transform = `translate3d(0, ${offset}px, 0)`;

        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          stripEl.style.transform = `translate3d(0, ${targetOffset}px, 0)`;
          resolve();
        }
      };

      requestAnimationFrame(tick);
    });

    reelEl.classList.remove('reel--spinning');

    this.normalizeStrip(stripEl, targetOffset, cellHeight, visibleRows, createSymbolCell);

    const cells = [...stripEl.querySelectorAll('.symbol-cell')];
    const centerCell = cells[Math.floor(visibleRows / 2)] ?? null;
    return centerCell;
  }
}
