/**
 * PokerSlot payline SVG overlay.
 * Paths use the same rows[] as PAYLINE_DEFINITIONS / the engine.
 * Coordinates are % of the machine (viewBox 0 0 100 100).
 */

import { COLS } from './game-config.js';
import { REELS } from './layout.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const LINE_STROKES = Object.freeze([
  'rgba(255, 214, 110, 0.92)',
  'rgba(232, 176, 74, 0.92)',
  'rgba(212, 140, 64, 0.92)',
  'rgba(220, 96, 72, 0.92)',
  'rgba(196, 48, 58, 0.92)',
  'rgba(255, 196, 92, 0.92)',
  'rgba(188, 120, 52, 0.92)',
  'rgba(240, 168, 88, 0.92)',
  'rgba(176, 64, 54, 0.92)',
  'rgba(255, 228, 150, 0.92)',
]);

export function cellCenterPct(col, row) {
  const reel = REELS[col];
  return {
    x: reel.left + reel.width / 2,
    y: reel.top + row * reel.pitch + reel.cellHeight / 2,
  };
}

export function pointsFromRows(rows, count = rows.length) {
  const n = Math.min(rows.length, Math.max(0, count));
  const pts = [];
  for (let col = 0; col < n; col += 1) {
    pts.push(cellCenterPct(col, rows[col]));
  }
  return pts;
}

function pointsAttr(points) {
  return points.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' ');
}

function strokeFor(line) {
  const match = String(line?.id || '').match(/(\d+)$/);
  const n = match ? Number.parseInt(match[1], 10) : 1;
  return LINE_STROKES[(n > 0 ? n - 1 : 0) % LINE_STROKES.length];
}

function ensureSurface(svgEl) {
  if (!svgEl) return;
  svgEl.setAttribute('viewBox', '0 0 100 100');
  svgEl.setAttribute('preserveAspectRatio', 'none');
  svgEl.setAttribute('width', '100%');
  svgEl.setAttribute('height', '100%');
}

function appendPolyline(svgEl, points, className, line) {
  if (!points.length) return;
  const poly = document.createElementNS(SVG_NS, 'polyline');
  poly.setAttribute('class', className);
  poly.setAttribute('fill', 'none');
  poly.setAttribute('points', pointsAttr(points));
  poly.setAttribute('data-line-id', line.id);
  poly.setAttribute('stroke', strokeFor(line));
  svgEl.appendChild(poly);
}

export function renderPaylineGuides(svgEl, lines) {
  if (!svgEl) return;
  ensureSurface(svgEl);
  svgEl.replaceChildren();
  lines.forEach((line) => {
    appendPolyline(svgEl, pointsFromRows(line.rows, COLS), 'poker-line poker-line--guide', line);
  });
}

export function renderWinningPaylines(svgEl, lineWins, paylinesById) {
  if (!svgEl) return;
  ensureSurface(svgEl);
  svgEl.replaceChildren();
  lineWins.forEach((win) => {
    const line = paylinesById.get(win.lineId);
    if (!line) return;
    const count = Array.isArray(win.cellIndexes) ? win.cellIndexes.length : COLS;
    appendPolyline(
      svgEl,
      pointsFromRows(line.rows, count),
      'poker-line poker-line--win',
      line,
    );
  });
}

export function clearPaylineSvg(svgEl) {
  svgEl?.replaceChildren();
}

export function paylineMap(lines) {
  return new Map(lines.map((line) => [line.id, line]));
}
