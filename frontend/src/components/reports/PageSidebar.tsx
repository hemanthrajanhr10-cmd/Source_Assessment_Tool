import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { MockPage } from '../../data/mockReports'

type Breakpoint = 'mobile' | 'tablet' | 'desktop'

interface PageSidebarProps {
  pages: MockPage[]
  activePageIndex: number
  onSelectPage: (index: number) => void
  collapsed: boolean
  onToggle: () => void
  mobileOpen?: boolean
  onMobileClose?: () => void
}

function getBreakpoint(w: number): Breakpoint {
  if (w < 768) return 'mobile'
  if (w < 1280) return 'tablet'
  return 'desktop'
}

const FONT = "'Segoe UI', system-ui, -apple-system, sans-serif"

export default function PageSidebar({
  pages, activePageIndex, onSelectPage, collapsed, onToggle,
  mobileOpen = false, onMobileClose,
}: PageSidebarProps) {
  const [bp, setBp] = useState<Breakpoint>(() => getBreakpoint(window.innerWidth))

  useEffect(() => {
    const handler = () => setBp(getBreakpoint(window.innerWidth))
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  function PageList({ onItemClick }: { onItemClick?: () => void }) {
    return (
      <nav className="flex-1 overflow-y-auto py-1" role="list" aria-label="Report pages">
        {pages.map((page, idx) => {
          const isActive = idx === activePageIndex
          return (
            <button
              key={page.id}
              type="button"
              role="listitem"
              onClick={() => { onSelectPage(idx); onItemClick?.() }}
              className="w-full text-left px-3 py-2 text-xs transition-colors duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 flex items-center gap-2.5"
              style={{
                color: isActive ? '#1D4ED8' : '#374151',
                background: isActive ? '#F0F7F2' : 'transparent',
                borderLeft: isActive ? '2px solid #2563EB' : '2px solid transparent',
                fontWeight: isActive ? 600 : 400,
                fontFamily: FONT,
              }}
              onMouseEnter={e => {
                if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = '#F9FAFB'
              }}
              onMouseLeave={e => {
                if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
              }}
              aria-current={isActive ? 'page' : undefined}
            >
              <span
                className="inline-flex items-center justify-center rounded-full flex-shrink-0"
                style={{
                  width: 18, height: 18,
                  background: isActive ? '#2563EB' : '#E5E7EB',
                  color: isActive ? '#fff' : '#6B7280',
                  fontSize: 9, fontWeight: 700,
                }}
              >
                {idx + 1}
              </span>
              <span className="truncate">{page.name}</span>
            </button>
          )
        })}
      </nav>
    )
  }

  // ── Mobile: sliding overlay drawer ─────────────────────────────────────────
  if (bp === 'mobile') {
    return (
      <>
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.4)' }}
            onClick={onMobileClose}
            aria-hidden
          />
        )}
        <div
          className="fixed inset-y-0 left-0 z-50 flex flex-col border-r"
          style={{
            width: 256,
            background: '#fff',
            borderColor: '#E5E7EB',
            transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 280ms cubic-bezier(0.4,0,0.2,1)',
            fontFamily: FONT,
          }}
          role="navigation"
          aria-label="Page navigation"
        >
          <div
            className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
            style={{ borderColor: '#E5E7EB' }}
          >
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#6B7280' }}>
              Pages
            </span>
            <button
              type="button"
              onClick={onMobileClose}
              className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label="Close navigation"
            >
              <X size={15} style={{ color: '#6B7280' }} />
            </button>
          </div>
          <PageList onItemClick={onMobileClose} />
        </div>
      </>
    )
  }

  // ── Tablet: icon-only strip (40px) ─────────────────────────────────────────
  if (bp === 'tablet') {
    return (
      <div
        className="flex flex-col flex-shrink-0 border-r overflow-y-auto"
        style={{ width: 40, background: '#FAF9F8', borderColor: '#E5E7EB', fontFamily: FONT }}
        aria-label="Page navigation (compact)"
      >
        <div
          className="flex items-center justify-center py-2.5 border-b flex-shrink-0"
          style={{ borderColor: '#E5E7EB' }}
        >
          <ChevronRight size={13} style={{ color: '#9CA3AF' }} />
        </div>
        {pages.map((page, idx) => {
          const isActive = idx === activePageIndex
          return (
            <button
              key={page.id}
              type="button"
              title={`${idx + 1}. ${page.name}`}
              onClick={() => onSelectPage(idx)}
              className="flex items-center justify-center w-full py-2.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
              style={{
                background: isActive ? '#F0F7F2' : 'transparent',
                borderLeft: isActive ? '2px solid #2563EB' : '2px solid transparent',
              }}
              aria-current={isActive ? 'page' : undefined}
              aria-label={`Page ${idx + 1}: ${page.name}`}
            >
              <span
                className="inline-flex items-center justify-center rounded-full"
                style={{
                  width: 20, height: 20,
                  background: isActive ? '#2563EB' : '#E5E7EB',
                  color: isActive ? '#fff' : '#6B7280',
                  fontSize: 9, fontWeight: 700,
                }}
              >
                {idx + 1}
              </span>
            </button>
          )
        })}
      </div>
    )
  }

  // ── Desktop: full sidebar, user-collapsible ────────────────────────────────
  return (
    <div
      className="flex flex-col flex-shrink-0 overflow-hidden transition-all duration-200 ease-in-out border-r"
      style={{
        width: collapsed ? 0 : 240,
        background: '#FAF9F8',
        borderColor: '#E5E7EB',
        fontFamily: FONT,
      }}
      aria-label="Page navigation sidebar"
      aria-hidden={collapsed}
    >
      <div
        className="flex items-center justify-between px-3 py-2.5 flex-shrink-0 border-b"
        style={{ borderColor: '#E5E7EB', minHeight: 42 }}
      >
        {!collapsed && (
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#6B7280' }}>
            Pages
          </span>
        )}
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center justify-center w-6 h-6 rounded hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors ml-auto"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed
            ? <ChevronRight size={13} style={{ color: '#6B7280' }} />
            : <ChevronLeft size={13} style={{ color: '#6B7280' }} />}
        </button>
      </div>
      {!collapsed && <PageList />}
    </div>
  )
}
