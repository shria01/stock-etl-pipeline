import { useState, useEffect } from 'react';
import { formatProbabilityPct } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import CompanyLogo from '@/components/CompanyLogo';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  TrendingUp,
  Search,
  Target,
} from 'lucide-react';
import { TickerSymbol, TickerPriceChange } from '@/components/kibo-ui/ticker/index';
import { LineChart as RechartsLineChart, Line, YAxis, ResponsiveContainer } from 'recharts';

const API_URL = import.meta.env.VITE_API_URL;

const CURATED_EVENT_IDS = [
  5010, 5523, 4908, 4496, 5820, 5452, 5510, 4640, 4389, 5285,
  4369, 5284, 5446, 5473, 5605, 4304, 4375, 5735, 5789, 5622,
  5725, 5312, 4549, 5658, 4506,
];

/*
  Hybrid theme:
  - Institutional Asset Manager base: clean white cards, navy text, soft blue-gray borders.
  - AI Research Lab accents: subtle indigo/teal highlights, model-focused badges.
*/
const card = "rounded-2xl border border-[#DDE7F0] bg-white shadow-sm";
const cardPad = "p-5";
const label = "type-label text-[#64748B]";
const buttonPrimary =
  "cursor-pointer rounded-xl bg-[#12355B] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#082F49] active:scale-[0.98]";
const statIconWrap =
  "flex h-10 w-10 items-center justify-center rounded-xl bg-[#E8F1F8] text-[#12355B]";
const badgeSuccess =
  "rounded-full bg-[#DDF7EC] px-2.5 py-1 text-xs font-semibold text-[#047857]";
const badgeDanger =
  "rounded-full bg-[#FEE2E2] px-2.5 py-1 text-xs font-semibold text-[#B91C1C]";
const badgeNeutral =
  "rounded-full bg-[#EEF2F6] px-2.5 py-1 text-xs font-semibold text-[#475569]";
const badgeML =
  "rounded-full bg-[#12355B] px-2.5 py-1 text-xs font-semibold text-white";

// Shared card treatment for every browsable ticker/event tile on this page
// (guest "Sample recovery cases" and logged-in "Suggested drawdowns to explore"
// were previously two separate, slightly-drifted implementations of the same idea).
const eventCardClass =
  "group cursor-pointer rounded-2xl border border-[#DDE7F0] bg-white p-5 text-left " +
  "transition-all duration-200 hover:-translate-y-0.5 hover:border-[#0B4F7A]/40 " +
  "hover:shadow-[0_10px_24px_rgba(18,53,91,0.08)] active:scale-[0.99]";

const eventCardClass1 =
  "group cursor-pointer rounded-2xl border border-[#DDE7F0] bg-[#F8FBFF] p-5 text-left " +
  "transition-all duration-200 hover:-translate-y-0.5 hover:border-[#BFD2E3] hover:bg-white " +
  "hover:shadow-[0_10px_24px_rgba(18,53,91,0.08)] active:scale-[0.99]";

function getMatchStatus(pred) {
  if (pred.actualOutcome == null) return null;

  const predictedFastRecovery =
    pred.predicted_fast_recovery ?? pred.predicted_probability >= 0.5;

  return pred.actualOutcome === predictedFastRecovery;
}

