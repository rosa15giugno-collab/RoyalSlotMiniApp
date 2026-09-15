/**
 * Mini App table geometry — visual grid of the live betting cloth.
 * 0 spans the top row; 1–36 run left-to-right, top-to-bottom (1 2 3 / 4 5 6 …).
 * Magnetic snap: straight is the easy default; split/corner only when the
 * finger is actually near a shared edge / 2×2 intersection.
 */

/** Inner portion of a cell that is always straight (unit square). */
export const STRAIGHT_INSET = 0.13;
/** Corner capture in unit-square space. */
export const CORNER_NORM = 0.22;
/** Outer band for split. */
export const SPLIT_BAND = 0.13;
export const TABLE_EDGE = STRAIGHT_INSET;
export const ZERO_SPLIT_BAND = 0.82;

export const MAGNET = Object.freeze({
  /** Circular radius around a 2×2 intersection (+37% from 8, ~+80% from original 6). */
  cornerPx: 11,
  /** Pixel distance to the shared-edge segment (+20% from 5). */
  splitPx: 6,
  outsidePx: 22,
  feltPx: 36,
  /** Inner fraction of each axis always treated as straight. */
  straightKeep: 0.74,
});

export function uniqSorted(nums) {
  return [...new Set((nums || []).map(Number))].sort((a, b) => a - b);
}

/** Grid cell for 1–36. row 0 = {1,2,3}, col 0 = left. */
export function numberCell(n) {
  const num = Number(n);
  if (num < 1 || num > 36) return null;
  const idx = num - 1;
  return { row: Math.floor(idx / 3), col: idx % 3 };
}

export function numbersInCell(row, col) {
  return Number(row) * 3 + Number(col) + 1;
}

export function isValidSplitNumbers(numbers) {
  const nums = uniqSorted(numbers);
  if (nums.length !== 2) return false;
  if (!nums.every((n) => Number.isInteger(n) && n >= 0 && n <= 36)) return false;
  const [a, b] = nums;
  if (a === 0) return b === 1 || b === 2 || b === 3;
  const ca = numberCell(a);
  const cb = numberCell(b);
  if (!ca || !cb) return false;
  const sameRow = ca.row === cb.row && Math.abs(ca.col - cb.col) === 1;
  const sameCol = ca.col === cb.col && Math.abs(ca.row - cb.row) === 1;
  return sameRow || sameCol;
}

export function isValidCornerNumbers(numbers) {
  const nums = uniqSorted(numbers);
  if (nums.length !== 4) return false;
  if (nums.some((n) => n === 0)) return false;
  if (!nums.every((n) => Number.isInteger(n) && n >= 1 && n <= 36)) return false;
  const cells = nums.map(numberCell);
  if (cells.some((c) => !c)) return false;
  const rows = [...new Set(cells.map((c) => c.row))].sort((a, b) => a - b);
  const cols = [...new Set(cells.map((c) => c.col))].sort((a, b) => a - b);
  if (rows.length !== 2 || cols.length !== 2) return false;
  if (rows[1] !== rows[0] + 1 || cols[1] !== cols[0] + 1) return false;
  const expected = [
    numbersInCell(rows[0], cols[0]),
    numbersInCell(rows[0], cols[1]),
    numbersInCell(rows[1], cols[0]),
    numbersInCell(rows[1], cols[1]),
  ];
  return uniqSorted(expected).join(',') === nums.join(',');
}

export function normalizeSplit(numbers) {
  const nums = uniqSorted(numbers);
  if (!isValidSplitNumbers(nums)) return null;
  return nums;
}

export function normalizeCorner(numbers) {
  const nums = uniqSorted(numbers);
  if (!isValidCornerNumbers(nums)) return null;
  return nums;
}

export function splitKey(numbers) {
  const nums = normalizeSplit(numbers);
  return nums ? `split:${nums.join('-')}` : '';
}

export function cornerKey(numbers) {
  const nums = normalizeCorner(numbers);
  return nums ? `corner:${nums.join('-')}` : '';
}

function distToCorner(localX, localY) {
  const dx = Math.min(localX, 1 - localX);
  const dy = Math.min(localY, 1 - localY);
  return Math.hypot(dx, dy);
}

