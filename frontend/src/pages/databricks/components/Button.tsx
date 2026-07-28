import { theme } from '../theme'

type Variant = 'primary' | 'secondary' | 'ghost'

export function Button({
  children, onClick, disabled, variant = 'secondary', Icon, type = 'button',
}: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean
  variant?: Variant; Icon?: React.ElementType; type?: 'button' | 'submit'
}) {
  const styles: Record<Variant, React.CSSProperties> = {
    primary: {
      background: disabled ? theme.color.surfaceSunken : theme.color.accent,
      color: disabled ? theme.color.inkFaint : '#FFFFFF',
      border: '1px solid transparent',
    },
    secondary: {
      background: theme.color.surface,
      color: disabled ? theme.color.inkFaint : theme.color.inkSecondary,
      border: `1px solid ${theme.color.border}`,
    },
    ghost: {
      background: 'transparent',
      color: disabled ? theme.color.inkFaint : theme.color.inkMuted,
      border: '1px solid transparent',
    },
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="db-btn"
      data-variant={variant}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '9px 16px', borderRadius: theme.radius.sm,
        fontSize: 13, fontWeight: 600, fontFamily: theme.font.body,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: `background ${theme.motion.fast}ms ${theme.motion.easeCss}, border-color ${theme.motion.fast}ms ${theme.motion.easeCss}, transform ${theme.motion.fast}ms ${theme.motion.easeCss}`,
        ...styles[variant],
      }}
    >
      {Icon && <Icon style={{ width: 14, height: 14 }} />}
      {children}
    </button>
  )
}
