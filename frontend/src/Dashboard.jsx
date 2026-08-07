import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
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
  ArrowDown,
  ArrowUp,
  Minus
} from 'lucide-react';
import { TickerIcon, TickerSymbol, TickerPriceChange } from '@/components/kibo-ui/ticker/index';
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
const label = "text-[11px] font-semibold uppercase tracking-[0.16em] text-[#64748B]";
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

function logoUrl(ticker, size = 52) {
  return `https://img.logo.dev/ticker/${ticker}?token=${import.meta.env.VITE_LOGO_DEV_TOKEN}&size=${size}&retina=true`;
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
      <div className="flex items-center gap-2">
        <TickerIcon asChild>
          <img
            src={logoUrl(event.ticker)}
            alt={`${event.ticker} logo`}
            width={24}
            height={24}
            className="rounded-full"
          />
        </TickerIcon>
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

function DrawdownRecoverySketch() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#DDE7F0] bg-white/75 px-4 py-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#64748B]">
            Event shape
          </p>
          <p className="mt-1 text-xs font-semibold text-[#0B1220]">
            Baseline → trough → recovery
          </p>
        </div>

        <Badge className="rounded-full bg-[#E8F1F8] px-2.5 py-1 text-[11px] font-semibold text-[#12355B] hover:bg-[#E8F1F8]">
          SQL-defined
        </Badge>
      </div>

      <svg
        viewBox="0 0 360 180"
        role="img"
        aria-label="Drawdown recovery sketch"
        className="h-32 w-full md:h-36"
      >
        <defs>
          <linearGradient id="drawdownFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#E8F1F8" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#E8F1F8" stopOpacity="0.15" />
          </linearGradient>
        </defs>

        <line
          x1="24"
          y1="48"
          x2="336"
          y2="48"
          stroke="#BFD2E3"
          strokeDasharray="6 6"
          strokeWidth="2"
        />
        <text x="24" y="34" fill="#64748B" fontSize="11" fontWeight="600">
          Baseline
        </text>

        <path
          d="M 24 52 C 76 48, 104 62, 128 88 C 150 112, 178 136, 206 132 C 248 126, 272 82, 336 50"
          fill="none"
          stroke="#12355B"
          strokeWidth="4"
          strokeLinecap="round"
        />

        <path
          d="M 24 52 C 76 48, 104 62, 128 88 C 150 112, 178 136, 206 132 C 248 126, 272 82, 336 50 L 336 160 L 24 160 Z"
          fill="url(#drawdownFill)"
        />

        <circle cx="206" cy="132" r="6" fill="#B91C1C" />
        <circle cx="336" cy="50" r="5" fill="#047857" />

        <text x="184" y="154" fill="#B91C1C" fontSize="11" fontWeight="700">
          Trough
        </text>
        <text x="270" y="38" fill="#047857" fontSize="11" fontWeight="700">
          Recovery date
        </text>

        <line x1="206" y1="132" x2="206" y2="48" stroke="#DDE7F0" strokeDasharray="4 5" />
        <line x1="336" y1="50" x2="336" y2="48" stroke="#DDE7F0" strokeDasharray="4 5" />
      </svg>
    </div>
  );
}

