export function formatProbabilityPct(value) {
  if (value == null || Number.isNaN(Number(value))) return 'N/A';

  return `${(Number(value) * 100).toFixed(1)}%`;
}
