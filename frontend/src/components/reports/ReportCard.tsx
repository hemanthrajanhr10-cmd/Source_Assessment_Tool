import { BarChart2, Clock, BookOpen } from 'lucide-react'
import type { MockReport, AssessmentStatus } from '../../data/mockReports'

interface ReportCardProps {
  report: MockReport
  onClick: () => void
}

const STATUS_CONFIG: Record<AssessmentStatus, { color: string; bg: string; border: string; label: string }> = {
  pass:          { color: '#0F766E', bg: 'rgba(13,148,136,0.08)',  border: 'rgba(13,148,136,0.25)', label: 'Pass' },
  fail:          { color: '#DC2626', bg: 'rgba(220,38,38,0.08)',   border: 'rgba(220,38,38,0.25)',  label: 'Fail' },
  warning:       { color: '#D97706', bg: 'rgba(217,119,6,0.08)',   border: 'rgba(217,119,6,0.25)',  label: 'Warning' },
  'in-progress': { color: '#0891B2', bg: 'rgba(8,145,178,0.08)',   border: 'rgba(8,145,178,0.25)',  label: 'In Progress' },
  'not-assessed':{ color: '#64748B', bg: 'rgba(100,116,139,0.08)', border: 'rgba(100,116,139,0.20)',label: 'Not Assessed' },
}

function formatRefreshed(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHrs = Math.floor(diffMins / 60)
  if (diffHrs < 24) return `${diffHrs}h ago`
  const diffDays = Math.floor(diffHrs / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ReportCard({ report, onClick }: ReportCardProps) {
  const statusCfg = STATUS_CONFIG[report.assessmentStatus]

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className="relative rounded-2xl cursor-pointer transition-all duration-200 overflow-hidden focus:outline-none focus-visible:ring-2"
      style={{
        background: '#ffffff',
        border: '1px solid rgba(197,213,236,0.8)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        '--tw-ring-color': 'rgba(108,189,181,0.40)',
      } as React.CSSProperties}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.transform = 'translateY(-3px)'
        el.style.boxShadow = '0 12px 32px rgba(108,189,181,0.20), 0 2px 8px rgba(0,0,0,0.06)'
        el.style.borderColor = 'rgba(108,189,181,0.45)'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.transform = ''
        el.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'
        el.style.borderColor = 'rgba(197,213,236,0.8)'
      }}
      aria-label={`Open report: ${report.name}`}
    >
      {/* Teal top accent */}
      <div className="h-0.5 w-full" style={{ background: 'linear-gradient(90deg, #6CBDB5, #93CCC6, #7DD3CD)' }} />

      <div className="p-4">
        {/* Icon row */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl"
            style={{
              background: 'linear-gradient(135deg, rgba(108,189,181,0.14) 0%, rgba(147,204,198,0.08) 100%)',
              border: '1px solid rgba(108,189,181,0.22)',
            }}>
            <BarChart2 size={20} style={{ color: '#6CBDB5' }} />
          </div>
          {/* Status badge */}
          <span className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full border"
            style={{ color: statusCfg.color, background: statusCfg.bg, borderColor: statusCfg.border }}>
            <span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: statusCfg.color }} />
            {statusCfg.label}
          </span>
        </div>

        {/* Report name */}
        <h3 className="text-sm font-bold text-slate-900 truncate mb-0.5" title={report.name}>
          {report.name}
        </h3>

        {/* Workspace name */}
        <p className="text-xs text-slate-400 truncate mb-3">{report.workspaceName}</p>

        {/* Footer meta */}
        <div className="flex items-center gap-2.5">
          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ background: 'rgba(108,189,181,0.10)', color: '#0F766E' }}>
            <BookOpen size={10} />
            {report.pageCount} page{report.pageCount !== 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <Clock size={10} />
            {formatRefreshed(report.lastRefreshed)}
          </span>
          <span className="ml-auto text-[10px] font-semibold" style={{ color: '#0F766E' }}>
            View →
          </span>
        </div>
      </div>
    </div>
  )
}
