type Size = 'sm' | 'md' | 'lg' | 'xl'

interface SpinnerProps {
  size?: Size
  className?: string
}

const sizeMap: Record<Size, string> = {
  sm:  'h-4 w-4 border-2',
  md:  'h-5 w-5 border-2',
  lg:  'h-8 w-8 border-[3px]',
  xl:  'h-12 w-12 border-4',
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
