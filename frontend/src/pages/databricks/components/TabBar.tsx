import { motion } from 'framer-motion'
import { theme } from '../theme'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

export interface TabDef<K extends string> {
  key: K; label: string; Icon: React.ElementType; sub?: string
}

// Underline segmented control — active tab gets a single accent underline
// (shared-layout animated), not a filled pill background.
export function TabBar<K extends string>({ tabs, active, onChange }: {
  tabs: TabDef<K>[]; active: K; onChange: (key: K) => void
}) {
  const reduced = usePrefersReducedMotion()
  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${theme.color.border}`, overflowX: 'auto' }}>
      {tabs.map(({ key, label, Icon }) => {
        const isActive = active === key
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            style={{
              position: 'relative', display: 'flex', alignItems: 'center', gap: 6,
              padding: '11px 16px', fontSize: 13, fontWeight: isActive ? 600 : 500,
              whiteSpace: 'nowrap', fontFamily: theme.font.body,
              color: isActive ? theme.color.ink : theme.color.inkMuted,
              background: 'none', border: 'none', cursor: 'pointer',
              transition: `color ${theme.motion.fast}ms ${theme.motion.easeCss}`,
            }}
          >
            <Icon style={{ width: 14, height: 14 }} />
            {label}
            {isActive && (
              <motion.div
                layoutId="db-tab-underline"
                transition={reduced ? { duration: 0 } : { duration: theme.motion.base / 1000, ease: theme.motion.ease }}
                style={{
                  position: 'absolute', left: 12, right: 12, bottom: -1, height: 2,
                  background: theme.color.accent, borderRadius: 1,
                }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
