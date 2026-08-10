import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { MockPage } from '../../data/mockReports'

interface PageTabStripProps {
  pages: MockPage[]
  activePageIndex: number
  onSelectPage: (index: number) => void
}

const FONT = "'Segoe UI', system-ui, -apple-system, sans-serif"

export default function PageTabStrip({ pages, activePageIndex, onSelectPage }: PageTabStripProps) {
  const [isMobile, setIsMobile] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Check scroll state
  const updateScrollState = () => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 2)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2)
  }

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateScrollState()
    el.addEventListener('scroll', updateScrollState)
    const ro = new ResizeObserver(updateScrollState)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', updateScrollState); ro.disconnect() }
  }, [pages])

  // Scroll active tab into view when it changes
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const activeEl = el.children[activePageIndex] as HTMLElement | undefined
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
    }
  }, [activePageIndex])

  const scrollBy = (delta: number) => {
    scrollRef.current?.scrollBy({ left: delta, behavior: 'smooth' })
  }

  // ── Mobile: compact select strip ──────────────────────────────────────────
  if (isMobile) {
    return (
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '0 12px',
          height: 44,
          background: 'oklch(1.0 0.003 185)',
          borderTop: '1px solid oklch(0.91 0.012 185)',
          flexShrink: 0,
          fontFamily: FONT,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: 'oklch(0.56 0.020 185)', flexShrink: 0 }}>
          Page:
        </span>
        <select
          value={activePageIndex}
          onChange={e => onSelectPage(Number(e.target.value))}
          style={{
            flex: 1, fontSize: 12, borderRadius: 7,
            border: '1px solid oklch(0.87 0.020 185)',
            padding: '5px 8px', background: '#fff',
            color: 'oklch(0.18 0.012 240)', fontFamily: FONT,
            outline: 'none',
          }}
          aria-label="Select page"
        >
          {pages.map((page, idx) => (
            <option key={page.id} value={idx}>{idx + 1}. {page.name}</option>
          ))}
        </select>
        <span style={{ fontSize: 11, color: 'oklch(0.60 0.012 240)', flexShrink: 0 }}>
          {activePageIndex + 1} / {pages.length}
        </span>
      </div>
    )
  }

  // ── Desktop: tab strip with scroll arrows ──────────────────────────────────
  return (
    <div
      style={{
        display: 'flex', alignItems: 'stretch',
        height: 38,
        background: 'oklch(1.0 0.003 185)',
        borderTop: '1px solid oklch(0.91 0.012 185)',
        flexShrink: 0,
        fontFamily: FONT,
        position: 'relative',
      }}
      role="tablist"
      aria-label="Report pages"
    >
      {/* Left scroll arrow */}
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scrollBy(-160)}
          style={{
            width: 32, flexShrink: 0,
            border: 'none',
            borderRight: '1px solid oklch(0.91 0.012 185)',
            background: 'oklch(0.975 0.010 185)',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 140ms ease',
          }}
          aria-label="Scroll tabs left"
          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'oklch(0.96 0.020 185)'}
          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'oklch(0.975 0.010 185)'}
        >
          <ChevronLeft size={13} style={{ color: 'oklch(0.50 0.020 185)' }} />
        </button>
      )}

      {/* Scrollable tabs */}
      <div
        ref={scrollRef}
        style={{
          flex: 1, display: 'flex', alignItems: 'stretch',
          overflowX: 'auto', scrollbarWidth: 'none',
        }}
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        css={{ '&::-webkit-scrollbar': { display: 'none' } }}
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
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '0 16px',
                border: 'none',
                borderBottom: isActive
                  ? '2px solid oklch(0.44 0.072 185)'
                  : '2px solid transparent',
                background: isActive ? 'oklch(1.0 0.003 185)' : 'transparent',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                transition: 'border-color 160ms ease, color 160ms ease, background 160ms ease',
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  const el = e.currentTarget as HTMLButtonElement
                  el.style.background = 'oklch(0.975 0.010 185)'
                  el.style.borderBottomColor = 'oklch(0.80 0.040 185)'
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  const el = e.currentTarget as HTMLButtonElement
                  el.style.background = 'transparent'
                  el.style.borderBottomColor = 'transparent'
                }
              }}
            >
              {/* Page number badge */}
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                fontSize: 9, fontWeight: 700,
                background: isActive ? 'oklch(0.44 0.072 185)' : 'oklch(0.91 0.010 185)',
                color: isActive ? '#fff' : 'oklch(0.55 0.015 240)',
                transition: 'background 160ms ease, color 160ms ease',
              }}>
                {idx + 1}
              </span>

              <span style={{
                fontSize: 12, fontWeight: isActive ? 600 : 400,
                color: isActive ? 'oklch(0.28 0.055 185)' : 'oklch(0.45 0.012 240)',
                transition: 'color 160ms ease, font-weight 160ms ease',
              }}>
                {page.name}
              </span>
            </button>
          )
        })}
      </div>

      {/* Right scroll arrow */}
      {canScrollRight && (
        <button
          type="button"
          onClick={() => scrollBy(160)}
          style={{
            width: 32, flexShrink: 0,
            border: 'none',
            borderLeft: '1px solid oklch(0.91 0.012 185)',
            background: 'oklch(0.975 0.010 185)',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 140ms ease',
          }}
          aria-label="Scroll tabs right"
          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'oklch(0.96 0.020 185)'}
          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'oklch(0.975 0.010 185)'}
        >
          <ChevronRight size={13} style={{ color: 'oklch(0.50 0.020 185)' }} />
        </button>
      )}

      {/* Page counter — right-pinned */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '0 12px', flexShrink: 0,
        borderLeft: '1px solid oklch(0.91 0.012 185)',
        fontSize: 11, fontWeight: 500,
        color: 'oklch(0.56 0.012 240)',
      }}>
        {activePageIndex + 1} / {pages.length}
      </div>
    </div>
  )
}
