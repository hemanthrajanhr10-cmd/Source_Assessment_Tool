import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, X, LayoutList } from 'lucide-react'
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

function PageList({
  pages,
  activePageIndex,
  onSelectPage,
  onItemClick,
}: {
  pages: MockPage[]
  activePageIndex: number
  onSelectPage: (i: number) => void
  onItemClick?: () => void
}) {
  return (
    <nav
      style={{ flex: 1, overflowY: 'auto', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}
      role="list"
      aria-label="Report pages"
    >
      {pages.map((page, idx) => {
        const isActive = idx === activePageIndex
        return (
          <button
            key={page.id}
            type="button"
            role="listitem"
            onClick={() => { onSelectPage(idx); onItemClick?.() }}
            aria-current={isActive ? 'page' : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', textAlign: 'left',
              padding: '9px 10px',
              borderRadius: 8,
              border: 'none',
              background: isActive
                ? 'oklch(0.93 0.035 185)'
                : 'transparent',
              cursor: 'pointer',
              transition: 'background 140ms ease',
              fontFamily: FONT,
            }}
            onMouseEnter={e => {
              if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'oklch(0.96 0.015 185)'
            }}
            onMouseLeave={e => {
              if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
            }}
          >
            {/* Page number badge */}
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 22, height: 22, borderRadius: 6, flexShrink: 0,
              fontSize: 10, fontWeight: 700, lineHeight: 1,
              background: isActive ? 'oklch(0.44 0.072 185)' : 'oklch(0.91 0.010 185)',
              color: isActive ? '#fff' : 'oklch(0.50 0.020 185)',
              transition: 'background 140ms ease, color 140ms ease',
            }}>
              {idx + 1}
            </span>

            {/* Page name */}
            <span style={{
              fontSize: 12.5, fontWeight: isActive ? 600 : 400,
              color: isActive ? 'oklch(0.24 0.045 185)' : 'oklch(0.38 0.012 240)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              flex: 1,
              transition: 'color 140ms ease, font-weight 140ms ease',
            }}>
              {page.name}
            </span>

            {/* Active indicator dot */}
            {isActive && (
              <span style={{
                width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                background: 'oklch(0.44 0.072 185)',
              }} />
            )}
          </button>
        )
      })}
    </nav>
  )
}

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

  // ── Mobile: sliding overlay drawer ─────────────────────────────────────────
  if (bp === 'mobile') {
    return (
      <>
        {mobileOpen && (
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 40,
              background: 'rgba(15,25,40,0.35)',
              backdropFilter: 'blur(2px)',
            }}
            onClick={onMobileClose}
            aria-hidden
          />
        )}
        <div
          style={{
            position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 50,
            width: 264, height: '100%',
            display: 'flex', flexDirection: 'column',
            background: 'oklch(0.99 0.006 185)',
            borderRight: '1px solid oklch(0.91 0.012 185)',
            boxShadow: '4px 0 24px rgba(0,0,0,0.12)',
            transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 260ms cubic-bezier(0.4,0,0.2,1)',
            fontFamily: FONT,
          }}
          role="navigation"
          aria-label="Page navigation"
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 14px 12px',
            borderBottom: '1px solid oklch(0.93 0.010 185)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <LayoutList size={14} style={{ color: 'oklch(0.44 0.072 185)' }} />
              <span style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
                textTransform: 'uppercase', color: 'oklch(0.50 0.020 185)',
              }}>
                Pages
              </span>
              <span style={{
                fontSize: 10, fontWeight: 700,
                color: 'oklch(0.44 0.072 185)',
                background: 'oklch(0.93 0.035 185)',
                border: '1px solid oklch(0.87 0.030 185)',
                borderRadius: 10, padding: '1px 7px',
              }}>
                {pages.length}
              </span>
            </div>
            <button
              type="button"
              onClick={onMobileClose}
              style={{
                width: 28, height: 28, borderRadius: 7,
                border: '1px solid oklch(0.91 0.012 185)',
                background: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              aria-label="Close navigation"
            >
              <X size={14} style={{ color: 'oklch(0.50 0.020 185)' }} />
            </button>
          </div>

          <PageList
            pages={pages}
            activePageIndex={activePageIndex}
            onSelectPage={onSelectPage}
            onItemClick={onMobileClose}
          />
        </div>
      </>
    )
  }

  // ── Tablet: compact strip with numbers only ────────────────────────────────
  if (bp === 'tablet') {
    return (
      <div
        style={{
          width: 48, flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          background: 'oklch(0.975 0.010 185)',
          borderRight: '1px solid oklch(0.91 0.012 185)',
          overflowY: 'auto',
          fontFamily: FONT,
        }}
        aria-label="Page navigation (compact)"
      >
        {/* Header icon */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: 44, borderBottom: '1px solid oklch(0.91 0.012 185)',
          flexShrink: 0,
        }}>
          <LayoutList size={14} style={{ color: 'oklch(0.56 0.025 185)' }} />
        </div>

        {/* Page number buttons */}
        <div style={{ padding: '6px 6px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {pages.map((page, idx) => {
            const isActive = idx === activePageIndex
            return (
              <button
                key={page.id}
                type="button"
                title={`${idx + 1}. ${page.name}`}
                onClick={() => onSelectPage(idx)}
                aria-current={isActive ? 'page' : undefined}
                aria-label={`Page ${idx + 1}: ${page.name}`}
                style={{
                  width: 36, height: 36, borderRadius: 8,
                  border: isActive ? '1.5px solid oklch(0.75 0.055 185)' : '1.5px solid transparent',
                  background: isActive ? 'oklch(0.93 0.035 185)' : 'transparent',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 140ms ease, border-color 140ms ease',
                }}
                onMouseEnter={e => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'oklch(0.96 0.015 185)'
                }}
                onMouseLeave={e => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                }}
              >
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  color: isActive ? 'oklch(0.30 0.060 185)' : 'oklch(0.50 0.015 240)',
                }}>
                  {idx + 1}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Desktop: full sidebar, collapsible ────────────────────────────────────
  return (
    <div
      style={{
        width: collapsed ? 0 : 220,
        flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        background: 'oklch(0.975 0.010 185)',
        borderRight: collapsed ? 'none' : '1px solid oklch(0.91 0.012 185)',
        overflow: 'hidden',
        transition: 'width 220ms cubic-bezier(0.4,0,0.2,1)',
        fontFamily: FONT,
      }}
      aria-label="Page navigation sidebar"
      aria-hidden={collapsed}
    >
      {/* Sidebar header */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '0 12px',
        height: 44, flexShrink: 0,
        borderBottom: '1px solid oklch(0.91 0.012 185)',
        gap: 8,
      }}>
        <LayoutList size={13} style={{ color: 'oklch(0.44 0.072 185)', flexShrink: 0 }} />
        <span style={{
          fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em',
          textTransform: 'uppercase', color: 'oklch(0.50 0.020 185)',
          flex: 1, whiteSpace: 'nowrap',
        }}>
          Pages
        </span>
        <span style={{
          fontSize: 10, fontWeight: 700,
          color: 'oklch(0.44 0.072 185)',
          background: 'oklch(0.93 0.035 185)',
          border: '1px solid oklch(0.87 0.030 185)',
          borderRadius: 10, padding: '1px 7px',
          flexShrink: 0,
        }}>
          {pages.length}
        </span>
        <button
          type="button"
          onClick={onToggle}
          style={{
            width: 24, height: 24, borderRadius: 6,
            border: '1px solid oklch(0.91 0.012 185)',
            background: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            transition: 'background 140ms ease',
          }}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'oklch(0.93 0.020 185)'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'none'
          }}
        >
          {collapsed
            ? <ChevronRight size={12} style={{ color: 'oklch(0.50 0.020 185)' }} />
            : <ChevronLeft  size={12} style={{ color: 'oklch(0.50 0.020 185)' }} />}
        </button>
      </div>

      <PageList
        pages={pages}
        activePageIndex={activePageIndex}
        onSelectPage={onSelectPage}
      />
    </div>
  )
}
