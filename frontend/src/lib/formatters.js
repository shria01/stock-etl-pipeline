export function formatProbabilityPct(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';

  return `${(Number(value) * 100).toFixed(1)}%`;
}
