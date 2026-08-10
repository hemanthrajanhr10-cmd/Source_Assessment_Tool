import { useState } from 'react'
import { Bookmark, Share2, Filter, Maximize2, ChevronRight, Menu, FileText } from 'lucide-react'
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
  const totalVisuals = activePage?.visuals?.length ?? 0

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{
        height: '100%',
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
        background: 'oklch(0.985 0.006 185)',
      }}
    >
      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          height: 52,
          background: 'oklch(1.0 0.003 185)',
          borderBottom: '1px solid oklch(0.91 0.012 185)',
          flexShrink: 0,
        }}
      >
        {/* Left cluster */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMobileDrawerOpen(true)}
            className="flex md:hidden"
            style={{
              width: 32, height: 32, borderRadius: 8,
              border: '1px solid oklch(0.91 0.012 185)',
              background: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            aria-label="Open page navigation"
          >
            <Menu size={15} style={{ color: 'oklch(0.50 0.02 185)' }} />
          </button>

          {/* Desktop sidebar toggle */}
          <button
            type="button"
            onClick={() => setSidebarCollapsed(v => !v)}
            className="hidden xl:flex"
            style={{
              width: 30, height: 30, borderRadius: 7,
              border: '1px solid oklch(0.91 0.012 185)',
              background: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 150ms ease, border-color 150ms ease',
            }}
            aria-label="Toggle page sidebar"
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'oklch(0.96 0.012 185)'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'none'
            }}
          >
            <ChevronRight
              size={14}
              style={{
                color: 'oklch(0.50 0.02 185)',
                transform: sidebarCollapsed ? 'rotate(0deg)' : 'rotate(180deg)',
                transition: 'transform 200ms cubic-bezier(0.4,0,0.2,1)',
              }}
            />
          </button>

          {/* Divider */}
          <div style={{ width: 1, height: 20, background: 'oklch(0.91 0.012 185)', flexShrink: 0 }} />

          {/* Report name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 7, flexShrink: 0,
              background: 'oklch(0.94 0.022 185)',
              border: '1px solid oklch(0.87 0.030 185)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <FileText size={13} style={{ color: 'oklch(0.44 0.072 185)' }} />
            </div>
            <h2
              style={{
                margin: 0, fontSize: 13.5, fontWeight: 600,
                color: 'oklch(0.18 0.012 240)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                maxWidth: 280,
              }}
              title={report.name}
            >
              {report.name}
            </h2>
          </div>
        </div>

        {/* Right cluster */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {/* Visual + page count chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 8 }}>
            {totalVisuals > 0 && (
              <span style={{
                fontSize: 11, fontWeight: 600,
                color: 'oklch(0.44 0.072 185)',
                background: 'oklch(0.94 0.022 185)',
                border: '1px solid oklch(0.87 0.030 185)',
                borderRadius: 6, padding: '3px 9px',
              }}>
                {totalVisuals} visual{totalVisuals !== 1 ? 's' : ''}
              </span>
            )}
            <span style={{
              fontSize: 11, fontWeight: 500,
              color: 'oklch(0.56 0.012 240)',
              background: 'oklch(0.96 0.004 240)',
              border: '1px solid oklch(0.91 0.008 240)',
              borderRadius: 6, padding: '3px 9px',
            }}>
              {activePageIndex + 1} / {report.pages.length}
            </span>
          </div>

          {/* Divider */}
          <div style={{ width: 1, height: 20, background: 'oklch(0.91 0.012 185)', marginRight: 4 }} />

          {/* Action buttons */}
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
              style={{
                width: 32, height: 32, borderRadius: 7,
                border: '1px solid transparent',
                background: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 150ms ease, border-color 150ms ease',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLButtonElement
                el.style.background = 'oklch(0.96 0.012 185)'
                el.style.borderColor = 'oklch(0.91 0.012 185)'
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLButtonElement
                el.style.background = 'none'
                el.style.borderColor = 'transparent'
              }}
            >
              <Icon size={14} style={{ color: 'oklch(0.50 0.02 185)' }} />
            </button>
          ))}
        </div>
      </div>

      {/* ── Body: sidebar + canvas ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <PageSidebar
          pages={report.pages}
          activePageIndex={activePageIndex}
          onSelectPage={setActivePageIndex}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(v => !v)}
          mobileOpen={mobileDrawerOpen}
          onMobileClose={() => setMobileDrawerOpen(false)}
        />

        {/* Canvas column */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto' }}>
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
