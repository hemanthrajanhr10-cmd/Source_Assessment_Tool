import { useState } from 'react'
import { Bookmark, Share2, Filter, Maximize2, ChevronRight, Menu } from 'lucide-react'
import type { MockReport, MockVisual } from '../../data/mockReports'
import PageSidebar from './PageSidebar'
import PageTabStrip from './PageTabStrip'
import VisualGrid from './VisualGrid'

interface ReportCanvasViewProps {
  report: MockReport
  onVisualClick: (visual: MockVisual) => void
}

export default function ReportCanvasView({ report, onVisualClick }: ReportCanvasViewProps) {
  const [activePageIndex, setActivePageIndex] = useState(0)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)

  const activePage = report.pages[activePageIndex] ?? report.pages[0]

  return (
    <div
      className="flex flex-col overflow-hidden rounded-xl border"
      style={{
        height: '100%',
        minHeight: 540,
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
        background: '#F3F4F6',
        borderColor: '#E5E7EB',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}
    >
      {/* ── Top toolbar ─────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 flex-shrink-0 border-b"
        style={{ height: 48, background: '#fff', borderColor: '#E5E7EB' }}
      >
        {/* Left: hamburger (mobile) + sidebar toggle (desktop/xl) + report name */}
        <div className="flex items-center gap-2 min-w-0">
          {/* Mobile-only hamburger */}
          <button
            type="button"
            onClick={() => setMobileDrawerOpen(true)}
            className="flex md:hidden items-center justify-center w-8 h-8 rounded hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 flex-shrink-0 transition-colors"
            aria-label="Open page navigation"
          >
            <Menu size={16} style={{ color: '#6B7280' }} />
          </button>

          {/* Desktop-only sidebar toggle */}
          <button
            type="button"
            onClick={() => setSidebarCollapsed(v => !v)}
            className="hidden xl:flex items-center justify-center w-7 h-7 rounded hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 flex-shrink-0 transition-colors"
            aria-label="Toggle page sidebar"
          >
            <ChevronRight
              size={15}
              style={{
                color: '#6B7280',
                transform: sidebarCollapsed ? 'rotate(0deg)' : 'rotate(180deg)',
                transition: 'transform 200ms ease',
              }}
            />
          </button>

          <h2
            className="text-sm font-semibold truncate"
            style={{ color: '#111827' }}
            title={report.name}
          >
            {report.name}
          </h2>
        </div>

        {/* Right: page counter + action icons */}
        <div className="flex items-center gap-0.5">
          <span
            className="text-xs mr-2 hidden sm:block"
            style={{ color: '#9CA3AF' }}
            aria-live="polite"
          >
            Page {activePageIndex + 1} of {report.pages.length}
          </span>
          {([
            { Icon: Bookmark,  label: 'Bookmarks' },
            { Icon: Share2,    label: 'Share' },
            { Icon: Filter,    label: 'Filters' },
            { Icon: Maximize2, label: 'Full screen' },
          ] as const).map(({ Icon, label }) => (
            <button
              key={label}
              type="button"
              title={label}
              aria-label={label}
              className="flex items-center justify-center w-8 h-8 rounded hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors"
            >
              <Icon size={15} style={{ color: '#6B7280' }} />
            </button>
          ))}
        </div>
      </div>

      {/* ── Body: sidebar + canvas ───────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        <PageSidebar
          pages={report.pages}
          activePageIndex={activePageIndex}
          onSelectPage={setActivePageIndex}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(v => !v)}
          mobileOpen={mobileDrawerOpen}
          onMobileClose={() => setMobileDrawerOpen(false)}
        />

        {/* Main canvas column */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Scrollable visual grid */}
          <div className="flex-1 overflow-y-auto">
            {activePage && (
              <VisualGrid
                page={activePage}
                onClickVisual={visualId => {
                  const v = activePage.visuals.find(x => x.id === visualId)
                  if (v) onVisualClick(v)
                }}
              />
            )}
          </div>

          {/* Bottom page tab strip */}
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
