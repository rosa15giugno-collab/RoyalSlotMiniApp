import { getEnabledPaylines, getGridCell } from './paylines.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function getCellCenter(reelsWindow, reels, reel, row) {
  const cell = getGridCell(reels, reel, row);
  if (!cell || !reelsWindow) return null;

  const windowRect = reelsWindow.getBoundingClientRect();
  const cellRect = cell.getBoundingClientRect();

  return {
    x: cellRect.left + cellRect.width / 2 - windowRect.left,
    y: cellRect.top + cellRect.height / 2 - windowRect.top,
  };
}

function lineEndpoints(reelsWindow, reels, line) {
  const [startCoord, , endCoord] = line.coords;
  const start = getCellCenter(reelsWindow, reels, startCoord[0], startCoord[1]);
  const end = getCellCenter(reelsWindow, reels, endCoord[0], endCoord[1]);

  if (!start || !end) return null;

  return { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
}

function setupSvgSurface(svgEl, reelsWindow) {
  const { width, height } = reelsWindow.getBoundingClientRect();
  const safeWidth = Math.max(width, 1);
  const safeHeight = Math.max(height, 1);

  svgEl.setAttribute('viewBox', `0 0 ${safeWidth} ${safeHeight}`);
  svgEl.setAttribute('width', '100%');
  svgEl.setAttribute('height', '100%');
  svgEl.setAttribute('preserveAspectRatio', 'none');

  return { width: safeWidth, height: safeHeight };
}

function createSvgLine(endpoints, className, lineId) {
  const el = document.createElementNS(SVG_NS, 'line');

  el.setAttribute('class', className);
  el.setAttribute('data-line-id', lineId);
  el.setAttribute('x1', String(endpoints.x1));
  el.setAttribute('y1', String(endpoints.y1));
  el.setAttribute('x2', String(endpoints.x2));
  el.setAttribute('y2', String(endpoints.y2));

  return el;
}

function renderLines(svgEl, bet, reelsWindow, reels, lineClassPrefix, lines) {
  if (!svgEl || !reelsWindow || !reels?.length) return;

  setupSvgSurface(svgEl, reelsWindow);
  svgEl.replaceChildren();

  lines.forEach((line) => {
    const endpoints = lineEndpoints(reelsWindow, reels, line);
    if (!endpoints) return;

    svgEl.appendChild(createSvgLine(
      endpoints,
      `${lineClassPrefix} ${lineClassPrefix}--${line.type}`,
      line.id,
    ));
  });
}

/** Linee guida visibili per la puntata corrente (pre-spin). */
export function renderPaylineGuides(svgEl, bet, reelsWindow, reels) {
  renderLines(svgEl, bet, reelsWindow, reels, 'payline-guide', getEnabledPaylines(bet));
}

/** Evidenzia le linee effettivamente vincenti (post-spin). */
export function renderWinningLineOverlays(svgEl, winningLines, reelsWindow, reels) {
  if (!svgEl || !reelsWindow || !reels?.length) return;

  setupSvgSurface(svgEl, reelsWindow);
  svgEl.replaceChildren();

  winningLines.forEach((entry) => {
    const endpoints = lineEndpoints(reelsWindow, reels, entry.line);
    if (!endpoints) return;

    svgEl.appendChild(createSvgLine(
      endpoints,
      `payline-win payline-win--${entry.line.type}`,
      entry.line.id,
    ));
  });
}

export function clearWinningLineOverlays(svgEl) {
  svgEl?.replaceChildren();
}
