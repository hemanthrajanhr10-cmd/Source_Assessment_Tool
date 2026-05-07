import type { MockPage } from '../../data/mockReports'

interface PageTabStripProps {
  pages: MockPage[]
  activePageIndex: number
  onSelectPage: (index: number) => void
}

export default function PageTabStrip({ pages, activePageIndex, onSelectPage }: PageTabStripProps) {
  return (
    <div
      className="flex items-stretch border-t overflow-hidden flex-shrink-0"
      style={{
        background: '#F3F2F1',
        borderColor: '#E1DFDD',
        height: 36,
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
      }}
      role="tablist"
      aria-label="Report pages"
    >
      {/* Scrollable tab area */}
      <div className="flex-1 flex items-stretch overflow-x-auto scrollbar-none">
        {pages.map((page, idx) => {
          const isActive = idx === activePageIndex
          return (
            <button
              key={page.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelectPage(idx)}
              className="flex items-center px-4 text-xs whitespace-nowrap transition-colors duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400 flex-shrink-0"
              style={{
                background: isActive ? '#ffffff' : 'transparent',
                color: isActive ? '#252423' : '#605E5C',
                fontWeight: isActive ? 600 : 400,
                borderBottom: isActive ? '2px solid #0078D4' : '2px solid transparent',
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLButtonElement).style.background = '#E8E6E4'
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                }
              }}
            >
              {page.name}
            </button>
          )
        })}
      </div>

      {/* Page counter */}
      <div
        className="flex items-center px-3 text-xs flex-shrink-0 border-l"
        style={{ color: '#8A8886', borderColor: '#E1DFDD' }}
        aria-live="polite"
      >
        Page {activePageIndex + 1} of {pages.length}
      </div>
    </div>
  )
}
