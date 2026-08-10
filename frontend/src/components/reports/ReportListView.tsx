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
    <div className="flex flex-col gap-5 p-5">
      {/* Search bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search reports…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border bg-white text-slate-700 placeholder-slate-400 focus:outline-none transition-all"
            style={{
              borderColor: 'rgba(197,213,236,0.8)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
            onFocus={e => {
              e.currentTarget.style.borderColor = '#6CBDB5'
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(108,189,181,0.18), 0 1px 3px rgba(0,0,0,0.04)'
            }}
            onBlur={e => {
              e.currentTarget.style.borderColor = 'rgba(197,213,236,0.8)'
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'
            }}
            aria-label="Search reports"
          />
        </div>
        {query && (
          <p className="text-xs text-slate-400">
            {filtered.length} report{filtered.length !== 1 ? 's' : ''} found
          </p>
        )}
        <div className="ml-auto text-xs font-medium" style={{ color: '#0F766E' }}>
          {reports.length} report{reports.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Card grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((report, idx) => (
            <div
              key={report.id}
              className="animate-fade-in"
              style={{ animationDelay: `${idx * 40}ms`, animationFillMode: 'both' }}
            >
              <ReportCard report={report} onClick={() => onSelectReport(report.id)} />
            </div>
          ))}
        </div>
      ) : (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl"
            style={{ background: 'rgba(108,189,181,0.10)', border: '1px solid rgba(108,189,181,0.22)' }}>
            <FileText size={28} style={{ color: '#6CBDB5' }} />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-700">No reports found</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">
              {query
                ? `No reports match "${query}". Try a different search term.`
                : 'No reports are available in this workspace.'}
            </p>
          </div>
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-xs font-semibold px-4 py-1.5 rounded-full transition-colors"
              style={{ background: 'rgba(108,189,181,0.12)', color: '#0F766E', border: '1px solid rgba(108,189,181,0.30)' }}
            >
              Clear search
            </button>
          )}
        </div>
      )}
    </div>
  )
}
