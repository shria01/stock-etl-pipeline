import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import CompanyLogo from '@/components/CompanyLogo';
import { formatProbabilityPct } from '@/lib/formatters';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const API_URL = import.meta.env.VITE_API_URL;
const priceHistoryCache = new Map();

const label = 'type-label text-[#64748B]';

const buttonPrimary =
  'h-10 cursor-pointer rounded-xl bg-[#12355B] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#082F49] disabled:cursor-not-allowed disabled:opacity-50';
const dataFont = 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
const inferenceSteps = [
  'Loading the selected drawdown event',
  'Building the point-in-time feature vector',
  'Applying Model v3 preprocessing',
  'Scoring 180-day recovery probability',
];

function parseDateOnly(value) {
  if (!value) return null;
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

function evaluateRecoveryOutcome(priceHistory) {
  const predictionDate = parseDateOnly(priceHistory?.prediction_date);
  const recoveryDate = parseDateOnly(priceHistory?.recovered_date);
  const latestPriceDate = parseDateOnly(
    priceHistory?.latest_price_date || priceHistory?.prices?.at(-1)?.price_date
  );

  if (!predictionDate) {
    return { actualFastRecovery: null, status: 'evaluation_window_open' };
  }

  const deadline = new Date(predictionDate);
  deadline.setUTCDate(deadline.getUTCDate() + 180);

  if (recoveryDate && recoveryDate <= deadline) {
    return { actualFastRecovery: true, status: 'fast_recovery' };
  }
  if (latestPriceDate && latestPriceDate >= deadline) {
    return { actualFastRecovery: false, status: 'not_recovered_within_180d' };
  }
  return { actualFastRecovery: null, status: 'evaluation_window_open' };
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


function formatQuarter(dateValue) {
  if (!dateValue) return '—';

  const [year, month] = String(dateValue).split('-').map(Number);
  if (!year || !month) return dateValue;

  return `Q${Math.floor((month - 1) / 3) + 1} ${year}`;
}


function PriceTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;

  const point = payload.find(item => item?.payload)?.payload;

  if (!point) return null;

  return (
    <div className="min-w-[168px] rounded-lg border border-[#D9E2EA] bg-white/95 px-3 py-2.5 text-[11px] leading-4 shadow-[0_10px_28px_rgba(18,53,91,0.12)] backdrop-blur-sm">
      <p className="border-b border-[#EEF2F6] pb-2 font-mono text-[11px] font-semibold tracking-[0.02em] text-[#0B1220]">
        {point.price_date}
      </p>

      <div className="mt-2 space-y-1.5">
        <p className="flex items-center justify-between gap-4 text-[#7A899C]">
          <span>Vs. baseline</span>
          <span className="font-mono font-medium text-[#0B1220]">
          {formatBaselinePct(point.baseline_return_pct)}
          </span>
        </p>
        <p className="flex items-center justify-between gap-4 text-[#7A899C]">
          <span>Close</span>
          <span className="font-mono font-medium text-[#0B1220]">{point.close?.toFixed?.(2) ?? point.close}</span>
        </p>
      </div>
    </div>
  );
}

function SurvivalTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;

  const point = payload.find(entry => entry?.payload)?.payload;
  if (!point) return null;

  const previousHorizon = { 30: 0, 60: 30, 90: 60, 180: 90, 365: 180 }[point.horizon_days] ?? 0;
  const intervalLabel = `${previousHorizon + 1}–${point.horizon_days}d interval`;

  return (
    <div className="min-w-[210px] rounded-lg border border-[#D9E2EA] bg-white/95 px-3.5 py-3 text-[11px] leading-4 shadow-[0_10px_28px_rgba(18,53,91,0.14)] backdrop-blur-sm">
      <p className="border-b border-[#EEF2F6] pb-2 font-mono text-[11px] font-semibold tracking-[0.02em] text-[#0B1220]">
        By {point.horizon_days} days
      </p>
      <div className="mt-2 space-y-1.5">
        <p className="flex items-center justify-between gap-5 text-[#7A899C]">
          <span>Cumulative</span>
          <span className="font-mono font-semibold text-[#C96A12]">
            {formatProbabilityPct(point.cumulative_recovery_probability)}
          </span>
        </p>
        <p className="flex items-center justify-between gap-5 text-[#7A899C]">
          <span>{intervalLabel}</span>
          <span className="font-mono font-medium text-[#0B1220]">
            {formatProbabilityPct(point.conditional_recovery_probability)}
          </span>
        </p>
      </div>
    </div>
  );
}

function ModelCoverageBand() {
  const stats = [
    ['1,610', 'eligible events'],
    ['361', 'holdout set'],
    ['0.731', 'holdout ROC AUC'],
    ['1,781', 'survival events'],
  ];

  return (
    <section className="border-y border-[#D9E2EA] py-5">
      <div className="grid grid-cols-2 gap-x-8 gap-y-4 lg:grid-cols-4">
        {stats.map(([value, name]) => (
          <div key={name} className="flex items-baseline gap-1.5 whitespace-nowrap">
            <p className="font-mono text-xl font-semibold tracking-[-0.025em] text-[#0B1220]">{value}</p>
            <p className="text-sm text-[#8A9AAF]">{name}</p>
          </div>
        ))}
      </div>
    </section>
  );
}


function SectionRule() {
  return <div className="my-8 border-t border-[#D9E2EA]" />;
}


