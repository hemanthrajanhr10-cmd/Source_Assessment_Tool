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
    'shadow-sm hover:shadow-md hover:shadow-amber-200/60',
    'disabled:opacity-40',
  ].join(' '),
  secondary: [
    'bg-white text-slate-700 border border-slate-300',
    'hover:bg-slate-50 hover:text-slate-900 hover:border-slate-400',
    'shadow-sm',
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
    'shadow-sm',
    'disabled:opacity-40',
  ].join(' '),
}

const sizeStyles: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5 rounded-lg',
  md: 'px-4 py-2    text-sm gap-2   rounded-lg',
  lg: 'px-5 py-2.5  text-sm gap-2   rounded-lg',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, leftIcon, rightIcon, children, className = '', disabled, ...props }, ref) => {
    const isDisabled = disabled || loading
    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={`
          inline-flex items-center justify-center font-medium
          transition-all duration-200 cursor-pointer
          focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white
          disabled:cursor-not-allowed select-none
          ${!isDisabled ? 'active:scale-[0.97]' : ''}
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${className}
        `}
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
  },
)

Button.displayName = 'Button'
export default Button