/**
 * @returns {{ betType: 'straight'|'split'|'corner', targetNumber: number|null, numbers: number[]|null } | null}
 */
export function resolveZeroSpot(localX, localY) {
  const x = Number(localX);
  const y = Number(localY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (y > ZERO_SPLIT_BAND) {
    if (x < 0.28) return { betType: 'split', targetNumber: null, numbers: [0, 1] };
    if (x > 0.72) return { betType: 'split', targetNumber: null, numbers: [0, 3] };
    return { betType: 'split', targetNumber: null, numbers: [0, 2] };
  }
  return { betType: 'straight', targetNumber: 0, numbers: null };
}

/**
 * Unit-square resolver used by tests. Straight owns the inner cell;
 * split/corner only fire in the outer band / corner circle.
 */
export function resolveInsideSpot({ row, col, localX, localY, n }) {
  const inset = STRAIGHT_INSET;
  const inStraight = localX >= inset && localX <= 1 - inset && localY >= inset && localY <= 1 - inset;
  if (inStraight) {
    return { betType: 'straight', targetNumber: Number(n), numbers: null };
  }

  const nearLeft = localX < SPLIT_BAND;
  const nearRight = localX > 1 - SPLIT_BAND;
  const nearTop = localY < SPLIT_BAND;
  const nearBottom = localY > 1 - SPLIT_BAND;
  const nearCorner = distToCorner(localX, localY) <= CORNER_NORM
    && (nearLeft || nearRight)
    && (nearTop || nearBottom);

  if (nearCorner) {
    const c0 = nearLeft ? col - 1 : col;
    const r0 = nearTop ? row - 1 : row;
    if (c0 >= 0 && c0 <= 1 && r0 >= 0 && r0 <= 10) {
      const nums = normalizeCorner([
        numbersInCell(r0, c0),
        numbersInCell(r0, c0 + 1),
        numbersInCell(r0 + 1, c0),
        numbersInCell(r0 + 1, c0 + 1),
      ]);
      if (nums) return { betType: 'corner', targetNumber: null, numbers: nums };
    }
  }

  const inMidY = localY >= SPLIT_BAND && localY <= 1 - SPLIT_BAND;
  const inMidX = localX >= SPLIT_BAND && localX <= 1 - SPLIT_BAND;

  if ((nearLeft || nearRight) && inMidY) {
    const leftCol = nearLeft ? col - 1 : col;
    if (leftCol >= 0 && leftCol <= 1) {
      const nums = normalizeSplit([
        numbersInCell(row, leftCol),
        numbersInCell(row, leftCol + 1),
      ]);
      if (nums) return { betType: 'split', targetNumber: null, numbers: nums };
    }
  }

  if ((nearTop || nearBottom) && inMidX) {
    const topRow = nearTop ? row - 1 : row;
    if (topRow >= 0 && topRow <= 10) {
      const nums = normalizeSplit([
        numbersInCell(topRow, col),
        numbersInCell(topRow + 1, col),
      ]);
      if (nums) return { betType: 'split', targetNumber: null, numbers: nums };
    }
  }

  return { betType: 'straight', targetNumber: Number(n), numbers: null };
}

export function coveredNumbers(spot) {
  if (!spot) return [];
  if (spot.betType === 'straight') return [Number(spot.targetNumber)];
  if (spot.betType === 'split' || spot.betType === 'corner') return uniqSorted(spot.numbers);
  return [];
}

export function aimPreviewLabel(spot) {
  if (!spot?.betType) return '';
  if (spot.betType === 'straight') {
    return Number.isFinite(spot.targetNumber) ? `NUMERO ${spot.targetNumber}` : 'NUMERO';
  }
  if (spot.betType === 'split') {
    const nums = uniqSorted(spot.numbers);
    return nums.length === 2 ? `SPLIT ${nums.join('–')}` : 'SPLIT';
  }
  if (spot.betType === 'corner') {
    const nums = uniqSorted(spot.numbers);
    return nums.length === 4 ? `CORNER ${nums.join('·')}` : 'CORNER';
  }
  if (spot.betType === 'red') return 'ROSSO';
  if (spot.betType === 'black') return 'NERO';
  if (spot.betType === 'even') return 'PARI';
  if (spot.betType === 'odd') return 'DISPARI';
  if (spot.betType === 'dozen_1') return '1ª DECINA';
  if (spot.betType === 'dozen_2') return '2ª DECINA';
  if (spot.betType === 'dozen_3') return '3ª DECINA';
  return String(spot.betType);
}

function hypot(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return hypot(px, py, x1, y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return hypot(px, py, x1 + t * dx, y1 + t * dy);
}

function splitDistance(clientX, clientY, snap) {
  if (Number.isFinite(snap.x1) && Number.isFinite(snap.y1) && Number.isFinite(snap.x2) && Number.isFinite(snap.y2)) {
    return distToSegment(clientX, clientY, snap.x1, snap.y1, snap.x2, snap.y2);
  }
  return hypot(clientX, clientY, snap.x, snap.y);
}

/**
 * Build magnetic snap targets from pixel rects.
 * @param {Record<number, { left: number, top: number, width: number, height: number }>} cellRects
 */
export function buildMagneticSnaps(cellRects) {
  const snaps = [];
  const rect = (n) => cellRects[n];
  const mid = (a, b) => ({
    x: (a.left + a.width / 2 + b.left + b.width / 2) / 2,
    y: (a.top + a.height / 2 + b.top + b.height / 2) / 2,
  });

  if (rect(0)) {
    const z = rect(0);
    snaps.push({
      betType: 'straight',
      targetNumber: 0,
      numbers: null,
      x: z.left + z.width / 2,
      y: z.top + z.height * 0.42,
    });
    const yEdge = z.top + z.height;
    const zW = z.width / 3;
    snaps.push({
      betType: 'split', targetNumber: null, numbers: [0, 1],
      x: z.left + zW / 2, y: yEdge,
      x1: z.left, y1: yEdge, x2: z.left + zW, y2: yEdge,
    });
    snaps.push({
      betType: 'split', targetNumber: null, numbers: [0, 2],
      x: z.left + z.width / 2, y: yEdge,
      x1: z.left + zW, y1: yEdge, x2: z.left + 2 * zW, y2: yEdge,
    });
    snaps.push({
      betType: 'split', targetNumber: null, numbers: [0, 3],
      x: z.left + (5 * z.width) / 6, y: yEdge,
      x1: z.left + 2 * zW, y1: yEdge, x2: z.left + z.width, y2: yEdge,
    });
  }

  for (let n = 1; n <= 36; n += 1) {
    const r = rect(n);
    if (!r) continue;
    snaps.push({
      betType: 'straight',
      targetNumber: n,
      numbers: null,
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
    });
  }

  for (let row = 0; row < 12; row += 1) {
    for (let col = 0; col < 2; col += 1) {
      const a = numbersInCell(row, col);
      const b = numbersInCell(row, col + 1);
      const ra = rect(a);
      const rb = rect(b);
      if (!ra || !rb) continue;
      const p = mid(ra, rb);
      const x = (ra.left + ra.width + rb.left) / 2;
      snaps.push({
        betType: 'split',
        targetNumber: null,
        numbers: normalizeSplit([a, b]),
        x: p.x,
        y: p.y,
        x1: x,
        y1: Math.max(ra.top, rb.top),
        x2: x,
        y2: Math.min(ra.top + ra.height, rb.top + rb.height),
      });
    }
  }

  for (let row = 0; row < 11; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const a = numbersInCell(row, col);
      const b = numbersInCell(row + 1, col);
      const ra = rect(a);
      const rb = rect(b);
      if (!ra || !rb) continue;
      const p = mid(ra, rb);
      const y = (ra.top + ra.height + rb.top) / 2;
      snaps.push({
        betType: 'split',
        targetNumber: null,
        numbers: normalizeSplit([a, b]),
        x: p.x,
        y: p.y,
        x1: Math.max(ra.left, rb.left),
        y1: y,
        x2: Math.min(ra.left + ra.width, rb.left + rb.width),
        y2: y,
      });
    }
  }

  for (let row = 0; row < 11; row += 1) {
    for (let col = 0; col < 2; col += 1) {
      const nums = [
        numbersInCell(row, col),
        numbersInCell(row, col + 1),
        numbersInCell(row + 1, col),
        numbersInCell(row + 1, col + 1),
      ];
      const rs = nums.map(rect);
      if (rs.some((r) => !r)) continue;
      snaps.push({
        betType: 'corner',
        targetNumber: null,
        numbers: normalizeCorner(nums),
        x: rs.reduce((sum, r) => sum + r.left + r.width / 2, 0) / 4,
        y: rs.reduce((sum, r) => sum + r.top + r.height / 2, 0) / 4,
      });
    }
  }

  return snaps.filter((s) => s.numbers !== undefined && (s.betType !== 'split' && s.betType !== 'corner' ? true : s.numbers));
}

function pointInCell(clientX, clientY, r) {
  return clientX >= r.left
    && clientX <= r.left + r.width
    && clientY >= r.top
    && clientY <= r.top + r.height;
}

function containingCell(clientX, clientY, cellRects) {
  if (!cellRects) return null;
  for (let n = 0; n <= 36; n += 1) {
    const r = cellRects[n];
    if (r && pointInCell(clientX, clientY, r)) return { n, r };
  }
  return null;
}

function straightOfCell(n, snaps, r, clientX, clientY) {
  const found = (snaps || []).find((s) => s.betType === 'straight' && Number(s.targetNumber) === Number(n));
  const x = found?.x ?? (r ? r.left + r.width / 2 : clientX);
  const y = found?.y ?? (r ? r.top + r.height / 2 : clientY);
  return {
    betType: 'straight',
    targetNumber: Number(n),
    numbers: null,
    x,
    y,
    d: hypot(clientX, clientY, x, y),
  };
}

function inStraightKeep(clientX, clientY, r, keep) {
  const insetX = ((1 - keep) / 2) * r.width;
  const insetY = ((1 - keep) / 2) * r.height;
  return clientX >= r.left + insetX
    && clientX <= r.left + r.width - insetX
    && clientY >= r.top + insetY
    && clientY <= r.top + r.height - insetY;
}

/**
 * Straight owns ~76% of the cell. Corner/split only in the thin outer rim,
 * and only when the finger is actually on the intersection / shared line.
 * Anywhere else inside a cell snaps to that number's center.
 */
export function pickMagneticSnap(clientX, clientY, snaps, radii = MAGNET, cellRects = null) {
  if (!snaps?.length) return null;
  let bestStraight = null;
  let bestSplit = null;
  let bestCorner = null;
  for (const snap of snaps) {
    const d = hypot(clientX, clientY, snap.x, snap.y);
    const row = { ...snap, d };
    if (snap.betType === 'straight') {
      if (!bestStraight || d < bestStraight.d) bestStraight = row;
    } else if (snap.betType === 'split') {
      const sd = splitDistance(clientX, clientY, snap);
      const splitRow = { ...snap, d: sd };
      if (!bestSplit || sd < bestSplit.d) bestSplit = splitRow;
    } else if (snap.betType === 'corner') {
      if (!bestCorner || d < bestCorner.d) bestCorner = row;
    }
  }

  const cornerPx = radii.cornerPx ?? MAGNET.cornerPx;
  const splitPx = radii.splitPx ?? MAGNET.splitPx;
  const keep = radii.straightKeep ?? MAGNET.straightKeep;
  const home = containingCell(clientX, clientY, cellRects);
  const innerStraight = home && inStraightKeep(clientX, clientY, home.r, keep);
  const deepInner = home && inStraightKeep(clientX, clientY, home.r, Math.min(keep + 0.08, 0.88));

  if (bestCorner && bestCorner.d <= cornerPx && !deepInner) return bestCorner;
  if (innerStraight) return straightOfCell(home.n, snaps, home.r, clientX, clientY);
  if (bestSplit && bestSplit.d <= splitPx) return bestSplit;
  if (home) return straightOfCell(home.n, snaps, home.r, clientX, clientY);
  if (bestStraight && bestStraight.d <= (radii.feltPx ?? MAGNET.feltPx)) return bestStraight;
  return null;
}
