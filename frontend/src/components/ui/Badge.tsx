import type { JobStatus } from '../../types/api'

type Variant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'neutral'

interface BadgeProps {
  children: React.ReactNode
  variant?: Variant
  dot?: boolean
  className?: string
}

const variantStyles: Record<Variant, string> = {
  default:  'bg-slate-100 text-slate-700',
  success:  'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  warning:  'bg-amber-50  text-amber-700  ring-1 ring-amber-200',
  error:    'bg-red-50    text-red-700    ring-1 ring-red-200',
  info:     'bg-blue-50   text-blue-700   ring-1 ring-blue-200',
  neutral:  'bg-slate-100 text-slate-600  ring-1 ring-slate-200',
}

const dotStyles: Record<Variant, string> = {
  default:  'bg-slate-400',
  success:  'bg-emerald-500',
  warning:  'bg-amber-500',
  error:    'bg-red-500',
  info:     'bg-blue-500',
  neutral:  'bg-slate-400',
}

export function Badge({ children, variant = 'default', dot = false, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${variantStyles[variant]} ${className}`}
    >
      {dot && (
        <span className={`h-1.5 w-1.5 rounded-full ${dotStyles[variant]}`} aria-hidden="true" />
      )}
      {children}
    </span>
  )
}

export function StatusBadge({ status }: { status: JobStatus }) {
  const map: Record<JobStatus, { label: string; variant: Variant }> = {
    pending:   { label: 'Pending',   variant: 'neutral'  },
    running:   { label: 'Running',   variant: 'info'     },
    completed: { label: 'Completed', variant: 'success'  },
    failed:    { label: 'Failed',    variant: 'error'    },
  }
  const { label, variant } = map[status]
  return <Badge variant={variant} dot>{label}</Badge>
}
