/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['DM Sans', 'DM Sans Fallback', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Syne', 'Syne Fallback', 'system-ui', 'sans-serif'],
        mono:    ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        'display':  ['clamp(1.5rem, 3vw, 2.5rem)', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '700' }],
        'headline': ['1.25rem',   { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '600' }],
        'title':    ['0.9375rem', { lineHeight: '1.4', fontWeight: '600' }],
        'label':    ['0.6875rem', { lineHeight: '1',   letterSpacing: '0.1em',   fontWeight: '600' }],
        'mono-sm':  ['0.8125rem', { lineHeight: '1.5' }],
      },
      colors: {
        brand: {
          50:  '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
      },
      animation: {
        'fade-in':      'fadeIn 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-up':     'slideUp 0.36s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-down':   'slideDown 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in':     'slideIn 0.32s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-right':  'slideRight 0.32s cubic-bezier(0.16, 1, 0.3, 1)',
        'page-enter':   'pageEnter 0.32s cubic-bezier(0.16, 1, 0.3, 1) both',
        'glow-pulse':   'glowPulse 2.5s ease-in-out infinite',
        'spin-slow':    'spin 2s linear infinite',
        'pulse-slow':   'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer':      'shimmer 2.5s linear infinite',
        'signal-flow':  'shimmer 1.8s linear infinite',
        'scale-in':     'scaleIn 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-out':    'scaleOut 0.14s cubic-bezier(0.25, 1, 0.5, 1)',
        'pulse-ring':   'pulseRing 2s ease-out infinite',
        'fade-slide':   'fadeSlide 0.36s cubic-bezier(0.16, 1, 0.3, 1) both',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        pageEnter: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          from: { opacity: '0', transform: 'translateY(-8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          from: { opacity: '0', transform: 'translateX(-8px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        slideRight: {
          from: { opacity: '0', transform: 'translateX(8px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 16px rgba(245, 158, 11, 0.08)' },
          '50%':      { boxShadow: '0 0 32px rgba(245, 158, 11, 0.22)' },
        },
        shimmer: {
          from: { backgroundPosition: '-200% center' },
          to:   { backgroundPosition:  '200% center' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
        scaleOut: {
          from: { opacity: '1', transform: 'scale(1)' },
          to:   { opacity: '0', transform: 'scale(0.96)' },
        },
        pulseRing: {
          '0%':   { transform: 'scale(1)',   opacity: '0.6' },
          '100%': { transform: 'scale(2.2)', opacity: '0' },
        },
        fadeSlide: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
      boxShadow: {
        'glow-indigo': '0 0 24px rgba(245, 158, 11, 0.18)',
        'glow-amber':  '0 0 24px rgba(245, 158, 11, 0.18)',
        'glow-strong': '0 0 48px rgba(245, 158, 11, 0.28)',
        'card':        '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'card-hover':  '0 4px 16px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
        'card-lift':   '0 8px 24px rgba(0,0,0,0.1), 0 2px 6px rgba(0,0,0,0.06)',
        'sidebar':     '1px 0 0 0 #e2e8f0',
        'header':      '0 1px 0 0 #e2e8f0',
        'dropdown':    '0 8px 24px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.06)',
        'auth-card':   '0 16px 40px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.04)',
      },
    },
  },
  plugins: [],
}
