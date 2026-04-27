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

const variantStyles: Record<Variant, string> = {
  primary: [
    'bg-amber-500 text-white font-semibold',
    'hover:bg-amber-600',
    'disabled:opacity-40',
  ].join(' '),
  secondary: [
    'bg-white text-slate-700 border border-slate-300',
    'hover:bg-slate-50 hover:text-slate-900 hover:border-slate-400',
    'disabled:opacity-40',
  ].join(' '),
  ghost: [
    'text-slate-600',
    'hover:text-slate-900 hover:bg-slate-100',
    'disabled:opacity-40',
  ].join(' '),
  danger: [
    'bg-red-50 text-red-600 border border-red-200',
    'hover:bg-red-100 hover:text-red-700 hover:border-red-300',
    'disabled:opacity-40',
  ].join(' '),
}

/* Resting box-shadows per variant */
const variantShadow: Record<Variant, string> = {
  primary:   'var(--elevation-2), var(--elevation-border-1)',
  secondary: 'var(--elevation-1), var(--elevation-border-1)',
  ghost:     'none',
  danger:    'var(--elevation-1), var(--elevation-border-1)',
}

/* Hover box-shadows per variant (applied via CSS, not JS) */
const variantHoverShadow: Record<Variant, string> = {
  primary:   'var(--elevation-3)',
  secondary: 'var(--elevation-2)',
  ghost:     'none',
  danger:    'var(--elevation-2)',
}

const sizeStyles: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5 rounded-lg',
  md: 'px-4 py-2    text-sm gap-2   rounded-lg',
  lg: 'px-5 py-2.5  text-sm gap-2   rounded-lg',
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
          focus-visible:ring-2 focus-visible:ring-amber-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white
          disabled:cursor-not-allowed
          ${!isDisabled ? 'btn-physics' : ''}
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${className}
        `}
        style={{
          /* Press-physics shadows are animated via CSS btn-physics class.
             Box-shadow is set here and overridden with :hover/:active in CSS. */
          boxShadow: isDisabled ? 'none' : variantShadow[variant],
          /* Pass a CSS var so the hover rule can override it */
          ['--btn-hover-shadow' as string]: variantHoverShadow[variant],
          ...style,
        }}
        {...props}
      >
        {loading ? (
          <Spinner
            size={size === 'sm' ? 'sm' : 'md'}
            className={variant === 'primary' ? 'text-white/80' : 'text-slate-500'}
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
