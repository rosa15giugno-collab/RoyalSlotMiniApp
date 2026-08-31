/**
 * Test payline configuration — run: node scripts/test-paylines.js
 */

import {
  PAYLINES_BY_BET,
  getEnabledPaylines,
  evaluateEnabledPaylines,
  calculateWinAmount,
} from '../js/paylines.js';

const sampleGrid = [
  ['cherry', 'cherry', 'cherry'],
  ['bell', 'cherry', 'star'],
  ['cherry', 'cherry', 'cherry'],
];

/** Griglia con vincita su una sola linea orizzontale (bet 250). */
const singleWinGrid = [
  ['bell', 'horseshoe', 'star'],
  ['cherry', 'horseshoe', 'bar'],
  ['seven', 'horseshoe', 'crown'],
];

/** Griglia con vincita orizzontale + verticale contemporanea (bet 500). */
const multiWinGrid = [
  ['bell', 'horseshoe', 'star'],
  ['horseshoe', 'horseshoe', 'horseshoe'],
  ['seven', 'horseshoe', 'crown'],
];

console.log('=== ROYAL SLOT — Test linee vincenti ===\n');

Object.entries(PAYLINES_BY_BET).forEach(([bet, lineIds]) => {
  const enabled = getEnabledPaylines(Number(bet));
  const evaluation = evaluateEnabledPaylines(sampleGrid, Number(bet));

  console.log(`PUNTATA ${bet} CHIP — ${enabled.length} linee controllate:`);
  enabled.forEach((line, index) => {
    const result = evaluation.results[index];
    const status = result.win
      ? `VINCENTE (${result.match.toUpperCase()} x3)`
      : 'nessuna combinazione';
    console.log(`  ${index + 1}. [${line.type}] ${line.name} (${line.id}) → ${status}`);
  });

  const winners = evaluation.winningLines.map((entry) => entry.line.name);
  const totalWin = calculateWinAmount(evaluation);
  console.log(`  → Combinazioni rilevate: ${winners.length ? winners.join(', ') : 'nessuna'}`);
  console.log(`  → Vincita totale: ${totalWin.toLocaleString('it-IT')} CHIP\n`);
});

console.log('=== Simulazione 1: una linea vincente (250 CHIP) ===');
const singleEval = evaluateEnabledPaylines(singleWinGrid, 250);
const singleWin = calculateWinAmount(singleEval);
console.log(`Linee: ${singleEval.winningLines.map((e) => e.line.name).join(', ') || 'nessuna'}`);
console.log(`Atteso: horseshoe x3 → round(5 × 250 × 1.655634) = 2.070 CHIP`);
console.log(`Calcolato: ${singleWin.toLocaleString('it-IT')} CHIP`);
console.log(singleWin === 2070 ? 'OK\n' : 'ERRORE\n');

console.log('=== Simulazione 2: più linee vincenti (500 CHIP) ===');
const multiEval = evaluateEnabledPaylines(multiWinGrid, 500);
const multiWin = calculateWinAmount(multiEval);
console.log(`Linee: ${multiEval.winningLines.map((e) => e.line.name).join(', ')}`);
console.log(`Atteso: 2 × round(5 × 500 × 0.827817) = 4.140 CHIP`);
console.log(`Calcolato: ${multiWin.toLocaleString('it-IT')} CHIP`);
console.log(multiWin === 4140 ? 'OK\n' : 'ERRORE\n');

console.log('Griglia di test (reels x righe):');
sampleGrid.forEach((column, reelIndex) => {
  console.log(`  Rullo ${reelIndex + 1}: ${column.join(' | ')}`);
});
