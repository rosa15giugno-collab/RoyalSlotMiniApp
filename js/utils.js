export function formatChips(value) {
  return Number(value).toLocaleString('it-IT');
}

export function formatPayoutMultiplier(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 1.0000001) return '';
  if (Number.isInteger(n)) return `×${n}`;
  return `×${String(n).replace('.', ',')}`;
}
