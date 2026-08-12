import { useEffect, useState } from 'react';

const tocItems = [
  ['task', '01', 'Prediction task'],
  ['data', '02', 'Dataset'],
  ['performance', '03', 'Fixed holdout'],
  ['calibration', '04', 'Calibration'],
  ['coefficients', '05', 'Coefficients'],
  ['audit', '06', 'Evaluation'],
  ['experiments', '07', 'Experiments'],
  ['survival', '08', 'Survival-v1'],
  ['scope', '09', 'Scope'],
];

const metrics = [
  ['Eligible events', '1,610'],
  ['Holdout events', '361'],
  ['Holdout ROC AUC', '0.731'],
  ['Holdout PR AUC', '0.596'],
];

const performance = [
  ['Accuracy', '0.668', 'Overall classification accuracy'],
  ['ROC AUC', '0.731', 'Ranking quality across thresholds'],
  ['PR AUC', '0.596', 'Ranking quality for fast-recovery cases'],
  ['Fast-recovery precision', '0.578', 'Share of positive calls that recovered'],
  ['Fast-recovery recall', '0.486', 'Share of fast recoveries identified'],
  ['Fast-recovery F1', '0.528', 'Balance of precision and recall'],
  ['Majority baseline accuracy', '0.618', 'Always predicts no fast recovery'],
];

const calibration = [
  { bucket: '0–20%', predicted: 11.6, actual: 8.9, events: 79 },
  { bucket: '20–40%', predicted: 30.5, actual: 34.2, events: 114 },
  { bucket: '40–60%', predicted: 48.8, actual: 50.5, events: 91 },
  { bucket: '60–80%', predicted: 69.0, actual: 53.4, events: 58 },
  { bucket: '80–100%', predicted: 86.4, actual: 78.9, events: 19 },
];

const coefficients = [
  ['Relative drop vs. market', 0.804],
  ['90-day volatility', 0.742],
  ['Relative prior 90-day return', 0.611],
  ['Quarterly drop', 0.606],
  ['Event max drawdown', 0.487],
  ['Drawdown velocity / day', 0.375],
  ['Utilities sector', -0.231],
  ['Prior 90-day return', -0.368],
  ['Distance from 52-week high', -0.518],
];

const auditRows = [
  ['Recovery-path outcome fields used as features', 'Clean'],
  ['Features after prediction date', 'Clean'],
  ['Outcomes resolved before prediction date', 'Excluded'],
  ['Immature 180-day labels', 'Excluded'],
  ['Split-boundary label overlap', 'Purged'],
  ['Median imputation across splits', 'Training-only'],
  ['Current S&P 500 universe', 'Known limitation'],
];

const experiments = [
  ['Model v4', 'Market-regime features', 'Holdout PR AUC 0.539 vs. v3 0.596', 'Not promoted'],
  ['Model v5', 'Shape and ticker-history features', '180d walk-forward PR AUC +0.006 vs. compact', 'Not promoted'],
  ['90-day target', 'Very fast recovery', 'PR AUC 0.448; 21% positive rate', 'Research only'],
  ['365-day target', 'One-year recovery', 'Higher PR AUC with 64% positive rate', 'Easier, less sharp task'],
  ['Survival-v1', 'Time-to-event curve', 'Mixed long-horizon calibration', 'Research only'],
];

const sectionLabel = 'type-label text-[#8A9AAF]';
const bodyCopy = 'type-body text-[#52637A]';

