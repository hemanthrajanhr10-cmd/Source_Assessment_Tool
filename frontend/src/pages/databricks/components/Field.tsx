import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { theme } from '../theme'

export function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label style={{
      display: 'block', fontSize: 10, fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.08em',
      color: theme.color.inkMuted, marginBottom: 6,
      fontFamily: theme.font.body,
    }}>
      {children}{required && <span style={{ color: theme.color.danger, marginLeft: 3 }}>*</span>}
    </label>
  )
}

export function InputField({
  icon: Icon, placeholder, value, onChange, type = 'text',
  mono = false, hint, showToggle = false,
}: {
  icon?: React.ElementType; placeholder?: string; value: string
  onChange: (v: string) => void; type?: string; mono?: boolean
  hint?: string; showToggle?: boolean
}) {
  const [show, setShow] = useState(false)
  const [focused, setFocused] = useState(false)
  const effectiveType = showToggle ? (show ? 'text' : 'password') : type
  return (
    <div>
      <div style={{ position: 'relative' }}>
        {Icon && (
          <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}>
            <Icon style={{ width: 14, height: 14, color: focused ? theme.color.accent : theme.color.inkMuted, transition: `color ${theme.motion.fast}ms` }} />
          </div>
        )}
        <input
          type={effectiveType}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: `10px ${showToggle ? 38 : 14}px 10px ${Icon ? 36 : 14}px`,
            borderRadius: theme.radius.sm, fontSize: 13,
            fontFamily: mono ? theme.font.mono : theme.font.body,
            background: focused ? theme.color.surface : theme.color.surfaceSunken,
            border: `1px solid ${focused ? theme.color.accent : theme.color.border}`,
            color: theme.color.ink, outline: 'none',
            boxShadow: focused ? `0 0 0 3px ${theme.color.accentFaint}` : 'none',
            transition: `all ${theme.motion.fast}ms ${theme.motion.easeCss}`,
          }}
        />
        {showToggle && (
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            tabIndex={-1}
            style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: theme.color.inkMuted,
              display: 'flex', padding: 4,
            }}
          >
            {show ? <EyeOff style={{ width: 14, height: 14 }} /> : <Eye style={{ width: 14, height: 14 }} />}
          </button>
        )}
      </div>
      {hint && <p style={{ fontSize: 10, color: theme.color.inkMuted, marginTop: 5, lineHeight: 1.5, fontFamily: theme.font.body }}>{hint}</p>}
    </div>
  )
}
