import { theme } from '../theme'

// Single-surface section container. Replaces the previous SectionCard, which
// nested a gradient icon-chip header strip inside its own bordered box —
// two layers of decoration for what should be one plain container with a
// rule-based header (impeccable's "no nested cards" law).
export function Section({ title, Icon, count, action, children }: {
  title: string; Icon?: React.ElementType; count?: number
  action?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div style={{
      background: theme.color.surface,
      border: `1px solid ${theme.color.border}`,
      borderRadius: theme.radius.lg,
      overflow: 'hidden',
    }}>
      <SectionHeader title={title} Icon={Icon} count={count} action={action} />
      {children}
    </div>
  )
}

export function SectionHeader({ title, Icon, count, action }: {
  title: string; Icon?: React.ElementType; count?: number; action?: React.ReactNode
}) {
  return (
    <div style={{
      padding: '12px 18px',
      borderBottom: `1px solid ${theme.color.divider}`,
      display: 'flex', alignItems: 'center', gap: 9,
    }}>
      {Icon && <Icon style={{ width: 14, height: 14, color: theme.color.inkMuted }} />}
      <span style={{
        fontFamily: theme.font.display, fontSize: 13, fontWeight: 600,
        color: theme.color.ink, flex: 1,
      }}>
        {title}
      </span>
      {count !== undefined && (
        <span style={{ fontFamily: theme.font.mono, fontSize: 11, color: theme.color.inkMuted }}>
          {count.toLocaleString()}
        </span>
      )}
      {action}
    </div>
  )
}
