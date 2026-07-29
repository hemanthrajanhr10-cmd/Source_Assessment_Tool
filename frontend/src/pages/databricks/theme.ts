// Databricks-scoped design tokens — minimalist structure on the app's existing
// teal theme (same palette family as tailwind.config.js `brand` and the shared
// SessionFilterBar), so these pages sit visually inside the rest of SAT while
// keeping their own component layer.

export const theme = {
  color: {
    canvas:        '#F6FFFE',
    surface:       '#FFFFFF',
    surfaceSunken: '#F0FAFA',
    border:        '#B2DDD9',
    borderStrong:  '#93CCC6',
    divider:       '#D4EFEC',

    ink:           '#0D1117',
    inkSecondary:  '#404555',
    inkMuted:      '#767A8C',
    inkFaint:      '#B0BAC4',

    // App teal as the accent family. `accent` (brand-700) is dark enough for
    // AA text and crisp underlines; `accentBright` (brand-500) is for graphics,
    // chart series, focus borders, and progress fills.
    accent:        '#25706A',
    accentBright:  '#4DA8A0',
    accentHover:   '#185750',
    accentFaint:   'rgba(77,168,160,0.10)',
    accentGlow:    'rgba(108,189,181,0.22)',
    accentBorder:  'rgba(77,168,160,0.35)',

    success:    '#059669',
    successBg:  'rgba(5,150,105,0.08)',
    warning:    '#D97706',
    warningBg:  'rgba(217,119,6,0.09)',
    danger:     '#DC2626',
    dangerBg:   'rgba(220,38,38,0.07)',
    info:       '#2563EB',
    infoBg:     'rgba(37,99,235,0.07)',
    neutral:    '#767A8C',
    neutralBg:  'rgba(13,17,23,0.045)',
  },
  font: {
    display: `'Plus Jakarta Sans', system-ui, -apple-system, sans-serif`,
    body:    `'Plus Jakarta Sans', system-ui, -apple-system, sans-serif`,
    mono:    `'JetBrains Mono','Fira Code',monospace`,
  },
  motion: {
    fast:  120,
    base:  180,
    slow:  220,
    enter: 320,
    // Ease-out-quart — decelerate, no spring/bounce overshoot.
    ease: [0.25, 1, 0.5, 1] as [number, number, number, number],
    easeCss: 'cubic-bezier(0.25, 1, 0.5, 1)',
  },
  radius: { sm: 6, md: 10, lg: 14 },
  shadow: {
    xs: '0 1px 2px rgba(77,168,160,0.05)',
    sm: '0 1px 3px rgba(77,168,160,0.06), 0 4px 16px rgba(77,168,160,0.08)',
    md: '0 4px 12px rgba(77,168,160,0.10), 0 16px 40px rgba(77,168,160,0.12)',
  },
} as const

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent'

export function toneColors(tone: Tone) {
  const c = theme.color
  const map: Record<Tone, { fg: string; bg: string }> = {
    success: { fg: c.success, bg: c.successBg },
    warning: { fg: c.warning, bg: c.warningBg },
    danger:  { fg: c.danger,  bg: c.dangerBg  },
    info:    { fg: c.info,    bg: c.infoBg    },
    neutral: { fg: c.neutral, bg: c.neutralBg },
    accent:  { fg: c.accent,  bg: c.accentFaint },
  }
  return map[tone]
}
