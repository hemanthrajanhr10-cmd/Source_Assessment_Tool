import { useEffect, useState } from 'react'
import type { MockPage } from '../../data/mockReports'

interface PageTabStripProps {
  pages: MockPage[]
  activePageIndex: number
  onSelectPage: (index: number) => void
}

const FONT = "'Segoe UI', system-ui, -apple-system, sans-serif"

export default function PageTabStrip({ pages, activePageIndex, onSelectPage }: PageTabStripProps) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Mobile: dropdown selector
  if (isMobile) {
    return (
      <div
        className="flex items-center gap-3 px-3 border-t flex-shrink-0"
        style={{ height: 44, background: '#fff', borderColor: '#E5E7EB', fontFamily: FONT }}
      >
        <span className="text-xs font-medium flex-shrink-0" style={{ color: '#6B7280' }}>Page:</span>
        <select
          value={activePageIndex}
          onChange={e => onSelectPage(Number(e.target.value))}
          className="flex-1 text-xs rounded-md border px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          style={{ borderColor: '#E5E7EB', color: '#111827', fontFamily: FONT }}
          aria-label="Select page"
        >
          {pages.map((page, idx) => (
            <option key={page.id} value={idx}>{idx + 1}. {page.name}</option>
          ))}
        </select>
        <span className="text-xs flex-shrink-0" style={{ color: '#9CA3AF' }}>
          {activePageIndex + 1} / {pages.length}
        </span>
      </div>
    )
  }

  // Desktop / tablet: scrollable tab strip
  return (
    <div
      className="flex items-stretch border-t overflow-hidden flex-shrink-0"
      style={{
        background: '#fff',
        borderColor: '#E5E7EB',
        height: 36,
        fontFamily: FONT,
      }}
      role="tablist"
      aria-label="Report pages"
    >
      {/* Scrollable tab area */}
      <div
        className="flex-1 flex items-stretch overflow-x-auto"
        style={{ scrollbarWidth: 'none' }}
      >
        {pages.map((page, idx) => {
          const isActive = idx === activePageIndex
          return (
            <button
              key={page.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelectPage(idx)}
              className="flex items-center px-4 text-xs whitespace-nowrap transition-colors duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 flex-shrink-0"
              style={{
                background: isActive ? '#fff' : 'transparent',
                color: isActive ? '#0056B3' : '#6B7280',
                fontWeight: isActive ? 600 : 400,
                borderBottom: isActive ? '2px solid #0056B3' : '2px solid transparent',
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
              }}
              onMouseEnter={e => {
                if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = '#111827'
              }}
              onMouseLeave={e => {
                if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = '#6B7280'
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
        style={{ color: '#9CA3AF', borderColor: '#E5E7EB' }}
        aria-live="polite"
      >
        {activePageIndex + 1} / {pages.length}
      </div>
    </div>
  )
}
