import { BarChart2, Clock, BookOpen } from 'lucide-react'
import type { MockReport, AssessmentStatus } from '../../data/mockReports'

interface ReportCardProps {
  report: MockReport
  onClick: () => void
}

const STATUS_CONFIG: Record<AssessmentStatus, { color: string; label: string }> = {
  pass: { color: '#107C10', label: 'Pass' },
  fail: { color: '#D13438', label: 'Fail' },
  warning: { color: '#FF8C00', label: 'Warning' },
  'in-progress': { color: '#0D7F97', label: 'In Progress' },
  'not-assessed': { color: '#8A8886', label: 'Not Assessed' },
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
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick()
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className="bg-white border border-slate-200 rounded-lg p-4 cursor-pointer transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 hover:-translate-y-0.5 hover:shadow-lg hover:border-slate-300 active:translate-y-0"
      style={{ fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif" }}
      aria-label={`Open report: ${report.name}`}
    >
      {/* Icon row */}
      <div className="flex items-start justify-between mb-3">
        <div
          className="flex items-center justify-center w-10 h-10 rounded"
          style={{ background: '#EDF8FA' }}
        >
          <BarChart2 size={22} style={{ color: '#0D7F97' }} />
        </div>
        {/* Assessment status badge */}
        <span
          className="flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border"
          style={{
            color: statusCfg.color,
            borderColor: statusCfg.color + '44',
            background: statusCfg.color + '14',
          }}
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: statusCfg.color }}
          />
          {statusCfg.label}
        </span>
      </div>

      {/* Report name */}
      <h3
        className="text-sm font-semibold truncate mb-1"
        style={{ color: '#252423' }}
        title={report.name}
      >
        {report.name}
      </h3>

      {/* Workspace name */}
      <p className="text-xs truncate mb-3" style={{ color: '#605E5C' }}>
        {report.workspaceName}
      </p>

      {/* Footer meta */}
      <div className="flex items-center gap-3">
        <span
          className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
          style={{ background: '#F3F2F1', color: '#605E5C' }}
        >
          <BookOpen size={11} />
          {report.pageCount} page{report.pageCount !== 1 ? 's' : ''}
        </span>
        <span
          className="flex items-center gap-1 text-xs"
          style={{ color: '#8A8886' }}
        >
          <Clock size={11} />
          {formatRefreshed(report.lastRefreshed)}
        </span>
      </div>
    </div>
  )
}
