import type { JobStatus } from '../../types/api'
import { CheckCircle2, XCircle, Loader2, Clock, StopCircle } from 'lucide-react'

type Variant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'neutral'

interface BadgeProps {
  children: React.ReactNode
  variant?: Variant
  dot?: boolean
  className?: string
}

const variantStyles: Record<Variant, string> = {
  default: 'bg-slate-100     text-slate-600   ring-1 ring-slate-200',
  success: 'bg-emerald-50    text-emerald-700  ring-1 ring-emerald-200',
  warning: 'bg-amber-50      text-amber-700    ring-1 ring-amber-200',
  error:   'bg-red-50        text-red-700      ring-1 ring-red-200',
  info:    'bg-blue-50       text-blue-700     ring-1 ring-blue-200',
  neutral: 'bg-slate-100     text-slate-500    ring-1 ring-slate-200',
}

const dotStyles: Record<Variant, string> = {
  default: 'bg-slate-400',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error:   'bg-red-500',
  info:    'bg-blue-500',
  neutral: 'bg-slate-400',
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
  const map: Record<JobStatus, { label: string; variant: Variant; icon: React.ReactNode }> = {
    pending:   { label: 'Pending',   variant: 'neutral',  icon: <Clock className="h-3 w-3" /> },
    running:   { label: 'Running',   variant: 'info',     icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    completed: { label: 'Completed', variant: 'success',  icon: <CheckCircle2 className="h-3 w-3" /> },
    failed:    { label: 'Failed',    variant: 'error',    icon: <XCircle className="h-3 w-3" /> },
    cancelled: { label: 'Cancelled', variant: 'neutral',  icon: <StopCircle className="h-3 w-3" /> },
  }
  const { label, variant, icon } = map[status] ?? map.pending
  return (
    <Badge variant={variant}>
      {icon}
      {label}
    </Badge>
  )
}