function Section({ eyebrow, title, children }) {
  const id = tocItems.find(([, number]) => eyebrow.startsWith(number))?.[0];

  return (
    <section id={id} className="section-space-lg scroll-mt-8 border-t border-[#D9E2EA]">
      <p className={sectionLabel}>{eyebrow}</p>
      {title && <h2 className="type-section-title mt-3 text-[#0B1220]">{title}</h2>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function OnThisPage() {
  const [activeId, setActiveId] = useState('task');

  useEffect(() => {
    const sections = tocItems.map(([id]) => document.getElementById(id)).filter(Boolean);
    let frameId;

    const updateActiveSection = () => {
      frameId = undefined;
      const readingLine = Math.min(220, window.innerHeight * 0.28);
      const atPageBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;

      if (atPageBottom) {
        setActiveId(sections.at(-1)?.id ?? 'task');
        return;
      }

      const current = sections.reduce((active, section) => {
        return section.getBoundingClientRect().top <= readingLine ? section : active;
      }, sections[0]);

      setActiveId(current?.id ?? 'task');
    };

    const requestUpdate = () => {
      if (frameId === undefined) frameId = window.requestAnimationFrame(updateActiveSection);
    };

    updateActiveSection();
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);

    return () => {
      window.removeEventListener('scroll', requestUpdate);
      window.removeEventListener('resize', requestUpdate);
      if (frameId !== undefined) window.cancelAnimationFrame(frameId);
    };
  }, []);

  const goToSection = id => {
    setActiveId(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <aside className="hidden border-l border-[#E2E8F0] px-7 py-12 xl:block">
      <nav className="sticky top-6" aria-label="Model analysis sections">
        <p className={sectionLabel}>On this page</p>
        <ol className="mt-6 space-y-1">
          {tocItems.map(([id, number, label]) => {
            const active = activeId === id;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => goToSection(id)}
                  aria-current={active ? 'location' : undefined}
                  className={`flex w-full items-center gap-3 rounded-r-xl border-l-2 px-3 py-2.5 text-left text-sm transition-colors ${active ? 'border-[#12355B] bg-[#F4F8FC] font-semibold text-[#12355B]' : 'border-transparent text-[#8A9AAF] hover:bg-[#F8FBFF] hover:text-[#52637A]'}`}
                >
                  <span className="font-mono text-xs">{number}</span>
                  <span>{label}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
    </aside>
  );
}

function Timeline() {
  return (
    <div className="mt-8 border-y border-[#D9E2EA] py-8">
      <div className="grid grid-cols-[1fr_1fr_1fr] font-mono text-xs text-[#52637A]">
        <div><span className="block font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8A9AAF]">Quarter begins</span><span className="mt-1 block">Jan 1</span></div>
        <div className="text-center"><span className="block font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-[#C96A12]">Prediction date</span><span className="mt-1 block">Mar 31</span></div>
        <div className="text-right"><span className="block font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8A9AAF]">Label deadline</span><span className="mt-1 block">Sep 27</span></div>
      </div>
      <div className="mt-5 grid grid-cols-2">
        <div className="relative border-t-2 border-[#12355B] pt-4 text-center text-xs font-medium text-[#52637A] before:absolute before:-top-1.5 before:left-0 before:h-3 before:w-3 before:rounded-full before:bg-[#12355B] after:absolute after:-top-1.5 after:right-0 after:h-3 after:w-3 after:rounded-full after:bg-[#C96A12]">Drawdown quarter</div>
        <div className="relative border-t-2 border-[#C96A12] pt-4 text-center text-xs font-medium text-[#52637A] after:absolute after:-top-1.5 after:right-0 after:h-3 after:w-3 after:rounded-full after:bg-[#C96A12]">180-day forward window</div>
      </div>
    </div>
  );
}

function CalibrationChart() {
  return (
    <div className="mt-8 space-y-5">
      <div className="flex flex-wrap justify-end gap-5 text-xs text-[#64748B]"><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#BFD2E3]" />Average predicted probability in bucket</span><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#12355B]" />Realized 180-day recovery rate</span></div>
      {calibration.map(row => (
        <div key={row.bucket} className="grid grid-cols-[74px_minmax(0,1fr)_62px] items-center gap-4">
          <div><p className="font-mono text-xs font-semibold text-[#0B1220]">{row.bucket}</p><p className="mt-1 text-[10px] text-[#8A9AAF]">n={row.events}</p></div>
          <div className="relative h-7">
            <div className="absolute inset-x-0 top-3 h-1.5 rounded-full bg-[#EAF0F5]" />
            <div className="absolute top-1 h-5 w-0.5 bg-[#9DB9D1]" style={{ left: `${row.predicted}%` }} />
            <div className="absolute top-2 h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-white bg-[#12355B] shadow-sm" style={{ left: `${row.actual}%` }} />
          </div>
          <p className="text-right font-mono text-xs font-semibold text-[#0B1220]">{row.actual.toFixed(1)}%</p>
        </div>
      ))}
      <div className="ml-[90px] flex justify-between font-mono text-[10px] text-[#94A3B8]"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
    </div>
  );
}

function CoefficientChart() {
  return (
    <div className="mt-8 space-y-3">
      <div className="grid grid-cols-[200px_minmax(0,1fr)_55px] gap-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8A9AAF]"><span>Signal</span><span className="flex justify-between"><i>Lower recovery</i><i>Higher recovery</i></span><span className="text-right">Coef.</span></div>
      {coefficients.map(([name, value]) => (
        <div key={name} className="grid grid-cols-[200px_minmax(0,1fr)_55px] items-center gap-4">
          <span className="text-sm text-[#334155]">{name}</span>
          <div className="relative h-3 rounded-full bg-[#EEF2F6]">
            <span className="absolute inset-y-[-3px] left-1/2 w-px bg-[#94A3B8]" />
            <span
              className={`absolute top-0 h-3 rounded-full ${value > 0 ? 'left-1/2 bg-[#C96A12]' : 'right-1/2 bg-[#12355B]'}`}
              style={{ width: `${Math.abs(value) / 0.804 * 48}%` }}
            />
          </div>
          <span className="text-right font-mono text-xs font-semibold text-[#0B1220]">{value > 0 ? '+' : ''}{value.toFixed(3)}</span>
        </div>
      ))}
    </div>
  );
}

function SurvivalChart() {
  return (
    <div className="mt-7">
      <svg viewBox="0 0 820 230" className="h-auto w-full" role="img" aria-label="Observed cumulative recovery rates across survival research horizons">
        <line x1="45" y1="190" x2="785" y2="190" stroke="#D9E2EA" />
        <line x1="45" y1="105" x2="785" y2="105" stroke="#E7EDF3" />
        <line x1="45" y1="20" x2="785" y2="20" stroke="#E7EDF3" />
        <path d="M45 182 H170 V165 H295 V154 H500 V123" fill="none" stroke="#F0A024" strokeWidth="4" />
        <path d="M500 123 H770 V81" fill="none" stroke="#94A3B8" strokeWidth="4" />
        <line x1="500" y1="15" x2="500" y2="190" stroke="#B45309" strokeDasharray="5 6" />
        {[[45,182,'4.4%'],[170,165,'14.8%'],[295,154,'21.4%'],[500,123,'39.3%'],[770,81,'64.2%']].map(([x,y,label]) => <g key={label}><circle cx={x} cy={y} r="5" fill={x <= 500 ? '#F0A024' : '#94A3B8'} stroke="white" strokeWidth="2" /><text x={x} y={y-12} textAnchor="middle" fontSize="12" fontFamily="JetBrains Mono, monospace" fill="#0B1220">{label}</text></g>)}
        {[[45,'30d'],[170,'60d'],[295,'90d'],[500,'180d'],[770,'365d']].map(([x,label]) => <text key={label} x={x} y="215" textAnchor="middle" fontSize="11" fontFamily="JetBrains Mono, monospace" fill="#8A9AAF">{label}</text>)}
        <text x="500" y="12" textAnchor="middle" fontSize="10" fontFamily="JetBrains Mono, monospace" fill="#B45309">180d classifier horizon</text>
      </svg>
    </div>
  );
}

export default function ModelAnalysis() {
  return (
    <div className="mx-auto grid max-w-[1240px] overflow-visible bg-white xl:grid-cols-[minmax(0,1fr)_220px]">
    <article className="min-w-0 px-8 py-12 text-[#0B1220] sm:px-12">
      <header className="pb-10">
        <p className={sectionLabel}>Recovery research · production model v3</p>
        <h1 className="type-page-title mt-4">Model Analysis</h1>
        <p className="type-lead mt-5 max-w-4xl text-[#334155]">
          <span className="font-mono">Logistic Regression v3</span> classifies whether an S&amp;P 500 stock recovers within 180 days of a completed 15%+ quarterly decline. It is trained to rank recovery likelihood, not predict price.
        </p>
        <div className="mt-7 border-l-[3px] border-[#F0A024] bg-[#FFF8EC] px-6 py-5 text-[15px] leading-7 text-[#7C4605]">
          The prediction is made at the completed-quarter cutoff. Among stocks still unrecovered at quarter-end, the model estimates the chance of returning to baseline over the next 180 days.
        </div>
      </header>

      <section className="section-space-lg border-t border-[#D9E2EA]">
        <h2 className="type-section-title">Does it beat guessing the majority class?</h2>
        <div className="relative mt-5 h-7 overflow-hidden rounded-lg bg-[#EEF3F7]">
          <div className="absolute inset-y-0 left-0 bg-[#C7D3E0]" style={{ width: '61.8%' }} />
          <div className="absolute inset-y-0 w-1 rounded-full bg-[#05664F]" style={{ left: '66.8%' }} />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 font-mono text-sm">
          <span className="text-[#64748B]">Baseline&nbsp; 0.618</span>
          <span className="font-semibold text-[#05664F]">Model v3&nbsp; 0.668 (+0.050)</span>
        </div>
        <p className="mt-3 text-sm leading-6 text-[#52637A]">Yes, by five points. That is a modest but real edge over always predicting the more common outcome.</p>
      </section>

      <section className="section-space-lg border-t border-[#D9E2EA]">
        <h2 className="type-section-title">What was it trained and tested on?</h2>
        <div className="mt-5 grid grid-cols-2 border-y border-[#D9E2EA] lg:grid-cols-4">
          {metrics.map(([name, value]) => (
            <div key={name} className="px-5 py-6 even:border-l even:border-[#D9E2EA] lg:border-l lg:first:border-l-0">
              <p className="type-metric font-mono text-[#12355B]">{value}</p>
              <p className="mt-1 text-xs text-[#8A9AAF]">{name}</p>
            </div>
          ))}
        </div>
        <p className="mt-5 text-[15px] leading-7 text-[#52637A]">Of 1,610 eligible drawdown events, 361 were reserved as a final holdout. These events were entirely unseen during training and measure how well the model ranks real, out-of-sample recoveries.</p>
      </section>

      <section className="section-space-lg border-t border-[#D9E2EA]">
        <h2 className="type-section-title">Where does the holdout sit in time?</h2>
        <p className="mt-5 text-[15px] leading-7 text-[#52637A]">The final holdout covers 361 events from Q3 2023 through Q4 2025. Prediction dates span September 29, 2023 to December 31, 2025, and every included row had a fully observed 180-day label window. The universe is current S&amp;P 500 constituents. Designed for historical recovery analysis and ranking, not automated trading.</p>
      </section>

      <Section eyebrow="01 · Prediction task" title="A completed-quarter decision point"><p className={bodyCopy}>A drawdown event is created when a current S&amp;P 500 constituent falls 15% or more during a calendar quarter. The model waits until the quarter is complete, then predicts whether the stock will recover to its quarter-start baseline during the next 180 days.</p><Timeline /><p className={`mt-6 ${bodyCopy}`}>Events already recovered before the prediction date are excluded. Events without a full 180-day follow-up window are also excluded from the classifier dataset.</p></Section>

      <Section eyebrow="02 · Dataset construction" title="From daily prices to a clean forward label">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_310px]">
          <ol className="relative ml-2 space-y-6 border-l border-[#C8D5E2] pl-7">
            {[
              ['Daily prices', 'loaded through yfinance'],
              ['Quarterly returns', ''],
              ['Drawdown events', ''],
              ['Quarter-end cutoff', ''],
              ['Point-in-time features', ''],
              ['180-day label', ''],
              ['Purged evaluation', 'the final holdout split'],
            ].map(([step, detail], index) => (
              <li key={step} className="relative text-[15px] leading-6">
                <span className={`absolute -left-[35px] top-1.5 h-2.5 w-2.5 rounded-full ${index === 6 ? 'bg-[#F0A024]' : 'bg-[#12355B]'}`} />
                <span className="font-semibold text-[#0B1220]">{step}</span>
                {detail && <span className="text-[#8A9AAF]">: {detail}</span>}
              </li>
            ))}
          </ol>

          <div className="self-start border-y border-[#D9E2EA] py-6">
            <p className={sectionLabel}>How much data this represents</p>
            <div className="mt-5 space-y-2">
              <div className="flex items-baseline gap-3"><span className="font-mono text-[25px] font-semibold">1.3M+</span><span className="text-sm text-[#8A9AAF]">daily price rows</span></div>
              <div className="pl-1 text-xl text-[#B7C5D3]">↓</div>
              <div className="flex items-baseline gap-3"><span className="font-mono text-[25px] font-semibold">1,894</span><span className="text-sm text-[#8A9AAF]">raw drawdown events</span></div>
              <div className="pl-1 text-xl text-[#B7C5D3]">↓</div>
              <div className="flex items-baseline gap-3"><span className="font-mono text-[25px] font-semibold text-[#12355B]">1,610</span><span className="text-sm text-[#52637A]">Model v3 eligible events</span></div>
            </div>
          </div>
        </div>

        <div className="mt-8 border-l-[3px] border-[#F0A024] bg-[#FFF8EC] px-6 py-5 text-[15px] leading-7 text-[#7C4605]">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#B45309]">What this doesn&apos;t cover yet</p>
          <p className="mt-2">The dataset uses today&apos;s S&amp;P 500 constituents and current sector mappings, so it is not a survivorship-bias-free or fully point-in-time historical index backtest.</p>
        </div>
      </Section>

      <Section eyebrow="03 · Fixed holdout" title="Model performance"><p className="mb-5 text-sm text-[#64748B]"><span className="font-semibold text-[#0B1220]">Positive class:</span> recovered to baseline within 180 days after quarter-end.</p><div className="overflow-hidden rounded-2xl border border-[#D9E2EA]"><table className="w-full text-left text-sm"><thead className="bg-[#F8FBFF] text-[11px] uppercase tracking-[0.14em] text-[#8A9AAF]"><tr><th className="px-5 py-3">Metric</th><th className="px-5 py-3 text-right">Model v3</th><th className="px-5 py-3">What it means</th></tr></thead><tbody>{performance.map(row => <tr key={row[0]} className="border-t border-[#EEF2F6]"><td className="px-5 py-3.5 font-medium">{row[0]}</td><td className="px-5 py-3.5 text-right font-mono font-semibold">{row[1]}</td><td className="px-5 py-3.5 text-[#64748B]">{row[2]}</td></tr>)}</tbody></table></div><div className="mt-6 grid gap-6 lg:grid-cols-[1fr_310px]"><div className="border-y border-[#D9E2EA] py-4 text-sm text-[#52637A]"><span className="font-semibold text-[#0B1220]">Decision threshold: 50%.</span> Predictions at or above 50% are classified as positive recovery signals.<div className="mt-4 border-t border-[#D9E2EA] pt-3 text-xs"><span className="font-semibold text-[#0B1220]">Class balance:</span> 138 fast recoveries / 223 non-fast recoveries <span className="text-[#94A3B8]">·</span> 38.2% positive</div></div><div className="overflow-hidden rounded-2xl border border-[#D9E2EA] text-xs"><div className="grid grid-cols-3 bg-[#F8FBFF] text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8A9AAF]"><span className="px-2 py-2" /><span className="px-2 py-2">Actual fast</span><span className="px-2 py-2">Actual not fast</span></div><div className="grid grid-cols-3 border-t border-[#EEF2F6] text-center"><span className="px-2 py-2 text-left text-[#64748B]">Predicted fast</span><span className="bg-[#EAF7F3] px-2 py-2 font-mono font-semibold text-[#05664F]">67 TP</span><span className="px-2 py-2 font-mono">49 FP</span></div><div className="grid grid-cols-3 border-t border-[#EEF2F6] text-center"><span className="px-2 py-2 text-left text-[#64748B]">Predicted not fast</span><span className="px-2 py-2 font-mono">71 FN</span><span className="bg-[#EAF7F3] px-2 py-2 font-mono font-semibold text-[#05664F]">174 TN</span></div></div></div><p className="mt-4 text-sm leading-6 text-[#52637A]">At the 50% threshold, Model v3 identified 67 fast recoveries, missed 71, produced 49 false positives, and correctly rejected 174 non-fast recoveries.</p><p className={`mt-6 ${bodyCopy}`}>Accuracy alone is not the main success metric because the baseline can achieve moderate accuracy by predicting no fast recoveries. ROC AUC, PR AUC, precision, recall, and fast-recovery F1 better capture whether the model ranks and identifies recoveries.</p></Section>

      <Section eyebrow="04 · Holdout calibration" title="Do higher model scores correspond to higher recovery rates?"><p className={bodyCopy}>Events are grouped into probability buckets on the 361-event final holdout. Higher scores generally correspond to higher realized 180-day recovery rates, showing useful ranking signal. The 60–80% bucket is overconfident: average predictions in that range were higher than the observed recovery rate.</p><CalibrationChart /></Section>

      <Section eyebrow="05 · Standardized coefficients" title="What signals moved the model?"><p className={bodyCopy}>These coefficients come from the active Logistic Regression v3 model. It uses point-in-time features available at the completed-quarter prediction date. Coefficients are associations, not causal explanations; their signs describe how higher standardized feature values move the recovery score. Because numeric features are standardized, coefficient magnitudes are roughly comparable across those inputs.</p><p className="mt-4 text-sm text-[#64748B]"><span className="font-semibold text-[#0B1220]">Feature groups:</span> event severity, relative market and sector movement, recent momentum, volatility, drawdown velocity, and sector indicators.</p><div className="mt-6 border-y border-[#D9E2EA] py-4 text-xs leading-5 text-[#64748B]"><span className="font-semibold text-[#0B1220]">Quarterly drop</span> measures the start-to-end quarter return. <span className="font-semibold text-[#0B1220]">Event max drawdown</span> measures the deepest point reached during the completed drawdown quarter.</div><CoefficientChart /></Section>

      <Section eyebrow="06 · Evaluation integrity" title="Leakage audit"><div className="overflow-hidden rounded-2xl border border-[#D9E2EA]"><table className="w-full text-left text-sm"><tbody>{auditRows.map(([area,status]) => <tr key={area} className="border-b border-[#EEF2F6] last:border-0"><td className="px-5 py-3.5 text-[#334155]">{area}</td><td className={`px-5 py-3.5 text-right font-semibold ${status === 'Known limitation' ? 'text-[#B45309]' : 'text-[#12355B]'}`}>{status}</td></tr>)}</tbody></table></div><p className={`mt-6 ${bodyCopy}`}>The active model does not use future recovery-path fields as inputs. Labels are measured after the prediction date, immature outcomes are excluded, and chronological splits are purged to avoid label-window overlap.</p></Section>

      <Section eyebrow="07 · Experiments" title="Experiments I tried and didn&apos;t ship"><div className="overflow-x-auto rounded-2xl border border-[#D9E2EA]"><table className="min-w-[860px] w-full text-left text-sm"><thead className="bg-[#F8FBFF] text-[11px] uppercase tracking-[0.14em] text-[#8A9AAF]"><tr><th className="px-5 py-3">Experiment</th><th className="px-5 py-3">What changed</th><th className="px-5 py-3">Result</th><th className="px-5 py-3">Decision</th></tr></thead><tbody>{experiments.map(row => <tr key={row[0]} className="border-t border-[#EEF2F6]"><td className="px-5 py-3.5 font-semibold">{row[0]}</td><td className="px-5 py-3.5 text-[#64748B]">{row[1]}</td><td className="px-5 py-3.5 text-[#64748B]">{row[2]}</td><td className="px-5 py-3.5 text-[#334155]">{row[3]}</td></tr>)}</tbody></table></div><p className={`mt-6 ${bodyCopy}`}>More complex experiments remain research artifacts unless they improve the fixed evaluation result. Model v3 remains active because it is simpler, interpretable, and more defensible for the selected production task.</p></Section>

      <Section eyebrow="08 · Survival-v1" title="Research extension: recovery probability over time"><span className="inline-flex rounded-full bg-[#EEF2F6] px-3 py-1 text-xs font-semibold text-[#52637A]">Research model · not production classifier</span><p className={`mt-5 ${bodyCopy}`}>Survival-v1 is a separate discrete-time hazard model. Instead of one 180-day outcome, it estimates cumulative recovery across 30, 60, 90, 180, and 365 days. The chart summarizes evaluation-cohort cumulative recovery rates as context, not the personalized survival curve shown on individual prediction pages.</p><p className="mt-4 text-sm text-[#64748B]"><span className="font-semibold text-[#C96A12]">Orange</span> marks horizons through the 180-day production classifier window; <span className="font-semibold text-[#64748B]">gray</span> shows the research-only 365-day extension.</p><SurvivalChart /><p className="mt-3 text-xs leading-5 text-[#7A899C]">The survival model helps explain when recovery accumulates, but long-horizon calibration is mixed and it has not replaced Model v3.</p></Section>

      <Section eyebrow="09 · Scope" title="Known limitations and future work"><ul className="space-y-3 text-[15px] leading-7 text-[#52637A]">{['The study uses current S&P 500 constituents, so survivorship bias remains.','The model does not yet use point-in-time fundamentals or analyst estimate revisions.','Prediction occurs at quarter-end, not at the first real-time −15% drawdown trigger.','The survival model is research-only until evaluated on newly matured data.','Results are historical recovery analysis, not a live trading recommendation.'].map(item => <li key={item} className="flex gap-3"><span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-[#C96A12]" />{item}</li>)}</ul><div className="mt-8 border-l-2 border-[#12355B] pl-5 text-[16px] font-medium leading-7 text-[#334155]"><span className="font-semibold text-[#0B1220]">Final takeaway:</span> Model v3 is a leakage-audited, quarter-end recovery classifier with useful ranking signal. It remains a research and analysis tool, not a trading recommendation.</div></Section>
    </article>
    <OnThisPage />
    </div>
  );
}
