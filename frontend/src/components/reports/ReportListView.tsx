import { useState } from 'react'
import { Search, FileText } from 'lucide-react'
import type { MockReport } from '../../data/mockReports'
import ReportCard from './ReportCard'

interface ReportListViewProps {
  reports: MockReport[]
  onSelectReport: (reportId: string) => void
}

export default function ReportListView({ reports, onSelectReport }: ReportListViewProps) {
  const [query, setQuery] = useState('')

  const filtered = query.trim()
    ? reports.filter(r => r.name.toLowerCase().includes(query.toLowerCase()))
    : reports

  return (
    <div
      className="flex flex-col gap-4 p-4"
      style={{ fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif" }}
    >
      {/* Search bar */}
      <div className="relative max-w-sm">
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: '#605E5C' }}
        />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search reports…"
          className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 bg-white"
          style={{ color: '#252423' }}
          aria-label="Search reports"
        />
      </div>

      {/* Report count */}
      {query && (
        <p className="text-xs" style={{ color: '#605E5C' }}>
          {filtered.length} report{filtered.length !== 1 ? 's' : ''} found
        </p>
      )}

      {/* Card grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((report, idx) => (
            <div
              key={report.id}
              className="animate-fade-in"
              style={{
                animationDelay: `${idx * 40}ms`,
                animationFillMode: 'both',
              }}
            >
              <ReportCard
                report={report}
                onClick={() => onSelectReport(report.id)}
              />
            </div>
          ))}
        </div>
      ) : (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div
            className="flex items-center justify-center w-16 h-16 rounded-full"
            style={{ background: '#F3F2F1' }}
          >
            <FileText size={32} style={{ color: '#8A8886' }} />
          </div>
          <p className="text-sm font-semibold" style={{ color: '#252423' }}>
            No reports found
          </p>
          <p className="text-xs text-center max-w-xs" style={{ color: '#605E5C' }}>
            {query ? `No reports match "${query}". Try a different search term.` : 'No reports are available in this workspace.'}
          </p>
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-xs font-medium hover:underline focus:outline-none"
              style={{ color: '#B83510' }}
            >
              Clear search
            </button>
          )}
        </div>
      )}
    </div>
  )
}
