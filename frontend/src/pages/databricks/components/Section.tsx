import { useCallback } from 'react'
import { theme } from '../theme'

// Single-surface section container with a rule-based header (no nested cards).
// Hover adds a cursor-tracked teal spotlight — pattern adapted from Vengeance UI's
// spotlight-border cards, toned down for an assessment tool. CSS vars are set
// directly on the element (no re-render per mousemove).
export function Section({ title, Icon, count, action, children }: {
  title: string; Icon?: React.ElementType; count?: number
  action?: React.ReactNode; children: React.ReactNode
}) {
  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const rect = el.getBoundingClientRect()
    el.style.setProperty('--spot-x', `${e.clientX - rect.left}px`)
    el.style.setProperty('--spot-y', `${e.clientY - rect.top}px`)
  }, [])

  return (
    <div
      className="db-spot-host"
      onMouseMove={onMouseMove}
      style={{
        background: theme.color.surface,
        border: `1px solid ${theme.color.border}`,
        borderRadius: theme.radius.lg,
        overflow: 'hidden',
        boxShadow: theme.shadow.xs,
      }}
    >
      <div className="db-spot" aria-hidden="true" />
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
        fontFamily: theme.font.display, fontSize: 13, fontWeight: 700,
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
