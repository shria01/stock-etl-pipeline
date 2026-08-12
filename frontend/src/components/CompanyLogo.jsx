import { useState } from 'react';

const fallbackColors = ['#12355B', '#2563A6', '#0F766E', '#B45309', '#B4232C', '#6D28D9'];

function fallbackColor(symbol) {
  const score = Array.from(symbol || '').reduce((total, char) => total + char.charCodeAt(0), 0);
  return fallbackColors[score % fallbackColors.length];
}

export default function CompanyLogo({ symbol, size = 28, className = '' }) {
  const [failedSymbol, setFailedSymbol] = useState(null);

  const logoToken = import.meta.env.VITE_LOGO_DEV_TOKEN;
  const canLoadLogo = Boolean(symbol && logoToken && failedSymbol !== symbol);

  // Request a fixed, higher-res source regardless of display size, and let
  // CSS scales it down to avoid upscaling artifacts at small row sizes.
  // (28-32px) where size * 2 was too low-res to look crisp.
  const requestSize = 128;

  return (
    <span
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#D9E2EA] text-xs font-semibold text-white ${className}`}
      style={{ width: size, height: size, backgroundColor: fallbackColor(symbol) }}
      aria-label={`${symbol || 'Company'} logo`}
    >
      <span aria-hidden="true">{(symbol || '?').slice(0, 2)}</span>
      {canLoadLogo && (
        <img
          src={`https://img.logo.dev/ticker/${encodeURIComponent(symbol)}?token=${encodeURIComponent(logoToken)}&size=${requestSize}&retina=true`}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailedSymbol(symbol)}
        />
      )}
    </span>
  );
}
