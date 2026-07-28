import {
  CheckCircle2, XCircle, Loader2, Clock, AlertTriangle, Info, StopCircle,
} from 'lucide-react'
import { theme, toneColors, type Tone } from '../theme'

// One consolidated status/risk/cloud tag, replacing the four near-identical
// badge implementations previously duplicated across the Databricks pages.
export function StatusTag({ tone, icon: Icon, label, spin = false }: {
  tone: Tone; icon?: React.ElementType; label: string; spin?: boolean
}) {
  const c = toneColors(tone)
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 8px', borderRadius: theme.radius.sm,
      fontSize: 11, fontWeight: 600, lineHeight: 1,
      color: c.fg, background: c.bg,
      fontFamily: theme.font.body,
    }}>
      {Icon && <Icon style={{ width: 11, height: 11, animation: spin ? 'db-spin 1s linear infinite' : undefined }} />}
      {label}
    </span>
  )
}

const SESSION_STATUS: Record<string, { tone: Tone; icon: React.ElementType; label: string; spin?: boolean }> = {
  completed: { tone: 'success', icon: CheckCircle2, label: 'Completed' },
  failed:    { tone: 'danger',  icon: XCircle,       label: 'Failed' },
  running:   { tone: 'accent',  icon: Loader2,       label: 'Running', spin: true },
  pending:   { tone: 'neutral', icon: Clock,         label: 'Pending' },
  cancelled: { tone: 'neutral', icon: StopCircle,    label: 'Cancelled' },
}

export function SessionStatusTag({ status }: { status: string }) {
  const cfg = SESSION_STATUS[status] ?? SESSION_STATUS.pending
  return <StatusTag tone={cfg.tone} icon={cfg.icon} label={cfg.label} spin={cfg.spin} />
}

const CHECK_STATUS: Record<string, { tone: Tone; icon: React.ElementType; label: string }> = {
  pass: { tone: 'success', icon: CheckCircle2,  label: 'Pass' },
  warn: { tone: 'warning', icon: AlertTriangle, label: 'Warn' },
  fail: { tone: 'danger',  icon: XCircle,       label: 'Fail' },
  info: { tone: 'info',    icon: Info,          label: 'Info' },
  'n/a':{ tone: 'neutral', icon: Info,          label: 'N/A' },
}

export function CheckStatusTag({ status }: { status: string }) {
  const cfg = CHECK_STATUS[status.toLowerCase()] ?? CHECK_STATUS['n/a']
  return <StatusTag tone={cfg.tone} icon={cfg.icon} label={cfg.label} />
}

const RISK: Record<string, { tone: Tone; label: string }> = {
  critical: { tone: 'danger',  label: 'Critical' },
  high:     { tone: 'warning', label: 'High' },
  medium:   { tone: 'info',    label: 'Medium' },
  low:      { tone: 'success', label: 'Low' },
  none:     { tone: 'neutral', label: 'None' },
}

export function RiskTag({ risk }: { risk: string }) {
  const cfg = RISK[risk.toLowerCase()] ?? RISK.none
  return <StatusTag tone={cfg.tone} label={cfg.label} />
}

const CLOUD: Record<string, { fg: string; bg: string }> = {
  azure: { fg: '#2E67C7', bg: 'rgba(46,103,199,0.08)' },
  aws:   { fg: '#C2620E', bg: 'rgba(194,98,14,0.08)' },
  gcp:   { fg: '#0F9D63', bg: 'rgba(15,157,99,0.08)' },
}

export function CloudTag({ cloud }: { cloud?: string }) {
  if (!cloud) return null
  const c = CLOUD[cloud.toLowerCase()] ?? { fg: theme.color.inkMuted, bg: theme.color.neutralBg }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 6px', borderRadius: 5, fontSize: 10, fontWeight: 700,
      letterSpacing: '0.06em', textTransform: 'uppercase',
      color: c.fg, background: c.bg,
    }}>
      {cloud.toUpperCase()}
    </span>
  )
}
