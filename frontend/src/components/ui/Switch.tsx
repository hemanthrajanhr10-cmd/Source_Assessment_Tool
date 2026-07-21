interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: React.ReactNode
  description?: React.ReactNode
  className?: string
}

export default function Switch({ checked, onChange, disabled, label, description, className = '' }: SwitchProps) {
  const toggle = () => {
    if (!disabled) onChange(!checked)
  }

  return (
    <div className={`flex items-start gap-3 ${className}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={toggle}
        onKeyDown={e => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault()
            toggle()
          }
        }}
        className={`
          relative inline-flex h-6 w-11 shrink-0 items-center rounded-full
          transition-colors duration-200 ease-out
          focus:outline-none focus-visible:ring-2 focus-visible:ring-earth-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white
          disabled:cursor-not-allowed disabled:opacity-40
          ${checked ? 'bg-earth-600' : 'bg-slate-200'}
        `}
      >
        <span
          className="inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition-transform duration-200 ease-out"
          style={{
            height: 18, width: 18,
            transform: checked ? 'translateX(22px)' : 'translateX(4px)',
            boxShadow: 'var(--elevation-1)',
          }}
        />
      </button>
      {(label || description) && (
        <div className="flex-1 min-w-0">
          {label && (
            <button
              type="button"
              onClick={toggle}
              disabled={disabled}
              className="block text-left text-sm font-medium text-slate-800 disabled:cursor-not-allowed"
            >
              {label}
            </button>
          )}
          {description && (
            <p className="mt-0.5 text-xs text-slate-400 leading-relaxed">{description}</p>
          )}
        </div>
      )}
    </div>
  )
}
