import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TickerIcon, TickerSymbol } from '@/components/kibo-ui/ticker/index';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  ArrowDown,
  BarChart3,
  Percent,
  Ruler,
  TrendingUp,
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL;
const priceHistoryCache = new Map();

const card = 'rounded-2xl border-[#DDE7F0] bg-white shadow-[0_10px_30px_rgba(18,53,91,0.06)]';
const label = 'text-[11px] font-semibold uppercase tracking-[0.16em] text-[#64748B]';
const buttonPrimary =
  'h-10 cursor-pointer rounded-xl bg-[#12355B] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#082F49] disabled:cursor-not-allowed disabled:opacity-50';
const badgeSuccess =
  'rounded-full bg-[#DDF7EC] px-2.5 py-1 text-xs font-semibold text-[#047857] hover:bg-[#DDF7EC]';
const badgeDanger =
  'rounded-full bg-[#FEE2E2] px-2.5 py-1 text-xs font-semibold text-[#B91C1C] hover:bg-[#FEE2E2]';
const badgeNeutral =
  'rounded-full bg-[#EEF2F6] px-2.5 py-1 text-xs font-semibold text-[#475569] hover:bg-[#EEF2F6]';

function getOrCreateSessionId() {
  let sessionId = localStorage.getItem('session_id');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem('session_id', sessionId);
  }
  return sessionId;
}

function describeOutcome(daysToRecovery) {
  if (daysToRecovery == null) {
    return {
      label: 'Not recovered',
      detail: 'This stock has not recovered as of the latest data.',
    };
  }
  if (daysToRecovery <= 180) {
    return {
      label: `Recovered fast · ${daysToRecovery.toLocaleString()} days`,
      detail: 'The stock recovered within 180 days after the completed drop quarter.',
    };
  }
  return {
    label: `Recovered slowly · ${daysToRecovery.toLocaleString()} days`,
    detail: 'The stock recovered more than 180 days after the completed drop quarter.',
  };
}

function formatPct(value, digits = 1) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}

function formatBaselinePct(value, digits = 1) {
  if (value == null || Number.isNaN(value)) return '—';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(digits)}%`;
}

function CompanyLogo({ symbol, size = 28 }) {
  return (
    <TickerIcon asChild>
      <img
        src={`https://img.logo.dev/ticker/${symbol}?token=${import.meta.env.VITE_LOGO_DEV_TOKEN}&size=52&retina=true`}
        alt={`${symbol} logo`}
        width={size}
        height={size}
        className="rounded-full"
      />
    </TickerIcon>
  );
}

function PriceTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;

  const point = payload.find(item => item?.payload)?.payload;
  if (!point) return null;

  return (
    <div className="rounded-xl border border-[#DDE7F0] bg-white px-3 py-2 text-xs shadow-sm">
      <p className="font-mono font-semibold text-[#0B1220]">{point.price_date}</p>
      <p className="mt-1 text-[#64748B]">
        Vs. baseline:{' '}
        <span className="font-mono text-[#0B1220]">
          {formatBaselinePct(point.baseline_return_pct)}
        </span>
      </p>
      <p className="mt-1 text-[#94A3B8]">
        Close:{' '}
        <span className="font-mono">
          {point.close?.toFixed?.(2) ?? point.close}
        </span>
      </p>
    </div>
  );
}

function PreviewSparkline({ tone = 'up' }) {
  const path = tone === 'down'
    ? 'M4 28 C18 20 28 38 42 30 S67 24 84 34 S110 35 128 24'
    : 'M4 38 C18 34 28 42 42 32 S68 30 84 25 S110 18 128 12';

  return (
    <svg viewBox="0 0 132 48" className="h-12 w-full overflow-visible">
      <path d="M4 24 H128" stroke="#DDE7F0" strokeDasharray="4 4" strokeWidth="1" />
      <path
        d={path}
        fill="none"
        stroke={tone === 'down' ? '#B91C1C' : '#0B4F7A'}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="42" cy={tone === 'down' ? 30 : 32} r="3" fill="white" stroke="#B91C1C" strokeWidth="2" />
      <circle cx="128" cy={tone === 'down' ? 24 : 12} r="3" fill="white" stroke="#047857" strokeWidth="2" />
    </svg>
  );
}

