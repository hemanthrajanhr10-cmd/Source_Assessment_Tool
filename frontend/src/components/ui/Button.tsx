import { forwardRef } from 'react'
import Spinner from './Spinner'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size    = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

/* Tailwind classes per variant */
const variantStyles: Record<Variant, string> = {
  primary: [
    'text-white font-semibold',
    'disabled:opacity-40',
  ].join(' '),
  secondary: [
    'bg-white text-slate-700 border border-slate-200',
    'disabled:opacity-40',
  ].join(' '),
  ghost: [
    'text-slate-600',
    'disabled:opacity-40',
  ].join(' '),
  danger: [
    'bg-red-50 text-red-600 border border-red-200',
    'hover:bg-red-100 hover:text-red-700 hover:border-red-300',
    'disabled:opacity-40',
  ].join(' '),
}

/* Inline styles per variant */
const variantInlineStyle: Record<Variant, React.CSSProperties> = {
  primary: {
    background: 'linear-gradient(135deg, #4DA8A0 0%, #93CCC6 100%)',
    boxShadow: '0 4px 16px rgba(108, 189, 181, 0.38), 0 1px 3px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.20)',
  },
  secondary: {
    boxShadow: 'var(--elevation-1), var(--elevation-border-1)',
  },
  ghost: {
    boxShadow: 'none',
  },
  danger: {
    boxShadow: 'var(--elevation-1), var(--elevation-border-1)',
  },
}

const sizeStyles: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5 rounded-lg',
  md: 'px-4 py-2    text-sm gap-2   rounded-xl',
  lg: 'px-5 py-2.5  text-sm gap-2   rounded-xl',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = 'primary', size = 'md', loading, leftIcon, rightIcon,
      children, className = '', disabled, style, ...props },
    ref
  ) => {
    const isDisabled = disabled || loading

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={`
          inline-flex items-center justify-center font-medium select-none
          focus:outline-none
          focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white
          disabled:cursor-not-allowed
          ${!isDisabled ? 'btn-physics' : ''}
          ${variant === 'primary' && !isDisabled ? 'btn-shimmer' : ''}
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${className}
        `}
        style={{
          ...(isDisabled ? { opacity: 0.5 } : variantInlineStyle[variant]),
          ...style,
        }}
        {...props}
      >
        {loading ? (
          <Spinner
            size={size === 'sm' ? 'sm' : 'md'}
            className={variant === 'primary' ? 'text-white/80' : 'text-brand-600'}
          />
        ) : (
          leftIcon
        )}
        {children}
        {!loading && rightIcon}
      </button>
    )
  }
)

Button.displayName = 'Button'
export default Button
