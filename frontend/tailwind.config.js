/** @type {import('tailwindcss').Config} */

// Every colour is a CSS variable holding a space-separated RGB triple, so the
// whole product can flip to dark mode by toggling one class on <html> — no
// component ever needs to know which theme is active.
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: token('primary'),
        'primary-container': token('primary-container'),
        'on-primary': token('on-primary'),
        'on-primary-container': token('on-primary-container'),
        'primary-fixed': token('primary-fixed'),
        'primary-fixed-dim': token('primary-fixed-dim'),
        secondary: token('secondary'),
        'secondary-container': token('secondary-container'),
        'on-secondary-container': token('on-secondary-container'),
        'secondary-fixed': token('secondary-fixed'),
        tertiary: token('tertiary'),
        'tertiary-container': token('tertiary-container'),
        'on-tertiary-container': token('on-tertiary-container'),
        'tertiary-fixed': token('tertiary-fixed'),
        'on-tertiary-fixed-variant': token('on-tertiary-fixed-variant'),
        error: token('error'),
        'error-container': token('error-container'),
        'on-error-container': token('on-error-container'),
        surface: token('surface'),
        'surface-container-lowest': token('surface-container-lowest'),
        'surface-container-low': token('surface-container-low'),
        'surface-container': token('surface-container'),
        'surface-container-high': token('surface-container-high'),
        'surface-container-highest': token('surface-container-highest'),
        'surface-variant': token('surface-variant'),
        'on-surface': token('on-surface'),
        'on-surface-variant': token('on-surface-variant'),
        outline: token('outline'),
        'outline-variant': token('outline-variant'),
        'inverse-surface': token('inverse-surface'),
        'inverse-on-surface': token('inverse-on-surface'),
        amber: token('amber'),
        'amber-soft': token('amber-soft'),
        rose: token('rose'),
        'rose-soft': token('rose-soft'),
        emerald: token('emerald'),
        'emerald-soft': token('emerald-soft'),
      },
      fontFamily: {
        headline: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        '2xs': ['10px', { lineHeight: '14px' }],
      },
      borderRadius: {
        DEFAULT: '0.375rem',
        md: '0.5rem',
        lg: '0.625rem',
        xl: '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 8px 24px -12px rgb(15 23 42 / 0.12)',
        raised: '0 2px 6px -2px rgb(15 23 42 / 0.08), 0 18px 40px -18px rgb(15 23 42 / 0.28)',
        pop: '0 24px 60px -20px rgb(15 23 42 / 0.35)',
        glow: '0 0 0 1px rgb(var(--primary) / 0.22), 0 12px 40px -12px rgb(var(--primary) / 0.45)',
        'glow-sm': '0 0 0 1px rgb(var(--primary) / 0.25), 0 4px 18px -6px rgb(var(--primary) / 0.4)',
        inset: 'inset 0 1px 0 0 rgb(255 255 255 / 0.06)',
      },
      backgroundImage: {
        aurora:
          'radial-gradient(at 12% 8%, rgb(var(--primary) / 0.20) 0px, transparent 55%), radial-gradient(at 88% 4%, rgb(var(--tertiary) / 0.18) 0px, transparent 50%), radial-gradient(at 72% 92%, rgb(var(--primary-fixed) / 0.22) 0px, transparent 55%)',
        sheen: 'linear-gradient(135deg, rgb(var(--primary)) 0%, rgb(var(--primary-container)) 45%, rgb(var(--tertiary)) 130%)',
        'grid-fade':
          'linear-gradient(to bottom, rgb(var(--outline-variant) / 0.5) 1px, transparent 1px), linear-gradient(to right, rgb(var(--outline-variant) / 0.5) 1px, transparent 1px)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96) translateY(6px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(24px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        float: {
          '0%,100%': { transform: 'translateY(0) scale(1)' },
          '50%': { transform: 'translateY(-14px) scale(1.03)' },
        },
        drift: {
          '0%,100%': { transform: 'translate3d(0,0,0) scale(1)' },
          '33%': { transform: 'translate3d(3%,-4%,0) scale(1.08)' },
          '66%': { transform: 'translate3d(-3%,3%,0) scale(0.96)' },
        },
        'gradient-pan': {
          '0%,100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.85)', opacity: '0.7' },
          '70%': { transform: 'scale(1.9)', opacity: '0' },
          '100%': { transform: 'scale(1.9)', opacity: '0' },
        },
        ticker: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'bar-grow': { '0%': { transform: 'scaleX(0)' }, '100%': { transform: 'scaleX(1)' } },
        'draw-line': { '0%': { strokeDashoffset: '1' }, '100%': { strokeDashoffset: '0' } },
        'nudge-bounce': {
          '0%,100%': { transform: 'translateY(0)' },
          '30%': { transform: 'translateY(-4px)' },
          '60%': { transform: 'translateY(-1px)' },
        },
        breathe: { '0%,100%': { opacity: '0.55' }, '50%': { opacity: '1' } },
        // Landing-page only: a slowly rotating dashed ring around the hero
        // globe, and a ken-burns drift so the hero photograph never sits still.
        'spin-slow': { '0%': { transform: 'rotate(0deg)' }, '100%': { transform: 'rotate(360deg)' } },
        'ken-burns': {
          '0%,100%': { transform: 'scale(1.04) translate3d(0, 0, 0)' },
          '50%': { transform: 'scale(1.14) translate3d(-1.5%, -1.5%, 0)' },
        },
        // Light sweep across the primary CTA.
        shine: { '0%': { transform: 'translateX(-130%)' }, '60%,100%': { transform: 'translateX(240%)' } },
      },
      animation: {
        'fade-up': 'fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 0.4s ease-out both',
        'scale-in': 'scale-in 0.28s cubic-bezier(0.22, 1, 0.36, 1) both',
        'slide-in-right': 'slide-in-right 0.34s cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 1.8s infinite',
        float: 'float 9s ease-in-out infinite',
        drift: 'drift 24s ease-in-out infinite',
        'gradient-pan': 'gradient-pan 6s ease infinite',
        'pulse-ring': 'pulse-ring 2.4s cubic-bezier(0.22, 1, 0.36, 1) infinite',
        ticker: 'ticker 40s linear infinite',
        'bar-grow': 'bar-grow 0.7s cubic-bezier(0.22, 1, 0.36, 1) both',
        'nudge-bounce': 'nudge-bounce 0.6s ease-out',
        breathe: 'breathe 2.6s ease-in-out infinite',
        'spin-slow': 'spin-slow 28s linear infinite',
        'ken-burns': 'ken-burns 30s ease-in-out infinite',
        shine: 'shine 4.2s cubic-bezier(0.22, 1, 0.36, 1) infinite',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      backdropBlur: { xs: '4px' },
    },
  },
  plugins: [],
};