function EditorialIntro({ prediction, predictedEvent, actualStatus, isMatch }) {
  const ticker = predictedEvent?.ticker || prediction?.ticker || 'This stock';
  const dropQuarter = predictedEvent?.drop_quarter;
  const wasFacebookTicker = ticker === 'META' && dropQuarter && dropQuarter < '2022-06-09';
  const dropPct = prediction?.event_max_drawdown_pct == null
    ? '—'
    : Math.abs(prediction.event_max_drawdown_pct * 100).toFixed(1);
  const probability = formatProbabilityPct(prediction?.probability);
  const threshold = prediction?.threshold == null
    ? '—'
    : (prediction.threshold * 100).toFixed(0);
  const days = predictedEvent?.days_to_recovery == null
    ? 'not observed'
    : predictedEvent.days_to_recovery.toLocaleString();
  const signalIsFast = Boolean(prediction?.predicted_fast_recovery);

  return (
    <section className="mb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8A9AAF]">
          Recovery analysis · Model {prediction.model_version}
        </p>
        <p className={`inline-flex w-fit rounded-full px-3 py-1 text-[12px] font-semibold ${
          isMatch == null
            ? 'bg-[#EEF2F6] text-[#64748B]'
            : isMatch
              ? 'bg-[#DDF7EC] text-[#047857]'
              : 'bg-[#FEE2E2] text-[#B91C1C]'
        }`}>
          {isMatch == null ? 'Outcome unresolved' : isMatch ? 'Prediction match' : 'Prediction miss'}
        </p>
      </div>

      <h1 className="type-lead mt-6 max-w-4xl text-[#0B1220]">
        <span className="font-semibold">{ticker}</span>{wasFacebookTicker ? ', then trading as FB,' : ''} dropped{' '}
        <span className="font-semibold text-[#C92A1E]">{dropPct}%</span> during{' '}
        <span className="font-semibold">{formatQuarter(dropQuarter)}</span>. At the completed-quarter prediction date, Model {prediction.model_version} assigned a{' '}
        <span className="font-semibold text-[#C96A12]">{probability} probability</span> of recovery over the next 180 days. {actualStatus === 'not_recovered_within_180d'
          ? predictedEvent?.recovered_date
            ? <>The stock did not recover within 180 days; its eventual recovery occurred <span className="font-semibold">{days} days after the prediction date</span>.</>
            : signalIsFast
              ? 'The stock did not recover by the 180-day deadline, so this was a false positive. The eventual recovery date remains unknown.'
              : 'The stock did not recover by the 180-day deadline. The eventual recovery date remains unknown.'
          : days === 'not observed'
            ? 'The 180-day evaluation window is still open.'
            : <>Actual recovery occurred <span className="font-semibold">{days} days after that prediction date</span>.</>}
      </h1>

      <p className="mt-6 max-w-4xl text-[15px] leading-7 text-[#52637A]">
        The model&apos;s score {signalIsFast ? 'rose above' : 'stayed below'} its {threshold}% threshold,
        {isMatch == null
          ? ' producing a provisional signal before the final outcome was known.'
          : isMatch
            ? ` correctly identifying whether recovery would occur during the 180 days after quarter-end before the outcome was known.`
            : ' while the realized outcome ultimately moved in the opposite direction.'}
        {' '}At the event date, {ticker}&apos;s maximum drawdown was {formatPct(prediction.event_max_drawdown_pct)} and its move relative to the market was {formatPct(prediction.relative_drop_pct)}. Those point-in-time conditions shaped the model&apos;s signal before the recovery path was observed.
      </p>
    </section>
  );
}


