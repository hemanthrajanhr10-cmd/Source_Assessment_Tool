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
    'bg-amber-500 text-zinc-950 font-semibold',
    'hover:bg-amber-400',
    'shadow-[0_1px_2px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.15)]',
    'hover:shadow-[0_4px_16px_rgba(245,158,11,0.3)]',
    'disabled:opacity-40',
  ].join(' '),
  secondary: [
    'bg-zinc-800 text-zinc-200 border border-zinc-700/80',
    'hover:bg-zinc-700 hover:text-zinc-100 hover:border-zinc-600',
    'shadow-[0_1px_2px_rgba(0,0,0,0.3)]',
    'disabled:opacity-40',
  ].join(' '),
  ghost: [
    'text-zinc-400',
    'hover:text-zinc-100 hover:bg-zinc-800/60',
    'disabled:opacity-40',
  ].join(' '),
  danger: [
    'bg-red-500/10 text-red-400 border border-red-500/20',
    'hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/40',
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
          focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950
          disabled:cursor-not-allowed select-none active:scale-[0.97]
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${className}
        `}
        {...props}
      >
        {loading ? (
          <Spinner size={size === 'sm' ? 'sm' : 'md'} className={variant === 'primary' ? 'text-zinc-900' : 'text-zinc-400'} />
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
