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
        brand: {
          50:  '#f0f7f4',
          100: '#d8ede1',
          200: '#b7deca',
          300: '#8fcaaa',
          400: '#52b788',
          500: '#40916c',
          600: '#2d6a4f',
          700: '#1b4332',
          800: '#143326',
          900: '#0d2219',
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
          '0%, 100%': { boxShadow: '0 0 20px rgba(45, 106, 79, 0.12)' },
          '50%':      { boxShadow: '0 0 40px rgba(45, 106, 79, 0.28)' },
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
        'glow-forest':        '0 0 24px rgba(45, 106, 79, 0.24), 0 0 8px rgba(45, 106, 79, 0.12)',
        'glow-forest-strong': '0 0 48px rgba(45, 106, 79, 0.36), 0 0 20px rgba(45, 106, 79, 0.20)',
        'glow-sage':          '0 0 24px rgba(82, 183, 136, 0.22)',
        'glow-amber':         '0 0 24px rgba(245, 158, 11, 0.18)',
        'glow-strong':        '0 0 48px rgba(45, 106, 79, 0.30)',
        'card':               '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'card-hover':         '0 4px 16px rgba(0,0,0,0.08), 0 0 0 1px rgba(45,106,79,0.06)',
        'card-lift':          '0 12px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)',
        'sidebar':            '1px 0 0 0 rgba(209,221,212,0.8)',
        'header':             '0 1px 0 0 rgba(209,221,212,0.6)',
        'dropdown':           '0 12px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)',
        'auth-card':          '0 24px 64px rgba(45,106,79,0.10), 0 4px 16px rgba(0,0,0,0.06)',
        'button-primary':     '0 4px 16px rgba(45, 106, 79, 0.30), 0 1px 4px rgba(0,0,0,0.10)',
        'button-primary-hover': '0 8px 24px rgba(45, 106, 79, 0.42), 0 2px 8px rgba(0,0,0,0.10)',
      },
    },
  },
  plugins: [],
}
