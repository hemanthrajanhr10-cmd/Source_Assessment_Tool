import { useState } from 'react'
import { Bookmark, Share2, Filter, Maximize2, ChevronRight } from 'lucide-react'
import type { MockReport, MockVisual, AssessmentStatus } from '../../data/mockReports'
import PageSidebar from './PageSidebar'
import PageTabStrip from './PageTabStrip'
import VisualGrid from './VisualGrid'

interface ReportCanvasViewProps {
  report: MockReport
  visualAssessments: Record<string, AssessmentStatus>
  onUpdateVisualStatus: (visualId: string, status: AssessmentStatus) => void
  onVisualClick: (visual: MockVisual) => void
}

export default function ReportCanvasView({
  report,
  visualAssessments,
  onUpdateVisualStatus,
  onVisualClick,
}: ReportCanvasViewProps) {
  const [activePageIndex, setActivePageIndex] = useState(0)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const activePage = report.pages[activePageIndex] ?? report.pages[0]

  return (
    <div
      className="flex flex-col overflow-hidden rounded-lg border border-slate-200"
      style={{
        height: '100%',
        minHeight: 540,
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
        background: '#F3F2F1',
      }}
    >
      {/* ── Top toolbar ─────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 flex-shrink-0 border-b"
        style={{ height: 48, background: '#fff', borderColor: '#E1DFDD' }}
      >
        {/* Left: sidebar toggle + report name */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setSidebarCollapsed(v => !v)}
            className="flex items-center justify-center w-7 h-7 rounded hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 flex-shrink-0"
            aria-label="Toggle page sidebar"
          >
            <ChevronRight
              size={15}
              style={{
                color: '#605E5C',
                transform: sidebarCollapsed ? 'rotate(0deg)' : 'rotate(180deg)',
                transition: 'transform 200ms ease',
              }}
            />
          </button>
          <h2
            className="text-sm font-semibold truncate"
            style={{ color: '#252423' }}
            title={report.name}
          >
            {report.name}
          </h2>
        </div>

        {/* Right: page counter + action icons */}
        <div className="flex items-center gap-1">
          <span
            className="text-xs mr-3"
            style={{ color: '#8A8886' }}
            aria-live="polite"
          >
            Page {activePageIndex + 1} of {report.pages.length}
          </span>
          {[
            { Icon: Bookmark,  label: 'Bookmarks' },
            { Icon: Share2,    label: 'Share' },
            { Icon: Filter,    label: 'Filters' },
            { Icon: Maximize2, label: 'Full screen' },
          ].map(({ Icon, label }) => (
            <button
              key={label}
              type="button"
              title={label}
              aria-label={label}
              className="flex items-center justify-center w-8 h-8 rounded hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 transition-colors"
            >
              <Icon size={15} style={{ color: '#605E5C' }} />
            </button>
          ))}
        </div>
      </div>

      {/* ── Body: sidebar + canvas ───────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Page sidebar */}
        <PageSidebar
          pages={report.pages}
          activePageIndex={activePageIndex}
          onSelectPage={setActivePageIndex}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(v => !v)}
        />

        {/* Main canvas column */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Visual grid */}
          <div className="flex-1 overflow-y-auto" style={{ background: '#F3F2F1' }}>
            {activePage && (
              <VisualGrid
                page={activePage}
                visualAssessments={visualAssessments}
                onUpdateVisualStatus={onUpdateVisualStatus}
                onClickVisual={visualId => {
                  const v = activePage.visuals.find(x => x.id === visualId)
                  if (v) onVisualClick(v)
                }}
              />
            )}
          </div>

          {/* Page tab strip at bottom */}
          <PageTabStrip
            pages={report.pages}
            activePageIndex={activePageIndex}
            onSelectPage={setActivePageIndex}
          />
        </div>
      </div>
    </div>
  )
}
