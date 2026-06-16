/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['"Plus Jakarta Sans"', 'PJSFallback', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'PJSFallback', 'system-ui', 'sans-serif'],
        mono:    ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      fontSize: {
        'display':  ['clamp(1.5rem, 3vw, 2.25rem)', { lineHeight: '1.1', letterSpacing: '-0.025em', fontWeight: '800' }],
        'headline': ['1.1875rem', { lineHeight: '1.25', letterSpacing: '-0.015em', fontWeight: '700' }],
        'title':    ['0.9375rem', { lineHeight: '1.4', fontWeight: '600' }],
        'label':    ['0.6875rem', { lineHeight: '1',   letterSpacing: '0.08em',   fontWeight: '600' }],
        'mono-sm':  ['0.8125rem', { lineHeight: '1.5' }],
      },
      colors: {
        /* ── Nature: Forest Green — primary brand + action ── */
        brand: {
          50:  '#F0FDF4',
          100: '#DCFCE7',
          200: '#BBF7D0',
          300: '#86EFAC',
          400: '#4ADE80',
          500: '#22C55E',
          600: '#16A34A',
          700: '#15803D',
          800: '#166534',
          900: '#14532D',
        },
        earth: {
          50:  '#F0FDF4',
          100: '#DCFCE7',
          200: '#BBF7D0',
          300: '#86EFAC',
          400: '#4ADE80',
          500: '#22C55E',
          600: '#16A34A',
          700: '#15803D',
          800: '#166534',
          900: '#14532D',
        },
        /* ── Tide: Olive / Lime — navigation + connectivity ── */
        tide: {
          50:  '#F7FEE7',
          100: '#ECFCCB',
          200: '#D9F99D',
          300: '#BEF264',
          400: '#A3E635',
          500: '#84CC16',
          600: '#65A30D',
          700: '#4D7C0F',
          800: '#3F6212',
          900: '#365314',
        },
        /* ── Grove: Emerald — success + completion ── */
        grove: {
          50:  '#ECFDF5',
          100: '#D1FAE5',
          200: '#A7F3D0',
          300: '#6EE7B7',
          400: '#34D399',
          500: '#10B981',
          600: '#059669',
          700: '#047857',
          800: '#065F46',
          900: '#064E3B',
        },
      },
      animation: {
        'fade-in':      'fadeIn 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-up':     'slideUp 0.38s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-down':   'slideDown 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in':     'slideIn 0.32s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-right':  'slideRight 0.32s cubic-bezier(0.16, 1, 0.3, 1)',
        'page-enter':   'pageEnter 0.40s cubic-bezier(0.16, 1, 0.3, 1) both',
        'glow-pulse':   'glowPulse 3s ease-in-out infinite',
        'spin-slow':    'spin 2.5s linear infinite',
        'pulse-slow':   'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer':      'shimmer 2.5s linear infinite',
        'signal-flow':  'shimmer 1.8s linear infinite',
        'scale-in':     'scaleIn 0.20s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-out':    'scaleOut 0.14s cubic-bezier(0.25, 1, 0.5, 1)',
        'pulse-ring':   'pulseRing 2.4s ease-out infinite',
        'fade-slide':   'fadeSlide 0.38s cubic-bezier(0.16, 1, 0.3, 1) both',
        'aurora':       'aurora 16s ease-in-out infinite',
        'float':        'float 8s ease-in-out infinite',
        'float-slow':   'float 13s ease-in-out 3s infinite reverse',
        'breathe':      'breathe 4.5s ease-in-out infinite',
        'gradient-x':   'gradientShift 6s ease infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        pageEnter: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          from: { opacity: '0', transform: 'translateY(-10px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          from: { opacity: '0', transform: 'translateX(-10px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        slideRight: {
          from: { opacity: '0', transform: 'translateX(10px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(22, 163, 74, 0.12)' },
          '50%':      { boxShadow: '0 0 40px rgba(22, 163, 74, 0.28)' },
        },
        shimmer: {
          from: { backgroundPosition: '-200% center' },
          to:   { backgroundPosition:  '200% center' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.93)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
        scaleOut: {
          from: { opacity: '1', transform: 'scale(1)' },
          to:   { opacity: '0', transform: 'scale(0.95)' },
        },
        pulseRing: {
          '0%':   { transform: 'scale(1)',   opacity: '0.5' },
          '100%': { transform: 'scale(2.6)', opacity: '0' },
        },
        fadeSlide: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        aurora: {
          '0%':   { backgroundPosition: '0% 50%' },
          '50%':  { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px) rotate(0deg) scale(1)' },
          '25%':      { transform: 'translateY(-18px) rotate(2.5deg) scale(1.02)' },
          '50%':      { transform: 'translateY(-10px) rotate(-1deg) scale(0.99)' },
          '75%':      { transform: 'translateY(-22px) rotate(1.5deg) scale(1.01)' },
        },
        breathe: {
          '0%, 100%': { opacity: '0.55', transform: 'scale(1)' },
          '50%':      { opacity: '0.85', transform: 'scale(1.08)' },
        },
        gradientShift: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%':      { backgroundPosition: '100% 50%' },
        },
      },
      boxShadow: {
        /* nature green glows */
        'glow-earth':           '0 0 24px rgba(22, 163, 74, 0.24), 0 0 8px rgba(22, 163, 74, 0.12)',
        'glow-earth-strong':    '0 0 48px rgba(22, 163, 74, 0.36), 0 0 20px rgba(22, 163, 74, 0.20)',
        'glow-ember':           '0 0 24px rgba(22, 163, 74, 0.24), 0 0 8px rgba(22, 163, 74, 0.12)',
        'glow-ember-strong':    '0 0 48px rgba(22, 163, 74, 0.36), 0 0 20px rgba(22, 163, 74, 0.20)',
        /* tide olive glows */
        'glow-tide':            '0 0 24px rgba(101, 163, 13, 0.22), 0 0 8px rgba(101, 163, 13, 0.12)',
        'glow-tide-strong':     '0 0 48px rgba(101, 163, 13, 0.32), 0 0 20px rgba(101, 163, 13, 0.18)',
        /* grove emerald glows */
        'glow-grove':           '0 0 24px rgba(5, 150, 105, 0.22), 0 0 8px rgba(5, 150, 105, 0.12)',
        'glow-grove-strong':    '0 0 48px rgba(5, 150, 105, 0.32), 0 0 20px rgba(5, 150, 105, 0.18)',
        /* legacy alias kept */
        'glow-clay':            '0 0 24px rgba(74, 222, 128, 0.22)',
        'glow-amber':           '0 0 24px rgba(132, 204, 22, 0.18)',
        'glow-strong':          '0 0 48px rgba(22, 163, 74, 0.30)',
        'card':                 '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'card-hover':           '0 4px 16px rgba(0,0,0,0.08), 0 0 0 1px rgba(22,163,74,0.06)',
        'card-lift':            '0 12px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)',
        'sidebar':              '1px 0 0 0 rgba(187,247,208,0.8)',
        'header':               '0 1px 0 0 rgba(187,247,208,0.6)',
        'dropdown':             '0 12px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)',
        'auth-card':            '0 24px 64px rgba(22,163,74,0.08), 0 4px 16px rgba(0,0,0,0.06)',
        'button-primary':       '0 4px 16px rgba(22, 163, 74, 0.30), 0 1px 4px rgba(0,0,0,0.10)',
        'button-primary-hover': '0 8px 24px rgba(22, 163, 74, 0.42), 0 2px 8px rgba(0,0,0,0.10)',
      },
    },
  },
  plugins: [],
}