function getRandomEventIds(pool, count = 4) {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function EventSparkline({ prices }) {
  if (!prices || prices.length === 0) return null;

  const data = prices.map(p => ({ value: typeof p === 'number' ? p : p.close }));

  return (
    <ResponsiveContainer width="100%" height={36}>
      <RechartsLineChart data={data}>
        <YAxis domain={['dataMin', 'dataMax']} hide />
        <Line
          type="monotone"
          dataKey="value"
          stroke="#12355B"
          strokeWidth={1.5}
          dot={false}
        />
      </RechartsLineChart>
    </ResponsiveContainer>
  );
}

// One stat card definition, reused for all three top-row stats so their
// padding/icon treatment/typography can never drift from each other.
function StatCard({ icon, value, label: statLabel }) {
  return (
    <div className="rounded-2xl border border-[#DDE7F0] bg-white px-5 py-5 shadow-sm">
      <div className="flex items-start gap-4">
        <div className={statIconWrap}>{icon}</div>
        <div>
          <div className="font-mono text-2xl font-semibold tracking-tight text-[#0B1220]">
            {value}
          </div>
          <div className="mt-1 text-sm font-medium text-[#52637A]">
            {statLabel}
          </div>
        </div>
      </div>
    </div>
  );
}

// One browsable-event card definition, reused everywhere a ticker/drawdown/
// sparkline tile appears (guest and logged-in views alike).
function SuggestedEventCard({ event, onSelect, actionLabel = "Open recovery path", eventCard = eventCardClass}) {
  const drawdownPct = event.drop_pct * 100;

  return (
    <button onClick={() => onSelect(event.id)} className={eventCard}>
      <div className="flex items-center gap-3">
        <CompanyLogo symbol={event.ticker} size={30} />
        <div>
          <TickerSymbol symbol={event.ticker} className="text-sm text-[#0B1220]" />
          <div className="mt-0.5 text-xs font-medium text-[#64748B] whitespace-nowrap">
            {event.drop_quarter}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
          Drawdown
        </span>
        <TickerPriceChange
          change={drawdownPct}
          isPercent
          className="justify-end text-[12.5px] text-[#B91C1C]"
        />
      </div>

      <div className="mt-3">
        <EventSparkline prices={event.prices} />
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-[#EEF2F6] pt-3">
        <span className="text-xs font-semibold text-[#0B4F7A]">
          {actionLabel}
        </span>
        <span className="text-[#0B4F7A] transition-transform group-hover:translate-x-0.5">
          →
        </span>
      </div>
    </button>
  );
}

function MethodologyDiagram({ steps }) {
  return (
    <div className="overflow-x-auto py-4">
      <div className="min-w-[760px]">
        <div className="mb-4 flex items-center justify-between gap-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8A9AAF]">One example event, illustrated</p>
          <div className="flex items-center gap-5 text-xs text-[#8A9AAF]">
            <span className="flex items-center gap-2"><i className="h-0.5 w-4 bg-[#B91C1C]" />Price</span>
            <span className="flex items-center gap-2"><i className="w-4 border-t border-dashed border-[#94A3B8]" />Baseline</span>
          </div>
        </div>

        <svg viewBox="0 0 1000 250" className="h-auto w-full" role="img" aria-label="Baseline, event low, quarter-end prediction date, and forward recovery path">
          <defs>
            <linearGradient id="methodologyDrawdownFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#F5DCDD" stopOpacity="0.75" />
              <stop offset="100%" stopColor="#F5DCDD" stopOpacity="0.18" />
            </linearGradient>
          </defs>

          <line x1="42" y1="46" x2="958" y2="46" stroke="#AEBECD" strokeDasharray="4 5" strokeWidth="1.5" />
          <path d="M42 46 C145 78 230 142 310 162 C390 110 470 128 575 122 C675 148 760 198 855 202 C895 151 930 88 958 46 L958 46 L42 46 Z" fill="url(#methodologyDrawdownFill)" />
          <path d="M42 46 C145 78 230 142 310 162 C390 110 470 128 575 122 C675 148 760 198 855 202 C895 151 930 88 958 46" fill="none" stroke="#B91C1C" strokeWidth="3" />

          <line x1="590" y1="20" x2="590" y2="205" stroke="#F0A024" strokeDasharray="4 5" strokeWidth="1.5" />
          <circle cx="42" cy="46" r="7" fill="white" stroke="#12355B" strokeWidth="3" />
          <circle cx="310" cy="162" r="7" fill="white" stroke="#B91C1C" strokeWidth="3" />
          <circle cx="590" cy="122" r="7" fill="white" stroke="#F0A024" strokeWidth="3" />
          <circle cx="958" cy="46" r="7" fill="white" stroke="#05664F" strokeWidth="3" />

          <text x="42" y="28" fill="#12355B" fontSize="12" fontFamily="JetBrains Mono, monospace">Baseline</text>
          <text x="958" y="28" textAnchor="end" fill="#05664F" fontSize="12" fontFamily="JetBrains Mono, monospace">Recovery</text>
          <text x="310" y="190" textAnchor="middle" fill="#B91C1C" fontSize="12" fontFamily="JetBrains Mono, monospace">Event low</text>
          <text x="310" y="208" textAnchor="middle" fill="#D16767" fontSize="11" fontFamily="JetBrains Mono, monospace">−18% vs. baseline</text>
          <text x="590" y="103" textAnchor="middle" fill="#B45309" fontSize="12" fontFamily="JetBrains Mono, monospace">Prediction date</text>

          <line x1="42" y1="225" x2="958" y2="225" stroke="#D4DEE8" strokeWidth="1.5" />
          <text x="42" y="244" fill="#A5B4C5" fontSize="11" fontFamily="JetBrains Mono, monospace">quarter starts</text>
          <text x="958" y="244" textAnchor="end" fill="#A5B4C5" fontSize="11" fontFamily="JetBrains Mono, monospace">180 days later</text>
        </svg>

        <div className="relative mt-6 h-5 border-t-2 border-[#D4DEE8]">
          {[[3.5, '#12355B'], [30, '#C52228'], [59.2, '#F0A024'], [97, '#05664F']].map(([left, color]) => (
            <span key={left} className="absolute top-0 h-3.5 w-3.5 -translate-x-1/2 -translate-y-[8px] rounded-full" style={{ left: `${left}%`, backgroundColor: color }} />
          ))}
        </div>

        <div className="grid grid-cols-4 gap-7">
          {steps.map(([title, kicker, body]) => (
            <div key={title} className="border-l border-[#D7E1EA] pl-4">
              <h3 className="type-card-title text-[#0B1220]">{title}</h3>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8A9AAF]">{kicker}</p>
              <p className="mt-2 text-sm leading-6 text-[#52637A]">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Dashboard({ token, onSignIn, onRegister, onGoToPredict, onGoToHistory, onGoToModelAnalysis }) {
  const [history, setHistory] = useState([]);
  const [modelInfo, setModelInfo] = useState(null);
  const [suggested, setSuggested] = useState([]);
  const [historyError, setHistoryError] = useState(null);
  const [suggestedEventIds] = useState(() => getRandomEventIds(CURATED_EVENT_IDS));
  const [loading, setLoading] = useState(true);
  const [dashboardStats, setDashboardStats] = useState({
    predictionsCount: 0,
    tickersExploredCount: 0,
    highLikelihoodCount: 0,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      try {
        setLoading(true);

        // Keep the independent dashboard sections isolated: a stale or missing
        // curated event must not hide otherwise valid model metrics.
        const modelRequest = fetch(`${API_URL}/api/model-info`)
          .then(response => {
            if (!response.ok) throw new Error(`Model info request failed: ${response.status}`);
            return response.json();
          })
          .then(data => {
            if (!cancelled) setModelInfo(data);
          })
          .catch(error => console.error('Unable to load model info', error));

        const suggestedRequest = Promise.allSettled(
          suggestedEventIds.map(async id => {
            const [eventResponse, pricesResponse] = await Promise.all([
              fetch(`${API_URL}/api/drawdowns/${id}`),
              fetch(`${API_URL}/api/drawdowns/${id}/prices`),
            ]);

            if (!eventResponse.ok || !pricesResponse.ok) {
              throw new Error(`Unable to load drawdown ${id}`);
            }

            const [event, priceData] = await Promise.all([
              eventResponse.json(),
              pricesResponse.json(),
            ]);
            return { ...event, prices: priceData.prices ?? [] };
          })
        ).then(results => {
          if (!cancelled) {
            setSuggested(
              results
                .filter(result => result.status === 'fulfilled')
                .map(result => result.value)
            );
          }
        });

        await Promise.all([modelRequest, suggestedRequest]);

        if (token) {
          try {
            setHistoryError(null);
            const historyRes = await fetch(`${API_URL}/api/predictions/me`, {
              headers: { Authorization: `Bearer ${token}` },
            });

            if (!historyRes.ok) {
              throw new Error(`Prediction history request failed: ${historyRes.status}`);
            }

            const rawHistory = await historyRes.json();
            if (!Array.isArray(rawHistory)) {
              throw new Error('Prediction history response was not a list');
            }

            if (cancelled) return;

            setDashboardStats({
              predictionsCount: rawHistory.length,
              tickersExploredCount: new Set(
                rawHistory.map(pred => pred.ticker).filter(Boolean)
              ).size,
              highLikelihoodCount: rawHistory.filter(
                pred => pred.predicted_probability >= 0.6
              ).length,
            });

            setHistory(rawHistory.slice(0, 5).map(pred => ({
              ...pred,
              actualOutcome: pred.actual_fast_recovery ?? null,
            })));
          } catch (error) {
            console.error('Unable to load dashboard history', error);
            if (!cancelled) setHistoryError('Prediction history could not be loaded.');
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [token, suggestedEventIds]);

  const { predictionsCount, tickersExploredCount, highLikelihoodCount } = dashboardStats;
  const lastPrediction = history.length > 0 ? history[0] : null;
  const modelVersion = modelInfo?.model_version ?? modelInfo?.version ?? 'Model v1';

  if (loading) {
    return (
      <div className="text-[#0B1220]">
        <div className="mb-6">
          <Skeleton className="mb-3 h-7 w-48 rounded-xl bg-[#DDE7F0]" />
          <Skeleton className="h-4 w-96 max-w-full rounded bg-[#DDE7F0]" />
        </div>

        <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div key={i} className={`${card} ${cardPad}`}>
              <Skeleton className="mb-4 h-10 w-10 rounded-2xl bg-[#E8F1F8]" />
              <Skeleton className="mb-3 h-8 w-20 rounded bg-[#DDE7F0]" />
              <Skeleton className="h-4 w-32 rounded bg-[#DDE7F0]" />
            </div>
          ))}
        </div>

        <Skeleton className={`${card} h-56 bg-[#F8FAFC]`} />
      </div>
    );
  }

  if (!token) {
    const researchMetrics = [
      ['1,894', 'raw drawdown events', 'Generated from 1.3M+ yfinance daily price rows across 11 years of S&P 500 history.'],
      ['1,610', 'clean classifier events', 'Model v3 events with a complete point-in-time feature row and a fully observed 180-day forward label.'],
      ['476', 'stocks represented', 'Distinct S&P 500 tickers with qualifying drawdown events in the modeling window.'],
      [modelInfo?.metrics?.test_auc != null ? modelInfo.metrics.test_auc.toFixed(3) : '—', 'holdout ROC AUC', 'Model ranking performance on the chronological holdout test set.'],
    ];

    const methodologySteps = [
      [
        'Baseline',
        'Reference price',
        'Quarter-start adjusted close.',
      ],
      [
        'Event low',
        'Quarter low',
        'Lowest adjusted close during the drawdown quarter.',
      ],
      [
        'Prediction date',
        'Quarter-end cutoff',
        'Only information available by this date is used.',
      ],
      [
        'Forward recovery',
        '180-day label',
        'Positive label if price returns to baseline within the next 180 days.',
      ],
    ];

    return (
      <div className="mx-auto max-w-5xl text-[#0B1220]">
        <section className="mb-8 grid gap-7 py-1 lg:grid-cols-[1.05fr_0.95fr] lg:items-start lg:gap-12">
          <div>
            <p className={`mb-3 ${label}`}>
              DrawdownIQ Research
            </p>

            <h1 className="type-page-title text-[#0B1220]">
              S&amp;P 500 180-day forward recovery analysis
            </h1>

            <div className="mt-5 flex flex-wrap gap-3">
              <Button
                onClick={() => onGoToPredict()}
                className="h-9 cursor-pointer rounded-xl bg-[#12355B] px-4 text-sm font-semibold text-white hover:bg-[#082F49]"
              >
                Analyze a drawdown
              </Button>

              <Button
                variant="outline"
                onClick={onGoToModelAnalysis}
                className="h-9 cursor-pointer rounded-xl border-[#DDE7F0] bg-white px-4 text-sm font-semibold text-[#12355B] hover:bg-[#F8FBFF] hover:text-[#082F49]"
              >
                Model analysis
              </Button>
            </div>
          </div>

          <div className="lg:pt-12">
            <p className="type-body text-[#52637A]">
              DrawdownIQ studies major quarterly selloffs among current S&amp;P 500 constituents and estimates whether stocks still below baseline at quarter-end recover during the next 180 days.
            </p>
            <p className="type-body mt-2 text-[#64748B]">
              The project combines SQL event construction, point-in-time feature engineering, leakage-audited model evaluation, and a React dashboard for exploring historical recovery cases.
            </p>

          </div>

        </section>

        <section id="methodology" className="mb-8 border-t border-[#DDE7F0] pt-8 scroll-mt-6">
          <div className="mb-3">
            <h2 className="type-subsection-title text-[#0B1220]">
              Event methodology
            </h2>
          </div>

          <p className="type-body mb-6 max-w-3xl text-[#64748B]">
            Each event starts with a quarter-start baseline, tracks the deepest price decline during the quarter, and uses the completed-quarter date as the model&apos;s prediction cutoff.
          </p>

          <MethodologyDiagram steps={methodologySteps} />
        </section>

        <TooltipProvider delayDuration={150}>
          <section className="mb-8 border-t border-[#DDE7F0] pt-8">
            <div className="mb-5 flex items-start justify-between gap-6">
              <div>
                <h2 className="type-subsection-title text-[#0B1220]">
                  Research dataset
                </h2>
                <p className="type-body mt-1 max-w-3xl text-[#64748B]">
                  Built from 1.3M+ daily price rows retrieved through yfinance and reduced into SQL-defined quarterly drawdown events with quarter-end prediction cutoffs.
                </p>
              </div>

              <p className="hidden whitespace-nowrap text-sm font-medium text-[#52637A] md:block">
                Source data and modeling scale
              </p>
            </div>

            <div className="grid grid-cols-2 gap-y-6 md:grid-cols-4">
              {researchMetrics.map(([value, name, description], index) => (
                <div
                  key={name}
                  className={index === 0 ? '' : 'border-l border-[#DDE7F0] pl-5'}
                >
                  <div className="type-metric font-mono text-[#0B1220]">
                    {value}
                  </div>

                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          className="mt-2 cursor-help text-left text-sm font-medium text-[#52637A] underline decoration-[#BFD2E3] decoration-dotted underline-offset-4 hover:text-[#12355B]"
                        />
                      }
                    >
                      {name}
                    </TooltipTrigger>
                    <TooltipContent
                      side="bottom"
                      align="start"
                      sideOffset={8}
                      className="max-w-56 rounded-lg border border-[#DDE7F0] bg-white px-3 py-2 text-xs leading-5 text-[#52637A] shadow-sm"
                    >
                      <p>{description}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              ))}
            </div>

            <p className="mt-6 border-l-2 border-[#F0A024] pl-4 text-xs leading-5 text-[#7A6A52]">
              <span className="font-semibold text-[#9A5B0A]">Scope note:</span> this study uses today&apos;s S&amp;P 500 constituents and current sector mappings, so it is not a survivorship-bias-free historical index backtest.
            </p>
          </section>
        </TooltipProvider>

        <section className="mb-8 border-t border-[#DDE7F0] pt-8">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="type-subsection-title text-[#0B1220]">
                Sample recovery cases
              </h2>
              <p className="mt-1 text-xs text-[#64748B]">
                Open a real S&amp;P 500 drawdown and compare the model signal with the realized recovery path.
              </p>
            </div>

            <button
              onClick={() => onGoToPredict()}
              className="cursor-pointer inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-sm font-semibold text-[#0B4F7A] transition-all duration-200 hover:-translate-y-0.5 hover:text-[#082F49]"
            >
              View event library <span className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {suggested.map(event => (
              <SuggestedEventCard key={event.id} event={event} onSelect={onGoToPredict} />
            ))}
          </div>
        </section>

        <Card className="rounded-2xl border-[#BFD2E3] bg-[#F8FBFF] shadow-sm">
          <CardContent className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-[#12355B]">
              Save your analysis and review past recovery-model runs.
            </p>

            <div className="flex flex-shrink-0 gap-2">
              <Button
                variant="outline"
                onClick={onSignIn}
                className="cursor-pointer rounded-xl border-[#BFD2E3] bg-white px-4 text-sm font-semibold text-[#12355B] hover:bg-[#F8FBFF]"
              >
                Sign in
              </Button>

              <Button
                onClick={onRegister}
                className="h-9 cursor-pointer rounded-xl bg-[#12355B] px-4 text-sm font-semibold text-white hover:bg-[#082F49]"
              >
                Register
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl text-[#0B1220]">
      <section className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className={`mb-2 ${label}`}>
            Recovery model workspace
          </p>
          <h1 className="type-page-title text-[#0B1220]">
            Welcome back
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[#64748B]">
            Explore drawdowns, run new predictions, and track your recovery model history.
          </p>
        </div>

        <Button
          onClick={() => onGoToPredict()}
          className="h-9 cursor-pointer rounded-xl bg-[#12355B] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#082F49]"
        >
          + New prediction
        </Button>
      </section>

      {historyError && (
        <div className="mb-6 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
          {historyError} Refresh the page to try again.
        </div>
      )}

      <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard icon={<TrendingUp className="h-5 w-5" />} value={predictionsCount} label="Predictions made" />
        <StatCard icon={<Search className="h-5 w-5" />} value={tickersExploredCount} label="Tickers explored" />
        <StatCard
          icon={<Target className="h-5 w-5" />}
          value={highLikelihoodCount}
          label={`Event${highLikelihoodCount === 1 ? '' : 's'} at or above 60%`}
        />
      </section>

      {lastPrediction && (
        <section className="mb-6 rounded-2xl border border-[#BFD2E3] bg-[#F8FBFF] px-5 py-5 shadow-sm">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className={label}>Last prediction</p>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {lastPrediction.ticker && (
                  <CompanyLogo symbol={lastPrediction.ticker} size={44} />
                )}

                <span className="font-mono text-xl font-semibold text-[#0B1220]">
                  {lastPrediction.ticker ?? 'Unknown'}
                </span>

                {lastPrediction.drop_quarter && (
                  <span className={badgeNeutral}>
                    {lastPrediction.drop_quarter}
                  </span>
                )}

                <span className={badgeNeutral}>
                  {formatProbabilityPct(lastPrediction.predicted_probability)}
                </span>

                {getMatchStatus(lastPrediction) != null && (
                  <span className={getMatchStatus(lastPrediction) ? badgeSuccess : badgeDanger}>
                    {getMatchStatus(lastPrediction) ? 'Match' : 'Miss'}
                  </span>
                )}
              </div>

              <p className="mt-1.5 text-sm leading-6 text-[#64748B]">
                Model estimated the probability of recovery during the 180 days after the completed-quarter prediction date.
              </p>
            </div>

            <div className="grid min-w-[260px] grid-cols-2 gap-5 text-sm">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#94A3B8]">
                  Actual recovery
                </p>
                <p className="mt-1 font-medium text-[#0B1220]">
                  {lastPrediction.actual_status === 'not_recovered_within_180d'
                    ? 'Not recovered within 180 days'
                    : lastPrediction.days_to_recovery == null
                      ? 'Evaluation window open'
                    : `${lastPrediction.days_to_recovery} days after prediction date`}
                </p>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#94A3B8]">
                  Model call
                </p>
                <p className="mt-1 font-medium text-[#0B1220]">
                  {(lastPrediction.predicted_fast_recovery ?? lastPrediction.predicted_probability >= 0.5)
                    ? 'Recovery in next 180 days'
                    : 'No recovery in next 180 days'}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-5">
        <section className="overflow-hidden rounded-2xl border border-[#DDE7F0] bg-white shadow-sm lg:col-span-3">
          <div className="flex items-center justify-between gap-4 border-b border-[#DDE7F0] px-5 py-5">
            <div>
              <h2 className="type-subsection-title text-[#0B1220]">
                Recent predictions
              </h2>
              <p className="mt-1 text-xs leading-5 text-[#64748B]">
                Latest saved model runs.
              </p>
            </div>
            <button
              onClick={onGoToHistory}
              className="group inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1 text-sm font-semibold text-[#0B4F7A] transition-all duration-200 hover:-translate-y-0.5 hover:text-[#082F49]"
            >
              View all <span className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
            </button>
          </div>

          <div className="p-5">
            {history.length === 0 && (
              <div className="rounded-2xl border border-dashed border-[#BFD2E3] bg-[#F8FBFF] p-8 text-center">
                <p className="text-sm font-semibold text-[#0B1220]">
                  No predictions yet
                </p>
                <p className="mt-1 text-sm text-[#64748B]">
                  Run your first prediction from the Predict page.
                </p>
                <button onClick={() => onGoToPredict()} className={`${buttonPrimary} mt-5`}>
                  Start predicting
                </button>
              </div>
            )}

            {history.length > 0 && (
              <div>
                <div className="grid grid-cols-3 border-b border-[#E8F1F8] pb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#64748B]">
                  <span>Ticker</span>
                  <span>Probability</span>
                  <span className="text-right">Outcome</span>
                </div>

                {history.slice(0, 5).map(pred => {
                  const isMatch = getMatchStatus(pred);

                  return (
                    <div
                      key={pred.id}
                      className="grid grid-cols-3 items-center border-b border-[#EEF2F6] py-3.5 last:border-0"
                    >
                      <span className="font-mono text-sm font-semibold text-[#0B1220]">
                        {pred.ticker ?? 'Unknown'}
                      </span>

                      <span className="font-mono text-sm text-[#334155]">
                        {formatProbabilityPct(pred.predicted_probability)}
                      </span>

                      <div className="text-right">
                        {isMatch != null ? (
                          <span className={isMatch ? badgeSuccess : badgeDanger}>
                            {isMatch ? 'Match' : 'Miss'}
                          </span>
                        ) : (
                          <span className={badgeNeutral}>Window open</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-[#DDE7F0] bg-white shadow-sm lg:col-span-2">
          <div className="border-b border-[#DDE7F0] px-5 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="type-subsection-title text-[#0B1220]">
                  Model performance
                </h2>
                <p className="mt-1 text-xs leading-5 text-[#64748B]">
                  Leakage-free holdout evaluation.
                </p>
              </div>
              <span className={badgeML}>ML</span>
            </div>
          </div>

          <div className="p-5">
            {modelInfo && (
              <>
                <div className="space-y-4">
                  <div className="flex justify-between gap-4 text-sm">
                    <span className="text-[#64748B]">Test ROC AUC</span>
                    <span className="font-mono font-semibold text-[#0B1220]">
                      {modelInfo.metrics.test_auc}
                    </span>
                  </div>

                  <div className="flex justify-between gap-4 text-sm">
                    <span className="text-[#64748B]">Accuracy</span>
                    <span className="font-mono font-semibold text-[#0B1220]">
                      {(modelInfo.metrics.test_accuracy * 100).toFixed(1)}%
                    </span>
                  </div>

                  <div className="flex justify-between gap-4 text-sm">
                    <span className="text-[#64748B]">Baseline accuracy</span>
                    <span className="font-mono font-semibold text-[#0B1220]">
                      {(modelInfo.metrics.baseline_accuracy * 100).toFixed(1)}%
                    </span>
                  </div>

                  <div className="flex justify-between gap-4 text-sm">
                    <span className="text-[#64748B]">Decision threshold</span>
                    <span className="font-mono font-semibold text-[#0B1220]">
                      {((modelInfo.threshold ?? 0.5) * 100).toFixed(0)}% cutoff · {modelVersion}
                    </span>
                  </div>
                </div>

                <div className="mt-4 space-y-3 border-t border-[#EEF2F6] pt-4">
                  <p className="text-xs leading-5 text-[#64748B]">
                    Trained on {modelInfo.metrics.training_events?.toLocaleString() ?? '—'} events and evaluated on a chronological holdout of {modelInfo.metrics.test_events?.toLocaleString() ?? '—'} events.
                  </p>
                  <div className="mt-4 rounded-2xl border border-[#BFD2E3] bg-[#F8FBFF] px-3 py-2 text-xs leading-5 text-[#12355B]">
                    The model is best used as a recovery-ranking signal, not a guaranteed market forecast.
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      </div>
      

      <Card className="overflow-hidden rounded-2xl border-[#DDE7F0] bg-white py-0 gap-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-[#DDE7F0] px-5 py-5">
          <div>
            <CardTitle className="text-lg font-semibold text-[#0B1220]">
              Suggested drawdowns to explore
            </CardTitle>
            <p className="mt-1 text-xs text-[#64748B]">
              Curated historical events to test against the model.
            </p>
          </div>
          <button
            onClick={() => onGoToPredict()}
            className="cursor-pointer inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-sm font-semibold text-[#0B4F7A] transition-all duration-200 hover:-translate-y-0.5 hover:text-[#082F49]"
          >
            Explore more <span className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
          </button>
        </CardHeader>

        <CardContent className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          {suggested.map(event => (
            <SuggestedEventCard
              key={event.id}
              event={event}
              onSelect={onGoToPredict}
              actionLabel="Analyze event"
              eventCard={eventCardClass1}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default Dashboard;