function EditorialRecoveryFigure({ priceHistory, prediction, predictedEvent, actualStatus, isMatch }) {
  if (!priceHistory?.prices?.length || !priceHistory.baseline_price) return null;

  const signalIsFast = Boolean(prediction.predicted_fast_recovery);
  const baselinePrice = priceHistory.baseline_price;
  const prices = priceHistory.prices.map(point => ({
    ...point,
    baseline_return_pct: ((point.close - baselinePrice) / baselinePrice) * 100,
  }));
  const baselineDate = priceHistory.baseline_date || prices[0]?.price_date;
  const predictionDate = priceHistory.prediction_date || null;
  const recoveryDate = priceHistory.recovered_date || null;
  const chartData = [];

  prices.forEach((point, index) => {
    if (index > 0) {
      const previous = prices[index - 1];
      const crossedBaseline =
        (previous.baseline_return_pct < 0 && point.baseline_return_pct > 0) ||
        (previous.baseline_return_pct > 0 && point.baseline_return_pct < 0);

      if (crossedBaseline) {
        const distance = Math.abs(previous.baseline_return_pct) + Math.abs(point.baseline_return_pct);
        const crossingRatio = distance === 0 ? 0.5 : Math.abs(previous.baseline_return_pct) / distance;
        chartData.push({
          ...point,
          chart_index: index - 1 + crossingRatio,
          close: baselinePrice,
          baseline_return_pct: 0,
          below_baseline: 0,
          above_baseline: 0,
          is_baseline_crossing: true,
        });
      }
    }

    chartData.push({
      ...point,
      chart_index: index,
      below_baseline: point.baseline_return_pct <= 0 ? point.baseline_return_pct : null,
      above_baseline: point.baseline_return_pct >= 0 ? point.baseline_return_pct : null,
    });
  });

  const baselinePoint = chartData.find(point => point.price_date === baselineDate && !point.is_baseline_crossing) || chartData[0];
  const plottedPrices = chartData.filter(
    point => !point.is_baseline_crossing && point.price_date >= baselineDate
  );
  const computedLow = plottedPrices.reduce(
    (lowest, point) => point.baseline_return_pct < lowest.baseline_return_pct ? point : lowest,
    plottedPrices[0]
  );
  const recoveryPathLow = plottedPrices.find(point => point.price_date === priceHistory.recovery_path_low_date) || computedLow;
  const recoveryPathMaxDrawdownPct = priceHistory.recovery_path_max_drawdown_pct == null
    ? recoveryPathLow?.baseline_return_pct
    : Number(priceHistory.recovery_path_max_drawdown_pct) * 100;
  const recoveryPoint = recoveryDate
    ? chartData.find(point => point.price_date === recoveryDate && !point.is_baseline_crossing)
    : null;
  const predictionPoint = predictionDate
    ? chartData.find(point => point.price_date === predictionDate && !point.is_baseline_crossing)
    : null;
  const values = prices.map(point => point.baseline_return_pct).filter(Number.isFinite);
  const rawMin = Math.min(0, ...values);
  const rawMax = Math.max(0, ...values);
  const range = Math.max(10, rawMax - rawMin);
  const domainMin = Math.floor((rawMin - Math.max(2.5, range * 0.06)) / 5) * 5;
  const domainMax = Math.ceil((rawMax + Math.max(4, range * 0.12)) / 5) * 5;
  const tickStep = domainMax - domainMin > 80 ? 20 : domainMax - domainMin > 40 ? 10 : 5;
  const ticks = [];
  for (let tick = Math.ceil(domainMin / tickStep) * tickStep; tick <= domainMax; tick += tickStep) ticks.push(tick);
  if (!ticks.includes(0)) ticks.push(0);
  ticks.sort((a, b) => a - b);
  const days = actualStatus === 'not_recovered_within_180d'
    ? 'Not recovered within 180 days'
    : predictedEvent?.days_to_recovery == null
      ? 'Evaluation window open'
      : `${predictedEvent.days_to_recovery.toLocaleString()} days`;

  return (
    <section className="rounded-[14px] border border-[#D9E2EA] bg-[#FBFCFE] px-6 py-7 sm:px-8 sm:py-8">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(240px,1fr)]">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8A9AAF]">Baseline recovery path</p>
            <div className="flex items-center gap-3 text-[10px] font-medium text-[#64748B]">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#07866F]" />Above baseline</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#D33A3A]" />Below baseline</span>
            </div>
          </div>
          <div className="mt-4 h-[280px] w-full rounded-xl border border-[#E2E8EF] bg-white px-2 pt-4 pb-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 18, right: 18, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#E7EDF3" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="chart_index" type="number" domain={['dataMin', 'dataMax']} tick={false} tickLine={false} axisLine={false} />
                <YAxis dataKey="baseline_return_pct" domain={[domainMin, domainMax]} ticks={ticks} tickFormatter={value => `${value > 0 ? '+' : ''}${value.toFixed(0)}%`} tick={{ fill: '#94A3B8', fontSize: 10 }} tickLine={false} axisLine={false} width={38} />
                <Tooltip content={<PriceTooltip />} cursor={{ stroke: '#BFD2E3', strokeDasharray: '4 4' }} />
                <defs>
                  <linearGradient id="editorialRedFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#D33A3A" stopOpacity={0.04} /><stop offset="100%" stopColor="#D33A3A" stopOpacity={0.16} /></linearGradient>
                  <linearGradient id="editorialGreenFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#07866F" stopOpacity={0.16} /><stop offset="100%" stopColor="#07866F" stopOpacity={0.03} /></linearGradient>
                </defs>
                <ReferenceLine y={0} stroke="#8193A6" strokeWidth={1.2} strokeDasharray="6 5" ifOverflow="extendDomain" />
                <Area type="monotone" dataKey="below_baseline" baseValue={0} stroke="none" fill="url(#editorialRedFill)" connectNulls={false} isAnimationActive={false} />
                <Area type="monotone" dataKey="above_baseline" baseValue={0} stroke="none" fill="url(#editorialGreenFill)" connectNulls={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="below_baseline" stroke="#D33A3A" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="above_baseline" stroke="#07866F" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
                {predictionPoint && (
                  <ReferenceLine
                    x={predictionPoint.chart_index}
                    stroke="#B7791F"
                    strokeWidth={1.2}
                    strokeDasharray="4 4"
                    label={{ value: 'Prediction date', position: 'insideTopRight', fill: '#9A651C', fontSize: 10 }}
                  />
                )}
                {baselinePoint && <ReferenceDot x={baselinePoint.chart_index} y={0} r={3.5} fill="white" stroke="#12355B" strokeWidth={2} />}
                {recoveryPathLow && <ReferenceDot x={recoveryPathLow.chart_index} y={recoveryPathLow.baseline_return_pct} r={4.5} fill="white" stroke="#C92A1E" strokeWidth={2} />}
                {recoveryPoint && <ReferenceDot x={recoveryPoint.chart_index} y={recoveryPoint.baseline_return_pct} r={4.5} fill="white" stroke="#047857" strokeWidth={2} />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex items-center justify-between gap-4 font-mono text-xs text-[#8A9AAF]">
            <span>{prices[0]?.price_date}</span>
            <span>{formatBaselinePct(recoveryPathMaxDrawdownPct)} trough</span>
            <span>{prices[prices.length - 1]?.price_date}</span>
          </div>
          <p className="mt-7 max-w-3xl text-[14px] leading-6 text-[#52637A]">
            The recovery path reached a trough of <span className="font-semibold">{formatBaselinePct(recoveryPathMaxDrawdownPct)}</span> before {actualStatus === 'not_recovered_within_180d'
              ? <>failing to return to baseline by the 180-day deadline. Because the model {signalIsFast ? 'predicted recovery' : 'did not predict recovery'}, this event is classified as a <span className="font-semibold">prediction {isMatch ? 'match' : 'miss'}</span>.</>
              : recoveryDate
                ? `returning to baseline ${days.toLowerCase()} after the prediction date.`
                : 'the available follow-up period ended with the evaluation window still open.'}
          </p>
        </div>

        <aside className="border-t border-[#E4EAF0] pt-7 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#C96A12]">Model prediction</p>
          <div className="mt-3 font-mono text-[44px] leading-none tracking-[-0.05em] text-[#0B1220]">{formatProbabilityPct(prediction.probability)}</div>
          <p className="mt-3 text-[15px] leading-6 text-[#52637A]">180-day forward recovery probability</p>
          <p className="mt-2 text-[15px] font-semibold text-[#C96A12]">{signalIsFast ? 'Predicts recovery in next 180 days' : 'Does not predict recovery in next 180 days'}</p>
          <div className="my-6 border-t border-[#E4EAF0]" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#047857]">Actual outcome</p>
          <div className={`${actualStatus === 'not_recovered_within_180d' ? 'text-[18px] leading-6' : 'text-[30px] leading-none'} mt-3 font-mono tracking-[-0.03em] text-[#0B1220]`}>{days}</div>
          {actualStatus === 'not_recovered_within_180d' && (
            <p className="mt-2 text-[11px] text-[#8A9AAF]">Recovery date · {predictedEvent?.recovered_date || 'Still unknown'}</p>
          )}
          {actualStatus !== 'not_recovered_within_180d' && predictedEvent?.days_to_recovery != null && <p className="mt-1.5 text-[11px] text-[#8A9AAF]">After prediction date</p>}
          <p className={`mt-3 text-[13px] font-medium ${isMatch === false ? 'text-[#B91C1C]' : 'text-[#047857]'}`}>
            {isMatch == null ? 'Outcome unresolved' : isMatch ? 'Prediction matched' : 'Prediction missed'}
          </p>
        </aside>
      </div>
    </section>
  );
}


function EditorialSectorContext({ prediction, sectorBenchmark }) {
  if (!sectorBenchmark) return null;
  const modelValue = Number((prediction.probability * 100).toFixed(1));
  const sectorValue = Number((sectorBenchmark.sector_fast_recovery_rate * 100).toFixed(1));
  const delta = Number((modelValue - sectorValue).toFixed(1));
  const sectorPosition = Math.max(0, Math.min(100, sectorValue));
  const modelPosition = Math.max(0, Math.min(100, modelValue));

  return (
    <section>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8A9AAF]">Sector context</p>
      <p className="mt-4 max-w-4xl text-[15px] leading-7 text-[#52637A]">
        At <span className="font-semibold text-[#0B1220]">{modelValue}%</span>, this prediction sat{' '}
        <span className={`font-semibold ${delta <= 0 ? 'text-[#12355B]' : 'text-[#C96A12]'}`}>{Math.abs(delta).toFixed(1)}pp {delta <= 0 ? 'below' : 'above'}</span>{' '}
        the <span className="font-semibold text-[#0B1220]">{sectorValue}%</span> historical rate of recovery during the 180 days after quarter-end for{' '}
        <span className="font-semibold text-[#0B1220]">{prediction.sector}</span> drawdowns. {Math.abs(delta) < 2
          ? 'That closeness suggests the model was not identifying a large stock-specific divergence from the sector base rate—a useful check on how much this event differed from its peer group.'
          : `The ${Math.abs(delta).toFixed(1)} percentage-point gap shows that the event-specific model signal differed meaningfully from the sector base rate.`}
      </p>
      <div className="relative mx-auto mt-6 h-14 w-full max-w-3xl" aria-label={`Sector recovery rate ${sectorValue} percent; model probability ${modelValue} percent`}>
        <div className="absolute right-0 left-0 top-5 h-px bg-[#D9E2EA]" />
        <div className="absolute top-[14px] -translate-x-1/2" style={{ left: `${modelPosition}%` }}>
          <div className="h-2.5 w-2.5 rounded-full border-2 border-white bg-[#C96A12] shadow-sm" />
          <span className="absolute left-1/2 top-[-24px] -translate-x-1/2 whitespace-nowrap font-mono text-[11px] font-normal text-[#8A9AAF]">
            Model {modelValue.toFixed(1)}%
          </span>
        </div>
        <div className="absolute top-[14px] -translate-x-1/2" style={{ left: `${sectorPosition}%` }}>
          <div className="h-2.5 w-2.5 rounded-full border-2 border-white bg-[#94A3B8] shadow-sm" />
          <span className="absolute left-1/2 top-7 -translate-x-1/2 whitespace-nowrap font-mono text-[11px] font-normal text-[#8A9AAF]">
            Sector {sectorValue.toFixed(1)}%
          </span>
        </div>
      </div>
    </section>
  );
}


function EditorialSurvivalSection({ prediction }) {
  const curve = prediction?.survival_curve;
  if (!curve?.length) return null;
  const displayPoints = curve
    .filter(point => [30, 60, 90, 180, 365].includes(point.horizon_days))
    .map(point => ({
      ...point,
      production_curve: point.horizon_days <= 180 ? point.cumulative_recovery_probability : null,
      research_extension: point.horizon_days >= 180 ? point.cumulative_recovery_probability : null,
      research_label: point.horizon_days > 180 ? point.cumulative_recovery_probability : null,
    }));
  const point180 = displayPoints.find(point => point.horizon_days === 180);
  const point365 = displayPoints.find(point => point.horizon_days === 365);
  const intervalRows = displayPoints.map((point, index) => ({
    label: `${index === 0 ? 1 : displayPoints[index - 1].horizon_days + 1}–${point.horizon_days}d`,
    value: point.conditional_recovery_probability,
    isProductionBoundary: point.horizon_days === 180,
    isResearchExtension: point.horizon_days > 180,
  }));

  return (
    <section>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8A9AAF]">Recovery probability over time</p>
      <p className="mt-3 max-w-4xl text-[17px] leading-7 text-[#52637A]">
        Cumulative chance of recovery reaches{' '}
        <span className="font-semibold text-[#0B1220]">{point180 ? formatProbabilityPct(point180.cumulative_recovery_probability) : '—'}</span>{' '}
        by the 180-day Model v3 horizon{point365 ? <> and <span className="font-semibold text-[#0B1220]">{formatProbabilityPct(point365.cumulative_recovery_probability)}</span> by 365 days, the outer edge of the research window</> : ''}.
      </p>

      <div className="mt-7 h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={displayPoints} margin={{ top: 42, right: 42, left: 42, bottom: 18 }}>
            <XAxis
              dataKey="horizon_days"
              type="number"
              domain={[30, 365]}
              ticks={[30, 60, 90, 180, 365]}
              tickFormatter={value => `${value}d`}
              tick={{ fill: '#8A9AAF', fontSize: 11, fontFamily: dataFont }}
              tickLine={false}
              axisLine={false}
              dy={12}
            />
            <YAxis
              orientation="right"
              domain={[0, 1]}
              ticks={[0, 0.5, 1]}
              tickFormatter={value => `${value * 100}%`}
              tick={{ fill: '#8A9AAF', fontSize: 10, fontFamily: dataFont }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <CartesianGrid vertical={false} stroke="#E7EDF3" />
            <Tooltip content={<SurvivalTooltip />} cursor={{ stroke: '#BFD2E3', strokeDasharray: '4 4' }} />
            <ReferenceLine
              x={180}
              stroke="#B45309"
              strokeDasharray="4 4"
              label={{ value: '180d Model v3 horizon', position: 'insideTop', fill: '#B45309', fontSize: 10, fontFamily: dataFont }}
            />
            <Area type="stepAfter" dataKey="research_extension" baseValue={0} stroke="none" fill="#E8EDF3" fillOpacity={0.72} connectNulls={false} isAnimationActive={false} />
            <Line type="stepAfter" dataKey="production_curve" stroke="#F0A024" strokeWidth={2.4} dot={{ r: 3.5, fill: '#F0A024', stroke: '#fff', strokeWidth: 1.5 }} connectNulls={false} isAnimationActive={false}>
              <LabelList dataKey="production_curve" position="top" formatter={formatProbabilityPct} fill="#0B1220" fontSize={11} fontFamily={dataFont} />
            </Line>
            <Line type="stepAfter" dataKey="research_extension" stroke="#94A3B8" strokeWidth={2.4} dot={{ r: 3.5, fill: '#94A3B8', stroke: '#fff', strokeWidth: 1.5 }} connectNulls={false} isAnimationActive={false}>
              <LabelList dataKey="research_label" position="top" formatter={formatProbabilityPct} fill="#52637A" fontSize={11} fontFamily={dataFont} />
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-5 border-t border-[#D9E2EA] pt-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8A9AAF]">Conditional chance of recovery, per window</p>
        <p className="mt-1 text-[13px] leading-5 text-[#8A9AAF]">Given the stock has not yet recovered at the start of that window. These values do not sum to the cumulative total.</p>
        <div className="mt-5 space-y-3">
          {intervalRows.map(row => (
            <div key={row.label} className="grid grid-cols-[90px_minmax(0,1fr)_58px] items-center gap-4">
              <span className="font-mono text-[13px] font-medium text-[#8A9AAF]">{row.label}</span>
              <div className="h-2 overflow-hidden rounded-full bg-[#EAF0F5]">
                <div
                  className={`h-full rounded-full ${row.isResearchExtension ? 'bg-[#94A3B8]' : row.isProductionBoundary ? 'bg-[#B45309]' : 'bg-[#F0A024]'}`}
                  style={{ width: `${Math.max(2, Math.min(100, row.value * 100))}%` }}
                />
              </div>
              <span className="text-right font-mono text-[13px] font-semibold text-[#0B1220]">{formatProbabilityPct(row.value)}</span>
            </div>
          ))}
        </div>
        <p className="mt-6 text-xs leading-5 text-[#7A899C]">The survival curve is a separate research model. Model v3&apos;s 180-day forward classifier remains the production signal.</p>
      </div>
    </section>
  );
}


function EditorialSignalsSection({ prediction }) {
  const rows = [
    ['Event max drawdown', prediction.event_max_drawdown_pct, 1],
    ['Distance from 52-week high', prediction.distance_from_52w_high, 1],
    ['Relative drop vs. market', prediction.relative_drop_pct, 1],
    ['Sector-relative drop', prediction.sector_relative_drop_pct, 1],
    ['Prior 90-day return', prediction.prior_90d_return, 1],
    ['90-day volatility', prediction.volatility_90d, 1],
    ['Drawdown velocity / day', prediction.drawdown_velocity_pct_per_day, 2],
  ];
  return (
    <section>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8A9AAF]">Signals at event date</p>
      <p className="mt-4 max-w-4xl text-[15px] leading-7 text-[#52637A]">
        These are the point-in-time inputs the model saw before recovery was known. Together, they describe the event&apos;s drawdown severity, recent momentum, volatility, and performance relative to the market and sector.
      </p>
      <div className="mt-8 grid border-t border-[#D9E2EA] md:grid-cols-2 md:gap-x-10 xl:grid-cols-3">
        {rows.map(([name, value, digits]) => (
          <div key={name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-5 border-b border-dashed border-[#CFD9E3] py-3.5">
            <span className="text-[14px] text-[#334155]">{name}</span>
            <span className={`text-right font-mono text-[14px] ${Number(value) < 0 ? 'font-medium text-[#A94442]' : 'text-[#0B1220]'}`}>{formatPct(value, digits)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}


function DrawdownExplorer({
  token,
  onSignIn,
  initialEventId,
  clearInitialEvent,
}) {
  const [
    allTickers,
    setAllTickers,
  ] = useState([]);

  const [
    ticker,
    setTicker,
  ] = useState('');

  const [
    suggestions,
    setSuggestions,
  ] = useState([]);

  const [
    events,
    setEvents,
  ] = useState([]);

  const [
    error,
    setError,
  ] = useState(null);

  const [
    selectedEventId,
    setSelectedEventId,
  ] = useState(null);

  const [
    hasSearched,
    setHasSearched,
  ] = useState(false);

  const [
    prediction,
    setPrediction,
  ] = useState(null);

  const [
    predictError,
    setPredictError,
  ] = useState(null);

  const [
    predictLoading,
    setPredictLoading,
  ] = useState(false);

  const [
    inferenceStep,
    setInferenceStep,
  ] = useState(0);

  const [
    sectorBenchmark,
    setSectorBenchmark,
  ] = useState(null);

  const [
    priceHistory,
    setPriceHistory,
  ] = useState(null);

  const isModelRunning = predictLoading && !prediction;

  const resultRef =
    useRef(null);

  const inferenceRunRef =
    useRef(0);


  useEffect(() => {
    async function loadSearchData() {
      try {
        const [symbolsResponse, recentResponse] = await Promise.all([
          fetch(`${API_URL}/api/symbols`),
          fetch(`${API_URL}/api/drawdowns/recent?limit=12`),
        ]);

        if (!symbolsResponse.ok || !recentResponse.ok) {
          throw new Error(
            `Search data request failed: ${symbolsResponse.status}/${recentResponse.status}`
          );
        }

        const [symbols, recentEvents] = await Promise.all([
          symbolsResponse.json(),
          recentResponse.json(),
        ]);

        if (!Array.isArray(symbols) || !Array.isArray(recentEvents)) {
          throw new Error(
            'Search data response was invalid'
          );
        }

        setAllTickers(symbols);
        setEvents(recentEvents);

      } catch (err) {
        console.error(
          'Unable to load search data',
          err
        );

        setError(
          'Could not load recent drawdown events.'
        );
      }
    }

    loadSearchData();
  }, []);


  useEffect(() => {
    if (!prediction) return;

    let cancelled = false;

    async function loadEnrichment() {
      try {
        const benchmarkResult =
          await fetch(
            `${API_URL}/api/sectors/${encodeURIComponent(
              prediction.sector
            )}/benchmark`
          );

        if (cancelled) return;

        if (
          benchmarkResult.ok
        ) {
          setSectorBenchmark(
            await benchmarkResult.json()
          );
        }

      } catch (err) {
        console.error(
          'Unable to load prediction enrichment',
          err
        );
      }
    }

    loadEnrichment();

    return () => {
      cancelled = true;
    };

  }, [prediction]);


  useEffect(() => {
    if (
      prediction &&
      resultRef.current
    ) {
      resultRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  }, [prediction]);


  function handleTickerChange(
    value
  ) {
    const query = value.trim().toLowerCase();

    setTicker(value);

    if (
      query.length === 0
    ) {
      setSuggestions([]);
      return;
    }

    const matches =
      allTickers.filter(
        symbol =>
          symbol.ticker.toLowerCase().startsWith(query) ||
          symbol.company?.toLowerCase().includes(query)
      );

    setSuggestions(
      matches.slice(0, 8)
    );
  }


  async function loadDrawdownsForTicker(
    searchTicker
  ) {
    const query = searchTicker.trim();
    const symbolMatch = allTickers.find(
      symbol =>
        symbol.ticker.toLowerCase() === query.toLowerCase() ||
        symbol.company?.toLowerCase() === query.toLowerCase()
    ) || allTickers.find(
      symbol => symbol.company?.toLowerCase().startsWith(query.toLowerCase())
    );
    const normalizedTicker = (symbolMatch?.ticker || query).toUpperCase();

    if (!normalizedTicker) {
      return;
    }

    setTicker(
      normalizedTicker
    );

    setError(null);
    setSuggestions([]);
    setSelectedEventId(
      null
    );
    setPrediction(null);

    try {
      const response =
        await fetch(
          `${API_URL}/api/drawdowns?ticker=${encodeURIComponent(
            normalizedTicker
          )}`
        );

      setHasSearched(true);

      if (!response.ok) {
        throw new Error(
          `Drawdown request failed: ${response.status}`
        );
      }

      const data =
        await response.json();

      if (!Array.isArray(data)) {
        throw new Error(
          'Drawdown response was not a list'
        );
      }

      setEvents(data);

    } catch (err) {
      console.error(
        'Unable to load drawdowns',
        err
      );

      setError(
        'Could not load drawdowns for that ticker.'
      );
    }
  }


  async function handleSearch(
    e
  ) {
    e.preventDefault();

    await loadDrawdownsForTicker(
      ticker
    );
  }


  function handleSelectEvent(
    eventId
  ) {
    setSelectedEventId(
      eventId
    );

    setPrediction(null);

    setPredictError(null);

    setPriceHistory(null);

    void runPredictionForEvent(
      eventId
    );
  }


  async function loadPriceHistory(
    eventId
  ) {
    if (!eventId) {
      return null;
    }

    if (
      priceHistoryCache.has(
        eventId
      )
    ) {
      const cached =
        priceHistoryCache.get(
          eventId
        );

      setPriceHistory(
        cached
      );

      return cached;
    }

    try {
      const response =
        await fetch(
          `${API_URL}/api/drawdowns/${eventId}/prices`
        );

      if (!response.ok) {
        throw new Error(
          `Price history request failed: ${response.status}`
        );
      }

      const data =
        await response.json();

      priceHistoryCache.set(
        eventId,
        data
      );

      setPriceHistory(
        data
      );

      return data;

    } catch (err) {
      console.error(
        'Unable to load recovery path',
        err
      );

      return null;
    }
  }


  async function runPredictionForEvent(
    eventId
  ) {
    if (!eventId) {
      return;
    }

    setPredictError(null);

    setPredictLoading(
      true
    );

    setPrediction(null);

    setInferenceStep(0);

    const runId = ++inferenceRunRef.current;
    const stageTimers = [
      window.setTimeout(() => {
        if (inferenceRunRef.current === runId) setInferenceStep(1);
      }, 800),
      window.setTimeout(() => {
        if (inferenceRunRef.current === runId) setInferenceStep(2);
      }, 1700),
      window.setTimeout(() => {
        if (inferenceRunRef.current === runId) setInferenceStep(3);
      }, 2600),
    ];

    loadPriceHistory(
      eventId
    );

    const headers = {
      'Content-Type':
        'application/json',
    };

    if (token) {
      headers.Authorization =
        `Bearer ${token}`;
    }

    const body = {
      drop_event_id:
        eventId,
    };

    try {
      const request = fetch(
        `${API_URL}/api/predict`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        }
      ).then(response => ({ response })).catch(error => ({ error }));

      const [result] =
        await Promise.all([
          request,
          new Promise(resolve => window.setTimeout(resolve, 3400)),
        ]);

      if (result.error) throw result.error;
      const { response } = result;

      if (inferenceRunRef.current !== runId) return;

      if (!response.ok) {
        setPredictError(
          'Could not generate a prediction for this event.'
        );

        return;
      }

      const data =
        await response.json();

      setPrediction(
        data
      );

    } catch (err) {
      console.error(
        'Unable to run recovery model',
        err
      );

      setPredictError(
        'Could not generate a prediction for this event.'
      );

    } finally {
      stageTimers.forEach(timer => window.clearTimeout(timer));
      if (inferenceRunRef.current === runId) {
        setPredictLoading(false);
      }
    }
  }


  useEffect(() => {
    if (!initialEventId) {
      return;
    }

    let cancelled = false;

    async function loadInitialEvent() {
      try {
        setError(null);

        setPredictError(
          null
        );

        setPrediction(
          null
        );

        setPredictLoading(
          true
        );

        setHasSearched(
          true
        );

        const eventRes =
          await fetch(
            `${API_URL}/api/drawdowns/${initialEventId}`
          );

        if (!eventRes.ok) {
          if (!cancelled) {
            setError(
              'Could not load the suggested drawdown.'
            );
          }

          return;
        }

        const eventData =
          await eventRes.json();

        if (cancelled) {
          return;
        }

        setTicker(
          eventData.ticker
        );

        setEvents([
          eventData,
        ]);

        setSelectedEventId(
          eventData.id
        );

        await runPredictionForEvent(
          eventData.id
        );

        if (!cancelled) {
          clearInitialEvent?.();
        }

      } catch {
        if (!cancelled) {
          setError(
            'Could not load the suggested drawdown.'
          );
        }

      } finally {
        if (!cancelled) {
          setPredictLoading(
            false
          );
        }
      }
    }

    loadInitialEvent();

    return () => {
      cancelled = true;
    };

    // runPredictionForEvent intentionally uses the current auth token for this one-time deep-link load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    initialEventId,
    token,
    clearInitialEvent,
  ]);


  const predictedEvent = prediction
    ? (() => {
        const event = events.find(e => Number(e.id) === Number(prediction.drop_event_id));
        return {
          ...event,
          ticker: event?.ticker || prediction.ticker,
          drop_quarter: event?.drop_quarter || priceHistory?.drop_quarter,
          days_to_recovery: event?.days_to_recovery ?? priceHistory?.days_to_recovery,
          recovered_date: event?.recovered_date || priceHistory?.recovered_date,
        };
      })()
    : null;


  const { actualFastRecovery, status: actualStatus } = evaluateRecoveryOutcome(priceHistory);


  const isMatch =
    prediction &&
    actualFastRecovery !== null
      ? actualFastRecovery ===
        prediction.predicted_fast_recovery
      : null;


  return (
    <div className="mx-auto max-w-[1180px] text-[#0B1220]">

      {isModelRunning && (
        <div className="mx-auto mt-[18vh] w-full max-w-2xl border-y border-[#DDE7F0] py-10" role="status" aria-live="polite">
          <div className="flex items-start gap-5">
            <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFF4E5]">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#F2C98D] border-t-[#C96A12]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-4">
                <p className="text-base font-semibold text-[#0B1220]">Running Model v3</p>
                <span className="font-mono text-xs text-[#8A9AAF]">Step {inferenceStep + 1} of 4</span>
              </div>
              <p className="mt-2 text-sm text-[#52637A]">{inferenceSteps[inferenceStep]}</p>
              <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-[#E8EEF4]">
                <div
                  className="h-full rounded-full bg-[#C96A12] transition-[width] duration-500 ease-out"
                  style={{ width: `${[18, 43, 70, 94][inferenceStep]}%` }}
                />
              </div>
              <div className="mt-5 grid gap-2 font-mono text-xs text-[#64748B] sm:grid-cols-2">
                {inferenceSteps.map((step, index) => (
                  <span key={step} className={index <= inferenceStep ? 'text-[#0B1220]' : 'text-[#A8B5C5]'}>
                    {index < inferenceStep ? '✓' : index === inferenceStep ? '●' : '○'} {step}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}


      {!isModelRunning && (
        <>
          {!prediction && (
            <div>
              <section className="mb-8 pt-4">
                <h1 className="type-page-title max-w-5xl text-[#0B1220]">
                  Predict recovery from real drawdowns
                </h1>
                <p className="type-body mt-5 max-w-4xl text-[#52637A]">
                  Search a ticker or company, pick a real S&amp;P 500 quarterly drop of 15% or more, and see how Model v3&apos;s call held up against what actually happened.
                </p>

                <div className="relative mt-7">
                  <form onSubmit={handleSearch} className="flex items-center rounded-2xl border border-[#DDE7F0] bg-white p-2 shadow-[0_8px_24px_rgba(18,53,91,0.05)] focus-within:border-[#9DB9D1]">
                    <input
                      type="text"
                      value={ticker}
                      onChange={event => handleTickerChange(event.target.value)}
                      placeholder="Search ticker or company, e.g. Tesla"
                      className="h-12 min-w-0 flex-1 bg-transparent px-4 text-base text-[#0B1220] outline-none placeholder:text-[#94A3B8]"
                    />
                    <Button type="submit" className={`${buttonPrimary} h-12 rounded-xl px-7`}>
                      Analyze
                    </Button>
                  </form>

                  {suggestions.length > 0 && (
                    <div className="absolute inset-x-0 top-[68px] z-30 max-h-72 overflow-y-auto rounded-xl border border-[#DDE7F0] bg-white p-1.5 shadow-[0_18px_45px_rgba(18,53,91,0.14)]">
                      {suggestions.map(symbol => (
                        <button
                          type="button"
                          key={symbol.ticker}
                          onClick={() => {
                            setTicker(symbol.ticker);
                            setSuggestions([]);
                          }}
                          className="flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-left hover:bg-[#F4F8FC]"
                        >
                          <span className="text-sm font-medium text-[#0B1220]">{symbol.company || symbol.ticker}</span>
                          <span className="font-mono text-xs text-[#64748B]">{symbol.ticker}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <ModelCoverageBand />

              <section className="mt-9">
                <p className={label}>{hasSearched ? `Drawdown events for ${ticker}` : 'Recent drawdown events'}</p>
                <div className="mt-4 overflow-hidden rounded-2xl border border-[#DDE7F0] bg-white">
                  <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(130px,0.7fr)_minmax(120px,0.5fr)] gap-4 border-b border-[#DDE7F0] px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8A9AAF]">
                    <span>Company</span>
                    <span>Drop date</span>
                    <span className="text-right">Max drawdown</span>
                  </div>

                  {error && <p className="border-b border-[#EEF2F6] px-5 py-4 text-sm text-[#B91C1C]">{error}</p>}

                  {events.length > 0 ? events.map(event => {
                    const isSelected = selectedEventId === event.id;
                    const maxDrawdown = event.event_max_drawdown_pct ?? event.drop_pct;
                    return (
                      <button
                        type="button"
                        key={event.id}
                        onClick={() => handleSelectEvent(event.id)}
                        className={`relative grid w-full cursor-pointer grid-cols-[minmax(0,1.5fr)_minmax(130px,0.7fr)_minmax(120px,0.5fr)] items-center gap-4 border-b border-[#EEF2F6] px-5 py-4 text-left transition-colors last:border-0 ${isSelected ? 'bg-[#F0F6FC]' : 'hover:bg-[#F8FBFF]'}`}
                      >
                        {isSelected && <span className="absolute inset-y-0 left-0 w-1 bg-[#12355B]" />}
                        <span className="flex min-w-0 items-center gap-3">
                          <CompanyLogo symbol={event.ticker} size={34} />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-[#0B1220]">{event.company || event.ticker}</span>
                            <span className="block font-mono text-xs text-[#8A9AAF]">{event.ticker}</span>
                          </span>
                        </span>
                        <span className="font-mono text-sm text-[#52637A]">{event.drop_quarter}</span>
                        <span className="text-right font-mono text-sm font-medium text-[#B4232C]">{formatPct(maxDrawdown)}</span>
                      </button>
                    );
                  }) : (
                    <p className="px-5 py-8 text-sm text-[#64748B]">No qualifying drawdown events found.</p>
                  )}
                </div>
              </section>

              {predictError && <p className="mt-5 text-sm text-[#B91C1C]">{predictError}</p>}
            </div>
          )}
        </>
      )}


      {prediction && (
        <div
          ref={resultRef}
          className="mt-2 scroll-mt-24 rounded-lg bg-white px-6 py-10 animate-[fadeIn_220ms_ease-out] sm:px-10 sm:py-12"
        >
          <div className="mx-auto max-w-none">
            <EditorialIntro prediction={prediction} predictedEvent={predictedEvent} actualStatus={actualStatus} isMatch={isMatch} />
            <EditorialRecoveryFigure priceHistory={priceHistory} prediction={prediction} predictedEvent={predictedEvent} actualStatus={actualStatus} isMatch={isMatch} />
            <SectionRule />
            <EditorialSectorContext prediction={prediction} sectorBenchmark={sectorBenchmark} />
            <SectionRule />
            <EditorialSurvivalSection prediction={prediction} />
            <SectionRule />
            <EditorialSignalsSection prediction={prediction} />

            <div className="mt-12 flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                onClick={() => setPrediction(null)}
                className="h-10 cursor-pointer rounded-lg border-[#DDE7F0] bg-white px-4 text-sm font-semibold text-[#0B4F7A] hover:bg-[#F8FBFF] hover:text-[#082F49]"
              >
                ← Back to search
              </Button>
              {!token && (
                <button onClick={onSignIn} className="cursor-pointer text-sm font-semibold text-[#0B4F7A] hover:underline">
                  Sign in to save this analysis
                </button>
              )}
              {token && <span className="text-sm font-semibold text-[#047857]">✓ Prediction saved to your history</span>}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}


export default DrawdownExplorer;
