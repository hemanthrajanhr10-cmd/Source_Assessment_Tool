import { theme } from '../theme'
import { CountUpText } from './CountUp'

export interface Metric {
  Icon?: React.ElementType
  label: string
  value: string | number
  sub?: string
  accent?: string
}

// Instrument-panel metric strip — metrics sit in one row separated by thin
// structural dividers, not individually boxed. Numeric values tick up on
// mount via the CountUp ticker.
export function MetricRow({ metrics }: { metrics: Metric[] }) {
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap',
      border: `1px solid ${theme.color.border}`,
      borderRadius: theme.radius.md,
      background: theme.color.surface,
      boxShadow: theme.shadow.xs,
      overflow: 'hidden',
    }}>
      {metrics.map((m, i) => (
        <div
          key={i}
          style={{
            flex: '1 1 140px', minWidth: 140,
            padding: '14px 18px',
            borderLeft: i === 0 ? 'none' : `1px solid ${theme.color.divider}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            {m.Icon && <m.Icon style={{ width: 13, height: 13, color: theme.color.inkFaint }} />}
            <span style={{
              fontFamily: theme.font.body,
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: theme.color.inkMuted,
            }}>
              {m.label}
            </span>
          </div>
          <p style={{
            fontFamily: theme.font.mono, fontVariantNumeric: 'tabular-nums',
            fontSize: 22, fontWeight: 600, lineHeight: 1,
            color: m.accent ?? theme.color.ink, margin: 0,
          }}>
            <CountUpText value={m.value} />
          </p>
          {m.sub && (
            <p style={{ fontFamily: theme.font.body, fontSize: 11, color: theme.color.inkMuted, margin: '5px 0 0' }}>
              {m.sub}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
