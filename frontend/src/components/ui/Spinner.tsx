type Size = 'sm' | 'md' | 'lg' | 'xl'

interface SpinnerProps {
  size?: Size
  className?: string
}

const sizeMap: Record<Size, string> = {
  sm: 'h-3.5 w-3.5 border-[1.5px]',
  md: 'h-5 w-5 border-2',
  lg: 'h-7 w-7 border-2',
  xl: 'h-10 w-10 border-[3px]',
}

export default function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`
        inline-block rounded-full border-current border-t-transparent animate-spin
        ${sizeMap[size]} ${className}
      `}
    />
  )
}
