import { useEffect, useMemo, useState } from 'react';
import { formatProbabilityPct } from '@/lib/formatters';
import CompanyLogo from '@/components/CompanyLogo';

const API_URL = import.meta.env.VITE_API_URL;

const filters = [
  ['all', 'All'],
  ['match', 'Matches'],
  ['miss', 'Misses'],
];

function getResult(prediction) {
  if (prediction.actual_fast_recovery == null) return 'open';
  const predictedFast = prediction.predicted_fast_recovery ?? prediction.predicted_probability >= 0.5;
  return prediction.actual_fast_recovery === predictedFast ? 'match' : 'miss';
}

function formatRelativeTime(value) {
  const rawValue = String(value || '');
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(rawValue);
  const date = new Date(hasTimezone ? rawValue : `${rawValue}Z`);
  if (Number.isNaN(date.getTime())) return 'Unknown';

  const elapsedSeconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (elapsedSeconds < 60) return 'Just now';

  const seconds = -elapsedSeconds;
  const ranges = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  const [unit, divisor] = ranges.find(([, size]) => Math.abs(seconds) >= size) || ['minute', 60];
  const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(Math.round(seconds / divisor), unit);
  return relative.charAt(0).toUpperCase() + relative.slice(1);
}

function PredictionHistory({ token }) {
  const [history, setHistory] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    async function loadHistory() {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const response = await fetch(`${API_URL}/api/predictions/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error(`History request failed: ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error('History response was not a list');
        setHistory(data);
      } catch (loadError) {
        console.error('Unable to load prediction history', loadError);
        setError('Could not load prediction history. Please try again.');
      } finally {
        setLoading(false);
      }
    }

    loadHistory();
  }, [token]);

  const rows = useMemo(
    () => history.map(prediction => ({ ...prediction, result: getResult(prediction) })),
    [history]
  );
  const matches = rows.filter(row => row.result === 'match').length;
  const misses = rows.filter(row => row.result === 'miss').length;
  const resolved = matches + misses;
  const matchRate = resolved ? Math.round((matches / resolved) * 100) : null;
  const visibleRows = filter === 'all' ? rows : rows.filter(row => row.result === filter);

  if (loading) return <p className="text-sm text-[#64748B]">Loading predictions...</p>;
  if (!token) return <p className="text-sm text-[#64748B]">Sign in to see your prediction history.</p>;
  if (error) return <p className="text-sm text-[#B91C1C]">{error}</p>;

  return (
    <section className="pb-8">
      <h1 className="type-page-title text-[#0B1220]">History</h1>

      <div className="mt-7 flex flex-wrap items-center gap-x-12 gap-y-3 border-y border-[#D9E2EA] px-1 py-5">
        <p className="font-mono text-lg font-medium text-[#0B1220]">
          {rows.length} <span className="font-sans text-sm font-normal text-[#8A9AAF]">predictions</span>
        </p>
        <p className="font-mono text-lg font-medium">
          <span className="text-[#05664F]">{matches} match</span>
          <span className="px-2 text-[#94A3B8]">·</span>
          <span className="text-[#B91C1C]">{misses} miss</span>
        </p>
        <p className="ml-auto font-mono text-sm font-medium text-[#8A9AAF]">
          {matchRate == null ? 'No resolved outcomes' : `${matchRate}% match rate`}
        </p>
      </div>

      <div className="mt-7 flex gap-2">
        {filters.map(([value, name]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
            className={`cursor-pointer rounded-full border px-5 py-2 text-sm font-semibold transition-colors ${
              filter === value
                ? 'border-[#12355B] bg-[#12355B] text-white'
                : 'border-[#D9E2EA] bg-white text-[#52637A] hover:border-[#9DB9D1] hover:text-[#12355B]'
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-[#DDE7F0] bg-white shadow-sm">
        <div className="grid grid-cols-[minmax(220px,1.3fr)_180px_minmax(220px,1fr)_110px] gap-5 border-b border-[#DDE7F0] px-7 py-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8A9AAF]">
          <span>Company</span>
          <span>Predicted</span>
          <span>Model signal</span>
          <span className="text-right">Result</span>
        </div>

        {visibleRows.length === 0 && (
          <p className="px-7 py-10 text-center text-sm text-[#64748B]">No predictions in this view.</p>
        )}

        {visibleRows.map(prediction => {
          const isExpanded = expandedId === prediction.id;
          const probability = Math.max(0, Math.min(100, prediction.predicted_probability * 100));
          const resultLabel = prediction.result === 'open' ? 'Window open' : prediction.result === 'match' ? 'Match' : 'Miss';

          return (
            <div key={prediction.id} className="border-b border-[#EEF2F6] last:border-0">
              <button
                type="button"
                onClick={() => setExpandedId(current => current === prediction.id ? null : prediction.id)}
                className={`relative grid w-full cursor-pointer grid-cols-[minmax(220px,1.3fr)_180px_minmax(220px,1fr)_110px] items-center gap-5 px-7 py-5 text-left transition-colors hover:bg-[#F8FBFF] ${isExpanded ? 'bg-[#F4F8FC]' : ''}`}
              >
                {isExpanded && <span className={`absolute inset-y-0 left-0 w-[3px] ${prediction.result === 'match' ? 'bg-[#05664F]' : prediction.result === 'miss' ? 'bg-[#B91C1C]' : 'bg-[#64748B]'}`} />}
                <span className="flex min-w-0 items-center gap-3">
                  <CompanyLogo symbol={prediction.ticker} size={40} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[#0B1220]">{prediction.company || prediction.ticker || 'Unknown company'}</span>
                    <span className="block truncate text-xs text-[#8A9AAF]">{prediction.ticker} · {prediction.sector || 'Sector unavailable'}</span>
                  </span>
                </span>
                <span className="font-mono text-sm text-[#52637A]">{formatRelativeTime(prediction.created_at)}</span>
                <span className="flex items-center gap-3">
                  <span className="relative h-1.5 w-28 overflow-visible rounded-full bg-[#EAF0F5]">
                    <span className="absolute top-1/2 left-1/2 h-3 w-px -translate-y-1/2 bg-[#94A3B8]" />
                    <span
                      className={`block h-full rounded-full ${prediction.result === 'match' ? 'bg-[#05664F]' : prediction.result === 'miss' ? 'bg-[#F0A024]' : 'bg-[#64748B]'}`}
                      style={{ width: `${probability}%` }}
                    />
                  </span>
                  <span className="font-mono text-sm font-medium text-[#0B1220]">{formatProbabilityPct(prediction.predicted_probability)}</span>
                </span>
                <span className={`justify-self-end rounded-full px-3 py-1 text-xs font-semibold ${
                  prediction.result === 'match'
                    ? 'bg-[#DDF7EC] text-[#047857]'
                    : prediction.result === 'miss'
                      ? 'bg-[#FEE2E2] text-[#B91C1C]'
                      : 'bg-[#EEF2F6] text-[#64748B]'
                }`}>
                  {resultLabel}
                </span>
              </button>

              {isExpanded && (
                <div className="grid grid-cols-2 gap-5 bg-[#F8FBFF] px-20 py-4 text-xs text-[#64748B] sm:grid-cols-4">
                  <p>Drop quarter<br /><span className="mt-1 block font-mono text-[#0B1220]">{prediction.drop_quarter || 'Unknown'}</span></p>
                  <p>Max drawdown<br /><span className="mt-1 block font-mono text-[#B4232C]">{prediction.event_max_drawdown_pct == null ? 'Unknown' : `${(prediction.event_max_drawdown_pct * 100).toFixed(1)}%`}</span></p>
                  <p>Model call<br /><span className="mt-1 block text-[#0B1220]">{prediction.predicted_probability >= 0.5 ? 'Recovery in next 180 days' : 'No recovery in next 180 days'}</span></p>
                  <p>Actual outcome<br /><span className="mt-1 block text-[#0B1220]">{prediction.actual_status === 'not_recovered_within_180d' ? 'Not recovered within 180 days' : prediction.days_to_recovery != null ? `${prediction.days_to_recovery} days after prediction date` : 'Evaluation window open'}</span></p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default PredictionHistory;
