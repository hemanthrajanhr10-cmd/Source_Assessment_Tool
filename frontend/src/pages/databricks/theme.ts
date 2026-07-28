// Databricks-scoped design tokens — "Light Precision" minimalism.
// Deliberately isolated from the app-wide teal theme (frontend/src/pages/*, Sidebar.tsx,
// tailwind.config.js) so this redesign doesn't affect other source integrations.

export const theme = {
  color: {
    canvas:        '#FAFAFA',
    surface:       '#FFFFFF',
    surfaceSunken: '#F4F4F5',
    border:        '#E4E4E7',
    borderStrong:  '#D4D4D8',
    divider:       '#ECECEF',

    ink:           '#18181B',
    inkSecondary:  '#52525B',
    inkMuted:      '#8A8A93',
    inkFaint:      '#B4B4BB',

    // Single restrained accent — Databricks red. Used for primary CTA, active
    // tab underline, and one focal highlight per view. Not for card borders,
    // icon chips, or ambient backgrounds.
    accent:        '#FF3621',
    accentHover:   '#E62E1B',
    accentFaint:   'rgba(255,54,33,0.06)',
    accentBorder:  'rgba(255,54,33,0.20)',

    success:    '#0F9D63',
    successBg:  'rgba(15,157,99,0.08)',
    warning:    '#C27803',
    warningBg:  'rgba(194,120,3,0.09)',
    danger:     '#D0342C',
    dangerBg:   'rgba(208,52,44,0.07)',
    info:       '#2E67C7',
    infoBg:     'rgba(46,103,199,0.07)',
    neutral:    '#71717A',
    neutralBg:  'rgba(24,24,27,0.045)',
  },
  font: {
    display: `'Outfit', system-ui, sans-serif`,
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
    xs: '0 1px 2px rgba(24,24,27,0.05)',
    sm: '0 1px 3px rgba(24,24,27,0.07), 0 1px 2px rgba(24,24,27,0.04)',
    md: '0 6px 16px rgba(24,24,27,0.07), 0 2px 6px rgba(24,24,27,0.04)',
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
