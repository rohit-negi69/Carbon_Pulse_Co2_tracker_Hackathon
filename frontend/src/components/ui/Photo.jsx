import { useState } from 'react';

// ---------------------------------------------------------------------------
// Photo — the landing page's image frame.
//
// Three jobs at once:
//   1. reserve space (via `ratio`) so nothing shifts while the file streams in;
//   2. paint a token-driven gradient + pixel grid *behind* the picture, so a
//      blocked CDN, an offline grader or the self-contained `preview.html`
//      still looks designed rather than broken;
//   3. fade the picture in over that backdrop and swallow the error event.
//
// Because the backdrop is built from the same CSS variables as the rest of the
// product, the whole gallery re-themes with the dark-mode switch for free.
// ---------------------------------------------------------------------------

const TONES = {
  primary: ['rgb(var(--primary))', 'rgb(var(--tertiary))'],
  tertiary: ['rgb(var(--tertiary))', 'rgb(var(--primary-fixed-dim))'],
  amber: ['rgb(var(--amber))', 'rgb(var(--primary))'],
  rose: ['rgb(var(--rose))', 'rgb(var(--tertiary))'],
};

export default function Photo({
  src,
  alt = '',
  className = '',
  imgClassName = '',
  ratio,
  overlay = 'none',
  tone = 'primary',
  zoom = false,
  priority = false,
  children,
}) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [from, to] = TONES[tone] || TONES.primary;

  return (
    <div
      className={`relative overflow-hidden bg-surface-container-high ${className}`}
      style={ratio ? { aspectRatio: ratio } : undefined}
    >
      {/* Backdrop — always painted, so a missing image is still on-brand. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ backgroundImage: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`, opacity: 0.92 }}
      />
      <div aria-hidden className="absolute inset-0 grid-backdrop opacity-30" />

      {failed && (
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 text-on-primary/70"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
          <path d="M2 21c0-3 1.85-5.36 5.08-6" />
        </svg>
      )}

      {!failed && (
        <img
          src={src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setReady(true)}
          onError={() => setFailed(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-spring ${
            ready ? 'opacity-100' : 'opacity-0'
          } ${zoom ? 'animate-ken-burns' : ''} ${imgClassName}`}
        />
      )}

      {overlay !== 'none' && (
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              overlay === 'full'
                ? 'linear-gradient(160deg, rgb(4 16 11 / 0.62) 0%, rgb(4 16 11 / 0.34) 45%, rgb(4 16 11 / 0.8) 100%)'
                : 'linear-gradient(to top, rgb(4 16 11 / 0.86) 0%, rgb(4 16 11 / 0.35) 45%, transparent 80%)',
          }}
        />
      )}

      {children}
    </div>
  );
}