function Dashboard({ token, onSignIn, onRegister, onGoToPredict }) {
  const [history, setHistory] = useState([]);
  const [modelInfo, setModelInfo] = useState(null);
  const [suggested, setSuggested] = useState([]);
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

        const [modelResponse, suggestedResults, priceResults] = await Promise.all([
          fetch(`${API_URL}/api/model-info`),
          Promise.all(
            suggestedEventIds.map(id =>
              fetch(`${API_URL}/api/drawdowns/${id}`).then(r => r.json())
            )
          ),
          Promise.all(
            suggestedEventIds.map(id =>
              fetch(`${API_URL}/api/drawdowns/${id}/prices`).then(r => r.json())
            )
          ),
        ]);

        if (cancelled) return;

        const modelData = await modelResponse.json();
        setModelInfo(modelData);
        setSuggested(
          suggestedResults.map((event, i) => ({ ...event, prices: priceResults[i].prices }))
        );

        if (token) {
          const historyRes = await fetch(`${API_URL}/api/predictions/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          const rawHistory = await historyRes.json();

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

          const recentOnly = rawHistory.slice(0, 5).map(pred => ({
            ...pred,
            actualOutcome:
              pred.days_to_recovery == null
                ? null
                : pred.days_to_recovery <= 180,
          }));

          setHistory(recentOnly);
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
  const savedProbabilities = history
    .map(pred => pred.predicted_probability)
    .filter(value => typeof value === 'number');
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
      ['1,775', 'scored model events', 'Final 10-year modeling dataset used for train, validation, and holdout testing.'],
      ['476', 'stocks represented', 'Distinct S&P 500 tickers with qualifying drawdown events in the modeling window.'],
      [modelInfo?.metrics?.test_auc != null ? modelInfo.metrics.test_auc.toFixed(3) : '—', 'holdout ROC AUC', 'Model ranking performance on the chronological holdout test set.'],
    ];

    const methodologySteps = [
      [
        'Baseline',
        'Reference price',
        'A qualifying quarterly drop of 15% or more sets the quarter-start adjusted close as the recovery reference point.',
        <Minus className="h-5 w-5" />,
        "bg-[#E8F1F8] text-[#0B4F7A]",
      ],
      [
        'Trough',
        'Event low',
        'Lowest adjusted close during the drawdown quarter defines the event low.',
        <ArrowDown className="h-5 w-5" />,
        "bg-[#FEE2E2] text-[#B91C1C]",
      ],
      [
        'Recovery',
        'Recovery date',
        'First future date where price returns to baseline determines days-to-recovery.',
        <ArrowUp className="h-5 w-5" />,
        "bg-[#DDF7EC] text-[#047857]",
      ],
    ];

    return (
      <div className="mx-auto max-w-5xl text-[#0B1220]">
        <section className="mb-6 grid grid-cols-1 items-center gap-6 py-1 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="max-w-3xl">
            <p className={`mb-3 ${label}`}>
              DrawdownIQ Research
            </p>

            <h1 className="text-4xl font-bold leading-[1.05] tracking-tight text-[#0B1220] md:text-[40px]">
              S&amp;P 500 drawdown
              recovery analysis
            </h1>

            <p className="mt-3 max-w-2xl text-sm leading-7 text-[#52637A]">
              An end-to-end market data project that converts daily prices into
              SQL-defined drawdown events, measures recovery paths, and tests whether point-in-time
              features can rank faster recoveries.
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Button
                onClick={() => onGoToPredict()}
                className="h-9 cursor-pointer rounded-xl bg-[#12355B] px-4 text-sm font-semibold text-white hover:bg-[#082F49]"
              >
                Analyze a drawdown
              </Button>

              <Button
                variant="outline"
                onClick={() => document.getElementById('methodology')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="h-9 cursor-pointer rounded-xl border-[#DDE7F0] bg-white px-4 text-sm font-semibold text-[#12355B] hover:bg-[#F8FBFF] hover:text-[#082F49]"
              >
                Model analysis
              </Button>
            </div>
          </div>

          <DrawdownRecoverySketch />
        </section>

        <section id="methodology" className="mb-8 border-t border-[#DDE7F0] pt-8 scroll-mt-6">
          <div className="mb-3">
            <h2 className="text-lg font-semibold tracking-tight text-[#0B1220]">
              Event methodology
            </h2>
          </div>

          <p className="mb-6 max-w-3xl text-sm leading-6 text-[#64748B]">
            Each event is built from a defined baseline, observed trough, and measured recovery date.
          </p>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {methodologySteps.map(([title, kicker, body, icon, iconStyle], index) => (
              <div
                key={title}
                className={index === 0 ? "flex gap-4" : "flex gap-4 md:border-l md:border-[#DDE7F0] md:pl-6"}
              >
                <div className={`mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl ${iconStyle}`}>
                  {icon}
                </div>

                <div>
                  <p className={label}>{kicker}</p>
                  <h3 className="mt-2 text-base font-semibold text-[#0B1220]">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#52637A]">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <TooltipProvider delayDuration={150}>
          <section className="mb-8 border-t border-[#DDE7F0] pt-8">
            <div className="mb-5 flex items-start justify-between gap-6">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-[#0B1220]">
                  Research dataset
                </h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-[#64748B]">
                  Built from 1.3M+ daily price rows retrieved through yfinance and reduced into SQL-defined recovery events.
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
                  <div className="font-mono text-[28px] font-semibold leading-none tracking-tight text-[#0B1220]">
                    {value}
                  </div>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="mt-2 cursor-help text-left text-sm font-medium text-[#52637A] underline decoration-[#BFD2E3] decoration-dotted underline-offset-4 hover:text-[#12355B]">
                        {name}
                      </button>
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
          </section>
        </TooltipProvider>

        <section className="mb-8 border-t border-[#DDE7F0] pt-8">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-[#0B1220]">
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
          <h1 className="text-2xl font-semibold tracking-tight text-[#0B1220]">
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

      <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard icon={<TrendingUp className="h-5 w-5" />} value={predictionsCount} label="Predictions made" />
        <StatCard icon={<Search className="h-5 w-5" />} value={tickersExploredCount} label="Tickers explored" />
        <StatCard
          icon={<Target className="h-5 w-5" />}
          value={highLikelihoodCount}
          label={`High-likelihood event${highLikelihoodCount === 1 ? '' : 's'}`}
        />
      </section>

      {lastPrediction && (
        <section className="mb-6 rounded-2xl border border-[#BFD2E3] bg-[#F8FBFF] px-5 py-5 shadow-sm">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className={label}>Last prediction</p>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {lastPrediction.ticker && (
                  <TickerIcon asChild>
                    <img
                      src={logoUrl(lastPrediction.ticker, 80)}
                      alt={`${lastPrediction.ticker} logo`}
                      width={40}
                      height={40}
                      className="rounded-full"
                    />
                  </TickerIcon>
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
                  {(lastPrediction.predicted_probability * 100).toFixed(1)}%
                </span>

                {getMatchStatus(lastPrediction) != null && (
                  <span className={getMatchStatus(lastPrediction) ? badgeSuccess : badgeDanger}>
                    {getMatchStatus(lastPrediction) ? 'Match' : 'Miss'}
                  </span>
                )}
              </div>

              <p className="mt-1.5 text-sm leading-6 text-[#64748B]">
                Model estimated fast recovery probability for this historical drawdown event.
              </p>
            </div>

            <div className="grid min-w-[260px] grid-cols-2 gap-5 text-sm">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#94A3B8]">
                  Actual recovery
                </p>
                <p className="mt-1 font-medium text-[#0B1220]">
                  {lastPrediction.days_to_recovery == null
                    ? 'Pending'
                    : `${lastPrediction.days_to_recovery} days`}
                </p>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#94A3B8]">
                  Model call
                </p>
                <p className="mt-1 font-medium text-[#0B1220]">
                  {(lastPrediction.predicted_fast_recovery ?? lastPrediction.predicted_probability >= 0.5)
                    ? 'Fast recovery'
                    : 'Not fast'}
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
              <h2 className="text-lg font-semibold tracking-tight text-[#0B1220]">
                Recent predictions
              </h2>
              <p className="mt-1 text-xs leading-5 text-[#64748B]">
                Latest saved model runs.
              </p>
            </div>
            <button
              onClick={() => onGoToPredict()}
              className="cursor-pointer inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-sm font-semibold text-[#0B4F7A] transition-all duration-200 hover:-translate-y-0.5  hover:text-[#082F49]"
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
                        {(pred.predicted_probability * 100).toFixed(1)}%
                      </span>

                      <div className="text-right">
                        {isMatch != null ? (
                          <span className={isMatch ? badgeSuccess : badgeDanger}>
                            {isMatch ? 'Match' : 'Miss'}
                          </span>
                        ) : (
                          <span className={badgeNeutral}>Pending</span>
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
                <h2 className="text-lg font-semibold tracking-tight text-[#0B1220]">
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
                      50% cutoff · {modelVersion}
                    </span>
                  </div>
                </div>

                <div className="mt-4 space-y-3 border-t border-[#EEF2F6] pt-4">
                  <p className="text-xs leading-5 text-[#64748B]">
                    Evaluated on 1,775 scored recovery events with the test period held out chronologically.
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