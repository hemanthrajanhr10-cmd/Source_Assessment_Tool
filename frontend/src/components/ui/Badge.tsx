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
  default: 'bg-zinc-800/80 text-zinc-300 ring-1 ring-zinc-700/50',
  success: 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20',
  warning: 'bg-amber-500/10  text-amber-400  ring-1 ring-amber-500/20',
  error:   'bg-red-500/10    text-red-400    ring-1 ring-red-500/20',
  info:    'bg-blue-500/10   text-blue-400   ring-1 ring-blue-500/20',
  neutral: 'bg-zinc-800/60   text-zinc-400   ring-1 ring-zinc-700/50',
}

const dotStyles: Record<Variant, string> = {
  default: 'bg-zinc-400',
  success: 'bg-emerald-400',
  warning: 'bg-amber-400',
  error:   'bg-red-400',
  info:    'bg-blue-400',
  neutral: 'bg-zinc-500',
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
