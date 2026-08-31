/**
 * Overlay award mapping tests — run: node scripts/test-poker-overlay-award.mjs
 * No DOM, no math payouts, no engine.
 */

import {
  FREE_SPINS_BY_SCATTER,
  freeSpinsForScatterCount,
  overlayPipCount,
  overlayScatterLabel,
} from '../poker/free-spin-award.js';

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

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: atteso ${expected}, ottenuto ${actual}`);
  }
}

record('3 SCATTER → 5 FS', () => {
  assertEqual(freeSpinsForScatterCount(3), 5, 'award');
  assertEqual(FREE_SPINS_BY_SCATTER[3], 5, 'table');
});

record('4 SCATTER → 7 FS', () => {
  assertEqual(freeSpinsForScatterCount(4), 7, 'award');
});

record('5 SCATTER → 10 FS', () => {
  assertEqual(freeSpinsForScatterCount(5), 10, 'award');
});

record('6 SCATTER → 10 FS', () => {
  assertEqual(freeSpinsForScatterCount(6), 10, 'award');
  assertEqual(overlayScatterLabel(6), '6 SCATTER', 'label');
  assertEqual(overlayPipCount(6), 5, 'pips');
});

record('count > 5 non causa errori', () => {
  assertEqual(freeSpinsForScatterCount(7), 10, '7');
  assertEqual(freeSpinsForScatterCount(15), 10, '15');
  assertEqual(freeSpinsForScatterCount(99), 10, '99');
  assertEqual(overlayPipCount(15), 5, 'pips cap');
  assertEqual(overlayScatterLabel(9), '9 SCATTER', 'label 9');
  assertEqual(overlayScatterLabel(15), '15 SCATTER', 'label 15');
});

record('0/1/2 SCATTER → 0 FS', () => {
  assertEqual(freeSpinsForScatterCount(0), 0, '0');
  assertEqual(freeSpinsForScatterCount(1), 0, '1');
  assertEqual(freeSpinsForScatterCount(2), 0, '2');
});

record('5+ accende tutti e 5 i pallini', () => {
  assertEqual(overlayPipCount(5), 5, '5');
  assertEqual(overlayPipCount(6), 5, '6');
  assertEqual(overlayPipCount(3), 3, '3');
  assertEqual(overlayPipCount(4), 4, '4');
});

const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok);
console.log('');
console.log(`${passed}/${results.length} test passati`);
if (failed.length) process.exitCode = 1;
