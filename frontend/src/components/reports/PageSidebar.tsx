import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { MockPage } from '../../data/mockReports'

interface PageSidebarProps {
  pages: MockPage[]
  activePageIndex: number
  onSelectPage: (index: number) => void
  collapsed: boolean
  onToggle: () => void
}

export default function PageSidebar({
  pages,
  activePageIndex,
  onSelectPage,
  collapsed,
  onToggle,
}: PageSidebarProps) {
  return (
    <div
      className="flex flex-col flex-shrink-0 overflow-hidden transition-all duration-200 ease-in-out border-r"
      style={{
        width: collapsed ? 0 : 200,
        background: '#FAF9F8',
        borderColor: '#E1DFDD',
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
      }}
      aria-label="Page navigation sidebar"
    >
      {/* Toggle header */}
      <div
        className="flex items-center justify-between px-3 py-2 flex-shrink-0 border-b"
        style={{ borderColor: '#E1DFDD', minHeight: 40 }}
      >
        {!collapsed && (
          <span
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: '#8A8886' }}
          >
            Pages
          </span>
        )}
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center justify-center w-6 h-6 rounded hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 transition-colors ml-auto"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed
            ? <ChevronRight size={14} style={{ color: '#605E5C' }} />
            : <ChevronLeft size={14} style={{ color: '#605E5C' }} />}
        </button>
      </div>

      {/* Page list — only rendered when open */}
      {!collapsed && (
        <nav className="flex-1 overflow-y-auto py-1" role="list">
          {pages.map((page, idx) => {
            const isActive = idx === activePageIndex
            return (
              <button
                key={page.id}
                type="button"
                role="listitem"
                onClick={() => onSelectPage(idx)}
                className="w-full text-left px-3 py-1.5 text-xs transition-colors duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400 flex items-center gap-2"
                style={{
                  color: isActive ? '#0078D4' : '#252423',
                  background: isActive ? '#EFF6FF' : 'transparent',
                  borderLeft: isActive ? '2px solid #0078D4' : '2px solid transparent',
                  fontWeight: isActive ? 600 : 400,
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    (e.currentTarget as HTMLButtonElement).style.background = '#F3F2F1'
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                  }
                }}
                aria-current={isActive ? 'page' : undefined}
              >
                <span
                  className="inline-flex items-center justify-center w-4 h-4 rounded text-xs flex-shrink-0"
                  style={{
                    background: isActive ? '#0078D4' : '#E1DFDD',
                    color: isActive ? '#fff' : '#605E5C',
                    fontSize: '9px',
                    fontWeight: 600,
                  }}
                >
                  {idx + 1}
                </span>
                <span className="truncate">{page.name}</span>
              </button>
            )
          })}
        </nav>
      )}
    </div>
  )
}
