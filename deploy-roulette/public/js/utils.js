export function formatChips(value) {
  return Number(value).toLocaleString('it-IT');
}

export function formatPayoutMultiplier(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 1.0000001) return '';
  if (Number.isInteger(n)) return `×${n}`;
  return `×${String(n).replace('.', ',')}`;
}

const VIP_TIER_LABELS = { 1: 'BRONZE', 2: 'SILVER', 3: 'GOLD' };

export function vipTierLabel(vipLevel) {
  return VIP_TIER_LABELS[Number(vipLevel)] || '';
}

export function shouldShowVipSecondChance(payload) {
  return Boolean(
    payload?.vip_second_chance_triggered && payload?.vip_second_chance_result_used,
  );
}