function PredictWorkspacePreview() {
  return (
    <div className="relative mx-auto w-full max-w-md pt-4 lg:pt-0">
      <div className="rounded-[28px] border border-[#DDE7F0] bg-white/90 p-4 shadow-[0_24px_60px_rgba(18,53,91,0.14)] backdrop-blur">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#64748B]">
              Analysis preview
            </p>
            <p className="mt-1 text-sm font-semibold text-[#0B1220]">
              Drawdown recovery workspace
            </p>
          </div>
          <Badge className={badgeNeutral}>Model v1</Badge>
        </div>

        <div className="rounded-2xl border border-[#E8F1F8] bg-[#F8FBFF] p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-sm">
                <span className="font-mono text-xs font-bold text-[#12355B]">NV</span>
              </div>
              <div>
                <p className="font-mono text-sm font-semibold text-[#0B1220]">NVDA</p>
                <p className="text-[11px] text-[#64748B]">2022-04-01 drawdown</p>
              </div>
            </div>
            <span className="font-mono text-sm font-semibold text-[#B91C1C]">-43.2%</span>
          </div>
          <PreviewSparkline />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-[#DDE7F0] bg-white p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">
              Model signal
            </p>
            <p className="mt-2 font-mono text-2xl font-semibold text-[#0B1220]">29%</p>
            <div className="mt-2 h-1.5 rounded-full bg-[#EEF2F6]">
              <div className="h-full w-[29%] rounded-full bg-[#64748B]" />
            </div>
          </div>

          <div className="rounded-2xl border border-[#BBF7D0] bg-[#F0FDF4] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#047857]">
              Outcome
            </p>
            <p className="mt-2 text-sm font-semibold text-[#047857]">Match</p>
            <p className="mt-1 text-[11px] leading-4 text-[#52637A]">Compare signal with historical recovery.</p>
          </div>
        </div>
      </div>
    </div>
  );
}


function PredictContextPanel() {
  const stats = [
    { label: 'Scored drawdowns', value: '1,775' },
    { label: 'Stocks modeled', value: '476' },
    { label: 'Model window', value: '10 yrs' },
    { label: 'Holdout ROC AUC', value: '0.709' },
  ];

  const steps = [
    {
      title: 'Search a ticker',
      detail: 'Find real S&P 500 quarterly drawdowns of 15% or more.',
    },
    {
      title: 'Choose an event',
      detail: 'Use point-in-time features captured before recovery was known.',
    },
    {
      title: 'Compare recovery',
      detail: 'Run the model and compare the signal with the actual recovery path.',
    },
  ];

  return (
    <section className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Card className="gap-0 overflow-hidden rounded-[24px] border-[#DDE7F0] bg-white py-0 shadow-[0_18px_45px_rgba(18,53,91,0.07)]">
        <CardHeader className="border-b border-[#DDE7F0] px-5 py-4">
          <p className={label}>What this page shows</p>
          <p className="mt-1 text-sm leading-6 text-[#52637A]">
            Use the Predict page as a historical recovery lab: start from a real drawdown,
            run the model, then inspect whether the stock recovered within 180 days after quarter-end.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 p-5 md:grid-cols-3">
          {steps.map((step, index) => (
            <div key={step.title} className="rounded-2xl border border-[#EEF2F6] bg-[#F8FBFF] p-4">
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-xl bg-[#E8F1F8] font-mono text-xs font-bold text-[#12355B]">
                {index + 1}
              </div>
              <p className="text-sm font-semibold text-[#0B1220]">{step.title}</p>
              <p className="mt-1 text-xs leading-5 text-[#64748B]">{step.detail}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="gap-0 overflow-hidden rounded-[24px] border-[#DDE7F0] bg-[#F8FBFF] py-0 shadow-[0_18px_45px_rgba(18,53,91,0.06)]">
        <CardHeader className="border-b border-[#DDE7F0] px-5 py-4">
          <p className={label}>Dataset</p>
          <p className="mt-1 text-xs leading-5 text-[#64748B]">Historical drawdown events used by Model v1.</p>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 p-5">
          {stats.map(stat => (
            <div key={stat.label} className="rounded-2xl border border-[#E8F1F8] bg-white px-3 py-3">
              <p className="font-mono text-lg font-semibold text-[#12355B]">{stat.value}</p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#64748B]">{stat.label}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

function RecoveryPathChart({ priceHistory }) {
  if (!priceHistory?.prices?.length || !priceHistory.baseline_price) return null;

  const baselinePrice = priceHistory.baseline_price;
  const prices = priceHistory.prices.map(point => ({
    ...point,
    baseline_return_pct: ((point.close - baselinePrice) / baselinePrice) * 100,
  }));

  const baselineDate =
    priceHistory.baseline_date ||
    priceHistory.baseline_price_date ||
    priceHistory.drop_quarter ||
    prices[0]?.price_date;
  const recoveryDate = priceHistory.recovered_date || null;

  const chartData = [];

  prices.forEach((point, index) => {
    if (index > 0) {
      const previous = prices[index - 1];
      const previousValue = previous.baseline_return_pct;
      const currentValue = point.baseline_return_pct;
      const crossedBaseline =
        (previousValue < 0 && currentValue > 0) ||
        (previousValue > 0 && currentValue < 0);

      if (crossedBaseline) {
        const distance = Math.abs(previousValue) + Math.abs(currentValue);
        const crossingRatio = distance === 0 ? 0.5 : Math.abs(previousValue) / distance;
        const isPostRecoveryCrossing = recoveryDate && point.price_date >= recoveryDate;

        chartData.push({
          ...point,
          chart_index: index - 1 + crossingRatio,
          price_date: point.price_date,
          close: baselinePrice,
          baseline_return_pct: 0,
          underwater: isPostRecoveryCrossing ? null : 0,
          post_recovery: isPostRecoveryCrossing ? 0 : null,
          is_baseline_crossing: true,
        });
      }
    }

    const isPostRecovery = recoveryDate && point.price_date >= recoveryDate;

    chartData.push({
      ...point,
      chart_index: index,
      underwater: !isPostRecovery ? point.baseline_return_pct : null,
      post_recovery: isPostRecovery ? point.baseline_return_pct : null,
    });
  });

  const baselinePoint =
    chartData.find(p => p.price_date === baselineDate && !p.is_baseline_crossing) ||
    chartData[0];

  const plottedPrices = chartData.filter(point => !point.is_baseline_crossing);
  const computedRecoveryPathLow = plottedPrices.reduce((lowest, point) => (
    point.baseline_return_pct < lowest.baseline_return_pct ? point : lowest
  ), plottedPrices[0]);
  const recoveryPathLow =
    plottedPrices.find(point => point.price_date === priceHistory.recovery_path_low_date) ||
    computedRecoveryPathLow;
  const recoveryPathMaxDrawdownPct =
    priceHistory.recovery_path_max_drawdown_pct == null
      ? recoveryPathLow?.baseline_return_pct
      : Number(priceHistory.recovery_path_max_drawdown_pct) * 100;

  const recoveryPoint = recoveryDate
    ? chartData.find(p => p.price_date === recoveryDate && !p.is_baseline_crossing)
    : null;
  const lastChartIndex = chartData[chartData.length - 1]?.chart_index ?? 0;
  const recoveryLabelDx =
    recoveryPoint && recoveryPoint.chart_index > lastChartIndex - 3 ? -28 : 0;

  const values = prices.map(point => point.baseline_return_pct).filter(Number.isFinite);
  const rawMin = Math.min(0, ...values);
  const rawMax = Math.max(0, ...values);
  const range = Math.max(10, rawMax - rawMin);
  const lowerPadding = Math.max(2.5, range * 0.06);
  const upperPadding = Math.max(4, range * 0.12);
  const domainMin = Math.floor((rawMin - lowerPadding) / 5) * 5;
  const domainMax = Math.ceil((rawMax + upperPadding) / 5) * 5;
  const tickStep = domainMax - domainMin > 80 ? 20 : domainMax - domainMin > 40 ? 10 : 5;
  const ticks = [];
  for (let tick = Math.ceil(domainMin / tickStep) * tickStep; tick <= domainMax; tick += tickStep) {
    ticks.push(tick);
  }
  if (!ticks.includes(0)) ticks.push(0);
  ticks.sort((a, b) => a - b);

  // Keep this in sync with the chart container className="h-64" and ComposedChart margin.top.
  // The Baseline label offset is derived from actual chart headroom instead of a fixed pixel guess.
  const CHART_HEIGHT_PX = 256;
  const CHART_MARGIN_TOP_PX = 24;
  const plotAreaHeightPx = CHART_HEIGHT_PX - CHART_MARGIN_TOP_PX;
  const domainSpan = domainMax - domainMin;
  const pixelsPerUnit = domainSpan > 0 ? plotAreaHeightPx / domainSpan : 0;
  const headroomAboveBaselinePx = CHART_MARGIN_TOP_PX + domainMax * pixelsPerUnit;
  const baselineLabelDy = -Math.min(22, Math.max(10, headroomAboveBaselinePx - 14));

  return (
    <Card className="gap-0 overflow-hidden rounded-[28px] border-[#DDE7F0] bg-white/95 py-0 shadow-[0_24px_60px_rgba(18,53,91,0.12)]">
      <CardHeader className="border-b border-[#DDE7F0] px-5 py-4">
        <div>
          <p className={label}>Baseline recovery path</p>
          <p className="mt-1 max-w-xl text-xs leading-5 text-[#64748B]">
            Red shows the pre-recovery underwater period. Green fill is reserved for the confirmed post-recovery path.
          </p>
        </div>
      </CardHeader>

      <CardContent className="p-5">
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 24, right: 44, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#EEF2F6" vertical={false} />
              <XAxis
                dataKey="chart_index"
                type="number"
                domain={['dataMin', 'dataMax']}
                tick={false}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                dataKey="baseline_return_pct"
                domain={[domainMin, domainMax]}
                ticks={ticks}
                tickFormatter={(value) => `${value > 0 ? '+' : ''}${value.toFixed(0)}%`}
                tick={{ fill: '#94A3B8', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <Tooltip content={<PriceTooltip />} cursor={{ stroke: '#BFD2E3', strokeDasharray: '4 4' }} />
              <defs>
                <linearGradient id="recoveryGreenFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#047857" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="#047857" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="recoveryRedFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#B91C1C" stopOpacity={0.14} />
                  <stop offset="100%" stopColor="#B91C1C" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <ReferenceLine
                y={0}
                stroke="#9DB4C8"
                strokeDasharray="5 5"
                ifOverflow="extendDomain"
              />
              <Area
                type="monotone"
                dataKey="underwater"
                baseValue={0}
                stroke="none"
                fill="url(#recoveryRedFill)"
                connectNulls={false}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="post_recovery"
                baseValue={0}
                stroke="none"
                fill="url(#recoveryGreenFill)"
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="underwater"
                stroke="#B91C1C"
                strokeWidth={2.15}
                dot={false}
                connectNulls={false}
                activeDot={{ r: 4, fill: '#B91C1C', stroke: 'white', strokeWidth: 2 }}
              />
              <Line
                type="monotone"
                dataKey="post_recovery"
                stroke="#047857"
                strokeWidth={2.15}
                dot={false}
                connectNulls={false}
                activeDot={{ r: 4, fill: '#047857', stroke: 'white', strokeWidth: 2 }}
              />
              {baselinePoint && (
                <ReferenceDot
                  x={baselinePoint.chart_index}
                  y={0}
                  r={4}
                  fill="white"
                  stroke="#12355B"
                  strokeWidth={2}
                  label={{
                    value: 'Baseline',
                    position: 'top',
                    fill: '#12355B',
                    fontSize: 11,
                    fontWeight: 600,
                    dy: baselineLabelDy,
                    dx: 10,
                  }}
                />
              )}
              {recoveryPathLow && (
                <ReferenceDot
                  x={recoveryPathLow.chart_index}
                  y={recoveryPathLow.baseline_return_pct}
                  r={5}
                  fill="white"
                  stroke="#B91C1C"
                  strokeWidth={2}
                  label={{
                    value: `Recovery-path low ${formatBaselinePct(recoveryPathMaxDrawdownPct)}`,
                    position: 'bottom',
                    fill: '#B91C1C',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                />
              )}
              {recoveryPoint && (
                <ReferenceDot
                  x={recoveryPoint.chart_index}
                  y={recoveryPoint.baseline_return_pct}
                  r={5}
                  fill="white"
                  stroke="#047857"
                  strokeWidth={2}
                  label={{
                    value: 'Recovery',
                    position: 'top',
                    fill: '#047857',
                    fontSize: 11,
                    fontWeight: 600,
                    dx: recoveryLabelDx,
                  }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-[#EEF2F6] pt-3 text-xs text-[#94A3B8]">
          <span>{prices[0]?.price_date}</span>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1 text-[#12355B]">
              <span className="h-2 w-2 rounded-full border border-[#12355B] bg-white" />
              Baseline ${Number(baselinePrice).toFixed(2)}
            </span>
            <span className="inline-flex items-center gap-1 text-[#64748B]">
              <span className="h-px w-5 border-t border-dashed border-[#94A3B8]" />
              0%
            </span>
            <span className="inline-flex items-center gap-1 text-[#B91C1C]">
              <span className="h-2 w-2 rounded-full border border-[#B91C1C] bg-white" />
              Pre-recovery drawdown
            </span>
            {recoveryPoint && (
              <span className="inline-flex items-center gap-1 text-[#047857]">
                <span className="h-2 w-2 rounded-full border border-[#047857] bg-white" />
                Recovered / post-recovery
              </span>
            )}
          </div>
          <span>{prices[prices.length - 1]?.price_date}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function BenchmarkChart({ prediction, sectorBenchmark }) {
  if (!sectorBenchmark) return null;

  const rows = [
    {
      name: 'This prediction',
      value: Number((prediction.probability * 100).toFixed(1)),
      color: '#12355B',
    },
    {
      name: 'Sector average',
      value: Number((sectorBenchmark.sector_fast_recovery_rate * 100).toFixed(1)),
      color: '#94A3B8',
    },
  ];

  const difference = rows[0].value - rows[1].value;
  const benchmarkLabel =
    Math.abs(difference) < 2
      ? 'Near sector average'
      : difference > 0
        ? 'Above sector average'
        : 'Below sector average';
  const benchmarkDetail =
    Math.abs(difference) < 2
      ? `This event's model score was within ${Math.abs(difference).toFixed(1)} percentage points of the ${prediction.sector} benchmark.`
      : `This event's model score was ${Math.abs(difference).toFixed(1)} percentage points ${difference > 0 ? 'above' : 'below'} the ${prediction.sector} benchmark.`;

  return (
    <Card className={`${card} py-0 gap-0 overflow-hidden`}>
      <CardHeader className="border-b border-[#DDE7F0] px-5 py-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <p className={label}>
            {prediction.sector} benchmark
          </p>
          <p className="text-xs font-medium text-[#64748B]">
            {sectorBenchmark.total_events} similar events
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-5">
        {rows.map(row => (
          <div key={row.name}>
            <div className="mb-1.5 flex items-center justify-between gap-4 text-xs">
              <span className="font-semibold text-[#0B1220]">{row.name}</span>
              <span className="font-mono font-semibold text-[#0B1220]">{row.value}%</span>
            </div>
            <div className="h-2.5 rounded-full bg-[#EEF2F6]">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(3, Math.min(100, row.value))}%`, backgroundColor: row.color }}
              />
            </div>
          </div>
        ))}

        <div className="border-t border-[#EEF2F6] pt-3 text-xs leading-5 text-[#64748B]">
          <span className="font-semibold text-[#0B1220]">{benchmarkLabel}.</span>{' '}
          {benchmarkDetail}
        </div>
      </CardContent>
    </Card>
  );
}

function AnalysisSummary({
  prediction,
  predictedEvent,
  outcome,
  isMatch,
  modelCallLabel,
  actualCallLabel,
}) {
  if (!prediction || !predictedEvent || !outcome) return null;

  const probabilityPct = (prediction.probability * 100).toFixed(0);
  const hasResolvedOutcome = predictedEvent.days_to_recovery != null;
  const actualDays = hasResolvedOutcome
    ? `${predictedEvent.days_to_recovery.toLocaleString()} days`
    : null;

  const headline = !hasResolvedOutcome
    ? 'Historical recovery outcome is still pending'
    : isMatch === false
      ? prediction.predicted_fast_recovery
        ? 'Model overestimated the recovery speed'
        : 'Model underestimated the recovery speed'
      : prediction.predicted_fast_recovery
        ? 'Model correctly flagged a faster recovery path'
        : 'Model correctly flagged a slower recovery path';

  const detail = !hasResolvedOutcome
    ? `The model assigned a ${probabilityPct}% fast-recovery probability, but this event has not reached a resolved recovery outcome yet.`
    : isMatch === false
      ? prediction.predicted_fast_recovery
        ? `The model assigned a ${probabilityPct}% fast-recovery probability, but the stock recovered after ${actualDays}, outside the 180-day fast-recovery window.`
        : `The model assigned a ${probabilityPct}% fast-recovery probability, but the stock recovered within the 180-day fast-recovery window.`
      : prediction.predicted_fast_recovery
        ? `The model assigned a ${probabilityPct}% fast-recovery probability and the historical recovery outcome confirmed a fast recovery.`
        : `The model assigned a ${probabilityPct}% fast-recovery probability and the stock recovered after ${actualDays}, outside the 180-day fast-recovery window.`;

  return (
    <Card className="mb-5 overflow-hidden rounded-[28px] border-[#BFD2E3] bg-[linear-gradient(135deg,#FFFFFF_0%,#F8FBFF_55%,#E8F1F8_100%)] py-0 shadow-[0_18px_45px_rgba(18,53,91,0.08)]">
      <CardContent className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-center">
        <div>
          <p className={label}>Analysis summary</p>
          <h3 className="mt-2 max-w-2xl text-2xl font-semibold tracking-tight text-[#0B1220]">
            {headline}
          </h3>
          <p className="mt-2 text-sm leading-6 text-[#52637A]">
            {detail}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1">
          <Badge className={badgeNeutral}>
            Model call · {modelCallLabel.replace('Likely ', '').replace('Not likely ', 'Not ')}
          </Badge>
          <Badge className={hasResolvedOutcome && predictedEvent.days_to_recovery <= 180 ? badgeSuccess : badgeNeutral}>
            Actual · {actualCallLabel}
          </Badge>
          {isMatch !== null && (
            <Badge className={isMatch ? badgeSuccess : badgeDanger}>
              {isMatch ? 'Prediction match' : 'Prediction miss'}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}


function SurvivalRecoveryTimeline({ prediction }) {
  const curve = prediction?.survival_curve;
  if (!curve?.length) return null;

  return (
    <Card className={`${card} gap-0 overflow-hidden py-0`}>
      <CardHeader className="border-b border-[#DDE7F0] px-5 py-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className={label}>Recovery probability over time</p>
            <p className="mt-1 max-w-xl text-xs leading-5 text-[#64748B]">
              Cumulative probability of returning to baseline, conditional on the stock remaining unrecovered at each interval.
            </p>
          </div>
          <Badge className={badgeNeutral}>Research · {prediction.survival_model_version}</Badge>
        </div>
      </CardHeader>

      <CardContent className="p-5">
        <div className="space-y-4">
          {curve.map((point, index) => {
            const cumulative = point.cumulative_recovery_probability * 100;
            const conditional = point.conditional_recovery_probability * 100;
            return (
              <div key={point.horizon_days}>
                <div className="mb-1.5 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-[#0B1220]">By {point.horizon_days} days</p>
                    <p className="text-[11px] text-[#94A3B8]">
                      {conditional.toFixed(1)}% conditional chance during days{' '}
                      {index === 0 ? 1 : curve[index - 1].horizon_days + 1}–{point.horizon_days}
                    </p>
                  </div>
                  <span className="font-mono text-sm font-semibold text-[#12355B]">
                    {cumulative.toFixed(1)}%
                  </span>
                </div>
                <div className="relative h-2.5 overflow-hidden rounded-full bg-[#EEF2F6]">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#0B4F7A,#38A3A5)] transition-[width] duration-500"
                    style={{ width: `${Math.max(2, Math.min(100, cumulative))}%` }}
                  />
                  {index > 0 && (
                    <span
                      className="absolute inset-y-0 w-px bg-white/90"
                      style={{ left: `${curve[index - 1].cumulative_recovery_probability * 100}%` }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 rounded-2xl border border-[#DDE7F0] bg-[#F8FBFF] px-4 py-3 text-xs leading-5 text-[#52637A]">
          This experimental survival curve uses censored historical events. Model v3 remains the production 180-day classification signal.
        </div>
      </CardContent>
    </Card>
  );
}


function FeatureIcon({ icon: Icon, tone = 'neutral' }) {
  const tones = {
    neutral: 'bg-[#EEF2F6] text-[#475569]',
    blue: 'bg-[#E8F1F8] text-[#12355B]',
    red: 'bg-[#FEE2E2] text-[#B91C1C]',
    green: 'bg-[#DDF7EC] text-[#047857]',
  };

  return (
    <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone]}`}>
      <Icon className="h-4 w-4" />
    </div>
  );
}

function PointInTimeFeatures({ prediction }) {
  const priorReturnTone = prediction.prior_90d_return == null
    ? 'neutral'
    : prediction.prior_90d_return >= 0
      ? 'green'
      : 'red';

  const features = [
    {
      label: 'Relative drop vs. market',
      value: formatPct(prediction.relative_drop_pct),
      icon: Percent,
      tone: 'neutral',
    },
    {
      label: 'Event max drawdown',
      value: formatPct(prediction.event_max_drawdown_pct),
      icon: ArrowDown,
      tone: 'red',
    },
    {
      label: 'Drawdown velocity / day',
      value: formatPct(prediction.drawdown_velocity_pct_per_day, 2),
      icon: TrendingUp,
      tone: 'red',
    },
    {
      label: 'Distance from 52wk high',
      value: formatPct(prediction.distance_from_52w_high),
      icon: Ruler,
      tone: 'blue',
    },
    {
      label: '90-day volatility',
      value: formatPct(prediction.volatility_90d),
      icon: Activity,
      tone: 'neutral',
    },
    {
      label: 'Sector-relative drop',
      value: formatPct(prediction.sector_relative_drop_pct),
      icon: BarChart3,
      tone: 'neutral',
    },
    {
      label: 'Prior 90-day return',
      value: prediction.prior_90d_return != null ? formatPct(prediction.prior_90d_return) : '—',
      icon: TrendingUp,
      tone: priorReturnTone,
    },
  ];

  return (
    <Card className={`${card} py-0 gap-0 overflow-hidden`}>
      <CardHeader className="border-b border-[#DDE7F0] px-5 py-5">
        <div>
          <p className={label}>Point-in-time features</p>
          <p className="mt-1 text-xs leading-5 text-[#64748B]">
            Model inputs captured at the drawdown event, before recovery was known.
          </p>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
        {features.map(feature => (
          <div
            key={feature.label}
            className="flex items-center justify-between gap-4 rounded-2xl border border-[#EEF2F6] bg-[#F8FBFF] px-4 py-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <FeatureIcon icon={feature.icon} tone={feature.tone} />
              <span className="text-sm leading-5 text-[#52637A]">{feature.label}</span>
            </div>
            <span className="shrink-0 font-mono text-sm font-semibold text-[#0B1220]">
              {feature.value}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}


function DrawdownExplorer({ token, onSignIn, initialEventId, clearInitialEvent }) {
  const [allTickers, setAllTickers] = useState([]);
  const [ticker, setTicker] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);

  const [prediction, setPrediction] = useState(null);
  const [predictError, setPredictError] = useState(null);
  const [predictLoading, setPredictLoading] = useState(false);

  const [sectorBenchmark, setSectorBenchmark] = useState(null);
  const [priceHistory, setPriceHistory] = useState(null);
  const isAutoLoading = Boolean(initialEventId && predictLoading && !prediction);

  const resultRef = useRef(null);

  useEffect(() => {
    async function loadTickers() {
      try {
        const response = await fetch(`${API_URL}/api/tickers`);
        if (!response.ok) throw new Error(`Ticker request failed: ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error('Ticker response was not a list');
        setAllTickers(data);
      } catch (err) {
        console.error('Unable to load tickers', err);
        setError('Could not load the ticker list.');
      }
    }
    loadTickers();
  }, []);

  useEffect(() => {
    if (!prediction) return;

    let cancelled = false;

    async function loadEnrichment() {
      try {
        const benchmarkResult = await fetch(
          `${API_URL}/api/sectors/${encodeURIComponent(prediction.sector)}/benchmark`
        );

        if (cancelled) return;
        if (benchmarkResult.ok) {
          setSectorBenchmark(await benchmarkResult.json());
        }
      } catch (err) {
        console.error('Unable to load prediction enrichment', err);
      }
    }
    loadEnrichment();

    return () => {
      cancelled = true;
    };
  }, [prediction]);

  useEffect(() => {
    if (prediction && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [prediction]);

  function handleTickerChange(value) {
    const upper = value.toUpperCase();
    setTicker(upper);
    if (upper.length === 0) {
      setSuggestions([]);
      return;
    }
    const matches = allTickers.filter(t => t.startsWith(upper));
    setSuggestions(matches.slice(0, 8));
  }

  async function loadDrawdownsForTicker(searchTicker) {
    const normalizedTicker = searchTicker.trim().toUpperCase();
    if (!normalizedTicker) return;

    setTicker(normalizedTicker);
    setError(null);
    setSuggestions([]);
    setSelectedEventId(null);
    setPrediction(null);

    try {
      const response = await fetch(`${API_URL}/api/drawdowns?ticker=${encodeURIComponent(normalizedTicker)}`);
      setHasSearched(true);

      if (!response.ok) throw new Error(`Drawdown request failed: ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error('Drawdown response was not a list');
      setEvents(data);
    } catch (err) {
      console.error('Unable to load drawdowns', err);
      setError('Could not load drawdowns for that ticker.');
    }
  }

  async function handleSearch(e) {
    e.preventDefault();
    await loadDrawdownsForTicker(ticker);
  }

  function handleSelectEvent(eventId) {
    setSelectedEventId(eventId);
    setPrediction(null);
    setPredictError(null);
    loadPriceHistory(eventId);
  }

  async function loadPriceHistory(eventId) {
    if (!eventId) return null;
    if (priceHistoryCache.has(eventId)) {
      const cached = priceHistoryCache.get(eventId);
      setPriceHistory(cached);
      return cached;
    }

    try {
      const response = await fetch(`${API_URL}/api/drawdowns/${eventId}/prices`);
      if (!response.ok) throw new Error(`Price history request failed: ${response.status}`);
      const data = await response.json();
      priceHistoryCache.set(eventId, data);
      setPriceHistory(data);
      return data;
    } catch (err) {
      console.error('Unable to load recovery path', err);
      return null;
    }
  }

  async function runPredictionForEvent(eventId) {
    if (!eventId) return;

    setPredictError(null);
    setPredictLoading(true);
    setPrediction(null);

    // Start the chart request immediately instead of waiting for model scoring.
    // It will usually be ready by the time the prediction results render.
    loadPriceHistory(eventId);

    const headers = { 'Content-Type': 'application/json' };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const body = { drop_event_id: eventId };

    if (!token) {
      body.session_id = getOrCreateSessionId();
    }

    try {
      const response = await fetch(`${API_URL}/api/predict`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        setPredictError('Could not generate a prediction for this event.');
        return;
      }

      const data = await response.json();
      setPrediction(data);
    } finally {
      setPredictLoading(false);
    }
  }

  useEffect(() => {
    if (!initialEventId) return;

    let cancelled = false;

    async function loadInitialEvent() {
      try {
        setError(null);
        setPredictError(null);
        setPrediction(null);
        setPredictLoading(true);
        setHasSearched(true);

        const eventRes = await fetch(`${API_URL}/api/drawdowns/${initialEventId}`);

        if (!eventRes.ok) {
          if (!cancelled) setError('Could not load the suggested drawdown.');
          return;
        }

        const eventData = await eventRes.json();
        if (cancelled) return;

        setTicker(eventData.ticker);
        setEvents([eventData]);
        setSelectedEventId(eventData.id);
        await runPredictionForEvent(eventData.id);

        if (!cancelled) clearInitialEvent?.();
      } catch {
        if (!cancelled) setError('Could not load the suggested drawdown.');
      } finally {
        if (!cancelled) setPredictLoading(false);
      }
    }

    loadInitialEvent();

    return () => {
      cancelled = true;
    };
    // runPredictionForEvent intentionally follows the latest token; initialEventId
    // is the navigation trigger for this one-shot load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEventId, token, clearInitialEvent]);

  async function handlePredict() {
    if (!selectedEventId) return;
    await runPredictionForEvent(selectedEventId);
  }

  const selectedEvent = events.find(e => e.id === selectedEventId) || null;
  const predictedEvent = prediction ? events.find(e => e.id === prediction.drop_event_id) : null;
  const actualFastRecovery =
    predictedEvent && predictedEvent.days_to_recovery != null
      ? predictedEvent.days_to_recovery <= 180
      : null;
  const isMatch =
    prediction && actualFastRecovery !== null
      ? actualFastRecovery === prediction.predicted_fast_recovery
      : null;
  const outcome = predictedEvent ? describeOutcome(predictedEvent.days_to_recovery) : null;
  const modelSignalBadgeClass =
    isMatch === false
      ? badgeDanger
      : prediction?.predicted_fast_recovery
        ? badgeSuccess
        : badgeNeutral;

  const modelCallLabel = prediction?.predicted_fast_recovery
    ? 'Likely fast recovery'
    : 'Not likely fast recovery';
  const actualCallLabel =
    predictedEvent?.days_to_recovery == null
      ? 'Pending'
      : predictedEvent.days_to_recovery <= 180
        ? 'Fast recovery'
        : 'Slow recovery';
  const whyThisMatters =
    prediction?.predicted_fast_recovery
      ? isMatch === false
        ? 'The model score crossed the fast-recovery threshold, but the stock recovered slowly. This is a historical false positive.'
        : 'The model score crossed the fast-recovery threshold, so it classified this event as likely to recover within 180 days after quarter-end.'
      : isMatch === false
        ? 'The model score stayed below the fast-recovery threshold, but the stock recovered quickly. This is a historical false negative.'
        : 'The model score stayed below the 50% threshold, so it classified this event as not likely to recover within 180 days after quarter-end.';

  return (
    <div className="mx-auto max-w-5xl text-[#0B1220]">
      {isAutoLoading && (
        <Card className={`${card} p-6`}>
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E8F1F8]">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#BFD2E3] border-t-[#0B4F7A]" />
            </div>

            <div>
              <p className="text-sm font-semibold text-[#0B1220]">Preparing prediction</p>
              <p className="mt-1 text-sm text-[#64748B]">
                Loading the selected drawdown and running the recovery model.
              </p>
            </div>
          </div>
        </Card>
      )}

      {!isAutoLoading && (
        <>
          {!prediction && (
            <section className="mb-6 overflow-hidden rounded-[30px] border border-[#DDE7F0] bg-[radial-gradient(circle_at_top_left,#E8F1F8_0%,#F5F8FB_46%,#F8FBFF_100%)] px-6 py-7 shadow-[0_24px_70px_rgba(18,53,91,0.10)]">
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_430px] lg:items-center">
                <div>
                  <p className={label}>Recovery analysis workflow</p>
                  <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-[#0B1220]">
                    Predict recovery from historical drawdowns
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-[#52637A]">
                    Search a ticker, choose a real drawdown event, and compare the model signal with its historical recovery path.
                  </p>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {['AAPL', 'MSFT', 'NVDA'].map(symbol => (
                      <button
                        type="button"
                        key={symbol}
                        onClick={() => loadDrawdownsForTicker(symbol)}
                        className="cursor-pointer rounded-full border border-[#DDE7F0] bg-white/80 px-3 py-1.5 font-mono text-xs font-semibold text-[#12355B] shadow-sm transition-colors hover:bg-white"
                      >
                        {symbol}
                      </button>
                    ))}
                  </div>
                </div>

                <PredictWorkspacePreview />
              </div>
            </section>
          )}

          {!prediction && !isAutoLoading && <PredictContextPanel />}

          {!prediction && !isAutoLoading && (
            <Card className="mb-5 gap-0 overflow-visible rounded-[24px] border-[#DDE7F0] bg-white py-0 shadow-[0_18px_45px_rgba(18,53,91,0.08)]">
              <CardHeader className="flex flex-col gap-4 border-b border-[#DDE7F0] px-5 py-5 md:flex-row md:items-end md:justify-between">
                <div>
                  <CardTitle className="text-lg font-semibold tracking-tight text-[#0B1220]">
                    Drawdown events
                  </CardTitle>
                  <p className="mt-1 text-xs leading-5 text-[#64748B]">
                    Search a ticker to find historical drawdown events.
                  </p>
                </div>

                <form onSubmit={handleSearch} className="relative flex gap-2">
                  <input
                    type="text"
                    value={ticker}
                    onChange={(e) => handleTickerChange(e.target.value)}
                    placeholder="Ticker, e.g. ABNB"
                    className="h-10 w-56 rounded-xl border border-[#DDE7F0] bg-white px-3 text-sm font-mono text-[#0B1220] outline-none transition-colors placeholder:text-[#94A3B8] focus:border-[#0B4F7A] focus:ring-2 focus:ring-[#0B4F7A]/20"
                  />
                  <Button type="submit" className={buttonPrimary}>
                    Search
                  </Button>

                  {suggestions.length > 0 && (
                    <div className="absolute left-0 top-11 z-10 w-56 overflow-hidden rounded-xl border border-[#DDE7F0] bg-white shadow-lg">
                      {suggestions.map(s => (
                        <button
                          type="button"
                          key={s}
                          onClick={() => { setTicker(s); setSuggestions([]); }}
                          className="block w-full cursor-pointer px-3 py-2 text-left text-sm font-mono text-[#0B1220] transition-colors hover:bg-[#F8FBFF]"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </form>
              </CardHeader>

              <CardContent className="px-5 py-4">
                {error && <p className="mb-3 text-sm text-[#B91C1C]">{error}</p>}

                {events.length > 0 ? (
                  <>
                    <div className="grid grid-cols-3 gap-3 border-b border-[#E8F1F8] px-3 pb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#64748B]">
                      <span>Date</span>
                      <span>Ticker</span>
                      <span className="justify-self-end">Drop</span>
                    </div>

                    <div>
                      {events.map(event => {
                        const isSelected = selectedEventId === event.id;

                        return (
                          <button
                            type="button"
                            key={event.id}
                            onClick={() => handleSelectEvent(event.id)}
                            className={`grid w-full cursor-pointer grid-cols-3 items-center gap-3 border-b border-[#EEF2F6] px-3 py-3 text-left transition-colors last:border-0 ${
                              isSelected
                                ? 'border-l-4 border-l-[#12355B] bg-[#F8FBFF] pl-2'
                                : 'hover:bg-[#F8FBFF]'
                            }`}
                          >
                            <span className="font-mono text-xs text-[#64748B]">{event.drop_quarter}</span>
                            <span className="text-sm font-semibold text-[#0B1220]">{event.ticker}</span>
                            <span className="justify-self-end font-mono text-sm font-semibold text-[#B91C1C]">
                              {(event.drop_pct * 100).toFixed(2)}%
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : hasSearched ? (
                  <div className="rounded-2xl border border-[#DDE7F0] bg-[#F8FBFF] px-5 py-5 text-sm text-[#64748B]">
                    No qualifying drawdown events found for <span className="font-mono font-semibold text-[#0B1220]">{ticker}</span>.
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-[#BFD2E3] bg-[#F8FBFF] px-5 py-6">
                    <p className="text-sm font-semibold text-[#0B1220]">Start with a ticker to load historical drawdowns.</p>
                    <p className="mt-1 max-w-xl text-xs leading-5 text-[#64748B]">
                      Try AAPL, MSFT, or NVDA to see qualifying quarterly drops, model inputs,
                      recovery-path charting, sector benchmarks, and the final model-vs-actual comparison.
                    </p>
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {[
                        ['Event list', 'Quarter, ticker, and drop size'],
                        ['Prediction', 'Fast-recovery probability'],
                        ['Outcome check', 'Historical recovery result'],
                      ].map(([title, detail]) => (
                        <div key={title} className="rounded-xl border border-[#E8F1F8] bg-white px-3 py-3">
                          <p className="text-xs font-semibold text-[#12355B]">{title}</p>
                          <p className="mt-1 text-[11px] leading-4 text-[#64748B]">{detail}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {selectedEvent && !prediction && !isAutoLoading && (
            <Card className="mb-6 rounded-[24px] border-[#BFD2E3] bg-white/90 shadow-[0_18px_45px_rgba(18,53,91,0.08)]">
              <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className={label}>Selected event</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <CompanyLogo symbol={selectedEvent.ticker} size={26} />
                    <TickerSymbol
                      symbol={selectedEvent.ticker}
                      className="font-mono text-base font-semibold text-[#0B1220]"
                    />
                    <Badge className={badgeNeutral}>{selectedEvent.drop_quarter}</Badge>
                    <Badge className={badgeDanger}>{(selectedEvent.drop_pct * 100).toFixed(1)}%</Badge>
                  </div>
                </div>

                <div className="text-right">
                  <Button
                    onClick={handlePredict}
                    disabled={predictLoading}
                    className={buttonPrimary}
                  >
                    {predictLoading ? 'Predicting...' : 'Predict recovery'}
                  </Button>
                  {predictError && <p className="mt-2 text-xs text-[#B91C1C]">{predictError}</p>}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {prediction && (
        <div ref={resultRef} className="mt-2 scroll-mt-24 animate-[fadeIn_220ms_ease-out]">
          <section className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              {predictedEvent && <CompanyLogo symbol={predictedEvent.ticker} size={36} />}
              <div>
                <p className={label}>Recovery analysis</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {predictedEvent && (
                    <TickerSymbol
                      symbol={predictedEvent.ticker}
                      className="font-mono text-xl font-semibold tracking-tight text-[#0B1220]"
                    />
                  )}
                  {predictedEvent?.drop_quarter && (
                    <Badge className={badgeNeutral}>{predictedEvent.drop_quarter}</Badge>
                  )}
                  {isMatch !== null && (
                    <Badge className={isMatch ? badgeSuccess : badgeDanger}>
                      {isMatch ? 'Prediction match' : 'Prediction miss'}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-[#64748B]">
                  Model signal compared with the historical recovery path.
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              onClick={() => setPrediction(null)}
              className="h-10 cursor-pointer self-start rounded-xl border-[#DDE7F0] bg-white px-4 text-sm font-semibold text-[#0B4F7A] hover:bg-[#F8FBFF] hover:text-[#082F49] sm:self-auto"
            >
              ← Back to search
            </Button>
          </section>

          <Card className={`${card} mb-5 py-0 gap-0 overflow-hidden`}>
            <CardContent className="grid grid-cols-1 gap-0 p-0 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex items-center gap-2 border-b border-[#EEF2F6] px-5 py-4 sm:border-r lg:border-b-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#E8F1F8] text-xs font-bold text-[#12355B]">S</div>
                <div>
                  <div className="text-xs text-[#64748B]">Sector</div>
                  <div className="text-sm font-semibold text-[#0B1220]">{prediction.sector}</div>
                </div>
              </div>

              <div className="flex items-center gap-2 border-b border-[#EEF2F6] px-5 py-4 sm:border-b-0 lg:border-r">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FEE2E2] text-xs font-bold text-[#B91C1C]">↓</div>
                <div>
                  <div className="text-xs text-[#64748B]">Event max drawdown</div>
                  <div className="font-mono text-sm font-semibold text-[#B91C1C]">
                    {formatPct(prediction.event_max_drawdown_pct)}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 border-b border-[#EEF2F6] px-5 py-4 sm:border-r sm:border-b-0 lg:border-r">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EEF2F6] text-xs font-bold text-[#475569]">%</div>
                <div>
                  <div className="text-xs text-[#64748B]">Rel. drop vs. market</div>
                  <div className="font-mono text-sm text-[#0B1220]">
                    {formatPct(prediction.relative_drop_pct)}
                  </div>
                </div>
              </div>

              {predictedEvent && (
                <div className="flex items-center gap-2 px-5 py-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#E8F1F8] text-xs font-bold text-[#12355B]">Q</div>
                  <div>
                    <div className="text-xs text-[#64748B]">Drop quarter</div>
                    <div className="font-mono text-sm text-[#0B1220]">{predictedEvent.drop_quarter}</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <AnalysisSummary
            prediction={prediction}
            predictedEvent={predictedEvent}
            outcome={outcome}
            isMatch={isMatch}
            modelCallLabel={modelCallLabel}
            actualCallLabel={actualCallLabel}
          />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-5">
              <RecoveryPathChart priceHistory={priceHistory} />

              <SurvivalRecoveryTimeline prediction={prediction} />

              <BenchmarkChart
                prediction={prediction}
                sectorBenchmark={sectorBenchmark}
              />

<PointInTimeFeatures prediction={prediction} />
            </div>

            <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
              <Card className={`${card} py-0 gap-0 overflow-hidden`}>
                <CardHeader className="border-b border-[#DDE7F0] px-5 py-5">
                  <p className={label}>Decision</p>
                  <p className="mt-1 text-xs leading-5 text-[#64748B]">
                    Estimated chance of recovery within 180 days after the completed drop quarter.
                  </p>
                </CardHeader>
                <CardContent className="p-5">
                  <div>
                    <div className="font-mono text-5xl font-semibold leading-none tracking-tight text-[#0B1220]">
                      {(prediction.probability * 100).toFixed(0)}%
                    </div>
                    <p className="mt-1 text-sm text-[#64748B]">Fast-recovery probability</p>

                    <Badge className={`mt-3 inline-flex ${modelSignalBadgeClass}`}>
                      {modelCallLabel}
                    </Badge>

                    <div className="mt-5">
                      <div className="relative h-2 rounded-full bg-[#EEF2F6]">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${prediction.probability * 100}%`, backgroundColor: '#12355B' }}
                        />
                        <div
                          className="absolute top-1/2 h-4 w-px -translate-y-1/2 rounded-full bg-[#94A3B8]"
                          style={{ left: `${prediction.threshold * 100}%` }}
                        />
                      </div>
                      <div className="mt-2 flex justify-between text-[11px] font-medium text-[#64748B]">
                        <span>0%</span>
                        <span>{(prediction.threshold * 100).toFixed(0)}% threshold</span>
                        <span>100%</span>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-[#F8FBFF] p-3 text-xs">
                      <div>
                        <p className="font-semibold uppercase tracking-[0.12em] text-[#94A3B8]">This result</p>
                        <p className="mt-1 font-mono font-semibold text-[#12355B]">{(prediction.probability * 100).toFixed(0)}%</p>
                      </div>
                      <div>
                        <p className="font-semibold uppercase tracking-[0.12em] text-[#94A3B8]">Threshold</p>
                        <p className="mt-1 font-mono font-semibold text-[#0B1220]">{(prediction.threshold * 100).toFixed(0)}%</p>
                      </div>
                      <div>
                        <p className="font-semibold uppercase tracking-[0.12em] text-[#94A3B8]">Model</p>
                        <p className="mt-1 font-mono font-semibold text-[#0B1220]">{prediction.model_version}</p>
                      </div>
                    </div>

                    <div className="mt-5 rounded-2xl border border-[#E8F1F8] bg-[#F8FBFF] px-4 py-3">
                      <p className="text-sm font-semibold text-[#0B1220]">Why this matters</p>
                      <p className="mt-1 text-xs leading-5 text-[#64748B]">
                        {whyThisMatters}
                      </p>
                    </div>
                  </div>

                  {isMatch === false && predictedEvent?.days_to_recovery != null && (
                    <div className="mt-5 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3">
                      <p className="text-sm font-semibold text-[#B91C1C]">Prediction miss</p>
                      <p className="mt-1 text-xs leading-5 text-[#7F1D1D]">
                        The model called this likely fast recovery, but actual recovery took {predictedEvent.days_to_recovery.toLocaleString()} days.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className={`rounded-2xl bg-white py-0 gap-0 shadow-sm ${
                isMatch === null
                  ? 'border-[#DDE7F0]'
                  : isMatch
                    ? 'border-[#BBF7D0]'
                    : 'border-[#FECACA] border-l-4 border-l-[#B91C1C]'
              }`}>
                <CardHeader className="border-b border-[#DDE7F0] px-5 py-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className={label}>Historical outcome</p>
                    {isMatch !== null && (
                      <Badge className={isMatch ? badgeSuccess : badgeDanger}>
                        {isMatch ? 'Match' : 'Miss'}
                      </Badge>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="p-5">
                  {isMatch === null ? (
                    <p className="text-sm text-[#64748B]">Outcome still pending — not yet resolved.</p>
                  ) : (
                    <>
                      <p className={`text-base font-semibold ${isMatch ? 'text-[#047857]' : 'text-[#B91C1C]'}`}>
                        {outcome.label}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[#52637A]">{outcome.detail}</p>
                      <div className={`mt-4 rounded-xl px-3 py-2 text-xs font-semibold ${
                        isMatch ? 'bg-[#DDF7EC] text-[#047857]' : 'bg-[#FEE2E2] text-[#B91C1C]'
                      }`}>
                        {isMatch ? '✓ Model call matched reality' : '✕ Model call did not match reality'}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {!token && (
                <Card className="rounded-2xl border-[#DDE7F0] bg-[#F8FBFF] shadow-sm">
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <p className="text-xs leading-5 text-[#64748B]">
                      Saved locally for this session. Sign in to keep prediction history across devices.
                    </p>
                    <button
                      onClick={onSignIn}
                      className="flex-shrink-0 cursor-pointer text-xs font-semibold text-[#0B4F7A] hover:underline"
                    >
                      Sign in
                    </button>
                  </CardContent>
                </Card>
              )}

              {token && (
                <Card className="rounded-2xl border-[#BBF7D0] bg-[#F0FDF4] shadow-sm">
                  <CardContent className="p-4 text-xs font-semibold text-[#047857]">
                    ✓ Prediction saved to your history.
                  </CardContent>
                </Card>
              )}
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}

export default DrawdownExplorer;
